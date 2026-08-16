import { base64ToUint8Array, bufferToBase64 } from './encoding';

const VERIFIER_PREFIX = 'pbkdf2-sha256-v1';
const VERIFIER_ITERATIONS = 210_000;
let sessionBackupPassword: string | null = null;

export function setSessionBackupPassword(password: string): void {
  sessionBackupPassword = password || null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('coinbuddy_backup_session_changed'));
}

export function getSessionBackupPassword(): string | null {
  return sessionBackupPassword;
}

export function clearSessionBackupPassword(): void {
  sessionBackupPassword = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('coinbuddy_backup_session_changed'));
}

async function deriveVerifier(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return bufferToBase64(new Uint8Array(bits));
}

export async function createBackupPasswordVerifier(password: string): Promise<string> {
  if (!password) throw new Error('Backup password cannot be empty.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await deriveVerifier(password, salt, VERIFIER_ITERATIONS);
  return [VERIFIER_PREFIX, VERIFIER_ITERATIONS, bufferToBase64(salt), digest].join('$');
}

export async function verifyBackupPassword(password: string, verifier?: string): Promise<boolean> {
  if (!password || !verifier) return false;
  const [prefix, rawIterations, saltBase64, expected] = verifier.split('$');
  const iterations = Number(rawIterations);
  if (prefix !== VERIFIER_PREFIX || !Number.isFinite(iterations) || !saltBase64 || !expected) return false;
  try {
    const actual = await deriveVerifier(password, base64ToUint8Array(saltBase64), iterations);
    if (actual.length !== expected.length) return false;
    let mismatch = 0;
    for (let index = 0; index < actual.length; index += 1) mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
    return mismatch === 0;
  } catch {
    return false;
  }
}

export function sanitizeBackupSettings<T extends { backupPassword?: string }>(settings: T): T {
  const copy = { ...settings } as T;
  delete copy.backupPassword;
  return copy;
}

/** Migrates legacy settings without ever persisting the raw password again. */
export async function migrateLegacyBackupSettings<T extends {
  hasPassword: boolean;
  backupPassword?: string;
  backupPasswordVerifier?: string;
}>(settings: T): Promise<T> {
  const legacyPassword = settings.backupPassword;
  let migrated = sanitizeBackupSettings(settings);
  if (legacyPassword) {
    setSessionBackupPassword(legacyPassword);
    migrated = {
      ...migrated,
      hasPassword: true,
      backupPasswordVerifier: settings.backupPasswordVerifier || await createBackupPasswordVerifier(legacyPassword),
    };
  }
  return migrated;
}
