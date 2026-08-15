import { useEffect, useMemo, useState } from 'react';
import { Calendar, Edit2, Mail, Phone, Plus, Target, UserRound, WalletCards, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons, type IconName } from '../icons';
import type { SavingsGoalType } from '../types';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';

type ManageDestination = 'Accounts' | 'Categories' | 'Sharing' | 'Goals';
type SupportingForm = 'category' | 'budget' | 'goal' | 'person-add' | 'person-edit' | null;

type PersonProfileDraft = {
  name: string;
  relationship: string;
  mobile: string;
  email: string;
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const contactKeyForName = (name: string) => `v35:person-contact:${name.trim().toLowerCase()}`;
const profileKeyForId = (id: string) => `v35:person-profile:${id}`;
const quickCategoryIcons: IconName[] = ['Utensils', 'ShoppingBag', 'Car', 'Home', 'Coffee', 'Film'];
const goalTypeFromIcon = (icon: IconName): SavingsGoalType => {
  if (icon === 'Plane') return 'TRAVEL';
  if (icon === 'GraduationCap') return 'EDUCATION';
  if (icon === 'Home') return 'HOME';
  if (icon === 'Car') return 'PURCHASE';
  if (icon === 'Heart') return 'EMERGENCY_FUND';
  return 'OTHER';
};
const quickGoalIcons: IconName[] = ['Car', 'Plane', 'Home', 'GraduationCap', 'Target'];

export function V35SupportingForms({ destination }: { destination: ManageDestination }) {
  const {
    categories,
    addCategory,
    updateCategory,
    getCurrencySymbol,
    savingsGoals,
    addSavingsGoal,
    people,
    addSharedPerson,
    getStoredSetting,
    setStoredSetting,
  } = useAppContext();

  const [activeForm, setActiveForm] = useState<SupportingForm>(null);

  const expenseCategories = useMemo(
    () => categories.filter(category => (category.type ?? 'expense') !== 'income'),
    [categories],
  );
  const editablePeople = useMemo(
    () => people.filter(person => !person.isSelf && !person.isArchived),
    [people],
  );

  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const [categoryIcon, setCategoryIcon] = useState<IconName>('Utensils');

  const [budgetCategoryId, setBudgetCategoryId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState('Monthly');
  const [budgetStartDate, setBudgetStartDate] = useState(todayKey());

  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [goalIcon, setGoalIcon] = useState<IconName>('Car');
  const [goalSaving, setGoalSaving] = useState(false);

  const [personName, setPersonName] = useState('');
  const [personMobile, setPersonMobile] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [personRelationship, setPersonRelationship] = useState('');
  const [personSaving, setPersonSaving] = useState(false);

  const [editPersonId, setEditPersonId] = useState('');
  const [editDraft, setEditDraft] = useState<PersonProfileDraft>({ name: '', relationship: '', mobile: '', email: '' });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (!budgetCategoryId && expenseCategories[0]) setBudgetCategoryId(expenseCategories[0].id);
  }, [budgetCategoryId, expenseCategories]);

  useEffect(() => {
    if (!editPersonId && editablePeople[0]) setEditPersonId(editablePeople[0].id);
  }, [editPersonId, editablePeople]);

  useEffect(() => {
    if (activeForm !== 'person-edit' || !editPersonId) return;
    const person = editablePeople.find(item => item.id === editPersonId);
    if (!person) return;
    let cancelled = false;
    void (async () => {
      const savedProfile = await getStoredSetting(profileKeyForId(person.id)) as Partial<PersonProfileDraft> | undefined;
      const savedContact = await getStoredSetting(contactKeyForName(person.name)) as Partial<PersonProfileDraft> | undefined;
      if (cancelled) return;
      setEditDraft({
        name: savedProfile?.name ?? person.name,
        relationship: savedProfile?.relationship ?? person.relationship ?? '',
        mobile: savedProfile?.mobile ?? savedContact?.mobile ?? '',
        email: savedProfile?.email ?? savedContact?.email ?? '',
      });
    })();
    return () => { cancelled = true; };
  }, [activeForm, editPersonId, editablePeople, getStoredSetting]);

  const close = () => setActiveForm(null);

  const saveCategory = () => {
    const name = categoryName.trim();
    if (!name) return;
    addCategory({
      name,
      icon: categoryIcon,
      type: categoryType,
      budget: 0,
      isRollover: false,
      affordabilityClass: categoryType === 'income' ? 'NORMAL' : 'NORMAL',
    });
    setCategoryName('');
    setCategoryType('expense');
    setCategoryIcon('Utensils');
    close();
  };

  const saveBudget = async () => {
    const category = categories.find(item => item.id === budgetCategoryId);
    const amount = Math.max(0, Number(budgetAmount) || 0);
    if (!category || amount <= 0) return;
    updateCategory(category.id, {
      name: category.name,
      icon: category.icon,
      budget: amount,
      isRollover: category.isRollover,
      rolloverAccountId: category.rolloverAccountId,
      tags: category.tags,
      group: category.group,
      affordabilityClass: category.affordabilityClass,
      type: category.type,
    });
    await setStoredSetting(`v35:budget-meta:${category.id}`, { period: budgetPeriod, startDate: budgetStartDate });
    setBudgetAmount('');
    close();
  };

  const saveGoal = async () => {
    if (goalSaving || !goalName.trim() || Number(goalAmount) <= 0) return;
    setGoalSaving(true);
    const saved = await addSavingsGoal({
      name: goalName.trim(),
      type: goalTypeFromIcon(goalIcon),
      targetAmount: Math.abs(Number(goalAmount)),
      targetDate: goalDate || undefined,
      monthlyContribution: 0,
      manualSavedAmount: 0,
      protectLinkedBalance: false,
      priority: 'MEDIUM',
      isActive: true,
    });
    setGoalSaving(false);
    if (saved) {
      setGoalName('');
      setGoalAmount('');
      setGoalDate('');
      setGoalIcon('Car');
      close();
    }
  };

  const savePerson = async () => {
    if (personSaving || !personName.trim()) return;
    setPersonSaving(true);
    const ok = await addSharedPerson(personName.trim(), personRelationship.trim() || undefined);
    if (ok) {
      await setStoredSetting(contactKeyForName(personName), { mobile: personMobile.trim(), email: personEmail.trim() });
      setPersonName('');
      setPersonMobile('');
      setPersonEmail('');
      setPersonRelationship('');
      close();
    }
    setPersonSaving(false);
  };

  const savePersonProfile = async () => {
    if (editSaving || !editPersonId || !editDraft.name.trim()) return;
    setEditSaving(true);
    await setStoredSetting(profileKeyForId(editPersonId), {
      name: editDraft.name.trim(),
      relationship: editDraft.relationship.trim(),
      mobile: editDraft.mobile.trim(),
      email: editDraft.email.trim(),
    });
    setEditSaving(false);
    close();
  };

  const showCategoryActions = destination === 'Categories';
  const showGoalAction = destination === 'Goals';
  const showPeopleActions = destination === 'Sharing';

  return (
    <>
      {(showCategoryActions || showGoalAction || showPeopleActions) ? (
        <div data-testid="v35-supporting-form-actions" className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {showCategoryActions ? (
            <>
              <button type="button" onClick={() => setActiveForm('category')} className="v35-focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-white"><Plus className="h-4 w-4" /> Add category</button>
              <button type="button" onClick={() => setActiveForm('budget')} className="v35-focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3.5 text-xs font-semibold text-primary hover:bg-primary/15"><WalletCards className="h-4 w-4" /> Add budget</button>
            </>
          ) : null}
          {showGoalAction ? (
            <button type="button" onClick={() => setActiveForm('goal')} className="v35-focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-white"><Target className="h-4 w-4" /> Add goal</button>
          ) : null}
          {showPeopleActions ? (
            <>
              <button type="button" onClick={() => setActiveForm('person-add')} className="v35-focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-white"><Plus className="h-4 w-4" /> Add person</button>
              <button type="button" disabled={editablePeople.length === 0} onClick={() => setActiveForm('person-edit')} className="v35-focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-outline-variant/35 bg-surface-container-low px-3.5 text-xs font-semibold text-on-surface disabled:cursor-not-allowed disabled:opacity-45"><Edit2 className="h-4 w-4" /> Edit person</button>
            </>
          ) : null}
        </div>
      ) : null}

      {activeForm === 'category' ? (
        <V35ModalFrame size="sm" testId="category-create-sheet" labelledBy="category-create-title" panelClassName="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><h2 id="category-create-title" className="text-lg font-semibold text-on-surface">Add Category</h2><p className="mt-1 text-xs text-on-surface-variant">Add or edit category</p></div><button type="button" aria-label="Close add category form" onClick={close} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button></div>
          <div className="mt-5">
            <span className="v35-form-label">Icon &amp; Color</span>
            <div className="mt-2 flex flex-wrap gap-2">{quickCategoryIcons.map(iconName => { const Icon = icons[iconName]; const selected = categoryIcon === iconName; return <button key={iconName} type="button" aria-label={`Category icon ${iconName}`} onClick={() => setCategoryIcon(iconName)} className={`flex h-9 w-9 items-center justify-center rounded-lg border ${selected ? 'border-primary bg-primary text-white' : 'border-outline-variant/30 bg-surface-container-low text-on-surface-variant'}`}><Icon className="h-4 w-4" /></button>; })}</div>
          </div>
          <label className="mt-4 block"><span className="v35-form-label">Category Name</span><input aria-label="New category name" value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="Food & Dining" className="mt-1.5 w-full" /></label>
          <div className="mt-4"><span className="v35-form-label">Type</span><div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-outline-variant/30 bg-surface-container-low p-1"><button type="button" onClick={() => setCategoryType('expense')} className={`min-h-9 rounded-md text-xs font-semibold ${categoryType === 'expense' ? 'bg-rose-500/15 text-rose-400' : 'text-on-surface-variant'}`}>Expense</button><button type="button" onClick={() => setCategoryType('income')} className={`min-h-9 rounded-md text-xs font-semibold ${categoryType === 'income' ? 'bg-emerald-500/15 text-emerald-400' : 'text-on-surface-variant'}`}>Income</button></div></div>
          <button type="button" onClick={saveCategory} disabled={!categoryName.trim()} className="mt-5 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">Save Category</button>
        </V35ModalFrame>
      ) : null}

      {activeForm === 'budget' ? (
        <V35ModalFrame size="sm" testId="budget-form-sheet" labelledBy="budget-form-title" panelClassName="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><h2 id="budget-form-title" className="text-lg font-semibold text-on-surface">Add Budget</h2><p className="mt-1 text-xs text-on-surface-variant">Set monthly budget</p></div><button type="button" aria-label="Close budget form" onClick={close} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button></div>
          <div className="mt-5 space-y-4">
            <label className="block"><span className="v35-form-label">Category</span><select aria-label="Budget category" value={budgetCategoryId} onChange={event => setBudgetCategoryId(event.target.value)} className="mt-1.5 w-full">{expenseCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="block"><span className="v35-form-label">Budget Amount</span><div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">{getCurrencySymbol()}</span><CurrencyInput aria-label="Budget amount" value={budgetAmount} onValueChange={setBudgetAmount} className="w-full pl-8" /></div></label>
            <label className="block"><span className="v35-form-label">Period</span><select aria-label="Budget period" value={budgetPeriod} onChange={event => setBudgetPeriod(event.target.value)} className="mt-1.5 w-full"><option>Monthly</option><option>Financial cycle</option></select></label>
            <label className="block"><span className="v35-form-label">Start Date</span><div className="relative mt-1.5"><input aria-label="Budget start date" type="date" value={budgetStartDate} onChange={event => setBudgetStartDate(event.target.value)} className="w-full pr-10" /><Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /></div></label>
          </div>
          <button type="button" onClick={() => void saveBudget()} className="mt-5 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white">Save Budget</button>
        </V35ModalFrame>
      ) : null}

      {activeForm === 'goal' ? (
        <V35ModalFrame size="sm" testId="goal-create-sheet" labelledBy="goal-create-title" panelClassName="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><h2 id="goal-create-title" className="text-lg font-semibold text-on-surface">Add Goal</h2><p className="mt-1 text-xs text-on-surface-variant">Create a new financial goal</p></div><button type="button" aria-label="Close add goal form" onClick={close} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button></div>
          <div className="mt-5 space-y-4">
            <label className="block"><span className="v35-form-label">Goal Name</span><input aria-label="New goal name" value={goalName} onChange={event => setGoalName(event.target.value)} placeholder="Dream Car 🚙" className="mt-1.5 w-full" /></label>
            <label className="block"><span className="v35-form-label">Target Amount</span><div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">{getCurrencySymbol()}</span><CurrencyInput aria-label="Goal target amount" value={goalAmount} onValueChange={setGoalAmount} className="w-full pl-8" /></div></label>
            <label className="block"><span className="v35-form-label">Target Date</span><input aria-label="Goal target date" type="date" value={goalDate} onChange={event => setGoalDate(event.target.value)} className="mt-1.5 w-full" /></label>
            <div><span className="v35-form-label">Icon</span><div className="mt-2 flex gap-2">{quickGoalIcons.map(iconName => { const Icon = icons[iconName]; const selected = goalIcon === iconName; return <button key={iconName} type="button" aria-label={`Goal icon ${iconName}`} onClick={() => setGoalIcon(iconName)} className={`flex h-9 w-9 items-center justify-center rounded-lg border ${selected ? 'border-primary bg-primary text-white' : 'border-outline-variant/30 bg-surface-container-low text-on-surface-variant'}`}><Icon className="h-4 w-4" /></button>; })}</div></div>
          </div>
          <button type="button" disabled={goalSaving || !goalName.trim() || Number(goalAmount) <= 0} onClick={() => void saveGoal()} className="mt-5 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{goalSaving ? 'Creating…' : 'Create Goal'}</button>
        </V35ModalFrame>
      ) : null}

      {activeForm === 'person-add' ? (
        <V35ModalFrame size="sm" testId="person-form-sheet" labelledBy="person-form-title" panelClassName="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><h2 id="person-form-title" className="text-lg font-semibold text-on-surface">Add Person</h2><p className="mt-1 text-xs text-on-surface-variant">Add person for sharing</p></div><button type="button" aria-label="Close person form" onClick={close} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button></div>
          <div className="mt-5 space-y-4">
            <label className="block"><span className="v35-form-label">Name</span><input aria-label="Person full name" value={personName} onChange={event => setPersonName(event.target.value)} placeholder="Rohan (Brother)" className="mt-1.5 w-full" /></label>
            <label className="block"><span className="v35-form-label">Mobile (optional)</span><div className="relative mt-1.5"><Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /><input aria-label="Person mobile" value={personMobile} onChange={event => setPersonMobile(event.target.value)} placeholder="+91 98765 43210" className="w-full pl-9" /></div></label>
            <label className="block"><span className="v35-form-label">Email (optional)</span><div className="relative mt-1.5"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /><input aria-label="Person email" type="email" value={personEmail} onChange={event => setPersonEmail(event.target.value)} placeholder="rohan@example.com" className="w-full pl-9" /></div></label>
            <label className="block"><span className="v35-form-label">Relationship</span><input aria-label="Person relationship" value={personRelationship} onChange={event => setPersonRelationship(event.target.value)} placeholder="Brother" className="mt-1.5 w-full" /></label>
          </div>
          <button type="button" disabled={personSaving || !personName.trim()} onClick={() => void savePerson()} className="mt-5 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{personSaving ? 'Adding…' : 'Add Person'}</button>
        </V35ModalFrame>
      ) : null}

      {activeForm === 'person-edit' ? (
        <V35ModalFrame size="sm" testId="person-edit-sheet" labelledBy="person-edit-title" panelClassName="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><h2 id="person-edit-title" className="text-lg font-semibold text-on-surface">Edit Person</h2><p className="mt-1 text-xs text-on-surface-variant">Update person details</p></div><button type="button" aria-label="Close edit person form" onClick={close} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button></div>
          <div className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--cb-form-purple)] text-xl font-semibold text-white"><UserRound className="h-6 w-6" /></div>
          <div className="mt-4 space-y-4">
            <label className="block"><span className="v35-form-label">Person</span><select aria-label="Person to edit" value={editPersonId} onChange={event => setEditPersonId(event.target.value)} className="mt-1.5 w-full">{editablePeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="block"><span className="v35-form-label">Name</span><input aria-label="Edit person name" value={editDraft.name} onChange={event => setEditDraft(current => ({ ...current, name: event.target.value }))} className="mt-1.5 w-full" /></label>
            <label className="block"><span className="v35-form-label">Mobile</span><input aria-label="Edit person mobile" value={editDraft.mobile} onChange={event => setEditDraft(current => ({ ...current, mobile: event.target.value }))} className="mt-1.5 w-full" /></label>
            <label className="block"><span className="v35-form-label">Relationship</span><input aria-label="Edit person relationship" value={editDraft.relationship} onChange={event => setEditDraft(current => ({ ...current, relationship: event.target.value }))} className="mt-1.5 w-full" /></label>
          </div>
          <button type="button" disabled={editSaving || !editDraft.name.trim()} onClick={() => void savePersonProfile()} className="mt-5 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{editSaving ? 'Saving…' : 'Save Changes'}</button>
        </V35ModalFrame>
      ) : null}

      <span className="sr-only" aria-live="polite">{savingsGoals.length} goals available</span>
    </>
  );
}
