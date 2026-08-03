import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_PRAGMA_SETUP } from './sqliteSchema';
import { insertAccountRow, insertCreditCardAccount, type SqlJsDatabaseDriver } from './dbClient';

async function createTestDriver(): Promise<SqlJsDatabaseDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(SQLITE_PRAGMA_SETUP);
  db.exec(CREATE_TABLES_SQL);
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

describe('atomic account creation', () => {
  it('creates an opening balance with an explicit non-null interest flag', async () => {
    const driver = await createTestDriver();
    await insertAccountRow(driver, { id: 'asset-1', name: 'Bank', type: 'asset', balance: 0 }, 500, 'opening-1');

    const rows = await driver.query('SELECT is_interest_only, to_account_id FROM transactions WHERE id = ?', ['opening-1']);
    expect(rows).toEqual([{ is_interest_only: 0, to_account_id: 'asset-1' }]);
  });

  it('rolls back the account if its opening transaction fails', async () => {
    const driver = await createTestDriver();
    await driver.execute(`INSERT INTO accounts (id, name, type) VALUES ('existing', 'Existing', 'ASSET')`);
    await driver.execute(`INSERT INTO transactions (id, transaction_type, title, amount, date, to_account_id) VALUES ('duplicate-tx', 'INCOME', 'Existing', 1, 1, 'existing')`);

    await expect(insertAccountRow(
      driver,
      { id: 'rolled-back', name: 'Should Roll Back', type: 'asset', balance: 0 },
      100,
      'duplicate-tx',
    )).rejects.toThrow();

    expect(await driver.query(`SELECT id FROM accounts WHERE id = 'rolled-back'`)).toEqual([]);
  });

  it('creates the account, opening debt and credit-card record together', async () => {
    const driver = await createTestDriver();
    const account = { id: 'card-1', name: 'Test Card', type: 'liability' as const, group: 'Credit Card', balance: 0, limit: 10_000 };
    const card = { id: 'card-1', name: 'Test Card', balance: 0, dueAmount: 250, dueDate: '2026-09-01', billingCycleDay: 1, limit: 10_000 };

    await insertCreditCardAccount(driver, account, card, 1200, 'card-opening');

    expect(await driver.query(`SELECT subtype FROM accounts WHERE id = 'card-1'`)).toEqual([{ subtype: 'Credit Card' }]);
    expect(await driver.query(`SELECT account_id FROM credit_cards WHERE account_id = 'card-1'`)).toEqual([{ account_id: 'card-1' }]);
    expect(await driver.query(`SELECT is_interest_only FROM transactions WHERE id = 'card-opening'`)).toEqual([{ is_interest_only: 0 }]);
  });
});
