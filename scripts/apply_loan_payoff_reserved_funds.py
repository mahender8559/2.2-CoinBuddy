from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)

def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'Anchor not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))

def replace_all(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'Anchor not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new))

def regex_once(path, pattern, replacement):
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Regex anchor count {count} in {path}: {pattern[:100]}')
    write(path, next_text)

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------
replace_once('src/types.ts', '''export interface ExternalLoanContribution {
  id: string;
  accountId: string;
  personId: string;
  adjustmentTransactionId?: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  paidAt: string;
}
''', '''export interface ExternalLoanContribution {
  id: string;
  accountId: string;
  personId: string;
  adjustmentTransactionId?: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  paidAt: string;
}

export type LoanPayoffType = 'PARTIAL' | 'FULL';
export type LoanPayoffPlanStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type LoanPayoffHoldingType = 'TRACKED' | 'EXTERNAL';
export type LoanPayoffMovementType = 'RESERVE' | 'RELEASE' | 'CONSUME';

/** A dated lump-sum repayment objective against one real liability. */
export interface LoanPayoffPlan {
  id: string;
  liabilityAccountId: string;
  targetAmount: number;
  targetDate: string;
  payoffType: LoanPayoffType;
  status: LoanPayoffPlanStatus;
  createdAt: string;
}

/** Who intends to fund the payoff plan; independent of legal ownership and EMI split. */
export interface LoanPayoffResponsibility {
  id: string;
  planId: string;
  personId: string;
  targetAmount: number;
}

/** Append-only reserve ledger. RESERVE adds; RELEASE/CONSUME subtract. */
export interface LoanPayoffFundMovement {
  id: string;
  planId: string;
  personId: string;
  assetAccountId?: string;
  holdingType: LoanPayoffHoldingType;
  movementType: LoanPayoffMovementType;
  amount: number;
  transactionId?: string;
  externalLoanContributionId?: string;
  createdAt: string;
}
''')

# ---------------------------------------------------------------------------
# Domain helpers
# ---------------------------------------------------------------------------
write('src/domain/loanPayoff.ts', r'''import type { Account, LoanPayoffFundMovement, LoanPayoffPlan, LoanPayoffResponsibility } from '../types';

const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function loanPayoffMovementDelta(movement: LoanPayoffFundMovement): number {
  return movement.movementType === 'RESERVE' ? money(movement.amount) : -money(movement.amount);
}

export function getActiveLoanPayoffPlan(plans: LoanPayoffPlan[], liabilityAccountId: string): LoanPayoffPlan | undefined {
  return plans.find(plan => plan.liabilityAccountId === liabilityAccountId && plan.status === 'ACTIVE');
}

export function getLoanPayoffPlanReservedAmount(planId: string, movements: LoanPayoffFundMovement[]): number {
  return money(movements.filter(item => item.planId === planId).reduce((sum, item) => sum + loanPayoffMovementDelta(item), 0));
}

export function getLoanPayoffPersonReservedAmount(planId: string, personId: string, movements: LoanPayoffFundMovement[]): number {
  return money(movements.filter(item => item.planId === planId && item.personId === personId).reduce((sum, item) => sum + loanPayoffMovementDelta(item), 0));
}

export function getLoanPayoffTrackedReservedForAccount(planId: string, assetAccountId: string, movements: LoanPayoffFundMovement[]): number {
  return money(movements
    .filter(item => item.planId === planId && item.holdingType === 'TRACKED' && item.assetAccountId === assetAccountId)
    .reduce((sum, item) => sum + loanPayoffMovementDelta(item), 0));
}

export function getLoanPayoffExternalReservedForPerson(planId: string, personId: string, movements: LoanPayoffFundMovement[]): number {
  return money(movements
    .filter(item => item.planId === planId && item.personId === personId && item.holdingType === 'EXTERNAL')
    .reduce((sum, item) => sum + loanPayoffMovementDelta(item), 0));
}

export function getTrackedReservedForAccount(plans: LoanPayoffPlan[], movements: LoanPayoffFundMovement[], accountId: string): number {
  const active = new Set(plans.filter(plan => plan.status === 'ACTIVE').map(plan => plan.id));
  return money(movements
    .filter(item => active.has(item.planId) && item.holdingType === 'TRACKED' && item.assetAccountId === accountId)
    .reduce((sum, item) => sum + loanPayoffMovementDelta(item), 0));
}

export function getSpendableAccountBalance(account: Account, reservedAmount: number): number {
  return money(Number(account.balance || 0) - Math.max(0, money(reservedAmount)));
}

export function validateLoanPayoffResponsibilitySplit(targetAmount: number, rows: Array<Pick<LoanPayoffResponsibility, 'targetAmount'>>): string | null {
  const target = money(targetAmount);
  if (!Number.isFinite(target) || target <= 0) return 'Payoff target must be greater than zero.';
  const total = money(rows.reduce((sum, row) => sum + Math.max(0, Number(row.targetAmount) || 0), 0));
  if (Math.abs(total - target) > 0.009) return `Contributor targets must total exactly ${target.toFixed(2)}. Current total is ${total.toFixed(2)}.`;
  return null;
}

export function getLoanPayoffFundingSummary(plan: LoanPayoffPlan, responsibilities: LoanPayoffResponsibility[], movements: LoanPayoffFundMovement[]) {
  const reserved = Math.max(0, getLoanPayoffPlanReservedAmount(plan.id, movements));
  const target = money(plan.targetAmount);
  const remaining = Math.max(0, money(target - reserved));
  const progress = target > 0 ? Math.min(100, Math.max(0, reserved / target * 100)) : 0;
  return {
    target,
    reserved,
    remaining,
    progress,
    funded: remaining <= 0.009,
    contributorTargetTotal: money(responsibilities.filter(row => row.planId === plan.id).reduce((sum, row) => sum + row.targetAmount, 0)),
  };
}
''')

write('src/domain/loanPayoff.test.ts', r'''import { describe, expect, it } from 'vitest';
import type { Account, LoanPayoffFundMovement, LoanPayoffPlan, LoanPayoffResponsibility } from '../types';
import {
  getLoanPayoffFundingSummary,
  getLoanPayoffTrackedReservedForAccount,
  getSpendableAccountBalance,
  getTrackedReservedForAccount,
  validateLoanPayoffResponsibilitySplit,
} from './loanPayoff';

const plan: LoanPayoffPlan = { id: 'plan', liabilityAccountId: 'loan', targetAmount: 200000, targetDate: '2026-10-31', payoffType: 'PARTIAL', status: 'ACTIVE', createdAt: '2026-08-31T00:00:00.000Z' };
const movements: LoanPayoffFundMovement[] = [
  { id: 'm1', planId: 'plan', personId: 'me', assetAccountId: 'hdfc', holdingType: 'TRACKED', movementType: 'RESERVE', amount: 70000, createdAt: '2026-08-31T00:00:00.000Z' },
  { id: 'm2', planId: 'plan', personId: 'brother', holdingType: 'EXTERNAL', movementType: 'RESERVE', amount: 30000, createdAt: '2026-08-31T00:00:00.000Z' },
  { id: 'm3', planId: 'plan', personId: 'me', assetAccountId: 'hdfc', holdingType: 'TRACKED', movementType: 'RELEASE', amount: 10000, createdAt: '2026-09-01T00:00:00.000Z' },
];

describe('loan payoff reserved funds', () => {
  it('derives tracked reserve and spendable cash without changing the real balance', () => {
    const account: Account = { id: 'hdfc', name: 'HDFC', type: 'asset', balance: 120000 };
    expect(getLoanPayoffTrackedReservedForAccount('plan', 'hdfc', movements)).toBe(60000);
    expect(getTrackedReservedForAccount([plan], movements, 'hdfc')).toBe(60000);
    expect(getSpendableAccountBalance(account, 60000)).toBe(60000);
  });

  it('derives plan progress from append-only movements', () => {
    const responsibilities: LoanPayoffResponsibility[] = [
      { id: 'r1', planId: 'plan', personId: 'me', targetAmount: 120000 },
      { id: 'r2', planId: 'plan', personId: 'brother', targetAmount: 80000 },
    ];
    expect(getLoanPayoffFundingSummary(plan, responsibilities, movements)).toMatchObject({ reserved: 90000, remaining: 110000, progress: 45, funded: false });
  });

  it('requires contributor targets to exactly match the payoff target', () => {
    expect(validateLoanPayoffResponsibilitySplit(200000, [{ targetAmount: 120000 }, { targetAmount: 80000 }])).toBeNull();
    expect(validateLoanPayoffResponsibilitySplit(200000, [{ targetAmount: 120000 }, { targetAmount: 70000 }])).toContain('must total exactly');
  });
});
''')

# ---------------------------------------------------------------------------
# SQLite schema
# ---------------------------------------------------------------------------
replace_once('src/db/sqliteSchema.ts', '''CREATE UNIQUE INDEX IF NOT EXISTS one_shared_expense_per_transaction
  ON shared_obligations(transaction_id) WHERE transaction_id IS NOT NULL AND kind = 'EXPENSE';
''', '''-- Loan payoff plans reserve existing cash without moving it. The movement table is
-- append-only so every reserve/release/consume action remains auditable.
CREATE TABLE IF NOT EXISTS loan_payoff_plans (
  id TEXT PRIMARY KEY,
  liability_account_id TEXT NOT NULL,
  target_amount REAL NOT NULL CHECK(target_amount > 0),
  target_date TEXT NOT NULL,
  payoff_type TEXT NOT NULL CHECK(payoff_type IN ('PARTIAL', 'FULL')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (liability_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_payoff_plan_per_liability
  ON loan_payoff_plans(liability_account_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS loan_payoff_responsibilities (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  target_amount REAL NOT NULL CHECK(target_amount > 0),
  FOREIGN KEY (plan_id) REFERENCES loan_payoff_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT,
  UNIQUE(plan_id, person_id)
);

CREATE TABLE IF NOT EXISTS loan_payoff_fund_movements (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  asset_account_id TEXT,
  holding_type TEXT NOT NULL CHECK(holding_type IN ('TRACKED', 'EXTERNAL')),
  movement_type TEXT NOT NULL CHECK(movement_type IN ('RESERVE', 'RELEASE', 'CONSUME')),
  amount REAL NOT NULL CHECK(amount > 0),
  transaction_id TEXT,
  external_loan_contribution_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES loan_payoff_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT,
  FOREIGN KEY (asset_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  FOREIGN KEY (external_loan_contribution_id) REFERENCES external_loan_contributions(id) ON DELETE SET NULL,
  CHECK((holding_type = 'TRACKED' AND asset_account_id IS NOT NULL) OR (holding_type = 'EXTERNAL' AND asset_account_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_loan_payoff_movements_plan ON loan_payoff_fund_movements(plan_id, created_at);
CREATE INDEX IF NOT EXISTS idx_loan_payoff_movements_asset ON loan_payoff_fund_movements(asset_account_id, holding_type);

CREATE UNIQUE INDEX IF NOT EXISTS one_shared_expense_per_transaction
  ON shared_obligations(transaction_id) WHERE transaction_id IS NOT NULL AND kind = 'EXPENSE';
''')

# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------
write('src/db/loanPayoffRepository.ts', r'''import type { SqlJsDatabaseDriver } from './dbClient';
import type {
  LoanPayoffFundMovement,
  LoanPayoffHoldingType,
  LoanPayoffPlan,
  LoanPayoffResponsibility,
  LoanPayoffType,
} from '../types';
import { validateLoanPayoffResponsibilitySplit } from '../domain/loanPayoff';

const nowIso = () => new Date().toISOString();
const money = (value: unknown, label = 'Amount') => {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} must be greater than zero.`);
  return amount;
};

export interface LoanPayoffState {
  plans: LoanPayoffPlan[];
  responsibilities: LoanPayoffResponsibility[];
  movements: LoanPayoffFundMovement[];
}

const planFromRow = (row: any): LoanPayoffPlan => ({
  id: String(row.id), liabilityAccountId: String(row.liability_account_id), targetAmount: Number(row.target_amount),
  targetDate: String(row.target_date), payoffType: row.payoff_type, status: row.status, createdAt: String(row.created_at),
});
const responsibilityFromRow = (row: any): LoanPayoffResponsibility => ({
  id: String(row.id), planId: String(row.plan_id), personId: String(row.person_id), targetAmount: Number(row.target_amount),
});
const movementFromRow = (row: any): LoanPayoffFundMovement => ({
  id: String(row.id), planId: String(row.plan_id), personId: String(row.person_id), assetAccountId: row.asset_account_id ?? undefined,
  holdingType: row.holding_type, movementType: row.movement_type, amount: Number(row.amount), transactionId: row.transaction_id ?? undefined,
  externalLoanContributionId: row.external_loan_contribution_id ?? undefined, createdAt: String(row.created_at),
});

export async function loadLoanPayoffState(driver: SqlJsDatabaseDriver): Promise<LoanPayoffState> {
  const [plans, responsibilities, movements] = await Promise.all([
    driver.query(`SELECT * FROM loan_payoff_plans ORDER BY status = 'ACTIVE' DESC, target_date, created_at DESC`),
    driver.query(`SELECT * FROM loan_payoff_responsibilities ORDER BY plan_id, id`),
    driver.query(`SELECT * FROM loan_payoff_fund_movements ORDER BY created_at, id`),
  ]);
  return { plans: plans.map(planFromRow), responsibilities: responsibilities.map(responsibilityFromRow), movements: movements.map(movementFromRow) };
}

async function getPlan(driver: SqlJsDatabaseDriver, planId: string) {
  const rows = await driver.query(`SELECT * FROM loan_payoff_plans WHERE id = ?`, [planId]);
  if (!rows[0]) throw new Error('Loan payoff plan could not be found.');
  return planFromRow(rows[0]);
}

async function signedReserved(driver: SqlJsDatabaseDriver, whereSql: string, params: unknown[]): Promise<number> {
  const rows = await driver.query(`SELECT COALESCE(SUM(CASE WHEN movement_type = 'RESERVE' THEN amount ELSE -amount END), 0) AS reserved FROM loan_payoff_fund_movements WHERE ${whereSql}`, params as any[]);
  return Math.max(0, Math.round(Number(rows[0]?.reserved ?? 0) * 100) / 100);
}

export async function saveLoanPayoffPlan(
  driver: SqlJsDatabaseDriver,
  input: { id?: string; liabilityAccountId: string; targetAmount: number; targetDate: string; payoffType: LoanPayoffType; responsibilities: Array<{ personId: string; targetAmount: number }> },
): Promise<LoanPayoffPlan> {
  const targetAmount = money(input.targetAmount, 'Payoff target');
  const targetMs = new Date(`${input.targetDate}T12:00:00`).getTime();
  if (!Number.isFinite(targetMs)) throw new Error('Target date is invalid.');
  const liabilityRows = await driver.query(`SELECT id, name, type, cached_balance FROM account_balances_view WHERE id = ? AND is_archived = 0`, [input.liabilityAccountId]);
  const liability = liabilityRows[0];
  if (!liability || String(liability.type).toUpperCase() !== 'LIABILITY') throw new Error('Choose an active loan liability.');
  const balance = Number(liability.cached_balance ?? 0);
  if (targetAmount > balance + 0.009) throw new Error(`Payoff target cannot exceed the current outstanding balance of ${balance.toFixed(2)}.`);

  const allocations = input.responsibilities
    .map(row => ({ personId: row.personId, targetAmount: Math.round(Number(row.targetAmount) * 100) / 100 }))
    .filter(row => row.targetAmount > 0);
  const splitError = validateLoanPayoffResponsibilitySplit(targetAmount, allocations);
  if (splitError) throw new Error(splitError);
  for (const allocation of allocations) {
    const person = await driver.query(`SELECT id FROM people WHERE id = ? AND is_archived = 0`, [allocation.personId]);
    if (!person[0]) throw new Error('Every payoff contributor must be an active person.');
  }

  let plan: LoanPayoffPlan;
  if (input.id) {
    const existing = await getPlan(driver, input.id);
    if (existing.status !== 'ACTIVE') throw new Error('Only an active payoff plan can be edited.');
    const reserved = await signedReserved(driver, `plan_id = ?`, [existing.id]);
    if (targetAmount + 0.009 < reserved) throw new Error(`Release reserved funds before lowering the target below ${reserved.toFixed(2)}.`);
    plan = { ...existing, liabilityAccountId: input.liabilityAccountId, targetAmount, targetDate: input.targetDate, payoffType: input.payoffType };
  } else {
    const existing = await driver.query(`SELECT id FROM loan_payoff_plans WHERE liability_account_id = ? AND status = 'ACTIVE' LIMIT 1`, [input.liabilityAccountId]);
    if (existing[0]) throw new Error('This loan already has an active payoff plan.');
    plan = { id: crypto.randomUUID(), liabilityAccountId: input.liabilityAccountId, targetAmount, targetDate: input.targetDate, payoffType: input.payoffType, status: 'ACTIVE', createdAt: nowIso() };
  }

  await driver.execute('BEGIN TRANSACTION');
  try {
    if (input.id) {
      await driver.execute(`UPDATE loan_payoff_plans SET liability_account_id = ?, target_amount = ?, target_date = ?, payoff_type = ? WHERE id = ?`, [plan.liabilityAccountId, plan.targetAmount, plan.targetDate, plan.payoffType, plan.id]);
      await driver.execute(`DELETE FROM loan_payoff_responsibilities WHERE plan_id = ?`, [plan.id]);
    } else {
      await driver.execute(`INSERT INTO loan_payoff_plans (id, liability_account_id, target_amount, target_date, payoff_type, status, created_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`, [plan.id, plan.liabilityAccountId, plan.targetAmount, plan.targetDate, plan.payoffType, plan.createdAt]);
    }
    for (const row of allocations) {
      await driver.execute(`INSERT INTO loan_payoff_responsibilities (id, plan_id, person_id, target_amount) VALUES (?, ?, ?, ?)`, [crypto.randomUUID(), plan.id, row.personId, row.targetAmount]);
    }
    await driver.execute('COMMIT');
    return plan;
  } catch (error) {
    await driver.execute('ROLLBACK');
    throw error;
  }
}

export async function reserveLoanPayoffFunds(driver: SqlJsDatabaseDriver, input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }): Promise<LoanPayoffFundMovement> {
  const plan = await getPlan(driver, input.planId);
  if (plan.status !== 'ACTIVE') throw new Error('Funds can only be reserved for an active payoff plan.');
  const amount = money(input.amount, 'Reserve amount');
  const responsibility = await driver.query(`SELECT target_amount FROM loan_payoff_responsibilities WHERE plan_id = ? AND person_id = ?`, [plan.id, input.personId]);
  if (!responsibility[0]) throw new Error('This person is not a contributor to the payoff plan.');
  const personReserved = await signedReserved(driver, `plan_id = ? AND person_id = ?`, [plan.id, input.personId]);
  if (personReserved + amount > Number(responsibility[0].target_amount) + 0.009) throw new Error('This reserve would exceed the contributor target.');
  const planReserved = await signedReserved(driver, `plan_id = ?`, [plan.id]);
  if (planReserved + amount > plan.targetAmount + 0.009) throw new Error('This reserve would exceed the payoff target.');

  let assetAccountId: string | undefined;
  if (input.holdingType === 'TRACKED') {
    assetAccountId = input.assetAccountId;
    if (!assetAccountId) throw new Error('Choose the asset account that holds these funds.');
    const accountRows = await driver.query(`SELECT id, type, cached_balance FROM account_balances_view WHERE id = ? AND is_archived = 0`, [assetAccountId]);
    if (!accountRows[0] || String(accountRows[0].type).toUpperCase() !== 'ASSET') throw new Error('Reserved tracked funds must be held in an active asset account.');
    const allReservedRows = await driver.query(`SELECT COALESCE(SUM(CASE WHEN m.movement_type = 'RESERVE' THEN m.amount ELSE -m.amount END), 0) AS reserved FROM loan_payoff_fund_movements m JOIN loan_payoff_plans p ON p.id = m.plan_id WHERE p.status = 'ACTIVE' AND m.holding_type = 'TRACKED' AND m.asset_account_id = ?`, [assetAccountId]);
    const alreadyReserved = Math.max(0, Number(allReservedRows[0]?.reserved ?? 0));
    const available = Number(accountRows[0].cached_balance ?? 0) - alreadyReserved;
    if (amount > available + 0.009) throw new Error(`Only ${Math.max(0, available).toFixed(2)} is currently unreserved in that account.`);
  }

  const movement: LoanPayoffFundMovement = { id: crypto.randomUUID(), planId: plan.id, personId: input.personId, assetAccountId, holdingType: input.holdingType, movementType: 'RESERVE', amount, createdAt: nowIso() };
  await driver.execute(`INSERT INTO loan_payoff_fund_movements (id, plan_id, person_id, asset_account_id, holding_type, movement_type, amount, transaction_id, external_loan_contribution_id, created_at) VALUES (?, ?, ?, ?, ?, 'RESERVE', ?, NULL, NULL, ?)`, [movement.id, movement.planId, movement.personId, movement.assetAccountId ?? null, movement.holdingType, movement.amount, movement.createdAt]);
  return movement;
}

export async function releaseLoanPayoffFunds(driver: SqlJsDatabaseDriver, input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }): Promise<LoanPayoffFundMovement> {
  const plan = await getPlan(driver, input.planId);
  if (plan.status !== 'ACTIVE') throw new Error('Only an active payoff plan can release funds.');
  const amount = money(input.amount, 'Release amount');
  const accountClause = input.holdingType === 'TRACKED' ? `AND asset_account_id = ?` : `AND asset_account_id IS NULL`;
  const params = input.holdingType === 'TRACKED' ? [plan.id, input.personId, input.assetAccountId] : [plan.id, input.personId];
  const available = await signedReserved(driver, `plan_id = ? AND person_id = ? AND holding_type = '${input.holdingType}' ${accountClause}`, params);
  if (amount > available + 0.009) throw new Error('Release amount exceeds the currently reserved amount.');
  const movement: LoanPayoffFundMovement = { id: crypto.randomUUID(), planId: plan.id, personId: input.personId, assetAccountId: input.holdingType === 'TRACKED' ? input.assetAccountId : undefined, holdingType: input.holdingType, movementType: 'RELEASE', amount, createdAt: nowIso() };
  await driver.execute(`INSERT INTO loan_payoff_fund_movements (id, plan_id, person_id, asset_account_id, holding_type, movement_type, amount, transaction_id, external_loan_contribution_id, created_at) VALUES (?, ?, ?, ?, ?, 'RELEASE', ?, NULL, NULL, ?)`, [movement.id, movement.planId, movement.personId, movement.assetAccountId ?? null, movement.holdingType, movement.amount, movement.createdAt]);
  return movement;
}

export async function consumeTrackedReservedForLoanPayment(driver: SqlJsDatabaseDriver, input: { liabilityAccountId: string; assetAccountId: string; amount: number; transactionId?: string }): Promise<number> {
  const planRows = await driver.query(`SELECT * FROM loan_payoff_plans WHERE liability_account_id = ? AND status = 'ACTIVE' LIMIT 1`, [input.liabilityAccountId]);
  if (!planRows[0]) return 0;
  const plan = planFromRow(planRows[0]);
  let remaining = money(input.amount, 'Payment amount');
  const positions = await driver.query(`SELECT person_id, COALESCE(SUM(CASE WHEN movement_type = 'RESERVE' THEN amount ELSE -amount END), 0) AS reserved FROM loan_payoff_fund_movements WHERE plan_id = ? AND holding_type = 'TRACKED' AND asset_account_id = ? GROUP BY person_id HAVING reserved > 0.009 ORDER BY person_id`, [plan.id, input.assetAccountId]);
  let consumed = 0;
  for (const position of positions) {
    if (remaining <= 0.009) break;
    const take = Math.min(remaining, Math.max(0, Number(position.reserved)));
    if (take <= 0.009) continue;
    await driver.execute(`INSERT INTO loan_payoff_fund_movements (id, plan_id, person_id, asset_account_id, holding_type, movement_type, amount, transaction_id, external_loan_contribution_id, created_at) VALUES (?, ?, ?, ?, 'TRACKED', 'CONSUME', ?, ?, NULL, ?)`, [crypto.randomUUID(), plan.id, String(position.person_id), input.assetAccountId, take, input.transactionId ?? null, nowIso()]);
    consumed += take;
    remaining -= take;
  }
  return Math.round(consumed * 100) / 100;
}

export async function consumeExternalReservedForLoanPayment(driver: SqlJsDatabaseDriver, input: { liabilityAccountId: string; personId: string; amount: number; externalLoanContributionId?: string }): Promise<number> {
  const planRows = await driver.query(`SELECT * FROM loan_payoff_plans WHERE liability_account_id = ? AND status = 'ACTIVE' LIMIT 1`, [input.liabilityAccountId]);
  if (!planRows[0]) return 0;
  const plan = planFromRow(planRows[0]);
  const available = await signedReserved(driver, `plan_id = ? AND person_id = ? AND holding_type = 'EXTERNAL' AND asset_account_id IS NULL`, [plan.id, input.personId]);
  const consume = Math.min(money(input.amount, 'External payment amount'), available);
  if (consume <= 0.009) return 0;
  await driver.execute(`INSERT INTO loan_payoff_fund_movements (id, plan_id, person_id, asset_account_id, holding_type, movement_type, amount, transaction_id, external_loan_contribution_id, created_at) VALUES (?, ?, ?, NULL, 'EXTERNAL', 'CONSUME', ?, NULL, ?, ?)`, [crypto.randomUUID(), plan.id, input.personId, consume, input.externalLoanContributionId ?? null, nowIso()]);
  return consume;
}

async function closePlan(driver: SqlJsDatabaseDriver, planId: string, status: 'COMPLETED' | 'CANCELLED'): Promise<void> {
  const plan = await getPlan(driver, planId);
  if (plan.status !== 'ACTIVE') return;
  const positions = await driver.query(`SELECT person_id, holding_type, asset_account_id, COALESCE(SUM(CASE WHEN movement_type = 'RESERVE' THEN amount ELSE -amount END), 0) AS reserved FROM loan_payoff_fund_movements WHERE plan_id = ? GROUP BY person_id, holding_type, asset_account_id HAVING reserved > 0.009`, [planId]);
  for (const position of positions) {
    await driver.execute(`INSERT INTO loan_payoff_fund_movements (id, plan_id, person_id, asset_account_id, holding_type, movement_type, amount, transaction_id, external_loan_contribution_id, created_at) VALUES (?, ?, ?, ?, ?, 'RELEASE', ?, NULL, NULL, ?)`, [crypto.randomUUID(), planId, String(position.person_id), position.asset_account_id ?? null, String(position.holding_type), Number(position.reserved), nowIso()]);
  }
  await driver.execute(`UPDATE loan_payoff_plans SET status = ? WHERE id = ?`, [status, planId]);
}

export const cancelLoanPayoffPlan = (driver: SqlJsDatabaseDriver, planId: string) => closePlan(driver, planId, 'CANCELLED');
export const completeLoanPayoffPlan = (driver: SqlJsDatabaseDriver, planId: string) => closePlan(driver, planId, 'COMPLETED');
''')

# ---------------------------------------------------------------------------
# Backup/import plumbing
# ---------------------------------------------------------------------------
replace_once('src/db/dbClientCore.ts', "import { Account, Category, CreditCardInfo, Event, LoanRevision, RecurrenceFrequency, RecurringRule, Transaction, Widget, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule, SharedObligationTemplate, SharedTemplateResponsibility, ExternalLoanContribution } from '../types';", "import { Account, Category, CreditCardInfo, Event, LoanRevision, RecurrenceFrequency, RecurringRule, Transaction, Widget, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule, SharedObligationTemplate, SharedTemplateResponsibility, ExternalLoanContribution, LoanPayoffPlan, LoanPayoffResponsibility, LoanPayoffFundMovement } from '../types';")
replace_once('src/db/dbClientCore.ts', "await driver.execute(`DELETE FROM external_loan_contributions; DELETE FROM shared_settlements;", "await driver.execute(`DELETE FROM loan_payoff_fund_movements; DELETE FROM loan_payoff_responsibilities; DELETE FROM loan_payoff_plans; DELETE FROM external_loan_contributions; DELETE FROM shared_settlements;")
replace_once('src/db/dbClientCore.ts', "    const externalLoanContributions: ExternalLoanContribution[] = Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : [];\n    const userConfig", "    const externalLoanContributions: ExternalLoanContribution[] = Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : [];\n    const loanPayoffPlans: LoanPayoffPlan[] = Array.isArray(data.loanPayoffPlans) ? data.loanPayoffPlans : [];\n    const loanPayoffResponsibilities: LoanPayoffResponsibility[] = Array.isArray(data.loanPayoffResponsibilities) ? data.loanPayoffResponsibilities : [];\n    const loanPayoffFundMovements: LoanPayoffFundMovement[] = Array.isArray(data.loanPayoffFundMovements) ? data.loanPayoffFundMovements : [];\n    const userConfig")
replace_once('src/db/dbClientCore.ts', "    executePreparedRows(driver, `INSERT INTO external_loan_contributions (id, account_id, person_id, adjustment_transaction_id, amount, principal_amount, interest_amount, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`, externalLoanContributions.map(item => [item.id, item.accountId, item.personId, item.adjustmentTransactionId ?? null, Number(item.amount), Number(item.principalAmount), Number(item.interestAmount), item.paidAt]));", "    executePreparedRows(driver, `INSERT INTO external_loan_contributions (id, account_id, person_id, adjustment_transaction_id, amount, principal_amount, interest_amount, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`, externalLoanContributions.map(item => [item.id, item.accountId, item.personId, item.adjustmentTransactionId ?? null, Number(item.amount), Number(item.principalAmount), Number(item.interestAmount), item.paidAt]));\n    executePreparedRows(driver, `INSERT INTO loan_payoff_plans (id, liability_account_id, target_amount, target_date, payoff_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);`, loanPayoffPlans.map(item => [item.id, item.liabilityAccountId, Number(item.targetAmount), item.targetDate, item.payoffType, item.status, item.createdAt]));\n    executePreparedRows(driver, `INSERT INTO loan_payoff_responsibilities (id, plan_id, person_id, target_amount) VALUES (?, ?, ?, ?);`, loanPayoffResponsibilities.map(item => [item.id, item.planId, item.personId, Number(item.targetAmount)]));\n    executePreparedRows(driver, `INSERT INTO loan_payoff_fund_movements (id, plan_id, person_id, asset_account_id, holding_type, movement_type, amount, transaction_id, external_loan_contribution_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, loanPayoffFundMovements.map(item => [item.id, item.planId, item.personId, item.assetAccountId ?? null, item.holdingType, item.movementType, Number(item.amount), item.transactionId ?? null, item.externalLoanContributionId ?? null, item.createdAt]));")

# backup schema v6
replace_once('src/utils/ledgerSchema.ts', "export const LEDGER_SCHEMA_VERSION = 'coinbuddy-ledger-v5';\nexport const PREVIOUS_LEDGER_SCHEMA_VERSIONS = ['coinbuddy-ledger-v4', 'coinbuddy-ledger-v3'] as const;", "export const LEDGER_SCHEMA_VERSION = 'coinbuddy-ledger-v6';\nexport const PREVIOUS_LEDGER_SCHEMA_VERSIONS = ['coinbuddy-ledger-v5', 'coinbuddy-ledger-v4', 'coinbuddy-ledger-v3'] as const;")
replace_once('src/utils/ledgerSchema.ts', "for (const key of ['people', 'sharedObligations', 'sharedResponsibilities', 'sharedPayments', 'sharedSettlements', 'loanSharingRules', 'loanContributionRules', 'sharedObligationTemplates', 'sharedTemplateResponsibilities', 'externalLoanContributions'])", "for (const key of ['people', 'sharedObligations', 'sharedResponsibilities', 'sharedPayments', 'sharedSettlements', 'loanSharingRules', 'loanContributionRules', 'sharedObligationTemplates', 'sharedTemplateResponsibilities', 'externalLoanContributions', 'loanPayoffPlans', 'loanPayoffResponsibilities', 'loanPayoffFundMovements'])")
replace_once('src/utils/ledgerSchema.ts', "      externalLoanContributions: Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : [],\n      currency:", "      externalLoanContributions: Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : [],\n      loanPayoffPlans: Array.isArray(data.loanPayoffPlans) ? data.loanPayoffPlans : [],\n      loanPayoffResponsibilities: Array.isArray(data.loanPayoffResponsibilities) ? data.loanPayoffResponsibilities : [],\n      loanPayoffFundMovements: Array.isArray(data.loanPayoffFundMovements) ? data.loanPayoffFundMovements : [],\n      currency:")
replace_once('src/utils/ledgerSchema.ts', "people: [], sharedObligations: [], sharedResponsibilities: [], sharedPayments: [], sharedSettlements: [], loanSharingRules: [], loanContributionRules: [], sharedObligationTemplates: [], sharedTemplateResponsibilities: [], externalLoanContributions: [],", "people: [], sharedObligations: [], sharedResponsibilities: [], sharedPayments: [], sharedSettlements: [], loanSharingRules: [], loanContributionRules: [], sharedObligationTemplates: [], sharedTemplateResponsibilities: [], externalLoanContributions: [], loanPayoffPlans: [], loanPayoffResponsibilities: [], loanPayoffFundMovements: [],")

# ---------------------------------------------------------------------------
# AppContext integration
# ---------------------------------------------------------------------------
replace_once('src/context/AppContext.tsx', "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings, SavingsGoal, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule, SharedObligationTemplate, SharedTemplateResponsibility, ExternalLoanContribution, RecurrenceFrequency } from '../types';", "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings, SavingsGoal, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule, SharedObligationTemplate, SharedTemplateResponsibility, ExternalLoanContribution, LoanPayoffPlan, LoanPayoffResponsibility, LoanPayoffFundMovement, LoanPayoffHoldingType, LoanPayoffType, RecurrenceFrequency } from '../types';")
replace_once('src/context/AppContext.tsx', "} from '../db/sharedFinanceRepository';\n", "} from '../db/sharedFinanceRepository';\nimport {\n  loadLoanPayoffState,\n  saveLoanPayoffPlan as saveLoanPayoffPlanRow,\n  reserveLoanPayoffFunds as reserveLoanPayoffFundsRow,\n  releaseLoanPayoffFunds as releaseLoanPayoffFundsRow,\n  consumeTrackedReservedForLoanPayment,\n  consumeExternalReservedForLoanPayment,\n  cancelLoanPayoffPlan as cancelLoanPayoffPlanRow,\n  completeLoanPayoffPlan as completeLoanPayoffPlanRow,\n  type LoanPayoffState,\n} from '../db/loanPayoffRepository';\nimport { getActiveLoanPayoffPlan, getLoanPayoffTrackedReservedForAccount, getSpendableAccountBalance, getTrackedReservedForAccount } from '../domain/loanPayoff';\n")
replace_once('src/context/AppContext.tsx', "  externalLoanContributions?: ExternalLoanContribution[];\n  currency?: string;", "  externalLoanContributions?: ExternalLoanContribution[];\n  loanPayoffPlans?: LoanPayoffPlan[];\n  loanPayoffResponsibilities?: LoanPayoffResponsibility[];\n  loanPayoffFundMovements?: LoanPayoffFundMovement[];\n  currency?: string;")
replace_once('src/context/AppContext.tsx', "  externalLoanContributions: ExternalLoanContribution[];\n  personalExpenseRecords:", "  externalLoanContributions: ExternalLoanContribution[];\n  loanPayoffPlans: LoanPayoffPlan[];\n  loanPayoffResponsibilities: LoanPayoffResponsibility[];\n  loanPayoffFundMovements: LoanPayoffFundMovement[];\n  getReservedBalance: (accountId: string) => number;\n  getSpendableBalance: (accountId: string) => number;\n  getLoanPayoffPlanForLiability: (accountId: string) => LoanPayoffPlan | undefined;\n  getLoanPayoffReservedForAccount: (liabilityAccountId: string, assetAccountId: string) => number;\n  saveLoanPayoffPlan: (input: { id?: string; liabilityAccountId: string; targetAmount: number; targetDate: string; payoffType: LoanPayoffType; responsibilities: Array<{ personId: string; targetAmount: number }> }) => Promise<boolean>;\n  reserveLoanPayoffFunds: (input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }) => Promise<boolean>;\n  releaseLoanPayoffFunds: (input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }) => Promise<boolean>;\n  cancelLoanPayoffPlan: (planId: string) => Promise<boolean>;\n  completeLoanPayoffPlan: (planId: string) => Promise<boolean>;\n  personalExpenseRecords:")
replace_once('src/context/AppContext.tsx', "  payLiability: (id: string, amount: number, principalAmount?: number, interestAmount?: number, fromAccountId?: string) => Promise<MutationResult>;", "  payLiability: (id: string, amount: number, principalAmount?: number, interestAmount?: number, fromAccountId?: string, useReservedFunds?: boolean) => Promise<MutationResult>;")
replace_once('src/context/AppContext.tsx', "  const externalLoanContributions = sharedFinance.externalLoanContributions;\n  const personalExpenseRecords", "  const externalLoanContributions = sharedFinance.externalLoanContributions;\n  const EMPTY_LOAN_PAYOFF_STATE: LoanPayoffState = { plans: [], responsibilities: [], movements: [] };\n  const [loanPayoffState, setLoanPayoffState] = useState<LoanPayoffState>(EMPTY_LOAN_PAYOFF_STATE);\n  const loanPayoffPlans = loanPayoffState.plans;\n  const loanPayoffResponsibilities = loanPayoffState.responsibilities;\n  const loanPayoffFundMovements = loanPayoffState.movements;\n  const getReservedBalance = useCallback((accountId: string) => getTrackedReservedForAccount(loanPayoffState.plans, loanPayoffState.movements, accountId), [loanPayoffState]);\n  const getSpendableBalance = useCallback((accountId: string) => {\n    const account = accounts.find(item => item.id === accountId);\n    return account ? getSpendableAccountBalance(account, getReservedBalance(accountId)) : 0;\n  }, [accounts, getReservedBalance]);\n  const getLoanPayoffPlanForLiability = useCallback((accountId: string) => getActiveLoanPayoffPlan(loanPayoffState.plans, accountId), [loanPayoffState.plans]);\n  const getLoanPayoffReservedForAccount = useCallback((liabilityAccountId: string, assetAccountId: string) => {\n    const plan = getActiveLoanPayoffPlan(loanPayoffState.plans, liabilityAccountId);\n    return plan ? getLoanPayoffTrackedReservedForAccount(plan.id, assetAccountId, loanPayoffState.movements) : 0;\n  }, [loanPayoffState]);\n  const personalExpenseRecords")
replace_once('src/context/AppContext.tsx', "  const refreshSharedFinance = async (driver: SqlJsDatabaseDriver) => {\n    setSharedFinance(await loadSharedFinanceState(driver));\n  };", "  const refreshSharedFinance = async (driver: SqlJsDatabaseDriver) => {\n    setSharedFinance(await loadSharedFinanceState(driver));\n  };\n\n  const refreshLoanPayoff = async (driver: SqlJsDatabaseDriver) => {\n    setLoanPayoffState(await loadLoanPayoffState(driver));\n  };")
replace_once('src/context/AppContext.tsx', "  const addSharedPerson = async", "  const persistLoanPayoffAction = async (action: () => Promise<unknown>): Promise<boolean> => {\n    if (!dbDriver) return false;\n    try {\n      await runAtomicDatabaseAction(dbDriver, action);\n      await refreshLoanPayoff(dbDriver);\n      return true;\n    } catch (error) {\n      console.error('Loan payoff persistence failed:', error);\n      await refreshLoanPayoff(dbDriver).catch(() => undefined);\n      window.alert(`Loan payoff change was not saved: ${error instanceof Error ? error.message : String(error)}`);\n      return false;\n    }\n  };\n\n  const saveLoanPayoffPlan = (input: { id?: string; liabilityAccountId: string; targetAmount: number; targetDate: string; payoffType: LoanPayoffType; responsibilities: Array<{ personId: string; targetAmount: number }> }): Promise<boolean> =>\n    persistLoanPayoffAction(() => saveLoanPayoffPlanRow(dbDriver!, input));\n  const reserveLoanPayoffFunds = (input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }): Promise<boolean> =>\n    persistLoanPayoffAction(() => reserveLoanPayoffFundsRow(dbDriver!, input));\n  const releaseLoanPayoffFunds = (input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }): Promise<boolean> =>\n    persistLoanPayoffAction(() => releaseLoanPayoffFundsRow(dbDriver!, input));\n  const cancelLoanPayoffPlan = (planId: string): Promise<boolean> => persistLoanPayoffAction(() => cancelLoanPayoffPlanRow(dbDriver!, planId));\n  const completeLoanPayoffPlan = (planId: string): Promise<boolean> => persistLoanPayoffAction(() => completeLoanPayoffPlanRow(dbDriver!, planId));\n\n  const addSharedPerson = async")
regex_once('src/context/AppContext.tsx', r"  const recordExternalLoanPayment = async \(input: \{ accountId: string; personId: string; amount: number; paidAt: string \}\): Promise<boolean> => \{.*?\n  \};\n\n\n  const setSharedTemplateActive", '''  const recordExternalLoanPayment = async (input: { accountId: string; personId: string; amount: number; paidAt: string }): Promise<boolean> => {
    if (!dbDriver) return false;
    try {
      await runAtomicDatabaseAction(dbDriver, async () => {
        const contribution = await addExternalLoanContribution(dbDriver, input);
        await consumeExternalReservedForLoanPayment(dbDriver, {
          liabilityAccountId: input.accountId,
          personId: input.personId,
          amount: input.amount,
          externalLoanContributionId: contribution.id,
        });
      });
      await refreshStateFromDatabase(dbDriver);
      await refreshSharedFinance(dbDriver);
      await refreshLoanPayoff(dbDriver);
      return true;
    } catch (error) {
      console.error('External loan contribution failed:', error);
      window.alert(`External loan payment was not saved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };


  const setSharedTemplateActive''')
replace_once('src/context/AppContext.tsx', "        await refreshSharedFinance(driver);\n        const integrity", "        await refreshSharedFinance(driver);\n        await refreshLoanPayoff(driver);\n        const integrity")
replace_once('src/context/AppContext.tsx', "    await refreshSharedFinance(dbDriver);\n    const settings", "    await refreshSharedFinance(dbDriver);\n    await refreshLoanPayoff(dbDriver);\n    const settings")
replace_once('src/context/AppContext.tsx', "      await refreshSharedFinance(dbDriver);\n      const restoredAppSettings", "      await refreshSharedFinance(dbDriver);\n      await refreshLoanPayoff(dbDriver);\n      const restoredAppSettings")
replace_once('src/context/AppContext.tsx', "    setSharedFinance(EMPTY_SHARED_FINANCE);\n    setAffordabilitySettingsState", "    setSharedFinance(EMPTY_SHARED_FINANCE);\n    setLoanPayoffState(EMPTY_LOAN_PAYOFF_STATE);\n    setAffordabilitySettingsState")
replace_once('src/context/AppContext.tsx', "    externalLoanContributions,\n    currency,", "    externalLoanContributions,\n    loanPayoffPlans,\n    loanPayoffResponsibilities,\n    loanPayoffFundMovements,\n    currency,")
replace_once('src/context/AppContext.tsx', "schemaVersion: 'coinbuddy-ledger-v5'", "schemaVersion: 'coinbuddy-ledger-v6'")
replace_once('src/context/AppContext.tsx', "      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, sharedObligationTemplates, sharedTemplateResponsibilities, externalLoanContributions, personalExpenseRecords,", "      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, sharedObligationTemplates, sharedTemplateResponsibilities, externalLoanContributions,\n      loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements, getReservedBalance, getSpendableBalance, getLoanPayoffPlanForLiability, getLoanPayoffReservedForAccount, saveLoanPayoffPlan, reserveLoanPayoffFunds, releaseLoanPayoffFunds, cancelLoanPayoffPlan, completeLoanPayoffPlan, personalExpenseRecords,")
replace_once('src/context/AppContext.tsx', "    existingTx?: Transaction\n  ): { valid: boolean; error?: string } => {", "    existingTx?: Transaction,\n    ignoreReservedFunds = false\n  ): { valid: boolean; error?: string } => {")
replace_once('src/context/AppContext.tsx', "    const effectiveAccounts = recomputeAllAccountBalances(currentAccounts, nextTxs);\n\n    if (tx.is_verified", "    const effectiveAccounts = recomputeAllAccountBalances(currentAccounts, nextTxs);\n\n    if (!ignoreReservedFunds && tx.is_verified !== 0 && (tx.type === 'expense' || tx.type === 'transfer')) {\n      const sourceId = tx.type === 'transfer' ? tx.fromAccountId : (tx.fromAccountId || tx.account);\n      const sourceAcc = sourceId ? effectiveAccounts.find(account => account.id === sourceId) : undefined;\n      if (sourceAcc?.type === 'asset') {\n        const reserved = getReservedBalance(sourceAcc.id);\n        if (reserved > 0.009 && sourceAcc.balance - numAmount < reserved - 0.009) {\n          const spendable = Math.max(0, sourceAcc.balance - reserved);\n          return { valid: false, error: `${sourceAcc.name} has ${reserved.toFixed(2)} reserved for a loan payoff plan. Only ${spendable.toFixed(2)} is available for normal spending.` };\n        }\n      }\n    }\n\n    if (tx.is_verified")
regex_once('src/context/AppContext.tsx', r"  const payLiability = async \(id: string, amount: number, principalAmount\?: number, interestAmount\?: number, fromAccountId\?: string\): Promise<MutationResult> => \{.*?\n  \};\n\n  const deleteCreditCard", '''  const payLiability = async (id: string, amount: number, principalAmount?: number, interestAmount?: number, fromAccountId?: string, useReservedFunds = false): Promise<MutationResult> => {
    if (pendingLiabilityPayments.current.has(id)) return { success: false, error: 'A payment for this liability is already being saved.' };
    pendingLiabilityPayments.current.add(id);
    try {
      if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
      const defaultAsset = fromAccountId || accounts.find(a => a.type === 'asset')?.id || 'checking';
      const liabilityAcc = accounts.find(a => a.id === id);
      if (!liabilityAcc) return { success: false, error: 'Liability account could not be found.' };

      let pAmount = principalAmount;
      let iAmount = interestAmount;
      if (pAmount === undefined || iAmount === undefined) {
        if (liabilityAcc.group === 'Bank Loan' || liabilityAcc.group === 'Loan' || liabilityAcc.group === 'Mortgage' || liabilityAcc.group === 'Interest-Only Loan' || liabilityAcc.interestRate !== undefined || liabilityAcc.monthlyEMI !== undefined) {
          const split = calculateEmiSplit(liabilityAcc.balance, liabilityAcc.interestRate ?? 0, amount, liabilityAcc.interestCalculationType || 'REDUCING');
          pAmount = split.principalAmount;
          iAmount = split.interestAmount;
        } else { pAmount = amount; iAmount = 0; }
      }

      const principal = Math.max(0, Number(pAmount ?? 0));
      const interest = Math.max(0, Number(iAmount ?? 0));
      const totalPayment = principal + interest;
      if (!Number.isFinite(principal) || !Number.isFinite(interest) || totalPayment <= 0) return { success: false, error: 'Payment amount must be a positive number.' };

      const sourceAccount = accounts.find(account => account.id === defaultAsset);
      if (!sourceAccount) return { success: false, error: 'Payment source account could not be found.' };
      const reservedForThisLoan = useReservedFunds ? getLoanPayoffReservedForAccount(id, defaultAsset) : 0;
      const allReserved = getReservedBalance(defaultAsset);
      const protectedOtherReserves = Math.max(0, allReserved - reservedForThisLoan);
      if (sourceAccount.type === 'asset' && sourceAccount.balance - totalPayment < protectedOtherReserves - 0.009) {
        const allowed = Math.max(0, sourceAccount.balance - protectedOtherReserves);
        return { success: false, error: `Only ${allowed.toFixed(2)} is available from ${sourceAccount.name} after protecting other reserved funds.` };
      }

      const now = new Date();
      const subtitle = `Today • ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const paymentTransactions: Transaction[] = [];
      if (principal > 0) {
        const principalTx: Transaction = { id: crypto.randomUUID(), title: `Transfer: ${sourceAccount.name} to ${liabilityAcc.name}`, subtitle, amount: principal, date: now.toISOString(), category: '#transfer', icon: 'ArrowRightLeft', type: 'transfer', fromAccountId: defaultAsset, toAccountId: id };
        const validation = validateTransaction(principalTx, accounts, undefined, true);
        if (!validation.valid) return { success: false, error: validation.error || 'The principal payment is invalid.' };
        paymentTransactions.push(principalTx);
      }
      if (interest > 0) {
        const interestTx: Transaction = { id: crypto.randomUUID(), title: `Interest Payment: ${liabilityAcc.name}`, subtitle, amount: interest, date: now.toISOString(), category: '#interest', icon: 'Flame', type: 'expense', fromAccountId: defaultAsset, account: id, toAccountId: id, isInterestOnly: true };
        const validation = validateTransaction(interestTx, accounts, undefined, true);
        if (!validation.valid) return { success: false, error: validation.error || 'The interest payment is invalid.' };
        paymentTransactions.push(interestTx);
      }

      let consumedReserved = 0;
      const saved = await persistDbAction(async () => {
        await insertLiabilityPaymentRows(dbDriver, paymentTransactions);
        if (useReservedFunds) consumedReserved = await consumeTrackedReservedForLoanPayment(dbDriver, { liabilityAccountId: id, assetAccountId: defaultAsset, amount: totalPayment, transactionId: paymentTransactions[0]?.id });
      });
      if (!saved) return { success: false, error: 'The liability payment could not be saved.' };
      if (consumedReserved > 0.009) {
        await refreshLoanPayoff(dbDriver);
        clearStacks();
      } else {
        pushCommand({ entityType: 'transactionBatch', actionType: 'add', previousState: null, newState: paymentTransactions });
      }
      return { success: true };
    } finally { pendingLiabilityPayments.current.delete(id); }
  };

  const deleteCreditCard''')

# ---------------------------------------------------------------------------
# Add Transaction uses spendable balance in its immediate form validation
# ---------------------------------------------------------------------------
replace_once('src/components/AddTransactionModal.tsx', "    formatCurrency,\n    accounts,", "    formatCurrency,\n    getSpendableBalance,\n    getReservedBalance,\n    accounts,")
replace_all('src/components/AddTransactionModal.tsx', "        let available = selected.balance;", "        let available = getSpendableBalance(selected.id);")
replace_all('src/components/AddTransactionModal.tsx', "        let available = source.balance;", "        let available = getSpendableBalance(source.id);")
replace_once('src/components/AddTransactionModal.tsx', "if (numAmount > available) return showError(`Insufficient funds in ${selected.name}.`);", "if (numAmount > available) return showError(getReservedBalance(selected.id) > 0 ? `${formatCurrency(getReservedBalance(selected.id))} is reserved for a loan payoff plan. Only ${formatCurrency(Math.max(0, available))} is available.` : `Insufficient funds in ${selected.name}.`);")
replace_once('src/components/AddTransactionModal.tsx', "if (numAmount > available) return showError(`Insufficient funds in ${source.name}.`);", "if (numAmount > available) return showError(getReservedBalance(source.id) > 0 ? `${formatCurrency(getReservedBalance(source.id))} is reserved for a loan payoff plan. Only ${formatCurrency(Math.max(0, available))} is available.` : `Insufficient funds in ${source.name}.`);")

# ---------------------------------------------------------------------------
# Pay Down integration
# ---------------------------------------------------------------------------
replace_once('src/components/PayCardModal.tsx', "    getCurrencySymbol,\n  }", "    getCurrencySymbol,\n    getSpendableBalance,\n    getLoanPayoffPlanForLiability,\n    getLoanPayoffReservedForAccount,\n  }")
replace_once('src/components/PayCardModal.tsx', "  const [fromAccountId, setFromAccountId] = useState('');", "  const [fromAccountId, setFromAccountId] = useState('');\n  const [useReservedFunds, setUseReservedFunds] = useState(true);")
replace_once('src/components/PayCardModal.tsx', "  const annualRate = selectedLiability?.interestRate ?? 0;", "  const annualRate = selectedLiability?.interestRate ?? 0;\n  const payoffPlan = selectedLiability ? getLoanPayoffPlanForLiability(selectedLiability.id) : undefined;\n  const reservedForSelectedLoan = selectedLiability && fromAccountId ? getLoanPayoffReservedForAccount(selectedLiability.id, fromAccountId) : 0;")
replace_once('src/components/PayCardModal.tsx', "    const asset = accounts.find(account => account.id === fromAccountId);\n    if (!asset || paymentAmount > asset.balance) {\n      showError(`Insufficient funds in ${asset?.name || 'selected account'}. Cannot process transaction.`);", "    const asset = accounts.find(account => account.id === fromAccountId);\n    const allowedFromSource = asset ? getSpendableBalance(asset.id) + (useReservedFunds ? reservedForSelectedLoan : 0) : 0;\n    if (!asset || paymentAmount > allowedFromSource + 0.009) {\n      showError(`Only ${formatCurrency(Math.max(0, allowedFromSource))} is available in ${asset?.name || 'selected account'} after protected reserves.`);")
replace_once('src/components/PayCardModal.tsx', "? await payLiability(selectedLiability.id, paymentAmount, pAmount, iAmount, fromAccountId)", "? await payLiability(selectedLiability.id, paymentAmount, pAmount, iAmount, fromAccountId, useReservedFunds)")
replace_once('src/components/PayCardModal.tsx', "{sourceAccount ? <p className=\"mt-1 text-[9.5px] text-[#8191a6]\">Available <span className=\"font-semibold text-emerald-400\">{formatCurrency(sourceAccount.balance)}</span></p> : null}", "{sourceAccount ? <p className=\"mt-1 text-[9.5px] text-[#8191a6]\">Spendable <span className=\"font-semibold text-emerald-400\">{formatCurrency(getSpendableBalance(sourceAccount.id))}</span>{reservedForSelectedLoan > 0 ? <> · <span className=\"text-blue-300\">{formatCurrency(reservedForSelectedLoan)} reserved for this loan</span></> : null}</p> : null}\n            {isLoan && payoffPlan && reservedForSelectedLoan > 0 ? <label className=\"mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-blue-500/25 bg-blue-500/8 px-3 py-2.5 text-[10.5px] text-[#b9c5d5]\"><input type=\"checkbox\" checked={useReservedFunds} onChange={event => setUseReservedFunds(event.target.checked)} className=\"mt-0.5\" /><span><strong className=\"text-blue-300\">Use reserved payoff funds</strong><br/>This payment may consume up to {formatCurrency(reservedForSelectedLoan)} reserved for {selectedLiability?.name}.</span></label> : null}")

# ---------------------------------------------------------------------------
# Loan payoff modal
# ---------------------------------------------------------------------------
write('src/components/LoanPayoffPlanModal.tsx', r'''import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, LockKeyhole, Target, UsersRound, WalletCards, X } from 'lucide-react';
import type { Account, LoanPayoffHoldingType } from '../types';
import { useAppContext } from '../context/AppContext';
import { getLoanPayoffFundingSummary, loanPayoffMovementDelta } from '../domain/loanPayoff';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function LoanPayoffPlanModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const {
    accounts, people, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements,
    saveLoanPayoffPlan, reserveLoanPayoffFunds, releaseLoanPayoffFunds, cancelLoanPayoffPlan, completeLoanPayoffPlan,
    getSpendableBalance, formatCurrency,
  } = useAppContext();
  const plan = account ? loanPayoffPlans.find(item => item.liabilityAccountId === account.id && item.status === 'ACTIVE') : undefined;
  const activePeople = people.filter(person => !person.isArchived);
  const assetAccounts = accounts.filter(item => item.type === 'asset' && !item.is_archived);
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [payoffType, setPayoffType] = useState<'PARTIAL' | 'FULL'>('PARTIAL');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [reservePersonId, setReservePersonId] = useState('');
  const [holdingType, setHoldingType] = useState<LoanPayoffHoldingType>('TRACKED');
  const [assetAccountId, setAssetAccountId] = useState('');
  const [reserveAmount, setReserveAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!account) return;
    const in60 = new Date(); in60.setDate(in60.getDate() + 60);
    setTargetAmount(String(plan?.targetAmount ?? ''));
    setTargetDate(plan?.targetDate ?? in60.toISOString().slice(0, 10));
    setPayoffType(plan?.payoffType ?? 'PARTIAL');
    const next: Record<string, string> = {};
    for (const person of activePeople) {
      const row = plan ? loanPayoffResponsibilities.find(item => item.planId === plan.id && item.personId === person.id) : undefined;
      next[person.id] = row ? String(row.targetAmount) : '';
    }
    if (!plan) {
      const me = activePeople.find(person => person.isSelf);
      if (me) next[me.id] = '';
    }
    setAllocations(next);
    setReservePersonId(activePeople.find(person => person.isSelf)?.id ?? activePeople[0]?.id ?? '');
    setAssetAccountId(assetAccounts[0]?.id ?? '');
    setReserveAmount(''); setError('');
  }, [account?.id, plan?.id]);

  const positions = useMemo(() => {
    if (!plan) return [] as Array<{ key: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }>;
    const map = new Map<string, { key: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }>();
    for (const movement of loanPayoffFundMovements.filter(item => item.planId === plan.id)) {
      const key = `${movement.personId}|${movement.holdingType}|${movement.assetAccountId ?? ''}`;
      const current = map.get(key) ?? { key, personId: movement.personId, holdingType: movement.holdingType, assetAccountId: movement.assetAccountId, amount: 0 };
      current.amount += loanPayoffMovementDelta(movement);
      map.set(key, current);
    }
    return [...map.values()].filter(item => item.amount > 0.009);
  }, [plan?.id, loanPayoffFundMovements]);
  const summary = plan ? getLoanPayoffFundingSummary(plan, loanPayoffResponsibilities, loanPayoffFundMovements) : undefined;
  if (!account) return null;

  const savePlan = async () => {
    setError('');
    const target = Number(targetAmount);
    const rows = activePeople.map(person => ({ personId: person.id, targetAmount: Number(allocations[person.id] || 0) })).filter(row => row.targetAmount > 0);
    if (!Number.isFinite(target) || target <= 0) return setError('Enter a payoff target greater than zero.');
    if (!targetDate) return setError('Choose a target date.');
    const total = rows.reduce((sum, row) => sum + row.targetAmount, 0);
    if (Math.abs(total - target) > 0.009) return setError(`Contributor targets must total ${formatCurrency(target)}. Current total is ${formatCurrency(total)}.`);
    const ok = await saveLoanPayoffPlan({ id: plan?.id, liabilityAccountId: account.id, targetAmount: target, targetDate, payoffType, responsibilities: rows });
    if (!ok) setError('The payoff plan could not be saved.');
  };

  const addReserve = async () => {
    setError('');
    const amount = Number(reserveAmount);
    if (!plan) return setError('Save the payoff plan before reserving funds.');
    if (!reservePersonId || !Number.isFinite(amount) || amount <= 0) return setError('Choose a contributor and enter a reserve amount.');
    if (holdingType === 'TRACKED' && !assetAccountId) return setError('Choose the account holding these funds.');
    const ok = await reserveLoanPayoffFunds({ planId: plan.id, personId: reservePersonId, holdingType, assetAccountId: holdingType === 'TRACKED' ? assetAccountId : undefined, amount });
    if (ok) setReserveAmount(''); else setError('The reserve could not be saved. Check the contributor target and available balance.');
  };

  return <V35ModalFrame size="lg" testId="loan-payoff-plan-sheet" labelledBy="loan-payoff-plan-title" panelClassName="p-0">
    <div className="flex h-14 items-center border-b border-outline-variant/25 px-4"><div className="min-w-0 flex-1"><h2 id="loan-payoff-plan-title" className="text-sm font-semibold text-on-surface">Loan Payoff Plan</h2><p className="truncate text-[10px] text-on-surface-variant">{account.name}</p></div><button aria-label="Close loan payoff plan" onClick={onClose} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant"><X className="h-4 w-4" /></button></div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
      {error ? <div role="alert" className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div> : null}
      <section className="v35-surface rounded-2xl p-4"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-on-surface">Target</h3></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-on-surface-variant">Payoff type<select value={payoffType} onChange={e => { const next = e.target.value as 'PARTIAL' | 'FULL'; setPayoffType(next); if (next === 'FULL') setTargetAmount(String(account.balance)); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface"><option value="PARTIAL">Partial lump sum</option><option value="FULL">Full payoff target</option></select></label><label className="text-xs text-on-surface-variant">Target amount<div className="mt-1.5"><CurrencyInput aria-label="Payoff target amount" value={targetAmount} onValueChange={setTargetAmount} /></div></label><label className="text-xs text-on-surface-variant sm:col-span-2">Target date<div className="relative mt-1.5"><input aria-label="Payoff target date" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface" /><CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /></div></label></div></section>

      <section className="v35-surface rounded-2xl p-4"><div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-on-surface">Contributor targets</h3></div><p className="mt-1 text-xs text-on-surface-variant">This split is separate from loan ownership and normal EMI contribution.</p><div className="mt-3 space-y-2">{activePeople.map(person => <label key={person.id} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3 rounded-xl bg-surface-container px-3 py-2"><span className="text-sm text-on-surface">{person.name}{person.isSelf ? ' (You)' : ''}</span><CurrencyInput aria-label={`${person.name} payoff target`} value={allocations[person.id] ?? ''} onValueChange={value => setAllocations(current => ({ ...current, [person.id]: value }))} /></label>)}</div><button type="button" onClick={() => { void savePlan(); }} className="v35-focus-ring mt-4 min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-white">{plan ? 'Update payoff plan' : 'Create payoff plan'}</button></section>

      {plan && summary ? <>
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-primary"><LockKeyhole className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Reserved funds</span></div><strong className="mt-2 block text-2xl font-numeric text-on-surface">{formatCurrency(summary.reserved)}</strong><p className="mt-1 text-xs text-on-surface-variant">of {formatCurrency(summary.target)} · {summary.progress.toFixed(0)}% ready</p></div>{summary.funded ? <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Funded</span> : null}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high"><div className="h-full rounded-full bg-primary" style={{ width: `${summary.progress}%` }} /></div><p className="mt-2 text-xs text-on-surface-variant">{formatCurrency(summary.remaining)} still needs to be reserved.</p></section>

        <section className="v35-surface rounded-2xl p-4"><div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-on-surface">Reserve more</h3></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-on-surface-variant">Contributor<select value={reservePersonId} onChange={e => setReservePersonId(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface">{activePeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="text-xs text-on-surface-variant">Where is the money?<select value={holdingType} onChange={e => setHoldingType(e.target.value as LoanPayoffHoldingType)} className="mt-1.5 min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface"><option value="TRACKED">In one of my tracked accounts</option><option value="EXTERNAL">Held externally by contributor</option></select></label>{holdingType === 'TRACKED' ? <label className="text-xs text-on-surface-variant sm:col-span-2">Holding account<select value={assetAccountId} onChange={e => setAssetAccountId(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface">{assetAccounts.map(item => <option key={item.id} value={item.id}>{item.name} · spendable {formatCurrency(getSpendableBalance(item.id))}</option>)}</select></label> : <p className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs leading-5 text-on-surface-variant sm:col-span-2">External reserve records readiness only. It does not create a fake transaction in your bank account or count as income.</p>}<label className="text-xs text-on-surface-variant sm:col-span-2">Amount<div className="mt-1.5"><CurrencyInput aria-label="Reserve amount" value={reserveAmount} onValueChange={setReserveAmount} /></div></label></div><button type="button" onClick={() => { void addReserve(); }} className="v35-focus-ring mt-4 min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-white">Reserve funds</button></section>

        <section className="v35-surface rounded-2xl p-4"><h3 className="text-sm font-semibold text-on-surface">Current reservations</h3><div className="mt-3 space-y-2">{positions.length ? positions.map(position => { const person = people.find(item => item.id === position.personId); const asset = position.assetAccountId ? accounts.find(item => item.id === position.assetAccountId) : undefined; return <div key={position.key} className="flex items-center gap-3 rounded-xl bg-surface-container px-3 py-2.5"><LockKeyhole className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-on-surface">{person?.name ?? 'Contributor'} · {asset?.name ?? 'Held externally'}</p><p className="text-[10px] text-on-surface-variant">{position.holdingType === 'TRACKED' ? 'Blocked from normal spending in CoinBuddy' : 'External readiness only'}</p></div><span className="font-numeric text-sm font-semibold text-on-surface">{formatCurrency(position.amount)}</span><button type="button" onClick={() => { void releaseLoanPayoffFunds({ planId: plan.id, personId: position.personId, holdingType: position.holdingType, assetAccountId: position.assetAccountId, amount: position.amount }); }} className="v35-focus-ring rounded-lg px-2 py-1 text-[10px] font-semibold text-amber-400">Release</button></div>; }) : <p className="py-4 text-center text-xs text-on-surface-variant">No funds reserved yet.</p>}</div></section>

        <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => { void cancelLoanPayoffPlan(plan.id).then(ok => { if (ok) onClose(); }); }} className="v35-focus-ring min-h-11 rounded-xl border border-red-500/25 text-xs font-semibold text-red-300">Cancel plan</button><button type="button" disabled={summary.reserved > 0.009} onClick={() => { void completeLoanPayoffPlan(plan.id).then(ok => { if (ok) onClose(); }); }} className="v35-focus-ring min-h-11 rounded-xl border border-emerald-500/25 text-xs font-semibold text-emerald-300 disabled:opacity-40">Mark completed</button></div>
      </> : null}
    </div>
  </V35ModalFrame>;
}
''')

# Accounts UI integration
replace_once('src/components/V35AccountsPanel.tsx', "  Percent,\n  Plus,", "  Percent,\n  Plus,\n  Target,")
replace_once('src/components/V35AccountsPanel.tsx', "import { IconBadge, MoneyValue, SectionHeader, StatusPill } from './ui/V35';", "import { IconBadge, MoneyValue, SectionHeader, StatusPill } from './ui/V35';\nimport { LoanPayoffPlanModal } from './LoanPayoffPlanModal';")
replace_once('src/components/V35AccountsPanel.tsx', "    setPayCardModalState,\n  }", "    setPayCardModalState,\n    getReservedBalance,\n    getSpendableBalance,\n    getLoanPayoffPlanForLiability,\n  }")
replace_once('src/components/V35AccountsPanel.tsx', "  const [adjustmentTarget, setAdjustmentTarget]", "  const [payoffPlanAccount, setPayoffPlanAccount] = useState<Account | null>(null);\n  const [adjustmentTarget, setAdjustmentTarget]")
replace_once('src/components/V35AccountsPanel.tsx', "                  const interestPaid = isLoan ? getTotalInterestPaid(account, transactions) : 0;", "                  const interestPaid = isLoan ? getTotalInterestPaid(account, transactions) : 0;\n                  const reservedAmount = account.type === 'asset' ? getReservedBalance(account.id) : 0;\n                  const activePayoffPlan = isLoan ? getLoanPayoffPlanForLiability(account.id) : undefined;")
replace_once('src/components/V35AccountsPanel.tsx', "{needsSipLink ? <span className=\"text-[var(--cb-amber)]\">· SIP needs funding account</span> : null}", "{needsSipLink ? <span className=\"text-[var(--cb-amber)]\">· SIP needs funding account</span> : null}\n                            {reservedAmount > 0 ? <span className=\"text-primary\">· {formatCurrency(reservedAmount)} reserved</span> : null}\n                            {activePayoffPlan ? <span className=\"text-primary\">· payoff target {new Date(`${activePayoffPlan.targetDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> : null}")
replace_once('src/components/V35AccountsPanel.tsx', "{due?.soon ? <StatusPill", "{reservedAmount > 0 ? <span className=\"mt-1 block text-[10px] text-on-surface-variant\">Available {formatCurrency(getSpendableBalance(account.id))}</span> : null}\n                          {due?.soon ? <StatusPill")
replace_once('src/components/V35AccountsPanel.tsx', "{isLoan ? <button onClick={() => setRateUpdateAccount(account)}", "{isLoan ? <button onClick={() => setPayoffPlanAccount(account)} className=\"v35-focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary\"><Target className=\"h-3.5 w-3.5\" /> Payoff plan</button> : null}\n                              {isLoan ? <button onClick={() => setRateUpdateAccount(account)}")
replace_once('src/components/V35AccountsPanel.tsx', "      <UpdateLoanRateModal", "      <LoanPayoffPlanModal account={payoffPlanAccount} onClose={() => setPayoffPlanAccount(null)} />\n      <UpdateLoanRateModal")

# Planning views use spendable (post-reserve) asset balances while net worth remains unchanged elsewhere.
replace_once('src/components/AffordabilityPlanner.tsx', "formatCurrency } = useAppContext();", "formatCurrency, getSpendableBalance } = useAppContext();")
replace_once('src/components/AffordabilityPlanner.tsx', "  const run = () => {", "  const planningAccounts = useMemo(() => accounts.map(account => account.type === 'asset' ? { ...account, balance: getSpendableBalance(account.id) } : account), [accounts, getSpendableBalance]);\n\n  const run = () => {")
replace_once('src/components/AffordabilityPlanner.tsx', "      accounts,\n      transactions,", "      accounts: planningAccounts,\n      transactions,")
replace_once('src/components/AffordabilityPlanner.tsx', "buildUpcomingMoneyProjection({ ...horizon, accounts, transactions", "buildUpcomingMoneyProjection({ ...horizon, accounts: planningAccounts, transactions")
replace_once('src/components/AffordabilityPlanner.tsx', "[horizon, accounts, transactions, recurringRules, creditCards, savingsGoals]", "[horizon, planningAccounts, transactions, recurringRules, creditCards, savingsGoals]")
replace_once('src/components/AffordabilityPlanner.tsx', "sources: accounts.filter(account => account.type === 'asset'", "sources: planningAccounts.filter(account => account.type === 'asset'")

replace_once('src/components/SmarterPlanningDashboard.tsx', "const { accounts, transactions, recurringRules, creditCards, savingsGoals, formatCurrency } = useAppContext();", "const { accounts, transactions, recurringRules, creditCards, savingsGoals, formatCurrency, getSpendableBalance } = useAppContext();")
replace_once('src/components/SmarterPlanningDashboard.tsx', "  const liabilities = useMemo", "  const planningAccounts = useMemo(() => accounts.map(account => account.type === 'asset' ? { ...account, balance: getSpendableBalance(account.id) } : account), [accounts, getSpendableBalance]);\n  const liabilities = useMemo")
replace_once('src/components/SmarterPlanningDashboard.tsx', "buildSmarterPlanningReport({ asOfDate: localDateKey(new Date()), accounts, transactions", "buildSmarterPlanningReport({ asOfDate: localDateKey(new Date()), accounts: planningAccounts, transactions")
replace_once('src/components/SmarterPlanningDashboard.tsx', "[accounts, transactions, recurringRules, creditCards, savingsGoals]", "[planningAccounts, transactions, recurringRules, creditCards, savingsGoals]")

replace_once('src/components/UpcomingMoney.tsx', "const { accounts, transactions, recurringRules, creditCards, savingsGoals, monthCycleDay, formatCurrency } = useAppContext();", "const { accounts, transactions, recurringRules, creditCards, savingsGoals, monthCycleDay, formatCurrency, getSpendableBalance } = useAppContext();")
replace_once('src/components/UpcomingMoney.tsx', "  const projection = useMemo", "  const planningAccounts = useMemo(() => accounts.map(account => account.type === 'asset' ? { ...account, balance: getSpendableBalance(account.id) } : account), [accounts, getSpendableBalance]);\n  const projection = useMemo")
replace_once('src/components/UpcomingMoney.tsx', "buildUpcomingMoneyProjection({ ...horizon, accounts, transactions", "buildUpcomingMoneyProjection({ ...horizon, accounts: planningAccounts, transactions")
replace_once('src/components/UpcomingMoney.tsx', "[horizon, accounts, transactions, recurringRules, creditCards, savingsGoals]", "[horizon, planningAccounts, transactions, recurringRules, creditCards, savingsGoals]")

# Person archival safety for active payoff plans
replace_once('src/db/sharedFinanceRepository.ts', "  // Zero-valued rules have already been explicitly reassigned.", "  const blockingPayoff = await driver.query(`SELECT p.target_amount, lp.target_date, a.name AS loan_name FROM loan_payoff_responsibilities p JOIN loan_payoff_plans lp ON lp.id = p.plan_id JOIN accounts a ON a.id = lp.liability_account_id WHERE p.person_id = ? AND lp.status = 'ACTIVE' AND p.target_amount > 0.009 LIMIT 1`, [personId]);\n  if (blockingPayoff[0]) throw new Error(`Before removing ${String(rows[0].name)}, update or cancel their active payoff contribution for ${String(blockingPayoff[0].loan_name)} (target date ${String(blockingPayoff[0].target_date)}).`);\n\n  // Zero-valued rules have already been explicitly reassigned.")

# ---------------------------------------------------------------------------
# AppContext import/export state and data restore support
# ---------------------------------------------------------------------------
# dbClientCore import handles the arrays; AppContext must include them in its type and refresh state after import.

# ---------------------------------------------------------------------------
# E2E coverage is written but deliberately NOT run by the branch workflow.
# ---------------------------------------------------------------------------
write('e2e/loan-payoff-reserved-funds.spec.ts', r'''import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await page.getByRole('button', { name: /Load demo data/i }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15000 });
}

test('loan payoff plan reserves tracked cash and protects it from normal spending', async ({ page }) => {
  await prepare(page);
  await openAppDestination(page, 'Accounts');
  await page.getByRole('button', { name: /Car Loan/ }).click();
  await page.getByRole('button', { name: 'Payoff plan', exact: true }).click();
  const sheet = page.getByTestId('loan-payoff-plan-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Payoff target amount').fill('10000');
  const selfTarget = sheet.getByLabel(/Me.*payoff target/i);
  await selfTarget.fill('10000');
  await sheet.getByRole('button', { name: 'Create payoff plan', exact: true }).click();
  await expect(sheet.getByText('Reserved funds', { exact: true })).toBeVisible();
  await sheet.getByLabel('Reserve amount').fill('5000');
  await sheet.getByRole('button', { name: 'Reserve funds', exact: true }).click();
  await expect(sheet.getByText(/5,000/).first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Close loan payoff plan' }).click();

  await page.getByRole('button', { name: 'HDFC Salary Account' }).click();
  await expect(page.getByText(/reserved/)).toBeVisible();
});

test('pay down can consume funds reserved for the matching loan', async ({ page }) => {
  await prepare(page);
  await openAppDestination(page, 'Accounts');
  await page.getByRole('button', { name: /Car Loan/ }).click();
  await page.getByRole('button', { name: 'Payoff plan', exact: true }).click();
  const plan = page.getByTestId('loan-payoff-plan-sheet');
  await plan.getByLabel('Payoff target amount').fill('5000');
  await plan.getByLabel(/Me.*payoff target/i).fill('5000');
  await plan.getByRole('button', { name: 'Create payoff plan', exact: true }).click();
  await plan.getByLabel('Reserve amount').fill('5000');
  await plan.getByRole('button', { name: 'Reserve funds', exact: true }).click();
  await plan.getByRole('button', { name: 'Close loan payoff plan' }).click();
  await page.getByRole('button', { name: 'Pay down', exact: true }).click();
  const pay = page.getByTestId('pay-modal');
  await expect(pay.getByText('Use reserved payoff funds')).toBeVisible();
});
''')

print('Loan payoff reserved funds feature patch applied.')
