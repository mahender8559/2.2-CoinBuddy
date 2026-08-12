import { TrendingUp, TrendingDown, Sparkles, ShieldCheck, ArrowDownRight, ArrowUpRight, Plus, PiggyBank, Bell, PlusSquare, Utensils, Car, Briefcase, Zap, CreditCard, ShoppingBag, Banknote, Home, Trash2, Wallet, Target, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { motion } from 'motion/react';
import { useEffect, useState, useMemo } from 'react';
import { WidgetModal } from './WidgetModal';
import { WidgetCard } from './WidgetCard';
import { AnimatedNumber } from './AnimatedNumber';
import { getBudgetSummary } from '../utils/budget';
import { icons } from '../icons';
import { AreaChart, Area, ResponsiveContainer, YAxis, XAxis, Tooltip, ReferenceLine } from 'recharts';

import { Transaction } from '../types';
import { EmiAdvocateBanner } from './EmiAdvocateBanner';
import { BackupWarningBanner } from './BackupWarningBanner';
import { isCashFlowTransaction } from '../domain/ledgerRules';

export function Dashboard() {
  const { transactions, addTransaction, formatCurrency, setAddModalOpen, creditCards, deleteTransaction, approveTransaction, rejectTransaction, categories, profile, setEditingTransaction, isDateInCurrentCycle, getCycleDetails, netWorth, accounts, setAddAccountModalType, widgets, addWidget, removeWidget, monthCycleDay, setEditingAccount, setEditingCreditCard } = useAppContext();
  const [isWidgetModalOpen, setWidgetModalOpen] = useState(false);
  const [pendingConfirmTx, setPendingConfirmTx] = useState<Transaction | null>(null);
  const [pendingConfirmDate, setPendingConfirmDate] = useState<string>('');
  const [pendingConfirmError, setPendingConfirmError] = useState<string>('');
  const totalAssets = useMemo(() => accounts.filter(a => a.type === 'asset' && !a.is_archived).reduce((sum, a) => sum + a.balance, 0), [accounts]);
  const totalLiabilities = useMemo(() => accounts.filter(a => a.type === 'liability' && !a.is_archived).reduce((sum, a) => sum + a.balance, 0), [accounts]);
  
  // Calculate historical Net Worth points for past 6 months/cycles based on actual transactions
  const getCycleBounds = (cycleOffset: number, cycleDay: number) => {
    const now = new Date();
    let targetMonth = now.getMonth() - cycleOffset;
    let targetYear = now.getFullYear();
    while (targetMonth < 0) {
      targetMonth += 12;
      targetYear -= 1;
    }

    let startDate: Date;
    let endDate: Date;

    if (cycleDay === 1) {
      startDate = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
      endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    } else {
      const currentDay = now.getDate();
      let cycleStartMonth = targetMonth;
      let cycleStartYear = targetYear;
      if (currentDay < cycleDay) {
        cycleStartMonth -= 1;
        if (cycleStartMonth < 0) {
          cycleStartMonth += 12;
          cycleStartYear -= 1;
        }
      }
      startDate = new Date(cycleStartYear, cycleStartMonth, cycleDay, 0, 0, 0, 0);
      
      let cycleEndMonth = cycleStartMonth + 1;
      let cycleEndYear = cycleStartYear;
      if (cycleEndMonth > 11) {
        cycleEndMonth -= 12;
        cycleEndYear += 1;
      }
      endDate = new Date(cycleEndYear, cycleEndMonth, cycleDay - 1, 23, 59, 59, 999);
    }

    const monthName = startDate.toLocaleDateString('en-US', { month: 'short' });
    return { startDate, endDate, monthName };
  };

  const getCycleNetFlow = (startDate: Date, endDate: Date) => {
    return transactions.reduce((acc, t) => {
      const d = new Date(t.date);
      if (d >= startDate && d <= endDate) {
        if (isCashFlowTransaction(t) && t.type === 'income') return acc + Math.abs(t.amount);
        if (isCashFlowTransaction(t) && t.type === 'expense') return acc - Math.abs(t.amount);
      }
      return acc;
    }, 0);
  };

  const cycleFlows = [0, 1, 2, 3, 4, 5].map(offset => {
    const bounds = getCycleBounds(offset, monthCycleDay);
    const flow = getCycleNetFlow(bounds.startDate, bounds.endDate);
    return { offset, monthName: bounds.monthName, flow, startDate: bounds.startDate, endDate: bounds.endDate };
  });

  const earliestTxDate = transactions.length > 0
    ? new Date(Math.min(...transactions.map(t => new Date(t.date).getTime())))
    : null;

  let runningNW = netWorth;
  const historicalValues: { name: string; value: number }[] = [];

  for (let i = 0; i <= 5; i++) {
    const item = cycleFlows[i];
    
    // Check if there are any transactions on or before the end of this cycle
    const hasTransactionsOnOrBefore = earliestTxDate 
      ? earliestTxDate <= item.endDate 
      : false;

    // If there were no transactions on or before this cycle, historical net worth was 0
    const netWorthVal = hasTransactionsOnOrBefore ? runningNW : 0;

    historicalValues.unshift({
      name: item.monthName,
      value: netWorthVal
    });
    runningNW = runningNW - item.flow;
  }

  const chartData = historicalValues;
  const startNetWorth = runningNW;
  const currentNW = netWorth;

  let growthPercentage = 0;
  if (startNetWorth !== 0) {
    growthPercentage = ((currentNW - startNetWorth) / Math.abs(startNetWorth)) * 100;
  } else if (currentNW > 0) {
    growthPercentage = 100;
  }

  const pendingTxs = transactions.filter(t => {
    if (t.is_verified !== 0) return false;
    const txDate = new Date(t.date);
    const now = new Date();
    // Reset time for both to compare days accurately
    txDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diff = txDate.getTime() - now.getTime();
    const days = diff / (1000 * 3600 * 24);
    return days <= 5;
  });

  const currentMonthTxs = transactions.filter(t => isDateInCurrentCycle(t.date) && !t.isOpeningBalance && t.is_verified !== 0 && isCashFlowTransaction(t));
  
  const cycleIncome = currentMonthTxs
    .filter(t => t.type === 'income')
    .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

  const cycleExpenses = currentMonthTxs
    .filter(t => t.type === 'expense')
    .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

  const cycleNet = cycleIncome - cycleExpenses;

  const expenses = currentMonthTxs
    .filter(t => {
      if (t.type !== 'expense') return false;
      const catObj = categories.find(c => `#${c.name.toLowerCase().replace(/\s+/g, '')}` === t.category || c.id === t.category);
      return catObj?.group !== 'Savings';
    })
    .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);
    
  const { budget: totalMonthlyBudget, progress: budgetProgress } = getBudgetSummary(categories, transactions, getCycleDetails);
  const budgetStatus = budgetProgress <= 100 ? 'ON TRACK' : 'OVER BUDGET';

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const spikedCategories = categories.filter(c => c.type !== 'income' && c.group !== 'Savings').map(c => {
    const catTag = `#${c.name.toLowerCase().replace(/\s+/g, '')}`;
    const currAmount = currentMonthTxs.filter(t => t.type === 'expense' && (t.category === catTag || t.category === c.id)).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const lastMonthAmount = transactions.filter(t => {
      const d = new Date(t.date);
      return !t.isOpeningBalance && d >= sixtyDaysAgo && d < thirtyDaysAgo && isCashFlowTransaction(t) && t.type === 'expense' && (t.category === catTag || t.category === c.id);
    }).reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return { name: c.name, currAmount, lastMonthAmount, increase: lastMonthAmount > 0 ? ((currAmount - lastMonthAmount) / lastMonthAmount) * 100 : 0 };
  }).filter(c => c.lastMonthAmount > 0 && c.increase > 20).sort((a, b) => b.increase - a.increase);

  return (
    <div className="space-y-6 animate-fade-in pb-24 md:pb-0 max-w-lg mx-auto relative">
      {/* Backup Warning Banner for Background Error Watchdog */}
      <BackupWarningBanner />

      {/* Financial Advocate EMI Reminders Banner */}
      <EmiAdvocateBanner />

      {/* Net Worth */}
      <div className="flex flex-col items-center justify-center pt-8 pb-4">
        <div className="mb-1 flex items-center gap-2">
          <p className="text-sm text-on-surface-variant font-medium tracking-wide">Net Worth</p>
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold text-on-surface font-numeric tracking-tight text-center numeric-wrap">
          <AnimatedNumber value={netWorth} format={formatCurrency} />
        </h1>
      </div>

      {/* Total Assets & Liabilities Cards */}
      <div data-tour-id="tour-account-cards" className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4 mobile-compact-grid">
        <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex flex-col justify-center">
           <div className="flex items-center gap-2 mb-2">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
             <p className="text-sm text-on-surface-variant font-medium">Total Assets</p>
             <TrendingUp className="w-4 h-4 text-emerald-500/50 ml-auto" />
           </div>
           <p className="text-xl sm:text-2xl font-bold font-numeric text-on-surface tracking-tight numeric-wrap"><AnimatedNumber value={totalAssets} format={formatCurrency} /></p>
        </div>
        <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex flex-col justify-center">
           <div className="flex items-center gap-2 mb-2">
             <div className="w-2 h-2 rounded-full bg-rose-500"></div>
             <p className="text-sm text-on-surface-variant font-medium">Total Liabilities</p>
             <TrendingUp className="w-4 h-4 text-rose-500/50 transform rotate-180 ml-auto" />
           </div>
           <p className="text-xl sm:text-2xl font-bold font-numeric text-on-surface tracking-tight numeric-wrap"><AnimatedNumber value={totalLiabilities} format={formatCurrency} /></p>
        </div>
      </div>

      {/* Cycle Income & Expenses Card */}
      <div data-tour-id="tour-summary-widgets" className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/10 shadow-sm space-y-4">
        <div className="flex flex-col min-[390px]:flex-row min-[390px]:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary tracking-wide">
              {monthCycleDay > 1 ? `Cycle (Starts Day ${monthCycleDay})` : 'Monthly Cycle'}
            </span>
          </div>
          <span className="text-xs text-on-surface-variant font-medium">
            Net Cash Flow: <span className={cycleNet >= 0 ? 'text-emerald-500 font-bold font-numeric' : 'text-rose-500 font-bold font-numeric'}>{cycleNet >= 0 ? '+' : ''}{formatCurrency(cycleNet)}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 pt-1 mobile-compact-grid">
          <div className="bg-surface-container/60 rounded-xl p-3.5 border border-outline-variant/5">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <ArrowDownRight className="w-4 h-4" />
              </div>
              <p className="text-xs text-on-surface-variant font-medium">Cycle Income</p>
            </div>
            <p className="text-xl font-bold font-numeric text-emerald-500 tracking-tight">
              <AnimatedNumber value={cycleIncome} format={formatCurrency} />
            </p>
          </div>

          <div className="bg-surface-container/60 rounded-xl p-3.5 border border-outline-variant/5">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <p className="text-xs text-on-surface-variant font-medium">Cycle Expenses</p>
            </div>
            <p className="text-xl font-bold font-numeric text-rose-500 tracking-tight">
              <AnimatedNumber value={cycleExpenses} format={formatCurrency} />
            </p>
          </div>
        </div>
      </div>

      {/* Net Worth Growth Chart */}
      <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Net Worth Growth</h2>
            <p className="text-xs text-on-surface-variant">Last 6 Months</p>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
            growthPercentage >= 0 
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
              : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
          }`}>
            {growthPercentage >= 0 ? <TrendingUp className="w-3.5 h-3.5 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 shrink-0" />}
            <span className="font-numeric tracking-tight">
              {growthPercentage >= 0 ? '+' : ''}{growthPercentage.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0.35}/>
                  <stop offset="95%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <YAxis domain={[(dataMin: number) => Math.min(0, dataMin), (dataMax: number) => Math.max(0, dataMax)]} hide />
              <XAxis 
                dataKey="name" 
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
                      <div className="bg-surface-container-highest text-on-surface text-xs rounded-xl p-2.5 shadow-lg border border-outline-variant/20 space-y-0.5">
                        <p className="font-semibold text-on-surface-variant">{data.name}</p>
                        <p className="font-numeric font-bold text-primary text-sm">{formatCurrency(data.value)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine 
                y={0} 
                stroke="rgba(255, 255, 255, 0.25)" 
                strokeDasharray="3 3" 
                label={{ 
                  value: '₹0 Level', 
                  fill: 'rgba(255, 255, 255, 0.45)', 
                  fontSize: 10, 
                  position: 'insideBottomLeft' 
                }} 
              />
              <Area type="monotone" dataKey="value" stroke="var(--color-primary, #6366f1)" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" baseValue={0} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pending Verifications */}
      <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
        <div className="p-5 flex justify-between items-center border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Needs confirmation</h2>
        </div>
        <div className="divide-y divide-outline-variant/10">
          {pendingTxs.slice(0, 2).map((tx) => (
            <div key={tx.id} className="p-5 flex items-start justify-between hover:bg-surface-container-high transition-colors">
              <div className="flex items-start gap-4 flex-grow min-w-0">
                <div className="flex-grow min-w-0">
                  <p className="font-medium text-on-surface break-words whitespace-pre-wrap">{tx.title}</p>
                  <p className="text-xs text-on-surface-variant break-words whitespace-pre-wrap mt-0.5">{tx.subtitle || 'Verification'} • Recurring</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center items-end gap-2 sm:gap-4 shrink-0 pl-2">
                <p className="font-semibold text-on-surface font-numeric"><AnimatedNumber value={tx.amount} format={formatCurrency} /></p>
                <button
                  onClick={() => { setPendingConfirmTx(tx); setPendingConfirmDate(tx.date); }}
                  className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Review
                </button>
              </div>
            </div>
          ))}
          {pendingTxs.length === 0 && (
            <div className="p-5 text-center text-sm text-on-surface-variant">Nothing needs confirmation.</div>
          )}
        </div>
      </div>

      {/* Pending Confirmation Modal */}
      {pendingConfirmTx && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface rounded-3xl border border-outline-variant/20 p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-on-surface">{pendingConfirmTx.type === 'income' ? 'Did you receive this income?' : pendingConfirmTx.type === 'expense' ? 'Did you make this payment?' : 'Did this transfer happen?'}</h3>
                <p className="text-xs text-on-surface-variant">Confirm only after it actually happened. Until then, it does not affect your balances.</p>
              </div>
            </div>

            <div className="bg-surface-container p-4 rounded-2xl space-y-2 border border-outline-variant/10">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Title</span>
                <span className="font-medium text-on-surface">{pendingConfirmTx.title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Category</span>
                <span className="font-medium text-on-surface">{pendingConfirmTx.category}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Amount</span>
                <span className="font-bold text-on-surface font-numeric">{formatCurrency(pendingConfirmTx.amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Type</span>
                <span className="capitalize font-medium text-on-surface">{pendingConfirmTx.type}</span>
              </div>
            </div>
            
            <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/30 flex flex-col gap-2">
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Date of Transaction</label>
              <input 
                type="date"
                value={pendingConfirmDate}
                onChange={(e) => setPendingConfirmDate(e.target.value)}
                className="w-full bg-surface px-3 py-2 rounded-lg text-sm font-semibold text-on-surface border border-outline-variant/20 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>

            {pendingConfirmError && (
              <div role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-medium text-error">
                {pendingConfirmError} The scheduled item is still pending; add funds or choose another confirmation date and try again.
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setPendingConfirmTx(null); setPendingConfirmError(''); }}
                className="bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold py-3 px-4 rounded-2xl text-sm transition-colors cursor-pointer"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={() => {
                  rejectTransaction(pendingConfirmTx.id);
                  setPendingConfirmTx(null);
                  setPendingConfirmError('');
                }}
                className="flex-1 bg-error/10 hover:bg-error/20 text-error font-semibold py-3 px-4 rounded-2xl text-sm transition-colors cursor-pointer"
              >
                Skip this occurrence
              </button>
              <button
                type="button"
                onClick={() => {
                  const outcome = approveTransaction(pendingConfirmTx.id, pendingConfirmDate);
                  if (outcome.success) {
                    setPendingConfirmTx(null);
                    setPendingConfirmError('');
                  } else {
                    setPendingConfirmError(outcome.error || 'This scheduled transaction cannot be confirmed yet.');
                  }
                }}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-contrast font-semibold py-3 px-4 rounded-2xl text-sm transition-colors shadow-md cursor-pointer"
              >
                {pendingConfirmTx.type === 'income' ? 'Received ✓' : pendingConfirmTx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Review (Spikes) */}
      {spikedCategories.length > 0 && (
        <div className="bg-surface-container-low rounded-2xl border border-error/20 shadow-sm overflow-hidden mb-6 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center text-error">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">Category Review</h2>
              <p className="text-xs text-on-surface-variant">Spending spiked vs last month. Be mindful!</p>
            </div>
          </div>
          <div className="space-y-3">
            {spikedCategories.slice(0, 3).map((c, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-surface-container rounded-xl">
                <div>
                  <p className="text-sm font-medium text-on-surface">{c.name}</p>
                  <p className="text-xs text-error font-medium">+{c.increase.toFixed(0)}% increase</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-numeric font-bold text-on-surface">{formatCurrency(c.currAmount)}</p>
                  <p className="text-[10px] text-on-surface-variant">vs {formatCurrency(c.lastMonthAmount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Budget vs Actual */}
      <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/10 shadow-sm mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-on-surface">Budget vs Actual</h2>
          <span className={`px-2.5 py-0.5 ${budgetProgress <= 100 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-error/20 text-error'} text-[10px] font-bold rounded-full uppercase tracking-wider`}>
            {budgetStatus}
          </span>
        </div>
        
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-xs text-on-surface-variant mb-1">Monthly Budget</p>
            <p className="text-xl font-bold font-numeric text-on-surface"><AnimatedNumber value={totalMonthlyBudget} format={formatCurrency} /></p>
          </div>
          <div className="text-right">
            <p className="text-xs text-on-surface-variant mb-1">Actual Spent</p>
            <p className="text-xl font-bold font-numeric text-primary"><AnimatedNumber value={expenses} format={formatCurrency} /></p>
          </div>
        </div>
        
        <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden flex relative">
          <motion.div className="bg-primary h-full rounded-full" 
           initial={{ width: 0 }} 
           animate={{ width: `${Math.min(100, budgetProgress)}%` }} 
           transition={{ duration: 1.5, ease: "easeOut" }}></motion.div>
          {budgetProgress > 100 && (
             <motion.div className="bg-error h-full rounded-full" 
             initial={{ width: 0 }} 
             animate={{ width: `${Math.min(100, budgetProgress - 100)}%` }} 
             transition={{ duration: 1.5, ease: "easeOut" }}></motion.div>
          )}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-on-surface-variant font-mono"><AnimatedNumber value={budgetProgress} format={(val) => Math.round(val) + '%'} /></span>
          <span className="text-[10px] text-on-surface-variant font-mono uppercase tracking-wider">BUDGET LIMIT</span>
        </div>
      </div>

      {/* Dynamic Widgets */}
      {widgets.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {widgets.map(w => (
            <WidgetCard key={w.id} widget={w} />
          ))}
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden mb-6">
        <div className="p-5 flex justify-between items-center border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Recent Activity</h2>
        </div>
        <div className="divide-y divide-outline-variant/10">
          {transactions.filter(t => t.is_verified !== 0 && ['income', 'expense', 'transfer'].includes(t.type)).slice(0, 4).map((tx) => {
            const isIncome = tx.type === 'income';
            return (
              <div key={tx.id} className="p-5 flex items-start justify-between hover:bg-surface-container-high transition-colors cursor-pointer" onClick={() => { setEditingTransaction(tx); setAddModalOpen(true); }}>
                <div className="flex items-start gap-4 flex-grow min-w-0 pt-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isIncome ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    {isIncome ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  </div>
                  <div className="flex-grow min-w-0 pt-0.5">
                    <p className="font-semibold text-on-surface break-words whitespace-pre-wrap leading-tight">{tx.title}</p>
                    <p className="text-xs text-on-surface-variant break-words whitespace-pre-wrap mt-1">
                      {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} <span className="capitalize opacity-80">• {tx.type}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-start gap-3 pt-1">
                  <div className="text-right">
                    <p className={`font-bold font-numeric ${isIncome ? 'text-emerald-500' : 'text-on-surface'}`}>
                      {isIncome ? '+' : ''}{formatCurrency(tx.amount)}
                    </p>
                    <div className="mt-1.5 flex justify-end">
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] bg-surface-variant text-on-surface-variant font-bold uppercase tracking-wider text-right break-words max-w-[150px]">
                        {tx.isOpeningBalance ? 'Opening Balance' : tx.category.replace(/^#/, '')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {transactions.filter(t => t.is_verified !== 0 && ['income', 'expense', 'transfer'].includes(t.type)).length === 0 && (
            <div className="p-5 text-center text-sm text-on-surface-variant">No recent activity.</div>
          )}
        </div>
      </div>

      {/* Add Widget Option */}
      <div className="flex justify-center mt-6 pb-8">
        <button 
          onClick={() => setWidgetModalOpen(true)}
          className="flex items-center gap-2 text-sm font-semibold text-primary hover:opacity-80 bg-primary/10 hover:bg-primary/20 px-6 py-3 rounded-full transition-colors border border-primary/20"
        >
          <Plus className="w-4 h-4" /> Add Widget
        </button>
      </div>

      <WidgetModal isOpen={isWidgetModalOpen} onClose={() => setWidgetModalOpen(false)} />
    </div>
  );
}
