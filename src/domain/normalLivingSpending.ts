import type { Category, Transaction } from '../types';
import { getCycleDetailsForDay, getCycleRange, shiftCycle } from '../utils/cycles';
import { normalizeAffordabilityClass } from './categoryAffordability';
import type { HistoryConfidence, HistoricalCycleSummary } from './irregularSpending';

export interface NormalLivingCycleSummary extends HistoricalCycleSummary {
  normalTransactionCount: number;
  normalSpend: number;
}

export interface NormalLivingSpendingInput {
  asOfDate: string;
  monthCycleDay: number;
  transactions: Transaction[];
  categories: Category[];
  historicalMonths: number;
}

export interface NormalLivingSpendingEstimate {
  confidence: HistoryConfidence;
  requestedCycleCount: number;
  observedCycleCount: number;
  medianNormalSpend: number;
  estimateUsable: boolean;
  cycleSummaries: NormalLivingCycleSummary[];
  reasons: string[];
}

function nonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function cycleSafeDate(value: string): string {
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
  return direct ? `${direct}T12:00:00` : value;
}

function ledgerType(transaction: Transaction): 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'EXCLUDED' {
  const value = String(transaction.transaction_type ?? transaction.type ?? '').toUpperCase();
  if (value === 'INCOME' || value === 'EXPENSE' || value === 'TRANSFER') return value;
  return 'EXCLUDED';
}

function isConfirmedHistoricalActivity(transaction: Transaction): boolean {
  if (transaction.is_verified === 0 || nonNegative(transaction.amount) <= 0) return false;
  const type = ledgerType(transaction);
  return type === 'INCOME' || type === 'EXPENSE';
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
  return categories.find(category =>
    normalizedCategoryRef(category.id) === normalized || normalizedCategoryRef(category.name) === normalized,
  );
}

function isNormalExpense(transaction: Transaction, categories: Category[]): boolean {
  if (!isConfirmedHistoricalActivity(transaction) || ledgerType(transaction) !== 'EXPENSE') return false;
  const category = findCategory(transaction.category, categories);
  return normalizeAffordabilityClass(category?.affordabilityClass, category?.group, category?.type) === 'NORMAL';
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function confidenceForObservedCycles(observedCycleCount: number): HistoryConfidence {
  if (observedCycleCount <= 0) return 'NONE';
  if (observedCycleCount <= 2) return 'LOW';
  if (observedCycleCount <= 4) return 'MEDIUM';
  return 'HIGH';
}

function cycleKey(transaction: Transaction, monthCycleDay: number): string | null {
  try {
    return getCycleDetailsForDay(cycleSafeDate(transaction.date), monthCycleDay).key;
  } catch {
    return null;
  }
}

/**
 * Estimates the user's normal living expenses from completed CoinBuddy cycles.
 * Unobserved cycles are excluded instead of being interpreted as zero. Observed
 * cycles with no NORMAL expense correctly contribute zero to the median.
 */
export function estimateNormalLivingSpending(input: NormalLivingSpendingInput): NormalLivingSpendingEstimate {
  const requestedCycleCount = Math.min(24, Math.max(1, Math.round(Number(input.historicalMonths) || 6)));
  const currentCycle = getCycleDetailsForDay(cycleSafeDate(input.asOfDate), input.monthCycleDay);
  const historicalTransactions = input.transactions.filter(isConfirmedHistoricalActivity);
  const transactionCycleKeys = new Map<string, string | null>();
  for (const transaction of historicalTransactions) {
    transactionCycleKeys.set(transaction.id, cycleKey(transaction, input.monthCycleDay));
  }

  const cycleSummaries: NormalLivingCycleSummary[] = [];
  for (let offset = requestedCycleCount; offset >= 1; offset -= 1) {
    const shifted = shiftCycle(currentCycle.year, currentCycle.month, -offset);
    const key = `${shifted.year}-${shifted.month}`;
    const range = getCycleRange(shifted.year, shifted.month, input.monthCycleDay);
    const inCycle = historicalTransactions.filter(transaction => transactionCycleKeys.get(transaction.id) === key);
    const normal = inCycle.filter(transaction => isNormalExpense(transaction, input.categories));
    const normalSpend = normal.reduce((sum, transaction) => sum + nonNegative(transaction.amount), 0);
    cycleSummaries.push({
      key,
      startDate: localDateKey(range.start),
      endDate: localDateKey(range.end),
      hasActivity: inCycle.length > 0,
      activityTransactionCount: inCycle.length,
      irregularTransactionCount: 0,
      irregularSpend: 0,
      normalTransactionCount: normal.length,
      normalSpend,
    });
  }

  const observedCycles = cycleSummaries.filter(cycle => cycle.hasActivity);
  const observedCycleCount = observedCycles.length;
  const confidence = confidenceForObservedCycles(observedCycleCount);
  const medianNormalSpend = median(observedCycles.map(cycle => cycle.normalSpend));
  const estimateUsable = observedCycleCount > 0;
  const reasons: string[] = [];

  if (!estimateUsable) {
    reasons.push('No completed financial cycle contains confirmed income or expense activity, so normal living expenses cannot be estimated yet.');
  } else {
    reasons.push(`Median NORMAL-category spending across ${observedCycleCount} observed completed cycle${observedCycleCount === 1 ? '' : 's'} is ${medianNormalSpend}.`);
    if (confidence === 'LOW') reasons.push('The normal living-expense estimate has low confidence because only one or two completed cycles are available.');
    else if (confidence === 'MEDIUM') reasons.push('The normal living-expense estimate has medium confidence and will become more stable with additional cycles.');
    else reasons.push('The normal living-expense estimate has high confidence based on at least five completed observed cycles.');
  }

  return {
    confidence,
    requestedCycleCount,
    observedCycleCount,
    medianNormalSpend,
    estimateUsable,
    cycleSummaries,
    reasons,
  };
}
