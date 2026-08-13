from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label} anchor not found in {path}')
    p.write_text(text.replace(old, new, 1))

# ledgerSchema: v4 current, v3 remains importable/migratable.
p = Path('src/utils/ledgerSchema.ts')
s = p.read_text()
s = s.replace("export const LEDGER_SCHEMA_VERSION = 'coinbuddy-ledger-v3';", "export const LEDGER_SCHEMA_VERSION = 'coinbuddy-ledger-v4';\nexport const PREVIOUS_LEDGER_SCHEMA_VERSION = 'coinbuddy-ledger-v3';")
s = s.replace(
    "if (ledger.schemaVersion !== LEDGER_SCHEMA_VERSION) return 'This backup is not a supported CoinBuddy ledger export.';",
    "if (ledger.schemaVersion !== LEDGER_SCHEMA_VERSION && ledger.schemaVersion !== PREVIOUS_LEDGER_SCHEMA_VERSION) return 'This backup is not a supported CoinBuddy ledger export.';"
)
old_validate = """  if (ledger.savingsGoals !== undefined && !Array.isArray(ledger.savingsGoals)) return 'Backup field \\\"savingsGoals\\\" must be an array when present.';
  if (!(ledger.accounts as unknown[]).every(value => value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string')) return 'Every imported account must have an id.';"""
new_validate = """  if (ledger.savingsGoals !== undefined && !Array.isArray(ledger.savingsGoals)) return 'Backup field \\\"savingsGoals\\\" must be an array when present.';
  for (const key of ['people', 'sharedObligations', 'sharedResponsibilities', 'sharedPayments', 'sharedSettlements', 'loanSharingRules', 'loanContributionRules']) {
    if (ledger[key] !== undefined && !Array.isArray(ledger[key])) return `Backup field \"${key}\" must be an array when present.`;
  }
  if (!(ledger.accounts as unknown[]).every(value => value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string')) return 'Every imported account must have an id.';"""
if old_validate not in s:
    raise SystemExit('ledger shared validation anchor not found')
s = s.replace(old_validate, new_validate, 1)

old_current = """  if (data.schemaVersion === LEDGER_SCHEMA_VERSION) {
    return {
      ...data,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
      creditCards: Array.isArray(data.creditCards) ? data.creditCards : [],
      widgets: Array.isArray(data.widgets) ? data.widgets : [],
      loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [],
      recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [],
      affordabilitySettings: normalizeAffordabilitySettings(data.affordabilitySettings),
      savingsGoals: normalizeSavingsGoals(data.savingsGoals),
      currency: data.currency || 'INR',
    };
  }
"""
new_current = """  if (data.schemaVersion === LEDGER_SCHEMA_VERSION || data.schemaVersion === PREVIOUS_LEDGER_SCHEMA_VERSION) {
    return {
      ...data,
      schemaVersion: LEDGER_SCHEMA_VERSION,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
      creditCards: Array.isArray(data.creditCards) ? data.creditCards : [],
      widgets: Array.isArray(data.widgets) ? data.widgets : [],
      loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [],
      recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [],
      affordabilitySettings: normalizeAffordabilitySettings(data.affordabilitySettings),
      savingsGoals: normalizeSavingsGoals(data.savingsGoals),
      people: Array.isArray(data.people) ? data.people : [],
      sharedObligations: Array.isArray(data.sharedObligations) ? data.sharedObligations : [],
      sharedResponsibilities: Array.isArray(data.sharedResponsibilities) ? data.sharedResponsibilities : [],
      sharedPayments: Array.isArray(data.sharedPayments) ? data.sharedPayments : [],
      sharedSettlements: Array.isArray(data.sharedSettlements) ? data.sharedSettlements : [],
      loanSharingRules: Array.isArray(data.loanSharingRules) ? data.loanSharingRules : [],
      loanContributionRules: Array.isArray(data.loanContributionRules) ? data.loanContributionRules : [],
      currency: data.currency || 'INR',
    };
  }
"""
if old_current not in s:
    raise SystemExit('ledger current migration anchor not found')
s = s.replace(old_current, new_current, 1)
old_legacy_return = """    creditCards: migratedCards, events: Array.isArray(data.events) ? data.events : [], widgets: Array.isArray(data.widgets) ? data.widgets : [],
    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [], recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [], affordabilitySettings: { ...DEFAULT_AFFORDABILITY_SETTINGS }, savingsGoals: [], currency: data.currency || '$', lastUpdated: new Date().toISOString(),
"""
new_legacy_return = """    creditCards: migratedCards, events: Array.isArray(data.events) ? data.events : [], widgets: Array.isArray(data.widgets) ? data.widgets : [],
    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [], recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [], affordabilitySettings: { ...DEFAULT_AFFORDABILITY_SETTINGS }, savingsGoals: [],
    people: [], sharedObligations: [], sharedResponsibilities: [], sharedPayments: [], sharedSettlements: [], loanSharingRules: [], loanContributionRules: [],
    currency: data.currency || '$', lastUpdated: new Date().toISOString(),
"""
if old_legacy_return not in s:
    raise SystemExit('legacy v4 shared return anchor not found')
s = s.replace(old_legacy_return, new_legacy_return, 1)
p.write_text(s)

# dbClient imports and import normalized rows.
replace_once(
    'src/db/dbClient.ts',
    "import { Account, Category, CreditCardInfo, Event, LoanRevision, RecurrenceFrequency, RecurringRule, Transaction, Widget } from '../types';",
    "import { Account, Category, CreditCardInfo, Event, LoanRevision, RecurrenceFrequency, RecurringRule, Transaction, Widget, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule } from '../types';",
    'dbClient shared imports',
)
replace_once(
    'src/db/dbClient.ts',
    """    const recurringRules: RecurringRule[] = Array.isArray(data.recurringRules) ? data.recurringRules : [];
    const userConfig = Array.isArray(data.users_config) ? data.users_config[0] : undefined;
""",
    """    const recurringRules: RecurringRule[] = Array.isArray(data.recurringRules) ? data.recurringRules : [];
    const people: Person[] = Array.isArray(data.people) ? data.people : [];
    const sharedObligations: SharedObligation[] = Array.isArray(data.sharedObligations) ? data.sharedObligations : [];
    const sharedResponsibilities: SharedResponsibility[] = Array.isArray(data.sharedResponsibilities) ? data.sharedResponsibilities : [];
    const sharedPayments: SharedPayment[] = Array.isArray(data.sharedPayments) ? data.sharedPayments : [];
    const sharedSettlements: SharedSettlement[] = Array.isArray(data.sharedSettlements) ? data.sharedSettlements : [];
    const loanSharingRules: LoanSharingRule[] = Array.isArray(data.loanSharingRules) ? data.loanSharingRules : [];
    const loanContributionRules: LoanContributionRule[] = Array.isArray(data.loanContributionRules) ? data.loanContributionRules : [];
    const userConfig = Array.isArray(data.users_config) ? data.users_config[0] : undefined;
""",
    'import shared arrays',
)
anchor = """    executePreparedRows(driver, `INSERT INTO loan_revisions (id, account_id, effective_date, new_interest_rate, new_emi, new_tenure_months, payment_frequency) VALUES (?, ?, ?, ?, ?, ?, ?);`, loanRevisions.map(revision => [revision.id, revision.accountId, revision.effectiveDate, revision.newInterestRate, revision.newEmi, revision.newTenureMonths, revision.paymentFrequency ?? null]));
    if (userConfig) {
"""
insert = """    executePreparedRows(driver, `INSERT INTO loan_revisions (id, account_id, effective_date, new_interest_rate, new_emi, new_tenure_months, payment_frequency) VALUES (?, ?, ?, ?, ?, ?, ?);`, loanRevisions.map(revision => [revision.id, revision.accountId, revision.effectiveDate, revision.newInterestRate, revision.newEmi, revision.newTenureMonths, revision.paymentFrequency ?? null]));

    // v3.4 normalized shared-finance records. These rows describe responsibility,
    // external funding and settlements; none of them are synthesized ledger cash.
    executePreparedRows(driver, `INSERT INTO people (id, name, relationship, is_self, is_archived, created_at) VALUES (?, ?, ?, ?, ?, ?);`, people.map(person => [person.id, person.name, person.relationship ?? null, person.isSelf ? 1 : 0, person.isArchived ? 1 : 0, (person as any).createdAt ?? new Date().toISOString()]));
    executePreparedRows(driver, `INSERT INTO shared_obligations (id, title, kind, total_amount, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligations.map(item => [item.id, item.title, item.kind, Math.abs(Number(item.totalAmount)), item.dueDate ?? null, item.transactionId ?? null, item.liabilityAccountId ?? null, item.recurringRuleId ?? null, item.settlementMode ?? 'TRACK', item.status ?? 'OPEN', item.createdAt ?? new Date().toISOString()]));
    executePreparedRows(driver, `INSERT INTO shared_responsibilities (id, obligation_id, person_id, amount) VALUES (?, ?, ?, ?);`, sharedResponsibilities.map(item => [item.id, item.obligationId, item.personId, Math.abs(Number(item.amount))]));
    executePreparedRows(driver, `INSERT INTO shared_payments (id, obligation_id, person_id, transaction_id, amount, source, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?);`, sharedPayments.map(item => [item.id, item.obligationId, item.personId, item.transactionId ?? null, Math.abs(Number(item.amount)), item.source, item.paidAt]));
    executePreparedRows(driver, `INSERT INTO shared_settlements (id, obligation_id, from_person_id, to_person_id, transaction_id, amount, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?);`, sharedSettlements.map(item => [item.id, item.obligationId ?? null, item.fromPersonId, item.toPersonId, item.transactionId ?? null, Math.abs(Number(item.amount)), item.settledAt]));
    executePreparedRows(driver, `INSERT INTO loan_sharing_rules (account_id, personal_responsibility_percent, is_shared) VALUES (?, ?, ?);`, loanSharingRules.map(item => [item.accountId, Number(item.personalResponsibilityPercent), item.isShared ? 1 : 0]));
    executePreparedRows(driver, `INSERT INTO loan_contribution_rules (id, account_id, person_id, mode, value, is_active) VALUES (?, ?, ?, ?, ?, ?);`, loanContributionRules.map(item => [item.id, item.accountId, item.personId, item.mode, Number(item.value), item.isActive ? 1 : 0]));

    if (userConfig) {
"""
replace_once('src/db/dbClient.ts', anchor, insert, 'insert normalized shared backup rows')

# tests: v4 export, v3 compatibility, shared array validation.
p = Path('src/__tests__/ledgerImport.test.ts')
s = p.read_text()
s = s.replace("schemaVersion: 'coinbuddy-ledger-v3'", "schemaVersion: 'coinbuddy-ledger-v4'", 1)
s = s.replace(
    """  it('rejects foreign versions and malformed ledger records before import', () => {
    expect(validateLedgerImport({ ...validBackup, schemaVersion: 'foreign-v1' })).toContain('not a supported');
    expect(validateLedgerImport({ ...validBackup, transactions: [{ id: 'transaction-1', amount: 0 }] })).toContain('positive amount');
  });
""",
    """  it('keeps v3 backups importable while rejecting foreign versions', () => {
    expect(validateLedgerImport({ ...validBackup, schemaVersion: 'coinbuddy-ledger-v3' })).toBeNull();
    expect(validateLedgerImport({ ...validBackup, schemaVersion: 'foreign-v1' })).toContain('not a supported');
  });

  it('rejects malformed ledger and normalized shared-finance records before import', () => {
    expect(validateLedgerImport({ ...validBackup, transactions: [{ id: 'transaction-1', amount: 0 }] })).toContain('positive amount');
    expect(validateLedgerImport({ ...validBackup, people: {} })).toContain('people');
    expect(validateLedgerImport({ ...validBackup, sharedObligations: {} })).toContain('sharedObligations');
  });
""",
    1,
)
p.write_text(s)

# migration test focused on v3 -> v4 shared defaults.
Path('src/__tests__/sharedBackupV34.test.ts').write_text("""import { describe, expect, it } from 'vitest';
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
""")
