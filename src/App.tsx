import { Fingerprint, ShieldCheck, Lock, Plus, AlertTriangle, X } from 'lucide-react';
import { useState, useEffect, useLayoutEffect } from 'react';
import { Tab } from './types';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { BackupAutomationService } from './components/BackupAutomationService';
import { Activity } from './components/Activity';
import { V35Insights } from './components/V35Insights';
import { Settings } from './components/Settings';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AddAccountModal } from './components/AddAccountModal';
import { WalletSummaryModal } from './components/WalletSummaryModal';
import { PayCardModal } from './components/PayCardModal';
import { ManageFinances } from './components/ManageFinances';
import { OnboardingModal } from './components/OnboardingModal';
import { ExitConfirmSheet } from './components/ExitConfirmSheet';
import { ButtonTourOverlay } from './components/ButtonTourOverlay';
import { GoogleSignInGate } from './components/GoogleSignInGate';
import { useAppContext } from './context/AppContext';
import { registerDailyCronWorker, calculateEmiReminders, triggerNativeNotification } from './utils/emiReminders';

// Keep the completed Google authentication flow dormant during development.
// Change this to true when the app is ready to require Google sign-in again.
const GOOGLE_LOGIN_ENABLED = false;

export default function App() {
  const [googleAuth, setGoogleAuth] = useState<{ loading: boolean; authenticated: boolean }>({ loading: true, authenticated: false });
  const [isExitConfirmOpen, setExitConfirmOpen] = useState(false);
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

  const handleOpenSharingForTransaction = (transactionId: string) => {
    sessionStorage.setItem('coinbuddy_share_transaction_id', transactionId);
    sessionStorage.setItem('coinbuddy_manage_destination', 'Sharing');
    handleTabChange('manage');
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
        // Reinsert a same-document guard while the custom confirmation is open.
        // This mirrors the blocking behavior of the old native confirm: pressing
        // Back again cannot silently skip the confirmation and leave the app.
        window.history.pushState({ exitConfirm: true }, '', '?tab=dashboard');
        setActiveTab('dashboard');
        setExitConfirmOpen(true);
      } else if (e.state && e.state.tab) {
        setActiveTab(e.state.tab as Tab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, isAddModalOpen, addAccountModalType, isWalletModalOpen, payCardModalState.isOpen, isManageCategoriesOpen, setAddModalOpen, setAddAccountModalType, setWalletModalOpen, setPayCardModalState, setManageCategoriesOpen]);

  const handleStayInApp = () => {
    setExitConfirmOpen(false);
    window.history.replaceState({ tab: 'dashboard' }, '', '?tab=dashboard');
    setActiveTab('dashboard');
  };

  const handleExitApp = () => {
    setExitConfirmOpen(false);
    // Current entry is the temporary exitConfirm guard and the preceding entry
    // is exitPrompt. Move across both to preserve the old confirmed-exit result.
    window.history.go(-2);
  };

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
      <div data-testid="locked-app-screen" className="min-h-screen bg-background px-4 py-8 text-on-background sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-sm items-center justify-center">
          <section className="w-full rounded-[28px] border border-outline-variant/30 bg-surface-container p-5 shadow-xl sm:p-6" aria-labelledby="locked-app-title">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Lock className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Local vault</p>
                <h1 id="locked-app-title" className="mt-1 text-2xl font-semibold tracking-tight text-on-surface">CoinBuddy is locked</h1>
                <p className="mt-1.5 text-sm leading-6 text-on-surface-variant">Authenticate to open the financial ledger stored on this device.</p>
              </div>
            </div>

            {passcode && (
              <div className="mt-7">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-on-surface">Enter your 4-digit PIN</p>
                  <div aria-label={`${pinEntry.length} of 4 PIN digits entered`} className="flex gap-2">
                    {[...Array(4)].map((_, index) => (
                      <span
                        key={index}
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 rounded-full border transition-colors ${
                          pinError
                            ? 'border-error bg-error'
                            : pinEntry.length > index
                              ? 'border-primary bg-primary'
                              : 'border-outline-variant/50 bg-transparent'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2.5" aria-label="PIN keypad">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button
                      key={num}
                      type="button"
                      aria-label={`PIN digit ${num}`}
                      onClick={() => {
                        if (pinEntry.length < 4) setPinEntry(previous => previous + num);
                      }}
                      className="v35-focus-ring flex min-h-12 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-low text-lg font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
                    >
                      {num}
                    </button>
                  ))}
                  <div aria-hidden="true" />
                  <button
                    type="button"
                    aria-label="PIN digit 0"
                    onClick={() => {
                      if (pinEntry.length < 4) setPinEntry(previous => previous + '0');
                    }}
                    className="v35-focus-ring flex min-h-12 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-low text-lg font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    aria-label="Delete PIN digit"
                    onClick={() => setPinEntry(previous => previous.slice(0, -1))}
                    className="v35-focus-ring flex min-h-12 items-center justify-center rounded-xl border border-outline-variant/25 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                  >
                    Delete
                  </button>
                </div>
                {pinError && <p role="alert" className="mt-3 text-center text-sm font-medium text-error">Incorrect PIN. Try again.</p>}
              </div>
            )}

            {biometric && (
              <div className={`${passcode ? 'mt-5 border-t border-outline-variant/20 pt-5' : 'mt-7'}`}>
                <button
                  type="button"
                  onClick={() => void handleBiometricUnlock()}
                  className="v35-focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
                >
                  <Fingerprint className="h-5 w-5" />
                  {passcode ? 'Use Biometrics' : 'Unlock with Biometrics'}
                </button>
              </div>
            )}

            {biometricError && <p role="alert" className="mt-3 rounded-xl border border-error/25 bg-error/10 px-3 py-2.5 text-sm leading-5 text-error">{biometricError}</p>}

            <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-surface-container-low px-3.5 py-3 text-xs leading-5 text-on-surface-variant">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cb-green)]" />
              <span>Your live ledger remains local to this device while CoinBuddy is locked.</span>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-background selection:bg-primary/30 relative overflow-x-hidden">
      <BackupAutomationService />
      <Header onLogout={handleGoogleLogout} showLogout={GOOGLE_LOGIN_ENABLED} />
      <Navigation activeTab={activeTab} setActiveTab={handleTabChange} />
      
      <main className="min-h-screen pt-3 md:pl-20 md:pt-20 xl:pl-60">
        <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-5 lg:px-6 xl:px-8 py-4 sm:py-6 pb-28 md:pb-6">
          {integrityWarning && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-error/50 bg-error/10 px-4 py-3 text-sm text-on-surface">
              <AlertTriangle className="h-5 w-5 shrink-0 text-error" />
              <span className="flex-1">{integrityWarning} Export a backup before editing data.</span>
              <button onClick={dismissIntegrityWarning} aria-label="Dismiss integrity warning" className="p-1 text-on-surface-variant hover:text-on-surface"><X className="h-4 w-4" /></button>
            </div>
          )}
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'activity' && <Activity onOpenSharing={handleOpenSharingForTransaction} />}
          {activeTab === 'manage' && <ManageFinances />}
          {activeTab === 'insights' && <V35Insights />}
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

      <ExitConfirmSheet open={isExitConfirmOpen} onStay={handleStayInApp} onExit={handleExitApp} />
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
