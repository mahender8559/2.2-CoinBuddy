import { useState, useMemo, FormEvent } from 'react';
import { useAppContext } from '../context/AppContext';
import { Account, LoanRevision } from '../types';
import { generateLoanSchedule, calculateEmiAmount } from '../utils/emi';
import { 
  X, Percent, Calendar, Calculator, Check, AlertTriangle, ArrowRight, ShieldAlert, Sparkles, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UpdateLoanRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
}

export function UpdateLoanRateModal({ isOpen, onClose, account }: UpdateLoanRateModalProps) {
  const { formatCurrency, addLoanRevision } = useAppContext();

  // Inputs
  const [newRateStr, setNewRateStr] = useState<string>('');
  const [newFrequency, setNewFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'>(
    (account?.paymentFrequency || account?.payment_frequency || 'MONTHLY') as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
  );
  const [effectiveDate, setEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedStrategy, setSelectedStrategy] = useState<'MAINTAIN_EMI' | 'MAINTAIN_TENURE'>('MAINTAIN_EMI');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync initial rate on open/account change
  const currentRate = account?.interestRate ?? account?.interest_rate ?? 0;
  const currentEmi = account?.monthlyEMI ?? account?.monthly_emi ?? 0;
  const originalTenure = account?.tenureMonths ?? account?.tenure_months ?? 12;
  const principal = account?.originalPrincipal || account?.balance || 0;
  const type = (account?.interestCalculationType || account?.interest_calculation_type || 'REDUCING') as 'REDUCING' | 'FLAT' | 'INTEREST_ONLY';
  const currentFrequency = (account?.paymentFrequency || account?.payment_frequency || 'MONTHLY') as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  const startDate = account?.loanStartDate || account?.loan_start_date || account?.nextEMIDate || new Date().toISOString().slice(0, 10);

  // Computed revision choices
  const calculation = useMemo(() => {
    if (!account) return null;

    const newRate = parseFloat(newRateStr);
    if (isNaN(newRate) || newRate <= 0) return null;

    const existingRevisions = account.revisions || [];
    const baseSchedule = generateLoanSchedule(principal, currentRate, originalTenure, type, startDate, existingRevisions, currentFrequency);

    // Find remaining balance on effectiveDate
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
        choice1: {
          newEmi,
          newRemainingMonths: remainingMonthsOld,
          newTotalTenure: originalTenure,
          tenureDiffMonths: 0,
          isValid: true,
          warning: '',
        },
        choice2: {
          newEmi,
          newRemainingMonths: remainingMonthsOld,
          newTotalTenure: originalTenure,
          emiDiff: newEmi - currentEmi,
        }
      };
    }

    // --- Choice 1: Maintain EMI (Calculate new tenure) ---
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
        const numMonths = Math.ceil(
          Math.log(currentEmi / (currentEmi - balanceAtEffectiveDate * r)) / Math.log(1 + r)
        );
        choice1TenureRemaining = Math.max(1, numMonths);
      }
    } else {
      // FLAT rate
      const monthlyInterest = (balanceAtEffectiveDate * (newRate / 100)) / 12;
      if (currentEmi <= monthlyInterest) {
        choice1IsValid = false;
        choice1Warning = `Old EMI is too low for interest at ${newRate}%.`;
      } else {
        choice1TenureRemaining = Math.max(1, Math.ceil(balanceAtEffectiveDate / (currentEmi - monthlyInterest)));
      }
    }

    const choice1TotalTenure = elapsedMonths + choice1TenureRemaining;

    // --- Choice 2: Maintain Tenure (Calculate new EMI) ---
    const choice2Emi = calculateEmiAmount(balanceAtEffectiveDate, newRate, remainingMonthsOld, type);
    const choice2TotalTenure = originalTenure;

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
        newTotalTenure: choice2TotalTenure,
        emiDiff: choice2Emi - currentEmi,
      }
    };
  }, [account, newRateStr, effectiveDate, currentRate, currentEmi, originalTenure, principal, type, startDate]);

  if (!isOpen || !account) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!calculation) return;

    const newRateNum = parseFloat(newRateStr);
    if (isNaN(newRateNum) || newRateNum <= 0) return;

    let finalEmi = currentEmi;
    let finalTenure = originalTenure;

    if (type === 'INTEREST_ONLY') {
      finalEmi = calculation.choice2.newEmi;
      finalTenure = originalTenure;
    } else if (selectedStrategy === 'MAINTAIN_EMI') {
      if (!calculation.choice1.isValid) return;
      finalEmi = currentEmi;
      finalTenure = calculation.choice1.newTotalTenure;
    } else {
      finalEmi = calculation.choice2.newEmi;
      finalTenure = originalTenure;
    }

    const newRevision: Omit<LoanRevision, 'id'> = {
      accountId: account.id,
      effectiveDate,
      newInterestRate: newRateNum,
      newEmi: finalEmi,
      newTenureMonths: finalTenure,
      paymentFrequency: newFrequency,
      payment_frequency: newFrequency,
    };

    addLoanRevision(newRevision);

    setSuccessMessage(`Interest rate revised to ${newRateNum}% effective ${effectiveDate}!`);
    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-container border border-outline-variant/30 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-on-surface">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 border border-primary/20 text-primary rounded-2xl">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Update Floating Interest Rate</h3>
              <p className="text-xs text-on-surface-variant">
                Adjust interest rate & select EMI vs. Tenure revision strategy for <strong className="text-on-surface">{account.name}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Banner */}
        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3.5 rounded-2xl flex items-center gap-2 text-xs font-semibold">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Loan Snapshot */}
          <div className="bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/20 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span className="block text-[10px] text-on-surface-variant uppercase font-semibold">Current Rate</span>
              <span className="font-numeric font-bold text-on-surface text-sm">{currentRate}%</span>
            </div>
            <div>
              <span className="block text-[10px] text-on-surface-variant uppercase font-semibold">Current EMI</span>
              <span className="font-numeric font-bold text-on-surface text-sm">{formatCurrency(currentEmi)}</span>
            </div>
            <div>
              <span className="block text-[10px] text-on-surface-variant uppercase font-semibold">Tenure</span>
              <span className="font-numeric font-bold text-on-surface text-sm">{originalTenure} Months</span>
            </div>
          </div>

          {/* New Rate & Effective Date Inputs */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-primary" /> New Interest Rate (%)
              </label>
              <input
                type="number"
                step="0.05"
                required
                value={newRateStr}
                onChange={(e) => setNewRateStr(e.target.value)}
                placeholder={`e.g. ${(currentRate + 0.5).toFixed(1)}`}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2.5 px-3.5 text-sm font-bold font-numeric text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-primary" /> Effective Date
              </label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2.5 px-3 text-xs font-medium text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {type === 'INTEREST_ONLY' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5 text-primary" /> Payment Frequency
              </label>
              <select
                value={newFrequency}
                onChange={(e) => setNewFrequency(e.target.value as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY')}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2.5 px-3 text-xs font-medium text-on-surface focus:outline-none focus:border-primary appearance-none"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUALLY">Annually</option>
              </select>
            </div>
          )}

          {/* Revision Options Selection */}
          {calculation && (
            <div className="space-y-3 pt-1">
              <label className="block text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Select Adjustment Strategy
              </label>

              {/* Option A Card */}
              <div
                onClick={() => calculation.choice1.isValid && setSelectedStrategy('MAINTAIN_EMI')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                  selectedStrategy === 'MAINTAIN_EMI' 
                    ? 'bg-primary/10 border-primary shadow-sm' 
                    : 'bg-surface-container-low border-outline-variant/20 hover:border-outline-variant/50'
                } ${!calculation.choice1.isValid ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="strategy"
                      checked={selectedStrategy === 'MAINTAIN_EMI'}
                      onChange={() => setSelectedStrategy('MAINTAIN_EMI')}
                      disabled={!calculation.choice1.isValid}
                      className="accent-primary"
                    />
                    <span className="font-bold text-xs text-on-surface">Option A: Maintain Monthly EMI</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    EMI Fixed
                  </span>
                </div>

                <p className="text-[11px] text-on-surface-variant pl-5 mb-2">
                  Keep EMI unchanged at <strong className="text-on-surface">{formatCurrency(currentEmi)}/mo</strong>. Tenure adjusts based on interest rate shift.
                </p>

                {calculation.choice1.isValid ? (
                  <div className="pl-5 flex items-center justify-between text-xs font-numeric font-semibold">
                    <span className="text-on-surface-variant">New Total Tenure:</span>
                    <span className="text-primary font-bold">
                      {calculation.choice1.newTotalTenure} Months 
                      ({calculation.choice1.tenureDiffMonths >= 0 ? `+${calculation.choice1.tenureDiffMonths}` : calculation.choice1.tenureDiffMonths} mo)
                    </span>
                  </div>
                ) : (
                  <div className="pl-5 text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {calculation.choice1.warning}
                  </div>
                )}
              </div>

              {/* Option B Card */}
              <div
                onClick={() => setSelectedStrategy('MAINTAIN_TENURE')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                  selectedStrategy === 'MAINTAIN_TENURE' 
                    ? 'bg-primary/10 border-primary shadow-sm' 
                    : 'bg-surface-container-low border-outline-variant/20 hover:border-outline-variant/50'
                }`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="strategy"
                      checked={selectedStrategy === 'MAINTAIN_TENURE'}
                      onChange={() => setSelectedStrategy('MAINTAIN_TENURE')}
                      className="accent-primary"
                    />
                    <span className="font-bold text-xs text-on-surface">Option B: Maintain Loan Tenure</span>
                  </div>
                  <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                    Tenure Fixed
                  </span>
                </div>

                <p className="text-[11px] text-on-surface-variant pl-5 mb-2">
                  Keep total tenure fixed at <strong className="text-on-surface">{originalTenure} months</strong>. Monthly EMI recalculates.
                </p>

                <div className="pl-5 flex items-center justify-between text-xs font-numeric font-semibold">
                  <span className="text-on-surface-variant">New Monthly EMI:</span>
                  <span className="text-emerald-400 font-bold">
                    {formatCurrency(calculation.choice2.newEmi)}/mo 
                    ({calculation.choice2.emiDiff >= 0 ? `+${formatCurrency(calculation.choice2.emiDiff)}` : formatCurrency(calculation.choice2.emiDiff)})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-surface-container-high hover:bg-surface-container-highest rounded-xl text-xs font-semibold text-on-surface-variant transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!calculation || (selectedStrategy === 'MAINTAIN_EMI' && !calculation.choice1.isValid)}
              className="px-5 py-2.5 bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" /> Apply Rate Revision
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
