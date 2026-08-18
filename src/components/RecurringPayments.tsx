import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Pause, Play, SkipForward, Trash2, Pencil, Save, X, LockKeyhole, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { RecurringRule } from '../types';
import { CurrencyInput } from './CurrencyInput';
import { isManagedLoanPaymentRule } from '../domain/loanRecurring';

export function RecurringPayments() {
  const { recurringRules, events, accounts, transactions, creditCards, formatCurrency, updateRecurringRule, deleteRecurringRule, skipRecurringRule } = useAppContext();
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'UPCOMING' | 'CONFIRMATION' | 'ACTIVE' | 'PAUSED'>('ALL');

  useEffect(() => {
    if (!editing) return;
    const fresh = recurringRules.find(rule => rule.id === editing.id);
    if (!fresh) setEditing(null);
  }, [recurringRules, editing]);

  const run = async (id: string, action: () => Promise<boolean>) => {
    setBusyId(id);
    try {
      return await action();
    } finally {
      setBusyId(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      window.alert('Recurring payment title is required.');
      return;
    }
    if (!Number.isFinite(Number(editing.amount)) || Number(editing.amount) <= 0) {
      window.alert('Recurring payment amount must be greater than zero.');
      return;
    }
    const ok = await run(editing.id, () => updateRecurringRule({
      ...editing,
      title: editing.title.trim(),
      amount: Math.abs(Number(editing.amount)),
      anchorDay: editing.anchorDay ?? Number(editing.nextDueDate.slice(8, 10)),
    }));
    if (ok) setEditing(null);
  };

  const accountMap = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
  const pendingByRule = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of transactions) if (transaction.is_verified === 0 && transaction.recurringRuleId) counts.set(transaction.recurringRuleId, (counts.get(transaction.recurringRuleId) ?? 0) + 1);
    return counts;
  }, [transactions]);
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcomingCutoff = new Date(); upcomingCutoff.setDate(upcomingCutoff.getDate() + 31);
  const upcomingCutoffKey = upcomingCutoff.toISOString().slice(0, 10);
  const activeCount = recurringRules.filter(rule => rule.isActive).length;
  const pausedCount = recurringRules.length - activeCount;
  const needsConfirmationCount = [...pendingByRule.values()].reduce((sum, value) => sum + value, 0);
  const upcomingCount = recurringRules.filter(rule => rule.isActive && rule.nextDueDate >= todayKey && rule.nextDueDate <= upcomingCutoffKey).length;
  const warningMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const rule of recurringRules) {
      const warnings: string[] = [];
      const sourceId = rule.fromAccountId ?? (rule.transactionType === 'EXPENSE' ? rule.account : undefined);
      const destinationId = rule.toAccountId ?? (rule.transactionType === 'INCOME' ? rule.account : undefined);
      const source = sourceId ? accountMap.get(sourceId) : undefined;
      const destination = destinationId ? accountMap.get(destinationId) : undefined;
      if ((rule.transactionType === 'EXPENSE' || rule.transactionType === 'TRANSFER') && !source) warnings.push('Funding account is missing.');
      else if (source?.is_archived === 1) warnings.push(`Funding account ${source.name} is archived.`);
      else if (source?.type === 'asset' && Math.abs(Number(rule.amount)) > Math.max(0, Number(source.balance) || 0)) warnings.push(`${source.name} currently has less than this next payment requires.`);
      if ((rule.transactionType === 'INCOME' || rule.transactionType === 'TRANSFER') && !destination) warnings.push('Destination account is missing.');
      else if (destination?.is_archived === 1) warnings.push(`Destination account ${destination.name} is archived.`);
      map.set(rule.id, warnings);
    }
    return map;
  }, [recurringRules, accountMap]);
  const cardWarnings = creditCards.filter(card => card.dueDate && card.dueAmount > 0 && card.dueDate >= todayKey && card.dueDate <= upcomingCutoffKey).map(card => `${card.name} has ${formatCurrency(card.dueAmount)} due on ${card.dueDate}.`);
  const visibleRules = recurringRules.filter(rule => {
    if (filter === 'ACTIVE') return rule.isActive;
    if (filter === 'PAUSED') return !rule.isActive;
    if (filter === 'CONFIRMATION') return (pendingByRule.get(rule.id) ?? 0) > 0;
    if (filter === 'UPCOMING') return rule.isActive && rule.nextDueDate >= todayKey && rule.nextDueDate <= upcomingCutoffKey;
    return true;
  });

  // Settings used to own this manager. Keep the old render call harmless so the
  // security/settings screen does not need to be rewritten; the single visible
  // home for schedules is now Menu → Scheduled Payments.
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'settings') return null;

  return (
    <section>
      <div className="mb-3 ml-2 flex items-center gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary">Recurring Payments</h3>
        <CalendarClock className="h-4 w-4 text-on-surface-variant" />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {([['ALL', 'All', recurringRules.length], ['UPCOMING', 'Upcoming', upcomingCount], ['CONFIRMATION', 'Needs confirmation', needsConfirmationCount], ['ACTIVE', 'Active', activeCount], ['PAUSED', 'Paused', pausedCount]] as const).map(([value, label, count]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${filter === value ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/30 bg-surface-container text-on-surface-variant'}`}>{label} · {count}</button>)}
      </div>
      {cardWarnings.length > 0 && <div className="mb-3 space-y-2">{cardWarnings.map(warning => <div key={warning} className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-on-surface"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{warning}</div>)}</div>}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container">
        {recurringRules.length === 0 ? (
          <div className="p-5 text-sm text-on-surface-variant">
            No recurring schedules yet. Loan EMIs appear automatically after a payment account is linked; you can also create recurring transactions or configure an Investment SIP.
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/20">
            {visibleRules.map(rule => {
              const eventName = events.find(event => event.id === rule.eventId)?.name;
              const isBusy = busyId === rule.id;
              const isManagedSip = rule.id.startsWith('investment-sip:');
              const isManagedLoan = isManagedLoanPaymentRule(rule);
              const isManaged = isManagedSip || isManagedLoan;
              const pendingCount = pendingByRule.get(rule.id) ?? 0;
              const ruleWarnings = warningMap.get(rule.id) ?? [];
              return (
                <div key={rule.id} className="p-4">
                  {isManaged ? (
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-on-surface">{rule.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${rule.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                          {rule.isActive ? 'Active' : 'Paused'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                          <LockKeyhole className="h-3 w-3" /> {isManagedLoan ? 'Loan EMI' : 'Investment SIP'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {formatCurrency(rule.amount)} · {rule.frequency.toLowerCase()} · Next {rule.nextDueDate}
                        {eventName ? ` · ${eventName}` : ''}
                      </p>
                      {pendingCount > 0 && <p className="mt-2 text-xs font-semibold text-amber-500">{pendingCount} occurrence{pendingCount === 1 ? '' : 's'} waiting for confirmation.</p>}
                      {ruleWarnings.length > 0 && <div className="mt-2 space-y-1">{ruleWarnings.map(warning => <p key={warning} className="flex items-start gap-1.5 text-xs text-amber-500"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning}</p>)}</div>}
                      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-on-surface-variant">{isManagedLoan
                        ? 'Managed by its Loan account. Edit the EMI amount, frequency, or next payment date from Accounts → Loan; CoinBuddy keeps this schedule synchronized.'
                        : 'Managed by its Investment account. Edit the SIP amount, funding account, or date from Accounts → Investment.'}</p>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-on-surface">{rule.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${rule.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {rule.isActive ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                          {formatCurrency(rule.amount)} · {rule.frequency.toLowerCase()} · Next {rule.nextDueDate}
                          {eventName ? ` · ${eventName}` : ''}
                        </p>
                        {pendingCount > 0 && <p className="mt-2 text-xs font-semibold text-amber-500">{pendingCount} occurrence{pendingCount === 1 ? '' : 's'} waiting for confirmation.</p>}
                        {ruleWarnings.length > 0 && <div className="mt-2 space-y-1">{ruleWarnings.map(warning => <p key={warning} className="flex items-start gap-1.5 text-xs text-amber-500"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning}</p>)}</div>}
                      </div>
                      <div className="grid shrink-0 grid-cols-4 gap-2">
                        <button type="button" disabled={isBusy} onClick={() => setEditing({ ...rule })} className="flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant/40 text-on-surface-variant hover:text-primary disabled:opacity-50 sm:h-11 sm:w-11" aria-label={`Edit ${rule.title}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" disabled={isBusy} onClick={() => void run(rule.id, () => updateRecurringRule({ ...rule, isActive: !rule.isActive }))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant/40 text-on-surface-variant hover:text-primary disabled:opacity-50 sm:h-11 sm:w-11" aria-label={rule.isActive ? `Pause ${rule.title}` : `Resume ${rule.title}`}>
                          {rule.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                        <button type="button" disabled={isBusy || !rule.isActive} onClick={() => { if (window.confirm(`Skip the next ${rule.title} occurrence? Existing ledger entries will not be changed.`)) void run(rule.id, () => skipRecurringRule(rule.id)); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant/40 text-on-surface-variant hover:text-primary disabled:opacity-50 sm:h-11 sm:w-11" aria-label={`Skip next ${rule.title}`}>
                          <SkipForward className="h-4 w-4" />
                        </button>
                        <button type="button" disabled={isBusy} onClick={() => { if (window.confirm(`Delete the recurring schedule "${rule.title}"? Existing transactions will remain in the ledger.`)) void run(rule.id, () => deleteRecurringRule(rule.id)); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-error/30 text-error hover:bg-error/10 disabled:opacity-50 sm:h-11 sm:w-11" aria-label={`Delete recurring schedule ${rule.title}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-outline-variant/30 bg-surface-container p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-on-surface">Edit recurring series</h4>
              <button type="button" aria-label="Close recurring editor" onClick={() => setEditing(null)} className="rounded-full p-2 hover:bg-surface-container-high"><X className="h-5 w-5" /></button>
            </div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Title
              <input value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} className="mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary" />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Amount
              <CurrencyInput value={editing.amount || ''} onValueChange={value => setEditing({ ...editing, amount: Number(value) || 0 })} className="mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Frequency
                <select value={editing.frequency} onChange={event => setEditing({ ...editing, frequency: event.target.value as RecurringRule['frequency'] })} className="mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary">
                  <option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option>
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Next due
                <input type="date" value={editing.nextDueDate} onChange={event => setEditing({ ...editing, nextDueDate: event.target.value })} className="mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary" />
              </label>
            </div>
            <p className="text-xs leading-relaxed text-on-surface-variant">Changes apply only to future occurrences. Existing ledger transactions remain unchanged.</p>
            <button type="button" disabled={busyId === editing.id} onClick={() => void save()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-on-primary disabled:opacity-50"><Save className="h-4 w-4" /> Save recurring series</button>
          </div>
        </div>
      )}
    </section>
  );
}
