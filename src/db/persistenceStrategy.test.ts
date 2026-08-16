import { describe, expect, it } from 'vitest';
import { persistenceCopiesDiverged, persistenceWriteWarning, selectNewestPersistenceCandidate } from './persistenceStrategy';

describe('persistence strategy', () => {
  it('chooses the newer IndexedDB snapshot when OPFS is stale', () => {
    const selected = selectNewestPersistenceCandidate([
      { source: 'OPFS', generation: 4, snapshot: 'old' },
      { source: 'INDEXED_DB', generation: 5, snapshot: 'new' },
    ]);
    expect(selected).toEqual({ source: 'INDEXED_DB', generation: 5, snapshot: 'new' });
  });

  it('chooses the newer OPFS snapshot when IndexedDB is stale', () => {
    const selected = selectNewestPersistenceCandidate([
      { source: 'INDEXED_DB', generation: 8, snapshot: 'old' },
      { source: 'OPFS', generation: 9, snapshot: 'new' },
    ]);
    expect(selected?.source).toBe('OPFS');
  });

  it('preserves OPFS as the tie-breaker for legacy generation-zero copies', () => {
    const selected = selectNewestPersistenceCandidate([
      { source: 'INDEXED_DB', generation: 0, snapshot: 'idb' },
      { source: 'OPFS', generation: 0, snapshot: 'opfs' },
    ]);
    expect(selected?.source).toBe('OPFS');
  });

  it('detects mismatched generations or bytes', () => {
    expect(persistenceCopiesDiverged([
      { source: 'OPFS', generation: 1, snapshot: 'same' },
      { source: 'INDEXED_DB', generation: 2, snapshot: 'same' },
    ], (a, b) => a === b)).toBe(true);
    expect(persistenceCopiesDiverged([
      { source: 'OPFS', generation: 2, snapshot: 'a' },
      { source: 'INDEXED_DB', generation: 2, snapshot: 'b' },
    ], (a, b) => a === b)).toBe(true);
  });

  it('surfaces partial-write warnings without treating a missing OPFS API as failure', () => {
    expect(persistenceWriteWarning({ indexedDbSaved: true, opfsSaved: false, opfsAvailable: false })).toBeNull();
    expect(persistenceWriteWarning({ indexedDbSaved: true, opfsSaved: false, opfsAvailable: true })).toContain('OPFS');
    expect(persistenceWriteWarning({ indexedDbSaved: false, opfsSaved: true, opfsAvailable: true })).toContain('IndexedDB');
  });
});
