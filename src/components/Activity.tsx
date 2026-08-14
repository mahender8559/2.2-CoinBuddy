import { useState, useMemo, useRef } from 'react';
import type { ComponentType, SVGProps, PointerEvent as ReactPointerEvent } from 'react';
import { Search, Filter, ShieldCheck, Sparkles, Database, Utensils, Banknote, Car, Briefcase, ShoppingBag, Plus, Zap, Home, Trash2, Check, X, ArrowRightLeft, ArrowUpDown, Layers, ChevronDown } from 'lucide-react';
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
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isPendingPanelOpen, setIsPendingPanelOpen] = useState(false);
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

  const transactionGroups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = new Map<string, { label: string; transactions: typeof filteredTransactions }>();
    filteredTransactions.forEach(transaction => {
      const date = new Date(transaction.date);
      const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const label = day.getTime() === today.getTime()
        ? 'Today'
        : day.getTime() === yesterday.getTime()
          ? 'Yesterday'
          : day.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
      const existing = groups.get(key);
      if (existing) existing.transactions.push(transaction);
      else groups.set(key, { label, transactions: [transaction] });
    });
    return Array.from(groups.values());
  }, [filteredTransactions]);

  const hasAdvancedFilters = selectedAccountFilter !== 'All' || selectedEventFilter !== 'All' || selectedCycle !== 'all' || selectedCategoryFilter !== null || selectedSort !== 'date-desc';
  const clearAdvancedFilters = () => {
    setSelectedAccountFilter('All');
    setSelectedEventFilter('All');
    setSelectedCycle('all');
    setSelectedCategoryFilter(null);
    setSelectedSort('date-desc');
  };

  return (
    <div data-testid="page-activity" className="w-full space-y-4 pb-24 md:pb-0 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">Activity</h1>
          <p className="mt-1 hidden text-sm text-on-surface-variant sm:block">Track every money movement without the clutter.</p>
        </div>
        <button
          onClick={() => {
            setIsSelectionMode(!isSelectionMode);
            if (isSelectionMode) setSelectedIds(new Set());
          }}
          className="v35-focus-ring min-h-10 rounded-xl px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          {isSelectionMode ? 'Cancel' : 'Select'}
        </button>
      </div>

      <section className="space-y-3">
        <div className="flex gap-2">
          <div data-tour-id="tour-transaction-search" className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="v35-focus-ring h-12 w-full rounded-xl border border-outline-variant/35 bg-surface-container-low pl-10 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant/70 outline-none transition-colors focus:border-primary/60"
            />
          </div>
          <button
            data-tour-id="tour-transaction-filters"
            type="button"
            aria-label="Advanced filters"
            aria-expanded={isFilterPanelOpen}
            onClick={() => setIsFilterPanelOpen(current => !current)}
            className={`v35-focus-ring relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors ${isFilterPanelOpen || hasAdvancedFilters ? 'border-primary/35 bg-primary/12 text-primary' : 'border-outline-variant/35 bg-surface-container-low text-on-surface-variant hover:text-on-surface'}`}
          >
            <Filter className="h-5 w-5" />
            {hasAdvancedFilters ? <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" /> : null}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide touch-pan-y" {...typeFilterSwipe}>
          {typeFilters.map(type => (
            <button
              key={type}
              onClick={() => setSelectedTypeFilter(type)}
              className={`v35-focus-ring min-h-9 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold transition-colors ${selectedTypeFilter === type ? 'border-primary/30 bg-primary text-on-primary' : 'border-outline-variant/35 bg-surface-container-low text-on-surface-variant hover:text-on-surface'}`}
            >
              {type}
            </button>
          ))}
        </div>
      </section>

      {isFilterPanelOpen && (
        <section aria-label="Advanced transaction filters" className="v35-surface rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-on-surface">Filters</h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">Narrow the list without crowding Activity.</p>
            </div>
            {hasAdvancedFilters ? <button type="button" onClick={clearAdvancedFilters} className="min-h-0 text-xs font-semibold text-primary">Reset</button> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-medium text-on-surface-variant">Cycle
              <select value={selectedCycle} onChange={(event) => setSelectedCycle(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                {availableCycles.map(cycle => <option key={cycle.key} value={cycle.key}>{cycle.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-on-surface-variant">Account
              <select value={selectedAccountFilter} onChange={(event) => setSelectedAccountFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                <option value="All">All Accounts</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-on-surface-variant">Event
              <select aria-label="Filter transactions by event" value={selectedEventFilter} onChange={(event) => setSelectedEventFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                <option value="All">All Events</option>
                <option value="__none__">No Event</option>
                {events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-on-surface-variant">Category
              <select value={selectedCategoryFilter || ''} onChange={(event) => setSelectedCategoryFilter(event.target.value || null)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                <option value="">All Categories</option>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-on-surface-variant">Sort
              <select value={selectedSort} onChange={(event) => setSelectedSort(event.target.value as typeof selectedSort)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                <option value="date-desc">Date (Latest)</option>
                <option value="date-asc">Date (Oldest)</option>
                <option value="amount-desc">Amount (Highest)</option>
                <option value="amount-asc">Amount (Lowest)</option>
                <option value="notes-asc">Title (A to Z)</option>
                <option value="notes-desc">Title (Z to A)</option>
              </select>
            </label>
          </div>
        </section>
      )}

      {pendingTransactions.length > 0 && (
        <section className="v35-surface overflow-hidden rounded-2xl border-[rgba(251,191,36,.20)]">
          <button
            type="button"
            aria-expanded={isPendingPanelOpen}
            aria-controls="pending-confirmations"
            onClick={() => setIsPendingPanelOpen(current => !current)}
            className="v35-focus-ring flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cb-amber-soft)] text-[var(--cb-amber)]">
              <Check className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                Needs confirmation
                <span className="rounded-full bg-[var(--cb-amber-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--cb-amber)]">{pendingTransactions.length}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-on-surface-variant">Scheduled items are waiting for your confirmation.</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${isPendingPanelOpen ? 'rotate-180' : ''}`} />
          </button>
          {isPendingPanelOpen ? (
            <div id="pending-confirmations" className="divide-y divide-outline-variant/20 border-t border-outline-variant/20">
              {pendingTransactions.map(tx => (
                <div key={tx.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                  <span className="min-w-0 text-sm font-medium text-on-surface">{tx.title} · <span className="font-numeric">{formatCurrency(tx.amount)}</span></span>
                  <input aria-label={`Confirmation date for ${tx.title}`} type="date" value={approvalDates[tx.id] ?? tx.date.slice(0, 10)} onChange={event => setApprovalDates(previous => ({ ...previous, [tx.id]: event.target.value }))} className="rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm" />
                  <button className="rounded-xl bg-primary px-3 text-xs font-semibold text-on-primary" onClick={() => {
                    const outcome = approveTransaction(tx.id, approvalDates[tx.id] ?? tx.date.slice(0, 10));
                    setApprovalErrors(previous => ({ ...previous, [tx.id]: outcome.success ? '' : (outcome.error || 'This scheduled transaction cannot be confirmed yet.') }));
                  }}>{tx.type === 'income' ? 'Received ✓' : tx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}</button>
                  <button className="rounded-xl border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface-variant" onClick={() => { rejectTransaction(tx.id); setApprovalErrors(previous => ({ ...previous, [tx.id]: '' })); }}>Skip</button>
                  {approvalErrors[tx.id] ? <span role="alert" className="text-xs font-medium text-error sm:col-span-4">{approvalErrors[tx.id]} The item remains pending until it can be confirmed.</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <section className="hidden grid-cols-2 gap-3 sm:grid">
        <div className="v35-surface rounded-2xl p-4">
          <p className="text-xs font-semibold text-on-surface-variant">Total Outflow</p>
          <p className="mt-2 font-numeric text-xl font-semibold text-[var(--cb-red)]">{formatCurrency(outflow)}</p>
        </div>
        <div className="v35-surface rounded-2xl p-4">
          <p className="text-xs font-semibold text-on-surface-variant">Savings Contributed</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="font-numeric text-xl font-semibold text-[var(--cb-green)]">{formatCurrency(totalSavings)}</p>
            <Sparkles className="h-4 w-4 text-[var(--cb-green)]" />
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {transactionGroups.map((group, groupIndex) => (
          <section key={`${group.label}-${groupIndex}`} className="v35-surface overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-on-surface">{group.label}</h2>
              <span className="text-xs text-on-surface-variant">{group.transactions.length}</span>
            </div>
            <div className="[&>div:last-child]:border-b-0">
              {group.transactions.map((tx, txIndex) => {
                const Icon = icons[tx.icon as keyof typeof icons] || ShoppingBag;
                const isIncome = tx.type === 'income';
                const isTransfer = tx.type === 'transfer';
                const isBalanceAdjustment = tx.transaction_type === 'BALANCE_ADJUSTMENT';
                let color = 'secondary';
                if (isIncome) color = 'primary';
                if (isTransfer) color = 'tertiary';

                let accountContext = '';
                if (isTransfer) {
                  const fromName = accounts.find(account => account.id === tx.fromAccountId)?.name || 'Unknown';
                  const toName = accounts.find(account => account.id === tx.toAccountId)?.name || 'Unknown';
                  accountContext = `${fromName} → ${toName}`;
                } else {
                  accountContext = accounts.find(account => account.id === tx.account)?.name || tx.account || '';
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
                    tourId={groupIndex === 0 && txIndex === 0 ? 'tour-transaction-actions' : undefined}
                  />
                );
              })}
            </div>
          </section>
        ))}

        {filteredTransactions.length === 0 && (
          <div className="v35-surface rounded-2xl px-5 py-10 text-center">
            <Search className="mx-auto h-6 w-6 text-on-surface-variant" />
            <p className="mt-3 text-sm font-medium text-on-surface">No transactions found</p>
            <p className="mt-1 text-xs text-on-surface-variant">Try clearing a filter or searching for something else.</p>
          </div>
        )}
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
      className={`group flex cursor-pointer items-center gap-3 border-b px-3.5 py-3.5 transition-colors sm:px-4 ${isSelected ? 'border-primary/40 bg-primary/8' : 'border-outline-variant/20 bg-transparent hover:bg-surface-container-high/45'}`}
    >
      {isSelectionMode && (
        <div className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 mt-3 transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-outline-variant/50'}`}>
          {isSelected && <Check className="w-4 h-4 text-on-primary" />}
        </div>
      )}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.bg}`}>
        <Icon className={`h-5 w-5 ${c.text}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold leading-tight text-on-surface">{title}</h3>
          {isPending && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Pending</span>}
        </div>
        {eventName && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary break-words">
            <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{eventName}</span>
          </p>
        )}
        <p className="mt-1 truncate text-xs text-on-surface-variant">
          {subtitle} {type && <span className="capitalize opacity-80">• {type}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-2 text-right">
        <div className="text-right">
          <p className={`font-numeric text-sm font-semibold ${isIncome ? 'text-[var(--cb-green)]' : isTransfer ? 'text-[var(--cb-purple)]' : 'text-[var(--cb-red)]'}`}>{isIncome ? '+' : isTransfer ? '' : '-'}{amount.replace(/^[-+]/, '')}</p>
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
    </div>
  );
}
