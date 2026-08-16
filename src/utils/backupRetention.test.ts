import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupStorageAdapter } from './backupManager';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Google Drive backup retention', () => {
  it('attempts every expired deletion even when one delete fails', async () => {
    const deleteIds: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/google-drive/backups') {
        return new Response(JSON.stringify({ files: [
          { id: 'keep', modifiedTime: '2026-08-16T10:00:00Z' },
          { id: 'old-1', modifiedTime: '2026-08-15T10:00:00Z' },
          { id: 'old-2', modifiedTime: '2026-08-14T10:00:00Z' },
          { id: 'old-3', modifiedTime: '2026-08-13T10:00:00Z' },
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.startsWith('/api/google-drive/delete?') && init?.method === 'DELETE') {
        const id = new URL(`https://coinbuddy.local${url}`).searchParams.get('id') ?? '';
        deleteIds.push(id);
        if (id === 'old-2') return new Response(JSON.stringify({ error: 'temporary failure' }), { status: 503 });
        return new Response('{}', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(BackupStorageAdapter.pruneOldBackups(1, 'GOOGLE_DRIVE')).resolves.toBeUndefined();
    expect(deleteIds.sort()).toEqual(['old-1', 'old-2', 'old-3']);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('1 expired backup'));
  });
});
