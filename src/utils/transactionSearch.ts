import type { Transaction } from '../types';

export interface TransactionSearchContext {
  accountNames?: string[];
  eventName?: string;
  categoryName?: string;
}

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase();

function numericCandidate(query: string): number | null {
  const cleaned = query
    .replace(/[₹$€£¥\s]/g, '')
    .replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.abs(value) : null;
}

export function transactionMatchesSearch(
  tx: Transaction,
  query: string,
  context: TransactionSearchContext = {},
): boolean {
  const q = normalize(query);
  if (!q) return true;

  const haystack = [
    tx.title,
    tx.subtitle,
    tx.category,
    tx.notes,
    tx.type,
    tx.transaction_type,
    tx.dueDate,
    ...(context.accountNames ?? []),
    context.eventName,
    context.categoryName,
  ].map(normalize).join(' ');

  if (haystack.includes(q)) return true;

  const requestedAmount = numericCandidate(q);
  if (requestedAmount === null) return false;

  const amount = Math.abs(Number(tx.amount));
  if (!Number.isFinite(amount)) return false;
  if (Math.abs(amount - requestedAmount) < 0.005) return true;

  const compactQuery = q.replace(/[₹$€£¥,\s]/g, '');
  return [
    String(amount),
    amount.toFixed(2),
    amount.toLocaleString('en-IN'),
    amount.toLocaleString('en-US'),
  ].some(value => value.replace(/,/g, '').includes(compactQuery));
}
