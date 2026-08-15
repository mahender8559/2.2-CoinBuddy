import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowLeft, Banknote, BarChart3, Box, ChevronDown, CircleDollarSign, CreditCard, Landmark, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { calculateEmiAmount } from '../utils/emi';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';
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
    getCurrencySymbol,
  } = useAppContext();

  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');

  const [group, setGroup] = useState('Bank Account');
  const [investmentMethod, setInvestmentMethod] = useState<'SIP' | 'Lump Sum'>('SIP');
  const [investedAmount, setInvestedAmount] = useState('');
  const [monthlySIPAmount, setMonthlySIPAmount] = useState('');
  const [nextSIPDate, setNextSIPDate] = useState('');
  const [sipSourceAccountId, setSipSourceAccountId] = useState('');

  const [liabilityType, setLiabilityType] = useState('Credit Card');
  const [dueAmount, setDueAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [billingCycleDay, setBillingCycleDay] = useState('1');
  const [limit, setLimit] = useState('');

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

  const [monthlyInterestRate, setMonthlyInterestRate] = useState('');
  const [nextInterestDueDate, setNextInterestDueDate] = useState('');

  const [lateFeeFixedAmount, setLateFeeFixedAmount] = useState('');
  const [lateFeeInterestRate, setLateFeeInterestRate] = useState('');
  const [gracePeriodDays, setGracePeriodDays] = useState('0');

  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const showError = (message: string) => setError({ message, id: Date.now() });

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

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
        setInterestRate(editingAccount.interestRate !== undefined ? editingAccount.interestRate.toString() : '');
        setMonthlyEMI(editingAccount.monthlyEMI !== undefined ? editingAccount.monthlyEMI.toString() : '');
        setNextEMIDate(editingAccount.nextEMIDate || editingAccount.loanStartDate || '');
        setInterestCalculationType(editingAccount.interestCalculationType || 'REDUCING');
        setPaymentFrequency(editingAccount.paymentFrequency || 'MONTHLY');
        setTenureMonths(editingAccount.tenureMonths !== undefined ? editingAccount.tenureMonths.toString() : '');
        setLoanStartDate(editingAccount.loanStartDate || editingAccount.nextEMIDate || '');
        setMonthlyInterestRate(editingAccount.monthlyInterestRate !== undefined ? editingAccount.monthlyInterestRate.toString() : '');
        setNextInterestDueDate(editingAccount.nextInterestDueDate || '');
        setLateFeeFixedAmount(editingAccount.lateFeeFixedAmount !== undefined ? editingAccount.lateFeeFixedAmount.toString() : '');
        setLateFeeInterestRate(editingAccount.lateFeeInterestRate !== undefined ? editingAccount.lateFeeInterestRate.toString() : '');
        setGracePeriodDays(editingAccount.gracePeriodDays !== undefined ? editingAccount.gracePeriodDays.toString() : '0');
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
  }, [addAccountModalType, editingAccount, editingCreditCard, recurringRules, loanSharingRules, loanContributionRules, transactions]);

  useEffect(() => {
    if (liabilityType === 'Interest-Only Loan') setInterestCalculationType('INTEREST_ONLY');
  }, [liabilityType]);

  useEffect(() => {
    const isLoanType = liabilityType === 'Bank Loan' || liabilityType === 'Loan' || liabilityType === 'Mortgage' || liabilityType === 'Interest-Only Loan';
    if (addAccountModalType === 'liability' && isLoanType && !isEmiManualOverride) {
      const principal = parseFloat(originalPrincipal) || parseFloat(balance) || 0;
      const rate = parseFloat(interestRate) || 0;
      const tenure = parseInt(tenureMonths) || 0;
      if (principal > 0 && (tenure > 0 || interestCalculationType === 'INTEREST_ONLY')) {
        const calculated = calculateEmiAmount(principal, rate, tenure || 1, interestCalculationType, paymentFrequency);
        if (calculated >= 0) setMonthlyEMI(calculated.toString());
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
            nextSIPDate,
          } : {}),
        } : {}),
      };

      if (editingAccount) {
        try { updateAccount(editingAccount.id, assetData, { sipSourceAccountId }); }
        catch (err: unknown) { showError(getErrorMessage(err, 'Failed to update account')); return; }
      } else {
        try { addAccount(assetData, { sipSourceAccountId }); }
        catch (err: unknown) { showError(getErrorMessage(err, 'Failed to add account')); return; }
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
          limit: Math.abs(Number(limit) || 0),
        };

        if (editingCreditCard) {
          try { updateCreditCard(editingCreditCard.id, cardData); }
          catch (err: unknown) { showError(getErrorMessage(err, 'Failed to update credit card')); return; }
        } else {
          if (editingAccount) {
            try { deleteAccount(editingAccount.id); }
            catch (err: unknown) { showError(getErrorMessage(err, 'Failed to update account type')); return; }
          }
          try { addCreditCard(cardData); }
          catch (err: unknown) { showError(getErrorMessage(err, 'Failed to add credit card')); return; }
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

        const loanSharing = {
          isShared: isSharedLoan,
          personalResponsibilityPercent: isSharedLoan ? responsibilityPercent : 100,
          contributions: isSharedLoan ? sharingContributions : [],
        };
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
          paymentFrequency,
          tenureMonths: Math.abs(Number(tenureMonths) || 0),
          loanStartDate: loanStartDate || nextEMIDate,
          nextEMIDate: nextEMIDate || loanStartDate,
          lateFeeFixedAmount: Math.abs(Number(lateFeeFixedAmount) || 0),
          lateFeeInterestRate: Math.abs(Number(lateFeeInterestRate) || 0),
          gracePeriodDays: Math.abs(Number(gracePeriodDays) || 0),
        };

        if (editingCreditCard) {
          try { deleteAccount(editingCreditCard.id); }
          catch (err: unknown) { showError(getErrorMessage(err, 'Failed to update account type')); return; }
          addAccount(loanData, { loanSharing });
        } else if (editingAccount) {
          try { updateAccount(editingAccount.id, loanData, { loanSharing }); }
          catch (err: unknown) { showError(getErrorMessage(err, 'Failed to update account')); return; }
        } else {
          addAccount(loanData, { loanSharing });
        }
      } else {
        const otherData = { name, type: 'liability' as const, balance: numBalance, group: liabilityType };
        if (editingCreditCard) {
          try { deleteAccount(editingCreditCard.id); }
          catch (err: unknown) { showError(getErrorMessage(err, 'Failed to update account type')); return; }
          addAccount(otherData);
        } else if (editingAccount) {
          try { updateAccount(editingAccount.id, otherData); }
          catch (err: unknown) { showError(getErrorMessage(err, 'Failed to update account')); return; }
        } else {
          addAccount(otherData);
        }
      }
    }

    handleClose();
  };

  const isEditing = Boolean(editingAccount || editingCreditCard);
  const activePeople = people.filter(person => !person.isArchived);
  const assetAccounts = accounts.filter(account => account.type === 'asset' && !account.is_archived);
  const isLoanType = addAccountModalType === 'liability' && ['Bank Loan', 'Loan', 'Mortgage', 'Interest-Only Loan'].includes(liabilityType);
  const fieldClass = 'h-10 w-full rounded-lg border border-[#21334a] bg-[#111d2d] px-3 text-[12px] font-medium text-[#f5f7fb] outline-none transition focus:border-[#0d6efd] focus:ring-1 focus:ring-[#0d6efd]';
  const labelClass = 'mb-1.5 block text-[10.5px] font-medium text-[#cbd4e0]';

  const accountKinds = [
    { id: 'bank', label: 'Bank', icon: Landmark, active: addAccountModalType === 'asset' && group === 'Bank Account', select: () => { setAddAccountModalType('asset'); setGroup('Bank Account'); } },
    { id: 'cash', label: 'Cash', icon: Banknote, active: addAccountModalType === 'asset' && group === 'Cash', select: () => { setAddAccountModalType('asset'); setGroup('Cash'); } },
    { id: 'loan', label: 'Loan', icon: CircleDollarSign, active: addAccountModalType === 'liability' && liabilityType !== 'Credit Card' && liabilityType !== 'Other', select: () => { setAddAccountModalType('liability'); setLiabilityType('Bank Loan'); } },
    { id: 'investment', label: 'Investment', icon: BarChart3, active: addAccountModalType === 'asset' && group === 'Investment', select: () => { setAddAccountModalType('asset'); setGroup('Investment'); } },
    { id: 'credit-card', label: 'Credit Card', icon: CreditCard, active: addAccountModalType === 'liability' && liabilityType === 'Credit Card', select: () => { setAddAccountModalType('liability'); setLiabilityType('Credit Card'); } },
    { id: 'other', label: 'Other', icon: Box, active: (addAccountModalType === 'asset' && group === 'Physical Asset') || (addAccountModalType === 'liability' && liabilityType === 'Other'), select: () => { setAddAccountModalType('asset'); setGroup('Physical Asset'); } },
  ];

  return (
    <V35ModalFrame size="sm" testId="account-form-sheet" labelledBy="account-form-title">
      <div className="grid h-[54px] shrink-0 grid-cols-[40px_1fr_40px] items-center border-b border-[#21334a]/70 px-2.5">
        <button type="button" aria-label="Back from account form" onClick={handleClose} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]"><ArrowLeft className="h-4 w-4" /></button>
        <h2 id="account-form-title" className="text-center text-[14px] font-semibold text-white">{isEditing ? 'Edit Account' : 'Add Account'}</h2>
        <button type="button" aria-label="Close account form" onClick={handleClose} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]"><X className="h-4 w-4" /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        <form onSubmit={handleSubmit} className="space-y-3">
          {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-[11px] font-medium text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error.message}</span></div> : null}

          <div>
            <span className={labelClass}>Account Type</span>
            <div className="grid grid-cols-3 gap-1.5">
              {accountKinds.map(kind => {
                const Icon = kind.icon;
                return <button key={kind.id} type="button" onClick={kind.select} aria-pressed={kind.active} className={`flex h-[54px] flex-col items-center justify-center gap-1 rounded-lg border text-[9.5px] font-medium transition ${kind.active ? 'border-blue-500 bg-blue-500/12 text-blue-300 shadow-[inset_0_0_0_1px_rgba(59,130,246,.15)]' : kind.id === 'cash' ? 'border-emerald-500/20 bg-emerald-500/7 text-emerald-200' : kind.id === 'loan' || kind.id === 'credit-card' ? 'border-purple-500/20 bg-purple-500/7 text-purple-200' : 'border-[#21334a] bg-[#101c2c] text-[#a4b1c1]'}`}><Icon className="h-4 w-4" /><span>{kind.label}</span></button>;
              })}
            </div>
          </div>

          <div><label htmlFor="account-name" className={labelClass}>Account Name</label><input id="account-name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. HDFC Salary Account" className={fieldClass} required /></div>

          <div><label htmlFor="opening-balance" className={labelClass}>Opening Balance</label><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#9aa8ba]">{getCurrencySymbol()}</span><CurrencyInput id="opening-balance" value={balance} onValueChange={setBalance} placeholder="0.00" className={`${fieldClass} pl-8 font-numeric`} required /></div></div>

          <div><span className={labelClass}>Account Holder</span><div className="flex h-10 items-center justify-between rounded-lg border border-[#21334a] bg-[#111d2d] px-3 text-[12px] font-medium text-white"><span>Me</span><ChevronDown className="h-4 w-4 text-[#7f8fa4]" /></div></div>

          {group === 'Investment' && addAccountModalType === 'asset' ? (
            <details open className="group rounded-lg border border-[#1f3046] bg-[#0d1827]">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between px-3 text-[11px] font-medium text-[#a0afc1]">Investment details<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
              <div className="space-y-3 border-t border-[#1f3046] p-3">
                <div><span className={labelClass}>Investment Method</span><div className="grid grid-cols-2 gap-1 rounded-lg border border-[#21334a] bg-[#0c1726] p-1"><button type="button" onClick={() => setInvestmentMethod('SIP')} className={`h-8 rounded-md text-[10.5px] font-medium ${investmentMethod === 'SIP' ? 'bg-blue-600 text-white' : 'text-[#94a4b8]'}`}>SIP</button><button type="button" onClick={() => setInvestmentMethod('Lump Sum')} className={`h-8 rounded-md text-[10.5px] font-medium ${investmentMethod === 'Lump Sum' ? 'bg-blue-600 text-white' : 'text-[#94a4b8]'}`}>Lump Sum</button></div></div>
                <div><label className={labelClass}>Total Invested Amount</label><CurrencyInput value={investedAmount} onValueChange={setInvestedAmount} className={fieldClass} placeholder="0.00" /></div>
                {investmentMethod === 'SIP' ? <><div><label className={labelClass}>Monthly SIP Amount</label><CurrencyInput value={monthlySIPAmount} onValueChange={setMonthlySIPAmount} className={fieldClass} placeholder="0.00" /></div><div><label className={labelClass}>Next SIP Date</label><input type="date" value={nextSIPDate} onChange={event => setNextSIPDate(event.target.value)} className={fieldClass} /></div><div><label className={labelClass}>Funding Account</label><select value={sipSourceAccountId} onChange={event => setSipSourceAccountId(event.target.value)} className={fieldClass}><option value="">Select funding account</option>{assetAccounts.filter(account => account.id !== editingAccount?.id).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div></> : null}
              </div>
            </details>
          ) : null}

          {addAccountModalType === 'liability' && liabilityType === 'Credit Card' ? (
            <details open className="group rounded-lg border border-[#1f3046] bg-[#0d1827]">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between px-3 text-[11px] font-medium text-[#a0afc1]">Credit card details<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
              <div className="space-y-3 border-t border-[#1f3046] p-3">
                <div><label className={labelClass}>Credit Limit</label><CurrencyInput value={limit} onValueChange={setLimit} className={fieldClass} required /></div>
                <div><label className={labelClass}>Amount Due</label><CurrencyInput value={dueAmount} onValueChange={setDueAmount} className={fieldClass} /></div>
                <div className="grid grid-cols-2 gap-2"><div><label className={labelClass}>Due Date</label><input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className={fieldClass} required /></div><div><label className={labelClass}>Billing Day</label><input type="number" min="1" max="31" value={billingCycleDay} onChange={event => setBillingCycleDay(event.target.value)} className={fieldClass} /></div></div>
              </div>
            </details>
          ) : null}

          {isLoanType ? (
            <details className="group rounded-lg border border-[#1f3046] bg-[#0d1827]">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between px-3 text-[11px] font-medium text-[#a0afc1]">Loan details<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
              <div className="space-y-3 border-t border-[#1f3046] p-3">
                <div><label className={labelClass}>Loan Type</label><select value={liabilityType} onChange={event => { setLiabilityType(event.target.value); setIsEmiManualOverride(false); }} className={fieldClass}><option value="Bank Loan">Bank Loan</option><option value="Loan">Personal Loan</option><option value="Mortgage">Mortgage</option><option value="Interest-Only Loan">Interest-Only Loan</option><option value="Other">Other</option></select></div>
                <div><label className={labelClass}>Initial Loan Amount</label><CurrencyInput value={originalPrincipal} onValueChange={setOriginalPrincipal} className={fieldClass} /></div>
                <div className="grid grid-cols-2 gap-2"><div><label className={labelClass}>Interest Rate (%)</label><input type="number" step="0.01" value={interestRate} onChange={event => setInterestRate(event.target.value)} className={fieldClass} /></div><div><label className={labelClass}>Tenure (months)</label><input type="number" value={tenureMonths} onChange={event => setTenureMonths(event.target.value)} className={fieldClass} /></div></div>
                <div><label className={labelClass}>Interest Calculation</label><select value={interestCalculationType} onChange={event => { setInterestCalculationType(event.target.value as typeof interestCalculationType); setIsEmiManualOverride(false); }} disabled={liabilityType === 'Interest-Only Loan'} className={fieldClass}><option value="REDUCING">Reducing Balance</option><option value="FLAT">Flat Rate</option><option value="INTEREST_ONLY">Interest Only</option></select></div>
                <div><label className={labelClass}>Payment Frequency</label><select value={paymentFrequency} onChange={event => { setPaymentFrequency(event.target.value as typeof paymentFrequency); setIsEmiManualOverride(false); }} className={fieldClass}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option></select></div>
                <div><label className={labelClass}>EMI / Payment</label><CurrencyInput value={monthlyEMI} onValueChange={value => { setMonthlyEMI(value); setIsEmiManualOverride(true); }} className={fieldClass} /></div>
                <div className="grid grid-cols-2 gap-2"><div><label className={labelClass}>Loan Start Date</label><input type="date" value={loanStartDate} onChange={event => setLoanStartDate(event.target.value)} className={fieldClass} /></div><div><label className={labelClass}>Next EMI Date</label><input type="date" value={nextEMIDate} onChange={event => setNextEMIDate(event.target.value)} className={fieldClass} /></div></div>
                <div className="grid grid-cols-3 gap-2"><div><label className={labelClass}>Late Fee</label><CurrencyInput value={lateFeeFixedAmount} onValueChange={setLateFeeFixedAmount} className={fieldClass} /></div><div><label className={labelClass}>Late %</label><input type="number" step="0.01" value={lateFeeInterestRate} onChange={event => setLateFeeInterestRate(event.target.value)} className={fieldClass} /></div><div><label className={labelClass}>Grace Days</label><input type="number" value={gracePeriodDays} onChange={event => setGracePeriodDays(event.target.value)} className={fieldClass} /></div></div>

                <div className="rounded-lg border border-[#21334a] bg-[#101c2c] p-2.5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10.5px] font-medium text-white">Shared loan</p><p className="mt-0.5 text-[9.5px] text-[#75869b]">Split responsibility and EMI contributions</p></div><button type="button" aria-pressed={isSharedLoan} onClick={() => setIsSharedLoan(value => !value)} className={`relative h-6 w-11 rounded-full border ${isSharedLoan ? 'border-blue-500/50 bg-blue-600' : 'border-[#31445e] bg-[#162338]'}`}><span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all ${isSharedLoan ? 'left-[22px]' : 'left-1'}`} /></button></div>
                  {isSharedLoan ? <div className="mt-3 space-y-2 border-t border-[#21334a] pt-3"><div><label className={labelClass}>Your Liability Responsibility (%)</label><input type="number" min="0" max="100" value={personalResponsibilityPercent} onChange={event => setPersonalResponsibilityPercent(event.target.value)} className={fieldClass} /></div><div><label className={labelClass}>Contribution Mode</label><select value={contributionMode} onChange={event => setContributionMode(event.target.value as typeof contributionMode)} className={fieldClass}><option value="PERCENT">Percentage</option><option value="FIXED">Fixed Amount</option></select></div>{activePeople.map(person => <div key={person.id}><label className={labelClass}>{person.name}{person.isSelf ? ' (You)' : ''}</label><input type="number" min="0" step="0.01" value={contributionValues[person.id] || ''} onChange={event => setContributionValues(values => ({ ...values, [person.id]: event.target.value }))} className={fieldClass} /></div>)}</div> : null}
                </div>
              </div>
            </details>
          ) : null}

          <button type="submit" className="v35-focus-ring mt-1 flex h-10 w-full items-center justify-center rounded-lg border border-blue-400/20 bg-gradient-to-b from-[#1677ff] to-[#0d60ee] text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(13,96,238,.22)] hover:from-[#2582ff] hover:to-[#176bf5]">{isEditing ? 'Save Changes' : 'Add Account'}</button>
        </form>
      </div>
    </V35ModalFrame>
  );
}
