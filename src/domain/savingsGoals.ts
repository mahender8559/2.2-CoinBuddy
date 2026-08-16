import type { Account, SavingsGoal, SavingsGoalPriority, SavingsGoalType, Transaction } from '../types';
import { isLiquidCashAccount } from './affordability';

export const SAVINGS_GOALS_KEY = 'savings_goals_v1';

const GOAL_TYPES = new Set<SavingsGoalType>(['EMERGENCY_FUND', 'PURCHASE', 'TRAVEL', 'EDUCATION', 'HOME', 'OTHER']);
const PRIORITIES = new Set<SavingsGoalPriority>(['HIGH', 'MEDIUM', 'LOW']);

function nonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Returns every account linked to a Goal. The legacy single linkedAccountId is
 * folded in automatically so old backups migrate without a separate database
 * migration.
 */
export function getGoalLinkedAccountIds(goal: Pick<SavingsGoal, 'linkedAccountIds' | 'linkedAccountId'> | { linkedAccountIds?: unknown; linkedAccountId?: unknown }): string[] {
  const multi = Array.isArray(goal.linkedAccountIds) ? goal.linkedAccountIds : [];
  return uniqueStrings([...multi, goal.linkedAccountId]);
}

export function normalizeSavingsGoal(value: Partial<SavingsGoal> & { id?: string }): SavingsGoal {
  const now = new Date().toISOString();
  const type = GOAL_TYPES.has(value.type as SavingsGoalType) ? value.type as SavingsGoalType : 'OTHER';
  const priority = PRIORITIES.has(value.priority as SavingsGoalPriority) ? value.priority as SavingsGoalPriority : 'MEDIUM';
  const linkedAccountIds = getGoalLinkedAccountIds(value);
  return {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    name: String(value.name ?? '').trim() || 'Savings goal',
    type,
    targetAmount: nonNegative(value.targetAmount),
    targetDate: typeof value.targetDate === 'string' && value.targetDate ? value.targetDate : undefined,
    monthlyContribution: nonNegative(value.monthlyContribution),
    linkedAccountIds,
    // Keep the first account mirrored for old backups/integrity paths. New code
    // must use linkedAccountIds/getGoalLinkedAccountIds.
    linkedAccountId: linkedAccountIds[0],
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

export function getGoalLinkedAccounts(goal: SavingsGoal, accounts: Account[]): Account[] {
  const linkedIds = new Set(getGoalLinkedAccountIds(goal));
  if (!linkedIds.size) return [];
  return accounts.filter(account => linkedIds.has(account.id) && account.type === 'asset' && account.is_archived !== 1);
}

export function getGoalCurrentAmount(goal: SavingsGoal, accounts: Account[], transactions: Transaction[] = []): number {
  const linkedAccounts = getGoalLinkedAccounts(goal, accounts);
  if (linkedAccounts.length) {
    return linkedAccounts.reduce((sum, account) => sum + nonNegative(account.balance), 0);
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
 * Emergency/explicitly protected goals may reserve current balances from any
 * linked liquid accounts. Account ids are de-duplicated across Goals so the
 * same savings account can never reduce affordability twice.
 */
export function getProtectedGoalReserve(goals: SavingsGoal[], accounts: Account[]): number {
  const protectedAccountIds = new Set<string>();
  for (const goal of goals) {
    if (!goal.isActive || !goal.protectLinkedBalance) continue;
    for (const id of getGoalLinkedAccountIds(goal)) protectedAccountIds.add(id);
  }

  let total = 0;
  for (const id of protectedAccountIds) {
    const account = accounts.find(item => item.id === id && item.type === 'asset' && item.is_archived !== 1);
    if (account && isLiquidCashAccount(account)) total += nonNegative(account.balance);
  }
  return total;
}
