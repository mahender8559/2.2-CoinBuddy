import type { Person, SharedObligation, SharedResponsibility, Transaction } from '../types';
import { isCashFlowTransaction } from './ledgerRules';
import { getSelfPerson, getPersonResponsibility } from './sharedFinances';

export interface PersonalExpenseRecord {
  id: string;
  source: 'TRANSACTION' | 'SHARED_OBLIGATION';
  transactionId?: string;
  obligationId?: string;
  title: string;
  category: string;
  date: string;
  /** Economic expense attributed to the CoinBuddy user. */
  amount: number;
  /** Actual tracked-account cash outflow associated with this record. */
  cashAmount: number;
}

function positiveMoney(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.max(0, number) * 100) / 100;
}

function activeExpenseObligations(obligations: SharedObligation[]): SharedObligation[] {
  return obligations.filter(obligation => obligation.kind === 'EXPENSE' && obligation.status !== 'CANCELLED');
}

/**
 * Builds the economic-spending view without changing ledger cash movements.
 *
 * - A normal expense transaction contributes its full amount.
 * - A transaction linked to a shared obligation contributes only the user's
 *   responsibility share, while retaining the full tracked cash amount.
 * - An external-only shared obligation contributes the user's responsibility
 *   even though cashAmount is zero.
 * - Linked obligations are never emitted twice.
 */
export function buildPersonalExpenseRecords(
  transactions: Transaction[],
  people: Person[],
  obligations: SharedObligation[],
  responsibilities: SharedResponsibility[],
): PersonalExpenseRecord[] {
  const me = getSelfPerson(people);
  const activeObligations = activeExpenseObligations(obligations);
  const obligationByTransactionId = new Map(
    activeObligations
      .filter(obligation => obligation.transactionId)
      .map(obligation => [obligation.transactionId as string, obligation]),
  );

  const records: PersonalExpenseRecord[] = [];

  for (const transaction of transactions) {
    if (
      transaction.isOpeningBalance ||
      transaction.is_verified === 0 ||
      transaction.type !== 'expense' ||
      !isCashFlowTransaction(transaction)
    ) continue;

    const cashAmount = positiveMoney(transaction.amount);
    if (cashAmount <= 0) continue;
    const obligation = obligationByTransactionId.get(transaction.id);
    if (!obligation) {
      records.push({
        id: `transaction:${transaction.id}`,
        source: 'TRANSACTION',
        transactionId: transaction.id,
        title: transaction.title,
        category: transaction.category || '#uncategorized',
        date: transaction.date,
        amount: cashAmount,
        cashAmount,
      });
      continue;
    }

    const personalAmount = me ? getPersonResponsibility(obligation.id, me.id, responsibilities) : 0;
    if (personalAmount <= 0) continue;
    records.push({
      id: `obligation:${obligation.id}`,
      source: 'SHARED_OBLIGATION',
      transactionId: transaction.id,
      obligationId: obligation.id,
      title: obligation.title || transaction.title,
      category: obligation.categoryId || transaction.category || '#uncategorized',
      date: transaction.date,
      amount: personalAmount,
      cashAmount,
    });
  }

  for (const obligation of activeObligations) {
    if (obligation.transactionId) continue;
    const personalAmount = me ? getPersonResponsibility(obligation.id, me.id, responsibilities) : 0;
    if (personalAmount <= 0) continue;
    records.push({
      id: `obligation:${obligation.id}`,
      source: 'SHARED_OBLIGATION',
      obligationId: obligation.id,
      title: obligation.title,
      category: obligation.categoryId || '#uncategorized',
      date: obligation.dueDate || obligation.createdAt,
      amount: personalAmount,
      cashAmount: 0,
    });
  }

  return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function personalExpenseForTransaction(transactionId: string, records: PersonalExpenseRecord[]): number {
  return records
    .filter(record => record.transactionId === transactionId)
    .reduce((sum, record) => sum + record.amount, 0);
}
