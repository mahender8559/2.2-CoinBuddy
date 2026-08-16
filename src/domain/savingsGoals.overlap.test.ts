import { describe, expect, it } from 'vitest';
import type { SavingsGoal } from '../types';
import { getGoalAccountOverlaps, normalizeSavingsGoals } from './savingsGoals';

const goal = (id: string, name: string, linkedAccountIds: string[]): SavingsGoal => ({
  id,
  name,
  type: 'OTHER',
  targetAmount: 100_000,
  monthlyContribution: 0,
  linkedAccountIds,
  linkedAccountId: linkedAccountIds[0],
  manualSavedAmount: 0,
  protectLinkedBalance: false,
  priority: 'MEDIUM',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('savings goal overlap semantics', () => {
  it('reports when the same account is already used by another active goal', () => {
    const goals = [goal('emergency', 'Emergency Fund', ['savings']), goal('trip', 'Trip', ['travel'])];
    expect(getGoalAccountOverlaps(goals, 'trip', ['travel', 'savings'])).toEqual([
      { accountId: 'savings', goalId: 'emergency', goalName: 'Emergency Fund' },
    ]);
  });

  it('does not warn about the goal currently being edited or inactive goals', () => {
    const inactive = { ...goal('old', 'Old Goal', ['savings']), isActive: false };
    const current = goal('current', 'Current Goal', ['savings']);
    expect(getGoalAccountOverlaps([inactive, current], 'current', ['savings'])).toEqual([]);
  });

  it('preserves zero-target legacy goals but disables them instead of silently dropping them', () => {
    const normalized = normalizeSavingsGoals([{ id: 'legacy', name: 'Legacy Goal', targetAmount: 0, isActive: true }]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe('legacy');
    expect(normalized[0].isActive).toBe(false);
  });
});
