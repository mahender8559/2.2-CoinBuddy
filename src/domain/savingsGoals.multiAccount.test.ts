import { describe, expect, it } from 'vitest';
import type { Account, SavingsGoal } from '../types';
import {
  getGoalCurrentAmount,
  getGoalLinkedAccountIds,
  getProtectedGoalReserve,
  normalizeSavingsGoal,
} from './savingsGoals';

const accounts: Account[] = [
  { id: 'bank', name: 'Main Bank', type: 'asset', group: 'Bank Account', balance: 12000 },
  { id: 'savings', name: 'Savings', type: 'asset', group: 'Savings Account', balance: 8000 },
  { id: 'investment', name: 'Liquid Fund', type: 'asset', group: 'Investment', balance: 30000 },
  { id: 'card', name: 'Card', type: 'liability', group: 'Credit Card', balance: 5000 },
];

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return normalizeSavingsGoal({
    id: 'goal',
    name: 'Emergency Fund',
    type: 'EMERGENCY_FUND',
    targetAmount: 100000,
    monthlyContribution: 5000,
    linkedAccountIds: [],
    manualSavedAmount: 0,
    protectLinkedBalance: false,
    priority: 'HIGH',
    isActive: true,
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  });
}

describe('multi-account Goals', () => {
  it('migrates the legacy single linked account into the multi-account model', () => {
    const normalized = normalizeSavingsGoal({
      id: 'legacy',
      name: 'Legacy goal',
      targetAmount: 1000,
      linkedAccountId: 'bank',
    });
    expect(normalized.linkedAccountIds).toEqual(['bank']);
    expect(normalized.linkedAccountId).toBe('bank');
  });

  it('deduplicates linked account ids while preserving stable order', () => {
    const normalized = normalizeSavingsGoal({
      id: 'multi',
      name: 'Multi',
      targetAmount: 1000,
      linkedAccountIds: ['bank', 'savings', 'bank', ''],
      linkedAccountId: 'savings',
    });
    expect(getGoalLinkedAccountIds(normalized)).toEqual(['bank', 'savings']);
  });

  it('adds balances from every live linked asset account for Goal progress', () => {
    const multi = goal({ linkedAccountIds: ['bank', 'savings', 'investment'] });
    expect(getGoalCurrentAmount(multi, accounts, [])).toBe(50000);
  });

  it('ignores liability and missing links when calculating Goal progress', () => {
    const multi = goal({ linkedAccountIds: ['bank', 'card', 'missing'] });
    expect(getGoalCurrentAmount(multi, accounts, [])).toBe(12000);
  });

  it('protects every linked liquid account once across multiple Goals', () => {
    const first = goal({ id: 'first', linkedAccountIds: ['bank', 'savings'], protectLinkedBalance: true });
    const second = goal({ id: 'second', linkedAccountIds: ['savings', 'investment'], protectLinkedBalance: true });
    // Investment contributes to Goal progress but is intentionally excluded from
    // affordability liquid cash. Savings is linked twice but reserved once.
    expect(getProtectedGoalReserve([first, second], accounts)).toBe(20000);
  });
});
