import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Percent, Sparkles, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { calculateEmiSplit } from '../utils/emi';
import { UpdateLoanRateModal } from './UpdateLoanRateModal';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function PayCardModal() {
  const {
    payCardModalState,
    setPayCardModalState,
    creditCards,
    accounts,
    payCreditCard,
    payLiability,
    formatCurrency,
    getCurrencySymbol,
  } = useAppContext();

  const [amount, setAmount] = useState('');
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const [celebration, setCelebration] = useState<{ active: boolean; paidAmount: number; newBalance: number; isFullyPaid: boolean } | null>(null);
  const [principalAmount, setPrincipalAmount] = useState('');
  const [interestAmount, setInterestAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'SCHEDULED' | 'PREPAYMENT'>('SCHEDULED');
  const [isRateUpdateOpen, setIsRateUpdateOpen] = useState(false);
  const [fromAccountId, setFromAccountId] = useState('');
  const celebrationTimeout = useRef<number | null>(null);
  const initializedPaymentTarget = useRef<string | null>(null);

  const activeAssetAccounts = accounts.filter(account => account.type === 'asset' && !account.is_archived);
  const selectedCard = creditCards.find(card => card.id === payCardModalState.cardId);
  const selectedLiability = accounts.find(account => account.id === payCardModalState.cardId && account.type === 'liability');
  const interestType = selectedLiability?.interestCalculationType || 'REDUCING';
  const isLoan = Boolean(selectedLiability && (
    selectedLiability.group === 'Loan' ||
    selectedLiability.group === 'Interest-Only Loan' ||
    selectedLiability.group === 'Bank Loan' ||
    selectedLiability.monthlyEMI !== undefined ||
    selectedLiability.interestRate !== undefined
  ));
  const annualRate = selectedLiability?.interestRate ?? 0;

  const showError = (message: string) => setError({ message, id: Date.now() });

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!payCardModalState.isOpen) return;
    const currentSelectionIsValid = activeAssetAccounts.some(account => account.id === fromAccountId);
    setFromAccountId(currentSelectionIsValid ? fromAccountId : (activeAssetAccounts[0]?.id ?? ''));
  }, [payCardModalState.isOpen, accounts, fromAccountId]);

  useEffect(() => {
    if (!celebration?.active) return;
    if (celebrationTimeout.current) window.clearTimeout(celebrationTimeout.current);
    celebrationTimeout.current = window.setTimeout(() => {
      setCelebration(null);
      setPayCardModalState({ isOpen: false, cardId: null });
      setAmount('');
    }, 2200);
    return () => {
      if (celebrationTimeout.current) window.clearTimeout(celebrationTimeout.current);
    };
  }, [celebration, setPayCardModalState]);

  useEffect(() => {
    const targetId = payCardModalState.cardId;
    if (!payCardModalState.isOpen || !targetId) {
      initializedPaymentTarget.current = null;
      return;
    }
    if (!selectedCard && !selectedLiability) return;
    if (initializedPaymentTarget.current === targetId) return;

    initializedPaymentTarget.current = targetId;
    setError(null);
    setPaymentMode('SCHEDULED');
    if (selectedCard) setAmount(selectedCard.dueAmount.toString());
    else if (selectedLiability) {
      const emiValue = selectedLiability.monthlyEMI ?? selectedLiability.balance ?? 0;
      setAmount(emiValue > 0 ? emiValue.toString() : '');
    }
    setCelebration(null);
  }, [selectedCard, selectedLiability, payCardModalState.isOpen, payCardModalState.cardId]);

  const updateSplitForAmount = (newAmount: string, mode: 'SCHEDULED' | 'PREPAYMENT') => {
    setAmount(newAmount);
    if (isLoan && selectedLiability) {
      const currentEmi = parseFloat(newAmount) || 0;
      const split = calculateEmiSplit(selectedLiability.balance, annualRate, currentEmi, interestType, mode === 'PREPAYMENT');
      setPrincipalAmount(split.principalAmount.toString());
      setInterestAmount(split.interestAmount.toString());
    } else {
      setPrincipalAmount('');
      setInterestAmount('');
    }
  };

  useEffect(() => {
    // The modal-opening effect sets the default EMI amount asynchronously. Do not
    // write `amount` back from this effect: on the opening render it is still the
    // previous empty value and would erase the EMI before the user can submit.
    if (!isLoan || !selectedLiability) {
      setPrincipalAmount('');
      setInterestAmount('');
      return;
    }

    const currentEmi = parseFloat(amount) || 0;
    if (currentEmi <= 0) {
      setPrincipalAmount('');
      setInterestAmount('');
      return;
    }

    const split = calculateEmiSplit(
      selectedLiability.balance,
      annualRate,
      currentEmi,
      interestType,
      paymentMode === 'PREPAYMENT',
    );
    setPrincipalAmount(split.principalAmount.toString());
    setInterestAmount(split.interestAmount.toString());
  }, [amount, paymentMode, selectedLiability, isLoan, annualRate, interestType]);

  if (!payCardModalState.isOpen || (!selectedCard && !selectedLiability)) return null;

  const name = selectedCard?.name || selectedLiability?.name || 'Account';
  const balance = selectedCard?.balance || selectedLiability?.balance || 0;
  const dueAmount = selectedCard?.dueAmount || selectedLiability?.monthlyEMI || 0;
  const inputNum = parseFloat(amount) || 0;
  const numAmount = Math.max(0, inputNum);
  const pAmount = parseFloat(principalAmount) || 0;
  const iAmount = parseFloat(interestAmount) || 0;
  const principalReduction = isLoan && selectedLiability ? pAmount : numAmount;
  const newBalance = Math.max(0, balance - principalReduction);
  const isPaymentReady = Boolean(fromAccountId) && numAmount > 0 && (!isLoan || pAmount + iAmount > 0);

  const close = () => setPayCardModalState({ isOpen: false, cardId: null });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const paymentAmount = Number(amount);
    if (!amount || isNaN(paymentAmount) || paymentAmount <= 0 || (isLoan && pAmount + iAmount <= 0)) {
      showError('Enter a valid payment amount before paying.');
      return;
    }

    if (paymentAmount > balance && (!isLoan || (isLoan && pAmount > balance))) {
      showError(`Credit amount is ${formatCurrency(balance)}. Do you want to pay the full amount?`);
      return;
    }

    const asset = accounts.find(account => account.id === fromAccountId);
    if (!asset || paymentAmount > asset.balance) {
      showError(`Insufficient funds in ${asset?.name || 'selected account'}. Cannot process transaction.`);
      return;
    }

    const isFull = principalReduction >= balance;
    const result = selectedCard
      ? await payCreditCard(selectedCard.id, paymentAmount, fromAccountId)
      : selectedLiability
        ? await payLiability(selectedLiability.id, paymentAmount, pAmount, iAmount, fromAccountId)
        : { success: false, error: 'Payment target could not be found.' };
    if (!result.success) return showError(result.error || 'Unable to save this payment.');

    setCelebration({
      active: true,
      paidAmount: paymentAmount,
      newBalance: Math.max(0, balance - principalReduction),
      isFullyPaid: isFull,
    });
  };

  const fieldClass = 'h-10 w-full rounded-lg border border-[#21334a] bg-[#111d2d] px-3 text-[12px] font-medium text-[#f5f7fb] outline-none transition focus:border-[#0d6efd] focus:ring-1 focus:ring-[#0d6efd]';
  const labelClass = 'mb-1.5 block text-[10.5px] font-medium text-[#cbd4e0]';
  const sourceAccount = activeAssetAccounts.find(account => account.id === fromAccountId);
  const today = new Date().toISOString().split('T')[0];

  return (
    <V35ModalFrame size="sm" testId="pay-modal" labelledBy="payment-form-title">
      <div className="grid h-[54px] shrink-0 grid-cols-[40px_1fr_40px] items-center border-b border-[#21334a]/70 px-2.5">
        <button type="button" aria-label="Back from payment" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 id="payment-form-title" className="text-center text-[14px] font-semibold text-white">Pay / Pay Down</h2>
        <button type="button" aria-label="Close payment" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        {celebration?.active ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h3 className="mt-3 text-base font-semibold text-white">{celebration.isFullyPaid ? 'Debt paid off' : 'Payment completed'}</h3>
            <p className="mt-1 text-[11px] text-[#8fa0b4]">Paid {formatCurrency(celebration.paidAmount)} · Remaining {formatCurrency(celebration.newBalance)}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-[11px] font-medium text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error.message}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#21334a] bg-[#0c1726] p-1">
              <button type="button" aria-pressed={Boolean(selectedCard)} aria-disabled={!selectedCard} className={`h-8 rounded-md text-[11px] font-medium ${selectedCard ? 'bg-gradient-to-r from-[#6b25db] to-[#4b23cd] text-white shadow-sm' : 'text-[#96a5b7]'}`}>Credit Card</button>
              <button type="button" aria-pressed={Boolean(selectedLiability)} aria-disabled={!selectedLiability} className={`h-8 rounded-md text-[11px] font-medium ${selectedLiability ? 'bg-gradient-to-r from-[#6b25db] to-[#4b23cd] text-white shadow-sm' : 'text-[#96a5b7]'}`}>Loan</button>
            </div>

            <div>
              <label htmlFor="pay-from" className={labelClass}>Pay From</label>
              <div className="relative">
                <select id="pay-from" data-testid="pay-from-select" aria-label="Pay From" value={fromAccountId} onChange={event => setFromAccountId(event.target.value)} className={`${fieldClass} appearance-none pr-8`} required>
                  <option value="" disabled>Select Source Account</option>
                  {activeAssetAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
              </div>
              {sourceAccount ? <p className="mt-1 text-[9.5px] text-[#8191a6]">Available <span className="font-semibold text-emerald-400">{formatCurrency(sourceAccount.balance)}</span></p> : null}
            </div>

            <div>
              <span className={labelClass}>Pay To</span>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-[#21334a] bg-[#111d2d] px-3">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-red-500/15 text-[10px] text-red-300">▣</span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white">{name}</span>
                <span className="text-[9.5px] text-[#75869b]">{selectedCard ? 'Credit Card' : 'Loan'}</span>
              </div>
            </div>

            <div>
              <label htmlFor="payment-amount" className={labelClass}>Amount</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#9aa8ba]">{getCurrencySymbol()}</span>
                <CurrencyInput id="payment-amount" aria-label="Payment Amount" required value={amount} onValueChange={value => updateSplitForAmount(value, paymentMode)} className={`${fieldClass} pl-8 font-numeric`} placeholder="0.00" />
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {[500, 1000, 5000].map(value => (
                  <button key={value} type="button" onClick={() => updateSplitForAmount(String(Math.min(balance, numAmount + value)), paymentMode)} className="h-7 rounded-md border border-[#21334a] bg-[#101d2d] text-[10px] font-medium text-[#a9b5c5] hover:border-blue-500/50 hover:text-blue-300">+{value.toLocaleString()}</button>
                ))}
                <button type="button" onClick={() => updateSplitForAmount(String(balance), paymentMode)} className="h-7 rounded-md border border-blue-500/30 bg-blue-500/10 text-[10px] font-medium text-blue-300">All</button>
              </div>
            </div>

            <div>
              <label htmlFor="payment-date" className={labelClass}>Payment Date</label>
              <input id="payment-date" aria-label="Payment Date" type="date" value={today} readOnly className={`${fieldClass} cursor-default pr-3`} />
            </div>

            {isLoan && selectedLiability ? (
              <details className="group rounded-lg border border-[#1f3046] bg-[#0d1827]">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between px-3 text-[11px] font-medium text-[#9aa8ba]">
                  Loan payment details
                  <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                </summary>
                <div className="space-y-3 border-t border-[#1f3046] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] text-[#93a2b5]">Outstanding</span>
                    <span className="font-numeric text-[10.5px] font-semibold text-white">{formatCurrency(balance)}</span>
                  </div>
                  {dueAmount > 0 ? <div className="flex items-center justify-between"><span className="text-[10.5px] text-[#93a2b5]">Due amount</span><span className="font-numeric text-[10.5px] font-semibold text-blue-300">{formatCurrency(dueAmount)}</span></div> : null}

                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#21334a] bg-[#0c1726] p-1">
                    <button type="button" onClick={() => setPaymentMode('SCHEDULED')} className={`h-8 rounded-md text-[10px] font-medium ${paymentMode === 'SCHEDULED' ? 'bg-blue-600 text-white' : 'text-[#94a4b8]'}`}>Scheduled</button>
                    <button type="button" onClick={() => setPaymentMode('PREPAYMENT')} className={`h-8 rounded-md text-[10px] font-medium ${paymentMode === 'PREPAYMENT' ? 'bg-emerald-600 text-white' : 'text-[#94a4b8]'}`}>Prepayment</button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={labelClass}>Principal</label><CurrencyInput value={principalAmount} onValueChange={value => { setPrincipalAmount(value); setAmount(String((parseFloat(value) || 0) + (parseFloat(interestAmount) || 0))); }} className={fieldClass} /></div>
                    <div><label className={labelClass}>Interest</label><CurrencyInput value={interestAmount} onValueChange={value => { setInterestAmount(value); setAmount(String((parseFloat(principalAmount) || 0) + (parseFloat(value) || 0))); }} className={fieldClass} /></div>
                  </div>

                  <button type="button" onClick={() => setIsRateUpdateOpen(true)} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#29405d] bg-[#111d2d] text-[10.5px] font-medium text-blue-300"><Percent className="h-3.5 w-3.5" /> Update Floating Interest Rate</button>
                  <p className="text-[9.5px] text-[#74859a]">Projected balance after this payment: {formatCurrency(newBalance)}</p>
                </div>
              </details>
            ) : null}

            <button type="submit" disabled={activeAssetAccounts.length === 0 || !isPaymentReady} data-testid="confirm-payment" className="v35-focus-ring mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-purple-400/20 bg-gradient-to-b from-[#812bd8] to-[#6821c4] text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(116,37,201,.24)] hover:from-[#9235e9] hover:to-[#7425d0] disabled:cursor-not-allowed disabled:opacity-50">
              <Sparkles className="h-4 w-4" /> Pay Now
            </button>
          </form>
        )}
      </div>

      <UpdateLoanRateModal isOpen={isRateUpdateOpen} onClose={() => setIsRateUpdateOpen(false)} account={selectedLiability || null} />
    </V35ModalFrame>
  );
}
