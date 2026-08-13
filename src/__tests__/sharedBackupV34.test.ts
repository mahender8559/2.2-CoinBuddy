import { describe, expect, it } from 'vitest';
import { LEDGER_SCHEMA_VERSION, migrateBackupDataToLatest } from '../utils/ledgerSchema';

describe('v3.4 shared-finance backup migration', () => {
  it('upgrades v3 ledgers with empty normalized sharing tables', () => {
    const migrated = migrateBackupDataToLatest(JSON.stringify({
      schemaVersion: 'coinbuddy-ledger-v3',
      accounts: [], transactions: [], categories: [], creditCards: [], widgets: [], loanRevisions: [],
    }));
    expect(migrated.schemaVersion).toBe(LEDGER_SCHEMA_VERSION);
    expect(migrated.people).toEqual([]);
    expect(migrated.sharedObligations).toEqual([]);
    expect(migrated.sharedResponsibilities).toEqual([]);
    expect(migrated.sharedPayments).toEqual([]);
    expect(migrated.sharedSettlements).toEqual([]);
    expect(migrated.loanSharingRules).toEqual([]);
    expect(migrated.loanContributionRules).toEqual([]);
  });

  it('preserves v4 shared rows without converting them into transactions', () => {
    const migrated = migrateBackupDataToLatest(JSON.stringify({
      schemaVersion: LEDGER_SCHEMA_VERSION,
      accounts: [], transactions: [], categories: [], creditCards: [], widgets: [], loanRevisions: [],
      people: [{ id: 'me', name: 'Me', isSelf: true, isArchived: false }],
      sharedObligations: [{ id: 'rent', title: 'Rent', kind: 'EXPENSE', totalAmount: 30000, settlementMode: 'TRACK', status: 'OPEN', createdAt: '2026-08-01T00:00:00Z' }],
      sharedResponsibilities: [{ id: 'r1', obligationId: 'rent', personId: 'me', amount: 15000 }],
      sharedPayments: [], sharedSettlements: [], loanSharingRules: [], loanContributionRules: [],
    }));
    expect(migrated.transactions).toEqual([]);
    expect(migrated.sharedObligations[0].totalAmount).toBe(30000);
    expect(migrated.sharedResponsibilities[0].amount).toBe(15000);
  });
});
