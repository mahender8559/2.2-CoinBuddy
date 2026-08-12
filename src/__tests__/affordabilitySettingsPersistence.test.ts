import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from '../db/sqliteSchema';
import {
  importLedgerToDatabase,
  loadAppSettings,
  type SqlJsDatabaseDriver,
} from '../db/dbClient';
import {
  AFFORDABILITY_SETTINGS_KEY,
  DEFAULT_AFFORDABILITY_SETTINGS,
} from '../domain/affordabilitySettings';
import { migrateBackupDataToLatest, validateLedgerSchema } from '../utils/ledgerSchema';

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

const baseBackup = () => ({
  schemaVersion: 'coinbuddy-ledger-v3',
  exportedAt: '2026-08-12T00:00:00.000Z',
  accounts: [],
  transactions: [],
  categories: [],
  events: [],
  creditCards: [],
  widgets: [],
  loanRevisions: [],
  recurringRules: [],
  currency: 'INR',
});

describe('affordability settings backup and SQLite persistence', () => {
  it('restores affordability preferences into app_settings during ledger import', async () => {
    const driver = await createDriver();
    const affordabilitySettings = {
      version: 1 as const,
      setupCompleted: true,
      monthlySavingsTarget: 18000,
      protectedCashReserve: 45000,
      contingencyMode: 'FIXED' as const,
      fixedContingencyAmount: 9000,
      historicalMonths: 8,
      safetyLevel: 'CONSERVATIVE' as const,
    };
    const backup = { ...baseBackup(), affordabilitySettings };
    expect(validateLedgerSchema(backup)).toBeNull();

    await importLedgerToDatabase(driver, backup);
    const settings = await loadAppSettings(driver);
    expect(settings[AFFORDABILITY_SETTINGS_KEY]).toEqual(affordabilitySettings);
  });

  it('gives older v3 backups safe affordability defaults instead of failing restore', async () => {
    const driver = await createDriver();
    const backup = baseBackup();
    expect(validateLedgerSchema(backup)).toBeNull();

    await importLedgerToDatabase(driver, backup);
    const settings = await loadAppSettings(driver);
    expect(settings[AFFORDABILITY_SETTINGS_KEY]).toEqual(DEFAULT_AFFORDABILITY_SETTINGS);
  });

  it('preserves affordability preferences through backup migration and normalizes malformed values', () => {
    const migrated = migrateBackupDataToLatest(JSON.stringify({
      ...baseBackup(),
      affordabilitySettings: {
        setupCompleted: true,
        monthlySavingsTarget: -10,
        protectedCashReserve: 25000,
        contingencyMode: 'fixed',
        fixedContingencyAmount: 6000,
        historicalMonths: 100,
        safetyLevel: 'flexible',
      },
    }));
    expect(migrated.affordabilitySettings).toEqual({
      version: 1,
      setupCompleted: true,
      monthlySavingsTarget: 0,
      protectedCashReserve: 25000,
      contingencyMode: 'FIXED',
      fixedContingencyAmount: 6000,
      historicalMonths: 24,
      safetyLevel: 'FLEXIBLE',
    });
  });

  it('rejects a malformed affordabilitySettings backup field', () => {
    expect(validateLedgerSchema({ ...baseBackup(), affordabilitySettings: 'not-an-object' })).toContain('affordabilitySettings');
  });
});
