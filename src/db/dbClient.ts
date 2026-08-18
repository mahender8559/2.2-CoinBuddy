import {
  deletePersistedDatabase as deletePersistedDatabaseCore,
  loadStateFromDatabase as loadStateFromDatabaseCore,
  persistDatabase as persistDatabaseCore,
  restoreRecoverySnapshot as restoreRecoverySnapshotCore,
  type SqlJsDatabaseDriver,
} from './dbClientCore';
import { SQLITE_PRAGMA_SETUP } from './sqliteSchema';

export * from './dbClientCore';

/**
 * Browser persistence can be requested by several React/domain flows almost at
 * once. The core persistence routine verifies IndexedDB by reading the snapshot
 * back after a write; without serialization, a newer valid write can replace
 * that snapshot before the earlier verification read and create a false
 * "verification failed after write" error.
 */
let persistenceQueue: Promise<void> = Promise.resolve();

function enqueuePersistence(operation: () => Promise<void>): Promise<void> {
  const task = persistenceQueue.then(operation, operation);
  persistenceQueue = task.catch(() => undefined);
  return task;
}

function isIndexedDbVerificationRace(error: unknown): boolean {
  return error instanceof Error && error.message.includes('IndexedDB verification failed after write');
}

async function persistWithVerificationRetry(driver: SqlJsDatabaseDriver): Promise<void> {
  try {
    await persistDatabaseCore(driver);
  } catch (error) {
    if (!isIndexedDbVerificationRace(error)) throw error;
    // Let the browser finish any pending IndexedDB commit bookkeeping, then
    // verify one more freshly exported snapshot. A genuine storage failure still
    // propagates on the second attempt.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await persistDatabaseCore(driver);
  }
}

/**
 * The balance view intentionally focuses on ledger-derived balance fields and
 * historically omitted next_emi_date. Enrich the loaded account projection from
 * the canonical accounts table so editing a loan never falls back to its start
 * date after a database refresh.
 */
export async function loadStateFromDatabase(driver: SqlJsDatabaseDriver) {
  const state = await loadStateFromDatabaseCore(driver);
  const loanDateRows = await driver.query(`SELECT id, next_emi_date FROM accounts WHERE is_archived = 0;`);
  const nextEmiDateByAccount = new Map<string, string>();
  for (const row of loanDateRows) {
    if (row.next_emi_date != null) nextEmiDateByAccount.set(String(row.id), String(row.next_emi_date));
  }

  return {
    ...state,
    accounts: state.accounts.map(account => ({
      ...account,
      nextEMIDate: nextEmiDateByAccount.get(account.id) ?? account.nextEMIDate,
    })),
  };
}

export function persistDatabase(driver: SqlJsDatabaseDriver): Promise<void> {
  return enqueuePersistence(() => persistWithVerificationRetry(driver));
}

/**
 * Serialize the mutation and its durable snapshot as one operation. This keeps
 * concurrent UI actions from interleaving their verification windows while
 * preserving the core rollback behavior on any genuine persistence failure.
 */
export function runAtomicDatabaseAction(
  driver: SqlJsDatabaseDriver,
  action: () => Promise<unknown>,
): Promise<void> {
  return enqueuePersistence(async () => {
    const before = driver.rawDb.export() as Uint8Array;
    const DatabaseConstructor = driver.rawDb.constructor;
    try {
      await action();
      await persistWithVerificationRetry(driver);
    } catch (error) {
      try { driver.rawDb.close(); } catch { /* best effort */ }
      driver.rawDb = new DatabaseConstructor(before);
      driver.rawDb.run(SQLITE_PRAGMA_SETUP);
      throw error;
    }
  });
}

export function restoreRecoverySnapshot(driver: SqlJsDatabaseDriver, key: string): Promise<void> {
  return enqueuePersistence(async () => {
    try {
      await restoreRecoverySnapshotCore(driver, key);
    } catch (error) {
      if (!isIndexedDbVerificationRace(error)) throw error;
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      await restoreRecoverySnapshotCore(driver, key);
    }
  });
}

export function deletePersistedDatabase(): Promise<void> {
  return enqueuePersistence(() => deletePersistedDatabaseCore());
}
