import { useMemo, useState } from 'react';
import { Edit2, Plus, ShieldCheck, Target, Trash2, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { SavingsGoal, SavingsGoalType } from '../types';
import { CurrencyInput } from './CurrencyInput';
import { getGoalCurrentAmount, getGoalProgressPercent, getRequiredMonthlyContribution } from '../domain/savingsGoals';

const GOAL_TYPE_LABELS: Record<SavingsGoalType, string> = {
  EMERGENCY_FUND: 'Emergency fund',
  PURCHASE: 'Purchase',
  TRAVEL: 'Travel',
  EDUCATION: 'Education',
  HOME: 'Home / deposit',
  OTHER: 'Other',
};

const EMPTY_GOAL: Omit<SavingsGoal, 'id' | 'createdAt'> = {
  name: '',
  type: 'OTHER',
  targetAmount: 0,
  monthlyContribution: 0,
  manualSavedAmount: 0,
  protectLinkedBalance: false,
  priority: 'MEDIUM',
  isActive: true,
};

export function GoalsPanel({ searchQuery = '' }: { searchQuery?: string }) {
  const {
    savingsGoals,
    addSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    accounts,
    formatCurrency,
    getCurrencySymbol,
  } = useAppContext();
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [draft, setDraft] = useState<Omit<SavingsGoal, 'id' | 'createdAt'>>({ ...EMPTY_GOAL });
  const [modalOpen, setModalOpen] = useState(false);

  const activeGoals = useMemo(() => savingsGoals.filter(goal => goal.isActive), [savingsGoals]);
  const monthlyTotal = activeGoals.reduce((sum, goal) => sum + goal.monthlyContribution, 0);
  const filteredGoals = savingsGoals.filter(goal => goal.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  const assetAccounts = accounts.filter(account => account.type === 'asset' && account.is_archived !== 1);

  const openNew = () => {
    setEditing(null);
    setDraft({ ...EMPTY_GOAL });
    setModalOpen(true);
  };

  const openEdit = (goal: SavingsGoal) => {
    setEditing(goal);
    const { id: _id, createdAt: _createdAt, ...rest } = goal;
    setDraft(rest);
    setModalOpen(true);
  };

  const save = () => {
    if (!draft.name.trim() || draft.targetAmount <= 0) return;
    const payload = { ...draft, name: draft.name.trim() };
    if (editing) updateSavingsGoal(editing.id, payload);
    else addSavingsGoal(payload);
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-outline-variant/30 bg-surface-container p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Monthly goal contributions</p>
            <p className="mt-1 text-3xl font-bold font-numeric text-primary">{formatCurrency(monthlyTotal)}</p>
            <p className="mt-2 text-xs text-on-surface-variant">Active goal contributions become part of the savings amount protected by Can I Afford It?.</p>
          </div>
          <button type="button" onClick={openNew} className="min-h-11 rounded-xl bg-primary px-4 font-bold text-on-primary active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Add goal
          </button>
        </div>
      </div>

      {filteredGoals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/40 p-8 text-center text-on-surface-variant">
          <Target className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 font-semibold text-on-surface">No goals yet</p>
          <p className="mt-1 text-sm">Create a goal for an emergency fund, purchase, travel, education or another target.</p>
        </div>
      ) : (
        filteredGoals.map(goal => {
          const current = getGoalCurrentAmount(goal, accounts);
          const percent = getGoalProgressPercent(goal, accounts);
          const required = getRequiredMonthlyContribution(goal, accounts);
          const linked = goal.linkedAccountId ? accounts.find(account => account.id === goal.linkedAccountId) : undefined;
          return (
            <div key={goal.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-on-surface">{goal.name}</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{GOAL_TYPE_LABELS[goal.type]}</span>
                    {!goal.isActive && <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold uppercase text-on-surface-variant">Paused</span>}
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">{linked ? `Tracked from ${linked.name}` : 'Progress entered manually'}{goal.targetDate ? ` · Target ${new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString()}` : ''}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" aria-label={`Edit ${goal.name}`} onClick={() => openEdit(goal)} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><Edit2 className="h-4 w-4" /></button>
                  <button type="button" aria-label={`Delete ${goal.name}`} onClick={() => deleteSavingsGoal(goal.id)} className="rounded-lg p-2 text-on-surface-variant hover:bg-error/10 hover:text-error"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="font-numeric font-bold text-primary">{formatCurrency(current)} <span className="text-xs font-normal text-on-surface-variant">of {formatCurrency(goal.targetAmount)}</span></p>
                  <p className="mt-1 text-xs text-on-surface-variant">Planner protects {formatCurrency(goal.monthlyContribution)}/month{required > 0 ? ` · Required pace ${formatCurrency(required)}/month` : ''}</p>
                </div>
                <span className="text-xs font-bold text-on-surface-variant">{Math.round(percent)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-highest"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div>
              {goal.protectLinkedBalance && linked && <div className="mt-3 flex items-start gap-2 rounded-xl bg-primary/8 px-3 py-2 text-xs text-on-surface-variant"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>The current liquid balance of this linked account is protected as a cash reserve when applicable.</span></div>}
            </div>
          );
        })
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div className="my-auto w-full max-w-md rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-on-surface">{editing ? 'Edit goal' : 'Add goal'}</h2>
              <button type="button" aria-label="Close goal form" onClick={() => setModalOpen(false)} className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Goal name</span><input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Emergency Fund" className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-on-surface outline-none focus:border-primary/60" /></label>
              <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Goal type</span><select value={draft.type} onChange={event => setDraft(current => ({ ...current, type: event.target.value as SavingsGoalType }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none">{Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Target amount</span><div className="relative mt-1.5"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">{getCurrencySymbol()}</span><CurrencyInput value={draft.targetAmount || ''} onValueChange={value => setDraft(current => ({ ...current, targetAmount: Number(value) || 0 }))} className="w-full rounded-xl border border-outline-variant/30 bg-surface-container py-3 pl-8 pr-4 font-numeric text-on-surface outline-none focus:border-primary/60" /></div></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Target date</span><input type="date" value={draft.targetDate ?? ''} onChange={event => setDraft(current => ({ ...current, targetDate: event.target.value || undefined }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none" /></label>
                <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Monthly contribution</span><CurrencyInput value={draft.monthlyContribution || ''} onValueChange={value => setDraft(current => ({ ...current, monthlyContribution: Number(value) || 0 }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 font-numeric text-on-surface outline-none" /></label>
              </div>
              <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Track progress from account</span><select value={draft.linkedAccountId ?? ''} onChange={event => setDraft(current => ({ ...current, linkedAccountId: event.target.value || undefined }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none"><option value="">No linked account</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.group ?? 'Asset'})</option>)}</select></label>
              {!draft.linkedAccountId && <label className="block"><span className="text-sm font-semibold text-on-surface-variant">Already saved</span><CurrencyInput value={draft.manualSavedAmount || ''} onValueChange={value => setDraft(current => ({ ...current, manualSavedAmount: Number(value) || 0 }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 font-numeric text-on-surface outline-none" /></label>}
              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3"><span><span className="block text-sm font-semibold text-on-surface">Protect linked cash balance</span><span className="mt-0.5 block text-xs text-on-surface-variant">Useful for an emergency fund. If the linked account is liquid, its current balance becomes a protected reserve in affordability.</span></span><input type="checkbox" checked={draft.protectLinkedBalance} disabled={!draft.linkedAccountId} onChange={event => setDraft(current => ({ ...current, protectLinkedBalance: event.target.checked }))} className="mt-1 h-5 w-5 accent-primary" /></label>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3"><span className="text-sm font-semibold text-on-surface">Active goal</span><input type="checkbox" checked={draft.isActive} onChange={event => setDraft(current => ({ ...current, isActive: event.target.checked }))} className="h-5 w-5 accent-primary" /></label>
              <button type="button" onClick={save} className="w-full rounded-xl bg-primary py-3.5 font-bold text-on-primary active:scale-[0.98] transition-transform">Save goal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
