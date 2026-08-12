import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { generateLoanSchedule, LoanScheduleRow } from '../utils/emi';
import { UpdateLoanRateModal } from './UpdateLoanRateModal';
import { CurrencyInput } from './CurrencyInput';
import { 
  Calculator, PieChart, Landmark, Calendar, Percent, 
  ChevronDown, ChevronUp, Clock, Info, ShieldAlert, Sparkles, Layers, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
type CustomTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: LoanScheduleRow }>;
  formatCurrency: (amount: number) => string;
};

function CustomTooltip({ active, payload, formatCurrency }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data: LoanScheduleRow = payload[0].payload;
    const totalMonthPayment = data.principalPortion + data.interestPortion;
    const principalPct = totalMonthPayment > 0 ? ((data.principalPortion / totalMonthPayment) * 100).toFixed(1) : '0';
    const interestPct = totalMonthPayment > 0 ? ((data.interestPortion / totalMonthPayment) * 100).toFixed(1) : '0';

    return (
      <div className="bg-surface-container-high border border-outline-variant/40 p-3.5 rounded-2xl shadow-xl backdrop-blur-md text-xs space-y-2 font-sans min-w-[220px]">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
          <span className="font-bold text-on-surface flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-primary" /> Month {data.monthIndex} ({data.date})
          </span>
          <span className="font-numeric font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full text-[10px]">
            EMI: {formatCurrency(data.emi)}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-emerald-400">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Principal Portion:
            </span>
            <span className="font-numeric font-bold">{formatCurrency(data.principalPortion)} ({principalPct}%)</span>
          </div>

          <div className="flex justify-between items-center text-rose-400">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> Interest Portion:
            </span>
            <span className="font-numeric font-bold">{formatCurrency(data.interestPortion)} ({interestPct}%)</span>
          </div>

          <div className="flex justify-between items-center text-cyan-400 border-t border-outline-variant/20 pt-1.5 mt-1">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Remaining Balance:
            </span>
            <span className="font-numeric font-bold">{formatCurrency(data.remainingBalance)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function LoanAmortizationExplorer() {
  const { accounts, formatCurrency } = useAppContext();

  // Find existing loan liabilities
  const loanAccounts = useMemo(() => {
    return accounts.filter(a => 
      !a.is_archived && 
      a.type === 'liability' && 
      (a.group === 'Bank Loan' || a.group === 'Loan' || a.group === 'Mortgage' || a.group === 'Interest-Only Loan' || a.interestRate !== undefined || a.interestRate !== undefined || a.monthlyEMI !== undefined || a.monthlyEMI !== undefined)
    );
  }, [accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>('custom');
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);

  const selectedAccount = useMemo(() => {
    return loanAccounts.find(a => a.id === selectedAccountId) || null;
  }, [loanAccounts, selectedAccountId]);

  // Input states
  const [principal, setPrincipal] = useState<string>('500000');
  const [interestRate, setInterestRate] = useState<string>('8.5');
  const [tenureMonths, setTenureMonths] = useState<string>('24');
  const [interestType, setInterestType] = useState<'REDUCING' | 'FLAT' | 'INTEREST_ONLY'>('REDUCING');
  const [paymentFrequency, setPaymentFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'>('MONTHLY');
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Table expand & pagination
  const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
  const [isExplorerExpanded, setIsExplorerExpanded] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 12;

  // Handle account selection
  const handleAccountSelect = (id: string) => {
    setSelectedAccountId(id);
    if (id === 'custom') return;

    const acc = loanAccounts.find(a => a.id === id);
    if (acc) {
      const p = acc.originalPrincipal || acc.balance || 500000;
      const rate = acc.interestRate ?? acc.interestRate ?? 8.5;
      const months = acc.tenureMonths ?? acc.tenureMonths ?? 24;
      const type = (acc.interestCalculationType || acc.interestCalculationType || 'REDUCING') as 'REDUCING' | 'FLAT' | 'INTEREST_ONLY';
      const freq = (acc.paymentFrequency || acc.paymentFrequency || 'MONTHLY') as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
      const start = acc.loanStartDate || acc.loanStartDate || acc.nextEMIDate || new Date().toISOString().slice(0, 10);

      setPrincipal(p.toString());
      setInterestRate(rate.toString());
      setTenureMonths(months.toString());
      setInterestType(type);
      setPaymentFrequency(freq);
      setStartDate(start);
      setCurrentPage(1);
    }
  };

  // Compute amortization schedule
  const scheduleResult = useMemo(() => {
    const p = parseFloat(principal) || 0;
    const rate = parseFloat(interestRate) || 0;
    const months = parseInt(tenureMonths) || 12;
    const revisions = selectedAccount?.revisions || [];
    return generateLoanSchedule(p, rate, months, interestType, startDate, revisions, paymentFrequency);
  }, [principal, interestRate, tenureMonths, interestType, paymentFrequency, startDate, selectedAccount]);

  const { schedule, totalPrincipal, totalInterest, totalAmount, monthlyEmi } = scheduleResult;

  const totalPages = Math.ceil(schedule.length / rowsPerPage);
  const paginatedSchedule = useMemo(() => {
    const startIdx = (currentPage - 1) * rowsPerPage;
    return schedule.slice(startIdx, startIdx + rowsPerPage);
  }, [schedule, currentPage]);

  const interestRatio = totalPrincipal > 0 ? ((totalInterest / totalPrincipal) * 100).toFixed(1) : '0';

  return (
    <div className="bg-surface-container-low border border-outline-variant/30 rounded-3xl p-5 md:p-6 space-y-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-2xl text-primary shrink-0">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-on-surface flex items-center gap-2">
              Loan Amortization Explorer
            </h3>
            <p className="text-xs text-on-surface-variant">
              Interactive principal vs. interest breakdown and debt payoff simulation
            </p>
          </div>
        </div>

        {loanAccounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-on-surface-variant whitespace-nowrap">Load Loan:</label>
            <select
              value={selectedAccountId}
              onChange={(e) => handleAccountSelect(e.target.value)}
              className="bg-surface-container border border-outline-variant/30 rounded-xl py-1.5 px-3 text-xs font-medium text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="custom"> Custom Loan Scenario</option>
              {loanAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                   {acc.name} ({formatCurrency(acc.balance)})
                </option>
              ))}
            </select>

            {selectedAccount && (
              <button
                onClick={() => setIsRateModalOpen(true)}
                className="bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 active:scale-95"
                title="Revise interest rate or EMI strategy"
              >
                <Percent className="w-3.5 h-3.5" /> Update Interest Rate
              </button>
            )}
          </div>
        )}
        <button onClick={() => setIsExplorerExpanded(open => !open)} className="self-end sm:self-auto px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold flex items-center gap-1.5 hover:bg-primary/20">
          {isExplorerExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {isExplorerExpanded ? 'Collapse' : 'Open'}
        </button>
      </div>

      <div className={isExplorerExpanded ? 'space-y-6' : 'hidden'}>
      {/* Input Controls Grid */}
      <div className="bg-surface-container p-3 sm:p-4 rounded-2xl border border-outline-variant/20 grid grid-cols-1 min-[390px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mobile-compact-grid">
        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
            <Landmark className="w-3.5 h-3.5 text-primary" /> Principal ()
          </label>
          <CurrencyInput
            value={principal}
            onValueChange={(value) => {
              setPrincipal(value);
              setSelectedAccountId('custom');
            }}
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm font-bold font-numeric text-on-surface focus:outline-none focus:border-primary"
            placeholder="500000"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
            <Percent className="w-3.5 h-3.5 text-primary" /> Interest Rate (%)
          </label>
          <input
            type="number"
            step="0.1"
            value={interestRate}
            onChange={(e) => {
              setInterestRate(e.target.value);
              setSelectedAccountId('custom');
            }}
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm font-bold font-numeric text-on-surface focus:outline-none focus:border-primary"
            placeholder="8.5"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-primary" /> Interest Type
          </label>
          <select
            value={interestType}
            onChange={(e) => {
              setInterestType(e.target.value as 'REDUCING' | 'FLAT' | 'INTEREST_ONLY');
              setSelectedAccountId('custom');
            }}
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm font-bold text-on-surface focus:outline-none focus:border-primary appearance-none"
          >
            <option value="REDUCING">Reducing Balance</option>
            <option value="FLAT">Flat Rate</option>
            <option value="INTEREST_ONLY">Interest-Only (Bullet Repayment)</option>
          </select>
        </div>

        {interestType === 'INTEREST_ONLY' && (
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5 text-primary" /> Frequency
            </label>
            <select
              value={paymentFrequency}
              onChange={(e) => {
                setPaymentFrequency(e.target.value as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY');
                setSelectedAccountId('custom');
              }}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm font-bold text-on-surface focus:outline-none focus:border-primary appearance-none"
            >
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUALLY">Annually</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-primary" /> Tenure (Months)
          </label>
          <input
            type="number"
            step="1"
            min="1"
            value={tenureMonths}
            onChange={(e) => {
              setTenureMonths(e.target.value);
              setSelectedAccountId('custom');
            }}
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm font-bold font-numeric text-on-surface focus:outline-none focus:border-primary"
            placeholder="24"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-primary" /> Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setSelectedAccountId('custom');
            }}
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm font-medium text-on-surface focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Principal Card */}
        <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/20 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Total Principal Owed
            </span>
            <span className="p-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <Landmark className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-extrabold font-numeric text-on-surface">
            {formatCurrency(totalPrincipal)}
          </div>
          <p className="text-[11px] text-on-surface-variant mt-1">
            Initial loan borrowed amount
          </p>
        </div>

        {/* Total Interest Card */}
        <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/20 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Total Interest Payable
            </span>
            <span className="p-1.5 bg-rose-500/10 text-rose-500 rounded-lg">
              <Percent className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-xl font-extrabold font-numeric text-rose-400">
              {formatCurrency(totalInterest)}
            </div>
            <span className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-numeric">
              +{interestRatio}%
            </span>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-1">
            Extra borrowing cost over tenure
          </p>
        </div>

        {/* Total Outlay / EMI Card */}
        <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/20 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Total Amount Payable
            </span>
            <span className="p-1.5 bg-primary/10 text-primary rounded-lg">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-extrabold font-numeric text-primary">
            {formatCurrency(totalAmount)}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-numeric">
              EMI: {formatCurrency(monthlyEmi)} / mo
            </span>
            <span className="text-[11px] text-on-surface-variant">
              ({tenureMonths} Months)
            </span>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-surface-container p-4 sm:p-5 rounded-2xl border border-outline-variant/20 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/20 pb-3">
          <div>
            <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" /> Monthly Payment Breakdown & Balance Paydown
            </h4>
            <p className="text-[11px] text-on-surface-variant">
              Stacked area shows Principal vs Interest portion per month. Cyan line depicts loan balance drawdown to zero.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium shrink-0">
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span> Principal Paid
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span> Interest Paid
            </span>
            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-3 h-0.5 bg-cyan-400"></span> Remaining Balance
            </span>
          </div>
        </div>

        {schedule.length > 0 ? (
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={schedule} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10, fill: 'var(--color-on-surface-variant)' }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis 
                  yAxisId="monthly"
                  tick={{ fontSize: 10, fill: 'var(--color-on-surface-variant)' }}
                  tickFormatter={(val) => `${val}`}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <YAxis 
                  yAxisId="balance"
                  orientation="right"
                  tick={{ fontSize: 10, fill: 'var(--color-on-surface-variant)' }}
                  tickFormatter={(val) => `${Math.round(val/1000)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
                <Area 
                  yAxisId="monthly"
                  type="monotone" 
                  dataKey="principalPortion" 
                  stackId="1" 
                  name="Principal Paid" 
                  fill="#10b981" 
                  stroke="#10b981" 
                  fillOpacity={0.65} 
                />
                <Area 
                  yAxisId="monthly"
                  type="monotone" 
                  dataKey="interestPortion" 
                  stackId="1" 
                  name="Interest Paid" 
                  fill="#f43f5e" 
                  stroke="#f43f5e" 
                  fillOpacity={0.65} 
                />
                <Line 
                  yAxisId="balance"
                  type="monotone" 
                  dataKey="remainingBalance" 
                  name="Remaining Balance" 
                  stroke="#06b6d4" 
                  strokeWidth={2.5} 
                  dot={false} 
                  activeDot={{ r: 5, fill: '#06b6d4' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-xs text-on-surface-variant">
            Please enter valid loan details to render amortization chart.
          </div>
        )}
      </div>

      {/* Collapsible Amortization Table */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/20 overflow-hidden">
        <button
          onClick={() => setIsTableExpanded(!isTableExpanded)}
          className="w-full p-4 flex items-center justify-between hover:bg-surface-container-high/50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-on-surface">
              Monthly Amortization Schedule Table ({schedule.length} Months)
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <span>{isTableExpanded ? 'Hide Schedule Table' : 'View Full Schedule Table'}</span>
            {isTableExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        <AnimatePresence>
          {isTableExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="border-t border-outline-variant/20"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-container-high/60 text-on-surface-variant uppercase tracking-wider text-[10px] font-semibold border-b border-outline-variant/20">
                    <tr>
                      <th className="py-3 px-4"># Month</th>
                      <th className="py-3 px-4">Payment Date</th>
                      <th className="py-3 px-4 text-center">Rate</th>
                      <th className="py-3 px-4 text-right">Monthly EMI</th>
                      <th className="py-3 px-4 text-right text-emerald-500">Principal Paid</th>
                      <th className="py-3 px-4 text-right text-rose-400">Interest Paid</th>
                      <th className="py-3 px-4 text-right text-cyan-400">Remaining Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {paginatedSchedule.map((row) => (
                      <tr key={row.monthIndex} className={`hover:bg-surface-container-high/40 transition-colors font-numeric ${row.isRevised ? 'bg-amber-500/5' : ''}`}>
                        <td className="py-2.5 px-4 font-bold text-on-surface">
                          Month {row.monthIndex}
                        </td>
                        <td className="py-2.5 px-4 text-on-surface-variant font-sans font-medium">
                          {row.date}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.isRevised ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-on-surface-variant'}`}>
                            {row.activeRate}%
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-on-surface">
                          {formatCurrency(row.emi)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-emerald-500">
                          {formatCurrency(row.principalPortion)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-rose-400">
                          {formatCurrency(row.interestPortion)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-cyan-400">
                          {formatCurrency(row.remainingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-3.5 bg-surface-container-high/30 border-t border-outline-variant/20 text-xs">
                  <span className="text-on-surface-variant">
                    Showing page <strong className="text-on-surface">{currentPage}</strong> of <strong className="text-on-surface">{totalPages}</strong> ({schedule.length} total months)
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1.5 bg-surface-container-low border border-outline-variant/30 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container text-on-surface font-semibold"
                    >
                      Previous
                    </button>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 bg-surface-container-low border border-outline-variant/30 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container text-on-surface font-semibold"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      </div>

      <UpdateLoanRateModal
        isOpen={isRateModalOpen}
        onClose={() => setIsRateModalOpen(false)}
        account={selectedAccount}
      />
    </div>
  );
}
