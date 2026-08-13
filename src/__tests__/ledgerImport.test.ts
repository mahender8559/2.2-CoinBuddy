import { describe, expect, it } from 'vitest';
import { validateLedgerImport } from '../db/dbClient';

const validBackup = {
  schemaVersion: 'coinbuddy-ledger-v4',
  accounts: [{ id: 'account-1' }],
  transactions: [{ id: 'transaction-1', amount: 25 }],
  categories: [],
  creditCards: [],
  widgets: [],
  loanRevisions: [],
};

describe('ledger import validation', () => {
  it('accepts a structurally valid CoinBuddy export', () => {
    expect(validateLedgerImport(validBackup)).toBeNull();
  });

  it('keeps v3 backups importable while rejecting foreign versions', () => {
    expect(validateLedgerImport({ ...validBackup, schemaVersion: 'coinbuddy-ledger-v3' })).toBeNull();
    expect(validateLedgerImport({ ...validBackup, schemaVersion: 'foreign-v1' })).toContain('not a supported');
  });

  it('rejects malformed ledger and normalized shared-finance records before import', () => {
    expect(validateLedgerImport({ ...validBackup, transactions: [{ id: 'transaction-1', amount: 0 }] })).toContain('positive amount');
    expect(validateLedgerImport({ ...validBackup, people: {} })).toContain('people');
    expect(validateLedgerImport({ ...validBackup, sharedObligations: {} })).toContain('sharedObligations');
  });
});
