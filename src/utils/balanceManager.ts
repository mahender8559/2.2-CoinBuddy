import { Account, Transaction, CreditCardInfo } from '../types';
import { safeCompute, SAFE_MATH_ERRORS } from './safeMath';

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
    let computed = hasOpeningBalanceTx(account, transactions)
      ? 0
      : Number((account as any).initialBalance ?? (account as any).openingBalance ?? 0);

    const sortedTxs = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (const tx of sortedTxs) {
      if (tx.is_verified === 0) continue;

      const amount = Math.abs(Number(tx.amount) || 0);
      const sourceId = tx.fromAccountId || tx.account;
      const targetId = tx.toAccountId || tx.account;

      const isAsset = account.type === 'asset';

      if (tx.type === 'income') {
        if (targetId === account.id || (!tx.toAccountId && tx.account === account.id)) {
          if (isAsset) {
            computed += amount;
          } else {
            computed -= amount;
          }
        }
      } else if (tx.type === 'expense') {
        if (sourceId === account.id || (!tx.fromAccountId && tx.account === account.id)) {
          const isInterestOnly =
            tx.isInterestOnly ||
            tx.category === '#interest' ||
            tx.category?.toLowerCase().includes('interest') ||
            tx.title?.toLowerCase().includes('interest payment');

          if (isAsset) {
            computed -= amount;
          } else {
            if (!isInterestOnly) {
              computed += amount;
            }
          }
        }
      } else if (tx.type === 'transfer') {
        if (sourceId === account.id) {
          if (isAsset) {
            computed -= amount;
          } else {
            computed += amount;
          }
        }
        if (targetId === account.id) {
          if (isAsset) {
            computed += amount;
          } else {
            computed -= amount;
          }
        }
      }
    }

    if (account.type === 'asset') {
      computed = Math.max(0, computed);
    }

    return computed;
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
