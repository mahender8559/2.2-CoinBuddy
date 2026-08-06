import type { Transaction } from '../types';

const EVENT_RESTRICTED_TRANSACTION_TYPES = new Set([
  'OPENING_BALANCE',
  'BALANCE_ADJUSTMENT',
  'MARKET_ADJUSTMENT',
]);

export function isEventAssignableTransaction(
  transaction: Pick<Transaction, 'isOpeningBalance' | 'transaction_type'>,
): boolean {
  if (transaction.isOpeningBalance) return false;
  const transactionType = transaction.transaction_type?.toUpperCase();
  return !transactionType || !EVENT_RESTRICTED_TRANSACTION_TYPES.has(transactionType);
}
