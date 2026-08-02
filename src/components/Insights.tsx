import { useState, useMemo } from 'react';
import { 
  ShieldCheck, ArrowUpRight, TrendingDown, Lightbulb, PiggyBank, ArrowUp, ArrowDown, 
  Sparkles, Trophy, Flame, CreditCard, PieChart, Layers, CheckCircle2, ArrowRight
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { AnimatedNumber } from './AnimatedNumber';
import { icons } from '../icons';
import { LoanAmortizationExplorer } from './LoanAmortizationExplorer';
import { getOriginalPrincipal } from '../utils/emi';

export function Insights() {
  const { 
    transactions, 
    formatCurrency, 
    categories, 
    profile, 
    getCycleDetails, 
    isDateInCurrentCycle, 
    accounts, 
    creditCards,
    netWorth,
    setPayCardModalState
  } = useAppContext();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

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
      if (t.isOpeningBalance || t.is_verified === 0 || t.type !== 'expense' || !isDateInCurrentCycle(t.date)) return false;
      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\s+/g, '')}` === t.category || c.id === t.category);
      return catObj?.group !== 'Savings';
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
    transactions.filter(t => !t.isOpeningBalance && t.is_verified !== 0 && t.type === 'expense').forEach(t => set.add(t.category));
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
      !t.isOpeningBalance && t.is_verified !== 0 && t.type === 'expense' && (selectedCategory === 'all' || t.category === selectedCategory)
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

  // Net Worth monthly trends
  const monthlyTrends = useMemo(() => {
    const now = new Date();
    const monthlyNetFlow: Record<string, number> = {};
    transactions.forEach(t => {
      const cycle = getCycleDetails(t.date);
      if (t.type === 'income') {
        monthlyNetFlow[cycle.key] = (monthlyNetFlow[cycle.key] || 0) + Math.abs(t.amount);
      } else if (t.type === 'expense') {
        monthlyNetFlow[cycle.key] = (monthlyNetFlow[cycle.key] || 0) - Math.abs(t.amount);
      }
    });

    const currentCycle = getCycleDetails(now.toISOString());
    let currentNetWorth = netWorth;
    const historicalNetWorth = [];

    const earliestTxDate = transactions.length > 0
      ? new Date(Math.min(...transactions.map(t => new Date(t.date).getTime())))
      : null;

    for (let i = 0; i <= 5; i++) {
      let m = currentCycle.month - i;
      let y = currentCycle.year;
      while (m < 0) {
        m += 12;
        y -= 1;
      }
      
      const key = `${y}-${m}`;
      const cycleEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
      const hasTxsOnOrBefore = earliestTxDate ? earliestTxDate <= cycleEnd : false;

      historicalNetWorth.unshift({
        key,
        m: new Date(y, m, 1).toLocaleString('default', { month: 'short' }),
        netWorth: hasTxsOnOrBefore ? currentNetWorth : 0,
        netFlow: monthlyNetFlow[key] || 0,
        isCurrent: i === 0,
      });
      currentNetWorth -= (monthlyNetFlow[key] || 0);
    }

    const minNw = Math.min(...historicalNetWorth.map(h => h.netWorth), 0);
    const maxNw = Math.max(...historicalNetWorth.map(h => h.netWorth), 1);
    const range = maxNw - minNw || 1;

    return historicalNetWorth.map(t => ({
      m: t.m,
      h: `${Math.max(5, Math.round(((t.netWorth - minNw) / range) * 100))}%`,
      v: formatCurrency(t.netWorth),
      rawTotal: t.netWorth,
      a: t.isCurrent,
      netFlow: t.netFlow
    }));
  }, [transactions, formatCurrency, getCycleDetails, netWorth]);

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

    const recurringTxs = transactions.filter(t => !t.isOpeningBalance && t.is_verified !== 0 && t.type === 'expense' && (t.title.toLowerCase().includes('subscription') || t.title.toLowerCase().includes('netflix') || t.title.toLowerCase().includes('spotify')));
    if (recurringTxs.length > 0) {
      tips.push({
        icon: Lightbulb,
        color: 'secondary',
        title: 'Subscription Alert',
        desc: `Found ${recurringTxs.length} potential subscriptions, ${firstName}. Total: ${formatCurrency(recurringTxs.reduce((acc, t) => acc + Math.abs(t.amount), 0))}.`
      });
    } else {
      tips.push({
        icon: Lightbulb,
        color: 'secondary',
        title: 'Review Recent Purchases',
        desc: `Keeping an eye on smaller purchases can help reduce your overall monthly spending, ${firstName}.`
      });
    }
    
    tips.push({
      icon: PiggyBank,
      color: 'tertiary',
      title: 'Savings Potential',
      desc: `Setting aside ${formatCurrency(20)}/week could fund an extra ${formatCurrency(80)} to your savings goal by next month, ${firstName}.`
    });

    return tips;
  }, [topCategoryInfo, transactions, formatCurrency, categories, profile]);

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
        percentPaid: Math.min(100, Math.max(0, percentPaid)),
        isDebtFree: liability.balance === 0
      };
    });
  }, [liabilities, creditCards]);

  const totalDebtPaid = liabilityMetrics.reduce((sum, l) => sum + l.paidOff, 0);
  const totalDebtCapacity = liabilityMetrics.reduce((sum, l) => sum + (l.totalCapacity || l.balance), 0);
  const overallDebtPaidPercent = totalDebtCapacity > 0 ? Math.min(100, (totalDebtPaid / totalDebtCapacity) * 100) : 100;

  const chartColors = ['#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#f43f5e'];
  const dotClasses = ['bg-[#8b5cf6]', 'bg-[#10b981]', 'bg-[#f59e0b]', 'bg-[#ec4899]', 'bg-[#0ea5e9]', 'bg-[#f43f5e]'];

  return (
    <div className="space-y-8 pb-24 md:pb-0 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Financial Intelligence</p>
          <h2 className="text-2xl font-bold text-on-surface">Analytics & Category Trends</h2>
        </div>
        <div className="flex items-center gap-2 bg-surface-container-low px-4 py-2 rounded-xl border border-outline-variant/30">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-on-surface-variant">Data stored securely on this device</span>
        </div>
      </div>

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
                          <span>Loan Payoff ({liability.percentPaid.toFixed(0)}% Paid)</span>
                          <span>{liability.isDebtFree ? 'DEBT FREE 🎉' : `${formatCurrency(liability.paidOff)} / ${formatCurrency(liability.totalCapacity)}`}</span>
                        </div>
                        <div className="w-full h-2 bg-surface-dim rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${liability.percentPaid}%` }}
                            transition={{ duration: 1 }}
                            className={`h-full rounded-full ${liability.isDebtFree ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-emerald-500/80'}`}
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

        {/* Smart Tips */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <h3 className="text-xl font-bold text-on-surface px-1">Smart Tips</h3>
          
          {smartTips.map((tip, i) => (
            <TipCard 
              key={i}
              icon={tip.icon} 
              color={tip.color} 
              title={tip.title} 
              desc={tip.desc} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryStat({ dot, label, amount, percentage }: any) {
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

function TipCard({ icon: Icon, color, title, desc }: any) {
  const colorMap: Record<string, any> = {
    primary: { border: 'border-l-primary', bg: 'bg-primary/10', icon: 'text-primary' },
    secondary: { border: 'border-l-secondary', bg: 'bg-secondary/10', icon: 'text-secondary' },
    tertiary: { border: 'border-l-tertiary', bg: 'bg-tertiary/10', icon: 'text-tertiary' },
  };
  const c = colorMap[color] || colorMap.primary;

  return (
    <div className={`bg-surface-container-low border-l-4 ${c.border} rounded-r-2xl p-4 flex gap-4 items-start shadow-sm hover:translate-x-1 transition-transform cursor-pointer border-y border-r border-outline-variant/20`}>
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
