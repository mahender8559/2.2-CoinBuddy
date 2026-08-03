import { Account, Transaction, CreditCardInfo } from '../types';
import { safeCompute, SAFE_MATH_ERRORS } from './safeMath';
import { calculateLedgerBalance } from '../domain/ledgerRules';

/**
 * Checks whether an account has an opening balance transaction in the transaction list.
 */
export function hasOpeningBalanceTx(account: Account, transactions: Transaction[]): boolean {
  return transactions.some(
    tx =>
      (tx.isOpeningBalance ||
        tx.category === '#opening' ||
        tx.transaction_type === 'OPENING_BALANCE') &&
      (tx.account === account.id ||
        tx.fromAccountId === account.id ||
        tx.toAccountId === account.id)
  );
}

/**
 * Calculates an account's balance dynamically from the transaction ledger.
 * Single source of truth formula wrapped in safeCompute pipeline:
 * Balance = Opening Balance + SUM(Income) - SUM(Expenses) + SUM(Transfers In) - SUM(Transfers Out)
 */
export function recomputeAccountBalance(account: Account, transactions: Transaction[]): number {
  const safeRes = safeCompute(() => {
    // Do not clamp negative assets: a negative result is an integrity signal,
    // not a value that may be silently rewritten.
    return calculateLedgerBalance(account, transactions);
  }, SAFE_MATH_ERRORS.DRIFT);

  return typeof safeRes === 'number' ? safeRes : (0 as any);
}


/**
 * Centralized computed balance getter function.
 * Calculates an account's balance dynamically on every read:
 * Opening Balance + SUM(Incomes) - SUM(Expenses) + SUM(Transfers In) - SUM(Transfers Out)
 */
export function getAccountBalance(
  accountOrId: Account | string,
  transactions: Transaction[],
  accounts: Account[] = []
): number {
  const account = typeof accountOrId === 'string'
    ? (accounts.find(a => a.id === accountOrId) || ({ id: accountOrId, type: 'asset' } as Account))
    : accountOrId;

  if (!account) return 0;
  return recomputeAccountBalance(account, transactions);
}

/**
 * Recomputes all account balances dynamically from scratch using the transaction ledger.
 */
export function recomputeAllAccountBalances(
  accounts: Account[],
  transactions: Transaction[]
): Account[] {
  return accounts.map(acc => {
    const balance = recomputeAccountBalance(acc, transactions);
    return { ...acc, balance };
  });
}

/**
 * Compatibility helper for callers that need an account-shaped ledger
 * projection. It never trusts the balance carried by the input record.
 */
export function recomputeAccountStateFromLedger(account: Account, transactions: Transaction[]): Account {
  return { ...account, balance: recomputeAccountBalance(account, transactions) };
}

/**
 * Syncs credit card info balances with corresponding account balances.
 */
export function syncCreditCardsWithAccounts(
  accounts: Account[],
  creditCards: CreditCardInfo[]
): CreditCardInfo[] {
  return creditCards.map(card => {
    const matchingAcc = accounts.find(a => a.id === card.id);
    if (matchingAcc) {
      return {
        ...card,
        balance: matchingAcc.balance,
        limit: matchingAcc.limit ?? card.limit,
      };
    }
    return card;
  });
}
