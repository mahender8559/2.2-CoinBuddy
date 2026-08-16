import type { Account, Transaction } from '../types';
import {
  insertAccountRow,
  insertTransactionRow,
  updateAccountRow,
  updateTransactionRow,
  deleteTransactionRow,
  type SqlJsDatabaseDriver,
} from '../db/dbClient';
import { recomputeAllAccountBalances } from '../utils/balanceManager';

export type AccountUndoState = { account: Account; openingTx: Transaction | null };
export type UndoRedoState = AccountUndoState | Transaction | Transaction[] | null;

export type UndoRedoCommand = {
  entityType: 'account' | 'transaction' | 'transactionBatch';
  actionType: 'add' | 'update' | 'delete';
  previousState: UndoRedoState;
  newState: UndoRedoState;
};

function resolveAction(cmd: UndoRedoCommand, isUndo: boolean) {
  return isUndo
    ? (cmd.actionType === 'add' ? 'delete' : cmd.actionType === 'delete' ? 'add' : 'update')
    : cmd.actionType;
}

function resolveStates(cmd: UndoRedoCommand, isUndo: boolean) {
  return {
    targetState: isUndo ? cmd.previousState : cmd.newState,
    sourceState: isUndo ? cmd.newState : cmd.previousState,
  };
}

/**
 * Pure projection helper used by tests and by callers that need to reason about
 * the visible result of an Undo/Redo command. Durable execution is handled by
 * persistUndoRedoCommand below.
 */
export function applyUndoRedoCommand(
  cmd: UndoRedoCommand,
  isUndo: boolean,
  accounts: Account[],
  transactions: Transaction[],
) {
  const targetAction = resolveAction(cmd, isUndo);
  const { targetState, sourceState } = resolveStates(cmd, isUndo);
  let nextTransactions = [...transactions];
  let nextAccounts = [...accounts];

  if (cmd.entityType === 'transaction' || cmd.entityType === 'transactionBatch') {
    const targetTransactions = (cmd.entityType === 'transactionBatch'
      ? (targetState as Transaction[] | null) ?? []
      : targetState ? [targetState as Transaction] : []);
    const sourceTransactions = (cmd.entityType === 'transactionBatch'
      ? (sourceState as Transaction[] | null) ?? []
      : sourceState ? [sourceState as Transaction] : []);

    if (targetAction === 'add') {
      for (const transaction of targetTransactions) {
        nextTransactions = [transaction, ...nextTransactions.filter(item => item.id !== transaction.id)];
      }
    } else if (targetAction === 'delete') {
      const ids = new Set(sourceTransactions.map(transaction => transaction.id));
      nextTransactions = nextTransactions.filter(item => !ids.has(item.id));
    } else {
      const updates = new Map(targetTransactions.map(transaction => [transaction.id, transaction]));
      nextTransactions = nextTransactions.map(item => updates.get(item.id) ?? item);
    }
  } else {
    const target = targetState as AccountUndoState | null;
    const source = sourceState as AccountUndoState | null;

    if (targetAction === 'add' && target) {
      nextAccounts = [target.account, ...nextAccounts.filter(item => item.id !== target.account.id)];
      if (target.openingTx) {
        nextTransactions = [target.openingTx, ...nextTransactions.filter(item => item.id !== target.openingTx!.id)];
      }
    } else if (targetAction === 'delete' && source) {
      nextAccounts = nextAccounts.filter(item => item.id !== source.account.id);
      if (source.openingTx) nextTransactions = nextTransactions.filter(item => item.id !== source.openingTx!.id);
    } else if (targetAction === 'update' && target) {
      nextAccounts = nextAccounts.map(item => item.id === target.account.id ? target.account : item);
      if (target.openingTx && source?.openingTx) {
        nextTransactions = nextTransactions.map(item => item.id === source.openingTx!.id ? target.openingTx! : item);
      } else if (target.openingTx && !source?.openingTx) {
        nextTransactions = [target.openingTx, ...nextTransactions.filter(item => item.id !== target.openingTx!.id)];
      } else if (!target.openingTx && source?.openingTx) {
        nextTransactions = nextTransactions.filter(item => item.id !== source.openingTx!.id);
      }
    }
  }

  return {
    accounts: recomputeAllAccountBalances(nextAccounts, nextTransactions),
    transactions: nextTransactions,
  };
}

async function persistTransactionSet(
  driver: SqlJsDatabaseDriver,
  action: 'add' | 'update' | 'delete',
  targetTransactions: Transaction[],
  sourceTransactions: Transaction[],
) {
  if (action === 'add') {
    for (const transaction of targetTransactions) await insertTransactionRow(driver, transaction);
    return;
  }
  if (action === 'delete') {
    for (const transaction of sourceTransactions) await deleteTransactionRow(driver, transaction.id);
    return;
  }
  for (const transaction of targetTransactions) {
    await updateTransactionRow(driver, transaction.id, transaction);
  }
}

/**
 * Apply one Undo/Redo command to SQLite as a single SQL unit. The caller should
 * wrap this in runAtomicDatabaseAction so the committed SQLite image and the
 * durable browser snapshot also succeed or roll back together.
 */
export async function persistUndoRedoCommand(
  driver: SqlJsDatabaseDriver,
  cmd: UndoRedoCommand,
  isUndo: boolean,
): Promise<void> {
  const targetAction = resolveAction(cmd, isUndo);
  const { targetState, sourceState } = resolveStates(cmd, isUndo);

  await driver.execute('BEGIN TRANSACTION');
  try {
    if (cmd.entityType === 'transaction' || cmd.entityType === 'transactionBatch') {
      const targetTransactions = cmd.entityType === 'transactionBatch'
        ? ((targetState as Transaction[] | null) ?? [])
        : targetState ? [targetState as Transaction] : [];
      const sourceTransactions = cmd.entityType === 'transactionBatch'
        ? ((sourceState as Transaction[] | null) ?? [])
        : sourceState ? [sourceState as Transaction] : [];
      await persistTransactionSet(driver, targetAction, targetTransactions, sourceTransactions);
    } else {
      const target = targetState as AccountUndoState | null;
      const source = sourceState as AccountUndoState | null;

      if (targetAction === 'add' && target) {
        await insertAccountRow(driver, target.account, 0, undefined, false);
        if (target.openingTx) await insertTransactionRow(driver, target.openingTx);
      } else if (targetAction === 'delete' && source) {
        if (source.openingTx) await deleteTransactionRow(driver, source.openingTx.id);
        await driver.execute('DELETE FROM accounts WHERE id = ?;', [source.account.id]);
      } else if (targetAction === 'update' && target) {
        await updateAccountRow(driver, target.account);
        if (target.openingTx && source?.openingTx) {
          if (target.openingTx.id === source.openingTx.id) {
            await updateTransactionRow(driver, target.openingTx.id, target.openingTx);
          } else {
            await deleteTransactionRow(driver, source.openingTx.id);
            await insertTransactionRow(driver, target.openingTx);
          }
        } else if (target.openingTx && !source?.openingTx) {
          await insertTransactionRow(driver, target.openingTx);
        } else if (!target.openingTx && source?.openingTx) {
          await deleteTransactionRow(driver, source.openingTx.id);
        }
      }
    }
    await driver.execute('COMMIT');
  } catch (error) {
    await driver.execute('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

/** Save every ledger leg of one liability payment together. */
export async function insertLiabilityPaymentRows(
  driver: SqlJsDatabaseDriver,
  paymentTransactions: Transaction[],
): Promise<void> {
  if (paymentTransactions.length === 0) return;
  await driver.execute('BEGIN TRANSACTION');
  try {
    for (const transaction of paymentTransactions) await insertTransactionRow(driver, transaction);
    await driver.execute('COMMIT');
  } catch (error) {
    await driver.execute('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
