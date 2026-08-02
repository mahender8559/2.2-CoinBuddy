import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, X, ArrowRight } from 'lucide-react';

export function BackupWarningBanner() {
  const [backupConfig, setBackupConfig] = useState<any>(() => {
    const saved = localStorage.getItem('coinbuddy_backup_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return null;
  });

  const [isDismissed, setIsDismissed] = useState(false);

  // Sync state with storage and custom alert events
  useEffect(() => {
    const updateConfig = () => {
      const saved = localStorage.getItem('coinbuddy_backup_config');
      if (saved) {
        try {
          setBackupConfig(JSON.parse(saved));
        } catch (e) {}
      }
    };

    window.addEventListener('storage', updateConfig);
    window.addEventListener('coinbuddy_backup_alert', updateConfig);
    const interval = setInterval(updateConfig, 3000);

    return () => {
      window.removeEventListener('storage', updateConfig);
      window.removeEventListener('coinbuddy_backup_alert', updateConfig);
      clearInterval(interval);
    };
  }, []);

  const meta = backupConfig?.lastBackupMetadata;
  const isFailed = meta?.syncStatus === 'FAILED';

  if (!isFailed || isDismissed) {
    return null;
  }

  const errorReason = meta?.errorReason || 'Authentication expired or storage quota exceeded for backup provider.';
  const providerName = meta?.storageProvider === 'GOOGLE_DRIVE' ? 'Google Drive' : meta?.storageProvider === 'CUSTOM' ? 'Custom Storage' : 'Device Storage';

  const handleResolveClick = () => {
    window.dispatchEvent(new CustomEvent('navigate_to_backup'));
  };

  return (
    <div className="bg-gradient-to-r from-error/20 via-amber-500/15 to-error/10 border-2 border-error/50 rounded-2xl p-4 sm:p-5 shadow-lg animate-fade-in relative overflow-hidden mb-6">
      {/* Background glow accent */}
      <div className="absolute top-0 left-0 w-2 h-full bg-error"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-2">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-error/20 border border-error/40 flex items-center justify-center text-error shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-on-surface">Backup Failed: Tap to resolve</h4>
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-error/20 text-error px-2 py-0.5 rounded-full border border-error/40">
                Action Required
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              <strong className="text-on-surface">{providerName}:</strong> {errorReason}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            onClick={handleResolveClick}
            className="bg-error hover:bg-error/90 text-on-error px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reconnect {providerName}</span>
            <ArrowRight className="w-3 h-3 ml-0.5" />
          </button>
          
          <button
            onClick={() => setIsDismissed(true)}
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition-colors"
            title="Dismiss warning banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
