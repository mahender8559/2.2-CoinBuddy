import { useState, useEffect, FormEvent, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, CreditCard, Sparkles, CheckCircle2, Flame, Trophy, ArrowRight, AlertTriangle, PieChart, Calculator, Percent } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateEmiSplit } from '../utils/emi';
import { UpdateLoanRateModal } from './UpdateLoanRateModal';

export function PayCardModal() {
  const { payCardModalState, setPayCardModalState, creditCards, accounts, payCreditCard, payLiability, formatCurrency } = useAppContext();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const showError = (message: string) => setError({ message, id: Date.now() });

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  const [celebration, setCelebration] = useState<{ active: boolean; paidAmount: number; newBalance: number; isFullyPaid: boolean } | null>(null);
  const celebrationTimeout = useRef<number | null>(null);
  const [principalAmount, setPrincipalAmount] = useState<string>('');
  const [interestAmount, setInterestAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'SCHEDULED' | 'PREPAYMENT'>('SCHEDULED');
  const [isRateUpdateOpen, setIsRateUpdateOpen] = useState<boolean>(false);

  const [fromAccountId, setFromAccountId] = useState<string>('');
  useEffect(() => {
    if (payCardModalState.isOpen) {
      const defaultAsset = accounts.find(a => a.type === 'asset' && !a.is_archived)?.id;
      if (defaultAsset) {
        setFromAccountId(defaultAsset);
      }
    }
  }, [payCardModalState.isOpen, accounts]);

  useEffect(() => {
    if (!celebration?.active) return;
    if (celebrationTimeout.current) {
      window.clearTimeout(celebrationTimeout.current);
    }
    celebrationTimeout.current = window.setTimeout(() => {
      setCelebration(null);
      setPayCardModalState({ isOpen: false, cardId: null });
      setAmount('');
    }, 2200);
    return () => {
      if (celebrationTimeout.current) {
        window.clearTimeout(celebrationTimeout.current);
      }
    };
  }, [celebration, setPayCardModalState]);

  const selectedCard = creditCards.find(c => c.id === payCardModalState.cardId);
  const selectedLiability = accounts.find(a => a.id === payCardModalState.cardId && a.type === 'liability');

  const interestType = (selectedLiability?.interestCalculationType || selectedLiability?.interestCalculationType || 'REDUCING') as 'REDUCING' | 'FLAT' | 'INTEREST_ONLY';

  const isLoan = selectedLiability && (
    selectedLiability.group === 'Loan' ||
    selectedLiability.group === 'Interest-Only Loan' ||
    selectedLiability.group === 'Bank Loan' ||
    selectedLiability.monthlyEMI !== undefined ||
    selectedLiability.monthlyEMI !== undefined ||
    selectedLiability.interestRate !== undefined ||
    selectedLiability.interestRate !== undefined
  );

  const annualRate = selectedLiability?.interestRate ?? selectedLiability?.interestRate ?? 0;

  useEffect(() => {
    setError(null);
    setPaymentMode('SCHEDULED');
    if (selectedCard) {
      setAmount(selectedCard.dueAmount.toString());
    } else if (selectedLiability) {
      const emiVal = selectedLiability.monthlyEMI ?? selectedLiability.monthlyEMI ?? selectedLiability.balance ?? 0;
      setAmount(emiVal > 0 ? emiVal.toString() : '');
    }
    setCelebration(null);
  }, [selectedCard, selectedLiability, payCardModalState.isOpen]);

  // Dynamically calculate and pre-fill principalAmount and interestAmount when total EMI changes, loan is selected, or payment mode changes
  const updateSplitForAmount = (newAmount: string, mode: 'SCHEDULED' | 'PREPAYMENT') => {
    setAmount(newAmount);
    if (isLoan && selectedLiability) {
      const currentEmi = parseFloat(newAmount) || 0;
      const isPrepayment = mode === 'PREPAYMENT';
      const split = calculateEmiSplit(selectedLiability.balance, annualRate, currentEmi, interestType, isPrepayment);
      setPrincipalAmount(split.principalAmount.toString());
      setInterestAmount(split.interestAmount.toString());
    } else {
      setPrincipalAmount('');
      setInterestAmount('');
    }
  };

  useEffect(() => {
    updateSplitForAmount(amount, paymentMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLiability, isLoan, annualRate, interestType, paymentMode]);

  if (!payCardModalState.isOpen || (!selectedCard && !selectedLiability)) return null;

  const name = selectedCard?.name || selectedLiability?.name;
  const balance = selectedCard?.balance || selectedLiability?.balance || 0;
  const dueAmount = selectedCard?.dueAmount || selectedLiability?.monthlyEMI || 0;

  const inputNum = parseFloat(amount) || 0;
  const numAmount = Math.max(0, inputNum);
  
  const pAmount = parseFloat(principalAmount) || 0;
  const iAmount = parseFloat(interestAmount) || 0;
  
  // Use principal amount for balance reduction if it's a loan, otherwise use full amount
  const principalReduction = (isLoan && selectedLiability) ? pAmount : numAmount;
  
  const newBalance = Math.max(0, balance - principalReduction);
  const percentReduced = balance > 0 ? Math.min(100, ((principalReduction / balance) * 100)).toFixed(0) : '0';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const inputNum = Number(amount);
    if (!amount || isNaN(inputNum) || inputNum <= 0) return;

    if (inputNum > balance && (!isLoan || (isLoan && pAmount > balance))) {
      showError(`Credit amount is ${formatCurrency(balance)}. Do you want to pay the full amount?`);
      return;
    }

    const paidVal = inputNum;

    // Validate available asset funds
    const asset = accounts.find(a => a.id === fromAccountId);
    if (!asset || paidVal > asset.balance) {
      showError(`Insufficient funds in ${asset?.name || 'selected account'}. Cannot process transaction.`);
      return;
    }

    const isFull = principalReduction >= balance;

    if (selectedCard) {
      payCreditCard(selectedCard.id, paidVal, fromAccountId);
    } else if (selectedLiability) {
      payLiability(selectedLiability.id, paidVal, pAmount, iAmount, fromAccountId);
    }

    setCelebration({
      active: true,
      paidAmount: paidVal,
      newBalance: Math.max(0, balance - principalReduction),
      isFullyPaid: isFull
    });
  };

  const handleCloseCelebration = () => {
    setCelebration(null);
    setPayCardModalState({ isOpen: false, cardId: null });
    setAmount('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="bg-surface-container rounded-3xl w-full max-w-md p-6 border border-outline-variant/30 shadow-2xl animate-fade-in relative overflow-hidden">
        
        {/* Celebration Overlay */}
        <AnimatePresence>
          {celebration?.active && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-surface-container flex flex-col items-center justify-center p-6 text-center"
            >
              {/* Confetti Particles */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#3b82f6'][i % 5],
                      left: `${10 + (i * 4.5)}%`,
                      top: '50%'
                    }}
                    initial={{ y: 0, opacity: 1, scale: 0.5 }}
                    animate={{ 
                      y: [0, -120 - Math.random() * 80, 150], 
                      x: (i % 2 === 0 ? 1 : -1) * (20 + Math.random() * 60),
                      opacity: [1, 1, 0],
                      scale: [0.5, 1.2, 0.8],
                      rotate: Math.random() * 360
                    }}
                    transition={{ duration: 2, ease: "easeOut", repeat: 0 }}
                  />
                ))}
              </div>

              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ duration: 0.5, ease: "backOut" }}
                className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-500 mb-4 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
              >
                {celebration.isFullyPaid ? <Trophy className="w-10 h-10" /> : <CheckCircle2 className="w-10 h-10" />}
              </motion.div>

              <h3 className="text-2xl font-black text-on-surface mb-1">
                {celebration.isFullyPaid ? 'ðŸŽ‰ DEBT ELIMINATED!' : 'âš¡ DEBT REDUCED!'}
              </h3>
              <p className="text-xs text-on-surface-variant mb-6">
                {celebration.isFullyPaid 
                  ? `Congratulations! You completely paid off ${name}!` 
                  : `Boom! You just knocked off debt from ${name}.`}
              </p>

              <div className="w-full bg-surface-container-low border border-outline-variant/30 rounded-2xl p-4 mb-6 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-on-surface-variant font-medium">Amount Paid</span>
                  <span className="font-bold text-emerald-500 text-base font-numeric">+{formatCurrency(celebration.paidAmount)}</span>
                </div>
                <div className="h-px bg-outline-variant/20" />
                <div className="flex justify-between items-center text-sm">
                  <span className="text-on-surface-variant font-medium">Remaining Balance</span>
                  <span className={`font-bold font-numeric ${celebration.newBalance === 0 ? 'text-emerald-500 font-black' : 'text-on-surface'}`}>
                    {celebration.newBalance === 0 ? 'â‚¹0.00 (DEBT FREE)' : formatCurrency(celebration.newBalance)}
                  </span>
                </div>
              </div>

              <button
                onClick={handleCloseCelebration}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
              >
                Awesome!
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setPayCardModalState({ isOpen: false, cardId: null })}
          className="absolute right-4 top-4 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-on-surface">Pay {selectedCard ? 'Credit Card' : 'Liability'}</h2>
            <p className="text-xs text-on-surface-variant">{name}</p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex flex-col gap-3 animate-fade-in shadow-sm mb-5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
              <span className="text-xs font-bold leading-tight">{error.message}</span>
            </div>
            {error.message.includes('Credit amount is') && (
              <button
                type="button"
                onClick={() => {
                  setAmount(balance.toString());
                  setError(null);
                }}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all shadow-md self-start flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> Pay Full Amount ({formatCurrency(balance)})
              </button>
            )}
          </div>
        )}

        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 mb-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Outstanding Balance</span>
            <span className="font-bold text-on-surface font-numeric">{formatCurrency(balance)}</span>
          </div>
          {dueAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Minimum / Due Amount</span>
              <span className="font-bold text-primary font-numeric">{formatCurrency(dueAmount)}</span>
            </div>
          )}

          {isLoan && selectedLiability && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRateUpdateOpen(true)}
                className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
              >
                <Percent className="w-3 h-3" /> Update Floating Interest Rate
              </button>
            </div>
          )}
        </div>

        {/* Live Impact Preview */}
        {numAmount > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3.5 mb-5 space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-500 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" /> {selectedCard ? 'Credit Health & Paydown Impact' : 'Debt Reduction Impact'}
              </span>
              <span className="font-bold text-emerald-500 font-numeric">
                {selectedCard && selectedCard.limit > 0
                  ? `-${((numAmount / selectedCard.limit) * 100).toFixed(0)}% Utilization`
                  : `-${percentReduced}% Debt`}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant font-numeric">{formatCurrency(balance)}</span>
                <ArrowRight className="w-4 h-4 text-emerald-500" />
                <span className={`font-bold font-numeric ${newBalance === 0 ? 'text-emerald-500' : 'text-on-surface'}`}>
                  {newBalance === 0 ? 'â‚¹0.00 (DEBT FREE! ðŸŽ‰)' : formatCurrency(newBalance)}
                </span>
              </div>
              
              {/* Progress Bar */}
              <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden mt-1 flex">
                <motion.div 
                  className="h-full bg-surface-container-highest border-r border-outline-variant/10"
                  initial={{ width: '100%' }}
                  animate={{ width: `${100 - parseFloat(percentReduced)}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
                <motion.div 
                  className="h-full bg-emerald-500"
                  initial={{ width: '0%' }}
                  animate={{ width: `${percentReduced}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              </div>

              {!selectedCard && isLoan && (
                <div className="text-center text-[10px] text-emerald-600/70 font-medium mt-1">
                  New Balance = Current Balance ({formatCurrency(balance)}) - Principal ({formatCurrency(principalReduction)})
                </div>
              )}
            </div>
            {selectedCard && selectedCard.limit > 0 && (
              <p className="text-[10px] text-emerald-400 font-medium pt-0.5">
                âš¡ Frees up {formatCurrency(numAmount)} back into your available credit line
              </p>
            )}
          </motion.div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Pay From</label>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-emerald-500 transition-colors"
              required
            >
              <option value="" disabled>Select Source Account</option>
              {accounts.filter(a => a.type === 'asset' && !a.is_archived).map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance)})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Payment Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-numeric">
                {formatCurrency(0).replace(/[0-9.,]/g, '').trim()}
              </span>
              <input 
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => {
                  updateSplitForAmount(e.target.value, paymentMode);
                }}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 pl-10 pr-4 text-on-surface font-numeric focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-lg font-bold"
                placeholder="0.00"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {dueAmount > 0 && dueAmount !== balance && (
                <button
                  type="button"
                  onClick={() => updateSplitForAmount(dueAmount.toString(), paymentMode)}
                  className="text-xs bg-surface-container-high hover:bg-surface-variant px-3 py-1.5 rounded-full text-on-surface transition-colors font-medium"
                >
                  Pay Due ({formatCurrency(dueAmount)})
                </button>
              )}
              <button
                type="button"
                onClick={() => updateSplitForAmount(balance.toString(), paymentMode)}
                className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 px-3 py-1.5 rounded-full transition-colors font-bold flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> Full Payoff ({formatCurrency(balance)})
              </button>
            </div>
          </div>

          {/* Dynamic Loan EMI Breakdown (Principal vs Interest) */}
          {isLoan && selectedLiability && (
            <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <PieChart className="w-4 h-4 text-primary" /> Loan Payment Split
                </span>
                <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                  {annualRate}% APR
                </span>
              </div>

              {/* Payment Type Mode selector */}
              <div className="grid grid-cols-2 gap-1 bg-surface-container p-1 rounded-xl border border-outline-variant/20 text-xs">
                <button
                  type="button"
                  onClick={() => setPaymentMode('SCHEDULED')}
                  className={`py-1.5 px-3 rounded-lg font-bold transition-all ${
                    paymentMode === 'SCHEDULED'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Scheduled Payment
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('PREPAYMENT')}
                  className={`py-1.5 px-3 rounded-lg font-bold transition-all ${
                    paymentMode === 'PREPAYMENT'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Lump Sum / Prepayment
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-container p-3 rounded-xl border border-outline-variant/20">
                  <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Principal Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-500 font-numeric">
                      â‚¹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={principalAmount}
                      onChange={(e) => {
                        const newP = e.target.value;
                        setPrincipalAmount(newP);
                        const p = parseFloat(newP) || 0;
                        const i = parseFloat(interestAmount) || 0;
                        setAmount((Math.round((p + i) * 100) / 100).toString());
                      }}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg py-1.5 pl-6 pr-2 text-sm font-bold font-numeric text-emerald-500 focus:outline-none focus:border-emerald-500"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-[10px] text-on-surface-variant mt-1">Debt Principal Paydown</p>
                </div>

                <div className="bg-surface-container p-3 rounded-xl border border-outline-variant/20">
                  <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Interest Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-rose-400 font-numeric">
                      â‚¹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={interestAmount}
                      onChange={(e) => {
                        const newI = e.target.value;
                        setInterestAmount(newI);
                        const i = parseFloat(newI) || 0;
                        const p = parseFloat(principalAmount) || 0;
                        setAmount((Math.round((p + i) * 100) / 100).toString());
                      }}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg py-1.5 pl-6 pr-2 text-sm font-bold font-numeric text-rose-400 focus:outline-none focus:border-emerald-500"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-[10px] text-on-surface-variant mt-1">Interest Expense Portion</p>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 mt-2"
          >
            <Sparkles className="w-5 h-5" /> Confirm & Pay Down
          </button>
        </form>

        <UpdateLoanRateModal
          isOpen={isRateUpdateOpen}
          onClose={() => setIsRateUpdateOpen(false)}
          account={selectedLiability || null}
        />
      </div>
    </div>
  );
}

