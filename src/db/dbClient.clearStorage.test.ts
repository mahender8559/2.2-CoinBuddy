import { beforeEach, describe, expect, it } from 'vitest';
import { clearAppBrowserStorage } from './dbClient';

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
    setItem(key: string, value: string) { store.set(key, value); },
    removeItem(key: string) { store.delete(key); },
    clear() { store.clear(); },
    key(index: number) { return Array.from(store.keys())[index] ?? null; },
    get length() { return store.size; },
  } as Storage;
}

describe('clearAppBrowserStorage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: createStorageMock(),
    });
  });

  it('removes app-scoped local and session storage entries', () => {
    localStorage.setItem('coinbuddy_backup_config', '{}');
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('monthly-tracker-state', '{}');
    localStorage.setItem('coinbuddy_sqlite_db', 'legacy');
    localStorage.setItem('other-site-data', 'keep');
    sessionStorage.setItem('coinbuddy_drive_oauth_result', '{}');
    sessionStorage.setItem('other-session-data', 'keep');

    clearAppBrowserStorage();

    expect(localStorage.getItem('coinbuddy_backup_config')).toBeNull();
    expect(localStorage.getItem('coinbuddy_onboarding_seen')).toBeNull();
    expect(localStorage.getItem('monthly-tracker-state')).toBeNull();
    expect(localStorage.getItem('coinbuddy_sqlite_db')).toBeNull();
    expect(localStorage.getItem('other-site-data')).toBe('keep');
    expect(sessionStorage.getItem('coinbuddy_drive_oauth_result')).toBeNull();
    expect(sessionStorage.getItem('other-session-data')).toBe('keep');
  });
});
