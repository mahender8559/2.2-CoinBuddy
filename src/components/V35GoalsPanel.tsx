import { useMemo, useState } from 'react';
import { BookOpen, Car, Edit2, GraduationCap, Home, Plane, Plus, ShieldCheck, Target, Trash2, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { SavingsGoal, SavingsGoalType } from '../types';
import { CurrencyInput } from './CurrencyInput';
import { getGoalCurrentAmount, getGoalProgressPercent, getRequiredMonthlyContribution } from '../domain/savingsGoals';
import { isLiquidCashAccount } from '../domain/affordability';
import { IconBadge, MoneyValue, StatusPill } from './ui/V35';

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

const goalIcon = (type: SavingsGoalType) => {
  if (type === 'TRAVEL') return Plane;
  if (type === 'EDUCATION') return GraduationCap;
  if (type === 'HOME') return Home;
  if (type === 'PURCHASE') return Car;
  if (type === 'EMERGENCY_FUND') return ShieldCheck;
  return Target;
};

const goalEmoji = (type: SavingsGoalType) => {
  if (type === 'TRAVEL') return '✈️';
  if (type === 'EDUCATION') return '🎓';
  if (type === 'HOME') return '🏠';
  if (type === 'PURCHASE') return '✨';
  if (type === 'EMERGENCY_FUND') return '🛡️';
  return '🎯';
};

export function V35GoalsPanel({ searchQuery = '' }: { searchQuery?: string }) {
  const {
    savingsGoals,
    addSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    accounts,
    transactions,
    formatCurrency,
    getCurrencySymbol,
  } = useAppContext();

  const [filter, setFilter] = useState<'all' | 'completed'>('all');
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [draft, setDraft] = useState<Omit<SavingsGoal, 'id' | 'createdAt'>>({ ...EMPTY_GOAL });
  const [modalOpen, setModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const activeGoals = useMemo(() => savingsGoals.filter(goal => goal.isActive), [savingsGoals]);
  const monthlyTotal = activeGoals.reduce((sum, goal) => sum + goal.monthlyContribution, 0);
  const assetAccounts = accounts.filter(account => account.type === 'asset' && account.is_archived !== 1);
  const selectedLinkedAccount = draft.linkedAccountId ? assetAccounts.find(account => account.id === draft.linkedAccountId) : undefined;
  const selectedLinkedIsLiquid = selectedLinkedAccount ? isLiquidCashAccount(selectedLinkedAccount) : false;

  const goalRows = useMemo(() => savingsGoals.map(goal => ({
    goal,
    current: getGoalCurrentAmount(goal, accounts, transactions),
    percent: getGoalProgressPercent(goal, accounts, transactions),
    required: getRequiredMonthlyContribution(goal, accounts, transactions),
  })), [savingsGoals, accounts, transactions]);

  const filteredGoals = goalRows.filter(({ goal, percent }) => {
    if (!goal.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
    if (filter === 'completed') return percent >= 100;
    return true;
  });

  const openNew = () => {
    setEditing(null);
    setDraft({ ...EMPTY_GOAL });
    setSaveError('');
    setModalOpen(true);
  };

  const openEdit = (goal: SavingsGoal) => {
    setEditing(goal);
    const { id: _id, createdAt: _createdAt, ...rest } = goal;
    setDraft(rest);
    setSaveError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (isSaving || !draft.name.trim() || draft.targetAmount <= 0) return;
    setIsSaving(true);
    setSaveError('');
    const payload = { ...draft, name: draft.name.trim() };
    const saved = editing ? await updateSavingsGoal(editing.id, payload) : await addSavingsGoal(payload);
    setIsSaving(false);
    if (!saved) {
      setSaveError('Could not save this goal. No changes were persisted.');
      return;
    }
    setModalOpen(false);
  };

  return (
    <section data-testid="page-goals" className="w-full space-y-5 pb-24 md:pb-0 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">Goals</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Turn future plans into visible progress without mixing them with spendable cash.</p>
        </div>
        <button type="button" aria-label="Add goal" onClick={openNew} className="v35-focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-[0_0_24px_rgba(76,141,255,.18)]"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add goal</span><span className="sm:hidden">Add</span></button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex self-start rounded-xl border border-outline-variant/30 bg-surface-container-low p-1">
          <button onClick={() => setFilter('all')} className={`v35-focus-ring min-h-9 rounded-lg px-4 text-xs font-semibold ${filter === 'all' ? 'bg-primary text-white' : 'text-on-surface-variant hover:text-on-surface'}`}>All goals</button>
          <button onClick={() => setFilter('completed')} className={`v35-focus-ring min-h-9 rounded-lg px-4 text-xs font-semibold ${filter === 'completed' ? 'bg-primary text-white' : 'text-on-surface-variant hover:text-on-surface'}`}>Completed</button>
        </div>
        <div className="text-sm text-on-surface-variant">Protected monthly contributions <MoneyValue className="ml-1 font-semibold text-on-surface">{formatCurrency(monthlyTotal)}</MoneyValue></div>
      </div>

      {filteredGoals.length === 0 ? (
        <div className="v35-surface rounded-2xl p-8 text-center">
          <IconBadge icon={Target} size="lg" />
          <h2 className="mt-4 text-lg font-semibold text-on-surface">{filter === 'completed' ? 'No completed goals yet' : 'No goals yet'}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-on-surface-variant">{filter === 'completed' ? 'Completed goals will collect here as you reach 100%.' : 'Create a goal for an emergency fund, purchase, travel, education or another target.'}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredGoals.map(({ goal, current, percent, required }) => {
            const Icon = goalIcon(goal.type);
            const linked = goal.linkedAccountId ? accounts.find(account => account.id === goal.linkedAccountId) : undefined;
            const linkedIsLiquid = linked ? isLiquidCashAccount(linked) : false;
            const complete = percent >= 100;
            return (
              <article key={goal.id} aria-label={`Goal ${goal.name}`} className="v35-surface rounded-2xl p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <IconBadge icon={Icon} tone={complete ? 'green' : goal.type === 'TRAVEL' ? 'purple' : goal.type === 'EMERGENCY_FUND' ? 'green' : 'blue'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-on-surface"><span>{goal.name}</span> <span aria-hidden="true">{goalEmoji(goal.type)}</span></h2>
                      {complete ? <StatusPill tone="positive">Completed</StatusPill> : !goal.isActive ? <StatusPill>Paused</StatusPill> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-on-surface-variant">{GOAL_TYPE_LABELS[goal.type]}{goal.targetDate ? ` · Target ${new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString()}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label={`Edit ${goal.name}`} onClick={() => openEdit(goal)} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><Edit2 className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Delete ${goal.name}`} onClick={() => { void deleteSavingsGoal(goal.id); }} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <MoneyValue className="text-lg font-semibold text-on-surface">{formatCurrency(current)}</MoneyValue>
                    <p className="mt-0.5 text-xs text-on-surface-variant">of {formatCurrency(goal.targetAmount)}</p>
                  </div>
                  <MoneyValue className={`text-lg font-semibold ${complete ? 'text-[var(--cb-green)]' : 'text-primary'}`}>{Math.round(percent)}%</MoneyValue>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high"><div className={`h-full rounded-full transition-[width] duration-300 ${complete ? 'bg-[var(--cb-green)]' : 'bg-primary'}`} style={{ width: `${percent}%` }} /></div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-black/10 p-3"><span className="text-on-surface-variant">Monthly plan</span><MoneyValue className="mt-1 block font-semibold text-on-surface">{formatCurrency(goal.monthlyContribution)}</MoneyValue></div>
                  <div className="rounded-xl bg-black/10 p-3"><span className="text-on-surface-variant">Required pace</span><MoneyValue className="mt-1 block font-semibold text-on-surface">{required > 0 ? formatCurrency(required) : 'On track'}</MoneyValue></div>
                </div>

                <p className="mt-4 text-xs leading-5 text-on-surface-variant">{linked ? `Progress tracked from ${linked.name}.` : 'Progress uses manual saved amount and verified Goal-linked contributions.'}</p>
                {goal.monthlyContribution > 0 ? <p className="mt-1 text-xs leading-5 text-on-surface-variant">Planner protects {formatCurrency(goal.monthlyContribution)} each cycle for this goal.</p> : null}
                {linked && !linkedIsLiquid ? <div className="mt-3 flex gap-2 rounded-xl bg-primary/8 px-3 py-2 text-xs leading-5 text-on-surface-variant"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{linked.name} tracks progress only. It is excluded from affordability liquid cash and protected reserves.</span></div> : null}
                {goal.protectLinkedBalance && linkedIsLiquid && linked ? <div className="mt-3 flex gap-2 rounded-xl bg-primary/8 px-3 py-2 text-xs leading-5 text-on-surface-variant"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>This linked liquid balance is protected as an affordability reserve.</span></div> : null}
              </article>
            );
          })}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center overflow-y-auto bg-black/65 p-0 backdrop-blur-sm md:items-center md:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="goal-form-title" className="v35-surface max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl p-5 md:max-w-md md:rounded-2xl md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="goal-form-title" className="text-xl font-semibold text-on-surface">{editing ? 'Edit goal' : 'Add goal'}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">Keep the target simple. CoinBuddy will handle the progress math.</p>
              </div>
              <button type="button" aria-label="Close goal form" onClick={() => setModalOpen(false)} className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block"><span className="text-sm font-semibold text-on-surface">Goal name</span><input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Emergency Fund" className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-on-surface outline-none focus:border-primary/70" /></label>
              <label className="block"><span className="text-sm font-semibold text-on-surface">Goal type</span><select value={draft.type} onChange={event => setDraft(current => ({ ...current, type: event.target.value as SavingsGoalType }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none focus:border-primary/70">{Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="block"><span className="text-sm font-semibold text-on-surface">Target amount</span><div className="relative mt-1.5"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">{getCurrencySymbol()}</span><CurrencyInput value={draft.targetAmount || ''} onValueChange={value => setDraft(current => ({ ...current, targetAmount: Number(value) || 0 }))} className="w-full rounded-xl border border-outline-variant/30 bg-surface-container py-3 pl-8 pr-4 font-numeric text-on-surface outline-none focus:border-primary/70" /></div></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-semibold text-on-surface">Target date</span><input type="date" value={draft.targetDate ?? ''} onChange={event => setDraft(current => ({ ...current, targetDate: event.target.value || undefined }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none focus:border-primary/70" /></label>
                <label className="block"><span className="text-sm font-semibold text-on-surface">Monthly contribution</span><CurrencyInput value={draft.monthlyContribution || ''} onValueChange={value => setDraft(current => ({ ...current, monthlyContribution: Number(value) || 0 }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 font-numeric text-on-surface outline-none focus:border-primary/70" /></label>
              </div>
              <label className="block"><span className="text-sm font-semibold text-on-surface">Track progress from account</span><select value={draft.linkedAccountId ?? ''} onChange={event => { const linkedAccountId = event.target.value || undefined; const linkedAccount = linkedAccountId ? assetAccounts.find(account => account.id === linkedAccountId) : undefined; setDraft(current => ({ ...current, linkedAccountId, protectLinkedBalance: linkedAccount && isLiquidCashAccount(linkedAccount) ? current.protectLinkedBalance : false })); }} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none focus:border-primary/70"><option value="">No linked account</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.group ?? 'Asset'})</option>)}</select>{selectedLinkedAccount && !selectedLinkedIsLiquid ? <span className="mt-2 block text-xs leading-5 text-on-surface-variant">This account can track progress but remains excluded from liquid affordability cash.</span> : null}</label>
              {!draft.linkedAccountId ? <label className="block"><span className="text-sm font-semibold text-on-surface">Already saved</span><CurrencyInput value={draft.manualSavedAmount || ''} onValueChange={value => setDraft(current => ({ ...current, manualSavedAmount: Number(value) || 0 }))} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 font-numeric text-on-surface outline-none focus:border-primary/70" /></label> : null}
              <label className={`flex items-start justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3 ${selectedLinkedIsLiquid ? 'cursor-pointer' : 'opacity-70'}`}><span><span className="block text-sm font-semibold text-on-surface">Protect linked liquid cash</span><span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{selectedLinkedAccount && !selectedLinkedIsLiquid ? 'Not applicable to non-liquid investment or physical asset links.' : 'Useful when the goal is deliberately held in a bank, savings, cash or wallet account.'}</span></span><input type="checkbox" checked={draft.protectLinkedBalance} disabled={!draft.linkedAccountId || !selectedLinkedIsLiquid} onChange={event => setDraft(current => ({ ...current, protectLinkedBalance: event.target.checked }))} className="mt-1 h-5 w-5 accent-primary" /></label>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3"><span className="text-sm font-semibold text-on-surface">Active goal</span><input type="checkbox" checked={draft.isActive} onChange={event => setDraft(current => ({ ...current, isActive: event.target.checked }))} className="h-5 w-5 accent-primary" /></label>
              {saveError ? <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{saveError}</p> : null}
              <button type="button" disabled={isSaving} onClick={() => { void save(); }} className="v35-focus-ring w-full rounded-xl bg-primary py-3.5 font-semibold text-white active:scale-[0.99] disabled:opacity-60">{isSaving ? 'Saving…' : 'Save goal'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
