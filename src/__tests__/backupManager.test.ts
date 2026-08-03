import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  encryptBackup,
  decryptBackup,
  upgradeBackupData,
  BackupStorageAdapter,
  LocalFileSystemAdapter,
  GoogleDriveAdapter,
  BackupManager,
  DEFAULT_BACKUP_SETTINGS,
  BackupSettings,
} from '../utils/backupManager';

// Mock localStorage for Vitest / Node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Backup & Encryption Engine Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. Encryption & Decryption Tests
  // ============================================================================
  describe('AES-256-GCM Encryption & Decryption', () => {
    const mockState = {
      accounts: [{ id: 'acc_1', name: 'Savings Account', balance: 5000, type: 'asset' }],
      transactions: [{ id: 'tx_1', amount: 150, category: 'Food', date: '2026-08-01' }],
      categories: ['Food', 'Housing'],
      currency: '$',
    };
    const jsonString = JSON.stringify(mockState);
    const testPassword = 'SecurePassword123!';

    it('should successfully encrypt and decrypt backup data with a valid password', async () => {
      const encrypted = await encryptBackup(jsonString, testPassword);
      expect(encrypted).toBeDefined();

      const parsedPayload = JSON.parse(encrypted);
      expect(parsedPayload.encrypted).toBe(true);
      expect(parsedPayload.algorithm).toBe('AES-256-GCM');
      expect(parsedPayload.version).toBe('v2.1_AES256');
      expect(parsedPayload.ciphertext).toBeDefined();
      expect(parsedPayload.salt).toBeDefined();
      expect(parsedPayload.iv).toBeDefined();
      expect(parsedPayload.metadata.accountCount).toBe(1);
      expect(parsedPayload.metadata.transactionCount).toBe(1);

      const decrypted = await decryptBackup(encrypted, testPassword);
      expect(decrypted).toBe(jsonString);
      expect(JSON.parse(decrypted)).toEqual(mockState);
    });

    it('should fail decryption when provided an invalid password', async () => {
      const encrypted = await encryptBackup(jsonString, testPassword);

      await expect(
        decryptBackup(encrypted, 'WrongPassword456!')
      ).rejects.toThrow('Invalid Password: Could not decrypt backup file');
    });

    it('should require a password before encrypting a backup', async () => {
      await expect(encryptBackup(jsonString)).rejects.toThrow(
        'A backup password is required to encrypt financial data.'
      );
    });

    it('should transparently return unencrypted legacy payload directly if unencrypted', async () => {
      const unencryptedJson = JSON.stringify({
        accounts: [{ id: 'acc_legacy', name: 'Cash', balance: 200 }],
        transactions: [],
      });

      const decrypted = await decryptBackup(unencryptedJson);
      expect(decrypted).toBe(unencryptedJson);
    });

    it('should throw an error for corrupted file format or invalid JSON', async () => {
      await expect(decryptBackup('invalid json content')).rejects.toThrow(
        'Corrupted file format: Unable to parse backup JSON.'
      );
    });
  });

  // ============================================================================
  // 2. Schema Migration Tests
  // ============================================================================
  describe('Schema Migration (upgradeBackupData)', () => {
    it('should upgrade mock v1 backup JSON to current v2 schema specifications', () => {
      const mockV1Backup = JSON.stringify({
        accounts: [
          {
            name: 'Personal Loan',
            type: 'liability',
            balance: 10000,
            original_principal: 12000,
            monthly_emi: 500,
            interest_rate: 8.5,
            tenure_months: 24,
            interest_calculation_type: 'REDUCING',
            payment_frequency: 'MONTHLY',
            loan_start_date: '2026-01-01',
          },
        ],
        transactions: [
          {
            amount: 500,
            type: 'expense',
            account_id: 'acc_123',
          },
        ],
      });

      const upgraded = upgradeBackupData(mockV1Backup);

      expect(upgraded).toBeDefined();
      expect(upgraded.lastUpdated).toBeDefined();
      expect(upgraded.currency).toBe('$');

      // Validate migrated account fields
      expect(upgraded.accounts.length).toBe(1);
      const acc = upgraded.accounts[0];
      expect(acc.id).toBeDefined();
      expect(acc.name).toBe('Personal Loan');
      expect(acc.balance).toBe(10000);
      expect(acc.originalPrincipal).toBe(12000);
      expect(acc.monthlyEMI).toBe(500);
      expect(acc.interestRate).toBe(8.5);
      expect(acc.tenureMonths).toBe(24);
      expect(acc.interestCalculationType).toBe('REDUCING');
      expect(acc.paymentFrequency).toBe('MONTHLY');
      expect(acc.loanStartDate).toBe('2026-01-01');
      expect(Array.isArray(acc.revisions)).toBe(true);

      // Validate migrated transaction fields
      expect(upgraded.transactions.length).toBe(1);
      const tx = upgraded.transactions[0];
      expect(tx.id).toBeDefined();
      expect(tx.amount).toBe(500);
      expect(tx.category).toBe('General');
      expect(tx.note).toBe('');

      // Validate default categories & credit cards added
      expect(upgraded.categories).toContain('Food & Dining');
      expect(Array.isArray(upgraded.creditCards)).toBe(true);
    });

    it('should handle wrapped data objects gracefully', () => {
      const wrappedV1 = JSON.stringify({
        data: {
          accounts: [{ name: 'Checking', balance: 1500 }],
          transactions: [],
        },
      });

      const upgraded = upgradeBackupData(wrappedV1);
      expect(upgraded.accounts.length).toBe(1);
      expect(upgraded.accounts[0].name).toBe('Checking');
    });

    it('should throw an error if JSON is malformed', () => {
      expect(() => upgradeBackupData('not json')).toThrow('Invalid JSON structure inside backup.');
    });
  });

  // ============================================================================
  // 3. Storage Adapters & Retention Policy Tests
  // ============================================================================
  describe('Storage Adapters & 5-File Retention Policy', () => {
    it('should authenticate successfully with LocalFileSystemAdapter and GoogleDriveAdapter', async () => {
      const localAdapter = new LocalFileSystemAdapter();
      const driveAdapter = new GoogleDriveAdapter();

      const localAuth = await localAdapter.authenticate();
      const driveAuth = await driveAdapter.authenticate();

      expect(localAuth).toBe(true);
      expect(driveAuth).toBe(true);
    });

    it('should enforce 5-file retention policy (pruneOldBackups) by keeping top 5 newest .enc files', async () => {
      const adapter = new LocalFileSystemAdapter();

      // Seed 7 mock backup files with different dates
      const mockFiles = [
        { date: '2026-08-01T10:00:00Z', name: 'backup_2026_08_01.enc', provider: 'LOCAL' },
        { date: '2026-07-31T10:00:00Z', name: 'backup_2026_07_31.enc', provider: 'LOCAL' },
        { date: '2026-07-30T10:00:00Z', name: 'backup_2026_07_30.enc', provider: 'LOCAL' },
        { date: '2026-07-29T10:00:00Z', name: 'backup_2026_07_29.enc', provider: 'LOCAL' },
        { date: '2026-07-28T10:00:00Z', name: 'backup_2026_07_28.enc', provider: 'LOCAL' },
        { date: '2026-07-27T10:00:00Z', name: 'backup_2026_07_27.enc', provider: 'LOCAL' },
        { date: '2026-07-26T10:00:00Z', name: 'backup_2026_07_26.enc', provider: 'LOCAL' },
      ];

      localStorage.setItem('coinbuddy_saved_backups', JSON.stringify(mockFiles));

      // Run pruning retention with maxFiles = 5
      await adapter.pruneOldBackups(5, 'LOCAL');

      const savedJson = localStorage.getItem('coinbuddy_saved_backups');
      expect(savedJson).not.toBeNull();

      const savedList = JSON.parse(savedJson!);
      expect(savedList.length).toBe(5);

      // Verify the 5 newest files are kept and oldest 2 (July 26 & July 27) are pruned
      const fileNames = savedList.map((f: any) => f.name);
      expect(fileNames).toContain('backup_2026_08_01.enc');
      expect(fileNames).toContain('backup_2026_07_31.enc');
      expect(fileNames).toContain('backup_2026_07_30.enc');
      expect(fileNames).toContain('backup_2026_07_29.enc');
      expect(fileNames).toContain('backup_2026_07_28.enc');
      expect(fileNames).not.toContain('backup_2026_07_27.enc');
      expect(fileNames).not.toContain('backup_2026_07_26.enc');
    });

    it('should upload a new backup and automatically prune older files to maintain at most 5 files', async () => {
      const adapter = new LocalFileSystemAdapter();

      // Upload 6 backups sequentially
      for (let i = 1; i <= 6; i++) {
        const payload = await encryptBackup(JSON.stringify({ accounts: [], transactions: [] }), 'retention-test-password');
        await adapter.uploadBackup(`backup_local_0${i}.enc`, payload, 'LOCAL');
      }

      const savedJson = localStorage.getItem('coinbuddy_saved_backups');
      const savedList = JSON.parse(savedJson!);

      expect(savedList.length).toBeLessThanOrEqual(5);
    }, 15000);
  });

  // ============================================================================
  // 4. Backup Manager & Watchdog Error Integration
  // ============================================================================
  describe('BackupManager Execution & Background Error Watchdog', () => {
    it('should reject a manual backup when no password has been set', async () => {
      await expect(BackupManager.executeManualBackup()).rejects.toThrow(
        'Set a backup password before creating an encrypted backup.'
      );
    });

    it('should execute manual backup successfully and update metadata', async () => {
      const state = { accounts: [{ id: '1', balance: 100 }], transactions: [] };
      localStorage.setItem('monthly-tracker-state', JSON.stringify(state));

      const metadata = await BackupManager.executeManualBackup('mypassword123', 'LOCAL');

      expect(metadata).toBeDefined();
      expect(metadata.syncStatus).toBe('UP_TO_DATE');
      expect(metadata.accountCount).toBe(1);
      expect(metadata.storageProvider).toBe('LOCAL');
      expect(metadata.filename).toContain('.enc');
    });

    it('should catch silent backup errors (e.g. authExpired) and mark syncStatus as FAILED with errorReason', async () => {
      const mockSettings: BackupSettings = {
        ...DEFAULT_BACKUP_SETTINGS,
        storageProvider: 'GOOGLE_DRIVE',
        isWifiOnly: false,
        hasPassword: true,
        backupPassword: 'watchdog-test-password',
        authExpired: true,
      };

      const result = await BackupManager.executeSilentBackup(mockSettings);

      expect(result).not.toBeNull();
      expect(result?.syncStatus).toBe('FAILED');
      expect(result?.errorReason).toContain('Authentication token for Google Drive has expired.');
      expect(result?.storageProvider).toBe('GOOGLE_DRIVE');
    });

    it('should return PENDING_NETWORK when offline and isWifiOnly is enabled', async () => {
      const mockSettings: BackupSettings = {
        ...DEFAULT_BACKUP_SETTINGS,
        storageProvider: 'GOOGLE_DRIVE',
        isWifiOnly: true,
      };

      // Mock navigator.onLine = false if defined
      if (typeof navigator !== 'undefined') {
        Object.defineProperty(navigator, 'onLine', {
          value: false,
          configurable: true,
        });
      }

      const result = await BackupManager.executeSilentBackup(mockSettings);
      expect(result?.syncStatus).toBe('PENDING_NETWORK');
    });
  });
});
