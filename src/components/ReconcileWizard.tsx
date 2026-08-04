import { useMemo, useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import type { Account } from '../types';
import { useAppContext } from '../context/AppContext';

type AdjustmentKind = 'BALANCE_ADJUSTMENT' | 'MARKET_ADJUSTMENT';

export function ReconcileWizard({ account, kind, onClose }: { account: Account; kind: AdjustmentKind; onClose: () => void }) {
  const { addTransaction, formatCurrency } = useAppContext();
  const [actualValue, setActualValue] = useState(String(account.balance));
  const [error, setError] = useState<string | null>(null);
  const actual = Number(actualValue);
  const difference = Number.isFinite(actual) ? actual - account.balance : 0;
  const isIncrease = difference > 0;
  const targetIsTo = account.type === 'asset' ? isIncrease : !isIncrease;
  const label = kind === 'MARKET_ADJUSTMENT' ? 'Update Market Value' : 'Reconcile Balance';

  const summary = useMemo(() => difference === 0 ? 'Already in sync' : `${difference > 0 ? 'Increase' : 'Decrease'} ledger by ${formatCurrency(Math.abs(difference))}`, [difference, formatCurrency]);
  const submit = () => {
    if (!Number.isFinite(actual) || actual < 0) return setError('Enter a valid non-negative balance.');
    if (Math.abs(difference) < 0.005) return onClose();
    const result = addTransaction({
      title: kind === 'MARKET_ADJUSTMENT' ? `Market value update: ${account.name}` : `Balance reconciliation: ${account.name}`,
      subtitle: `Actual value ${formatCurrency(actual)}`,
      amount: Math.abs(difference),
      date: new Date().toISOString(),
      category: kind === 'MARKET_ADJUSTMENT' ? '#market-adjustment' : '#balance-adjustment',
      icon: 'Landmark',
      type: 'transfer',
      account: account.id,
      fromAccountId: targetIsTo ? undefined : account.id,
      toAccountId: targetIsTo ? account.id : undefined,
      transaction_type: kind,
      is_verified: 1,
    });
    if (!result.success) return setError(result.error ?? 'Unable to save adjustment.');
    onClose();
  };

  return <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-md rounded-3xl bg-surface-container p-6 shadow-2xl border border-outline-variant/30">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-on-surface">{label}</h2><p className="mt-1 text-sm text-on-surface-variant">{account.name} · Ledger balance {formatCurrency(account.balance)}</p></div><button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-high"><X className="w-5 h-5" /></button></div>
      <label className="block mt-6 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Current actual balance</label>
      <input autoFocus inputMode="decimal" type="number" min="0" value={actualValue} onChange={event => setActualValue(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-high px-4 py-3 text-lg font-bold font-numeric text-on-surface outline-none focus:ring-2 focus:ring-primary" />
      <div className={`mt-4 rounded-2xl p-4 text-sm font-semibold ${difference === 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`}>{summary}</div>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      <button onClick={submit} className="mt-6 w-full rounded-2xl bg-primary px-4 py-3 font-bold text-on-primary flex items-center justify-center gap-2"><CheckCircle2 className="w-5 h-5" /> Save adjustment</button>
    </div>
  </div>;
}
