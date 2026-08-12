import { describe, expect, it } from 'vitest';
import type { Account, Category, CreditCardInfo, RecurringRule, Transaction } from '../types';
import { projectAffordability } from './affordability';

const bank = (id: string, balance: number): Account => ({ id, name: id, type: 'asset', balance, group: 'Bank Account' });
const cash = (id: string, balance: number): Account => ({ id, name: id, type: 'asset', balance, group: 'Cash' });
const investment = (id: string, balance: number): Account => ({ id, name: id, type: 'asset', balance, group: 'Investment' });
const liability = (id: string, balance = 0, extra: Partial<Account> = {}): Account => ({ id, name: id, type: 'liability', balance, group: 'Loan', ...extra });

const category = (id: string, affordabilityClass: Category['affordabilityClass']): Category => ({
  id, name: id, icon: 'Tag', type: 'expense', affordabilityClass,
});

const tx = (partial: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date' | 'type'>): Transaction => ({
  title: partial.id,
  subtitle: '',
  category: '#general',
  icon: 'ShoppingBag',
  ...partial,
});

const rule = (partial: Partial<RecurringRule> & Pick<RecurringRule, 'id' | 'amount' | 'transactionType' | 'nextDueDate'>): RecurringRule => ({
  title: partial.id,
  frequency: 'MONTHLY',
  isActive: true,
  ...partial,
});

function run(overrides: Partial<Parameters<typeof projectAffordability>[0]> = {}) {
  return projectAffordability({
    asOfDate: '2026-08-12',
    endDate: '2026-09-30',
    accounts: [bank('bank', 40000)],
    transactions: [],
    recurringRules: [],
    categories: [
      category('general', 'NORMAL'),
      category('rent', 'COMMITTED'),
      category('sip', 'SAVINGS'),
    ],
    creditCards: [],
    settings: { plannedSavingsTarget: 0, contingencyBuffer: 0, protectedCashReserve: 0 },
    purchaseAmount: 0,
    ...overrides,
  });
}

describe('projectAffordability', () => {
  it('counts only liquid cash accounts as opening spendable cash', () => {
    const result = run({
      accounts: [bank('bank', 40000), cash('wallet', 5000), investment('fund', 60000), { id: 'house', name: 'House', type: 'asset', balance: 1000000, group: 'Physical Asset' }, liability('card', 10000)],
    });
    expect(result.openingCash).toBe(45000);
  });

  it('projects active recurring income and expenses inside the horizon', () => {
    const result = run({
      recurringRules: [
        rule({ id: 'salary', amount: 57000, transactionType: 'INCOME', account: 'bank', nextDueDate: '2026-09-01' }),
        rule({ id: 'rent-rule', amount: 20000, transactionType: 'EXPENSE', account: 'bank', category: 'rent', nextDueDate: '2026-09-05' }),
      ],
    });
    expect(result.expectedIncome).toBe(57000);
    expect(result.expectedExpenses).toBe(20000);
    expect(result.expensesByClass.COMMITTED).toBe(20000);
  });

  it('projects recurring expenses charged to a credit-card liability', () => {
    const cardAccount = liability('cc', 5000, { group: 'Credit Card' });
    const result = run({
      accounts: [bank('bank', 40000), cardAccount],
      recurringRules: [
        rule({ id: 'subscription-card', amount: 999, transactionType: 'EXPENSE', account: 'cc', fromAccountId: 'cc', category: 'general', nextDueDate: '2026-09-05' }),
      ],
    });
    expect(result.expectedExpenses).toBe(999);
    expect(result.expensesByClass.NORMAL).toBe(999);
  });

  it('does not treat transfers between liquid accounts as spending', () => {
    const result = run({
      accounts: [bank('bank', 40000), cash('wallet', 5000)],
      transactions: [tx({ id: 'move', amount: 10000, date: '2026-09-01T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'wallet', is_verified: 1 })],
    });
    expect(result.expectedExpenses).toBe(0);
    expect(result.otherCashInflows).toBe(0);
  });

  it('protects transfers to investments as scheduled savings', () => {
    const result = run({
      accounts: [bank('bank', 40000), investment('fund', 10000)],
      transactions: [tx({ id: 'sip-transfer', amount: 10000, date: '2026-09-01T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', category: 'sip', fromAccountId: 'bank', toAccountId: 'fund', is_verified: 1 })],
      settings: { plannedSavingsTarget: 5000, contingencyBuffer: 0, protectedCashReserve: 0 },
    });
    expect(result.scheduledSavings).toBe(10000);
    expect(result.plannedSavings).toBe(10000);
    expect(result.expectedExpenses).toBe(0);
  });

  it('keeps overdue pending recurring obligations in the projection until they are resolved', () => {
    const result = run({
      transactions: [tx({ id: 'overdue-rent', amount: 5000, date: '2026-08-10T12:00:00', dueDate: '2026-08-10', type: 'expense', transaction_type: 'EXPENSE', category: 'rent', account: 'bank', fromAccountId: 'bank', recurringRuleId: 'overdue-rule', isRecurring: true, is_verified: 0 })],
    });
    expect(result.expectedExpenses).toBe(5000);
  });

  it('does not double-count a recurring occurrence already generated by the ledger', () => {
    const result = run({
      transactions: [tx({ id: 'pending-rent', amount: 5000, date: '2026-09-01T12:00:00', dueDate: '2026-09-01', type: 'expense', transaction_type: 'EXPENSE', category: 'rent', account: 'bank', fromAccountId: 'bank', recurringRuleId: 'rent-rule', isRecurring: true, is_verified: 0 })],
      recurringRules: [rule({ id: 'rent-rule', amount: 5000, transactionType: 'EXPENSE', account: 'bank', category: 'rent', nextDueDate: '2026-09-01' })],
    });
    expect(result.expectedExpenses).toBe(5000);
  });

  it('includes a credit-card due as a committed future cash obligation', () => {
    const cardAccount = liability('cc', 12000, { group: 'Credit Card' });
    const card: CreditCardInfo = { id: 'cc', name: 'Card', balance: 12000, dueAmount: 8000, dueDate: '2026-09-10', billingCycleDay: 10, limit: 100000 };
    const result = run({ accounts: [bank('bank', 40000), cardAccount], creditCards: [card] });
    expect(result.expectedExpenses).toBe(8000);
    expect(result.expensesByClass.COMMITTED).toBe(8000);
  });

  it('uses loan EMI metadata as a fallback obligation when no explicit payment covers it', () => {
    const loan = liability('loan', 100000, { monthlyEMI: 5000, nextEMIDate: '2026-09-05', paymentFrequency: 'MONTHLY' });
    const result = run({ accounts: [bank('bank', 40000), loan] });
    expect(result.expectedExpenses).toBe(5000);
  });

  it('ignores opening balances and accounting adjustments in future spending', () => {
    const result = run({
      transactions: [
        tx({ id: 'opening', amount: 10000, date: '2026-09-01T12:00:00', type: 'income', transaction_type: 'OPENING_BALANCE', toAccountId: 'bank', isOpeningBalance: true, is_verified: 1 }),
        tx({ id: 'adjust', amount: 5000, date: '2026-09-02T12:00:00', type: 'expense', transaction_type: 'BALANCE_ADJUSTMENT', fromAccountId: 'bank', is_verified: 1 }),
      ],
    });
    expect(result.expectedIncome).toBe(0);
    expect(result.expectedExpenses).toBe(0);
  });

  it('classifies SAFE, RISKY, and NOT_AFFORDABLE by which protected pool the purchase consumes', () => {
    const base = {
      accounts: [bank('bank', 100000)],
      recurringRules: [rule({ id: 'known', amount: 35000, transactionType: 'EXPENSE' as const, account: 'bank', category: 'rent', nextDueDate: '2026-09-01' })],
      settings: { plannedSavingsTarget: 20000, contingencyBuffer: 10000, protectedCashReserve: 20000 },
    };
    const safe = run({ ...base, purchaseAmount: 12000 });
    const risky = run({ ...base, purchaseAmount: 18000 });
    const no = run({ ...base, purchaseAmount: 40000 });

    expect(safe.safePurchaseCapacity).toBe(15000);
    expect(safe.riskyPurchaseCapacity).toBe(25000);
    expect(safe.status).toBe('SAFE');
    expect(risky.status).toBe('RISKY');
    expect(risky.contingencyUsedByPurchase).toBe(3000);
    expect(risky.remainingContingency).toBe(7000);
    expect(no.status).toBe('NOT_AFFORDABLE');
    expect(no.protectedPlanShortfall).toBe(15000);
  });
});
