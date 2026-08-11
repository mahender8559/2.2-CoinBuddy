import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from '../db/sqliteSchema';
import {
  createRecurringRule,
  generateDueRecurringTransactions,
  insertTransactionRow,
  repairLegacyRecurringConfirmationState,
  type SqlJsDatabaseDriver,
} from '../db/dbClient';

async function createTestDriver(): Promise<SqlJsDatabaseDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(SQLITE_PRAGMA_SETUP);
  db.exec(CREATE_TABLES_SQL);
  for (const migration of SQLITE_MIGRATIONS) {
    try { db.run(migration); } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
    }
  }
  return {
    rawDb: db,
    async execute(sql, params = []) { params.length ? db.run(sql, params) : db.exec(sql); },
    async query(sql, params = []) {
      const stmt = db.prepare(sql);
      if (params.length) stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
    exportToBase64: () => '',
  };
}

async function seedAccount(driver: SqlJsDatabaseDriver) {
  await driver.execute(`INSERT INTO accounts (id, name, type) VALUES ('bank-1', 'Bank', 'ASSET')`);
}

describe('recurring confirmation behavior', () => {
  it('creates due recurring entries as unconfirmed even when legacy auto-approve is true', async () => {
    const driver = await createTestDriver();
    await seedAccount(driver);
    await createRecurringRule(driver, {
      title: 'Rent',
      subtitle: 'Monthly rent',
      amount: 20000,
      date: '2026-08-11T12:00:00.000Z',
      category: '#rent',
      icon: 'Home',
      type: 'expense',
      account: 'bank-1',
      fromAccountId: 'bank-1',
      transaction_type: 'EXPENSE',
      is_verified: 1,
      isRecurring: true,
      recurrenceFrequency: 'MONTHLY',
    }, { id: 'rule-1', nextDueDate: '2026-08-11' });

    await generateDueRecurringTransactions(driver, true, new Date('2026-08-11T12:00:00'));
    const rows = await driver.query(`SELECT is_verified, due_date FROM transactions WHERE recurring_rule_id = 'rule-1'`);
    expect(rows).toEqual([{ is_verified: 0, due_date: '2026-08-11' }]);
  });

  it('repairs the legacy auto-verified first occurrence without reopening established history', async () => {
    const driver = await createTestDriver();
    await seedAccount(driver);
    await createRecurringRule(driver, {
      title: 'Rent', subtitle: '', amount: 20000, date: '2026-07-13T12:00:00.000Z', category: '#rent', icon: 'Home',
      type: 'expense', account: 'bank-1', fromAccountId: 'bank-1', transaction_type: 'EXPENSE',
      is_verified: 1, isRecurring: true, recurrenceFrequency: 'MONTHLY',
    }, { id: 'rule-legacy', nextDueDate: '2026-08-13' });
    await insertTransactionRow(driver, {
      id: 'legacy-tx', title: 'Rent', subtitle: '', amount: 20000, date: '2026-07-13T12:00:00.000Z', category: '#rent', icon: 'Home',
      type: 'expense', account: 'bank-1', fromAccountId: 'bank-1', transaction_type: 'EXPENSE',
      is_verified: 1, isRecurring: true, recurrenceFrequency: 'MONTHLY', recurringRuleId: 'rule-legacy', dueDate: '2026-07-13',
    });

    expect(await repairLegacyRecurringConfirmationState(driver, new Date('2026-08-11T12:00:00'))).toBe(1);
    expect(await driver.query(`SELECT is_verified FROM transactions WHERE id = 'legacy-tx'`)).toEqual([{ is_verified: 0 }]);

    await insertTransactionRow(driver, {
      id: 'history-tx', title: 'Rent', subtitle: '', amount: 20000, date: '2026-06-13T12:00:00.000Z', category: '#rent', icon: 'Home',
      type: 'expense', account: 'bank-1', fromAccountId: 'bank-1', transaction_type: 'EXPENSE',
      is_verified: 1, isRecurring: true, recurrenceFrequency: 'MONTHLY', recurringRuleId: 'rule-legacy', dueDate: '2026-06-13',
    });
    expect(await repairLegacyRecurringConfirmationState(driver, new Date('2026-08-11T12:00:00'))).toBe(0);
  });
});
