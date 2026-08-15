import { useEffect, useMemo, useState } from 'react';
import { Calendar, Edit2, Mail, Phone, Plus, UserRound, WalletCards, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';

type ManageDestination = 'Accounts' | 'Categories' | 'Sharing' | 'Goals';
type SupportingForm = 'budget' | 'person-add' | 'person-edit' | null;

type PersonProfileDraft = {
  name: string;
  relationship: string;
  mobile: string;
  email: string;
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const contactKeyForName = (name: string) => `v35:person-contact:${name.trim().toLowerCase()}`;
const profileKeyForId = (id: string) => `v35:person-profile:${id}`;

export function V35SupportingForms({ destination }: { destination: ManageDestination }) {
  const {
    categories,
    updateCategory,
    getCurrencySymbol,
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

  const [budgetCategoryId, setBudgetCategoryId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState('Monthly');
  const [budgetStartDate, setBudgetStartDate] = useState(todayKey());

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
    await setStoredSetting(`v35:budget-meta:${category.id}`, {
      period: budgetPeriod,
      startDate: budgetStartDate,
    });
    close();
  };

  const savePerson = async () => {
    if (personSaving || !personName.trim()) return;
    setPersonSaving(true);
    const ok = await addSharedPerson(personName.trim(), personRelationship.trim() || undefined);
    if (ok) {
      await setStoredSetting(contactKeyForName(personName), {
        mobile: personMobile.trim(),
        email: personEmail.trim(),
      });
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

  const showBudgetAction = destination === 'Categories';
  const showPeopleActions = destination === 'Sharing';

  return (
    <>
      {(showBudgetAction || showPeopleActions) ? (
        <div data-testid="v35-supporting-form-actions" className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {showBudgetAction ? (
            <button type="button" onClick={() => setActiveForm('budget')} className="v35-focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3.5 text-xs font-semibold text-primary hover:bg-primary/15">
              <WalletCards className="h-4 w-4" /> Add budget
            </button>
          ) : null}
          {showPeopleActions ? (
            <>
              <button type="button" onClick={() => setActiveForm('person-add')} className="v35-focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-white">
                <Plus className="h-4 w-4" /> Add person
              </button>
              <button type="button" disabled={editablePeople.length === 0} onClick={() => setActiveForm('person-edit')} className="v35-focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-outline-variant/35 bg-surface-container-low px-3.5 text-xs font-semibold text-on-surface disabled:cursor-not-allowed disabled:opacity-45">
                <Edit2 className="h-4 w-4" /> Edit person
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {activeForm === 'budget' ? (
        <V35ModalFrame size="sm" testId="budget-form-sheet" labelledBy="budget-form-title" panelClassName="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="budget-form-title" className="text-lg font-semibold text-on-surface">Add Budget</h2>
              <p className="mt-1 text-xs text-on-surface-variant">Set a monthly budget for an expense category.</p>
            </div>
            <button type="button" aria-label="Close budget form" onClick={close} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block"><span className="v35-form-label">Category</span><select aria-label="Budget category" value={budgetCategoryId} onChange={event => setBudgetCategoryId(event.target.value)} className="mt-1.5 w-full">{expenseCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="block"><span className="v35-form-label">Budget Amount</span><div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">{getCurrencySymbol()}</span><CurrencyInput aria-label="Budget amount" value={budgetAmount} onValueChange={setBudgetAmount} className="w-full pl-8" /></div></label>
            <label className="block"><span className="v35-form-label">Period</span><select aria-label="Budget period" value={budgetPeriod} onChange={event => setBudgetPeriod(event.target.value)} className="mt-1.5 w-full"><option>Monthly</option><option>Financial cycle</option></select></label>
            <label className="block"><span className="v35-form-label">Start Date</span><div className="relative mt-1.5"><input aria-label="Budget start date" type="date" value={budgetStartDate} onChange={event => setBudgetStartDate(event.target.value)} className="w-full pr-10" /><Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /></div></label>
          </div>
          <button type="button" onClick={() => void saveBudget()} className="mt-5 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white">Save Budget</button>
        </V35ModalFrame>
      ) : null}

      {activeForm === 'person-add' ? (
        <V35ModalFrame size="sm" testId="person-form-sheet" labelledBy="person-form-title" panelClassName="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="person-form-title" className="text-lg font-semibold text-on-surface">Add Person</h2>
              <p className="mt-1 text-xs text-on-surface-variant">Add someone you share expenses or loans with.</p>
            </div>
            <button type="button" aria-label="Close person form" onClick={close} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button>
          </div>
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="person-edit-title" className="text-lg font-semibold text-on-surface">Edit Person</h2>
              <p className="mt-1 text-xs text-on-surface-variant">Update display and contact details without changing financial history.</p>
            </div>
            <button type="button" aria-label="Close edit person form" onClick={close} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-5 w-5" /></button>
          </div>
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
    </>
  );
}
