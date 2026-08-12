import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { auditDatabaseIntegrity, CREATE_TABLES_SQL, SQLITE_PRAGMA_SETUP } from './sqliteSchema';

async function driverWithSchema() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const driver = {
    async execute(sql: string, params: any[] = []) { params.length ? db.run(sql, params) : db.exec(sql); },
    async query(sql: string, params: any[] = []) {
      const stmt = db.prepare(sql); if (params.length) stmt.bind(params);
      const rows: any[] = []; while (stmt.step()) rows.push(stmt.getAsObject()); stmt.free(); return rows;
    },
  };
  await driver.execute(SQLITE_PRAGMA_SETUP);
  await driver.execute(CREATE_TABLES_SQL);
  return { db, driver };
}

describe('v3.2 full data integrity audit', () => {
  it('passes a healthy ledger with managed SIP, card, category and Goal references', async () => {
    const { db, driver } = await driverWithSchema();
    await driver.execute(`INSERT INTO accounts (id, name, type, subtype, investment_method, monthly_sip_amount, next_sip_date) VALUES
      ('bank','Bank','ASSET','Bank',NULL,NULL,NULL),
      ('fund','Index Fund','ASSET','Investment','SIP',5000,'2026-09-01'),
      ('card','Credit Card','LIABILITY','Credit Card',NULL,NULL,NULL);`);
    await driver.execute(`INSERT INTO categories (id,name,type,affordability_class) VALUES ('groceries','Groceries','EXPENSE','NORMAL');`);
    await driver.execute(`INSERT INTO credit_cards (id,account_id,due_amount,due_date,billing_cycle_day) VALUES ('card','card',0,'2026-09-05',5);`);
    await driver.execute(`INSERT INTO recurring_rules (id,title,amount,transaction_type,from_account_id,to_account_id,frequency,next_due_date,is_active,anchor_day) VALUES ('investment-sip:fund','SIP: Index Fund',5000,'TRANSFER','bank','fund','MONTHLY','2026-09-01',1,1);`);
    await driver.execute(`INSERT INTO app_settings (key,value_json) VALUES ('savings_goals_v1', ?), ('theme', '"dark"')`, [JSON.stringify([{ id: 'g1', name: 'Emergency', targetAmount: 100000, monthlyContribution: 5000, linkedAccountId: 'bank', protectLinkedBalance: true, isActive: true }])]);
    const report = await auditDatabaseIntegrity(driver);
    expect(report.isHealthy).toBe(true);
    expect(report.hasCriticalIssues).toBe(false);
    expect(report.issues).toEqual([]);
    db.close();
  });

  it('reports planner/schedule consistency problems that the old balance-only audit missed', async () => {
    const { db, driver } = await driverWithSchema();
    await driver.execute(`INSERT INTO accounts (id, name, type, subtype, investment_method, monthly_sip_amount, next_sip_date) VALUES ('fund','Old SIP','ASSET','Investment','SIP',10000,'2026-09-01');`);
    await driver.execute(`INSERT INTO categories (id,name,type,affordability_class) VALUES ('legacy','Legacy','EXPENSE',NULL);`);
    await driver.execute(`INSERT INTO recurring_rules (id,title,amount,transaction_type,from_account_id,frequency,next_due_date,is_active,anchor_day) VALUES ('bad','Broken Bill',100,'EXPENSE','missing','MONTHLY','2026-09-02',1,2);`);
    await driver.execute(`INSERT INTO app_settings (key,value_json) VALUES ('savings_goals_v1', ?)`, [JSON.stringify([{ id: 'g1', name: 'Missing link', targetAmount: 50000, linkedAccountId: 'gone', isActive: true }])]);
    const report = await auditDatabaseIntegrity(driver);
    expect(report.issues.some(issue => issue.code === 'SIP_RECURRING_SYNC')).toBe(true);
    expect(report.issues.some(issue => issue.code === 'CATEGORY_AFFORDABILITY')).toBe(true);
    expect(report.issues.some(issue => issue.code === 'RECURRING_SOURCE' && issue.severity === 'error')).toBe(true);
    expect(report.issues.some(issue => issue.code === 'GOAL_ACCOUNT')).toBe(true);
    expect(report.hasCriticalIssues).toBe(true);
    db.close();
  });
});
