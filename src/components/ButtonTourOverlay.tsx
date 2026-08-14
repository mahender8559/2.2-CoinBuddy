import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Tab } from '../types';

export interface TourStep {
  targetId: string;
  tab: Tab;
  title: string;
  content: string;
}


function findVisibleTourTarget(targetId: string): HTMLElement | null {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour-id="${targetId}"]`));
  return elements.find(element => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }) ?? null;
}

export const TOUR_STEPS: TourStep[] = [
  { targetId: 'tour-add-transaction', tab: 'dashboard', title: 'Add Transaction', content: 'Use this button from Dashboard, Activity, or Insights to log income, expenses, or transfers.' },
  { targetId: 'tour-account-cards', tab: 'dashboard', title: 'Net Worth Breakdown', content: 'See total assets and liabilities that make up your current net worth.' },
  { targetId: 'tour-summary-widgets', tab: 'dashboard', title: 'Current Cycle', content: 'See current-cycle income, expenses, and net cash flow at a glance.' },
  { targetId: 'tour-add-account', tab: 'manage', title: 'Add Account', content: 'Create a new asset account. Liability accounts have their own Add Liability action further down the page.' },
  { targetId: 'tour-account-interactions', tab: 'manage', title: 'Manage Accounts', content: 'Edit account details, reconcile a ledger balance, update investment market value, or remove an account when allowed.' },
  { targetId: 'tour-transaction-search', tab: 'activity', title: 'Search Transactions', content: 'Search by title, category, account, event, or amount.' },
  { targetId: 'tour-transaction-filters', tab: 'activity', title: 'Filter Activity', content: 'Combine cycle, sort, event, category, type, and account filters to narrow the ledger.' },
  { targetId: 'tour-transaction-actions', tab: 'activity', title: 'Transaction Actions', content: 'Tap or click an editable transaction row to edit it. Use the delete action when the ledger entry is allowed to be removed.' },
  { targetId: 'tour-backup-now', tab: 'settings', title: 'Backup Now', content: 'Create an AES-256-GCM encrypted recovery backup after setting a backup password.' },
  { targetId: 'tour-cloud-dest', tab: 'settings', title: 'Backup Destination', content: 'Keep encrypted backups on this device or connect Google Drive.' },
  { targetId: 'tour-security-toggle', tab: 'settings', title: 'App Security', content: 'Set a passcode and optionally use supported device biometrics to protect app access.' },
];

export function ButtonTourOverlay({ activeTab, setActiveTab }: { activeTab: Tab, setActiveTab: (tab: Tab) => void }) {
  const { isButtonTourOpen, setButtonTourOpen } = useAppContext();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const step = TOUR_STEPS[currentStepIndex];

  const updateTargetRect = useCallback(() => {
    if (!step || !isButtonTourOpen) return;
    const el = findVisibleTourTarget(step.targetId);
    setTargetRect(el ? el.getBoundingClientRect() : null);
  }, [step, isButtonTourOpen]);

  useEffect(() => {
    if (!isButtonTourOpen || !step) return;
    if (activeTab !== step.tab) setActiveTab(step.tab);
    const checkAndScroll = () => {
      const el = findVisibleTourTarget(step.targetId);
      if (!el) {
        window.setTimeout(() => {
          const retry = findVisibleTourTarget(step.targetId);
          if (retry) {
            retry.scrollIntoView({ behavior: 'smooth', block: 'center' });
            window.setTimeout(updateTargetRect, 350);
          }
        }, 300);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(updateTargetRect, 350);
    };
    checkAndScroll();
  }, [isButtonTourOpen, currentStepIndex, activeTab, setActiveTab, step, updateTargetRect]);

  useEffect(() => {
    window.addEventListener('resize', updateTargetRect);
    const scrollListener = () => requestAnimationFrame(updateTargetRect);
    window.addEventListener('scroll', scrollListener, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', scrollListener, true);
    };
  }, [updateTargetRect]);

  const handleClose = () => {
    localStorage.setItem('hasCompletedButtonTour', 'true');
    setButtonTourOpen(false);
    setCurrentStepIndex(0);
  };

  const handleNext = () => {
    if (currentStepIndex < TOUR_STEPS.length - 1) setCurrentStepIndex(current => current + 1);
    else handleClose();
  };

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
    top: '50%', left: '50%', width: 0, height: 0, borderRadius: '50%',
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)', position: 'fixed', zIndex: 9998, pointerEvents: 'none',
  };

  const tooltipWidth = Math.min(320, window.innerWidth - 32);
  let tooltipTop = '50%';
  let tooltipLeft = '50%';
  let tooltipTranslate = '-50% -50%';
  if (targetRect) {
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;
    if (spaceBelow > 200) {
      tooltipTop = `${targetRect.bottom + pad + 16}px`;
      tooltipLeft = `${Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, targetRect.left + targetRect.width / 2 - tooltipWidth / 2))}px`;
      tooltipTranslate = '0 0';
    } else if (spaceAbove > 200) {
      tooltipTop = `${targetRect.top - pad - 16}px`;
      tooltipLeft = `${Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, targetRect.left + targetRect.width / 2 - tooltipWidth / 2))}px`;
      tooltipTranslate = '0 -100%';
    }
  }

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>
      <div className="absolute inset-0 z-[9997]" style={{ pointerEvents: 'auto' }} onClick={event => event.stopPropagation()} />
      <div style={spotlightStyle} />
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        style={{ position: 'fixed', top: tooltipTop, left: tooltipLeft, translate: tooltipTranslate, width: `${tooltipWidth}px`, maxWidth: 'calc(100vw - 32px)', zIndex: 9999, pointerEvents: 'auto' }}
        className="bg-surface-container-high border border-outline-variant/30 rounded-2xl shadow-2xl p-5"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Step {currentStepIndex + 1} of {TOUR_STEPS.length}</span>
            <h3 className="text-lg font-bold text-on-surface leading-tight">{step.title}</h3>
          </div>
          <button aria-label="Close tour" onClick={handleClose} className="p-1.5 -mr-1.5 -mt-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">{step.content}</p>
        <div className="flex items-center justify-between">
          <button onClick={handleClose} className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Skip Tour</button>
          <div className="flex gap-2">
            {currentStepIndex > 0 && <button aria-label="Previous tour step" onClick={() => setCurrentStepIndex(current => current - 1)} className="p-2 text-on-surface hover:bg-surface-container rounded-xl transition-colors"><ChevronLeft className="w-5 h-5" /></button>}
            <button onClick={handleNext} className="px-4 py-2 font-bold text-on-primary bg-primary hover:bg-primary/90 rounded-xl transition-transform active:scale-95 flex items-center gap-1 shadow-sm">
              {currentStepIndex === TOUR_STEPS.length - 1 ? <>Finish <Check className="w-4 h-4 ml-1" /></> : <>Next <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
