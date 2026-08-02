import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Check, Sparkles, Lock, ShieldCheck } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Tab } from '../types';

export interface TourStep {
  targetId: string;
  tab: Tab;
  title: string;
  content: string;
}

export const TOUR_STEPS: TourStep[] = [
  { targetId: 'tour-add-transaction', tab: 'dashboard', title: 'Add Transaction', content: 'Use this floating button anywhere to quickly log income, expenses, or transfers.' },
  { targetId: 'tour-account-cards', tab: 'dashboard', title: 'Account Selector', content: 'Quickly switch between your accounts to see their balances and recent activity.' },
  { targetId: 'tour-summary-widgets', tab: 'dashboard', title: 'Summary Widgets', content: 'Get a quick overview of your financial health, spending trends, and loan summaries.' },
  { targetId: 'tour-add-account', tab: 'manage', title: 'Add Account', content: 'Create new asset or liability accounts to keep your ledger comprehensive.' },
  { targetId: 'tour-account-interactions', tab: 'manage', title: 'Manage Accounts', content: 'Click on any account to edit details, adjust opening balances, or archive it.' },
  { targetId: 'tour-transaction-search', tab: 'activity', title: 'Search Transactions', content: 'Find specific transactions instantly using the search bar.' },
  { targetId: 'tour-transaction-filters', tab: 'activity', title: 'Filter Toggles', content: 'Filter your activity by date, type, or specific accounts.' },
  { targetId: 'tour-transaction-actions', tab: 'activity', title: 'Quick Actions', content: 'Edit, delete, or use undo/redo capabilities directly from the transaction list.' },
  { targetId: 'tour-backup-now', tab: 'settings', title: 'Backup Now', content: 'Secure your data with AES-256-GCM encryption and download a local copy.' },
  { targetId: 'tour-cloud-dest', tab: 'settings', title: 'Cloud Destination', content: 'Sync your encrypted backups to Google Drive or other cloud providers.' },
  { targetId: 'tour-security-toggle', tab: 'settings', title: 'App Security', content: 'Enable biometric authentication or passcode to lock your financial data.' },
];

export function ButtonTourOverlay({ activeTab, setActiveTab }: { activeTab: Tab, setActiveTab: (tab: Tab) => void }) {
  const { isButtonTourOpen, setButtonTourOpen } = useAppContext();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Post-tour backup password setup modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPwdInput, setNewPwdInput] = useState('');
  const [confirmPwdInput, setConfirmPwdInput] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  const step = TOUR_STEPS[currentStepIndex];

  const updateTargetRect = useCallback(() => {
    if (!step || !isButtonTourOpen) return;
    const el = document.querySelector(`[data-tour-id="${step.targetId}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [step, isButtonTourOpen]);

  useEffect(() => {
    if (isButtonTourOpen && step) {
      if (activeTab !== step.tab) {
        setActiveTab(step.tab);
      }
      
      const checkAndScroll = () => {
        const el = document.querySelector(`[data-tour-id="${step.targetId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(updateTargetRect, 350);
        } else {
          setTimeout(() => {
            const elRetry = document.querySelector(`[data-tour-id="${step.targetId}"]`);
            if (elRetry) {
              elRetry.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(updateTargetRect, 350);
            }
          }, 300);
        }
      };
      
      checkAndScroll();
    }
  }, [isButtonTourOpen, currentStepIndex, activeTab, setActiveTab, step, updateTargetRect]);

  useEffect(() => {
    window.addEventListener('resize', updateTargetRect);
    const scrollListener = () => {
      requestAnimationFrame(updateTargetRect);
    };
    window.addEventListener('scroll', scrollListener, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', scrollListener, true);
    };
  }, [updateTargetRect]);

  const handleNext = () => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex(curr => curr + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(curr => curr - 1);
    }
  };

  const handleClose = () => {
    localStorage.setItem('hasCompletedButtonTour', 'true');
    setButtonTourOpen(false);
    setCurrentStepIndex(0);
    const savedConfig = localStorage.getItem('coinbuddy_backup_config');
    try {
      const config = savedConfig ? JSON.parse(savedConfig) : null;
      setShowPasswordModal(!config?.hasPassword || !config?.backupPassword);
    } catch {
      setShowPasswordModal(true);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const generated = `CB-${rand}`;
    setNewPwdInput(generated);
    setConfirmPwdInput(generated);
    setPwdError(null);
  };

  const handleSaveBackupPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);

    if (!newPwdInput) {
      setPwdError('Please enter or generate a password.');
      return;
    }

    if (newPwdInput.length < 4) {
      setPwdError('Password must be at least 4 characters long.');
      return;
    }

    if (newPwdInput !== confirmPwdInput) {
      setPwdError('Passwords do not match.');
      return;
    }

    // Save the master password used exclusively for encrypted backups.
    try {
      const savedConfig = localStorage.getItem('coinbuddy_backup_config');
      const parsed = savedConfig ? JSON.parse(savedConfig) : {};
      localStorage.setItem('coinbuddy_backup_config', JSON.stringify({
        ...parsed,
        hasPassword: true,
        backupPassword: newPwdInput
      }));
    } catch (err) {}

    setPwdSuccess('Backup password saved. You can now download encrypted backups.');
    setTimeout(() => {
      setPwdSuccess(null);
      setShowPasswordModal(false);
      setNewPwdInput('');
      setConfirmPwdInput('');
    }, 2000);
  };

  if (showPasswordModal) {
    return (
      <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-surface-container rounded-3xl w-full max-w-md p-6 border border-outline-variant/30 shadow-2xl space-y-5 relative">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                    <h3 className="font-bold text-lg text-on-surface">Set Backup Password</h3>
                <p className="text-xs text-on-surface-variant">Post-Tour Security Setup</p>
              </div>
            </div>
            <button 
              onClick={() => setShowPasswordModal(false)}
              className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/30 p-3.5 rounded-2xl text-xs text-on-surface-variant flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Set or generate the passphrase that encrypts your backup files. Keep it safe; it is required to restore your data.
            </p>
          </div>

          {pwdError && (
            <div className="p-3 bg-error/10 border border-error/20 text-error text-xs font-semibold rounded-xl">
              {pwdError}
            </div>
          )}

          {pwdSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{pwdSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSaveBackupPassword} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  Backup Password
                </label>
                <button
                  type="button"
                  onClick={generateRandomPassword}
                  className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Auto-Generate
                </button>
              </div>
              <input
                type="text"
                required
                value={newPwdInput}
                onChange={(e) => setNewPwdInput(e.target.value)}
                placeholder="e.g. CB-8F92A1"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface font-numeric font-bold focus:outline-none focus:border-primary/50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <input
                type="text"
                required
                value={confirmPwdInput}
                onChange={(e) => setConfirmPwdInput(e.target.value)}
                placeholder="Re-enter password"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface font-numeric font-bold focus:outline-none focus:border-primary/50"
              />
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="w-1/2 py-3 rounded-xl border border-outline-variant/30 text-on-surface-variant font-bold text-xs hover:bg-surface-variant transition-colors"
              >
                Skip For Now
              </button>
              <button
                type="submit"
                className="w-1/2 py-3 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary/90 transition-colors shadow-sm active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Save Password</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!isButtonTourOpen || !step) return null;

  const pad = 8;
  const spotlightStyle: React.CSSProperties = targetRect ? {
    top: targetRect.top - pad,
    left: targetRect.left - pad,
    width: targetRect.width + pad * 2,
    height: targetRect.height + pad * 2,
    borderRadius: '12px',
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'fixed',
    zIndex: 9998,
    pointerEvents: 'none',
  } : {
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
    borderRadius: '50%',
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'fixed',
    zIndex: 9998,
    pointerEvents: 'none',
  };

  let tooltipTop = '50%';
  let tooltipLeft = '50%';
  let tooltipTransform = 'translate(-50%, -50%)';

  if (targetRect) {
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;
    
    if (spaceBelow > 200) {
      tooltipTop = `${targetRect.bottom + pad + 16}px`;
      tooltipLeft = `${Math.max(16, Math.min(window.innerWidth - 300 - 16, targetRect.left + targetRect.width / 2 - 150))}px`;
      tooltipTransform = 'none';
    } else if (spaceAbove > 200) {
      tooltipTop = `${targetRect.top - pad - 16}px`;
      tooltipLeft = `${Math.max(16, Math.min(window.innerWidth - 300 - 16, targetRect.left + targetRect.width / 2 - 150))}px`;
      tooltipTransform = 'translateY(-100%)';
    } else {
      tooltipTop = '50%';
      tooltipLeft = '50%';
      tooltipTransform = 'translate(-50%, -50%)';
    }
  }

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>
      <div className="absolute inset-0 z-[9997]" style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()} />
      <div style={spotlightStyle} />

      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'fixed',
          top: tooltipTop,
          left: tooltipLeft,
          transform: tooltipTransform,
          width: '320px',
          maxWidth: 'calc(100vw - 32px)',
          zIndex: 9999,
          pointerEvents: 'auto'
        }}
        className="bg-surface-container-high border border-outline-variant/30 rounded-2xl shadow-2xl p-5"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-primary uppercase tracking-wider mb-1">
              Step {currentStepIndex + 1} of {TOUR_STEPS.length}
            </span>
            <h3 className="text-lg font-bold text-on-surface leading-tight">
              {step.title}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 -mr-1.5 -mt-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
          {step.content}
        </p>

        <div className="flex items-center justify-between">
          <button
            onClick={handleClose}
            className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Skip Tour
          </button>

          <div className="flex gap-2">
            {currentStepIndex > 0 && (
              <button
                onClick={handlePrev}
                className="p-2 text-on-surface hover:bg-surface-container rounded-xl transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            
            <button
              onClick={handleNext}
              className="px-4 py-2 font-bold text-on-primary bg-primary hover:bg-primary/90 rounded-xl transition-transform active:scale-95 flex items-center gap-1 shadow-sm"
            >
              {currentStepIndex === TOUR_STEPS.length - 1 ? (
                <>Finish <Check className="w-4 h-4 ml-1" /></>
              ) : (
                <>Next <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
