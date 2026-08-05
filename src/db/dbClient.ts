import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import demoData from '../../DemoData.json';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from './sqliteSchema';
import { Account, Category, CreditCardInfo, Event, LoanRevision, Transaction, Widget } from '../types';
import { calculateEmiSplit } from '../utils/emi';
import { bufferToBase64, base64ToUint8Array } from '../utils/encoding';
import { validateLedgerSchema } from '../utils/ledgerSchema';

export const DB_STORAGE_KEY = 'coinbuddy_sqlite_db';
const SNAPSHOT_DB_NAME = 'coinbuddy-ledger';
const SNAPSHOT_STORE = 'snapshots';
const SNAPSHOT_KEY = 'primary';
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
  execute: (sql: string, params?: (string | number | null | undefined)[]) => Promise<void>;
  query: (sql: string, params?: (string | number | null | undefined)[]) => Promise<any[]>;
  exportToBase64: () => string;
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

async function readOpfsSnapshot(): Promise<Uint8Array | null> {
  const getDirectory = (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined;
  if (!getDirectory) return null;
  try {
    const root = await getDirectory();
    const file = await (await root.getFileHandle(OPFS_SNAPSHOT_FILE)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch { return null; }
}

async function writeOpfsSnapshot(snapshot: Uint8Array): Promise<boolean> {
  const getDirectory = (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined;
  if (!getDirectory) return false;
  const root = await getDirectory();
  const handle = await root.getFileHandle(OPFS_SNAPSHOT_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(snapshot);
  await writable.close();
  return true;
}

function createDriver(db: any, isNewDatabase = false): SqlJsDatabaseDriver {
  return {
    rawDb: db,
    isNewDatabase,
    async execute(sql, params = []) {
      if (params.length === 0) {
        db.exec(sql);
        return;
      }
      const stmt = db.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
    },
    async query(sql, params = []) {
      const stmt = db.prepare(sql);
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
      return bufferToBase64(db.export());
    }
  };
}

export async function initializeDatabase(): Promise<SqlJsDatabaseDriver> {
  // Importing the binary lets Vite emit it under /assets, where Workbox
  // precaches it with the rest of the application shell.
  const SQL = await initSqlJs({ locateFile: (file) => file.endsWith('.wasm') ? sqlWasmUrl : file });
  let saved = await readOpfsSnapshot() ?? await readSnapshot();
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
    try {
      db.run(migration);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
        throw error;
      }
    }
  }
  migrateTransactionTypeConstraint(db);

  if (shouldSkipDemoSeed) {
    localStorage.removeItem(SKIP_DEMO_SEED_KEY);
  }

  return createDriver(db, isNewDatabase);
}

export async function persistDatabase(driver: SqlJsDatabaseDriver): Promise<void> {
  const snapshot = driver.rawDb.export();
  let indexedDbError: unknown;
  let opfsError: unknown;
  let indexedDbSaved = false;
  let opfsSaved = false;

  // Keep IndexedDB current even when OPFS succeeds. It is the durable fallback
  // if OPFS is unavailable or reset when the page is refreshed.
  try {
    await writeSnapshot(snapshot);
    indexedDbSaved = true;
  } catch (error) {
    indexedDbError = error;
  }

  try {
    opfsSaved = await writeOpfsSnapshot(snapshot);
  } catch (error) {
    opfsError = error;
  }

  if (!indexedDbSaved && !opfsSaved) {
    const cause = indexedDbError ?? opfsError ?? new Error('No persistent browser storage is available.');
    throw new Error(`Unable to save your ledger locally: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

export async function deletePersistedDatabase(): Promise<void> {
  const database = await openSnapshotStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE).delete(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
  const getDirectory = (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined;
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
    transaction_type: row.transaction_type,
  } as Transaction;
}

export async function loadStateFromDatabase(driver: SqlJsDatabaseDriver) {
  const [accountRows, txRows, categoryRows, creditCardRows, widgetRows, loanRows, eventRows] = await Promise.all([
    driver.query(`SELECT * FROM account_balances_view WHERE is_archived = 0 ORDER BY name ASC;`),
    driver.query(`SELECT * FROM transactions ORDER BY date DESC;`),
    driver.query(`SELECT * FROM categories ORDER BY name ASC;`),
    driver.query(`SELECT cc.*, a.credit_limit, a.cached_balance FROM credit_cards cc LEFT JOIN account_balances_view a ON a.id = cc.account_id ORDER BY cc.id ASC;`),
    driver.query(`SELECT * FROM widgets ORDER BY id ASC;`),
    driver.query(`SELECT * FROM loan_revisions ORDER BY effective_date DESC;`),
    driver.query(`SELECT * FROM events ORDER BY created_at DESC, name ASC;`),
  ]);

  return {
    accounts: accountRows.map(normalizeAccountRow),
    transactions: txRows.map(normalizeTransactionRow),
    categories: categoryRows.map(normalizeCategoryRow),
    creditCards: creditCardRows.map(normalizeCreditCardRow),
    widgets: widgetRows.map(normalizeWidgetRow),
    loanRevisions: loanRows.map(normalizeLoanRevisionRow),
    events: eventRows.map(normalizeEventRow),
  };
}

function normalizeDemoCategoryType(type?: string): 'INCOME' | 'EXPENSE' {
  if (!type) return 'EXPENSE';
  const normalized = type.toString().toLowerCase();
  if (normalized === 'income') return 'INCOME';
  return 'EXPENSE';
}

export async function loadDemoDataFromJson(driver: SqlJsDatabaseDriver): Promise<void> {
  await clearDatabase(driver);

  const data = demoData as any;
  const categories = Array.isArray(data.categories) ? data.categories : [];
  for (const category of categories) {
    await driver.execute(
      `INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, tags_json, group_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [category.id, category.name, normalizeDemoCategoryType(category.type), category.icon ?? category.icon_name ?? 'Tag', Number(category.budget ?? 0), category.isRollover ? 1 : 0, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null]
    );
  }

  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  for (const account of accounts) {
    const accountType = account.type?.toString().toUpperCase() === 'LIABILITY' ? 'LIABILITY' : 'ASSET';
    await driver.execute(
      `INSERT INTO accounts (id, name, type, subtype, credit_limit, interest_rate, monthly_emi, interest_calculation_type, payment_frequency, tenure_months, loan_start_date, original_principal, next_emi_date, monthly_interest_rate, next_interest_due_date, investment_method, invested_amount, monthly_sip_amount, next_sip_date, is_archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
      [account.id, account.name, accountType, account.group ?? null, account.limit ?? account.credit_limit ?? null, account.apr ?? account.interestRate ?? null, account.monthlyEMI ?? account.monthly_emi ?? null, account.interestCalculationType ?? account.interest_calculation_type ?? null, account.paymentFrequency ?? account.payment_frequency ?? null, account.tenureMonths ?? account.tenure_months ?? null, account.loanStartDate ?? account.loan_start_date ?? null, account.originalPrincipal ?? account.original_principal ?? null, account.nextEMIDate ?? null, account.monthlyInterestRate ?? null, account.nextInterestDueDate ?? null, account.investmentMethod ?? null, account.investedAmount ?? null, account.monthlySIPAmount ?? null, account.nextSIPDate ?? null]
    );
  }

  const txs = Array.isArray(data.transactions) ? data.transactions : [];
  for (const rawTx of txs) {
    const tx = {
      ...rawTx,
      amount: Math.abs(Number(rawTx.amount ?? 0)),
      transaction_type: rawTx.transaction_type ?? rawTx.type?.toString().toUpperCase(),
      is_verified: rawTx.is_verified ?? 1,
      is_opening_balance: rawTx.isOpeningBalance ? 1 : 0,
      is_recurring: rawTx.isRecurring ? 1 : 0,
      is_interest_only: rawTx.isInterestOnly ? 1 : 0,
    };
    await insertTransactionRow(driver, tx as any);
  }

  const creditCards = Array.isArray(data.creditCards) ? data.creditCards : [];
  for (const card of creditCards) {
    await insertCreditCardRow(driver, {
      id: card.id,
      name: card.name,
      balance: Number(card.balance ?? 0),
      dueAmount: Number(card.dueAmount ?? 0),
      dueDate: card.dueDate ?? '',
      billingCycleDay: Number(card.billingCycleDay ?? 1),
      limit: Number(card.limit ?? 0)
    });
  }

  const widgets = Array.isArray(data.widgets) ? data.widgets : [];
  for (const widget of widgets) {
    await insertWidgetRow(driver, widget);
  }

  const loanRevisions = Array.isArray(data.loanRevisions) ? data.loanRevisions : [];
  for (const revision of loanRevisions) {
    await insertLoanRevisionRow(driver, revision);
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
    `INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, rollover_account_id, tags_json, group_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [category.id, category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null]
  );
}

export async function updateCategoryRow(driver: SqlJsDatabaseDriver, id: string, category: Category): Promise<void> {
  await driver.execute(
    `UPDATE categories SET name = ?, type = ?, icon_name = ?, budget = ?, is_rollover = ?, rollover_account_id = ?, tags_json = ?, group_name = ? WHERE id = ?;`,
    [category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null, id]
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

export async function updateTransactionEvents(driver: SqlJsDatabaseDriver, transactionIds: string[], eventId: string): Promise<void> {
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
    `INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only, recurring_rule_id, due_date, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.recurringRuleId ?? null, tx.dueDate ?? null, tx.eventId ?? null]
  );
  return id;
}

export async function updateTransactionRow(driver: SqlJsDatabaseDriver, id: string, tx: Omit<Transaction, 'id'>): Promise<void> {
  const amount = Math.abs(Number(tx.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Transaction amount must be a finite positive number.');
  const transactionType = tx.transaction_type?.toUpperCase?.() || tx.type?.toUpperCase?.() || 'INCOME';
  const parsedType = ['EXPENSE', 'TRANSFER', 'OPENING_BALANCE', 'MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT'].includes(transactionType) ? transactionType : 'INCOME';
  await driver.execute(
    `UPDATE transactions SET transaction_type = ?, title = ?, subtitle = ?, amount = ?, date = ?, category = ?, icon = ?, account = ?, from_account_id = ?, to_account_id = ?, notes = ?, is_verified = ?, is_recurring = ?, is_opening_balance = ?, is_interest_only = ?, event_id = ? WHERE id = ?;`,
    [parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.eventId ?? null, id]
  );
}

export async function deleteTransactionRow(driver: SqlJsDatabaseDriver, id: string): Promise<void> {
  await driver.execute(`DELETE FROM transactions WHERE id = ?;`, [id]);
}

export async function clearDatabase(driver: SqlJsDatabaseDriver): Promise<void> {
  await driver.execute(`DELETE FROM transactions; DELETE FROM recurring_rules; DELETE FROM credit_cards; DELETE FROM widgets; DELETE FROM loan_revisions; DELETE FROM categories; DELETE FROM events; DELETE FROM accounts; DELETE FROM users_config; DELETE FROM app_settings;`);
}

export async function createRecurringRule(driver: SqlJsDatabaseDriver, template: Omit<Transaction, 'id'> & { id?: string }): Promise<string> {
  const amount = Math.abs(Number(template.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Recurring rule amount must be a finite positive number.');
  const id = template.id ?? crypto.randomUUID();
  const type = (template.transaction_type ?? template.type).toUpperCase();
  if (!['INCOME', 'EXPENSE', 'TRANSFER'].includes(type)) throw new Error(`Unsupported recurring transaction type: ${type}.`);
  const fromAccountId = template.fromAccountId ?? (type === 'EXPENSE' ? template.account : undefined);
  const toAccountId = template.toAccountId ?? (type === 'INCOME' ? template.account : undefined);
  if ((type === 'EXPENSE' || type === 'TRANSFER') && !fromAccountId) throw new Error('A recurring expense or transfer requires a source account.');
  if ((type === 'INCOME' || type === 'TRANSFER') && !toAccountId) throw new Error('A recurring income or transfer requires a destination account.');
  const nextDueDate = toLocalDateKey(new Date(template.date));
  await driver.execute(
    `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, next_due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, template.title, template.subtitle ?? null, amount, type, template.account ?? null, fromAccountId ?? null, toAccountId ?? null, template.category ?? null, template.icon ?? null, template.notes ?? null, template.isInterestOnly ? 1 : 0, nextDueDate]
  );
  return id;
}

function toLocalDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function localNoonIso(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}

function advanceRecurringDate(date: string, frequency: string): string {
  const value = new Date(`${date}T12:00:00`);
  value.setMonth(value.getMonth() + (frequency === 'ANNUALLY' ? 12 : frequency === 'QUARTERLY' ? 3 : 1));
  return toLocalDateKey(value);
}

/** Backfill every missed scheduled occurrence, with identity-based de-duplication. */
export async function generateDueRecurringTransactions(driver: SqlJsDatabaseDriver, autoApprove: boolean, today = new Date()): Promise<number> {
  const todayDate = toLocalDateKey(today);
  const rules = await driver.query(`SELECT * FROM recurring_rules WHERE is_active = 1 AND next_due_date <= ?`, [todayDate]);
  let generated = 0;
  for (const rule of rules) {
    let dueDate = rule.next_due_date;
    while (dueDate <= todayDate) {
      const exists = await driver.query(`SELECT id FROM transactions WHERE recurring_rule_id = ? AND due_date = ?`, [rule.id, dueDate]);
      if (!exists.length) {
        // Support rules saved before directional account ids were normalized.
        const sourceAccountId = rule.from_account_id ?? (rule.transaction_type === 'EXPENSE' ? rule.account : null);
        const destinationAccountId = rule.to_account_id ?? (rule.transaction_type === 'INCOME' ? rule.account : null);
        if ((rule.transaction_type === 'EXPENSE' || rule.transaction_type === 'TRANSFER') && !sourceAccountId) {
          throw new Error(`Recurring rule "${rule.title}" has no source account.`);
        }
        if ((rule.transaction_type === 'INCOME' || rule.transaction_type === 'TRANSFER') && !destinationAccountId) {
          throw new Error(`Recurring rule "${rule.title}" has no destination account.`);
        }
        const liabilityRows = rule.transaction_type === 'TRANSFER' && rule.to_account_id
          ? await driver.query(`SELECT * FROM account_balances_view WHERE id = ? AND type = 'LIABILITY'`, [rule.to_account_id])
          : [];
        const liability = liabilityRows[0];
        const hasLoanTerms = liability && (liability.interest_rate != null || liability.monthly_emi != null);
        const split = hasLoanTerms
          ? calculateEmiSplit(Number(liability.cached_balance), Number(liability.interest_rate ?? 0), Number(rule.amount), liability.interest_calculation_type ?? 'REDUCING')
          : null;
        const principalAmount = split ? split.principalAmount : Number(rule.amount);
        if (principalAmount > 0) await insertTransactionRow(driver, {
          id: crypto.randomUUID(), title: rule.title, subtitle: rule.subtitle ?? '', amount: principalAmount,
          date: localNoonIso(dueDate), category: rule.category ?? '#uncategorized', icon: rule.icon ?? 'RefreshCw',
          type: rule.transaction_type.toLowerCase(), account: rule.account ?? undefined, fromAccountId: sourceAccountId ?? undefined,
          toAccountId: destinationAccountId ?? undefined, notes: rule.notes ?? undefined, isInterestOnly: Boolean(rule.is_interest_only),
          transaction_type: rule.transaction_type, is_verified: autoApprove ? 1 : 0, isRecurring: true, recurringRuleId: rule.id, dueDate,
        } as Transaction);
        if (split && split.interestAmount > 0) {
          await insertTransactionRow(driver, {
            id: crypto.randomUUID(), title: `Interest Payment: ${liability.name}`, subtitle: rule.subtitle ?? '', amount: split.interestAmount,
            date: localNoonIso(dueDate), category: '#interest', icon: 'Flame', type: 'expense',
            fromAccountId: sourceAccountId ?? undefined, account: destinationAccountId, toAccountId: destinationAccountId,
            transaction_type: 'EXPENSE', isInterestOnly: true, is_verified: autoApprove ? 1 : 0, isRecurring: true, recurringRuleId: rule.id, dueDate,
          } as Transaction);
        }
        generated++;
      }
      dueDate = advanceRecurringDate(dueDate, rule.frequency);
    }
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
    const userConfig = Array.isArray(data.users_config) ? data.users_config[0] : undefined;

    executePreparedRows(driver, `INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, rollover_account_id, tags_json, group_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, categories.map(category => [category.id, category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null]));
    executePreparedRows(driver, `INSERT INTO accounts (id, name, type, subtype, credit_limit, overdraft_limit, interest_rate, monthly_emi, interest_calculation_type, payment_frequency, tenure_months, loan_start_date, original_principal, next_emi_date, monthly_interest_rate, next_interest_due_date, investment_method, invested_amount, monthly_sip_amount, next_sip_date, is_archived, late_fee_fixed_amount, late_fee_interest_rate, grace_period_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, accounts.map(account => [account.id, account.name, account.type === 'liability' ? 'LIABILITY' : 'ASSET', account.group ?? null, account.limit ?? null, Math.max(0, account.overdraftLimit ?? 0), account.interestRate ?? null, account.monthlyEMI ?? null, account.interestCalculationType ?? null, account.paymentFrequency ?? null, account.tenureMonths ?? null, account.loanStartDate ?? null, account.originalPrincipal ?? null, account.nextEMIDate ?? null, account.monthlyInterestRate ?? null, account.nextInterestDueDate ?? null, account.investmentMethod ?? null, account.investedAmount ?? null, account.monthlySIPAmount ?? null, account.nextSIPDate ?? null, account.is_archived ?? 0, account.lateFeeFixedAmount ?? null, account.lateFeeInterestRate ?? null, account.gracePeriodDays ?? null]));
    executePreparedRows(driver, `INSERT INTO events (event_id, name, created_at) VALUES (?, ?, ?);`, events.map(event => [event.id, event.name, event.createdAt]));
    executePreparedRows(driver, `INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only, recurring_rule_id, due_date, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, transactions.map(tx => {
      const transactionType = tx.transaction_type?.toUpperCase?.() || tx.type?.toUpperCase?.() || 'INCOME';
      const parsedType = ['EXPENSE', 'TRANSFER', 'OPENING_BALANCE', 'MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT'].includes(transactionType) ? transactionType : 'INCOME';
      const amount = Math.abs(Number(tx.amount));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Transaction amount must be a finite positive number.');
      return [tx.id, parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.recurringRuleId ?? null, tx.dueDate ?? null, tx.eventId ?? null];
    }));
    executePreparedRows(driver, `INSERT INTO credit_cards (id, account_id, due_amount, due_date, billing_cycle_day) VALUES (?, ?, ?, ?, ?);`, creditCards.map(card => [card.id, card.id, card.dueAmount ?? 0, card.dueDate ?? '', card.billingCycleDay ?? 1]));
    executePreparedRows(driver, `INSERT INTO widgets (id, type, target_id) VALUES (?, ?, ?);`, widgets.map(widget => [widget.id, widget.type, widget.targetId]));
    executePreparedRows(driver, `INSERT INTO loan_revisions (id, account_id, effective_date, new_interest_rate, new_emi, new_tenure_months, payment_frequency) VALUES (?, ?, ?, ?, ?, ?, ?);`, loanRevisions.map(revision => [revision.id, revision.accountId, revision.effectiveDate, revision.newInterestRate, revision.newEmi, revision.newTenureMonths, revision.paymentFrequency ?? null]));
    if (userConfig) {
      await upsertUserConfig(driver, {
        currency: userConfig.currency_code ?? data.currency ?? 'INR',
        monthCycleDay: Number(userConfig.month_cycle_day ?? 25),
      });
    }
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
