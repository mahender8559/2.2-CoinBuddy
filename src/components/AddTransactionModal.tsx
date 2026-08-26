import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  CreditCard,
  FileText,
  Landmark,
  NotebookPen,
  Repeat2,
  Save,
  SlidersHorizontal,
  Tag,
  Target,
  TrendingUp,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';
import type { Account, Transaction } from '../types';
import { V35ModalFrame } from './ui/V35ModalFrame';
import {
  AmountHero,
  FinanceField,
  FinanceFormHeader,
  FinanceSection,
  FinanceSelect,
  FinanceSubmitButton,
  FinanceToggle,
  financeFieldClass,
  financeLabelClass,
} from './ui/FinanceForm';

function getAccountIcon(account: Account) {
  const group = String(account.group ?? '').toLowerCase();
  if (group.includes('cash')) return Banknote;
  if (group.includes('wallet')) return WalletCards;
  if (group.includes('investment')) return TrendingUp;
  if (group.includes('credit card')) return CreditCard;
  if (account.type === 'liability' || group.includes('loan') || group.includes('mortgage')) return CircleDollarSign;
  if (group.includes('bank') || group.includes('saving') || group.includes('current') || group.includes('checking')) return Landmark;
  return Building2;
}

function isLoanAccount(account: Account | undefined) {
  if (!account || account.type !== 'liability') return false;
  const group = String(account.group ?? '').toLowerCase();
  return group.includes('loan') || group.includes('mortgage');
}

function AccountChoiceGroup({
  legend,
  name,
  accounts,
  value,
  onChange,
  ariaPrefix,
  formatCurrency,
  icon,
}: {
  legend: string;
  name: string;
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  ariaPrefix: string;
  formatCurrency: (amount: number | string) => string;
  icon: React.ReactNode;
}) {
  return (
    <fieldset className="cb-account-choice-fieldset">
      <legend className={financeLabelClass}>
        <span className="cb-finance-label-row">
          <span className="cb-finance-label-icon" aria-hidden="true">{icon}</span>
          <span>{legend}</span>
        </span>
      </legend>
      {accounts.length > 0 ? (
        <div className="cb-account-choice-grid">
          {accounts.map(account => {
            const Icon = getAccountIcon(account);
            const selected = account.id === value;
            return (
              <label key={account.id} className={`cb-account-choice ${selected ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name={name}
                  value={account.id}
                  checked={selected}
                  onChange={() => onChange(account.id)}
                  aria-label={`${ariaPrefix} ${account.name}`}
                  className="sr-only"
                />
                <span className="cb-account-choice-icon" aria-hidden="true"><Icon className="h-4 w-4" /></span>
                <span className="cb-account-choice-copy">
                  <span className="cb-account-choice-name">{account.name}</span>
                  <span className="cb-account-choice-meta">{account.group || (account.type === 'asset' ? 'Asset' : 'Liability')} · {formatCurrency(account.balance)}</span>
                </span>
                <span className="cb-account-choice-check" aria-hidden="true"><Check className="h-3.5 w-3.5" /></span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="cb-account-choice-empty">No eligible accounts available.</div>
      )}
    </fieldset>
  );
}

export function AddTransactionModal() {
  const {
    isAddModalOpen,
    setAddModalOpen,
    addTransaction,
    updateTransaction,
    editingTransaction,
    setEditingTransaction,
    getCurrencySymbol,
    formatCurrency,
    accounts,
    categories,
    events,
    recurringRules,
    savingsGoals,
    createEvent,
  } = useAppContext();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [account, setAccount] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'>('MONTHLY');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [groupId, setGroupId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [error, setError] = useState<{ message: string; id: number } | null>(null);

  const transactionAccounts = useMemo(
    () => accounts.filter(item => !item.is_archived && !isLoanAccount(item)),
    [accounts],
  );
  const assets = useMemo(() => transactionAccounts.filter(item => item.type === 'asset'), [transactionAccounts]);
  const transactionLiabilities = useMemo(
    () => transactionAccounts.filter(item => item.type === 'liability'),
    [transactionAccounts],
  );
  const availableCategories = useMemo(
    () => categories.filter(category => type === 'income' ? category.type === 'income' : category.type !== 'income'),
    [categories, type],
  );
  const eligibleAccounts = type === 'income' ? assets : transactionAccounts;
  const activeGoals = savingsGoals.filter(goal => goal.isActive);
  const selectedCategory = availableCategories.find(item => item.id === categoryId);
  const CategoryIcon = selectedCategory ? icons[selectedCategory.icon] : Tag;

  const showError = (message: string) => setError({ message, id: Date.now() });

  useEffect(() => {
    if (type === 'transfer' || availableCategories.length === 0) return;
    if (!availableCategories.some(category => category.id === categoryId)) setCategoryId(availableCategories[0].id);
  }, [availableCategories, categoryId, type]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (assets.length > 0 && !account) setAccount(assets[0].id);
    if (assets.length > 0 && !fromAccountId) setFromAccountId(assets[0].id);
    if (transactionAccounts.length > 0 && !toAccountId) setToAccountId(transactionLiabilities[0]?.id ?? transactionAccounts[0].id);
  }, [account, assets, fromAccountId, toAccountId, transactionAccounts, transactionLiabilities]);

  useEffect(() => {
    if (type !== 'transfer' || !fromAccountId) return;
    if (toAccountId === fromAccountId || !transactionAccounts.some(item => item.id === toAccountId)) {
      setToAccountId(transactionAccounts.find(item => item.id !== fromAccountId)?.id ?? '');
    }
  }, [fromAccountId, toAccountId, transactionAccounts, type]);

  useEffect(() => {
    if (!isAddModalOpen) return;
    if (editingTransaction) {
      setTitle(editingTransaction.title);
      setNotes(editingTransaction.notes ?? '');
      setAmount(Math.abs(editingTransaction.amount).toString());
      setType(editingTransaction.type);
      setAccount(editingTransaction.account || editingTransaction.fromAccountId || editingTransaction.toAccountId || '');
      setFromAccountId(editingTransaction.fromAccountId || '');
      setToAccountId(editingTransaction.toAccountId || '');
      setIsRecurring(Boolean(editingTransaction.isRecurring));
      setRecurrenceFrequency(recurringRules.find(rule => rule.id === editingTransaction.recurringRuleId)?.frequency ?? editingTransaction.recurrenceFrequency ?? 'MONTHLY');
      setDate(new Date(editingTransaction.date).toISOString().split('T')[0]);
      setGroupId(events.find(event => event.id === editingTransaction.eventId)?.name || '');
      setGoalId(editingTransaction.goalId || '');
      const category = categories.find(item => `#${item.name.toLowerCase().replace(/\s+/g, '')}` === editingTransaction.category);
      if (category) setCategoryId(category.id);
      return;
    }

    setTitle('');
    setNotes('');
    setAmount('');
    setType('expense');
    setIsRecurring(false);
    setRecurrenceFrequency('MONTHLY');
    setDate(new Date().toISOString().split('T')[0]);
    setGroupId('');
    setGoalId('');
    setCategoryId(categories.find(category => category.type !== 'income')?.id ?? categories[0]?.id ?? '');
    setAccount(assets[0]?.id ?? transactionAccounts[0]?.id ?? '');
    setFromAccountId(assets[0]?.id ?? '');
    setToAccountId(transactionLiabilities[0]?.id ?? transactionAccounts.find(item => item.id !== assets[0]?.id)?.id ?? '');
  }, [assets, categories, editingTransaction, events, isAddModalOpen, recurringRules, transactionAccounts, transactionLiabilities]);

  useEffect(() => {
    if (!isAddModalOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isAddModalOpen]);

  if (!isAddModalOpen) return null;

  const close = () => {
    setAddModalOpen(false);
    setEditingTransaction(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) return showError('Enter an amount greater than zero.');
    if (type === 'transfer' && (!fromAccountId || !toAccountId || fromAccountId === toAccountId)) return showError('Choose two different accounts for this transfer.');
    if (type !== 'transfer' && !account) return showError('Choose an account.');

    if (type === 'transfer') {
      const destination = accounts.find(item => item.id === toAccountId);
      if (isLoanAccount(destination)) return showError('Use Pay Down to make loan payments.');
    } else {
      const selected = accounts.find(item => item.id === account);
      if (isLoanAccount(selected)) return showError('Use Pay Down to make loan payments.');
    }

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const shouldRemainPending = date > today || editingTransaction?.is_verified === 0 || (!editingTransaction && isRecurring);

    if (type === 'income') {
      const selected = accounts.find(item => item.id === account);
      if (selected?.type === 'liability') return showError('Income can only be received into an asset account.');
    }

    if (!shouldRemainPending && type === 'expense') {
      const selected = accounts.find(item => item.id === account);
      if (selected?.type === 'asset') {
        let available = selected.balance;
        if (editingTransaction?.type === 'expense' && (editingTransaction.account || editingTransaction.fromAccountId) === selected.id) available += Math.abs(editingTransaction.amount);
        if (numAmount > available) return showError(`Insufficient funds in ${selected.name}.`);
      }
    }

    if (!shouldRemainPending && type === 'transfer') {
      const source = accounts.find(item => item.id === fromAccountId);
      if (source?.type === 'asset') {
        let available = source.balance;
        if (editingTransaction?.type === 'transfer' && editingTransaction.fromAccountId === source.id) available += Math.abs(editingTransaction.amount);
        if (numAmount > available) return showError(`Insufficient funds in ${source.name}.`);
      }
    }

    const category = categories.find(item => item.id === categoryId);
    const categoryName = category?.name || 'General';
    const iconName = category?.icon || 'ShoppingBag';
    let finalTitle = title.trim();
    if (!finalTitle) {
      if (type === 'transfer') {
        const fromName = accounts.find(item => item.id === fromAccountId)?.name || 'Account';
        const toName = accounts.find(item => item.id === toAccountId)?.name || 'Account';
        finalTitle = `Transfer: ${fromName} to ${toName}`;
      } else finalTitle = type === 'income' ? 'Income' : categoryName;
    }

    const eventName = groupId.trim();
    let eventId: string | undefined;
    if (eventName) {
      const existingEvent = events.find(item => item.name.localeCompare(eventName, undefined, { sensitivity: 'accent' }) === 0);
      const event = existingEvent ?? await createEvent(eventName);
      if (!event) return showError('Unable to save this event.');
      eventId = event.id;
    }
    const isInterestOnly = categoryName.toLowerCase().includes('interest') || finalTitle.toLowerCase().includes('interest payment');

    const newTx = {
      title: finalTitle,
      subtitle: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      amount: type === 'income' ? Math.abs(numAmount) : -Math.abs(numAmount),
      date: new Date(`${date}T12:00:00`).toISOString(),
      category: type === 'transfer' ? '#transfer' : `#${categoryName.toLowerCase().replace(/\s+/g, '')}`,
      icon: type === 'transfer' ? 'ArrowRightLeft' as const : iconName,
      type,
      account: type === 'transfer' ? undefined : account,
      fromAccountId: type === 'transfer' ? fromAccountId : type === 'expense' ? account : undefined,
      toAccountId: type === 'transfer' ? toAccountId : type === 'income' ? account : undefined,
      transaction_type: type.toUpperCase() as Transaction['transaction_type'],
      isRecurring,
      recurrenceFrequency: isRecurring ? recurrenceFrequency : undefined,
      isInterestOnly,
      eventId,
      goalId: goalId || undefined,
      notes: notes.trim() || undefined,
      is_verified: shouldRemainPending ? 0 : 1,
    };

    const result = editingTransaction ? await updateTransaction(editingTransaction.id, newTx) : await addTransaction(newTx);
    if (!result.success) return showError(result.error || 'Unable to save this transaction.');
    close();
  };

  const tone = type === 'expense' ? 'red' : type === 'income' ? 'green' : 'blue';
  const titleLabel = type === 'income' ? 'Source / description' : type === 'transfer' ? 'Transfer title (optional)' : 'What was this for?';
  const titleIcon = type === 'expense' ? <ArrowUpRight className="h-3.5 w-3.5" /> : type === 'income' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowRightLeft className="h-3.5 w-3.5" />;

  return (
    <V35ModalFrame size="lg" testId="transaction-form-sheet" labelledBy="transaction-form-title" panelClassName="p-0">
      <FinanceFormHeader
        title={editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
        subtitle="Expense, income and transfer in one focused form"
        onClose={close}
        closeLabel="Back from transaction form"
        titleId="transaction-form-title"
      />

      <div className="cb-finance-body min-h-0 flex-1">
        <form onSubmit={handleSubmit} className="cb-finance-form">
          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-[11px] font-medium text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error.message}</span>
            </div>
          ) : null}

          {!editingTransaction ? (
            <div className="cb-finance-segmented" aria-label="Transaction type">
              <button className="expense" type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}><ArrowUpRight className="h-4 w-4" />Expense</button>
              <button className="income" type="button" aria-pressed={type === 'income'} onClick={() => { setType('income'); if (assets[0]) setAccount(assets[0].id); }}><ArrowDownLeft className="h-4 w-4" />Income</button>
              <button className="transfer" type="button" aria-pressed={type === 'transfer'} onClick={() => setType('transfer')}><ArrowRightLeft className="h-4 w-4" />Transfer</button>
            </div>
          ) : null}

          <AmountHero id="transaction-amount" ariaLabel="Transaction amount" symbol={getCurrencySymbol()} value={amount} onValueChange={setAmount} tone={tone} />

          <FinanceField label={titleLabel} htmlFor="transaction-title" icon={titleIcon}>
            <div className="relative cb-finance-control-with-icon">
              <span className="cb-finance-control-icon" aria-hidden="true"><FileText className="h-4 w-4" /></span>
              <input id="transaction-title" aria-label={titleLabel} value={title} onChange={event => setTitle(event.target.value)} placeholder={type === 'income' ? 'e.g. Salary, Freelance' : type === 'expense' ? 'e.g. Dinner with friends' : 'Optional'} className={financeFieldClass} />
            </div>
          </FinanceField>

          {type === 'transfer' ? (
            <div className="cb-transfer-account-groups">
              <AccountChoiceGroup
                legend="From account"
                name="fromAccount"
                accounts={assets}
                value={fromAccountId}
                onChange={setFromAccountId}
                ariaPrefix="Paid From"
                formatCurrency={formatCurrency}
                icon={<ArrowUpRight className="h-3.5 w-3.5" />}
              />
              <AccountChoiceGroup
                legend="To account"
                name="toAccount"
                accounts={transactionAccounts.filter(item => item.id !== fromAccountId)}
                value={toAccountId}
                onChange={setToAccountId}
                ariaPrefix="Paid To"
                formatCurrency={formatCurrency}
                icon={<ArrowDownLeft className="h-3.5 w-3.5" />}
              />
            </div>
          ) : (
            <>
              <AccountChoiceGroup
                legend={type === 'expense' ? 'Paid from' : 'Paid to'}
                name="account"
                accounts={eligibleAccounts}
                value={account}
                onChange={setAccount}
                ariaPrefix={type === 'expense' ? 'Paid From' : 'Paid To'}
                formatCurrency={formatCurrency}
                icon={<WalletCards className="h-3.5 w-3.5" />}
              />

              <FinanceField label="Category" htmlFor="transaction-category" icon={<Tag className="h-3.5 w-3.5" />}>
                <FinanceSelect
                  id="transaction-category"
                  ariaLabel="Category"
                  value={categoryId}
                  onChange={setCategoryId}
                  required
                  leadingIcon={<CategoryIcon className="h-4 w-4" />}
                >
                  {availableCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </FinanceSelect>
              </FinanceField>
            </>
          )}

          <FinanceField label="Date" htmlFor="transaction-date" icon={<CalendarDays className="h-3.5 w-3.5" />}>
            <div className="relative">
              <input id="transaction-date" aria-label="Transaction date" type="date" value={date} onChange={event => setDate(event.target.value)} className={`${financeFieldClass} pr-10`} required />
              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#728299]" />
            </div>
          </FinanceField>

          <FinanceSection title="More options" icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
            <FinanceField label="Notes (optional)" htmlFor="transaction-notes" icon={<NotebookPen className="h-3.5 w-3.5" />}>
              <div className="relative cb-finance-control-with-icon">
                <span className="cb-finance-control-icon" aria-hidden="true"><NotebookPen className="h-4 w-4" /></span>
                <input id="transaction-notes" aria-label="Notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Anything useful to remember" className={financeFieldClass} />
              </div>
            </FinanceField>

            <FinanceField label="Event / outing (optional)" htmlFor="transaction-event" icon={<UsersRound className="h-3.5 w-3.5" />}>
              <div className="relative cb-finance-control-with-icon">
                <span className="cb-finance-control-icon" aria-hidden="true"><UsersRound className="h-4 w-4" /></span>
                <input id="transaction-event" list="coinbuddy-events" value={groupId} onChange={event => setGroupId(event.target.value)} placeholder="Choose or type an event" className={financeFieldClass} />
              </div>
              <datalist id="coinbuddy-events">{events.map(item => <option key={item.id} value={item.name} />)}</datalist>
            </FinanceField>

            {type !== 'income' && activeGoals.length > 0 ? (
              <FinanceField label="Goal contribution (optional)" htmlFor="transaction-goal" icon={<Target className="h-3.5 w-3.5" />}>
                <FinanceSelect id="transaction-goal" ariaLabel="Goal contribution" value={goalId} onChange={setGoalId} leadingIcon={<Target className="h-4 w-4" />}>
                  <option value="">No goal</option>
                  {activeGoals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </FinanceSelect>
              </FinanceField>
            ) : null}

            <FinanceToggle
              label="Recurring transaction"
              description="Create future scheduled occurrences"
              checked={isRecurring}
              onChange={setIsRecurring}
              disabled={Boolean(editingTransaction)}
              ariaLabel="Toggle recurring transaction"
              icon={<Repeat2 className="h-4 w-4" />}
            />

            {isRecurring ? (
              <FinanceField label="Frequency" htmlFor="transaction-frequency" icon={<Repeat2 className="h-3.5 w-3.5" />}>
                <FinanceSelect id="transaction-frequency" ariaLabel="Frequency" value={recurrenceFrequency} onChange={value => setRecurrenceFrequency(value as typeof recurrenceFrequency)} disabled={Boolean(editingTransaction)} leadingIcon={<Repeat2 className="h-4 w-4" />}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUALLY">Annually</option>
                </FinanceSelect>
              </FinanceField>
            ) : null}
          </FinanceSection>

          <FinanceSubmitButton tone={type === 'expense' ? 'danger' : type === 'income' ? 'success' : 'primary'}>
            {editingTransaction ? <><Save className="h-4 w-4" />Save Changes</> : type === 'expense' ? <><ArrowUpRight className="h-4 w-4" />Save Expense</> : type === 'income' ? <><ArrowDownLeft className="h-4 w-4" />Save Income</> : <><ArrowRightLeft className="h-4 w-4" />Transfer Money</>}
          </FinanceSubmitButton>
        </form>
      </div>
    </V35ModalFrame>
  );
}