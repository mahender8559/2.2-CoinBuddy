import { describe, expect, it } from 'vitest';
import { isEventAssignableTransaction } from './eventRules';

describe('event assignment rules', () => {
  it('allows normal income, expense and transfer transactions', () => {
    expect(isEventAssignableTransaction({ transaction_type: 'EXPENSE' })).toBe(true);
    expect(isEventAssignableTransaction({ transaction_type: 'INCOME' })).toBe(true);
    expect(isEventAssignableTransaction({ transaction_type: 'TRANSFER' })).toBe(true);
  });

  it('blocks opening balances identified by their flag', () => {
    expect(isEventAssignableTransaction({ isOpeningBalance: true, transaction_type: 'INCOME' })).toBe(false);
  });

  it('blocks opening balances identified by transaction type', () => {
    expect(isEventAssignableTransaction({ transaction_type: 'OPENING_BALANCE' })).toBe(false);
  });

  it('blocks reconciliation balance adjustments', () => {
    expect(isEventAssignableTransaction({ transaction_type: 'BALANCE_ADJUSTMENT' })).toBe(false);
  });

  it('blocks market adjustments', () => {
    expect(isEventAssignableTransaction({ transaction_type: 'MARKET_ADJUSTMENT' })).toBe(false);
  });
});
