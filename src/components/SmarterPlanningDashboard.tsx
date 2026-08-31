import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CircleDollarSign, Landmark, PiggyBank, TrendingUp, WalletCards } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { loanPayoffPlansToPlanningGoals } from '../domain/loanPayoff';
import { buildSmarterPlanningReport, compareDebtPrepayment, simulatePurchaseAcrossHorizons, type ForecastHorizon } from '../domain/smarterPlanning';
import { CurrencyInput } from './CurrencyInput';
import { IconBadge, MoneyValue, StatusPill } from './ui/V35';

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function SmarterPlanningDashboard() {
  const { accounts, transactions, recurringRules, creditCards, savingsGoals, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements, formatCurrency, getSpendableBalance } = useAppContext();
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const planningAccounts = useMemo(() => accounts.map(account => account.type === 'asset' ? { ...account, balance: getSpendableBalance(account.id) } : account), [accounts, getSpendableBalance]);
  const planningGoals = useMemo(() => [...savingsGoals, ...loanPayoffPlansToPlanningGoals(loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements)], [savingsGoals, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements]);
  const liabilities = useMemo(() => accounts.filter(account => account.type === 'liability' && account.is_archived !== 1 && account.balance > 0), [accounts]);
  const [debtId, setDebtId] = useState('');
  const [extraPayment, setExtraPayment] = useState('');
  const report = useMemo(() => buildSmarterPlanningReport({ asOfDate: localDateKey(new Date()), accounts: planningAccounts, transactions, recurringRules, creditCards, savingsGoals: planningGoals }), [planningAccounts, transactions, recurringRules, creditCards, planningGoals]);
  const purchase = useMemo(() => simulatePurchaseAcrossHorizons(report, Number(purchaseAmount)), [report, purchaseAmount]);
  const selectedDebt = liabilities.find(account => account.id === debtId) ?? liabilities[0];
  const debtComparison = selectedDebt ? compareDebtPrepayment(selectedDebt, Number(extraPayment)) : null;

  const buckets = [
    { label: 'Liquid cash', value: report.moneyPosition.liquidCash, icon: WalletCards, description: 'Cash and bank money available now' },
    { label: 'Invested wealth', value: report.moneyPosition.investedWealth, icon: TrendingUp, description: 'Investments, excluded from spendable cash' },
    { label: 'Physical wealth', value: report.moneyPosition.physicalWealth, icon: Landmark, description: 'Other non-liquid assets' },
    { label: 'Committed (30 days)', value: report.moneyPosition.committedNext30Days, icon: CalendarClock, description: 'Bills, savings and known outflows' },
    { label: 'Available to spend', value: report.moneyPosition.availableToSpend, icon: CircleDollarSign, description: 'Projected cash after known commitments' },
  ];

  return (
    <section className="v35-surface space-y-5 rounded-3xl p-5 sm:p-6" data-testid="smarter-planning">
      <div className="flex items-start gap-3">
        <IconBadge icon={TrendingUp} tone="blue" />
        <div><p className="text-xs font-bold uppercase tracking-wider text-primary">V3.7 smarter planning</p><h2 className="mt-1 text-xl font-bold text-on-surface sm:text-2xl">See pressure before it reaches your balance</h2><p className="mt-1 text-sm text-on-surface-variant">Forecasts use your current liquid accounts, pending entries, recurring rules, card dues, EMIs and Goals.</p></div>
      </div>

      {report.warnings.length > 0 ? <div className="space-y-2">{report.warnings.slice(0, 4).map(warning => <div key={warning} className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-on-surface"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span>{warning}</span></div>)}</div> : <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-500">No cash shortage is visible in the next 90 days from currently known commitments.</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        {([7, 30, 90] as ForecastHorizon[]).map(days => {
          const item = report.forecasts[days];
          return <article key={days} className={`rounded-2xl border p-4 ${item.shortageDate ? 'border-amber-500/30 bg-amber-500/5' : 'border-outline-variant/20 bg-surface-container'}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-on-surface">Next {days} days</span><StatusPill tone={item.shortageDate ? 'warning' : 'positive'}>{item.shortageDate ? 'Shortage risk' : 'Covered'}</StatusPill></div><MoneyValue className="mt-3 block text-xl font-semibold text-on-surface">{formatCurrency(item.closingLiquidCash)}</MoneyValue><p className="mt-1 text-xs text-on-surface-variant">Projected closing liquid cash</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-on-surface-variant"><span>Income<br/><strong className="font-numeric text-emerald-500">+{formatCurrency(item.expectedIncome)}</strong></span><span>Outflow<br/><strong className="font-numeric text-on-surface">-{formatCurrency(item.expectedOutflow)}</strong></span></div></article>;
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{buckets.map(bucket => <article key={bucket.label} className={`${bucket.label === 'Available to spend' ? 'col-span-2 border-primary/25 bg-primary/5 lg:col-span-1' : 'border-outline-variant/20 bg-surface-container'} rounded-2xl border p-3.5`}><bucket.icon className="h-4 w-4 text-primary" /><span className="mt-2 block text-xs text-on-surface-variant">{bucket.label}</span><MoneyValue className="mt-1 block text-lg font-semibold text-on-surface">{formatCurrency(bucket.value)}</MoneyValue><p className="mt-1 text-[10px] leading-4 text-on-surface-variant">{bucket.description}</p></article>)}</div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4">
          <div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-on-surface">“If I buy this…” scenario</h3></div>
          <div className="mt-3"><CurrencyInput aria-label="Scenario purchase amount" value={purchaseAmount} onValueChange={setPurchaseAmount} placeholder="Purchase amount" /></div>
          <div className="mt-3 grid grid-cols-3 gap-2">{([7, 30, 90] as ForecastHorizon[]).map(days => <div key={days} className="rounded-xl bg-surface-container-low p-2.5 text-center"><span className="text-[10px] text-on-surface-variant">Day {days}</span><MoneyValue className={`mt-1 block text-xs font-semibold ${purchase[days].shortageAmount > 0 ? 'text-amber-500' : 'text-on-surface'}`}>{formatCurrency(purchase[days].closingLiquidCash)}</MoneyValue>{purchase[days].shortageAmount > 0 ? <span className="mt-1 block text-[9px] text-amber-500">short {formatCurrency(purchase[days].shortageAmount)}</span> : null}</div>)}</div>
        </article>

        <article className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4">
          <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-on-surface">EMI prepayment comparison</h3></div>
          {liabilities.length ? <><select aria-label="Debt to compare" value={selectedDebt?.id ?? ''} onChange={event => setDebtId(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 text-sm text-on-surface">{liabilities.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><div className="mt-3"><CurrencyInput aria-label="Extra monthly debt payment" value={extraPayment} onValueChange={setExtraPayment} placeholder="Extra payment each month" /></div>{debtComparison?.eligible ? <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-surface-container-low p-3"><span className="text-[10px] text-on-surface-variant">Time saved</span><strong className="mt-1 block text-sm text-on-surface">{debtComparison.monthsSaved} months</strong></div><div className="rounded-xl bg-surface-container-low p-3"><span className="text-[10px] text-on-surface-variant">Interest saved</span><MoneyValue className="mt-1 block text-sm font-semibold text-emerald-500">{formatCurrency(debtComparison.interestSaved)}</MoneyValue></div></div> : <p className="mt-3 text-xs leading-5 text-on-surface-variant">{debtComparison?.warning}</p>}</> : <p className="mt-3 text-sm text-on-surface-variant">Add an active liability with EMI details to compare payoff options.</p>}
        </article>
      </div>

      <article className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4">
        <div className="flex items-center gap-2"><PiggyBank className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-on-surface">Goal feasibility</h3></div>
        <div className="mt-3 space-y-2">{report.goals.length ? report.goals.map(goal => <div key={goal.goalId} className="grid gap-2 rounded-xl bg-surface-container-low p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><p className="text-sm font-semibold text-on-surface">{goal.name}</p><p className="mt-0.5 text-xs text-on-surface-variant">{formatCurrency(goal.currentAmount)} saved · {formatCurrency(goal.remainingAmount)} remaining</p></div><div className="text-xs text-on-surface-variant">Needs <MoneyValue className="font-semibold text-on-surface">{formatCurrency(goal.requiredMonthlyContribution)}/mo</MoneyValue></div><StatusPill tone={goal.feasibleByTarget ? 'positive' : 'warning'}>{goal.feasibleByTarget ? 'On track' : 'Needs adjustment'}</StatusPill></div>) : <p className="py-4 text-center text-sm text-on-surface-variant">No active Goals to forecast.</p>}</div>
      </article>
    </section>
  );
}
