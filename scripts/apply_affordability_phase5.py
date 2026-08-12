from pathlib import Path

files = {
"src/domain/irregularSpending.ts": r'''import type { AffordabilitySettings, Category, Transaction } from '../types';
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
''',
"src/domain/affordabilityPlanner.ts": r'''import type { AffordabilitySettings } from '../types';
import type { AffordabilityInput, AffordabilityResult } from './affordability';
import { projectAffordability } from './affordability';
import { estimateIrregularSpending, type IrregularSpendingEstimate } from './irregularSpending';

export interface AffordabilityPlannerInput extends Omit<AffordabilityInput, 'settings'> {
  affordabilitySettings: AffordabilitySettings;
  monthCycleDay: number;
}

export interface AffordabilityPlannerResult {
  projection: AffordabilityResult;
  irregularSpending: IrregularSpendingEstimate;
  planningWarnings: string[];
}

/** High-level Phase 5 bridge used by the future UI. */
export function projectAffordabilityWithHistory(input: AffordabilityPlannerInput): AffordabilityPlannerResult {
  const irregularSpending = estimateIrregularSpending({
    asOfDate: input.asOfDate,
    monthCycleDay: input.monthCycleDay,
    transactions: input.transactions,
    categories: input.categories,
    settings: input.affordabilitySettings,
  });

  const projection = projectAffordability({
    asOfDate: input.asOfDate,
    endDate: input.endDate,
    accounts: input.accounts,
    transactions: input.transactions,
    recurringRules: input.recurringRules,
    categories: input.categories,
    creditCards: input.creditCards,
    purchaseAmount: input.purchaseAmount,
    settings: {
      plannedSavingsTarget: input.affordabilitySettings.monthlySavingsTarget,
      contingencyBuffer: irregularSpending.recommendedBuffer,
      protectedCashReserve: input.affordabilitySettings.protectedCashReserve,
    },
  });

  const planningWarnings: string[] = [];
  if (irregularSpending.contingencySource === 'UNAVAILABLE') {
    planningWarnings.push('Unexpected-spending protection is not included because automatic history is unavailable. Set a fixed contingency amount or build more usable history.');
  }
  if (irregularSpending.confidence === 'LOW' && irregularSpending.contingencySource === 'HISTORICAL') {
    planningWarnings.push('Unexpected-spending protection is based on limited history and may change materially as more cycles are recorded.');
  } else if (irregularSpending.confidence === 'MEDIUM' && irregularSpending.contingencySource === 'HISTORICAL') {
    planningWarnings.push('Unexpected-spending protection is based on a moderate amount of history and will become more stable with additional cycles.');
  }
  if (!input.affordabilitySettings.setupCompleted) {
    planningWarnings.push('Affordability safety preferences have not been reviewed yet.');
  }

  return { projection, irregularSpending, planningWarnings };
}
''',
"src/domain/irregularSpending.test.ts": r'''import { describe, expect, it } from 'vitest';
import type { AffordabilitySettings, Category, Transaction } from '../types';
import { estimateIrregularSpending } from './irregularSpending';

const settings = (overrides: Partial<AffordabilitySettings> = {}): AffordabilitySettings => ({
  version: 1,
  setupCompleted: true,
  monthlySavingsTarget: 0,
  protectedCashReserve: 0,
  contingencyMode: 'AUTO',
  fixedContingencyAmount: 0,
  historicalMonths: 6,
  safetyLevel: 'BALANCED',
  ...overrides,
});

const categories: Category[] = [
  { id: 'medical', name: 'Medical', icon: 'Heart', type: 'expense', affordabilityClass: 'IRREGULAR' },
  { id: 'general', name: 'General', icon: 'Tag', type: 'expense', affordabilityClass: 'NORMAL' },
];

const tx = (id: string, date: string, amount: number, category = 'general', type: Transaction['type'] = 'expense', extra: Partial<Transaction> = {}): Transaction => ({
  id,
  title: id,
  subtitle: '',
  amount,
  date,
  category,
  icon: 'ShoppingBag',
  type,
  transaction_type: type === 'income' ? 'INCOME' : type === 'transfer' ? 'TRANSFER' : 'EXPENSE',
  is_verified: 1,
  ...extra,
});

function monthlyHistory(values: number[]): Transaction[] {
  // As-of 2026-08-12 with cycle day 1 -> completed cycles Feb through Jul.
  const months = ['2026-02-10', '2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10'];
  return values.flatMap((value, index) => [
    tx(`salary-${index}`, months[index], 50000, 'general', 'income'),
    ...(value > 0 ? [tx(`irregular-${index}`, months[index], value, 'medical')] : []),
  ]);
}

describe('historical irregular-spending estimator', () => {
  it('uses a median so a large one-off outlier does not dominate the estimate', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 1, transactions: monthlyHistory([2000, 3500, 4000, 5000, 5500, 20000]), categories, settings: settings(),
    });
    expect(result.status).toBe('READY');
    expect(result.confidence).toBe('HIGH');
    expect(result.medianIrregularSpend).toBe(4500);
    expect(result.recommendedBuffer).toBe(5625);
  });

  it('uses CoinBuddy financial-cycle boundaries instead of calendar months', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 25,
      transactions: [
        tx('activity', '2026-07-01', 1000, 'general'),
        tx('before-boundary', '2026-07-24', 2000, 'medical'),
        tx('current-cycle', '2026-07-25', 9000, 'medical'),
      ],
      categories,
      settings: settings({ historicalMonths: 1 }),
    });
    expect(result.cycleSummaries[0].startDate).toBe('2026-06-25');
    expect(result.cycleSummaries[0].endDate).toBe('2026-07-24');
    expect(result.medianIrregularSpend).toBe(2000);
  });

  it('never uses the current partial financial cycle', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 1,
      transactions: [tx('july', '2026-07-10', 3000, 'medical'), tx('august-current', '2026-08-05', 99000, 'medical')],
      categories,
      settings: settings({ historicalMonths: 1 }),
    });
    expect(result.medianIrregularSpend).toBe(3000);
  });

  it('excludes pending/unconfirmed expenses from historical spending', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 1,
      transactions: [tx('activity', '2026-07-01', 1000, 'general'), tx('pending', '2026-07-10', 10000, 'medical', 'expense', { is_verified: 0, isRecurring: true })],
      categories,
      settings: settings({ historicalMonths: 1 }),
    });
    expect(result.medianIrregularSpend).toBe(0);
    expect(result.cycleSummaries[0].irregularTransactionCount).toBe(0);
  });

  it('excludes transfers and protected ledger adjustments from historical irregular totals', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 1,
      transactions: [
        tx('activity', '2026-07-01', 1000, 'general'),
        tx('transfer', '2026-07-10', 10000, 'medical', 'transfer'),
        tx('opening', '2026-07-11', 20000, 'medical', 'income', { transaction_type: 'OPENING_BALANCE', isOpeningBalance: true }),
        tx('market', '2026-07-12', 30000, 'medical', 'income', { transaction_type: 'MARKET_ADJUSTMENT' }),
        tx('balance', '2026-07-13', 40000, 'medical', 'expense', { transaction_type: 'BALANCE_ADJUSTMENT' }),
      ],
      categories,
      settings: settings({ historicalMonths: 1 }),
    });
    expect(result.medianIrregularSpend).toBe(0);
  });

  it('returns an explicit no-history state instead of inventing an automatic buffer', () => {
    const result = estimateIrregularSpending({ asOfDate: '2026-08-12', monthCycleDay: 1, transactions: [], categories, settings: settings() });
    expect(result.status).toBe('NO_HISTORY');
    expect(result.confidence).toBe('NONE');
    expect(result.contingencySource).toBe('UNAVAILABLE');
    expect(result.recommendedBuffer).toBe(0);
    expect(result.requiresUserInput).toBe(true);
  });

  it('requires category review when no expense category is classified as irregular', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 1,
      transactions: monthlyHistory([1000, 1000, 1000, 1000, 1000, 1000]),
      categories: [{ id: 'general', name: 'General', icon: 'Tag', type: 'expense', affordabilityClass: 'NORMAL' }],
      settings: settings(),
    });
    expect(result.status).toBe('CATEGORY_SETUP_REQUIRED');
    expect(result.requiresCategoryReview).toBe(true);
    expect(result.contingencySource).toBe('UNAVAILABLE');
  });

  it('treats observed cycles with no irregular spending as meaningful zeroes', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 1,
      transactions: monthlyHistory([0, 0, 0, 0, 0, 0]), categories, settings: settings(),
    });
    expect(result.status).toBe('READY');
    expect(result.confidence).toBe('HIGH');
    expect(result.observedCycleCount).toBe(6);
    expect(result.medianIrregularSpend).toBe(0);
    expect(result.recommendedBuffer).toBe(0);
    expect(result.requiresUserInput).toBe(false);
  });

  it('does not treat completely unobserved cycles as zero-spending history', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 1,
      transactions: [tx('july-activity', '2026-07-01', 50000, 'general', 'income'), tx('july-medical', '2026-07-10', 4000, 'medical')],
      categories,
      settings: settings(),
    });
    expect(result.observedCycleCount).toBe(1);
    expect(result.confidence).toBe('LOW');
    expect(result.medianIrregularSpend).toBe(4000);
  });

  it('reports medium confidence for three to four observed completed cycles', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 1,
      transactions: monthlyHistory([0, 0, 3000, 4000, 5000, 6000]).filter(t => t.date >= '2026-04-01'),
      categories,
      settings: settings(),
    });
    expect(result.observedCycleCount).toBe(4);
    expect(result.confidence).toBe('MEDIUM');
  });

  it('uses a user fixed contingency even when historical data is unavailable', () => {
    const result = estimateIrregularSpending({
      asOfDate: '2026-08-12', monthCycleDay: 1, transactions: [], categories,
      settings: settings({ contingencyMode: 'FIXED', fixedContingencyAmount: 7500 }),
    });
    expect(result.status).toBe('NO_HISTORY');
    expect(result.contingencySource).toBe('FIXED');
    expect(result.recommendedBuffer).toBe(7500);
    expect(result.requiresUserInput).toBe(false);
  });
});
''',
"src/domain/affordabilityPlanner.test.ts": r'''import { describe, expect, it } from 'vitest';
import type { Account, AffordabilitySettings, Category, Transaction } from '../types';
import { projectAffordabilityWithHistory } from './affordabilityPlanner';

const bank: Account = { id: 'bank', name: 'Bank', type: 'asset', group: 'Bank Account', balance: 100000 };
const categories: Category[] = [
  { id: 'medical', name: 'Medical', icon: 'Heart', type: 'expense', affordabilityClass: 'IRREGULAR' },
  { id: 'general', name: 'General', icon: 'Tag', type: 'expense', affordabilityClass: 'NORMAL' },
];
const settings = (overrides: Partial<AffordabilitySettings> = {}): AffordabilitySettings => ({
  version: 1, setupCompleted: true, monthlySavingsTarget: 10000, protectedCashReserve: 20000,
  contingencyMode: 'AUTO', fixedContingencyAmount: 0, historicalMonths: 6, safetyLevel: 'BALANCED', ...overrides,
});
const tx = (id: string, date: string, amount: number, category: string, type: 'income' | 'expense'): Transaction => ({
  id, title: id, subtitle: '', amount, date, category, icon: 'ShoppingBag', type,
  transaction_type: type === 'income' ? 'INCOME' : 'EXPENSE', is_verified: 1,
  ...(type === 'income' ? { toAccountId: 'bank' } : { fromAccountId: 'bank', account: 'bank' }),
});
const history = [
  ['2026-02-10', 2000], ['2026-03-10', 3500], ['2026-04-10', 4000],
  ['2026-05-10', 5000], ['2026-06-10', 5500], ['2026-07-10', 20000],
].flatMap(([date, amount], index) => [
  tx(`salary-${index}`, String(date), 50000, 'general', 'income'),
  tx(`medical-${index}`, String(date), Number(amount), 'medical', 'expense'),
]);

describe('affordability planner history integration', () => {
  it('feeds the balanced median-based historical buffer into the projection engine', () => {
    const result = projectAffordabilityWithHistory({
      asOfDate: '2026-08-12', endDate: '2026-09-30', monthCycleDay: 1,
      accounts: [bank], transactions: history, recurringRules: [], categories, creditCards: [],
      affordabilitySettings: settings(), purchaseAmount: 1000,
    });
    expect(result.irregularSpending.medianIrregularSpend).toBe(4500);
    expect(result.irregularSpending.recommendedBuffer).toBe(5625);
    expect(result.projection.contingencyBuffer).toBe(5625);
  });

  it('returns a clear warning and zero automatic contingency when history is unavailable', () => {
    const result = projectAffordabilityWithHistory({
      asOfDate: '2026-08-12', endDate: '2026-09-30', monthCycleDay: 1,
      accounts: [bank], transactions: [], recurringRules: [], categories, creditCards: [],
      affordabilitySettings: settings(), purchaseAmount: 1000,
    });
    expect(result.irregularSpending.status).toBe('NO_HISTORY');
    expect(result.projection.contingencyBuffer).toBe(0);
    expect(result.planningWarnings.some(message => message.includes('history is unavailable'))).toBe(true);
  });

  it('uses a fixed contingency without requiring historical data', () => {
    const result = projectAffordabilityWithHistory({
      asOfDate: '2026-08-12', endDate: '2026-09-30', monthCycleDay: 1,
      accounts: [bank], transactions: [], recurringRules: [], categories, creditCards: [],
      affordabilitySettings: settings({ contingencyMode: 'FIXED', fixedContingencyAmount: 12000 }), purchaseAmount: 1000,
    });
    expect(result.irregularSpending.contingencySource).toBe('FIXED');
    expect(result.projection.contingencyBuffer).toBe(12000);
    expect(result.planningWarnings.some(message => message.includes('history is unavailable'))).toBe(false);
  });

  it('warns when safety preferences have not been explicitly reviewed', () => {
    const result = projectAffordabilityWithHistory({
      asOfDate: '2026-08-12', endDate: '2026-09-30', monthCycleDay: 1,
      accounts: [bank], transactions: history, recurringRules: [], categories, creditCards: [],
      affordabilitySettings: settings({ setupCompleted: false }), purchaseAmount: 1000,
    });
    expect(result.planningWarnings.some(message => message.includes('not been reviewed'))).toBe(true);
  });
});
''',
}

for path, content in files.items():
    target = Path(path)
    if target.exists():
        raise SystemExit(f"Refusing to overwrite existing file: {path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")

print("Affordability Phase 5 historical estimator applied.")
