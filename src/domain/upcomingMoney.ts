import type { Account, CreditCardInfo, RecurringRule, SavingsGoal, Transaction } from '../types';
import { isLiquidCashAccount } from './affordability';
import { advanceRecurringDate } from './recurring';

export type UpcomingMoneyKind = 'INCOME' | 'OBLIGATION' | 'SAVINGS' | 'TRANSFER';
export type UpcomingMoneyStatus = 'SCHEDULED' | 'NEEDS_CONFIRMATION';

export interface UpcomingMoneyItem {
  id: string;
  date: string;
  title: string;
  amount: number;
  kind: UpcomingMoneyKind;
  status: UpcomingMoneyStatus;
  source: 'RECURRING' | 'PENDING' | 'CREDIT_CARD' | 'LOAN' | 'GOAL';
  sourceId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  goalId?: string;
}

export interface UpcomingMoneyProjection {
  items: UpcomingMoneyItem[];
  warnings: string[];
  totals: {
    openingLiquidCash: number;
    expectedIncome: number;
    obligations: number;
    savings: number;
    transfers: number;
    projectedFreeCash: number;
  };
}

export interface UpcomingMoneyInput {
  asOfDate: string;
  startDate: string;
  endDate: string;
  accounts: Account[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  creditCards: CreditCardInfo[];
  savingsGoals: SavingsGoal[];
}

function key(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function inRange(value: string, start: string, end: string): boolean {
  const date = key(value);
  return Boolean(date && date >= start && date <= end);
}

function accountGroup(account?: Account): string {
  return String(account?.group ?? '').trim().toLowerCase();
}

function classify(type: 'income' | 'expense' | 'transfer' | 'INCOME' | 'EXPENSE' | 'TRANSFER', toAccount: Account | undefined, goalId?: string): UpcomingMoneyKind {
  const normalized = String(type).toUpperCase();
  if (normalized === 'INCOME') return 'INCOME';
  if (goalId) return 'SAVINGS';
  if (normalized === 'EXPENSE') return 'OBLIGATION';
  if (toAccount?.type === 'liability') return 'OBLIGATION';
  if (accountGroup(toAccount) === 'investment') return 'SAVINGS';
  return 'TRANSFER';
}

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.abs(parsed)) : 0;
}

function uniqueWarnings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildUpcomingMoneyProjection(input: UpcomingMoneyInput): UpcomingMoneyProjection {
  const accountMap = new Map(input.accounts.map(account => [account.id, account]));
  const items: UpcomingMoneyItem[] = [];
  const warnings: string[] = [];
  const pendingIdentities = new Set<string>();

  for (const transaction of input.transactions) {
    if (transaction.is_verified !== 0 || transaction.isOpeningBalance) continue;
    const date = transaction.dueDate ?? key(transaction.date);
    if (!inRange(date, input.startDate, input.endDate)) continue;
    if (transaction.recurringRuleId && transaction.dueDate) pendingIdentities.add(`${transaction.recurringRuleId}:${transaction.dueDate}`);
    const to = transaction.toAccountId ? accountMap.get(transaction.toAccountId) : undefined;
    const sourceId = transaction.fromAccountId ?? (transaction.type === 'expense' ? transaction.account : undefined);
    const destinationId = transaction.toAccountId ?? (transaction.type === 'income' ? transaction.account : undefined);
    items.push({
      id: `pending:${transaction.id}`,
      date,
      title: transaction.title,
      amount: amount(transaction.amount),
      kind: classify(transaction.type, to, transaction.goalId),
      status: 'NEEDS_CONFIRMATION',
      source: 'PENDING',
      sourceId: transaction.id,
      fromAccountId: sourceId,
      toAccountId: destinationId,
      goalId: transaction.goalId,
    });
  }

  for (const rule of input.recurringRules.filter(rule => rule.isActive)) {
    let due = rule.nextDueDate;
    const anchor = rule.anchorDay ?? Number(rule.nextDueDate.slice(8, 10));
    let guard = 0;
    while (due < input.startDate && guard++ < 60) due = advanceRecurringDate(due, rule.frequency, anchor);
    while (due <= input.endDate && guard++ < 120) {
      const identity = `${rule.id}:${due}`;
      if (!pendingIdentities.has(identity)) {
        const to = rule.toAccountId ? accountMap.get(rule.toAccountId) : undefined;
        items.push({
          id: `rule:${rule.id}:${due}`,
          date: due,
          title: rule.title,
          amount: amount(rule.amount),
          kind: classify(rule.transactionType, to, rule.goalId),
          status: 'SCHEDULED',
          source: 'RECURRING',
          sourceId: rule.id,
          fromAccountId: rule.fromAccountId ?? (rule.transactionType === 'EXPENSE' ? rule.account : undefined),
          toAccountId: rule.toAccountId ?? (rule.transactionType === 'INCOME' ? rule.account : undefined),
          goalId: rule.goalId,
        });
      }
      due = advanceRecurringDate(due, rule.frequency, anchor);
    }
  }

  for (const card of input.creditCards) {
    if (!card.dueDate || !inRange(card.dueDate, input.startDate, input.endDate) || amount(card.dueAmount) <= 0) continue;
    const alreadyCovered = items.some(item => item.kind === 'OBLIGATION' && item.toAccountId === card.id);
    if (!alreadyCovered) items.push({
      id: `card:${card.id}:${card.dueDate}`,
      date: key(card.dueDate),
      title: `${card.name} due`,
      amount: amount(card.dueAmount),
      kind: 'OBLIGATION', status: 'SCHEDULED', source: 'CREDIT_CARD', sourceId: card.id, toAccountId: card.id,
    });
  }

  for (const account of input.accounts) {
    if (account.type !== 'liability' || account.is_archived === 1 || !account.nextEMIDate || !inRange(account.nextEMIDate, input.startDate, input.endDate) || amount(account.monthlyEMI) <= 0) continue;
    const alreadyCovered = items.some(item => item.kind === 'OBLIGATION' && item.toAccountId === account.id);
    if (!alreadyCovered) items.push({
      id: `loan:${account.id}:${account.nextEMIDate}`,
      date: key(account.nextEMIDate), title: `${account.name} EMI`, amount: amount(account.monthlyEMI),
      kind: 'OBLIGATION', status: 'SCHEDULED', source: 'LOAN', sourceId: account.id, toAccountId: account.id,
    });
  }

  for (const goal of input.savingsGoals.filter(goal => goal.isActive && goal.monthlyContribution > 0)) {
    const explicitlyScheduled = items.filter(item => item.goalId === goal.id && item.kind === 'SAVINGS').reduce((sum, item) => sum + item.amount, 0);
    const uncovered = Math.max(0, amount(goal.monthlyContribution) - explicitlyScheduled);
    if (uncovered > 0) items.push({
      id: `goal:${goal.id}:${input.startDate}`,
      date: input.startDate,
      title: `${goal.name} contribution`,
      amount: uncovered,
      kind: 'SAVINGS', status: 'SCHEDULED', source: 'GOAL', sourceId: goal.id, goalId: goal.id,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  for (const item of items) {
    if (item.fromAccountId) {
      const source = accountMap.get(item.fromAccountId);
      if (!source) warnings.push(`${item.title} points to a missing funding account.`);
      else if (source.is_archived === 1) warnings.push(`${item.title} uses archived funding account ${source.name}.`);
      else if ((item.kind === 'OBLIGATION' || item.kind === 'SAVINGS') && source.type === 'asset' && item.amount > Math.max(0, Number(source.balance) || 0)) warnings.push(`${source.name} currently has less than ${item.title} requires.`);
    }
    if (item.toAccountId) {
      const destination = accountMap.get(item.toAccountId);
      if (!destination) warnings.push(`${item.title} points to a missing destination account.`);
      else if (destination.is_archived === 1) warnings.push(`${item.title} uses archived destination account ${destination.name}.`);
    }
  }

  const openingLiquidCash = input.accounts.filter(account => account.type === 'asset' && account.is_archived !== 1 && isLiquidCashAccount(account)).reduce((sum, account) => sum + Math.max(0, Number(account.balance) || 0), 0);
  const expectedIncome = items.filter(item => item.kind === 'INCOME').reduce((sum, item) => sum + item.amount, 0);
  const obligations = items.filter(item => item.kind === 'OBLIGATION').reduce((sum, item) => sum + item.amount, 0);
  const savings = items.filter(item => item.kind === 'SAVINGS').reduce((sum, item) => sum + item.amount, 0);
  const transfers = items.filter(item => item.kind === 'TRANSFER').reduce((sum, item) => sum + item.amount, 0);
  const projectedFreeCash = openingLiquidCash + expectedIncome - obligations - savings;

  return { items, warnings: uniqueWarnings(warnings), totals: { openingLiquidCash, expectedIncome, obligations, savings, transfers, projectedFreeCash } };
}
