import React, { useState, useRef, useEffect } from 'react';
import { Edit2, ShieldCheck, RefreshCw, Fingerprint, Lock, Download, Upload, Trash2, Info, Moon, Sun, DollarSign, LayoutList, PiggyBank, X, FileSpreadsheet, Palette, Clock, ChevronRight, HardDrive } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { EditProfileModal } from './EditProfileModal';
import { BackupSecurity } from './BackupSecurity';
import { RecurringPayments } from './RecurringPayments';
import { exportToExcel } from '../utils/exportExcel';
import { COINBUDDY_TEST_DATA } from '../constants/coinbuddyTestData';
import { BackupManager } from '../utils/backupManager';
import type { ComponentType, SVGProps } from 'react';

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function Settings() {
  const { theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, autoRecur, setAutoRecur, biometric, setBiometric, passcode, setPasscode, setManageCategoriesOpen, profile, setProfile, monthCycleDay, setMonthCycleDay, transactions, categories, accounts, clearAllData, importLedgerData, verifyDataIntegrity, lastUpdated, setOnboardingOpen, setButtonTourOpen, getStoredSetting, exportLedgerData } = useAppContext();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSubScreen, setActiveSubScreen] = useState<'main' | 'backup'>(() =>
    new URLSearchParams(window.location.search).has('drive') ? 'backup' : 'main'
  );
  const loadTestData = async () => {
    if (!window.confirm('Replace this device\'s current ledger with the built-in CoinBuddy test data?')) return;
    try {
      await importLedgerData(COINBUDDY_TEST_DATA as any);
      showAlert('Test Data Loaded', 'HDFC Bank, Bike Loan, categories, event, and test transactions are ready.');
    } catch (error) {
      showAlert('Test Data Error', getErrorMessage(error, 'Could not load test data.'));
    }
  };
  const [isEditProfileOpen, setEditProfileOpen] = useState(false);
  const [isPinModalOpen, setPinModalOpen] = useState(false);
  const [isExportModalOpen, setExportModalOpen] = useState(false);
  const [tempPin, setTempPin] = useState('');
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean, title: string, message: string, isConfirm: boolean, onConfirm?: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    isConfirm: false
  });

  // Read current backup state for menu badge
  const [backupInfo, setBackupInfo] = useState<{ lastBackupDate: string | null; syncStatus: string }>(() => {
    const saved = localStorage.getItem('coinbuddy_backup_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          lastBackupDate: parsed.lastBackupDate || 'Aug 1, 2026, 06:30 PM',
          syncStatus: parsed.syncStatus || 'UP_TO_DATE'
        };
      } catch (e) {}
    }
    return {
      lastBackupDate: 'Aug 1, 2026, 06:30 PM',
      syncStatus: 'UP_TO_DATE'
    };
  });

  // Refresh backup info when returning to main screen & listen for navigate_to_backup
  useEffect(() => {
    const handleNavigate = () => {
      setActiveSubScreen('backup');
    };
    window.addEventListener('navigate_to_backup', handleNavigate);

    if (activeSubScreen === 'main') {
      const saved = localStorage.getItem('coinbuddy_backup_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const meta = parsed.lastBackupMetadata || {};
          setBackupInfo({
            lastBackupDate: meta.date || parsed.lastBackupDate || 'Aug 1, 2026, 06:30 PM',
            syncStatus: meta.syncStatus || parsed.syncStatus || 'UP_TO_DATE'
          });
        } catch (e) {}
      }
    }

    return () => {
      window.removeEventListener('navigate_to_backup', handleNavigate);
    };
  }, [activeSubScreen]);

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ isOpen: true, title, message, isConfirm: false });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setAlertConfig({ isOpen: true, title, message, isConfirm: true, onConfirm });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string') {
          setProfile({ ...profile, avatar: e.target.result });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const buildTimeFormatted = typeof __BUILD_TIME__ !== 'undefined'
    ? new Date(__BUILD_TIME__).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    : new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  if (activeSubScreen === 'backup') {
    return <BackupSecurity onBack={() => setActiveSubScreen('main')} />;
  }

  return (
    <div className="space-y-8 pb-24 md:pb-0 max-w-3xl mx-auto animate-fade-in relative">
      {/* Alert Modal */}
      
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-low w-full max-w-sm rounded-3xl p-6 shadow-xl relative animate-fade-in border border-outline-variant/30">
            <button onClick={() => setExportModalOpen(false)} className="absolute top-4 right-4 p-2 text-on-surface-variant hover:text-on-surface bg-surface-container rounded-full hover:bg-surface-container-high transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-on-surface mb-2">Export Data</h2>
            <p className="text-sm text-on-surface-variant mb-6">Choose the format you need for your data.</p>
            
            <div className="space-y-3">
              <button 
                onClick={async () => {
                  if (transactions.length === 0) {
                    showAlert('Empty', 'No transactions to export.');
                  } else {
                    try {
                      await exportToExcel(transactions, accounts, categories, currency);
                      showAlert('Export Complete', 'Your Excel file was downloaded successfully.');
                    } catch (err: unknown) {
                      showAlert('Export Error', getErrorMessage(err, 'Failed to export Excel file.'));
                    }
                  }
                  setExportModalOpen(false);
                }}
                className="w-full bg-primary text-on-primary py-3.5 rounded-2xl font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-5 h-5" />
                For Analysis (XLSX)
              </button>
              
              <button 
                onClick={async () => {
                  try {
                    const storedConfig = await getStoredSetting('backupConfig');
                    const savedConfig = localStorage.getItem('coinbuddy_backup_config');
                    const parsed = storedConfig && typeof storedConfig === 'object'
                      ? storedConfig as { hasPassword?: boolean; backupPassword?: string }
                      : savedConfig ? JSON.parse(savedConfig) : null;
                    if (!parsed?.hasPassword || !parsed.backupPassword) {
                      showAlert('Set Backup Password', 'Set a backup password in Backup & Security before downloading an encrypted backup.');
                      return;
                    }
                    await BackupManager.executeManualBackup(parsed.backupPassword, 'LOCAL', exportLedgerData());
                    showAlert('Success', 'Encrypted backup generated and downloaded successfully.');
                  } catch (err: unknown) {
                    showAlert('Backup Error', getErrorMessage(err, 'Failed to generate encrypted backup.'));
                  }
                  setExportModalOpen(false);
                }}
                className="w-full bg-surface-container-high text-on-surface py-3.5 rounded-2xl font-bold hover:bg-surface-variant transition-colors flex items-center justify-center gap-2 border border-outline-variant/30"
              >
                <Download className="w-5 h-5" />
                For Backup & Re-importing (Encrypted .enc)
              </button>
            </div>
          </div>
        </div>
      )}

      {alertConfig.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface-container-high rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-outline-variant/30 animate-scale-in">
            <h3 className="text-lg font-bold text-on-surface mb-2">{alertConfig.title}</h3>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">{alertConfig.message}</p>
            <div className="flex gap-3 justify-end">
              {alertConfig.isConfirm && (
                <button 
                  onClick={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                  className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
              )}
              <button 
                onClick={() => {
                  if (alertConfig.isConfirm && alertConfig.onConfirm) {
                    alertConfig.onConfirm();
                  }
                  setAlertConfig({ ...alertConfig, isOpen: false });
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-xl ${alertConfig.isConfirm ? 'bg-error text-error-container-on hover:bg-error/90' : 'bg-primary text-on-primary hover:bg-primary/90'} transition-colors`}
              >
                {alertConfig.isConfirm ? 'Confirm' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      <EditProfileModal isOpen={isEditProfileOpen} onClose={() => setEditProfileOpen(false)} />

      {/* Profile Section */}
      <section>
        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/30 flex items-center gap-6">
          <div className="relative group cursor-pointer shrink-0" onClick={() => fileInputRef.current?.click()}>
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary p-0.5">
              <div className="w-full h-full rounded-full overflow-hidden bg-surface-variant flex items-center justify-center">
                {profile?.avatar ? (
                  <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-3xl text-on-surface-variant font-bold">{profile?.name?.charAt(0) || 'F'}</div>
                )}
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold text-on-surface">{profile?.name || 'Financial Sovereign'}</h2>
            <button 
              type="button"
              aria-label="Edit profile"
              title="Edit profile"
              onClick={() => setEditProfileOpen(true)}
              className="p-1.5 rounded-full bg-surface-variant text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section>
        <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3 ml-2">Preferences</h3>
        <div className="bg-surface-container rounded-2xl border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20">
          <SettingToggle 
            icon={theme === 'dark' ? Moon : Sun} 
            title="Dark Theme" 
            desc="Toggle dark and light appearance" 
            checked={theme === 'dark'} 
            onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
          />

          <div className="flex flex-col p-4 hover:bg-surface-container-high transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-on-surface text-sm mb-0.5">Color Theme</p>
                  <p className="text-xs text-on-surface-variant">Select your primary color</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pl-14 overflow-x-auto pb-1 scrollbar-hide">
              {[
                { id: 'blue', color: 'bg-blue-500' },
                { id: 'green', color: 'bg-emerald-500' },
                { id: 'purple', color: 'bg-purple-500' },
                { id: 'orange', color: 'bg-orange-500' },
                { id: 'pink', color: 'bg-pink-500' },
              ].map(c => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Use ${c.id} color theme`}
                  aria-pressed={colorPalette === c.id}
                  title={`Use ${c.id} color theme`}
                  onClick={() => setColorPalette(c.id)}
                  className={`w-8 h-8 shrink-0 rounded-full ${c.color} flex items-center justify-center transition-transform ${colorPalette === c.id ? 'ring-2 ring-on-surface ring-offset-2 ring-offset-surface-container scale-110' : 'hover:scale-110'}`}
                >
                  {colorPalette === c.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-on-surface text-sm mb-0.5">Currency</p>
                <p className="text-xs text-on-surface-variant">Select your primary currency</p>
              </div>
            </div>
            <select 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-surface-container-highest border border-outline-variant/30 text-on-surface rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="INR">INR (₹)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>
          <div className="flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-on-surface text-sm mb-0.5">Month Cycle Date</p>
                <p className="text-xs text-on-surface-variant">Day of month when cycle resets</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="number"
                min="1"
                max="31"
                value={monthCycleDay}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (val >= 1 && val <= 31) setMonthCycleDay(val);
                }}
                className="bg-surface-container-highest border border-outline-variant/30 text-on-surface rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 w-20 font-numeric text-right"
              />
            </div>
          </div>
          <SettingToggle 
            icon={RefreshCw} 
            title="Auto-create recurring entries" 
            desc="Create due scheduled entries automatically; they still need confirmation before balances change" 
            checked={autoRecur} 
            onChange={() => setAutoRecur(!autoRecur)} 
          />
          <SettingToggle 
            icon={Lock} 
            title="Passcode Authentication" 
            desc="Unlock app using a 4-digit PIN" 
            checked={!!passcode} 
            tourId="tour-security-toggle"
            onChange={() => {
              if (passcode) {
                setPasscode(null);
              } else {
                setPinModalOpen(true);
              }
            }} 
          />
          <SettingToggle 
            icon={Fingerprint} 
            title="Biometric Authentication" 
            desc="Unlock app using FaceID or Fingerprint" 
            checked={biometric} 
            onChange={() => setBiometric(!biometric)} 
          />
        </div>
      </section>

      <RecurringPayments />

      {/* Data Management */}
      <section>
        <div className="flex items-center gap-2 mb-3 ml-2">
          <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest">Data Management</h3>
          <Info className="w-4 h-4 text-on-surface-variant" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Backup & Security Settings Entry Point */}
          <div 
            onClick={() => setActiveSubScreen('backup')}
            className="col-span-1 md:col-span-2 bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all cursor-pointer group flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-on-surface text-sm group-hover:text-primary transition-colors">
                    Backup & Security
                  </h4>
                  {backupInfo.syncStatus === 'UP_TO_DATE' && (
                    <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Up to Date
                    </span>
                  )}
                  {backupInfo.syncStatus === 'PENDING_NETWORK' && (
                    <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      Pending Network
                    </span>
                  )}
                  {backupInfo.syncStatus === 'NOT_CONFIGURED' && (
                    <span className="text-[10px] font-bold bg-surface-variant text-on-surface-variant border border-outline-variant/30 px-2 py-0.5 rounded-full">
                      Not Configured
                    </span>
                  )}
                  {backupInfo.syncStatus === 'FAILED' && (
                    <span className="text-[10px] font-bold bg-error/10 text-error border border-error/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      Sync Failed
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Last Backup: <strong className="font-numeric text-on-surface">{backupInfo.lastBackupDate || 'Never'}</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-on-surface-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all">
              <span className="text-xs font-semibold hidden sm:inline">Manage</span>
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>

          <DataCard 
            icon={Download} 
            label="XLSX / JSON" 
            title="Export Data" 
            desc="Export to Excel for analysis or JSON for backup." 
            onClick={() => setExportModalOpen(true)}
          />
          <DataCard 
            icon={Upload} 
            label="Restore" 
            title="Import Data" 
            desc="Restore records from a previous export file." 
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'application/json';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const content = e.target?.result;
                    if (typeof content === 'string') {
                      try {
                        importLedgerData(JSON.parse(content));
                      } catch (err) {
                        showAlert('Error', 'Invalid backup file');
                      }
                    }
                  };
                  reader.readAsText(file);
                }
              };
              input.click();
            }}
          />
          <DataCard
            icon={RefreshCw}
            label="Built-in Fixture"
            title="Load CoinBuddy Test Data"
            desc="Replace local records with the HDFC Bank and Bike Loan test fixture."
            onClick={() => { void loadTestData(); }}
          />
          <DataCard 
            icon={ShieldCheck}
            label="Ledger Audit"
            title="Verify Data Integrity"
            desc="Compare every balance against the transaction ledger."
            onClick={() => { void verifyDataIntegrity().then(ok => showAlert(ok ? 'Integrity Verified' : 'Integrity Warning', ok ? 'All account balances match the ledger.' : 'A mismatch was found. Export a backup before editing data.')); }}
          />
          <div 
            className="bg-surface-container rounded-2xl p-5 border border-error/20 flex flex-col gap-3 hover:bg-error/10 transition-colors cursor-pointer group"
            onClick={() => {
              showConfirm("Clear Storage", "Are you sure you want to permanently delete all data from this device? All transactions, accounts, schedules, events, categories, and settings will be wiped.", () => {
                void clearAllData().then(() => {
                  showAlert("Storage Cleared", "All local data has been successfully cleared.");
                }).catch((error: unknown) => {
                  showAlert("Clear Failed", getErrorMessage(error, 'Your local data could not be cleared.'));
                });
              });
            }}
          >
            <div className="flex items-center justify-between">
              <Trash2 className="w-5 h-5 text-error" />
              <span className="text-[10px] font-bold text-error/60 uppercase tracking-wider">Danger</span>
            </div>
            <div>
              <h4 className="font-semibold text-on-surface group-hover:text-error transition-colors mb-1">Clear Local Storage</h4>
              <p className="text-xs text-on-surface-variant">Permanently delete all data from this device.</p>
            </div>
          </div>
        </div>
      </section>

      {/* App Help */}
      <section>
        <div className="flex items-center gap-2 mb-3 ml-2">
          <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest">App Help</h3>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div 
            onClick={() => setOnboardingOpen(true)}
            className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all cursor-pointer group flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-on-surface group-hover:text-primary transition-colors mb-1">
                  Feature Walkthrough & Tour
                </h4>
                <p className="text-xs text-on-surface-variant">
                  Replay the onboarding walkthrough to learn about advanced ledger features.
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
          </div>

          <div 
            onClick={() => setButtonTourOpen(true)}
            className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all cursor-pointer group flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
                <LayoutList className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-on-surface group-hover:text-primary transition-colors mb-1">
                  Interactive Button Tour
                </h4>
                <p className="text-xs text-on-surface-variant">
                  Start an interactive spotlight tour of core action buttons.
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
          </div>
        </div>
      </section>

      {/* Footer info */}
      <section className="pt-8 border-t border-outline-variant/30 flex flex-col items-center gap-3">
        <div className="bg-surface-container-highest px-4 py-2 rounded-full border border-outline-variant/50 flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-background" />
          </div>
          <span className="text-xs font-semibold text-on-surface">Coin Buddy V3.1</span>
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
        </div>

        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-surface-container/60 border border-outline-variant/20 text-xs font-medium text-on-surface-variant shadow-xs">
          <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>CoinBuddy <strong className="font-numeric text-on-surface">v3.1</strong> • Build <strong className="font-numeric text-on-surface">{buildTimeFormatted}</strong></span>
        </div>

        <p className="text-[10px] text-on-surface-variant text-center leading-relaxed opacity-60">
          © 2024 Fortified Financial Systems.<br/>Your data never leaves your pocket.
        </p>
      </section>

      {isPinModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container rounded-3xl w-full max-w-sm p-6 shadow-xl border border-outline-variant/30 flex flex-col items-center">
            <h2 className="text-xl font-bold text-on-surface mb-2">{passcode ? 'Enter New Passcode' : 'Set Passcode'}</h2>
            <p className="text-sm text-on-surface-variant mb-6">Enter a 4-digit PIN</p>
            
            <div className="flex gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-4 h-4 rounded-full border-2 ${
                    tempPin.length > i 
                      ? 'bg-primary border-primary' 
                      : 'border-outline-variant/50'
                  } transition-all duration-200`}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4 w-full px-4 mb-6">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => {
                    const newPin = tempPin + num;
                    if (newPin.length <= 4) setTempPin(newPin);
                    if (newPin.length === 4) {
                      setTimeout(() => {
                        setPasscode(newPin);
                        setTempPin('');
                        setPinModalOpen(false);
                      }, 200);
                    }
                  }}
                  className="w-14 h-14 rounded-full bg-surface-container-high hover:bg-surface-container-highest transition-colors text-xl font-semibold flex items-center justify-center mx-auto"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                onClick={() => {
                  const newPin = tempPin + '0';
                  if (newPin.length <= 4) setTempPin(newPin);
                  if (newPin.length === 4) {
                    setTimeout(() => {
                      setPasscode(newPin);
                      setTempPin('');
                      setPinModalOpen(false);
                    }, 200);
                  }
                }}
                className="w-14 h-14 rounded-full bg-surface-container-high hover:bg-surface-container-highest transition-colors text-xl font-semibold flex items-center justify-center mx-auto"
              >
                0
              </button>
              <button
                onClick={() => setTempPin(prev => prev.slice(0, -1))}
                className="w-14 h-14 rounded-full bg-surface-container-high hover:bg-surface-container-highest transition-colors text-base font-semibold flex items-center justify-center mx-auto text-on-surface-variant"
              >
                Del
              </button>
            </div>
            
            <button
              onClick={() => {
                setTempPin('');
                setPinModalOpen(false);
              }}
              className="px-6 py-2 rounded-xl text-on-surface-variant hover:bg-surface-variant transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function SettingToggle({ icon: Icon, title, desc, checked, onChange, tourId }: { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; desc: string; checked: boolean; onChange: () => void; tourId?: string }) {
  return (
    <div data-tour-id={tourId} className="flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors cursor-pointer group" onClick={onChange}>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="font-semibold text-on-surface text-sm mb-0.5">{title}</p>
          <p className="text-xs text-on-surface-variant">{desc}</p>
        </div>
      </div>
      <div className="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background" style={{ backgroundColor: checked ? 'var(--primary)' : 'var(--surface-container-highest)' }}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
    </div>
  );
}

function DataCard({ icon: Icon, label, title, desc, onClick }: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; title: string; desc: string; onClick: () => void }) {
  return (
    <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 flex flex-col gap-3 hover:border-primary/50 transition-colors cursor-pointer group" onClick={onClick}>
      <div className="flex items-center justify-between">
        <Icon className="w-5 h-5 text-primary" />
        <span className="text-[10px] font-bold text-on-surface-variant tracking-wider uppercase">{label}</span>
      </div>
      <div>
        <h4 className="font-semibold text-on-surface mb-1">{title}</h4>
        <p className="text-xs text-on-surface-variant">{desc}</p>
      </div>
    </div>
  );
}
