import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CalendarDays, ChevronDown, ChevronUp, PiggyBank } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { buildUpcomingMoneyProjection, type UpcomingMoneyKind } from '../domain/upcomingMoney';
import { getCycleDetailsForDay, getCycleRange, shiftCycle } from '../utils/cycles';

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const kindMeta: Record<UpcomingMoneyKind, { label: string; icon: typeof ArrowUpRight; classes: string }> = {
  INCOME: { label: 'Income', icon: ArrowDownLeft, classes: 'text-emerald-500 bg-emerald-500/10' },
  OBLIGATION: { label: 'Obligation', icon: ArrowUpRight, classes: 'text-rose-500 bg-rose-500/10' },
  SAVINGS: { label: 'Savings', icon: PiggyBank, classes: 'text-primary bg-primary/10' },
  TRANSFER: { label: 'Transfer', icon: ArrowRightLeft, classes: 'text-on-surface-variant bg-surface-container-highest' },
};

export function UpcomingMoney() {
  const { accounts, transactions, recurringRules, creditCards, savingsGoals, monthCycleDay, formatCurrency, getSpendableBalance } = useAppContext();
  const [expanded, setExpanded] = useState(true);
  const horizon = useMemo(() => {
    const today = new Date();
    const current = getCycleDetailsForDay(today.toISOString(), monthCycleDay);
    const next = shiftCycle(current.year, current.month, 1);
    const range = getCycleRange(next.year, next.month, monthCycleDay);
    return { asOfDate: localDateKey(today), startDate: localDateKey(range.start), endDate: localDateKey(range.end), label: `${range.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${range.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` };
  }, [monthCycleDay]);
  const planningAccounts = useMemo(() => accounts.map(account => account.type === 'asset' ? { ...account, balance: getSpendableBalance(account.id) } : account), [accounts, getSpendableBalance]);
  const projection = useMemo(() => buildUpcomingMoneyProjection({ ...horizon, accounts: planningAccounts, transactions, recurringRules, creditCards, savingsGoals }), [horizon, planningAccounts, transactions, recurringRules, creditCards, savingsGoals]);

  return (
    <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-low overflow-hidden shadow-sm" data-testid="upcoming-money">
      <button type="button" onClick={() => setExpanded(value => !value)} className="w-full p-5 sm:p-6 flex items-start justify-between gap-4 text-left">
        <div>
          <div className="flex items-center gap-2 text-primary"><CalendarDays className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">Upcoming Money</span></div>
          <h3 className="mt-2 text-xl sm:text-2xl font-bold text-on-surface">Your next financial cycle at a glance</h3>
          <p className="mt-1 text-sm text-on-surface-variant">{horizon.label} · recurring income, bills, EMIs, card dues, SIPs and Goal contributions.</p>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 shrink-0 text-on-surface-variant" /> : <ChevronDown className="h-5 w-5 shrink-0 text-on-surface-variant" />}
      </button>
      {expanded && <div className="border-t border-outline-variant/20 p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ['Liquid cash now', projection.totals.openingLiquidCash],
            ['Expected income', projection.totals.expectedIncome],
            ['Known obligations', projection.totals.obligations],
            ['Planned savings', projection.totals.savings],
            ['Projected free cash', projection.totals.projectedFreeCash],
          ].map(([label, value], index) => <div key={String(label)} className={`${index === 4 ? 'col-span-2 lg:col-span-1 border-primary/25 bg-primary/5' : 'border-outline-variant/20 bg-surface-container'} min-w-0 rounded-2xl border p-3.5`}><span className="text-xs text-on-surface-variant">{label}</span><strong className="mt-1 block truncate font-numeric text-lg text-on-surface">{formatCurrency(Number(value))}</strong></div>)}
        </div>

        {projection.warnings.length > 0 && <div className="space-y-2">{projection.warnings.slice(0, 4).map(warning => <div key={warning} className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-on-surface"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span>{warning}</span></div>)}</div>}

        <div className="space-y-2">
          {projection.items.length === 0 ? <div className="rounded-2xl border border-dashed border-outline-variant/40 p-6 text-center text-sm text-on-surface-variant">No known scheduled money movements in this next cycle yet.</div> : projection.items.map(item => {
            const meta = kindMeta[item.kind];
            const Icon = meta.icon;
            return <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container px-3.5 py-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.classes}`}><Icon className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-on-surface">{item.title}</p>{item.status === 'NEEDS_CONFIRMATION' && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-500">Needs confirmation</span>}</div><p className="mt-0.5 text-xs text-on-surface-variant">{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {meta.label}</p></div>
              <span className={`shrink-0 font-numeric text-sm font-bold ${item.kind === 'INCOME' ? 'text-emerald-500' : item.kind === 'TRANSFER' ? 'text-on-surface-variant' : 'text-on-surface'}`}>{item.kind === 'INCOME' ? '+' : item.kind === 'TRANSFER' ? '' : '-'}{formatCurrency(item.amount)}</span>
            </div>;
          })}
        </div>
        {projection.totals.transfers > 0 && <p className="text-xs leading-relaxed text-on-surface-variant">Internal liquid-account transfers are shown in the timeline but do not reduce projected free cash. Transfers into investments or Goals are treated as planned savings.</p>}
      </div>}
    </section>
  );
}
