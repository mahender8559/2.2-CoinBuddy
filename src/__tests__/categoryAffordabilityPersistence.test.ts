import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from '../db/sqliteSchema';
import { insertCategoryRow, normalizeCategoryRow, type SqlJsDatabaseDriver } from '../db/dbClient';

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

describe('category affordability persistence', () => {
  it('persists the new affordability class in SQLite', async () => {
    const driver = await createDriver();
    await insertCategoryRow(driver, { id: 'medical', name: 'Medical', icon: 'Heart', type: 'expense', affordabilityClass: 'IRREGULAR' });
    const rows = await driver.query(`SELECT affordability_class FROM categories WHERE id = 'medical'`);
    expect(rows).toEqual([{ affordability_class: 'IRREGULAR' }]);
  });

  it('normalizes legacy category rows into the new model', () => {
    expect(normalizeCategoryRow({ id: 'old-save', name: 'SIP', type: 'EXPENSE', icon_name: 'Target', group_name: 'Savings' }).affordabilityClass).toBe('SAVINGS');
    expect(normalizeCategoryRow({ id: 'old-fun', name: 'Movies', type: 'EXPENSE', icon_name: 'Film', group_name: 'Leisure' }).affordabilityClass).toBe('FLEXIBLE');
    expect(normalizeCategoryRow({ id: 'old-food', name: 'Food', type: 'EXPENSE', icon_name: 'Utensils', group_name: 'Essential' }).affordabilityClass).toBe('NORMAL');
  });
});
