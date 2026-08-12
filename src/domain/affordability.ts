import type {
  Account,
  AffordabilityClass,
  Category,
  CreditCardInfo,
  RecurringRule,
  Transaction,
} from '../types';
import { advanceRecurringDate } from './recurring';
import { normalizeAffordabilityClass } from './categoryAffordability';

export type AffordabilityStatus = 'SAFE' | 'RISKY' | 'NOT_AFFORDABLE';

export interface AffordabilityProjectionSettings {
  /** Savings amount to protect over this projection horizon. */
  plannedSavingsTarget: number;
  /** Buffer supplied by the historical/automatic estimator (Phase 5) or user override. */
  contingencyBuffer: number;
  /** Liquid cash the user does not want the planner to consume. */
  protectedCashReserve: number;
}

export interface AffordabilityInput {
  /** Date represented by the current account-balance snapshot (YYYY-MM-DD). */
  asOfDate: string;
  /** Inclusive final date for the purchase projection (YYYY-MM-DD). */
  endDate: string;
  accounts: Account[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  categories: Category[];
  creditCards?: CreditCardInfo[];
  settings: AffordabilityProjectionSettings;
  purchaseAmount: number;
}

export interface AffordabilityResult {
  status: AffordabilityStatus;
  purchaseAmount: number;
  openingCash: number;
  expectedIncome: number;
  otherCashInflows: number;
  expectedExpenses: number;
  scheduledSavings: number;
  plannedSavings: number;
  contingencyBuffer: number;
  protectedCashReserve: number;
  projectedCashBeforeSafety: number;
  safePurchaseCapacity: number;
  riskyPurchaseCapacity: number;
  remainingCapacity: number;
  contingencyUsedByPurchase: number;
  remainingContingency: number;
  protectedPlanShortfall: number;
  expensesByClass: Record<AffordabilityClass, number>;
  projectedOccurrenceCount: number;
  reasons: string[];
}

const LIQUID_ACCOUNT_GROUPS = new Set([
  'bank',
  'bank account',
  'cash',
  'wallet',
  'savings account',
  'current account',
  'checking account',
]);

const ZERO_EXPENSES_BY_CLASS = (): Record<AffordabilityClass, number> => ({
  COMMITTED: 0,
  NORMAL: 0,
  FLEXIBLE: 0,
  IRREGULAR: 0,
  SAVINGS: 0,
});

function nonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function dateKey(value: string): string {
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
  if (direct) return direct;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid affordability date: ${value}`);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function assertDateRange(asOfDate: string, endDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Affordability projection dates must use YYYY-MM-DD.');
  }
  if (endDate < asOfDate) throw new Error('Affordability projection end date cannot be before the as-of date.');
}

export function isLiquidCashAccount(account: Account): boolean {
  if (account.type !== 'asset' || account.is_archived === 1) return false;
  return LIQUID_ACCOUNT_GROUPS.has(String(account.group ?? '').trim().toLowerCase());
}

function normalizedCategoryRef(value?: string): string {
  return String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

function findCategory(reference: string | undefined, categories: Category[]): Category | undefined {
  if (!reference) return undefined;
  const direct = categories.find(category => category.id === reference);
  if (direct) return direct;
  const normalized = normalizedCategoryRef(reference);
  return categories.find(category => normalizedCategoryRef(category.name) === normalized);
}

function categoryClass(reference: string | undefined, categories: Category[]): AffordabilityClass {
  const category = findCategory(reference, categories);
  return normalizeAffordabilityClass(category?.affordabilityClass, category?.group, category?.type);
}

function transactionType(transaction: Transaction): 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'EXCLUDED' {
  const type = String(transaction.transaction_type ?? transaction.type ?? '').toUpperCase();
  if (type === 'INCOME' || type === 'EXPENSE' || type === 'TRANSFER') return type;
  return 'EXCLUDED';
}

function recurringTransaction(rule: RecurringRule, dueDate: string): Transaction {
  const type = rule.transactionType;
  return {
    id: `projection:${rule.id}:${dueDate}`,
    title: rule.title,
    subtitle: rule.subtitle ?? '',
    amount: nonNegative(rule.amount),
    date: `${dueDate}T12:00:00`,
    category: rule.category ?? '#uncategorized',
    icon: rule.icon ?? 'ShoppingBag',
    type: type === 'INCOME' ? 'income' : type === 'TRANSFER' ? 'transfer' : 'expense',
    account: rule.account,
    fromAccountId: rule.fromAccountId ?? (type === 'EXPENSE' ? rule.account : undefined),
    toAccountId: rule.toAccountId ?? (type === 'INCOME' ? rule.account : undefined),
    isRecurring: true,
    recurrenceFrequency: rule.frequency,
    recurringRuleId: rule.id,
    dueDate,
    eventId: rule.eventId,
    transaction_type: type,
    is_verified: 0,
    notes: rule.notes,
  };
}

function projectedTransactionDate(transaction: Transaction): string {
  return transaction.dueDate ?? dateKey(transaction.date);
}

function shouldProjectExistingTransaction(transaction: Transaction, asOfDate: string, endDate: string): boolean {
  if (transactionType(transaction) === 'EXCLUDED') return false;
  const dueDate = projectedTransactionDate(transaction);
  if (dueDate > endDate) return false;

  // Confirmed transactions on/before the balance snapshot are already reflected
  // in Account.balance. Pending recurring occurrences are not, so they remain a
  // future obligation even when due today or overdue.
  if (transaction.is_verified === 0) {
    return Boolean(transaction.recurringRuleId || transaction.isRecurring);
  }
  return dueDate > asOfDate;
}

interface ProjectionAccumulator {
  expectedIncome: number;
  otherCashInflows: number;
  expectedExpenses: number;
  scheduledSavings: number;
  expensesByClass: Record<AffordabilityClass, number>;
  liabilityPaymentsByDate: Map<string, Map<string, number>>;
  occurrenceCount: number;
}

function recordLiabilityPayment(
  accumulator: ProjectionAccumulator,
  liabilityId: string,
  paymentDate: string,
  amount: number,
): void {
  const value = nonNegative(amount);
  if (value <= 0) return;
  let payments = accumulator.liabilityPaymentsByDate.get(liabilityId);
  if (!payments) {
    payments = new Map<string, number>();
    accumulator.liabilityPaymentsByDate.set(liabilityId, payments);
  }
  payments.set(paymentDate, (payments.get(paymentDate) ?? 0) + value);
}

function liabilityPaymentForDate(
  accumulator: ProjectionAccumulator,
  liabilityId: string,
  paymentDate: string,
): number {
  return accumulator.liabilityPaymentsByDate.get(liabilityId)?.get(paymentDate) ?? 0;
}

function totalLiabilityPayments(accumulator: ProjectionAccumulator, liabilityId: string): number {
  const payments = accumulator.liabilityPaymentsByDate.get(liabilityId);
  if (!payments) return 0;
  let total = 0;
  for (const amount of payments.values()) total += amount;
  return total;
}

function applyProjectedTransaction(
  transaction: Transaction,
  accountsById: Map<string, Account>,
  liquidAccountIds: Set<string>,
  categories: Category[],
  accumulator: ProjectionAccumulator,
): void {
  const type = transactionType(transaction);
  if (type === 'EXCLUDED') return;
  const amount = nonNegative(transaction.amount);
  if (amount <= 0) return;

  const fromId = transaction.fromAccountId ?? (type === 'EXPENSE' ? transaction.account : undefined);
  const toId = transaction.toAccountId ?? (type === 'INCOME' ? transaction.account : undefined);
  const fromLiquid = Boolean(fromId && liquidAccountIds.has(fromId));
  const toLiquid = Boolean(toId && liquidAccountIds.has(toId));
  const classification = categoryClass(transaction.category, categories);

  if (type === 'INCOME') {
    if (toLiquid) accumulator.expectedIncome += amount;
    accumulator.occurrenceCount += 1;
    return;
  }

  if (type === 'EXPENSE') {
    if (fromLiquid) {
      const destination = toId ? accountsById.get(toId) : undefined;
      if (destination?.type === 'liability' && toId) {
        accumulator.expectedExpenses += amount;
        accumulator.expensesByClass.COMMITTED += amount;
        recordLiabilityPayment(accumulator, toId, projectedTransactionDate(transaction), amount);
      } else if (classification === 'SAVINGS') {
        accumulator.scheduledSavings += amount;
      } else {
        accumulator.expectedExpenses += amount;
        accumulator.expensesByClass[classification] += amount;
      }
    }
    accumulator.occurrenceCount += 1;
    return;
  }

  // Transfers are evaluated by their net effect on liquid cash. Asset-to-asset
  // liquid transfers therefore net to zero, while a payment from bank cash to a
  // liability or investment reduces spendable cash without pretending it is
  // ordinary consumption.
  const liquidDelta = (toLiquid ? amount : 0) - (fromLiquid ? amount : 0);
  if (liquidDelta > 0) {
    accumulator.otherCashInflows += liquidDelta;
  } else if (liquidDelta < 0) {
    const outflow = Math.abs(liquidDelta);
    const destination = toId ? accountsById.get(toId) : undefined;
    if (destination?.type === 'liability' && toId) {
      // Card/loan payments are cash commitments, not ordinary consumption.
      accumulator.expectedExpenses += outflow;
      accumulator.expensesByClass.COMMITTED += outflow;
      recordLiabilityPayment(accumulator, toId, projectedTransactionDate(transaction), outflow);
    } else if (classification === 'SAVINGS' || String(destination?.group ?? '').trim().toLowerCase() === 'investment') {
      accumulator.scheduledSavings += outflow;
    } else {
      accumulator.expectedExpenses += outflow;
      accumulator.expensesByClass[classification] += outflow;
    }
  }
  accumulator.occurrenceCount += 1;
}

function addCommittedFallbackExpense(accumulator: ProjectionAccumulator, amount: number): void {
  const value = nonNegative(amount);
  if (value <= 0) return;
  accumulator.expectedExpenses += value;
  accumulator.expensesByClass.COMMITTED += value;
  accumulator.occurrenceCount += 1;
}

function projectRecurringRules(
  recurringRules: RecurringRule[],
  existingOccurrenceKeys: Set<string>,
  asOfDate: string,
  endDate: string,
): Transaction[] {
  const projected: Transaction[] = [];
  for (const rule of recurringRules) {
    if (!rule.isActive || nonNegative(rule.amount) <= 0) continue;
    let dueDate = rule.nextDueDate;
    let guard = 0;
    while (dueDate < asOfDate && guard++ < 240) {
      dueDate = advanceRecurringDate(dueDate, rule.frequency, rule.anchorDay);
    }
    while (dueDate <= endDate && guard++ < 240) {
      const key = `${rule.id}:${dueDate}`;
      if (!existingOccurrenceKeys.has(key)) projected.push(recurringTransaction(rule, dueDate));
      dueDate = advanceRecurringDate(dueDate, rule.frequency, rule.anchorDay);
    }
  }
  return projected;
}

function projectLoanFallbacks(
  accounts: Account[],
  creditCardIds: Set<string>,
  asOfDate: string,
  endDate: string,
  accumulator: ProjectionAccumulator,
): void {
  for (const account of accounts) {
    if (
      account.type !== 'liability' ||
      account.is_archived === 1 ||
      creditCardIds.has(account.id) ||
      nonNegative(account.monthlyEMI) <= 0 ||
      !account.nextEMIDate
    ) continue;

    let dueDate = dateKey(account.nextEMIDate);
    let guard = 0;
    while (dueDate < asOfDate && guard++ < 240) {
      dueDate = advanceRecurringDate(dueDate, account.paymentFrequency ?? 'MONTHLY');
    }
    while (dueDate <= endDate && guard++ < 240) {
      const explicitPayment = liabilityPaymentForDate(accumulator, account.id, dueDate);
      const remainingEmi = Math.max(0, nonNegative(account.monthlyEMI) - explicitPayment);
      addCommittedFallbackExpense(accumulator, remainingEmi);
      dueDate = advanceRecurringDate(dueDate, account.paymentFrequency ?? 'MONTHLY');
    }
  }
}

export function projectAffordability(input: AffordabilityInput): AffordabilityResult {
  assertDateRange(input.asOfDate, input.endDate);

  const accounts = input.accounts.filter(account => account.is_archived !== 1);
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const liquidAccounts = accounts.filter(isLiquidCashAccount);
  const liquidAccountIds = new Set(liquidAccounts.map(account => account.id));
  const openingCash = Math.max(0, liquidAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0));

  const accumulator: ProjectionAccumulator = {
    expectedIncome: 0,
    otherCashInflows: 0,
    expectedExpenses: 0,
    scheduledSavings: 0,
    expensesByClass: ZERO_EXPENSES_BY_CLASS(),
    liabilityPaymentsByDate: new Map<string, Map<string, number>>(),
    occurrenceCount: 0,
  };

  const existingOccurrenceKeys = new Set(
    input.transactions
      .filter(transaction => transaction.recurringRuleId && transaction.dueDate)
      .map(transaction => `${transaction.recurringRuleId}:${transaction.dueDate}`),
  );

  const projectedExisting = input.transactions.filter(transaction =>
    shouldProjectExistingTransaction(transaction, input.asOfDate, input.endDate),
  );
  for (const transaction of projectedExisting) {
    applyProjectedTransaction(transaction, accountsById, liquidAccountIds, input.categories, accumulator);
  }

  const projectedRules = projectRecurringRules(
    input.recurringRules,
    existingOccurrenceKeys,
    input.asOfDate,
    input.endDate,
  );
  for (const transaction of projectedRules) {
    applyProjectedTransaction(transaction, accountsById, liquidAccountIds, input.categories, accumulator);
  }

  // A card record is only authoritative while its backing liability account
  // is active. This prevents stale/archived card metadata from reducing capacity.
  const creditCards = (input.creditCards ?? []).filter(card => accountsById.has(card.id));
  const creditCardIds = new Set(creditCards.map(card => card.id));
  for (const card of creditCards) {
    if (
      nonNegative(card.dueAmount) > 0 &&
      card.dueDate &&
      dateKey(card.dueDate) <= input.endDate
    ) {
      // Explicit bank -> card payments are already counted as committed cash
      // outflows. Only add the unpaid remainder of the card obligation.
      const explicitPayments = totalLiabilityPayments(accumulator, card.id);
      const remainingDue = Math.max(0, nonNegative(card.dueAmount) - explicitPayments);
      addCommittedFallbackExpense(accumulator, remainingDue);
    }
  }

  projectLoanFallbacks(
    accounts,
    creditCardIds,
    input.asOfDate,
    input.endDate,
    accumulator,
  );

  const plannedSavingsTarget = nonNegative(input.settings.plannedSavingsTarget);
  const plannedSavings = Math.max(plannedSavingsTarget, accumulator.scheduledSavings);
  const contingencyBuffer = nonNegative(input.settings.contingencyBuffer);
  const protectedCashReserve = nonNegative(input.settings.protectedCashReserve);
  const purchaseAmount = nonNegative(input.purchaseAmount);

  const projectedCashBeforeSafety = Math.max(
    0,
    openingCash + accumulator.expectedIncome + accumulator.otherCashInflows - accumulator.expectedExpenses - plannedSavings,
  );
  const safePurchaseCapacity = Math.max(0, projectedCashBeforeSafety - contingencyBuffer - protectedCashReserve);
  const riskyPurchaseCapacity = Math.max(0, projectedCashBeforeSafety - protectedCashReserve);
  const remainingCapacity = safePurchaseCapacity - purchaseAmount;
  const contingencyUsedByPurchase = Math.min(contingencyBuffer, Math.max(0, purchaseAmount - safePurchaseCapacity));
  const remainingContingency = Math.max(0, contingencyBuffer - contingencyUsedByPurchase);
  const protectedPlanShortfall = Math.max(0, purchaseAmount - riskyPurchaseCapacity);

  let status: AffordabilityStatus;
  const reasons: string[] = [];
  if (purchaseAmount <= safePurchaseCapacity) {
    status = 'SAFE';
    reasons.push('The purchase fits within safe capacity after savings, contingency, and protected cash are reserved.');
  } else if (purchaseAmount <= riskyPurchaseCapacity) {
    status = 'RISKY';
    reasons.push('The purchase is possible without using protected cash, but it consumes part of the contingency buffer.');
  } else {
    status = 'NOT_AFFORDABLE';
    reasons.push('The purchase would require using protected cash or money already reserved by the financial plan.');
  }
  if (accumulator.scheduledSavings > plannedSavingsTarget) {
    reasons.push('Scheduled savings/investment outflows are higher than the supplied savings target, so the larger amount was protected.');
  }

  return {
    status,
    purchaseAmount,
    openingCash,
    expectedIncome: accumulator.expectedIncome,
    otherCashInflows: accumulator.otherCashInflows,
    expectedExpenses: accumulator.expectedExpenses,
    scheduledSavings: accumulator.scheduledSavings,
    plannedSavings,
    contingencyBuffer,
    protectedCashReserve,
    projectedCashBeforeSafety,
    safePurchaseCapacity,
    riskyPurchaseCapacity,
    remainingCapacity,
    contingencyUsedByPurchase,
    remainingContingency,
    protectedPlanShortfall,
    expensesByClass: accumulator.expensesByClass,
    projectedOccurrenceCount: accumulator.occurrenceCount,
    reasons,
  };
}
