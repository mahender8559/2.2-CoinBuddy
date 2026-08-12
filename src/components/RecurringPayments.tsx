import { useEffect, useState } from 'react';
import { CalendarClock, Pause, Play, SkipForward, Trash2, Pencil, Save, X, LockKeyhole } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { RecurringRule } from '../types';
import { CurrencyInput } from './CurrencyInput';

export function RecurringPayments() {
  const { recurringRules, events, formatCurrency, updateRecurringRule, deleteRecurringRule, skipRecurringRule } = useAppContext();
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  return (
    <section>
      <div className="mb-3 ml-2 flex items-center gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary">Recurring Payments</h3>
        <CalendarClock className="h-4 w-4 text-on-surface-variant" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container">
        {recurringRules.length === 0 ? (
          <div className="p-5 text-sm text-on-surface-variant">
            No recurring schedules yet. Turn on Recurring while creating a transaction, or configure an SIP on an Investment account.
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/20">
            {recurringRules.map(rule => {
              const eventName = events.find(event => event.id === rule.eventId)?.name;
              const isBusy = busyId === rule.id;
              const isManagedSip = rule.id.startsWith('investment-sip:');
              return (
                <div key={rule.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-on-surface">{rule.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${rule.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                          {rule.isActive ? 'Active' : 'Paused'}
                        </span>
                        {isManagedSip && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                            <LockKeyhole className="h-3 w-3" /> Investment SIP
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {formatCurrency(rule.amount)} · {rule.frequency.toLowerCase()} · Next {rule.nextDueDate}
                        {eventName ? ` · ${eventName}` : ''}
                      </p>
                      {isManagedSip && <p className="mt-1 text-[11px] text-on-surface-variant">Managed from its Investment account so the SIP amount, funding account and schedule stay in sync.</p>}
                    </div>
                    {isManagedSip ? (
                      <span className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-semibold text-on-surface-variant">Edit in Manage → Investment</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={isBusy} onClick={() => setEditing({ ...rule })} className="rounded-lg border border-outline-variant/40 p-2 text-on-surface-variant hover:text-primary disabled:opacity-50" aria-label={`Edit ${rule.title}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" disabled={isBusy} onClick={() => void run(rule.id, () => updateRecurringRule({ ...rule, isActive: !rule.isActive }))} className="rounded-lg border border-outline-variant/40 p-2 text-on-surface-variant hover:text-primary disabled:opacity-50" aria-label={rule.isActive ? `Pause ${rule.title}` : `Resume ${rule.title}`}>
                          {rule.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                        <button type="button" disabled={isBusy || !rule.isActive} onClick={() => { if (window.confirm(`Skip the next ${rule.title} occurrence? Existing ledger entries will not be changed.`)) void run(rule.id, () => skipRecurringRule(rule.id)); }} className="rounded-lg border border-outline-variant/40 p-2 text-on-surface-variant hover:text-primary disabled:opacity-50" aria-label={`Skip next ${rule.title}`}>
                          <SkipForward className="h-4 w-4" />
                        </button>
                        <button type="button" disabled={isBusy} onClick={() => { if (window.confirm(`Delete the recurring schedule "${rule.title}"? Existing transactions will remain in the ledger.`)) void run(rule.id, () => deleteRecurringRule(rule.id)); }} className="rounded-lg border border-error/30 p-2 text-error hover:bg-error/10 disabled:opacity-50" aria-label={`Delete recurring schedule ${rule.title}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
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
