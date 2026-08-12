import { describe, expect, it } from 'vitest';
import { buildUpcomingMoneyProjection } from './upcomingMoney';
import type { Account, RecurringRule, SavingsGoal, Transaction } from '../types';

const accounts: Account[] = [
  { id: 'bank', name: 'Bank', type: 'asset', group: 'Bank Account', balance: 50000 },
  { id: 'invest', name: 'Mutual Fund', type: 'asset', group: 'Investment', balance: 10000 },
  { id: 'loan', name: 'Loan', type: 'liability', group: 'Loan', balance: 20000 },
];
const rule = (overrides: Partial<RecurringRule>): RecurringRule => ({ id: 'r', title: 'Rule', amount: 1000, transactionType: 'EXPENSE', fromAccountId: 'bank', frequency: 'MONTHLY', nextDueDate: '2026-09-01', isActive: true, ...overrides });
const goal: SavingsGoal = { id: 'g1', name: 'Laptop', type: 'PURCHASE', targetAmount: 80000, monthlyContribution: 5000, manualSavedAmount: 0, protectLinkedBalance: false, priority: 'MEDIUM', isActive: true, createdAt: '2026-01-01' };

function project(recurringRules: RecurringRule[], transactions: Transaction[] = [], goals: SavingsGoal[] = []) {
  return buildUpcomingMoneyProjection({ asOfDate: '2026-08-12', startDate: '2026-08-25', endDate: '2026-09-24', accounts, transactions, recurringRules, creditCards: [], savingsGoals: goals });
}

describe('Upcoming Money projection', () => {
  it('separates income, obligations, savings and neutral liquid transfers', () => {
    const result = project([
      rule({ id: 'salary', title: 'Salary', transactionType: 'INCOME', fromAccountId: undefined, toAccountId: 'bank', amount: 60000 }),
      rule({ id: 'rent', title: 'Rent', amount: 15000 }),
      rule({ id: 'sip', title: 'SIP', transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'invest', amount: 10000 }),
      rule({ id: 'move', title: 'Move cash', transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'bank', amount: 1000 }),
    ]);
    expect(result.totals.expectedIncome).toBe(60000);
    expect(result.totals.obligations).toBe(15000);
    expect(result.totals.savings).toBe(10000);
    expect(result.totals.transfers).toBe(1000);
    expect(result.totals.projectedFreeCash).toBe(85000);
  });

  it('does not double count a generated pending recurring occurrence', () => {
    const transactions: Transaction[] = [{ id: 'p1', title: 'Rent', subtitle: '', amount: -15000, date: '2026-09-01T12:00:00.000Z', category: '#rent', icon: 'Home', type: 'expense', fromAccountId: 'bank', is_verified: 0, isRecurring: true, recurringRuleId: 'rent', dueDate: '2026-09-01' }];
    const result = project([rule({ id: 'rent', title: 'Rent', amount: 15000 })], transactions);
    expect(result.items.filter(item => item.title === 'Rent')).toHaveLength(1);
    expect(result.items[0].status).toBe('NEEDS_CONFIRMATION');
  });

  it('protects uncovered active goal contributions without double counting Goal-linked schedules', () => {
    const result = project([rule({ id: 'goal-rule', title: 'Laptop saving', transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'invest', amount: 3000, goalId: 'g1' })], [], [goal]);
    expect(result.items.filter(item => item.kind === 'SAVINGS').reduce((sum, item) => sum + item.amount, 0)).toBe(5000);
    expect(result.items.some(item => item.source === 'GOAL' && item.amount === 2000)).toBe(true);
  });
});
