import { describe, expect, it } from 'vitest';
import type { Account, Category, CreditCardInfo, RecurringRule, Transaction } from '../types';
import { projectAffordability } from './affordability';

const account = (id: string, type: Account['type'], balance: number, group: string, extra: Partial<Account> = {}): Account => ({
  id, name: id, type, balance, group, ...extra,
});
const bank = (id: string, balance: number, extra: Partial<Account> = {}) => account(id, 'asset', balance, 'Bank Account', extra);
const investment = (id: string, balance: number) => account(id, 'asset', balance, 'Investment');
const physical = (id: string, balance: number) => account(id, 'asset', balance, 'Physical Asset');
const liability = (id: string, balance = 0, extra: Partial<Account> = {}) => account(id, 'liability', balance, extra.group ?? 'Loan', extra);

const categories: Category[] = [
  { id: 'general', name: 'General', icon: 'Tag', type: 'expense', affordabilityClass: 'NORMAL' },
  { id: 'rent', name: 'Rent', icon: 'Home', type: 'expense', affordabilityClass: 'COMMITTED' },
  { id: 'sip', name: 'SIP', icon: 'Target', type: 'expense', affordabilityClass: 'SAVINGS' },
];

const tx = (partial: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date' | 'type'>): Transaction => ({
  title: partial.id,
  subtitle: '',
  category: '#general',
  icon: 'ShoppingBag',
  is_verified: 1,
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
    accounts: [bank('bank', 50000)],
    transactions: [],
    recurringRules: [],
    categories,
    creditCards: [],
    settings: { plannedSavingsTarget: 0, contingencyBuffer: 0, protectedCashReserve: 0 },
    purchaseAmount: 0,
    ...overrides,
  });
}

describe('affordability Phase 3 de-duplication and ledger edge cases', () => {
  it('counts a credit-card purchase once through the card payment, not again as immediate cash spending', () => {
    const cc = liability('cc', 12000, { group: 'Credit Card' });
    const card: CreditCardInfo = { id: 'cc', name: 'Card', balance: 12000, dueAmount: 12000, dueDate: '2026-09-10', billingCycleDay: 10, limit: 100000 };
    const result = run({
      accounts: [bank('bank', 50000), cc],
      creditCards: [card],
      transactions: [
        tx({ id: 'card-purchase', amount: 5000, date: '2026-09-01T12:00:00', type: 'expense', transaction_type: 'EXPENSE', account: 'cc', fromAccountId: 'cc' }),
        tx({ id: 'card-payment', amount: 12000, date: '2026-09-10T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'cc' }),
      ],
    });
    expect(result.expectedExpenses).toBe(12000);
    expect(result.expensesByClass.COMMITTED).toBe(12000);
  });

  it('protects unbilled credit-card outstanding even when due amount is zero', () => {
    const cc = liability('cc', 6000, { group: 'Credit Card' });
    const card: CreditCardInfo = { id: 'cc', name: 'Card', balance: 6000, dueAmount: 0, dueDate: '2026-10-10', billingCycleDay: 10, limit: 100000 };
    const result = run({ accounts: [bank('bank', 50000), cc], creditCards: [card] });
    expect(result.creditCardOutstandingReserve).toBe(6000);
    expect(result.expectedExpenses).toBe(6000);
    expect(result.safePurchaseCapacity).toBe(44000);
  });

  it('subtracts scheduled card payments from the outstanding reserve instead of double counting them', () => {
    const cc = liability('cc', 6000, { group: 'Credit Card' });
    const card: CreditCardInfo = { id: 'cc', name: 'Card', balance: 6000, dueAmount: 0, dueDate: '2026-10-10', billingCycleDay: 10, limit: 100000 };
    const result = run({
      accounts: [bank('bank', 50000), cc],
      creditCards: [card],
      transactions: [tx({ id: 'scheduled-card-payment', amount: 2000, date: '2026-09-10T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'cc' })],
    });
    expect(result.creditCardOutstandingReserve).toBe(4000);
    expect(result.expectedExpenses).toBe(6000);
  });

  it('tops up only the unpaid remainder when an explicit card payment is smaller than the amount due', () => {
    const cc = liability('cc', 12000, { group: 'Credit Card' });
    const card: CreditCardInfo = { id: 'cc', name: 'Card', balance: 12000, dueAmount: 12000, dueDate: '2026-09-10', billingCycleDay: 10, limit: 100000 };
    const result = run({
      accounts: [bank('bank', 50000), cc],
      creditCards: [card],
      transactions: [tx({ id: 'partial-card-payment', amount: 5000, date: '2026-09-10T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'cc' })],
    });
    expect(result.expectedExpenses).toBe(12000);
    expect(result.expensesByClass.COMMITTED).toBe(12000);
  });

  it('does not double-count loan EMI metadata when a recurring EMI transfer already covers the due date', () => {
    const loan = liability('loan', 100000, { monthlyEMI: 5000, nextEMIDate: '2026-09-05', paymentFrequency: 'MONTHLY' });
    const result = run({
      accounts: [bank('bank', 50000), loan],
      recurringRules: [rule({ id: 'emi-rule', amount: 5000, transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'loan', nextDueDate: '2026-09-05' })],
    });
    expect(result.expectedExpenses).toBe(5000);
    expect(result.expensesByClass.COMMITTED).toBe(5000);
  });

  it('adds only the uncovered part of an EMI when the explicit scheduled payment is partial', () => {
    const loan = liability('loan', 100000, { monthlyEMI: 5000, nextEMIDate: '2026-09-05', paymentFrequency: 'MONTHLY' });
    const result = run({
      accounts: [bank('bank', 50000), loan],
      recurringRules: [rule({ id: 'partial-emi', amount: 3000, transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'loan', nextDueDate: '2026-09-05' })],
    });
    expect(result.expectedExpenses).toBe(5000);
  });

  it('does not double-count a recurring rule when that exact occurrence is already generated', () => {
    const result = run({
      transactions: [tx({ id: 'generated-rent', amount: 5000, date: '2026-09-01T12:00:00', dueDate: '2026-09-01', type: 'expense', transaction_type: 'EXPENSE', category: 'rent', account: 'bank', fromAccountId: 'bank', recurringRuleId: 'rent-rule', isRecurring: true, is_verified: 0 })],
      recurringRules: [rule({ id: 'rent-rule', amount: 5000, transactionType: 'EXPENSE', account: 'bank', category: 'rent', nextDueDate: '2026-09-01' })],
    });
    expect(result.expectedExpenses).toBe(5000);
  });

  it('treats transfers between the users own liquid accounts as net-zero cash movement', () => {
    const result = run({
      accounts: [bank('bank', 50000), account('wallet', 'asset', 5000, 'Cash')],
      transactions: [tx({ id: 'own-transfer', amount: 10000, date: '2026-09-01T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'wallet' })],
    });
    expect(result.expectedExpenses).toBe(0);
    expect(result.otherCashInflows).toBe(0);
  });

  it('excludes opening balances from projected income and spending', () => {
    const result = run({ transactions: [tx({ id: 'opening', amount: 10000, date: '2026-09-01T12:00:00', type: 'income', transaction_type: 'OPENING_BALANCE', toAccountId: 'bank', isOpeningBalance: true })] });
    expect(result.expectedIncome).toBe(0);
    expect(result.expectedExpenses).toBe(0);
  });

  it('excludes market adjustments from projected income and spending', () => {
    const result = run({ transactions: [tx({ id: 'market', amount: 10000, date: '2026-09-01T12:00:00', type: 'income', transaction_type: 'MARKET_ADJUSTMENT', toAccountId: 'bank' })] });
    expect(result.expectedIncome).toBe(0);
    expect(result.expectedExpenses).toBe(0);
  });

  it('excludes balance adjustments from projected income and spending', () => {
    const result = run({ transactions: [tx({ id: 'balance-adjustment', amount: 10000, date: '2026-09-01T12:00:00', type: 'expense', transaction_type: 'BALANCE_ADJUSTMENT', fromAccountId: 'bank' })] });
    expect(result.expectedIncome).toBe(0);
    expect(result.expectedExpenses).toBe(0);
  });

  it('keeps an unconfirmed recurring obligation reserved even when it is overdue', () => {
    const result = run({ transactions: [tx({ id: 'pending', amount: 7000, date: '2026-08-05T12:00:00', dueDate: '2026-08-05', type: 'expense', transaction_type: 'EXPENSE', category: 'rent', account: 'bank', fromAccountId: 'bank', recurringRuleId: 'pending-rule', isRecurring: true, is_verified: 0 })] });
    expect(result.expectedExpenses).toBe(7000);
  });

  it('does not count investment balances as opening spendable cash and protects a transfer into investment as savings', () => {
    const result = run({
      accounts: [bank('bank', 50000), investment('fund', 100000)],
      transactions: [tx({ id: 'invest', amount: 10000, date: '2026-09-01T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', category: 'sip', fromAccountId: 'bank', toAccountId: 'fund' })],
    });
    expect(result.openingCash).toBe(50000);
    expect(result.scheduledSavings).toBe(10000);
    expect(result.expectedExpenses).toBe(0);
  });

  it('does not count physical-asset value as opening spendable cash', () => {
    const result = run({ accounts: [bank('bank', 50000), physical('house', 2500000)] });
    expect(result.openingCash).toBe(50000);
  });

  it('ignores archived accounts, including stale archived credit-card metadata', () => {
    const archivedBank = bank('old-bank', 90000, { is_archived: 1 });
    const archivedCard = liability('old-card', 0, { group: 'Credit Card', is_archived: 1 });
    const staleCard: CreditCardInfo = { id: 'old-card', name: 'Old Card', balance: 0, dueAmount: 15000, dueDate: '2026-09-10', billingCycleDay: 10, limit: 100000 };
    const result = run({ accounts: [bank('bank', 50000), archivedBank, archivedCard], creditCards: [staleCard] });
    expect(result.openingCash).toBe(50000);
    expect(result.expectedExpenses).toBe(0);
  });
});
