import { useState, FormEvent, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';
import { X, Utensils, Car, Briefcase, Zap, Home, ShoppingBag, Banknote, Plus, ShieldCheck, Layers, ChevronUp, ChevronDown, Calendar as CalendarIcon, Edit3, Lock, CreditCard, Landmark, Check, AlertTriangle, Sparkles } from 'lucide-react';
import { icons } from '../icons';
import type { Transaction } from '../types';


export function AddTransactionModal() {
  const { isAddModalOpen, setAddModalOpen, addTransaction, updateTransaction, editingTransaction, setEditingTransaction, formatCurrency, getCurrencySymbol, accounts, creditCards, categories, events, recurringRules, savingsGoals, createEvent, setManageCategoriesOpen } = useAppContext();
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

  const isTransferToLiability = type === 'transfer' && toAccountId && accounts.find(a => a.id === toAccountId)?.type === 'liability';
  const transferToLiability = isTransferToLiability ? accounts.find(a => a.id === toAccountId) : null;
  const dueAmount = transferToLiability?.monthlyEMI ?? transferToLiability?.monthlyEMI ?? 0;
  const liabilityBalance = transferToLiability?.balance ?? 0;

  useEffect(() => {
    if (type !== 'transfer' && availableCategories.length > 0) {
      const exists = availableCategories.some(c => c.id === categoryId);
      if (!exists) {
        setCategoryId(availableCategories[0].id);
      }
    }
  }, [availableCategories, categoryId, type]);

  useEffect(() => {
    setError(null);
  }, [amount, type, account, fromAccountId, toAccountId, isAddModalOpen]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (assets.length > 0 && !account) setAccount(assets[0].id);
    if (assets.length > 0 && !fromAccountId) setFromAccountId(assets[0].id);
    if (accounts.length > 0 && !toAccountId) {
       setToAccountId(liabilities.length > 0 ? liabilities[0].id : accounts[0].id);
    }
  }, [accounts, assets, liabilities, account, fromAccountId, toAccountId]);

  // Set fields if editing
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

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isAddModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isAddModalOpen]);

  if (!isAddModalOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      showError('Transaction amount must strictly be a positive number (> 0).');
      return;
    }

    // Future transactions and newly-created recurring schedules stay pending
    // until confirmation, so today's balance must not prevent planning them.
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

    // Validate available funds for expenses and transfers from asset accounts
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

    const isInterestOnly = 
      categoryName.toLowerCase().includes('interest') ||
      finalTitle.toLowerCase().includes('interest payment');

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
      fromAccountId: type === 'transfer'
        ? fromAccountId
        : (type === 'expense' ? account : undefined),
      toAccountId: type === 'transfer'
        ? toAccountId
        : (type === 'income' ? account : undefined),
      transaction_type: type.toUpperCase() as Transaction['transaction_type'],
      isRecurring,
      recurrenceFrequency: isRecurring ? recurrenceFrequency : undefined,
      isInterestOnly,
      eventId,
      is_verified: shouldRemainPending ? 0 : 1,
      goalId: goalId || undefined
    };

    let res: { success: boolean; error?: string };
    if (editingTransaction) {
      res = updateTransaction(editingTransaction.id, newTx);
    } else {
      res = await addTransaction(newTx);
    }

    if (!res.success) {
      showError(res.error || 'Insufficient funds. Cannot process transaction.');
      return;
    }
    
    setEditingTransaction(null);
    setAddModalOpen(false);
  };

  return (
    <V35ModalFrame size="lg" testId="transaction-form-sheet">
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/30 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
          <h2 className="truncate text-lg font-semibold text-on-surface sm:text-xl">{editingTransaction ? 'Edit Transaction' : 'Log Transaction'}</h2>
          {editingTransaction && (
            <span className="px-2 py-0.5 ml-2 text-xs font-bold uppercase tracking-wider bg-surface-variant text-on-surface-variant rounded-md">
              {type}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Close transaction form"
          onClick={() => {
            setAddModalOpen(false);
            setEditingTransaction(null);
          }}
          className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl space-y-5 p-5 sm:p-6">
          
          {error && (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center gap-3 animate-fade-in shadow-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
              <span className="text-xs font-bold leading-tight">{error.message}</span>
            </div>
          )}

<div>
  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Event / outing (optional)</label>
  <div className="grid gap-2 sm:grid-cols-2">
    <select
      aria-label="Choose existing event"
      value={events.find(event => event.name.localeCompare(groupId.trim(), undefined, { sensitivity: 'accent' }) === 0)?.id ?? ''}
      onChange={event => setGroupId(events.find(item => item.id === event.target.value)?.name ?? '')}
      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:border-primary/60"
    >
      <option value="">No event (unassign)</option>
      {events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
    </select>
    <input
      value={groupId}
      onChange={event => setGroupId(event.target.value)}
      placeholder="Or type a new event name"
      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:border-primary/60"
    />
  </div>
  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
    <p className="text-[11px] text-on-surface-variant">Selecting an existing event fills the name field; typing a different name creates a new event.</p>
    {editingTransaction?.eventId && groupId && (
      <button type="button" onClick={() => setGroupId('')} className="rounded-lg border border-error/30 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/10">Unassign event</button>
    )}
  </div>
</div>

{type !== 'income' && savingsGoals.length > 0 && (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Goal contribution (optional)</label>
    <select aria-label="Goal contribution" value={goalId} onChange={event => setGoalId(event.target.value)} className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:border-primary/60">
      <option value="">No goal</option>
      {savingsGoals.filter(goal => goal.isActive).map(goal => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
    </select>
    <p className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">After confirmation, this transfer/expense advances an unlinked Goal automatically. Goals linked to an account use that account balance instead, so CoinBuddy never double-counts the contribution.</p>
  </div>
)}

{editingTransaction ? null : (

            <div className="flex gap-2 p-1 bg-surface-container-low rounded-2xl border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${type === 'expense' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('income');
                  const selectedAcc = accounts.find(a => a.id === account);
                  if (selectedAcc && selectedAcc.type === 'liability' && assets.length > 0) {
                    setAccount(assets[0].id);
                  }
                }}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${type === 'income' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
              >
                Income
              </button>
              <button
                type="button"
                onClick={() => setType('transfer')}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${type === 'transfer' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
              >
                Transfer
              </button>
            </div>
          )}

          <div className="flex flex-col items-center justify-center py-4">
            <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-4">AMOUNT</span>
            <div className="flex items-center justify-center gap-2 sm:gap-3 w-full px-2">
              <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary shrink-0">{getCurrencySymbol()}</span>
              <CurrencyInput
                aria-label="Transaction amount"
                required
                value={amount}
                onValueChange={setAmount}
                className={`bg-transparent font-numeric font-bold text-on-surface focus:outline-none min-w-[140px] max-w-[280px] sm:max-w-[360px] w-full text-center placeholder:text-on-surface-variant/30 transition-all ${
                  amount.length > 12 
                    ? 'text-2xl sm:text-3xl' 
                    : amount.length > 8 
                    ? 'text-3xl sm:text-4xl' 
                    : amount.length > 5 
                    ? 'text-4xl sm:text-5xl' 
                    : 'text-5xl sm:text-6xl'
                }`}
                placeholder="0.00"
              />
              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" onClick={() => setAmount(prev => (Number(prev || 0) + 1).toFixed(2))} className="bg-surface-container-high hover:bg-surface-variant p-1 rounded text-on-surface">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setAmount(prev => Math.max(0, Number(prev || 0) - 1).toFixed(2))} className="bg-surface-container-high hover:bg-surface-variant p-1 rounded text-on-surface">
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
            {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
              <div className="mt-3 px-3 py-1 bg-surface-container-high/70 border border-outline-variant/20 rounded-full flex items-center gap-1.5 animate-fade-in shadow-xs">
                <span className="text-[11px] font-medium text-on-surface-variant">Formatted:</span>
                <span className="text-xs font-bold text-emerald-400 font-numeric">
                  {formatCurrency(parseFloat(amount))}
                </span>
              </div>
            )}
            {isTransferToLiability && (
              <div className="flex gap-2 mt-4">
                {dueAmount > 0 && dueAmount !== liabilityBalance && (
                  <button
                    type="button"
                    onClick={() => setAmount(dueAmount.toString())}
                    className="flex-1 py-1.5 px-3 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold rounded-lg transition-colors border border-outline-variant/30 flex items-center justify-center gap-1.5"
                  >
                    Pay Due ({formatCurrency(dueAmount)})
                  </button>
                )}
                {liabilityBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(liabilityBalance.toString())}
                    className="flex-1 py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-xs font-semibold rounded-lg transition-colors border border-emerald-500/20 flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Full Payoff ({formatCurrency(liabilityBalance)})
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-4 text-xs text-on-surface-variant">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Encrypted on-device only</span>
            </div>
          </div>

          {type !== 'transfer' && (
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  {type === 'income' ? 'INCOME CATEGORY' : 'EXPENSE CATEGORY'}
                </h3>
                <span 
                  className="text-sm font-semibold text-primary cursor-pointer hover:underline"
                  onClick={() => {
                    setAddModalOpen(false);
                    setManageCategoriesOpen(true);
                  }}
                >
                  Manage
                </span>
              </div>
              
              {availableCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-4 bg-surface-container rounded-2xl border border-dashed border-outline-variant/30 text-center gap-2">
                  <p className="text-xs text-on-surface-variant font-medium">No {type} categories found.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAddModalOpen(false);
                      setManageCategoriesOpen(true);
                    }}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    + Create {type === 'income' ? 'Income' : 'Expense'} Category
                  </button>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {availableCategories.map(c => {
                    const Icon = icons[c.icon as keyof typeof icons] || ShoppingBag;
                    const isSelected = categoryId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategoryId(c.id)}
                        className={`flex flex-col items-center justify-center gap-2 min-w-[90px] p-4 rounded-2xl transition-all ${isSelected ? 'bg-primary/20 border-primary/50 text-primary border' : 'bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="text-xs font-semibold whitespace-nowrap">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {type !== 'transfer' && (
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5">
              <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4">
                {type === 'expense' ? 'FROM ACCOUNT' : 'TO ACCOUNT'}
              </h3>
              <div className="flex gap-3 flex-wrap">
                {(type === 'income' ? assets : activeAccounts).map(acc => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setAccount(acc.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all ${account === acc.id ? 'bg-primary/10 border-primary text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}
                  >
                    {acc.type === 'asset' ? <Landmark className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                    <span className="text-sm font-semibold">{acc.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'transfer' && (
             <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 flex flex-col md:flex-row gap-6">
               <div className="flex-1">
                 <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4">FROM (SOURCE)</h3>
                 <div className="flex flex-col gap-2">
                   {assets.map(acc => (
                      <label key={acc.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${fromAccountId === acc.id ? 'bg-primary/10 border-primary' : 'border-outline-variant/30 hover:bg-surface-container'}`}>
                        <input type="radio" name="fromAccount" value={acc.id} checked={fromAccountId === acc.id} onChange={() => setFromAccountId(acc.id)} className="hidden" />
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${fromAccountId === acc.id ? 'border-primary bg-primary' : 'border-outline-variant'}`}>
                          {fromAccountId === acc.id && <Check className="w-3 h-3 text-on-primary" />}
                        </div>
                        <span className="text-sm font-medium">{acc.name}</span>
                      </label>
                   ))}
                 </div>
               </div>
               <div className="flex-1">
                 <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4">TO (DESTINATION)</h3>
                 <div className="flex flex-col gap-2">
                   {activeAccounts.filter(a => a.id !== fromAccountId).map(acc => (
                      <label key={acc.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${toAccountId === acc.id ? 'bg-primary/10 border-primary' : 'border-outline-variant/30 hover:bg-surface-container'}`}>
                        <input type="radio" name="toAccount" value={acc.id} checked={toAccountId === acc.id} onChange={() => setToAccountId(acc.id)} className="hidden" />
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${toAccountId === acc.id ? 'border-primary bg-primary' : 'border-outline-variant'}`}>
                          {toAccountId === acc.id && <Check className="w-3 h-3 text-on-primary" />}
                        </div>
                        <span className="text-sm font-medium">{acc.name}</span>
                      </label>
                   ))}
                 </div>
               </div>
             </div>
          )}

          <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-on-surface">Recurring</h3>
                  <p className="text-xs text-on-surface-variant">
                    {editingTransaction?.recurringRuleId ? 'This occurrence belongs to a recurring schedule' : 'Create future scheduled occurrences'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={Boolean(editingTransaction)}
                onClick={() => setIsRecurring(!isRecurring)}
                className="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: isRecurring ? 'var(--primary)' : 'var(--surface-container-highest)' }}
                aria-label="Toggle recurring transaction"
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {isRecurring && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Frequency</label>
                <select
                  value={recurrenceFrequency}
                  disabled={Boolean(editingTransaction)}
                  onChange={e => setRecurrenceFrequency(e.target.value as typeof recurrenceFrequency)}
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary/60 disabled:opacity-60"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUALLY">Annually</option>
                </select>
              </div>
            )}
            {editingTransaction?.recurringRuleId && (
              <p className="text-[11px] leading-relaxed text-on-surface-variant">
                Editing this transaction changes only this occurrence. Manage the future series from Settings → Recurring Payments.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 relative">
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">DATE</label>
              <div className="flex flex-col gap-1 relative">
                <span className="text-base font-semibold text-on-surface">{new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <input 
                  type="date" 
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
              <CalendarIcon className="w-5 h-5 text-on-surface-variant absolute right-5 bottom-5 pointer-events-none" />
            </div>

            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 relative">
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">NOTES</label>
              <input 
                type="text" 
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Optional..."
                className="w-full bg-transparent text-base font-semibold text-on-surface focus:outline-none placeholder:text-on-surface-variant/50"
              />
              <Edit3 className="w-5 h-5 text-on-surface-variant absolute right-5 bottom-5 pointer-events-none" />
            </div>
          </div>

          <div className="sticky bottom-0 z-10 -mx-5 flex gap-3 border-t border-outline-variant/20 bg-surface-container/95 px-5 pb-1 pt-4 backdrop-blur sm:-mx-6 sm:px-6">
            {editingTransaction && (
              <button 
                type="button"
                onClick={() => {
                  setAddModalOpen(false);
                  setEditingTransaction(null);
                }}
                className="v35-focus-ring flex min-h-12 flex-1 items-center justify-center rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high"
              >
                Cancel
              </button>
            )}
            <button 
              type="submit"
              className="v35-focus-ring flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90"
            >
              <Lock className="w-5 h-5" /> {editingTransaction ? 'Save Changes' : 'Save Transaction'}
            </button>
          </div>
          <p className="text-center text-xs text-on-surface-variant pt-4">Saved instantly to your secure local ledger.</p>
        </form>
      </div>
    </V35ModalFrame>
  );
}
