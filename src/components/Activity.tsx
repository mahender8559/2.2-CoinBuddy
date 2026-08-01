import { useState, useMemo } from 'react';
import { Search, Filter, ShieldCheck, Sparkles, Database, Utensils, Banknote, Car, Briefcase, ShoppingBag, Plus, Zap, Home, Trash2, Check, X, ArrowRightLeft } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';


export function Activity() {
  const { transactions, formatCurrency, setAddModalOpen, categories, deleteTransaction, setEditingTransaction, getCycleDetails, accounts } = useAppContext();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'All' | 'Income' | 'Expense' | 'Transfer'>('All');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('All');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    selectedIds.forEach(id => deleteTransaction(id));
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
    return Array.from(cyclesMap.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [transactions, getCycleDetails]);

  const [selectedCycle, setSelectedCycle] = useState<string>(
    getCycleDetails(new Date().toISOString()).key
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = tx.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            tx.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategoryFilter 
        ? tx.category === `#${categories.find(c => c.id === selectedCategoryFilter)?.name.toLowerCase().replace(/\s+/g, '')}` ||
          tx.category === selectedCategoryFilter
        : true;
        
      const matchesCycle = getCycleDetails(tx.date).key === selectedCycle;

      const matchesType = selectedTypeFilter === 'All' ? true : tx.type.toLowerCase() === selectedTypeFilter.toLowerCase();
      
      const matchesAccount = selectedAccountFilter === 'All' 
        ? true 
        : tx.account === selectedAccountFilter || tx.fromAccountId === selectedAccountFilter || tx.toAccountId === selectedAccountFilter;

      return matchesSearch && matchesCategory && matchesCycle && matchesType && matchesAccount;
    });
  }, [transactions, searchQuery, selectedCategoryFilter, categories, selectedCycle, getCycleDetails, selectedTypeFilter, selectedAccountFilter]);

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

      {/* Type Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {['All', 'Income', 'Expense', 'Transfer'].map(type => (
          <button
            key={type}
            onClick={() => setSelectedTypeFilter(type as any)}
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
        <div className="relative flex-grow w-full md:w-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
          <input 
            type="text" 
            placeholder="Search transactions..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-container border border-outline-variant/30 rounded-2xl py-3.5 pl-12 pr-4 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div>
        
        <div className="flex gap-3 w-full md:w-auto">
          <select 
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
            className="bg-surface-container py-3.5 px-4 rounded-2xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors shrink-0 text-on-surface focus:outline-none focus:border-primary/50 flex-1 md:flex-none"
          >
            {availableCycles.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>

          <select 
            value={selectedCategoryFilter || ''}
            onChange={(e) => setSelectedCategoryFilter(e.target.value || null)}
            className="bg-surface-container py-3.5 px-4 rounded-2xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors shrink-0 text-on-surface focus:outline-none focus:border-primary/50 flex-1 md:flex-none"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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
            {filteredTransactions.map(tx => {
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
                  onDelete={() => deleteTransaction(tx.id)}
                  onEdit={() => {
                    setEditingTransaction(tx);
                    setAddModalOpen(true);
                  }}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(tx.id)}
                  onToggleSelect={() => toggleSelection(tx.id)}
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
        <div className="fixed bottom-24 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[400px] bg-surface-container-highest rounded-2xl p-4 shadow-2xl z-50 flex items-center justify-between border border-outline-variant/30">
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
      <button 
        onClick={() => setAddModalOpen(true)}
        className="fixed bottom-20 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}

function TransactionRow({ icon: Icon, title, subtitle, amount, tag, color, isIncome = false, isTransfer = false, onDelete, onEdit, isSelectionMode, isSelected, onToggleSelect }: any) {
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
      onClick={() => {
        if (isSelectionMode) onToggleSelect();
        else onEdit();
      }}
      className={`bg-surface-container-low hover:bg-surface-container transition-colors p-4 rounded-2xl flex items-center gap-4 cursor-pointer border ${isSelected ? 'border-primary' : 'border-transparent'} hover:border-outline-variant/30 group`}
    >
      {isSelectionMode && (
        <div className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-outline-variant/50'}`}>
          {isSelected && <Check className="w-4 h-4 text-on-primary" />}
        </div>
      )}
      <div className={`w-12 h-12 rounded-full ${c.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-6 h-6 ${c.text}`} />
      </div>
      <div className="flex-grow min-w-0">
        <h3 className="font-semibold text-on-surface truncate">{title}</h3>
        <p className="text-xs text-on-surface-variant truncate">{subtitle}</p>
      </div>
      <div className="text-right shrink-0 flex items-center gap-3">
        <div className="text-right">
          <p className={`font-bold font-numeric ${isIncome ? 'text-primary' : 'text-on-surface'}`}>{isIncome ? '+' : ''}{amount}</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] bg-surface-variant text-on-surface-variant font-bold uppercase tracking-wider">{typeof tag === 'string' ? tag.replace(/^#/, '') : tag}</span>
        </div>
        {!isSelectionMode && (
          <div className="flex gap-1 shrink-0 hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity">
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
          </div>
        )}
      </div>
      {/* Mobile visible delete and edit */}
      {!isSelectionMode && (
        <div className="flex flex-col gap-1 md:hidden">
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
        </div>
      )}
    </div>
  );
}
