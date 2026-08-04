import { describe, expect, it } from 'vitest';
import { validateLedgerImport } from '../db/dbClient';

const validBackup = {
  schemaVersion: 'coinbuddy-ledger-v3',
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

  it('rejects foreign versions and malformed ledger records before import', () => {
    expect(validateLedgerImport({ ...validBackup, schemaVersion: 'foreign-v1' })).toContain('not a supported');
    expect(validateLedgerImport({ ...validBackup, transactions: [{ id: 'transaction-1', amount: 0 }] })).toContain('positive amount');
  });
});
