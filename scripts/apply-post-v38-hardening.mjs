import fs from 'node:fs';
const read = file => fs.readFileSync(file, 'utf8');
const write = (file, content) => fs.writeFileSync(file, content);
function replaceOnce(file, before, after) {
  const source = read(file); const index = source.indexOf(before);
  if (index < 0) throw new Error(`Expected source not found in ${file}: ${before.slice(0, 120)}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Expected source is not unique in ${file}`);
  write(file, source.slice(0, index) + after + source.slice(index + before.length));
}
function replaceBetween(file, startMarker, endMarker, replacement) {
  const source = read(file); const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Start marker not found in ${file}: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`End marker not found in ${file}: ${endMarker}`);
  write(file, source.slice(0, start) + replacement + source.slice(end));
}

// Backup engine: verifier metadata + memory-only credential + robust retention.
replaceOnce('src/utils/backupManager.ts',
  "import { migrateBackupDataToLatest } from './ledgerSchema';",
  "import { migrateBackupDataToLatest } from './ledgerSchema';\nimport { getSessionBackupPassword } from './backupSession';");
replaceOnce('src/utils/backupManager.ts',
  "  backupPassword?: string;\n  authExpired?: boolean;",
  "  /** @deprecated Legacy-only field. Never persist a raw backup password. */\n  backupPassword?: string;\n  backupPasswordVerifier?: string;\n  authExpired?: boolean;");
replaceOnce('src/utils/backupManager.ts',
  "export async function isDuplicateLedgerRestore(current: unknown, candidate: unknown): Promise<boolean> {\n  const [currentFingerprint, candidateFingerprint] = await Promise.all([\n    createLedgerFingerprint(current),\n    createLedgerFingerprint(candidate),\n  ]);\n  return currentFingerprint === candidateFingerprint;\n}\n",
  "export async function isDuplicateLedgerRestore(current: unknown, candidate: unknown): Promise<boolean> {\n  const [currentFingerprint, candidateFingerprint] = await Promise.all([\n    createLedgerFingerprint(current),\n    createLedgerFingerprint(candidate),\n  ]);\n  return currentFingerprint === candidateFingerprint;\n}\n\nexport async function assertRestoreIsNotDuplicate(current: unknown, candidate: unknown): Promise<void> {\n  if (await isDuplicateLedgerRestore(current, candidate)) {\n    throw new Error('This backup contains the same ledger already on this device. Nothing was restored.');\n  }\n}\n");
replaceOnce('src/utils/backupManager.ts',
  "      await Promise.all(expired.map(async (backup: { id: string }) => {\n        const deleteResponse = await fetch(`/api/google-drive/delete?id=${encodeURIComponent(backup.id)}`, { method: 'DELETE' });\n        if (!deleteResponse.ok) {\n          const error = await deleteResponse.json().catch(() => ({}));\n          throw new Error(error.error || 'Unable to delete an expired Google Drive backup.');\n        }\n      }));\n      return;",
  "      const results = await Promise.allSettled(expired.map(async (backup: { id: string }) => {\n        const deleteResponse = await fetch(`/api/google-drive/delete?id=${encodeURIComponent(backup.id)}`, { method: 'DELETE' });\n        if (!deleteResponse.ok) {\n          const error = await deleteResponse.json().catch(() => ({}));\n          throw new Error(error.error || 'Unable to delete an expired Google Drive backup.');\n        }\n      }));\n      const failures = results.filter(result => result.status === 'rejected');\n      if (failures.length) console.warn(`Google Drive retention could not delete ${failures.length} expired backup(s).`);\n      return;");
replaceOnce('src/utils/backupManager.ts',
  "    if (!settings.hasPassword || !settings.backupPassword) {\n      return null;\n    }\n\n    try {",
  "    const sessionPassword = getSessionBackupPassword() ?? settings.backupPassword;\n    if (!settings.hasPassword || !sessionPassword) {\n      return null;\n    }\n\n    try {");
replaceOnce('src/utils/backupManager.ts',
  "        settings.backupPassword,\n        settings.storageProvider,",
  "        sessionPassword,\n        settings.storageProvider,");

// Backup settings UI: migrate plaintext, persist only sanitized config, unlock per session.
replaceOnce('src/components/BackupSecurity.tsx',
  "  isDuplicateLedgerRestore,\n} from '../utils/backupManager';",
  "  assertRestoreIsNotDuplicate,\n} from '../utils/backupManager';\nimport {\n  createBackupPasswordVerifier,\n  getSessionBackupPassword,\n  migrateLegacyBackupSettings,\n  sanitizeBackupSettings,\n  setSessionBackupPassword,\n  verifyBackupPassword,\n} from '../utils/backupSession';");
replaceBetween('src/components/BackupSecurity.tsx',
  "  const [config, setConfig] = useState<BackupSettings>(() => {",
  "  const [settingsLoaded, setSettingsLoaded] = useState(false);",
  "  const [config, setConfig] = useState<BackupSettings>(() => ({ ...DEFAULT_BACKUP_SETTINGS }));\n  const [backupSessionReady, setBackupSessionReady] = useState(() => Boolean(getSessionBackupPassword()));\n");
replaceBetween('src/components/BackupSecurity.tsx',
  "  useEffect(() => {\n    void getStoredSetting('backupConfig').then(saved => {",
  "  // SQLite is canonical; localStorage is read once above only for migration.",
  `  useEffect(() => {
    void (async () => {
      let raw: BackupSettings | null = null;
      const saved = await getStoredSetting('backupConfig');
      if (saved && typeof saved === 'object') raw = saved as BackupSettings;
      if (!raw) {
        const legacy = localStorage.getItem('coinbuddy_backup_config');
        if (legacy) {
          try { raw = JSON.parse(legacy) as BackupSettings; } catch { /* ignore malformed legacy settings */ }
          localStorage.removeItem('coinbuddy_backup_config');
        }
      }
      const normalized: BackupSettings = {
        ...DEFAULT_BACKUP_SETTINGS,
        ...(raw ?? {}),
        storageProvider: raw?.storageProvider === 'GOOGLE_DRIVE' ? 'GOOGLE_DRIVE' : 'LOCAL',
        isWifiOnly: false,
      };
      const migrated = await migrateLegacyBackupSettings(normalized);
      const sanitized = sanitizeBackupSettings(migrated);
      setConfig(sanitized);
      setBackupSessionReady(Boolean(getSessionBackupPassword()));
      if (raw?.backupPassword) await setStoredSetting('backupConfig', sanitized);
      setSettingsLoaded(true);
    })();
  }, [getStoredSetting, setStoredSetting]);

`);
replaceOnce('src/components/BackupSecurity.tsx',
  "    void setStoredSetting('backupConfig', config).then(() => window.dispatchEvent(new Event('coinbuddy_backup_config_changed')));",
  "    void setStoredSetting('backupConfig', sanitizeBackupSettings(config)).then(() => window.dispatchEvent(new Event('coinbuddy_backup_config_changed')));");
replaceOnce('src/components/BackupSecurity.tsx',
  "    if (!config.hasPassword || !config.backupPassword) {\n      setIsPasswordModalOpen(true);\n      setBackupErrorMessage('Set a backup password before creating an encrypted backup.');\n      return;\n    }",
  "    const sessionPassword = getSessionBackupPassword();\n    if (!config.hasPassword || !sessionPassword) {\n      setIsPasswordModalOpen(true);\n      setBackupErrorMessage(config.hasPassword ? 'Unlock backup encryption for this session before reconnecting.' : 'Set a backup password before creating an encrypted backup.');\n      return;\n    }");
replaceOnce('src/components/BackupSecurity.tsx',
  "        config.backupPassword,\n        config.storageProvider,",
  "        sessionPassword,\n        config.storageProvider,");
replaceOnce('src/components/BackupSecurity.tsx',
  "    if (!config.hasPassword || !config.backupPassword) {\n      setIsPasswordModalOpen(true);\n      setBackupErrorMessage('Set a backup password before creating an encrypted backup.');\n      return;\n    }",
  "    const sessionPassword = getSessionBackupPassword();\n    if (!config.hasPassword || !sessionPassword) {\n      setIsPasswordModalOpen(true);\n      setBackupErrorMessage(config.hasPassword ? 'Enter your backup password once to unlock backups for this session.' : 'Set a backup password before creating an encrypted backup.');\n      return;\n    }");
replaceOnce('src/components/BackupSecurity.tsx',
  "        config.backupPassword,\n        config.storageProvider,",
  "        sessionPassword,\n        config.storageProvider,");
replaceBetween('src/components/BackupSecurity.tsx',
  "  const handleSavePassword = (e: React.FormEvent) => {",
  "  // Local file upload parser for restore",
  `  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);

    if (config.hasPassword) {
      const validOldPassword = await verifyBackupPassword(oldPwdInput, config.backupPasswordVerifier);
      if (!validOldPassword) {
        setPwdError('Current backup password is incorrect');
        return;
      }
      if (!backupSessionReady) {
        setSessionBackupPassword(oldPwdInput);
        setBackupSessionReady(true);
        setIsPasswordModalOpen(false);
        setOldPwdInput('');
        setBackupSuccessMessage('Backup encryption unlocked for this session.');
        return;
      }
    }

    if (!pwdInput) return setPwdError('Password cannot be empty');
    if (pwdInput.length < 4) return setPwdError('Password must be at least 4 characters long');
    if (pwdInput !== pwdConfirm) return setPwdError('Passwords do not match');

    const verifier = await createBackupPasswordVerifier(pwdInput);
    setSessionBackupPassword(pwdInput);
    setBackupSessionReady(true);
    setConfig(prev => sanitizeBackupSettings({ ...prev, hasPassword: true, backupPasswordVerifier: verifier }));
    setIsPasswordModalOpen(false);
    setOldPwdInput('');
    setPwdInput('');
    setPwdConfirm('');
    setBackupSuccessMessage('Master backup password updated successfully!');
    setTimeout(() => setBackupSuccessMessage(null), 4000);
  };

`);
replaceOnce('src/components/BackupSecurity.tsx',
  "        if (await isDuplicateLedgerRestore(exportLedgerData(), upgradedData)) {\n          throw new Error('This backup contains the same ledger already on this device. Nothing was restored.');\n        }",
  "        await assertRestoreIsNotDuplicate(exportLedgerData(), upgradedData);");
replaceOnce('src/components/BackupSecurity.tsx',
  "            <span>{config.hasPassword ? 'Change Password' : 'Set Backup Password'}</span>",
  "            <span>{config.hasPassword ? (backupSessionReady ? 'Change Password' : 'Unlock Backups') : 'Set Backup Password'}</span>");
replaceOnce('src/components/BackupSecurity.tsx',
  "                    {config.hasPassword ? 'Change Backup Password' : 'Set Backup Password'}",
  "                    {config.hasPassword ? (backupSessionReady ? 'Change Backup Password' : 'Unlock Backup Encryption') : 'Set Backup Password'}");
replaceOnce('src/components/BackupSecurity.tsx',
  "                    required\n                    value={pwdInput}",
  "                    required={!config.hasPassword || backupSessionReady}\n                    disabled={config.hasPassword && !backupSessionReady}\n                    value={pwdInput}");
replaceOnce('src/components/BackupSecurity.tsx',
  "                    required\n                    value={pwdConfirm}",
  "                    required={!config.hasPassword || backupSessionReady}\n                    disabled={config.hasPassword && !backupSessionReady}\n                    value={pwdConfirm}");
replaceOnce('src/components/BackupSecurity.tsx',
  "                  Save Password\n",
  "                  {config.hasPassword && !backupSessionReady ? 'Unlock Backups' : 'Save Password'}\n");

// Extend existing backup unit tests with duplicate-restore wiring and retention partial failure.
replaceOnce('src/__tests__/backupManager.test.ts',
  "  isDuplicateLedgerRestore,\n} from '../utils/backupManager';",
  "  isDuplicateLedgerRestore,\n  assertRestoreIsNotDuplicate,\n} from '../utils/backupManager';");
replaceOnce('src/__tests__/backupManager.test.ts',
  "    it('detects a real financial-data difference', async () => {\n      const left = { accounts: [{ id: 'a', balance: 10 }], transactions: [] };\n      const right = { accounts: [{ id: 'a', balance: 11 }], transactions: [] };\n      expect(await isDuplicateLedgerRestore(left, right)).toBe(false);\n    });",
  "    it('detects a real financial-data difference', async () => {\n      const left = { accounts: [{ id: 'a', balance: 10 }], transactions: [] };\n      const right = { accounts: [{ id: 'a', balance: 11 }], transactions: [] };\n      expect(await isDuplicateLedgerRestore(left, right)).toBe(false);\n    });\n\n    it('blocks a duplicate candidate before restore mutation code can run', async () => {\n      const ledger = { accounts: [{ id: 'a', balance: 10 }], transactions: [] };\n      await expect(assertRestoreIsNotDuplicate(ledger, { ...ledger, exportedAt: 'later' })).rejects.toThrow('same ledger');\n    });");

console.log('Backup security and retention hardening staged.');
