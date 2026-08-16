import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Account } from '../types';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';
import { FinanceField, FinanceFormHeader, FinanceSubmitButton, financeFieldClass } from './ui/FinanceForm';

type AdjustmentKind = 'BALANCE_ADJUSTMENT' | 'MARKET_ADJUSTMENT';
type ReconcileStep = 'balance' | 'review';

export function ReconcileWizard({ account, kind, onClose }: { account: Account; kind: AdjustmentKind; onClose: () => void }) {
  const { addTransaction, formatCurrency } = useAppContext();
  const [step, setStep] = useState<ReconcileStep>('balance');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actualValue, setActualValue] = useState(String(account.balance));
  const [error, setError] = useState<string | null>(null);

  const actual = Number(actualValue);
  const cachedBalance = account.balance;
  const difference = Number.isFinite(actual) ? actual - cachedBalance : 0;
  const delta = Math.abs(difference);
  const targetIsTo = account.type === 'asset' ? actual > cachedBalance : actual < cachedBalance;
  const isCreditCard = account.type === 'liability' && account.group?.toUpperCase() === 'CREDIT CARD';
  const differenceTooLarge = isCreditCard && Number.isFinite(actual) && actual >= 0 && (account.limit ?? 0) > 0 && delta > (account.limit ?? 0) * 0.2;
  const isMarketUpdate = kind === 'MARKET_ADJUSTMENT';

  const summary = useMemo(
    () => Math.abs(difference) < 0.005 ? 'Already in sync' : `${difference > 0 ? 'Increase' : 'Decrease'} by ${formatCurrency(delta)}`,
    [delta, difference, formatCurrency],
  );

  const goToReview = () => {
    const numericValue = Number(actualValue);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setError('Enter a valid non-negative balance.');
      return;
    }
    if (differenceTooLarge) {
      setError('The difference is unusually large for this credit card. Log missing transactions first, then reconcile the remaining difference.');
      return;
    }
    setError(null);
    setStep('review');
  };

  const submit = async () => {
    if (!Number.isFinite(actual) || actual < 0) return setError('Enter a valid non-negative balance.');
    if (differenceTooLarge) return setError('The difference is too large to reconcile safely.');
    if (delta < 0.005) return onClose();

    const result = await addTransaction({
      title: isMarketUpdate ? `Market value update: ${account.name}` : `Balance reconciliation: ${account.name}`,
      subtitle: `Actual value ${formatCurrency(actual)}`,
      amount: delta,
      date: new Date(`${effectiveDate}T12:00:00`).toISOString(),
      category: isMarketUpdate ? '#market-adjustment' : '#balance-adjustment',
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

  return (
    <V35ModalFrame size="md" testId="reconcile-sheet" labelledBy="reconcile-form-title" panelClassName="p-0">
      <div id="reconcile-form-title" className="sr-only">{isMarketUpdate ? 'Update Market Value' : 'Reconcile Account'}</div>
      <FinanceFormHeader
        title={isMarketUpdate ? 'Update Market Value' : 'Reconcile Account'}
        subtitle={isMarketUpdate ? 'Bring the tracked investment value up to date' : 'Match CoinBuddy to the balance you know is correct'}
        onClose={onClose}
        closeLabel="Back from reconciliation"
      />

      <div className="cb-finance-body min-h-0 flex-1">
        {step === 'balance' ? (
          <div className="cb-finance-form">
            <div className="rounded-xl border border-[#1f3046] bg-[#0d1827] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#7f90a5]">CoinBuddy balance</p>
              <p className="mt-2 font-numeric text-xl font-semibold text-white">{formatCurrency(cachedBalance)}</p>
              <p className="mt-1 text-[10px] text-[#718197]">{account.name}</p>
            </div>

            <FinanceField label={isMarketUpdate ? 'Current market value' : 'Current actual balance'} htmlFor="reconcile-actual-balance">
              <CurrencyInput id="reconcile-actual-balance" autoFocus aria-label="Current actual balance" value={actualValue} onValueChange={setActualValue} className={`${financeFieldClass} font-numeric`} />
            </FinanceField>

            <FinanceField label="Effective date" htmlFor="reconcile-date">
              <input id="reconcile-date" aria-label="Reconciliation Date" type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} className={financeFieldClass} />
            </FinanceField>

            <div className={`rounded-xl border px-3 py-3 text-[11px] font-semibold ${delta < 0.005 ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-blue-500/25 bg-blue-500/10 text-blue-300'}`}>{summary}</div>

            {differenceTooLarge ? (
              <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[10.5px] leading-4 text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Large credit-card differences usually mean transactions are missing. Add them before reconciling.
              </p>
            ) : null}
            {error ? <p role="alert" className="text-[10.5px] font-medium text-red-300">{error}</p> : null}

            <button type="button" onClick={goToReview} disabled={differenceTooLarge} className="cb-finance-submit cb-submit-primary disabled:opacity-45">Review adjustment</button>
          </div>
        ) : (
          <div className="cb-finance-form">
            <div className="rounded-xl border border-[#1f3046] bg-[#0d1827] p-4 text-[11px]">
              <div className="flex items-center justify-between gap-4"><span className="text-[#8494a8]">Account</span><span className="font-semibold text-white">{account.name}</span></div>
              <div className="mt-3 flex items-center justify-between gap-4"><span className="text-[#8494a8]">Tracked</span><span className="font-numeric font-semibold text-white">{formatCurrency(cachedBalance)}</span></div>
              <div className="mt-3 flex items-center justify-between gap-4"><span className="text-[#8494a8]">Actual</span><span className="font-numeric font-semibold text-white">{formatCurrency(actual)}</span></div>
              <div className="mt-3 flex items-center justify-between gap-4 border-t border-[#21334a] pt-3"><span className="text-[#8494a8]">Adjustment</span><span className="font-numeric font-semibold text-blue-300">{summary}</span></div>
            </div>

            <p className="text-[10.5px] leading-5 text-[#8291a4]">This creates a {isMarketUpdate ? 'market-value' : 'balance'} adjustment in the ledger. No statement file is uploaded or stored.</p>
            {error ? <p role="alert" className="text-[10.5px] font-medium text-red-300">{error}</p> : null}

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep('balance')} className="min-h-11 rounded-xl border border-[#2b3e57] bg-[#101d2e] text-[11px] font-semibold text-[#b5c0cf]">Back</button>
              <form onSubmit={event => { event.preventDefault(); void submit(); }}>
                <FinanceSubmitButton><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Save</span></FinanceSubmitButton>
              </form>
            </div>
          </div>
        )}
      </div>
    </V35ModalFrame>
  );
}
