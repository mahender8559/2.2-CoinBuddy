import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { BackupManager, BackupStorageAdapter, DEFAULT_BACKUP_SETTINGS, getNextAutoBackupAt, type BackupSettings } from '../utils/backupManager';
import {
  clearSessionBackupPassword,
  getSessionBackupPassword,
  migrateLegacyBackupSettings,
  sanitizeBackupSettings,
} from '../utils/backupSession';

function normalize(value: unknown): BackupSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_BACKUP_SETTINGS };
  const saved = value as BackupSettings;
  return {
    ...DEFAULT_BACKUP_SETTINGS,
    ...saved,
    storageProvider: saved.storageProvider === 'GOOGLE_DRIVE' ? 'GOOGLE_DRIVE' : 'LOCAL',
    isWifiOnly: false,
  };
}

export function BackupAutomationService() {
  const { exportLedgerData, getStoredSetting, setStoredSetting, isUnlocked, passcode } = useAppContext();
  const [config, setConfig] = useState<BackupSettings | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    const raw = normalize(await getStoredSetting('backupConfig'));
    const migrated = await migrateLegacyBackupSettings(raw);
    const sanitized = sanitizeBackupSettings(migrated);
    setConfig(sanitized);
    if (raw.backupPassword) await setStoredSetting('backupConfig', sanitized);
  }, [getStoredSetting, setStoredSetting]);

  useEffect(() => {
    BackupStorageAdapter.configureHistoryStore({ get: () => getStoredSetting('backupHistory'), set: records => setStoredSetting('backupHistory', records) });
    void reload();
    const onConfigChanged = () => { void reload(); };
    const onSessionChanged = () => setSessionVersion(value => value + 1);
    window.addEventListener('coinbuddy_backup_config_changed', onConfigChanged);
    window.addEventListener('coinbuddy_backup_session_changed', onSessionChanged);
    return () => {
      window.removeEventListener('coinbuddy_backup_config_changed', onConfigChanged);
      window.removeEventListener('coinbuddy_backup_session_changed', onSessionChanged);
      BackupStorageAdapter.configureHistoryStore(null);
    };
  }, [getStoredSetting, setStoredSetting, reload]);

  useEffect(() => {
    if (passcode && !isUnlocked && getSessionBackupPassword()) clearSessionBackupPassword();
  }, [isUnlocked, passcode]);

  useEffect(() => {
    if (!config?.isAutoBackupEnabled || !config.hasPassword || !getSessionBackupPassword()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const persist = async (next: BackupSettings) => {
      if (cancelled) return;
      const sanitized = sanitizeBackupSettings(next);
      setConfig(sanitized);
      await setStoredSetting('backupConfig', sanitized);
      window.dispatchEvent(new CustomEvent('coinbuddy_backup_status_changed', { detail: sanitized.lastBackupMetadata }));
    };

    const run = async () => {
      if (cancelled || inFlight.current) return;
      const now = Date.now();
      const nextAt = getNextAutoBackupAt(config, now);
      if (now < nextAt) {
        timer = setTimeout(() => { void run(); }, Math.max(1000, nextAt - now));
        return;
      }
      inFlight.current = true;
      const attempted: BackupSettings = { ...config, lastAutoBackupAttemptAt: new Date(now).toISOString() };
      try {
        const metadata = await BackupManager.executeSilentBackup(attempted, exportLedgerData());
        await persist({ ...attempted, lastBackupMetadata: metadata ?? attempted.lastBackupMetadata });
      } catch (error) {
        await persist({ ...attempted, lastBackupMetadata: { ...(attempted.lastBackupMetadata ?? DEFAULT_BACKUP_SETTINGS.lastBackupMetadata!), syncStatus: 'FAILED', errorReason: error instanceof Error ? error.message : String(error) } });
      } finally {
        inFlight.current = false;
      }
    };

    timer = setTimeout(() => { void run(); }, Math.max(1000, getNextAutoBackupAt(config) - Date.now()));
    const onOnline = () => {
      if (config.lastBackupMetadata?.syncStatus === 'PENDING_NETWORK') {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void run(); }, 1000);
      }
    };
    window.addEventListener('online', onOnline);
    return () => { cancelled = true; if (timer) clearTimeout(timer); window.removeEventListener('online', onOnline); };
  }, [config, exportLedgerData, setStoredSetting, sessionVersion]);

  return null;
}
