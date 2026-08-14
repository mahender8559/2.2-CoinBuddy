from pathlib import Path

path = Path('src/components/Dashboard.tsx')
text = path.read_text()

# Reuse the existing goal domain logic; the UI must not create a second calculation path.
goal_import = "import { getGoalCurrentAmount, getGoalProgressPercent } from '../domain/savingsGoals';"
if goal_import not in text:
    anchor = "import { getPersonalLiabilityExposure } from '../domain/loanSharing';"
    if anchor not in text:
        raise SystemExit('Dashboard loan sharing import marker not found')
    text = text.replace(anchor, anchor + "\n" + goal_import, 1)

old_ctx = "const { transactions, personalExpenseRecords, loanSharingRules, addTransaction, formatCurrency, setAddModalOpen, creditCards, deleteTransaction, approveTransaction, rejectTransaction, categories, profile, setEditingTransaction, isDateInCurrentCycle, getCycleDetails, netWorth, accounts, setAddAccountModalType, widgets, addWidget, removeWidget, monthCycleDay, setEditingAccount, setEditingCreditCard } = useAppContext();"
new_ctx = "const { transactions, personalExpenseRecords, loanSharingRules, addTransaction, formatCurrency, setAddModalOpen, creditCards, deleteTransaction, approveTransaction, rejectTransaction, categories, profile, setEditingTransaction, isDateInCurrentCycle, getCycleDetails, netWorth, accounts, savingsGoals, setAddAccountModalType, widgets, addWidget, removeWidget, monthCycleDay, setEditingAccount, setEditingCreditCard } = useAppContext();"
if new_ctx not in text:
    if old_ctx not in text:
        raise SystemExit('Dashboard context marker not found')
    text = text.replace(old_ctx, new_ctx, 1)

calc_marker = "  return (\n    <div data-testid=\"page-dashboard\""
if "const activeGoal = savingsGoals.find" not in text:
    idx = text.find(calc_marker)
    if idx == -1:
        raise SystemExit('Dashboard return marker not found')
    computed = r'''  const firstName = profile.name?.trim().split(/\s+/)[0] || 'there';
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const activeGoal = savingsGoals.find(goal => goal.isActive);
  const activeGoalCurrent = activeGoal ? getGoalCurrentAmount(activeGoal, accounts, transactions) : 0;
  const activeGoalProgress = activeGoal ? getGoalProgressPercent(activeGoal, accounts, transactions) : 0;
  const cycleLabel = monthCycleDay > 1 ? `Current cycle · starts day ${monthCycleDay}` : 'Current month';

'''
    text = text[:idx] + computed + text[idx:]

start_marker = "      {/* Net Worth */}"
end_marker = "      {/* Pending Confirmation Modal */}"
start = text.find(start_marker)
end = text.find(end_marker)
if start == -1 or end == -1 or end <= start:
    raise SystemExit('Dashboard primary viewport markers not found')

primary = r'''      <section aria-labelledby="v35-dashboard-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Your financial overview</p>
            <h1 id="v35-dashboard-title" className="mt-1 text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">
              {greeting}, {firstName} ✨
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">Here’s what your money looks like right now.</p>
          </div>
          <div className="inline-flex min-h-10 w-fit items-center rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 text-xs font-semibold text-on-surface-variant">
            {cycleLabel}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,.85fr)]">
          <article className="v35-surface overflow-hidden rounded-2xl p-5 sm:p-6" aria-label="Net Worth overview">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-on-surface-variant">Net Worth</p>
                <p className="mt-2 text-3xl font-semibold text-on-surface sm:text-4xl lg:text-[42px]">
                  <AnimatedNumber value={netWorth} format={formatCurrency} />
                </p>
                <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold ${growthPercentage >= 0 ? 'text-[var(--cb-green)]' : 'text-[var(--cb-red)]'}`}>
                  {growthPercentage >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  <span>{growthPercentage >= 0 ? '+' : ''}{growthPercentage.toFixed(1)}% over the visible history</span>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${growthPercentage >= 0 ? 'bg-[var(--cb-green-soft)] text-[var(--cb-green)]' : 'bg-[var(--cb-red-soft)] text-[var(--cb-red)]'}`}>
                {growthPercentage >= 0 ? 'Growing' : 'Down'}
              </span>
            </div>

            <div className="mt-5 h-48 w-full sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="v35NetWorthGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--cb-blue)" stopOpacity={0.34}/>
                      <stop offset="95%" stopColor="var(--cb-blue)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <YAxis domain={[(dataMin: number) => Math.min(0, dataMin), (dataMax: number) => Math.max(0, dataMax)]} hide />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--cb-text-muted)', fontSize: 11 }} dy={6} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(76,141,255,.24)', strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const datum = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-2 text-xs shadow-xl">
                          <p className="text-on-surface-variant">{datum.name}</p>
                          <p className="mt-0.5 font-numeric font-semibold text-on-surface">{formatCurrency(datum.value)}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke="rgba(148,163,184,.16)" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="value" stroke="var(--cb-blue)" strokeWidth={2.5} fill="url(#v35NetWorthGradient)" baseValue={0} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <div className="grid grid-cols-2 gap-3" data-tour-id="tour-account-cards">
            <article className="v35-surface rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 text-[var(--cb-green)]"><PiggyBank className="h-4 w-4"/><span className="text-xs font-semibold">Assets</span></div>
              <p className="mt-3 text-lg font-semibold text-on-surface sm:text-xl"><AnimatedNumber value={totalAssets} format={formatCurrency} /></p>
              <p className="mt-1 text-[11px] text-on-surface-variant">What you own</p>
            </article>
            <article className="v35-surface rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 text-[var(--cb-red)]"><CreditCard className="h-4 w-4"/><span className="text-xs font-semibold">Liabilities</span></div>
              <p className="mt-3 text-lg font-semibold text-on-surface sm:text-xl"><AnimatedNumber value={totalLiabilities} format={formatCurrency} /></p>
              <p className="mt-1 text-[11px] text-on-surface-variant">Your exposure</p>
            </article>
            <article className="v35-surface rounded-2xl p-4 sm:p-5" data-tour-id="tour-summary-widgets">
              <div className="flex items-center gap-2 text-[var(--cb-green)]"><ArrowDownRight className="h-4 w-4"/><span className="text-xs font-semibold">Income</span></div>
              <p className="mt-3 text-lg font-semibold text-on-surface sm:text-xl"><AnimatedNumber value={cycleIncome} format={formatCurrency} /></p>
              <p className="mt-1 text-[11px] text-on-surface-variant">This cycle</p>
            </article>
            <article className="v35-surface rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 text-[var(--cb-red)]"><ArrowUpRight className="h-4 w-4"/><span className="text-xs font-semibold">Expenses</span></div>
              <p className="mt-3 text-lg font-semibold text-on-surface sm:text-xl"><AnimatedNumber value={cycleExpenses} format={formatCurrency} /></p>
              <p className={`mt-1 text-[11px] font-medium ${cycleNet >= 0 ? 'text-[var(--cb-green)]' : 'text-[var(--cb-red)]'}`}>{cycleNet >= 0 ? '+' : ''}{formatCurrency(cycleNet)} net cash flow</p>
            </article>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="v35-surface rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary"/><h2 className="text-base font-semibold text-on-surface">Goal Progress</h2></div>
              {activeGoal ? <span className="text-sm font-semibold text-primary">{Math.round(activeGoalProgress)}%</span> : null}
            </div>
            {activeGoal ? (
              <div className="mt-4">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-on-surface">{activeGoal.name}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">{formatCurrency(activeGoalCurrent)} of {formatCurrency(activeGoal.targetAmount)}</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-highest">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, activeGoalProgress))}%` }} />
                </div>
                <p className="mt-3 text-xs text-on-surface-variant">{activeGoal.linkedAccountId ? 'Progress follows the linked account.' : 'Progress follows your verified goal contributions.'}</p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-outline-variant/40 p-4 text-sm text-on-surface-variant">No active goal yet. Add one from Goals when you’re ready.</div>
            )}
          </article>

          <article className="v35-surface overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-outline-variant/20 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-[var(--cb-amber)]"/><h2 className="text-base font-semibold text-on-surface">Needs Attention</h2></div>
              {pendingTxs.length > 0 ? <span className="rounded-full bg-[var(--cb-amber-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--cb-amber)]">{pendingTxs.length}</span> : null}
            </div>
            <div className="divide-y divide-outline-variant/20">
              {pendingTxs.slice(0, 3).map(tx => (
                <div key={tx.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cb-amber-soft)] text-[var(--cb-amber)]"><AlertTriangle className="h-4 w-4"/></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-on-surface">{tx.title}</p>
                    <p className="mt-0.5 truncate text-xs text-on-surface-variant">{tx.subtitle || 'Needs confirmation'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-numeric text-sm font-semibold text-on-surface">{formatCurrency(tx.amount)}</p>
                    <button onClick={() => { setPendingConfirmTx(tx); setPendingConfirmDate(tx.date); }} className="mt-1 min-h-0 text-xs font-semibold text-primary hover:text-primary/80">Review</button>
                  </div>
                </div>
              ))}
              {pendingTxs.length === 0 ? <div className="px-5 py-6 text-sm text-on-surface-variant sm:px-6">You’re all caught up. Nothing needs confirmation.</div> : null}
            </div>
          </article>
        </div>
      </section>

'''

text = text[:start] + primary + text[end:]
path.write_text(text)

# Add a focused visual regression / interaction check for the locked first viewport.
test = r'''import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=dashboard');
}

test('v3.5 dashboard presents the locked financial hierarchy', async ({ page }, testInfo: TestInfo) => {
  await prepare(page);
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await expect(page.getByText(/Good (morning|afternoon|evening),/)).toBeVisible();
  await expect(page.getByRole('article', { name: 'Net Worth overview' })).toBeVisible();
  await expect(page.getByText('Assets', { exact: true })).toBeVisible();
  await expect(page.getByText('Liabilities', { exact: true })).toBeVisible();
  await expect(page.getByText('Income', { exact: true })).toBeVisible();
  await expect(page.getByText('Expenses', { exact: true })).toBeVisible();
  await expect(page.getByText('Goal Progress', { exact: true })).toBeVisible();
  await expect(page.getByText('Needs Attention', { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('v35-dashboard.png'), fullPage: false });
});
'''
Path('e2e/v35-dashboard.spec.ts').write_text(test)

print('Applied V3.5 dashboard first viewport')
