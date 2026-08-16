import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSessionBackupPassword,
  createBackupPasswordVerifier,
  getSessionBackupPassword,
  migrateLegacyBackupSettings,
  sanitizeBackupSettings,
  setSessionBackupPassword,
  verifyBackupPassword,
} from './backupSession';

describe('backup credential session', () => {
  beforeEach(() => clearSessionBackupPassword());

  it('verifies a password without persisting the raw value', async () => {
    const verifier = await createBackupPasswordVerifier('correct horse battery staple');
    expect(verifier).not.toContain('correct horse battery staple');
    expect(await verifyBackupPassword('correct horse battery staple', verifier)).toBe(true);
    expect(await verifyBackupPassword('wrong password', verifier)).toBe(false);
  });

  it('keeps the usable password in memory only', () => {
    setSessionBackupPassword('session-only-secret');
    expect(getSessionBackupPassword()).toBe('session-only-secret');
    clearSessionBackupPassword();
    expect(getSessionBackupPassword()).toBeNull();
  });

  it('sanitizes settings before persistence', () => {
    const sanitized = sanitizeBackupSettings({ hasPassword: true, backupPassword: 'plaintext', backupPasswordVerifier: 'verifier' });
    expect(sanitized).not.toHaveProperty('backupPassword');
    expect(sanitized.backupPasswordVerifier).toBe('verifier');
  });

  it('migrates a legacy plaintext setting into verifier plus memory session', async () => {
    const legacySettings: { hasPassword: boolean; backupPassword?: string; backupPasswordVerifier?: string } = { hasPassword: true, backupPassword: 'legacy-secret' };
    const migrated = await migrateLegacyBackupSettings(legacySettings);
    expect(migrated).not.toHaveProperty('backupPassword');
    expect(migrated.backupPasswordVerifier).toBeTruthy();
    expect(getSessionBackupPassword()).toBe('legacy-secret');
    expect(await verifyBackupPassword('legacy-secret', migrated.backupPasswordVerifier)).toBe(true);
  });
});
