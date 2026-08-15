import { describe, expect, it } from 'vitest';
import type { Account, CreditCardInfo, RecurringRule } from '../types';
import { getManagedRuleSyncPlan, managedAutomationMarker } from './automation';

const bank: Account = { id: 'bank', name: 'Bank', type: 'asset', group: 'Bank Account', balance: 50_000 };
const cardAccount: Account = { id: 'card', name: 'Visa', type: 'liability', group: 'Credit Card', balance: 8_000 };
const card = (dueDate: string): CreditCardInfo => ({ id: 'card', name: 'Visa', balance: 8_000, dueAmount: 6_000, dueDate, billingCycleDay: 5, limit: 100_000 });
const rule: RecurringRule = {
  id: 'managed-card',
  title: 'Visa statement payment',
  amount: 6_000,
  transactionType: 'TRANSFER',
  fromAccountId: 'bank',
  toAccountId: 'card',
  category: '#debtpayment',
  frequency: 'MONTHLY',
  nextDueDate: '2026-09-25',
  isActive: true,
  notes: managedAutomationMarker('CREDIT_CARD_STATEMENT', 'card'),
};

describe('V3.8 managed automation date synchronization', () => {
  it('accepts a future statement date moved earlier', () => {
    const plan = getManagedRuleSyncPlan(rule, { accounts: [bank, cardAccount], creditCards: [card('2026-09-20')], savingsGoals: [], asOfDate: '2026-09-01' });
    expect(plan.action).toBe('UPDATE');
    if (plan.action === 'UPDATE') expect(plan.rule.nextDueDate).toBe('2026-09-20');
  });

  it('does not rewind an advanced schedule to stale past statement metadata', () => {
    const plan = getManagedRuleSyncPlan(rule, { accounts: [bank, cardAccount], creditCards: [card('2026-08-25')], savingsGoals: [], asOfDate: '2026-09-01' });
    expect(plan.action).toBe('NONE');
  });
});
