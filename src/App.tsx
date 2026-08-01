import { Fingerprint, ShieldCheck, Lock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Tab } from './types';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { Activity } from './components/Activity';
import { Insights } from './components/Insights';
import { Settings } from './components/Settings';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AddAccountModal } from './components/AddAccountModal';
import { WalletSummaryModal } from './components/WalletSummaryModal';
import { PayCardModal } from './components/PayCardModal';
import { ManageFinances } from './components/ManageFinances';
import { useAppContext } from './context/AppContext';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const { biometric, passcode, isUnlocked, setUnlocked, isAddModalOpen, setAddModalOpen, addAccountModalType, setAddAccountModalType, isWalletModalOpen, setWalletModalOpen, payCardModalState, setPayCardModalState, isManageCategoriesOpen, setManageCategoriesOpen } = useAppContext();

  const handleTabChange = (tab: Tab) => {
    if (tab !== activeTab) {
      window.history.pushState({ tab }, '', `?tab=${tab}`);
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    // Initialize history state on load if not already set
    if (!window.history.state || !window.history.state.tab) {
      window.history.replaceState({ exitPrompt: true }, '');
      window.history.pushState({ tab: 'dashboard' }, '', '?tab=dashboard');
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

  useEffect(() => {
    if (pinEntry.length === 4) {
      if (pinEntry === passcode) {
        setUnlocked(true);
      } else {
        setPinError(true);
        setTimeout(() => {
          setPinEntry('');
          setPinError(false);
        }, 500);
      }
    }
  }, [pinEntry, passcode, setUnlocked]);

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
              onClick={async () => {
                if (window.PublicKeyCredential) {
                  try {
                    const challenge = new Uint8Array(32);
                    window.crypto.getRandomValues(challenge);
                    const userId = new Uint8Array(16);
                    window.crypto.getRandomValues(userId);

                    await navigator.credentials.create({
                      publicKey: {
                        challenge,
                        rp: { name: "Coin Buddy Vault" },
                        user: {
                          id: userId,
                          name: "vault_user",
                          displayName: "Vault User"
                        },
                        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                        authenticatorSelection: {
                          authenticatorAttachment: "platform", // forces TouchID / FaceID / Windows Hello
                          userVerification: "required"
                        },
                        timeout: 60000,
                        attestation: "none"
                      }
                    });
                    setUnlocked(true);
                  } catch (err) {
                    console.error('Biometric auth failed or cancelled:', err);
                    if ((err as Error).name === 'NotAllowedError') {
                      alert('Authentication failed.');
                      return;
                    }
                    setUnlocked(true);
                  }
                } else {
                  setUnlocked(true);
                }
              }}
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
              onClick={async () => {
                if (window.PublicKeyCredential) {
                  try {
                    const challenge = new Uint8Array(32);
                    window.crypto.getRandomValues(challenge);
                    const userId = new Uint8Array(16);
                    window.crypto.getRandomValues(userId);

                    await navigator.credentials.create({
                      publicKey: {
                        challenge,
                        rp: { name: "Coin Buddy Vault" },
                        user: {
                          id: userId,
                          name: "vault_user",
                          displayName: "Vault User"
                        },
                        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                        authenticatorSelection: {
                          authenticatorAttachment: "platform",
                          userVerification: "required"
                        },
                        timeout: 60000,
                        attestation: "none"
                      }
                    });
                    setUnlocked(true);
                  } catch (err) {
                    console.error('Biometric auth failed or cancelled:', err);
                    if ((err as Error).name === 'NotAllowedError') {
                      alert('Authentication failed.');
                      return;
                    }
                    setUnlocked(true);
                  }
                } else {
                  setUnlocked(true);
                }
              }}
              className="mt-6 flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
            >
              <Fingerprint className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider uppercase">Use Biometrics</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-background selection:bg-primary/30 relative overflow-x-hidden">
      <Header />
      <Navigation activeTab={activeTab} setActiveTab={handleTabChange} />
      
      <main className="pt-20 md:pl-20 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'activity' && <Activity />}
          {activeTab === 'manage' && <ManageFinances />}
          {activeTab === 'insights' && <Insights />}
          {activeTab === 'settings' && <Settings />}
        </div>
      </main>
      
      <AddTransactionModal />
      <AddAccountModal />
      <WalletSummaryModal />
      <PayCardModal />
    </div>
  );
}
