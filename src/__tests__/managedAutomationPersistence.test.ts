import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from '../db/sqliteSchema';
import { createRecurringRule, generateDueRecurringTransactions, insertTransactionRow, type SqlJsDatabaseDriver } from '../db/dbClient';
import { buildManagedRecurringTransaction, managedAutomationMarker, type ManagedAutomationCandidate } from '../domain/automation';
import type { Account } from '../types';

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

const bank: Account = { id: 'bank', name: 'Bank', type: 'asset', group: 'Bank Account', balance: 100_000 };
const loan: Account = { id: 'loan', name: 'Loan', type: 'liability', group: 'Bank Loan', balance: 100_000, monthlyEMI: 5_000, nextEMIDate: '2026-08-15', paymentFrequency: 'MONTHLY', interestRate: 12, interestCalculationType: 'REDUCING' };

async function seedAccounts(driver: SqlJsDatabaseDriver) {
  await driver.execute(`INSERT INTO accounts (id, name, type, subtype) VALUES ('bank', 'Bank', 'ASSET', 'Bank Account')`);
  await driver.execute(`INSERT INTO accounts (id, name, type, subtype, interest_rate, monthly_emi, interest_calculation_type, payment_frequency, next_emi_date) VALUES ('loan', 'Loan', 'LIABILITY', 'Bank Loan', 12, 5000, 'REDUCING', 'MONTHLY', '2026-08-15')`);
  await insertTransactionRow(driver, { id: 'opening-loan', title: 'Opening Balance', subtitle: '', amount: 100_000, date: '2026-01-01T12:00:00Z', category: '#opening', icon: 'Landmark', type: 'expense', account: 'loan', fromAccountId: 'loan', transaction_type: 'OPENING_BALANCE', isOpeningBalance: true, is_verified: 1 });
}

function loanCandidate(): ManagedAutomationCandidate {
  return { key: 'LOAN_EMI:loan', kind: 'LOAN_EMI', sourceId: 'loan', title: 'Loan EMI', amount: 5_000, nextDueDate: '2026-08-15', frequency: 'MONTHLY', transactionType: 'TRANSFER', destinationAccountId: 'loan', description: 'Full lender EMI' };
}

describe('V3.8 managed automation persistence', () => {
  it('generates one pending full-EMI occurrence split into principal and interest exactly once', async () => {
    const driver = await createTestDriver();
    await seedAccounts(driver);
    const template = buildManagedRecurringTransaction(loanCandidate(), 'bank', [bank, loan]);
    await createRecurringRule(driver, template, { id: 'managed-loan', nextDueDate: '2026-08-15' });

    expect(await generateDueRecurringTransactions(driver, false, new Date('2026-08-15T12:00:00'))).toBe(1);
    const rows = await driver.query(`SELECT amount, is_verified, is_interest_only, due_date FROM transactions WHERE recurring_rule_id = 'managed-loan' ORDER BY is_interest_only ASC`);
    expect(rows.length).toBe(2);
    expect(rows.every(row => Number(row.is_verified) === 0)).toBe(true);
    expect(rows.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(5_000, 6);
    expect(rows.every(row => row.due_date === '2026-08-15')).toBe(true);

    expect(await generateDueRecurringTransactions(driver, false, new Date('2026-08-15T12:00:00'))).toBe(0);
    expect((await driver.query(`SELECT id FROM transactions WHERE recurring_rule_id = 'managed-loan'`)).length).toBe(2);
  });

  it('persists an unlinked Goal schedule without a fake destination account', async () => {
    const driver = await createTestDriver();
    await driver.execute(`INSERT INTO accounts (id, name, type, subtype) VALUES ('bank', 'Bank', 'ASSET', 'Bank Account')`);
    const candidate: ManagedAutomationCandidate = { key: 'GOAL_CONTRIBUTION:goal', kind: 'GOAL_CONTRIBUTION', sourceId: 'goal', title: 'Travel contribution', amount: 2_000, nextDueDate: '2026-08-15', frequency: 'MONTHLY', transactionType: 'EXPENSE', goalId: 'goal', description: 'Goal contribution' };
    const template = buildManagedRecurringTransaction(candidate, 'bank', [bank]);
    await createRecurringRule(driver, template, { id: 'managed-goal', nextDueDate: '2026-08-15' });
    await generateDueRecurringTransactions(driver, false, new Date('2026-08-15T12:00:00'));

    const rules = await driver.query(`SELECT transaction_type, account, from_account_id, to_account_id, goal_id, notes FROM recurring_rules WHERE id = 'managed-goal'`);
    expect(rules[0].transaction_type).toBe('EXPENSE');
    expect(rules[0].account).toBe('bank');
    expect(rules[0].from_account_id).toBe('bank');
    expect(rules[0].to_account_id).toBeNull();
    expect(rules[0].goal_id).toBe('goal');
    expect(String(rules[0].notes)).toContain(managedAutomationMarker('GOAL_CONTRIBUTION', 'goal'));

    const tx = (await driver.query(`SELECT is_verified, goal_id, to_account_id FROM transactions WHERE recurring_rule_id = 'managed-goal'`))[0];
    expect(tx.is_verified).toBe(0);
    expect(tx.goal_id).toBe('goal');
    expect(tx.to_account_id).toBeNull();
  });
});
