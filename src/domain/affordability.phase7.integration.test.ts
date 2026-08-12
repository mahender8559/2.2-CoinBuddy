import { describe, expect, it } from 'vitest';
import type { Account, AffordabilitySettings, Category, CreditCardInfo, RecurringRule, Transaction } from '../types';
import { projectAffordabilityWithHistory } from './affordabilityPlanner';

const accounts: Account[] = [
  { id: 'bank', name: 'Primary Bank', type: 'asset', group: 'Bank Account', balance: 120000 },
  { id: 'cash', name: 'Cash', type: 'asset', group: 'Cash', balance: 5000 },
  { id: 'invest', name: 'Index Fund', type: 'asset', group: 'Investment', balance: 250000 },
  { id: 'card', name: 'Credit Card', type: 'liability', group: 'Credit Card', balance: 30000, limit: 100000 },
  { id: 'loan', name: 'Bike Loan', type: 'liability', group: 'Loan', balance: 300000, monthlyEMI: 15000, nextEMIDate: '2026-09-05', paymentFrequency: 'MONTHLY' },
];

const categories: Category[] = [
  { id: 'salary', name: 'Salary', icon: 'Banknote', type: 'income' },
  { id: 'rent', name: 'Rent', icon: 'Home', type: 'expense', affordabilityClass: 'COMMITTED' },
  { id: 'utilities', name: 'Utilities', icon: 'Zap', type: 'expense', affordabilityClass: 'NORMAL' },
  { id: 'savings', name: 'Investing', icon: 'Target', type: 'expense', affordabilityClass: 'SAVINGS' },
  { id: 'medical', name: 'Medical', icon: 'Heart', type: 'expense', affordabilityClass: 'IRREGULAR' },
];

const recurringRules: RecurringRule[] = [
  { id: 'salary-rule', title: 'Salary', amount: 80000, transactionType: 'INCOME', toAccountId: 'bank', category: 'salary', frequency: 'MONTHLY', nextDueDate: '2026-09-01', isActive: true, anchorDay: 1 },
  { id: 'rent-rule', title: 'Rent', amount: 25000, transactionType: 'EXPENSE', fromAccountId: 'bank', category: 'rent', frequency: 'MONTHLY', nextDueDate: '2026-09-03', isActive: true, anchorDay: 3 },
  { id: 'internet-rule', title: 'Internet', amount: 2000, transactionType: 'EXPENSE', fromAccountId: 'bank', category: 'utilities', frequency: 'MONTHLY', nextDueDate: '2026-09-06', isActive: true, anchorDay: 6 },
  { id: 'sip-rule', title: 'Monthly SIP', amount: 10000, transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'invest', category: 'savings', frequency: 'MONTHLY', nextDueDate: '2026-09-07', isActive: true, anchorDay: 7 },
];

const transaction = (value: Partial<Transaction> & Pick<Transaction, 'id' | 'title' | 'amount' | 'date' | 'category' | 'type'>): Transaction => ({
  subtitle: '', icon: 'ShoppingBag', is_verified: 1, transaction_type: value.type === 'income' ? 'INCOME' : value.type === 'transfer' ? 'TRANSFER' : 'EXPENSE', ...value,
});

const transactions: Transaction[] = [
  transaction({ id: 'past-grocery', title: 'Already reflected grocery', amount: 3000, date: '2026-08-10T12:00:00', category: 'utilities', type: 'expense', fromAccountId: 'bank' }),
  transaction({ id: 'rent-pending', title: 'Rent', amount: 25000, date: '2026-09-03T12:00:00', category: 'rent', type: 'expense', fromAccountId: 'bank', recurringRuleId: 'rent-rule', dueDate: '2026-09-03', isRecurring: true, is_verified: 0 }),
  transaction({ id: 'card-partial', title: 'Card payment', amount: 5000, date: '2026-09-10T12:00:00', category: 'rent', type: 'transfer', fromAccountId: 'bank', toAccountId: 'card' }),
  transaction({ id: 'loan-partial', title: 'Loan payment', amount: 5000, date: '2026-09-05T12:00:00', category: 'rent', type: 'transfer', fromAccountId: 'bank', toAccountId: 'loan' }),
];

const creditCards: CreditCardInfo[] = [
  { id: 'card', name: 'Credit Card', balance: 30000, dueAmount: 20000, dueDate: '2026-09-10', billingCycleDay: 20, limit: 100000 },
];

const settings = (overrides: Partial<AffordabilitySettings> = {}): AffordabilitySettings => ({
  version: 1,
  setupCompleted: true,
  monthlySavingsTarget: 20000,
  protectedCashReserve: 30000,
  contingencyMode: 'FIXED',
  fixedContingencyAmount: 15000,
  historicalMonths: 6,
  safetyLevel: 'BALANCED',
  ...overrides,
});

function plan(purchaseAmount: number) {
  return projectAffordabilityWithHistory({
    asOfDate: '2026-08-12',
    endDate: '2026-09-24',
    monthCycleDay: 25,
    accounts,
    transactions,
    recurringRules,
    categories,
    creditCards,
    affordabilitySettings: settings(),
    purchaseAmount,
  });
}

describe('affordability phase 7 realistic integration', () => {
  it('projects recurring income, commitments, savings, card dues and EMI fallback without double counting', () => {
    const result = plan(60000).projection;
    expect(result.status).toBe('SAFE');
    expect(result.openingCash).toBe(125000); // investment value must not be treated as spendable cash
    expect(result.expectedIncome).toBe(80000);
    expect(result.expectedExpenses).toBe(72000);
    expect(result.scheduledSavings).toBe(10000);
    expect(result.plannedSavings).toBe(20000);
    expect(result.expensesByClass.COMMITTED).toBe(70000);
    expect(result.expensesByClass.NORMAL).toBe(2000);
    expect(result.projectedOccurrenceCount).toBe(8);
    expect(result.projectedCashBeforeSafety).toBe(113000);
    expect(result.safePurchaseCapacity).toBe(68000);
    expect(result.riskyPurchaseCapacity).toBe(83000);
  });

  it('uses the contingency band for a risky purchase without touching the protected reserve', () => {
    const result = plan(75000).projection;
    expect(result.status).toBe('RISKY');
    expect(result.contingencyUsedByPurchase).toBe(7000);
    expect(result.remainingContingency).toBe(8000);
    expect(result.protectedPlanShortfall).toBe(0);
  });

  it('rejects a purchase that would spend through the protected cash reserve', () => {
    const result = plan(90000).projection;
    expect(result.status).toBe('NOT_AFFORDABLE');
    expect(result.contingencyUsedByPurchase).toBe(15000);
    expect(result.remainingContingency).toBe(0);
    expect(result.protectedPlanShortfall).toBe(7000);
  });
});
