import type { AffordabilitySettings, Category, Transaction } from '../types';
import { getCycleDetailsForDay, getCycleRange, shiftCycle } from '../utils/cycles';
import { normalizeAffordabilityClass } from './categoryAffordability';
import { resolveContingencyBuffer } from './affordabilitySettings';

export type HistoryConfidence = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type IrregularHistoryStatus = 'READY' | 'NO_HISTORY' | 'CATEGORY_SETUP_REQUIRED';
export type ContingencySource = 'HISTORICAL' | 'FIXED' | 'UNAVAILABLE';

export interface HistoricalCycleSummary {
  key: string;
  startDate: string;
  endDate: string;
  hasActivity: boolean;
  activityTransactionCount: number;
  irregularTransactionCount: number;
  irregularSpend: number;
}

export interface IrregularSpendingInput {
  asOfDate: string;
  monthCycleDay: number;
  transactions: Transaction[];
  categories: Category[];
  settings: AffordabilitySettings;
}

export interface IrregularSpendingEstimate {
  status: IrregularHistoryStatus;
  confidence: HistoryConfidence;
  contingencySource: ContingencySource;
  requestedCycleCount: number;
  completedCycleCount: number;
  observedCycleCount: number;
  irregularCycleCount: number;
  medianIrregularSpend: number;
  automaticBaseEstimate: number;
  recommendedBuffer: number;
  automaticEstimateUsable: boolean;
  requiresUserInput: boolean;
  requiresCategoryReview: boolean;
  cycleSummaries: HistoricalCycleSummary[];
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
  if (transaction.is_verified === 0) return false;
  if (nonNegative(transaction.amount) <= 0) return false;
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

function isIrregularExpense(transaction: Transaction, categories: Category[]): boolean {
  if (!isConfirmedHistoricalActivity(transaction) || ledgerType(transaction) !== 'EXPENSE') return false;
  const category = findCategory(transaction.category, categories);
  return normalizeAffordabilityClass(category?.affordabilityClass, category?.group, category?.type) === 'IRREGULAR';
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
 * Estimates irregular spending using completed CoinBuddy financial cycles only.
 * Unobserved cycles are excluded from the median rather than treated as zero,
 * while observed cycles with no irregular expense correctly contribute zero.
 */
export function estimateIrregularSpending(input: IrregularSpendingInput): IrregularSpendingEstimate {
  const requestedCycleCount = Math.min(24, Math.max(1, Math.round(Number(input.settings.historicalMonths) || 6)));
  const currentCycle = getCycleDetailsForDay(cycleSafeDate(input.asOfDate), input.monthCycleDay);
  const irregularCategoriesExist = input.categories.some(category =>
    category.type !== 'income' && normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type) === 'IRREGULAR',
  );

  const historicalTransactions = input.transactions.filter(isConfirmedHistoricalActivity);
  const transactionCycleKeys = new Map<string, string | null>();
  for (const transaction of historicalTransactions) {
    transactionCycleKeys.set(transaction.id, cycleKey(transaction, input.monthCycleDay));
  }

  const cycleSummaries: HistoricalCycleSummary[] = [];
  for (let offset = requestedCycleCount; offset >= 1; offset -= 1) {
    const shifted = shiftCycle(currentCycle.year, currentCycle.month, -offset);
    const details = { year: shifted.year, month: shifted.month, key: `${shifted.year}-${shifted.month}` };
    const range = getCycleRange(details.year, details.month, input.monthCycleDay);
    const inCycle = historicalTransactions.filter(transaction => transactionCycleKeys.get(transaction.id) === details.key);
    const irregular = inCycle.filter(transaction => isIrregularExpense(transaction, input.categories));
    cycleSummaries.push({
      key: details.key,
      startDate: localDateKey(range.start),
      endDate: localDateKey(range.end),
      hasActivity: inCycle.length > 0,
      activityTransactionCount: inCycle.length,
      irregularTransactionCount: irregular.length,
      irregularSpend: irregular.reduce((sum, transaction) => sum + nonNegative(transaction.amount), 0),
    });
  }

  const observedCycles = cycleSummaries.filter(cycle => cycle.hasActivity);
  const irregularCycles = observedCycles.filter(cycle => cycle.irregularSpend > 0);
  const observedCycleCount = observedCycles.length;
  const confidence = confidenceForObservedCycles(observedCycleCount);
  const medianIrregularSpend = median(observedCycles.map(cycle => cycle.irregularSpend));
  const automaticBaseEstimate = medianIrregularSpend;
  const fixedMode = input.settings.contingencyMode === 'FIXED';

  let status: IrregularHistoryStatus = 'READY';
  if (!irregularCategoriesExist) status = 'CATEGORY_SETUP_REQUIRED';
  else if (observedCycleCount === 0) status = 'NO_HISTORY';

  const automaticEstimateUsable = status === 'READY';
  const contingencySource: ContingencySource = fixedMode
    ? 'FIXED'
    : automaticEstimateUsable
      ? 'HISTORICAL'
      : 'UNAVAILABLE';
  const recommendedBuffer = fixedMode
    ? resolveContingencyBuffer(input.settings, automaticBaseEstimate)
    : automaticEstimateUsable
      ? resolveContingencyBuffer(input.settings, automaticBaseEstimate)
      : 0;
  const requiresUserInput = !fixedMode && !automaticEstimateUsable;
  const reasons: string[] = [];

  if (!irregularCategoriesExist) {
    reasons.push('No expense category is marked as irregular, so CoinBuddy cannot identify unexpected historical spending yet.');
  }
  if (observedCycleCount === 0) {
    reasons.push('No completed financial cycle contains confirmed income or expense activity, so no historical contingency estimate is available.');
  } else if (confidence === 'LOW') {
    reasons.push(`Only ${observedCycleCount} completed financial cycle${observedCycleCount === 1 ? '' : 's'} contain usable activity, so the estimate has low confidence.`);
  } else if (confidence === 'MEDIUM') {
    reasons.push(`The estimate uses ${observedCycleCount} completed financial cycles and has medium confidence.`);
  } else {
    reasons.push(`The estimate uses ${observedCycleCount} completed financial cycles and has high confidence.`);
  }

  if (automaticEstimateUsable && irregularCycles.length === 0) {
    reasons.push(`No irregular spending was recorded in the ${observedCycleCount} observed completed cycle${observedCycleCount === 1 ? '' : 's'}; the median irregular-spending estimate is zero.`);
  } else if (automaticEstimateUsable) {
    reasons.push(`Median irregular spending across observed completed cycles is ${medianIrregularSpend}.`);
  }

  if (fixedMode) {
    reasons.push(`A fixed contingency buffer of ${recommendedBuffer} is being used instead of the historical estimate.`);
  } else if (requiresUserInput) {
    reasons.push('Automatic contingency is unavailable. Use a fixed contingency amount until enough history/category classification is available.');
  }

  return {
    status,
    confidence,
    contingencySource,
    requestedCycleCount,
    completedCycleCount: cycleSummaries.length,
    observedCycleCount,
    irregularCycleCount: irregularCycles.length,
    medianIrregularSpend,
    automaticBaseEstimate,
    recommendedBuffer,
    automaticEstimateUsable,
    requiresUserInput,
    requiresCategoryReview: !irregularCategoriesExist,
    cycleSummaries,
    reasons,
  };
}
