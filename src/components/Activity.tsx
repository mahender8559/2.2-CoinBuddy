import { useState, useMemo } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { Search, Filter, ShieldCheck, Sparkles, Database, Utensils, Banknote, Car, Briefcase, ShoppingBag, Plus, Zap, Home, Trash2, Check, X, ArrowRightLeft, ArrowUpDown } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';


export function Activity() {
  const { transactions, formatCurrency, setAddModalOpen, categories, deleteTransaction, setEditingTransaction, getCycleDetails, accounts, approveTransaction, rejectTransaction } = useAppContext();
  
  const [searchQuery, setSearchQuery] = useState('');
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [approvalDates, setApprovalDates] = useState<Record<string, string>>({});
  const pendingTransactions = useMemo(() => transactions.filter(tx => tx.is_verified === 0), [transactions]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedSum = useMemo(() => {
    return transactions.filter(t => selectedIds.has(t.id)).reduce((acc, t) => {
      return acc + (t.type === 'income' ? t.amount : -Math.abs(t.amount));
    }, 0);
  }, [selectedIds, transactions]);

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


  const availableCycles = useMemo(() => {
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
      if (tx.is_verified === 0) return false;
      
      const matchesSearch = tx.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            tx.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategoryFilter 
        ? tx.category === `#${categories.find(c => c.id === selectedCategoryFilter)?.name.toLowerCase().replace(/\s+/g, '')}` ||
          tx.category === selectedCategoryFilter
        : true;
        
      const matchesCycle = selectedCycle === 'all' ? true : getCycleDetails(tx.date).key === selectedCycle;
      
      const matchesType = selectedTypeFilter === 'All' ? true : tx.type.toLowerCase() === selectedTypeFilter.toLowerCase();
      
      const matchesAccount = selectedAccountFilter === 'All' 
        ? true 
        : tx.account === selectedAccountFilter || tx.fromAccountId === selectedAccountFilter || tx.toAccountId === selectedAccountFilter;

      return matchesSearch && matchesCategory && matchesCycle && matchesType && matchesAccount;
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
  }, [transactions, searchQuery, selectedCategoryFilter, categories, selectedCycle, getCycleDetails, selectedTypeFilter, selectedAccountFilter, selectedSort]);

  const outflow = filteredTransactions.filter(t => !t.isOpeningBalance && t.type === 'expense').reduce((acc, curr) => acc + Math.abs(curr.amount), 0);
  
  const totalSavings = filteredTransactions
    .filter(t => {
      if (t.isOpeningBalance) return false;
      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\s+/g, '')}` === t.category || c.id === t.category);
      return catObj?.group === 'Savings';
    })
    .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

  return (
    <div className="space-y-6 pb-24 md:pb-0 animate-fade-in">
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
          <h3 className="font-semibold text-on-surface">Pending approvals</h3>
          <p className="mt-1 text-sm text-on-surface-variant">Pending recurring entries do not affect balances until approved.</p>
          <div className="mt-3 space-y-3">
            {pendingTransactions.map(tx => (
              <div key={tx.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 dark:bg-surface-container-low">
                <span className="min-w-32 flex-1 text-sm font-medium">{tx.title} · {formatCurrency(tx.amount)}</span>
                <input aria-label={`Approval date for ${tx.title}`} type="date" value={approvalDates[tx.id] ?? tx.date.slice(0, 10)} onChange={e => setApprovalDates(prev => ({ ...prev, [tx.id]: e.target.value }))} />
                <button className="rounded-lg bg-primary px-3 text-sm font-medium text-on-primary" onClick={() => approveTransaction(tx.id, approvalDates[tx.id] ?? tx.date.slice(0, 10))}>Approve</button>
                <button className="rounded-lg border border-outline px-3 text-sm" onClick={() => rejectTransaction(tx.id)}>Reject</button>
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
            placeholder="Search transactions..." 
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
              <option value="notes-asc">Notes (A to Z)</option>
              <option value="notes-desc">Notes (Z to A)</option>
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
                  subtitle={accountContext ? `${tx.subtitle} • ${accountContext}` : tx.subtitle} 
                  amount={formatCurrency(tx.amount)} 
                  tag={tx.isOpeningBalance ? 'Opening Balance' : tx.category} 
                  color={color} 
                  isIncome={isIncome}
                  isTransfer={isTransfer}
                  type={tx.type}
                  onDelete={tx.isOpeningBalance ? undefined : () => deleteTransaction(tx.id)}
                  onEdit={tx.isOpeningBalance ? undefined : () => {
                    setEditingTransaction(tx);
                    setAddModalOpen(true);
                  }}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(tx.id)}
                  onToggleSelect={() => toggleSelection(tx.id)}
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
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
              className="text-on-surface-variant hover:text-on-surface text-sm font-medium"
            >
              Cancel
            </button>
            <button 
              onClick={deleteSelected}
              disabled={selectedIds.size === 0}
              className="w-12 h-12 bg-error/10 text-error rounded-xl flex items-center justify-center hover:bg-error hover:text-on-error transition-colors disabled:opacity-50"
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
  subtitle: string;
  amount: string;
  tag?: string;
  color: string;
  isIncome?: boolean;
  isTransfer?: boolean;
  type: string;
  onDelete?: () => void;
  onEdit?: () => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  tourId?: string;
};

function TransactionRow({ icon: Icon, title, subtitle, amount, tag, color, isIncome = false, isTransfer = false, type, onDelete, onEdit, isSelectionMode, isSelected, onToggleSelect, tourId }: TransactionRowProps) {
  const colorMap: Record<string, { bg: string, text: string }> = {
    primary: { bg: 'bg-primary-container/20', text: 'text-primary' },
    secondary: { bg: 'bg-secondary-container/20', text: 'text-secondary' },
    tertiary: { bg: 'bg-tertiary-container/20', text: 'text-tertiary' },
    outline: { bg: 'bg-surface-variant', text: 'text-on-surface-variant' },
    error: { bg: 'bg-error-container/20', text: 'text-error' },
  };
  
  const c = colorMap[color] || colorMap.primary;

  return (
    <div 
      data-tour-id={tourId}
      onClick={() => {
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
        <h3 className="font-semibold text-on-surface break-words whitespace-pre-wrap leading-tight">{title}</h3>
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
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1.5 hover:bg-surface-variant text-on-surface-variant rounded-lg transition-all"
                title="Edit Transaction"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
            )}
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
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 text-on-surface-variant bg-surface-variant rounded-lg shrink-0"
              title="Edit Transaction"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
          )}
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
