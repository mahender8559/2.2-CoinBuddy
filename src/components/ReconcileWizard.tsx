import { useMemo, useState } from 'react';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { Account } from '../types';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';

type AdjustmentKind = 'BALANCE_ADJUSTMENT' | 'MARKET_ADJUSTMENT';

export function ReconcileWizard({ account, kind, onClose }: { account: Account; kind: AdjustmentKind; onClose: () => void }) {
  const { addTransaction, formatCurrency } = useAppContext();
  const [actualValue, setActualValue] = useState(String(account.balance));
  const [error, setError] = useState<string | null>(null);
  const actual = Number(actualValue);
  const cachedBalance = account.balance;
  const difference = Number.isFinite(actual) ? actual - cachedBalance : 0;
  const reconciliationDelta = Math.abs(actual - cachedBalance);
  const targetIsTo = account.type === 'asset'
    ? actual > cachedBalance
    : actual < cachedBalance;
  const isCreditCard = account.type === 'liability' && account.group?.toUpperCase() === 'CREDIT CARD';
  const reconciliationTooLarge = isCreditCard && Number.isFinite(actual) && actual >= 0 && (account.limit ?? 0) > 0 && reconciliationDelta > (account.limit ?? 0) * 0.2;
  const reconciliationWarning = 'Reconciliation difference is too large. Please log missing transactions manually.';
  const label = kind === 'MARKET_ADJUSTMENT' ? 'Update Market Value' : 'Reconcile Balance';

  const summary = useMemo(() => difference === 0 ? 'Already in sync' : `${difference > 0 ? 'Increase' : 'Decrease'} ledger by ${formatCurrency(Math.abs(difference))}`, [difference, formatCurrency]);
  const submit = async () => {
    if (!Number.isFinite(actual) || actual < 0) return setError('Enter a valid non-negative balance.');
    if (reconciliationTooLarge) return setError(reconciliationWarning);
    if (Math.abs(difference) < 0.005) return onClose();
    const result = await addTransaction({
      title: kind === 'MARKET_ADJUSTMENT' ? `Market value update: ${account.name}` : `Balance reconciliation: ${account.name}`,
      subtitle: `Actual value ${formatCurrency(actual)}`,
      amount: reconciliationDelta,
      date: new Date().toISOString(),
      category: kind === 'MARKET_ADJUSTMENT' ? '#market-adjustment' : '#balance-adjustment',
      icon: 'Landmark',
      type: 'transfer',
      account: account.id,
      fromAccountId: targetIsTo ? undefined : account.id,
      toAccountId: targetIsTo ? account.id : undefined,
      transaction_type: 'BALANCE_ADJUSTMENT',
      is_verified: 1,
    });
    if (!result.success) return setError(result.error ?? 'Unable to save adjustment.');
    onClose();
  };

  return <V35ModalFrame size="sm" testId="reconcile-sheet" labelledBy="reconcile-form-title" panelClassName="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><h2 id="reconcile-form-title" className="text-lg font-semibold text-on-surface sm:text-xl">{label}</h2><p className="mt-1 text-sm text-on-surface-variant">{account.name} · Ledger balance {formatCurrency(account.balance)}</p></div><button type="button" aria-label="Close reconciliation" onClick={onClose} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><X className="h-5 w-5" /></button></div>
      <label className="block mt-6 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Current actual balance</label>
      <CurrencyInput autoFocus aria-label="Current actual balance" value={actualValue} onValueChange={setActualValue} className="mt-2 w-full rounded-xl bg-surface-container-high px-4 py-3 text-lg font-bold font-numeric text-on-surface outline-none focus:ring-2 focus:ring-primary" />
      <div className={`mt-4 rounded-2xl p-4 text-sm font-semibold ${difference === 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`}>{summary}</div>
      {reconciliationTooLarge && <p className="mt-3 flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{reconciliationWarning}</p>}
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      <button onClick={submit} disabled={reconciliationTooLarge} className="v35-focus-ring mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="w-5 h-5" /> Save adjustment</button>
  </V35ModalFrame>;
}
