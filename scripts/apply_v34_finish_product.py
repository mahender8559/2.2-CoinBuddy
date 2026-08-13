from pathlib import Path
import json


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'anchor not found in {path}: {old[:160]!r}')
    p.write_text(s.replace(old, new, 1))


def insert_before(path: str, anchor: str, addition: str):
    replace_once(path, anchor, addition + anchor)


def insert_after(path: str, anchor: str, addition: str):
    replace_once(path, anchor, anchor + addition)


# ---------------------------------------------------------------------------
# Repository finishing touches: bounded settlements + pause/resume templates
# ---------------------------------------------------------------------------
insert_before(
    'src/db/sharedFinanceRepository.ts',
    "export async function addSharedSettlementWithBalanceAdjustment(\n",
    """export async function setSharedObligationTemplateActive(driver: SqlJsDatabaseDriver, templateId: string, isActive: boolean): Promise<void> {
  const rows = await driver.query(`SELECT id FROM shared_obligation_templates WHERE id = ?`, [templateId]);
  if (!rows[0]) throw new Error('Recurring shared obligation was not found.');
  await driver.execute(`UPDATE shared_obligation_templates SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, templateId]);
}

""",
)
insert_after(
    'src/db/sharedFinanceRepository.ts',
    "  if (!selfId) throw new Error('CoinBuddy could not identify the primary user.');\n",
    """  if (input.obligationId) {
    const obligations = await driver.query(`SELECT id FROM shared_obligations WHERE id = ? AND status <> 'CANCELLED'`, [input.obligationId]);
    if (!obligations[0]) throw new Error('The selected shared obligation no longer exists.');
    const [responsibilities, payments, settlements] = await Promise.all([
      driver.query(`SELECT person_id, amount FROM shared_responsibilities WHERE obligation_id = ?`, [input.obligationId]),
      driver.query(`SELECT person_id, amount FROM shared_payments WHERE obligation_id = ?`, [input.obligationId]),
      driver.query(`SELECT from_person_id, to_person_id, amount FROM shared_settlements WHERE obligation_id = ?`, [input.obligationId]),
    ]);
    const claim = (personId: string) => {
      const paid = payments.filter((row: any) => String(row.person_id) === personId).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      const responsibility = responsibilities.filter((row: any) => String(row.person_id) === personId).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      const outgoing = settlements.filter((row: any) => String(row.from_person_id) === personId).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      const incoming = settlements.filter((row: any) => String(row.to_person_id) === personId).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      return Math.round((paid - responsibility + outgoing - incoming) * 100) / 100;
    };
    const payerOwes = Math.max(0, -claim(input.fromPersonId));
    const receiverClaim = Math.max(0, claim(input.toPersonId));
    const maximum = Math.min(payerOwes, receiverClaim);
    if (maximum <= 0.009) throw new Error('These two people do not currently have a settlement balance in that direction.');
    if (amount > maximum + 0.01) throw new Error(`Settlement cannot exceed the outstanding shared balance of ${maximum.toFixed(2)}.`);
  }
""",
)

# ---------------------------------------------------------------------------
# App context exposes template lifecycle
# ---------------------------------------------------------------------------
replace_once(
    'src/context/AppContext.tsx',
    "  addExternalLoanContribution,\n  type SharedFinanceState,\n",
    "  addExternalLoanContribution,\n  setSharedObligationTemplateActive,\n  type SharedFinanceState,\n",
)
insert_after(
    'src/context/AppContext.tsx',
    "  recordExternalLoanPayment: (input: { accountId: string; personId: string; amount: number; paidAt: string }) => Promise<boolean>;\n",
    "  setSharedTemplateActive: (templateId: string, isActive: boolean) => Promise<boolean>;\n",
)
insert_after(
    'src/context/AppContext.tsx',
    "  const recordExternalLoanPayment = async (input: { accountId: string; personId: string; amount: number; paidAt: string }): Promise<boolean> => {\n    if (!dbDriver) return false;\n    try {\n      await addExternalLoanContribution(dbDriver, input);\n      await persistDatabase(dbDriver);\n      await refreshStateFromDatabase(dbDriver);\n      await refreshSharedFinance(dbDriver);\n      return true;\n    } catch (error) {\n      console.error('External loan contribution failed:', error);\n      window.alert(`External loan payment was not saved: ${error instanceof Error ? error.message : String(error)}`);\n      return false;\n    }\n  };\n",
    """

  const setSharedTemplateActive = async (templateId: string, isActive: boolean): Promise<boolean> =>
    persistSharedAction(async () => {
      await setSharedObligationTemplateActive(dbDriver!, templateId, isActive);
      if (isActive) await generateDueSharedObligations(dbDriver!);
    });
""",
)
replace_once(
    'src/context/AppContext.tsx',
    "configureLoanSharing, settleSharedBalance, recordExternalLoanPayment,\n",
    "configureLoanSharing, settleSharedBalance, recordExternalLoanPayment, setSharedTemplateActive,\n",
)

# ---------------------------------------------------------------------------
# Sharing UI: replace with the complete v3.4 experience
# ---------------------------------------------------------------------------
Path('src/components/SharingPanel.tsx').write_text(r'''import { useMemo, useState } from 'react';
import { Archive, ArrowRightLeft, CalendarClock, HandCoins, Landmark, Plus, Repeat2, Users, WalletCards } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { CurrencyInput } from './CurrencyInput';
import { getPersonNetClaim, getTrackedCashPaid } from '../domain/sharedFinances';
import { describeLoanContribution, getPersonalLiabilityExposure } from '../domain/loanSharing';
import type { RecurrenceFrequency } from '../types';

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

  const [personName, setPersonName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dueDate, setDueDate] = useState(todayKey());
  const [transactionId, setTransactionId] = useState('');
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

  const totalNumber = Math.abs(Number(total) || 0);
  const selectedTransaction = expenseTransactions.find(transaction => transaction.id === transactionId);

  const personalClaims = useMemo(() => {
    if (!me) return new Map<string, number>();
    return new Map(sharedObligations.map(obligation => [
      obligation.id,
      getPersonNetClaim(obligation.id, me.id, sharedResponsibilities, sharedPayments, sharedSettlements),
    ]));
  }, [me, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements]);

  const addPerson = async () => {
    if (!personName.trim()) return;
    const ok = await addSharedPerson(personName, relationship);
    if (ok) { setPersonName(''); setRelationship(''); }
  };

  const saveExpense = async () => {
    setError('');
    if (!me || !title.trim() || totalNumber <= 0) { setError('Enter a title and household total.'); return; }
    const allocations = activePeople.map(person => ({ personId: person.id, amount: Math.abs(Number(shares[person.id]) || 0) })).filter(row => row.amount > 0);
    const allocationTotal = allocations.reduce((sum, row) => sum + row.amount, 0);
    if (Math.abs(allocationTotal - totalNumber) > 0.01) { setError('Responsibility amounts must add up to the full household total.'); return; }
    const trackedPaymentAmount = selectedTransaction ? Math.abs(selectedTransaction.amount) : 0;
    const directPayments = otherPeople.map(person => ({ personId: person.id, amount: Math.abs(Number(externalPaid[person.id]) || 0) })).filter(row => row.amount > 0);
    if (trackedPaymentAmount + directPayments.reduce((sum, row) => sum + row.amount, 0) > totalNumber + 0.01) { setError('Recorded payments cannot exceed the household total.'); return; }
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
    await recordExternalLoanPayment({ accountId: loanId, personId: loanPersonId, amount: Math.abs(Number(loanPaymentAmount)), paidAt: `${loanPaymentDate}T12:00:00` });
    setLoanSaving(false);
    setLoanPaymentAmount('');
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Users className="w-6 h-6 text-primary mt-0.5" />
          <div><h2 className="text-xl font-bold text-on-surface">People & sharing</h2><p className="text-sm text-on-surface-variant mt-1">People are participants, not accounts. CoinBuddy stores responsibility, who actually paid, and settlements separately.</p></div>
        </div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input aria-label="Person name" value={personName} onChange={event => setPersonName(event.target.value)} placeholder="Name" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
          <input aria-label="Relationship" value={relationship} onChange={event => setRelationship(event.target.value)} placeholder="Relationship (e.g. Brother)" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
          <button type="button" onClick={addPerson} className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-on-primary flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {activePeople.map(person => <div key={person.id} className="inline-flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-sm text-on-surface"><span>{person.name}{person.isSelf ? ' (you)' : person.relationship ? ` · ${person.relationship}` : ''}</span>{!person.isSelf && <button aria-label={`Archive ${person.name}`} title={`Archive ${person.name}`} onClick={() => archiveSharedPerson(person.id)} className="text-on-surface-variant hover:text-error"><Archive className="w-3.5 h-3.5" /></button>}</div>)}
        </div>
      </section>

      <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-start gap-3"><WalletCards className="w-6 h-6 text-primary mt-0.5" /><div><h3 className="text-lg font-bold text-on-surface">Add shared expense</h3><p className="text-sm text-on-surface-variant mt-1">The household amount never becomes a cash movement by itself. Link a real expense only when it actually left one of your accounts.</p></div></div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input aria-label="Shared expense title" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Apartment rent" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
          <CurrencyInput aria-label="Household total" value={total} onValueChange={setTotal} placeholder="Household total" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
          <select aria-label="Shared expense category" value={categoryId} onChange={event => setCategoryId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Category</option>{categories.filter(category => category.type !== 'income').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <input aria-label="Shared expense date" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
          <select aria-label="Link tracked expense" value={transactionId} onChange={event => { const id = event.target.value; setTransactionId(id); const tx = expenseTransactions.find(item => item.id === id); if (tx) { setTitle(tx.title); setTotal(String(Math.abs(tx.amount))); setDueDate(tx.date.slice(0, 10)); setCategoryId(tx.category); } }} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface sm:col-span-2"><option value="">No tracked cash payment / someone else paid</option>{expenseTransactions.map(transaction => <option key={transaction.id} value={transaction.id}>{transaction.title} · {formatCurrency(Math.abs(transaction.amount))}</option>)}</select>
          <select aria-label="Repeat shared expense" value={repeatFrequency} onChange={event => setRepeatFrequency(event.target.value as 'NONE' | RecurrenceFrequency)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface sm:col-span-2"><option value="NONE">Does not repeat</option><option value="MONTHLY">Repeat monthly</option><option value="QUARTERLY">Repeat quarterly</option><option value="ANNUALLY">Repeat annually</option></select>
        </div>
        {activePeople.length > 0 && <div className="mt-5 space-y-3"><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Responsibility & direct payments</p>{activePeople.map(person => <div key={person.id} className="grid grid-cols-[minmax(0,1fr)_minmax(110px,0.7fr)] gap-2 items-center"><span className="text-sm text-on-surface">{person.name}{person.isSelf ? ' (you)' : ''}</span><CurrencyInput aria-label={`${person.name} responsibility`} value={shares[person.id] ?? ''} onValueChange={value => setShares(previous => ({ ...previous, [person.id]: value }))} placeholder="Responsibility" className="min-h-10 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />{!person.isSelf && <><span className="text-xs text-on-surface-variant">Paid directly outside your accounts</span><CurrencyInput aria-label={`${person.name} paid directly`} value={externalPaid[person.id] ?? ''} onValueChange={value => setExternalPaid(previous => ({ ...previous, [person.id]: value }))} placeholder="Direct payment" className="min-h-10 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" /></>}</div>)}</div>}
        {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
        <button type="button" disabled={saving} onClick={saveExpense} className="mt-5 min-h-11 w-full rounded-xl bg-primary text-on-primary font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save shared expense'}</button>
      </section>

      <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-start gap-3"><HandCoins className="w-6 h-6 text-primary mt-0.5" /><div><h3 className="text-lg font-bold text-on-surface">Settle reimbursements</h3><p className="text-sm text-on-surface-variant mt-1">A reimbursement can adjust a tracked bank balance, but it is never classified as salary/income or personal spending.</p></div></div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select aria-label="Settlement obligation" value={settlementObligationId} onChange={event => setSettlementObligationId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">General settlement</option>{sharedObligations.filter(item => item.status !== 'CANCELLED').map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
          <select aria-label="Settlement person" value={settlementPersonId} onChange={event => setSettlementPersonId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Select person</option>{otherPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
          <select aria-label="Settlement direction" value={settlementDirection} onChange={event => setSettlementDirection(event.target.value as 'TO_ME' | 'FROM_ME')} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="TO_ME">They reimburse me</option><option value="FROM_ME">I reimburse them</option></select>
          <CurrencyInput aria-label="Settlement amount" value={settlementAmount} onValueChange={setSettlementAmount} placeholder="Amount" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
          <select aria-label="Settlement account" value={settlementAccountId} onChange={event => setSettlementAccountId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Settled outside tracked accounts</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
          <input aria-label="Settlement date" type="date" value={settlementDate} onChange={event => setSettlementDate(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" />
        </div>
        <button type="button" disabled={settlementSaving || !settlementPersonId || Number(settlementAmount) <= 0} onClick={saveSettlement} className="mt-4 min-h-11 w-full rounded-xl border border-primary/40 bg-primary/10 text-primary font-bold disabled:opacity-40">{settlementSaving ? 'Saving…' : 'Record settlement'}</button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-on-surface">Shared obligations</h3><p className="text-xs text-on-surface-variant">Economic responsibility and cash paid are deliberately separate.</p></div></div>
        {sharedObligations.length === 0 ? <div className="rounded-2xl border border-dashed border-outline-variant/40 p-6 text-center text-sm text-on-surface-variant">No shared obligations yet.</div> : sharedObligations.map(obligation => {
          const mine = me ? sharedResponsibilities.filter(row => row.obligationId === obligation.id && row.personId === me.id).reduce((sum, row) => sum + row.amount, 0) : 0;
          const tracked = getTrackedCashPaid(obligation.id, sharedPayments);
          const claim = personalClaims.get(obligation.id) ?? 0;
          return <article key={obligation.id} aria-label={`Shared obligation ${obligation.title}`} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold text-on-surface">{obligation.title}</h4><p className="text-xs text-on-surface-variant mt-1">{obligation.dueDate ? new Date(`${obligation.dueDate}T12:00:00`).toLocaleDateString() : 'No due date'}{obligation.templateId ? ' · recurring occurrence' : ''}</p></div><span className="text-sm font-bold text-on-surface">{formatCurrency(obligation.totalAmount)}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-surface-container p-3"><span className="text-on-surface-variant">Your responsibility</span><strong className="block mt-1 text-on-surface">{formatCurrency(mine)}</strong></div><div className="rounded-xl bg-surface-container p-3"><span className="text-on-surface-variant">Tracked cash paid</span><strong className="block mt-1 text-on-surface">{formatCurrency(tracked)}</strong></div></div>{claim > 0.01 && <p className="mt-3 text-sm font-semibold text-emerald-500">You should receive {formatCurrency(claim)}</p>}{claim < -0.01 && <p className="mt-3 text-sm font-semibold text-amber-500">You still owe {formatCurrency(Math.abs(claim))}</p>}<div className="mt-2 flex flex-wrap gap-2">{otherPeople.map(person => { const value = getPersonNetClaim(obligation.id, person.id, sharedResponsibilities, sharedPayments, sharedSettlements); if (Math.abs(value) < 0.01) return null; return <span key={person.id} className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] text-on-surface-variant">{value < 0 ? `${person.name} owes ${formatCurrency(Math.abs(value))}` : `${person.name} should receive ${formatCurrency(value)}`}</span>; })}</div></article>;
        })}
      </section>

      <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-start gap-3"><Repeat2 className="w-6 h-6 text-primary mt-0.5" /><div><h3 className="text-lg font-bold text-on-surface">Recurring shared expenses</h3><p className="text-sm text-on-surface-variant mt-1">Templates generate household obligations without generating fake bank transactions.</p></div></div>
        <div className="mt-4 space-y-2">{sharedObligationTemplates.length === 0 ? <p className="text-sm text-on-surface-variant">No recurring shared expenses yet.</p> : sharedObligationTemplates.map(template => { const myShare = me ? sharedTemplateResponsibilities.filter(row => row.templateId === template.id && row.personId === me.id).reduce((sum, row) => sum + row.amount, 0) : 0; return <div key={template.id} className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-on-surface">{template.title}</p><p className="text-xs text-on-surface-variant mt-1">{template.frequency.toLowerCase()} · next {template.nextDueDate} · your share {formatCurrency(myShare)}</p></div><button type="button" aria-label={`${template.isActive ? 'Pause' : 'Resume'} ${template.title}`} onClick={() => setSharedTemplateActive(template.id, !template.isActive)} className="shrink-0 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-primary">{template.isActive ? 'Pause' : 'Resume'}</button></div>; })}</div>
      </section>

      {sharedLoans.length > 0 && <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-start gap-3"><Landmark className="w-6 h-6 text-primary mt-0.5" /><div><h3 className="text-lg font-bold text-on-surface">Shared loans</h3><p className="text-sm text-on-surface-variant mt-1">The legal loan stays whole. Personal exposure, EMI contribution, and direct lender payments are tracked separately.</p></div></div>
        <div className="mt-4 space-y-3">{sharedLoans.map(loan => { const contributions = describeLoanContribution(loan, people, loanContributionRules); const history = externalLoanContributions.filter(item => item.accountId === loan.id); return <article key={loan.id} aria-label={`Shared loan ${loan.name}`} className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold text-on-surface">{loan.name}</p><p className="text-xs text-on-surface-variant mt-1">Full balance {formatCurrency(loan.balance)} · personal exposure {formatCurrency(getPersonalLiabilityExposure(loan, loanSharingRules))}</p></div><span className="text-xs font-bold text-primary">Shared</span></div><div className="mt-3 flex flex-wrap gap-2">{contributions.map(item => <span key={item.personId} className="rounded-full bg-surface-container-high px-2.5 py-1 text-[11px] text-on-surface-variant">{item.name}: {formatCurrency(item.amount)}/payment</span>)}</div>{history.length > 0 && <div className="mt-3 border-t border-outline-variant/20 pt-3"><p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Direct lender payments</p>{history.slice(0, 3).map(item => { const person = people.find(p => p.id === item.personId); return <p key={item.id} className="mt-1 text-xs text-on-surface-variant">{person?.name ?? 'Family'} paid {formatCurrency(item.amount)} · principal {formatCurrency(item.principalAmount)} · interest {formatCurrency(item.interestAmount)}</p>; })}</div>}</article>; })}</div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3"><select aria-label="External payment loan" value={loanId} onChange={event => setLoanId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Select shared loan</option>{sharedLoans.map(loan => <option key={loan.id} value={loan.id}>{loan.name}</option>)}</select><select aria-label="External loan contributor" value={loanPersonId} onChange={event => setLoanPersonId(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface"><option value="">Who paid lender?</option>{otherPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select><CurrencyInput aria-label="External loan payment amount" value={loanPaymentAmount} onValueChange={setLoanPaymentAmount} placeholder="Amount paid directly" className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" /><input aria-label="External loan payment date" type="date" value={loanPaymentDate} onChange={event => setLoanPaymentDate(event.target.value)} className="min-h-11 rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-on-surface" /></div><button type="button" disabled={loanSaving || !loanId || !loanPersonId || Number(loanPaymentAmount) <= 0} onClick={saveExternalLoanPayment} className="mt-4 min-h-11 w-full rounded-xl border border-primary/40 bg-primary/10 text-primary font-bold disabled:opacity-40">{loanSaving ? 'Saving…' : 'Record direct lender payment'}</button>
      </section>}

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3"><ArrowRightLeft className="w-5 h-5 text-primary mt-0.5" /><div className="text-sm text-on-surface-variant"><strong className="text-on-surface">Two truths stay separate:</strong> account/cash-flow screens show money that actually moved through your accounts; budgets, Insights and shared balances show the economic responsibility that belongs to you.</div></div>
    </div>
  );
}
''')

# ---------------------------------------------------------------------------
# Insights become responsibility-aware for spending, not cash-flow/net debt detail
# ---------------------------------------------------------------------------
insert_after('src/components/Insights.tsx', "import { UpcomingMoney } from './UpcomingMoney';\n", "import { getPersonalLiabilityExposure } from '../domain/loanSharing';\n")
replace_once(
    'src/components/Insights.tsx',
    "    setPayCardModalState\n  } = useAppContext();\n",
    "    setPayCardModalState,\n    personalExpenseRecords,\n    loanSharingRules\n  } = useAppContext();\n",
)
replace_once(
    'src/components/Insights.tsx',
    "  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0);\n",
    "  const totalLiabilities = liabilities.reduce((sum, a) => sum + getPersonalLiabilityExposure(a, loanSharingRules), 0);\n",
)
old_category = """    transactions.filter(t => {
      if (t.isOpeningBalance || t.is_verified === 0 || !isCashFlowTransaction(t) || t.type !== 'expense' || !isDateInCurrentCycle(t.date)) return false;
      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\\s+/g, '')}` === t.category || c.id === t.category);
      return catObj?.affordabilityClass !== 'SAVINGS' && catObj?.group !== 'Savings';
    }).forEach(tx => {
      totals[tx.category] = (totals[tx.category] || 0) + Math.abs(tx.amount);
      if (!titlesByCategory[tx.category]) {
        titlesByCategory[tx.category] = new Set();
      }
      titlesByCategory[tx.category].add(tx.title);
    });
"""
new_category = """    personalExpenseRecords.filter(record => {
      if (!isDateInCurrentCycle(record.date)) return false;
      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\\s+/g, '')}` === record.category || c.id === record.category);
      return catObj?.affordabilityClass !== 'SAVINGS' && catObj?.group !== 'Savings';
    }).forEach(record => {
      totals[record.category] = (totals[record.category] || 0) + Math.abs(record.amount);
      if (!titlesByCategory[record.category]) titlesByCategory[record.category] = new Set();
      titlesByCategory[record.category].add(record.title);
    });
"""
replace_once('src/components/Insights.tsx', old_category, new_category)
replace_once('src/components/Insights.tsx', "  }, [transactions, categories, isDateInCurrentCycle]);\n", "  }, [personalExpenseRecords, categories, isDateInCurrentCycle]);\n",)
replace_once(
    'src/components/Insights.tsx',
    "    transactions.filter(t => !t.isOpeningBalance && t.is_verified !== 0 && isCashFlowTransaction(t) && t.type === 'expense').forEach(t => set.add(t.category));\n",
    "    personalExpenseRecords.forEach(record => set.add(record.category));\n",
)
replace_once('src/components/Insights.tsx', "  }, [transactions, categories]);\n", "  }, [personalExpenseRecords, categories]);\n",)
old_trend = """      transactions.forEach(t => {
        if (t.isOpeningBalance || t.is_verified === 0 || t.type !== 'expense') return;
        const tCycle = getCycleDetails(t.date);
        if (tCycle.key === cycleKey) {
          if (selectedCategory === 'all') {
            cycleTotal += Math.abs(t.amount);
            count++;
          } else if (t.category === selectedCategory) {
            cycleTotal += Math.abs(t.amount);
            count++;
          }
        }
      });
"""
new_trend = """      personalExpenseRecords.forEach(record => {
        const recordCycle = getCycleDetails(record.date);
        if (recordCycle.key === cycleKey && (selectedCategory === 'all' || record.category === selectedCategory)) {
          cycleTotal += Math.abs(record.amount);
          count++;
        }
      });
"""
replace_once('src/components/Insights.tsx', old_trend, new_trend)
replace_once(
    'src/components/Insights.tsx',
    "    const catTxs = transactions.filter(t => \n      !t.isOpeningBalance && t.is_verified !== 0 && isCashFlowTransaction(t) && t.type === 'expense' && (selectedCategory === 'all' || t.category === selectedCategory)\n    );\n    const maxTx = catTxs.length > 0 \n      ? catTxs.reduce((max, t) => Math.abs(t.amount) > Math.abs(max.amount) ? t : max, catTxs[0])\n      : null;\n",
    "    const catTxs = personalExpenseRecords.filter(record => selectedCategory === 'all' || record.category === selectedCategory);\n    const maxTx = catTxs.length > 0 ? catTxs.reduce((max, record) => Math.abs(record.amount) > Math.abs(max.amount) ? record : max, catTxs[0]) : null;\n",
)
replace_once('src/components/Insights.tsx', "  }, [transactions, selectedCategory, getCycleDetails]);\n", "  }, [personalExpenseRecords, selectedCategory, getCycleDetails]);\n",)
replace_once(
    'src/components/Insights.tsx',
    "      .reduce((total, account) => total + (account.type === 'asset' ? account.balance : -account.balance), 0);\n",
    "      .reduce((total, account) => total + (account.type === 'asset' ? account.balance : -getPersonalLiabilityExposure(account, loanSharingRules)), 0);\n",
)
replace_once('src/components/Insights.tsx', "}, [transactions, accounts, formatCurrency, getCycleDetails, monthCycleDay]);\n", "}, [transactions, accounts, loanSharingRules, formatCurrency, getCycleDetails, monthCycleDay]);\n",)

# ---------------------------------------------------------------------------
# Dashboard: top liability exposure + spending alerts use economic spend
# ---------------------------------------------------------------------------
insert_after('src/components/Dashboard.tsx', "import { isCashFlowTransaction } from '../domain/ledgerRules';\n", "import { getPersonalLiabilityExposure } from '../domain/loanSharing';\n")
replace_once(
    'src/components/Dashboard.tsx',
    "  const { transactions, personalExpenseRecords, addTransaction, formatCurrency, setAddModalOpen, creditCards, deleteTransaction, approveTransaction, rejectTransaction, categories, profile, setEditingTransaction, isDateInCurrentCycle, getCycleDetails, netWorth, accounts, setAddAccountModalType, widgets, addWidget, removeWidget, monthCycleDay, setEditingAccount, setEditingCreditCard } = useAppContext();\n",
    "  const { transactions, personalExpenseRecords, loanSharingRules, addTransaction, formatCurrency, setAddModalOpen, creditCards, deleteTransaction, approveTransaction, rejectTransaction, categories, profile, setEditingTransaction, isDateInCurrentCycle, getCycleDetails, netWorth, accounts, setAddAccountModalType, widgets, addWidget, removeWidget, monthCycleDay, setEditingAccount, setEditingCreditCard } = useAppContext();\n",
)
replace_once(
    'src/components/Dashboard.tsx',
    "  const totalLiabilities = useMemo(() => accounts.filter(a => a.type === 'liability' && !a.is_archived).reduce((sum, a) => sum + a.balance, 0), [accounts]);\n",
    "  const totalLiabilities = useMemo(() => accounts.filter(a => a.type === 'liability' && !a.is_archived).reduce((sum, a) => sum + getPersonalLiabilityExposure(a, loanSharingRules), 0), [accounts, loanSharingRules]);\n",
)
old_expenses = """  const expenses = currentMonthTxs
    .filter(t => {
      if (t.type !== 'expense') return false;
      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\\s+/g, '')}` === t.category || c.id === t.category);
      return catObj?.group !== 'Savings';
    })
    .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);
"""
new_expenses = """  const expenses = personalExpenseRecords
    .filter(record => {
      if (!isDateInCurrentCycle(record.date)) return false;
      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\\s+/g, '')}` === record.category || c.id === record.category);
      return catObj?.group !== 'Savings';
    })
    .reduce((acc, record) => acc + Math.abs(record.amount), 0);
"""
replace_once('src/components/Dashboard.tsx', old_expenses, new_expenses)
old_spike = """  const spikedCategories = categories.filter(c => c.type !== 'income' && c.group !== 'Savings').map(c => {
    const catTag = `#${c.name.toLowerCase().replace(/\\s+/g, '')}`;
    const currAmount = currentMonthTxs.filter(t => t.type === 'expense' && (t.category === catTag || t.category === c.id)).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const lastMonthAmount = transactions.filter(t => {
      const d = new Date(t.date);
      return !t.isOpeningBalance && d >= sixtyDaysAgo && d < thirtyDaysAgo && isCashFlowTransaction(t) && t.type === 'expense' && (t.category === catTag || t.category === c.id);
    }).reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return { name: c.name, currAmount, lastMonthAmount, increase: lastMonthAmount > 0 ? ((currAmount - lastMonthAmount) / lastMonthAmount) * 100 : 0 };
  }).filter(c => c.lastMonthAmount > 0 && c.increase > 20).sort((a, b) => b.increase - a.increase);
"""
new_spike = """  const spikedCategories = categories.filter(c => c.type !== 'income' && c.group !== 'Savings').map(c => {
    const catTag = `#${c.name.toLowerCase().replace(/\\s+/g, '')}`;
    const currAmount = personalExpenseRecords.filter(record => isDateInCurrentCycle(record.date) && (record.category === catTag || record.category === c.id)).reduce((sum, record) => sum + Math.abs(record.amount), 0);
    const lastMonthAmount = personalExpenseRecords.filter(record => {
      const d = new Date(record.date);
      return d >= sixtyDaysAgo && d < thirtyDaysAgo && (record.category === catTag || record.category === c.id);
    }).reduce((sum, record) => sum + Math.abs(record.amount), 0);
    return { name: c.name, currAmount, lastMonthAmount, increase: lastMonthAmount > 0 ? ((currAmount - lastMonthAmount) / lastMonthAmount) * 100 : 0 };
  }).filter(c => c.lastMonthAmount > 0 && c.increase > 20).sort((a, b) => b.increase - a.increase);
"""
replace_once('src/components/Dashboard.tsx', old_spike, new_spike)

# ---------------------------------------------------------------------------
# Affordability UI: personal history + recurring shared responsibility
# ---------------------------------------------------------------------------
insert_after('src/components/AffordabilityPlanner.tsx', "import { CategoryAffordabilityReview } from './CategoryAffordabilityReview';\n", "import { personalExpenseRecordsToTransactions } from '../domain/personalSpending';\n")
replace_once(
    'src/components/AffordabilityPlanner.tsx',
    "  const { accounts, transactions, recurringRules, categories, creditCards, affordabilitySettings, savingsGoals, people, loanSharingRules, loanContributionRules, monthCycleDay, formatCurrency } = useAppContext();\n",
    "  const { accounts, transactions, recurringRules, categories, creditCards, affordabilitySettings, savingsGoals, people, loanSharingRules, loanContributionRules, personalExpenseRecords, sharedObligationTemplates, sharedTemplateResponsibilities, monthCycleDay, formatCurrency } = useAppContext();\n",
)
replace_once(
    'src/components/AffordabilityPlanner.tsx',
    "      loanContributionRules,\n      purchaseAmount: amount,\n",
    "      loanContributionRules,\n      sharedObligationTemplates,\n      sharedTemplateResponsibilities,\n      historicalSpendingTransactions: personalExpenseRecordsToTransactions(personalExpenseRecords),\n      purchaseAmount: amount,\n",
)
insert_before(
    'src/components/AffordabilityPlanner.tsx',
    "  const breakdownRows = result ? [\n",
    """  const selfPerson = people.find(person => person.isSelf && !person.isArchived);
  const sharedTemplateSources = sharedObligationTemplates.filter(template => template.isActive).map(template => {
    const myShare = selfPerson ? sharedTemplateResponsibilities.filter(row => row.templateId === template.id && row.personId === selfPerson.id).reduce((sum, row) => sum + row.amount, 0) : 0;
    return myShare > 0 ? `${template.title} · ${formatCurrency(myShare)} your ${template.frequency.toLowerCase()} share` : null;
  }).filter((value): value is string => Boolean(value));
""",
)
replace_once(
    'src/components/AffordabilityPlanner.tsx',
    "    { key: 'expenses', label: 'Known scheduled expenses', raw: Math.max(0, result.projection.expectedExpenses - result.projection.creditCardOutstandingReserve), sign: '-', sources: sourceProjection.items.filter(item => item.kind === 'OBLIGATION').map(item => `${item.date} · ${item.title} · ${formatCurrency(item.amount)}`) },\n",
    "    { key: 'expenses', label: 'Known scheduled expenses', raw: Math.max(0, result.projection.expectedExpenses - result.projection.creditCardOutstandingReserve), sign: '-', sources: [...sourceProjection.items.filter(item => item.kind === 'OBLIGATION').map(item => `${item.date} · ${item.title} · ${formatCurrency(item.amount)}`), ...sharedTemplateSources] },\n",
)

# ---------------------------------------------------------------------------
# Version and settings copy
# ---------------------------------------------------------------------------
for package_path in ['package.json', 'package-lock.json']:
    p = Path(package_path)
    s = p.read_text()
    p.write_text(s.replace('"version": "3.3.0"', '"version": "3.4.0"'))
replace_once('src/components/Settings.tsx', 'Coin Buddy V3.3', 'Coin Buddy V3.4')
replace_once(
    'src/components/Settings.tsx',
    "realistic v3.3 sample covering accounts, cards, loans, recurring schedules, pending confirmations, Events, Goals, SIPs, affordability and planning",
    "realistic v3.4 sample covering accounts, cards, shared household expenses, reimbursements, shared loans, recurring schedules, pending confirmations, Events, Goals, SIPs, affordability and planning",
)
replace_once(
    'src/components/Settings.tsx',
    "SQLite structure, foreign keys, ledger balances, net worth, recurring schedules, Investment SIP links, credit-card links, category classifications, Goals, and stored settings.",
    "SQLite structure, foreign keys, ledger balances, net worth, recurring schedules, shared obligations/settlements, shared loans, Investment SIP links, credit-card links, category classifications, Goals, and stored settings.",
)

# ---------------------------------------------------------------------------
# Demo data v3.4: every shared-finance path has realistic data
# ---------------------------------------------------------------------------
demo_path = Path('DemoData.json')
demo = json.loads(demo_path.read_text())
demo['schemaVersion'] = 'coinbuddy-demo-v3.4'
demo['version'] = 'v3.4_shared_finances_showcase'

def upsert_by_id(array_name, rows):
    existing = {str(item.get('id')): item for item in demo.get(array_name, []) if isinstance(item, dict) and item.get('id')}
    for row in rows:
        existing[str(row['id'])] = row
    demo[array_name] = list(existing.values())

upsert_by_id('transactions', [
    { 'id': 'tx_rent_reimbursement', 'title': 'Rohan Rent Reimbursement', 'subtitle': 'Shared settlement · not income', 'amount': 4000, 'dateOffsetDays': -7, 'category': '#settlement', 'icon': 'ArrowRightLeft', 'type': 'income', 'account': 'acc_sbi_01', 'toAccountId': 'acc_sbi_01', 'is_verified': 1, 'transaction_type': 'BALANCE_ADJUSTMENT', 'notes': 'Reimbursement for shared rent; excluded from income/spending.' },
    { 'id': 'tx_external_loan_principal', 'title': 'Rohan Direct Car Loan Principal', 'subtitle': 'Paid directly to lender', 'amount': 4000, 'dateOffsetDays': -1, 'category': '#external-loan', 'icon': 'Landmark', 'type': 'transfer', 'account': 'acc_bike_loan', 'toAccountId': 'acc_bike_loan', 'is_verified': 1, 'transaction_type': 'BALANCE_ADJUSTMENT', 'notes': 'External family loan payment principal component; no user cash moved.' },
])
demo['people'] = [
    { 'id': 'person_me', 'name': 'Arjun Rao', 'relationship': 'Self', 'isSelf': True, 'isArchived': False },
    { 'id': 'person_rohan', 'name': 'Rohan Rao', 'relationship': 'Brother', 'isSelf': False, 'isArchived': False },
    { 'id': 'person_maya', 'name': 'Maya Rao', 'relationship': 'Spouse', 'isSelf': False, 'isArchived': False },
]
demo['sharedObligations'] = [
    { 'id': 'obl_rent_demo', 'title': 'Apartment Rent', 'kind': 'EXPENSE', 'totalAmount': 22000, 'categoryId': 'cat_rent', 'dueOffsetDays': -14, 'transactionId': 'tx_rent', 'settlementMode': 'TRACK', 'status': 'OPEN', 'createdOffsetDays': -14 },
    { 'id': 'obl_grocery_external_demo', 'title': 'Family Groceries', 'kind': 'EXPENSE', 'totalAmount': 6000, 'categoryId': 'cat_groceries', 'dueOffsetDays': -2, 'settlementMode': 'TRACK', 'status': 'OPEN', 'createdOffsetDays': -2 },
]
demo['sharedResponsibilities'] = [
    { 'id': 'resp_rent_me', 'obligationId': 'obl_rent_demo', 'personId': 'person_me', 'amount': 12000 },
    { 'id': 'resp_rent_rohan', 'obligationId': 'obl_rent_demo', 'personId': 'person_rohan', 'amount': 10000 },
    { 'id': 'resp_grocery_me', 'obligationId': 'obl_grocery_external_demo', 'personId': 'person_me', 'amount': 3000 },
    { 'id': 'resp_grocery_maya', 'obligationId': 'obl_grocery_external_demo', 'personId': 'person_maya', 'amount': 3000 },
]
demo['sharedPayments'] = [
    { 'id': 'pay_rent_me', 'obligationId': 'obl_rent_demo', 'personId': 'person_me', 'transactionId': 'tx_rent', 'amount': 22000, 'source': 'TRACKED', 'paidOffsetDays': -14 },
    { 'id': 'pay_grocery_maya', 'obligationId': 'obl_grocery_external_demo', 'personId': 'person_maya', 'amount': 6000, 'source': 'EXTERNAL', 'paidOffsetDays': -2 },
]
demo['sharedSettlements'] = [
    { 'id': 'settle_rent_rohan', 'obligationId': 'obl_rent_demo', 'fromPersonId': 'person_rohan', 'toPersonId': 'person_me', 'transactionId': 'tx_rent_reimbursement', 'amount': 4000, 'settledOffsetDays': -7 },
]
demo['loanSharingRules'] = [
    { 'accountId': 'acc_bike_loan', 'personalResponsibilityPercent': 60, 'isShared': True },
]
demo['loanContributionRules'] = [
    { 'id': 'loan_contrib_me', 'accountId': 'acc_bike_loan', 'personId': 'person_me', 'mode': 'PERCENT', 'value': 60, 'isActive': True },
    { 'id': 'loan_contrib_rohan', 'accountId': 'acc_bike_loan', 'personId': 'person_rohan', 'mode': 'PERCENT', 'value': 40, 'isActive': True },
]
demo['sharedObligationTemplates'] = [
    { 'id': 'tmpl_family_utilities', 'title': 'Family Utilities', 'totalAmount': 4000, 'categoryId': 'cat_utilities', 'frequency': 'MONTHLY', 'nextDueOffsetDays': 12, 'isActive': True, 'settlementMode': 'TRACK', 'createdOffsetDays': -20 },
]
demo['sharedTemplateResponsibilities'] = [
    { 'id': 'tmpl_util_me', 'templateId': 'tmpl_family_utilities', 'personId': 'person_me', 'amount': 2500 },
    { 'id': 'tmpl_util_maya', 'templateId': 'tmpl_family_utilities', 'personId': 'person_maya', 'amount': 1500 },
]
demo['externalLoanContributions'] = [
    { 'id': 'ext_loan_rohan_demo', 'accountId': 'acc_bike_loan', 'personId': 'person_rohan', 'adjustmentTransactionId': 'tx_external_loan_principal', 'amount': 5000, 'principalAmount': 4000, 'interestAmount': 1000, 'paidOffsetDays': -1 },
]
demo_path.write_text(json.dumps(demo, indent=2, ensure_ascii=False) + '\n')

# ---------------------------------------------------------------------------
# Tests for final domain rules
# ---------------------------------------------------------------------------
Path('src/domain/v34SharedFinal.test.ts').write_text(r'''import { describe, expect, it } from 'vitest';
import type { Account, Category, Person, SharedObligation, SharedPayment, SharedResponsibility, SharedSettlement, SharedObligationTemplate, SharedTemplateResponsibility } from '../types';
import { getPersonNetClaim } from './sharedFinances';
import { projectAffordability } from './affordability';
import { personalExpenseRecordsToTransactions, type PersonalExpenseRecord } from './personalSpending';

const people: Person[] = [
  { id: 'me', name: 'Me', isSelf: true, isArchived: false },
  { id: 'brother', name: 'Brother', isSelf: false, isArchived: false },
];

describe('v3.4 final shared-finance rules', () => {
  it('reduces a fronted claim as reimbursements are settled without changing responsibility', () => {
    const obligation: SharedObligation = { id: 'rent', title: 'Rent', kind: 'EXPENSE', totalAmount: 22000, settlementMode: 'TRACK', status: 'OPEN', createdAt: '2026-08-01T00:00:00Z' };
    const responsibilities: SharedResponsibility[] = [
      { id: 'r1', obligationId: 'rent', personId: 'me', amount: 12000 },
      { id: 'r2', obligationId: 'rent', personId: 'brother', amount: 10000 },
    ];
    const payments: SharedPayment[] = [{ id: 'p1', obligationId: 'rent', personId: 'me', amount: 22000, source: 'TRACKED', paidAt: '2026-08-01T00:00:00Z' }];
    const settlements: SharedSettlement[] = [{ id: 's1', obligationId: 'rent', fromPersonId: 'brother', toPersonId: 'me', amount: 4000, settledAt: '2026-08-05T00:00:00Z' }];
    expect(getPersonNetClaim('rent', 'me', responsibilities, payments, settlements)).toBe(6000);
    expect(getPersonNetClaim('rent', 'brother', responsibilities, payments, settlements)).toBe(-6000);
  });

  it('protects only the users share of a recurring household obligation in affordability', () => {
    const bank: Account = { id: 'bank', name: 'Bank', type: 'asset', balance: 40000, group: 'Bank Account' };
    const category: Category = { id: 'utilities', name: 'Utilities', icon: 'Zap', type: 'expense', affordabilityClass: 'NORMAL' };
    const templates: SharedObligationTemplate[] = [{ id: 'template', title: 'Family Utilities', totalAmount: 4000, categoryId: 'utilities', frequency: 'MONTHLY', nextDueDate: '2026-09-05', isActive: true, settlementMode: 'TRACK', createdAt: '2026-08-01T00:00:00Z' }];
    const templateResponsibilities: SharedTemplateResponsibility[] = [
      { id: 'tr1', templateId: 'template', personId: 'me', amount: 2500 },
      { id: 'tr2', templateId: 'template', personId: 'brother', amount: 1500 },
    ];
    const result = projectAffordability({ asOfDate: '2026-08-13', endDate: '2026-09-30', accounts: [bank], transactions: [], recurringRules: [], categories: [category], creditCards: [], people, sharedObligationTemplates: templates, sharedTemplateResponsibilities: templateResponsibilities, settings: { plannedSavingsTarget: 0, contingencyBuffer: 0, protectedCashReserve: 0 }, purchaseAmount: 0 });
    expect(result.expectedExpenses).toBe(2500);
    expect(result.expensesByClass.NORMAL).toBe(2500);
  });

  it('converts economic spending history without leaking tracked cash amounts into estimators', () => {
    const records: PersonalExpenseRecord[] = [{ id: 'rent', source: 'SHARED_OBLIGATION', obligationId: 'rent', transactionId: 'cash-rent', title: 'Rent', category: 'rent', date: '2026-08-01T12:00:00Z', amount: 12000, cashAmount: 22000 }];
    const transactions = personalExpenseRecordsToTransactions(records);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(12000);
    expect(transactions[0].transaction_type).toBe('EXPENSE');
  });
});
''')

# Backup test: latest arrays survive.
insert_after(
    'src/__tests__/sharedBackupV34.test.ts',
    "    expect(migrated.loanContributionRules).toEqual([]);\n",
    "    expect(migrated.sharedObligationTemplates).toEqual([]);\n    expect(migrated.sharedTemplateResponsibilities).toEqual([]);\n    expect(migrated.externalLoanContributions).toEqual([]);\n",
)

# Update old demo test title and add a dedicated v3.4 browser test.
replace_once('e2e/demo-data-v33.spec.ts', "demo data loads a realistic v3.3 showcase", "demo data loads a realistic v3.4 showcase")
Path('e2e/v34-shared-finances.spec.ts').write_text(r'''import { expect, test, type Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const desktop = page.getByTitle(name);
  const mobile = page.getByRole('button', { name, exact: true });
  if (await desktop.isVisible()) await desktop.click(); else await mobile.click();
}

async function loadDemo(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await page.getByRole('button', { name: /Load demo data/i }).click();
  await expect(page.getByText('Load Demo Data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15000 });
}

test('v3.4 demo exposes shared obligations, settlements, recurring shares and shared loans', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await loadDemo(page);

  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Sharing', exact: true }).click();
  await expect(page.getByText('People & sharing', { exact: true })).toBeVisible();
  await expect(page.getByText(/Rohan Rao/).first()).toBeVisible();
  await expect(page.getByText(/Maya Rao/).first()).toBeVisible();

  const rent = page.getByRole('article', { name: 'Shared obligation Apartment Rent' });
  await expect(rent).toBeVisible();
  await expect(rent).toContainText('Your responsibility');
  await expect(rent).toContainText('You should receive');

  const groceries = page.getByRole('article', { name: 'Shared obligation Family Groceries' });
  await expect(groceries).toContainText('You still owe');

  await expect(page.getByText('Recurring shared expenses', { exact: true })).toBeVisible();
  await expect(page.getByText('Family Utilities', { exact: true })).toBeVisible();

  const loan = page.getByRole('article', { name: 'Shared loan Car Loan' });
  await expect(loan).toBeVisible();
  await expect(loan).toContainText(/personal exposure/i);
  await expect(loan).toContainText(/Rohan Rao/);
  await expect(loan).toContainText(/Direct lender payments/i);

  await openTab(page, 'Insights');
  await expect(page.getByText('Upcoming Money', { exact: true })).toBeVisible();

  await openTab(page, 'Settings');
  await expect(page.getByText('Coin Buddy V3.4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Verify Data Integrity/i }).click();
  await expect(page.getByText('Integrity Verified', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
''')

print('v3.4 final product patch applied')
