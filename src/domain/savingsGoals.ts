import type { Account, SavingsGoal, SavingsGoalPriority, SavingsGoalType, Transaction } from '../types';
import { isLiquidCashAccount } from './affordability';

export const SAVINGS_GOALS_KEY = 'savings_goals_v1';

const GOAL_TYPES = new Set<SavingsGoalType>(['EMERGENCY_FUND', 'PURCHASE', 'TRAVEL', 'EDUCATION', 'HOME', 'OTHER']);
const PRIORITIES = new Set<SavingsGoalPriority>(['HIGH', 'MEDIUM', 'LOW']);

function nonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizeSavingsGoal(value: Partial<SavingsGoal> & { id?: string }): SavingsGoal {
  const now = new Date().toISOString();
  const type = GOAL_TYPES.has(value.type as SavingsGoalType) ? value.type as SavingsGoalType : 'OTHER';
  const priority = PRIORITIES.has(value.priority as SavingsGoalPriority) ? value.priority as SavingsGoalPriority : 'MEDIUM';
  return {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    name: String(value.name ?? '').trim() || 'Savings goal',
    type,
    targetAmount: nonNegative(value.targetAmount),
    targetDate: typeof value.targetDate === 'string' && value.targetDate ? value.targetDate : undefined,
    monthlyContribution: nonNegative(value.monthlyContribution),
    linkedAccountId: typeof value.linkedAccountId === 'string' && value.linkedAccountId ? value.linkedAccountId : undefined,
    manualSavedAmount: nonNegative(value.manualSavedAmount),
    protectLinkedBalance: Boolean(value.protectLinkedBalance),
    priority,
    isActive: value.isActive !== false,
    createdAt: typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : now,
  };
}

export function normalizeSavingsGoals(value: unknown): SavingsGoal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object')
    .map(item => normalizeSavingsGoal(item as Partial<SavingsGoal>))
    .filter(goal => goal.targetAmount > 0);
}

export function getGoalLedgerContributions(goalId: string, transactions: Transaction[] = []): number {
  return transactions
    .filter(transaction => transaction.goalId === goalId && transaction.is_verified !== 0 && transaction.type !== 'income' && !transaction.isOpeningBalance)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
}

export function getGoalCurrentAmount(goal: SavingsGoal, accounts: Account[], transactions: Transaction[] = []): number {
  if (goal.linkedAccountId) {
    const account = accounts.find(item => item.id === goal.linkedAccountId && item.is_archived !== 1);
    if (account) return nonNegative(account.balance);
  }
  return nonNegative(goal.manualSavedAmount) + getGoalLedgerContributions(goal.id, transactions);
}

export function getGoalProgressPercent(goal: SavingsGoal, accounts: Account[], transactions: Transaction[] = []): number {
  if (goal.targetAmount <= 0) return 0;
  return Math.min(100, (getGoalCurrentAmount(goal, accounts, transactions) / goal.targetAmount) * 100);
}

export function getRequiredMonthlyContribution(goal: SavingsGoal, accounts: Account[], transactions: Transaction[] = [], asOfDate = new Date()): number {
  if (!goal.targetDate || goal.targetAmount <= 0) return 0;
  const target = new Date(`${goal.targetDate}T12:00:00`);
  if (Number.isNaN(target.getTime()) || target <= asOfDate) return Math.max(0, goal.targetAmount - getGoalCurrentAmount(goal, accounts, transactions));
  const months = Math.max(1,
    (target.getFullYear() - asOfDate.getFullYear()) * 12 +
    (target.getMonth() - asOfDate.getMonth()) +
    (target.getDate() >= asOfDate.getDate() ? 1 : 0),
  );
  return Math.max(0, goal.targetAmount - getGoalCurrentAmount(goal, accounts, transactions)) / months;
}

export function getActiveGoalMonthlyContribution(goals: SavingsGoal[]): number {
  return goals
    .filter(goal => goal.isActive)
    .reduce((sum, goal) => sum + nonNegative(goal.monthlyContribution), 0);
}

/**
 * Emergency/explicitly protected goals may reserve the current balance of a
 * linked liquid account. Accounts are de-duplicated so two goals pointing at
 * the same savings account never protect its balance twice.
 */
export function getProtectedGoalReserve(goals: SavingsGoal[], accounts: Account[]): number {
  const protectedAccountIds = new Set(
    goals
      .filter(goal => goal.isActive && goal.protectLinkedBalance && goal.linkedAccountId)
      .map(goal => goal.linkedAccountId as string),
  );
  let total = 0;
  for (const id of protectedAccountIds) {
    const account = accounts.find(item => item.id === id && item.is_archived !== 1);
    if (account && isLiquidCashAccount(account)) total += nonNegative(account.balance);
  }
  return total;
}
