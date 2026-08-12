import { useState, useMemo } from 'react';
import { 
  ShieldCheck, ArrowUpRight, TrendingDown, Lightbulb, PiggyBank, ArrowUp, ArrowDown, 
  Sparkles, Trophy, Flame, CreditCard, PieChart, Layers, CheckCircle2, ArrowRight, AlertTriangle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, YAxis, XAxis, Tooltip, Sankey } from 'recharts';
import { AnimatedNumber } from './AnimatedNumber';
import { icons } from '../icons';
import { LoanAmortizationExplorer } from './LoanAmortizationExplorer';
import { getOriginalPrincipal } from '../utils/emi';
import type { ComponentType, SVGProps } from 'react';
import { isCashFlowTransaction } from '../domain/ledgerRules';
import { calculateFinancialRunway, projectDebtPayoff } from '../utils/metrics';
import { buildSankeySplitLabel } from '../utils/sankeyLabels';
import { recomputeAllAccountBalances } from '../utils/balanceManager';
import { getCycleRange, shiftCycle } from '../utils/cycles';
import { AffordabilityPlanner } from './AffordabilityPlanner';

export function Insights() {
  const { 
    transactions, 
    formatCurrency, 
    categories, 
    events,
    profile, 
    getCycleDetails, 
    isDateInCurrentCycle, 
    accounts, 
    creditCards,
    monthCycleDay,
    setPayCardModalState
  } = useAppContext();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [extraPayment, setExtraPayment] = useState(0);

  // Assets and Liabilities Calculation
  const assets = useMemo(() => accounts.filter(a => !a.is_archived && a.type === 'asset' && a.balance > 0).sort((a, b) => b.balance - a.balance), [accounts]);
  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
  
  const liabilities = useMemo(() => accounts.filter(a => !a.is_archived && a.type === 'liability').sort((a, b) => b.balance - a.balance), [accounts]);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0);

  // Category totals for current cycle
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    const titlesByCategory: Record<string, Set<string>> = {};

    transactions.filter(t => {
      if (t.isOpeningBalance || t.is_verified === 0 || !isCashFlowTransaction(t) || t.type !== 'expense' || !isDateInCurrentCycle(t.date)) return false;
      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\s+/g, '')}` === t.category || c.id === t.category);
      return catObj?.affordabilityClass !== 'SAVINGS' && catObj?.group !== 'Savings';
    }).forEach(tx => {
      totals[tx.category] = (totals[tx.category] || 0) + Math.abs(tx.amount);
      if (!titlesByCategory[tx.category]) {
        titlesByCategory[tx.category] = new Set();
      }
      titlesByCategory[tx.category].add(tx.title);
    });

    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => ({ 
        category: cat, 
        total, 
        uniqueSpots: titlesByCategory[cat]?.size || 0 
      }));
  }, [transactions, categories, isDateInCurrentCycle]);

  const top4 = categoryTotals.slice(0, 4);
  const topCategoryInfo = top4.length > 0 ? top4[0] : null;

  const eventSummaries = useMemo(() => Object.values(
    transactions.reduce<Record<string, { name: string; expenses: number; income: number }>>((groups, transaction) => {
      const event = events.find(item => item.id === transaction.eventId);
      if (!event || transaction.isOpeningBalance || transaction.is_verified === 0) return groups;

      const group = groups[event.id] ?? (groups[event.id] = { name: event.name, expenses: 0, income: 0 });
      if (isCashFlowTransaction(transaction) && transaction.type === 'expense') group.expenses += Math.abs(transaction.amount);
      if (isCashFlowTransaction(transaction) && transaction.type === 'income') group.income += Math.abs(transaction.amount);
      return groups;
    }, {})
  ).map(group => ({ ...group, netSpent: group.expenses - group.income }))
    .sort((a, b) => b.netSpent - a.netSpent), [transactions, events]);

  const getCategoryDetails = (catIdentifier: string) => {
    const matchedCategory = categories.find(c => 
      `#${c.name.toLowerCase().replace(/\s+/g, '')}` === catIdentifier || c.id === catIdentifier
    );
    return {
      id: matchedCategory?.id || catIdentifier,
      name: matchedCategory ? matchedCategory.name : catIdentifier.replace('#', ''),
      iconName: matchedCategory?.icon as keyof typeof icons || 'ShoppingBag',
      color: 'var(--color-primary)'
    };
  };

  // Available categories with expenses
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.filter(t => !t.isOpeningBalance && t.is_verified !== 0 && isCashFlowTransaction(t) && t.type === 'expense').forEach(t => set.add(t.category));
    return Array.from(set).map(catId => {
      const details = getCategoryDetails(catId);
      return { id: catId, name: details.name, details };
    });
  }, [transactions, categories]);

  // 6-Month Category Specific Growth / Trend Data
  const categoryTrendData = useMemo(() => {
    const now = new Date();
    const currentCycle = getCycleDetails(now.toISOString());
    const monthlyData: { key: string; monthLabel: string; total: number; txCount: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      let m = currentCycle.month - i;
      let y = currentCycle.year;
      while (m < 0) {
        m += 12;
        y -= 1;
      }
      const cycleKey = `${y}-${m}`;
      const monthLabel = new Date(y, m, 1).toLocaleString('default', { month: 'short' });

      let cycleTotal = 0;
      let count = 0;

      transactions.forEach(t => {
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

      monthlyData.push({
        key: cycleKey,
        monthLabel,
        total: cycleTotal,
        txCount: count
      });
    }

    const currentCycleSpend = monthlyData[monthlyData.length - 1]?.total || 0;
    const prevCycleSpend = monthlyData[monthlyData.length - 2]?.total || 0;
    const cycleChangePercent = prevCycleSpend > 0 
      ? (((currentCycleSpend - prevCycleSpend) / prevCycleSpend) * 100) 
      : 0;

    const avgSpend = monthlyData.reduce((acc, curr) => acc + curr.total, 0) / monthlyData.length;

    // Highest single transaction in selected category
    const catTxs = transactions.filter(t => 
      !t.isOpeningBalance && t.is_verified !== 0 && isCashFlowTransaction(t) && t.type === 'expense' && (selectedCategory === 'all' || t.category === selectedCategory)
    );
    const maxTx = catTxs.length > 0 
      ? catTxs.reduce((max, t) => Math.abs(t.amount) > Math.abs(max.amount) ? t : max, catTxs[0])
      : null;

    return {
      chartData: monthlyData,
      currentCycleSpend,
      prevCycleSpend,
      cycleChangePercent,
      avgSpend,
      maxTx
    };
  }, [transactions, selectedCategory, getCycleDetails]);

// Net Worth at each configured cycle cutoff. Replaying the ledger
// keeps opening balances and adjustments out of cycles where they did not exist.
const monthlyTrends = useMemo(() => {
  const now = new Date();
  const currentCycle = getCycleDetails(now.toISOString());
  const verifiedTransactions = transactions.filter(transaction => transaction.is_verified !== 0);
  const historicalNetWorth: Array<{
    key: string;
    m: string;
    cycleLabel: string;
    netWorth: number;
    netFlow: number;
    isCurrent: boolean;
  }> = [];

  for (let offset = 5; offset >= 0; offset--) {
    const cycle = shiftCycle(currentCycle.year, currentCycle.month, -offset);
    const key = `${cycle.year}-${cycle.month}`;
    const { start, end } = getCycleRange(cycle.year, cycle.month, monthCycleDay);
    const isCurrent = key === currentCycle.key;
    const cutoff = isCurrent ? now : end;
    const cutoffTime = cutoff.getTime();
    const startTime = start.getTime();

    const transactionsAtCutoff = verifiedTransactions.filter(transaction => {
      const transactionTime = new Date(transaction.date).getTime();
      return Number.isFinite(transactionTime) && transactionTime <= cutoffTime;
    });
    const projectedAccounts = recomputeAllAccountBalances(accounts, transactionsAtCutoff);
    const cycleNetWorth = projectedAccounts
      .filter(account => !account.is_archived)
      .reduce((total, account) => total + (account.type === 'asset' ? account.balance : -account.balance), 0);
    const cycleNetFlow = verifiedTransactions.reduce((total, transaction) => {
      const transactionTime = new Date(transaction.date).getTime();
      if (!Number.isFinite(transactionTime) || transactionTime < startTime || transactionTime > cutoffTime || !isCashFlowTransaction(transaction)) return total;
      if (transaction.type === 'income') return total + Math.abs(transaction.amount);
      if (transaction.type === 'expense') return total - Math.abs(transaction.amount);
      return total;
    }, 0);

    historicalNetWorth.push({
      key,
      m: new Date(cycle.year, cycle.month, 1).toLocaleString('default', { month: 'short' }),
      cycleLabel: `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${cutoff.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      netWorth: cycleNetWorth,
      netFlow: cycleNetFlow,
      isCurrent,
    });
  }

  const minNw = Math.min(...historicalNetWorth.map(item => item.netWorth), 0);
  const maxNw = Math.max(...historicalNetWorth.map(item => item.netWorth), 1);
  const range = maxNw - minNw || 1;

  return historicalNetWorth.map(item => ({
    m: item.m,
    cycleLabel: item.cycleLabel,
    h: `${Math.max(5, Math.round(((item.netWorth - minNw) / range) * 100))}%`,
    v: formatCurrency(item.netWorth),
    rawTotal: item.netWorth,
    a: item.isCurrent,
    netFlow: item.netFlow,
  }));
}, [transactions, accounts, formatCurrency, getCycleDetails, monthCycleDay]);

  // Smart Tips
  const smartTips = useMemo(() => {
    const firstName = profile?.name?.split(' ')[0] || 'there';
    const tips = [];
    if (topCategoryInfo) {
      const { name } = getCategoryDetails(topCategoryInfo.category);
      tips.push({
        icon: TrendingDown,
        color: 'primary',
        title: `High Spending in ${name}`,
        desc: `Hey ${firstName}, you've spent ${formatCurrency(topCategoryInfo.total)} on ${name}. Consider setting a budget to track this.`
      });
    }

    const recurringTxs = transactions.filter(t => !t.isOpeningBalance && t.is_verified !== 0 && isCashFlowTransaction(t) && t.type === 'expense' && (t.title.toLowerCase().includes('subscription') || t.title.toLowerCase().includes('netflix') || t.title.toLowerCase().includes('spotify')));
    if (recurringTxs.length > 0) {
      tips.push({
        icon: Lightbulb,
        color: 'secondary',
        title: 'Subscription Alert',
        desc: `Found ${recurringTxs.length} potential subscriptions, ${firstName}. Total: ${formatCurrency(recurringTxs.reduce((acc, t) => acc + Math.abs(t.amount), 0))}.`
      });
    }

    return tips;
  }, [topCategoryInfo, transactions, formatCurrency, categories, profile]);

  // Color palette for Sankey chart
  const chartColors = ['#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#f43f5e'];
  const dotClasses = ['bg-[#8b5cf6]', 'bg-[#10b981]', 'bg-[#f59e0b]', 'bg-[#ec4899]', 'bg-[#0ea5e9]', 'bg-[#f43f5e]'];
  const getCategoryColor = (index: number) => chartColors[index % chartColors.length];

  // Liability Paydown & Credit Utilization progress metrics
  const liabilityMetrics = useMemo(() => {
    return liabilities.map(liability => {
      const cc = creditCards.find(c => c.id === liability.id);
      const isCreditCard = Boolean(cc || liability.group === 'Credit Card');

      let totalCapacity = 0;
      let paidOff = 0;
      let percentPaid = 0;
      let utilization = 0;

      if (isCreditCard) {
        totalCapacity = cc?.limit || liability.balance || 1;
        utilization = totalCapacity > 0 ? Math.min(100, Math.max(0, (liability.balance / totalCapacity) * 100)) : 0;
        paidOff = Math.max(0, totalCapacity - liability.balance);
      } else {
        totalCapacity = getOriginalPrincipal(liability, transactions);
        paidOff = Math.max(0, totalCapacity - liability.balance);
        percentPaid = totalCapacity > 0 ? (paidOff / totalCapacity) * 100 : (liability.balance === 0 ? 100 : 0);
      }

      return {
        ...liability,
        ccDetails: cc,
        isCreditCard,
        totalCapacity,
        paidOff,
        utilization,
        percentPaid: Math.max(0, percentPaid),
        isOverPrincipal: !isCreditCard && totalCapacity > 0 && liability.balance > totalCapacity,
        isDebtFree: liability.balance === 0
      };
    });
  }, [liabilities, creditCards]);

  const totalDebtPaid = liabilityMetrics.reduce((sum, l) => sum + l.paidOff, 0);
  const totalDebtCapacity = liabilityMetrics.reduce((sum, l) => sum + (l.totalCapacity || l.balance), 0);
  const overallDebtPaidPercent = totalDebtCapacity > 0 ? Math.min(100, (totalDebtPaid / totalDebtCapacity) * 100) : 100;
  const runway = useMemo(() => calculateFinancialRunway(accounts, categories, transactions, getCycleDetails), [accounts, categories, transactions, getCycleDetails]);
  const termLoans = liabilityMetrics.filter(liability => !liability.isCreditCard && liability.balance > 0 && (liability.monthlyEMI ?? 0) > 0);
  const debtProjections = useMemo(() => termLoans.map(loan => {
    const standard = projectDebtPayoff(loan.balance, loan.monthlyEMI ?? 0, loan.interestRate ?? 0);
    const accelerated = projectDebtPayoff(loan.balance, loan.monthlyEMI ?? 0, loan.interestRate ?? 0, extraPayment);
    return { loan, standard, accelerated, interestSaved: Math.max(0, (standard?.interest ?? 0) - (accelerated?.interest ?? 0)) };
  }), [termLoans, extraPayment]);
  const sankeyData = useMemo(() => {
    const outgoing = new Map<string, number>();
    let income = 0;
    transactions.filter(transaction => transaction.is_verified !== 0 && isDateInCurrentCycle(transaction.date) && !transaction.isOpeningBalance && isCashFlowTransaction(transaction)).forEach(transaction => {
      if (transaction.type === 'income') income += Math.abs(transaction.amount);
      if (transaction.type === 'expense') {
        const debtPayment = transaction.toAccountId && accounts.some(account => account.id === transaction.toAccountId && account.type === 'liability');
        const category = debtPayment ? 'Debt payments' : (categories.find(category => category.id === transaction.category || `#${category.name.toLowerCase().replace(/\s+/g, '')}` === transaction.category)?.name ?? 'Other expenses');
        outgoing.set(category, (outgoing.get(category) ?? 0) + Math.abs(transaction.amount));
      }
    });
    transactions.filter(transaction => transaction.is_verified !== 0 && isDateInCurrentCycle(transaction.date) && transaction.type === 'transfer').forEach(transaction => outgoing.set('Transfers / savings', (outgoing.get('Transfers / savings') ?? 0) + Math.abs(transaction.amount)));
    const nodes = [{ name: 'Income' }, ...Array.from(outgoing.keys()).map(name => ({ name }))];
    const flows = Array.from(outgoing.entries()).map(([name, value], idx) => ({
      name,
      value,
      color: chartColors[idx % chartColors.length],
      ...buildSankeySplitLabel(name, value, income),
    }));
    return { nodes, links: flows.map(({ name, value, color }) => ({ source: 0, target: nodes.findIndex(node => node.name === name), value, color })), income, flows };
  }, [transactions, categories, accounts, isDateInCurrentCycle, chartColors]);
  // Each destination needs room for its name and value; a larger floor keeps
  // the source label and the final destination labels inside the card.
  const sankeyHeight = Math.max(460, sankeyData.nodes.length * 72 + 80);

  return (
    <div className="space-y-8 pb-24 md:pb-0 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Financial Intelligence</p>
          <h2 className="text-2xl font-bold text-on-surface">Analytics & Category Trends</h2>
        </div>
      </div>

      <AffordabilityPlanner />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-surface-container-low border border-outline-variant/30 rounded-3xl p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Financial Runway</p>
          <p className="mt-2 text-3xl font-bold font-numeric text-on-surface">{runway.months === null ? '∞' : `${runway.months.toFixed(1)} months`}</p>
          <p className="mt-1 text-xs text-on-surface-variant">{formatCurrency(runway.liquidAssets)} in cash and bank funds ÷ trailing 3-month essential spending.</p>
        </section>
        <section className="bg-surface-container-low border border-outline-variant/30 rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Debt-Free Projection</p><p className="text-xs text-on-surface-variant mt-1">If I pay an extra {formatCurrency(extraPayment)} each month</p></div><input aria-label="Extra monthly debt payment" type="range" min="0" max="50000" step="500" value={extraPayment} onChange={event => setExtraPayment(Number(event.target.value))} className="w-32 accent-primary" /></div>
          {debtProjections.length ? debtProjections.map(({ loan, standard, accelerated, interestSaved }) => <div key={loan.id} className="mt-3 text-xs"><strong>{loan.name}</strong><span className="ml-2 text-on-surface-variant">Debt-free: {accelerated ? accelerated.payoffDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'Payment too low'} · saves {formatCurrency(interestSaved)} interest</span>{standard && accelerated && extraPayment > 0 && <span className="ml-2 text-emerald-500">({standard.months - accelerated.months} months sooner)</span>}</div>) : <p className="mt-3 text-xs text-on-surface-variant">Add a term loan with a monthly payment to see a payoff projection.</p>}
        </section>
      </div>

      <section className="bg-surface-container-low border border-outline-variant/30 rounded-3xl p-5">
        <div className="flex items-center justify-between"><div><h3 className="font-bold text-on-surface">Current Cycle Cash Flow</h3><p className="text-xs text-on-surface-variant">Income flowing to spending, savings transfers, and debt payments.</p></div><span className="text-sm font-bold text-emerald-500">{formatCurrency(sankeyData.income)} income</span></div>
        {sankeyData.links.length ? <div className="relative mt-4 overflow-x-auto"><div className="min-w-[760px]" style={{ minHeight: sankeyHeight, height: sankeyHeight }}><ResponsiveContainer width="100%" height="100%"><Sankey data={sankeyData} nodePadding={48} nodeWidth={20} margin={{ top: 56, right: 200, bottom: 64, left: 200 }} link={(props: any) => {
          const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, index } = props;
          const color = sankeyData.links[index]?.color || 'rgba(99, 102, 241, 0.35)';
          return <path d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`} fill="none" stroke={color} strokeOpacity={0.4} strokeWidth={linkWidth} />;
        }} node={(node: any) => {
          const name = node.payload?.name ?? '';
          const flow = sankeyData.flows.find(item => item.name === name);
          const isIncome = node.index === 0;
          const categoryIndex = isIncome ? 0 : node.index - 1;
          const nodeColor = isIncome ? '#6366f1' : getCategoryColor(categoryIndex);
          const labelY = isIncome ? sankeyHeight / 2 : Math.max(36, Math.min(sankeyHeight - 42, node.y + node.height / 2));
          
          return (
            <g>
              <rect x={node.x} y={node.y} width={node.width} height={node.height} fill={nodeColor} rx={6} opacity={0.9} />
              {/* Label positioned to the side of the node */}
              <text x={isIncome ? node.x - 8 : node.x + node.width + 8} y={labelY - 2} textAnchor={isIncome ? 'end' : 'start'} dominantBaseline="middle" fontSize="12" fontWeight="600" fill="white">{name}</text>
              {flow && <text x={isIncome ? node.x - 8 : node.x + node.width + 8} y={labelY + 14} textAnchor={isIncome ? 'end' : 'start'} dominantBaseline="middle" fontSize="10" fontWeight="500" fill="#d0d0d0">{flow.percentage.toFixed(1)}% · {formatCurrency(flow.value)}</text>}
            </g>
          );
        }}><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #4b5563', borderRadius: '8px', color: '#fff', padding: '8px 12px' }} formatter={(value: number) => [formatCurrency(value), '']} /></Sankey></ResponsiveContainer></div></div> : <p className="py-12 text-center text-sm text-on-surface-variant">No verified cash-flow activity in this cycle yet.</p>}
      </section>
      {/* NEW: Category Specific Trend & Growth Chart Section */}
      <div className="bg-surface-container-low border border-outline-variant/30 rounded-3xl p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <PieChart className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-bold text-on-surface">Category Spending & Growth Trend</h3>
            </div>
            <p className="text-xs text-on-surface-variant">Analyze 6-month historical spending velocity by category</p>
          </div>

          {/* Category Selector Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
              }`}
            >
              All Categories
            </button>
            {availableCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                }`}
              >
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category Key Metrics Summary */}
        <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-4 gap-3 mb-6 mobile-compact-grid">
          <div className="bg-surface-container/60 p-3.5 rounded-2xl border border-outline-variant/10">
            <span className="text-xs text-on-surface-variant font-medium block mb-1">Cycle Spending</span>
            <span className="text-base sm:text-lg font-bold text-on-surface font-numeric numeric-wrap">
              {formatCurrency(categoryTrendData.currentCycleSpend)}
            </span>
          </div>

          <div className="bg-surface-container/60 p-3.5 rounded-2xl border border-outline-variant/10">
            <span className="text-xs text-on-surface-variant font-medium block mb-1">vs Last Cycle</span>
            <div className={`text-sm font-bold flex items-center gap-1 font-numeric ${
              categoryTrendData.cycleChangePercent <= 0 ? 'text-emerald-500' : 'text-rose-500'
            }`}>
              {categoryTrendData.cycleChangePercent <= 0 ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
              {Math.abs(categoryTrendData.cycleChangePercent).toFixed(1)}%
            </div>
          </div>

          <div className="bg-surface-container/60 p-3.5 rounded-2xl border border-outline-variant/10">
            <span className="text-xs text-on-surface-variant font-medium block mb-1">6-Month Avg</span>
            <span className="text-lg font-bold text-on-surface font-numeric">
              {formatCurrency(categoryTrendData.avgSpend)}
            </span>
          </div>

          <div className="bg-surface-container/60 p-3.5 rounded-2xl border border-outline-variant/10">
            <span className="text-xs text-on-surface-variant font-medium block mb-1">Peak Purchase</span>
            <span className="text-sm font-bold text-primary truncate block font-numeric">
              {categoryTrendData.maxTx ? formatCurrency(Math.abs(categoryTrendData.maxTx.amount)) : '₹0'}
            </span>
          </div>
        </div>

        {/* Area Chart Visualization */}
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={categoryTrendData.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="catGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <YAxis domain={['auto', 'auto']} hide />
              <XAxis 
                dataKey="monthLabel" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'currentColor', fontSize: 11 }}
                className="text-on-surface-variant"
                dy={6}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-on-surface text-background px-3 py-2 rounded-xl text-xs shadow-xl border border-outline-variant/20">
                        <p className="font-semibold text-primary-container">{data.monthLabel}</p>
                        <p className="font-bold text-sm font-numeric mt-0.5">{formatCurrency(data.total)}</p>
                        <p className="text-[10px] text-on-surface-variant mt-0.5">{data.txCount} transactions</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="total" 
                stroke="var(--color-primary, #6366f1)" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#catGradient)" 
                baseValue="dataMin"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Asset Allocation */}
        <div className="lg:col-span-6 bg-surface-container-low border border-outline-variant/30 rounded-3xl p-6 relative overflow-hidden">
          <h3 className="text-xl font-bold text-on-surface mb-6">Asset Allocation</h3>
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="relative w-48 h-48 shrink-0">
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--color-surface-container)" strokeWidth="12" />
                {(() => {
                  let currentRotation = 0;
                  return assets.map((asset, i) => {
                    const percentage = totalAssets > 0 ? asset.balance / totalAssets : 0;
                    const segmentLength = percentage * 251.2;
                    const dashOffset = 251.2 - segmentLength;
                    
                    const element = (
                      <motion.circle
                        key={i}
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke={chartColors[i % chartColors.length]}
                        strokeWidth="12"
                        strokeDasharray="251.2"
                        initial={{ strokeDashoffset: 251.2 }}
                        animate={{ strokeDashoffset: dashOffset }}
                        transition={{ duration: 1.5, ease: "easeOut", delay: 0.1 * i }}
                        transform={`rotate(${currentRotation} 50 50)`}
                        className="transition-all duration-1000 ease-out"
                      />
                    );
                    currentRotation += percentage * 360;
                    return element;
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xs font-semibold text-on-surface-variant">Total Assets</span>
                <span className="text-xl font-bold text-primary font-numeric mt-1"><AnimatedNumber value={totalAssets} format={formatCurrency} /></span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full min-w-0">
              {assets.length > 0 ? (
                assets.slice(0, 4).map((asset, i) => (
                  <CategoryStat 
                    key={asset.id}
                    dot={dotClasses[i % dotClasses.length]} 
                    label={asset.name} 
                    amount={formatCurrency(asset.balance)}
                    percentage={totalAssets > 0 ? ((asset.balance / totalAssets) * 100).toFixed(1) + '%' : '0%'}
                  />
                ))
              ) : (
                <div className="col-span-2 text-center text-on-surface-variant text-sm py-4">
                  No assets available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* REWORKED: Satisfying Liability Paydown Visualizer */}
        <div className="lg:col-span-6 bg-surface-container-low border border-outline-variant/30 rounded-3xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-on-surface">Liability Paydown</h4>
                  <p className="text-xs text-on-surface-variant">Track & eliminate remaining debt</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> {overallDebtPaidPercent.toFixed(0)}% Debt Reduced
              </span>
            </div>

            {/* Overall Progress Gauge */}
            <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/20 mb-5">
              <div className="flex justify-between text-xs font-semibold text-on-surface-variant mb-2">
                <span>Total Debt Outstanding: <strong className="text-rose-500 font-numeric">{formatCurrency(totalLiabilities)}</strong></span>
                <span className="text-emerald-500 font-numeric">{formatCurrency(totalDebtPaid)} Paid Off</span>
              </div>
              <div className="w-full h-3 bg-surface-dim rounded-full overflow-hidden p-0.5 border border-outline-variant/20 relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${overallDebtPaidPercent}%` }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {liabilityMetrics.length > 0 ? (
              liabilityMetrics.slice(0, 3).map(liability => (
                <div key={liability.id} className="bg-surface-container p-3.5 rounded-2xl border border-outline-variant/20 hover:border-emerald-500/30 transition-all">
                  <div className="flex justify-between items-center text-sm mb-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-500" />
                      <span className="font-bold text-on-surface">{liability.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold font-numeric text-rose-400">-{formatCurrency(liability.balance)}</span>
                      <button
                        onClick={() => setPayCardModalState({ isOpen: true, cardId: liability.id })}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1"
                      >
                        <Flame className="w-3 h-3" /> Pay Down
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {liability.isCreditCard ? (
                      <>
                        <div className="flex justify-between text-[11px] text-on-surface-variant font-medium">
                          <span className={liability.utilization > 70 ? 'text-rose-400 font-bold' : liability.utilization > 30 ? 'text-amber-400 font-semibold' : 'text-emerald-500 font-semibold'}>
                            Credit Utilization: {liability.utilization.toFixed(0)}%
                          </span>
                          <span>{liability.isDebtFree ? '0% Utilized (Ideal) 🎉' : `${formatCurrency(liability.balance)} / ${formatCurrency(liability.totalCapacity)} Limit`}</span>
                        </div>
                        <div className="w-full h-2 bg-surface-dim rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${liability.utilization}%` }}
                            transition={{ duration: 1 }}
                            className={`h-full rounded-full ${
                              liability.utilization > 70 
                                ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]' 
                                : liability.utilization > 30 
                                ? 'bg-amber-500 shadow-[0_0_10px_#f59e0b]' 
                                : 'bg-emerald-500 shadow-[0_0_10px_#10b981]'
                            }`}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-[11px] text-on-surface-variant font-medium">
                          <span className={liability.isOverPrincipal ? 'text-rose-400 font-bold' : undefined}>Loan Payoff ({liability.percentPaid.toFixed(0)}% Paid)</span>
                          <span>{liability.isDebtFree ? 'DEBT FREE 🎉' : `${formatCurrency(liability.paidOff)} / ${formatCurrency(liability.totalCapacity)}`}</span>
                        </div>
                        {liability.isOverPrincipal && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400"><AlertTriangle className="w-3 h-3" /> Over Principal</span>}
                        <div className={`w-full h-2 bg-surface-dim rounded-full overflow-hidden ${liability.isOverPrincipal ? 'ring-1 ring-rose-500/60' : ''}`}>
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, liability.percentPaid)}%` }}
                            transition={{ duration: 1 }}
                            className={`h-full rounded-full ${liability.isOverPrincipal ? 'bg-rose-500 shadow-[0_0_12px_#f43f5e]' : liability.isDebtFree ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-emerald-500/80'}`}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-on-surface-variant text-center">
                <Trophy className="w-10 h-10 mb-2 text-emerald-500 opacity-80 animate-bounce" />
                <p className="text-sm font-bold text-on-surface">You are 100% Debt-Free!</p>
                <p className="text-xs text-on-surface-variant">No liabilities or active loans registered.</p>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Loan Amortization Explorer */}
        <div className="lg:col-span-12">
          <LoanAmortizationExplorer />
        </div>

        <section data-testid="grouped-spending-summary" className="lg:col-span-4 bg-surface-container-low border border-outline-variant/30 rounded-3xl p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold text-on-surface">Event Cash Flow</h3>
              <p className="mt-1 text-xs text-on-surface-variant">Inflow, outflow, and net movement for each event.</p>
            </div>
            <div className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
              {eventSummaries.length} events
            </div>
          </div>
          {eventSummaries.length > 0 ? (
            <div className="space-y-3">
              {eventSummaries.map(event => {
                const netFlow = event.income - event.expenses;
                const netTone = netFlow > 0 ? 'text-emerald-600 dark:text-emerald-400' : netFlow < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-on-surface-variant';

                return (
                  <article key={event.name} className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate font-semibold text-on-surface" title={event.name}>{event.name}</h4>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-on-surface-variant">Event summary</p>
                      </div>
                      <div className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${netTone}`}>
                        {netFlow >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netFlow))}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-semibold uppercase tracking-wide">
                      <div className="rounded-xl bg-emerald-500/10 px-2 py-2">
                        <p className="text-on-surface-variant">Inflow</p>
                        <p className="mt-0.5 text-emerald-600 dark:text-emerald-400 font-numeric normal-case tracking-normal">{formatCurrency(event.income)}</p>
                      </div>
                      <div className="rounded-xl bg-rose-500/10 px-2 py-2">
                        <p className="text-on-surface-variant">Outflow</p>
                        <p className="mt-0.5 text-rose-600 dark:text-rose-400 font-numeric normal-case tracking-normal">{formatCurrency(event.expenses)}</p>
                      </div>
                      <div className="rounded-xl bg-surface-container-highest px-2 py-2">
                        <p className="text-on-surface-variant">Net flow</p>
                        <p className={`mt-0.5 font-numeric normal-case tracking-normal ${netTone}`}>{formatCurrency(netFlow)}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container/70 p-4 text-center text-sm text-on-surface-variant">
              No event-linked cash flow has been recorded yet.
            </div>
          )}
        </section>

        {/* Net Worth Trend */}
        <div className="lg:col-span-8 bg-surface-container-low border border-outline-variant/30 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-on-surface">Net Worth Trajectory</h3>
          </div>
          <div className="flex items-end justify-between h-48 gap-2">
            {monthlyTrends.map((d, i) => (
              <div key={i} className="flex flex-col items-center flex-1 gap-3">
                <div className="w-full bg-transparent rounded-t-lg relative group flex items-end justify-center h-32 gap-1">
                  <div className="w-2/3 h-full relative flex items-end justify-center">
                    <motion.div 
                      className="w-full bg-primary rounded-t-lg opacity-90 shadow-[0_0_15px_rgba(var(--color-primary),0.2)]" 
                      initial={{ height: '0%' }} 
                      animate={{ height: d.h }} 
                      transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 * i }}
                    />
                  </div>
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-on-surface text-background px-3 py-2 rounded-xl text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 flex flex-col items-center shadow-lg pointer-events-none">
                    <span className="font-bold text-primary-container text-sm">{d.v}</span>
                    <span className="text-[9px] opacity-70 mt-0.5">{d.cycleLabel}</span>
                    <span className={`text-[10px] font-bold mt-0.5 flex items-center ${d.netFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {d.netFlow >= 0 ? <ArrowUp className="w-3 h-3 mr-0.5" /> : <ArrowDown className="w-3 h-3 mr-0.5" />}
                      {formatCurrency(Math.abs(d.netFlow))} net flow
                    </span>
                  </div>
                </div>
                <span className={`text-xs ${d.a ? 'font-bold text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant font-medium'}`}>{d.m}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Smart Tips are shown only when they come from actual ledger signals. */}
        {smartTips.length > 0 && (
          <div className="lg:col-span-4 flex flex-col gap-4">
            <h3 className="text-xl font-bold text-on-surface px-1">Smart Tips</h3>
            {smartTips.map((tip, i) => (
              <TipCard key={i} icon={tip.icon} color={tip.color} title={tip.title} desc={tip.desc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryStat({ dot, label, amount, percentage }: { dot: string; label: string; amount: string; percentage?: string }) {
  return (
    <div className="p-3 bg-surface-container rounded-2xl border border-outline-variant/20 flex flex-col justify-center min-w-0">
      <div className="flex items-center gap-2 mb-1.5 justify-between min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`}></div>
          <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider truncate" title={label}>{label}</span>
        </div>
        {percentage && <span className="text-[10px] font-bold text-primary font-numeric shrink-0 ml-1.5">{percentage}</span>}
      </div>
      <span className="font-bold text-on-surface font-numeric truncate">{amount}</span>
    </div>
  );
}

function TipCard({ icon: Icon, color, title, desc }: { icon: ComponentType<SVGProps<SVGSVGElement>>; color: string; title: string; desc: string }) {
  const colorMap: Record<string, { border: string; bg: string; icon: string }> = {
    primary: { border: 'border-l-primary', bg: 'bg-primary/10', icon: 'text-primary' },
    secondary: { border: 'border-l-secondary', bg: 'bg-secondary/10', icon: 'text-secondary' },
    tertiary: { border: 'border-l-tertiary', bg: 'bg-tertiary/10', icon: 'text-tertiary' },
  };
  const c = colorMap[color] || colorMap.primary;

  return (
    <div className={`bg-surface-container-low border-l-4 ${c.border} rounded-r-2xl p-4 flex gap-4 items-start shadow-sm border-y border-r border-outline-variant/20`}>
      <div className={`p-2.5 rounded-xl shrink-0 ${c.bg}`}>
        <Icon className={`w-5 h-5 ${c.icon}`} />
      </div>
      <div>
        <h4 className="font-bold text-on-surface mb-1 text-sm">{title}</h4>
        <p className="text-xs text-on-surface-variant leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
