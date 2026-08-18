import { describe, expect, it } from 'vitest';
import type { Account, CreditCardInfo, Transaction } from '../types';
import { calculateLedgerBalance } from './ledgerRules';
import {
  calculateCreditCardDueReminders,
  getCreditCardStatementDueDate,
  getLatestClosedCreditCardCycle,
  projectCreditCardStatement,
} from './creditCardStatements';

const account: Account = {
  id: 'card',
  name: 'Test Card',
  type: 'liability',
  balance: 0,
  group: 'Credit Card',
  limit: 100000,
};

const card: CreditCardInfo = {
  id: 'card',
  name: 'Test Card',
  balance: 0,
  dueAmount: 0,
  dueDate: '2026-08-25',
  billingCycleDay: 17,
  limit: 100000,
};

function tx(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date' | 'type'>): Transaction {
  return {
    title: partial.id,
    subtitle: '',
    category: '#general',
    icon: 'CreditCard',
    ...partial,
  };
}

function purchase(id: string, amount: number, date: string): Transaction {
  return tx({
    id,
    amount,
    date,
    type: 'expense',
    transaction_type: 'EXPENSE',
    account: 'card',
    fromAccountId: 'card',
    is_verified: 1,
  });
}

function payment(id: string, amount: number, date: string): Transaction {
  return tx({
    id,
    amount,
    date,
    type: 'transfer',
    transaction_type: 'TRANSFER',
    fromAccountId: 'bank',
    toAccountId: 'card',
    is_verified: 1,
  });
}

describe('credit card statements', () => {
  it('keeps the billing day open until midnight and closes it on the following day', () => {
    expect(getLatestClosedCreditCardCycle(17, new Date(2026, 7, 17, 23, 59, 59)).closeDate).toBe('2026-07-17');
    expect(getLatestClosedCreditCardCycle(17, new Date(2026, 7, 18, 0, 0, 1)).closeDate).toBe('2026-08-17');
  });

  it('freezes ₹8,000 at statement close while new-cycle spending stays only in total card usage', () => {
    const transactions = [
      purchase('cycle-spend', 8000, '2026-08-17T20:00:00'),
      purchase('new-cycle-spend', 2000, '2026-08-18T10:00:00'),
    ];
    const projection = projectCreditCardStatement(account, card, transactions, new Date(2026, 7, 18, 12, 0, 0));

    expect(projection.closeDate).toBe('2026-08-17');
    expect(projection.statementBalance).toBe(8000);
    expect(projection.dueAmount).toBe(8000);
    expect(calculateLedgerBalance(account, transactions)).toBe(10000);
  });

  it('reduces only the closed statement due when a partial payment is made after close', () => {
    const transactions = [
      purchase('cycle-spend', 8000, '2026-08-17T20:00:00'),
      payment('partial-payment', 3000, '2026-08-18T09:00:00'),
      purchase('new-cycle-spend', 2000, '2026-08-18T10:00:00'),
    ];
    const projection = projectCreditCardStatement(account, card, transactions, new Date(2026, 7, 18, 12, 0, 0));

    expect(projection.dueAmount).toBe(5000);
    expect(calculateLedgerBalance(account, transactions)).toBe(7000);
  });

  it('clears the statement due after a full post-close payment', () => {
    const transactions = [
      purchase('cycle-spend', 8000, '2026-08-17T20:00:00'),
      payment('full-payment', 8000, '2026-08-18T09:00:00'),
    ];
    const projection = projectCreditCardStatement(account, card, transactions, new Date(2026, 7, 18, 12, 0, 0));
    expect(projection.dueAmount).toBe(0);
  });

  it('uses the configured due-day as a recurring anchor after statement close', () => {
    expect(getCreditCardStatementDueDate('2026-08-17', { dueDate: '2026-01-25' })).toBe('2026-08-25');
    expect(getCreditCardStatementDueDate('2026-08-17', { dueDate: '2026-01-05' })).toBe('2026-09-05');
  });

  it('creates upcoming and overdue reminders for an unpaid statement', () => {
    const upcoming = calculateCreditCardDueReminders([
      { ...card, dueAmount: 8000, dueDate: '2026-08-20' },
    ], new Date(2026, 7, 18, 12, 0, 0));
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].type).toBe('UPCOMING_CARD_DUE');
    expect(upcoming[0].daysRemainingOrOverdue).toBe(2);

    const overdue = calculateCreditCardDueReminders([
      { ...card, dueAmount: 8000, dueDate: '2026-08-20' },
    ], new Date(2026, 7, 21, 12, 0, 0));
    expect(overdue).toHaveLength(1);
    expect(overdue[0].type).toBe('MISSED_CARD_DUE');
    expect(overdue[0].daysRemainingOrOverdue).toBe(-1);
  });
});
