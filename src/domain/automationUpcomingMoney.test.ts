import { describe, expect, it } from 'vitest';
import type { Account, RecurringRule } from '../types';
import { buildUpcomingMoneyProjection } from './upcomingMoney';

const bank: Account = { id: 'bank', name: 'Bank', type: 'asset', group: 'Bank Account', balance: 20_000 };

const goalRule: RecurringRule = {
  id: 'managed-goal',
  title: 'Travel contribution',
  amount: 5_000,
  transactionType: 'EXPENSE',
  account: 'bank',
  fromAccountId: 'bank',
  category: '#savings',
  frequency: 'MONTHLY',
  nextDueDate: '2026-08-15',
  isActive: true,
  goalId: 'goal',
};

describe('V3.8 automation planning integration', () => {
  it('classifies an unlinked managed Goal expense as savings rather than ordinary obligation', () => {
    const result = buildUpcomingMoneyProjection({
      asOfDate: '2026-08-15',
      startDate: '2026-08-15',
      endDate: '2026-08-31',
      accounts: [bank],
      transactions: [],
      recurringRules: [goalRule],
      creditCards: [],
      savingsGoals: [],
    });
    expect(result.totals.savings).toBe(5_000);
    expect(result.totals.obligations).toBe(0);
    expect(result.items[0].kind).toBe('SAVINGS');
  });
});
