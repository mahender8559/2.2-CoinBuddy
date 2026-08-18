import { describe, expect, it } from 'vitest';
import type { Account, LoanContributionRule, LoanSharingRule, Person, RecurringRule } from '../types';
import {
  buildManagedLoanRecurringTransaction,
  findLoanPaymentRule,
  getTrackedLoanScheduleAmount,
  isSchedulableLoanAccount,
  nextFutureLoanScheduleDate,
  parseManagedLoanSchedule,
} from './loanRecurring';

const loan = (overrides: Partial<Account> = {}): Account => ({
  id: 'loan',
  name: 'Car Loan',
  type: 'liability',
  balance: 300000,
  group: 'Bank Loan',
  monthlyEMI: 12000,
  nextEMIDate: '2026-09-05',
  paymentFrequency: 'MONTHLY',
  ...overrides,
});

const people: Person[] = [
  { id: 'me', name: 'Me', isSelf: true, isArchived: false },
  { id: 'other', name: 'Other', isSelf: false, isArchived: false },
];

describe('managed loan recurring schedules', () => {
  it('recognizes a loan with EMI and next-payment metadata but excludes credit cards', () => {
    expect(isSchedulableLoanAccount(loan())).toBe(true);
    expect(isSchedulableLoanAccount(loan({ group: 'Credit Card' }))).toBe(false);
  });

  it('uses the full EMI for a personal loan', () => {
    expect(getTrackedLoanScheduleAmount(loan(), people, [], [])).toBe(12000);
  });

  it('uses only the self contribution for a shared loan, including zero', () => {
    const sharing: LoanSharingRule[] = [{ accountId: 'loan', personalResponsibilityPercent: 50, isShared: true }];
    const percentRules: LoanContributionRule[] = [
      { id: 'mine', accountId: 'loan', personId: 'me', mode: 'PERCENT', value: 25, isActive: true },
      { id: 'other', accountId: 'loan', personId: 'other', mode: 'PERCENT', value: 75, isActive: true },
    ];
    expect(getTrackedLoanScheduleAmount(loan(), people, sharing, percentRules)).toBe(3000);
    expect(getTrackedLoanScheduleAmount(loan(), people, sharing, [{ ...percentRules[0], value: 0 }, percentRules[1]])).toBe(0);
  });

  it('advances an already-due configured date to the first future occurrence without losing its anchor day', () => {
    expect(nextFutureLoanScheduleDate('2026-08-05', 'MONTHLY', new Date(2026, 7, 18, 12))).toBe('2026-09-05');
    expect(nextFutureLoanScheduleDate('2026-01-31', 'MONTHLY', new Date(2026, 1, 15, 12))).toBe('2026-02-28');
  });

  it('builds a pending recurring transfer to the liability using the configured frequency', () => {
    const transaction = buildManagedLoanRecurringTransaction(loan({ paymentFrequency: 'QUARTERLY' }), 'bank', 12000, new Date(2026, 7, 18, 12));
    expect(transaction.type).toBe('transfer');
    expect(transaction.transaction_type).toBe('TRANSFER');
    expect(transaction.fromAccountId).toBe('bank');
    expect(transaction.toAccountId).toBe('loan');
    expect(transaction.isRecurring).toBe(true);
    expect(transaction.is_verified).toBe(0);
    expect(transaction.recurrenceFrequency).toBe('QUARTERLY');
    expect(parseManagedLoanSchedule(transaction.notes)?.accountId).toBe('loan');
  });

  it('does not auto-create a duplicate when a manual recurring transfer already pays the loan', () => {
    const manual: RecurringRule = {
      id: 'manual', title: 'Loan payment', amount: 12000, transactionType: 'TRANSFER',
      fromAccountId: 'bank', toAccountId: 'loan', frequency: 'MONTHLY', nextDueDate: '2026-09-05', isActive: true,
    };
    expect(findLoanPaymentRule('loan', [manual])?.id).toBe('manual');
  });
});
