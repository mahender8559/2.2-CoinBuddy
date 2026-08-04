import { describe, expect, it } from 'vitest';
import { applyUndoRedoCommand, type AccountUndoState, type UndoRedoCommand } from '../context/AppContext';
import type { Account, Transaction } from '../types';

const account: Account = { id: 'cash', name: 'Cash', type: 'asset', balance: 0 };
const opening: Transaction = { id: 'opening', title: 'Opening', subtitle: '', amount: 100, date: '2026-01-01T00:00:00.000Z', category: '#opening', icon: 'Landmark', type: 'income', account: 'cash', toAccountId: 'cash', isOpeningBalance: true };
const expense: Transaction = { id: 'expense', title: 'Food', subtitle: '', amount: 25, date: '2026-01-02T00:00:00.000Z', category: '#food', icon: 'Utensils', type: 'expense', account: 'cash', fromAccountId: 'cash' };
const updatedExpense = { ...expense, amount: 40, title: 'Groceries' };
const accountState: AccountUndoState = { account, openingTx: opening };
const renamedAccountState: AccountUndoState = { account: { ...account, name: 'Wallet' }, openingTx: { ...opening, amount: 150 } };

const command = (entityType: UndoRedoCommand['entityType'], actionType: UndoRedoCommand['actionType'], previousState: UndoRedoCommand['previousState'], newState: UndoRedoCommand['newState']): UndoRedoCommand => ({ entityType, actionType, previousState, newState });

describe('undo restoration paths', () => {
  it.each([
    ['transaction add', command('transaction', 'add', null, expense), [account], [opening, expense], [account], [opening]],
    ['transaction delete', command('transaction', 'delete', expense, null), [account], [opening], [account], [expense, opening]],
    ['transaction update', command('transaction', 'update', expense, updatedExpense), [account], [opening, updatedExpense], [account], [opening, expense]],
    ['account add with opening balance', command('account', 'add', null, accountState), [account], [opening], [], []],
    ['account delete with opening balance', command('account', 'delete', accountState, null), [], [], [account], [opening]],
    ['account update with opening balance', command('account', 'update', accountState, renamedAccountState), [renamedAccountState.account], [renamedAccountState.openingTx!], [account], [opening]],
  ] as const)('restores %s', (_name, entry, accounts, transactions, expectedAccounts, expectedTransactions) => {
    const restored = applyUndoRedoCommand(entry, true, [...accounts], [...transactions]);
    const expectedTxs = [...expectedTransactions] as Transaction[];
    const expectedAccs = [...expectedAccounts] as Account[];
    expect(restored.accounts.map(item => ({ id: item.id, name: item.name, balance: item.balance }))).toEqual(expectedAccs.map(item => ({ id: item.id, name: item.name, balance: item.id === 'cash' ? (expectedTxs.some(tx => tx.id === 'opening') ? Math.max(0, (expectedTxs.find(tx => tx.id === 'opening')?.amount ?? 0) - expectedTxs.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0)) : 0) : item.balance })));
    expect(restored.transactions).toEqual(expectedTxs);
  });

  it('reapplies each restored command through redo', () => {
    const entry = command('account', 'delete', accountState, null);
    const restored = applyUndoRedoCommand(entry, true, [], []);
    const redone = applyUndoRedoCommand(entry, false, restored.accounts, restored.transactions);
    expect(redone.accounts).toEqual([]);
    expect(redone.transactions).toEqual([]);
  });
});
