from pathlib import Path

files = {
"src/components/AffordabilitySettings.tsx": r'''import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { AffordabilitySettings as AffordabilitySettingsType } from '../types';
import { useAppContext } from '../context/AppContext';
import { normalizeAffordabilitySettings } from '../domain/affordabilitySettings';

interface Props {
  onClose: () => void;
}

export function AffordabilitySettings({ onClose }: Props) {
  const { affordabilitySettings, setAffordabilitySettings, formatCurrency, showToast } = useAppContext();
  const [draft, setDraft] = useState<AffordabilitySettingsType>(() => ({ ...affordabilitySettings }));

  useEffect(() => setDraft({ ...affordabilitySettings }), [affordabilitySettings]);

  const update = <K extends keyof AffordabilitySettingsType>(key: K, value: AffordabilitySettingsType[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const save = () => {
    const normalized = normalizeAffordabilitySettings({ ...draft, setupCompleted: true });
    setAffordabilitySettings(normalized);
    showToast('Affordability safety preferences saved');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[220] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="affordability-settings-title">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">Safety preferences</span></div>
            <h3 id="affordability-settings-title" className="mt-2 text-xl font-bold text-on-surface">Protect what matters before spending</h3>
            <p className="mt-1 text-sm text-on-surface-variant">These are planning rules only. CoinBuddy does not move money or create transactions when you change them.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-high" aria-label="Close safety preferences"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-sm font-semibold text-on-surface">Monthly savings target</span>
            <span className="block text-xs text-on-surface-variant mt-1">Money you want the planner to protect for savings each financial cycle.</span>
            <input type="number" min="0" step="100" value={draft.monthlySavingsTarget || ''} onChange={event => update('monthlySavingsTarget', Math.max(0, Number(event.target.value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0" />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-on-surface">Protected cash reserve</span>
            <span className="block text-xs text-on-surface-variant mt-1">A liquid-cash floor CoinBuddy should never call safe to spend. It is not a separate emergency-fund account.</span>
            <input type="number" min="0" step="100" value={draft.protectedCashReserve || ''} onChange={event => update('protectedCashReserve', Math.max(0, Number(event.target.value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0" />
          </label>

          <fieldset>
            <legend className="text-sm font-semibold text-on-surface">Unexpected-spending buffer</legend>
            <p className="text-xs text-on-surface-variant mt-1">Use historical irregular spending when available, or protect a fixed amount.</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(['AUTO', 'FIXED'] as const).map(mode => (
                <button key={mode} type="button" onClick={() => update('contingencyMode', mode)} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${draft.contingencyMode === mode ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-on-surface'}`}>
                  {mode === 'AUTO' ? 'Estimate automatically' : 'Use fixed amount'}
                </button>
              ))}
            </div>
          </fieldset>

          {draft.contingencyMode === 'FIXED' && (
            <label className="block">
              <span className="text-sm font-semibold text-on-surface">Fixed contingency amount</span>
              <input type="number" min="0" step="100" value={draft.fixedContingencyAmount || ''} onChange={event => update('fixedContingencyAmount', Math.max(0, Number(event.target.value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0" />
            </label>
          )}

          {draft.contingencyMode === 'AUTO' && (
            <label className="block">
              <span className="text-sm font-semibold text-on-surface">History window</span>
              <select value={draft.historicalMonths} onChange={event => update('historicalMonths', Number(event.target.value))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary/60">
                <option value={3}>Last 3 completed cycles</option>
                <option value={6}>Last 6 completed cycles</option>
                <option value={12}>Last 12 completed cycles</option>
                <option value={18}>Last 18 completed cycles</option>
                <option value={24}>Last 24 completed cycles</option>
              </select>
            </label>
          )}

          <fieldset>
            <legend className="text-sm font-semibold text-on-surface">Safety posture</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              {([
                ['FLEXIBLE', 'Flexible', 'Use the historical estimate as-is.'],
                ['BALANCED', 'Balanced', 'Add a moderate safety margin.'],
                ['CONSERVATIVE', 'Conservative', 'Protect a larger safety margin.'],
              ] as const).map(([value, label, description]) => (
                <button key={value} type="button" onClick={() => update('safetyLevel', value)} className={`rounded-xl border p-3 text-left transition ${draft.safetyLevel === value ? 'border-primary bg-primary/10' : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high'}`}>
                  <span className="block text-sm font-bold text-on-surface">{label}</span>
                  <span className="block mt-1 text-xs text-on-surface-variant">{description}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4 text-xs text-on-surface-variant">
            Current protection: {formatCurrency(draft.monthlySavingsTarget)} savings target + {formatCurrency(draft.protectedCashReserve)} cash reserve{draft.contingencyMode === 'FIXED' ? ` + ${formatCurrency(draft.fixedContingencyAmount)} fixed contingency` : ' + automatic contingency when enough history exists'}.
          </div>

          <button type="button" onClick={save} className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-bold active:scale-[0.98] transition-transform">Save safety preferences</button>
        </div>
      </div>
    </div>
  );
}
''',
"src/components/CategoryAffordabilityReview.tsx": r'''import { X } from 'lucide-react';
import type { AffordabilityClass, Category } from '../types';
import { useAppContext } from '../context/AppContext';
import { normalizeAffordabilityClass } from '../domain/categoryAffordability';

interface Props { onClose: () => void; }

const OPTIONS: Array<{ value: AffordabilityClass; label: string; description: string }> = [
  { value: 'COMMITTED', label: 'Committed', description: 'Known obligations such as rent, insurance or subscriptions.' },
  { value: 'NORMAL', label: 'Normal spending', description: 'Regular day-to-day spending such as groceries, fuel or utilities.' },
  { value: 'FLEXIBLE', label: 'Flexible', description: 'Spending that can usually be reduced, such as dining or shopping.' },
  { value: 'IRREGULAR', label: 'Irregular', description: 'Unpredictable costs such as medical bills, repairs or urgent travel.' },
  { value: 'SAVINGS', label: 'Savings', description: 'Money intentionally set aside or invested toward a goal.' },
];

export function CategoryAffordabilityReview({ onClose }: Props) {
  const { categories, updateCategory, showToast } = useAppContext();
  const expenses = categories.filter(category => category.type !== 'income');

  const changeClass = (category: Category, affordabilityClass: AffordabilityClass) => {
    const { id, ...editable } = category;
    updateCategory(id, { ...editable, affordabilityClass });
  };

  return (
    <div className="fixed inset-0 z-[220] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="category-behavior-title">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl border border-outline-variant/30 bg-surface-container-low shadow-2xl flex flex-col">
        <div className="p-5 sm:p-6 border-b border-outline-variant/20 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Affordability categories</p>
            <h3 id="category-behavior-title" className="mt-2 text-xl font-bold text-on-surface">Tell CoinBuddy how each expense behaves</h3>
            <p className="mt-1 text-sm text-on-surface-variant">These are not new transaction categories. They only tell the planner how to treat the categories you already use.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close category review" className="p-2 rounded-full hover:bg-surface-container-high"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6 space-y-3">
          <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-4 text-xs text-on-surface-variant">
            For automatic unexpected-spending estimates, mark genuinely unpredictable categories such as medical expenses or repairs as <strong className="text-on-surface">Irregular</strong>. CoinBuddy will not guess category meanings from their names.
          </div>
          {expenses.length === 0 ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">No expense categories are available yet.</p>
          ) : expenses.map(category => {
            const current = normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type);
            const currentOption = OPTIONS.find(option => option.value === current)!;
            return (
              <div key={category.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4 sm:flex sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-on-surface truncate">{category.name}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{currentOption.description}</p>
                </div>
                <select aria-label={`${category.name} affordability behavior`} value={current} onChange={event => changeClass(category, event.target.value as AffordabilityClass)} className="mt-3 sm:mt-0 w-full sm:w-48 min-h-11 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 text-sm text-on-surface focus:outline-none focus:border-primary/60">
                  {OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-outline-variant/20">
          <button type="button" onClick={() => { showToast('Category financial behavior updated'); onClose(); }} className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-bold active:scale-[0.98] transition-transform">Done</button>
        </div>
      </div>
    </div>
  );
}
''',
"src/components/AffordabilityPlanner.tsx": r'''import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleDollarSign, Settings2, ShieldAlert, Tags } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { projectAffordabilityWithHistory, type AffordabilityPlannerResult } from '../domain/affordabilityPlanner';
import { getCycleDetailsForDay, getCycleRange, shiftCycle } from '../utils/cycles';
import { AffordabilitySettings } from './AffordabilitySettings';
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
            <input type="number" min="0" step="100" value={purchaseAmount} onChange={event => setPurchaseAmount(event.target.value)} placeholder="0" className="mt-1.5 w-full min-h-12 rounded-xl border border-outline-variant/30 bg-surface-container px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/60" />
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

          <div className="grid grid-cols-1 min-[390px]:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-4"><span className="text-xs text-on-surface-variant">Safe to spend</span><strong className="mt-1 block text-xl font-numeric text-on-surface">{formatCurrency(result.projection.safePurchaseCapacity)}</strong></div>
            <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-4"><span className="text-xs text-on-surface-variant">Purchase</span><strong className="mt-1 block text-xl font-numeric text-on-surface">{formatCurrency(result.projection.purchaseAmount)}</strong></div>
            <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-4"><span className="text-xs text-on-surface-variant">Against safe limit</span><strong className={`mt-1 block text-xl font-numeric ${safeDifference <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>{safeDifference <= 0 ? `${formatCurrency(Math.abs(safeDifference))} spare` : `${formatCurrency(safeDifference)} over`}</strong></div>
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
                ['Known projected expenses', result.projection.expectedExpenses, '-'],
                ['Scheduled savings', result.projection.scheduledSavings, '-'],
                ['Savings target still to protect', result.projection.plannedSavings, '-'],
                ['Unexpected-spending buffer', result.projection.contingencyBuffer, '-'],
                ['Protected cash reserve', result.projection.protectedCashReserve, '-'],
              ].map(([label, raw, sign]) => <div key={String(label)} className="flex items-center justify-between gap-4 px-4 py-3 border-b last:border-b-0 border-outline-variant/15 bg-surface-container"><span className="text-on-surface-variant">{label}</span><span className="font-numeric font-semibold text-on-surface">{sign}{formatCurrency(Number(raw))}</span></div>)}
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
''',
}

for path, content in files.items():
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')

# Insights integration
path = Path('src/components/Insights.tsx')
text = path.read_text(encoding='utf-8')
if "import { AffordabilityPlanner } from './AffordabilityPlanner';" not in text:
    anchor = "import { getCycleRange, shiftCycle } from '../utils/cycles';\n"
    if anchor not in text: raise SystemExit('Insights import anchor not found')
    text = text.replace(anchor, anchor + "import { AffordabilityPlanner } from './AffordabilityPlanner';\n", 1)
insert_anchor = '''      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">'''
if '<AffordabilityPlanner />' not in text:
    if insert_anchor not in text: raise SystemExit('Insights insertion anchor not found')
    text = text.replace(insert_anchor, '''      <AffordabilityPlanner />\n\n''' + insert_anchor, 1)
# Stop using old Savings group in current-cycle category totals.
text = text.replace("      return catObj?.group !== 'Savings';", "      return catObj?.affordabilityClass !== 'SAVINGS' && catObj?.group !== 'Savings';")
path.write_text(text, encoding='utf-8')

# Replace legacy Essential/Leisure UI in Manage Finances with affordability behavior.
path = Path('src/components/ManageFinances.tsx')
text = path.read_text(encoding='utf-8')
text = text.replace("import { Category } from '../types';", "import { AffordabilityClass, Category } from '../types';")
text = text.replace("  const [filterGroup, setFilterGroup] = useState<'All' | 'Essential' | 'Leisure'>('All');\n", "")
text = text.replace("  const [editType, setEditType] = useState<'expense' | 'income'>('expense');\n", "  const [editType, setEditType] = useState<'expense' | 'income'>('expense');\n  const [editAffordabilityClass, setEditAffordabilityClass] = useState<AffordabilityClass>('NORMAL');\n")
text = text.replace("      setEditType('expense');\n      setEditBudget(0);", "      setEditType('expense');\n      setEditAffordabilityClass('NORMAL');\n      setEditBudget(0);")
text = text.replace("    .filter(c => c.type !== 'income' && c.group !== 'Savings')", "    .filter(c => c.type !== 'income' && c.affordabilityClass !== 'SAVINGS' && c.group !== 'Savings')")
old_display = '''    if (activeTab === 'Categories') {\n      if (c.group === 'Savings') return false;\n      if (filterGroup !== 'All' && c.group !== filterGroup) return false;\n      if (filterType !== 'All' && (c.type || 'expense') !== filterType) return false;\n    } else {\n      if (c.group !== 'Savings') return false;\n    }'''
new_display = '''    const isSavings = c.affordabilityClass === 'SAVINGS' || c.group === 'Savings';\n    if (activeTab === 'Categories') {\n      if (isSavings) return false;\n      if (filterType !== 'All' && (c.type || 'expense') !== filterType) return false;\n    } else {\n      if (!isSavings) return false;\n    }'''
if old_display not in text: raise SystemExit('Manage display filter anchor not found')
text = text.replace(old_display, new_display, 1)
text = text.replace("    setEditType(c.type || 'expense');\n    setEditBudget(c.budget || 0);", "    setEditType(c.type || 'expense');\n    setEditAffordabilityClass(c.affordabilityClass ?? (c.group === 'Savings' ? 'SAVINGS' : c.group === 'Leisure' ? 'FLEXIBLE' : 'NORMAL'));\n    setEditBudget(c.budget || 0);")
old_save = '''    if (editingId) {\n      updateCategory(editingId, { name: editName, icon: editIcon, type: categoryType, budget: finalBudget, isRollover: categoryType === 'expense' && editIsRollover, rolloverAccountId: editIsRollover ? editRolloverAccountId : undefined });\n    } else {\n      addCategory({ name: editName, icon: editIcon, type: categoryType, budget: finalBudget, isRollover: categoryType === 'expense' && editIsRollover, rolloverAccountId: editIsRollover ? editRolloverAccountId : undefined, group: activeTab === 'Savings Goals' ? 'Savings' : 'Essential' });\n    }'''
new_save = '''    const affordabilityClass: AffordabilityClass = activeTab === 'Savings Goals' ? 'SAVINGS' : categoryType === 'income' ? 'NORMAL' : editAffordabilityClass;\n    if (editingId) {\n      const existing = categories.find(category => category.id === editingId);\n      updateCategory(editingId, { name: editName, icon: editIcon, type: categoryType, budget: finalBudget, isRollover: categoryType === 'expense' && editIsRollover, rolloverAccountId: editIsRollover ? editRolloverAccountId : undefined, tags: existing?.tags, affordabilityClass });\n    } else {\n      addCategory({ name: editName, icon: editIcon, type: categoryType, budget: finalBudget, isRollover: categoryType === 'expense' && editIsRollover, rolloverAccountId: editIsRollover ? editRolloverAccountId : undefined, affordabilityClass });\n    }'''
if old_save not in text: raise SystemExit('Manage save anchor not found')
text = text.replace(old_save, new_save, 1)
# Reset all add-category paths
text = text.replace("                setEditName('');\n                setEditIcon('ShoppingBag');\n                setEditBudget(0);", "                setEditName('');\n                setEditIcon('ShoppingBag');\n                setEditType('expense');\n                setEditAffordabilityClass(activeTab === 'Savings Goals' ? 'SAVINGS' : 'NORMAL');\n                setEditBudget(0);")
text = text.replace("            setEditName('');\n            setEditIcon('ShoppingBag');\n            setEditType('expense');\n            setEditBudget(0);", "            setEditName('');\n            setEditIcon('ShoppingBag');\n            setEditType('expense');\n            setEditAffordabilityClass(activeTab === 'Savings Goals' ? 'SAVINGS' : 'NORMAL');\n            setEditBudget(0);")
# Remove legacy group filter chips
legacy_filter = '''\n          <div className="flex gap-2 overflow-x-auto scrollbar-hide">\n            {(['All', 'Essential', 'Leisure'] as const).map(group => (\n              <button\n                key={group}\n                onClick={() => setFilterGroup(group)}\n                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${filterGroup === group ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant'}`}\n              >\n                {group}\n              </button>\n            ))}\n          </div>'''
if legacy_filter not in text: raise SystemExit('Legacy category group filter not found')
text = text.replace(legacy_filter, '', 1)
# Show behavior pill on category cards.
card_anchor = '''                    {c.tags && c.tags.length > 0 && <p className="text-xs text-on-surface-variant font-mono">{c.tags.join(' ')}</p>}'''
card_replacement = '''                    {c.tags && c.tags.length > 0 && <p className="text-xs text-on-surface-variant font-mono">{c.tags.join(' ')}</p>}\n                    {c.type !== 'income' && <span className="inline-flex mt-1 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full">{(c.affordabilityClass ?? (c.group === 'Savings' ? 'SAVINGS' : c.group === 'Leisure' ? 'FLEXIBLE' : 'NORMAL')).toLowerCase().replace('_', ' ')}</span>}'''
if card_anchor not in text: raise SystemExit('Category card anchor not found')
text = text.replace(card_anchor, card_replacement, 1)
# Insert financial behavior selector into expense category modal.
behavior_anchor = '''              <div>\n                <label className="block text-sm font-semibold text-on-surface-variant mb-1">Icon</label>'''
behavior_block = '''              {activeTab === 'Categories' && editType === 'expense' && (\n                <div>\n                  <label className="block text-sm font-semibold text-on-surface-variant mb-1">Financial behavior</label>\n                  <select value={editAffordabilityClass} onChange={event => setEditAffordabilityClass(event.target.value as AffordabilityClass)} className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary/50">\n                    <option value="COMMITTED">Committed — known obligations</option>\n                    <option value="NORMAL">Normal spending — regular living costs</option>\n                    <option value="FLEXIBLE">Flexible — can usually be reduced</option>\n                    <option value="IRREGULAR">Irregular — unpredictable / unexpected</option>\n                    <option value="SAVINGS">Savings — intentional saving or investing</option>\n                  </select>\n                  <p className="mt-1 text-xs text-on-surface-variant">Used by Can I Afford It? to distinguish commitments, flexible spending and unexpected costs.</p>\n                </div>\n              )}\n\n''' + behavior_anchor
if behavior_anchor not in text: raise SystemExit('Behavior selector anchor not found')
text = text.replace(behavior_anchor, behavior_block, 1)
path.write_text(text, encoding='utf-8')

print('Affordability Phase 6 UI applied.')
