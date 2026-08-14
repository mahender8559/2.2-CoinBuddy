import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, CreditCard, PieChart as PieIcon, ShieldCheck, Sparkles, Target, WalletCards } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useAppContext } from '../context/AppContext';
import { AnimatedNumber } from './AnimatedNumber';
import { AffordabilityPlanner } from './AffordabilityPlanner';
import { UpcomingMoney } from './UpcomingMoney';
import { LoanAmortizationExplorer } from './LoanAmortizationExplorer';
import { Insights as DeepInsights } from './Insights';
import { getPersonalLiabilityExposure } from '../domain/loanSharing';
import { isCashFlowTransaction } from '../domain/ledgerRules';
import { IconBadge, MoneyValue, StatusPill } from './ui/V35';

type InsightView = 'overview' | 'planning' | 'debt' | 'advanced';

const CHART_COLORS = ['#4c8dff', '#a855f7', '#22c55e', '#fbbf24', '#ff6668', '#64748b'];

export function V35Insights() {
  const {
    accounts,
    transactions,
    personalExpenseRecords,
    categories,
    savingsGoals,
    loanSharingRules,
    formatCurrency,
    isDateInCurrentCycle,
    getCycleDetails,
  } = useAppContext();
  const [view, setView] = useState<InsightView>('overview');

  const assetTotal = useMemo(() => accounts
    .filter(account => !account.is_archived && account.type === 'asset')
    .reduce((sum, account) => sum + Number(account.balance || 0), 0), [accounts]);
  const liabilityTotal = useMemo(() => accounts
    .filter(account => !account.is_archived && account.type === 'liability')
    .reduce((sum, account) => sum + getPersonalLiabilityExposure(account, loanSharingRules), 0), [accounts, loanSharingRules]);
  const netWorth = assetTotal - liabilityTotal;

  const cycleIncome = useMemo(() => transactions
    .filter(transaction => transaction.is_verified !== 0 && !transaction.isOpeningBalance && transaction.type === 'income' && isCashFlowTransaction(transaction) && isDateInCurrentCycle(transaction.date))
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0), [transactions, isDateInCurrentCycle]);

  const cycleSpending = useMemo(() => personalExpenseRecords
    .filter(record => isDateInCurrentCycle(record.date))
    .reduce((sum, record) => sum + Math.abs(record.amount), 0), [personalExpenseRecords, isDateInCurrentCycle]);

  const spendingByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    personalExpenseRecords.filter(record => isDateInCurrentCycle(record.date)).forEach(record => {
      const category = categories.find(item => item.id === record.category || `#${item.name.toLowerCase().replace(/\s+/g, '')}` === record.category);
      const fallbackName = record.category.replace(/^#/, '') || 'Other';
      const name = category?.name ?? fallbackName;
      totals.set(name, (totals.get(name) ?? 0) + Math.abs(record.amount));
    });
    return [...totals.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [personalExpenseRecords, categories, isDateInCurrentCycle]);

  const cycleComparison = useMemo(() => {
    const current = getCycleDetails(new Date().toISOString());
    let previousMonth = current.month - 1;
    let previousYear = current.year;
    if (previousMonth < 0) { previousMonth = 11; previousYear -= 1; }
    const previousKey = `${previousYear}-${previousMonth}`;
    const previousSpend = personalExpenseRecords
      .filter(record => getCycleDetails(record.date).key === previousKey)
      .reduce((sum, record) => sum + Math.abs(record.amount), 0);
    const delta = previousSpend > 0 ? ((cycleSpending - previousSpend) / previousSpend) * 100 : 0;
    return { previousSpend, delta };
  }, [personalExpenseRecords, getCycleDetails, cycleSpending]);

  const activeGoals = useMemo(() => savingsGoals.filter(goal => goal.isActive), [savingsGoals]);
  const monthlyGoalProtection = activeGoals.reduce((sum, goal) => sum + Number(goal.monthlyContribution || 0), 0);
  const activeDebts = useMemo(() => accounts.filter(account => !account.is_archived && account.type === 'liability' && account.balance > 0), [accounts]);

  const viewButton = (id: InsightView, label: string) => (
    <button
      type="button"
      onClick={() => setView(id)}
      aria-pressed={view === id}
      className={`v35-focus-ring min-h-9 shrink-0 rounded-lg px-3.5 text-xs font-semibold transition-colors ${view === id ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
    >
      {label}
    </button>
  );

  return (
    <section data-testid="page-insights" className="w-full space-y-5 pb-24 md:pb-0 animate-fade-in">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">Insights</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">See the signal first. Open the deeper planners and analytics only when you need them.</p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-outline-variant/25 bg-surface-container-low p-1">
          {viewButton('overview', 'Overview')}
          {viewButton('planning', 'Planning')}
          {viewButton('debt', 'Debt')}
          {viewButton('advanced', 'Advanced')}
        </div>
      </header>

      {view === 'overview' ? (
        <div className="space-y-4" data-testid="insights-overview">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <article className="v35-surface rounded-2xl p-4">
              <div className="flex items-center gap-2 text-primary"><IconBadge icon={WalletCards} size="sm" /><span className="text-xs font-semibold text-on-surface-variant">Net worth</span></div>
              <MoneyValue className="mt-3 block text-xl font-semibold text-on-surface sm:text-2xl"><AnimatedNumber value={netWorth} format={formatCurrency} /></MoneyValue>
              <p className="mt-1 text-[11px] text-on-surface-variant">Assets minus your liability exposure</p>
            </article>
            <article className="v35-surface rounded-2xl p-4">
              <div className="flex items-center gap-2"><IconBadge icon={ArrowUpRight} tone="green" size="sm" /><span className="text-xs font-semibold text-on-surface-variant">Cycle income</span></div>
              <MoneyValue className="mt-3 block text-xl font-semibold text-[var(--cb-green)] sm:text-2xl"><AnimatedNumber value={cycleIncome} format={formatCurrency} /></MoneyValue>
              <p className="mt-1 text-[11px] text-on-surface-variant">Verified cash-flow income</p>
            </article>
            <article className="v35-surface rounded-2xl p-4">
              <div className="flex items-center gap-2"><IconBadge icon={ArrowDownRight} tone="red" size="sm" /><span className="text-xs font-semibold text-on-surface-variant">Personal spending</span></div>
              <MoneyValue className="mt-3 block text-xl font-semibold text-[var(--cb-red)] sm:text-2xl"><AnimatedNumber value={cycleSpending} format={formatCurrency} /></MoneyValue>
              <p className="mt-1 text-[11px] text-on-surface-variant">Economic cost after shared splits</p>
            </article>
            <article className="v35-surface rounded-2xl p-4">
              <div className="flex items-center gap-2"><IconBadge icon={Target} tone="purple" size="sm" /><span className="text-xs font-semibold text-on-surface-variant">Goal protection</span></div>
              <MoneyValue className="mt-3 block text-xl font-semibold text-on-surface sm:text-2xl">{formatCurrency(monthlyGoalProtection)}</MoneyValue>
              <p className="mt-1 text-[11px] text-on-surface-variant">{activeGoals.length} active {activeGoals.length === 1 ? 'goal' : 'goals'}</p>
            </article>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
            <article className="v35-surface rounded-2xl p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><PieIcon className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold text-on-surface">Spending overview</h2></div>
                  <p className="mt-1 text-xs text-on-surface-variant">Your personal economic spending for the current cycle.</p>
                </div>
                {cycleComparison.previousSpend > 0 ? <StatusPill tone={cycleComparison.delta <= 0 ? 'positive' : 'negative'}>{cycleComparison.delta <= 0 ? '↓' : '↑'} {Math.abs(cycleComparison.delta).toFixed(1)}%</StatusPill> : null}
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-[210px_1fr] sm:items-center">
                <div className="relative mx-auto h-48 w-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={spendingByCategory.slice(0, 6)} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} strokeWidth={0} paddingAngle={2} isAnimationActive={false}>
                        {spendingByCategory.slice(0, 6).map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ background: '#0e1b2e', border: '1px solid #203047', borderRadius: 12, color: '#f8fafc' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <MoneyValue className="text-base font-semibold text-on-surface">{formatCurrency(cycleSpending)}</MoneyValue>
                    <span className="mt-0.5 text-[10px] text-on-surface-variant">Total spent</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {spendingByCategory.slice(0, 6).map((item, index) => {
                    const pct = cycleSpending > 0 ? item.value / cycleSpending * 100 : 0;
                    return <div key={item.name} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.02]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} /><span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">{item.name}</span><MoneyValue className="text-xs font-semibold text-on-surface">{formatCurrency(item.value)}</MoneyValue><span className="w-10 text-right text-[10px] text-on-surface-variant">{pct.toFixed(0)}%</span></div>;
                  })}
                  {spendingByCategory.length === 0 ? <p className="py-8 text-center text-sm text-on-surface-variant">No personal spending in this cycle yet.</p> : null}
                </div>
              </div>
            </article>

            <div className="space-y-4">
              <article className="v35-surface rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <IconBadge icon={Sparkles} tone={cycleComparison.delta <= 0 ? 'green' : 'amber'} />
                  <div>
                    <h2 className="text-base font-semibold text-on-surface">Cycle check-in</h2>
                    {cycleComparison.previousSpend > 0 ? (
                      <p className="mt-1 text-sm leading-6 text-on-surface-variant">You spent <MoneyValue className="font-semibold text-on-surface">{formatCurrency(Math.abs(cycleSpending - cycleComparison.previousSpend))}</MoneyValue> {cycleComparison.delta <= 0 ? 'less' : 'more'} than the previous cycle.</p>
                    ) : <p className="mt-1 text-sm leading-6 text-on-surface-variant">There is not enough previous-cycle spending yet for a meaningful comparison.</p>}
                  </div>
                </div>
              </article>
              <article className="v35-surface rounded-2xl p-5">
                <div className="flex items-start gap-3"><IconBadge icon={ShieldCheck} tone="blue" /><div><h2 className="text-base font-semibold text-on-surface">Financial position</h2><p className="mt-1 text-sm leading-6 text-on-surface-variant"><MoneyValue className="font-semibold text-on-surface">{formatCurrency(assetTotal)}</MoneyValue> in assets and <MoneyValue className="font-semibold text-on-surface">{formatCurrency(liabilityTotal)}</MoneyValue> of personal liability exposure.</p></div></div>
              </article>
              <button type="button" onClick={() => setView('planning')} className="v35-focus-ring flex min-h-12 w-full items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 px-4 text-left text-sm font-semibold text-primary hover:bg-primary/10"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Open affordability planning</span><ArrowUpRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      ) : null}

      {view === 'planning' ? <div className="space-y-5" data-testid="insights-planning"><UpcomingMoney /><AffordabilityPlanner /></div> : null}

      {view === 'debt' ? (
        <div className="space-y-4" data-testid="insights-debt">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <article className="v35-surface rounded-2xl p-4"><span className="text-xs text-on-surface-variant">Personal debt exposure</span><MoneyValue className="mt-2 block text-xl font-semibold text-[var(--cb-red)]">{formatCurrency(liabilityTotal)}</MoneyValue></article>
            <article className="v35-surface rounded-2xl p-4"><span className="text-xs text-on-surface-variant">Active liabilities</span><MoneyValue className="mt-2 block text-xl font-semibold text-on-surface">{activeDebts.length}</MoneyValue></article>
            <article className="v35-surface rounded-2xl p-4"><span className="text-xs text-on-surface-variant">Largest balance</span><MoneyValue className="mt-2 block text-xl font-semibold text-on-surface">{formatCurrency(Math.max(0, ...activeDebts.map(account => getPersonalLiabilityExposure(account, loanSharingRules))))}</MoneyValue></article>
            <article className="v35-surface rounded-2xl p-4"><span className="text-xs text-on-surface-variant">Debt status</span><div className="mt-2 flex items-center gap-2"><IconBadge icon={CreditCard} tone={activeDebts.length ? 'red' : 'green'} size="sm" /><span className="text-sm font-semibold text-on-surface">{activeDebts.length ? 'In repayment' : 'Debt free'}</span></div></article>
          </div>
          <LoanAmortizationExplorer />
        </div>
      ) : null}

      {view === 'advanced' ? (
        <div data-testid="insights-advanced" className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4"><IconBadge icon={BarChart3} /><div><h2 className="text-sm font-semibold text-on-surface">Advanced analytics</h2><p className="mt-1 text-xs leading-5 text-on-surface-variant">Detailed category trends, cash-flow Sankey, asset allocation, debt projections, event summaries and net-worth trajectory remain available here.</p></div></div>
          <DeepInsights embedded />
        </div>
      ) : null}
    </section>
  );
}
