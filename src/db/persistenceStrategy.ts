export type PersistenceSource = 'INDEXED_DB' | 'OPFS';

export interface PersistenceCandidate<T> {
  source: PersistenceSource;
  generation: number;
  snapshot: T;
}

/** Prefer the newest committed ledger generation. OPFS wins only an exact tie to preserve legacy startup behavior. */
export function selectNewestPersistenceCandidate<T>(candidates: PersistenceCandidate<T>[]): PersistenceCandidate<T> | null {
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => {
    if (right.generation !== left.generation) return right.generation - left.generation;
    if (left.source === right.source) return 0;
    return left.source === 'OPFS' ? -1 : 1;
  })[0];
}

export function persistenceCopiesDiverged<T>(candidates: PersistenceCandidate<T>[], sameSnapshot: (left: T, right: T) => boolean): boolean {
  if (candidates.length < 2) return false;
  const [left, right] = candidates;
  return left.generation !== right.generation || !sameSnapshot(left.snapshot, right.snapshot);
}

export interface PersistenceWriteOutcome {
  indexedDbSaved: boolean;
  opfsSaved: boolean;
  opfsAvailable: boolean;
}

export function persistenceWriteWarning(outcome: PersistenceWriteOutcome): string | null {
  if (!outcome.indexedDbSaved && !outcome.opfsSaved) return null;
  if (!outcome.indexedDbSaved) return 'IndexedDB did not accept the latest ledger snapshot. CoinBuddy kept the OPFS copy and will retry redundancy on the next save.';
  if (outcome.opfsAvailable && !outcome.opfsSaved) return 'OPFS did not accept the latest ledger snapshot. CoinBuddy kept the IndexedDB copy and will prefer its newer generation on reload.';
  return null;
}
