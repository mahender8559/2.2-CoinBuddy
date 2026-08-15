import { describe, expect, it } from 'vitest';
import type { Account, RecurringRule, SavingsGoal } from '../types';
import { buildSmarterPlanningReport, compareDebtPrepayment, simulatePurchaseAcrossHorizons } from './smarterPlanning';

const cash: Account = { id: 'cash', name: 'Bank', type: 'asset', group: 'Bank', balance: 20_000 };
const investment: Account = { id: 'fund', name: 'Index Fund', type: 'asset', group: 'Investment', balance: 50_000 };
const home: Account = { id: 'home', name: 'Home', type: 'asset', group: 'Physical Asset', balance: 500_000 };

function rule(overrides: Partial<RecurringRule>): RecurringRule {
  return { id: 'rule', title: 'Rule', amount: 1_000, transactionType: 'EXPENSE', fromAccountId: 'cash', frequency: 'MONTHLY', nextDueDate: '2026-08-20', isActive: true, ...overrides };
}

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return { id: 'goal', name: 'Travel', type: 'TRAVEL', targetAmount: 24_000, targetDate: '2027-08-15', monthlyContribution: 2_000, manualSavedAmount: 0, protectLinkedBalance: false, priority: 'MEDIUM', isActive: true, createdAt: '2026-08-15', ...overrides };
}

describe('V3.7 smarter planning', () => {
  it('builds 7/30/90 day cash-flow forecasts without treating investments as cash', () => {
    const report = buildSmarterPlanningReport({
      asOfDate: '2026-08-15', accounts: [cash, investment, home], transactions: [], creditCards: [], savingsGoals: [],
      recurringRules: [
        rule({ id: 'salary', title: 'Salary', amount: 10_000, transactionType: 'INCOME', fromAccountId: undefined, toAccountId: 'cash', nextDueDate: '2026-08-18' }),
        rule({ id: 'rent', title: 'Rent', amount: 5_000, nextDueDate: '2026-08-20' }),
      ],
    });
    expect(report.forecasts[7].closingLiquidCash).toBe(25_000);
    expect(report.forecasts[30].closingLiquidCash).toBe(25_000);
    expect(report.moneyPosition.liquidCash).toBe(20_000);
    expect(report.moneyPosition.investedWealth).toBe(50_000);
    expect(report.moneyPosition.physicalWealth).toBe(500_000);
  });

  it('detects the first upcoming cash shortage and quantifies a purchase scenario', () => {
    const report = buildSmarterPlanningReport({ asOfDate: '2026-08-15', accounts: [{ ...cash, balance: 2_000 }], transactions: [], creditCards: [], savingsGoals: [], recurringRules: [rule({ amount: 5_000 })] });
    expect(report.forecasts[7].shortageDate).toBe('2026-08-20');
    expect(report.forecasts[7].shortageAmount).toBe(3_000);
    expect(simulatePurchaseAcrossHorizons(report, 1_000)[30].shortageAmount).toBe(4_000);
  });

  it('reports whether goal contributions can meet the target date', () => {
    const report = buildSmarterPlanningReport({ asOfDate: '2026-08-15', accounts: [cash], transactions: [], recurringRules: [], creditCards: [], savingsGoals: [goal({ monthlyContribution: 500 })] });
    expect(report.goals[0].requiredMonthlyContribution).toBeGreaterThan(500);
    expect(report.goals[0].feasibleByTarget).toBe(false);
    expect(report.warnings.some(value => value.includes('Travel'))).toBe(true);
  });

  it('compares reducing-balance debt payoff with an extra monthly payment', () => {
    const debt: Account = { id: 'loan', name: 'Loan', type: 'liability', balance: 100_000, interestRate: 12, monthlyEMI: 5_000, interestCalculationType: 'REDUCING' };
    const result = compareDebtPrepayment(debt, 2_000);
    expect(result.eligible).toBe(true);
    expect(result.acceleratedMonths).toBeLessThan(result.baselineMonths);
    expect(result.interestSaved).toBeGreaterThan(0);
  });
});
