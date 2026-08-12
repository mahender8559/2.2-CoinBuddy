import { describe, expect, it } from 'vitest';
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
