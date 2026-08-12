import { describe, expect, it } from 'vitest';
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
