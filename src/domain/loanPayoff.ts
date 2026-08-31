import type { Account, LoanPayoffFundMovement, LoanPayoffPlan, LoanPayoffResponsibility } from '../types';

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
