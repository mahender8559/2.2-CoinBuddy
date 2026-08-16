import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarDays } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { Transaction } from '../types';
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
} from './ui/FinanceForm';

export function AddTransactionModal() {
  const {
    isAddModalOpen,
    setAddModalOpen,
    addTransaction,
    updateTransaction,
    editingTransaction,
    setEditingTransaction,
    getCurrencySymbol,
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

  const activeAccounts = useMemo(() => accounts.filter(item => !item.is_archived), [accounts]);
  const assets = useMemo(() => accounts.filter(item => item.type === 'asset' && !item.is_archived), [accounts]);
  const liabilities = useMemo(() => accounts.filter(item => item.type === 'liability' && !item.is_archived), [accounts]);
  const availableCategories = useMemo(
    () => categories.filter(category => type === 'income' ? category.type === 'income' : category.type !== 'income'),
    [categories, type],
  );
  const eligibleAccounts = type === 'income' ? assets : activeAccounts;
  const activeGoals = savingsGoals.filter(goal => goal.isActive);

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
    if (activeAccounts.length > 0 && !toAccountId) setToAccountId(liabilities[0]?.id ?? activeAccounts[0].id);
  }, [account, activeAccounts, assets, fromAccountId, liabilities, toAccountId]);

  useEffect(() => {
    if (type !== 'transfer' || !fromAccountId) return;
    if (toAccountId === fromAccountId || !activeAccounts.some(item => item.id === toAccountId)) {
      setToAccountId(activeAccounts.find(item => item.id !== fromAccountId)?.id ?? '');
    }
  }, [activeAccounts, fromAccountId, toAccountId, type]);

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
    setAccount(assets[0]?.id ?? activeAccounts[0]?.id ?? '');
    setFromAccountId(assets[0]?.id ?? '');
    setToAccountId(liabilities[0]?.id ?? activeAccounts.find(item => item.id !== assets[0]?.id)?.id ?? '');
  }, [activeAccounts, assets, categories, editingTransaction, events, isAddModalOpen, liabilities, recurringRules]);

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
    const eventId = eventName
      ? (events.find(item => item.name.localeCompare(eventName, undefined, { sensitivity: 'accent' }) === 0) ?? createEvent(eventName)).id
      : undefined;
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

    const result = editingTransaction ? updateTransaction(editingTransaction.id, newTx) : await addTransaction(newTx);
    if (!result.success) return showError(result.error || 'Unable to save this transaction.');
    close();
  };

  const tone = type === 'expense' ? 'red' : type === 'income' ? 'green' : 'blue';
  const titleLabel = type === 'income' ? 'Source / description' : type === 'transfer' ? 'Transfer title (optional)' : 'What was this for?';

  return (
    <V35ModalFrame size="lg" testId="transaction-form-sheet" labelledBy="transaction-form-title" panelClassName="p-0">
      <div id="transaction-form-title" className="sr-only">{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</div>
      <FinanceFormHeader
        title={editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
        subtitle="Expense, income and transfer in one focused form"
        onClose={close}
        closeLabel="Back from transaction form"
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
              <button className="expense" type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}>Expense</button>
              <button className="income" type="button" aria-pressed={type === 'income'} onClick={() => { setType('income'); if (assets[0]) setAccount(assets[0].id); }}>Income</button>
              <button className="transfer" type="button" aria-pressed={type === 'transfer'} onClick={() => setType('transfer')}>Transfer</button>
            </div>
          ) : null}

          <AmountHero id="transaction-amount" ariaLabel="Transaction amount" symbol={getCurrencySymbol()} value={amount} onValueChange={setAmount} tone={tone} />

          <FinanceField label={titleLabel} htmlFor="transaction-title">
            <input id="transaction-title" aria-label={titleLabel} value={title} onChange={event => setTitle(event.target.value)} placeholder={type === 'income' ? 'e.g. Salary, Freelance' : type === 'expense' ? 'e.g. Dinner with friends' : 'Optional'} className={financeFieldClass} />
          </FinanceField>

          {type === 'transfer' ? (
            <div className="cb-finance-grid">
              <FinanceField label="From account" htmlFor="transaction-from-account">
                <FinanceSelect id="transaction-from-account" name="fromAccount" ariaLabel="Paid From" value={fromAccountId} onChange={setFromAccountId} required>
                  {assets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </FinanceSelect>
              </FinanceField>
              <FinanceField label="To account" htmlFor="transaction-to-account">
                <FinanceSelect id="transaction-to-account" name="toAccount" ariaLabel="Paid To" value={toAccountId} onChange={setToAccountId} required>
                  {activeAccounts.filter(item => item.id !== fromAccountId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </FinanceSelect>
              </FinanceField>
            </div>
          ) : (
            <div className="cb-finance-grid">
              <FinanceField label={type === 'expense' ? 'Paid from' : 'Paid to'} htmlFor="transaction-account">
                <FinanceSelect id="transaction-account" ariaLabel={type === 'expense' ? 'Paid From' : 'Paid To'} value={account} onChange={setAccount} required>
                  {eligibleAccounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </FinanceSelect>
              </FinanceField>
              <FinanceField label="Category" htmlFor="transaction-category">
                <FinanceSelect id="transaction-category" ariaLabel="Category" value={categoryId} onChange={setCategoryId} required>
                  {availableCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </FinanceSelect>
              </FinanceField>
            </div>
          )}

          <FinanceField label="Date" htmlFor="transaction-date">
            <div className="relative">
              <input id="transaction-date" aria-label="Transaction date" type="date" value={date} onChange={event => setDate(event.target.value)} className={`${financeFieldClass} pr-10`} required />
              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#728299]" />
            </div>
          </FinanceField>

          <FinanceSection title="More options">
            <FinanceField label="Notes (optional)" htmlFor="transaction-notes">
              <input id="transaction-notes" aria-label="Notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Anything useful to remember" className={financeFieldClass} />
            </FinanceField>

            <FinanceField label="Event / outing (optional)" htmlFor="transaction-event">
              <input id="transaction-event" list="coinbuddy-events" value={groupId} onChange={event => setGroupId(event.target.value)} placeholder="Choose or type an event" className={financeFieldClass} />
              <datalist id="coinbuddy-events">{events.map(item => <option key={item.id} value={item.name} />)}</datalist>
            </FinanceField>

            {type !== 'income' && activeGoals.length > 0 ? (
              <FinanceField label="Goal contribution (optional)" htmlFor="transaction-goal">
                <FinanceSelect id="transaction-goal" ariaLabel="Goal contribution" value={goalId} onChange={setGoalId}>
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
            />

            {isRecurring ? (
              <FinanceField label="Frequency" htmlFor="transaction-frequency">
                <FinanceSelect id="transaction-frequency" ariaLabel="Frequency" value={recurrenceFrequency} onChange={value => setRecurrenceFrequency(value as typeof recurrenceFrequency)} disabled={Boolean(editingTransaction)}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUALLY">Annually</option>
                </FinanceSelect>
              </FinanceField>
            ) : null}
          </FinanceSection>

          <FinanceSubmitButton tone={type === 'expense' ? 'danger' : type === 'income' ? 'success' : 'primary'}>
            {editingTransaction ? 'Save Changes' : type === 'expense' ? 'Save Expense' : type === 'income' ? 'Save Income' : 'Transfer Money'}
          </FinanceSubmitButton>
        </form>
      </div>
    </V35ModalFrame>
  );
}
