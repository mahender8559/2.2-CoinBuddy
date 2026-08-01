/**
 * Embedded SQLite Schema & Types for Local-First Personal Finance App
 */

// Enforce foreign keys pragmatically in SQLite connection setup
export const SQLITE_PRAGMA_SETUP = `
PRAGMA foreign_keys = ON;
`;

// 1. DDL Statements for Accounts, Categories, and Transactions Tables
export const CREATE_TABLES_SQL = `
-- Enforce Foreign Keys
PRAGMA foreign_keys = ON;

-- 1. Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ASSET', 'LIABILITY')),
  subtype TEXT,
  credit_limit REAL,
  cached_balance REAL NOT NULL DEFAULT 0.0
);

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
  icon_name TEXT
);

-- 3. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'OPENING_BALANCE')),
  amount REAL NOT NULL CHECK(amount > 0),
  date INTEGER NOT NULL,
  from_account_id TEXT,
  to_account_id TEXT,
  category_id TEXT,
  notes TEXT,
  is_verified INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (from_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
`;

// 2. Corresponding TypeScript Interfaces

export type AccountType = 'ASSET' | 'LIABILITY';
export type CategoryType = 'INCOME' | 'EXPENSE';
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'OPENING_BALANCE';

export interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  subtype?: string | null;
  credit_limit?: number | null;
  cached_balance: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  type: CategoryType;
  icon_name?: string | null;
}

export interface TransactionRow {
  id: string;
  transaction_type: TransactionType;
  amount: number; // Must be > 0
  date: number; // Unix timestamp in milliseconds
  from_account_id?: string | null;
  to_account_id?: string | null;
  category_id?: string | null;
  notes?: string | null;
  is_verified: number; // 1 for true, 0 for false
}

export type InsertTransactionPayload = Omit<TransactionRow, 'id'> & {
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

  const query = `
    INSERT INTO transactions (
      id,
      transaction_type,
      amount,
      date,
      from_account_id,
      to_account_id,
      category_id,
      notes,
      is_verified
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  const params = [
    id,
    transaction.transaction_type,
    transaction.amount,
    transaction.date,
    transaction.from_account_id ?? null,
    transaction.to_account_id ?? null,
    transaction.category_id ?? null,
    transaction.notes ?? null,
    is_verified,
  ];

  await db.execute(query, params);

  // Update cached_balance of the involved accounts based on transaction type
  if (transaction.transaction_type === 'INCOME' && transaction.to_account_id) {
    // Income always goes to an Asset (Balance goes UP)
    await db.execute(
      `UPDATE accounts SET cached_balance = cached_balance + ? WHERE id = ?`,
      [transaction.amount, transaction.to_account_id]
    );
  } else if (transaction.transaction_type === 'EXPENSE' && transaction.from_account_id) {
    // Expense requires checking if the source is an Asset or Liability using CASE statement
    const updateSql = `
      UPDATE accounts 
      SET cached_balance = CASE 
        WHEN type = 'ASSET' THEN cached_balance - ? 
        WHEN type = 'LIABILITY' THEN cached_balance + ? 
      END
      WHERE id = ?
    `;
    await db.execute(updateSql, [transaction.amount, transaction.amount, transaction.from_account_id]);
  } else if (transaction.transaction_type === 'TRANSFER' && transaction.from_account_id && transaction.to_account_id) {
    // Transfer decreases the source, and requires a check for the destination
    
    // 1. Decrease the source (Whether Asset or Liability, paying money out decreases its balance)
    await db.execute(
      `UPDATE accounts SET cached_balance = cached_balance - ? WHERE id = ?`,
      [transaction.amount, transaction.from_account_id]
    );
    
    // 2. Increase or decrease the destination
    const updateDestSql = `
      UPDATE accounts 
      SET cached_balance = CASE 
        WHEN type = 'ASSET' THEN cached_balance + ? 
        WHEN type = 'LIABILITY' THEN cached_balance - ? 
      END
      WHERE id = ?
    `;
    await db.execute(updateDestSql, [transaction.amount, transaction.amount, transaction.to_account_id]);
  } else if (transaction.transaction_type === 'OPENING_BALANCE') {
    // Handled based on whether it targets 'to' (Asset) or 'from' (Liability)
    if (transaction.to_account_id) {
      await db.execute(`UPDATE accounts SET cached_balance = cached_balance + ? WHERE id = ?`, [transaction.amount, transaction.to_account_id]);
    } else if (transaction.from_account_id) {
      await db.execute(`UPDATE accounts SET cached_balance = cached_balance + ? WHERE id = ?`, [transaction.amount, transaction.from_account_id]);
    }
  }

  return {
    id,
    transaction_type: transaction.transaction_type,
    amount: transaction.amount,
    date: transaction.date,
    from_account_id: transaction.from_account_id ?? null,
    to_account_id: transaction.to_account_id ?? null,
    category_id: transaction.category_id ?? null,
    notes: transaction.notes ?? null,
    is_verified,
  };
}
