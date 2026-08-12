from pathlib import Path
import re


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label}: expected text not found in {path}')
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected exactly one match in {path}, found {text.count(old)}')
    p.write_text(text.replace(old, new, 1))

# -----------------------------------------------------------------------------
# Global app: the Manage page already has purpose-specific add controls.
# -----------------------------------------------------------------------------
replace_once(
    'src/App.tsx',
    "      {activeTab !== 'settings' && (\n        <button \n          data-tour-id=\"tour-add-transaction\"\n          onClick={() => {\n             if (activeTab === 'manage') {\n               document.dispatchEvent(new CustomEvent('openAddCategoryModal'));\n             } else {\n               setEditingTransaction(null);\n               setAddModalOpen(true);\n             }\n          }}\n          className=\"fixed bottom-24 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-primary hover:bg-primary/90 text-on-primary rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40\"\n          title={activeTab === 'manage' ? \"Add Category/Goal\" : \"Add Transaction\"}\n        >\n          <Plus className=\"w-7 h-7\" />\n        </button>\n      )}",
    "      {activeTab !== 'settings' && activeTab !== 'manage' && (\n        <button \n          data-tour-id=\"tour-add-transaction\"\n          onClick={() => {\n            setEditingTransaction(null);\n            setAddModalOpen(true);\n          }}\n          className=\"fixed bottom-24 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-primary hover:bg-primary/90 text-on-primary rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40\"\n          title=\"Add Transaction\"\n          aria-label=\"Add Transaction\"\n        >\n          <Plus className=\"w-7 h-7\" />\n        </button>\n      )}",
    'hide redundant Manage FAB',
)

# Header wording: backups can be copied to Drive, but the live ledger remains local.
replace_once('src/components/Header.tsx', '<span className="text-xs font-semibold text-on-surface-variant">Local Only</span>', '<span className="text-xs font-semibold text-on-surface-variant">Local Ledger</span>', 'header local badge')

# -----------------------------------------------------------------------------
# Dashboard: remove menu-looking decoration, duplicate review control, and
# protected/system entries from the editable recent activity list.
# -----------------------------------------------------------------------------
p = Path('src/components/Dashboard.tsx')
text = p.read_text()
text = text.replace(', MoreHorizontal, CheckCircle2', ', CheckCircle2')
text = text.replace('          <MoreHorizontal aria-hidden="true" className="w-5 h-5 text-on-surface-variant/50" />\n', '')
old_pending = '''              <div className="flex items-start gap-4 flex-grow min-w-0">\n                <button\n                  onClick={() => { setPendingConfirmTx(tx); setPendingConfirmDate(tx.date); }}\n                  title="Review this recurring transaction"\n                  className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-primary/20 flex items-center justify-center shrink-0 transition-colors text-on-surface-variant hover:text-primary cursor-pointer group mt-0.5"\n                >\n                   <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />\n                </button>\n                <div className="flex-grow min-w-0">'''
new_pending = '''              <div className="flex items-start gap-4 flex-grow min-w-0">\n                <div className="flex-grow min-w-0">'''
if old_pending not in text:
    raise SystemExit('dashboard duplicate review control not found')
text = text.replace(old_pending, new_pending, 1)
text = text.replace("{transactions.filter(t => t.is_verified !== 0).slice(0, 4).map((tx) => {", "{transactions.filter(t => t.is_verified !== 0 && ['income', 'expense', 'transfer'].includes(t.type)).slice(0, 4).map((tx) => {")
text = text.replace("          {transactions.length === 0 && (\n            <div className=\"p-5 text-center text-sm text-on-surface-variant\">No recent activity.</div>\n          )}", "          {transactions.filter(t => t.is_verified !== 0 && ['income', 'expense', 'transfer'].includes(t.type)).length === 0 && (\n            <div className=\"p-5 text-center text-sm text-on-surface-variant\">No recent activity.</div>\n          )}")
p.write_text(text)

# -----------------------------------------------------------------------------
# Manage: keep one explicit Add Category path, remove fake timestamp, and make
# rollover match its real implementation (budget allowance carry, no money move).
# -----------------------------------------------------------------------------
p = Path('src/components/ManageFinances.tsx')
text = p.read_text()
text = text.replace("  const [editRolloverAccountId, setEditRolloverAccountId] = useState<string | undefined>(undefined);\n", '')
text = re.sub(r"\n\s*setEditRolloverAccountId\([^\n]*\);", '', text)
text = text.replace(', rolloverAccountId: editIsRollover ? editRolloverAccountId : undefined, tags:', ', rolloverAccountId: undefined, tags:')
text = text.replace(', rolloverAccountId: editIsRollover ? editRolloverAccountId : undefined, affordabilityClass', ', rolloverAccountId: undefined, affordabilityClass')
old_header = '''          <div className="flex items-center justify-between mb-8">\n            <div className="flex items-center gap-3">\n              <ShieldCheck className="w-8 h-8 text-primary" />\n              <h1 className="text-2xl font-bold text-primary-container-on">Categories & Goals</h1>\n            </div>\n            {activeTab === 'Categories' && (\n              <button\n                aria-label="Add category"\n                onClick={() => {\n                  setEditingId(null);\n                  setEditName('');\n                  setEditIcon('ShoppingBag');\n                  setEditType('expense');\n                  setEditAffordabilityClass('NORMAL');\n                  setEditBudget(0);\n                  setEditIsRollover(false);\n                  setIsEditingModalOpen(true);\n                }}\n                className="p-2 text-on-surface hover:bg-surface-container-high rounded-full transition-colors"\n              >\n                <Plus className="w-6 h-6" />\n              </button>\n            )}\n          </div>'''
new_header = '''          <div className="mb-8 flex items-center gap-3">\n            <ShieldCheck className="w-8 h-8 text-primary" />\n            <h1 className="text-2xl font-bold text-primary-container-on">Categories & Goals</h1>\n          </div>'''
if old_header not in text:
    raise SystemExit('manage duplicate header add button block not found')
text = text.replace(old_header, new_header, 1)
text = text.replace('''              <div className="mt-4 flex items-center gap-2">\n                <div className="text-xs text-on-surface-variant">\n                  <p>Updated just now</p>\n                </div>\n              </div>\n''', '')
old_rollover = '''              {editType === 'expense' && (\n                <>\n                  <label className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3 cursor-pointer">\n                    <span><span className="block text-sm font-semibold text-on-surface">Enable Rollover / Sinking Fund</span><span className="block text-xs text-on-surface-variant mt-0.5">Carry unused budget into the next cycle.</span></span>\n                    <input type="checkbox" checked={editIsRollover} onChange={event => setEditIsRollover(event.target.checked)} className="h-5 w-5 accent-primary" />\n                  </label>\n                  \n                  {editIsRollover && (\n                    <div className="space-y-2">\n                      <label className="block text-sm font-semibold text-on-surface">Where should leftover funds go?</label>\n                      <select \n                        value={editRolloverAccountId || ''} \n                        onChange={(e) => setEditRolloverAccountId(e.target.value || undefined)}\n                        className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary/50"\n                      >\n                        <option value="">Select an account</option>\n                        {accounts\n                          .filter(acc => acc.type === 'asset' && acc.group && !['Cash', 'Physical Assets'].includes(acc.group))\n                          .map(acc => (\n                            <option key={acc.id} value={acc.id}>\n                              {acc.name} ({acc.group})\n                            </option>\n                          ))}\n                      </select>\n                    </div>\n                  )}\n                </>\n              )}'''
new_rollover = '''              {editType === 'expense' && (\n                <label className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3 cursor-pointer">\n                  <span><span className="block text-sm font-semibold text-on-surface">Carry unused budget forward</span><span className="block text-xs text-on-surface-variant mt-0.5">Add unused budget allowance to this category's next financial cycle. This does not move money between accounts.</span></span>\n                  <input type="checkbox" checked={editIsRollover} onChange={event => setEditIsRollover(event.target.checked)} className="h-5 w-5 accent-primary" />\n                </label>\n              )}'''
if old_rollover not in text:
    raise SystemExit('manage rollover block not found')
text = text.replace(old_rollover, new_rollover, 1)
p.write_text(text)

# -----------------------------------------------------------------------------
# Accounts: a loan is not an investment market-value asset; also remove a false
# local-storage encryption footer (backup encryption is separate).
# -----------------------------------------------------------------------------
p = Path('src/components/Cards.tsx')
text = p.read_text()
text = text.replace("                    {isLoan && <button onClick={() => setAdjustmentTarget({ account, kind: 'MARKET_ADJUSTMENT' })} className=\"px-2 py-1.5 text-xs font-bold text-emerald-500 hover:bg-emerald-500/10 rounded-lg\" title=\"Update market value\">Market</button>}\n", '')
text = text.replace('''      <div className="flex items-center justify-center gap-2 pt-8 pb-4 opacity-50">\n        <HardDrive className="w-3.5 h-3.5 text-on-surface-variant" />\n        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Local Storage Encryption Active</span>\n      </div>\n\n''', '')
p.write_text(text)

# -----------------------------------------------------------------------------
# Activity: accurate labels/classification; rows already edit on tap/click, so
# remove duplicate edit icons while retaining delete actions.
# -----------------------------------------------------------------------------
p = Path('src/components/Activity.tsx')
text = p.read_text()
text = text.replace("return catObj?.group === 'Savings';", "return catObj?.affordabilityClass === 'SAVINGS' || catObj?.group === 'Savings';")
text = text.replace('<option value="notes-asc">Notes (A to Z)</option>', '<option value="notes-asc">Title (A to Z)</option>')
text = text.replace('<option value="notes-desc">Notes (Z to A)</option>', '<option value="notes-desc">Title (Z to A)</option>')
# Desktop edit icon block
text = re.sub(r'''\n\s*\{onEdit && \(\n\s*<button\n\s*onClick=\{\(e\) => \{\n\s*e\.stopPropagation\(\);\n\s*onEdit\(\);\n\s*\}\}\n\s*className="p-1\.5 hover:bg-surface-variant text-on-surface-variant rounded-lg transition-all"\n\s*title="Edit Transaction"\n\s*>\n\s*<svg[\s\S]*?</svg>\n\s*</button>\n\s*\)\}''', '', text, count=1)
# Mobile edit icon block
text = re.sub(r'''\n\s*\{onEdit && \(\n\s*<button\n\s*onClick=\{\(e\) => \{\n\s*e\.stopPropagation\(\);\n\s*onEdit\(\);\n\s*\}\}\n\s*className="p-1\.5 text-on-surface-variant bg-surface-variant rounded-lg shrink-0"\n\s*title="Edit Transaction"\n\s*>\n\s*<svg[\s\S]*?</svg>\n\s*</button>\n\s*\)\}''', '', text, count=1)
p.write_text(text)

# -----------------------------------------------------------------------------
# Insights: remove redundant security badge and fake hard-coded advice; tips are
# informational cards, not clickable controls.
# -----------------------------------------------------------------------------
p = Path('src/components/Insights.tsx')
text = p.read_text()
text = text.replace("return catObj?.affordabilityClass !== 'SAVINGS' && catObj?.group !== 'Savings';", "return catObj?.affordabilityClass !== 'SAVINGS' && catObj?.group !== 'Savings';")
# Remove the hardcoded savings-potential tip.
text = re.sub(r'''\n\s*tips\.push\(\{\n\s*icon: PiggyBank,\n\s*color: 'tertiary',\n\s*title: 'Savings Potential',\n\s*desc: `Setting aside \$\{formatCurrency\(20\)\}/week could fund an extra \$\{formatCurrency\(80\)\} to your savings goal by next month, \$\{firstName\}\.`,\n\s*\}\);''', '', text, count=1)
old_badge = '''        <div className="flex items-center gap-2 bg-surface-container-low px-4 py-2 rounded-xl border border-outline-variant/30">\n          <ShieldCheck className="w-4 h-4 text-primary" />\n          <span className="text-xs font-medium text-on-surface-variant">Data stored securely on this device</span>\n        </div>\n'''
text = text.replace(old_badge, '')
text = text.replace(' shadow-sm hover:translate-x-1 transition-transform cursor-pointer border-y ', ' shadow-sm border-y ')
p.write_text(text)

# -----------------------------------------------------------------------------
# Wallet summary: only actual Bank/Cash accounts belong in liquid summary.
# -----------------------------------------------------------------------------
p = Path('src/components/WalletSummaryModal.tsx')
text = p.read_text()
text = text.replace('  const { isWalletModalOpen, setWalletModalOpen, formatCurrency, accounts, creditCards } = useAppContext();', '  const { isWalletModalOpen, setWalletModalOpen, formatCurrency, accounts } = useAppContext();')
old_classify = '''  // Classify accounts\n  const cashAccounts = accounts.filter(a => !a.is_archived && a.type === 'asset' && (a.id === 'cash' || a.name.toLowerCase().includes('cash') || a.group?.toLowerCase().includes('cash')));\n  const bankAccounts = accounts.filter(a => !a.is_archived && a.type === 'asset' && !(a.id === 'cash' || a.name.toLowerCase().includes('cash') || a.group?.toLowerCase().includes('cash')));\n  const liabilityAccounts = accounts.filter(a => !a.is_archived && a.type === 'liability');'''
new_classify = '''  // Wallet Summary is intentionally liquid-only: investments and physical\n  // assets belong in net worth, not in the cash/bank amount available today.\n  const activeAssets = accounts.filter(a => !a.is_archived && a.type === 'asset');\n  const accountKind = (value?: string) => (value ?? '').trim().toLowerCase();\n  const cashAccounts = activeAssets.filter(a => {\n    const kind = accountKind(a.group);\n    return a.id === 'cash' || kind === 'cash' || kind === 'cash wallet' || kind === 'wallet';\n  });\n  const bankAccounts = activeAssets.filter(a => {\n    const kind = accountKind(a.group);\n    return kind === 'bank' || kind === 'bank account';\n  });\n  const liabilityAccounts = accounts.filter(a => !a.is_archived && a.type === 'liability');'''
if old_classify not in text:
    raise SystemExit('wallet classification block not found')
text = text.replace(old_classify, new_classify, 1)
text = re.sub(r'''\n\s*<div className="flex items-center justify-center gap-2 pt-3 border-t border-outline-variant/10 opacity-60 text-xs shrink-0">\n\s*<ShieldCheck className="w-4 h-4 text-primary" />\n\s*<span className="text-\[10px\] font-bold text-on-surface-variant uppercase tracking-widest">Local Secure Vault</span>\n\s*</div>''', '', text, count=1)
p.write_text(text)

# -----------------------------------------------------------------------------
# Goals: Priority was persisted but not used by planner math or UI decisions.
# Keep the internal field/default for backward compatibility, remove user input.
# -----------------------------------------------------------------------------
p = Path('src/components/GoalsPanel.tsx')
text = p.read_text().replace("import type { SavingsGoal, SavingsGoalPriority, SavingsGoalType } from '../types';", "import type { SavingsGoal, SavingsGoalType } from '../types';")
old_goal_grid = '''              <div className="grid grid-cols-2 gap-3">\n                <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Goal type</span><select value={draft.type} onChange={event => setDraft(current => ({ ...current, type: event.target.value as SavingsGoalType }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none">{Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>\n                <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Priority</span><select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value as SavingsGoalPriority }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none"><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label>\n              </div>'''
new_goal_grid = '''              <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Goal type</span><select value={draft.type} onChange={event => setDraft(current => ({ ...current, type: event.target.value as SavingsGoalType }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none">{Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>'''
if old_goal_grid not in text:
    raise SystemExit('goal priority input block not found')
text = text.replace(old_goal_grid, new_goal_grid, 1)
p.write_text(text)

# -----------------------------------------------------------------------------
# Onboarding: accurate ledger/encryption claims.
# -----------------------------------------------------------------------------
p = Path('src/components/OnboardingModal.tsx')
text = p.read_text()
text = text.replace('Log your income, expenses, and cross-account transfers. Our robust dual-entry system ensures accurate ledger balances.', 'Log income, expenses, and cross-account transfers. Centralized ledger rules keep account effects and computed balances consistent.')
text = text.replace('Your data stays with you. Enjoy AES-256-GCM encrypted local storage and optional cloud synchronization for ultimate peace of mind.', 'Your live ledger stays local to this device. Backup files use AES-256-GCM encryption and can optionally be copied to Google Drive.')
p.write_text(text)

# -----------------------------------------------------------------------------
# Interactive tour: remove the stale duplicate password writer and refresh copy.
# -----------------------------------------------------------------------------
Path('src/components/ButtonTourOverlay.tsx').write_text(r'''import React, { useEffect, useState, useCallback } from 'react';
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
    const el = document.querySelector(`[data-tour-id="${step.targetId}"]`);
    setTargetRect(el ? el.getBoundingClientRect() : null);
  }, [step, isButtonTourOpen]);

  useEffect(() => {
    if (!isButtonTourOpen || !step) return;
    if (activeTab !== step.tab) setActiveTab(step.tab);
    const checkAndScroll = () => {
      const el = document.querySelector(`[data-tour-id="${step.targetId}"]`);
      if (!el) {
        window.setTimeout(() => {
          const retry = document.querySelector(`[data-tour-id="${step.targetId}"]`);
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
''')

# Update first-use E2E for the tour no longer owning backup-password setup.
p = Path('e2e/ui-smoke.spec.ts')
text = p.read_text()
text = text.replace("test('first-use setup runs walkthrough, password step, then spotlight tour once'", "test('first-use setup runs walkthrough then spotlight tour once'")
text = text.replace("\n  await expect(page.getByRole('heading', { name: 'Set Backup Password' })).toBeVisible();\n  await page.getByRole('button', { name: 'Skip For Now' }).click();", '')
p.write_text(text)

# New clutter regression: assert removed/misleading controls do not return.
Path('e2e/cross-page-clutter.spec.ts').write_text(r'''import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, tab = 'dashboard') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto(`/?tab=${tab}`);
  return errors;
}

test('Manage does not expose duplicate or unwired add/market/sinking-fund controls', async ({ page }) => {
  const errors = await prepare(page, 'manage');
  await expect(page.getByRole('button', { name: 'Add Transaction' })).toHaveCount(0);
  await expect(page.getByText('Local Storage Encryption Active', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Market', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await expect(page.getByText('Updated just now', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'ADD CATEGORY', exact: true }).click();
  await expect(page.getByText('Enable Rollover / Sinking Fund', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Where should leftover funds go?', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Carry unused budget forward', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Activity sort labels and row actions do not present duplicate edit controls', async ({ page }) => {
  const errors = await prepare(page, 'activity');
  await expect(page.getByRole('option', { name: 'Title (A to Z)' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Notes (A to Z)' })).toHaveCount(0);
  await expect(page.getByTitle('Edit Transaction')).toHaveCount(0);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Insights removes fake clickable savings advice and duplicate security badge', async ({ page }) => {
  const errors = await prepare(page, 'insights');
  await expect(page.getByText('Data stored securely on this device', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Savings Potential', { exact: true })).toHaveCount(0);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('first-use tour goes directly from onboarding to UI spotlight without writing backup password', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('coinbuddy_onboarding_seen');
    localStorage.removeItem('hasCompletedButtonTour');
    localStorage.removeItem('coinbuddy_backup_config');
  });
  await page.reload();
  for (let step = 0; step < 4; step += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Get Started' }).click();
  await expect(page.getByRole('heading', { name: 'Set Backup Password' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Add Transaction' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('coinbuddy_backup_config'))).toBeNull();
});
''')

print('Applied cross-page clutter cleanup.')
