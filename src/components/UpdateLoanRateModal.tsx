import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronDown, RefreshCw, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { Account, LoanRevision } from '../types';
import { calculateEmiAmount, generateLoanSchedule } from '../utils/emi';
import { V35ModalFrame } from './ui/V35ModalFrame';

interface UpdateLoanRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
}

const fieldClass = 'h-10 w-full rounded-lg border border-[#21334a] bg-[#101c2c] px-3 text-[12px] font-medium text-[#f5f7fb] outline-none transition placeholder:text-[#6f7e91] focus:border-[#0d6efd] focus:ring-1 focus:ring-[#0d6efd]';
const labelClass = 'mb-1.5 block text-[10.5px] font-medium text-[#cbd4e0]';

export function UpdateLoanRateModal({ isOpen, onClose, account }: UpdateLoanRateModalProps) {
  const { formatCurrency, addLoanRevision } = useAppContext();
  const [newRateStr, setNewRateStr] = useState<string>('');
  const [newFrequency, setNewFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'>(
    (account?.paymentFrequency || 'MONTHLY') as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
  );
  const [effectiveDate, setEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedStrategy, setSelectedStrategy] = useState<'MAINTAIN_EMI' | 'MAINTAIN_TENURE'>('MAINTAIN_EMI');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const currentRate = account?.interestRate ?? 0;
  const currentEmi = account?.monthlyEMI ?? 0;
  const originalTenure = account?.tenureMonths ?? 12;
  const principal = account?.originalPrincipal || account?.balance || 0;
  const type = (account?.interestCalculationType || 'REDUCING') as 'REDUCING' | 'FLAT' | 'INTEREST_ONLY';
  const currentFrequency = (account?.paymentFrequency || 'MONTHLY') as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  const startDate = account?.loanStartDate || account?.nextEMIDate || new Date().toISOString().slice(0, 10);

  const calculation = useMemo(() => {
    if (!account) return null;
    const newRate = parseFloat(newRateStr);
    if (Number.isNaN(newRate) || newRate <= 0) return null;

    const existingRevisions = account.revisions || [];
    const baseSchedule = generateLoanSchedule(principal, currentRate, originalTenure, type, startDate, existingRevisions, currentFrequency);
    const effDateObj = new Date(effectiveDate);
    let balanceAtEffectiveDate = principal;
    let elapsedMonths = 0;

    for (const row of baseSchedule.schedule) {
      const rowDate = new Date(row.isoDate || row.date);
      if (rowDate <= effDateObj) {
        balanceAtEffectiveDate = row.remainingBalance;
        elapsedMonths = row.monthIndex;
      }
    }

    const remainingMonthsOld = Math.max(1, originalTenure - elapsedMonths);

    if (type === 'INTEREST_ONLY') {
      const newEmi = calculateEmiAmount(balanceAtEffectiveDate, newRate, remainingMonthsOld, 'INTEREST_ONLY', newFrequency);
      return {
        balanceAtEffectiveDate,
        elapsedMonths,
        remainingMonthsOld,
        isInterestOnly: true,
        choice1: { newEmi, newRemainingMonths: remainingMonthsOld, newTotalTenure: originalTenure, tenureDiffMonths: 0, isValid: true, warning: '' },
        choice2: { newEmi, newRemainingMonths: remainingMonthsOld, newTotalTenure: originalTenure, emiDiff: newEmi - currentEmi },
      };
    }

    let choice1TenureRemaining = remainingMonthsOld;
    let choice1IsValid = true;
    let choice1Warning = '';

    if (type === 'REDUCING') {
      const r = newRate / 1200;
      const minRequiredEmi = balanceAtEffectiveDate * r;
      if (currentEmi <= minRequiredEmi) {
        choice1IsValid = false;
        choice1Warning = `Old EMI (${formatCurrency(currentEmi)}) is too low to cover monthly interest (${formatCurrency(minRequiredEmi)}) at ${newRate}%.`;
      } else {
        const numMonths = Math.ceil(Math.log(currentEmi / (currentEmi - balanceAtEffectiveDate * r)) / Math.log(1 + r));
        choice1TenureRemaining = Math.max(1, numMonths);
      }
    } else {
      const monthlyInterest = (balanceAtEffectiveDate * (newRate / 100)) / 12;
      if (currentEmi <= monthlyInterest) {
        choice1IsValid = false;
        choice1Warning = `Old EMI is too low for interest at ${newRate}%.`;
      } else {
        choice1TenureRemaining = Math.max(1, Math.ceil(balanceAtEffectiveDate / (currentEmi - monthlyInterest)));
      }
    }

    const choice1TotalTenure = elapsedMonths + choice1TenureRemaining;
    const choice2Emi = calculateEmiAmount(balanceAtEffectiveDate, newRate, remainingMonthsOld, type);

    return {
      balanceAtEffectiveDate,
      elapsedMonths,
      remainingMonthsOld,
      choice1: {
        newEmi: currentEmi,
        newRemainingMonths: choice1TenureRemaining,
        newTotalTenure: choice1TotalTenure,
        tenureDiffMonths: choice1TotalTenure - originalTenure,
        isValid: choice1IsValid,
        warning: choice1Warning,
      },
      choice2: {
        newEmi: choice2Emi,
        newRemainingMonths: remainingMonthsOld,
        newTotalTenure: originalTenure,
        emiDiff: choice2Emi - currentEmi,
      },
    };
  }, [account, newRateStr, effectiveDate, currentRate, currentEmi, originalTenure, principal, type, startDate, currentFrequency, newFrequency, formatCurrency]);

  if (!isOpen || !account) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!calculation) return;
    const newRateNum = parseFloat(newRateStr);
    if (Number.isNaN(newRateNum) || newRateNum <= 0) return;

    let finalEmi = currentEmi;
    let finalTenure = originalTenure;
    if (type === 'INTEREST_ONLY') {
      finalEmi = calculation.choice2.newEmi;
    } else if (selectedStrategy === 'MAINTAIN_EMI') {
      if (!calculation.choice1.isValid) return;
      finalTenure = calculation.choice1.newTotalTenure;
    } else {
      finalEmi = calculation.choice2.newEmi;
    }

    const newRevision: Omit<LoanRevision, 'id'> = {
      accountId: account.id,
      effectiveDate,
      newInterestRate: newRateNum,
      newEmi: finalEmi,
      newTenureMonths: finalTenure,
      paymentFrequency: newFrequency,
    };

    const result = await addLoanRevision(newRevision);
    if (!result.success) return;
    setSuccessMessage(`Interest rate revised to ${newRateNum}% effective ${effectiveDate}.`);
    window.setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 900);
  };

  return (
    <V35ModalFrame size="sm" testId="loan-rate-sheet" labelledBy="loan-rate-form-title" panelClassName="overflow-hidden p-0">
      <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-[#21334a]/70 px-2.5">
        <button type="button" aria-label="Back from loan rate update" onClick={onClose} className="v35-focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa8ba] hover:bg-[#132238]"><span aria-hidden="true" className="text-lg">‹</span></button>
        <h3 id="loan-rate-form-title" className="text-[12px] font-semibold text-white">Update Loan Rate</h3>
        <button type="button" aria-label="Close loan rate update" onClick={onClose} className="v35-focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa8ba] hover:bg-[#132238]"><X className="h-4 w-4" /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 p-3.5">
        {successMessage ? <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10.5px] font-medium text-emerald-300"><Check className="h-3.5 w-3.5" />{successMessage}</div> : null}

        <div>
          <label className={labelClass}>Loan Account</label>
          <div className="relative">
            <select aria-label="Loan Account" value={account.id} disabled className={`${fieldClass} appearance-none pr-8 disabled:opacity-100`}><option value={account.id}>{account.name}</option></select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
          </div>
        </div>

        <div>
          <label htmlFor="new-interest-rate" className={labelClass}>New Interest Rate (%)</label>
          <input id="new-interest-rate" type="number" step="0.01" min="0.01" required value={newRateStr} onChange={event => setNewRateStr(event.target.value)} placeholder={currentRate ? String(currentRate) : '9.25'} className={`${fieldClass} font-numeric`} />
        </div>

        <div>
          <label htmlFor="loan-rate-effective-date" className={labelClass}>Effective From</label>
          <div className="relative">
            <input id="loan-rate-effective-date" type="date" required value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} className={`${fieldClass} pr-9`} />
            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
          </div>
        </div>

        <details className="group rounded-lg border border-[#1f3046] bg-[#0d1827]">
          <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between px-3 text-[10.5px] font-medium text-[#9aa8ba]">Adjustment strategy <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary>
          <div className="space-y-2.5 border-t border-[#1f3046] p-3">
            <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-[#21334a] bg-[#101c2c] p-2 text-center">
              <div><p className="text-[9px] text-[#7e8da1]">Current Rate</p><p className="mt-0.5 font-numeric text-[10.5px] font-semibold text-white">{currentRate}%</p></div>
              <div><p className="text-[9px] text-[#7e8da1]">Current EMI</p><p className="mt-0.5 font-numeric text-[10.5px] font-semibold text-white">{formatCurrency(currentEmi)}</p></div>
              <div><p className="text-[9px] text-[#7e8da1]">Tenure</p><p className="mt-0.5 font-numeric text-[10.5px] font-semibold text-white">{originalTenure} mo</p></div>
            </div>

            {type === 'INTEREST_ONLY' ? (
              <div><label className={labelClass}>Payment Frequency</label><select value={newFrequency} onChange={event => setNewFrequency(event.target.value as typeof newFrequency)} className={fieldClass}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option></select></div>
            ) : null}

            {calculation ? (
              <div className="space-y-2">
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${selectedStrategy === 'MAINTAIN_EMI' ? 'border-blue-500/60 bg-blue-500/10' : 'border-[#21334a] bg-[#101c2c]'} ${calculation.choice1.isValid ? '' : 'cursor-not-allowed opacity-50'}`}>
                  <input aria-label="Option A: Maintain Monthly EMI" type="radio" name="strategy" checked={selectedStrategy === 'MAINTAIN_EMI'} onChange={() => setSelectedStrategy('MAINTAIN_EMI')} disabled={!calculation.choice1.isValid} className="mt-0.5 accent-blue-600" />
                  <span className="min-w-0"><span className="block text-[10.5px] font-semibold text-white">Maintain Monthly EMI</span><span className="mt-0.5 block text-[9.5px] leading-4 text-[#8998ab]">Tenure becomes {calculation.choice1.newTotalTenure} months.</span>{!calculation.choice1.isValid ? <span className="mt-1 flex gap-1 text-[9.5px] leading-4 text-red-300"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{calculation.choice1.warning}</span> : null}</span>
                </label>
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${selectedStrategy === 'MAINTAIN_TENURE' ? 'border-blue-500/60 bg-blue-500/10' : 'border-[#21334a] bg-[#101c2c]'}`}>
                  <input aria-label="Option B: Maintain Loan Tenure" type="radio" name="strategy" checked={selectedStrategy === 'MAINTAIN_TENURE'} onChange={() => setSelectedStrategy('MAINTAIN_TENURE')} className="mt-0.5 accent-blue-600" />
                  <span><span className="block text-[10.5px] font-semibold text-white">Maintain Loan Tenure</span><span className="mt-0.5 block text-[9.5px] leading-4 text-[#8998ab]">New EMI {formatCurrency(calculation.choice2.newEmi)}.</span></span>
                </label>
              </div>
            ) : <p className="text-[9.5px] leading-4 text-[#8190a5]">Enter the new rate to preview the EMI / tenure impact.</p>}
          </div>
        </details>

        <button type="submit" disabled={!calculation || (selectedStrategy === 'MAINTAIN_EMI' && !calculation.choice1.isValid)} className="v35-focus-ring flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-[#1677ff] to-[#0d60ee] text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"><RefreshCw className="h-3.5 w-3.5" /> Update Rate</button>
      </form>
    </V35ModalFrame>
  );
}
