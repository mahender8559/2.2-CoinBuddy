import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRightLeft,
  ChevronRight,
  HandCoins,
  Landmark,
  Plus,
  Repeat2,
  Users,
  WalletCards,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { getPersonNetClaim, getTrackedCashPaid } from '../domain/sharedFinances';
import { describeLoanContribution, getPersonalLiabilityExposure } from '../domain/loanSharing';
import type { RecurrenceFrequency } from '../types';

type SharingWorkspace = 'HOME' | 'EXPENSES' | 'SETTLEMENTS' | 'RECURRING' | 'LOANS' | 'PEOPLE';

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function SharingPanel() {
  const {
    people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements,
    sharedObligationTemplates, sharedTemplateResponsibilities, externalLoanContributions,
    loanSharingRules, loanContributionRules, addSharedPerson, archiveSharedPerson,
    createSharedExpense, settleSharedBalance, recordExternalLoanPayment, setSharedTemplateActive,
    transactions, categories, accounts, formatCurrency,
  } = useAppContext();

  const activePeople = people.filter(person => !person.isArchived);
  const me = activePeople.find(person => person.isSelf);
  const otherPeople = activePeople.filter(person => !person.isSelf);
  const assetAccounts = accounts.filter(account => account.type === 'asset' && account.is_archived !== 1);
  const expenseTransactions = transactions.filter(transaction =>
    !transaction.isOpeningBalance && transaction.is_verified !== 0 && transaction.type === 'expense' &&
    !sharedObligations.some(obligation => obligation.transactionId === transaction.id)
  );
  const sharedLoans = accounts.filter(account =>
    account.type === 'liability' && account.is_archived !== 1 && loanSharingRules.some(rule => rule.accountId === account.id && rule.isShared)
  );

  const preselectedTransactionId = typeof window !== 'undefined' ? sessionStorage.getItem('coinbuddy_share_transaction_id') ?? '' : '';
  const preselectedTransaction = expenseTransactions.find(transaction => transaction.id === preselectedTransactionId);

  const [workspace, setWorkspace] = useState<SharingWorkspace>(() => preselectedTransaction ? 'EXPENSES' : 'HOME');
  const [personName, setPersonName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [title, setTitle] = useState(() => preselectedTransaction?.title ?? '');
  const [total, setTotal] = useState(() => preselectedTransaction ? String(Math.abs(preselectedTransaction.amount)) : '');
  const [categoryId, setCategoryId] = useState(() => preselectedTransaction?.category ?? '');
  const [dueDate, setDueDate] = useState(() => preselectedTransaction?.date?.slice(0, 10) || todayKey());
  const [transactionId, setTransactionId] = useState(() => preselectedTransaction?.id ?? '');
  const [repeatFrequency, setRepeatFrequency] = useState<'NONE' | RecurrenceFrequency>('NONE');
  const [shares, setShares] = useState<Record<string, string>>({});
  const [externalPaid, setExternalPaid] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [settlementObligationId, setSettlementObligationId] = useState('');
  const [settlementPersonId, setSettlementPersonId] = useState('');
  const [settlementDirection, setSettlementDirection] = useState<'TO_ME' | 'FROM_ME'>('TO_ME');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementAccountId, setSettlementAccountId] = useState('');
  const [settlementDate, setSettlementDate] = useState(todayKey());
  const [settlementSaving, setSettlementSaving] = useState(false);

  const [loanId, setLoanId] = useState('');
  const [loanPersonId, setLoanPersonId] = useState('');
  const [loanPaymentAmount, setLoanPaymentAmount] = useState('');
  const [loanPaymentDate, setLoanPaymentDate] = useState(todayKey());
  const [loanSaving, setLoanSaving] = useState(false);

  useEffect(() => {
    if (preselectedTransactionId) sessionStorage.removeItem('coinbuddy_share_transaction_id');
  }, [preselectedTransactionId]);

  const totalNumber = Math.abs(Number(total) || 0);
  const selectedTransaction = expenseTransactions.find(transaction => transaction.id === transactionId);

  const personalClaims = useMemo(() => {
    if (!me) return new Map<string, number>();
    return new Map(sharedObligations.map(obligation => [
      obligation.id,
      getPersonNetClaim(obligation.id, me.id, sharedResponsibilities, sharedPayments, sharedSettlements),
    ]));
  }, [me, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements]);

  const sharingSummary = useMemo(() => {
    let owedToMe = 0;
    let iOwe = 0;
    let unsettled = 0;
    personalClaims.forEach(value => {
      if (value > 0.01) owedToMe += value;
      if (value < -0.01) iOwe += Math.abs(value);
      if (Math.abs(value) > 0.01) unsettled += 1;
    });
    return {
      owedToMe,
      iOwe,
      unsettled,
      recurring: sharedObligationTemplates.filter(template => template.isActive).length,
    };
  }, [personalClaims, sharedObligationTemplates]);

  const addPerson = async () => {
    if (!personName.trim()) return;
    const ok = await addSharedPerson(personName, relationship);
    if (ok) { setPersonName(''); setRelationship(''); }
  };

  const saveExpense = async () => {
    setError('');
    if (!me || !title.trim() || totalNumber <= 0) { setError('Enter a title and household total.'); return; }
    const allocations = activePeople
      .map(person => ({ personId: person.id, amount: Math.abs(Number(shares[person.id]) || 0) }))
      .filter(row => row.amount > 0);
    const allocationTotal = allocations.reduce((sum, row) => sum + row.amount, 0);
    if (Math.abs(allocationTotal - totalNumber) > 0.01) {
      setError('Responsibility amounts must add up to the full household total.');
      return;
    }
    const trackedPaymentAmount = selectedTransaction ? Math.abs(selectedTransaction.amount) : 0;
    const directPayments = otherPeople
      .map(person => ({ personId: person.id, amount: Math.abs(Number(externalPaid[person.id]) || 0) }))
      .filter(row => row.amount > 0);
    if (trackedPaymentAmount + directPayments.reduce((sum, row) => sum + row.amount, 0) > totalNumber + 0.01) {
      setError('Recorded payments cannot exceed the household total.');
      return;
    }
    setSaving(true);
    const ok = await createSharedExpense({
      title: title.trim(), totalAmount: totalNumber, categoryId: categoryId || selectedTransaction?.category,
      dueDate, transactionId: transactionId || undefined, allocations, trackedPaymentAmount,
      externalPayments: directPayments, repeatFrequency: repeatFrequency === 'NONE' ? undefined : repeatFrequency,
    });
    setSaving(false);
    if (ok) {
      setTitle(''); setTotal(''); setCategoryId(''); setTransactionId(''); setRepeatFrequency('NONE'); setShares({}); setExternalPaid({});
    }
  };

  const saveSettlement = async () => {
    if (!me || !settlementPersonId || Number(settlementAmount) <= 0) return;
    setSettlementSaving(true);
    const other = settlementPersonId;
    await settleSharedBalance({
      obligationId: settlementObligationId || undefined,
      fromPersonId: settlementDirection === 'TO_ME' ? other : me.id,
      toPersonId: settlementDirection === 'TO_ME' ? me.id : other,
      amount: Math.abs(Number(settlementAmount)), settledAt: `${settlementDate}T12:00:00`,
      accountId: settlementAccountId || undefined,
    });
    setSettlementSaving(false);
    setSettlementAmount('');
  };

  const saveExternalLoanPayment = async () => {
    if (!loanId || !loanPersonId || Number(loanPaymentAmount) <= 0) return;
    setLoanSaving(true);
    await recordExternalLoanPayment({
      accountId: loanId,
      personId: loanPersonId,
      amount: Math.abs(Number(loanPaymentAmount)),
      paidAt: `${loanPaymentDate}T12:00:00`,
    });
    setLoanSaving(false);
    setLoanPaymentAmount('');
  };

  const backButton = (
    <button
      type="button"
      onClick={() => setWorkspace('HOME')}
      className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-primary hover:bg-primary/5"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Sharing
    </button>
  );

  if (workspace === 'PEOPLE') {
    return (
      <div className="space-y-5">
        {backButton}
        <section className="v35-surface rounded-2xl p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-6 w-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold text-on-surface">People</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Add the family members or friends you share money with. People are participants only — they never become bank accounts in CoinBuddy.</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-on-surface-variant">
            <strong className="text-on-surface">Use People when:</strong> you want the same person available across rent, groceries, reimbursements and shared loans.
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input aria-label="Person name" value={personName} onChange={event => setPersonName(event.target.value)} placeholder="Name" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
            <input aria-label="Relationship" value={relationship} onChange={event => setRelationship(event.target.value)} placeholder="Relationship (e.g. Brother)" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
            <button type="button" onClick={addPerson} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-on-primary"><Plus className="h-4 w-4" /> Add person</button>
          </div>
          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-bold text-on-surface">Available people</h3>
            {activePeople.map(person => (
              <div key={person.id} className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container p-4">
                <div>
                  <p className="font-semibold text-on-surface">{person.name}{person.isSelf ? ' (you)' : ''}</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">{person.isSelf ? 'Your CoinBuddy profile' : person.relationship || 'Shared-finance participant'}</p>
                </div>
                {!person.isSelf && (
                  <button aria-label={`Archive ${person.name}`} title={`Archive ${person.name}`} onClick={() => archiveSharedPerson(person.id)} className="rounded-lg p-2 text-on-surface-variant hover:bg-error/10 hover:text-error"><Archive className="h-4 w-4" /></button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (workspace === 'EXPENSES') {
    return (
      <div className="space-y-5">
        {backButton}
        <section className="v35-surface rounded-2xl p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <WalletCards className="mt-0.5 h-6 w-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold text-on-surface">Shared expenses</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Use this for rent, groceries, utilities, dinner, trips or any expense that belongs to more than one person.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface-container p-4"><span className="text-xs font-bold text-primary">1 · COST</span><p className="mt-1 text-sm text-on-surface">Enter what the whole expense cost.</p></div>
            <div className="rounded-2xl bg-surface-container p-4"><span className="text-xs font-bold text-primary">2 · RESPONSIBILITY</span><p className="mt-1 text-sm text-on-surface">Choose how much belongs to each person.</p></div>
            <div className="rounded-2xl bg-surface-container p-4"><span className="text-xs font-bold text-primary">3 · PAYMENT</span><p className="mt-1 text-sm text-on-surface">Tell CoinBuddy who actually paid the money.</p></div>
          </div>

          <div className="mt-6 border-t border-outline-variant/20 pt-5">
            <h3 className="font-bold text-on-surface">Add a shared expense</h3>
            <p className="mt-1 text-sm text-on-surface-variant">Link a tracked expense only when money really left one of your accounts. If someone else paid, leave the tracked-payment field empty.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input aria-label="Shared expense title" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Apartment rent" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
              <CurrencyInput aria-label="Household total" value={total} onValueChange={setTotal} placeholder="Household total" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
              <select aria-label="Shared expense category" value={categoryId} onChange={event => setCategoryId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Category</option>{categories.filter(category => category.type !== 'income').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              <input aria-label="Shared expense date" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
              <select aria-label="Link tracked expense" value={transactionId} onChange={event => { const id = event.target.value; setTransactionId(id); const tx = expenseTransactions.find(item => item.id === id); if (tx) { setTitle(tx.title); setTotal(String(Math.abs(tx.amount))); setDueDate(tx.date.slice(0, 10)); setCategoryId(tx.category); } }} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface sm:col-span-2"><option value="">No tracked cash payment / someone else paid</option>{expenseTransactions.map(transaction => <option key={transaction.id} value={transaction.id}>{transaction.title} · {formatCurrency(Math.abs(transaction.amount))}</option>)}</select>
              <select aria-label="Repeat shared expense" value={repeatFrequency} onChange={event => setRepeatFrequency(event.target.value as 'NONE' | RecurrenceFrequency)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface sm:col-span-2"><option value="NONE">Does not repeat</option><option value="MONTHLY">Repeat monthly</option><option value="QUARTERLY">Repeat quarterly</option><option value="ANNUALLY">Repeat annually</option></select>
            </div>

            {activePeople.length > 0 && (
              <div className="mt-5 space-y-3">
                <div>
                  <p className="text-sm font-bold text-on-surface">Who is responsible for the expense?</p>
                  <p className="mt-1 text-xs text-on-surface-variant">These amounts describe who should economically bear the cost. They do not say who paid it.</p>
                </div>
                {activePeople.map(person => (
                  <div key={person.id} className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)] sm:items-center">
                      <div><p className="text-sm font-semibold text-on-surface">{person.name}{person.isSelf ? ' (you)' : ''}</p><p className="text-xs text-on-surface-variant">Their share of the total expense</p></div>
                      <CurrencyInput aria-label={`${person.name} responsibility`} value={shares[person.id] ?? ''} onValueChange={value => setShares(previous => ({ ...previous, [person.id]: value }))} placeholder="Responsibility" className="min-h-10 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 text-on-surface" />
                    </div>
                    {!person.isSelf && (
                      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-outline-variant/20 pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)] sm:items-center">
                        <div><p className="text-xs font-semibold text-on-surface">Did {person.name} pay the seller/lender directly?</p><p className="text-xs text-on-surface-variant">Use this only when their money never passed through your accounts.</p></div>
                        <CurrencyInput aria-label={`${person.name} paid directly`} value={externalPaid[person.id] ?? ''} onValueChange={value => setExternalPaid(previous => ({ ...previous, [person.id]: value }))} placeholder="Direct payment" className="min-h-10 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 text-on-surface" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
            <button type="button" disabled={saving} onClick={saveExpense} className="mt-5 min-h-11 w-full rounded-xl bg-primary text-on-primary font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save shared expense'}</button>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="font-bold text-on-surface">Existing shared expenses</h3>
            <p className="mt-1 text-xs text-on-surface-variant">Each item keeps your responsibility separate from the cash that actually moved through your accounts.</p>
          </div>
          {sharedObligations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant/40 p-6 text-center text-sm text-on-surface-variant">No shared expenses yet.</div>
          ) : sharedObligations.map(obligation => {
            const mine = me ? sharedResponsibilities.filter(row => row.obligationId === obligation.id && row.personId === me.id).reduce((sum, row) => sum + row.amount, 0) : 0;
            const tracked = getTrackedCashPaid(obligation.id, sharedPayments);
            const claim = personalClaims.get(obligation.id) ?? 0;
            return (
              <article key={obligation.id} aria-label={`Shared obligation ${obligation.title}`} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
                <div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold text-on-surface">{obligation.title}</h4><p className="mt-1 text-xs text-on-surface-variant">{obligation.dueDate ? new Date(`${obligation.dueDate}T12:00:00`).toLocaleDateString() : 'No due date'}{obligation.templateId ? ' · recurring occurrence' : ''}</p></div><span className="text-sm font-bold text-on-surface">{formatCurrency(obligation.totalAmount)}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-surface-container p-3"><span className="text-on-surface-variant">Your responsibility</span><strong className="mt-1 block text-on-surface">{formatCurrency(mine)}</strong></div><div className="rounded-xl bg-surface-container p-3"><span className="text-on-surface-variant">Tracked cash paid</span><strong className="mt-1 block text-on-surface">{formatCurrency(tracked)}</strong></div></div>
                {claim > 0.01 && <p className="mt-3 text-sm font-semibold text-emerald-500">You should receive {formatCurrency(claim)}</p>}
                {claim < -0.01 && <p className="mt-3 text-sm font-semibold text-amber-500">You still owe {formatCurrency(Math.abs(claim))}</p>}
                <div className="mt-2 flex flex-wrap gap-2">{otherPeople.map(person => { const value = getPersonNetClaim(obligation.id, person.id, sharedResponsibilities, sharedPayments, sharedSettlements); if (Math.abs(value) < 0.01) return null; return <span key={person.id} className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] text-on-surface-variant">{value < 0 ? `${person.name} owes ${formatCurrency(Math.abs(value))}` : `${person.name} should receive ${formatCurrency(value)}`}</span>; })}</div>
              </article>
            );
          })}
        </section>
      </div>
    );
  }

  if (workspace === 'SETTLEMENTS') {
    return (
      <div className="space-y-5">
        {backButton}
        <section className="v35-surface rounded-2xl p-4 sm:p-6">
          <div className="flex items-start gap-3"><HandCoins className="mt-0.5 h-6 w-6 text-primary" /><div><h2 className="text-xl font-bold text-on-surface">Settle / reimburse</h2><p className="mt-1 text-sm text-on-surface-variant">Use this when money is returned after one person paid more than their fair share.</p></div></div>
          <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-on-surface-variant"><strong className="text-on-surface">Important:</strong> a reimbursement can change a bank balance, but CoinBuddy does not count it as salary/income or as a second expense.</div>

          {(sharingSummary.owedToMe > 0.01 || sharingSummary.iOwe > 0.01) && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-container p-4"><span className="text-xs text-on-surface-variant">You should receive</span><strong className="mt-1 block text-lg text-on-surface">{formatCurrency(sharingSummary.owedToMe)}</strong></div>
              <div className="rounded-2xl bg-surface-container p-4"><span className="text-xs text-on-surface-variant">You still owe</span><strong className="mt-1 block text-lg text-on-surface">{formatCurrency(sharingSummary.iOwe)}</strong></div>
            </div>
          )}

          <div className="mt-6 border-t border-outline-variant/20 pt-5">
            <h3 className="font-bold text-on-surface">Record a settlement</h3>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select aria-label="Settlement obligation" value={settlementObligationId} onChange={event => setSettlementObligationId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">General settlement</option>{sharedObligations.filter(item => item.status !== 'CANCELLED').map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
              <select aria-label="Settlement person" value={settlementPersonId} onChange={event => setSettlementPersonId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Select person</option>{otherPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
              <select aria-label="Settlement direction" value={settlementDirection} onChange={event => setSettlementDirection(event.target.value as 'TO_ME' | 'FROM_ME')} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="TO_ME">They reimburse me</option><option value="FROM_ME">I reimburse them</option></select>
              <CurrencyInput aria-label="Settlement amount" value={settlementAmount} onValueChange={setSettlementAmount} placeholder="Amount" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
              <select aria-label="Settlement account" value={settlementAccountId} onChange={event => setSettlementAccountId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Settled outside tracked accounts</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
              <input aria-label="Settlement date" type="date" value={settlementDate} onChange={event => setSettlementDate(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
            </div>
            <button type="button" disabled={settlementSaving || !settlementPersonId || Number(settlementAmount) <= 0} onClick={saveSettlement} className="mt-4 min-h-11 w-full rounded-xl border border-primary/40 bg-primary/10 text-primary font-bold disabled:opacity-40">{settlementSaving ? 'Saving…' : 'Record settlement'}</button>
          </div>

          <div className="mt-6 border-t border-outline-variant/20 pt-5">
            <h3 className="font-bold text-on-surface">Unsettled shared amounts</h3>
            <p className="mt-1 text-xs text-on-surface-variant">This is the remaining economic balance after responsibilities, payments and previous settlements.</p>
            <div className="mt-3 space-y-2">
              {sharedObligations.filter(obligation => Math.abs(personalClaims.get(obligation.id) ?? 0) > 0.01).length === 0 ? (
                <p className="rounded-2xl border border-dashed border-outline-variant/40 p-5 text-sm text-on-surface-variant">Nothing is waiting to be settled.</p>
              ) : sharedObligations.filter(obligation => Math.abs(personalClaims.get(obligation.id) ?? 0) > 0.01).map(obligation => {
                const claim = personalClaims.get(obligation.id) ?? 0;
                return <div key={obligation.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container p-4"><div><p className="font-semibold text-on-surface">{obligation.title}</p><p className="mt-1 text-xs text-on-surface-variant">{claim > 0 ? 'Someone still needs to reimburse you' : 'You still need to reimburse someone'}</p></div><strong className={claim > 0 ? 'text-emerald-500' : 'text-amber-500'}>{formatCurrency(Math.abs(claim))}</strong></div>;
              })}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (workspace === 'RECURRING') {
    return (
      <div className="space-y-5">
        {backButton}
        <section className="v35-surface rounded-2xl p-4 sm:p-6">
          <div className="flex items-start gap-3"><Repeat2 className="mt-0.5 h-6 w-6 text-primary" /><div><h2 className="text-xl font-bold text-on-surface">Recurring shared bills</h2><p className="mt-1 text-sm text-on-surface-variant">Use this for rent, utilities or other household costs that repeat with the same expected responsibility split.</p></div></div>
          <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-on-surface-variant"><strong className="text-on-surface">What happens each cycle?</strong> CoinBuddy creates the shared obligation only. It does not invent a bank transaction. Real cash movement is recorded separately when someone actually pays.</div>
          <div className="mt-5 space-y-2">
            {sharedObligationTemplates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-outline-variant/40 p-6 text-center"><p className="font-semibold text-on-surface">No recurring shared bills yet</p><p className="mt-1 text-sm text-on-surface-variant">Create a shared expense and choose Monthly, Quarterly or Annually to start one.</p><button type="button" onClick={() => setWorkspace('EXPENSES')} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">Create shared expense</button></div>
            ) : sharedObligationTemplates.map(template => {
              const myShare = me ? sharedTemplateResponsibilities.filter(row => row.templateId === template.id && row.personId === me.id).reduce((sum, row) => sum + row.amount, 0) : 0;
              return <div key={template.id} className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container p-4"><div><p className="font-semibold text-on-surface">{template.title}</p><p className="mt-1 text-xs text-on-surface-variant">{template.frequency.toLowerCase()} · next {template.nextDueDate} · your share {formatCurrency(myShare)}</p></div><button type="button" aria-label={`${template.isActive ? 'Pause' : 'Resume'} ${template.title}`} onClick={() => setSharedTemplateActive(template.id, !template.isActive)} className="shrink-0 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-primary">{template.isActive ? 'Pause' : 'Resume'}</button></div>;
            })}
          </div>
        </section>
      </div>
    );
  }

  if (workspace === 'LOANS') {
    return (
      <div className="space-y-5">
        {backButton}
        <section className="v35-surface rounded-2xl p-4 sm:p-6">
          <div className="flex items-start gap-3"><Landmark className="mt-0.5 h-6 w-6 text-primary" /><div><h2 className="text-xl font-bold text-on-surface">Shared loans</h2><p className="mt-1 text-sm text-on-surface-variant">The bank loan stays whole. CoinBuddy separately tracks how much of the liability is yours and how each EMI is expected to be funded.</p></div></div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2"><div className="rounded-2xl bg-surface-container p-4"><p className="text-xs font-bold text-primary">FULL LOAN</p><p className="mt-1 text-sm text-on-surface">The legal outstanding balance and amortization always remain the full lender values.</p></div><div className="rounded-2xl bg-surface-container p-4"><p className="text-xs font-bold text-primary">YOUR SHARE</p><p className="mt-1 text-sm text-on-surface">Personal exposure and EMI contribution are separate settings and may be different percentages.</p></div></div>

          {sharedLoans.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-outline-variant/40 p-6 text-center"><p className="font-semibold text-on-surface">No shared loans configured</p><p className="mt-1 text-sm text-on-surface-variant">Create or edit a liability account and enable Shared / Family repayment to use this workspace.</p></div>
          ) : (
            <>
              <div className="mt-5 space-y-3">{sharedLoans.map(loan => {
                const contributions = describeLoanContribution(loan, people, loanContributionRules);
                const history = externalLoanContributions.filter(item => item.accountId === loan.id);
                return (
                  <article key={loan.id} aria-label={`Shared loan ${loan.name}`} className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4">
                    <div className="flex justify-between gap-3"><div><p className="font-semibold text-on-surface">{loan.name}</p><p className="mt-1 text-xs text-on-surface-variant">Full balance {formatCurrency(loan.balance)} · personal exposure {formatCurrency(getPersonalLiabilityExposure(loan, loanSharingRules))}</p></div><span className="text-xs font-bold text-primary">Shared</span></div>
                    <div className="mt-3 flex flex-wrap gap-2">{contributions.map(item => <span key={item.personId} className="rounded-full bg-surface-container-high px-2.5 py-1 text-[11px] text-on-surface-variant">{item.name}: {formatCurrency(item.amount)}/payment</span>)}</div>
                    {history.length > 0 && <div className="mt-3 border-t border-outline-variant/20 pt-3"><p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Direct lender payments</p>{history.slice(0, 3).map(item => { const person = people.find(p => p.id === item.personId); return <p key={item.id} className="mt-1 text-xs text-on-surface-variant">{person?.name ?? 'Family'} paid {formatCurrency(item.amount)} · principal {formatCurrency(item.principalAmount)} · interest {formatCurrency(item.interestAmount)}</p>; })}</div>}
                  </article>
                );
              })}</div>

              <div className="mt-6 border-t border-outline-variant/20 pt-5">
                <h3 className="font-bold text-on-surface">Someone paid the lender directly</h3>
                <p className="mt-1 text-sm text-on-surface-variant">Use this only when a family member paid the bank/lender without the money passing through one of your tracked accounts.</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><select aria-label="External payment loan" value={loanId} onChange={event => setLoanId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Select shared loan</option>{sharedLoans.map(loan => <option key={loan.id} value={loan.id}>{loan.name}</option>)}</select><select aria-label="External loan contributor" value={loanPersonId} onChange={event => setLoanPersonId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Who paid lender?</option>{otherPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select><CurrencyInput aria-label="External loan payment amount" value={loanPaymentAmount} onValueChange={setLoanPaymentAmount} placeholder="Amount paid directly" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" /><input aria-label="External loan payment date" type="date" value={loanPaymentDate} onChange={event => setLoanPaymentDate(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" /></div>
                <button type="button" disabled={loanSaving || !loanId || !loanPersonId || Number(loanPaymentAmount) <= 0} onClick={saveExternalLoanPayment} className="mt-4 min-h-11 w-full rounded-xl border border-primary/40 bg-primary/10 text-primary font-bold disabled:opacity-40">{loanSaving ? 'Saving…' : 'Record direct lender payment'}</button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  const actions = [
    { id: 'EXPENSES' as const, icon: WalletCards, title: 'Shared expenses', description: 'Split rent, groceries, utilities, dinner or any other expense — and review existing shared items.' },
    { id: 'SETTLEMENTS' as const, icon: HandCoins, title: 'Settle / reimburse', description: 'Record money someone returned to you, or money you paid back, without treating it as income.' },
    { id: 'RECURRING' as const, icon: Repeat2, title: 'Recurring shared bills', description: 'Manage repeating rent, utilities and other household obligations with a remembered split.' },
    { id: 'LOANS' as const, icon: Landmark, title: 'Shared loans', description: 'Review liability exposure, EMI contributions and payments made directly to the lender.' },
    { id: 'PEOPLE' as const, icon: Users, title: 'People', description: 'Add or manage the family members and friends you share expenses or loans with.' },
  ];

  return (
    <div className="space-y-5" data-testid="sharing-hub">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">Sharing ✨</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">Manage money shared with family and friends without mixing responsibility with your personal cash flow.</p>
        </div>
      </header>

      <section aria-label="Sharing summary" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <article className="v35-surface rounded-2xl p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-primary"><Users className="h-4 w-4"/><span className="text-xs font-semibold">People</span></div>
          <p className="mt-2.5 font-numeric text-xl font-semibold text-on-surface">{activePeople.length}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">You + shared participants</p>
        </article>
        <article className="v35-surface rounded-2xl p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-[var(--cb-green)]"><HandCoins className="h-4 w-4"/><span className="text-xs font-semibold">You should receive</span></div>
          <p className="mt-2.5 font-numeric text-lg font-semibold text-[var(--cb-green)] sm:text-xl">{formatCurrency(sharingSummary.owedToMe)}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">Money others still owe you</p>
        </article>
        <article className="v35-surface rounded-2xl p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-[var(--cb-amber)]"><ArrowRightLeft className="h-4 w-4"/><span className="text-xs font-semibold">You owe</span></div>
          <p className="mt-2.5 font-numeric text-lg font-semibold text-[var(--cb-amber)] sm:text-xl">{formatCurrency(sharingSummary.iOwe)}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">Your unsettled responsibility</p>
        </article>
        <article className="v35-surface rounded-2xl p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-[var(--cb-purple)]"><Repeat2 className="h-4 w-4"/><span className="text-xs font-semibold">Active bills</span></div>
          <p className="mt-2.5 font-numeric text-xl font-semibold text-on-surface">{sharingSummary.recurring}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">Recurring shared obligations</p>
        </article>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-on-surface">What do you want to do?</h2>
          <p className="mt-1 text-xs text-on-surface-variant sm:text-sm">Choose one task. Only the controls for that job will open.</p>
        </div>

        <div className="v35-surface overflow-hidden rounded-2xl">
          {actions.map((action, index) => {
            const Icon = action.icon;
            const tone = action.id === 'SETTLEMENTS'
              ? 'text-[var(--cb-green)] bg-[var(--cb-green-soft)]'
              : action.id === 'RECURRING'
                ? 'text-[var(--cb-amber)] bg-[var(--cb-amber-soft)]'
                : action.id === 'LOANS'
                  ? 'text-[var(--cb-purple)] bg-[var(--cb-purple-soft)]'
                  : 'text-primary bg-primary/10';
            return (
              <button
                key={action.id}
                type="button"
                aria-label={`Open ${action.title}`}
                onClick={() => setWorkspace(action.id)}
                className={`group flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container-high/45 sm:min-h-[82px] sm:px-5 ${index < actions.length - 1 ? 'border-b border-outline-variant/20' : ''}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-on-surface sm:text-[15px]">{action.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant sm:text-sm">{action.description}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            );
          })}
        </div>
      </section>

      <aside className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-3.5 sm:p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ArrowRightLeft className="h-4 w-4" /></span>
        <div>
          <p className="text-sm font-semibold text-on-surface">Keep cost, payment and responsibility separate</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">Who recorded something does not decide who paid or who should ultimately bear the cost. CoinBuddy keeps those facts separate.</p>
        </div>
      </aside>
    </div>
  );
}
