import { Activity, Check, ChevronLeft, ChevronRight, Database, Lock, Shield, Wallet, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function OnboardingModal() {
  const { isOnboardingOpen, setOnboardingOpen, setButtonTourOpen } = useAppContext();
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOnboardingOpen) return null;

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to CoinBuddy',
      description: 'Your local-first financial ledger with encrypted backups and consistency checks. Track accounts, transactions, planning, and shared finances from one ledger.',
      icon: Wallet,
    },
    {
      id: 'accounts',
      title: 'Accounts & Relational Ledger',
      description: 'Create assets and liabilities in a unified view. Computed balances come from ledger activity, with integrity checks available to detect inconsistencies.',
      icon: Database,
    },
    {
      id: 'transactions',
      title: 'Transactions & Transfers',
      description: 'Log income, expenses, and cross-account transfers. Centralized ledger rules keep account effects and computed balances consistent.',
      icon: Activity,
    },
    {
      id: 'loans',
      title: 'Loans & Liability Tracking',
      description: 'Specialized math support for bullet payments, EMI schedules, and variable interest loans. Track what you owe and how repayment terms change.',
      icon: Shield,
    },
    {
      id: 'security',
      title: 'Encrypted Backups & Security',
      description: 'Your live ledger stays local to this device. Backup files use AES-256-GCM encryption and can optionally be copied to Google Drive.',
      icon: Lock,
    },
  ];

  const handleClose = () => {
    const isFirstUse = localStorage.getItem('coinbuddy_onboarding_seen') !== 'true';
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    setOnboardingOpen(false);
    setCurrentStep(0);
    if (isFirstUse && localStorage.getItem('hasCompletedButtonTour') !== 'true') setButtonTourOpen(true);
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) setCurrentStep(step => step + 1);
    else handleClose();
  };

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(step => step - 1);
  };

  const step = steps[currentStep];
  const StepIcon = step.icon;

  return (
    <V35ModalFrame size="lg" testId="onboarding-sheet" labelledBy="onboarding-title">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant/25 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/logo.png" alt="CoinBuddy" className="h-9 w-9 rounded-xl object-cover ring-1 ring-primary/20" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">CoinBuddy guide</p>
            <p className="text-xs text-on-surface-variant">Step {currentStep + 1} of {steps.length}</p>
          </div>
        </div>
        <button type="button" aria-label="Close walkthrough" onClick={handleClose} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8 sm:py-9">
        <AnimatePresence mode="wait">
          <motion.div key={step.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="mx-auto max-w-xl">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <StepIcon className="h-6 w-6" />
            </div>
            <h2 id="onboarding-title" className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">{step.title}</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-on-surface-variant sm:text-base sm:leading-7">{step.description}</p>

            <div className="mt-7 rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">What to remember</p>
              <p className="mt-2 text-sm leading-6 text-on-surface">
                {step.id === 'welcome' ? 'Start with your real accounts, then let CoinBuddy derive balances and planning views from the ledger.' :
                  step.id === 'accounts' ? 'Accounts represent where money or debt actually lives; people and categories remain separate.' :
                  step.id === 'transactions' ? 'Record real money movement once. Transfers move value between accounts without becoming income or spending.' :
                  step.id === 'loans' ? 'Loan balances, interest and repayment schedules stay linked so debt views remain financially consistent.' :
                  'Your live financial data remains local-first. Use encrypted backups when you need portability or recovery.'}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="shrink-0 border-t border-outline-variant/20 bg-surface-container/95 px-5 py-4 backdrop-blur sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5" aria-label={`Walkthrough step ${currentStep + 1} of ${steps.length}`}>
            {steps.map((item, index) => <span key={item.id} aria-hidden="true" className={`h-1.5 rounded-full transition-all ${index === currentStep ? 'w-7 bg-primary' : 'w-1.5 bg-outline-variant/45'}`} />)}
          </div>
          <div className="flex items-center gap-2">
            {currentStep > 0 ? <button type="button" onClick={prevStep} className="v35-focus-ring flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high"><ChevronLeft className="h-4 w-4" /> Back</button> : null}
            <button type="button" onClick={nextStep} className="v35-focus-ring flex min-h-10 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary/90">
              {currentStep === steps.length - 1 ? <><span>Get Started</span><Check className="h-4 w-4" /></> : <><span>Next</span><ChevronRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </footer>
    </V35ModalFrame>
  );
}
