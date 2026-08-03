import type { Account, Transaction } from '../types';

type LedgerTransactionType = 'OPENING_BALANCE' | 'INCOME' | 'EXPENSE' | 'TRANSFER';
type AccountKind = 'asset' | 'liability';
type Direction = 'from' | 'to';

/** The canonical, table-driven account-direction matrix. */
export const SIGN_RULES: Record<LedgerTransactionType, Partial<Record<Direction, Record<AccountKind, number>>>> = {
  OPENING_BALANCE: { to: { asset: 1, liability: 0 }, from: { asset: 0, liability: 1 } },
  INCOME: { to: { asset: 1, liability: -1 } },
  EXPENSE: { from: { asset: -1, liability: 1 } },
  TRANSFER: { from: { asset: -1, liability: 1 }, to: { asset: 1, liability: -1 } },
};

export function isOpeningBalanceTransaction(tx: Transaction): boolean {
  return tx.isOpeningBalance === true || tx.transaction_type === 'OPENING_BALANCE';
}

export function hasRealTransactionHistory(accountId: string, transactions: Transaction[]): boolean {
  return transactions.some(tx => !isOpeningBalanceTransaction(tx) &&
    (tx.account === accountId || tx.fromAccountId === accountId || tx.toAccountId === accountId));
}

export function validateOpeningBalance(account: Account, transactions: Transaction[], newAmount: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(newAmount) || newAmount < 0) return { valid: false, error: 'Opening balance must be a non-negative finite number.' };
  const opening = transactions.find(tx => isOpeningBalanceTransaction(tx) &&
    (tx.account === account.id || tx.fromAccountId === account.id || tx.toAccountId === account.id));
  const oldAmount = opening?.amount ?? 0;
  const adjusted = transactions.map(tx => tx.id === opening?.id ? { ...tx, amount: newAmount } : tx)
    .filter(tx => tx.is_verified !== 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let running = 0;
  let maximum = 0;
  for (const tx of adjusted) {
    running += applyTransactionEffect(tx, account);
    maximum = Math.max(maximum, running);
    if (account.type === 'asset' && running < -0.000001) {
      return { valid: false, error: 'Cannot update opening balance: it would cause a historical negative asset balance.' };
    }
  }
  if (account.type === 'liability' && (account.limit ?? 0) > 0 && maximum > (account.limit ?? 0) + 0.000001) {
    return { valid: false, error: 'Cannot update opening balance: it would exceed this account credit limit.' };
  }
  void oldAmount;
  return { valid: true };
}

/**
 * The one client-side representation of the ledger sign rules.  Amounts are
 * always unsigned; direction comes only from the transaction type and account
 * columns.  The SQL balance view intentionally mirrors this table.
 */
export function applyTransactionEffect(transaction: Transaction, account: Pick<Account, 'id' | 'type'>): number {
  if (transaction.is_verified === 0) return 0;

  const amount = Math.abs(Number(transaction.amount));
  if (!Number.isFinite(amount) || amount === 0) return 0;

  const type = (transaction.transaction_type ?? transaction.type ?? 'income').toUpperCase() as LedgerTransactionType;
  const from = transaction.fromAccountId ?? (type === 'EXPENSE' ? transaction.account : undefined);
  const to = transaction.toAccountId ?? (type === 'INCOME' ? transaction.account : undefined);
  const isAsset = account.type === 'asset';

  if (type === 'TRANSFER' && from === account.id && to === account.id) return 0;
  if (type === 'EXPENSE' && transaction.isInterestOnly && !isAsset) return 0;
  const kind: AccountKind = isAsset ? 'asset' : 'liability';
  if (from === account.id) return amount * (SIGN_RULES[type]?.from?.[kind] ?? 0);
  if (to === account.id) return amount * (SIGN_RULES[type]?.to?.[kind] ?? 0);
  return 0;
}

export function calculateLedgerBalance(account: Account, transactions: Transaction[]): number {
  return transactions.reduce((balance, transaction) => balance + applyTransactionEffect(transaction, account), 0);
}
