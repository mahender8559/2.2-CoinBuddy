import { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Trash2, Utensils, Car, Briefcase, Zap, Home, ShoppingBag, Banknote, Edit2, ShieldCheck, Plus, Search, GraduationCap, Target, Heart, Plane, Code, Smartphone, Coffee, Music, Film, Book, Camera, Droplet, Sun, Moon, Map, Activity, Gift, Crosshair, MapPin } from 'lucide-react';
import { AffordabilityClass, Category } from '../types';
import { icons } from '../icons';
import { Cards } from './Cards';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';
import { getCategorySpend } from '../utils/budget';
import { CurrencyInput } from './CurrencyInput';
import { GoalsPanel } from './GoalsPanel';
import { SharingPanel } from './SharingPanel';


export function ManageFinances() {
  const { categories, accounts, addCategory, updateCategory, deleteCategory, formatCurrency, transactions, getCurrencySymbol, isDateInCurrentCycle, isManageCategoriesOpen, setManageCategoriesOpen } = useAppContext();
  
  const [mainTab, setMainTab] = useState<'Accounts' | 'Categories' | 'Sharing'>(() => isManageCategoriesOpen ? 'Categories' : 'Accounts');
  const mainTabSwipe = useHorizontalSwipe(() => {
    setMainTab(current => current === 'Accounts' ? 'Categories' : current === 'Categories' ? 'Sharing' : 'Accounts');
  });

  useEffect(() => {
    if (isManageCategoriesOpen) {
      setMainTab('Categories');
      setManageCategoriesOpen(false);
    }
  }, [isManageCategoriesOpen, setManageCategoriesOpen]);

  useEffect(() => {
    const handleOpenModal = () => {
      setMainTab('Categories');
      setEditingId(null);
      setEditName('');
      setEditIcon('ShoppingBag');
      setEditType('expense');
      setEditAffordabilityClass('NORMAL');
      setEditBudget(0);
      setEditIsRollover(false);
      setIsEditingModalOpen(true);
    };
    document.addEventListener('openAddCategoryModal', handleOpenModal);
    return () => document.removeEventListener('openAddCategoryModal', handleOpenModal);
  }, []);
  const [activeTab, setActiveTab] = useState<'Categories' | 'Goals'>('Categories');
  const [searchQuery, setSearchQuery] = useState('');

  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState<keyof typeof icons>('ShoppingBag');
  const [editType, setEditType] = useState<'expense' | 'income'>('expense');
  const [editAffordabilityClass, setEditAffordabilityClass] = useState<AffordabilityClass>('NORMAL');
  const [editBudget, setEditBudget] = useState(0);
  const [editIsRollover, setEditIsRollover] = useState(false);
  const [filterType, setFilterType] = useState<'All' | 'expense' | 'income'>('All');

  const totalMonthlyBudget = categories
    .filter(c => c.type !== 'income' && c.affordabilityClass !== 'SAVINGS' && c.group !== 'Savings')
    .reduce((acc, c) => acc + (c.budget || 0), 0);

  const displayedItems = categories.filter(c => {
    if (filterType !== 'All' && (c.type || 'expense') !== filterType) return false;
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getSpent = (catId: string, catName: string) => {
    const category = categories.find(item => item.id === catId || item.name === catName);
    return category ? getCategorySpend(category, transactions, isDateInCurrentCycle) : 0;
  };



  const handleEdit = (c: Category) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditIcon(c.icon as keyof typeof icons);
    setEditType(c.type || 'expense');
    setEditAffordabilityClass(c.affordabilityClass ?? (c.group === 'Savings' ? 'SAVINGS' : c.group === 'Leisure' ? 'FLEXIBLE' : 'NORMAL'));
    setEditBudget(c.budget || 0);
    setEditIsRollover(Boolean(c.isRollover));
    setIsEditingModalOpen(true);
  };

  const saveCategory = () => {
    if (!editName) return;
    const categoryType = editType;
    const finalBudget = categoryType === 'income' ? 0 : editBudget;
    const affordabilityClass: AffordabilityClass = categoryType === 'income' ? 'NORMAL' : editAffordabilityClass;
    if (editingId) {
      const existing = categories.find(category => category.id === editingId);
      updateCategory(editingId, { name: editName, icon: editIcon, type: categoryType, budget: finalBudget, isRollover: categoryType === 'expense' && editIsRollover, rolloverAccountId: undefined, tags: existing?.tags, affordabilityClass });
    } else {
      addCategory({ name: editName, icon: editIcon, type: categoryType, budget: finalBudget, isRollover: categoryType === 'expense' && editIsRollover, rolloverAccountId: undefined, affordabilityClass });
    }
    setIsEditingModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-safe touch-pan-y" {...mainTabSwipe}>
      
      {/* Top Segmented Control matching the mockup */}
      <div className="flex justify-center mb-8">
        <div className="flex bg-surface-container rounded-xl p-1 w-full max-w-sm border border-outline-variant/30">
          <button 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors ${mainTab === 'Accounts' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
            onClick={() => setMainTab('Accounts')}
          >
            Accounts
          </button>
          <button 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors ${mainTab === 'Categories' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
            onClick={() => setMainTab('Categories')}
          >
            Categories
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors ${mainTab === 'Sharing' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
            onClick={() => setMainTab('Sharing')}
          >
            Sharing
          </button>
        </div>
      </div>

      {mainTab === 'Accounts' ? (
        <Cards />
      ) : mainTab === 'Sharing' ? (
        <SharingPanel />
      ) : (
        <>
          <div className="mb-8 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold text-primary-container-on">Categories & Goals</h1>
          </div>

          {activeTab === 'Categories' && (
          <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/30 flex justify-between items-center">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">TOTAL MONTHLY BUDGET</p>
              <h2 className="text-4xl text-primary font-numeric font-bold">{formatCurrency(totalMonthlyBudget)}</h2>
            </div>
          </div>
          )}

      <div className="flex bg-surface-container rounded-xl p-1">
        <button 
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'Categories' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setActiveTab('Categories')}
        >
          Categories
        </button>
        <button 
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'Goals' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setActiveTab('Goals')}
        >
          Goals
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
        <input 
          type="text" 
          placeholder={`Filter ${activeTab.toLowerCase()}...`}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-surface-container border border-outline-variant/30 rounded-xl py-3 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      {activeTab === 'Categories' && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between pb-2">
          <div className="flex bg-surface-container p-1 rounded-xl border border-outline-variant/30 shrink-0">
            {(['All', 'expense', 'income'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${filterType === type ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                {type === 'expense' ? 'Expenses' : type === 'income' ? 'Income' : 'All Types'}
              </button>
            ))}
          </div>

        </div>
      )}

      {activeTab === 'Categories' ? (
        <div className="space-y-4">
          {displayedItems.map(c => {
            const Icon = icons[c.icon as keyof typeof icons] || ShoppingBag;
            const currentAmount = getSpent(c.id, c.name);
            const target = c.budget || 0;
            const percent = target > 0 ? Math.min(100, (currentAmount / target) * 100) : 0;
            return (
              <div key={c.id} className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/30">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center shrink-0"><Icon className="w-6 h-6 text-on-surface-variant" /></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold text-on-surface text-lg">{c.name}</h3>{c.type === 'income' && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Income</span>}</div>
                      {c.tags && c.tags.length > 0 && <p className="text-xs text-on-surface-variant font-mono">{c.tags.join(' ')}</p>}
                      {c.type !== 'income' && <span className="inline-flex mt-1 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full">{(c.affordabilityClass ?? (c.group === 'Savings' ? 'SAVINGS' : c.group === 'Leisure' ? 'FLEXIBLE' : 'NORMAL')).toLowerCase().replace('_', ' ')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0"><button aria-label={`Edit ${c.name}`} onClick={() => handleEdit(c)} className="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-on-surface transition-colors"><Edit2 className="w-4 h-4" /></button><button aria-label={`Delete ${c.name}`} onClick={() => deleteCategory(c.id)} className="p-2 hover:bg-error/10 rounded-lg text-on-surface-variant hover:text-error transition-colors"><Trash2 className="w-4 h-4" /></button></div>
                </div>
                {c.type === 'income' ? (
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/10"><span className="text-xs font-semibold text-emerald-500/90">Income Category</span><span className="text-xs text-on-surface-variant/70">No budget limit</span></div>
                ) : (
                  <div><p className="text-xs font-semibold text-on-surface-variant mb-1">Budget</p><div className="flex items-end justify-between mb-2 gap-3"><div className="text-primary font-bold font-numeric text-lg">{formatCurrency(target)} <span className="text-xs text-on-surface-variant font-normal">/mo</span></div><div className="w-32 h-1.5 bg-surface-container-highest rounded-full overflow-hidden flex"><div className="bg-primary h-full rounded-full transition-all" style={{ width: `${percent}%` }} /></div></div></div>
                )}
              </div>
            );
          })}
          <button onClick={() => { setEditingId(null); setEditName(''); setEditIcon('ShoppingBag'); setEditType('expense'); setEditAffordabilityClass('NORMAL'); setEditBudget(0); setEditIsRollover(false); setIsEditingModalOpen(true); }} className="w-full bg-transparent border border-dashed border-outline-variant/50 hover:bg-surface-container-high hover:border-primary/50 text-on-surface font-semibold py-6 rounded-2xl transition-colors flex flex-col items-center justify-center gap-3 group"><div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center group-hover:bg-primary/20 transition-colors"><Plus className="w-5 h-5 group-hover:text-primary" /></div><span className="text-xs tracking-wider uppercase font-bold text-on-surface-variant group-hover:text-primary transition-colors">ADD CATEGORY</span></button>
        </div>
      ) : (
        <GoalsPanel searchQuery={searchQuery} />
      )}

      {activeTab === 'Categories' && isEditingModalOpen && (
        <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container-low w-full max-w-md rounded-3xl p-6 border border-outline-variant/30 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-on-surface">{editingId ? 'Edit' : 'Add'} Category</h2>
              <button 
                onClick={() => {
                  setIsEditingModalOpen(false);
                }}
                className="p-2 text-on-surface-variant hover:bg-surface-container-high rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {activeTab === 'Categories' && (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Category Type</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-surface-container rounded-xl border border-outline-variant/30">
                    <button
                      type="button"
                      onClick={() => setEditType('expense')}
                      className={`py-2.5 text-xs font-bold rounded-lg transition-all ${editType === 'expense' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                      Expense Category
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditType('income')}
                      className={`py-2.5 text-xs font-bold rounded-lg transition-all ${editType === 'income' ? 'bg-emerald-600 text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                      Income Category
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-on-surface-variant mb-1">Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary/50"
                  placeholder={editType === 'income' ? 'e.g. Freelance Income' : 'e.g. Groceries'}
                />
              </div>

              {activeTab === 'Categories' && editType === 'expense' && (
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-1">Financial behavior</label>
                  <select value={editAffordabilityClass} onChange={event => setEditAffordabilityClass(event.target.value as AffordabilityClass)} className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary/50">
                    <option value="COMMITTED">Committed — known obligations</option>
                    <option value="NORMAL">Normal spending — regular living costs</option>
                    <option value="FLEXIBLE">Flexible — can usually be reduced</option>
                    <option value="IRREGULAR">Irregular — unpredictable / unexpected</option>
                    <option value="SAVINGS">Savings — intentional saving or investing</option>
                  </select>
                  <p className="mt-1 text-xs text-on-surface-variant">Used by Can I Afford It? to distinguish commitments, flexible spending and unexpected costs.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-on-surface-variant mb-1">Icon</label>
                <div className="grid grid-cols-6 gap-2 max-h-[150px] overflow-y-auto p-2 bg-surface-container rounded-xl border border-outline-variant/30 scrollbar-hide">
                  {(Object.keys(icons) as Array<keyof typeof icons>).map(iconKey => {
                    const Icon = icons[iconKey];
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setEditIcon(iconKey)}
                        className={`p-2 rounded-lg flex items-center justify-center transition-colors ${editIcon === iconKey ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-variant'}`}
                      >
                        <Icon className="w-5 h-5" />
                      </button>
                    )
                  })}
                </div>
              </div>

              {editType !== 'income' && (
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-1">Monthly Budget</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">{getCurrencySymbol()}</span>
                    <CurrencyInput
                      value={editBudget || ''}
                      onValueChange={value => setEditBudget(Number(value) || 0)}
                      className="w-full bg-surface-container border border-outline-variant/30 rounded-xl pl-8 pr-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/50"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}
              {editType === 'expense' && (
                <label className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3 cursor-pointer">
                  <span><span className="block text-sm font-semibold text-on-surface">Carry unused budget forward</span><span className="block text-xs text-on-surface-variant mt-0.5">Add unused budget allowance to this category's next financial cycle. This does not move money between accounts.</span></span>
                  <input type="checkbox" checked={editIsRollover} onChange={event => setEditIsRollover(event.target.checked)} className="h-5 w-5 accent-primary" />
                </label>
              )}
              
              <button 
                onClick={saveCategory}
                className="w-full bg-primary text-on-primary font-bold py-4 rounded-xl mt-4 hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
              >
                Save Category
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
