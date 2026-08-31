import type { SqlJsDatabaseDriver } from './dbClient';
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

async function consumedAmount(driver: SqlJsDatabaseDriver, whereSql: string, params: unknown[]): Promise<number> {
  const rows = await driver.query(`SELECT COALESCE(SUM(amount), 0) AS consumed FROM loan_payoff_fund_movements WHERE movement_type = 'CONSUME' AND ${whereSql}`, params as any[]);
  return Math.max(0, Math.round(Number(rows[0]?.consumed ?? 0) * 100) / 100);
}

async function fundedAmount(driver: SqlJsDatabaseDriver, whereSql: string, params: unknown[]): Promise<number> {
  const reserved = await signedReserved(driver, whereSql, params);
  const consumed = await consumedAmount(driver, whereSql, params);
  return Math.round((reserved + consumed) * 100) / 100;
}

async function completePlanIfTargetPaid(driver: SqlJsDatabaseDriver, plan: LoanPayoffPlan): Promise<void> {
  const consumed = await consumedAmount(driver, `plan_id = ?`, [plan.id]);
  if (consumed + 0.009 >= plan.targetAmount) {
    await driver.execute(`UPDATE loan_payoff_plans SET status = 'COMPLETED' WHERE id = ? AND status = 'ACTIVE'`, [plan.id]);
  }
}

export async function saveLoanPayoffPlan(
  driver: SqlJsDatabaseDriver,
  input: { id?: string; liabilityAccountId: string; targetAmount: number; targetDate: string; payoffType: LoanPayoffType; responsibilities: Array<{ personId: string; targetAmount: number }> },
): Promise<LoanPayoffPlan> {
  const targetAmount = money(input.targetAmount, 'Payoff target');
  const targetMs = new Date(`${input.targetDate}T12:00:00`).getTime();
  if (!Number.isFinite(targetMs)) throw new Error('Target date is invalid.');
  const todayKey = new Date().toISOString().slice(0, 10);
  if (input.targetDate < todayKey) throw new Error('Target date cannot be in the past.');
  const liabilityRows = await driver.query(`SELECT id, name, type, subtype, cached_balance FROM account_balances_view WHERE id = ? AND is_archived = 0`, [input.liabilityAccountId]);
  const liability = liabilityRows[0];
  if (!liability || String(liability.type).toUpperCase() !== 'LIABILITY') throw new Error('Choose an active loan liability.');
  if (String(liability.subtype ?? '').trim().toLowerCase() === 'credit card') throw new Error('Loan payoff plans are for installment loans, not revolving credit cards.');
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
    const funded = await fundedAmount(driver, `plan_id = ?`, [existing.id]);
    if (targetAmount + 0.009 < funded) throw new Error(`The target cannot be lowered below ${funded.toFixed(2)}, which is already reserved or paid toward this plan.`);
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
  const personFunded = await fundedAmount(driver, `plan_id = ? AND person_id = ?`, [plan.id, input.personId]);
  if (personFunded + amount > Number(responsibility[0].target_amount) + 0.009) throw new Error('This reserve would exceed the contributor target after including amounts already paid.');
  const planFunded = await fundedAmount(driver, `plan_id = ?`, [plan.id]);
  if (planFunded + amount > plan.targetAmount + 0.009) throw new Error('This reserve would exceed the remaining payoff target.');

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
  await completePlanIfTargetPaid(driver, plan);
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
  await completePlanIfTargetPaid(driver, plan);
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
