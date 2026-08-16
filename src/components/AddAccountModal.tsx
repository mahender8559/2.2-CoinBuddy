import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Banknote, BarChart3, Box, CreditCard, Landmark, WalletCards } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { calculateEmiAmount } from '../utils/emi';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';
import { findInvestmentSipRule } from '../domain/investmentSip';
import {
  FinanceField,
  FinanceFormHeader,
  FinanceSection,
  FinanceSelect,
  FinanceSubmitButton,
  FinanceToggle,
  financeFieldClass,
} from './ui/FinanceForm';

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

type FormMode = 'account' | 'investment' | 'liability';

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

  const [lateFeeFixedAmount, setLateFeeFixedAmount] = useState('');
  const [lateFeeInterestRate, setLateFeeInterestRate] = useState('');
  const [gracePeriodDays, setGracePeriodDays] = useState('0');
  const [isSharedLoan, setIsSharedLoan] = useState(false);
  const [personalResponsibilityPercent, setPersonalResponsibilityPercent] = useState('100');
  const [contributionMode, setContributionMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [contributionValues, setContributionValues] = useState<Record<string, string>>({});

  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const showError = (message: string) => setError({ message, id: Date.now() });

  const activePeople = useMemo(() => people.filter(person => !person.isArchived), [people]);
  const assetAccounts = useMemo(() => accounts.filter(account => account.type === 'asset' && !account.is_archived), [accounts]);
  const isEditing = Boolean(editingAccount || editingCreditCard);
  const mode: FormMode = addAccountModalType === 'liability'
    ? 'liability'
    : group === 'Investment'
      ? 'investment'
      : 'account';
  const isLoan = mode === 'liability' && liabilityType !== 'Credit Card';

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (editingCreditCard) {
      setName(editingCreditCard.name || '');
      const openingTx = transactions.find(transaction =>
        (transaction.isOpeningBalance || transaction.transaction_type === 'OPENING_BALANCE') &&
        (transaction.account === editingCreditCard.id || transaction.toAccountId === editingCreditCard.id || transaction.fromAccountId === editingCreditCard.id)
      );
      setBalance(openingTx ? Math.abs(openingTx.amount).toString() : '0');
      setLiabilityType('Credit Card');
      setDueAmount(String(editingCreditCard.dueAmount ?? ''));
      setDueDate(editingCreditCard.dueDate || '');
      setBillingCycleDay(String(editingCreditCard.billingCycleDay || 1));
      setLimit(String(editingCreditCard.limit ?? ''));
      return;
    }

    if (editingAccount) {
      setName(editingAccount.name || '');
      const openingTx = transactions.find(transaction =>
        (transaction.isOpeningBalance || transaction.transaction_type === 'OPENING_BALANCE') &&
        (transaction.account === editingAccount.id || transaction.toAccountId === editingAccount.id || transaction.fromAccountId === editingAccount.id)
      );
      setBalance(openingTx ? Math.abs(openingTx.amount).toString() : '0');
      if (editingAccount.type === 'asset') {
        setGroup(editingAccount.group || 'Bank Account');
        setInvestmentMethod(editingAccount.investmentMethod || 'SIP');
        setInvestedAmount(String(editingAccount.investedAmount ?? ''));
        setMonthlySIPAmount(String(editingAccount.monthlySIPAmount ?? ''));
        const sipRule = findInvestmentSipRule(editingAccount.id, recurringRules);
        setNextSIPDate(sipRule?.nextDueDate || editingAccount.nextSIPDate || '');
        setSipSourceAccountId(sipRule?.fromAccountId || '');
      } else {
        setLiabilityType(editingAccount.group === 'Interest-Only Loan' ? 'Interest-Only Loan' : editingAccount.group === 'Mortgage' ? 'Mortgage' : editingAccount.group === 'Loan' ? 'Loan' : 'Bank Loan');
        setOriginalPrincipal(String(editingAccount.originalPrincipal ?? editingAccount.balance ?? ''));
        setInterestRate(String(editingAccount.interestRate ?? ''));
        setMonthlyEMI(String(editingAccount.monthlyEMI ?? ''));
        setNextEMIDate(editingAccount.nextEMIDate || editingAccount.loanStartDate || '');
        setInterestCalculationType(editingAccount.interestCalculationType || 'REDUCING');
        setPaymentFrequency(editingAccount.paymentFrequency || 'MONTHLY');
        setTenureMonths(String(editingAccount.tenureMonths ?? ''));
        setLoanStartDate(editingAccount.loanStartDate || editingAccount.nextEMIDate || '');
        setLateFeeFixedAmount(String(editingAccount.lateFeeFixedAmount ?? ''));
        setLateFeeInterestRate(String(editingAccount.lateFeeInterestRate ?? ''));
        setGracePeriodDays(String(editingAccount.gracePeriodDays ?? 0));
        const sharing = loanSharingRules.find(rule => rule.accountId === editingAccount.id && rule.isShared);
        const contributions = loanContributionRules.filter(rule => rule.accountId === editingAccount.id && rule.isActive);
        setIsSharedLoan(Boolean(sharing));
        setPersonalResponsibilityPercent(String(sharing?.personalResponsibilityPercent ?? 100));
        setContributionMode(contributions[0]?.mode ?? 'PERCENT');
        setContributionValues(Object.fromEntries(contributions.map(rule => [rule.personId, String(rule.value)])));
        setIsEmiManualOverride(false);
      }
      return;
    }

    if (!addAccountModalType) return;
    setName('');
    setBalance('');
    setGroup('Bank Account');
    setInvestmentMethod('SIP');
    setInvestedAmount('');
    setMonthlySIPAmount('');
    setNextSIPDate('');
    setSipSourceAccountId('');
    setLiabilityType(addAccountModalType === 'liability' ? 'Credit Card' : 'Credit Card');
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
    setLateFeeFixedAmount('');
    setLateFeeInterestRate('');
    setGracePeriodDays('0');
    setIsSharedLoan(false);
    setPersonalResponsibilityPercent('100');
    setContributionMode('PERCENT');
    setContributionValues({});
    setIsEmiManualOverride(false);
  }, [addAccountModalType, editingAccount, editingCreditCard, loanContributionRules, loanSharingRules, recurringRules, transactions]);

  useEffect(() => {
    if (liabilityType === 'Interest-Only Loan') setInterestCalculationType('INTEREST_ONLY');
  }, [liabilityType]);

  useEffect(() => {
    if (!isLoan || isEmiManualOverride) return;
    const principal = Number(originalPrincipal) || Number(balance) || 0;
    const rate = Number(interestRate) || 0;
    const tenure = Number.parseInt(tenureMonths, 10) || 0;
    if (principal <= 0 || (tenure <= 0 && interestCalculationType !== 'INTEREST_ONLY')) return;
    const calculated = calculateEmiAmount(principal, rate, tenure || 1, interestCalculationType, paymentFrequency);
    if (calculated >= 0) setMonthlyEMI(calculated.toFixed(2));
  }, [balance, interestCalculationType, interestRate, isEmiManualOverride, isLoan, originalPrincipal, paymentFrequency, tenureMonths]);

  if (!addAccountModalType) return null;

  const handleClose = () => {
    setAddAccountModalType(null);
    setEditingAccount(null);
    setEditingCreditCard(null);
  };

  const chooseMode = (nextMode: FormMode) => {
    if (isEditing) return;
    setError(null);
    if (nextMode === 'liability') {
      setAddAccountModalType('liability');
      setLiabilityType('Credit Card');
      return;
    }
    setAddAccountModalType('asset');
    setGroup(nextMode === 'investment' ? 'Investment' : 'Bank Account');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return showError('Enter a name.');
    if (balance === '' || !Number.isFinite(Number(balance))) return showError('Enter a valid balance.');
    const numBalance = Math.abs(Number(balance) || 0);

    if (mode === 'account') {
      const accountData = { name: name.trim(), type: 'asset' as const, balance: numBalance, group };
      try {
        const result = editingAccount ? await updateAccount(editingAccount.id, accountData) : await addAccount(accountData);
        if (!result.success) return showError(result.error || 'Unable to save this account.');
      } catch (err: unknown) {
        return showError(getErrorMessage(err, 'Unable to save this account.'));
      }
      handleClose();
      return;
    }

    if (mode === 'investment') {
      if (investmentMethod === 'SIP' && (!monthlySIPAmount || Number(monthlySIPAmount) <= 0 || !nextSIPDate || !sipSourceAccountId)) {
        return showError('For an SIP, enter the monthly amount, next SIP date and funding account.');
      }
      const investmentData = {
        name: name.trim(),
        type: 'asset' as const,
        balance: numBalance,
        group: 'Investment',
        investmentMethod,
        investedAmount: Math.abs(Number(investedAmount) || 0),
        ...(investmentMethod === 'SIP' ? {
          monthlySIPAmount: Math.abs(Number(monthlySIPAmount) || 0),
          nextSIPDate,
        } : {}),
      };
      try {
        const result = editingAccount
          ? await updateAccount(editingAccount.id, investmentData, { sipSourceAccountId })
          : await addAccount(investmentData, { sipSourceAccountId });
        if (!result.success) return showError(result.error || 'Unable to save this investment.');
      } catch (err: unknown) {
        return showError(getErrorMessage(err, 'Unable to save this investment.'));
      }
      handleClose();
      return;
    }

    if (liabilityType === 'Credit Card') {
      if (!limit || Number(limit) <= 0) return showError('Enter the credit limit.');
      if (!dueDate) return showError('Choose the due date.');
      const cardData = {
        name: name.trim(),
        balance: numBalance,
        dueAmount: Math.abs(Number(dueAmount) || 0),
        dueDate,
        billingCycleDay: Math.min(31, Math.max(1, Number.parseInt(billingCycleDay, 10) || 1)),
        limit: Math.abs(Number(limit) || 0),
      };
      try {
        if (editingAccount && !editingCreditCard) return showError('Changing an existing account into a credit card is not supported. Delete it and add a credit card separately.');
        const result = editingCreditCard ? await updateCreditCard(editingCreditCard.id, cardData) : await addCreditCard(cardData);
        if (!result.success) return showError(result.error || 'Unable to save this credit card.');
      } catch (err: unknown) {
        return showError(getErrorMessage(err, 'Unable to save this credit card.'));
      }
      handleClose();
      return;
    }

    const principal = Math.abs(Number(originalPrincipal) || numBalance);
    if (principal <= 0) return showError('Enter the original loan amount.');
    const finalInterestCalculation = liabilityType === 'Interest-Only Loan' ? 'INTEREST_ONLY' as const : interestCalculationType;
    const sharingContributions = activePeople
      .map(person => ({ personId: person.id, mode: contributionMode, value: Math.max(0, Number(contributionValues[person.id] || 0)), isActive: isSharedLoan }))
      .filter(rule => !isSharedLoan || rule.value > 0);
    const responsibilityPercent = Number(personalResponsibilityPercent);

    if (isSharedLoan) {
      if (activePeople.length < 2) return showError('Add at least one other person in Manage → Sharing before configuring a shared loan.');
      if (!Number.isFinite(responsibilityPercent) || responsibilityPercent < 0 || responsibilityPercent > 100) return showError('Your liability responsibility must be between 0% and 100%.');
      const contributionTotal = sharingContributions.reduce((sum, rule) => sum + rule.value, 0);
      if (contributionMode === 'PERCENT' && Math.abs(contributionTotal - 100) > 0.01) return showError('EMI contribution percentages must add up to 100%.');
      if (contributionMode === 'FIXED' && Math.abs(contributionTotal - Math.abs(Number(monthlyEMI) || 0)) > 0.01) return showError('Fixed EMI contributions must add up to the full loan payment.');
      if (!sharingContributions.some(rule => people.find(person => person.id === rule.personId)?.isSelf)) return showError('Set your own EMI contribution before saving the shared loan.');
    }

    const loanData = {
      name: name.trim(),
      type: 'liability' as const,
      balance: numBalance || principal,
      group: liabilityType,
      originalPrincipal: principal,
      interestRate: Math.abs(Number(interestRate) || 0),
      monthlyEMI: Math.abs(Number(monthlyEMI) || 0),
      interestCalculationType: finalInterestCalculation,
      paymentFrequency,
      tenureMonths: Math.abs(Number(tenureMonths) || 0),
      loanStartDate: loanStartDate || nextEMIDate,
      nextEMIDate: nextEMIDate || loanStartDate,
      lateFeeFixedAmount: Math.abs(Number(lateFeeFixedAmount) || 0),
      lateFeeInterestRate: Math.abs(Number(lateFeeInterestRate) || 0),
      gracePeriodDays: Math.abs(Number(gracePeriodDays) || 0),
    };
    const loanSharing = {
      isShared: isSharedLoan,
      personalResponsibilityPercent: isSharedLoan ? responsibilityPercent : 100,
      contributions: isSharedLoan ? sharingContributions : [],
    };

    try {
      if (editingCreditCard) return showError('Changing an existing credit card into a loan is not supported. Delete it and add the loan separately.');
      const result = editingAccount
        ? await updateAccount(editingAccount.id, loanData, { loanSharing })
        : await addAccount(loanData, { loanSharing });
      if (!result.success) return showError(result.error || 'Unable to save this loan.');
    } catch (err: unknown) {
      return showError(getErrorMessage(err, 'Unable to save this loan.'));
    }
    handleClose();
  };

  const heading = mode === 'investment'
    ? (isEditing ? 'Edit Investment' : 'Add Investment')
    : mode === 'liability'
      ? liabilityType === 'Credit Card'
        ? (isEditing ? 'Edit Credit Card' : 'Add Credit Card')
        : (isEditing ? 'Edit Loan' : 'Add Loan / Liability')
      : (isEditing ? 'Edit Account' : 'Add Account');
  const subtitle = mode === 'investment'
    ? 'Track the value and optional SIP schedule'
    : mode === 'liability'
      ? 'Track only the debt details CoinBuddy uses'
      : 'Create a liquid or physical asset account';
  const submitTone = mode === 'liability' ? 'purple' : mode === 'investment' ? 'success' : 'primary';

  const basicAccountKinds = [
    { label: 'Bank', value: 'Bank Account', icon: Landmark },
    { label: 'Cash', value: 'Cash', icon: Banknote },
    { label: 'Wallet', value: 'Wallet', icon: WalletCards },
    { label: 'Other', value: 'Physical Asset', icon: Box },
  ];

  return (
    <V35ModalFrame size="lg" testId="account-form-sheet" labelledBy="account-form-title" panelClassName="p-0">
      <div id="account-form-title" className="sr-only">{heading}</div>
      <FinanceFormHeader title={heading} subtitle={subtitle} onClose={handleClose} closeLabel="Back from account form" />

      <div className="cb-finance-body min-h-0 flex-1">
        <form onSubmit={handleSubmit} className="cb-finance-form">
          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-[11px] font-medium text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error.message}</span>
            </div>
          ) : null}

          {!isEditing ? (
            <div className="cb-finance-segmented" aria-label="Account form type">
              <button type="button" aria-pressed={mode === 'account'} onClick={() => chooseMode('account')}>Account</button>
              <button type="button" aria-pressed={mode === 'investment'} onClick={() => chooseMode('investment')}>Investment</button>
              <button type="button" aria-pressed={mode === 'liability'} onClick={() => chooseMode('liability')}>Liability</button>
            </div>
          ) : null}

          {mode === 'account' ? (
            <div>
              <span className="cb-finance-label">Account type</span>
              <div className="cb-account-kinds">
                {basicAccountKinds.map(kind => {
                  const Icon = kind.icon;
                  return (
                    <button key={kind.value} type="button" className="cb-account-kind" aria-pressed={group === kind.value} onClick={() => setGroup(kind.value)}>
                      <Icon className="h-5 w-5" /><span>{kind.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mode === 'liability' && !isEditing ? (
            <div className="cb-finance-segmented" aria-label="Liability type">
              <button type="button" aria-pressed={liabilityType === 'Credit Card'} onClick={() => setLiabilityType('Credit Card')}><CreditCard className="mr-1 inline h-4 w-4" />Credit Card</button>
              <button type="button" aria-pressed={liabilityType !== 'Credit Card'} onClick={() => setLiabilityType('Bank Loan')}><Landmark className="mr-1 inline h-4 w-4" />Loan</button>
              <button type="button" aria-pressed={false} disabled className="opacity-0" tabIndex={-1}>Spacer</button>
            </div>
          ) : null}

          <FinanceField label={mode === 'investment' ? 'Investment account name' : mode === 'liability' ? 'Account / loan name' : 'Account name'} htmlFor="account-name">
            <input id="account-name" value={name} onChange={event => setName(event.target.value)} placeholder={mode === 'investment' ? 'e.g. Zerodha Mutual Fund' : mode === 'liability' ? 'e.g. HDFC Regalia or Car Loan' : 'e.g. HDFC Salary Account'} className={financeFieldClass} required />
          </FinanceField>

          <FinanceField label={mode === 'liability' ? 'Current / opening balance' : mode === 'investment' ? 'Current / opening value' : 'Opening balance'} htmlFor="opening-balance">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#8fa0b4]">{getCurrencySymbol()}</span>
              <CurrencyInput id="opening-balance" aria-label="Opening Balance" value={balance} onValueChange={setBalance} placeholder="0.00" className={`${financeFieldClass} pl-8 font-numeric`} required />
            </div>
          </FinanceField>

          {mode === 'investment' ? (
            <>
              <div>
                <span className="cb-finance-label">Investment method</span>
                <div className="cb-finance-segmented" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <button type="button" aria-pressed={investmentMethod === 'SIP'} onClick={() => setInvestmentMethod('SIP')}>SIP</button>
                  <button type="button" aria-pressed={investmentMethod === 'Lump Sum'} onClick={() => setInvestmentMethod('Lump Sum')}>Lump Sum</button>
                </div>
              </div>
              <FinanceField label="Total invested amount" htmlFor="invested-amount">
                <CurrencyInput id="invested-amount" aria-label="Total Invested Amount" value={investedAmount} onValueChange={setInvestedAmount} className={financeFieldClass} placeholder="0.00" />
              </FinanceField>
              {investmentMethod === 'SIP' ? (
                <div className="cb-finance-grid">
                  <FinanceField label="Monthly SIP amount" htmlFor="monthly-sip-amount">
                    <CurrencyInput id="monthly-sip-amount" aria-label="Monthly SIP Amount" value={monthlySIPAmount} onValueChange={setMonthlySIPAmount} className={financeFieldClass} placeholder="0.00" />
                  </FinanceField>
                  <FinanceField label="Next SIP date" htmlFor="next-sip-date">
                    <input id="next-sip-date" aria-label="Next SIP Date" type="date" value={nextSIPDate} onChange={event => setNextSIPDate(event.target.value)} className={financeFieldClass} />
                  </FinanceField>
                  <FinanceField label="Funding account" htmlFor="sip-funding-account" className="sm:col-span-2">
                    <FinanceSelect id="sip-funding-account" ariaLabel="Funding Account" value={sipSourceAccountId} onChange={setSipSourceAccountId}>
                      <option value="">Select funding account</option>
                      {assetAccounts.filter(account => account.id !== editingAccount?.id).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </FinanceSelect>
                  </FinanceField>
                </div>
              ) : null}
            </>
          ) : null}

          {mode === 'liability' && liabilityType === 'Credit Card' ? (
            <div className="cb-finance-grid">
              <FinanceField label="Credit limit" htmlFor="credit-limit">
                <CurrencyInput id="credit-limit" aria-label="Credit Limit" value={limit} onValueChange={setLimit} className={financeFieldClass} placeholder="0.00" />
              </FinanceField>
              <FinanceField label="Amount due" htmlFor="amount-due">
                <CurrencyInput id="amount-due" aria-label="Amount Due" value={dueAmount} onValueChange={setDueAmount} className={financeFieldClass} placeholder="0.00" />
              </FinanceField>
              <FinanceField label="Due date" htmlFor="credit-due-date">
                <input id="credit-due-date" aria-label="Due Date" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className={financeFieldClass} required />
              </FinanceField>
              <FinanceField label="Billing cycle day" htmlFor="billing-cycle-day">
                <input id="billing-cycle-day" aria-label="Billing Cycle Day" type="number" min="1" max="31" value={billingCycleDay} onChange={event => setBillingCycleDay(event.target.value)} className={financeFieldClass} />
              </FinanceField>
            </div>
          ) : null}

          {isLoan ? (
            <>
              <div className="cb-finance-grid">
                <FinanceField label="Loan type" htmlFor="loan-type">
                  <FinanceSelect id="loan-type" ariaLabel="Loan Type" value={liabilityType} onChange={value => { setLiabilityType(value); setIsEmiManualOverride(false); }}>
                    <option value="Bank Loan">Bank Loan</option>
                    <option value="Loan">Personal Loan</option>
                    <option value="Mortgage">Mortgage</option>
                    <option value="Interest-Only Loan">Interest-Only Loan</option>
                  </FinanceSelect>
                </FinanceField>
                <FinanceField label="Original principal" htmlFor="original-principal">
                  <CurrencyInput id="original-principal" aria-label="Original Principal" value={originalPrincipal} onValueChange={setOriginalPrincipal} className={financeFieldClass} placeholder="0.00" />
                </FinanceField>
                <FinanceField label="Interest rate (%)" htmlFor="interest-rate">
                  <input id="interest-rate" aria-label="Interest Rate" type="number" min="0" step="0.01" value={interestRate} onChange={event => setInterestRate(event.target.value)} className={financeFieldClass} />
                </FinanceField>
                <FinanceField label="Tenure (months)" htmlFor="tenure-months">
                  <input id="tenure-months" aria-label="Tenure Months" type="number" min="0" value={tenureMonths} onChange={event => setTenureMonths(event.target.value)} className={financeFieldClass} />
                </FinanceField>
                <FinanceField label="Interest calculation" htmlFor="interest-calculation">
                  <FinanceSelect id="interest-calculation" ariaLabel="Interest Calculation" value={interestCalculationType} onChange={value => { setInterestCalculationType(value as typeof interestCalculationType); setIsEmiManualOverride(false); }} disabled={liabilityType === 'Interest-Only Loan'}>
                    <option value="REDUCING">Reducing Balance</option>
                    <option value="FLAT">Flat Rate</option>
                    <option value="INTEREST_ONLY">Interest Only</option>
                  </FinanceSelect>
                </FinanceField>
                <FinanceField label="Payment frequency" htmlFor="payment-frequency">
                  <FinanceSelect id="payment-frequency" ariaLabel="Payment Frequency" value={paymentFrequency} onChange={value => { setPaymentFrequency(value as typeof paymentFrequency); setIsEmiManualOverride(false); }}>
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUALLY">Annually</option>
                  </FinanceSelect>
                </FinanceField>
                <FinanceField label="EMI / payment" htmlFor="loan-emi" hint="Calculated automatically; edit only when your lender uses a different amount.">
                  <CurrencyInput id="loan-emi" aria-label="EMI Payment" value={monthlyEMI} onValueChange={value => { setMonthlyEMI(value); setIsEmiManualOverride(true); }} className={financeFieldClass} />
                </FinanceField>
                <div />
                <FinanceField label="Loan start date" htmlFor="loan-start-date">
                  <input id="loan-start-date" aria-label="Loan Start Date" type="date" value={loanStartDate} onChange={event => setLoanStartDate(event.target.value)} className={financeFieldClass} />
                </FinanceField>
                <FinanceField label="Next payment date" htmlFor="next-emi-date">
                  <input id="next-emi-date" aria-label="Next EMI Date" type="date" value={nextEMIDate} onChange={event => setNextEMIDate(event.target.value)} className={financeFieldClass} />
                </FinanceField>
              </div>

              <FinanceSection title="More loan options">
                <div className="cb-finance-grid">
                  <FinanceField label="Late fee" htmlFor="late-fee-fixed">
                    <CurrencyInput id="late-fee-fixed" aria-label="Late Fee" value={lateFeeFixedAmount} onValueChange={setLateFeeFixedAmount} className={financeFieldClass} />
                  </FinanceField>
                  <FinanceField label="Late interest (%)" htmlFor="late-fee-rate">
                    <input id="late-fee-rate" aria-label="Late Interest Rate" type="number" min="0" step="0.01" value={lateFeeInterestRate} onChange={event => setLateFeeInterestRate(event.target.value)} className={financeFieldClass} />
                  </FinanceField>
                  <FinanceField label="Grace period (days)" htmlFor="grace-days">
                    <input id="grace-days" aria-label="Grace Period Days" type="number" min="0" value={gracePeriodDays} onChange={event => setGracePeriodDays(event.target.value)} className={financeFieldClass} />
                  </FinanceField>
                </div>

                <FinanceToggle label="Shared loan" description="Split responsibility and payment contributions with people in Sharing." checked={isSharedLoan} onChange={setIsSharedLoan} ariaLabel="Toggle shared loan" />

                {isSharedLoan ? (
                  <>
                    <FinanceField label="Your liability responsibility (%)" htmlFor="responsibility-percent">
                      <input id="responsibility-percent" aria-label="Your Liability Responsibility" type="number" min="0" max="100" value={personalResponsibilityPercent} onChange={event => setPersonalResponsibilityPercent(event.target.value)} className={financeFieldClass} />
                    </FinanceField>
                    <FinanceField label="Contribution mode" htmlFor="contribution-mode">
                      <FinanceSelect id="contribution-mode" ariaLabel="Contribution Mode" value={contributionMode} onChange={value => setContributionMode(value as typeof contributionMode)}>
                        <option value="PERCENT">Percentage</option>
                        <option value="FIXED">Fixed amount</option>
                      </FinanceSelect>
                    </FinanceField>
                    {activePeople.map(person => (
                      <FinanceField key={person.id} label={`${person.name}${person.isSelf ? ' (You)' : ''}`} htmlFor={`contribution-${person.id}`}>
                        <input id={`contribution-${person.id}`} aria-label={`${person.name} contribution`} type="number" min="0" step="0.01" value={contributionValues[person.id] || ''} onChange={event => setContributionValues(values => ({ ...values, [person.id]: event.target.value }))} className={financeFieldClass} />
                      </FinanceField>
                    ))}
                  </>
                ) : null}
              </FinanceSection>
            </>
          ) : null}

          <FinanceSubmitButton tone={submitTone}>
            {isEditing ? 'Save Changes' : mode === 'investment' ? 'Add Investment' : mode === 'liability' ? liabilityType === 'Credit Card' ? 'Add Credit Card' : 'Add Loan / Liability' : 'Create Account'}
          </FinanceSubmitButton>
        </form>
      </div>
    </V35ModalFrame>
  );
}
