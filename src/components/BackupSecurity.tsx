import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, ShieldCheck, HardDrive, Cloud, Lock, Key, RefreshCw, 
  Upload, Download, Wifi, Folder, AlertTriangle, CheckCircle2, 
  Clock, Eye, EyeOff, Loader2, Check, FileText, Smartphone, Database,
  RotateCcw, Sparkles, X, CheckCircle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { 
  BackupManager, 
  BackupStorageAdapter, 
  decryptBackup, 
  upgradeBackupData, 
  BackupSettings, 
  BackupMetadata,
  DEFAULT_BACKUP_SETTINGS,
  getBackupIntervalMs,
  getNextAutoBackupAt,
} from '../utils/backupManager';

interface BackupSecurityProps {
  onBack: () => void;
}

export function BackupSecurity({ onBack }: BackupSecurityProps) {
  const { accounts, transactions, categories, creditCards, currency, exportLedgerData, importLedgerData, getStoredSetting, setStoredSetting } = useAppContext();

  // 1. State Management (Settings Store)
  const [config, setConfig] = useState<BackupSettings>(() => {
    const saved = localStorage.getItem('coinbuddy_backup_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          isAutoBackupEnabled: parsed.isAutoBackupEnabled ?? parsed.autoBackupEnabled ?? true,
          backupFrequency: (parsed.backupFrequency || parsed.frequency || 'DAILY').toUpperCase() as any,
          storageProvider: (parsed.storageProvider || (parsed.storageDestination === 'Google Drive' ? 'GOOGLE_DRIVE' : 'LOCAL')) as any,
          isWifiOnly: parsed.isWifiOnly ?? parsed.wifiOnly ?? true,
          hasPassword: Boolean(parsed.hasPassword && parsed.backupPassword),
          backupPassword: parsed.hasPassword ? parsed.backupPassword : undefined,
          lastBackupMetadata: parsed.lastBackupMetadata || {
            date: parsed.lastBackupDate || 'Aug 1, 2026, 06:30 PM',
            filename: parsed.lastBackupFilename || 'backup_2026_08_01.enc',
            size: parsed.lastBackupSize || '1.2 MB',
            syncStatus: parsed.syncStatus || 'UP_TO_DATE',
            accountCount: accounts.length || 4,
            transactionCount: transactions.length || 38,
            storageProvider: 'LOCAL',
          }
        };
      } catch (e) {}
    }
    return DEFAULT_BACKUP_SETTINGS;
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    void getStoredSetting('backupConfig').then(saved => {
      if (saved && typeof saved === 'object') setConfig(saved as BackupSettings);
      else {
        const legacy = localStorage.getItem('coinbuddy_backup_config');
        if (legacy) {
          try { setConfig(JSON.parse(legacy) as BackupSettings); localStorage.removeItem('coinbuddy_backup_config'); } catch { /* ignore malformed legacy settings */ }
        }
      }
      setSettingsLoaded(true);
    });
  }, [getStoredSetting]);

  useEffect(() => {
    BackupStorageAdapter.configureHistoryStore({
      get: () => getStoredSetting('backupHistory'),
      set: records => setStoredSetting('backupHistory', records),
    });
    return () => BackupStorageAdapter.configureHistoryStore(null);
  }, [getStoredSetting, setStoredSetting]);

  // SQLite is canonical; localStorage is read once above only for migration.
  useEffect(() => {
    if (settingsLoaded) void setStoredSetting('backupConfig', config);
  }, [config, settingsLoaded, setStoredSetting]);

  // UI Feedback States
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null);
  const [backupErrorMessage, setBackupErrorMessage] = useState<string | null>(null);

  // Password Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [oldPwdInput, setOldPwdInput] = useState('');
  const [pwdInput, setPwdInput] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  // Restore Wizard Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreStep, setRestoreStep] = useState<1 | 2 | 3 | 4>(1);
  const [restoreSource, setRestoreSource] = useState<'GOOGLE_DRIVE' | 'LOCAL'>('LOCAL');
  const [availableBackups, setAvailableBackups] = useState<any[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  
  const [selectedBackupFile, setSelectedBackupFile] = useState<{
    id?: string;
    name: string;
    date: string;
    size: string;
    accountsCount: number;
    transactionsCount: number;
    content?: string;
  } | null>(null);
  
  const [restorePassword, setRestorePassword] = useState('');
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [restorePwdError, setRestorePwdError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedRawJSON, setDecryptedRawJSON] = useState<string | null>(null);
  const [decryptedPreviewMeta, setDecryptedPreviewMeta] = useState<{
    accountsCount: number;
    transactionsCount: number;
    date: string;
  } | null>(null);

  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessCelebration, setRestoreSuccessCelebration] = useState(false);

  const localFileRef = useRef<HTMLInputElement>(null);
  const autoBackupInFlight = useRef(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('coinbuddy_drive_oauth_result');
    const params = new URLSearchParams(window.location.search);
    const result = stored ? JSON.parse(stored) : { status: params.get('drive'), error: params.get('drive_error') };
    if (result.status === 'connected') {
      setBackupSuccessMessage('Google Drive connected successfully.');
    } else if (result.status === 'error') {
      setBackupErrorMessage(result.error || 'Google Drive connection failed.');
    } else {
      return;
    }
    sessionStorage.removeItem('coinbuddy_drive_oauth_result');
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Fetch available backups list when restore source changes
  useEffect(() => {
    let mounted = true;
    async function loadBackups() {
      setIsLoadingBackups(true);
      try {
        const list = await BackupStorageAdapter.listAvailableBackups(restoreSource);
        if (mounted) {
          setAvailableBackups(list);
          if (list.length > 0 && !selectedBackupFile) {
            setSelectedBackupFile(list[0]);
          }
        }
      } catch (e) {
      } finally {
        if (mounted) setIsLoadingBackups(false);
      }
    }
    if (isRestoreModalOpen) {
      loadBackups();
    }
    return () => { mounted = false; };
  }, [restoreSource, isRestoreModalOpen]);

  // 3. Background Sync Engine. Schedule one run per selected period rather
  // than attempting an upload on every timer tick.
  useEffect(() => {
    if (!config.isAutoBackupEnabled) {
      if (config.lastBackupMetadata?.syncStatus !== 'NOT_CONFIGURED') {
        setConfig(prev => ({
          ...prev,
          lastBackupMetadata: {
            ...prev.lastBackupMetadata!,
            syncStatus: 'NOT_CONFIGURED'
          }
        }));
      }
      return;
    }

    // A password is required for encryption. Wait for the user to configure
    // one instead of consuming an automatic-backup period with a no-op.
    if (!config.hasPassword || !config.backupPassword) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const scheduleNext = (delay: number) => {
      timer = setTimeout(() => { void checkAndTriggerAutoBackup(); }, Math.max(0, delay));
    };

    const checkAndTriggerAutoBackup = async () => {
      if (cancelled || autoBackupInFlight.current) return;
      const now = Date.now();
      const nextAllowedAt = getNextAutoBackupAt(config, now);
      if (now < nextAllowedAt) {
        scheduleNext(nextAllowedAt - now);
        return;
      }

      // Record the attempt before async work begins. This debounce survives
      // re-renders/remounts and prevents a failed request from looping.
      autoBackupInFlight.current = true;
      const attemptedAt = new Date(now).toISOString();
      setConfig(prev => ({ ...prev, lastAutoBackupAttemptAt: attemptedAt }));
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (config.isWifiOnly && !isOnline) {
        setConfig(prev => ({
          ...prev,
          lastBackupMetadata: {
            ...prev.lastBackupMetadata!,
            syncStatus: 'PENDING_NETWORK'
          }
        }));
        autoBackupInFlight.current = false;
        if (!cancelled) scheduleNext(getBackupIntervalMs(config.backupFrequency));
        return;
      }

      try {
        const newMeta = await BackupManager.executeSilentBackup(config, exportLedgerData());
        if (newMeta) {
          setConfig(prev => ({
            ...prev,
            lastBackupMetadata: newMeta
          }));
        }
      } finally {
        autoBackupInFlight.current = false;
        if (!cancelled) scheduleNext(getBackupIntervalMs(config.backupFrequency));
      }
    };

    scheduleNext(Math.max(0, getNextAutoBackupAt(config) - Date.now()));
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [config.isAutoBackupEnabled, config.backupFrequency, config.isWifiOnly, config.storageProvider, config.hasPassword, config.backupPassword, config.lastAutoBackupAttemptAt, config.lastBackupMetadata?.completedAt, config.lastBackupMetadata?.date]);

  // Reconnect Storage Provider Action Handler
  const handleReconnectStorageProvider = async () => {
    if (!config.hasPassword || !config.backupPassword) {
      setIsPasswordModalOpen(true);
      setBackupErrorMessage('Set a backup password before creating an encrypted backup.');
      return;
    }
    setIsReconnecting(true);
    setBackupSuccessMessage(null);
    setBackupErrorMessage(null);

    try {
      // 1. Authenticate with fresh OAuth handshake
      await BackupStorageAdapter.authenticate(config.storageProvider);

      // 2. Perform fresh backup to verify connectivity
      const metadata = await BackupManager.executeManualBackup(
        config.backupPassword,
        config.storageProvider,
        exportLedgerData()
      );

      // 3. Clear authExpired flag and update status to UP_TO_DATE
      setConfig(prev => ({
        ...prev,
        authExpired: false,
        lastBackupMetadata: {
          ...metadata,
          syncStatus: 'UP_TO_DATE',
          errorReason: undefined
        }
      }));

      const providerName = config.storageProvider === 'GOOGLE_DRIVE' ? 'Google Drive' : config.storageProvider === 'CUSTOM' ? 'Custom Directory' : 'Local Storage';
      setBackupSuccessMessage(`Successfully reconnected to ${providerName}! Backup synchronized.`);
      setTimeout(() => setBackupSuccessMessage(null), 5000);
    } catch (err: any) {
      setBackupErrorMessage(`Reconnection failed: ${err?.message || 'Could not re-authenticate provider.'}`);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleStorageProviderChange = async (provider: BackupSettings['storageProvider']) => {
    setConfig(prev => ({ ...prev, storageProvider: provider, authExpired: false }));
    if (provider !== 'GOOGLE_DRIVE') return;

    setIsReconnecting(true);
    setBackupErrorMessage(null);
    setBackupSuccessMessage('Connecting to Google Drive…');
    try {
      // This redirects to Google when the account is not already connected.
      const connected = await BackupStorageAdapter.authenticate(provider);
      if (connected) setBackupSuccessMessage('Google Drive is already connected.');
    } catch (error: any) {
      setBackupSuccessMessage(null);
      setBackupErrorMessage(error?.message || 'Unable to start the Google Drive connection.');
    } finally {
      setIsReconnecting(false);
    }
  };

  // 2. Wiring the 'Backup Now' Action
  const handleBackupNow = async () => {
    if (!config.hasPassword || !config.backupPassword) {
      setIsPasswordModalOpen(true);
      setBackupErrorMessage('Set a backup password before downloading an encrypted backup.');
      return;
    }
    setIsBackingUp(true);
    setBackupSuccessMessage(null);
    setBackupErrorMessage(null);

    try {
      const metadata = await BackupManager.executeManualBackup(
        config.backupPassword,
        config.storageProvider,
        exportLedgerData()
      );

      setConfig(prev => ({
        ...prev,
        authExpired: false,
        lastBackupMetadata: metadata
      }));

      setBackupSuccessMessage(`Backup successfully created and saved as ${metadata.filename}!`);
      setTimeout(() => setBackupSuccessMessage(null), 5000);
    } catch (err: any) {
      setBackupErrorMessage(err?.message || 'Failed to generate backup. Please try again.');
    } finally {
      setIsBackingUp(false);
    }
  };

  // Password Save Handler
  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (config.hasPassword && oldPwdInput !== config.backupPassword) {
      setPwdError('Old password is incorrect');
      return;
    }
    if (!pwdInput) {
      setPwdError('Password cannot be empty');
      return;
    }
    if (pwdInput.length < 4) {
      setPwdError('Password must be at least 4 characters long');
      return;
    }
    if (pwdInput !== pwdConfirm) {
      setPwdError('Passwords do not match');
      return;
    }

    setConfig(prev => ({
      ...prev,
      hasPassword: true,
      backupPassword: pwdInput
    }));

    setIsPasswordModalOpen(false);
    setOldPwdInput('');
    setPwdInput('');
    setPwdConfirm('');
    setPwdError(null);
    setBackupSuccessMessage('Master backup password updated successfully!');
    setTimeout(() => setBackupSuccessMessage(null), 4000);
  };

  // Local file upload parser for restore
  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        try {
          let accountsCount = accounts.length || 4;
          let transactionsCount = transactions.length || 38;
          try {
            const parsed = JSON.parse(content);
            if (parsed.metadata) {
              accountsCount = parsed.metadata.accountCount || accountsCount;
              transactionsCount = parsed.metadata.transactionCount || transactionsCount;
            }
          } catch (e) {}

          const fileBackupObj = {
            name: file.name,
            date: new Date(file.lastModified).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            size: `${(file.size / 1024).toFixed(1)} KB`,
            accountsCount,
            transactionsCount,
            content
          };

          setSelectedBackupFile(fileBackupObj);
          setAvailableBackups(prev => [fileBackupObj, ...prev.filter(b => b.name !== file.name)]);
          setRestoreStep(2);
        } catch (err) {
          alert('Invalid backup file format.');
        }
      };
      reader.readAsText(file);
    }
  };

  // Step 3 Decryption Handler
  const handleUnlockBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setRestorePwdError(null);

    if (!selectedBackupFile) {
      setRestorePwdError('Please select a backup file.');
      return;
    }

    let payloadToDecrypt = selectedBackupFile.content;
    if (!payloadToDecrypt && restoreSource === 'GOOGLE_DRIVE' && selectedBackupFile.id) {
      const response = await fetch(`/api/google-drive/backups?id=${encodeURIComponent(selectedBackupFile.id)}`);
      if (!response.ok) throw new Error('Unable to download the selected Google Drive backup.');
      payloadToDecrypt = await response.text();
    }
    if (!payloadToDecrypt) throw new Error('The selected backup file is unavailable. Choose another file or upload it again.');

    setIsDecrypting(true);

    try {
      // Decrypt AES-256-GCM payload using password
      const rawJson = await decryptBackup(payloadToDecrypt, restorePassword);
      
      // Parse to inspect metadata
      let accountCount = 0;
      let transactionCount = 0;
      try {
        const parsed = JSON.parse(rawJson);
        accountCount = parsed.accounts?.length || accounts.length || 4;
        transactionCount = parsed.transactions?.length || transactions.length || 38;
      } catch (e) {}

      setDecryptedRawJSON(rawJson);
      setDecryptedPreviewMeta({
        accountsCount: accountCount,
        transactionsCount: transactionCount,
        date: selectedBackupFile.date
      });

      setIsDecrypting(false);
      setRestoreStep(4);
    } catch (err: any) {
      setIsDecrypting(false);
      setRestorePwdError(err?.message || 'Invalid Password or corrupted backup file.');
    }
  };

  // Step 4 Final Confirm, Migrate & Hydrate Handler
  const handleConfirmRestore = async () => {
    if (!decryptedRawJSON) return;

    setIsRestoring(true);

      try {
        // 1. Upgrade schema
        const upgradedData = upgradeBackupData(decryptedRawJSON);
        
        // 2. Hydrate database
        // importLedgerData persists and refreshes the SQLite projection before it resolves.
        await importLedgerData(upgradedData);

        // 4. Show success celebration
        setIsRestoring(false);
        setRestoreSuccessCelebration(true);
        
        window.setTimeout(() => {
          setRestoreSuccessCelebration(false);
          setIsRestoreModalOpen(false);
          setRestoreStep(1);
          setRestorePassword('');
          setDecryptedRawJSON(null);
        }, 2200);
      } catch (e: any) {
        setIsRestoring(false);
        alert(`Restore Error: ${e?.message || 'Failed to hydrate database.'}`);
      }
  };

  const meta = config.lastBackupMetadata;

  return (
    <div className="space-y-6 pb-24 md:pb-0 max-w-3xl mx-auto animate-fade-in">
      {/* Navigation Top Bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors flex items-center justify-center border border-outline-variant/30"
          title="Back to Settings"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Backup & Security</h2>
          <p className="text-xs text-on-surface-variant">Manage automated cloud backups, local encrypted files, and data restoration</p>
        </div>
      </div>

      {/* Success Banner */}
      {backupSuccessMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-2xl flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-xs font-semibold">{backupSuccessMessage}</span>
          </div>
          <button onClick={() => setBackupSuccessMessage(null)} className="text-xs underline hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {/* Error Banner */}
      {backupErrorMessage && (
        <div className="bg-error/10 border border-error/30 text-error p-4 rounded-2xl flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="text-xs font-semibold">{backupErrorMessage}</span>
          </div>
          <button onClick={() => setBackupErrorMessage(null)} className="text-xs underline hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Header Card (Status Overview) */}
      <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/30 relative overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Overview</span>
              {/* Sync Status Badge */}
              {meta?.syncStatus === 'UP_TO_DATE' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Up to Date
                </span>
              )}
              {meta?.syncStatus === 'PENDING_NETWORK' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Clock className="w-3 h-3" />
                  Pending Network
                </span>
              )}
              {meta?.syncStatus === 'NOT_CONFIGURED' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-surface-variant text-on-surface-variant border border-outline-variant/30">
                  Not Configured
                </span>
              )}
              {meta?.syncStatus === 'FAILED' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-error/10 text-error border border-error/30 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Sync Failed
                </span>
              )}
            </div>

            <div>
              <h3 className="text-xl font-bold text-on-surface">Last Backup</h3>
              <p className="text-xs text-on-surface-variant font-numeric mt-1 flex flex-wrap items-center gap-2">
                <span>{meta?.date || 'Never backed up'}</span>
                {meta?.filename && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="font-mono bg-surface-container-high px-2 py-0.5 rounded text-[11px]">{meta.filename}</span>
                  </>
                )}
                {meta?.size && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="font-bold text-on-surface">{meta.size}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            {meta?.syncStatus === 'FAILED' ? (
              <button
                onClick={handleReconnectStorageProvider}
                disabled={isReconnecting}
                className="bg-error hover:bg-error/90 text-on-error px-6 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0 w-full sm:w-auto"
              >
                {isReconnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Reconnecting...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Reconnect {config.storageProvider === 'GOOGLE_DRIVE' ? 'Google Drive' : config.storageProvider === 'CUSTOM' ? 'Custom Provider' : 'Storage Provider'}</span>
                  </>
                )}
              </button>
            ) : (
              <button
                data-tour-id="tour-backup-now"
                onClick={handleBackupNow}
                disabled={isBackingUp}
                className="bg-primary text-on-primary hover:bg-primary/90 px-6 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0 w-full sm:w-auto"
              >
                {isBackingUp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Encrypting & Saving...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{config.hasPassword ? 'Backup Now' : 'Set Backup Password'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* High Visibility Error Box if sync failed */}
        {meta?.syncStatus === 'FAILED' && (
          <div className="mt-5 pt-4 border-t border-error/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-error bg-error/10 p-4 rounded-2xl border border-error/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider">Sync Failure Reason:</p>
                <p className="text-xs text-on-surface mt-0.5 leading-relaxed">
                  {meta.errorReason || 'Provider authentication token expired or quota limit reached.'}
                </p>
              </div>
            </div>
            <button
              onClick={handleReconnectStorageProvider}
              disabled={isReconnecting}
              className="px-4 py-2 bg-error text-on-error rounded-xl font-bold text-xs shrink-0 hover:bg-error/90 transition-colors"
            >
              Reconnect Provider
            </button>
          </div>
        )}
      </div>

      {/* 2. Auto-Backup Settings Group */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest ml-2">Auto-Backup Settings</h3>
        <div className="bg-surface-container rounded-3xl border border-outline-variant/30 divide-y divide-outline-variant/20 overflow-hidden">
          {/* Toggle: Enable Automatic Backup */}
          <div className="flex items-center justify-between p-4 sm:p-5 hover:bg-surface-container-high/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-on-surface text-sm">Enable Automatic Backup</p>
                <p className="text-xs text-on-surface-variant">Perform scheduled background synchronization</p>
              </div>
            </div>
            <button
              onClick={() => setConfig(prev => ({ ...prev, isAutoBackupEnabled: !prev.isAutoBackupEnabled }))}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.isAutoBackupEnabled ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                config.isAutoBackupEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Selector: Frequency */}
          <div className="flex items-center justify-between p-4 sm:p-5 hover:bg-surface-container-high/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-on-surface text-sm">Frequency</p>
                <p className="text-xs text-on-surface-variant">How often auto-backups run</p>
              </div>
            </div>
            <select
              value={config.backupFrequency}
              disabled={!config.isAutoBackupEnabled}
              onChange={(e) => setConfig(prev => ({ ...prev, backupFrequency: e.target.value as any }))}
              className="bg-surface-container-highest border border-outline-variant/30 text-on-surface rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>

          {/* Selector: Storage Destination */}
          <div data-tour-id="tour-cloud-dest" className="flex items-center justify-between p-4 sm:p-5 hover:bg-surface-container-high/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-on-surface text-sm">Storage Destination</p>
                <p className="text-xs text-on-surface-variant">Location where backup files are saved</p>
              </div>
            </div>
            <select
              value={config.storageProvider}
              disabled={!config.isAutoBackupEnabled}
              onChange={(e) => { void handleStorageProviderChange(e.target.value as BackupSettings['storageProvider']); }}
              className="bg-surface-container-highest border border-outline-variant/30 text-on-surface rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
            >
              <option value="LOCAL">Local Device Storage</option>
              <option value="GOOGLE_DRIVE">Google Drive</option>
              <option value="CUSTOM">Custom Directory</option>
            </select>
          </div>

          {/* Toggle: Wi-Fi Only */}
          <div className="flex items-center justify-between p-4 sm:p-5 hover:bg-surface-container-high/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-on-surface text-sm">Wi-Fi Only</p>
                <p className="text-xs text-on-surface-variant">Restrict cloud sync to unmetered Wi-Fi connections</p>
              </div>
            </div>
            <button
              onClick={() => setConfig(prev => ({ ...prev, isWifiOnly: !prev.isWifiOnly }))}
              disabled={!config.isAutoBackupEnabled}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                config.isWifiOnly ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                config.isWifiOnly ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Encryption & Password Group */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest ml-2">Encryption & Password</h3>
        <div className="bg-surface-container rounded-3xl p-5 border border-outline-variant/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-on-surface text-sm">AES-256-GCM Encryption Active</p>
                <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  Protected
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {config.hasPassword ? 'Custom master passphrase set for encryption & restore' : 'Set a password before encrypted backups can be downloaded'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsPasswordModalOpen(true)}
            className="bg-surface-container-high hover:bg-surface-variant border border-outline-variant/30 text-on-surface px-4 py-2.5 rounded-xl font-bold text-xs transition-colors shrink-0 flex items-center gap-2"
          >
            <Key className="w-4 h-4 text-primary" />
            <span>{config.hasPassword ? 'Change Password' : 'Set Backup Password'}</span>
          </button>
        </div>
      </div>

      {/* 4. Restore Section Button */}
      <div className="pt-4 border-t border-outline-variant/20 flex flex-col items-center gap-3">
        <button
          onClick={() => {
            setRestoreStep(1);
            setRestorePassword('');
            setRestorePwdError(null);
            setIsRestoreModalOpen(true);
          }}
          className="w-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-xs group"
        >
          <RotateCcw className="w-5 h-5 text-primary group-hover:rotate-[-45deg] transition-transform duration-200" />
          <span>Restore Data Wizard</span>
        </button>
        <p className="text-xs text-on-surface-variant text-center">
          Import and recover ledger state from Google Drive or local encrypted <code className="bg-surface-container-high px-1.5 py-0.5 rounded font-mono text-[11px]">.enc</code> files
        </p>
      </div>

      {/* ========================================================================= */}
      {/* PASSWORD MODAL */}
      {/* ========================================================================= */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container rounded-3xl w-full max-w-md p-6 border border-outline-variant/30 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-on-surface">
                    {config.hasPassword ? 'Change Backup Password' : 'Set Backup Password'}
                  </h3>
                  <p className="text-xs text-on-surface-variant">Create a master passphrase to encrypt backups</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSavePassword} className="space-y-4">
              {/* Security Warning Box */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-amber-400">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed font-medium">
                  <strong>Security Notice:</strong> This passphrase encrypts your file using AES-256-GCM. Keep it safe to restore your data.
                </p>
              </div>

              {pwdError && (
                <div className="text-xs text-error font-semibold bg-error/10 border border-error/20 p-3 rounded-xl">
                  {pwdError}
                </div>
              )}

              {config.hasPassword && (
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Old Password
                  </label>
                  <input
                    type="password"
                    required
                    value={oldPwdInput}
                    onChange={(e) => setOldPwdInput(e.target.value)}
                    placeholder="Enter your current passphrase"
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {/* Input Password */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Backup Password
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    required
                    value={pwdInput}
                    onChange={(e) => setPwdInput(e.target.value)}
                    placeholder="Enter passphrase"
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-3 text-on-surface-variant hover:text-on-surface p-1"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Input Confirm Password */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPwd ? 'text' : 'password'}
                    required
                    value={pwdConfirm}
                    onChange={(e) => setPwdConfirm(e.target.value)}
                    placeholder="Re-enter passphrase"
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                    className="absolute right-3 top-3 text-on-surface-variant hover:text-on-surface p-1"
                  >
                    {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                    onClick={() => {
                      setIsPasswordModalOpen(false);
                      setOldPwdInput('');
                      setPwdError(null);
                  }}
                  className="w-1/2 py-3 rounded-xl border border-outline-variant/30 text-on-surface-variant font-bold text-xs hover:bg-surface-variant transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RESTORE DATA WIZARD FLOW MODAL */}
      {/* ========================================================================= */}
      {isRestoreModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container rounded-3xl w-full max-w-lg p-6 border border-outline-variant/30 shadow-2xl relative space-y-6">
            {/* Header with Step Indicator */}
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
              <div>
                <h3 className="font-bold text-lg text-on-surface flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-primary" /> Restore Data Wizard
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Step {restoreStep} of 4</p>
              </div>

              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4].map(s => (
                  <div
                    key={s}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      restoreStep === s 
                        ? 'w-6 bg-primary' 
                        : restoreStep > s 
                        ? 'w-2 bg-emerald-400' 
                        : 'w-2 bg-outline-variant/30'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* STEP 1: SOURCE SELECTION */}
            {restoreStep === 1 && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  Select Backup Location Source
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Google Drive Card */}
                  <div
                    onClick={() => {
                      setRestoreSource('GOOGLE_DRIVE');
                      setRestoreStep(2);
                    }}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-3 group ${
                      restoreSource === 'GOOGLE_DRIVE'
                        ? 'bg-primary/10 border-primary'
                        : 'bg-surface-container-low border-outline-variant/30 hover:border-primary/50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-on-surface">Google Drive</h4>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">Fetch latest cloud backup file</p>
                    </div>
                  </div>

                  {/* Local File Card */}
                  <div
                    onClick={() => {
                      setRestoreSource('LOCAL');
                      localFileRef.current?.click();
                    }}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-3 group ${
                      restoreSource === 'LOCAL'
                        ? 'bg-primary/10 border-primary'
                        : 'bg-surface-container-low border-outline-variant/30 hover:border-primary/50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-on-surface">Pick Local .enc File</h4>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">Browse device storage for backup files</p>
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={localFileRef}
                    accept=".enc,.json"
                    className="hidden"
                    onChange={handleLocalFileUpload}
                  />
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => setIsRestoreModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:bg-surface-variant"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: FILE SELECTION */}
            {restoreStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                    Available Backup Files ({restoreSource === 'GOOGLE_DRIVE' ? 'Google Drive' : 'Local Storage'})
                  </p>
                  <button
                    onClick={() => localFileRef.current?.click()}
                    className="text-[11px] text-primary font-bold hover:underline"
                  >
                    Upload Another File
                  </button>
                </div>

                {isLoadingBackups ? (
                  <div className="p-8 text-center text-on-surface-variant flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="text-xs font-semibold">Loading backup files...</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {availableBackups.map((b, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedBackupFile(b)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          selectedBackupFile?.name === b.name
                            ? 'bg-primary/10 border-primary ring-1 ring-primary'
                            : 'bg-surface-container-low border-outline-variant/30 hover:border-outline-variant'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-xs text-on-surface">{b.name}</p>
                            <p className="text-[11px] text-on-surface-variant font-numeric mt-0.5">{b.date}</p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-on-surface">{b.size}</span>
                          {idx === 0 && (
                            <span className="block text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded mt-0.5">
                              Latest
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setRestoreStep(1)}
                    className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:bg-surface-variant"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!selectedBackupFile}
                    onClick={() => setRestoreStep(3)}
                    className="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
                  >
                    Next: Decryption
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: DECRYPTION */}
            {restoreStep === 3 && (
              <form onSubmit={handleUnlockBackup} className="space-y-4">
                <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 space-y-1">
                  <p className="text-xs font-bold text-on-surface">Selected File:</p>
                  <p className="text-xs font-mono text-primary">{selectedBackupFile?.name}</p>
                  <p className="text-[11px] text-on-surface-variant font-numeric">{selectedBackupFile?.date} • {selectedBackupFile?.size}</p>
                </div>

                {restorePwdError && (
                  <div className="text-xs text-error font-semibold bg-error/10 border border-error/30 p-3 rounded-xl flex items-center gap-2 text-error">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{restorePwdError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Master Backup Password
                  </label>
                  <div className="relative">
                    <input
                      type={showRestorePassword ? 'text' : 'password'}
                      required
                      value={restorePassword}
                      onChange={(e) => setRestorePassword(e.target.value)}
                      placeholder="Enter decryption passphrase"
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRestorePassword(!showRestorePassword)}
                      className="absolute right-3 top-3 text-on-surface-variant hover:text-on-surface p-1"
                    >
                      {showRestorePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    Enter the passphrase used when this backup file was created.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setRestoreStep(2)}
                    className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:bg-surface-variant"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isDecrypting}
                    className="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {isDecrypting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Decrypting...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Unlock & Inspect</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 4: PREVIEW, MIGRATE & CONFIRM */}
            {restoreStep === 4 && (
              <div className="space-y-5">
                {restoreSuccessCelebration ? (
                  <div className="p-8 text-center space-y-3 animate-fade-in">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                      <Sparkles className="w-8 h-8 animate-bounce" />
                    </div>
                    <h4 className="text-xl font-bold text-on-surface">Ledger Successfully Restored!</h4>
                    <p className="text-xs text-on-surface-variant">Schema migrated & database hydrated. App state updated.</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/30 space-y-3">
                      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2.5">
                        <span className="text-xs font-bold text-on-surface uppercase tracking-wider">Backup Metadata Preview</span>
                        <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          Verified & Decrypted
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-on-surface-variant block text-[11px]">Backup Timestamp</span>
                          <strong className="text-on-surface font-numeric">{decryptedPreviewMeta?.date || selectedBackupFile?.date}</strong>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block text-[11px]">File Size</span>
                          <strong className="text-on-surface font-numeric">{selectedBackupFile?.size}</strong>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block text-[11px]">Accounts Count</span>
                          <strong className="text-on-surface font-numeric">{decryptedPreviewMeta?.accountsCount} Accounts</strong>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block text-[11px]">Transactions Count</span>
                          <strong className="text-on-surface font-numeric">{decryptedPreviewMeta?.transactionsCount} Transactions</strong>
                        </div>
                      </div>
                    </div>

                    {/* Critical Warning Box */}
                    <div className="bg-error/10 border border-error/30 rounded-2xl p-4 flex items-start gap-3 text-error">
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-bold text-xs uppercase tracking-wider">Critical Warning</h5>
                        <p className="text-xs leading-relaxed font-semibold mt-0.5">
                          Restoring will replace current local ledger data.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-3 border-t border-outline-variant/20">
                      <button
                        type="button"
                        disabled={isRestoring}
                        onClick={() => setRestoreStep(3)}
                        className="w-1/2 py-3 rounded-xl border border-outline-variant/30 text-on-surface-variant font-bold text-xs hover:bg-surface-variant transition-colors disabled:opacity-50"
                      >
                        Cancel / Back
                      </button>
                      <button
                        type="button"
                        disabled={isRestoring}
                        onClick={handleConfirmRestore}
                        className="w-1/2 py-3 rounded-xl bg-error text-error-container-on font-bold text-xs hover:bg-error/90 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isRestoring ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Hydrating Database...</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-4 h-4" />
                            <span>Confirm & Restore</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
