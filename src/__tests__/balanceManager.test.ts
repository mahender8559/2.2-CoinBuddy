import { describe, it, expect } from 'vitest';
import { Account, Transaction, CreditCardInfo } from '../types';
import {
  recomputeAccountBalance,
  recomputeAccountStateFromLedger,
  recomputeAllAccountBalances,
  syncCreditCardsWithAccounts,
} from '../utils/balanceManager';
import { applyTransactionEffect, hasRealTransactionHistory, SIGN_RULES, validateOpeningBalance } from '../domain/ledgerRules';
import { generateLoanSchedule } from '../utils/emi';

describe('Balance Recomputation and Migration Suite (balanceManager)', () => {
  const mockAccounts: Account[] = [
    {
      id: 'checking',
      name: 'Checking Account',
      type: 'asset',
      balance: 99999, // Corrupt drift value to test recomputation
    },
    {
      id: 'savings',
      name: 'Savings Account',
      type: 'asset',
      balance: -100, // Corrupt drift value
    },
    {
      id: 'card1',
      name: 'Visa Credit Card',
      type: 'liability',
      balance: 0, // Corrupt drift value
      limit: 5000,
    },
  ];

  const mockTransactions: Transaction[] = [
    // Opening Balances
    {
      id: 'ob_checking',
      title: 'Opening Balance',
      subtitle: 'Initial Balance',
      amount: 5000,
      date: '2026-01-01T00:00:00.000Z',
      category: '#opening',
      icon: 'Landmark',
      type: 'income',
      account: 'checking',
      toAccountId: 'checking',
      isOpeningBalance: true,
      is_verified: 1,
    },
    {
      id: 'ob_card1',
      title: 'Opening Balance',
      subtitle: 'Initial Debt',
      amount: 1000,
      date: '2026-01-01T00:00:00.000Z',
      category: '#opening',
      icon: 'Landmark',
      type: 'expense',
      account: 'card1',
      fromAccountId: 'card1',
      isOpeningBalance: true,
      is_verified: 1,
    },
    // Income
    {
      id: 'tx_salary',
      title: 'Monthly Paycheck',
      subtitle: 'Salary',
      amount: 3000,
      date: '2026-01-05T00:00:00.000Z',
      category: 'Salary',
      icon: 'Banknote',
      type: 'income',
      account: 'checking',
      toAccountId: 'checking',
      is_verified: 1,
    },
    // Expense from checking
    {
      id: 'tx_rent',
      title: 'Monthly Rent',
      subtitle: 'Housing',
      amount: 1500,
      date: '2026-01-06T00:00:00.000Z',
      category: 'Housing',
      icon: 'Home',
      type: 'expense',
      account: 'checking',
      fromAccountId: 'checking',
      is_verified: 1,
    },
    // Transfer from checking to savings
    {
      id: 'tx_savings_transfer',
      title: 'Transfer to Savings',
      subtitle: 'Savings',
      amount: 1000,
      date: '2026-01-07T00:00:00.000Z',
      category: '#transfer',
      icon: 'ArrowRightLeft',
      type: 'transfer',
      fromAccountId: 'checking',
      toAccountId: 'savings',
      is_verified: 1,
    },
    // Expense on credit card (liability debt increases)
    {
      id: 'tx_groceries',
      title: 'Groceries',
      subtitle: 'Food',
      amount: 250,
      date: '2026-01-08T00:00:00.000Z',
      category: 'Food & Dining',
      icon: 'Utensils',
      type: 'expense',
      account: 'card1',
      fromAccountId: 'card1',
      is_verified: 1,
    },
    // Card payment from checking to card1 (liability debt decreases, asset decreases)
    {
      id: 'tx_card_payment',
      title: 'Credit Card Payment',
      subtitle: 'Payment',
      amount: 500,
      date: '2026-01-10T00:00:00.000Z',
      category: '#transfer',
      icon: 'ArrowRightLeft',
      type: 'transfer',
      fromAccountId: 'checking',
      toAccountId: 'card1',
      is_verified: 1,
    },
    // Unverified future/recurring expense (should NOT affect computed balance)
    {
      id: 'tx_future_pending',
      title: 'Pending Subscription',
      subtitle: 'Upcoming',
      amount: 100,
      date: '2026-02-01T00:00:00.000Z',
      category: 'Entertainment',
      icon: 'Briefcase',
      type: 'expense',
      account: 'checking',
      fromAccountId: 'checking',
      is_verified: 0,
    },
    // Interest-only payment on liability (should NOT increase principal debt)
    {
      id: 'tx_interest_only',
      title: 'Interest Payment',
      subtitle: 'Interest',
      amount: 45,
      date: '2026-01-12T00:00:00.000Z',
      category: '#interest',
      icon: 'Percent',
      type: 'expense',
      account: 'card1',
      fromAccountId: 'card1',
      isInterestOnly: true,
      is_verified: 1,
    },
  ];

  it('recomputeAccountBalance correctly computes asset account balance', () => {
    // Checking:
    // Opening: +5000
    // Income: +3000
    // Expense (Rent): -1500
    // Transfer Out (to Savings): -1000
    // Transfer Out (to Card1 Payment): -500
    // Unverified (Pending): skipped
    // Total = 5000 + 3000 - 1500 - 1000 - 500 = 5000
    const checkingBalance = recomputeAccountBalance(mockAccounts[0], mockTransactions);
    expect(checkingBalance).toBe(5000);
  });

  it('recomputeAccountBalance correctly computes liability account balance', () => {
    // Card1 (Liability):
    // Opening Debt: 1000
    // Expense (Groceries): +250 (debt increases)
    // Transfer In (Card Payment): -500 (debt decreases)
    // Expense (Interest-Only Payment): skipped from principal (+0)
    // Total = 1000 + 250 - 500 = 750
    const cardBalance = recomputeAccountBalance(mockAccounts[2], mockTransactions);
    expect(cardBalance).toBe(750);
  });

  it('recomputeAccountStateFromLedger derives balance from transactions instead of stale local state', () => {
    const staleAccount = { ...mockAccounts[0], balance: 99999 };
    const derived = recomputeAccountStateFromLedger(staleAccount, mockTransactions);

    expect(derived.balance).toBe(5000);
    expect(derived.id).toBe('checking');
  });

  it('recomputeAllAccountBalances fixes historical drift across all accounts on startup', () => {
    const rebalanced = recomputeAllAccountBalances(mockAccounts, mockTransactions);
    const checking = rebalanced.find(a => a.id === 'checking');
    const savings = rebalanced.find(a => a.id === 'savings');
    const card1 = rebalanced.find(a => a.id === 'card1');

    expect(checking?.balance).toBe(5000); // Corrected from 99999
    expect(savings?.balance).toBe(1000); // Corrected from -100
    expect(card1?.balance).toBe(750); // Corrected from 0
  });

  it('accurately updates balances on Undo/Redo transaction filtering', () => {
    // Simulate Undo: removing tx_rent (Rent = $1500)
    const txsAfterUndoRent = mockTransactions.filter(t => t.id !== 'tx_rent');
    const rebalancedUndo = recomputeAllAccountBalances(mockAccounts, txsAfterUndoRent);
    const checkingUndo = rebalancedUndo.find(a => a.id === 'checking');
    // Without rent expense: 5000 + 1500 = 6500
    expect(checkingUndo?.balance).toBe(6500);

    // Simulate Redo: re-adding tx_rent back
    const rebalancedRedo = recomputeAllAccountBalances(mockAccounts, mockTransactions);
    const checkingRedo = rebalancedRedo.find(a => a.id === 'checking');
    expect(checkingRedo?.balance).toBe(5000);
  });

  it('syncCreditCardsWithAccounts correctly updates card balances', () => {
    const rebalanced = recomputeAllAccountBalances(mockAccounts, mockTransactions);
    const mockCards: CreditCardInfo[] = [
      {
        id: 'card1',
        name: 'Visa Credit Card',
        balance: 9999, // Out of sync
        dueAmount: 500,
        dueDate: '2026-02-15',
        billingCycleDay: 1,
        limit: 5000,
      },
    ];

    const synced = syncCreditCardsWithAccounts(rebalanced, mockCards);
    expect(synced[0].balance).toBe(750);
  });

  it('treats a same-account transfer as net zero and identifies only non-opening history', () => {
    const selfTransfer: Transaction = { id: 'self', title: 'Bad transfer', subtitle: '', amount: 100, date: '2026-01-01', category: '', icon: '', type: 'transfer', fromAccountId: 'checking', toAccountId: 'checking', is_verified: 1 };
    expect(applyTransactionEffect(selfTransfer, mockAccounts[0])).toBe(0);
    expect(hasRealTransactionHistory('checking', mockTransactions.filter(tx => tx.isOpeningBalance))).toBe(false);
    expect(hasRealTransactionHistory('checking', mockTransactions)).toBe(true);
  });

  it('blocks opening-balance edits that would create historical overdraft or exceed a card limit', () => {
    const ledgerWithLaterSpend = [...mockTransactions, {
      id: 'late-spend', title: 'Later spend', subtitle: '', amount: 4_500, date: '2026-01-20T00:00:00.000Z',
      category: 'Bills', icon: '', type: 'expense' as const, fromAccountId: 'checking', is_verified: 1,
    }];
    expect(validateOpeningBalance(mockAccounts[0], ledgerWithLaterSpend, 1000).valid).toBe(false);
    expect(validateOpeningBalance(mockAccounts[0], ledgerWithLaterSpend, 1000).error).toContain('Cannot set initial balance lower than');
    expect(validateOpeningBalance(mockAccounts[2], mockTransactions, 6000).valid).toBe(false);
  });

  it('reconciles amortization schedule principal exactly to the loan principal', () => {
    const result = generateLoanSchedule(1_000_000, 8.35, 360);
    expect(result.schedule.at(-1)?.cumulativePrincipal).toBe(result.totalPrincipal);
  });
});

describe('ledger sign rule invariants', () => {
  it('exposes only numeric signs for every configured rule', () => {
    for (const directions of Object.values(SIGN_RULES)) for (const kinds of Object.values(directions)) for (const sign of Object.values(kinds ?? {})) for (const value of Object.values(sign)) expect(typeof value).toBe('number');
  });

  it('never lets pending transactions affect an account balance', () => {
    const pending: Transaction = { id: 'pending', title: 'Pending', subtitle: '', amount: 100, date: new Date().toISOString(), category: '#test', icon: 'Tag', type: 'expense', account: 'checking', fromAccountId: 'checking', is_verified: 0 };
    expect(applyTransactionEffect(pending, { id: 'checking', type: 'asset' })).toBe(0);
    expect(applyTransactionEffect(pending, { id: 'checking', type: 'liability' })).toBe(0);
  });
});
