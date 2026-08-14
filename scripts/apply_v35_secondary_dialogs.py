from pathlib import Path

profile = r'''import React, { useRef, useState } from 'react';
import { Camera, UserRound, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function EditProfileModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { profile, setProfile } = useAppContext();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    setProfile({ ...profile, name, avatar });
    onClose();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = loadEvent => {
      if (typeof loadEvent.target?.result === 'string') setAvatar(loadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <V35ModalFrame size="sm" testId="profile-edit-sheet" labelledBy="profile-edit-title" panelClassName="overflow-y-auto">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant/25 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 id="profile-edit-title" className="text-lg font-semibold text-on-surface">Edit Profile</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">Profile details stay on this device.</p>
          </div>
        </div>
        <button type="button" aria-label="Close profile editor" onClick={onClose} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="flex items-center gap-4 rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
          <div className="relative shrink-0">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-high text-2xl font-semibold text-on-surface-variant">
              {avatar ? <img src={avatar} alt="Profile" className="h-full w-full object-cover" /> : (name.trim().charAt(0) || 'C')}
            </div>
            <button type="button" aria-label="Change profile photo" onClick={() => fileInputRef.current?.click()} className="v35-focus-ring absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant/25 bg-primary text-on-primary shadow-lg">
              <Camera className="h-4 w-4" />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">Profile picture</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">Choose an image from this device. It remains part of your local CoinBuddy profile.</p>
          </div>
        </div>

        <div>
          <label htmlFor="profile-full-name" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Full Name</label>
          <input id="profile-full-name" aria-label="Full Name" type="text" value={name} onChange={event => setName(event.target.value)} className="v35-focus-ring w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface" placeholder="Your name" />
        </div>
      </div>

      <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-outline-variant/20 bg-surface-container/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onClose} className="v35-focus-ring min-h-11 rounded-xl border border-outline-variant/30 px-4 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high sm:min-w-24">Cancel</button>
        <button type="button" onClick={handleSave} disabled={!name.trim()} className="v35-focus-ring min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">Save Changes</button>
      </footer>
    </V35ModalFrame>
  );
}
'''

onboarding = r'''import { Activity, Check, ChevronLeft, ChevronRight, Database, Lock, Shield, Wallet, X } from 'lucide-react';
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
      description: 'Your offline-first, highly secure financial ledger. Take complete control over your wealth with advanced tracking and zero-drift relational balances.',
      icon: Wallet,
    },
    {
      id: 'accounts',
      title: 'Accounts & Relational Ledger',
      description: 'Create assets, liabilities, and track everything in a unified view. Real-time computed views ensure absolutely zero balance drift.',
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
      description: 'Specialized math support for bullet payments, EMI schedules, and variable interest loans. Know exactly how much you owe.',
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
'''

widget = r'''import { useState } from 'react';
import { Building2, ChevronLeft, List, Plus, Tag, TrendingUp, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';
import type { Account, Category } from '../types';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function WidgetModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { categories, accounts, addWidget, widgets } = useAppContext();
  const [step, setStep] = useState<'type' | 'select'>('type');
  const [type, setType] = useState<'category' | 'asset' | 'liability' | null>(null);

  if (!isOpen) return null;

  const handleSelectType = (nextType: 'category' | 'asset' | 'liability') => {
    setType(nextType);
    setStep('select');
  };

  const handleAddWidget = (targetId: string) => {
    if (!type) return;
    addWidget({ type, targetId });
    onClose();
    window.setTimeout(() => {
      setStep('type');
      setType(null);
    }, 300);
  };

  const options = type === 'category'
    ? categories.filter(category => !widgets.find(widget => widget.type === 'category' && widget.targetId === category.id))
    : type === 'asset' || type === 'liability'
      ? accounts.filter(account => !account.is_archived && account.type === type && !widgets.find(widget => widget.type === type && widget.targetId === account.id))
      : [];

  const title = step === 'type' ? 'Add Widget' : `Select ${type === 'category' ? 'Category' : type === 'asset' ? 'Asset' : 'Liability'}`;

  return (
    <V35ModalFrame size="sm" testId="widget-config-sheet" labelledBy="widget-config-title">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant/25 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {step === 'select' ? <button type="button" aria-label="Back to widget types" onClick={() => setStep('type')} className="v35-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><ChevronLeft className="h-5 w-5" /></button> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Plus className="h-4 w-4" /></span>}
          <div className="min-w-0">
            <h2 id="widget-config-title" className="truncate text-lg font-semibold text-on-surface">{title}</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">{step === 'type' ? 'Pin one useful number to your Dashboard.' : 'Choose the item you want to keep visible.'}</p>
          </div>
        </div>
        <button type="button" aria-label="Close widget configuration" onClick={onClose} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"><X className="h-5 w-5" /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        {step === 'type' ? (
          <div className="space-y-2">
            <WidgetTypeButton label="Category Spending" description="Watch spending against one category." icon={Tag} onClick={() => handleSelectType('category')} />
            <WidgetTypeButton label="Asset Account" description="Keep an asset balance in view." icon={TrendingUp} onClick={() => handleSelectType('asset')} />
            <WidgetTypeButton label="Liability Account" description="Keep a debt balance in view." icon={Building2} onClick={() => handleSelectType('liability')} />
          </div>
        ) : options.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant/35 bg-surface-container-low px-5 py-10 text-center">
            <p className="text-sm font-semibold text-on-surface">Everything here is already pinned.</p>
            <p className="mt-1 text-xs text-on-surface-variant">Go back and choose another widget type.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {options.map((option: Account | Category) => {
              const Icon = type === 'category' && 'icon' in option ? icons[option.icon as keyof typeof icons] || List : type === 'asset' ? TrendingUp : Building2;
              return (
                <button key={option.id} type="button" aria-label={`Add widget ${option.name}`} onClick={() => handleAddWidget(option.id)} className="v35-focus-ring flex min-h-14 w-full items-center gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3.5 py-3 text-left transition-colors hover:bg-surface-container-high">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{option.name}</span>
                  <Plus className="h-4 w-4 shrink-0 text-on-surface-variant" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </V35ModalFrame>
  );
}

function WidgetTypeButton({ label, description, icon: Icon, onClick }: { label: string; description: string; icon: typeof Tag; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="v35-focus-ring flex min-h-[72px] w-full items-center gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3.5 py-3 text-left transition-colors hover:bg-surface-container-high">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-on-surface">{label}</span><span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{description}</span></span>
      <Plus className="h-4 w-4 shrink-0 text-on-surface-variant" />
    </button>
  );
}
'''

Path('src/components/EditProfileModal.tsx').write_text(profile)
Path('src/components/OnboardingModal.tsx').write_text(onboarding)
Path('src/components/WidgetModal.tsx').write_text(widget)
print('Applied V3.5 secondary dialog refresh')
