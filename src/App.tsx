import { Fingerprint, ShieldCheck, Lock, Plus, AlertTriangle, X } from 'lucide-react';
import { useState, useEffect, useLayoutEffect } from 'react';
import { Tab } from './types';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { BackupAutomationService } from './components/BackupAutomationService';
import { Activity } from './components/Activity';
import { Insights } from './components/Insights';
import { Settings } from './components/Settings';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AddAccountModal } from './components/AddAccountModal';
import { WalletSummaryModal } from './components/WalletSummaryModal';
import { PayCardModal } from './components/PayCardModal';
import { ManageFinances } from './components/ManageFinances';
import { OnboardingModal } from './components/OnboardingModal';
import { ButtonTourOverlay } from './components/ButtonTourOverlay';
import { GoogleSignInGate } from './components/GoogleSignInGate';
import { useAppContext } from './context/AppContext';
import { registerDailyCronWorker, calculateEmiReminders, triggerNativeNotification } from './utils/emiReminders';

// Keep the completed Google authentication flow dormant during development.
// Change this to true when the app is ready to require Google sign-in again.
const GOOGLE_LOGIN_ENABLED = false;

export default function App() {
  const [googleAuth, setGoogleAuth] = useState<{ loading: boolean; authenticated: boolean }>({ loading: true, authenticated: false });
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'settings' || tab === 'activity' || tab === 'manage' || tab === 'insights' ? tab : 'dashboard';
  });
  const { accounts, transactions, biometric, passcode, verifyPasscode, integrityWarning, dismissIntegrityWarning, isUnlocked, setUnlocked, isAddModalOpen, setAddModalOpen, setEditingTransaction, addAccountModalType, setAddAccountModalType, isWalletModalOpen, setWalletModalOpen, payCardModalState, setPayCardModalState, isManageCategoriesOpen, setManageCategoriesOpen, toast } = useAppContext();

  // Daily Cron Job Worker at 09:00 AM local time for Smart EMI Reminders
  useEffect(() => {
    const runWorker = () => {
      const activeNotifs = calculateEmiReminders(accounts, transactions);
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        activeNotifs.forEach(notif => {
          triggerNativeNotification(notif.title, notif.body);
        });
      }
    };

    // Run on mount
    runWorker();

    // Register daily 09:00 AM cron timer worker
    const cleanup = registerDailyCronWorker(runWorker);
    return cleanup;
  }, [accounts, transactions]);

  const handleTabChange = (tab: Tab) => {
    if (tab !== activeTab) {
      window.history.pushState({ tab }, '', `?tab=${tab}`);
      setActiveTab(tab);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await fetch('/api/auth/google/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setUnlocked(false);
      setGoogleAuth({ loading: false, authenticated: false });
      window.history.replaceState({}, document.title, '/');
    }
  };

  useEffect(() => {
    const handleNavigateBackup = () => {
      handleTabChange('settings');
    };
    window.addEventListener('navigate_to_backup', handleNavigateBackup);
    return () => window.removeEventListener('navigate_to_backup', handleNavigateBackup);
  }, [activeTab]);

  useEffect(() => {
    if (isManageCategoriesOpen) {
      handleTabChange('manage');
    }
  }, [isManageCategoriesOpen]);

  useLayoutEffect(() => {
    // This runs before child useEffect hooks, so backup work can never begin
    // while the browser is still on an OAuth callback URL.
    const callback = new URLSearchParams(window.location.search);
    const driveResult = callback.get('drive');
    const authResult = callback.get('auth');
    if (!driveResult && !authResult) return;
    if (driveResult) {
      sessionStorage.setItem('coinbuddy_drive_oauth_result', JSON.stringify({
        status: driveResult,
        error: callback.get('drive_error'),
      }));
    }
    const destination = driveResult ? 'settings' : 'dashboard';
    window.history.replaceState({}, document.title, `/?tab=${destination}`);
    setActiveTab(destination);
  }, []);

  useEffect(() => {
    if (!GOOGLE_LOGIN_ENABLED) {
      setGoogleAuth({ loading: false, authenticated: false });
      return;
    }
    let active = true;
    fetch('/api/auth/google/status', { credentials: 'include', cache: 'no-store' })
      .then(async response => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (active) setGoogleAuth({ loading: false, authenticated: Boolean(response.ok && body?.authenticated) });
      })
      .catch(() => {
        if (active) setGoogleAuth({ loading: false, authenticated: false });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Initialize history state on load if not already set
    if (!window.history.state || !window.history.state.tab) {
      const tab = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      const initialTab = tab === 'settings' || tab === 'activity' || tab === 'manage' || tab === 'insights' ? tab : 'dashboard';
      window.history.replaceState({ exitPrompt: true }, '');
      window.history.pushState({ tab: initialTab }, '', `?tab=${initialTab}${new URLSearchParams(window.location.search).get('drive') ? `&drive=${new URLSearchParams(window.location.search).get('drive')}` : ''}${new URLSearchParams(window.location.search).get('drive_error') ? `&drive_error=${encodeURIComponent(new URLSearchParams(window.location.search).get('drive_error') || '')}` : ''}`);
      setActiveTab(initialTab);
    } else if (window.history.state.tab) {
      setActiveTab(window.history.state.tab as Tab);
    }
  }, []);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const anyModalOpen = isAddModalOpen || Boolean(addAccountModalType) || isWalletModalOpen || payCardModalState.isOpen || isManageCategoriesOpen;
      
      if (anyModalOpen) {
        if (isAddModalOpen) setAddModalOpen(false);
        if (addAccountModalType) setAddAccountModalType(null);
        if (isWalletModalOpen) setWalletModalOpen(false);
        if (payCardModalState.isOpen) setPayCardModalState({isOpen: false, cardId: null});
        if (isManageCategoriesOpen) setManageCategoriesOpen(false);

        window.history.pushState({ tab: activeTab }, '', `?tab=${activeTab}`);
        return;
      }

      if (e.state && e.state.exitPrompt) {
        if (window.confirm('Do you want to exit the app?')) {
          window.history.back();
        } else {
          window.history.pushState({ tab: 'dashboard' }, '', '?tab=dashboard');
          setActiveTab('dashboard');
        }
      } else if (e.state && e.state.tab) {
        setActiveTab(e.state.tab as Tab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, isAddModalOpen, addAccountModalType, isWalletModalOpen, payCardModalState.isOpen, isManageCategoriesOpen, setAddModalOpen, setAddAccountModalType, setWalletModalOpen, setPayCardModalState, setManageCategoriesOpen]);

  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  const handleBiometricUnlock = async () => {
    setBiometricError(null);
    setUnlocked(false);

    if (!window.PublicKeyCredential || !navigator.credentials?.get) {
      setBiometricError(passcode
        ? 'Biometric authentication is not available on this device. Use your passcode.'
        : 'Biometric authentication is not available on this device. Configure a passcode to unlock safely.');
      return;
    }

    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
        },
      });

      if (!assertion) throw new Error('No biometric assertion was returned.');
      setUnlocked(true);
    } catch (error) {
      setUnlocked(false);
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError') {
        setBiometricError('Biometric authentication was cancelled or failed.');
      } else if (name === 'NotSupportedError' || name === 'SecurityError' || name === 'AbortError') {
        setBiometricError(passcode
          ? 'Biometric authentication is unavailable. Use your passcode.'
          : 'Biometric authentication is unavailable. Configure a passcode to unlock safely.');
      } else {
        setBiometricError('Biometric authentication could not be completed. Your vault remains locked.');
      }
    }
  };

  useEffect(() => {
    if (pinEntry.length === 4) {
      void verifyPasscode(pinEntry).then(matches => {
        if (matches) { setUnlocked(true); return; }
        setPinError(true);
        setTimeout(() => { setPinEntry(''); setPinError(false); }, 500);
      });
    }
  }, [pinEntry, verifyPasscode, setUnlocked]);

  if (GOOGLE_LOGIN_ENABLED && !googleAuth.authenticated) {
    return <GoogleSignInGate loading={googleAuth.loading} />;
  }

  if ((biometric || passcode) && !isUnlocked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 animate-fade-in relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>
        
        <div className="flex flex-col items-center gap-6 z-10 w-full max-w-sm">
          <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center border border-outline-variant/30 mb-4">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          
          <div className="text-center space-y-2 mb-4">
            <h1 className="text-3xl font-bold text-on-surface">App Locked</h1>
            <p className="text-on-surface-variant">Authenticate to access your local financial ledger.</p>
          </div>

          {passcode && (
            <div className="w-full mt-4 flex flex-col items-center">
              <div className="flex gap-4 mb-8">
                {[...Array(4)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-4 h-4 rounded-full border-2 ${
                      pinEntry.length > i 
                        ? 'bg-primary border-primary' 
                        : 'border-outline-variant/50'
                    } ${pinError ? 'bg-error border-error animate-pulse' : 'transition-all duration-200'}`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4 w-full px-8">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      if (pinEntry.length < 4) setPinEntry(prev => prev + num);
                    }}
                    className="w-16 h-16 rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-2xl font-semibold flex items-center justify-center mx-auto"
                  >
                    {num}
                  </button>
                ))}
                <div />
                <button
                  onClick={() => {
                    if (pinEntry.length < 4) setPinEntry(prev => prev + '0');
                  }}
                  className="w-16 h-16 rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-2xl font-semibold flex items-center justify-center mx-auto"
                >
                  0
                </button>
                <button
                  onClick={() => setPinEntry(prev => prev.slice(0, -1))}
                  className="w-16 h-16 rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-lg font-semibold flex items-center justify-center mx-auto text-on-surface-variant"
                >
                  Del
                </button>
              </div>
            </div>
          )}
          
          {biometric && !passcode && (
            <button 
              onClick={() => void handleBiometricUnlock()}
              className="flex flex-col items-center gap-4 group mt-8"
            >
              <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center group-hover:bg-primary/20 transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_var(--primary)] relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                <Fingerprint className="w-10 h-10 text-primary relative z-10" strokeWidth={1.5} />
              </div>
              <span className="text-sm font-semibold tracking-wider uppercase text-primary group-hover:text-primary-container-on">Tap to Unlock</span>
            </button>
          )}

          {biometric && passcode && (
            <button 
              onClick={() => void handleBiometricUnlock()}
              className="mt-6 flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
            >
              <Fingerprint className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider uppercase">Use Biometrics</span>
            </button>
          )}
          {biometricError && <p role="alert" className="max-w-sm text-center text-sm text-error">{biometricError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-background selection:bg-primary/30 relative overflow-x-hidden">
      <BackupAutomationService />
      <Header onLogout={handleGoogleLogout} showLogout={GOOGLE_LOGIN_ENABLED} />
      <Navigation activeTab={activeTab} setActiveTab={handleTabChange} />
      
      <main className="pt-20 min-h-screen md:pl-20">
        <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-5 lg:px-6 xl:px-8 py-4 sm:py-6 pb-28 md:pb-6">
          {integrityWarning && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-error/50 bg-error/10 px-4 py-3 text-sm text-on-surface">
              <AlertTriangle className="h-5 w-5 shrink-0 text-error" />
              <span className="flex-1">{integrityWarning} Export a backup before editing data.</span>
              <button onClick={dismissIntegrityWarning} aria-label="Dismiss integrity warning" className="p-1 text-on-surface-variant hover:text-on-surface"><X className="h-4 w-4" /></button>
            </div>
          )}
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'activity' && <Activity />}
          {activeTab === 'manage' && <ManageFinances />}
          {activeTab === 'insights' && <Insights />}
          {activeTab === 'settings' && <Settings />}
        </div>
      </main>
      
      {activeTab !== 'settings' && activeTab !== 'manage' && (
        <button 
          data-tour-id="tour-add-transaction"
          onClick={() => {
            setEditingTransaction(null);
            setAddModalOpen(true);
          }}
          className="fixed bottom-24 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-primary hover:bg-primary/90 text-on-primary rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40"
          title="Add Transaction"
          aria-label="Add Transaction"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      <OnboardingModal />
      <ButtonTourOverlay activeTab={activeTab} setActiveTab={handleTabChange} />
      <AddTransactionModal />
      <AddAccountModal />
      <WalletSummaryModal />
      <PayCardModal />
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-4 rounded-xl bg-surface-container-high px-4 py-3 text-sm text-on-surface shadow-2xl border border-outline-variant/30"><span>{toast.message}</span>{toast.actionLabel && <button aria-label={`${toast.actionLabel} (${toast.message})`} className="font-bold text-primary" onClick={toast.onAction}>{toast.actionLabel}</button>}</div>}
    </div>
  );
}
