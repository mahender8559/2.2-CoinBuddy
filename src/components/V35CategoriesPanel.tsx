import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit2, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';
import type { AffordabilityClass, Category } from '../types';
import { getCategorySpend } from '../utils/budget';
import { selectCategoryIcon } from '../utils/categoryIcon';
import { CurrencyInput } from './CurrencyInput';
import { IconBadge, MoneyValue, StatusPill } from './ui/V35';

const BEHAVIOR_LABELS: Record<AffordabilityClass, string> = {
  COMMITTED: 'Committed',
  NORMAL: 'Normal',
  FLEXIBLE: 'Flexible',
  IRREGULAR: 'Irregular',
  SAVINGS: 'Savings',
};

const toneForBehavior = (behavior: AffordabilityClass): 'positive' | 'warning' | 'negative' | 'neutral' => {
  if (behavior === 'SAVINGS') return 'positive';
  if (behavior === 'IRREGULAR') return 'warning';
  if (behavior === 'COMMITTED') return 'negative';
  return 'neutral';
};

const defaultBehavior = (category: Category): AffordabilityClass => category.affordabilityClass ?? (category.group === 'Savings' ? 'SAVINGS' : category.group === 'Leisure' ? 'FLEXIBLE' : 'NORMAL');
const fieldClass = 'h-10 w-full rounded-lg border border-[#21334a] bg-[#101c2c] px-3 text-[12px] font-medium text-[#f5f7fb] outline-none transition placeholder:text-[#6f7e91] focus:border-[#0d6efd] focus:ring-1 focus:ring-[#0d6efd]';
const labelClass = 'mb-1.5 block text-[10.5px] font-medium text-[#cbd4e0]';

export function V35CategoriesPanel() {
  const {
    categories,
    transactions,
    personalExpenseRecords,
    addCategory,
    updateCategory,
    deleteCategory,
    formatCurrency,
    getCurrencySymbol,
    isDateInCurrentCycle,
  } = useAppContext();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'expense' | 'income'>('All');
  const [editing, setEditing] = useState<Category | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [behavior, setBehavior] = useState<AffordabilityClass>('NORMAL');
  const [budget, setBudget] = useState(0);
  const [rollover, setRollover] = useState(false);

  const expenseCategories = categories.filter(category => (category.type ?? 'expense') !== 'income');
  const totalBudget = expenseCategories.filter(category => defaultBehavior(category) !== 'SAVINGS').reduce((sum, category) => sum + Number(category.budget || 0), 0);
  const cycleSpend = expenseCategories.reduce((sum, category) => sum + getCategorySpend(category, transactions, isDateInCurrentCycle, personalExpenseRecords), 0);

  const visible = useMemo(() => categories.filter(category => {
    if (filter !== 'All' && (category.type ?? 'expense') !== filter) return false;
    if (search.trim() && !category.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const aIncome = (a.type ?? 'expense') === 'income';
    const bIncome = (b.type ?? 'expense') === 'income';
    if (aIncome !== bIncome) return aIncome ? 1 : -1;
    return a.name.localeCompare(b.name);
  }), [categories, filter, search]);

  const autoIcon = useMemo(() => selectCategoryIcon({
    name,
    type,
    categories,
    editingId: editing?.id,
    preferredIcon: editing?.icon,
  }), [categories, editing?.id, editing?.icon, name, type]);
  const AutoIcon = icons[autoIcon] || ShoppingBag;

  const resetDraft = () => {
    setEditing(null);
    setName('');
    setType('expense');
    setBehavior('NORMAL');
    setBudget(0);
    setRollover(false);
  };

  const openNew = () => {
    resetDraft();
    setModalOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setName(category.name);
    setType(category.type ?? 'expense');
    setBehavior(defaultBehavior(category));
    setBudget(Number(category.budget || 0));
    setRollover(Boolean(category.isRollover));
    setModalOpen(true);
  };

  useEffect(() => {
    const handler = () => openNew();
    document.addEventListener('openAddCategoryModal', handler);
    return () => document.removeEventListener('openAddCategoryModal', handler);
  }, []);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const payload = {
      name: trimmed,
      icon: autoIcon,
      type,
      budget: type === 'income' ? 0 : Math.max(0, budget),
      isRollover: type === 'expense' && rollover,
      rolloverAccountId: undefined,
      affordabilityClass: type === 'income' ? 'NORMAL' as AffordabilityClass : behavior,
      tags: editing?.tags,
    };
    if (editing) updateCategory(editing.id, payload);
    else addCategory(payload);
    setModalOpen(false);
    resetDraft();
  };

  return (
    <section data-testid="page-categories" className="w-full space-y-5 pb-24 md:pb-0 animate-fade-in">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">Categories</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">Keep budgets and affordability behavior organized without turning category management into another dashboard.</p>
        </div>
        <button type="button" aria-label="Add category" onClick={openNew} className="v35-focus-ring inline-flex min-h-11 self-start items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-[0_0_24px_rgba(76,141,255,.18)] sm:self-auto"><Plus className="h-4 w-4" /> Add category</button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
        <article className="v35-surface rounded-2xl p-4"><span className="text-xs text-on-surface-variant">Monthly budget</span><MoneyValue className="mt-2 block text-xl font-semibold text-on-surface">{formatCurrency(totalBudget)}</MoneyValue><p className="mt-1 text-[11px] text-on-surface-variant">Excludes Savings categories</p></article>
        <article className="v35-surface rounded-2xl p-4"><span className="text-xs text-on-surface-variant">Cycle spending</span><MoneyValue className="mt-2 block text-xl font-semibold text-[var(--cb-red)]">{formatCurrency(cycleSpend)}</MoneyValue><p className="mt-1 text-[11px] text-on-surface-variant">Personal economic spending</p></article>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-lg"><Search className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-on-surface-variant" /><input aria-label="Search categories" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search categories..." className="v35-focus-ring h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low pl-10 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/70" /></div>
        <div className="inline-flex self-start rounded-xl border border-outline-variant/25 bg-surface-container-low p-1">
          {(['All', 'expense', 'income'] as const).map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`v35-focus-ring min-h-9 rounded-lg px-3.5 text-xs font-semibold ${filter === value ? 'bg-primary text-white' : 'text-on-surface-variant hover:text-on-surface'}`}>{value === 'All' ? 'All' : value === 'expense' ? 'Expenses' : 'Income'}</button>)}
        </div>
      </div>

      <div className="v35-surface overflow-hidden rounded-2xl" data-testid="category-list">
        {visible.map((category, index) => {
          const Icon = icons[category.icon as keyof typeof icons] || ShoppingBag;
          const isIncome = (category.type ?? 'expense') === 'income';
          const spent = isIncome ? 0 : getCategorySpend(category, transactions, isDateInCurrentCycle, personalExpenseRecords);
          const target = Number(category.budget || 0);
          const pct = target > 0 ? Math.min(100, spent / target * 100) : 0;
          const behaviorValue = defaultBehavior(category);
          return (
            <article key={category.id} className={`px-4 py-4 sm:px-5 ${index < visible.length - 1 ? 'border-b border-outline-variant/20' : ''}`}>
              <div className="flex items-start gap-3">
                <IconBadge icon={Icon} tone={isIncome ? 'green' : behaviorValue === 'SAVINGS' ? 'purple' : behaviorValue === 'COMMITTED' ? 'amber' : 'blue'} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-on-surface sm:text-[15px]">{category.name}</h2>{isIncome ? <StatusPill tone="positive">Income</StatusPill> : <StatusPill tone={toneForBehavior(behaviorValue)}>{BEHAVIOR_LABELS[behaviorValue]}</StatusPill>}{category.isRollover ? <StatusPill>Rollover</StatusPill> : null}</div>
                  {isIncome ? <p className="mt-1 text-xs text-on-surface-variant">Income category · no budget limit</p> : (
                    <div className="mt-2">
                      <div className="flex items-center justify-between gap-3 text-xs"><span className="text-on-surface-variant"><MoneyValue>{formatCurrency(spent)}</MoneyValue> spent</span><span className="font-semibold text-on-surface">{target > 0 ? `${formatCurrency(target)} / cycle` : 'No budget set'}</span></div>
                      {target > 0 ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high"><div className={`h-full rounded-full ${pct >= 100 ? 'bg-[var(--cb-red)]' : pct >= 80 ? 'bg-[var(--cb-amber)]' : 'bg-primary'}`} style={{ width: `${pct}%` }} /></div> : null}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1"><button type="button" aria-label={`Edit ${category.name}`} onClick={() => openEdit(category)} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><Edit2 className="h-4 w-4" /></button><button type="button" aria-label={`Delete ${category.name}`} onClick={() => deleteCategory(category.id)} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error"><Trash2 className="h-4 w-4" /></button></div>
              </div>
            </article>
          );
        })}
        {visible.length === 0 ? <div className="px-5 py-10 text-center"><Search className="mx-auto h-5 w-5 text-on-surface-variant" /><p className="mt-3 text-sm font-semibold text-on-surface">No matching categories</p><p className="mt-1 text-xs text-on-surface-variant">Try another search or filter.</p></div> : null}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4"><IconBadge icon={ChevronRight} size="sm" /><div><p className="text-sm font-semibold text-on-surface">What financial behavior means</p><p className="mt-1 text-xs leading-5 text-on-surface-variant">Committed is protected first; Normal is regular living; Flexible can be reduced; Irregular is estimated from history; Savings is treated as a protected contribution.</p></div></div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 backdrop-blur-md md:items-center md:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="category-form-title" className="w-full overflow-hidden rounded-t-[18px] border border-[#31455f] bg-gradient-to-b from-[#0b1625] to-[#091321] shadow-2xl md:max-w-[286px] md:rounded-[18px]">
            <div className="flex h-[46px] items-center justify-between border-b border-[#21334a]/70 px-2.5">
              <button type="button" aria-label="Back from category form" onClick={() => setModalOpen(false)} className="v35-focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa8ba] hover:bg-[#132238]"><span aria-hidden="true" className="text-lg">‹</span></button>
              <h2 id="category-form-title" className="text-[12px] font-semibold text-white">{editing ? 'Edit Category' : 'Add Category'}</h2>
              <button type="button" aria-label="Close category form" onClick={() => setModalOpen(false)} className="v35-focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa8ba] hover:bg-[#132238]"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3 p-3.5">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="category-name" className="text-[10.5px] font-medium text-[#cbd4e0]">Category Name</label>
                  <span className="text-[9px] font-medium text-[#718096]">Icon auto-selected</span>
                </div>
                <div className="relative">
                  <span
                    data-testid="category-auto-icon"
                    data-icon-name={autoIcon}
                    aria-label={`Automatic icon: ${autoIcon}`}
                    className="pointer-events-none absolute left-2.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-primary/12 text-primary"
                  >
                    <AutoIcon className="h-3.5 w-3.5" />
                  </span>
                  <input id="category-name" aria-label="Category name" value={name} onChange={event => setName(event.target.value)} placeholder="Food & Dining" className={`${fieldClass} !pl-10`} />
                </div>
                <p className="mt-1 text-[9px] leading-4 text-[#718096]">CoinBuddy chooses a relevant unused icon from the category name and type.</p>
              </div>

              <div>
                <span className={labelClass}>Type</span>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => setType('expense')} aria-pressed={type === 'expense'} className={`h-8 rounded-lg border text-[10.5px] font-medium ${type === 'expense' ? 'border-red-500/45 bg-red-500/10 text-red-400' : 'border-[#21334a] bg-[#0f1b2b] text-[#8998ab]'}`}>⊖ Expense</button>
                  <button type="button" onClick={() => setType('income')} aria-pressed={type === 'income'} className={`h-8 rounded-lg border text-[10.5px] font-medium ${type === 'income' ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-400' : 'border-[#21334a] bg-[#0f1b2b] text-[#8998ab]'}`}>⊕ Income</button>
                </div>
              </div>

              {type === 'expense' ? (
                <details className="group rounded-lg border border-[#1f3046] bg-[#0d1827]">
                  <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between px-3 text-[10.5px] font-medium text-[#9aa8ba]">Budget & planning options <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary>
                  <div className="space-y-3 border-t border-[#1f3046] p-3">
                    <div>
                      <label className={labelClass}>Financial behavior</label>
                      <select aria-label="Financial behavior" value={behavior} onChange={event => setBehavior(event.target.value as AffordabilityClass)} className={fieldClass}>{Object.entries(BEHAVIOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    </div>
                    <div>
                      <label className={labelClass}>Cycle budget</label>
                      <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[#8b9aae]">{getCurrencySymbol()}</span><CurrencyInput aria-label="Category budget" value={budget || ''} onValueChange={value => setBudget(Number(value) || 0)} className={`${fieldClass} pl-7 font-numeric`} /></div>
                    </div>
                    <label className="flex items-center justify-between gap-3 text-[10.5px] text-[#cbd4e0]"><span>Rollover unused budget</span><input type="checkbox" checked={rollover} onChange={event => setRollover(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>
                  </div>
                </details>
              ) : null}

              <button type="button" onClick={save} disabled={!name.trim()} className="v35-focus-ring flex h-9 w-full items-center justify-center rounded-lg bg-gradient-to-b from-[#1677ff] to-[#0d60ee] text-[11px] font-semibold text-white disabled:opacity-50">{editing ? 'Save Changes' : 'Save Category'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
