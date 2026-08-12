import { describe, expect, it } from 'vitest';
import type { Account, AffordabilitySettings, SavingsGoal } from '../types';
import { projectAffordabilityWithHistory } from './affordabilityPlanner';

const accounts: Account[] = [
  { id: 'bank', name: 'Main Bank', type: 'asset', group: 'Bank Account', balance: 100000 },
  { id: 'emergency', name: 'Emergency Savings', type: 'asset', group: 'Savings Account', balance: 30000 },
];

const settings: AffordabilitySettings = {
  version: 1,
  setupCompleted: true,
  monthlySavingsTarget: 5000,
  protectedCashReserve: 10000,
  contingencyMode: 'FIXED',
  fixedContingencyAmount: 0,
  historicalMonths: 6,
  safetyLevel: 'BALANCED',
};

const goal: SavingsGoal = {
  id: 'goal', name: 'Emergency Fund', type: 'EMERGENCY_FUND', targetAmount: 100000,
  monthlyContribution: 15000, linkedAccountId: 'emergency', manualSavedAmount: 0,
  protectLinkedBalance: true, priority: 'HIGH', isActive: true, createdAt: '2026-08-12T00:00:00.000Z',
};

describe('affordability goal integration', () => {
  it('uses active goal contributions as a minimum savings target and linked emergency cash as reserve', () => {
    const result = projectAffordabilityWithHistory({
      asOfDate: '2026-08-12', endDate: '2026-09-24', monthCycleDay: 25,
      accounts, transactions: [], recurringRules: [], categories: [], purchaseAmount: 1,
      affordabilitySettings: settings, savingsGoals: [goal],
    });
    expect(result.goalSummary.monthlyContributionTarget).toBe(15000);
    expect(result.goalSummary.protectedReserve).toBe(30000);
    expect(result.projection.plannedSavings).toBe(15000);
    expect(result.projection.protectedCashReserve).toBe(30000);
    expect(result.projection.safePurchaseCapacity).toBe(85000);
  });
});
