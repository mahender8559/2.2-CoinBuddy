import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Edit2, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';
import type { AffordabilityClass, Category } from '../types';
import { getCategorySpend } from '../utils/budget';
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
  const [icon, setIcon] = useState<keyof typeof icons>('ShoppingBag');
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

  const resetDraft = () => {
    setEditing(null);
    setName('');
    setIcon('ShoppingBag');
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
    setIcon(category.icon as keyof typeof icons);
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
      icon,
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
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm md:items-center md:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="category-form-title" className="v35-surface max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl p-5 md:max-w-md md:rounded-2xl md:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 id="category-form-title" className="text-xl font-semibold text-on-surface">{editing ? 'Edit category' : 'Add category'}</h2><p className="mt-1 text-sm text-on-surface-variant">Define how this category behaves in budgets and planning.</p></div><button type="button" aria-label="Close category form" onClick={() => setModalOpen(false)} className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 space-y-4">
              <label className="block"><span className="text-sm font-semibold text-on-surface">Category name</span><input aria-label="Category name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Groceries" className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-on-surface outline-none focus:border-primary/70" /></label>
              <div><span className="text-sm font-semibold text-on-surface">Category type</span><div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl border border-outline-variant/30 bg-surface-container-low p-1"><button type="button" onClick={() => setType('expense')} className={`v35-focus-ring min-h-10 rounded-lg text-xs font-semibold ${type === 'expense' ? 'bg-primary text-white' : 'text-on-surface-variant'}`}>Expense</button><button type="button" onClick={() => setType('income')} className={`v35-focus-ring min-h-10 rounded-lg text-xs font-semibold ${type === 'income' ? 'bg-primary text-white' : 'text-on-surface-variant'}`}>Income</button></div></div>
              <label className="block"><span className="text-sm font-semibold text-on-surface">Icon</span><div className="mt-1.5 flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{(() => { const Selected = icons[icon] || ShoppingBag; return <Selected className="h-5 w-5" />; })()}</span><select aria-label="Category icon" value={icon} onChange={event => setIcon(event.target.value as keyof typeof icons)} className="v35-focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface">{Object.keys(icons).sort().map(iconName => <option key={iconName} value={iconName}>{iconName}</option>)}</select></div></label>
              {type === 'expense' ? <>
                <label className="block"><span className="text-sm font-semibold text-on-surface">Financial behavior</span><select aria-label="Financial behavior" value={behavior} onChange={event => setBehavior(event.target.value as AffordabilityClass)} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none focus:border-primary/70">{Object.entries(BEHAVIOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="mt-1.5 block text-xs leading-5 text-on-surface-variant">This controls how affordability planning protects, estimates or flexes the category.</span></label>
                <label className="block"><span className="text-sm font-semibold text-on-surface">Cycle budget</span><div className="relative mt-1.5"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">{getCurrencySymbol()}</span><CurrencyInput aria-label="Category budget" value={budget || ''} onValueChange={value => setBudget(Number(value) || 0)} className="w-full rounded-xl border border-outline-variant/30 bg-surface-container py-3 pl-8 pr-4 font-numeric text-on-surface outline-none focus:border-primary/70" /></div></label>
                <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3"><span><span className="block text-sm font-semibold text-on-surface">Rollover unused budget</span><span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">Carry unused budget behavior into the next cycle using the existing CoinBuddy rollover logic.</span></span><input type="checkbox" checked={rollover} onChange={event => setRollover(event.target.checked)} className="mt-1 h-5 w-5 accent-primary" /></label>
              </> : <div className="rounded-xl bg-[var(--cb-green-soft)] p-3 text-xs leading-5 text-on-surface-variant">Income categories do not need a spending budget or affordability behavior.</div>}
              <button type="button" onClick={save} disabled={!name.trim()} className="v35-focus-ring w-full rounded-xl bg-primary py-3.5 font-semibold text-white disabled:opacity-50">Save category</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
