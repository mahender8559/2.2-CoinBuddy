import { useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, Download, FileText, UploadCloud, X } from 'lucide-react';
import type { Account } from '../types';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';

type AdjustmentKind = 'BALANCE_ADJUSTMENT' | 'MARKET_ADJUSTMENT';
type ReconcileStep = 1 | 2 | 3;

const todayKey = () => new Date().toISOString().slice(0, 10);

export function ReconcileWizard({ account, kind, onClose }: { account: Account; kind: AdjustmentKind; onClose: () => void }) {
  const { addTransaction, formatCurrency, accounts, transactions } = useAppContext();
  const [step, setStep] = useState<ReconcileStep>(1);
  const [selectedAccountId, setSelectedAccountId] = useState(account.id);
  const [statementDate, setStatementDate] = useState(todayKey());
  const [statementFileName, setStatementFileName] = useState('');
  const [actualValue, setActualValue] = useState(String(account.balance));
  const [error, setError] = useState<string | null>(null);

  const eligibleAccounts = accounts.filter(item => item.is_archived !== 1 && item.type === account.type);
  const selectedAccount = accounts.find(item => item.id === selectedAccountId) ?? account;
  const actual = Number(actualValue);
  const cachedBalance = selectedAccount.balance;
  const difference = Number.isFinite(actual) ? actual - cachedBalance : 0;
  const reconciliationDelta = Math.abs(actual - cachedBalance);
  const targetIsTo = selectedAccount.type === 'asset' ? actual > cachedBalance : actual < cachedBalance;
  const isCreditCard = selectedAccount.type === 'liability' && selectedAccount.group?.toUpperCase() === 'CREDIT CARD';
  const reconciliationTooLarge = isCreditCard && Number.isFinite(actual) && actual >= 0 && (selectedAccount.limit ?? 0) > 0 && reconciliationDelta > (selectedAccount.limit ?? 0) * 0.2;
  const reconciliationWarning = 'Reconciliation difference is too large. Please log missing transactions manually.';
  const label = kind === 'MARKET_ADJUSTMENT' ? 'Update Market Value' : 'Reconcile Account';

  const statementCandidates = useMemo(() => {
    const statementEnd = new Date(`${statementDate}T23:59:59`).getTime();
    const statementStart = statementEnd - 35 * 86_400_000;
    return transactions
      .filter(transaction => {
        const timestamp = new Date(transaction.date).getTime();
        const touchesAccount = transaction.account === selectedAccount.id || transaction.fromAccountId === selectedAccount.id || transaction.toAccountId === selectedAccount.id;
        return touchesAccount && timestamp >= statementStart && timestamp <= statementEnd && !transaction.isOpeningBalance;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedAccount.id, statementDate, transactions]);

  const summary = useMemo(
    () => difference === 0 ? 'Already in sync' : `${difference > 0 ? 'Increase' : 'Decrease'} ledger by ${formatCurrency(Math.abs(difference))}`,
    [difference, formatCurrency],
  );

  const downloadSample = () => {
    const sample = 'date,description,amount\n2026-08-01,Example debit,-1250.00\n2026-08-02,Example credit,5000.00\n';
    const url = URL.createObjectURL(new Blob([sample], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'coinbuddy-reconciliation-sample.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    if (!Number.isFinite(actual) || actual < 0) return setError('Enter a valid non-negative balance.');
    if (reconciliationTooLarge) return setError(reconciliationWarning);
    if (Math.abs(difference) < 0.005) return onClose();
    const result = await addTransaction({
      title: kind === 'MARKET_ADJUSTMENT' ? `Market value update: ${selectedAccount.name}` : `Balance reconciliation: ${selectedAccount.name}`,
      subtitle: `Actual value ${formatCurrency(actual)}`,
      amount: reconciliationDelta,
      date: new Date().toISOString(),
      category: kind === 'MARKET_ADJUSTMENT' ? '#market-adjustment' : '#balance-adjustment',
      icon: 'Landmark',
      type: 'transfer',
      account: selectedAccount.id,
      fromAccountId: targetIsTo ? undefined : selectedAccount.id,
      toAccountId: targetIsTo ? selectedAccount.id : undefined,
      transaction_type: 'BALANCE_ADJUSTMENT',
      is_verified: 1,
    });
    if (!result.success) return setError(result.error ?? 'Unable to save adjustment.');
    onClose();
  };

  const stepMeta = [
    { number: 1 as const, label: 'Upload' },
    { number: 2 as const, label: 'Match' },
    { number: 3 as const, label: 'Review' },
  ];

  return (
    <V35ModalFrame size="sm" testId="reconcile-sheet" labelledBy="reconcile-form-title" panelClassName="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="reconcile-form-title" className="text-lg font-semibold text-on-surface">{label}</h2>
          <p className="mt-1 text-xs text-on-surface-variant">Statement-assisted reconciliation with the same ledger guardrails.</p>
        </div>
        <button type="button" aria-label="Close reconciliation" onClick={onClose} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><X className="h-5 w-5" /></button>
      </div>

      <div className="mt-5 flex items-center gap-2" aria-label={`Reconciliation step ${step} of 3`}>
        {stepMeta.map((item, index) => (
          <div key={item.number} className="contents">
            <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${step >= item.number ? 'text-primary' : 'text-on-surface-variant'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${step > item.number ? 'border-primary bg-primary text-white' : step === item.number ? 'border-primary text-primary' : 'border-outline-variant/50'}`}>
                {step > item.number ? <Check className="h-3.5 w-3.5" /> : item.number}
              </span>
              <span>{item.label}</span>
            </div>
            {index < stepMeta.length - 1 ? <span className="h-px flex-1 bg-outline-variant/30" /> : null}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="v35-form-label">Select Account</span>
            <select aria-label="Reconciliation account" value={selectedAccountId} onChange={event => { const next = accounts.find(item => item.id === event.target.value); setSelectedAccountId(event.target.value); if (next) setActualValue(String(next.balance)); }} className="mt-1.5 w-full">
              {eligibleAccounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="v35-form-label">Statement Date</span>
            <input aria-label="Statement date" type="date" value={statementDate} onChange={event => setStatementDate(event.target.value)} className="mt-1.5 w-full" />
          </label>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-primary/70 bg-primary/[0.035] px-4 py-4 text-center transition hover:bg-primary/[0.07]">
            <UploadCloud className="h-7 w-7 text-primary" />
            <span className="mt-2 text-sm font-semibold text-on-surface">{statementFileName || 'Upload Statement'}</span>
            <span className="mt-1 text-[11px] text-on-surface-variant">PDF, CSV, XLSX up to 10MB</span>
            <input aria-label="Upload statement" type="file" accept=".pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={event => setStatementFileName(event.target.files?.[0]?.name ?? '')} />
          </label>
          <button type="button" onClick={downloadSample} className="v35-focus-ring mx-auto flex items-center gap-1.5 text-xs font-semibold text-primary"><Download className="h-3.5 w-3.5" /> Download Sample Format</button>
          <div className="rounded-lg border border-primary/15 bg-primary/[0.055] px-3 py-3 text-xs leading-5 text-on-surface-variant">We’ll surface likely ledger matches first. No balance changes happen until Review.</div>
          <button type="button" onClick={() => setStep(2)} className="w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white">Continue</button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-5">
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4.5 w-4.5" /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-on-surface">{statementFileName || 'Manual reconciliation'}</p><p className="mt-0.5 text-[11px] text-on-surface-variant">{statementCandidates.length} potential ledger matches in the recent statement window</p></div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {statementCandidates.slice(0, 4).map(transaction => (
              <div key={transaction.id} className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-xs font-semibold text-on-surface">{transaction.title}</p><p className="mt-0.5 text-[10px] text-on-surface-variant">{new Date(transaction.date).toLocaleDateString()}</p></div>
                <span className="shrink-0 text-xs font-semibold text-on-surface">{formatCurrency(Math.abs(transaction.amount))}</span>
              </div>
            ))}
            {statementCandidates.length === 0 ? <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-4 text-center text-xs text-on-surface-variant">No recent ledger candidates found. You can still continue and reconcile the actual balance safely.</div> : null}
          </div>
          <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setStep(1)} aria-label="Back to upload" className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setStep(3)} className="rounded-lg bg-primary px-4 text-sm font-semibold text-white">Review Balance</button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-5">
          <label className="block"><span className="v35-form-label">Current actual balance</span><CurrencyInput autoFocus aria-label="Current actual balance" value={actualValue} onValueChange={setActualValue} className="mt-1.5 w-full" /></label>
          <div className={`mt-4 rounded-lg p-3 text-sm font-semibold ${difference === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-primary/10 text-primary'}`}>{summary}</div>
          {reconciliationTooLarge ? <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-xs font-semibold text-rose-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{reconciliationWarning}</p> : null}
          {error ? <p role="alert" className="mt-3 text-xs text-rose-400">{error}</p> : null}
          <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setStep(2)} aria-label="Back to matches" className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => void submit()} disabled={reconciliationTooLarge} className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Save Adjustment</button>
          </div>
        </div>
      ) : null}
    </V35ModalFrame>
  );
}
