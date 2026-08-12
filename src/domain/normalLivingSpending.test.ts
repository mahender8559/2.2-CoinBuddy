import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '../types';
import { estimateNormalLivingSpending } from './normalLivingSpending';

const categories: Category[] = [
  { id: 'normal', name: 'Groceries', icon: 'ShoppingBag', type: 'expense', affordabilityClass: 'NORMAL' },
  { id: 'flex', name: 'Dining', icon: 'Utensils', type: 'expense', affordabilityClass: 'FLEXIBLE' },
  { id: 'irregular', name: 'Repairs', icon: 'Home', type: 'expense', affordabilityClass: 'IRREGULAR' },
  { id: 'income', name: 'Salary', icon: 'Target', type: 'income', affordabilityClass: 'NORMAL' },
];

function tx(id: string, date: string, amount: number, category: string, type: 'expense' | 'income' = 'expense'): Transaction {
  return {
    id,
    title: id,
    subtitle: '',
    amount,
    date: `${date}T12:00:00`,
    category,
    icon: 'ShoppingBag',
    type,
    transaction_type: type === 'income' ? 'INCOME' : 'EXPENSE',
    is_verified: 1,
  };
}

describe('normal living spending estimator', () => {
  it('uses completed financial cycles only and returns no estimate when history is unavailable', () => {
    const result = estimateNormalLivingSpending({
      asOfDate: '2026-08-12',
      monthCycleDay: 25,
      transactions: [tx('current-grocery', '2026-08-01', 4000, 'normal')],
      categories,
      historicalMonths: 6,
    });
    expect(result.estimateUsable).toBe(false);
    expect(result.confidence).toBe('NONE');
    expect(result.medianNormalSpend).toBe(0);
  });

  it('uses the median of observed completed cycles and ignores unobserved cycles', () => {
    const result = estimateNormalLivingSpending({
      asOfDate: '2026-08-12',
      monthCycleDay: 25,
      transactions: [
        tx('may-normal', '2026-05-10', 10000, 'normal'),
        tx('jun-normal', '2026-06-10', 12000, 'normal'),
        tx('jul-normal', '2026-07-10', 50000, 'normal'),
      ],
      categories,
      historicalMonths: 6,
    });
    expect(result.estimateUsable).toBe(true);
    expect(result.observedCycleCount).toBe(3);
    expect(result.medianNormalSpend).toBe(12000);
    expect(result.confidence).toBe('MEDIUM');
  });

  it('counts an observed cycle with activity but no NORMAL spending as zero', () => {
    const result = estimateNormalLivingSpending({
      asOfDate: '2026-08-12',
      monthCycleDay: 25,
      transactions: [
        tx('may-normal', '2026-05-10', 10000, 'normal'),
        tx('jun-flex', '2026-06-10', 3000, 'flex'),
        tx('jul-normal', '2026-07-10', 8000, 'normal'),
      ],
      categories,
      historicalMonths: 6,
    });
    expect(result.medianNormalSpend).toBe(8000);
  });

  it('excludes FLEXIBLE and IRREGULAR expense classes from the normal forecast', () => {
    const result = estimateNormalLivingSpending({
      asOfDate: '2026-08-12',
      monthCycleDay: 25,
      transactions: [
        tx('normal', '2026-07-10', 7000, 'normal'),
        tx('flex', '2026-07-11', 9000, 'flex'),
        tx('irregular', '2026-07-12', 11000, 'irregular'),
      ],
      categories,
      historicalMonths: 3,
    });
    expect(result.medianNormalSpend).toBe(7000);
  });

  it('ignores pending/unconfirmed transactions when building history', () => {
    const pending = tx('pending', '2026-07-10', 20000, 'normal');
    pending.is_verified = 0;
    const result = estimateNormalLivingSpending({
      asOfDate: '2026-08-12',
      monthCycleDay: 25,
      transactions: [pending],
      categories,
      historicalMonths: 3,
    });
    expect(result.estimateUsable).toBe(false);
  });
});
