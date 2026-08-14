from pathlib import Path

path = Path('src/components/Activity.tsx')
text = path.read_text()

# Add one UI-only state for the advanced filter surface.
state_marker = "  const [selectedEventFilter, setSelectedEventFilter] = useState<string>('All');\n"
if "const [isFilterPanelOpen" not in text:
    if state_marker not in text:
        raise SystemExit('Activity event filter state marker not found')
    text = text.replace(state_marker, state_marker + "  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);\n", 1)

# Build presentation-only date groups from the already-filtered transaction list.
return_marker = "  return (\n    <div data-testid=\"page-activity\""
if "const transactionGroups = useMemo" not in text:
    idx = text.find(return_marker)
    if idx == -1:
        raise SystemExit('Activity return marker not found')
    helpers = r'''  const transactionGroups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = new Map<string, { label: string; transactions: typeof filteredTransactions }>();
    filteredTransactions.forEach(transaction => {
      const date = new Date(transaction.date);
      const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const label = day.getTime() === today.getTime()
        ? 'Today'
        : day.getTime() === yesterday.getTime()
          ? 'Yesterday'
          : day.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
      const existing = groups.get(key);
      if (existing) existing.transactions.push(transaction);
      else groups.set(key, { label, transactions: [transaction] });
    });
    return Array.from(groups.values());
  }, [filteredTransactions]);

  const hasAdvancedFilters = selectedAccountFilter !== 'All' || selectedEventFilter !== 'All' || selectedCycle !== 'all' || selectedCategoryFilter !== null || selectedSort !== 'date-desc';
  const clearAdvancedFilters = () => {
    setSelectedAccountFilter('All');
    setSelectedEventFilter('All');
    setSelectedCycle('all');
    setSelectedCategoryFilter(null);
    setSelectedSort('date-desc');
  };

'''
    text = text[:idx] + helpers + text[idx:]

start = text.find(return_marker)
end = text.find("{isEventPickerOpen && (", start)
if start == -1 or end == -1:
    raise SystemExit('Activity primary surface boundaries not found')

primary = r'''  return (
    <div data-testid="page-activity" className="w-full space-y-4 pb-24 md:pb-0 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">Activity</h1>
          <p className="mt-1 hidden text-sm text-on-surface-variant sm:block">Track every money movement without the clutter.</p>
        </div>
        <button
          onClick={() => {
            setIsSelectionMode(!isSelectionMode);
            if (isSelectionMode) setSelectedIds(new Set());
          }}
          className="v35-focus-ring min-h-10 rounded-xl px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          {isSelectionMode ? 'Cancel' : 'Select'}
        </button>
      </div>

      <section className="space-y-3">
        <div className="flex gap-2">
          <div data-tour-id="tour-transaction-search" className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="v35-focus-ring h-12 w-full rounded-xl border border-outline-variant/35 bg-surface-container-low pl-10 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant/70 outline-none transition-colors focus:border-primary/60"
            />
          </div>
          <button
            data-tour-id="tour-transaction-filters"
            type="button"
            aria-label="Advanced filters"
            aria-expanded={isFilterPanelOpen}
            onClick={() => setIsFilterPanelOpen(current => !current)}
            className={`v35-focus-ring relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors ${isFilterPanelOpen || hasAdvancedFilters ? 'border-primary/35 bg-primary/12 text-primary' : 'border-outline-variant/35 bg-surface-container-low text-on-surface-variant hover:text-on-surface'}`}
          >
            <Filter className="h-5 w-5" />
            {hasAdvancedFilters ? <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" /> : null}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide touch-pan-y" {...typeFilterSwipe}>
          {typeFilters.map(type => (
            <button
              key={type}
              onClick={() => setSelectedTypeFilter(type)}
              className={`v35-focus-ring min-h-9 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold transition-colors ${selectedTypeFilter === type ? 'border-primary/30 bg-primary text-on-primary' : 'border-outline-variant/35 bg-surface-container-low text-on-surface-variant hover:text-on-surface'}`}
            >
              {type}
            </button>
          ))}
        </div>
      </section>

      {isFilterPanelOpen && (
        <section aria-label="Advanced transaction filters" className="v35-surface rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-on-surface">Filters</h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">Narrow the list without crowding Activity.</p>
            </div>
            {hasAdvancedFilters ? <button type="button" onClick={clearAdvancedFilters} className="min-h-0 text-xs font-semibold text-primary">Reset</button> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-medium text-on-surface-variant">Cycle
              <select value={selectedCycle} onChange={(event) => setSelectedCycle(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                {availableCycles.map(cycle => <option key={cycle.key} value={cycle.key}>{cycle.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-on-surface-variant">Account
              <select value={selectedAccountFilter} onChange={(event) => setSelectedAccountFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                <option value="All">All Accounts</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-on-surface-variant">Event
              <select aria-label="Filter transactions by event" value={selectedEventFilter} onChange={(event) => setSelectedEventFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                <option value="All">All Events</option>
                <option value="__none__">No Event</option>
                {events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-on-surface-variant">Category
              <select value={selectedCategoryFilter || ''} onChange={(event) => setSelectedCategoryFilter(event.target.value || null)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                <option value="">All Categories</option>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-on-surface-variant">Sort
              <select value={selectedSort} onChange={(event) => setSelectedSort(event.target.value as typeof selectedSort)} className="mt-1.5 w-full rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary/60">
                <option value="date-desc">Date (Latest)</option>
                <option value="date-asc">Date (Oldest)</option>
                <option value="amount-desc">Amount (Highest)</option>
                <option value="amount-asc">Amount (Lowest)</option>
                <option value="notes-asc">Title (A to Z)</option>
                <option value="notes-desc">Title (Z to A)</option>
              </select>
            </label>
          </div>
        </section>
      )}

      {pendingTransactions.length > 0 && (
        <section className="v35-surface overflow-hidden rounded-2xl border-[rgba(251,191,36,.20)]">
          <div className="border-b border-outline-variant/20 px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--cb-amber)]">Needs confirmation</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">Scheduled items affect balances only after you confirm them.</p>
          </div>
          <div className="divide-y divide-outline-variant/20">
            {pendingTransactions.map(tx => (
              <div key={tx.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                <span className="min-w-0 text-sm font-medium text-on-surface">{tx.title} · <span className="font-numeric">{formatCurrency(tx.amount)}</span></span>
                <input aria-label={`Confirmation date for ${tx.title}`} type="date" value={approvalDates[tx.id] ?? tx.date.slice(0, 10)} onChange={event => setApprovalDates(previous => ({ ...previous, [tx.id]: event.target.value }))} className="rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm" />
                <button className="rounded-xl bg-primary px-3 text-xs font-semibold text-on-primary" onClick={() => {
                  const outcome = approveTransaction(tx.id, approvalDates[tx.id] ?? tx.date.slice(0, 10));
                  setApprovalErrors(previous => ({ ...previous, [tx.id]: outcome.success ? '' : (outcome.error || 'This scheduled transaction cannot be confirmed yet.') }));
                }}>{tx.type === 'income' ? 'Received ✓' : tx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}</button>
                <button className="rounded-xl border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface-variant" onClick={() => { rejectTransaction(tx.id); setApprovalErrors(previous => ({ ...previous, [tx.id]: '' })); }}>Skip</button>
                {approvalErrors[tx.id] ? <span role="alert" className="text-xs font-medium text-error sm:col-span-4">{approvalErrors[tx.id]} The item remains pending until it can be confirmed.</span> : null}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="hidden grid-cols-2 gap-3 sm:grid">
        <div className="v35-surface rounded-2xl p-4">
          <p className="text-xs font-semibold text-on-surface-variant">Total Outflow</p>
          <p className="mt-2 font-numeric text-xl font-semibold text-[var(--cb-red)]">{formatCurrency(outflow)}</p>
        </div>
        <div className="v35-surface rounded-2xl p-4">
          <p className="text-xs font-semibold text-on-surface-variant">Savings Contributed</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="font-numeric text-xl font-semibold text-[var(--cb-green)]">{formatCurrency(totalSavings)}</p>
            <Sparkles className="h-4 w-4 text-[var(--cb-green)]" />
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {transactionGroups.map((group, groupIndex) => (
          <section key={`${group.label}-${groupIndex}`} className="v35-surface overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-on-surface">{group.label}</h2>
              <span className="text-xs text-on-surface-variant">{group.transactions.length}</span>
            </div>
            <div className="[&>div:last-child]:border-b-0">
              {group.transactions.map((tx, txIndex) => {
                const Icon = icons[tx.icon as keyof typeof icons] || ShoppingBag;
                const isIncome = tx.type === 'income';
                const isTransfer = tx.type === 'transfer';
                const isBalanceAdjustment = tx.transaction_type === 'BALANCE_ADJUSTMENT';
                let color = 'secondary';
                if (isIncome) color = 'primary';
                if (isTransfer) color = 'tertiary';

                let accountContext = '';
                if (isTransfer) {
                  const fromName = accounts.find(account => account.id === tx.fromAccountId)?.name || 'Unknown';
                  const toName = accounts.find(account => account.id === tx.toAccountId)?.name || 'Unknown';
                  accountContext = `${fromName} → ${toName}`;
                } else {
                  accountContext = accounts.find(account => account.id === tx.account)?.name || tx.account || '';
                }

                return (
                  <TransactionRow
                    key={tx.id}
                    icon={isTransfer ? ArrowRightLeft : Icon}
                    title={tx.title}
                    eventName={events.find(event => event.id === tx.eventId)?.name}
                    subtitle={accountContext ? `${tx.subtitle} • ${accountContext}` : tx.subtitle}
                    amount={formatCurrency(tx.amount)}
                    tag={tx.isOpeningBalance ? 'Opening Balance' : tx.category}
                    color={color}
                    isIncome={isIncome}
                    isTransfer={isTransfer}
                    isPending={tx.is_verified === 0}
                    type={tx.type}
                    onDelete={tx.isOpeningBalance ? undefined : () => deleteTransaction(tx.id)}
                    onEdit={tx.isOpeningBalance || isBalanceAdjustment ? undefined : () => {
                      setEditingTransaction(tx);
                      setAddModalOpen(true);
                    }}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedIds.has(tx.id)}
                    onToggleSelect={() => toggleSelection(tx.id)}
                    onLongPress={() => {
                      setSelectedIds(previous => new Set(previous).add(tx.id));
                      setIsSelectionMode(true);
                    }}
                    tourId={groupIndex === 0 && txIndex === 0 ? 'tour-transaction-actions' : undefined}
                  />
                );
              })}
            </div>
          </section>
        ))}

        {filteredTransactions.length === 0 && (
          <div className="v35-surface rounded-2xl px-5 py-10 text-center">
            <Search className="mx-auto h-6 w-6 text-on-surface-variant" />
            <p className="mt-3 text-sm font-medium text-on-surface">No transactions found</p>
            <p className="mt-1 text-xs text-on-surface-variant">Try clearing a filter or searching for something else.</p>
          </div>
        )}
      </div>

'''

text = text[:start] + primary + text[end:]

# Restyle the existing interaction-rich row rather than replacing its logic.
old_class = "className={`bg-surface-container-low hover:bg-surface-container transition-colors p-4 rounded-2xl flex items-start gap-4 cursor-pointer border ${isSelected ? 'border-primary' : 'border-transparent'} hover:border-outline-variant/30 group`}"
new_class = "className={`group flex cursor-pointer items-center gap-3 border-b px-3.5 py-3.5 transition-colors sm:px-4 ${isSelected ? 'border-primary/40 bg-primary/8' : 'border-outline-variant/20 bg-transparent hover:bg-surface-container-high/45'}`}"
if old_class in text:
    text = text.replace(old_class, new_class, 1)
text = text.replace("className={`w-12 h-12 rounded-full mt-0.5 ${c.bg} flex items-center justify-center shrink-0`}", "className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.bg}`}" , 1)
text = text.replace("<Icon className={`w-6 h-6 ${c.text}`} />", "<Icon className={`h-5 w-5 ${c.text}`} />", 1)
text = text.replace("className=\"flex-grow min-w-0 pt-1\"", "className=\"min-w-0 flex-1\"", 1)
text = text.replace("className=\"font-semibold text-on-surface break-words whitespace-pre-wrap leading-tight\"", "className=\"truncate text-sm font-semibold leading-tight text-on-surface\"", 1)
text = text.replace("className=\"text-xs text-on-surface-variant break-words whitespace-pre-wrap mt-1\"", "className=\"mt-1 truncate text-xs text-on-surface-variant\"", 1)
text = text.replace("className=\"text-right shrink-0 flex items-start gap-3 pt-1\"", "className=\"flex shrink-0 items-start gap-2 text-right\"", 1)
text = text.replace("<p className={`font-bold font-numeric ${isIncome ? 'text-primary' : 'text-on-surface'}`}>{isIncome ? '+' : ''}{amount}</p>", "<p className={`font-numeric text-sm font-semibold ${isIncome ? 'text-[var(--cb-green)]' : isTransfer ? 'text-[var(--cb-purple)]' : 'text-[var(--cb-red)]'}`}>{isIncome ? '+' : isTransfer ? '' : '-'}{amount.replace(/^[-+]/, '')}</p>", 1)
# The locked row is intentionally clean on mobile; delete remains available through selection/long-press and desktop hover.
mobile_delete_start = "      {/* Mobile visible delete and edit */}\n      {!isSelectionMode && ("
mobile_delete_end = "      )}\n    </div>\n  );\n}"
mds = text.find(mobile_delete_start)
if mds != -1:
    mde = text.find(mobile_delete_end, mds)
    if mde == -1:
        raise SystemExit('Activity mobile delete block end not found')
    text = text[:mds] + "    </div>\n  );\n}" + text[mde + len(mobile_delete_end):]

path.write_text(text)

# Focused Activity visual/interaction contract.
test_path = Path('e2e/v35-activity.spec.ts')
test_path.write_text(r'''import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=activity');
}

test('v3.5 Activity keeps search and primary filters simple', async ({ page }, testInfo: TestInfo) => {
  await prepare(page);
  await expect(page.getByTestId('page-activity')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search transactions...')).toBeVisible();
  for (const filter of ['All', 'Income', 'Expense', 'Transfer']) {
    await expect(page.getByRole('button', { name: filter, exact: true })).toBeVisible();
  }

  const advanced = page.getByRole('button', { name: 'Advanced filters' });
  await advanced.click();
  await expect(page.getByRole('region', { name: 'Advanced transaction filters' })).toBeVisible();
  await advanced.click();
  await expect(page.getByRole('region', { name: 'Advanced transaction filters' })).toBeHidden();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('v35-activity.png'), fullPage: false });
});
''')

print('Applied V3.5 Activity redesign')
