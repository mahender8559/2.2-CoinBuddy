import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Download, Info, UploadCloud, X } from 'lucide-react';
import type { Account } from '../types';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';

type AdjustmentKind = 'BALANCE_ADJUSTMENT' | 'MARKET_ADJUSTMENT';
type ReconcileStep = 1 | 2 | 3;

const fieldClass = 'h-10 w-full rounded-lg border border-[#21334a] bg-[#101c2c] px-3 text-[12px] font-medium text-[#f5f7fb] outline-none transition focus:border-[#0d6efd] focus:ring-1 focus:ring-[#0d6efd]';
const labelClass = 'mb-1.5 block text-[10.5px] font-medium text-[#cbd4e0]';

export function ReconcileWizard({ account, kind, onClose }: { account: Account; kind: AdjustmentKind; onClose: () => void }) {
  const { addTransaction, formatCurrency } = useAppContext();
  const [step, setStep] = useState<ReconcileStep>(1);
  const [statementDate, setStatementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [actualValue, setActualValue] = useState(String(account.balance));
  const [error, setError] = useState<string | null>(null);

  const actual = Number(actualValue);
  const cachedBalance = account.balance;
  const difference = Number.isFinite(actual) ? actual - cachedBalance : 0;
  const reconciliationDelta = Math.abs(actual - cachedBalance);
  const targetIsTo = account.type === 'asset' ? actual > cachedBalance : actual < cachedBalance;
  const isCreditCard = account.type === 'liability' && account.group?.toUpperCase() === 'CREDIT CARD';
  const reconciliationTooLarge = isCreditCard && Number.isFinite(actual) && actual >= 0 && (account.limit ?? 0) > 0 && reconciliationDelta > (account.limit ?? 0) * 0.2;
  const reconciliationWarning = 'Reconciliation difference is too large. Please log missing transactions manually.';
  const isMarketUpdate = kind === 'MARKET_ADJUSTMENT';

  const summary = useMemo(
    () => difference === 0 ? 'Already in sync' : `${difference > 0 ? 'Increase' : 'Decrease'} ledger by ${formatCurrency(Math.abs(difference))}`,
    [difference, formatCurrency],
  );

  const downloadSample = () => {
    const csv = 'date,description,amount,balance\n2026-08-01,Sample transaction,-250.00,10000.00\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'coinbuddy-reconcile-sample.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const goToMatch = () => {
    setError(null);
    setStep(2);
  };

  const goToReview = () => {
    const numericValue = Number(actualValue);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setError('Enter a valid non-negative balance.');
      return;
    }
    if (reconciliationTooLarge) {
      setError(reconciliationWarning);
      return;
    }
    setError(null);
    setStep(3);
  };

  const submit = async () => {
    if (!Number.isFinite(actual) || actual < 0) return setError('Enter a valid non-negative balance.');
    if (reconciliationTooLarge) return setError(reconciliationWarning);
    if (Math.abs(difference) < 0.005) return onClose();

    const result = await addTransaction({
      title: isMarketUpdate ? `Market value update: ${account.name}` : `Balance reconciliation: ${account.name}`,
      subtitle: `Actual value ${formatCurrency(actual)}`,
      amount: reconciliationDelta,
      date: new Date(`${statementDate}T12:00:00`).toISOString(),
      category: isMarketUpdate ? '#market-adjustment' : '#balance-adjustment',
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

  return (
    <V35ModalFrame size="sm" testId="reconcile-sheet" labelledBy="reconcile-form-title" panelClassName="overflow-hidden p-0">
      <div className="flex h-[54px] shrink-0 items-center justify-between border-b border-[#203047]/70 px-3">
        <button type="button" aria-label="Previous reconciliation step" onClick={() => step > 1 ? setStep((step - 1) as ReconcileStep) : onClose()} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#a6b2c1] hover:bg-[#132238] hover:text-white">
          <span aria-hidden="true" className="text-xl leading-none">‹</span>
        </button>
        <h2 id="reconcile-form-title" className="text-[14px] font-semibold text-white">{isMarketUpdate ? 'Update Market Value' : 'Reconcile Account'}</h2>
        <button type="button" aria-label="Close reconciliation" onClick={onClose} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#a6b2c1] hover:bg-[#132238] hover:text-white"><X className="h-4.5 w-4.5" /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        <div className="mb-3 flex items-center justify-center gap-2 text-[10px] font-medium">
          {(['Upload', 'Match', 'Review'] as const).map((label, index) => {
            const value = (index + 1) as ReconcileStep;
            const active = step === value;
            const complete = step > value;
            return (
              <div key={label} className="flex items-center gap-2">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active || complete ? 'border-blue-500 bg-blue-600 text-white' : 'border-[#46566b] bg-[#0f1b2b] text-[#8a99ad]'}`}>{value}</span>
                <span className={active ? 'text-white' : 'text-[#8998ab]'}>{label}</span>
                {value < 3 ? <span className="h-px w-6 bg-[#35465d]" /> : null}
              </div>
            );
          })}
        </div>

        {step === 1 ? (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Select Account</label>
              <div className="relative">
                <select aria-label="Select Account" value={account.id} disabled className={`${fieldClass} appearance-none pr-8 disabled:opacity-100`}>
                  <option value={account.id}>{account.name}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
              </div>
            </div>

            <div>
              <label htmlFor="reconcile-statement-date" className={labelClass}>Statement Date</label>
              <div className="relative">
                <input id="reconcile-statement-date" aria-label="Statement Date" type="date" value={statementDate} onChange={event => setStatementDate(event.target.value)} className={`${fieldClass} pr-9`} />
                <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
              </div>
            </div>

            <label className="flex min-h-[94px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-500/75 bg-[#0a1727] px-3 py-4 text-center transition hover:bg-[#0d1d31]">
              <input aria-label="Upload statement" type="file" accept=".pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={event => setStatementFile(event.target.files?.[0] ?? null)} />
              <UploadCloud className="h-7 w-7 text-blue-500" />
              <span className="mt-1.5 text-[11px] font-medium text-white">{statementFile ? statementFile.name : 'Upload Statement'}</span>
              <span className="mt-0.5 text-[10px] text-[#8090a5]">PDF, CSV, XLSX up to 10MB</span>
            </label>

            <button type="button" onClick={downloadSample} className="v35-focus-ring mx-auto flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[10.5px] font-medium text-blue-400 hover:bg-blue-500/10">
              <Download className="h-3.5 w-3.5" /> Download Sample Format
            </button>

            <div className="flex items-start gap-2 rounded-lg border border-[#1f3046] bg-[#0d1827] px-3 py-2.5 text-[10.5px] leading-4 text-[#a5b1c0]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <span>We’ll help you review differences and bring the ledger back in sync.</span>
            </div>

            <button type="button" onClick={goToMatch} className="v35-focus-ring flex h-10 w-full items-center justify-center rounded-lg border border-blue-400/20 bg-gradient-to-b from-[#1677ff] to-[#0d60ee] text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(13,96,238,.22)] hover:from-[#2582ff] hover:to-[#176bf5]">Continue</button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#1f3046] bg-[#0d1827] px-3 py-2.5">
              <p className="text-[10px] text-[#8190a5]">Ledger balance</p>
              <p className="mt-1 font-numeric text-[14px] font-semibold text-white">{formatCurrency(account.balance)}</p>
            </div>

            <div>
              <label className={labelClass}>Current actual balance</label>
              <CurrencyInput autoFocus aria-label="Current actual balance" value={actualValue} onValueChange={setActualValue} className={`${fieldClass} font-numeric`} />
            </div>

            <div className={`rounded-lg border px-3 py-2.5 text-[11px] font-medium ${difference === 0 ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-blue-500/25 bg-blue-500/10 text-blue-300'}`}>{summary}</div>

            {reconciliationTooLarge ? <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[10.5px] font-medium leading-4 text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{reconciliationWarning}</p> : null}
            {error ? <p role="alert" className="text-[10.5px] font-medium text-red-300">{error}</p> : null}

            <button type="button" onClick={goToReview} disabled={reconciliationTooLarge} className="v35-focus-ring flex h-10 w-full items-center justify-center rounded-lg bg-gradient-to-b from-[#1677ff] to-[#0d60ee] text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Continue</button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#1f3046] bg-[#0d1827] p-3">
              <div className="flex items-center justify-between gap-3 text-[11px]"><span className="text-[#8796aa]">Account</span><span className="font-medium text-white">{account.name}</span></div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px]"><span className="text-[#8796aa]">Statement date</span><span className="font-medium text-white">{new Date(`${statementDate}T12:00:00`).toLocaleDateString()}</span></div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px]"><span className="text-[#8796aa]">Ledger</span><span className="font-numeric font-medium text-white">{formatCurrency(cachedBalance)}</span></div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px]"><span className="text-[#8796aa]">Actual</span><span className="font-numeric font-medium text-white">{formatCurrency(actual)}</span></div>
              <div className="mt-2 border-t border-[#21334a] pt-2 text-[11px] font-semibold text-blue-300">{summary}</div>
            </div>

            {error ? <p role="alert" className="text-[10.5px] font-medium text-red-300">{error}</p> : null}

            <button type="button" onClick={() => { void submit(); }} disabled={reconciliationTooLarge} className="v35-focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-[#1677ff] to-[#0d60ee] text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Save adjustment</button>
          </div>
        ) : null}
      </div>
    </V35ModalFrame>
  );
}
