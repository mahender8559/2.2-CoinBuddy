import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_PRAGMA_SETUP } from './sqliteSchema';
import {
  insertAccountRow,
  loadStateFromDatabase,
  updateAccountRow,
  type SqlJsDatabaseDriver,
} from './dbClient';
import type { Account } from '../types';

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

describe('loan date hydration', () => {
  it('preserves an edited next EMI date independently from the loan start date', async () => {
    const driver = await createTestDriver();
    const loan: Account = {
      id: 'loan-1',
      name: 'Car Loan',
      type: 'liability',
      group: 'Bank Loan',
      balance: 0,
      originalPrincipal: 500_000,
      interestRate: 9,
      monthlyEMI: 12_000,
      interestCalculationType: 'REDUCING',
      paymentFrequency: 'MONTHLY',
      tenureMonths: 48,
      loanStartDate: '2026-01-10',
      nextEMIDate: '2026-09-18',
    };

    await insertAccountRow(driver, loan, 500_000, 'loan-opening');

    let state = await loadStateFromDatabase(driver);
    expect(state.accounts.find(account => account.id === loan.id)?.loanStartDate).toBe('2026-01-10');
    expect(state.accounts.find(account => account.id === loan.id)?.nextEMIDate).toBe('2026-09-18');

    await updateAccountRow(driver, { ...loan, nextEMIDate: '2026-10-24' });

    state = await loadStateFromDatabase(driver);
    const reloaded = state.accounts.find(account => account.id === loan.id);
    expect(reloaded?.loanStartDate).toBe('2026-01-10');
    expect(reloaded?.nextEMIDate).toBe('2026-10-24');
  });
});
