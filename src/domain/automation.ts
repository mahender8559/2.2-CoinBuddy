import type { Account, CreditCardInfo, RecurrenceFrequency, RecurringRule, SavingsGoal, Transaction } from '../types';
import { isLiquidCashAccount } from './affordability';

export type ManagedAutomationKind = 'LOAN_EMI' | 'CREDIT_CARD_STATEMENT' | 'GOAL_CONTRIBUTION';

export interface ManagedAutomationCandidate {
  key: string;
  kind: ManagedAutomationKind;
  sourceId: string;
  title: string;
  amount: number;
  nextDueDate: string;
  frequency: RecurrenceFrequency;
  transactionType: 'TRANSFER' | 'EXPENSE';
  destinationAccountId?: string;
  goalId?: string;
  description: string;
}

export interface TransactionMetadataSuggestion {
  matchCount: number;
  category?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  eventId?: string;
  explanation: string;
}

export interface PendingConfirmationSummary {
  pendingCount: number;
  actionableCount: number;
  overdueCount: number;
  dueTodayCount: number;
  oldestDueDate?: string;
}

export type ManagedRuleSyncPlan =
  | { action: 'NONE' }
  | { action: 'DELETE'; reason: string }
  | { action: 'UPDATE'; rule: RecurringRule; reason: string };

export interface AutomationState {
  accounts: Account[];
  creditCards: CreditCardInfo[];
  savingsGoals: SavingsGoal[];
  recurringRules: RecurringRule[];
  asOfDate?: string;
}

const MANAGED_PREFIX = 'coinbuddy-managed:v1';
const KINDS = new Set<ManagedAutomationKind>(['LOAN_EMI', 'CREDIT_CARD_STATEMENT', 'GOAL_CONTRIBUTION']);

function positive(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function dateKey(value: Date = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function validDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime());
}

export function managedAutomationKey(kind: ManagedAutomationKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export function managedAutomationMarker(kind: ManagedAutomationKind, sourceId: string): string {
  return `[${MANAGED_PREFIX}:${kind}:${encodeURIComponent(sourceId)}]`;
}

export function parseManagedAutomationMarker(notes?: string): { kind: ManagedAutomationKind; sourceId: string } | null {
  if (!notes) return null;
  const match = notes.match(/\[coinbuddy-managed:v1:(LOAN_EMI|CREDIT_CARD_STATEMENT|GOAL_CONTRIBUTION):([^\]]+)\]/);
  if (!match || !KINDS.has(match[1] as ManagedAutomationKind)) return null;
  try {
    return { kind: match[1] as ManagedAutomationKind, sourceId: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

export function isManagedAutomationRule(rule: RecurringRule): boolean {
  return Boolean(parseManagedAutomationMarker(rule.notes));
}

function isCreditCardAccount(account: Account): boolean {
  return String(account.group ?? '').trim().toLowerCase() === 'credit card';
}

function hasSemanticSchedule(kind: ManagedAutomationKind, sourceId: string, rules: RecurringRule[]): boolean {
  return rules.some(rule => {
    const marker = parseManagedAutomationMarker(rule.notes);
    if (marker?.kind === kind && marker.sourceId === sourceId) return true;
    if (kind === 'GOAL_CONTRIBUTION') return rule.goalId === sourceId;
    return rule.transactionType === 'TRANSFER' && rule.toAccountId === sourceId;
  });
}

export function buildAutomationCandidates(state: AutomationState): ManagedAutomationCandidate[] {
  const candidates: ManagedAutomationCandidate[] = [];
  const asOfDate = validDateKey(state.asOfDate) ? state.asOfDate : dateKey();

  for (const account of state.accounts) {
    if (
      account.type !== 'liability' ||
      account.is_archived === 1 ||
      isCreditCardAccount(account) ||
      positive(account.balance) <= 0 ||
      positive(account.monthlyEMI) <= 0 ||
      !validDateKey(account.nextEMIDate) ||
      hasSemanticSchedule('LOAN_EMI', account.id, state.recurringRules)
    ) continue;

    candidates.push({
      key: managedAutomationKey('LOAN_EMI', account.id),
      kind: 'LOAN_EMI',
      sourceId: account.id,
      title: `${account.name} EMI`,
      amount: positive(account.monthlyEMI),
      nextDueDate: account.nextEMIDate,
      frequency: account.paymentFrequency ?? 'MONTHLY',
      transactionType: 'TRANSFER',
      destinationAccountId: account.id,
      description: 'Schedules the full lender EMI. Shared responsibility stays separate from loan amortization.',
    });
  }

  for (const card of state.creditCards) {
    const backingAccount = state.accounts.find(account => account.id === card.id && account.type === 'liability' && account.is_archived !== 1);
    if (
      !backingAccount ||
      positive(card.dueAmount) <= 0 ||
      !validDateKey(card.dueDate) ||
      hasSemanticSchedule('CREDIT_CARD_STATEMENT', card.id, state.recurringRules)
    ) continue;

    candidates.push({
      key: managedAutomationKey('CREDIT_CARD_STATEMENT', card.id),
      kind: 'CREDIT_CARD_STATEMENT',
      sourceId: card.id,
      title: `${card.name} statement payment`,
      amount: positive(card.dueAmount),
      nextDueDate: card.dueDate,
      frequency: 'MONTHLY',
      transactionType: 'TRANSFER',
      destinationAccountId: card.id,
      description: 'Tracks the current statement amount and pauses automatically when nothing is due.',
    });
  }

  for (const goal of state.savingsGoals) {
    if (
      !goal.isActive ||
      positive(goal.monthlyContribution) <= 0 ||
      hasSemanticSchedule('GOAL_CONTRIBUTION', goal.id, state.recurringRules)
    ) continue;

    const linked = goal.linkedAccountId
      ? state.accounts.find(account => account.id === goal.linkedAccountId && account.type === 'asset' && account.is_archived !== 1)
      : undefined;
    if (goal.linkedAccountId && !linked) continue;

    candidates.push({
      key: managedAutomationKey('GOAL_CONTRIBUTION', goal.id),
      kind: 'GOAL_CONTRIBUTION',
      sourceId: goal.id,
      title: `${goal.name} contribution`,
      amount: positive(goal.monthlyContribution),
      nextDueDate: asOfDate,
      frequency: 'MONTHLY',
      transactionType: linked ? 'TRANSFER' : 'EXPENSE',
      destinationAccountId: linked?.id,
      goalId: goal.id,
      description: linked
        ? `Moves confirmed contributions into ${linked.name}.`
        : 'Records confirmed Goal progress without creating a fake Goal account.',
    });
  }

  return candidates;
}

export function buildManagedRecurringTransaction(
  candidate: ManagedAutomationCandidate,
  sourceAccountId: string,
  accounts: Account[],
): Omit<Transaction, 'id'> {
  const source = accounts.find(account => account.id === sourceAccountId && account.type === 'asset' && account.is_archived !== 1);
  if (!source || !isLiquidCashAccount(source)) throw new Error('Choose an active cash or bank account to fund this automation.');
  if (positive(candidate.amount) <= 0 || !validDateKey(candidate.nextDueDate)) throw new Error('This automation is missing a valid amount or due date.');

  const marker = managedAutomationMarker(candidate.kind, candidate.sourceId);
  const base = {
    title: candidate.title,
    subtitle: 'Managed automation · confirmation required',
    amount: candidate.amount,
    date: new Date(`${candidate.nextDueDate}T12:00:00`).toISOString(),
    isRecurring: true,
    recurrenceFrequency: candidate.frequency,
    is_verified: 0,
    goalId: candidate.goalId,
    notes: `${marker}\nCreated by CoinBuddy Automation Center. Generated occurrences stay pending until you confirm them.`,
  } as const;

  if (candidate.transactionType === 'TRANSFER') {
    const destination = accounts.find(account => account.id === candidate.destinationAccountId && account.is_archived !== 1);
    if (!destination) throw new Error('The automation destination account is no longer available.');
    if (destination.id === source.id) throw new Error('Funding and destination accounts must be different.');
    return {
      ...base,
      category: candidate.kind === 'GOAL_CONTRIBUTION' ? '#savings' : '#debtpayment',
      icon: candidate.kind === 'CREDIT_CARD_STATEMENT' ? 'CreditCard' : candidate.kind === 'GOAL_CONTRIBUTION' ? 'Target' : 'Landmark',
      type: 'transfer',
      fromAccountId: source.id,
      toAccountId: destination.id,
      transaction_type: 'TRANSFER',
    };
  }

  if (candidate.kind !== 'GOAL_CONTRIBUTION' || !candidate.goalId) throw new Error('Only an unlinked Goal may use a managed contribution entry.');
  return {
    ...base,
    category: '#savings',
    icon: 'Target',
    type: 'expense',
    account: source.id,
    fromAccountId: source.id,
    transaction_type: 'EXPENSE',
  };
}

function paused(rule: RecurringRule, reason: string): ManagedRuleSyncPlan {
  if (!rule.isActive) return { action: 'NONE' };
  return { action: 'UPDATE', rule: { ...rule, isActive: false }, reason };
}

function scheduleDateForSync(current: string, configured: string, asOfDate: string): string {
  if (!validDateKey(current)) return configured;
  if (!validDateKey(configured)) return current;
  // A current/future configured date is authoritative, including edits that move
  // the next payment earlier. Past metadata is treated as stale so it cannot
  // rewind a rule after an occurrence has already been generated and advanced.
  return configured >= asOfDate ? configured : current;
}

function sameRule(left: RecurringRule, right: RecurringRule): boolean {
  return left.title === right.title &&
    Math.abs(left.amount - right.amount) < 0.005 &&
    left.transactionType === right.transactionType &&
    (left.account ?? '') === (right.account ?? '') &&
    (left.fromAccountId ?? '') === (right.fromAccountId ?? '') &&
    (left.toAccountId ?? '') === (right.toAccountId ?? '') &&
    (left.category ?? '') === (right.category ?? '') &&
    (left.frequency ?? 'MONTHLY') === (right.frequency ?? 'MONTHLY') &&
    left.nextDueDate === right.nextDueDate &&
    left.isActive === right.isActive &&
    (left.goalId ?? '') === (right.goalId ?? '');
}

function updateIfChanged(rule: RecurringRule, next: RecurringRule, reason: string): ManagedRuleSyncPlan {
  return sameRule(rule, next) ? { action: 'NONE' } : { action: 'UPDATE', rule: next, reason };
}

export function getManagedRuleSyncPlan(rule: RecurringRule, state: Omit<AutomationState, 'recurringRules'>): ManagedRuleSyncPlan {
  const marker = parseManagedAutomationMarker(rule.notes);
  if (!marker) return { action: 'NONE' };
  const asOfDate = validDateKey(state.asOfDate) ? state.asOfDate : dateKey();

  const funding = rule.fromAccountId
    ? state.accounts.find(account => account.id === rule.fromAccountId && account.type === 'asset' && account.is_archived !== 1)
    : undefined;
  if (!funding || !isLiquidCashAccount(funding)) return paused(rule, 'Funding account is unavailable.');

  if (marker.kind === 'LOAN_EMI') {
    const loan = state.accounts.find(account => account.id === marker.sourceId);
    if (!loan) return { action: 'DELETE', reason: 'Loan no longer exists.' };
    if (loan.type !== 'liability' || loan.is_archived === 1 || positive(loan.balance) <= 0 || positive(loan.monthlyEMI) <= 0 || !validDateKey(loan.nextEMIDate)) {
      return paused(rule, 'Loan is closed or no longer has an active EMI schedule.');
    }
    if (funding.id === loan.id) return paused(rule, 'Funding account cannot be the loan itself.');
    const next: RecurringRule = {
      ...rule,
      title: `${loan.name} EMI`,
      amount: positive(loan.monthlyEMI),
      transactionType: 'TRANSFER',
      account: undefined,
      fromAccountId: funding.id,
      toAccountId: loan.id,
      category: '#debtpayment',
      frequency: loan.paymentFrequency ?? 'MONTHLY',
      nextDueDate: scheduleDateForSync(rule.nextDueDate, loan.nextEMIDate, asOfDate),
      isActive: true,
      goalId: undefined,
    };
    return updateIfChanged(rule, next, 'Loan terms changed.');
  }

  if (marker.kind === 'CREDIT_CARD_STATEMENT') {
    const card = state.creditCards.find(item => item.id === marker.sourceId);
    const backing = state.accounts.find(account => account.id === marker.sourceId && account.type === 'liability');
    if (!card || !backing) return { action: 'DELETE', reason: 'Credit card no longer exists.' };
    if (backing.is_archived === 1 || positive(card.dueAmount) <= 0 || !validDateKey(card.dueDate)) return paused(rule, 'No statement amount is currently due.');
    const next: RecurringRule = {
      ...rule,
      title: `${card.name} statement payment`,
      amount: positive(card.dueAmount),
      transactionType: 'TRANSFER',
      account: undefined,
      fromAccountId: funding.id,
      toAccountId: card.id,
      category: '#debtpayment',
      frequency: 'MONTHLY',
      nextDueDate: scheduleDateForSync(rule.nextDueDate, card.dueDate, asOfDate),
      isActive: true,
      goalId: undefined,
    };
    return updateIfChanged(rule, next, 'Credit-card statement changed.');
  }

  const goal = state.savingsGoals.find(item => item.id === marker.sourceId);
  if (!goal) return { action: 'DELETE', reason: 'Goal no longer exists.' };
  if (!goal.isActive || positive(goal.monthlyContribution) <= 0) return paused(rule, 'Goal contribution is paused.');

  if (goal.linkedAccountId) {
    const destination = state.accounts.find(account => account.id === goal.linkedAccountId && account.type === 'asset' && account.is_archived !== 1);
    if (!destination || destination.id === funding.id) return paused(rule, 'Goal destination is unavailable or matches the funding account.');
    const next: RecurringRule = {
      ...rule,
      title: `${goal.name} contribution`,
      amount: positive(goal.monthlyContribution),
      transactionType: 'TRANSFER',
      account: undefined,
      fromAccountId: funding.id,
      toAccountId: destination.id,
      category: '#savings',
      frequency: 'MONTHLY',
      isActive: true,
      goalId: goal.id,
    };
    return updateIfChanged(rule, next, 'Goal settings changed.');
  }

  const next: RecurringRule = {
    ...rule,
    title: `${goal.name} contribution`,
    amount: positive(goal.monthlyContribution),
    transactionType: 'EXPENSE',
    account: funding.id,
    fromAccountId: funding.id,
    toAccountId: undefined,
    category: '#savings',
    frequency: 'MONTHLY',
    isActive: true,
    goalId: goal.id,
  };
  return updateIfChanged(rule, next, 'Goal settings changed.');
}

export function normalizeAutomationTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function mode(values: Array<string | undefined>): string | undefined {
  const counts = new Map<string, { count: number; first: number }>();
  values.forEach((value, index) => {
    if (!value) return;
    const current = counts.get(value);
    counts.set(value, current ? { ...current, count: current.count + 1 } : { count: 1, first: index });
  });
  return [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)[0]?.[0];
}

export function buildTransactionMetadataSuggestion(input: {
  title: string;
  type: Transaction['type'];
  transactions: Transaction[];
}): TransactionMetadataSuggestion | null {
  const normalized = normalizeAutomationTitle(input.title);
  if (normalized.length < 2) return null;

  const matches = input.transactions
    .filter(transaction =>
      transaction.is_verified !== 0 &&
      !transaction.isOpeningBalance &&
      transaction.type === input.type &&
      normalizeAutomationTitle(transaction.title) === normalized,
    )
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  if (!matches.length) return null;

  const category = mode(matches.map(transaction => transaction.category));
  const accountId = mode(matches.map(transaction =>
    transaction.account ?? (transaction.type === 'expense' ? transaction.fromAccountId : transaction.type === 'income' ? transaction.toAccountId : undefined),
  ));
  const fromAccountId = mode(matches.map(transaction => transaction.fromAccountId));
  const toAccountId = mode(matches.map(transaction => transaction.toAccountId));
  const eventId = mode(matches.map(transaction => transaction.eventId));

  return {
    matchCount: matches.length,
    category,
    accountId,
    fromAccountId,
    toAccountId,
    eventId,
    explanation: `Based on ${matches.length} completed ${matches.length === 1 ? 'transaction' : 'transactions'} with the same title. Nothing changes until you apply it.`,
  };
}

export function buildPendingConfirmationSummary(transactions: Transaction[], asOfDate = dateKey()): PendingConfirmationSummary {
  const pending = transactions.filter(transaction =>
    transaction.is_verified === 0 && Boolean(transaction.recurringRuleId) && validDateKey(transaction.dueDate),
  );
  const actionable = pending.filter(transaction => (transaction.dueDate as string) <= asOfDate);
  const overdue = actionable.filter(transaction => (transaction.dueDate as string) < asOfDate);
  const dueToday = actionable.filter(transaction => transaction.dueDate === asOfDate);
  const oldestDueDate = actionable.map(transaction => transaction.dueDate as string).sort()[0];
  return {
    pendingCount: pending.length,
    actionableCount: actionable.length,
    overdueCount: overdue.length,
    dueTodayCount: dueToday.length,
    oldestDueDate,
  };
}
