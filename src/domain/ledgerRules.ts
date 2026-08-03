import type { Account, Transaction } from '../types';

/**
 * The one client-side representation of the ledger sign rules.  Amounts are
 * always unsigned; direction comes only from the transaction type and account
 * columns.  The SQL balance view intentionally mirrors this table.
 */
export function applyTransactionEffect(transaction: Transaction, account: Pick<Account, 'id' | 'type'>): number {
  if (transaction.is_verified === 0) return 0;

  const amount = Math.abs(Number(transaction.amount));
  if (!Number.isFinite(amount) || amount === 0) return 0;

  const type = (transaction.transaction_type ?? transaction.type ?? 'income').toUpperCase();
  const from = transaction.fromAccountId ?? (type === 'EXPENSE' ? transaction.account : undefined);
  const to = transaction.toAccountId ?? (type === 'INCOME' ? transaction.account : undefined);
  const isAsset = account.type === 'asset';

  if (type === 'OPENING_BALANCE') {
    return (isAsset && to === account.id) || (!isAsset && from === account.id) ? amount : 0;
  }
  if (type === 'INCOME' && to === account.id) return isAsset ? amount : -amount;
  if (type === 'EXPENSE' && from === account.id) {
    const interestOnly = transaction.isInterestOnly || transaction.category === '#interest';
    return interestOnly && !isAsset ? 0 : (isAsset ? -amount : amount);
  }
  if (type === 'TRANSFER') {
    if (from === account.id) return isAsset ? -amount : amount;
    if (to === account.id) return isAsset ? amount : -amount;
  }
  return 0;
}

export function calculateLedgerBalance(account: Account, transactions: Transaction[]): number {
  return transactions.reduce((balance, transaction) => balance + applyTransactionEffect(transaction, account), 0);
}
