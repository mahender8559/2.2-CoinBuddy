import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_PRAGMA_SETUP } from './sqliteSchema';
import type { SqlJsDatabaseDriver } from './dbClient';
import { archivePerson, loadSharedFinanceState } from './sharedFinanceRepository';

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

async function seedSharedLoan(driver: SqlJsDatabaseDriver, otherArchived = false) {
  await driver.execute(`INSERT INTO accounts (id, name, type, subtype, monthly_emi) VALUES ('loan-1', 'Car Loan', 'LIABILITY', 'Bank Loan', 10000)`);
  await driver.execute(`INSERT INTO people (id, name, relationship, is_self, is_archived, created_at) VALUES ('self', 'Me', 'Self', 1, 0, '2026-08-19')`);
  await driver.execute(`INSERT INTO people (id, name, relationship, is_self, is_archived, created_at) VALUES ('other', 'Friend', 'Friend', 0, ?, '2026-08-19')`, [otherArchived ? 1 : 0]);
  await driver.execute(`INSERT INTO loan_sharing_rules (account_id, personal_responsibility_percent, is_shared) VALUES ('loan-1', 50, 1)`);
  await driver.execute(`INSERT INTO loan_contribution_rules (id, account_id, person_id, mode, value, is_active) VALUES ('self-rule', 'loan-1', 'self', 'PERCENT', 50, 1)`);
  await driver.execute(`INSERT INTO loan_contribution_rules (id, account_id, person_id, mode, value, is_active) VALUES ('other-rule', 'loan-1', 'other', 'PERCENT', 50, 1)`);
}

describe('archiving a shared-loan contributor', () => {
  it('deactivates their future EMI contribution without deleting the rule row', async () => {
    const driver = await createTestDriver();
    await seedSharedLoan(driver);

    await archivePerson(driver, 'other');

    expect(await driver.query(`SELECT is_archived FROM people WHERE id = 'other'`)).toEqual([{ is_archived: 1 }]);
    expect(await driver.query(`SELECT id, value, is_active FROM loan_contribution_rules WHERE id = 'other-rule'`)).toEqual([
      { id: 'other-rule', value: 50, is_active: 0 },
    ]);
    expect(await driver.query(`SELECT is_active FROM loan_contribution_rules WHERE id = 'self-rule'`)).toEqual([{ is_active: 1 }]);
  });

  it('treats pre-fix active rules owned by already archived people as inactive when loading', async () => {
    const driver = await createTestDriver();
    await seedSharedLoan(driver, true);

    const state = await loadSharedFinanceState(driver);
    const selfRule = state.loanContributionRules.find(rule => rule.id === 'self-rule');
    const archivedRule = state.loanContributionRules.find(rule => rule.id === 'other-rule');

    expect(selfRule?.isActive).toBe(true);
    expect(archivedRule?.isActive).toBe(false);
    expect(archivedRule?.value).toBe(50);
  });
});
