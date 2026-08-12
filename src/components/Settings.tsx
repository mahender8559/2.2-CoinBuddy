import React, { useState, useRef, useEffect } from 'react';
import { Edit2, ShieldCheck, RefreshCw, Fingerprint, Lock, Upload, Trash2, Info, Moon, Sun, DollarSign, LayoutList, FileSpreadsheet, Palette, Clock, ChevronRight } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { EditProfileModal } from './EditProfileModal';
import { BackupSecurity } from './BackupSecurity';
import { RecurringPayments } from './RecurringPayments';
import { exportToExcel } from '../utils/exportExcel';
import type { ComponentType, SVGProps } from 'react';

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function Settings() {
  const { theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, biometric, setBiometric, passcode, setPasscode, setManageCategoriesOpen, profile, setProfile, monthCycleDay, setMonthCycleDay, transactions, categories, accounts, clearAllData, verifyDataIntegrity, lastUpdated, setOnboardingOpen, setButtonTourOpen, getStoredSetting } = useAppContext();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSubScreen, setActiveSubScreen] = useState<'main' | 'backup'>(() =>
    new URLSearchParams(window.location.search).has('drive') ? 'backup' : 'main'
  );
  const [isEditProfileOpen, setEditProfileOpen] = useState(false);
  const [isPinModalOpen, setPinModalOpen] = useState(false);
  const [tempPin, setTempPin] = useState('');
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean, title: string, message: string, isConfirm: boolean, onConfirm?: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    isConfirm: false
  });

  const [backupInitialAction, setBackupInitialAction] = useState<'restore' | undefined>(undefined);
  const [backupInfo, setBackupInfo] = useState<{ lastBackupDate: string | null; syncStatus: string }>({
    lastBackupDate: null,
    syncStatus: 'NOT_CONFIGURED',
  });

  // Backup configuration is persisted in SQLite. Keep this summary derived from
  // that canonical source instead of showing legacy placeholder dates.
  useEffect(() => {
    const handleNavigate = () => {
      setBackupInitialAction(undefined);
      setActiveSubScreen('backup');
    };
    window.addEventListener('navigate_to_backup', handleNavigate);

    let cancelled = false;
    if (activeSubScreen === 'main') {
      void getStoredSetting('backupConfig').then(saved => {
        if (cancelled) return;
        const config = saved && typeof saved === 'object' ? saved as { lastBackupMetadata?: { date?: string; syncStatus?: string } } : undefined;
        setBackupInfo({
          lastBackupDate: config?.lastBackupMetadata?.date ?? null,
          syncStatus: config?.lastBackupMetadata?.syncStatus ?? 'NOT_CONFIGURED',
        });
      }).catch(() => {
        if (!cancelled) setBackupInfo({ lastBackupDate: null, syncStatus: 'NOT_CONFIGURED' });
      });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('navigate_to_backup', handleNavigate);
    };
  }, [activeSubScreen, getStoredSetting]);

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

  const handleExportExcel = async () => {
    if (transactions.length === 0 && accounts.length === 0 && categories.length === 0) {
      showAlert('Nothing to export', 'Add some CoinBuddy data before exporting an Excel workbook.');
      return;
    }
    try {
      await exportToExcel(transactions, accounts, categories, currency);
      showAlert('Excel Exported', 'Your CoinBuddy workbook was downloaded successfully.');
    } catch (error) {
      showAlert('Export Error', getErrorMessage(error, 'Failed to export the Excel workbook.'));
    }
  };

  const handleIntegrityCheck = async () => {
    try {
      const report = await verifyDataIntegrity();
      if (report.isHealthy) {
        showAlert('Integrity Verified', 'All checks passed: SQLite structure, foreign keys, ledger balances, net worth, recurring schedules, Investment SIP links, credit-card links, category classifications, Goals, and stored settings.');
        return;
      }
      const errors = report.issues.filter(issue => issue.severity === 'error');
      const warnings = report.issues.filter(issue => issue.severity === 'warning');
      const preview = report.issues.slice(0, 6).map(issue => `• ${issue.message}`).join('\n');
      const remaining = Math.max(0, report.issues.length - 6);
      showAlert(
        errors.length ? 'Integrity Warning' : 'Integrity Review',
        `${errors.length} critical · ${warnings.length} advisory issue(s) found.\n\n${preview}${remaining ? `\n• +${remaining} more issue(s)` : ''}\n\nCreate an encrypted backup before correcting critical ledger issues.`,
      );
    } catch (error) {
      showAlert('Integrity Check Failed', getErrorMessage(error, 'CoinBuddy could not complete the integrity audit.'));
    }
  };

  const buildTimeFormatted = typeof __BUILD_TIME__ !== 'undefined'
    ? new Date(__BUILD_TIME__).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    : new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  if (activeSubScreen === 'backup') {
    return <BackupSecurity initialAction={backupInitialAction} onBack={() => { setBackupInitialAction(undefined); setActiveSubScreen('main'); }} />;
  }

  return (
    <div className="space-y-8 pb-24 md:pb-0 max-w-3xl mx-auto animate-fade-in relative">
      {/* Alert Modal */}
      
      {alertConfig.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface-container-high rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-outline-variant/30 animate-scale-in">
            <h3 className="text-lg font-bold text-on-surface mb-2">{alertConfig.title}</h3>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed whitespace-pre-line">{alertConfig.message}</p>
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
          <button
            type="button"
            onClick={() => { setBackupInitialAction(undefined); setActiveSubScreen('backup'); }}
            className="col-span-1 md:col-span-2 w-full text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all group flex items-center justify-between gap-4"
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
          </button>

          <DataCard
            icon={FileSpreadsheet}
            label="Excel .xlsx"
            title="Export Excel"
            desc="Download accounts, transactions, and categories as a spreadsheet for analysis."
            onClick={() => { void handleExportExcel(); }}
          />
          <DataCard
            icon={Upload}
            label=".enc / JSON"
            title="Restore Backup"
            desc="Restore from a local encrypted backup, a legacy JSON backup, or Google Drive."
            onClick={() => { setBackupInitialAction('restore'); setActiveSubScreen('backup'); }}
          />
          <DataCard
            icon={ShieldCheck}
            label="Full Audit"
            title="Verify Data Integrity"
            desc="Audit database structure, balances, schedules, SIP links, cards, categories, Goals, and settings."
            onClick={() => { void handleIntegrityCheck(); }}
          />
          <button
            type="button"
            className="w-full text-left bg-surface-container rounded-2xl p-5 border border-error/20 flex flex-col gap-3 hover:bg-error/10 transition-colors group"
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
          </button>
        </div>
      </section>

      {/* App Help */}
      <section>
        <div className="flex items-center gap-2 mb-3 ml-2">
          <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest">App Help</h3>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="w-full text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all group flex items-center justify-between gap-4"
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
          </button>

          <button
            type="button"
            onClick={() => setButtonTourOpen(true)}
            className="w-full text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all group flex items-center justify-between gap-4"
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
          </button>
        </div>
      </section>

      {/* Footer info */}
      <section className="pt-8 border-t border-outline-variant/30 flex flex-col items-center gap-3">
        <div className="bg-surface-container-highest px-4 py-2 rounded-full border border-outline-variant/50 flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-background" />
          </div>
          <span className="text-xs font-semibold text-on-surface">Coin Buddy V3.2</span>
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
        </div>

        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-surface-container/60 border border-outline-variant/20 text-xs font-medium text-on-surface-variant shadow-xs">
          <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>CoinBuddy <strong className="font-numeric text-on-surface">v3.2</strong> • Build <strong className="font-numeric text-on-surface">{buildTimeFormatted}</strong></span>
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
    <button type="button" role="switch" aria-checked={checked} data-tour-id={tourId} className="w-full text-left flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors group" onClick={onChange}>
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
    </button>
  );
}

function DataCard({ icon: Icon, label, title, desc, onClick }: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" className="w-full text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/30 flex flex-col gap-3 hover:border-primary/50 transition-colors group" onClick={onClick}>
      <div className="flex items-center justify-between">
        <Icon className="w-5 h-5 text-primary" />
        <span className="text-[10px] font-bold text-on-surface-variant tracking-wider uppercase">{label}</span>
      </div>
      <div>
        <h4 className="font-semibold text-on-surface mb-1">{title}</h4>
        <p className="text-xs text-on-surface-variant">{desc}</p>
      </div>
    </button>
  );
}
