import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleDollarSign, Settings2, ShieldAlert, Tags } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { projectAffordabilityWithHistory, type AffordabilityPlannerResult } from '../domain/affordabilityPlanner';
import { getCycleDetailsForDay, getCycleRange, shiftCycle } from '../utils/cycles';
import { AffordabilitySettings } from './AffordabilitySettings';
import { CurrencyInput } from './CurrencyInput';
import { CategoryAffordabilityReview } from './CategoryAffordabilityReview';

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function statusCopy(status: AffordabilityPlannerResult['projection']['status']) {
  if (status === 'SAFE') return { label: 'Comfortable', description: 'The purchase fits inside your protected spending capacity.', icon: CheckCircle2, classes: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25' };
  if (status === 'RISKY') return { label: 'Risky', description: 'You can fund it, but it uses part of your unexpected-spending cushion.', icon: AlertTriangle, classes: 'text-amber-500 bg-amber-500/10 border-amber-500/25' };
  return { label: 'Not affordable safely', description: 'The purchase would cut into money protected for savings or your cash reserve.', icon: ShieldAlert, classes: 'text-rose-500 bg-rose-500/10 border-rose-500/25' };
}

export function AffordabilityPlanner() {
  const { accounts, transactions, recurringRules, categories, creditCards, affordabilitySettings, monthCycleDay, formatCurrency } = useAppContext();
  const [purchaseName, setPurchaseName] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [result, setResult] = useState<AffordabilityPlannerResult | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [error, setError] = useState('');

  const horizon = useMemo(() => {
    const today = new Date();
    const current = getCycleDetailsForDay(today.toISOString(), monthCycleDay);
    const next = shiftCycle(current.year, current.month, 1);
    const range = getCycleRange(next.year, next.month, monthCycleDay);
    return { asOfDate: localDateKey(today), endDate: localDateKey(range.end), startDate: localDateKey(range.start), label: `${range.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${range.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` };
  }, [monthCycleDay]);

  const run = () => {
    const amount = Number(purchaseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a purchase amount greater than zero.');
      setResult(null);
      return;
    }
    setError('');
    setResult(projectAffordabilityWithHistory({
      asOfDate: horizon.asOfDate,
      endDate: horizon.endDate,
      accounts,
      transactions,
      recurringRules,
      categories,
      creditCards,
      purchaseAmount: amount,
      affordabilitySettings,
      monthCycleDay,
    }));
  };

  const copy = result ? statusCopy(result.projection.status) : null;
  const amount = Number(purchaseAmount) || 0;
  const safeDifference = result ? amount - result.projection.safePurchaseCapacity : 0;
  const additionalSavingsTarget = result ? Math.max(0, result.projection.plannedSavings - result.projection.scheduledSavings) : 0;

  return (
    <section className="rounded-3xl border border-primary/25 bg-surface-container-low overflow-hidden shadow-sm">
      <div className="p-5 sm:p-6 bg-gradient-to-br from-primary/10 via-transparent to-secondary/5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-primary"><CircleDollarSign className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">Can I Afford It?</span></div>
            <h3 className="mt-2 text-2xl font-bold text-on-surface">Check a purchase against your next financial cycle</h3>
            <p className="mt-2 text-sm text-on-surface-variant">CoinBuddy protects known commitments, savings, an unexpected-spending buffer and your chosen cash reserve before calling money safe to spend.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowCategories(true)} className="min-h-11 px-3 rounded-xl border border-outline-variant/30 bg-surface-container text-sm font-semibold text-on-surface flex items-center gap-2 hover:bg-surface-container-high"><Tags className="h-4 w-4" /> Review categories</button>
            <button type="button" onClick={() => setShowSettings(true)} className="min-h-11 px-3 rounded-xl border border-outline-variant/30 bg-surface-container text-sm font-semibold text-on-surface flex items-center gap-2 hover:bg-surface-container-high"><Settings2 className="h-4 w-4" /> Safety preferences</button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-on-surface-variant">What are you planning? <span className="font-normal">(optional)</span></span>
            <input type="text" value={purchaseName} onChange={event => setPurchaseName(event.target.value)} placeholder="e.g. Laptop, holiday, appliance" className="mt-1.5 w-full min-h-12 rounded-xl border border-outline-variant/30 bg-surface-container px-4 text-on-surface focus:outline-none focus:border-primary/60" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-on-surface-variant">Amount</span>
            <CurrencyInput value={purchaseAmount} onValueChange={setPurchaseAmount} placeholder="0.00" className="mt-1.5 w-full min-h-12 rounded-xl border border-outline-variant/30 bg-surface-container px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/60" />
          </label>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-on-surface-variant"><strong className="text-on-surface">Planning horizon:</strong> next financial cycle · {horizon.label}</div>
          <button type="button" onClick={run} className="min-h-12 px-6 rounded-xl bg-primary text-on-primary font-bold active:scale-[0.98] transition-transform">Check affordability</button>
        </div>
        {error && <p className="mt-2 text-sm text-rose-500" role="alert">{error}</p>}
      </div>

      {!affordabilitySettings.setupCompleted && !result && (
        <div className="border-t border-outline-variant/20 p-4 sm:px-6 text-sm text-on-surface-variant flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span>Your safety preferences have not been reviewed yet. You can still calculate, but the default savings target and protected reserve are zero.</span>
          <button type="button" onClick={() => setShowSettings(true)} className="text-primary font-bold whitespace-nowrap">Set preferences</button>
        </div>
      )}

      {result && copy && (
        <div className="border-t border-outline-variant/20 p-5 sm:p-6 space-y-5">
          <div className={`rounded-2xl border p-4 sm:p-5 ${copy.classes}`}>
            <div className="flex items-start gap-3">
              <copy.icon className="h-6 w-6 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wider font-bold">{purchaseName.trim() || 'Planned purchase'}</p>
                <h4 className="mt-1 text-xl font-bold">{copy.label}</h4>
                <p className="mt-1 text-sm opacity-90">{copy.description}</p>
              </div>
            </div>
          </div>

          {result.planningWarnings.length > 0 && (
            <div className="space-y-2">
              {result.planningWarnings.map(warning => <div key={warning} className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-on-surface flex items-start gap-2"><AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" /><span>{warning}</span></div>)}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="min-w-0 overflow-hidden rounded-2xl bg-surface-container border border-outline-variant/20 p-3.5 sm:p-4"><span className="text-xs text-on-surface-variant">Safe to spend</span><strong className="mt-1 block text-lg min-[390px]:text-xl font-numeric tabular-nums whitespace-nowrap text-on-surface">{formatCurrency(result.projection.safePurchaseCapacity)}</strong></div>
            <div className="min-w-0 overflow-hidden rounded-2xl bg-surface-container border border-outline-variant/20 p-3.5 sm:p-4"><span className="text-xs text-on-surface-variant">Purchase</span><strong className="mt-1 block text-lg min-[390px]:text-xl font-numeric tabular-nums whitespace-nowrap text-on-surface">{formatCurrency(result.projection.purchaseAmount)}</strong></div>
            <div className="col-span-2 sm:col-span-1 min-w-0 rounded-2xl bg-surface-container border border-outline-variant/20 p-3.5 sm:p-4"><span className="text-xs text-on-surface-variant">Against safe limit</span><strong className={`mt-1 block text-lg min-[390px]:text-xl font-numeric tabular-nums break-words ${safeDifference <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>{safeDifference <= 0 ? `${formatCurrency(Math.abs(safeDifference))} spare` : `${formatCurrency(safeDifference)} over`}</strong></div>
          </div>

          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-on-surface">Unexpected-spending estimate</p>
              <p className="text-xs text-on-surface-variant mt-1">{result.irregularSpending.contingencySource === 'FIXED' ? `Fixed buffer · ${formatCurrency(result.irregularSpending.recommendedBuffer)}` : result.irregularSpending.contingencySource === 'HISTORICAL' ? `${result.irregularSpending.confidence} confidence · ${result.irregularSpending.observedCycleCount} observed completed cycle${result.irregularSpending.observedCycleCount === 1 ? '' : 's'}` : 'Automatic estimate unavailable'}</p>
            </div>
            {result.irregularSpending.requiresCategoryReview ? <button type="button" onClick={() => setShowCategories(true)} className="text-sm font-bold text-primary">Review irregular categories</button> : result.irregularSpending.requiresUserInput ? <button type="button" onClick={() => setShowSettings(true)} className="text-sm font-bold text-primary">Use a fixed buffer</button> : null}
          </div>

          <button type="button" onClick={() => setShowBreakdown(value => !value)} className="w-full min-h-11 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface flex items-center justify-center gap-2 hover:bg-surface-container-high">{showBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} How did we calculate this?</button>

          {showBreakdown && (
            <div className="rounded-2xl border border-outline-variant/20 overflow-hidden text-sm">
              {[
                ['Liquid cash now', result.projection.openingCash, '+'],
                ['Expected income', result.projection.expectedIncome + result.projection.otherCashInflows, '+'],
                ['Known scheduled expenses', result.projection.expectedExpenses, '-'],
                ['Scheduled savings', result.projection.scheduledSavings, '-'],
                ['Additional savings target to protect', additionalSavingsTarget, '-'],
                ['Unexpected-spending buffer', result.projection.contingencyBuffer, '-'],
                ['Protected cash reserve', result.projection.protectedCashReserve, '-'],
              ].map(([label, raw, sign]) => <div key={String(label)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 border-b last:border-b-0 border-outline-variant/15 bg-surface-container"><span className="min-w-0 text-on-surface-variant leading-snug">{label}</span><span className="whitespace-nowrap font-numeric font-semibold tabular-nums text-on-surface">{sign}{formatCurrency(Number(raw))}</span></div>)}
              <div className="px-4 py-3 border-t border-outline-variant/15 bg-surface-container-low text-xs leading-relaxed text-on-surface-variant">
                <p><strong className="text-on-surface">Known projected expenses</strong> are concrete future obligations CoinBuddy can see, such as scheduled recurring entries, card dues and EMIs. Category behavior labels describe how spending is treated; they do not create a forecast amount by themselves. Recurring card charges count as expenses, while transfers into investments/savings appear under Scheduled savings.</p>
                {result.projection.expectedExpenses === 0 && <p className="mt-2">No concrete expense is currently scheduled in this horizon. Spending already logged in your current cycle is already reflected in today&apos;s balances and is not counted a second time.</p>}
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-4 bg-primary/10"><strong className="text-on-surface">Safe purchase capacity</strong><strong className="font-numeric text-primary text-lg">{formatCurrency(result.projection.safePurchaseCapacity)}</strong></div>
            </div>
          )}
        </div>
      )}

      {showSettings && <AffordabilitySettings onClose={() => setShowSettings(false)} />}
      {showCategories && <CategoryAffordabilityReview onClose={() => setShowCategories(false)} />}
    </section>
  );
}
