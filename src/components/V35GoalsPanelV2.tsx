import { useMemo, useState } from 'react';
import { CalendarDays, Car, Check, ChevronDown, Edit2, GraduationCap, Home, Landmark, Plane, Plus, ShieldCheck, Target, Trash2, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { SavingsGoal, SavingsGoalType } from '../types';
import { CurrencyInput } from './CurrencyInput';
import {
  getGoalCurrentAmount,
  getGoalLinkedAccountIds,
  getGoalLinkedAccounts,
  getGoalProgressPercent,
  getRequiredMonthlyContribution,
} from '../domain/savingsGoals';
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
  linkedAccountIds: [],
  linkedAccountId: undefined,
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

const fieldClass = 'h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 text-sm font-medium text-on-surface outline-none transition placeholder:text-on-surface-variant/65 focus:border-primary focus:ring-2 focus:ring-primary/15';
const labelClass = 'mb-1.5 block text-[11px] font-semibold text-on-surface-variant';

function linkedAccountCopy(names: string[]) {
  if (names.length === 0) return 'Progress uses manual saved amount and verified Goal-linked contributions.';
  if (names.length === 1) return `Progress tracked from ${names[0]}.`;
  if (names.length === 2) return `Progress tracked from ${names[0]} + ${names[1]}.`;
  return `Progress tracked from ${names[0]}, ${names[1]} + ${names.length - 2} more accounts.`;
}

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
  const assetAccounts = useMemo(
    () => accounts.filter(account => account.type === 'asset' && account.is_archived !== 1),
    [accounts],
  );

  const selectedLinkedIds = getGoalLinkedAccountIds(draft);
  const selectedLinkedSet = useMemo(() => new Set(selectedLinkedIds), [selectedLinkedIds.join('|')]);
  const selectedLinkedAccounts = assetAccounts.filter(account => selectedLinkedSet.has(account.id));
  const selectedLiquidAccounts = selectedLinkedAccounts.filter(isLiquidCashAccount);
  const selectedNonLiquidAccounts = selectedLinkedAccounts.filter(account => !isLiquidCashAccount(account));

  const goalRows = useMemo(() => savingsGoals.map(goal => ({
    goal,
    current: getGoalCurrentAmount(goal, accounts, transactions),
    percent: getGoalProgressPercent(goal, accounts, transactions),
    required: getRequiredMonthlyContribution(goal, accounts, transactions),
    linkedAccounts: getGoalLinkedAccounts(goal, accounts),
  })), [savingsGoals, accounts, transactions]);

  const filteredGoals = goalRows.filter(({ goal, percent }) => {
    if (!goal.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
    if (filter === 'completed') return percent >= 100;
    return true;
  });

  const openNew = () => {
    setEditing(null);
    setDraft({ ...EMPTY_GOAL, linkedAccountIds: [] });
    setSaveError('');
    setModalOpen(true);
  };

  const openEdit = (goal: SavingsGoal) => {
    setEditing(goal);
    const { id: _id, createdAt: _createdAt, ...rest } = goal;
    const linkedAccountIds = getGoalLinkedAccountIds(goal);
    setDraft({ ...rest, linkedAccountIds, linkedAccountId: linkedAccountIds[0] });
    setSaveError('');
    setModalOpen(true);
  };

  const toggleLinkedAccount = (accountId: string) => {
    setDraft(current => {
      const currentIds = getGoalLinkedAccountIds(current);
      const nextIds = currentIds.includes(accountId)
        ? currentIds.filter(id => id !== accountId)
        : [...currentIds, accountId];
      const hasLinkedLiquidAccount = assetAccounts.some(account => nextIds.includes(account.id) && isLiquidCashAccount(account));
      return {
        ...current,
        linkedAccountIds: nextIds,
        linkedAccountId: nextIds[0],
        protectLinkedBalance: hasLinkedLiquidAccount ? current.protectLinkedBalance : false,
      };
    });
  };

  const save = async () => {
    if (isSaving || !draft.name.trim() || draft.targetAmount <= 0) return;
    setIsSaving(true);
    setSaveError('');
    const linkedAccountIds = getGoalLinkedAccountIds(draft);
    const payload = {
      ...draft,
      name: draft.name.trim(),
      linkedAccountIds,
      linkedAccountId: linkedAccountIds[0],
      protectLinkedBalance: linkedAccountIds.length > 0 && selectedLiquidAccounts.length > 0 ? draft.protectLinkedBalance : false,
    };
    const saved = editing ? await updateSavingsGoal(editing.id, payload) : await addSavingsGoal(payload);
    setIsSaving(false);
    if (!saved) {
      setSaveError('Could not save this goal. No changes were persisted.');
      return;
    }
    setModalOpen(false);
  };

  const goalTypeButtons: Array<{ type: SavingsGoalType; icon: typeof Target }> = [
    { type: 'EMERGENCY_FUND', icon: ShieldCheck },
    { type: 'PURCHASE', icon: Car },
    { type: 'TRAVEL', icon: Plane },
    { type: 'HOME', icon: Home },
    { type: 'EDUCATION', icon: GraduationCap },
    { type: 'OTHER', icon: Target },
  ];

  return (
    <section data-testid="page-goals" className="w-full space-y-5 pb-24 md:pb-0 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">Goals</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Turn future plans into visible progress without mixing them with spendable cash.</p>
        </div>
        <button type="button" aria-label="Add goal" onClick={openNew} className="v35-focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-lg"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add goal</span><span className="sm:hidden">Add</span></button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex self-start rounded-xl border border-outline-variant/30 bg-surface-container-low p-1">
          <button onClick={() => setFilter('all')} className={`v35-focus-ring min-h-9 rounded-lg px-4 text-xs font-semibold ${filter === 'all' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>All goals</button>
          <button onClick={() => setFilter('completed')} className={`v35-focus-ring min-h-9 rounded-lg px-4 text-xs font-semibold ${filter === 'completed' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>Completed</button>
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
          {filteredGoals.map(({ goal, current, percent, required, linkedAccounts }) => {
            const Icon = goalIcon(goal.type);
            const linkedLiquid = linkedAccounts.filter(isLiquidCashAccount);
            const linkedNonLiquid = linkedAccounts.filter(account => !isLiquidCashAccount(account));
            const complete = percent >= 100;
            return (
              <article key={goal.id} aria-label={`Goal ${goal.name}`} className="v35-surface rounded-2xl p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <IconBadge icon={Icon} tone={complete ? 'green' : goal.type === 'TRAVEL' ? 'purple' : goal.type === 'EMERGENCY_FUND' ? 'green' : 'blue'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-semibold text-on-surface"><span>{goal.name}</span> <span aria-hidden="true">{goalEmoji(goal.type)}</span></h2>{complete ? <StatusPill tone="positive">Completed</StatusPill> : !goal.isActive ? <StatusPill>Paused</StatusPill> : null}</div>
                    <p className="mt-0.5 text-xs text-on-surface-variant">{GOAL_TYPE_LABELS[goal.type]}{goal.targetDate ? ` · Target ${new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString()}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 gap-1"><button type="button" aria-label={`Edit ${goal.name}`} onClick={() => openEdit(goal)} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><Edit2 className="h-4 w-4" /></button><button type="button" aria-label={`Delete ${goal.name}`} onClick={() => { void deleteSavingsGoal(goal.id); }} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error"><Trash2 className="h-4 w-4" /></button></div>
                </div>

                <div className="mt-5 flex items-end justify-between gap-4"><div><MoneyValue className="text-lg font-semibold text-on-surface">{formatCurrency(current)}</MoneyValue><p className="mt-0.5 text-xs text-on-surface-variant">of {formatCurrency(goal.targetAmount)}</p></div><MoneyValue className={`text-lg font-semibold ${complete ? 'text-[var(--cb-green)]' : 'text-primary'}`}>{Math.round(percent)}%</MoneyValue></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high"><div className={`h-full rounded-full transition-[width] duration-300 ${complete ? 'bg-[var(--cb-green)]' : 'bg-primary'}`} style={{ width: `${percent}%` }} /></div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-surface-container-low p-3"><span className="text-on-surface-variant">Monthly plan</span><MoneyValue className="mt-1 block font-semibold text-on-surface">{formatCurrency(goal.monthlyContribution)}</MoneyValue></div><div className="rounded-xl bg-surface-container-low p-3"><span className="text-on-surface-variant">Required pace</span><MoneyValue className="mt-1 block font-semibold text-on-surface">{required > 0 ? formatCurrency(required) : 'On track'}</MoneyValue></div></div>

                <p className="mt-4 text-xs leading-5 text-on-surface-variant">{linkedAccountCopy(linkedAccounts.map(account => account.name))}</p>
                {goal.monthlyContribution > 0 ? <p className="mt-1 text-xs leading-5 text-on-surface-variant">Planner protects {formatCurrency(goal.monthlyContribution)} each cycle for this goal.</p> : null}
                {linkedNonLiquid.length > 0 ? <div className="mt-3 flex gap-2 rounded-xl bg-primary/8 px-3 py-2 text-xs leading-5 text-on-surface-variant"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{linkedNonLiquid.length === 1 ? linkedNonLiquid[0].name : `${linkedNonLiquid.length} investment/non-liquid accounts`} track progress only and stay excluded from affordability liquid cash.</span></div> : null}
                {goal.protectLinkedBalance && linkedLiquid.length > 0 ? <div className="mt-3 flex gap-2 rounded-xl bg-primary/8 px-3 py-2 text-xs leading-5 text-on-surface-variant"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{linkedLiquid.length === 1 ? 'This linked liquid balance is' : `${linkedLiquid.length} linked liquid account balances are`} protected as an affordability reserve.</span></div> : null}
              </article>
            );
          })}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center overflow-y-auto bg-black/70 backdrop-blur-md md:items-center md:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="goal-form-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[22px] border border-outline-variant bg-surface-container-lowest shadow-2xl md:max-w-[390px] md:rounded-[22px]">
            <div className="sticky top-0 z-10 flex h-[52px] items-center justify-between border-b border-outline-variant/60 bg-surface-container-lowest/95 px-3 backdrop-blur-xl">
              <button type="button" aria-label="Back from goal form" onClick={() => setModalOpen(false)} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"><span aria-hidden="true" className="text-lg">‹</span></button>
              <h2 id="goal-form-title" className="text-sm font-semibold text-on-surface">{editing ? 'Edit Goal' : 'Add Goal'}</h2>
              <button type="button" aria-label="Close goal form" onClick={() => setModalOpen(false)} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-4 p-4">
              <div><label htmlFor="goal-name" className={labelClass}>Goal Name</label><input id="goal-name" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Dream Car 🚙" className={fieldClass} /></div>
              <div><label className={labelClass}>Target Amount</label><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">{getCurrencySymbol()}</span><CurrencyInput aria-label="Target Amount" value={draft.targetAmount || ''} onValueChange={value => setDraft(current => ({ ...current, targetAmount: Number(value) || 0 }))} className={`${fieldClass} pl-8 font-numeric`} placeholder="10,00,000" /></div></div>
              <div><label htmlFor="goal-date" className={labelClass}>Target Date</label><div className="relative"><input id="goal-date" type="date" value={draft.targetDate ?? ''} onChange={event => setDraft(current => ({ ...current, targetDate: event.target.value || undefined }))} className={`${fieldClass} pr-9`} /><CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /></div></div>

              <div>
                <span className={labelClass}>Goal type</span>
                <div className="grid grid-cols-6 gap-1.5">
                  {goalTypeButtons.map(({ type, icon: Icon }) => <button key={type} type="button" aria-label={`Goal type ${GOAL_TYPE_LABELS[type]}`} aria-pressed={draft.type === type} onClick={() => setDraft(current => ({ ...current, type }))} className={`v35-focus-ring flex h-10 items-center justify-center rounded-xl border ${draft.type === type ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface-container-low text-on-surface-variant'}`}><Icon className="h-4 w-4" /></button>)}
                </div>
              </div>

              <details className="group rounded-xl border border-outline-variant/70 bg-surface-container-low">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-on-surface-variant">More options <ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
                <div className="space-y-4 border-t border-outline-variant/60 p-3">
                  <div><label className={labelClass}>Monthly contribution</label><CurrencyInput aria-label="Monthly contribution" value={draft.monthlyContribution || ''} onValueChange={value => setDraft(current => ({ ...current, monthlyContribution: Number(value) || 0 }))} className={`${fieldClass} font-numeric`} /></div>

                  <div>
                    <div className="flex items-end justify-between gap-3">
                      <div><span className={labelClass}>Track progress from accounts</span><p className="text-[10px] leading-4 text-on-surface-variant">Select one or more asset accounts. Their balances are added together for Goal progress.</p></div>
                      {selectedLinkedAccounts.length > 0 ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{selectedLinkedAccounts.length} selected</span> : null}
                    </div>
                    <div role="group" aria-label="Linked goal accounts" className="mt-2 grid gap-2 sm:grid-cols-2">
                      {assetAccounts.map(account => {
                        const selected = selectedLinkedSet.has(account.id);
                        const liquid = isLiquidCashAccount(account);
                        return (
                          <button
                            key={account.id}
                            type="button"
                            aria-label={`Link account ${account.name}`}
                            aria-pressed={selected}
                            onClick={() => toggleLinkedAccount(account.id)}
                            className={`v35-focus-ring flex min-h-[70px] items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${selected ? 'border-primary bg-primary/10' : 'border-outline-variant/70 bg-surface-container-lowest hover:border-outline'}`}
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}><Landmark className="h-4.5 w-4.5" /></span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-on-surface">{account.name}</span><span className="mt-0.5 block truncate text-[10px] text-on-surface-variant">{account.group || 'Asset'} · {liquid ? 'Liquid' : 'Progress only'}</span><MoneyValue className="mt-0.5 block truncate text-[10px] font-semibold text-on-surface">{formatCurrency(account.balance)}</MoneyValue></span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant text-transparent'}`}><Check className="h-3 w-3" /></span>
                          </button>
                        );
                      })}
                    </div>
                    {assetAccounts.length === 0 ? <p className="mt-2 rounded-xl bg-surface-container-high px-3 py-2 text-[10px] leading-4 text-on-surface-variant">Create an asset account first to track Goal progress from account balances.</p> : null}
                    {selectedNonLiquidAccounts.length > 0 ? <p className="mt-2 text-[10px] leading-4 text-on-surface-variant">{selectedNonLiquidAccounts.length === 1 ? selectedNonLiquidAccounts[0].name : `${selectedNonLiquidAccounts.length} selected accounts`} will contribute to Goal progress but not affordability liquid cash.</p> : null}
                  </div>

                  {selectedLinkedAccounts.length === 0 ? <div><label className={labelClass}>Already saved</label><CurrencyInput aria-label="Already saved" value={draft.manualSavedAmount || ''} onValueChange={value => setDraft(current => ({ ...current, manualSavedAmount: Number(value) || 0 }))} className={`${fieldClass} font-numeric`} /></div> : null}

                  <label className={`flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest px-3 py-2.5 text-xs text-on-surface ${selectedLiquidAccounts.length > 0 ? '' : 'opacity-55'}`}><span><span className="block font-semibold">Protect linked liquid cash</span><span className="mt-0.5 block text-[10px] text-on-surface-variant">Protects all selected liquid account balances from affordability spending.</span></span><input type="checkbox" aria-label="Protect linked liquid cash" checked={draft.protectLinkedBalance} disabled={selectedLiquidAccounts.length === 0} onChange={event => setDraft(current => ({ ...current, protectLinkedBalance: event.target.checked }))} className="h-4 w-4 accent-[var(--primary)]" /></label>
                  <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest px-3 py-2.5 text-xs text-on-surface"><span className="font-semibold">Active goal</span><input type="checkbox" aria-label="Active goal" checked={draft.isActive} onChange={event => setDraft(current => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-[var(--primary)]" /></label>
                </div>
              </details>

              {saveError ? <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{saveError}</p> : null}
              <button type="button" disabled={isSaving || !draft.name.trim() || draft.targetAmount <= 0} onClick={() => { void save(); }} className="v35-focus-ring flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-on-primary shadow-lg disabled:opacity-50">{isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Create Goal'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
