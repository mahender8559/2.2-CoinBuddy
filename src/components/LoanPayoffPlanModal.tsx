import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, LockKeyhole, Target, UsersRound, WalletCards, X } from 'lucide-react';
import type { Account, LoanPayoffHoldingType } from '../types';
import { useAppContext } from '../context/AppContext';
import { getLoanPayoffFundingSummary, loanPayoffMovementDelta } from '../domain/loanPayoff';
import { CurrencyInput } from './CurrencyInput';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function LoanPayoffPlanModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const {
    accounts, people, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements,
    saveLoanPayoffPlan, reserveLoanPayoffFunds, releaseLoanPayoffFunds, cancelLoanPayoffPlan, completeLoanPayoffPlan,
    getSpendableBalance, formatCurrency,
  } = useAppContext();
  const plan = account ? loanPayoffPlans.find(item => item.liabilityAccountId === account.id && item.status === 'ACTIVE') : undefined;
  const activePeople = people.filter(person => !person.isArchived);
  const assetAccounts = accounts.filter(item => item.type === 'asset' && !item.is_archived);
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [payoffType, setPayoffType] = useState<'PARTIAL' | 'FULL'>('PARTIAL');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [reservePersonId, setReservePersonId] = useState('');
  const [holdingType, setHoldingType] = useState<LoanPayoffHoldingType>('TRACKED');
  const [assetAccountId, setAssetAccountId] = useState('');
  const [reserveAmount, setReserveAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!account) return;
    const in60 = new Date(); in60.setDate(in60.getDate() + 60);
    setTargetAmount(String(plan?.targetAmount ?? ''));
    setTargetDate(plan?.targetDate ?? in60.toISOString().slice(0, 10));
    setPayoffType(plan?.payoffType ?? 'PARTIAL');
    const next: Record<string, string> = {};
    for (const person of activePeople) {
      const row = plan ? loanPayoffResponsibilities.find(item => item.planId === plan.id && item.personId === person.id) : undefined;
      next[person.id] = row ? String(row.targetAmount) : '';
    }
    if (!plan) {
      const me = activePeople.find(person => person.isSelf);
      if (me) next[me.id] = '';
    }
    setAllocations(next);
    setReservePersonId(activePeople.find(person => person.isSelf)?.id ?? activePeople[0]?.id ?? '');
    setAssetAccountId(assetAccounts[0]?.id ?? '');
    setReserveAmount(''); setError('');
  }, [account?.id, plan?.id]);

  const positions = useMemo(() => {
    if (!plan) return [] as Array<{ key: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }>;
    const map = new Map<string, { key: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }>();
    for (const movement of loanPayoffFundMovements.filter(item => item.planId === plan.id)) {
      const key = `${movement.personId}|${movement.holdingType}|${movement.assetAccountId ?? ''}`;
      const current = map.get(key) ?? { key, personId: movement.personId, holdingType: movement.holdingType, assetAccountId: movement.assetAccountId, amount: 0 };
      current.amount += loanPayoffMovementDelta(movement);
      map.set(key, current);
    }
    return [...map.values()].filter(item => item.amount > 0.009);
  }, [plan?.id, loanPayoffFundMovements]);
  const summary = plan ? getLoanPayoffFundingSummary(plan, loanPayoffResponsibilities, loanPayoffFundMovements) : undefined;
  if (!account) return null;

  const savePlan = async () => {
    setError('');
    const target = Number(targetAmount);
    const rows = activePeople.map(person => ({ personId: person.id, targetAmount: Number(allocations[person.id] || 0) })).filter(row => row.targetAmount > 0);
    if (!Number.isFinite(target) || target <= 0) return setError('Enter a payoff target greater than zero.');
    if (!targetDate) return setError('Choose a target date.');
    const total = rows.reduce((sum, row) => sum + row.targetAmount, 0);
    if (Math.abs(total - target) > 0.009) return setError(`Contributor targets must total ${formatCurrency(target)}. Current total is ${formatCurrency(total)}.`);
    const ok = await saveLoanPayoffPlan({ id: plan?.id, liabilityAccountId: account.id, targetAmount: target, targetDate, payoffType, responsibilities: rows });
    if (!ok) setError('The payoff plan could not be saved.');
  };

  const addReserve = async () => {
    setError('');
    const amount = Number(reserveAmount);
    if (!plan) return setError('Save the payoff plan before reserving funds.');
    if (!reservePersonId || !Number.isFinite(amount) || amount <= 0) return setError('Choose a contributor and enter a reserve amount.');
    if (holdingType === 'TRACKED' && !assetAccountId) return setError('Choose the account holding these funds.');
    const ok = await reserveLoanPayoffFunds({ planId: plan.id, personId: reservePersonId, holdingType, assetAccountId: holdingType === 'TRACKED' ? assetAccountId : undefined, amount });
    if (ok) setReserveAmount(''); else setError('The reserve could not be saved. Check the contributor target and available balance.');
  };

  return <V35ModalFrame size="lg" testId="loan-payoff-plan-sheet" labelledBy="loan-payoff-plan-title" panelClassName="p-0">
    <div className="flex h-14 items-center border-b border-outline-variant/25 px-4"><div className="min-w-0 flex-1"><h2 id="loan-payoff-plan-title" className="text-sm font-semibold text-on-surface">Loan Payoff Plan</h2><p className="truncate text-[10px] text-on-surface-variant">{account.name}</p></div><button aria-label="Close loan payoff plan" onClick={onClose} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant"><X className="h-4 w-4" /></button></div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
      {error ? <div role="alert" className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div> : null}
      <section className="v35-surface rounded-2xl p-4"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-on-surface">Target</h3></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-on-surface-variant">Payoff type<select value={payoffType} onChange={e => { const next = e.target.value as 'PARTIAL' | 'FULL'; setPayoffType(next); if (next === 'FULL') setTargetAmount(String(account.balance)); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface"><option value="PARTIAL">Partial lump sum</option><option value="FULL">Full payoff target</option></select></label><label className="text-xs text-on-surface-variant">Target amount<div className="mt-1.5"><CurrencyInput aria-label="Payoff target amount" value={targetAmount} onValueChange={setTargetAmount} /></div></label><label className="text-xs text-on-surface-variant sm:col-span-2">Target date<div className="relative mt-1.5"><input aria-label="Payoff target date" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface" /><CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /></div></label></div></section>

      <section className="v35-surface rounded-2xl p-4"><div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-on-surface">Contributor targets</h3></div><p className="mt-1 text-xs text-on-surface-variant">This split is separate from loan ownership and normal EMI contribution.</p><div className="mt-3 space-y-2">{activePeople.map(person => <label key={person.id} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3 rounded-xl bg-surface-container px-3 py-2"><span className="text-sm text-on-surface">{person.name}{person.isSelf ? ' (You)' : ''}</span><CurrencyInput aria-label={`${person.name} payoff target`} value={allocations[person.id] ?? ''} onValueChange={value => setAllocations(current => ({ ...current, [person.id]: value }))} /></label>)}</div><button type="button" onClick={() => { void savePlan(); }} className="v35-focus-ring mt-4 min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-white">{plan ? 'Update payoff plan' : 'Create payoff plan'}</button></section>

      {plan && summary ? <>
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-primary"><LockKeyhole className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Reserved funds</span></div><strong className="mt-2 block text-2xl font-numeric text-on-surface">{formatCurrency(summary.reserved)}</strong><p className="mt-1 text-xs text-on-surface-variant">of {formatCurrency(summary.target)} · {summary.progress.toFixed(0)}% ready</p></div>{summary.funded ? <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Funded</span> : null}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high"><div className="h-full rounded-full bg-primary" style={{ width: `${summary.progress}%` }} /></div><p className="mt-2 text-xs text-on-surface-variant">{formatCurrency(summary.remaining)} still needs to be reserved.</p></section>

        <section className="v35-surface rounded-2xl p-4"><div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-on-surface">Reserve more</h3></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-on-surface-variant">Contributor<select value={reservePersonId} onChange={e => setReservePersonId(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface">{activePeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="text-xs text-on-surface-variant">Where is the money?<select value={holdingType} onChange={e => setHoldingType(e.target.value as LoanPayoffHoldingType)} className="mt-1.5 min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface"><option value="TRACKED">In one of my tracked accounts</option><option value="EXTERNAL">Held externally by contributor</option></select></label>{holdingType === 'TRACKED' ? <label className="text-xs text-on-surface-variant sm:col-span-2">Holding account<select value={assetAccountId} onChange={e => setAssetAccountId(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface">{assetAccounts.map(item => <option key={item.id} value={item.id}>{item.name} · spendable {formatCurrency(getSpendableBalance(item.id))}</option>)}</select></label> : <p className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs leading-5 text-on-surface-variant sm:col-span-2">External reserve records readiness only. It does not create a fake transaction in your bank account or count as income.</p>}<label className="text-xs text-on-surface-variant sm:col-span-2">Amount<div className="mt-1.5"><CurrencyInput aria-label="Reserve amount" value={reserveAmount} onValueChange={setReserveAmount} /></div></label></div><button type="button" onClick={() => { void addReserve(); }} className="v35-focus-ring mt-4 min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-white">Reserve funds</button></section>

        <section className="v35-surface rounded-2xl p-4"><h3 className="text-sm font-semibold text-on-surface">Current reservations</h3><div className="mt-3 space-y-2">{positions.length ? positions.map(position => { const person = people.find(item => item.id === position.personId); const asset = position.assetAccountId ? accounts.find(item => item.id === position.assetAccountId) : undefined; return <div key={position.key} className="flex items-center gap-3 rounded-xl bg-surface-container px-3 py-2.5"><LockKeyhole className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-on-surface">{person?.name ?? 'Contributor'} · {asset?.name ?? 'Held externally'}</p><p className="text-[10px] text-on-surface-variant">{position.holdingType === 'TRACKED' ? 'Blocked from normal spending in CoinBuddy' : 'External readiness only'}</p></div><span className="font-numeric text-sm font-semibold text-on-surface">{formatCurrency(position.amount)}</span><button type="button" onClick={() => { void releaseLoanPayoffFunds({ planId: plan.id, personId: position.personId, holdingType: position.holdingType, assetAccountId: position.assetAccountId, amount: position.amount }); }} className="v35-focus-ring rounded-lg px-2 py-1 text-[10px] font-semibold text-amber-400">Release</button></div>; }) : <p className="py-4 text-center text-xs text-on-surface-variant">No funds reserved yet.</p>}</div></section>

        <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => { void cancelLoanPayoffPlan(plan.id).then(ok => { if (ok) onClose(); }); }} className="v35-focus-ring min-h-11 rounded-xl border border-red-500/25 text-xs font-semibold text-red-300">Cancel plan</button><button type="button" disabled={summary.reserved > 0.009} onClick={() => { void completeLoanPayoffPlan(plan.id).then(ok => { if (ok) onClose(); }); }} className="v35-focus-ring min-h-11 rounded-xl border border-emerald-500/25 text-xs font-semibold text-emerald-300 disabled:opacity-40">Mark completed</button></div>
      </> : null}
    </div>
  </V35ModalFrame>;
}
