import { describe, expect, it } from 'vitest';
import { assertRestoreIsNotDuplicate } from './backupManager';

describe('duplicate restore protection', () => {
  it('blocks the same ledger even when volatile export timestamps differ', async () => {
    const current = {
      schemaVersion: 'coinbuddy-ledger-v5',
      exportedAt: '2026-08-01T00:00:00.000Z',
      accounts: [{ id: 'cash', name: 'Cash' }],
      transactions: [{ id: 'tx', amount: 100 }],
    };
    const candidate = { ...current, exportedAt: '2026-08-16T00:00:00.000Z' };
    await expect(assertRestoreIsNotDuplicate(current, candidate)).rejects.toThrow(/same ledger/i);
  });

  it('allows a materially different ledger to continue to restore validation', async () => {
    const current = { accounts: [{ id: 'cash' }], transactions: [{ id: 'tx', amount: 100 }] };
    const candidate = { accounts: [{ id: 'cash' }], transactions: [{ id: 'tx', amount: 101 }] };
    await expect(assertRestoreIsNotDuplicate(current, candidate)).resolves.toBeUndefined();
  });
});
