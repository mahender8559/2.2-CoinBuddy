import { useState, FormEvent, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, ShieldAlert, Info } from 'lucide-react';
import { calculateEmiAmount } from '../utils/emi';
import { CurrencyInput } from './CurrencyInput';
import { findInvestmentSipRule } from '../domain/investmentSip';

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function AddAccountModal() {
  const { 
    addAccountModalType, 
    setAddAccountModalType, 
    addAccount, 
    updateAccount, 
    deleteAccount,
    addCreditCard, 
    updateCreditCard,
    editingAccount,
    setEditingAccount,
    editingCreditCard,
    setEditingCreditCard,
    transactions,
    accounts,
    recurringRules,
    people,
    loanSharingRules,
    loanContributionRules,
    getCurrencySymbol
  } = useAppContext();
  
  // Generic fields
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  
  // Asset fields
  const [group, setGroup] = useState('Bank Account');
  const [investmentMethod, setInvestmentMethod] = useState<'SIP' | 'Lump Sum'>('SIP');
  const [investedAmount, setInvestedAmount] = useState('');
  const [monthlySIPAmount, setMonthlySIPAmount] = useState('');
  const [nextSIPDate, setNextSIPDate] = useState('');
  const [sipSourceAccountId, setSipSourceAccountId] = useState('');

  // Liability fields
  const [liabilityType, setLiabilityType] = useState('Credit Card');
  const [dueAmount, setDueAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [billingCycleDay, setBillingCycleDay] = useState('1');
  const [limit, setLimit] = useState('');
  
  // Loan fields
  const [originalPrincipal, setOriginalPrincipal] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [monthlyEMI, setMonthlyEMI] = useState('');
  const [nextEMIDate, setNextEMIDate] = useState('');
  const [interestCalculationType, setInterestCalculationType] = useState<'REDUCING' | 'FLAT' | 'INTEREST_ONLY'>('REDUCING');
  const [paymentFrequency, setPaymentFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'>('MONTHLY');
  const [tenureMonths, setTenureMonths] = useState('');
  const [loanStartDate, setLoanStartDate] = useState('');
  const [isEmiManualOverride, setIsEmiManualOverride] = useState(false);
  const [isSharedLoan, setIsSharedLoan] = useState(false);
  const [personalResponsibilityPercent, setPersonalResponsibilityPercent] = useState('100');
  const [contributionMode, setContributionMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [contributionValues, setContributionValues] = useState<Record<string, string>>({});
  
  // Interest-Only Loan fields
  const [monthlyInterestRate, setMonthlyInterestRate] = useState('');
  const [nextInterestDueDate, setNextInterestDueDate] = useState('');

  // Penalty fields (Financial Advocate Mode)
  const [lateFeeFixedAmount, setLateFeeFixedAmount] = useState('');
  const [lateFeeInterestRate, setLateFeeInterestRate] = useState('');
  const [gracePeriodDays, setGracePeriodDays] = useState('0');

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

  // Populate or reset fields when modal opens/edits
  useEffect(() => {
    if (editingCreditCard) {
      setName(editingCreditCard.name || '');
      const openingTx = transactions.find(t => 
        (t.isOpeningBalance || t.transaction_type === 'OPENING_BALANCE') &&
        (t.account === editingCreditCard.id || t.toAccountId === editingCreditCard.id || t.fromAccountId === editingCreditCard.id)
      );
      setBalance(openingTx ? Math.abs(openingTx.amount).toString() : '0');
      setLiabilityType('Credit Card');
      setDueAmount(editingCreditCard.dueAmount !== undefined ? editingCreditCard.dueAmount.toString() : '');
      setDueDate(editingCreditCard.dueDate || '');
      setBillingCycleDay(editingCreditCard.billingCycleDay ? editingCreditCard.billingCycleDay.toString() : '1');
      setLimit(editingCreditCard.limit !== undefined ? editingCreditCard.limit.toString() : '');
    } else if (editingAccount) {
      setName(editingAccount.name || '');
      const openingTx = transactions.find(t => 
        (t.isOpeningBalance || t.transaction_type === 'OPENING_BALANCE') &&
        (t.account === editingAccount.id || t.toAccountId === editingAccount.id || t.fromAccountId === editingAccount.id)
      );
      setBalance(openingTx ? Math.abs(openingTx.amount).toString() : '0');
      if (editingAccount.type === 'asset') {
        setGroup(editingAccount.group || 'Bank Account');
        setInvestmentMethod(editingAccount.investmentMethod || 'SIP');
        setInvestedAmount(editingAccount.investedAmount !== undefined ? editingAccount.investedAmount.toString() : '');
        setMonthlySIPAmount(editingAccount.monthlySIPAmount !== undefined ? editingAccount.monthlySIPAmount.toString() : '');
        const sipRule = findInvestmentSipRule(editingAccount.id, recurringRules);
        setNextSIPDate(sipRule?.nextDueDate || editingAccount.nextSIPDate || '');
        setSipSourceAccountId(sipRule?.fromAccountId || '');
      } else {
        setLiabilityType(editingAccount.group || 'Bank Loan');
        setOriginalPrincipal(editingAccount.originalPrincipal !== undefined ? editingAccount.originalPrincipal.toString() : (editingAccount.balance !== undefined ? editingAccount.balance.toString() : ''));
        setInterestRate(editingAccount.interestRate !== undefined ? editingAccount.interestRate.toString() : (editingAccount.interestRate !== undefined ? editingAccount.interestRate.toString() : ''));
        setMonthlyEMI(editingAccount.monthlyEMI !== undefined ? editingAccount.monthlyEMI.toString() : (editingAccount.monthlyEMI !== undefined ? editingAccount.monthlyEMI.toString() : ''));
        setNextEMIDate(editingAccount.nextEMIDate || editingAccount.loanStartDate || editingAccount.loanStartDate || '');
        setInterestCalculationType(editingAccount.interestCalculationType || 'REDUCING');
        setPaymentFrequency(editingAccount.paymentFrequency || 'MONTHLY');
        setTenureMonths(editingAccount.tenureMonths !== undefined ? editingAccount.tenureMonths.toString() : (editingAccount.tenureMonths !== undefined ? editingAccount.tenureMonths.toString() : ''));
        setLoanStartDate(editingAccount.loanStartDate || editingAccount.loanStartDate || editingAccount.nextEMIDate || '');
        setMonthlyInterestRate(editingAccount.monthlyInterestRate !== undefined ? editingAccount.monthlyInterestRate.toString() : '');
        setNextInterestDueDate(editingAccount.nextInterestDueDate || '');
        setLateFeeFixedAmount(editingAccount.lateFeeFixedAmount !== undefined ? editingAccount.lateFeeFixedAmount.toString() : (editingAccount.lateFeeFixedAmount !== undefined ? editingAccount.lateFeeFixedAmount.toString() : ''));
        setLateFeeInterestRate(editingAccount.lateFeeInterestRate !== undefined ? editingAccount.lateFeeInterestRate.toString() : (editingAccount.lateFeeInterestRate !== undefined ? editingAccount.lateFeeInterestRate.toString() : ''));
        setGracePeriodDays(editingAccount.gracePeriodDays !== undefined ? editingAccount.gracePeriodDays.toString() : (editingAccount.gracePeriodDays !== undefined ? editingAccount.gracePeriodDays.toString() : '0'));
        const sharing = loanSharingRules.find(rule => rule.accountId === editingAccount.id && rule.isShared);
        const contributions = loanContributionRules.filter(rule => rule.accountId === editingAccount.id && rule.isActive);
        setIsSharedLoan(Boolean(sharing));
        setPersonalResponsibilityPercent(String(sharing?.personalResponsibilityPercent ?? 100));
        setContributionMode(contributions[0]?.mode ?? 'PERCENT');
        setContributionValues(Object.fromEntries(contributions.map(rule => [rule.personId, String(rule.value)])));
        setIsEmiManualOverride(false);
      }
    } else if (addAccountModalType) {
      setName('');
      setBalance('');
      setGroup('Bank Account');
      setInvestmentMethod('SIP');
      setInvestedAmount('');
      setMonthlySIPAmount('');
      setNextSIPDate('');
      setSipSourceAccountId('');
      setLiabilityType('Credit Card');
      setDueAmount('');
      setDueDate('');
      setBillingCycleDay('1');
      setLimit('');
      setOriginalPrincipal('');
      setInterestRate('');
      setMonthlyEMI('');
      setNextEMIDate('');
      setInterestCalculationType('REDUCING');
      setPaymentFrequency('MONTHLY');
      setTenureMonths('');
      setLoanStartDate('');
      setMonthlyInterestRate('');
      setNextInterestDueDate('');
      setLateFeeFixedAmount('');
      setLateFeeInterestRate('');
      setGracePeriodDays('0');
      setIsSharedLoan(false);
      setPersonalResponsibilityPercent('100');
      setContributionMode('PERCENT');
      setContributionValues({});
      setIsEmiManualOverride(false);
    }
  }, [addAccountModalType, editingAccount, editingCreditCard, recurringRules, loanSharingRules, loanContributionRules]);

  // Auto-set interestCalculationType when liabilityType changes
  useEffect(() => {
    if (liabilityType === 'Interest-Only Loan') {
      setInterestCalculationType('INTEREST_ONLY');
    }
  }, [liabilityType]);

  // Auto-calculate EMI when Principal, Rate, Tenure, Calculation Type, or Payment Frequency changes
  useEffect(() => {
    const isLoanType = liabilityType === 'Bank Loan' || liabilityType === 'Loan' || liabilityType === 'Mortgage' || liabilityType === 'Interest-Only Loan';
    if (addAccountModalType === 'liability' && isLoanType && !isEmiManualOverride) {
      const p = parseFloat(originalPrincipal) || parseFloat(balance) || 0;
      const rate = parseFloat(interestRate) || 0;
      const tenure = parseInt(tenureMonths) || 0;
      if (p > 0 && (tenure > 0 || interestCalculationType === 'INTEREST_ONLY')) {
        const calculated = calculateEmiAmount(p, rate, tenure || 1, interestCalculationType, paymentFrequency);
        if (calculated >= 0) {
          setMonthlyEMI(calculated.toString());
        }
      }
    }
  }, [originalPrincipal, balance, interestRate, tenureMonths, interestCalculationType, paymentFrequency, liabilityType, addAccountModalType, isEmiManualOverride]);

  if (!addAccountModalType) return null;

  const handleClose = () => {
    setAddAccountModalType(null);
    setEditingAccount(null);
    setEditingCreditCard(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name || balance === '') return;

    const numBalance = Math.abs(Number(balance) || 0);

    if (addAccountModalType === 'asset') {
      if (group === 'Investment' && investmentMethod === 'SIP' && (!monthlySIPAmount || Number(monthlySIPAmount) <= 0 || !nextSIPDate || !sipSourceAccountId)) {
        showError('For an SIP, enter the monthly amount, next SIP date, and funding account.');
        return;
      }
      const assetData = {
        name,
        type: 'asset' as const,
        balance: numBalance,
        group,
        ...(group === 'Investment' ? {
          investmentMethod,
          investedAmount: Math.abs(Number(investedAmount) || 0),
          ...(investmentMethod === 'SIP' ? {
            monthlySIPAmount: Math.abs(Number(monthlySIPAmount) || 0),
            nextSIPDate: nextSIPDate
          } : {})
        } : {})
      };

      if (editingAccount) {
        try {
          updateAccount(editingAccount.id, assetData, { sipSourceAccountId });
        } catch (err: unknown) {
          showError(getErrorMessage(err, 'Failed to update account'));
          return;
        }
      } else {
        try {
          addAccount(assetData, { sipSourceAccountId });
        } catch (err: unknown) {
          showError(getErrorMessage(err, 'Failed to add account'));
          return;
        }
      }
    } else {
      if (liabilityType === 'Credit Card') {
        if (!dueDate || !limit) return;
        const cardData = {
          name,
          balance: numBalance,
          dueAmount: Math.abs(Number(dueAmount) || 0),
          dueDate,
          billingCycleDay: parseInt(billingCycleDay, 10) || 1,
          limit: Math.abs(Number(limit) || 0)
        };

        if (editingCreditCard) {
          try {
            updateCreditCard(editingCreditCard.id, cardData);
          } catch (err: unknown) {
            showError(getErrorMessage(err, 'Failed to update credit card'));
            return;
          }
        } else {
          if (editingAccount) {
            try {
              deleteAccount(editingAccount.id);
            } catch (err: unknown) {
              showError(getErrorMessage(err, 'Failed to update account type'));
              return;
            }
          }
          try {
            addCreditCard(cardData);
          } catch (err: unknown) {
            showError(getErrorMessage(err, 'Failed to add credit card'));
            return;
          }
        }
      } else if (liabilityType === 'Bank Loan' || liabilityType === 'Loan' || liabilityType === 'Mortgage' || liabilityType === 'Interest-Only Loan' || liabilityType === 'Other') {
        const numP = Math.abs(Number(originalPrincipal) || numBalance);
        const finalInterestCalcType = liabilityType === 'Interest-Only Loan' ? 'INTEREST_ONLY' : interestCalculationType;
        const activePeople = people.filter(person => !person.isArchived);
        const sharingContributions = activePeople.map(person => ({
          personId: person.id,
          mode: contributionMode,
          value: Math.max(0, Number(contributionValues[person.id] || 0)),
          isActive: isSharedLoan,
        })).filter(rule => !isSharedLoan || rule.value > 0);
        const responsibilityPercent = Number(personalResponsibilityPercent);
        if (isSharedLoan) {
          if (activePeople.length < 2) { showError('Add at least one other person in Manage → Sharing before configuring a shared loan.'); return; }
          if (!Number.isFinite(responsibilityPercent) || responsibilityPercent < 0 || responsibilityPercent > 100) { showError('Your liability responsibility must be between 0% and 100%.'); return; }
          const contributionTotal = sharingContributions.reduce((sum, rule) => sum + rule.value, 0);
          if (contributionMode === 'PERCENT' && Math.abs(contributionTotal - 100) > 0.01) { showError('EMI contribution percentages must add up to 100%.'); return; }
          if (contributionMode === 'FIXED' && Math.abs(contributionTotal - Math.abs(Number(monthlyEMI) || 0)) > 0.01) { showError('Fixed EMI contributions must add up to the full loan payment.'); return; }
          if (!sharingContributions.some(rule => people.find(person => person.id === rule.personId)?.isSelf)) { showError('Set your own EMI contribution before saving the shared loan.'); return; }
        }
        const loanSharing = { isShared: isSharedLoan, personalResponsibilityPercent: isSharedLoan ? responsibilityPercent : 100, contributions: isSharedLoan ? sharingContributions : [] };
        const loanData = {
          name,
          type: 'liability' as const,
          balance: numBalance || numP,
          group: liabilityType,
          originalPrincipal: numP,
          initialBalance: numP,
          openingBalance: numP,
          interestRate: Math.abs(Number(interestRate) || 0),
          monthlyEMI: Math.abs(Number(monthlyEMI) || 0),
          interestCalculationType: finalInterestCalcType,
          paymentFrequency: paymentFrequency,
          tenureMonths: Math.abs(Number(tenureMonths) || 0),
          loanStartDate: loanStartDate || nextEMIDate,
          nextEMIDate: nextEMIDate || loanStartDate,
          lateFeeFixedAmount: Math.abs(Number(lateFeeFixedAmount) || 0),
          lateFeeInterestRate: Math.abs(Number(lateFeeInterestRate) || 0),
          gracePeriodDays: Math.abs(Number(gracePeriodDays) || 0),
        };

        if (editingCreditCard) {
          try {
            deleteAccount(editingCreditCard.id);
          } catch (err: unknown) {
            showError(getErrorMessage(err, 'Failed to update account type'));
            return;
          }
          addAccount(loanData, { loanSharing });
        } else if (editingAccount) {
          try {
            updateAccount(editingAccount.id, loanData, { loanSharing });
          } catch (err: unknown) {
            showError(getErrorMessage(err, 'Failed to update account'));
            return;
          }
        } else {
          addAccount(loanData, { loanSharing });
        }
      } else {
        const otherData = {
          name,
          type: 'liability' as const,
          balance: numBalance,
          group: liabilityType
        };

        if (editingCreditCard) {
          try {
            deleteAccount(editingCreditCard.id);
          } catch (err: unknown) {
            showError(getErrorMessage(err, 'Failed to update account type'));
            return;
          }
          addAccount(otherData);
        } else if (editingAccount) {
          try {
            updateAccount(editingAccount.id, otherData);
          } catch (err: unknown) {
            showError(getErrorMessage(err, 'Failed to update account'));
            return;
          }
        } else {
          addAccount(otherData);
        }
      }
    }
    
    handleClose();
  };

  const isEditing = Boolean(editingAccount || editingCreditCard);

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-background/80 backdrop-blur-sm p-3 sm:px-4 overflow-y-auto">
      <div className="bg-surface-container rounded-3xl w-full max-w-md p-4 sm:p-6 border border-outline-variant/30 shadow-2xl animate-fade-in relative modal-scroll my-auto">
        <button 
          type="button"
          aria-label="Close account form"
          onClick={handleClose}
          className="absolute right-4 top-4 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-on-surface">
            {isEditing 
              ? (addAccountModalType === 'asset' ? 'Edit Asset' : 'Edit Liability')
              : (addAccountModalType === 'asset' ? 'Add Asset' : 'Add Liability')
            }
          </h2>
          {isEditing && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-surface-container-high text-on-surface-variant">
                {addAccountModalType}
              </span>
              <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-primary/10 text-primary">
                {addAccountModalType === 'asset' ? group : liabilityType}
              </span>
            </div>
          )}
        </div>
        
        {error && (
          <div className="bg-rose-500/10 text-rose-400 p-4 rounded-xl mb-4 border border-rose-500/20 text-sm">
            {error.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              {addAccountModalType === 'asset' ? 'Asset Name' : 'Liability Name'}
            </label>
            <input 
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
              placeholder={addAccountModalType === 'asset' ? 'e.g. Primary Checking' : 'e.g. Car Loan'}
            />
          </div>

          {!isEditing && (addAccountModalType === 'asset' ? (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Asset Type</label>
              <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/30 flex-wrap sm:flex-nowrap">
                {['Bank Account', 'Cash', 'Investment', 'Physical Asset'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setGroup(type)}
                    className={`flex-1 text-xs font-semibold py-2 px-1 rounded-lg transition-colors min-w-fit ${
                      group === type 
                        ? 'bg-surface-container-high text-on-surface shadow-sm' 
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Liability Type</label>
              <select
                aria-label="Liability Type"
                value={liabilityType}
                onChange={(e) => {
                  const val = e.target.value;
                  setLiabilityType(val);
                  if (val === 'Interest-Only Loan') {
                    setInterestCalculationType('INTEREST_ONLY');
                  }
                  setIsEmiManualOverride(false);
                }}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all appearance-none"
              >
                <option value="Bank Loan">Bank Loan</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Loan">Personal Loan</option>
                <option value="Interest-Only Loan">Interest-Only Loan</option>
                <option value="Mortgage">Mortgage</option>
                <option value="Other">Other</option>
              </select>
            </div>
          ))}

          {addAccountModalType === 'liability' && liabilityType === 'Credit Card' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Credit Limit</label>
              <CurrencyInput
                required
                value={limit}
                onValueChange={setLimit}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                placeholder="e.g. 5000"
              />
            </div>
          )}

          {addAccountModalType === 'asset' && group === 'Investment' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Investment Method</label>
                <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/30">
                  {['SIP', 'Lump Sum'].map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setInvestmentMethod(method as 'SIP' | 'Lump Sum')}
                      className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
                        investmentMethod === method 
                          ? 'bg-surface-container-high text-on-surface shadow-sm' 
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Total Invested Amount</label>
                  <CurrencyInput
                    aria-label="Total Invested Amount"
                    required
                    value={investedAmount}
                    onValueChange={setInvestedAmount}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Current Market Value</label>
                  <CurrencyInput
                    aria-label="Current Market Value"
                    required
                    value={balance}
                    onValueChange={setBalance}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {investmentMethod === 'SIP' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Monthly SIP Amount</label>
                    <CurrencyInput
                      aria-label="Monthly SIP Amount"
                      required
                      value={monthlySIPAmount}
                      onValueChange={setMonthlySIPAmount}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Next SIP Date</label>
                    <input 
                      aria-label="Next SIP Date"
                      type="date"
                      required
                      value={nextSIPDate}
                      onChange={(e) => setNextSIPDate(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    />
                  </div>
                </div>
              )}
              {investmentMethod === 'SIP' && (
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">SIP Funding Account</label>
                  <select
                    aria-label="SIP Funding Account"
                    required
                    value={sipSourceAccountId}
                    onChange={event => setSipSourceAccountId(event.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  >
                    <option value="">Select funding account</option>
                    {accounts.filter(account => account.type === 'asset' && account.is_archived !== 1 && !['Investment', 'Physical Asset'].includes(String(account.group ?? ''))).map(account => (
                      <option key={account.id} value={account.id}>{account.name} ({account.group ?? 'Asset'})</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-on-surface-variant">Saving this investment creates a monthly recurring transfer. The transfer stays pending until you confirm it on the due date.</p>
                </div>
              )}
            </div>
          )}

          {addAccountModalType === 'asset' && group !== 'Investment' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                {isEditing ? 'Initial / Starting Balance' : (group === 'Physical Asset' ? 'Estimated Current Value' : 'Current Balance')}
              </label>
              <CurrencyInput
                required
                value={balance}
                onValueChange={setBalance}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                placeholder="0.00"
              />
            </div>
          )}

          {addAccountModalType === 'liability' && (
            <div className="grid grid-cols-2 gap-4">
              {!(liabilityType === 'Bank Loan' || liabilityType === 'Loan' || liabilityType === 'Mortgage' || liabilityType === 'Interest-Only Loan') && (
                <div className={liabilityType === 'Credit Card' ? '' : 'col-span-2'}>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                    {isEditing ? 'Initial / Starting Balance' : 'Current Balance'}
                  </label>
                  <CurrencyInput
                    required
                    value={balance}
                    onValueChange={setBalance}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="0.00"
                  />
                </div>
              )}
              {liabilityType === 'Credit Card' && (
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Due Amount</label>
                  <CurrencyInput
                    value={dueAmount}
                    onValueChange={setDueAmount}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>
          )}

          {addAccountModalType === 'liability' && liabilityType === 'Credit Card' && !isEditing && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Next Due Date</label>
                <input 
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Billing Cycle Day</label>
                <input 
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={billingCycleDay}
                  onChange={(e) => setBillingCycleDay(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  placeholder="e.g. 15"
                />
              </div>
            </div>
          )}

          {addAccountModalType === 'liability' && (liabilityType === 'Bank Loan' || liabilityType === 'Loan' || liabilityType === 'Mortgage' || liabilityType === 'Interest-Only Loan') && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                    Initial Loan Amount (Principal)
                  </label>
                  <CurrencyInput
                    required
                    value={originalPrincipal}
                    onValueChange={(value) => {
                      setOriginalPrincipal(value);
                      if (!isEditing || !balance) {
                        setBalance(value);
                      }
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="e.g. 500000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Interest Rate (%)</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="e.g. 8.5"
                  />
                </div>
              </div>

              {liabilityType === 'Interest-Only Loan' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Payment Frequency</label>
                    <select
                      value={paymentFrequency}
                      onChange={(e) => setPaymentFrequency(e.target.value as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY')}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all appearance-none"
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="QUARTERLY">Quarterly</option>
                      <option value="ANNUALLY">Annually</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-2 relative group cursor-pointer">
                      <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                        Tenure (Months to Maturity)
                      </label>
                      <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                      <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 absolute bottom-full right-0 mb-1.5 w-64 p-2.5 bg-surface-container-highest text-[11px] text-on-surface rounded-xl shadow-xl border border-outline-variant/40 pointer-events-none z-30 font-normal normal-case leading-snug">
                        This determines the maturity date when your full principal (Bullet Payment) becomes due.
                      </div>
                    </div>
                    <input 
                      type="number"
                      step="1"
                      min="1"
                      required
                      value={tenureMonths}
                      onChange={(e) => setTenureMonths(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                      placeholder="e.g. 24"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Interest Type</label>
                      <select
                        value={interestCalculationType}
                        onChange={(e) => setInterestCalculationType(e.target.value as 'REDUCING' | 'FLAT' | 'INTEREST_ONLY')}
                        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all appearance-none"
                      >
                        <option value="REDUCING">Reducing Balance</option>
                        <option value="FLAT">Flat Rate</option>
                        <option value="INTEREST_ONLY">Interest-Only (Bullet Repayment)</option>
                      </select>
                    </div>
                    {interestCalculationType === 'INTEREST_ONLY' ? (
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Payment Frequency</label>
                        <select
                          value={paymentFrequency}
                          onChange={(e) => setPaymentFrequency(e.target.value as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY')}
                          className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all appearance-none"
                        >
                          <option value="MONTHLY">Monthly</option>
                          <option value="QUARTERLY">Quarterly</option>
                          <option value="ANNUALLY">Annually</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Tenure (Months)</label>
                        <input 
                          type="number"
                          step="1"
                          min="1"
                          required
                          value={tenureMonths}
                          onChange={(e) => setTenureMonths(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                          placeholder="e.g. 24"
                        />
                      </div>
                    )}
                  </div>

                  {interestCalculationType === 'INTEREST_ONLY' && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2 relative group cursor-pointer">
                        <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                          Tenure (Months to Maturity)
                        </label>
                        <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                        <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 absolute bottom-full left-0 mb-1.5 w-64 p-2.5 bg-surface-container-highest text-[11px] text-on-surface rounded-xl shadow-xl border border-outline-variant/40 pointer-events-none z-30 font-normal normal-case leading-snug">
                          This determines the maturity date when your full principal (Bullet Payment) becomes due.
                        </div>
                      </div>
                      <input 
                        type="number"
                        step="1"
                        min="1"
                        required
                        value={tenureMonths}
                        onChange={(e) => setTenureMonths(e.target.value)}
                        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                        placeholder="e.g. 24"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                    {liabilityType === 'Interest-Only Loan' || interestCalculationType === 'INTEREST_ONLY'
                      ? 'First Payment Date'
                      : 'First EMI / Due Date'}
                  </label>
                  <input 
                    type="date"
                    required
                    value={nextEMIDate}
                    onChange={(e) => {
                      setNextEMIDate(e.target.value);
                      setLoanStartDate(e.target.value);
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                      {interestCalculationType === 'INTEREST_ONLY' ? 'Periodic Interest Payment' : 'Monthly EMI Amount'}
                    </label>
                    {isEmiManualOverride && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEmiManualOverride(false);
                          const p = parseFloat(originalPrincipal) || parseFloat(balance) || 0;
                          const rate = parseFloat(interestRate) || 0;
                          const tenure = parseInt(tenureMonths) || 0;
                          const calculated = calculateEmiAmount(p, rate, tenure || 1, interestCalculationType, paymentFrequency);
                          if (calculated > 0) setMonthlyEMI(calculated.toString());
                        }}
                        className="text-[10px] font-semibold text-primary hover:underline"
                      >
                        Recalculate
                      </button>
                    )}
                  </div>
                  <CurrencyInput
                    required
                    value={monthlyEMI}
                    onValueChange={(value) => {
                      setMonthlyEMI(value);
                      setIsEmiManualOverride(true);
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="0.00"
                  />
                  {interestCalculationType === 'INTEREST_ONLY' && (
                    <p className="text-[11px] text-primary mt-1.5 flex items-center gap-1 font-medium">
                      <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                      {paymentFrequency === 'QUARTERLY' && 'Quarterly: balance × (rate / 400)'}
                      {paymentFrequency === 'ANNUALLY' && 'Annually: balance × (rate / 100)'}
                      {paymentFrequency === 'MONTHLY' && 'Monthly: balance × (rate / 1200)'}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 space-y-3">
                <label className="flex items-start justify-between gap-4 cursor-pointer">
                  <span><span className="block text-sm font-bold text-on-surface">Shared / family loan</span><span className="mt-1 block text-xs text-on-surface-variant">Keep one real loan and split responsibility between family contributors.</span></span>
                  <input type="checkbox" checked={isSharedLoan} onChange={event => setIsSharedLoan(event.target.checked)} className="mt-1 h-5 w-5 accent-primary" />
                </label>
                {isSharedLoan && <div className="space-y-4 border-t border-outline-variant/20 pt-4">
                  <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Your liability responsibility (%)</span><input type="number" min="0" max="100" step="0.01" value={personalResponsibilityPercent} onChange={event => setPersonalResponsibilityPercent(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2.5 font-numeric text-on-surface" /><span className="mt-1 block text-[11px] text-on-surface-variant">Used for your personal net-worth exposure. It can differ from who pays the EMI this month.</span></label>
                  <div><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">EMI contribution</span><div className="flex rounded-lg border border-outline-variant/30 p-0.5">{(['PERCENT','FIXED'] as const).map(mode => <button key={mode} type="button" onClick={() => { setContributionMode(mode); setContributionValues({}); }} className={`rounded-md px-2 py-1 text-[10px] font-bold ${contributionMode === mode ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>{mode === 'PERCENT' ? '%' : getCurrencySymbol()}</button>)}</div></div>
                    <div className="space-y-2">{people.filter(person => !person.isArchived).map(person => <label key={person.id} className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-xl bg-surface-container p-3"><span className="text-sm font-semibold text-on-surface">{person.name}{person.isSelf ? ' (you)' : ''}</span><input type="number" min="0" step="0.01" value={contributionValues[person.id] || ''} onChange={event => setContributionValues(current => ({ ...current, [person.id]: event.target.value }))} placeholder={contributionMode === 'PERCENT' ? '0 %' : '0'} className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-2 py-2 text-right font-numeric text-on-surface" /></label>)}</div>
                  </div>
                </div>}
              </div>

              {/* Financial Advocate Mode: Penalty Terms Section */}
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3 mt-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                      Penalty Terms (Ask your lender these before signing)
                    </h4>
                    <p className="text-[11px] text-on-surface-variant mt-1 leading-snug">
                      Different banks have hidden charges. We use this to warn you before they can charge you.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Fixed Late Fee ({getCurrencySymbol()})
                    </label>
                    <CurrencyInput
                      value={lateFeeFixedAmount}
                      onValueChange={setLateFeeFixedAmount}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-xs text-on-surface font-numeric focus:outline-none focus:border-amber-500/50"
                      placeholder="e.g. 500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Overdue Rate (%)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      value={lateFeeInterestRate}
                      onChange={(e) => setLateFeeInterestRate(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-xs text-on-surface font-numeric focus:outline-none focus:border-amber-500/50"
                      placeholder="e.g. 2.0"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Grace Period (Days)
                    </label>
                    <input 
                      type="number"
                      step="1"
                      min="0"
                      value={gracePeriodDays}
                      onChange={(e) => setGracePeriodDays(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-xs text-on-surface font-numeric focus:outline-none focus:border-amber-500/50"
                      placeholder="e.g. 3"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <button 
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-on-primary font-bold py-3.5 rounded-xl transition-colors mt-2"
          >
            {isEditing ? 'Save Changes' : (addAccountModalType === 'asset' ? 'Add Asset' : 'Add Liability')}
          </button>
        </form>
      </div>
    </div>
  );
}
