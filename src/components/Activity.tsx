import { useState, useMemo, useRef } from 'react';
import type { ComponentType, SVGProps, PointerEvent as ReactPointerEvent } from 'react';
import { Search, Filter, ShieldCheck, Sparkles, Database, Utensils, Banknote, Car, Briefcase, ShoppingBag, Plus, Zap, Home, Trash2, Check, X, ArrowRightLeft, ArrowUpDown, Layers } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';
import { useDebounce } from '../hooks/useDebounce';
import { isCashFlowTransaction } from '../domain/ledgerRules';
import { isEventAssignableTransaction } from '../domain/eventRules';
import { transactionMatchesSearch } from '../utils/transactionSearch';


export function Activity() {
  const { transactions, formatCurrency, setAddModalOpen, categories, events, createEvent, groupTransactionsToEvent, deleteTransaction, setEditingTransaction, getCycleDetails, accounts, approveTransaction, rejectTransaction } = useAppContext();
  
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'All' | 'Income' | 'Expense' | 'Transfer'>('All');
  const typeFilters = ['All', 'Income', 'Expense', 'Transfer'] as const;
  const typeFilterSwipe = useHorizontalSwipe(direction => {
    setSelectedTypeFilter(current => {
      const currentIndex = typeFilters.indexOf(current);
      const nextIndex = direction === 'left'
        ? Math.min(currentIndex + 1, typeFilters.length - 1)
        : Math.max(currentIndex - 1, 0);
      return typeFilters[nextIndex];
    });
  }, true);
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('All');
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>('All');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isEventPickerOpen, setEventPickerOpen] = useState(false);
  const [eventName, setEventName] = useState('');
  const [approvalDates, setApprovalDates] = useState<Record<string, string>>({});
  const [approvalErrors, setApprovalErrors] = useState<Record<string, string>>({});
  const pendingTransactions = useMemo(() => transactions.filter(tx => tx.is_verified === 0), [transactions]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

const selectedTransactions = useMemo(
  () => transactions.filter(transaction => selectedIds.has(transaction.id)),
  [selectedIds, transactions]
);
const selectedSum = useMemo(() => {
  return selectedTransactions.reduce((acc, t) => {
    if (t.type === 'income' || t.type === 'transfer') return acc + Math.abs(t.amount);
    return acc - Math.abs(t.amount);
  }, 0);
}, [selectedTransactions]);
const hasEventRestrictedSelection = selectedTransactions.some(transaction => !isEventAssignableTransaction(transaction));
const hasAssignedEventSelection = selectedTransactions.some(transaction => Boolean(transaction.eventId));


  const deleteSelected = () => {
    selectedIds.forEach(id => {
      try {
        deleteTransaction(id);
      } catch (e) {
        console.error(e);
      }
    });
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

const resetEventSelection = () => {
  setSelectedIds(new Set());
  setIsSelectionMode(false);
  setEventPickerOpen(false);
  setEventName('');
};

const openEventPicker = () => {
  if (!selectedIds.size || hasEventRestrictedSelection) return;
  setEventName('');
  setEventPickerOpen(true);
};

const groupSelectedToEvent = () => {
  const name = eventName.trim();
  if (!selectedIds.size || !name || hasEventRestrictedSelection) return;
  const event = events.find(item => item.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0) ?? createEvent(name);
  groupTransactionsToEvent([...selectedIds], event.id);
  resetEventSelection();
};

const unassignSelectedEvents = () => {
  if (!selectedIds.size) return;
  groupTransactionsToEvent([...selectedIds], null);
  resetEventSelection();
};


  const availableCycles
 = useMemo(() => {
    const cyclesMap = new Map<string, { label: string, key: string }>();
    transactions.forEach(t => {
      const details = getCycleDetails(t.date);
      if (!cyclesMap.has(details.key)) {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        cyclesMap.set(details.key, {
          key: details.key,
          label: `${monthNames[details.month]} ${details.year}`
        });
      }
    });
    // Add current cycle just in case
    const currentDetails = getCycleDetails(new Date().toISOString());
    if (!cyclesMap.has(currentDetails.key)) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      cyclesMap.set(currentDetails.key, {
        key: currentDetails.key,
        label: `${monthNames[currentDetails.month]} ${currentDetails.year}`
      });
    }
    return [{ key: 'all', label: 'All Time' }, ...Array.from(cyclesMap.values()).sort((a, b) => b.key.localeCompare(a.key))];
  }, [transactions, getCycleDetails]);

  const [selectedCycle, setSelectedCycle] = useState<string>('all');
  const [selectedSort, setSelectedSort] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'notes-asc' | 'notes-desc'>('date-desc');

  const filteredTransactions = useMemo(() => {
    let filtered = transactions.filter(tx => {
      const categoryName = categories.find(c => c.id === tx.category || `#${c.name.toLowerCase().replace(/\s+/g, '')}` === tx.category)?.name;
      const matchesSearch = transactionMatchesSearch(tx, debouncedQuery, {
        accountNames: accounts.filter(account => tx.account === account.id || tx.fromAccountId === account.id || tx.toAccountId === account.id).map(account => account.name),
        eventName: events.find(event => event.id === tx.eventId)?.name,
        categoryName,
      });
      
      const matchesCategory = selectedCategoryFilter 
        ? tx.category === `#${categories.find(c => c.id === selectedCategoryFilter)?.name.toLowerCase().replace(/\s+/g, '')}` ||
          tx.category === selectedCategoryFilter
        : true;
        
      const matchesCycle = selectedCycle === 'all' ? true : getCycleDetails(tx.date).key === selectedCycle;
      
      const matchesType = selectedTypeFilter === 'All' ? true : tx.type.toLowerCase() === selectedTypeFilter.toLowerCase();
      
      const matchesAccount = selectedAccountFilter === 'All' 
        ? true 
        : tx.account === selectedAccountFilter || tx.fromAccountId === selectedAccountFilter || tx.toAccountId === selectedAccountFilter;

      const matchesEvent = selectedEventFilter === 'All'
        ? true
        : selectedEventFilter === '__none__'
          ? !tx.eventId
          : tx.eventId === selectedEventFilter;

      return matchesSearch && matchesCategory && matchesCycle && matchesType && matchesAccount && matchesEvent;
    });

    return filtered.sort((a, b) => {
      if (selectedSort === 'date-desc') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      } else if (selectedSort === 'date-asc') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (selectedSort === 'amount-desc') {
        return Math.abs(b.amount) - Math.abs(a.amount);
      } else if (selectedSort === 'amount-asc') {
        return Math.abs(a.amount) - Math.abs(b.amount);
      } else if (selectedSort === 'notes-asc') {
        return a.title.localeCompare(b.title);
      } else if (selectedSort === 'notes-desc') {
        return b.title.localeCompare(a.title);
      }
      return 0;
    });
  }, [transactions, debouncedQuery, selectedCategoryFilter, categories, selectedCycle, getCycleDetails, selectedTypeFilter, selectedAccountFilter, selectedEventFilter, selectedSort, accounts, events]);

  const outflow = filteredTransactions.filter(t => !t.isOpeningBalance && isCashFlowTransaction(t) && t.type === 'expense').reduce((acc, curr) => acc + Math.abs(curr.amount), 0);
  
  const totalSavings = filteredTransactions
    .filter(t => {
      if (t.isOpeningBalance) return false;
      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\s+/g, '')}` === t.category || c.id === t.category);
      return catObj?.affordabilityClass === 'SAVINGS' || catObj?.group === 'Savings';
    })
    .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

  return (
    <div data-testid="page-activity" className="w-full space-y-6 pb-24 md:pb-0 animate-fade-in">
      {/* Header with Select */} 
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-on-surface">Activity Logger</h2>
        <button 
          onClick={() => {
            setIsSelectionMode(!isSelectionMode);
            if (isSelectionMode) setSelectedIds(new Set());
          }}
          className="text-primary font-medium hover:bg-primary/10 px-4 py-2 rounded-xl transition-colors"
        >
          {isSelectionMode ? 'Cancel' : 'Select'}
        </button>
      </div>

      {pendingTransactions.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
          <h3 className="font-semibold text-on-surface">Needs confirmation</h3>
          <p className="mt-1 text-sm text-on-surface-variant">Recurring entries stay out of balances until you confirm they happened.</p>
          <div className="mt-3 space-y-3">
            {pendingTransactions.map(tx => (
              <div key={tx.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 dark:bg-surface-container-low">
                <span className="min-w-32 flex-1 text-sm font-medium">{tx.title} · {formatCurrency(tx.amount)}</span>
                <input aria-label={`Confirmation date for ${tx.title}`} type="date" value={approvalDates[tx.id] ?? tx.date.slice(0, 10)} onChange={e => setApprovalDates(prev => ({ ...prev, [tx.id]: e.target.value }))} />
                <button className="rounded-lg bg-primary px-3 text-sm font-medium text-on-primary" onClick={() => {
                  const outcome = approveTransaction(tx.id, approvalDates[tx.id] ?? tx.date.slice(0, 10));
                  setApprovalErrors(previous => ({ ...previous, [tx.id]: outcome.success ? '' : (outcome.error || 'This scheduled transaction cannot be confirmed yet.') }));
                }}>{tx.type === 'income' ? 'Received ✓' : tx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}</button>
                <button className="rounded-lg border border-outline px-3 text-sm" onClick={() => { rejectTransaction(tx.id); setApprovalErrors(previous => ({ ...previous, [tx.id]: '' })); }}>Skip</button>
                {approvalErrors[tx.id] && <span role="alert" className="basis-full text-xs font-medium text-error">{approvalErrors[tx.id]} The item remains pending until it can be confirmed.</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Type Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide touch-pan-y" {...typeFilterSwipe}>
        {typeFilters.map(type => (
          <button
            key={type}
            onClick={() => setSelectedTypeFilter(type)}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${selectedTypeFilter === type ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface hover:bg-surface-variant'}`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Account Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setSelectedAccountFilter('All')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${selectedAccountFilter === 'All' ? 'bg-surface-variant text-on-surface border border-outline-variant' : 'bg-transparent text-on-surface border border-outline-variant/50 hover:bg-surface-container'}`}
        >
          All Accounts
        </button>
        {accounts.map(acc => (
           <button
            key={acc.id}
            onClick={() => setSelectedAccountFilter(acc.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${selectedAccountFilter === acc.id ? 'bg-surface-variant text-on-surface border border-outline-variant' : 'bg-transparent text-on-surface border border-outline-variant/50 hover:bg-surface-container'}`}
          >
            {acc.name}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <section className="flex flex-col md:flex-row items-center gap-3">
        <div data-tour-id="tour-transaction-search" className="relative flex-grow w-full md:w-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
          <input 
            type="text" 
            placeholder="Search title, category, account or amount..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-container border border-outline-variant/30 rounded-2xl py-3.5 pl-12 pr-4 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div>
        
        <div data-tour-id="tour-transaction-filters" className="flex flex-wrap gap-3 w-full md:w-auto">
          <select 
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
            className="bg-surface-container py-3.5 px-4 rounded-2xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors shrink-0 text-on-surface focus:outline-none focus:border-primary/50 flex-1 md:flex-none"
          >
            {availableCycles.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <div className="relative flex-1 md:flex-none min-w-[130px]">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            <select 
              value={selectedSort}
              onChange={(e) => setSelectedSort(e.target.value as typeof selectedSort)}
              className="w-full bg-surface-container py-3.5 pl-9 pr-4 rounded-2xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors text-on-surface focus:outline-none focus:border-primary/50 appearance-none"
            >
              <option value="date-desc">Date (Latest)</option>
              <option value="date-asc">Date (Oldest)</option>
              <option value="amount-desc">Amount (Highest)</option>
              <option value="amount-asc">Amount (Lowest)</option>
              <option value="notes-asc">Title (A to Z)</option>
              <option value="notes-desc">Title (Z to A)</option>
            </select>
          </div>
          <div className="relative flex-1 md:flex-none min-w-[150px]">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            <select
              aria-label="Filter transactions by event"
              value={selectedEventFilter}
              onChange={(e) => setSelectedEventFilter(e.target.value)}
              className="w-full bg-surface-container py-3.5 pl-9 pr-4 rounded-2xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors text-on-surface focus:outline-none focus:border-primary/50 appearance-none"
            >
              <option value="All">All Events</option>
              <option value="__none__">No Event</option>
              {events.map(event => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
          </div>
          <div className="relative flex-1 md:flex-none min-w-[140px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            <select 
              value={selectedCategoryFilter || ''}
              onChange={(e) => setSelectedCategoryFilter(e.target.value || null)}
              className="w-full bg-surface-container py-3.5 pl-9 pr-4 rounded-2xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors text-on-surface focus:outline-none focus:border-primary/50 appearance-none"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="grid grid-cols-2 gap-4">
        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Outflow (Total)</p>
          <p className="text-2xl font-bold text-on-surface font-numeric">{formatCurrency(outflow)}</p>
        </div>
        <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 flex flex-col justify-between">
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Savings Contributed</p>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-numeric">{formatCurrency(totalSavings)}</p>
            <Sparkles className="w-5 h-5 text-emerald-500 opacity-80 mb-1" />
          </div>
        </div>
      </section>
      {/* Transactions */}
      <div className="space-y-8">
        <div>
          <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3 ml-1">All Transactions</h2>
          <div className="space-y-3">
            {filteredTransactions.map((tx, idx) => {
              const Icon = icons[tx.icon as keyof typeof icons] || ShoppingBag;
              const isIncome = tx.type === 'income';
              const isTransfer = tx.type === 'transfer';
              const isBalanceAdjustment = tx.transaction_type === 'BALANCE_ADJUSTMENT';
              let color = 'secondary';
              if (isIncome) color = 'primary';
              if (isTransfer) color = 'tertiary';
              
              let accountContext = '';
              if (isTransfer) {
                const fromName = accounts.find(a => a.id === tx.fromAccountId)?.name || 'Unknown';
                const toName = accounts.find(a => a.id === tx.toAccountId)?.name || 'Unknown';
                accountContext = `${fromName} → ${toName}`;
              } else {
                accountContext = accounts.find(a => a.id === tx.account)?.name || tx.account || '';
              }
              
              return (
                <TransactionRow 
                  key={tx.id}
                  icon={isTransfer ? ArrowRightLeft : Icon} 
                  title={tx.title} 
                  eventName={events.find(event => event.id === tx.eventId)?.name}
                  subtitle={accountContext ? `${tx.subtitle} • ${accountContext}` : tx.subtitle} 
                  amount={formatCurrency(tx.amount)} 
                  tag={tx.isOpeningBalance ? 'Opening Balance' : tx.category} 
                  color={color} 
                  isIncome={isIncome}
                  isTransfer={isTransfer}
                  isPending={tx.is_verified === 0}
                  type={tx.type}
                  onDelete={tx.isOpeningBalance ? undefined : () => deleteTransaction(tx.id)}
                  onEdit={tx.isOpeningBalance || isBalanceAdjustment ? undefined : () => {
                    setEditingTransaction(tx);
                    setAddModalOpen(true);
                  }}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(tx.id)}
onToggleSelect={() => toggleSelection(tx.id)}
onLongPress={() => {
  setSelectedIds(previous => new Set(previous).add(tx.id));
  setIsSelectionMode(true);
}}
                  tourId={idx === 0 ? "tour-transaction-actions" : undefined}
                />
              );
            })}

            {filteredTransactions.length === 0 && (
              <div className="text-center text-on-surface-variant py-8 bg-surface-container rounded-2xl">
                No transactions found for this cycle.
              </div>
            )}
          </div>
        </div>
      </div>

{isEventPickerOpen && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setEventPickerOpen(false)}>
    <div role="dialog" aria-modal="true" aria-labelledby="event-picker-title" className="w-full max-w-md rounded-3xl border border-outline-variant/30 bg-surface-container-highest p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="event-picker-title" className="text-lg font-bold text-on-surface">Assign an event</h3>
          <p className="mt-1 text-xs text-on-surface-variant">Choose an existing event or type a new event name.</p>
        </div>
        <button type="button" aria-label="Close event picker" onClick={() => setEventPickerOpen(false)} className="rounded-full p-2 text-on-surface-variant hover:bg-surface-variant hover:text-on-surface">
          <X className="h-5 w-5" />
        </button>
      </div>
      <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Existing events</label>
      <select
        aria-label="Choose existing event"
        value={events.find(item => item.name.localeCompare(eventName.trim(), undefined, { sensitivity: 'accent' }) === 0)?.id ?? ''}
        onChange={event => setEventName(events.find(item => item.id === event.target.value)?.name ?? '')}
        className="mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:border-primary/60"
      >
        <option value="">{events.length ? 'Choose an event' : 'No existing events yet'}</option>
        {events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select>
      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Event name</label>
      <input
        autoFocus
        value={eventName}
        onChange={event => setEventName(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') groupSelectedToEvent(); }}
        placeholder="e.g. Goa trip, Birthday dinner"
        className="mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:border-primary/60"
      />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          {hasAssignedEventSelection && (
            <button type="button" onClick={unassignSelectedEvents} className="rounded-xl border border-error/30 px-4 py-2 text-sm font-semibold text-error hover:bg-error/10">Remove event</button>
          )}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setEventPickerOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-variant">Cancel</button>
          <button type="button" disabled={!eventName.trim()} onClick={groupSelectedToEvent} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50">Assign event</button>
        </div>
      </div>
    </div>
  </div>
)}

      {isSelectionMode && (
        <div className="fixed top-20 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[400px] bg-surface-container-highest rounded-2xl p-4 shadow-2xl z-50 flex items-center justify-between border border-outline-variant/30">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
              {selectedIds.size} ITEMS SELECTED
            </p>
            <p className="text-sm text-on-surface-variant mb-0.5">Total Sum:</p>
            <p className={`text-2xl font-bold font-numeric ${selectedSum >= 0 ? 'text-primary' : 'text-error'}`}>
              {selectedSum < 0 ? '-' : '+'}{formatCurrency(Math.abs(selectedSum))}
            </p>
            {hasEventRestrictedSelection && (
              <p className="mt-1 max-w-[190px] text-[10px] leading-tight text-amber-600 dark:text-amber-300">Opening balances and reconciliation adjustments cannot be assigned to an event.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
              className="text-on-surface-variant hover:text-on-surface text-sm font-medium"
              aria-label="Cancel selection"
            >
              Cancel
            </button>
            <button 
              onClick={openEventPicker}
              disabled={selectedIds.size === 0 || hasEventRestrictedSelection}
              className="px-3 h-12 bg-primary/10 text-primary rounded-xl flex items-center gap-2 hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-50 text-xs font-bold"
              title={hasEventRestrictedSelection ? 'Opening balances and reconciliation adjustments cannot be assigned to events' : 'Group selected transactions to an event'}
              aria-label="Group selected transactions to event"
            >
              <Layers className="w-4 h-4" />
              Event
            </button>
            <button 
              onClick={deleteSelected}
              disabled={selectedIds.size === 0}
              className="w-12 h-12 bg-error/10 text-error rounded-xl flex items-center justify-center hover:bg-error hover:text-on-error transition-colors disabled:opacity-50"
              aria-label="Delete selected transactions"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type TransactionRowProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  eventName?: string;
  subtitle: string;
  amount: string;
  tag?: string;
  color: string;
  isIncome?: boolean;
  isTransfer?: boolean;
  isPending?: boolean;
  type: string;
  onDelete?: () => void;
  onEdit?: () => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onLongPress: () => void;
  tourId?: string;
};

function TransactionRow({ icon: Icon, title, eventName, subtitle, amount, tag, color, isIncome = false, isTransfer = false, isPending = false, type, onDelete, onEdit, isSelectionMode, isSelected, onToggleSelect, onLongPress, tourId }: TransactionRowProps) {
  const colorMap: Record<string, { bg: string, text: string }> = {
    primary: { bg: 'bg-primary-container/20', text: 'text-primary' },
    secondary: { bg: 'bg-secondary-container/20', text: 'text-secondary' },
    tertiary: { bg: 'bg-tertiary-container/20', text: 'text-tertiary' },
    outline: { bg: 'bg-surface-variant', text: 'text-on-surface-variant' },
    error: { bg: 'bg-error-container/20', text: 'text-error' },
  };
  
const c = colorMap[color] || colorMap.primary;
const longPressTimer = useRef<number | null>(null);
const pointerStart = useRef<{ x: number; y: number } | null>(null);
const suppressNextClick = useRef(false);

const clearLongPress = () => {
  if (longPressTimer.current !== null) {
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }
};

const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
  if (isSelectionMode || event.button !== 0 || (event.target as HTMLElement).closest('button, input, select, a')) return;
  pointerStart.current = { x: event.clientX, y: event.clientY };
  clearLongPress();
  longPressTimer.current = window.setTimeout(() => {
    suppressNextClick.current = true;
    onLongPress();
    longPressTimer.current = null;
  }, 550);
};

const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
  if (!pointerStart.current || longPressTimer.current === null) return;
  const distance = Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y);
  if (distance > 10) clearLongPress();
};

const handlePointerEnd = () => {
  clearLongPress();
  pointerStart.current = null;
};

return (
  <div 
    data-tour-id={tourId}
    aria-pressed={isSelectionMode ? isSelected : undefined}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerEnd}
    onPointerCancel={handlePointerEnd}
    onPointerLeave={handlePointerEnd}
    onContextMenu={event => { if (!isSelectionMode) event.preventDefault(); }}
    onClick={(event) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        event.preventDefault();
        return;
      }
      if (isSelectionMode) onToggleSelect();
      else if (onEdit) onEdit();
    }}
      className={`bg-surface-container-low hover:bg-surface-container transition-colors p-4 rounded-2xl flex items-start gap-4 cursor-pointer border ${isSelected ? 'border-primary' : 'border-transparent'} hover:border-outline-variant/30 group`}
    >
      {isSelectionMode && (
        <div className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 mt-3 transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-outline-variant/50'}`}>
          {isSelected && <Check className="w-4 h-4 text-on-primary" />}
        </div>
      )}
      <div className={`w-12 h-12 rounded-full mt-0.5 ${c.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-6 h-6 ${c.text}`} />
      </div>
      <div className="flex-grow min-w-0 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-on-surface break-words whitespace-pre-wrap leading-tight">{title}</h3>
          {isPending && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Pending</span>}
        </div>
        {eventName && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary break-words">
            <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{eventName}</span>
          </p>
        )}
        <p className="text-xs text-on-surface-variant break-words whitespace-pre-wrap mt-1">
          {subtitle} {type && <span className="capitalize opacity-80">• {type}</span>}
        </p>
      </div>
      <div className="text-right shrink-0 flex items-start gap-3 pt-1">
        <div className="text-right">
          <p className={`font-bold font-numeric ${isIncome ? 'text-primary' : 'text-on-surface'}`}>{isIncome ? '+' : ''}{amount}</p>
          {tag && (
            <div className="mt-1.5 flex justify-end">
              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] bg-surface-variant text-on-surface-variant font-bold uppercase tracking-wider text-right break-words max-w-[150px]">
                {typeof tag === 'string' ? tag.replace(/^#/, '') : tag}
              </span>
            </div>
          )}
        </div>
        {!isSelectionMode && (
          <div className="flex gap-1 shrink-0 hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity">
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1.5 hover:bg-error/10 text-error rounded-lg transition-all"
                title="Delete Transaction"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {/* Mobile visible delete and edit */}
      {!isSelectionMode && (
        <div className="flex flex-col gap-1 md:hidden">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 text-error bg-error/10 rounded-lg shrink-0"
              title="Delete Transaction"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
