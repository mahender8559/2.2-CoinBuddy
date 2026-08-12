import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from '../db/sqliteSchema';
import { importLedgerToDatabase, loadAppSettings, loadStateFromDatabase, type SqlJsDatabaseDriver } from '../db/dbClient';
import { AFFORDABILITY_SETTINGS_KEY } from '../domain/affordabilitySettings';
import { validateLedgerSchema } from '../utils/ledgerSchema';

async function createDriver(): Promise<SqlJsDatabaseDriver> {
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

describe('affordability phase 7 backup restore', () => {
  it('restores planner settings, category behavior and recurring schedule together', async () => {
    const driver = await createDriver();
    const backup = {
      schemaVersion: 'coinbuddy-ledger-v3',
      exportedAt: '2026-08-12T00:00:00.000Z',
      accounts: [],
      transactions: [],
      categories: [
        { id: 'medical', name: 'Medical', icon: 'Heart', type: 'expense', affordabilityClass: 'IRREGULAR' },
        { id: 'rent', name: 'Rent', icon: 'Home', type: 'expense', affordabilityClass: 'COMMITTED' },
      ],
      events: [],
      creditCards: [],
      widgets: [],
      loanRevisions: [],
      recurringRules: [
        { id: 'rent-rule', title: 'Rent', amount: 25000, transactionType: 'EXPENSE', category: 'rent', frequency: 'MONTHLY', nextDueDate: '2026-09-03', isActive: true, anchorDay: 3 },
      ],
      affordabilitySettings: {
        version: 1,
        setupCompleted: true,
        monthlySavingsTarget: 15000,
        protectedCashReserve: 40000,
        contingencyMode: 'FIXED',
        fixedContingencyAmount: 8000,
        historicalMonths: 12,
        safetyLevel: 'CONSERVATIVE',
      },
      currency: 'INR',
    };

    expect(validateLedgerSchema(backup)).toBeNull();
    await importLedgerToDatabase(driver, backup);

    const [state, settings] = await Promise.all([loadStateFromDatabase(driver), loadAppSettings(driver)]);
    expect(state.categories.find(category => category.id === 'medical')?.affordabilityClass).toBe('IRREGULAR');
    expect(state.categories.find(category => category.id === 'rent')?.affordabilityClass).toBe('COMMITTED');
    expect(state.recurringRules).toHaveLength(1);
    expect(state.recurringRules[0]).toMatchObject({ id: 'rent-rule', frequency: 'MONTHLY', nextDueDate: '2026-09-03', anchorDay: 3 });
    expect(settings[AFFORDABILITY_SETTINGS_KEY]).toEqual(backup.affordabilitySettings);
  });
});
