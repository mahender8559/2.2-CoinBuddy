import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// dbClientCore imports the browser-facing `?url` form of sql.js' WASM asset.
// In Vitest on Windows, Vite exposes that as a root-relative `/node_modules/...`
// URL and sql.js then asks Node to open it from the drive root (for example
// `M:\node_modules\...`) instead of this repository. Mock only the asset URL
// for this Node-based test; production keeps using Vite's emitted browser URL.
vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({
  default: `${process.cwd().replace(/\\/g, '/')}/node_modules/sql.js/dist/sql-wasm.wasm`,
}));

import { initializeDatabase, persistDatabase } from './dbClientCore';

function memoryLocalStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

function deleteSnapshotDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('coinbuddy-ledger');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Snapshot database delete was blocked.'));
  });
}

describe('dual-store persistence divergence recovery', () => {
  let opfsBytes: Uint8Array | null;
  let failOpfsWrite: boolean;

  beforeEach(async () => {
    await deleteSnapshotDatabase();
    opfsBytes = null;
    failOpfsWrite = false;
    vi.stubGlobal('localStorage', memoryLocalStorage());
    const root = {
      async getFileHandle(_name: string, options?: { create?: boolean }) {
        if (!options?.create && !opfsBytes) throw new Error('OPFS file not found');
        return {
          async getFile() {
            if (!opfsBytes) throw new Error('OPFS file not found');
            const copy = opfsBytes.slice();
            return { arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) };
          },
          async createWritable() {
            if (failOpfsWrite) throw new Error('simulated OPFS write failure');
            let pending: Uint8Array | null = null;
            return {
              async write(value: Uint8Array | ArrayBuffer) {
                pending = value instanceof Uint8Array ? value.slice() : new Uint8Array(value).slice();
              },
              async close() {
                if (pending) opfsBytes = pending;
              },
            };
          },
        };
      },
      async removeEntry() { opfsBytes = null; },
    };
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await deleteSnapshotDatabase();
  });

  it('loads the newer IndexedDB generation after a transient OPFS write failure', async () => {
    const first = await initializeDatabase();
    await persistDatabase(first);
    const staleOpfs = opfsBytes?.slice();
    expect(staleOpfs?.byteLength).toBeGreaterThan(0);

    await first.execute(`INSERT INTO app_settings (key, value_json) VALUES ('divergence-proof', '\"newer\"')`);
    failOpfsWrite = true;
    await expect(persistDatabase(first)).resolves.toBeUndefined();
    expect(opfsBytes).toEqual(staleOpfs);
    first.rawDb.close();

    failOpfsWrite = false;
    const reloaded = await initializeDatabase();
    const rows = await reloaded.query(`SELECT value_json FROM app_settings WHERE key = 'divergence-proof'`);
    expect(rows).toEqual([{ value_json: '\"newer\"' }]);
    reloaded.rawDb.close();
  });
});
