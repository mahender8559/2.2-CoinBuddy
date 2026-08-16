/**
 * BackupManager.ts
 * Core engine for AES-256-GCM encryption, schema migration, storage adapters,
 * and background auto-backup synchronization for CoinBuddy.
 */

import { base64ToUint8Array, bufferToBase64 } from './encoding';
import { migrateBackupDataToLatest } from './ledgerSchema';
import { getSessionBackupPassword } from './backupSession';

export interface BackupMetadata {
  date: string;
  /** ISO timestamp used for schedule decisions; `date` remains display-only. */
  completedAt?: string;
  verifiedAt?: string;
  filename: string;
  size: string;
  syncStatus: 'UP_TO_DATE' | 'PENDING_NETWORK' | 'NOT_CONFIGURED' | 'FAILED';
  errorReason?: string;
  accountCount: number;
  transactionCount: number;
  storageProvider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM';
}

export interface BackupSettings {
  isAutoBackupEnabled: boolean;
  backupFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  storageProvider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM';
  isWifiOnly: boolean;
  hasPassword: boolean;
  /** @deprecated Legacy-only field. Never persist a raw backup password. */
  backupPassword?: string;
  backupPasswordVerifier?: string;
  authExpired?: boolean;
  lastBackupMetadata?: BackupMetadata;
  /** Persisted so a remount or settings save cannot start another backup period early. */
  lastAutoBackupAttemptAt?: string;
}

export interface EncryptedPayload {
  version: string;
  encrypted: boolean;
  algorithm: string;
  salt: string; // Base64
  iv: string;   // Base64
  ciphertext: string; // Base64
  metadata: {
    date: string;
    accountCount: number;
    transactionCount: number;
    fingerprint: string;
  };
}

export interface DecryptResult {
  payload: string;
  legacy: boolean;
}

// Default Settings
export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  isAutoBackupEnabled: true,
  backupFrequency: 'DAILY',
  storageProvider: 'LOCAL',
  isWifiOnly: false,
  hasPassword: false,
};

const BACKUP_INTERVALS: Record<BackupSettings['backupFrequency'], number> = {
  DAILY: 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
  MONTHLY: 30 * 24 * 60 * 60 * 1000,
};

const VOLATILE_BACKUP_KEYS = new Set(['exportedAt', 'lastUpdated', 'completedAt', 'verifiedAt']);

function canonicalizeLedger(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map(canonicalizeLedger);
    if (normalized.every(item => item && typeof item === 'object')) {
      return normalized.sort((left: any, right: any) => String(left.id ?? left.event_id ?? '').localeCompare(String(right.id ?? right.event_id ?? '')));
    }
    return normalized;
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !VOLATILE_BACKUP_KEYS.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalizeLedger(child)]));
}

/** Content identity used to block duplicate restores even when filenames differ. */
export async function createLedgerFingerprint(ledger: unknown): Promise<string> {
  const canonical = JSON.stringify(canonicalizeLedger(ledger));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return bufferToBase64(new Uint8Array(digest));
}

export async function isDuplicateLedgerRestore(current: unknown, candidate: unknown): Promise<boolean> {
  const [currentFingerprint, candidateFingerprint] = await Promise.all([
    createLedgerFingerprint(current),
    createLedgerFingerprint(candidate),
  ]);
  return currentFingerprint === candidateFingerprint;
}

export async function assertRestoreIsNotDuplicate(current: unknown, candidate: unknown): Promise<void> {
  if (await isDuplicateLedgerRestore(current, candidate)) {
    throw new Error('This backup contains the same ledger already on this device. Nothing was restored.');
  }
}

export function getBackupIntervalMs(frequency: BackupSettings['backupFrequency']): number {
  return BACKUP_INTERVALS[frequency] ?? BACKUP_INTERVALS.DAILY;
}

/** Returns the next permitted automatic-backup time, using ISO dates where available. */
export function getNextAutoBackupAt(settings: BackupSettings, now = Date.now()): number {
  const lastAttempt = Date.parse(settings.lastAutoBackupAttemptAt || '');
  const lastSuccess = Date.parse(settings.lastBackupMetadata?.completedAt || settings.lastBackupMetadata?.date || '');
  const lastRun = Math.max(Number.isFinite(lastAttempt) ? lastAttempt : 0, Number.isFinite(lastSuccess) ? lastSuccess : 0);
  return lastRun ? lastRun + getBackupIntervalMs(settings.backupFrequency) : now;
}

/** Keep encrypted downloads opaque and give every platform exactly one .enc suffix. */
export function toEncryptedBackupFilename(filename: string): string {
  const basename = filename.trim().replace(/(?:\.(?:enc|json))+$/i, '');
  return `${basename || 'backup'}.enc`;
}

// ============================================================================
// 1. WEB CRYPTO AES-256-GCM ENCRYPTION & DECRYPTION ENGINE
// ============================================================================

/**
 * Derives a 256-bit AES-GCM key from password and salt using PBKDF2 (100,000 iterations)
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a raw JSON string using AES-256-GCM
 */
export async function encryptBackup(
  jsonString: string,
  password?: string
): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(jsonString);

  if (!password) {
    throw new Error('A backup password is required to encrypt financial data.');
  }
  const effectivePassword = password;

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(effectivePassword, salt);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );

  // Count accounts and transactions for metadata header
  let accountCount = 0;
  let transactionCount = 0;
  try {
    const parsed = JSON.parse(jsonString);
    accountCount = parsed.accounts?.length || 0;
    transactionCount = parsed.transactions?.length || 0;
  } catch (e) {}

  const payload: EncryptedPayload = {
    version: 'v2.1_AES256',
    encrypted: true,
    algorithm: 'AES-256-GCM',
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(ciphertextBuffer)),
    metadata: {
      date: new Date().toISOString(),
      accountCount,
      transactionCount,
      fingerprint: await createLedgerFingerprint(JSON.parse(jsonString)),
    },
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Decrypts an encrypted payload using AES-256-GCM.
 * Throws an error if password is incorrect or file is corrupted.
 */
export async function decryptBackup(
  payloadString: string,
  password?: string
): Promise<string> {
  let parsed: any;
  try {
    parsed = JSON.parse(payloadString);
  } catch (e) {
    throw new Error('Corrupted file format: Unable to parse backup JSON.');
  }
  // If it's a legacy unencrypted backup JSON directly containing state
  if (!parsed.encrypted && (parsed.accounts || parsed.transactions || parsed.categories)) {
    return payloadString;
  }

  // Handle encrypted payload
  if (!parsed.ciphertext || !parsed.salt || !parsed.iv) {
    // Check if wrapping object has data directly
    if (parsed.data && typeof parsed.data === 'string') {
      return decryptBackup(parsed.data, password);
    }
    throw new Error('Invalid backup file structure.');
  }

  if (!password) {
    throw new Error('A backup password is required to decrypt this backup.');
  }
  const effectivePassword = password;

  try {
    const salt = base64ToUint8Array(parsed.salt);
    const iv = base64ToUint8Array(parsed.iv);
    const ciphertext = base64ToUint8Array(parsed.ciphertext);

    const key = await deriveKey(effectivePassword, salt);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (err: any) {
    throw new Error('Invalid Password: Could not decrypt backup file. Please check your password.');
  }
}

// Backwards-compatible helper that returns payload + legacy flag
export async function decryptBackupWithFlag(payloadString: string, password?: string): Promise<DecryptResult> {
  let parsed: any;
  try {
    parsed = JSON.parse(payloadString);
  } catch (e) {
    throw new Error('Corrupted file format: Unable to parse backup JSON.');
  }

  if (!parsed.encrypted && (parsed.accounts || parsed.transactions || parsed.categories)) {
    return { payload: payloadString, legacy: true };
  }

  if (!parsed.ciphertext || !parsed.salt || !parsed.iv) {
    if (parsed.data && typeof parsed.data === 'string') {
      return decryptBackupWithFlag(parsed.data, password);
    }
    throw new Error('Invalid backup file structure.');
  }

  if (!password) throw new Error('A backup password is required to decrypt this backup.');

  const decrypted = await decryptBackup(payloadString, password);
  return { payload: decrypted, legacy: false };
}

// ============================================================================
// 2. SCHEMA MIGRATOR & DATABASE HYDRATOR
// ============================================================================

/**
 * Validates and migrates raw JSON data to current app schema specifications
 */
export function upgradeBackupData(rawJsonString: string, options?: { recomputeBalances?: boolean }): any {
  return migrateBackupDataToLatest(rawJsonString, options);
}

/**
 * Hydrates local storage with the upgraded data
 */
export function hydrateDatabase(upgradedData: any): void {
  localStorage.setItem('monthly-tracker-state', JSON.stringify(upgradedData));
}

export function dispatchLocalBackupNotification(title: string, body: string) {
  if (typeof window !== 'undefined') {
    // 1. Native browser Notification API
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/icon.png' });
      } catch (e) {}
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          try {
            new Notification(title, { body, icon: '/icon.png' });
          } catch (e) {}
        }
      });
    }

    // 2. Dispatch custom DOM event for instant UI reaction
    window.dispatchEvent(
      new CustomEvent('coinbuddy_backup_alert', {
        detail: { title, body }
      })
    );
  }
}

// ============================================================================
// 3. STORAGE ADAPTERS & BACKUP MANAGER ACTIONS
// ============================================================================

export interface IStorageAdapter {
  uploadBackup(filename: string, encryptedContent: string, provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM'): Promise<void>;
  listAvailableBackups(provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM'): Promise<any[]>;
  pruneOldBackups(maxFiles: number, provider?: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM'): Promise<void>;
  authenticate(provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM'): Promise<boolean>;
}

type BackupHistoryStore = { get: () => Promise<unknown>; set: (records: unknown[]) => Promise<void> };

export class BackupStorageAdapter {
  private static historyStore: BackupHistoryStore | null = null;

  static configureHistoryStore(store: BackupHistoryStore | null) { this.historyStore = store; }

  private static async readHistory(): Promise<any[]> {
    const stored = await this.historyStore?.get();
    if (Array.isArray(stored)) return stored;
    const legacy = localStorage.getItem('coinbuddy_saved_backups');
    if (!legacy) return [];
    try {
      const records = JSON.parse(legacy);
      if (Array.isArray(records)) {
        await this.historyStore?.set(records);
        if (this.historyStore) localStorage.removeItem('coinbuddy_saved_backups');
        return records;
      }
    } catch { /* ignore malformed legacy history */ }
    return [];
  }

  private static async writeHistory(records: any[]): Promise<void> {
    if (this.historyStore) await this.historyStore.set(records);
    else localStorage.setItem('coinbuddy_saved_backups', JSON.stringify(records));
  }
  /**
   * Uploads or stores backup file according to target provider
   */
  static async uploadBackup(
    filename: string,
    encryptedContent: string,
    provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM',
    downloadLocal: boolean = true
  ): Promise<void> {
    const encryptedFilename = toEncryptedBackupFilename(filename);
    if (provider === 'GOOGLE_DRIVE') {
      const response = await fetch('/api/google-drive/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-CoinBuddy-Filename': encodeURIComponent(encryptedFilename),
        },
        body: new Blob([encryptedContent], { type: 'application/octet-stream' }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Google Drive backup failed (HTTP ${response.status}).`);
      }
      await this.pruneOldBackups(5, provider);
      return;
    }

    // Save to virtual backup storage registry in localStorage for history list
    let savedBackups = await this.readHistory();

    let parsedMeta: any = {};
    try {
      const p = JSON.parse(encryptedContent);
      parsedMeta = p.metadata || {};
    } catch (e) {}

    const newRecord = {
      name: encryptedFilename,
      date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      size: `${(encryptedContent.length / 1024).toFixed(1)} KB`,
      accountsCount: parsedMeta.accountCount ?? 0,
      transactionsCount: parsedMeta.transactionCount ?? 0,
      provider,
      content: encryptedContent,
    };

    savedBackups.unshift(newRecord);
    
    // Save to local registry first
    await this.writeHistory(savedBackups);

    // Enforce 5-file retention policy
    await this.pruneOldBackups(5, provider);

    if (provider === 'LOCAL' && downloadLocal) {
      // Trigger browser file download if DOM is present
      if (typeof document !== 'undefined' && document.createElement) {
        const blob = new Blob([encryptedContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = encryptedFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } else if (provider === 'CUSTOM') {
      throw new Error('Custom cloud storage is not configured.');
    }
  }

  /**
   * Retention Policy Implementation:
   * Keeps the top N (default 5) newest backup files, deleting older .enc files from provider
   */
  static async pruneOldBackups(
    maxFiles: number = 5,
    provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'LOCAL'
  ): Promise<void> {
    if (provider === 'GOOGLE_DRIVE') {
      const response = await fetch('/api/google-drive/backups');
      if (!response.ok) throw new Error('Unable to list Google Drive backups for retention.');
      const { files = [] } = await response.json();
      const backups = [...files].sort((a: any, b: any) =>
        new Date(b.modifiedTime || 0).getTime() - new Date(a.modifiedTime || 0).getTime()
      );
      const expired = backups.slice(maxFiles);
      const results = await Promise.allSettled(expired.map(async (backup: { id: string }) => {
        const deleteResponse = await fetch(`/api/google-drive/delete?id=${encodeURIComponent(backup.id)}`, { method: 'DELETE' });
        if (!deleteResponse.ok) {
          const error = await deleteResponse.json().catch(() => ({}));
          throw new Error(error.error || 'Unable to delete an expired Google Drive backup.');
        }
      }));
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) console.warn(`Google Drive retention could not delete ${failures.length} expired backup(s).`);
      return;
    }

    let savedBackups = await this.readHistory();

    // Sort files by modified date descending (newest first)
    savedBackups.sort((a, b) => {
      const timeA = new Date(a.date || 0).getTime();
      const timeB = new Date(b.date || 0).getTime();
      return timeB - timeA;
    });

    // Keep top maxFiles (e.g., 5) newest files; prune older .enc files
    if (savedBackups.length > maxFiles) {
      savedBackups = savedBackups.slice(0, maxFiles);
    }

    await this.writeHistory(savedBackups);
  }

  /**
   * Simulates OAuth re-authentication flow with target storage provider
   */
  static async authenticate(provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM'): Promise<boolean> {
    if (provider === 'GOOGLE_DRIVE') {
      // Keep the storage adapter testable outside a browser; OAuth is only
      // initiated from the deployed web application.
      if (typeof window === 'undefined') return true;
      const status = await fetch('/api/google-drive/status').then(response => response.ok ? response.json() : { connected: false });
      if (!status.connected) {
        // Deliberately leave the SPA so Vercel invokes the OAuth function.
        window.location.href = '/api/google-drive/connect';
        return false;
      }
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    return true;
  }

  /**
   * Downloads or retrieves latest backup files list for restore
   */
  static async listAvailableBackups(provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM'): Promise<any[]> {
    if (provider === 'GOOGLE_DRIVE') {
      const response = await fetch('/api/google-drive/backups');
      if (!response.ok) return [];
      const result = await response.json();
      return (result.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        date: new Date(file.modifiedTime).toLocaleString(),
        size: `${(Number(file.size || 0) / 1024).toFixed(1)} KB`,
        accountsCount: 0,
        transactionsCount: 0,
      }));
    }
    const list = await this.readHistory();
    if (list.length > 0) return list.filter((b: any) => !b.provider || b.provider === provider || provider === 'LOCAL');

    return [];
  }
}

export class LocalFileSystemAdapter implements IStorageAdapter {
  async uploadBackup(filename: string, encryptedContent: string, provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'LOCAL'): Promise<void> {
    await BackupStorageAdapter.uploadBackup(filename, encryptedContent, provider);
  }
  async listAvailableBackups(provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'LOCAL'): Promise<any[]> {
    return BackupStorageAdapter.listAvailableBackups(provider);
  }
  async pruneOldBackups(maxFiles: number = 5, provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'LOCAL'): Promise<void> {
    await BackupStorageAdapter.pruneOldBackups(maxFiles, provider);
  }
  async authenticate(provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'LOCAL'): Promise<boolean> {
    return BackupStorageAdapter.authenticate(provider);
  }
}

export class GoogleDriveAdapter implements IStorageAdapter {
  async uploadBackup(filename: string, encryptedContent: string, provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'GOOGLE_DRIVE'): Promise<void> {
    await BackupStorageAdapter.uploadBackup(filename, encryptedContent, provider);
  }
  async listAvailableBackups(provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'GOOGLE_DRIVE'): Promise<any[]> {
    return BackupStorageAdapter.listAvailableBackups(provider);
  }
  async pruneOldBackups(maxFiles: number = 5, provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'GOOGLE_DRIVE'): Promise<void> {
    await BackupStorageAdapter.pruneOldBackups(maxFiles, provider);
  }
  async authenticate(provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'GOOGLE_DRIVE'): Promise<boolean> {
    return BackupStorageAdapter.authenticate(provider);
  }
}

export class BackupManager {
  /**
   * Generates backup JSON string from current local ledger database
   */
  static generateBackupJSON(ledgerData?: Record<string, unknown>): string {
    if (ledgerData) return JSON.stringify(ledgerData);
    const rawState = localStorage.getItem('monthly-tracker-state');
    if (rawState) return rawState;

    return JSON.stringify({
      accounts: [],
      transactions: [],
      categories: [],
      creditCards: [],
      widgets: [],
      loanRevisions: [],
      currency: 'INR',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Sequenced manual backup execution:
   * 1. generateBackupJSON()
   * 2. encryptBackup(json, password)
   * 3. adapter.uploadBackup(file, provider)
   * 4. returns updated metadata
   */
  static async executeManualBackup(
    password?: string,
    provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'LOCAL',
    ledgerData?: Record<string, unknown>,
    options: { downloadLocal?: boolean } = {},
  ): Promise<BackupMetadata> {
    if (!password) {
      throw new Error('Set a backup password before creating an encrypted backup.');
    }
    const jsonStr = this.generateBackupJSON(ledgerData);
    const encryptedPayload = await encryptBackup(jsonStr, password);
    const verificationPayload = await decryptBackup(encryptedPayload, password);
    if (verificationPayload !== jsonStr) throw new Error('Encrypted backup verification failed before storage.');

    const now = new Date();
    const dateFormatted = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const fileDateStr = now.toISOString().slice(0, 10).replace(/-/g, '_');
    const filename = toEncryptedBackupFilename(`backup_${fileDateStr}.enc`);
    const sizeStr = `${(encryptedPayload.length / 1024).toFixed(1)} KB`;

    let accCount = 0;
    let txCount = 0;
    try {
      const parsed = JSON.parse(jsonStr);
      accCount = parsed.accounts?.length || 0;
      txCount = parsed.transactions?.length || 0;
    } catch (e) {}

    await BackupStorageAdapter.uploadBackup(filename, encryptedPayload, provider, options.downloadLocal !== false);
    const stored = await BackupStorageAdapter.listAvailableBackups(provider);
    if (!stored.some((item: any) => item?.name === filename)) throw new Error('Backup storage verification failed: the new encrypted file could not be confirmed.');

    const metadata: BackupMetadata = {
      date: dateFormatted,
      completedAt: now.toISOString(),
      verifiedAt: new Date().toISOString(),
      filename,
      size: sizeStr,
      syncStatus: 'UP_TO_DATE',
      accountCount: accCount,
      transactionCount: txCount,
      storageProvider: provider,
    };

    return metadata;
  }

  /**
   * Background Error Watchdog:
   * Wraps executeSilentBackup adapter calls in try/catch.
   * On failure (auth expired, quota exceeded), sets syncStatus = 'FAILED', stores errorReason,
   * and dispatches a local push notification: 'Backup Failed: Tap to resolve.'
   */
  static async executeSilentBackup(settings: BackupSettings, ledgerData?: Record<string, unknown>): Promise<BackupMetadata | null> {
    // Browser/PWA code can reliably detect offline state, not whether the
    // connection is specifically Wi-Fi. Defer any cloud/local sync while offline.
    const isOffline =
      typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) {
      return {
        ...(settings.lastBackupMetadata || DEFAULT_BACKUP_SETTINGS.lastBackupMetadata!),
        syncStatus: 'PENDING_NETWORK',
      };
    }

    const sessionPassword = getSessionBackupPassword() ?? settings.backupPassword;
    if (!settings.hasPassword || !sessionPassword) {
      return null;
    }

    try {
      if (settings.authExpired) {
        throw new Error(`Authentication token for ${settings.storageProvider === 'GOOGLE_DRIVE' ? 'Google Drive' : settings.storageProvider} has expired. Reconnection required.`);
      }

      const metadata = await this.executeManualBackup(
        sessionPassword,
        settings.storageProvider,
        ledgerData,
        { downloadLocal: false },
      );
      return metadata;
    } catch (err: any) {
      const errorReason = err?.message || 'Storage provider authentication expired or storage quota exceeded.';
      
      // Dispatch Local Push Notification
      dispatchLocalBackupNotification('Backup Failed: Tap to resolve.', errorReason);

      const failedMetadata: BackupMetadata = {
        ...(settings.lastBackupMetadata || DEFAULT_BACKUP_SETTINGS.lastBackupMetadata!),
        syncStatus: 'FAILED',
        errorReason,
        storageProvider: settings.storageProvider,
      };

      return failedMetadata;
    }
  }
}
