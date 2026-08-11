import { describe, expect, it } from 'vitest';
import { transactionMatchesSearch } from '../utils/transactionSearch';
import type { Transaction } from '../types';

const tx: Transaction = {
  id: 'tx-1', title: 'Bike EMI', subtitle: 'Aug 11, 2026', amount: 12500,
  date: '2026-08-11T12:00:00.000Z', category: '#loanpayment', icon: 'CreditCard',
  type: 'expense', account: 'hdfc', fromAccountId: 'hdfc', eventId: 'trip',
  transaction_type: 'EXPENSE', is_verified: 1,
};

describe('transactionMatchesSearch', () => {
  it('finds exact amounts with plain digits', () => expect(transactionMatchesSearch(tx, '12500')).toBe(true));
  it('finds formatted/currency amounts', () => {
    expect(transactionMatchesSearch(tx, '₹12,500')).toBe(true);
    expect(transactionMatchesSearch(tx, '12,500.00')).toBe(true);
  });
  it('finds linked account and event names', () => {
    expect(transactionMatchesSearch(tx, 'HDFC Bank', { accountNames: ['HDFC Bank'] })).toBe(true);
    expect(transactionMatchesSearch(tx, 'Goa Trip', { eventName: 'Goa Trip' })).toBe(true);
  });
  it('does not match an unrelated amount', () => expect(transactionMatchesSearch(tx, '13000')).toBe(false));
});
