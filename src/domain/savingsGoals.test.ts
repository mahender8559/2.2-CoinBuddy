import { describe, expect, it } from 'vitest';
import type { Account, SavingsGoal } from '../types';
import { getActiveGoalMonthlyContribution, getGoalCurrentAmount, getProtectedGoalReserve, normalizeSavingsGoals } from './savingsGoals';

const bank: Account = { id: 'bank', name: 'Emergency Savings', type: 'asset', group: 'Bank Account', balance: 60000 };
const investment: Account = { id: 'invest', name: 'Index Fund', type: 'asset', group: 'Investment', balance: 120000 };

const goal = (overrides: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: 'goal-1',
  name: 'Emergency Fund',
  type: 'EMERGENCY_FUND',
  targetAmount: 300000,
  monthlyContribution: 10000,
  linkedAccountId: 'bank',
  manualSavedAmount: 0,
  protectLinkedBalance: true,
  priority: 'HIGH',
  isActive: true,
  createdAt: '2026-08-12T00:00:00.000Z',
  ...overrides,
});

describe('savings goals', () => {
  it('tracks progress from a linked account instead of manual amount', () => {
    expect(getGoalCurrentAmount(goal({ manualSavedAmount: 999999 }), [bank])).toBe(60000);
  });

  it('protects only linked liquid accounts as emergency reserve', () => {
    const goals = [goal(), goal({ id: 'goal-2', linkedAccountId: 'invest' })];
    expect(getProtectedGoalReserve(goals, [bank, investment])).toBe(60000);
  });

  it('allows an emergency Goal to track an Investment without making it affordability cash', () => {
    const investmentGoal = goal({ linkedAccountId: 'invest', protectLinkedBalance: true });
    expect(getGoalCurrentAmount(investmentGoal, [bank, investment])).toBe(120000);
    expect(getProtectedGoalReserve([investmentGoal], [bank, investment])).toBe(0);
  });

  it('does not double count the same protected account across goals', () => {
    expect(getProtectedGoalReserve([goal(), goal({ id: 'goal-2' })], [bank])).toBe(60000);
  });

  it('sums active monthly goal contributions only', () => {
    expect(getActiveGoalMonthlyContribution([goal(), goal({ id: 'goal-2', monthlyContribution: 5000, isActive: false })])).toBe(10000);
  });

  it('normalizes malformed stored goals safely', () => {
    const goals = normalizeSavingsGoals([{ id: 'x', name: '', targetAmount: -5, monthlyContribution: -2 }, { id: 'y', name: 'Laptop', targetAmount: 80000 }]);
    expect(goals).toHaveLength(1);
    expect(goals[0].name).toBe('Laptop');
  });
});
