import { describe, expect, it } from 'vitest';
import type { Account, AffordabilitySettings, Category, RecurringRule, Transaction } from '../types';
import { projectAffordabilityWithHistory } from './affordabilityPlanner';

const bank: Account = { id: 'bank', name: 'Bank', type: 'asset', balance: 50000, group: 'Bank Account' };
const normal: Category = { id: 'normal', name: 'Groceries', icon: 'ShoppingBag', type: 'expense', affordabilityClass: 'NORMAL' };
const income: Category = { id: 'income', name: 'Salary', icon: 'Target', type: 'income', affordabilityClass: 'NORMAL' };
const irregular: Category = { id: 'irregular', name: 'Repairs', icon: 'Home', type: 'expense', affordabilityClass: 'IRREGULAR' };
const settings: AffordabilitySettings = {
  version: 1,
  setupCompleted: true,
  monthlySavingsTarget: 0,
  protectedCashReserve: 0,
  contingencyMode: 'FIXED',
  fixedContingencyAmount: 0,
  historicalMonths: 6,
  safetyLevel: 'BALANCED',
};

function expense(id: string, date: string, amount: number): Transaction {
  return {
    id,
    title: id,
    subtitle: '',
    amount,
    date: `${date}T12:00:00`,
    category: 'normal',
    icon: 'ShoppingBag',
    type: 'expense',
    transaction_type: 'EXPENSE',
    account: 'bank',
    fromAccountId: 'bank',
    is_verified: 1,
  };
}

function recurringNormal(amount: number): RecurringRule {
  return {
    id: 'normal-rule',
    title: 'Recurring groceries',
    amount,
    transactionType: 'EXPENSE',
    account: 'bank',
    fromAccountId: 'bank',
    category: 'normal',
    frequency: 'MONTHLY',
    nextDueDate: '2026-09-05',
    isActive: true,
  };
}

describe('normal living expense affordability integration', () => {
  it('protects the historical NORMAL median without double counting already scheduled NORMAL spend', () => {
    const result = projectAffordabilityWithHistory({
      asOfDate: '2026-08-12',
      endDate: '2026-09-24',
      monthCycleDay: 25,
      accounts: [bank],
      transactions: [
        expense('may', '2026-05-10', 8000),
        expense('jun', '2026-06-10', 10000),
        expense('jul', '2026-07-10', 12000),
      ],
      recurringRules: [recurringNormal(3000)],
      categories: [normal, income, irregular],
      creditCards: [],
      purchaseAmount: 0,
      affordabilitySettings: settings,
    });

    expect(result.normalLivingSpending.medianNormalSpend).toBe(10000);
    expect(result.projection.expensesByClass.NORMAL).toBe(3000);
    expect(result.projection.normalLivingExpenseForecast).toBe(7000);
    expect(result.projection.expectedExpenses).toBe(3000);
    expect(result.projection.safePurchaseCapacity).toBe(40000);
  });

  it('does not invent a normal living forecast when no completed cycle is available', () => {
    const result = projectAffordabilityWithHistory({
      asOfDate: '2026-08-12',
      endDate: '2026-09-24',
      monthCycleDay: 25,
      accounts: [bank],
      transactions: [expense('current', '2026-08-01', 5000)],
      recurringRules: [],
      categories: [normal, income, irregular],
      creditCards: [],
      purchaseAmount: 0,
      affordabilitySettings: settings,
    });

    expect(result.normalLivingSpending.estimateUsable).toBe(false);
    expect(result.projection.normalLivingExpenseForecast).toBe(0);
    expect(result.planningWarnings.some(warning => warning.includes('Normal living expenses are not estimated yet'))).toBe(true);
  });
});
