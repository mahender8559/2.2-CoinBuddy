import type { Account, LoanPayoffFundMovement, LoanPayoffPlan, LoanPayoffResponsibility, SavingsGoal } from '../types';

const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/** Current reserve-position delta. CONSUME removes money from the reserve because it was actually paid. */
export function loanPayoffMovementDelta(movement: LoanPayoffFundMovement): number {
  return movement.movementType === 'RESERVE' ? money(movement.amount) : -money(movement.amount);
}

export function getActiveLoanPayoffPlan(plans: LoanPayoffPlan[], liabilityAccountId: string): LoanPayoffPlan | undefined {
  return plans.find(plan => plan.liabilityAccountId === liabilityAccountId && plan.status === 'ACTIVE');
}

/** Money still sitting aside and available to be used for this plan. */
export function getLoanPayoffPlanReservedAmount(planId: string, movements: LoanPayoffFundMovement[]): number {
  return money(movements.filter(item => item.planId === planId).reduce((sum, item) => sum + loanPayoffMovementDelta(item), 0));
}

export function getLoanPayoffPersonReservedAmount(planId: string, personId: string, movements: LoanPayoffFundMovement[]): number {
  return money(movements.filter(item => item.planId === planId && item.personId === personId).reduce((sum, item) => sum + loanPayoffMovementDelta(item), 0));
}

/** Money already consumed by a real lender payment. It continues to count toward the payoff objective. */
export function getLoanPayoffConsumedAmount(planId: string, movements: LoanPayoffFundMovement[]): number {
  return money(movements.filter(item => item.planId === planId && item.movementType === 'CONSUME').reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0));
}

export function getLoanPayoffPersonConsumedAmount(planId: string, personId: string, movements: LoanPayoffFundMovement[]): number {
  return money(movements.filter(item => item.planId === planId && item.personId === personId && item.movementType === 'CONSUME').reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0));
}

/** Current reserve plus money already paid is the contributor's fulfilled portion of the target. */
export function getLoanPayoffPersonFundedAmount(planId: string, personId: string, movements: LoanPayoffFundMovement[]): number {
  return money(Math.max(0, getLoanPayoffPersonReservedAmount(planId, personId, movements)) + getLoanPayoffPersonConsumedAmount(planId, personId, movements));
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
  const consumed = Math.max(0, getLoanPayoffConsumedAmount(plan.id, movements));
  const fundedAmount = money(reserved + consumed);
  const target = money(plan.targetAmount);
  const remaining = Math.max(0, money(target - fundedAmount));
  const progress = target > 0 ? Math.min(100, Math.max(0, fundedAmount / target * 100)) : 0;
  return {
    target,
    reserved,
    consumed,
    fundedAmount,
    remaining,
    progress,
    funded: remaining <= 0.009,
    contributorTargetTotal: money(responsibilities.filter(row => row.planId === plan.id).reduce((sum, row) => sum + row.targetAmount, 0)),
  };
}

export function getLoanPayoffRequiredMonthlyContribution(plan: LoanPayoffPlan, responsibilities: LoanPayoffResponsibility[], movements: LoanPayoffFundMovement[], asOf = new Date()): number {
  const { remaining } = getLoanPayoffFundingSummary(plan, responsibilities, movements);
  if (remaining <= 0.009) return 0;
  const target = new Date(`${plan.targetDate}T12:00:00`);
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 12, 0, 0);
  if (Number.isNaN(target.getTime()) || target <= today) return remaining;
  const months = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)));
  return money(remaining / months);
}

/**
 * Planning adapter only: active payoff plans are exposed to existing forecasting
 * as ephemeral savings commitments. Nothing is stored as a fake SavingsGoal.
 */
export function loanPayoffPlansToPlanningGoals(plans: LoanPayoffPlan[], responsibilities: LoanPayoffResponsibility[], movements: LoanPayoffFundMovement[], asOf = new Date()): SavingsGoal[] {
  return plans.filter(plan => plan.status === 'ACTIVE').map(plan => {
    const summary = getLoanPayoffFundingSummary(plan, responsibilities, movements);
    return {
      id: `loan-payoff:${plan.id}`,
      name: 'Loan payoff reserve',
      type: 'OTHER',
      targetAmount: plan.targetAmount,
      targetDate: plan.targetDate,
      monthlyContribution: getLoanPayoffRequiredMonthlyContribution(plan, responsibilities, movements, asOf),
      manualSavedAmount: summary.fundedAmount,
      protectLinkedBalance: false,
      priority: 'HIGH',
      isActive: summary.remaining > 0.009,
      createdAt: plan.createdAt,
    };
  });
}
