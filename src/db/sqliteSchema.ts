/**
 * Embedded SQLite Schema & Types for Local-First Personal Finance App
 */
import { applyTransactionEffect } from '../domain/ledgerRules';
import type { TransactionType } from '../types';

// Enforce foreign keys pragmatically in SQLite connection setup
export const SQLITE_PRAGMA_SETUP = `
PRAGMA foreign_keys = ON;
`;

// 1. DDL Statements for Accounts, Categories, and Transactions Tables
export const CREATE_TABLES_SQL = `
-- Enforce Foreign Keys
PRAGMA foreign_keys = ON;

-- 1. Accounts Table (Static Metadata Only)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ASSET', 'LIABILITY')),
  subtype TEXT,
  credit_limit REAL,
  overdraft_limit REAL NOT NULL DEFAULT 0,
  interest_rate REAL,
  monthly_emi REAL,
  interest_calculation_type TEXT CHECK(interest_calculation_type IN ('REDUCING', 'FLAT', 'INTEREST_ONLY')),
  payment_frequency TEXT CHECK(payment_frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),
  tenure_months INTEGER,
  loan_start_date TEXT,
  original_principal REAL,
  next_emi_date TEXT,
  monthly_interest_rate REAL,
  next_interest_due_date TEXT,
  investment_method TEXT CHECK(investment_method IN ('SIP', 'LUMP_SUM')),
  invested_amount REAL,
  monthly_sip_amount REAL,
  next_sip_date TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  late_fee_fixed_amount REAL,
  late_fee_interest_rate REAL,
  grace_period_days INTEGER DEFAULT 0
);

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
  icon_name TEXT,
  budget REAL NOT NULL DEFAULT 0,
  is_rollover INTEGER NOT NULL DEFAULT 0,
  rollover_account_id TEXT,
  tags_json TEXT,
  group_name TEXT,
  affordability_class TEXT CHECK(affordability_class IN ('COMMITTED', 'NORMAL', 'FLEXIBLE', 'IRREGULAR', 'SAVINGS'))
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'OPENING_BALANCE', 'MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT')),
  title TEXT NOT NULL,
  subtitle TEXT,
  amount REAL NOT NULL CHECK(amount > 0),
  date INTEGER NOT NULL,
  category TEXT,
  icon TEXT,
  account TEXT,
  from_account_id TEXT,
  to_account_id TEXT,
  category_id TEXT,
  notes TEXT,
  is_verified INTEGER NOT NULL DEFAULT 1,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  is_opening_balance INTEGER NOT NULL DEFAULT 0,
  is_interest_only INTEGER NOT NULL DEFAULT 0,
  event_id TEXT,
  FOREIGN KEY (from_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE SET NULL
);

-- 4. Credit Cards Table
CREATE TABLE IF NOT EXISTS credit_cards (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  due_amount REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  billing_cycle_day INTEGER DEFAULT 1,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 5. Widgets Table
CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('category', 'asset', 'liability')),
  target_id TEXT NOT NULL
);

-- 6. Loan Revisions Table
CREATE TABLE IF NOT EXISTS loan_revisions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  new_interest_rate REAL NOT NULL,
  new_emi REAL NOT NULL,
  new_tenure_months INTEGER NOT NULL,
  payment_frequency TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 7. Persistent app preferences and backup metadata
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currency TEXT NOT NULL DEFAULT 'INR',
  month_cycle_day INTEGER NOT NULL DEFAULT 25 CHECK (month_cycle_day BETWEEN 1 AND 31)
);

-- A schedule is not a ledger entry. Each generated ledger entry references its
-- source rule and exact due date, giving deterministic de-duplication.
CREATE TABLE IF NOT EXISTS recurring_rules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  amount REAL NOT NULL CHECK(amount > 0),
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
  account TEXT,
  from_account_id TEXT,
  to_account_id TEXT,
  category TEXT,
  icon TEXT,
  notes TEXT,
  is_interest_only INTEGER NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),
  next_due_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  event_id TEXT,
  anchor_day INTEGER CHECK(anchor_day BETWEEN 1 AND 31),
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE SET NULL
);

-- 5. Centralized Computed Account Balances View
CREATE VIEW IF NOT EXISTS account_balances_view AS
SELECT 
  a.id,
  a.name,
  a.type,
  a.subtype,
  a.credit_limit,
  a.overdraft_limit,
  a.interest_rate,
  a.monthly_emi,
  a.interest_calculation_type,
  a.payment_frequency,
  a.tenure_months,
  a.loan_start_date,
  a.is_archived,
  a.late_fee_fixed_amount,
  a.late_fee_interest_rate,
  a.grace_period_days,
  COALESCE(
    SUM(
      CASE 
        WHEN t.transaction_type = 'OPENING_BALANCE' AND a.type = 'ASSET' AND t.to_account_id = a.id THEN t.amount
        WHEN t.transaction_type = 'OPENING_BALANCE' AND a.type = 'LIABILITY' AND t.from_account_id = a.id THEN t.amount
        WHEN t.transaction_type = 'INCOME' AND t.to_account_id = a.id THEN 
          CASE WHEN a.type = 'ASSET' THEN t.amount ELSE -t.amount END
        WHEN t.transaction_type = 'EXPENSE' AND t.from_account_id = a.id THEN 
          CASE WHEN a.type = 'LIABILITY' AND t.is_interest_only = 1 THEN 0
          ELSE
          CASE WHEN a.type = 'ASSET' THEN -t.amount ELSE t.amount END
          END
        WHEN t.transaction_type = 'TRANSFER' AND t.from_account_id = a.id THEN 
          CASE WHEN a.type = 'ASSET' THEN -t.amount ELSE t.amount END
        WHEN t.transaction_type = 'TRANSFER' AND t.to_account_id = a.id THEN 
          CASE WHEN a.type = 'ASSET' THEN t.amount ELSE -t.amount END
        WHEN t.transaction_type IN ('MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT') AND t.from_account_id = a.id THEN
          CASE WHEN a.type = 'ASSET' THEN -t.amount ELSE t.amount END
        WHEN t.transaction_type IN ('MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT') AND t.to_account_id = a.id THEN
          CASE WHEN a.type = 'ASSET' THEN t.amount ELSE -t.amount END
        ELSE 0
      END
    ),
    0.0
  ) AS cached_balance
FROM accounts a
LEFT JOIN transactions t 
  ON (t.from_account_id = a.id OR t.to_account_id = a.id) 
  AND (t.is_verified IS NULL OR t.is_verified = 1)
GROUP BY a.id;
`;

// 2. Corresponding TypeScript Interfaces

export type AccountType = 'ASSET' | 'LIABILITY';
export type CategoryType = 'INCOME' | 'EXPENSE';
export type { TransactionType } from '../types';

export interface LoanRevisionRow {
  id: string;
  account_id: string;
  effective_date: string;
  new_interest_rate: number;
  new_emi: number;
  new_tenure_months: number;
  payment_frequency?: string | null;
}

export interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  subtype?: string | null;
  credit_limit?: number | null;
  overdraft_limit?: number | null;
  interest_rate?: number | null;
  monthly_emi?: number | null;
  interest_calculation_type?: 'REDUCING' | 'FLAT' | 'INTEREST_ONLY' | null;
  payment_frequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null;
  tenure_months?: number | null;
  loan_start_date?: string | null;
  cached_balance?: number; // Computed view property
  is_archived: number; // 0 for active, 1 for archived
  late_fee_fixed_amount?: number | null;
  late_fee_interest_rate?: number | null;
  grace_period_days?: number | null;
}

// 3. Updated SQL Queries for Dashboard, Transaction Form Dropdowns & Account Deletion

export const SELECT_ACTIVE_ACCOUNTS_SQL = `
  SELECT * FROM account_balances_view WHERE is_archived = 0;
`;

export const SELECT_DASHBOARD_ACCOUNTS_SQL = `
  SELECT id, name, type, subtype, credit_limit, cached_balance 
  FROM account_balances_view 
  WHERE is_archived = 0;
`;

export const SELECT_TRANSACTION_FORM_ACCOUNTS_SQL = `
  SELECT id, name, type, cached_balance 
  FROM account_balances_view 
  WHERE is_archived = 0;
`;

export const SELECT_ACTIVE_ASSET_ACCOUNTS_SQL = `
  SELECT * FROM account_balances_view WHERE type = 'ASSET' AND is_archived = 0;
`;

export const SELECT_ACTIVE_LIABILITY_ACCOUNTS_SQL = `
  SELECT * FROM account_balances_view WHERE type = 'LIABILITY' AND is_archived = 0;
`;

export const SELECT_ALL_TRANSACTIONS_SQL = `
  SELECT * FROM transactions ORDER BY date DESC;
`;

export const SELECT_ALL_CATEGORIES_SQL = `
  SELECT * FROM categories ORDER BY name ASC;
`;

export const SELECT_ALL_EVENTS_SQL = `
  SELECT * FROM events ORDER BY created_at DESC, name ASC;
`;

export const SELECT_ALL_CREDIT_CARDS_SQL = `
  SELECT cc.*, a.name as account_name, a.credit_limit, a.cached_balance
  FROM credit_cards cc
  LEFT JOIN account_balances_view a ON a.id = cc.account_id
  ORDER BY cc.id ASC;
`;

export const SELECT_ALL_WIDGETS_SQL = `
  SELECT * FROM widgets ORDER BY id ASC;
`;

export const SELECT_ALL_LOAN_REVISIONS_SQL = `
  SELECT * FROM loan_revisions ORDER BY effective_date DESC;
`;

export const SQLITE_MIGRATIONS = [
  `ALTER TABLE accounts ADD COLUMN original_principal REAL;`,
  `ALTER TABLE accounts ADD COLUMN next_emi_date TEXT;`,
  `ALTER TABLE accounts ADD COLUMN monthly_interest_rate REAL;`,
  `ALTER TABLE accounts ADD COLUMN next_interest_due_date TEXT;`,
  `ALTER TABLE accounts ADD COLUMN investment_method TEXT;`,
  `ALTER TABLE accounts ADD COLUMN invested_amount REAL;`,
  `ALTER TABLE accounts ADD COLUMN monthly_sip_amount REAL;`,
  `ALTER TABLE accounts ADD COLUMN next_sip_date TEXT;`,
  `ALTER TABLE accounts ADD COLUMN overdraft_limit REAL NOT NULL DEFAULT 0;`,
  `ALTER TABLE categories ADD COLUMN budget REAL NOT NULL DEFAULT 0;`,
  `ALTER TABLE categories ADD COLUMN is_rollover INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE categories ADD COLUMN tags_json TEXT;`,
  `ALTER TABLE categories ADD COLUMN group_name TEXT;`,
  `ALTER TABLE transactions ADD COLUMN recurring_rule_id TEXT;`,
  `ALTER TABLE transactions ADD COLUMN due_date TEXT;`,
  `ALTER TABLE transactions ADD COLUMN event_id TEXT REFERENCES events(event_id) ON DELETE SET NULL;`,
  `ALTER TABLE categories ADD COLUMN rollover_account_id TEXT;`,
  `ALTER TABLE recurring_rules ADD COLUMN event_id TEXT REFERENCES events(event_id) ON DELETE SET NULL;`,
  `ALTER TABLE recurring_rules ADD COLUMN anchor_day INTEGER;`,
  `ALTER TABLE categories ADD COLUMN affordability_class TEXT;`,
  `UPDATE categories SET affordability_class = CASE LOWER(COALESCE(group_name, '')) WHEN 'savings' THEN 'SAVINGS' WHEN 'leisure' THEN 'FLEXIBLE' WHEN 'essential' THEN 'NORMAL' ELSE 'NORMAL' END WHERE affordability_class IS NULL OR affordability_class = '';`,
];

export const SOFT_DELETE_ACCOUNT_SQL = `
  UPDATE accounts SET is_archived = 1 WHERE id = ?;
`;

export const HARD_DELETE_ACCOUNT_SQL = `
  DELETE FROM accounts WHERE id = ?;
`;

export const DELETE_OPENING_BALANCE_TRANSACTIONS_SQL = `
  DELETE FROM transactions 
  WHERE (from_account_id = ? OR to_account_id = ?) 
    AND transaction_type = 'OPENING_BALANCE';
`;

export const CHECK_ACCOUNT_TRANSACTION_HISTORY_SQL = `
  SELECT COUNT(*) as history_count 
  FROM transactions 
  WHERE (from_account_id = ? OR to_account_id = ?) 
    AND transaction_type != 'OPENING_BALANCE';
`;

/**
 * Deletes or archives an account based on whether it has transaction history.
 */
export async function deleteAccountInDB(
  db: SQLiteDatabaseDriver & {
    query?: (sql: string, params?: (string | number | null | undefined)[]) => Promise<any[]>;
  },
  accountId: string
): Promise<{ success: boolean; isArchived: boolean }> {
  // 1. Fetch account details to inspect cached_balance
  let cachedBalance = 0;
  if (db.query) {
    const rows = await db.query(`SELECT cached_balance FROM account_balances_view WHERE id = ?`, [accountId]);
    if (rows && rows.length > 0) {
      cachedBalance = rows[0].cached_balance ?? 0;
    }
  }

  // 2. Query transactions table to check for history other than OPENING_BALANCE
  let historyCount = 0;
  if (db.query) {
    const res = await db.query(CHECK_ACCOUNT_TRANSACTION_HISTORY_SQL, [accountId, accountId]);
    if (res && res.length > 0) {
      historyCount = res[0].history_count ?? res[0]['COUNT(*)'] ?? res[0]['count'] ?? 0;
    }
  }

  if (historyCount === 0) {
    // Scenario A (No History): Perform Hard Delete
    await db.execute(DELETE_OPENING_BALANCE_TRANSACTIONS_SQL, [accountId, accountId]);
    await db.execute(HARD_DELETE_ACCOUNT_SQL, [accountId]);
    return { success: true, isArchived: false };
  } else {
    // Scenario B (Has History): Check cached_balance
    if (Math.abs(cachedBalance) > 0.0001) {
      throw new Error("Account must have a zero balance before closing. Please transfer funds or log an expense.");
    }

    // Perform Soft Delete
    await db.execute(SOFT_DELETE_ACCOUNT_SQL, [accountId]);
    return { success: true, isArchived: true };
  }
}

export interface CategoryRow {
  id: string;
  name: string;
  type: CategoryType;
  icon_name?: string | null;
  is_rollover: number;
  rollover_account_id?: string | null;
  affordability_class?: string | null;
}

export interface TransactionRow {
  id: string;
  transaction_type: TransactionType;
  title: string;
  subtitle?: string | null;
  amount: number; // Must be > 0
  date: number; // Unix timestamp in milliseconds
  category?: string | null;
  icon?: string | null;
  account?: string | null;
  from_account_id?: string | null;
  to_account_id?: string | null;
  category_id?: string | null;
  notes?: string | null;
  is_verified: number; // 1 for true, 0 for false
  is_recurring: number; // 1 for true, 0 for false
  is_opening_balance: number; // 1 for true, 0 for false
  is_interest_only: number; // 1 for true, 0 for false
  event_id?: string | null;
}

export interface EventRow {
  event_id: string;
  name: string;
  created_at: string;
}

export type InsertTransactionPayload = Omit<Partial<TransactionRow>, 'id'> & {
  transaction_type: TransactionType;
  amount: number;
  date: number;
  id?: string;
};

// 3. Generic DB Driver interface for SQLite execution example
export interface SQLiteDatabaseDriver {
  execute: (sql: string, params?: (string | number | null | undefined)[]) => Promise<void>;
}

/**
 * Boilerplate helper function to insert a transaction into the Transactions table
 */
export async function insertTransaction(
  db: SQLiteDatabaseDriver,
  transaction: InsertTransactionPayload
): Promise<TransactionRow> {
  const id = transaction.id || crypto.randomUUID();
  const is_verified = transaction.is_verified ?? 1;

  if (transaction.amount <= 0) {
    throw new Error('Transaction amount must be strictly greater than 0.');
  }

  await db.execute('BEGIN TRANSACTION');

  try {
    const query = `
      INSERT INTO transactions (
        id,
        transaction_type,
        title,
        subtitle,
        amount,
        date,
        from_account_id,
        to_account_id,
        category_id,
        notes,
        is_verified,
        is_recurring,
        is_opening_balance,
        is_interest_only
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const params = [
      id,
      transaction.transaction_type,
      transaction.title ?? '',
      transaction.subtitle ?? null,
      transaction.amount,
      transaction.date,
      transaction.from_account_id ?? null,
      transaction.to_account_id ?? null,
      transaction.category_id ?? null,
      transaction.notes ?? null,
      is_verified,
      transaction.is_recurring ?? 0,
      transaction.is_opening_balance ?? 0,
      transaction.is_interest_only ?? 0,
    ];

    await db.execute(query, params);

    await db.execute('COMMIT');
    
    return {
      id,
      transaction_type: transaction.transaction_type,
      title: transaction.title ?? '',
      subtitle: transaction.subtitle ?? null,
      amount: transaction.amount,
      date: transaction.date,
      from_account_id: transaction.from_account_id ?? null,
      to_account_id: transaction.to_account_id ?? null,
      category_id: transaction.category_id ?? null,
      notes: transaction.notes ?? null,
      is_verified,
      is_recurring: transaction.is_recurring ?? 0,
      is_opening_balance: transaction.is_opening_balance ?? 0,
      is_interest_only: transaction.is_interest_only ?? 0,
    };
  } catch (err) {
    await db.execute('ROLLBACK');
    throw err;
  }
}

/**
 * Updates an account's opening balance safely without creating duplicates.
 * 
 * Requirements:
 * - Finds and UPDATEs the existing OPENING_BALANCE transaction.
 * - Calculates delta = newAmount - oldAmount.
 * - Validation is derived from the full dated ledger history, not current balance.
 * - Updates the transaction row in the immutable ledger.
 * - Wraps in a SQL transaction.
 */
export async function updateOpeningBalance(
  db: SQLiteDatabaseDriver & {
    query?: (sql: string, params?: (string | number | null | undefined)[]) => Promise<any[]>;
  },
  accountId: string,
  newAmount: number
): Promise<{ success: boolean; delta: number }> {
  if (!db.query) {
    throw new Error('Database query method is not available on driver.');
  }

  await db.execute('BEGIN TRANSACTION');

  try {
    // 1. Fetch the existing OPENING_BALANCE transaction
    const txRows = await db.query(
      `SELECT id, amount FROM transactions 
       WHERE (from_account_id = ? OR to_account_id = ?) 
         AND transaction_type = 'OPENING_BALANCE'`,
      [accountId, accountId]
    );

    if (!txRows || txRows.length === 0) {
      throw new Error('No OPENING_BALANCE transaction found for this account.');
    }

    const txId = txRows[0].id;
    const oldAmount = txRows[0].amount;
    if (!Number.isFinite(newAmount) || newAmount <= 0) throw new Error('Opening balance must be a positive number.');
    const delta = newAmount - oldAmount;

    // 2. Fetch the account balance from view to check type and computed balance
    const accRows = await db.query(
      `SELECT type, credit_limit FROM accounts WHERE id = ?`,
      [accountId]
    );

    if (!accRows || accRows.length === 0) {
      throw new Error('Account not found.');
    }

    const accountType = accRows[0].type;
    const creditLimit = Number(accRows[0].credit_limit ?? 0);

    // The opening entry is the first ledger entry, therefore its adjustment
    // shifts every later running balance by the same delta.  Query the actual
    // low-water mark so historical overdrafts cannot be hidden by recovery.
    const runningRows = await db.query(
      `SELECT MIN(running_balance) AS minimum_balance, MAX(running_balance) AS maximum_balance FROM (
        SELECT SUM(CASE
          WHEN transaction_type = 'OPENING_BALANCE' AND ? = 'ASSET' AND to_account_id = ? THEN amount
          WHEN transaction_type = 'OPENING_BALANCE' AND ? = 'LIABILITY' AND from_account_id = ? THEN amount
          WHEN transaction_type = 'INCOME' AND to_account_id = ? THEN CASE WHEN ? = 'ASSET' THEN amount ELSE -amount END
          WHEN transaction_type = 'EXPENSE' AND from_account_id = ? THEN CASE WHEN ? = 'LIABILITY' AND is_interest_only = 1 THEN 0 WHEN ? = 'ASSET' THEN -amount ELSE amount END
          WHEN transaction_type = 'TRANSFER' AND from_account_id = ? THEN CASE WHEN ? = 'ASSET' THEN -amount ELSE amount END
          WHEN transaction_type = 'TRANSFER' AND to_account_id = ? THEN CASE WHEN ? = 'ASSET' THEN amount ELSE -amount END
          WHEN transaction_type IN ('MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT') AND from_account_id = ? THEN CASE WHEN ? = 'ASSET' THEN -amount ELSE amount END
          WHEN transaction_type IN ('MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT') AND to_account_id = ? THEN CASE WHEN ? = 'ASSET' THEN amount ELSE -amount END
          ELSE 0 END) OVER (ORDER BY date, id) AS running_balance
        FROM transactions WHERE is_verified = 1 AND (from_account_id = ? OR to_account_id = ?)
      )`,
      [accountType, accountId, accountType, accountId, accountId, accountType, accountId, accountType, accountType, accountId, accountType, accountId, accountType, accountId, accountType, accountId, accountType, accountId, accountId]
    );
    const minimumBalance = Number(runningRows[0]?.minimum_balance ?? 0) + delta;
    const maximumBalance = Number(runningRows[0]?.maximum_balance ?? 0) + delta;
    if (accountType === 'ASSET' && minimumBalance < -0.000001) {
      const minimumSafeOpening = newAmount + Math.abs(minimumBalance);
      throw new Error(`Cannot set initial balance lower than ${minimumSafeOpening.toFixed(2)} because existing transactions would make the account negative.`);
    }
    if (accountType === 'LIABILITY' && creditLimit > 0 && maximumBalance > creditLimit + 0.000001) {
      throw new Error('Cannot update opening balance: it would exceed this account credit limit.');
    }

    // 4. Update the existing OPENING_BALANCE transaction in the immutable ledger
    await db.execute(
      `UPDATE transactions SET amount = ? WHERE id = ?`,
      [newAmount, txId]
    );

    await db.execute('COMMIT');
    
    return { success: true, delta };
  } catch (error) {
    await db.execute('ROLLBACK');
    throw error;
  }
}

export type IntegrityIssueSeverity = 'error' | 'warning';

export interface DataIntegrityIssue {
  code: string;
  severity: IntegrityIssueSeverity;
  message: string;
  entityId?: string;
}

export interface DataIntegrityAuditResult {
  mismatches: { accountId: string; expectedBalance: number; actualBalance: number }[];
  isNetWorthAccurate: boolean;
  totalAssets: number;
  totalLiabilities: number;
  issues: DataIntegrityIssue[];
  isHealthy: boolean;
  hasCriticalIssues: boolean;
}

/**
 * Full data-health audit. The balance audit remains the financial source of
 * truth, while the additional checks cover the planner/recurring/Goals models
 * that are not protected by SQLite foreign keys alone.
 */
export async function auditDatabaseIntegrity(
  db: SQLiteDatabaseDriver & {
    query?: (sql: string, params?: (string | number | null | undefined)[]) => Promise<any[]>;
  }
): Promise<DataIntegrityAuditResult> {
  if (!db.query) throw new Error('Database query method is not available on driver.');

  const issues: DataIntegrityIssue[] = [];
  const addIssue = (code: string, severity: IntegrityIssueSeverity, message: string, entityId?: string) => {
    issues.push({ code, severity, message, entityId });
  };

  // SQLite file/index health and declared foreign keys.
  const integrityRows = await db.query('PRAGMA integrity_check;');
  const integrityMessages = integrityRows.map(row => String(Object.values(row)[0] ?? '')).filter(Boolean);
  if (integrityMessages.length !== 1 || integrityMessages[0].toLowerCase() !== 'ok') {
    addIssue('SQLITE_INTEGRITY', 'error', `SQLite integrity check failed: ${integrityMessages.join('; ') || 'unknown error'}.`);
  }
  const foreignKeyRows = await db.query('PRAGMA foreign_key_check;');
  for (const row of foreignKeyRows) {
    addIssue('FOREIGN_KEY', 'error', `Broken database reference in ${String(row.table ?? 'unknown table')} (row ${String(row.rowid ?? '?')}).`);
  }

  const accountMetadata = await db.query(`SELECT id, name, type, subtype, is_archived, investment_method, monthly_sip_amount, next_sip_date FROM accounts`);
  const accountMap = new Map(accountMetadata.map(account => [String(account.id), account]));
  const accounts = await db.query(`SELECT id, type, cached_balance FROM account_balances_view`);
  const mismatches: { accountId: string; expectedBalance: number; actualBalance: number }[] = [];
  let expectedTotalAssets = 0;
  let expectedTotalLiabilities = 0;
  let actualTotalAssets = 0;
  let actualTotalLiabilities = 0;

  for (const account of accounts) {
    const accountId = String(account.id);
    const actualBalance = Number(account.cached_balance ?? 0);
    const accountType = String(account.type);
    let expectedBalance = 0;
    const txRows = await db.query(
      `SELECT transaction_type, amount, from_account_id, to_account_id, is_verified, is_interest_only
         FROM transactions
        WHERE from_account_id = ? OR to_account_id = ?`,
      [accountId, accountId],
    );
    for (const tx of txRows) {
      expectedBalance += applyTransactionEffect({
        ...tx,
        type: tx.transaction_type?.toLowerCase(),
        transaction_type: tx.transaction_type,
        fromAccountId: tx.from_account_id,
        toAccountId: tx.to_account_id,
        isInterestOnly: Boolean(tx.is_interest_only),
        is_verified: Number(tx.is_verified ?? 1),
      } as any, { id: accountId, type: accountType === 'LIABILITY' ? 'liability' : 'asset' });
    }
    const roundedExpected = Math.round(expectedBalance * 100) / 100;
    const roundedActual = Math.round(actualBalance * 100) / 100;
    if (roundedExpected !== roundedActual) {
      mismatches.push({ accountId, expectedBalance: roundedExpected, actualBalance: roundedActual });
      addIssue('BALANCE_MISMATCH', 'error', `Account ${accountMetadata.find(item => String(item.id) === accountId)?.name ?? accountId} does not match its transaction ledger.`, accountId);
    }
    if (accountType === 'ASSET') {
      expectedTotalAssets += roundedExpected;
      actualTotalAssets += roundedActual;
    } else if (accountType === 'LIABILITY') {
      expectedTotalLiabilities += roundedExpected;
      actualTotalLiabilities += roundedActual;
    }
  }

  const expectedNetWorth = expectedTotalAssets - expectedTotalLiabilities;
  const actualNetWorth = actualTotalAssets - actualTotalLiabilities;
  const isNetWorthAccurate = Math.round(expectedNetWorth * 100) === Math.round(actualNetWorth * 100);
  if (!isNetWorthAccurate) addIssue('NET_WORTH_MISMATCH', 'error', 'Net worth does not reconcile to the account ledger.');

  // Credit-card metadata must point to a liability account.
  const cardRows = await db.query(`
    SELECT cc.id, cc.account_id, cc.due_amount, a.id AS linked_id, a.type AS linked_type
      FROM credit_cards cc
      LEFT JOIN accounts a ON a.id = cc.account_id
  `);
  for (const card of cardRows) {
    if (!card.linked_id) addIssue('CREDIT_CARD_LINK', 'error', `Credit card ${String(card.id)} is not linked to an existing account.`, String(card.id));
    else if (card.linked_type !== 'LIABILITY') addIssue('CREDIT_CARD_LINK', 'error', `Credit card ${String(card.id)} is linked to a non-liability account.`, String(card.id));
    if (!Number.isFinite(Number(card.due_amount)) || Number(card.due_amount) < 0) addIssue('CREDIT_CARD_DUE', 'warning', `Credit card ${String(card.id)} has an invalid due amount.`, String(card.id));
  }

  // Active recurring schedules must resolve to live accounts. Recurring-rule
  // account columns are intentionally not foreign-key constrained because old
  // ledger entries survive schedule deletion, so validate them explicitly.
  const recurringRows = await db.query(`SELECT * FROM recurring_rules`);
  const recurringMap = new Map(recurringRows.map(rule => [String(rule.id), rule]));
  for (const rule of recurringRows) {
    if (Number(rule.is_active ?? 1) !== 1) continue;
    const id = String(rule.id);
    const type = String(rule.transaction_type);
    const sourceId = rule.from_account_id ?? (type === 'EXPENSE' ? rule.account : null);
    const destinationId = rule.to_account_id ?? (type === 'INCOME' ? rule.account : null);
    const source = sourceId ? accountMap.get(String(sourceId)) : undefined;
    const destination = destinationId ? accountMap.get(String(destinationId)) : undefined;
    if ((type === 'EXPENSE' || type === 'TRANSFER') && !sourceId) addIssue('RECURRING_SOURCE', 'error', `Recurring schedule “${String(rule.title)}” has no source account.`, id);
    else if (sourceId && !source) addIssue('RECURRING_SOURCE', 'error', `Recurring schedule “${String(rule.title)}” points to a missing source account.`, id);
    else if (source && Number(source.is_archived) === 1) addIssue('RECURRING_ARCHIVED_ACCOUNT', 'warning', `Recurring schedule “${String(rule.title)}” uses archived source account ${String(source.name)}.`, id);
    if ((type === 'INCOME' || type === 'TRANSFER') && !destinationId) addIssue('RECURRING_DESTINATION', 'error', `Recurring schedule “${String(rule.title)}” has no destination account.`, id);
    else if (destinationId && !destination) addIssue('RECURRING_DESTINATION', 'error', `Recurring schedule “${String(rule.title)}” points to a missing destination account.`, id);
    else if (destination && Number(destination.is_archived) === 1) addIssue('RECURRING_ARCHIVED_ACCOUNT', 'warning', `Recurring schedule “${String(rule.title)}” uses archived destination account ${String(destination.name)}.`, id);
    if (type === 'TRANSFER' && sourceId && destinationId && String(sourceId) === String(destinationId)) addIssue('RECURRING_SELF_TRANSFER', 'error', `Recurring schedule “${String(rule.title)}” transfers to the same account.`, id);
    const due = String(rule.next_due_date ?? '');
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T12:00:00`) : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) addIssue('RECURRING_DATE', 'error', `Recurring schedule “${String(rule.title)}” has an invalid next due date.`, id);
  }

  // Investment SIP metadata should own a synchronized recurring transfer rule.
  for (const account of accountMetadata) {
    const subtype = String(account.subtype ?? '').trim().toLowerCase();
    const isSip = account.type === 'ASSET' && subtype === 'investment' && account.investment_method === 'SIP' && Number(account.monthly_sip_amount ?? 0) > 0 && Boolean(account.next_sip_date);
    if (!isSip || Number(account.is_archived) === 1) continue;
    const accountId = String(account.id);
    const rule = recurringMap.get(`investment-sip:${accountId}`);
    if (!rule) {
      addIssue('SIP_RECURRING_SYNC', 'warning', `Investment ${String(account.name)} has SIP metadata but no managed recurring transfer. Edit the Investment once to choose its funding account.`, accountId);
      continue;
    }
    if (String(rule.transaction_type) !== 'TRANSFER' || String(rule.to_account_id ?? '') !== accountId || Math.abs(Number(rule.amount) - Number(account.monthly_sip_amount)) > 0.005 || Number(rule.is_active ?? 1) !== 1) {
      addIssue('SIP_RECURRING_SYNC', 'warning', `Investment ${String(account.name)} SIP metadata does not match its managed recurring transfer.`, accountId);
    }
  }

  // Every expense category needs a current affordability classification.
  const validAffordability = new Set(['COMMITTED', 'NORMAL', 'FLEXIBLE', 'IRREGULAR', 'SAVINGS']);
  const categoryRows = await db.query(`SELECT id, name, type, affordability_class FROM categories`);
  for (const category of categoryRows) {
    if (category.type === 'EXPENSE' && !validAffordability.has(String(category.affordability_class ?? ''))) {
      addIssue('CATEGORY_AFFORDABILITY', 'warning', `Expense category ${String(category.name)} is missing a valid affordability classification.`, String(category.id));
    }
  }

  // All settings must remain valid JSON. Goals also carry account references in
  // JSON rather than SQL columns, so validate those references explicitly.
  const settingRows = await db.query(`SELECT key, value_json FROM app_settings`);
  let goals: any[] = [];
  for (const setting of settingRows) {
    try {
      const value = JSON.parse(String(setting.value_json));
      if (String(setting.key) === 'savings_goals_v1') goals = Array.isArray(value) ? value : [];
    } catch {
      addIssue('APP_SETTING_JSON', 'error', `Stored setting ${String(setting.key)} contains invalid JSON.`, String(setting.key));
    }
  }
  const goalIds = new Set<string>();
  for (const goal of goals) {
    const id = String(goal?.id ?? '');
    if (!id) { addIssue('GOAL_ID', 'warning', 'A Goal is missing its identifier.'); continue; }
    if (goalIds.has(id)) addIssue('GOAL_ID', 'warning', `Goal ${String(goal?.name ?? id)} has a duplicate identifier.`, id);
    goalIds.add(id);
    if (!Number.isFinite(Number(goal?.targetAmount)) || Number(goal.targetAmount) <= 0) addIssue('GOAL_TARGET', 'warning', `Goal ${String(goal?.name ?? id)} has an invalid target amount.`, id);
    if (goal?.linkedAccountId) {
      const linked = accountMap.get(String(goal.linkedAccountId));
      if (!linked) addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} points to a missing account.`, id);
      else if (Number(linked.is_archived) === 1) addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} points to archived account ${String(linked.name)}.`, id);
      else if (linked.type !== 'ASSET') addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} is linked to a liability instead of an asset.`, id);
      if (goal?.protectLinkedBalance && linked) {
        const group = String(linked.subtype ?? '').trim().toLowerCase();
        if (group === 'investment' || group === 'physical asset') addIssue('GOAL_PROTECTED_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} cannot protect a non-liquid ${String(linked.subtype)} balance as cash reserve.`, id);
      }
    }
  }

  return {
    mismatches,
    isNetWorthAccurate,
    totalAssets: actualTotalAssets,
    totalLiabilities: actualTotalLiabilities,
    issues,
    isHealthy: issues.length === 0,
    hasCriticalIssues: issues.some(issue => issue.severity === 'error'),
  };
}
