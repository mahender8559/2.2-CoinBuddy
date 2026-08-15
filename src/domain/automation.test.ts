import { describe, expect, it } from 'vitest';
import type { Account, CreditCardInfo, RecurringRule, SavingsGoal, Transaction } from '../types';
import {
  buildAutomationCandidates,
  buildManagedRecurringTransaction,
  buildPendingConfirmationSummary,
  buildTransactionMetadataSuggestion,
  getManagedRuleSyncPlan,
  managedAutomationMarker,
} from './automation';

const bank: Account = { id: 'bank', name: 'Bank', type: 'asset', group: 'Bank Account', balance: 50_000 };
const investment: Account = { id: 'fund', name: 'Fund', type: 'asset', group: 'Investment', balance: 25_000 };
const loan: Account = { id: 'loan', name: 'Car Loan', type: 'liability', group: 'Bank Loan', balance: 200_000, monthlyEMI: 12_000, nextEMIDate: '2026-08-20', paymentFrequency: 'MONTHLY', interestRate: 10 };
const cardAccount: Account = { id: 'card', name: 'Visa', type: 'liability', group: 'Credit Card', balance: 8_000 };
const card: CreditCardInfo = { id: 'card', name: 'Visa', balance: 8_000, dueAmount: 6_000, dueDate: '2026-08-22', billingCycleDay: 5, limit: 100_000 };
const goal: SavingsGoal = { id: 'goal', name: 'Trip', type: 'TRAVEL', targetAmount: 100_000, monthlyContribution: 5_000, manualSavedAmount: 0, protectLinkedBalance: false, priority: 'MEDIUM', isActive: true, createdAt: '2026-01-01' };

function recurring(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return { id: 'rule', title: 'Rule', amount: 1_000, transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'loan', frequency: 'MONTHLY', nextDueDate: '2026-08-20', isActive: true, ...overrides };
}

function state(overrides: Partial<Parameters<typeof buildAutomationCandidates>[0]> = {}) {
  return { accounts: [bank, investment, loan, cardAccount], creditCards: [card], savingsGoals: [goal], recurringRules: [], asOfDate: '2026-08-15', ...overrides };
}

describe('V3.8 automation domain', () => {
  it('builds loan, card and unlinked Goal candidates without fractionalizing the lender EMI', () => {
    const candidates = buildAutomationCandidates(state());
    expect(candidates.map(item => item.kind)).toEqual(['LOAN_EMI', 'CREDIT_CARD_STATEMENT', 'GOAL_CONTRIBUTION']);
    expect(candidates.find(item => item.kind === 'LOAN_EMI')?.amount).toBe(12_000);
    expect(candidates.find(item => item.kind === 'GOAL_CONTRIBUTION')?.transactionType).toBe('EXPENSE');
  });

  it('uses a real linked investment account for Goal transfers and never invents a Goal account', () => {
    const linked = { ...goal, linkedAccountId: 'fund' };
    const candidate = buildAutomationCandidates(state({ savingsGoals: [linked] })).find(item => item.kind === 'GOAL_CONTRIBUTION')!;
    const template = buildManagedRecurringTransaction(candidate, 'bank', [bank, investment, loan, cardAccount]);
    expect(template.type).toBe('transfer');
    expect(template.fromAccountId).toBe('bank');
    expect(template.toAccountId).toBe('fund');
    expect(template.goalId).toBe('goal');
  });

  it('creates an unlinked Goal schedule as a Goal-linked expense from the funding account', () => {
    const candidate = buildAutomationCandidates(state()).find(item => item.kind === 'GOAL_CONTRIBUTION')!;
    const template = buildManagedRecurringTransaction(candidate, 'bank', [bank, investment, loan, cardAccount]);
    expect(template.type).toBe('expense');
    expect(template.account).toBe('bank');
    expect(template.fromAccountId).toBe('bank');
    expect(template.toAccountId).toBeUndefined();
    expect(template.goalId).toBe('goal');
    expect(template.is_verified).toBe(0);
  });

  it('suppresses candidates already covered by equivalent manual recurring rules', () => {
    const existing = [
      recurring({ id: 'loan-rule', toAccountId: 'loan' }),
      recurring({ id: 'card-rule', toAccountId: 'card' }),
      recurring({ id: 'goal-rule', transactionType: 'EXPENSE', toAccountId: undefined, account: 'bank', goalId: 'goal' }),
    ];
    expect(buildAutomationCandidates(state({ recurringRules: existing }))).toEqual([]);
  });

  it('rejects incomplete automation configuration and self-transfers', () => {
    expect(buildAutomationCandidates(state({ accounts: [bank, cardAccount], creditCards: [{ ...card, dueAmount: 0 }], savingsGoals: [{ ...goal, monthlyContribution: 0 }] }))).toEqual([]);
    const linked = { ...goal, linkedAccountId: 'bank' };
    const candidate = buildAutomationCandidates(state({ savingsGoals: [linked] })).find(item => item.kind === 'GOAL_CONTRIBUTION')!;
    expect(() => buildManagedRecurringTransaction(candidate, 'bank', [bank, investment, loan, cardAccount])).toThrow(/different/);
  });

  it('synchronizes and pauses managed credit-card schedules as statement data changes', () => {
    const rule = recurring({ id: 'managed-card', title: 'Visa statement payment', amount: 5_000, toAccountId: 'card', notes: managedAutomationMarker('CREDIT_CARD_STATEMENT', 'card') });
    const updated = getManagedRuleSyncPlan(rule, { accounts: [bank, cardAccount], creditCards: [card], savingsGoals: [] });
    expect(updated.action).toBe('UPDATE');
    if (updated.action === 'UPDATE') expect(updated.rule.amount).toBe(6_000);

    const paused = getManagedRuleSyncPlan(rule, { accounts: [bank, cardAccount], creditCards: [{ ...card, dueAmount: 0 }], savingsGoals: [] });
    expect(paused.action).toBe('UPDATE');
    if (paused.action === 'UPDATE') expect(paused.rule.isActive).toBe(false);
  });

  it('deletes a managed Goal schedule when the Goal is removed but otherwise preserves the rule identity', () => {
    const rule = recurring({ id: 'managed-goal', title: 'Trip contribution', transactionType: 'EXPENSE', account: 'bank', toAccountId: undefined, goalId: 'goal', notes: managedAutomationMarker('GOAL_CONTRIBUTION', 'goal') });
    expect(getManagedRuleSyncPlan(rule, { accounts: [bank], creditCards: [], savingsGoals: [] }).action).toBe('DELETE');
    const plan = getManagedRuleSyncPlan(rule, { accounts: [bank], creditCards: [], savingsGoals: [{ ...goal, monthlyContribution: 7_500 }] });
    expect(plan.action).toBe('UPDATE');
    if (plan.action === 'UPDATE') {
      expect(plan.rule.id).toBe('managed-goal');
      expect(plan.rule.amount).toBe(7_500);
    }
  });

  it('suggests metadata only from verified history with the same normalized title and type', () => {
    const transactions: Transaction[] = [
      { id: '1', title: 'Coffee Shop', subtitle: '', amount: 300, date: '2026-08-10T12:00:00Z', category: '#food', icon: 'ShoppingBag', type: 'expense', account: 'bank', fromAccountId: 'bank', eventId: 'outing', is_verified: 1 },
      { id: '2', title: ' coffee-shop ', subtitle: '', amount: 250, date: '2026-08-09T12:00:00Z', category: '#food', icon: 'ShoppingBag', type: 'expense', account: 'bank', fromAccountId: 'bank', eventId: 'outing', is_verified: 1 },
      { id: '3', title: 'Coffee Shop', subtitle: '', amount: 280, date: '2026-08-11T12:00:00Z', category: '#other', icon: 'ShoppingBag', type: 'expense', account: 'bank', is_verified: 0 },
      { id: '4', title: 'Coffee Shop', subtitle: '', amount: 999, date: '2026-08-08T12:00:00Z', category: '#salary', icon: 'Banknote', type: 'income', account: 'bank', is_verified: 1 },
    ];
    const suggestion = buildTransactionMetadataSuggestion({ title: 'COFFEE shop', type: 'expense', transactions });
    expect(suggestion?.matchCount).toBe(2);
    expect(suggestion?.category).toBe('#food');
    expect(suggestion?.accountId).toBe('bank');
    expect(suggestion?.eventId).toBe('outing');
  });

  it('summarizes due and overdue scheduled confirmations without treating future entries as actionable', () => {
    const transactions: Transaction[] = [
      { id: 'old', title: 'Old', subtitle: '', amount: 1, date: '2026-08-10T12:00:00Z', category: '#x', icon: 'RefreshCw', type: 'expense', is_verified: 0, recurringRuleId: 'r1', dueDate: '2026-08-10' },
      { id: 'today', title: 'Today', subtitle: '', amount: 1, date: '2026-08-15T12:00:00Z', category: '#x', icon: 'RefreshCw', type: 'expense', is_verified: 0, recurringRuleId: 'r2', dueDate: '2026-08-15' },
      { id: 'future', title: 'Future', subtitle: '', amount: 1, date: '2026-08-20T12:00:00Z', category: '#x', icon: 'RefreshCw', type: 'expense', is_verified: 0, recurringRuleId: 'r3', dueDate: '2026-08-20' },
    ];
    expect(buildPendingConfirmationSummary(transactions, '2026-08-15')).toEqual({ pendingCount: 3, actionableCount: 2, overdueCount: 1, dueTodayCount: 1, oldestDueDate: '2026-08-10' });
  });
});
