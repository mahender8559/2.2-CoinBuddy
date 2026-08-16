import fs from 'node:fs';
const read = file => fs.readFileSync(file, 'utf8');
const write = (file, content) => fs.writeFileSync(file, content);
function replaceOnce(file, before, after) {
  const source = read(file); const index = source.indexOf(before);
  if (index < 0) throw new Error(`Expected source not found in ${file}: ${before.slice(0, 120)}`);
  write(file, source.slice(0, index) + after + source.slice(index + before.length));
}
function replaceBetween(file, startMarker, endMarker, replacement) {
  const source = read(file); const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Start marker not found in ${file}: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`End marker not found in ${file}: ${endMarker}`);
  write(file, source.slice(0, start) + replacement + source.slice(end));
}

replaceOnce('src/db/dbClientCore.ts',
  "import { buildInvestmentSipRule, investmentSipRuleId, isInvestmentSipAccount } from '../domain/investmentSip';",
  "import { buildInvestmentSipRule, investmentSipRuleId, isInvestmentSipAccount } from '../domain/investmentSip';\nimport { persistenceCopiesDiverged, persistenceWriteWarning, selectNewestPersistenceCandidate } from './persistenceStrategy';");

replaceOnce('src/db/dbClientCore.ts',
  "/** Reject malformed backups before clearing the existing ledger. */",
  `const PERSISTENCE_META_TABLE = 'coinbuddy_persistence_meta';
const PERSISTENCE_GENERATION_KEY = 'ledger_generation';

function ensurePersistenceMetadata(db: any): void {
  db.run(\`CREATE TABLE IF NOT EXISTS \${PERSISTENCE_META_TABLE} (key TEXT PRIMARY KEY, value INTEGER NOT NULL)\`);
  db.run(\`INSERT OR IGNORE INTO \${PERSISTENCE_META_TABLE} (key, value) VALUES (?, 0)\`, [PERSISTENCE_GENERATION_KEY]);
}

function readPersistenceGeneration(db: any): number {
  try {
    const result = db.exec(\`SELECT value FROM \${PERSISTENCE_META_TABLE} WHERE key = 'ledger_generation' LIMIT 1\`);
    const value = Number(result[0]?.values?.[0]?.[0] ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function setPersistenceGeneration(db: any, generation: number): void {
  ensurePersistenceMetadata(db);
  db.run(\`UPDATE \${PERSISTENCE_META_TABLE} SET value = ? WHERE key = ?\`, [Math.max(0, Math.trunc(generation)), PERSISTENCE_GENERATION_KEY]);
}

function inspectSnapshotGeneration(SQL: any, snapshot: Uint8Array): number {
  let probe: any;
  try {
    probe = new SQL.Database(snapshot);
    return readPersistenceGeneration(probe);
  } catch {
    return 0;
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

/** Reject malformed backups before clearing the existing ledger. */`);

replaceOnce('src/db/dbClientCore.ts',
  "async function readOpfsSnapshot(): Promise<Uint8Array | null> {\n  const getDirectory = (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined;",
  "async function readOpfsSnapshot(): Promise<Uint8Array | null> {\n  const getDirectory = typeof navigator !== 'undefined' ? (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined : undefined;");
replaceOnce('src/db/dbClientCore.ts',
  "async function writeOpfsSnapshot(snapshot: Uint8Array): Promise<boolean> {\n  const getDirectory = (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined;",
  "async function writeOpfsSnapshot(snapshot: Uint8Array): Promise<boolean> {\n  const getDirectory = typeof navigator !== 'undefined' ? (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined : undefined;");

replaceBetween('src/db/dbClientCore.ts',
  'export async function initializeDatabase(): Promise<SqlJsDatabaseDriver> {',
  'export async function deletePersistedDatabase(): Promise<void> {',
  `export async function initializeDatabase(): Promise<SqlJsDatabaseDriver> {
  const SQL = await initSqlJs({ locateFile: (file) => file.endsWith('.wasm') ? sqlWasmUrl : file });

  const [opfsSnapshot, indexedDbSnapshot] = await Promise.all([
    readOpfsSnapshot(),
    readSnapshot().catch(error => { console.warn('IndexedDB snapshot read failed:', error); return null; }),
  ]);
  const candidates = [
    ...(opfsSnapshot ? [{ source: 'OPFS' as const, generation: inspectSnapshotGeneration(SQL, opfsSnapshot), snapshot: opfsSnapshot }] : []),
    ...(indexedDbSnapshot ? [{ source: 'INDEXED_DB' as const, generation: inspectSnapshotGeneration(SQL, indexedDbSnapshot), snapshot: indexedDbSnapshot }] : []),
  ];
  const selected = selectNewestPersistenceCandidate(candidates);
  let saved = selected?.snapshot ?? null;
  const diverged = persistenceCopiesDiverged(candidates, snapshotsMatch);

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
    notifyPersistenceWarning(\`Local ledger copies disagreed. CoinBuddy selected the newer \${selected.source === 'OPFS' ? 'OPFS' : 'IndexedDB'} snapshot (generation \${selected.generation}) and is repairing redundancy.\`);
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
    throw new Error(\`Unable to save your ledger locally: \${cause instanceof Error ? cause.message : String(cause)}\`);
  }

  const warning = persistenceWriteWarning({ indexedDbSaved, opfsSaved, opfsAvailable });
  if (warning) notifyPersistenceWarning(warning);
}

`);

replaceOnce('src/db/dbClientCore.ts',
  "  const getDirectory = (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined;",
  "  const getDirectory = typeof navigator !== 'undefined' ? (navigator.storage as any)?.getDirectory as (() => Promise<any>) | undefined : undefined;");

replaceOnce('src/context/AppContext.tsx',
  "  const getStoredSetting = useCallback(async (key: string): Promise<unknown> => {",
  `  useEffect(() => {
    const onPersistenceWarning = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) showToast(message);
    };
    window.addEventListener('coinbuddy_persistence_warning', onPersistenceWarning);
    return () => window.removeEventListener('coinbuddy_persistence_warning', onPersistenceWarning);
  }, [showToast]);

  const getStoredSetting = useCallback(async (key: string): Promise<unknown> => {`);
replaceOnce('src/context/AppContext.tsx',
  "      window.alert(`Your change was not saved: ${error instanceof Error ? error.message : String(error)}`);",
  "      showToast(`Your change was not saved: ${error instanceof Error ? error.message : String(error)}`);");
replaceOnce('src/context/AppContext.tsx',
  "      window.alert(`Your shared-finance change was not saved: ${error instanceof Error ? error.message : String(error)}`);",
  "      showToast(`Your shared-finance change was not saved: ${error instanceof Error ? error.message : String(error)}`);");
replaceOnce('src/context/AppContext.tsx',
  "      window.alert(`Settlement was not saved: ${error instanceof Error ? error.message : String(error)}`);",
  "      showToast(`Settlement was not saved: ${error instanceof Error ? error.message : String(error)}`);");
replaceOnce('src/context/AppContext.tsx',
  "      window.alert(`External loan payment was not saved: ${error instanceof Error ? error.message : String(error)}`);",
  "      showToast(`External loan payment was not saved: ${error instanceof Error ? error.message : String(error)}`);");

console.log('Persistence generation and save-error UX hardening staged.');
