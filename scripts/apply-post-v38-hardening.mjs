import fs from 'node:fs';
const file = 'src/db/dbClientCore.ts';
let source = fs.readFileSync(file, 'utf8');
function replaceOnce(before, after) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Expected source not found: ${before.slice(0, 160)}`);
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

replaceOnce(
`function inspectSnapshotGeneration(SQL: any, snapshot: Uint8Array): number {
  let probe: any;
  try {
    probe = new SQL.Database(snapshot);
    return readPersistenceGeneration(probe);
  } catch {
    return 0;
  } finally {
    try { probe?.close(); } catch { /* best effort */ }
  }
}`,
`function inspectSnapshotGeneration(SQL: any, snapshot: Uint8Array): number | null {
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
}`,
);

replaceOnce(
`  const candidates = [
    ...(opfsSnapshot ? [{ source: 'OPFS' as const, generation: inspectSnapshotGeneration(SQL, opfsSnapshot), snapshot: opfsSnapshot }] : []),
    ...(indexedDbSnapshot ? [{ source: 'INDEXED_DB' as const, generation: inspectSnapshotGeneration(SQL, indexedDbSnapshot), snapshot: indexedDbSnapshot }] : []),
  ];
  const selected = selectNewestPersistenceCandidate(candidates);
  let saved = selected?.snapshot ?? null;
  const diverged = persistenceCopiesDiverged(candidates, snapshotsMatch);

  if (!saved) {`,
`  const opfsGeneration = opfsSnapshot ? inspectSnapshotGeneration(SQL, opfsSnapshot) : null;
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

  if (!saved) {`,
);

fs.writeFileSync(file, source);
console.log('Invalid persistence snapshot selection hardening staged.');
