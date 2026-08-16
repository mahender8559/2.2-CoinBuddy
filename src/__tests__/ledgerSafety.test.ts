import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../types';
import type { SqlJsDatabaseDriver } from '../db/dbClient';
import {
  applyUndoRedoCommand,
  insertLiabilityPaymentRows,
  persistUndoRedoCommand,
  type AccountUndoState,
  type UndoRedoCommand,
} from '../domain/ledgerSafety';

const account: Account = { id: 'cash', name: 'Cash', type: 'asset', balance: 0 };
const opening: Transaction = {
  id: 'opening', title: 'Opening', subtitle: '', amount: 100, date: '2026-01-01T00:00:00.000Z',
  category: '#opening', icon: 'Landmark', type: 'income', account: 'cash', toAccountId: 'cash',
  isOpeningBalance: true, transaction_type: 'OPENING_BALANCE',
};
const expense: Transaction = {
  id: 'expense', title: 'Food', subtitle: '', amount: 25, date: '2026-01-02T00:00:00.000Z',
  category: '#food', icon: 'Utensils', type: 'expense', account: 'cash', fromAccountId: 'cash',
};

class TransactionalFakeDriver implements SqlJsDatabaseDriver {
  rawDb = { export: () => new Uint8Array(), constructor: class {}, run: () => undefined } as any;
  rows = new Map<string, string>();
  private snapshot: Map<string, string> | null = null;
  failTitle: string | null = null;
  isNewDatabase = false;
  skipDemoSeed = false;

  async execute(sql: string, params: (string | number | null | undefined)[] = []): Promise<void> {
    const normalized = sql.trim().toUpperCase();
    if (normalized.startsWith('BEGIN')) {
      this.snapshot = new Map(this.rows);
      return;
    }
    if (normalized.startsWith('COMMIT')) {
      this.snapshot = null;
      return;
    }
    if (normalized.startsWith('ROLLBACK')) {
      if (this.snapshot) this.rows = new Map(this.snapshot);
      this.snapshot = null;
      return;
    }
    if (normalized.startsWith('INSERT INTO TRANSACTIONS')) {
      const id = String(params[0]);
      const title = String(params[2]);
      if (title === this.failTitle) throw new Error('simulated second-leg failure');
      this.rows.set(id, title);
      return;
    }
    if (normalized.startsWith('DELETE FROM TRANSACTIONS')) {
      this.rows.delete(String(params[0]));
      return;
    }
    if (normalized.startsWith('UPDATE TRANSACTIONS')) {
      const id = String(params[params.length - 1]);
      this.rows.set(id, String(params[1]));
      return;
    }
  }

  async query(): Promise<any[]> { return []; }
  exportToBase64(): string { return ''; }
}

describe('durable Undo/Redo command projection', () => {
  it('removes an opening transaction when undoing an account update that created it', () => {
    const previous: AccountUndoState = { account, openingTx: null };
    const next: AccountUndoState = { account: { ...account, name: 'Wallet' }, openingTx: opening };
    const command: UndoRedoCommand = { entityType: 'account', actionType: 'update', previousState: previous, newState: next };

    const restored = applyUndoRedoCommand(command, true, [next.account], [opening]);
    expect(restored.accounts[0].name).toBe('Cash');
    expect(restored.transactions).toEqual([]);
  });

  it('persists a transaction Undo and Redo as inverse/forward row operations', async () => {
    const driver = new TransactionalFakeDriver();
    const command: UndoRedoCommand = { entityType: 'transaction', actionType: 'delete', previousState: expense, newState: null };

    await persistUndoRedoCommand(driver, command, true);
    expect(driver.rows.get(expense.id)).toBe('Food');

    await persistUndoRedoCommand(driver, command, false);
    expect(driver.rows.has(expense.id)).toBe(false);
  });

  it('undoes and redoes a multi-leg payment as one batch command', async () => {
    const driver = new TransactionalFakeDriver();
    const interest = { ...expense, id: 'interest', title: 'Interest Payment' };
    driver.rows.set(expense.id, expense.title);
    driver.rows.set(interest.id, interest.title);
    const command: UndoRedoCommand = {
      entityType: 'transactionBatch', actionType: 'add', previousState: null, newState: [expense, interest],
    };

    await persistUndoRedoCommand(driver, command, true);
    expect([...driver.rows.keys()]).toEqual([]);

    await persistUndoRedoCommand(driver, command, false);
    expect([...driver.rows.keys()].sort()).toEqual(['expense', 'interest']);
  });
});

describe('atomic liability payment rows', () => {
  it('commits principal and interest together', async () => {
    const driver = new TransactionalFakeDriver();
    const principal = { ...expense, id: 'principal', title: 'Principal Transfer', type: 'transfer' as const, toAccountId: 'loan' };
    const interest = { ...expense, id: 'interest', title: 'Interest Payment' };

    await insertLiabilityPaymentRows(driver, [principal, interest]);
    expect([...driver.rows.keys()].sort()).toEqual(['interest', 'principal']);
  });

  it('rolls back the principal row when the interest row fails', async () => {
    const driver = new TransactionalFakeDriver();
    driver.failTitle = 'Interest Payment';
    const principal = { ...expense, id: 'principal', title: 'Principal Transfer', type: 'transfer' as const, toAccountId: 'loan' };
    const interest = { ...expense, id: 'interest', title: 'Interest Payment' };

    await expect(insertLiabilityPaymentRows(driver, [principal, interest])).rejects.toThrow('simulated second-leg failure');
    expect([...driver.rows.keys()]).toEqual([]);
  });
});
