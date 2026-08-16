import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import demoData from '../../DemoData.json';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from './sqliteSchema';
import { Account, Category, CreditCardInfo, Event, LoanRevision, RecurrenceFrequency, RecurringRule, Transaction, Widget, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule, SharedObligationTemplate, SharedTemplateResponsibility, ExternalLoanContribution } from '../types';
import { calculateEmiSplit } from '../utils/emi';
import { bufferToBase64, base64ToUint8Array } from '../utils/encoding';
import { validateLedgerSchema } from '../utils/ledgerSchema';
import { advanceRecurringDate, toLocalDateKey } from '../domain/recurring';
import { normalizeAffordabilityClass } from '../domain/categoryAffordability';
import { AFFORDABILITY_SETTINGS_KEY, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';
import { SAVINGS_GOALS_KEY, normalizeSavingsGoals } from '../domain/savingsGoals';
import { buildInvestmentSipRule, investmentSipRuleId, isInvestmentSipAccount } from '../domain/investmentSip';
import { persistenceCopiesDiverged, persistenceWriteWarning, selectNewestPersistenceCandidate } from './persistenceStrategy';

export const DB_STORAGE_KEY = 'coinbuddy_sqlite_db';
const SNAPSHOT_DB_NAME = 'coinbuddy-ledger';
const SNAPSHOT_STORE = 'snapshots';
const SNAPSHOT_KEY = 'primary';
const RECOVERY_SNAPSHOT_PREFIX = 'recovery:';
const MAX_RECOVERY_SNAPSHOTS = 5;
const OPFS_SNAPSHOT_FILE = 'coinbuddy.sqlite';
const SKIP_DEMO_SEED_KEY = 'coinbuddy_skip_demo_seed';

/** SQLite cannot alter a CHECK constraint in place, so persisted ledgers need
 * a one-time table rebuild when adjustment transaction types are introduced. */
function migrateTransactionTypeConstraint(db: any): void {
  const schemaSql = db.exec("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'")[0]?.values[0]?.[0];
  if (typeof schemaSql !== 'string' || schemaSql.includes('MARKET_ADJUSTMENT')) return;

  db.run('BEGIN');
  try {
    db.run('DROP VIEW IF EXISTS account_balances_view');
    db.run('ALTER TABLE transactions RENAME TO transactions_legacy');
    db.run(CREATE_TABLES_SQL);
    db.run(`
      INSERT INTO transactions (
        id, transaction_type, title, subtitle, amount, date, category, icon,
        account, from_account_id, to_account_id, category_id, notes,
        is_verified, is_recurring, is_opening_balance, is_interest_only,
        event_id, recurring_rule_id, due_date
      )
      SELECT
        id, transaction_type, title, subtitle, amount, date, category, icon,
        account, from_account_id, to_account_id, category_id, notes,
        is_verified, is_recurring, is_opening_balance, is_interest_only,
        event_id, recurring_rule_id, due_date
      FROM transactions_legacy
    `);
    db.run('DROP TABLE transactions_legacy');
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export interface SqlJsDatabaseDriver {
  rawDb: any;
  /** True only when startup found no previously persisted database snapshot. */
  isNewDatabase?: boolean;
  /** One-shot startup decision used after destructive clear so a fresh empty ledger stays empty. */
  skipDemoSeed?: boolean;
  execute: (sql: string, params?: (string | number | null | undefined)[]) => Promise<void>;
  query: (sql: string, params?: (string | number | null | undefined)[]) => Promise<any[]>;
  exportToBase64: () => string;
}

const PERSISTENCE_META_TABLE = 'coinbuddy_persistence_meta';
const PERSISTENCE_GENERATION_KEY = 'ledger_generation';

function ensurePersistenceMetadata(db: any): void {
  db.run(`CREATE TABLE IF NOT EXISTS ${PERSISTENCE_META_TABLE} (key TEXT PRIMARY KEY, value INTEGER NOT NULL)`);
  db.run(`INSERT OR IGNORE INTO ${PERSISTENCE_META_TABLE} (key, value) VALUES (?, 0)`, [PERSISTENCE_GENERATION_KEY]);
}

function readPersistenceGeneration(db: any): number {
  try {
    const result = db.exec(`SELECT value FROM ${PERSISTENCE_META_TABLE} WHERE key = 'ledger_generation' LIMIT 1`);
    const value = Number(result[0]?.values?.[0]?.[0] ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function setPersistenceGeneration(db: any, generation: number): void {
  ensurePersistenceMetadata(db);
  db.run(`UPDATE ${PERSISTENCE_META_TABLE} SET value = ? WHERE key = ?`, [Math.max(0, Math.trunc(generation)), PERSISTENCE_GENERATION_KEY]);
}

function inspectSnapshotGeneration(SQL: any, snapshot: Uint8Array): number | null {
  let probe: any;
  try {
    probe = new SQL.Database(snapshot);
    const integrity = probe.exec('PRAGMA integrity_check;')[0]?.values?.[0]?.[0];
    if (String(integrity).toLowerCase() !== 'ok') return null;
    return readPersistenceGeneration(probe);
  } catch {
    return null;
  } finally {
    try { probe?.close(); } catch { /* best effort */ }
  }
}

function opfsIsAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator.storage as any)?.getDirectory);
}

function notifyPersistenceWarning(message: string): void {
  console.warn(message);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('coinbuddy_persistence_warning', { detail: message }));
}

/** Reject malformed backups before clearing the existing ledger. */
export function validateLedgerImport(data: unknown): string | null {
  return validateLedgerSchema(data);
}

function openSnapshotStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SNAPSHOT_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SNAPSHOT_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'));
  });
}

async function readSnapshot(): Promise<Uint8Array | null> {
  const database = await openSnapshotStore();
  try {
    const value = await new Promise<ArrayBuffer | Uint8Array | undefined>((resolve, reject) => {
      const request = database.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE).get(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return value ? (value instanceof Uint8Array ? value : new Uint8Array(value)) : null;
  } finally { database.close(); }
}

async function writeSnapshot(snapshot: Uint8Array): Promise<void> {
  const database = await openSnapshotStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE).put(snapshot, SNAPSHOT_KEY);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

function snapshotsMatch(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

/** Keep a recoverable copy before restore/clear operations replace the ledger. */
export async function createRecoverySnapshot(driver: SqlJsDatabaseDriver, reason: 'restore' | 'clear' | 'repair'): Promise<string> {
  const key = `${RECOVERY_SNAPSHOT_PREFIX}${new Date().toISOString()}:${reason}`;
  const snapshot = driver.rawDb.export() as Uint8Array;
  const database = await openSnapshotStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE).put(snapshot, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
  const snapshots = await listRecoverySnapshots();
  for (const staleKey of snapshots.slice(MAX_RECOVERY_SNAPSHOTS)) {
    const store = await openSnapshotStore();
    try {
      await new Promise<void>((resolve, reject) => {
        const request = store.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE).delete(staleKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } finally { store.close(); }
  }
  return key;
}

export async function listRecoverySnapshots(): Promise<string[]> {
  const database = await openSnapshotStore();
  try {
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = database.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE).getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return keys.map(String).filter(key => key.startsWith(RECOVERY_SNAPSHOT_PREFIX)).sort().reverse();
  } finally { database.close(); }
}

export async function restoreRecoverySnapshot(driver: SqlJsDatabaseDriver, key: string): Promise<void> {
  if (!key.startsWith(RECOVERY_SNAPSHOT_PREFIX)) throw new Error('Invalid recovery snapshot.');
  const database = await openSnapshotStore();
  let snapshot: Uint8Array | null = null;
  try {
    const value = await new Promise<ArrayBuffer | Uint8Array | undefined>((resolve, reject) => {
      const request = database.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value) snapshot = value instanceof Uint8Array ? value : new Uint8Array(value);
  } finally { database.close(); }
  if (!snapshot) throw new Error('Recovery snapshot is no longer available.');
  const DatabaseConstructor = driver.rawDb.constructor;
  const recovered = new DatabaseConstructor(snapshot);
  recovered.run(SQLITE_PRAGMA_SETUP);
  const integrity = recovered.exec('PRAGMA integrity_check;')[0]?.values?.[0]?.[0];
  if (String(integrity).toLowerCase() !== 'ok') { recovered.close(); throw new Error('Recovery snapshot failed SQLite integrity verification.'); }
  try { driver.rawDb.close(); } catch { /* best effort */ }
  driver.rawDb = recovered;
  await persistDatabase(driver);
}

async function readOpfsSnapshot(): Promise<Uint8Array | null> {
  const getDirectory = typeof navigator !== 'undefined' ? (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined : undefined;
  if (!getDirectory) return null;
  try {
    const root = await getDirectory();
    const file = await (await root.getFileHandle(OPFS_SNAPSHOT_FILE)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch { return null; }
}

async function writeOpfsSnapshot(snapshot: Uint8Array): Promise<boolean> {
  const getDirectory = typeof navigator !== 'undefined' ? (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined : undefined;
  if (!getDirectory) return false;
  const root = await getDirectory();
  const handle = await root.getFileHandle(OPFS_SNAPSHOT_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(snapshot);
  await writable.close();
  return true;
}

function createDriver(db: any, isNewDatabase = false, skipDemoSeed = false): SqlJsDatabaseDriver {
  const driver: SqlJsDatabaseDriver = {
    rawDb: db,
    isNewDatabase,
    skipDemoSeed,
    async execute(sql, params = []) {
      if (params.length === 0) {
        driver.rawDb.exec(sql);
        return;
      }
      const stmt = driver.rawDb.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
    },
    async query(sql, params = []) {
      const stmt = driver.rawDb.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
    exportToBase64() {
      return bufferToBase64(driver.rawDb.export());
    }
  };
  return driver;
}

/** Run a mutation against a restorable in-memory copy and persist it as one unit. */
export async function runAtomicDatabaseAction(driver: SqlJsDatabaseDriver, action: () => Promise<unknown>): Promise<void> {
  const before = driver.rawDb.export() as Uint8Array;
  const DatabaseConstructor = driver.rawDb.constructor;
  try {
    await action();
    await persistDatabase(driver);
  } catch (error) {
    try { driver.rawDb.close(); } catch { /* best effort */ }
    driver.rawDb = new DatabaseConstructor(before);
    driver.rawDb.run(SQLITE_PRAGMA_SETUP);
    throw error;
  }
}

export async function initializeDatabase(): Promise<SqlJsDatabaseDriver> {
  const SQL = await initSqlJs({ locateFile: (file) => file.endsWith('.wasm') ? sqlWasmUrl : file });

  const [opfsSnapshot, indexedDbSnapshot] = await Promise.all([
    readOpfsSnapshot(),
    readSnapshot().catch(error => { console.warn('IndexedDB snapshot read failed:', error); return null; }),
  ]);
  const opfsGeneration = opfsSnapshot ? inspectSnapshotGeneration(SQL, opfsSnapshot) : null;
  const indexedDbGeneration = indexedDbSnapshot ? inspectSnapshotGeneration(SQL, indexedDbSnapshot) : null;
  const candidates = [
    ...(opfsSnapshot && opfsGeneration !== null ? [{ source: 'OPFS' as const, generation: opfsGeneration, snapshot: opfsSnapshot }] : []),
    ...(indexedDbSnapshot && indexedDbGeneration !== null ? [{ source: 'INDEXED_DB' as const, generation: indexedDbGeneration, snapshot: indexedDbSnapshot }] : []),
  ];
  const invalidPrimarySnapshot = Boolean(
    (opfsSnapshot && opfsGeneration === null) ||
    (indexedDbSnapshot && indexedDbGeneration === null),
  );
  const selected = selectNewestPersistenceCandidate(candidates);
  let saved = selected?.snapshot ?? null;
  const diverged = invalidPrimarySnapshot || persistenceCopiesDiverged(candidates, snapshotsMatch);

  if (!saved && (opfsSnapshot || indexedDbSnapshot)) {
    throw new Error('CoinBuddy found local ledger snapshots, but none passed SQLite integrity verification. The primary copies were left untouched so a recovery snapshot can be restored safely.');
  }

  if (!saved) {
    const legacy = localStorage.getItem(DB_STORAGE_KEY);
    if (legacy) {
      saved = base64ToUint8Array(legacy);
      await writeSnapshot(saved);
      const verifiedSnapshot = await readSnapshot();
      if (!verifiedSnapshot || verifiedSnapshot.byteLength !== saved.byteLength) {
        throw new Error('Legacy ledger migration could not be verified; the original backup was preserved.');
      }
      await writeOpfsSnapshot(saved).catch(() => false);
      localStorage.removeItem(DB_STORAGE_KEY);
    }
  }

  const isNewDatabase = !saved;
  const db = saved ? new SQL.Database(saved) : new SQL.Database();
  const shouldSkipDemoSeed = localStorage.getItem(SKIP_DEMO_SEED_KEY) === 'true';

  db.run(SQLITE_PRAGMA_SETUP);
  db.run(CREATE_TABLES_SQL);
  for (const migration of SQLITE_MIGRATIONS) {
    try { db.run(migration); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
    }
  }
  migrateTransactionTypeConstraint(db);
  ensurePersistenceMetadata(db);

  if (shouldSkipDemoSeed) localStorage.removeItem(SKIP_DEMO_SEED_KEY);

  const driver = createDriver(db, isNewDatabase, shouldSkipDemoSeed);
  if (diverged && selected) {
    notifyPersistenceWarning(`Local ledger copies disagreed. CoinBuddy selected the newer ${selected.source === 'OPFS' ? 'OPFS' : 'IndexedDB'} snapshot (generation ${selected.generation}) and is repairing redundancy.`);
    try { await persistDatabase(driver); }
    catch (error) { console.warn('Persistence redundancy repair could not complete:', error); }
  }
  return driver;
}

export async function persistDatabase(driver: SqlJsDatabaseDriver): Promise<void> {
  ensurePersistenceMetadata(driver.rawDb);
  const previousGeneration = readPersistenceGeneration(driver.rawDb);
  const nextGeneration = previousGeneration + 1;
  setPersistenceGeneration(driver.rawDb, nextGeneration);
  const snapshot = driver.rawDb.export() as Uint8Array;
  let indexedDbError: unknown;
  let opfsError: unknown;
  let indexedDbSaved = false;
  let opfsSaved = false;
  const opfsAvailable = opfsIsAvailable();

  try {
    await writeSnapshot(snapshot);
    const verified = await readSnapshot();
    if (!verified || !snapshotsMatch(snapshot, verified)) throw new Error('IndexedDB verification failed after write.');
    indexedDbSaved = true;
  } catch (error) {
    indexedDbError = error;
  }

  if (opfsAvailable) {
    try { opfsSaved = await writeOpfsSnapshot(snapshot); }
    catch (error) { opfsError = error; }
  }

  if (!indexedDbSaved && !opfsSaved) {
    setPersistenceGeneration(driver.rawDb, previousGeneration);
    const cause = indexedDbError ?? opfsError ?? new Error('No persistent browser storage is available.');
    throw new Error(`Unable to save your ledger locally: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  const warning = persistenceWriteWarning({ indexedDbSaved, opfsSaved, opfsAvailable });
  if (warning) notifyPersistenceWarning(warning);
}

export async function deletePersistedDatabase(): Promise<void> {
  const database = await openSnapshotStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE).delete(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
  const getDirectory = typeof navigator !== 'undefined' ? (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined : undefined;
  if (getDirectory) {
    try { await (await getDirectory()).removeEntry(OPFS_SNAPSHOT_FILE); } catch { /* file did not exist */ }
  }
}

export function clearAppBrowserStorage(): void {
  const appStorageKeys = [
    'coinbuddy_backup_config',
    'coinbuddy_onboarding_seen',
    'hasCompletedButtonTour',
    'coinbuddy_balances_visible',
    'monthly-tracker-state',
    'coinbuddy_saved_backups',
    'coinbuddy_sqlite_db',
    'coinbuddy_drive_oauth_result',
  ];

  for (const key of appStorageKeys) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

export function markClearStoragePending(): void {
  localStorage.setItem(SKIP_DEMO_SEED_KEY, 'true');
}

export function normalizeAccountRow(row: any): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type?.toLowerCase() === 'liability' ? 'liability' : 'asset',
    balance: Number(row.cached_balance ?? 0),
    limit: row.credit_limit ?? row.limit ?? undefined,
    overdraftLimit: Number(row.overdraft_limit ?? row.overdraftLimit ?? 0),
    group: row.subtype ?? row.group ?? undefined,
    is_archived: Number(row.is_archived ?? 0),
    originalPrincipal: row.original_principal ?? row.originalPrincipal,
    interestRate: row.interest_rate ?? row.interestRate,
    monthlyEMI: row.monthly_emi ?? row.monthlyEMI,
    interestCalculationType: row.interest_calculation_type ?? row.interestCalculationType,
    paymentFrequency: row.payment_frequency ?? row.paymentFrequency,
    tenureMonths: row.tenure_months ?? row.tenureMonths,
    loanStartDate: row.loan_start_date ?? row.loanStartDate,
    lateFeeFixedAmount: row.late_fee_fixed_amount ?? row.lateFeeFixedAmount,
    lateFeeInterestRate: row.late_fee_interest_rate ?? row.lateFeeInterestRate,
    gracePeriodDays: row.grace_period_days ?? row.gracePeriodDays,
    nextEMIDate: row.next_emi_date ?? row.nextEMIDate,
    monthlyInterestRate: row.monthly_interest_rate ?? row.monthlyInterestRate,
    nextInterestDueDate: row.next_interest_due_date ?? row.nextInterestDueDate,
    investmentMethod: row.investment_method ?? row.investmentMethod,
    investedAmount: row.invested_amount ?? row.investedAmount,
    monthlySIPAmount: row.monthly_sip_amount ?? row.monthlySIPAmount,
    nextSIPDate: row.next_sip_date ?? row.nextSIPDate,
  };
}

export function normalizeTransactionRow(row: any): Transaction {
  const txType = row.transaction_type?.toUpperCase?.() ?? 'INCOME';
  const normalizedType = txType === 'EXPENSE'
    ? 'expense'
    : txType === 'TRANSFER'
      ? 'transfer'
      : (txType === 'OPENING_BALANCE' ? (row.to_account_id ? 'income' : 'expense') : 'income');

  return {
    id: row.id,
    title: row.title ?? '',
    subtitle: row.subtitle ?? '',
    amount: Number(row.amount ?? 0),
    date: new Date(Number(row.date ?? Date.now())).toISOString(),
    category: row.category ?? '#uncategorized',
    icon: row.icon ?? 'Wallet',
    type: normalizedType,
    account: row.account ?? null,
    fromAccountId: row.from_account_id ?? null,
    toAccountId: row.to_account_id ?? null,
    notes: row.notes ?? null,
    is_verified: Number(row.is_verified ?? 1),
    isRecurring: Boolean(Number(row.is_recurring ?? 0)),
    isOpeningBalance: Boolean(Number(row.is_opening_balance ?? 0)),
    isInterestOnly: Boolean(Number(row.is_interest_only ?? 0)),
    recurringRuleId: row.recurring_rule_id ?? undefined,
    dueDate: row.due_date ?? undefined,
    eventId: row.event_id ?? undefined,
    goalId: row.goal_id ?? undefined,
    transaction_type: row.transaction_type,
  } as Transaction;
}

export function normalizeRecurringRuleRow(row: any): RecurringRule {
  const nextDueDate = row.next_due_date ?? row.nextDueDate ?? toLocalDateKey(new Date());
  const fallbackAnchor = Number(String(nextDueDate).slice(8, 10));
  return {
    id: row.id,
    title: row.title ?? '',
    subtitle: row.subtitle ?? undefined,
    amount: Number(row.amount ?? 0),
    transactionType: (row.transaction_type ?? 'EXPENSE').toUpperCase(),
    account: row.account ?? undefined,
    fromAccountId: row.from_account_id ?? undefined,
    toAccountId: row.to_account_id ?? undefined,
    category: row.category ?? undefined,
    icon: row.icon ?? undefined,
    notes: row.notes ?? undefined,
    isInterestOnly: Boolean(Number(row.is_interest_only ?? 0)),
    frequency: (row.frequency ?? 'MONTHLY') as RecurrenceFrequency,
    nextDueDate,
    isActive: Number(row.is_active ?? 1) === 1,
    eventId: row.event_id ?? undefined,
    goalId: row.goal_id ?? undefined,
    anchorDay: Number(row.anchor_day ?? fallbackAnchor) || undefined,
  } as RecurringRule;
}

export async function loadStateFromDatabase(driver: SqlJsDatabaseDriver) {
  const [accountRows, txRows, categoryRows, creditCardRows, widgetRows, loanRows, eventRows, recurringRuleRows] = await Promise.all([
    driver.query(`SELECT * FROM account_balances_view WHERE is_archived = 0 ORDER BY name ASC;`),
    driver.query(`SELECT * FROM transactions ORDER BY date DESC;`),
    driver.query(`SELECT * FROM categories ORDER BY name ASC;`),
    driver.query(`SELECT cc.*, a.credit_limit, a.cached_balance FROM credit_cards cc LEFT JOIN account_balances_view a ON a.id = cc.account_id ORDER BY cc.id ASC;`),
    driver.query(`SELECT * FROM widgets ORDER BY id ASC;`),
    driver.query(`SELECT * FROM loan_revisions ORDER BY effective_date DESC;`),
    driver.query(`SELECT * FROM events ORDER BY created_at DESC, name ASC;`),
    driver.query(`SELECT * FROM recurring_rules ORDER BY is_active DESC, next_due_date ASC, title ASC;`),
  ]);

  return {
    accounts: accountRows.map(normalizeAccountRow),
    transactions: txRows.map(normalizeTransactionRow),
    categories: categoryRows.map(normalizeCategoryRow),
    creditCards: creditCardRows.map(normalizeCreditCardRow),
    widgets: widgetRows.map(normalizeWidgetRow),
    loanRevisions: loanRows.map(normalizeLoanRevisionRow),
    events: eventRows.map(normalizeEventRow),
    recurringRules: recurringRuleRows.map(normalizeRecurringRuleRow),
  };
}

function normalizeDemoCategoryType(type?: string): 'INCOME' | 'EXPENSE' {
  if (!type) return 'EXPENSE';
  const normalized = type.toString().toLowerCase();
  if (normalized === 'income') return 'INCOME';
  return 'EXPENSE';
}

function resolveDemoRelativeDate(offsetValue: unknown, dateOnly = false): string | undefined {
  if (offsetValue === undefined || offsetValue === null || offsetValue === '') return undefined;
  const offset = Number(offsetValue);
  if (!Number.isFinite(offset)) return undefined;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Math.trunc(offset));
  return dateOnly ? toLocalDateKey(date) : date.toISOString();
}

function hydrateDemoData(raw: any): any {
  const data = JSON.parse(JSON.stringify(raw ?? {}));
  data.accounts = (Array.isArray(data.accounts) ? data.accounts : []).map((account: any) => ({
    ...account,
    loanStartDate: resolveDemoRelativeDate(account.loanStartOffsetDays, true) ?? account.loanStartDate,
    nextEMIDate: resolveDemoRelativeDate(account.nextEMIOffsetDays, true) ?? account.nextEMIDate,
    nextSIPDate: resolveDemoRelativeDate(account.nextSIPOffsetDays, true) ?? account.nextSIPDate,
  }));
  data.events = (Array.isArray(data.events) ? data.events : []).map((event: any) => ({
    ...event,
    createdAt: resolveDemoRelativeDate(event.createdOffsetDays) ?? event.createdAt ?? new Date().toISOString(),
  }));
  data.transactions = (Array.isArray(data.transactions) ? data.transactions : []).map((tx: any) => ({
    ...tx,
    date: resolveDemoRelativeDate(tx.dateOffsetDays) ?? tx.date ?? new Date().toISOString(),
    dueDate: resolveDemoRelativeDate(tx.dueDateOffsetDays, true) ?? tx.dueDate,
  }));
  data.creditCards = (Array.isArray(data.creditCards) ? data.creditCards : []).map((card: any) => ({
    ...card,
    dueDate: resolveDemoRelativeDate(card.dueOffsetDays, true) ?? card.dueDate ?? '',
  }));
  data.recurringRules = (Array.isArray(data.recurringRules) ? data.recurringRules : []).map((rule: any) => ({
    ...rule,
    nextDueDate: resolveDemoRelativeDate(rule.nextDueOffsetDays, true) ?? rule.nextDueDate ?? toLocalDateKey(new Date()),
  }));
  data.savingsGoals = (Array.isArray(data.savingsGoals) ? data.savingsGoals : []).map((goal: any) => ({
    ...goal,
    targetDate: resolveDemoRelativeDate(goal.targetOffsetDays, true) ?? goal.targetDate,
    createdAt: resolveDemoRelativeDate(goal.createdOffsetDays) ?? goal.createdAt ?? new Date().toISOString(),
  }));
  data.loanRevisions = (Array.isArray(data.loanRevisions) ? data.loanRevisions : []).map((revision: any) => ({
    ...revision,
    effectiveDate: resolveDemoRelativeDate(revision.effectiveOffsetDays, true) ?? revision.effectiveDate ?? toLocalDateKey(new Date()),
  }));
  data.users_config = [{
    currency_code: data.currency ?? 'INR',
    month_cycle_day: Number(data.monthCycleDay ?? 25),
  }];
  data.sharedObligations = (Array.isArray(data.sharedObligations) ? data.sharedObligations : []).map((item: any) => ({ ...item, dueDate: resolveDemoRelativeDate(item.dueOffsetDays, true) ?? item.dueDate, createdAt: resolveDemoRelativeDate(item.createdOffsetDays, false) ?? item.createdAt }));
  data.sharedPayments = (Array.isArray(data.sharedPayments) ? data.sharedPayments : []).map((item: any) => ({ ...item, paidAt: resolveDemoRelativeDate(item.paidOffsetDays, false) ?? item.paidAt }));
  data.sharedSettlements = (Array.isArray(data.sharedSettlements) ? data.sharedSettlements : []).map((item: any) => ({ ...item, settledAt: resolveDemoRelativeDate(item.settledOffsetDays, false) ?? item.settledAt }));
  data.sharedObligationTemplates = (Array.isArray(data.sharedObligationTemplates) ? data.sharedObligationTemplates : []).map((item: any) => ({ ...item, nextDueDate: resolveDemoRelativeDate(item.nextDueOffsetDays, true) ?? item.nextDueDate, createdAt: resolveDemoRelativeDate(item.createdOffsetDays, false) ?? item.createdAt }));
  data.externalLoanContributions = (Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : []).map((item: any) => ({ ...item, paidAt: resolveDemoRelativeDate(item.paidOffsetDays, false) ?? item.paidAt }));
  return data;
}

export async function loadDemoDataFromJson(driver: SqlJsDatabaseDriver): Promise<void> {
  // Keep security/backup preferences intact. Demo data replaces the financial
  // ledger and planning examples, not the user's device protection choices.
  const existingSettings = await loadAppSettings(driver);
  const preservedKeys = ['passcode', 'biometric', 'backupConfig', 'backupHistory', 'theme', 'colorPalette'];
  const data = hydrateDemoData(demoData);
  await importLedgerToDatabase(driver, data, { skipValidation: true });
  if (data.profile && typeof data.profile === 'object') await upsertAppSetting(driver, 'profile', data.profile);
  await upsertAppSetting(driver, 'demoDatasetVersion', data.version ?? 'v3.3_showcase');
  for (const key of preservedKeys) {
    if (Object.prototype.hasOwnProperty.call(existingSettings, key)) await upsertAppSetting(driver, key, existingSettings[key]);
  }
}

export async function seedDemoData(driver: SqlJsDatabaseDriver): Promise<void> {
  const existingAccounts = await driver.query(`SELECT COUNT(*) AS count FROM accounts;`);
  const count = Number(existingAccounts[0]?.count ?? 0);
  if (count > 0) return;

  await loadDemoDataFromJson(driver);
}

export async function insertAccountRow(
  driver: SqlJsDatabaseDriver,
  account: Account,
  openingBalance: number,
  openingTransactionId: string = crypto.randomUUID(),
  manageTransaction = true,
): Promise<void> {
  const type = account.type === 'liability' ? 'LIABILITY' : 'ASSET';
  if (manageTransaction) await driver.execute('BEGIN TRANSACTION');
  try {
    await driver.execute(
      `INSERT INTO accounts (id, name, type, subtype, credit_limit, overdraft_limit, interest_rate, monthly_emi, interest_calculation_type, payment_frequency, tenure_months, loan_start_date, original_principal, next_emi_date, monthly_interest_rate, next_interest_due_date, investment_method, invested_amount, monthly_sip_amount, next_sip_date, is_archived, late_fee_fixed_amount, late_fee_interest_rate, grace_period_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [account.id, account.name, type, account.group ?? null, account.limit ?? null, Math.max(0, account.overdraftLimit ?? 0), account.interestRate ?? null, account.monthlyEMI ?? null, account.interestCalculationType ?? null, account.paymentFrequency ?? null, account.tenureMonths ?? null, account.loanStartDate ?? null, account.originalPrincipal ?? null, account.nextEMIDate ?? null, account.monthlyInterestRate ?? null, account.nextInterestDueDate ?? null, account.investmentMethod ?? null, account.investedAmount ?? null, account.monthlySIPAmount ?? null, account.nextSIPDate ?? null, account.is_archived ?? 0, account.lateFeeFixedAmount ?? null, account.lateFeeInterestRate ?? null, account.gracePeriodDays ?? null]
    );

    if (openingBalance > 0) {
      const params = [openingTransactionId, 'OPENING_BALANCE', 'Opening Balance', account.type === 'asset' ? 'Initial Balance' : 'Initial Debt', openingBalance, Date.now(), '#opening', account.type === 'liability' ? 'CreditCard' : 'Landmark', account.id, account.type === 'liability' ? account.id : null, account.type === 'asset' ? account.id : null, 1, 1, 0, 0];
      await driver.execute(
        `INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, is_verified, is_opening_balance, is_recurring, is_interest_only) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        params
      );
    }
    if (manageTransaction) await driver.execute('COMMIT');
  } catch (error) {
    if (manageTransaction) await driver.execute('ROLLBACK');
    throw error;
  }
}

export async function insertCreditCardAccount(
  driver: SqlJsDatabaseDriver,
  account: Account,
  card: CreditCardInfo,
  openingBalance: number,
  openingTransactionId?: string,
): Promise<void> {
  await driver.execute('BEGIN TRANSACTION');
  try {
    await insertAccountRow(driver, account, openingBalance, openingTransactionId, false);
    await insertCreditCardRow(driver, card);
    await driver.execute('COMMIT');
  } catch (error) {
    await driver.execute('ROLLBACK');
    throw error;
  }
}

export async function updateAccountRow(driver: SqlJsDatabaseDriver, account: Account): Promise<void> {
  const type = account.type === 'liability' ? 'LIABILITY' : 'ASSET';
  await driver.execute(
    `UPDATE accounts SET name = ?, type = ?, subtype = ?, credit_limit = ?, overdraft_limit = ?, interest_rate = ?, monthly_emi = ?, interest_calculation_type = ?, payment_frequency = ?, tenure_months = ?, loan_start_date = ?, original_principal = ?, next_emi_date = ?, monthly_interest_rate = ?, next_interest_due_date = ?, investment_method = ?, invested_amount = ?, monthly_sip_amount = ?, next_sip_date = ?, is_archived = ?, late_fee_fixed_amount = ?, late_fee_interest_rate = ?, grace_period_days = ? WHERE id = ?;`,
    [account.name, type, account.group ?? null, account.limit ?? null, Math.max(0, account.overdraftLimit ?? 0), account.interestRate ?? null, account.monthlyEMI ?? null, account.interestCalculationType ?? null, account.paymentFrequency ?? null, account.tenureMonths ?? null, account.loanStartDate ?? null, account.originalPrincipal ?? null, account.nextEMIDate ?? null, account.monthlyInterestRate ?? null, account.nextInterestDueDate ?? null, account.investmentMethod ?? null, account.investedAmount ?? null, account.monthlySIPAmount ?? null, account.nextSIPDate ?? null, account.is_archived ?? 0, account.lateFeeFixedAmount ?? null, account.lateFeeInterestRate ?? null, account.gracePeriodDays ?? null, account.id]
  );
}

export async function insertCategoryRow(driver: SqlJsDatabaseDriver, category: Category): Promise<void> {
  await driver.execute(
    `INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, rollover_account_id, tags_json, group_name, affordability_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [category.id, category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null, normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type)]
  );
}

export async function updateCategoryRow(driver: SqlJsDatabaseDriver, id: string, category: Category): Promise<void> {
  await driver.execute(
    `UPDATE categories SET name = ?, type = ?, icon_name = ?, budget = ?, is_rollover = ?, rollover_account_id = ?, tags_json = ?, group_name = ?, affordability_class = ? WHERE id = ?;`,
    [category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null, normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type), id]
  );
}

export async function deleteCategoryRow(driver: SqlJsDatabaseDriver, id: string): Promise<void> {
  await driver.execute(`DELETE FROM categories WHERE id = ?;`, [id]);
}

export async function insertEventRow(driver: SqlJsDatabaseDriver, event: Event): Promise<void> {
  await driver.execute(
    `INSERT INTO events (event_id, name, created_at) VALUES (?, ?, ?);`,
    [event.id, event.name, event.createdAt]
  );
}

export async function updateTransactionEvents(driver: SqlJsDatabaseDriver, transactionIds: string[], eventId: string | null): Promise<void> {
  if (!transactionIds.length) return;
  const placeholders = transactionIds.map(() => '?').join(', ');
  await driver.execute(`UPDATE transactions SET event_id = ? WHERE id IN (${placeholders});`, [eventId, ...transactionIds]);
}

export async function insertCreditCardRow(driver: SqlJsDatabaseDriver, card: CreditCardInfo): Promise<void> {
  await driver.execute(`INSERT INTO credit_cards (id, account_id, due_amount, due_date, billing_cycle_day) VALUES (?, ?, ?, ?, ?);`, [card.id, card.id, card.dueAmount ?? 0, card.dueDate ?? '', card.billingCycleDay ?? 1]);
}

export async function updateCreditCardRow(driver: SqlJsDatabaseDriver, card: CreditCardInfo): Promise<void> {
  await driver.execute(`UPDATE credit_cards SET due_amount = ?, due_date = ?, billing_cycle_day = ? WHERE account_id = ?;`, [card.dueAmount ?? 0, card.dueDate ?? '', card.billingCycleDay ?? 1, card.id]);
}

export async function deleteCreditCardRow(driver: SqlJsDatabaseDriver, cardId: string): Promise<void> {
  await driver.execute(`DELETE FROM credit_cards WHERE account_id = ?;`, [cardId]);
}

export async function insertWidgetRow(driver: SqlJsDatabaseDriver, widget: Widget): Promise<void> {
  await driver.execute(`INSERT INTO widgets (id, type, target_id) VALUES (?, ?, ?);`, [widget.id, widget.type, widget.targetId]);
}

export async function deleteWidgetRow(driver: SqlJsDatabaseDriver, id: string): Promise<void> {
  await driver.execute(`DELETE FROM widgets WHERE id = ?;`, [id]);
}

export async function insertLoanRevisionRow(driver: SqlJsDatabaseDriver, revision: LoanRevision): Promise<void> {
  await driver.execute(`INSERT INTO loan_revisions (id, account_id, effective_date, new_interest_rate, new_emi, new_tenure_months, payment_frequency) VALUES (?, ?, ?, ?, ?, ?, ?);`, [revision.id, revision.accountId, revision.effectiveDate, revision.newInterestRate, revision.newEmi, revision.newTenureMonths, revision.paymentFrequency ?? null]);
}

export async function deleteLoanRevisionRow(driver: SqlJsDatabaseDriver, id: string): Promise<void> {
  await driver.execute(`DELETE FROM loan_revisions WHERE id = ?;`, [id]);
}

export async function insertTransactionRow(driver: SqlJsDatabaseDriver, tx: Omit<Transaction, 'id'> & { id?: string }): Promise<string> {
  const id = tx.id ?? crypto.randomUUID();
  const amount = Math.abs(Number(tx.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Transaction amount must be a finite positive number.');
  const transactionType = tx.transaction_type?.toUpperCase?.() || tx.type?.toUpperCase?.() || 'INCOME';
  const parsedType = ['EXPENSE', 'TRANSFER', 'OPENING_BALANCE', 'MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT'].includes(transactionType) ? transactionType : 'INCOME';
  await driver.execute(
    `INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only, recurring_rule_id, due_date, event_id, goal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.recurringRuleId ?? null, tx.dueDate ?? null, tx.eventId ?? null, tx.goalId ?? null]
  );
  return id;
}

export async function updateTransactionRow(driver: SqlJsDatabaseDriver, id: string, tx: Omit<Transaction, 'id'>): Promise<void> {
  const amount = Math.abs(Number(tx.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Transaction amount must be a finite positive number.');
  const transactionType = tx.transaction_type?.toUpperCase?.() || tx.type?.toUpperCase?.() || 'INCOME';
  const parsedType = ['EXPENSE', 'TRANSFER', 'OPENING_BALANCE', 'MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT'].includes(transactionType) ? transactionType : 'INCOME';
  await driver.execute(
    `UPDATE transactions SET transaction_type = ?, title = ?, subtitle = ?, amount = ?, date = ?, category = ?, icon = ?, account = ?, from_account_id = ?, to_account_id = ?, notes = ?, is_verified = ?, is_recurring = ?, is_opening_balance = ?, is_interest_only = ?, event_id = ?, goal_id = ? WHERE id = ?;`,
    [parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.eventId ?? null, tx.goalId ?? null, id]
  );
}

export async function deleteTransactionRow(driver: SqlJsDatabaseDriver, id: string): Promise<void> {
  await driver.execute(`DELETE FROM transactions WHERE id = ?;`, [id]);
}

export async function clearDatabase(driver: SqlJsDatabaseDriver): Promise<void> {
  await driver.execute(`DELETE FROM external_loan_contributions; DELETE FROM shared_settlements; DELETE FROM shared_payments; DELETE FROM shared_responsibilities; DELETE FROM shared_template_responsibilities; DELETE FROM loan_contribution_rules; DELETE FROM loan_sharing_rules; DELETE FROM shared_obligations; DELETE FROM shared_obligation_templates; DELETE FROM people; DELETE FROM transactions; DELETE FROM recurring_rules; DELETE FROM credit_cards; DELETE FROM widgets; DELETE FROM loan_revisions; DELETE FROM categories; DELETE FROM events; DELETE FROM accounts; DELETE FROM users_config; DELETE FROM app_settings;`);
}

export async function createRecurringRule(
  driver: SqlJsDatabaseDriver,
  template: Omit<Transaction, 'id'> & { id?: string },
  options: { id?: string; nextDueDate?: string } = {},
): Promise<string> {
  const amount = Math.abs(Number(template.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Recurring rule amount must be a finite positive number.');
  const id = options.id ?? template.recurringRuleId ?? template.id ?? crypto.randomUUID();
  const type = (template.transaction_type ?? template.type).toUpperCase();
  if (!['INCOME', 'EXPENSE', 'TRANSFER'].includes(type)) throw new Error(`Unsupported recurring transaction type: ${type}.`);
  const fromAccountId = template.fromAccountId ?? (type === 'EXPENSE' ? template.account : undefined);
  const toAccountId = template.toAccountId ?? (type === 'INCOME' ? template.account : undefined);
  if ((type === 'EXPENSE' || type === 'TRANSFER') && !fromAccountId) throw new Error('A recurring expense or transfer requires a source account.');
  if ((type === 'INCOME' || type === 'TRANSFER') && !toAccountId) throw new Error('A recurring income or transfer requires a destination account.');
  const startDate = toLocalDateKey(template.date);
  const anchorDay = Number(startDate.slice(8, 10));
  const frequency = (template.recurrenceFrequency ?? 'MONTHLY') as RecurrenceFrequency;
  const nextDueDate = options.nextDueDate ?? startDate;
  await driver.execute(
    `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, frequency, next_due_date, is_active, event_id, goal_id, anchor_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, template.title, template.subtitle ?? null, amount, type, template.account ?? null, fromAccountId ?? null, toAccountId ?? null, template.category ?? null, template.icon ?? null, template.notes ?? null, template.isInterestOnly ? 1 : 0, frequency, nextDueDate, 1, template.eventId ?? null, template.goalId ?? null, anchorDay]
  );
  return id;
}

export async function updateRecurringRuleRow(driver: SqlJsDatabaseDriver, rule: RecurringRule): Promise<void> {
  const amount = Math.abs(Number(rule.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Recurring rule amount must be a finite positive number.');
  if (!rule.nextDueDate) throw new Error('Recurring rule requires a next due date.');
  await driver.execute(
    `UPDATE recurring_rules SET title = ?, subtitle = ?, amount = ?, transaction_type = ?, account = ?, from_account_id = ?, to_account_id = ?, category = ?, icon = ?, notes = ?, is_interest_only = ?, frequency = ?, next_due_date = ?, is_active = ?, event_id = ?, goal_id = ?, anchor_day = ? WHERE id = ?;`,
    [rule.title.trim() || 'Recurring payment', rule.subtitle ?? null, amount, rule.transactionType, rule.account ?? null, rule.fromAccountId ?? null, rule.toAccountId ?? null, rule.category ?? null, rule.icon ?? null, rule.notes ?? null, rule.isInterestOnly ? 1 : 0, rule.frequency, rule.nextDueDate, rule.isActive ? 1 : 0, rule.eventId ?? null, rule.goalId ?? null, rule.anchorDay ?? Number(rule.nextDueDate.slice(8, 10)), rule.id]
  );
}

export async function deleteRecurringRuleRow(driver: SqlJsDatabaseDriver, id: string): Promise<void> {
  await driver.execute(`DELETE FROM recurring_rules WHERE id = ?;`, [id]);
}

/** Keep Investment-account SIP metadata and the recurring scheduler in sync. */
export async function syncInvestmentSipRecurringRule(
  driver: SqlJsDatabaseDriver,
  accountId: string,
  account: Account,
  sourceAccountId?: string,
): Promise<void> {
  const ruleId = investmentSipRuleId(accountId);
  const existing = await driver.query(`SELECT id FROM recurring_rules WHERE id = ?`, [ruleId]);

  if (!isInvestmentSipAccount(account)) {
    if (existing.length) await deleteRecurringRuleRow(driver, ruleId);
    return;
  }
  if (!sourceAccountId) throw new Error('Choose the account that funds this SIP.');

  const rule = buildInvestmentSipRule(accountId, account, sourceAccountId);
  if (existing.length) {
    await updateRecurringRuleRow(driver, rule);
  } else {
    await createRecurringRule(driver, {
      title: rule.title,
      subtitle: rule.subtitle ?? '',
      amount: rule.amount,
      date: `${rule.nextDueDate}T12:00:00`,
      category: rule.category ?? '#investment',
      icon: rule.icon ?? 'Target',
      type: 'transfer',
      fromAccountId: rule.fromAccountId,
      toAccountId: rule.toAccountId,
      transaction_type: 'TRANSFER',
      isRecurring: true,
      recurrenceFrequency: 'MONTHLY',
      notes: rule.notes,
    }, { id: rule.id, nextDueDate: rule.nextDueDate });
  }

  // If the first SIP is already due, create it as Needs confirmation now.
  await generateDueRecurringTransactions(driver, false);
}

export async function skipRecurringRuleOccurrence(driver: SqlJsDatabaseDriver, id: string): Promise<void> {
  const rows = await driver.query(`SELECT next_due_date, frequency, anchor_day FROM recurring_rules WHERE id = ?`, [id]);
  const row = rows[0];
  if (!row) throw new Error('Recurring rule no longer exists.');
  const frequency = (row.frequency ?? 'MONTHLY') as RecurrenceFrequency;
  const anchorDay = Number(row.anchor_day ?? String(row.next_due_date).slice(8, 10));
  const nextDueDate = advanceRecurringDate(row.next_due_date, frequency, anchorDay);
  await driver.execute(`UPDATE recurring_rules SET next_due_date = ? WHERE id = ?`, [nextDueDate, id]);
}

function localNoonIso(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}

/**
 * One-time compatibility repair for recurring rules created by the previous
 * implementation, which marked their first generated occurrence as verified
 * before the user had confirmed it. Restrict the repair to active rules with
 * exactly one generated occurrence so established recurring history is not
 * reopened for confirmation.
 */
export async function repairLegacyRecurringConfirmationState(
  driver: SqlJsDatabaseDriver,
  today = new Date(),
): Promise<number> {
  const todayKey = toLocalDateKey(today);
  const rows = await driver.query(
    `SELECT t.id
       FROM transactions t
       JOIN recurring_rules r ON r.id = t.recurring_rule_id AND r.is_active = 1
       JOIN (
         SELECT recurring_rule_id
           FROM transactions
          WHERE recurring_rule_id IS NOT NULL
          GROUP BY recurring_rule_id
         HAVING COUNT(*) = 1
       ) single_rule ON single_rule.recurring_rule_id = t.recurring_rule_id
      WHERE t.is_recurring = 1
        AND t.is_verified = 1
        AND t.due_date IS NOT NULL
        AND t.due_date <= ?`,
    [todayKey],
  );
  if (!rows.length) return 0;
  const ids = rows.map(row => String(row.id));
  const placeholders = ids.map(() => '?').join(',');
  await driver.execute(`UPDATE transactions SET is_verified = 0 WHERE id IN (${placeholders})`, ids);
  return ids.length;
}

/** Backfill every missed scheduled occurrence, with identity-based de-duplication. */
export async function generateDueRecurringTransactions(driver: SqlJsDatabaseDriver, _legacyAutoApprove: boolean, today = new Date()): Promise<number> {
  const todayDate = toLocalDateKey(today);
  const rules = await driver.query(`SELECT * FROM recurring_rules WHERE is_active = 1 AND next_due_date <= ?`, [todayDate]);
  let generated = 0;
  for (const rule of rules) {
    // Collect all due dates up to today for this rule
    const dueDates: string[] = [];
    let dueDate = rule.next_due_date;
    while (dueDate <= todayDate) {
      dueDates.push(dueDate);
      dueDate = advanceRecurringDate(dueDate, (rule.frequency ?? 'MONTHLY') as RecurrenceFrequency, Number(rule.anchor_day) || Number(String(rule.next_due_date).slice(8, 10)));
    }

    if (dueDates.length > 0) {
      // Single query to find existing due dates
      const placeholders = dueDates.map(() => '?').join(',');
      const params = [rule.id, ...dueDates];
      const existingRows = await driver.query(
        `SELECT due_date FROM transactions WHERE recurring_rule_id = ? AND due_date IN (${placeholders})`,
        params
      );
      const existingSet = new Set(existingRows.map((r: any) => r.due_date));

      // Prepare context-dependent values once per rule
      const sourceAccountId = rule.from_account_id ?? (rule.transaction_type === 'EXPENSE' ? rule.account : null);
      const destinationAccountId = rule.to_account_id ?? (rule.transaction_type === 'INCOME' ? rule.account : null);
      if ((rule.transaction_type === 'EXPENSE' || rule.transaction_type === 'TRANSFER') && !sourceAccountId) {
        throw new Error(`Recurring rule "${rule.title}" has no source account.`);
      }
      if ((rule.transaction_type === 'INCOME' || rule.transaction_type === 'TRANSFER') && !destinationAccountId) {
        throw new Error(`Recurring rule "${rule.title}" has no destination account.`);
      }

      for (const d of dueDates) {
        if (existingSet.has(d)) continue;

        const liabilityRows = rule.transaction_type === 'TRANSFER' && rule.to_account_id
          ? await driver.query(`SELECT * FROM account_balances_view WHERE id = ? AND type = 'LIABILITY'`, [rule.to_account_id])
          : [];
        const liability = liabilityRows[0];
        const hasLoanTerms = liability && (liability.interest_rate != null || liability.monthly_emi != null);
        const split = hasLoanTerms
          ? calculateEmiSplit(Number(liability.cached_balance), Number(liability.interest_rate ?? 0), Number(rule.amount), liability.interest_calculation_type ?? 'REDUCING', false, Number(liability.original_principal ?? liability.cached_balance), liability.payment_frequency ?? 'MONTHLY')
          : null;
        const principalAmount = split ? split.principalAmount : Number(rule.amount);
        if (principalAmount > 0) await insertTransactionRow(driver, {
          id: crypto.randomUUID(), title: rule.title, subtitle: rule.subtitle ?? '', amount: principalAmount,
          date: localNoonIso(d), category: rule.category ?? '#uncategorized', icon: rule.icon ?? 'RefreshCw',
          type: rule.transaction_type.toLowerCase(), account: rule.account ?? undefined, fromAccountId: sourceAccountId ?? undefined,
          toAccountId: destinationAccountId ?? undefined, notes: rule.notes ?? undefined, isInterestOnly: Boolean(rule.is_interest_only),
          transaction_type: rule.transaction_type, is_verified: 0, isRecurring: true, recurrenceFrequency: rule.frequency, recurringRuleId: rule.id, dueDate: d, eventId: rule.event_id ?? undefined, goalId: rule.goal_id ?? undefined,
        } as Transaction);
        if (split && split.interestAmount > 0) {
          await insertTransactionRow(driver, {
            id: crypto.randomUUID(), title: `Interest Payment: ${liability.name}`, subtitle: rule.subtitle ?? '', amount: split.interestAmount,
            date: localNoonIso(d), category: '#interest', icon: 'Flame', type: 'expense',
            fromAccountId: sourceAccountId ?? undefined, account: destinationAccountId, toAccountId: destinationAccountId,
            transaction_type: 'EXPENSE', isInterestOnly: true, is_verified: 0, isRecurring: true, recurrenceFrequency: rule.frequency, recurringRuleId: rule.id, dueDate: d, eventId: rule.event_id ?? undefined,
          } as Transaction);
        }
        generated++;
      }
    }

    // Advance next_due_date to the next occurrence after today
    await driver.execute(`UPDATE recurring_rules SET next_due_date = ? WHERE id = ?`, [dueDate, rule.id]);
  }
  return generated;
}

function executePreparedRows(driver: SqlJsDatabaseDriver, sql: string, rows: Array<(string | number | null | undefined)[]>): void {
  if (!rows.length) return;
  const statement = driver.rawDb.prepare(sql);
  try {
    for (const params of rows) statement.run(params);
  } finally {
    statement.free();
  }
}

export async function importLedgerToDatabase(driver: SqlJsDatabaseDriver, data: any, options: { skipValidation?: boolean } = {}): Promise<void> {
  if (!options.skipValidation) {
    const validationError = validateLedgerImport(data);
    if (validationError) throw new Error(validationError);
  }
  await driver.execute('BEGIN TRANSACTION');
  try {
    await clearDatabase(driver);

    const accounts: Account[] = Array.isArray(data.accounts) ? data.accounts : [];
    const categories: Category[] = Array.isArray(data.categories) ? data.categories : [];
    const events: Event[] = Array.isArray(data.events) ? data.events : [];
    const transactions: Transaction[] = Array.isArray(data.transactions) ? data.transactions : [];
    const creditCards: CreditCardInfo[] = Array.isArray(data.creditCards) ? data.creditCards : [];
    const widgets: Widget[] = Array.isArray(data.widgets) ? data.widgets : [];
    const loanRevisions: LoanRevision[] = Array.isArray(data.loanRevisions) ? data.loanRevisions : [];
    const recurringRules: RecurringRule[] = Array.isArray(data.recurringRules) ? data.recurringRules : [];
    const people: Person[] = Array.isArray(data.people) ? data.people : [];
    const sharedObligations: SharedObligation[] = Array.isArray(data.sharedObligations) ? data.sharedObligations : [];
    const sharedResponsibilities: SharedResponsibility[] = Array.isArray(data.sharedResponsibilities) ? data.sharedResponsibilities : [];
    const sharedPayments: SharedPayment[] = Array.isArray(data.sharedPayments) ? data.sharedPayments : [];
    const sharedSettlements: SharedSettlement[] = Array.isArray(data.sharedSettlements) ? data.sharedSettlements : [];
    const loanSharingRules: LoanSharingRule[] = Array.isArray(data.loanSharingRules) ? data.loanSharingRules : [];
    const loanContributionRules: LoanContributionRule[] = Array.isArray(data.loanContributionRules) ? data.loanContributionRules : [];
    const sharedObligationTemplates: SharedObligationTemplate[] = Array.isArray(data.sharedObligationTemplates) ? data.sharedObligationTemplates : [];
    const sharedTemplateResponsibilities: SharedTemplateResponsibility[] = Array.isArray(data.sharedTemplateResponsibilities) ? data.sharedTemplateResponsibilities : [];
    const externalLoanContributions: ExternalLoanContribution[] = Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : [];
    const userConfig = Array.isArray(data.users_config) ? data.users_config[0] : undefined;

    executePreparedRows(driver, `INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, rollover_account_id, tags_json, group_name, affordability_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, categories.map(category => [category.id, category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null, normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type)]));
    executePreparedRows(driver, `INSERT INTO accounts (id, name, type, subtype, credit_limit, overdraft_limit, interest_rate, monthly_emi, interest_calculation_type, payment_frequency, tenure_months, loan_start_date, original_principal, next_emi_date, monthly_interest_rate, next_interest_due_date, investment_method, invested_amount, monthly_sip_amount, next_sip_date, is_archived, late_fee_fixed_amount, late_fee_interest_rate, grace_period_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, accounts.map(account => [account.id, account.name, account.type === 'liability' ? 'LIABILITY' : 'ASSET', account.group ?? null, account.limit ?? null, Math.max(0, account.overdraftLimit ?? 0), account.interestRate ?? null, account.monthlyEMI ?? null, account.interestCalculationType ?? null, account.paymentFrequency ?? null, account.tenureMonths ?? null, account.loanStartDate ?? null, account.originalPrincipal ?? null, account.nextEMIDate ?? null, account.monthlyInterestRate ?? null, account.nextInterestDueDate ?? null, account.investmentMethod ?? null, account.investedAmount ?? null, account.monthlySIPAmount ?? null, account.nextSIPDate ?? null, account.is_archived ?? 0, account.lateFeeFixedAmount ?? null, account.lateFeeInterestRate ?? null, account.gracePeriodDays ?? null]));
    executePreparedRows(driver, `INSERT INTO events (event_id, name, created_at) VALUES (?, ?, ?);`, events.map(event => [event.id, event.name, event.createdAt]));
    executePreparedRows(driver, `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, frequency, next_due_date, is_active, event_id, goal_id, anchor_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, recurringRules.map(rule => [rule.id, rule.title, rule.subtitle ?? null, Math.abs(Number(rule.amount)), rule.transactionType, rule.account ?? null, rule.fromAccountId ?? null, rule.toAccountId ?? null, rule.category ?? null, rule.icon ?? null, rule.notes ?? null, rule.isInterestOnly ? 1 : 0, rule.frequency ?? 'MONTHLY', rule.nextDueDate, rule.isActive === false ? 0 : 1, rule.eventId ?? null, rule.goalId ?? null, rule.anchorDay ?? Number(String(rule.nextDueDate).slice(8, 10))]));
    executePreparedRows(driver, `INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only, recurring_rule_id, due_date, event_id, goal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, transactions.map(tx => {
      const transactionType = tx.transaction_type?.toUpperCase?.() || tx.type?.toUpperCase?.() || 'INCOME';
      const parsedType = ['EXPENSE', 'TRANSFER', 'OPENING_BALANCE', 'MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT'].includes(transactionType) ? transactionType : 'INCOME';
      const amount = Math.abs(Number(tx.amount));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Transaction amount must be a finite positive number.');
      return [tx.id, parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.recurringRuleId ?? null, tx.dueDate ?? null, tx.eventId ?? null, tx.goalId ?? null];
    }));
    executePreparedRows(driver, `INSERT INTO credit_cards (id, account_id, due_amount, due_date, billing_cycle_day) VALUES (?, ?, ?, ?, ?);`, creditCards.map(card => [card.id, card.id, card.dueAmount ?? 0, card.dueDate ?? '', card.billingCycleDay ?? 1]));
    executePreparedRows(driver, `INSERT INTO widgets (id, type, target_id) VALUES (?, ?, ?);`, widgets.map(widget => [widget.id, widget.type, widget.targetId]));
    executePreparedRows(driver, `INSERT INTO loan_revisions (id, account_id, effective_date, new_interest_rate, new_emi, new_tenure_months, payment_frequency) VALUES (?, ?, ?, ?, ?, ?, ?);`, loanRevisions.map(revision => [revision.id, revision.accountId, revision.effectiveDate, revision.newInterestRate, revision.newEmi, revision.newTenureMonths, revision.paymentFrequency ?? null]));

    // v3.4 normalized shared-finance records. These rows describe responsibility,
    // external funding and settlements; none of them are synthesized ledger cash.
    executePreparedRows(driver, `INSERT INTO people (id, name, relationship, is_self, is_archived, created_at) VALUES (?, ?, ?, ?, ?, ?);`, people.map(person => [person.id, person.name, person.relationship ?? null, person.isSelf ? 1 : 0, person.isArchived ? 1 : 0, (person as any).createdAt ?? new Date().toISOString()]));
    executePreparedRows(driver, `INSERT INTO shared_obligation_templates (id, title, total_amount, category_id, frequency, next_due_date, is_active, settlement_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligationTemplates.map(item => [item.id, item.title, Math.abs(Number(item.totalAmount)), item.categoryId ?? null, item.frequency, item.nextDueDate, item.isActive ? 1 : 0, item.settlementMode ?? 'TRACK', item.createdAt ?? new Date().toISOString()]));
    executePreparedRows(driver, `INSERT INTO shared_template_responsibilities (id, template_id, person_id, amount) VALUES (?, ?, ?, ?);`, sharedTemplateResponsibilities.map(item => [item.id, item.templateId, item.personId, Math.abs(Number(item.amount))]));
    executePreparedRows(driver, `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, template_id, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligations.map(item => [item.id, item.title, item.kind, Math.abs(Number(item.totalAmount)), item.categoryId ?? null, item.dueDate ?? null, item.templateId ?? null, item.transactionId ?? null, item.liabilityAccountId ?? null, item.recurringRuleId ?? null, item.settlementMode ?? 'TRACK', item.status ?? 'OPEN', item.createdAt ?? new Date().toISOString()]));
    executePreparedRows(driver, `INSERT INTO shared_responsibilities (id, obligation_id, person_id, amount) VALUES (?, ?, ?, ?);`, sharedResponsibilities.map(item => [item.id, item.obligationId, item.personId, Math.abs(Number(item.amount))]));
    executePreparedRows(driver, `INSERT INTO shared_payments (id, obligation_id, person_id, transaction_id, amount, source, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?);`, sharedPayments.map(item => [item.id, item.obligationId, item.personId, item.transactionId ?? null, Math.abs(Number(item.amount)), item.source, item.paidAt]));
    executePreparedRows(driver, `INSERT INTO shared_settlements (id, obligation_id, from_person_id, to_person_id, transaction_id, amount, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?);`, sharedSettlements.map(item => [item.id, item.obligationId ?? null, item.fromPersonId, item.toPersonId, item.transactionId ?? null, Math.abs(Number(item.amount)), item.settledAt]));
    executePreparedRows(driver, `INSERT INTO loan_sharing_rules (account_id, personal_responsibility_percent, is_shared) VALUES (?, ?, ?);`, loanSharingRules.map(item => [item.accountId, Number(item.personalResponsibilityPercent), item.isShared ? 1 : 0]));
    executePreparedRows(driver, `INSERT INTO loan_contribution_rules (id, account_id, person_id, mode, value, is_active) VALUES (?, ?, ?, ?, ?, ?);`, loanContributionRules.map(item => [item.id, item.accountId, item.personId, item.mode, Number(item.value), item.isActive ? 1 : 0]));
    executePreparedRows(driver, `INSERT INTO external_loan_contributions (id, account_id, person_id, adjustment_transaction_id, amount, principal_amount, interest_amount, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`, externalLoanContributions.map(item => [item.id, item.accountId, item.personId, item.adjustmentTransactionId ?? null, Number(item.amount), Number(item.principalAmount), Number(item.interestAmount), item.paidAt]));

    if (userConfig) {
      await upsertUserConfig(driver, {
        currency: userConfig.currency_code ?? data.currency ?? 'INR',
        monthCycleDay: Number(userConfig.month_cycle_day ?? 25),
      });
    }
    await upsertAppSetting(driver, AFFORDABILITY_SETTINGS_KEY, normalizeAffordabilitySettings(data.affordabilitySettings));
    await upsertAppSetting(driver, SAVINGS_GOALS_KEY, normalizeSavingsGoals(data.savingsGoals));
    await driver.execute('COMMIT');
  } catch (error) {
    await driver.execute('ROLLBACK');
    throw error;
  }
}

export function normalizeCategoryRow(row: any): Category {
  let tags: string[] | undefined;
  try {
    tags = row.tags_json ? JSON.parse(row.tags_json) : undefined;
  } catch {
    tags = undefined;
  }

  return {
    id: row.id,
    name: row.name ?? '',
    icon: row.icon_name ?? row.icon ?? 'Tag',
    budget: Number(row.budget ?? 0),
    isRollover: Number(row.is_rollover ?? 0) === 1,
    rolloverAccountId: row.rollover_account_id ?? undefined,
    tags,
    group: row.group_name ?? undefined,
    affordabilityClass: normalizeAffordabilityClass(row.affordability_class, row.group_name, row.type),
    type: row.type?.toLowerCase() === 'income' ? 'income' : 'expense',
  };
}

export function normalizeEventRow(row: any): Event {
  return {
    id: row.event_id,
    name: row.name ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export async function loadAppSettings(driver: SqlJsDatabaseDriver): Promise<Record<string, unknown>> {
  const rows = await driver.query(`SELECT key, value_json FROM app_settings;`);
  return rows.reduce<Record<string, unknown>>((settings, row) => {
    try {
      settings[row.key] = JSON.parse(row.value_json);
    } catch {
      // Ignore corrupted settings rows while preserving the financial ledger.
    }
    return settings;
  }, {});
}

export async function upsertAppSetting(driver: SqlJsDatabaseDriver, key: string, value: unknown): Promise<void> {
  await driver.execute(
    `INSERT INTO app_settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json;`,
    [key, JSON.stringify(value)]
  );
}

export async function loadUserConfig(driver: SqlJsDatabaseDriver): Promise<{ currency: string; monthCycleDay: number }> {
  const rows = await driver.query(`SELECT currency, month_cycle_day FROM users_config WHERE id = 1;`);
  return { currency: rows[0]?.currency ?? 'INR', monthCycleDay: Number(rows[0]?.month_cycle_day ?? 25) };
}

export async function upsertUserConfig(driver: SqlJsDatabaseDriver, config: { currency: string; monthCycleDay: number }): Promise<void> {
  await driver.execute(
    `INSERT INTO users_config (id, currency, month_cycle_day) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET currency = excluded.currency, month_cycle_day = excluded.month_cycle_day;`,
    [config.currency, Math.min(31, Math.max(1, Math.round(config.monthCycleDay)))]
  );
}

export function normalizeCreditCardRow(row: any): CreditCardInfo {
  return {
    id: row.id,
    name: row.name ?? row.card_name ?? 'Credit Card',
    balance: Number(row.cached_balance ?? row.balance ?? 0),
    dueAmount: Number(row.due_amount ?? row.dueAmount ?? 0),
    dueDate: row.due_date ?? row.dueDate ?? '',
    billingCycleDay: Number(row.billing_cycle_day ?? row.billingCycleDay ?? 1),
    limit: Number(row.credit_limit ?? row.limit ?? row.card_limit ?? 0),
  };
}

export function normalizeWidgetRow(row: any): Widget {
  return {
    id: row.id,
    type: row.type,
    targetId: row.target_id,
  };
}

export function normalizeLoanRevisionRow(row: any): LoanRevision {
  return {
    id: row.id,
    accountId: row.account_id,
    effectiveDate: row.effective_date,
    newInterestRate: Number(row.new_interest_rate ?? row.newInterestRate ?? 0),
    newEmi: Number(row.new_emi ?? row.newEmi ?? 0),
    newTenureMonths: Number(row.new_tenure_months ?? row.newTenureMonths ?? 0),
    paymentFrequency: row.payment_frequency ?? row.paymentFrequency,
  };
}
