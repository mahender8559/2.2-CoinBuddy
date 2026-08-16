import { describe, expect, it } from 'vitest';
import { LEDGER_SCHEMA_VERSION, migrateBackupDataToLatest, validateLedgerSchema } from './ledgerSchema';

function requiredLedger(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'coinbuddy-ledger-v4',
    accounts: [],
    transactions: [],
    categories: [],
    creditCards: [],
    widgets: [],
    loanRevisions: [],
    ...overrides,
  };
}

describe('ledger schema migration hardening', () => {
  it('normalizes string categories from a supported older backup into stable records', () => {
    const raw = requiredLedger({ categories: ['Food & Dining', 'Custom Hobby'] });
    const migrated = migrateBackupDataToLatest(JSON.stringify(raw), { recomputeBalances: false });
    expect(migrated.schemaVersion).toBe(LEDGER_SCHEMA_VERSION);
    expect(migrated.categories[0]).toMatchObject({ id: 'food-dining', name: 'Food & Dining', type: 'expense' });
    expect(migrated.categories[1]).toMatchObject({ id: 'legacy-custom-hobby-2', name: 'Custom Hobby', type: 'expense' });
    expect(validateLedgerSchema(migrated)).toBeNull();
  });

  it('canonicalizes legacy transaction aliases and negative expense amounts', () => {
    const raw = requiredLedger({
      accounts: [{ id: 'cash', name: 'Cash', type: 'asset', balance: 1000 }],
      categories: ['Food & Dining'],
      transactions: [{ id: 'tx-1', amount: -250, type: 'expense', account_id: 'cash', note: 'Lunch', category: '#fooddining', date: '2026-08-01' }],
    });
    const migrated = migrateBackupDataToLatest(JSON.stringify(raw), { recomputeBalances: false });
    expect(migrated.transactions[0]).toMatchObject({
      id: 'tx-1',
      amount: 250,
      type: 'expense',
      account: 'cash',
      accountId: 'cash',
      fromAccountId: 'cash',
      notes: 'Lunch',
      title: 'Lunch',
    });
    expect(validateLedgerSchema(migrated)).toBeNull();
  });

  it('preserves legacy savings goals with invalid zero targets as disabled records', () => {
    const raw = requiredLedger({
      savingsGoals: [{ id: 'legacy-goal', name: 'Needs repair', targetAmount: 0, isActive: true }],
    });
    const migrated = migrateBackupDataToLatest(JSON.stringify(raw), { recomputeBalances: false });
    expect(migrated.savingsGoals).toHaveLength(1);
    expect(migrated.savingsGoals[0]).toMatchObject({ id: 'legacy-goal', targetAmount: 0, isActive: false });
  });

  it('creates deterministic category ids so repeated migration does not change identity', () => {
    const raw = requiredLedger({ categories: ['One-off Category'] });
    const first = migrateBackupDataToLatest(JSON.stringify(raw), { recomputeBalances: false });
    const second = migrateBackupDataToLatest(JSON.stringify(raw), { recomputeBalances: false });
    expect(first.categories[0].id).toBe(second.categories[0].id);
  });
});
