import { useState, FormEvent, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';
import { AlertTriangle, ArrowLeft, Calendar as CalendarIcon, Check, ChevronDown, X } from 'lucide-react';
import type { Transaction } from '../types';

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
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [account, setAccount] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const showError = (message: string) => setError({ message, id: Date.now() });

  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'>('MONTHLY');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [groupId, setGroupId] = useState('');
  const [goalId, setGoalId] = useState('');

  const activeAccounts = useMemo(() => accounts.filter(a => !a.is_archived), [accounts]);
  const assets = useMemo(() => accounts.filter(a => a.type === 'asset' && !a.is_archived), [accounts]);
  const liabilities = useMemo(() => accounts.filter(a => a.type === 'liability' && !a.is_archived), [accounts]);

  const availableCategories = useMemo(() => {
    return categories.filter(c => type === 'income' ? c.type === 'income' : c.type !== 'income');
  }, [categories, type]);

  useEffect(() => {
    if (type !== 'transfer' && availableCategories.length > 0) {
      const exists = availableCategories.some(c => c.id === categoryId);
      if (!exists) setCategoryId(availableCategories[0].id);
    }
  }, [availableCategories, categoryId, type]);

  useEffect(() => {
    setError(null);
  }, [amount, type, account, fromAccountId, toAccountId, isAddModalOpen]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (assets.length > 0 && !account) setAccount(assets[0].id);
    if (assets.length > 0 && !fromAccountId) setFromAccountId(assets[0].id);
    if (accounts.length > 0 && !toAccountId) {
      setToAccountId(liabilities.length > 0 ? liabilities[0].id : accounts[0].id);
    }
  }, [accounts, assets, liabilities, account, fromAccountId, toAccountId]);

  useEffect(() => {
    if (editingTransaction && isAddModalOpen) {
      setTitle(editingTransaction.title);
      setAmount(Math.abs(editingTransaction.amount).toString());
      setType(editingTransaction.type);
      setAccount(editingTransaction.account || '');
      setFromAccountId(editingTransaction.fromAccountId || '');
      setToAccountId(editingTransaction.toAccountId || '');
      setIsRecurring(editingTransaction.isRecurring || false);
      setRecurrenceFrequency(recurringRules.find(rule => rule.id === editingTransaction.recurringRuleId)?.frequency ?? 'MONTHLY');
      setDate(new Date(editingTransaction.date).toISOString().split('T')[0]);
      setGroupId(events.find(event => event.id === editingTransaction.eventId)?.name || '');
      setGoalId(editingTransaction.goalId || '');

      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\s+/g, '')}` === editingTransaction.category);
      if (catObj) setCategoryId(catObj.id);
    } else if (isAddModalOpen) {
      setTitle('');
      setAmount('');
      setType('expense');
      setIsRecurring(false);
      setRecurrenceFrequency('MONTHLY');
      setDate(new Date().toISOString().split('T')[0]);
      setGroupId('');
      setGoalId('');
      setCategoryId(categories[0]?.id || '');

      if (assets.length > 0) setAccount(assets[0].id);
      if (assets.length > 0) setFromAccountId(assets[0].id);
      if (liabilities.length > 0) setToAccountId(liabilities[0].id);
      else if (accounts.length > 0) setToAccountId(accounts[0].id);
    }
  }, [editingTransaction, isAddModalOpen, categories, assets, liabilities, accounts, events, recurringRules]);

  useEffect(() => {
    if (isAddModalOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isAddModalOpen]);

  if (!isAddModalOpen) return null;

  const close = () => {
    setAddModalOpen(false);
    setEditingTransaction(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      showError('Transaction amount must strictly be a positive number (> 0).');
      return;
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isFuture = date > todayStr;
    const shouldRemainPending = isFuture || editingTransaction?.is_verified === 0 || (!editingTransaction && isRecurring);

    if (type === 'income') {
      const selectedAcc = accounts.find(a => a.id === account);
      if (selectedAcc && selectedAcc.type === 'liability') {
        showError('Credit Cards and Loans (Liabilities) cannot be selected as the destination account for Income. Income can only flow into Asset accounts.');
        return;
      }
    }

    if (!shouldRemainPending && type === 'expense') {
      const targetAccId = account || 'cash';
      const selectedAcc = accounts.find(a => a.id === targetAccId);
      if (selectedAcc && selectedAcc.type === 'asset') {
        let availableBalance = selectedAcc.balance;
        if (editingTransaction && editingTransaction.type === 'expense' && (editingTransaction.account || 'cash') === selectedAcc.id) {
          availableBalance += Math.abs(editingTransaction.amount);
        }
        if (numAmount > availableBalance) {
          showError(`Insufficient funds in ${selectedAcc.name}. Cannot process transaction.`);
          return;
        }
      }
    } else if (!shouldRemainPending && type === 'transfer') {
      const sourceAcc = accounts.find(a => a.id === fromAccountId);
      if (sourceAcc && sourceAcc.type === 'asset') {
        let availableBalance = sourceAcc.balance;
        if (editingTransaction && editingTransaction.type === 'transfer' && editingTransaction.fromAccountId === sourceAcc.id) {
          availableBalance += Math.abs(editingTransaction.amount);
        }
        if (numAmount > availableBalance) {
          showError(`Insufficient funds in ${sourceAcc.name}. Cannot process transaction.`);
          return;
        }
      }
    }

    const categoryObj = categories.find(c => c.id === categoryId);
    const categoryName = categoryObj?.name || 'General';
    const iconName = categoryObj?.icon || 'ShoppingBag';

    let finalTitle = title.trim();
    if (!finalTitle) {
      if (type === 'transfer') {
        const fromName = accounts.find(a => a.id === fromAccountId)?.name || 'Account';
        const toName = accounts.find(a => a.id === toAccountId)?.name || 'Account';
        finalTitle = `Transfer: ${fromName} to ${toName}`;
      } else if (type === 'income') {
        finalTitle = 'Income';
      } else {
        finalTitle = categoryName;
      }
    }

    const isInterestOnly = categoryName.toLowerCase().includes('interest') || finalTitle.toLowerCase().includes('interest payment');
    const eventName = groupId.trim();
    const eventId = eventName
      ? (events.find(event => event.name.localeCompare(eventName, undefined, { sensitivity: 'accent' }) === 0) ?? createEvent(eventName)).id
      : undefined;

    const newTx = {
      title: finalTitle,
      subtitle: `${new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
      amount: type === 'expense' || type === 'transfer' ? -Math.abs(Number(amount) || 0) : Math.abs(Number(amount) || 0),
      date: new Date(`${date}T12:00:00`).toISOString(),
      category: type === 'transfer' ? '#transfer' : `#${categoryName.toLowerCase().replace(/\s+/g, '')}`,
      icon: type === 'transfer' ? 'ArrowRightLeft' : iconName,
      type,
      account: type === 'transfer' ? undefined : account,
      fromAccountId: type === 'transfer' ? fromAccountId : (type === 'expense' ? account : undefined),
      toAccountId: type === 'transfer' ? toAccountId : (type === 'income' ? account : undefined),
      transaction_type: type.toUpperCase() as Transaction['transaction_type'],
      isRecurring,
      recurrenceFrequency: isRecurring ? recurrenceFrequency : undefined,
      isInterestOnly,
      eventId,
      is_verified: shouldRemainPending ? 0 : 1,
      goalId: goalId || undefined,
    };

    let res: { success: boolean; error?: string };
    if (editingTransaction) res = updateTransaction(editingTransaction.id, newTx);
    else res = await addTransaction(newTx);

    if (!res.success) {
      showError(res.error || 'Insufficient funds. Cannot process transaction.');
      return;
    }

    close();
  };

  const fieldClass = 'h-10 w-full rounded-lg border border-[#21334a] bg-[#111d2d] px-3 text-[12px] font-medium text-[#f5f7fb] outline-none transition focus:border-[#0d6efd] focus:ring-1 focus:ring-[#0d6efd]';
  const labelClass = 'mb-1.5 block text-[10.5px] font-medium text-[#cbd4e0]';
  const eligibleAccounts = type === 'income' ? assets : activeAccounts;

  return (
    <V35ModalFrame size="sm" testId="transaction-form-sheet" labelledBy="transaction-form-title">
      <div className="grid h-[54px] shrink-0 grid-cols-[40px_1fr_40px] items-center border-b border-[#21334a]/70 px-2.5">
        <button type="button" aria-label="Back from transaction form" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 id="transaction-form-title" className="text-center text-[14px] font-semibold text-white">
          {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
        </h2>
        <button type="button" aria-label="Close transaction form" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">
        <form onSubmit={handleSubmit} className="space-y-3">
          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-[11px] font-medium text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error.message}</span>
            </div>
          ) : null}

          {!editingTransaction ? (
            <div className="grid grid-cols-3 gap-1">
              <button type="button" onClick={() => setType('expense')} aria-pressed={type === 'expense'} className={`h-8 rounded-lg border text-[11px] font-medium transition ${type === 'expense' ? 'border-red-500/45 bg-red-500/10 text-red-400' : 'border-[#21334a] bg-[#0e1928] text-[#9aa8ba]'}`}>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm border border-current" /> Expense
              </button>
              <button type="button" onClick={() => { setType('income'); if (assets.length > 0 && !assets.some(a => a.id === account)) setAccount(assets[0].id); }} aria-pressed={type === 'income'} className={`h-8 rounded-lg border text-[11px] font-medium transition ${type === 'income' ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-400' : 'border-[#21334a] bg-[#0e1928] text-[#9aa8ba]'}`}>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm border border-current" /> Income
              </button>
              <button type="button" onClick={() => setType('transfer')} aria-pressed={type === 'transfer'} className={`h-8 rounded-lg border text-[11px] font-medium transition ${type === 'transfer' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-[#21334a] bg-[#0e1928] text-[#9aa8ba]'}`}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full border border-current" /> Transfer
              </button>
            </div>
          ) : null}

          <div>
            <label htmlFor="transaction-amount" className={labelClass}>Amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#9aa8ba]">{getCurrencySymbol()}</span>
              <CurrencyInput
                id="transaction-amount"
                aria-label="Transaction amount"
                required
                value={amount}
                onValueChange={setAmount}
                placeholder="0.00"
                className={`${fieldClass} pl-8 font-numeric`}
              />
            </div>
          </div>

          {type === 'transfer' ? (
            <>
              <div>
                <label htmlFor="transaction-from-account" className={labelClass}>Paid From</label>
                <div className="relative">
                  <select id="transaction-from-account" aria-label="Paid From" name="fromAccount" value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} className={`${fieldClass} appearance-none pr-8`} required>
                    {assets.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
                </div>
              </div>
              <div>
                <label htmlFor="transaction-to-account" className={labelClass}>Paid To</label>
                <div className="relative">
                  <select id="transaction-to-account" aria-label="Paid To" name="toAccount" value={toAccountId} onChange={e => setToAccountId(e.target.value)} className={`${fieldClass} appearance-none pr-8`} required>
                    {activeAccounts.filter(acc => acc.id !== fromAccountId).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="transaction-account" className={labelClass}>{type === 'expense' ? 'Paid From' : 'Paid To'}</label>
              <div className="relative">
                <select id="transaction-account" aria-label={type === 'expense' ? 'Paid From' : 'Paid To'} value={account} onChange={e => setAccount(e.target.value)} className={`${fieldClass} appearance-none pr-8`} required>
                  {eligibleAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
              </div>
            </div>
          )}

          {type !== 'transfer' ? (
            <div>
              <label htmlFor="transaction-category" className={labelClass}>Category</label>
              <div className="relative">
                <select id="transaction-category" aria-label="Category" value={categoryId} onChange={e => setCategoryId(e.target.value)} className={`${fieldClass} appearance-none pr-8`} required>
                  {availableCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
              </div>
            </div>
          ) : null}

          <div>
            <label htmlFor="transaction-date" className={labelClass}>Date</label>
            <div className="relative">
              <input id="transaction-date" aria-label="Transaction date" type="date" value={date} onChange={e => setDate(e.target.value)} className={`${fieldClass} pr-9`} required />
              <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8fa4]" />
            </div>
          </div>

          <div>
            <label htmlFor="transaction-notes" className={labelClass}>Notes (optional)</label>
            <input id="transaction-notes" aria-label="Notes" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a note" className={fieldClass} />
          </div>

          <details className="group rounded-lg border border-[#1f3046] bg-[#0d1827]">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between px-3 text-[11px] font-medium text-[#9aa8ba]">
              More options
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-[#1f3046] p-3">
              <div>
                <label htmlFor="transaction-event" className={labelClass}>Event / outing (optional)</label>
                <input id="transaction-event" list="coinbuddy-events" value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="Choose or type an event" className={fieldClass} />
                <datalist id="coinbuddy-events">{events.map(event => <option key={event.id} value={event.name} />)}</datalist>
              </div>

              {type !== 'income' && savingsGoals.some(goal => goal.isActive) ? (
                <div>
                  <label htmlFor="transaction-goal" className={labelClass}>Goal contribution (optional)</label>
                  <select id="transaction-goal" aria-label="Goal contribution" value={goalId} onChange={e => setGoalId(e.target.value)} className={fieldClass}>
                    <option value="">No goal</option>
                    {savingsGoals.filter(goal => goal.isActive).map(goal => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
                  </select>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium text-[#d6deea]">Recurring transaction</p>
                  <p className="mt-0.5 text-[10px] text-[#718197]">Create future scheduled occurrences</p>
                </div>
                <button type="button" aria-label="Toggle recurring transaction" aria-pressed={isRecurring} disabled={Boolean(editingTransaction)} onClick={() => setIsRecurring(value => !value)} className={`relative h-6 w-11 rounded-full border transition ${isRecurring ? 'border-blue-500/60 bg-blue-600' : 'border-[#31445e] bg-[#162338]'}`}>
                  <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all ${isRecurring ? 'left-[22px]' : 'left-1'}`} />
                </button>
              </div>

              {isRecurring ? (
                <div>
                  <label htmlFor="transaction-frequency" className={labelClass}>Frequency</label>
                  <select id="transaction-frequency" value={recurrenceFrequency} disabled={Boolean(editingTransaction)} onChange={e => setRecurrenceFrequency(e.target.value as typeof recurrenceFrequency)} className={fieldClass}>
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUALLY">Annually</option>
                  </select>
                </div>
              ) : null}
            </div>
          </details>

          <button type="submit" className="v35-focus-ring mt-1 flex h-10 w-full items-center justify-center rounded-lg border border-blue-400/20 bg-gradient-to-b from-[#1677ff] to-[#0d60ee] text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(13,96,238,.22)] hover:from-[#2582ff] hover:to-[#176bf5]">
            {editingTransaction ? 'Save Changes' : 'Save Transaction'}
          </button>
        </form>
      </div>
    </V35ModalFrame>
  );
}
