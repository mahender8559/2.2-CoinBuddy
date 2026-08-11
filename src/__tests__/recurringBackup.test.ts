import { describe, expect, it } from 'vitest';
import { migrateBackupDataToLatest, validateLedgerSchema } from '../utils/ledgerSchema';

const base = {
  schemaVersion: 'coinbuddy-ledger-v3', accounts: [], transactions: [], categories: [],
  creditCards: [], widgets: [], loanRevisions: [], events: [], currency: 'INR',
};

describe('recurring rules backup compatibility', () => {
  it('accepts older v3 exports that do not contain recurringRules', () => {
    expect(validateLedgerSchema(base)).toBeNull();
    expect(migrateBackupDataToLatest(JSON.stringify(base)).recurringRules).toEqual([]);
  });

  it('preserves recurring rules in current exports', () => {
    const recurringRule = {
      id: 'rule-1', title: 'Rent', amount: 20000, transactionType: 'EXPENSE',
      fromAccountId: 'bank', frequency: 'MONTHLY', nextDueDate: '2026-09-01',
      isActive: true, anchorDay: 1,
    };
    const data = { ...base, recurringRules: [recurringRule] };
    expect(validateLedgerSchema(data)).toBeNull();
    expect(migrateBackupDataToLatest(JSON.stringify(data)).recurringRules).toEqual([recurringRule]);
  });
});
