import { useMemo, useState } from 'react';
import { Plus, Users, UserPlus, ReceiptText, WalletCards, Trash2, CircleDollarSign } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { getMyEconomicCost, getTrackedCashPaid, isObligationFunded } from '../domain/sharedFinances';

export function SharingPanel() {
  const {
    people, sharedObligations, sharedResponsibilities, sharedPayments,
    addSharedPerson, archiveSharedPerson, createSharedExpense,
    transactions, formatCurrency,
  } = useAppContext();
  const activePeople = people.filter(person => !person.isArchived);
  const me = activePeople.find(person => person.isSelf);
  const expenseTransactions = useMemo(() => transactions.filter(tx => tx.type === 'expense' && tx.is_verified !== 0 && !tx.isOpeningBalance), [transactions]);

  const [personName, setPersonName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [linkedTransactionId, setLinkedTransactionId] = useState('');
  const linkedTransaction = expenseTransactions.find(tx => tx.id === linkedTransactionId);
  const [title, setTitle] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [shares, setShares] = useState<Record<string, string>>({});
  const [externalPaid, setExternalPaid] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedTotal = Number(totalAmount || 0);
  const allocatedTotal = activePeople.reduce((sum, person) => sum + Number(shares[person.id] || 0), 0);

  const selectTransaction = (id: string) => {
    setLinkedTransactionId(id);
    const tx = expenseTransactions.find(item => item.id === id);
    if (!tx) return;
    setTitle(tx.title);
    const amount = Math.abs(Number(tx.amount));
    setTotalAmount(String(amount));
    if (me) setShares(current => ({ ...current, [me.id]: String(amount) }));
  };

  const splitEqually = () => {
    if (!selectedTotal || activePeople.length === 0) return;
    const cents = Math.round(selectedTotal * 100);
    const base = Math.floor(cents / activePeople.length);
    let remainder = cents - base * activePeople.length;
    const next: Record<string, string> = {};
    for (const person of activePeople) {
      const personCents = base + (remainder-- > 0 ? 1 : 0);
      next[person.id] = (personCents / 100).toFixed(2);
    }
    setShares(next);
  };

  const saveSharedExpense = async () => {
    setError('');
    if (!me) { setError('CoinBuddy could not identify the primary user.'); return; }
    if (!title.trim() || !selectedTotal || selectedTotal <= 0) { setError('Enter a title and total household amount.'); return; }
    if (Math.abs(allocatedTotal - selectedTotal) > 0.01) { setError('Responsibility shares must add up to the household total.'); return; }
    const allocations = activePeople
      .map(person => ({ personId: person.id, amount: Number(shares[person.id] || 0) }))
      .filter(item => item.amount > 0);
    if (!allocations.length) { setError('Assign the expense to at least one person.'); return; }
    const externalPayments = activePeople
      .filter(person => !person.isSelf)
      .map(person => ({ personId: person.id, amount: Number(externalPaid[person.id] || 0) }))
      .filter(item => item.amount > 0);
    const trackedPaymentAmount = linkedTransaction ? Math.abs(Number(linkedTransaction.amount)) : 0;
    if (trackedPaymentAmount + externalPayments.reduce((sum, item) => sum + item.amount, 0) > selectedTotal + 0.01) {
      setError('Recorded payments cannot exceed the household obligation total.'); return;
    }
    setSaving(true);
    const ok = await createSharedExpense({
      title: title.trim(), totalAmount: selectedTotal,
      transactionId: linkedTransactionId || undefined,
      allocations, trackedPaymentAmount, externalPayments,
    });
    setSaving(false);
    if (!ok) return;
    setLinkedTransactionId(''); setTitle(''); setTotalAmount(''); setShares({}); setExternalPaid({});
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-outline-variant/30 bg-surface-container p-5 sm:p-6">
        <div className="flex items-start gap-3"><Users className="mt-0.5 h-6 w-6 text-primary" /><div><h2 className="text-lg font-bold text-on-surface">People & sharing</h2><p className="mt-1 text-xs leading-relaxed text-on-surface-variant">People are participants, not accounts. Recording their share never makes their money part of your ledger.</p></div></div>
        <div className="mt-5 flex flex-wrap gap-2">{activePeople.map(person => <div key={person.id} className="flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-xs"><span className="font-semibold text-on-surface">{person.name}</span><span className="text-on-surface-variant">{person.isSelf ? 'You' : person.relationship || 'Person'}</span>{!person.isSelf && <button type="button" aria-label={`Archive ${person.name}`} onClick={() => { void archiveSharedPerson(person.id); }} className="ml-1 text-on-surface-variant hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>}</div>)}</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input value={personName} onChange={event => setPersonName(event.target.value)} placeholder="Name, e.g. Brother" className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50" /><input value={relationship} onChange={event => setRelationship(event.target.value)} placeholder="Relationship (optional)" className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50" /><button type="button" onClick={async () => { if (!personName.trim()) return; const ok = await addSharedPerson(personName, relationship); if (ok) { setPersonName(''); setRelationship(''); } }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-on-primary"><UserPlus className="h-4 w-4" />Add person</button></div>
      </section>

      <section className="rounded-3xl border border-outline-variant/30 bg-surface-container p-5 sm:p-6">
        <div className="flex items-start gap-3"><ReceiptText className="mt-0.5 h-6 w-6 text-primary" /><div><h2 className="text-lg font-bold text-on-surface">Create shared expense</h2><p className="mt-1 text-xs leading-relaxed text-on-surface-variant">Link a real expense when money moved through your account, or leave it unlinked when everybody paid externally.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Link tracked expense (optional)</span><select value={linkedTransactionId} onChange={event => selectTransaction(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-3 text-sm text-on-surface"><option value="">No tracked transaction</option>{expenseTransactions.slice(0, 80).map(tx => <option key={tx.id} value={tx.id}>{tx.title} · {formatCurrency(Math.abs(tx.amount))}</option>)}</select></label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Household expense</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Rent" className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-3 text-sm text-on-surface" /></label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Household total</span><div className="mt-1.5"><CurrencyInput value={totalAmount} onValueChange={setTotalAmount} /></div></label>
        </div>
        {activePeople.length > 0 && <div className="mt-5"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm font-bold text-on-surface">Responsibility split</p><button type="button" onClick={splitEqually} className="rounded-lg border border-outline-variant/30 px-2.5 py-1.5 text-xs font-semibold text-primary">Split equally</button></div><div className="space-y-2">{activePeople.map(person => <div key={person.id} className="grid grid-cols-[1fr_minmax(110px,150px)] items-center gap-3 rounded-xl bg-surface-container-low p-3"><div><p className="text-sm font-semibold text-on-surface">{person.name} {person.isSelf && <span className="text-xs font-normal text-on-surface-variant">(you)</span>}</p>{!person.isSelf && <label className="mt-1 flex items-center gap-2 text-[11px] text-on-surface-variant"><span>Paid directly/external</span><input inputMode="decimal" value={externalPaid[person.id] || ''} onChange={event => setExternalPaid(current => ({ ...current, [person.id]: event.target.value }))} placeholder="0" className="w-24 rounded-lg border border-outline-variant/30 bg-surface-container px-2 py-1 text-right font-numeric text-on-surface" /></label>}</div><input inputMode="decimal" value={shares[person.id] || ''} onChange={event => setShares(current => ({ ...current, [person.id]: event.target.value }))} placeholder="Share" className="rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2 text-right font-numeric text-on-surface" /></div>)}</div><div className={`mt-2 text-right text-xs font-semibold ${Math.abs(allocatedTotal - selectedTotal) <= 0.01 ? 'text-primary' : 'text-error'}`}>Allocated {formatCurrency(allocatedTotal)} / {formatCurrency(selectedTotal)}</div></div>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
        <button type="button" disabled={saving || activePeople.length === 0} onClick={() => { void saveSharedExpense(); }} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-50"><Plus className="h-4 w-4" />{saving ? 'Saving…' : 'Create shared expense'}</button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1"><WalletCards className="h-5 w-5 text-primary" /><h2 className="font-bold text-on-surface">Shared obligations</h2></div>
        {sharedObligations.length === 0 ? <div className="rounded-2xl border border-dashed border-outline-variant/40 p-6 text-center text-sm text-on-surface-variant">No shared expenses yet.</div> : sharedObligations.map(obligation => {
          const myCost = getMyEconomicCost(obligation, people, sharedResponsibilities);
          const trackedCash = getTrackedCashPaid(obligation.id, sharedPayments);
          const funded = isObligationFunded(obligation, sharedPayments);
          return <article key={obligation.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-on-surface">{obligation.title}</h3><p className="mt-1 text-xs text-on-surface-variant">Household {formatCurrency(obligation.totalAmount)} · Your responsibility {formatCurrency(myCost)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${funded ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-500'}`}>{funded ? 'Funded' : 'Open'}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-surface-container p-3"><span className="text-on-surface-variant">Tracked cash paid</span><p className="mt-1 font-bold font-numeric text-on-surface">{formatCurrency(trackedCash)}</p></div><div className="rounded-xl bg-surface-container p-3"><span className="text-on-surface-variant">Economic cost to you</span><p className="mt-1 font-bold font-numeric text-on-surface">{formatCurrency(myCost)}</p></div></div>{trackedCash > myCost + 0.01 && <p className="mt-3 flex items-center gap-2 text-xs text-on-surface-variant"><CircleDollarSign className="h-4 w-4 text-primary" />You fronted {formatCurrency(trackedCash - myCost)} beyond your own share. This is not additional personal spending.</p>}</article>;
        })}
      </section>
    </div>
  );
}
