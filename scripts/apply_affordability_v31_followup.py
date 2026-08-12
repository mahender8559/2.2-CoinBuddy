from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Anchor missing in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# Extend projection settings/result.
replace_once(
    'src/domain/affordability.ts',
    """  /** Liquid cash the user does not want the planner to consume. */\n  protectedCashReserve: number;\n}\n""",
    """  /** Liquid cash the user does not want the planner to consume. */\n  protectedCashReserve: number;\n  /** Additional NORMAL living-spend allowance inferred from completed history. */\n  normalLivingExpenseForecast?: number;\n}\n""",
)
replace_once(
    'src/domain/affordability.ts',
    """  protectedCashReserve: number;\n  projectedCashBeforeSafety: number;\n""",
    """  protectedCashReserve: number;\n  normalLivingExpenseForecast: number;\n  creditCardOutstandingReserve: number;\n  projectedCashBeforeSafety: number;\n""",
)

# Replace due-only card fallback with full current outstanding protection.
old_card = """  // A card record is only authoritative while its backing liability account\n  // is active. This prevents stale/archived card metadata from reducing capacity.\n  const creditCards = (input.creditCards ?? []).filter(card => accountsById.has(card.id));\n  const creditCardIds = new Set(creditCards.map(card => card.id));\n  for (const card of creditCards) {\n    if (\n      nonNegative(card.dueAmount) > 0 &&\n      card.dueDate &&\n      dateKey(card.dueDate) <= input.endDate\n    ) {\n      // Explicit bank -> card payments are already counted as committed cash\n      // outflows. Only add the unpaid remainder of the card obligation.\n      const explicitPayments = totalLiabilityPayments(accumulator, card.id);\n      const remainingDue = Math.max(0, nonNegative(card.dueAmount) - explicitPayments);\n      addCommittedFallbackExpense(accumulator, remainingDue);\n    }\n  }\n"""
new_card = """  // A card record is only authoritative while its backing liability account\n  // is active. This prevents stale/archived card metadata from reducing capacity.\n  // Credit cards are revolving debt, so affordability protects the full current\n  // outstanding balance even when the statement dueAmount is still zero/unbilled.\n  const creditCards = (input.creditCards ?? []).filter(card => accountsById.has(card.id));\n  const creditCardIds = new Set(creditCards.map(card => card.id));\n  let creditCardOutstandingReserve = 0;\n  for (const card of creditCards) {\n    const backingAccount = accountsById.get(card.id);\n    const currentOutstanding = Math.max(\n      nonNegative(card.balance),\n      nonNegative(card.dueAmount),\n      nonNegative(backingAccount?.balance),\n    );\n    if (currentOutstanding <= 0) continue;\n\n    // Explicit bank -> card payments are already counted as committed cash\n    // outflows. Protect only the portion of today's card balance that is not\n    // already covered by those scheduled payments.\n    const explicitPayments = totalLiabilityPayments(accumulator, card.id);\n    const remainingOutstanding = Math.max(0, currentOutstanding - explicitPayments);\n    creditCardOutstandingReserve += remainingOutstanding;\n    addCommittedFallbackExpense(accumulator, remainingOutstanding);\n  }\n"""
replace_once('src/domain/affordability.ts', old_card, new_card)

replace_once(
    'src/domain/affordability.ts',
    """  const contingencyBuffer = nonNegative(input.settings.contingencyBuffer);\n  const protectedCashReserve = nonNegative(input.settings.protectedCashReserve);\n  const purchaseAmount = nonNegative(input.purchaseAmount);\n\n  const projectedCashBeforeSafety = Math.max(\n    0,\n    openingCash + accumulator.expectedIncome + accumulator.otherCashInflows - accumulator.expectedExpenses - plannedSavings,\n  );\n""",
    """  const contingencyBuffer = nonNegative(input.settings.contingencyBuffer);\n  const protectedCashReserve = nonNegative(input.settings.protectedCashReserve);\n  const normalLivingExpenseForecast = nonNegative(input.settings.normalLivingExpenseForecast);\n  const purchaseAmount = nonNegative(input.purchaseAmount);\n\n  const projectedCashBeforeSafety = Math.max(\n    0,\n    openingCash + accumulator.expectedIncome + accumulator.otherCashInflows\n      - accumulator.expectedExpenses\n      - normalLivingExpenseForecast\n      - plannedSavings,\n  );\n""",
)
replace_once(
    'src/domain/affordability.ts',
    """    protectedCashReserve,\n    projectedCashBeforeSafety,\n""",
    """    protectedCashReserve,\n    normalLivingExpenseForecast,\n    creditCardOutstandingReserve,\n    projectedCashBeforeSafety,\n""",
)

# UI: show normal forecast and outstanding separately in the calculation breakdown.
p = Path('src/components/AffordabilityPlanner.tsx')
text = p.read_text()
old = """          <div className=\"rounded-2xl border border-outline-variant/20 bg-surface-container p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3\">\n            <div>\n              <p className=\"text-sm font-semibold text-on-surface\">Unexpected-spending estimate</p>\n"""
new = """          <div className=\"grid grid-cols-1 md:grid-cols-2 gap-3\">\n            <div className=\"rounded-2xl border border-outline-variant/20 bg-surface-container p-4\">\n              <p className=\"text-sm font-semibold text-on-surface\">Normal living-expense forecast</p>\n              <p className=\"text-xs text-on-surface-variant mt-1\">{result.normalLivingSpending.estimateUsable ? `${formatCurrency(result.normalLivingSpending.medianNormalSpend)} typical · ${result.normalLivingSpending.confidence} confidence · ${result.normalLivingSpending.observedCycleCount} completed cycle${result.normalLivingSpending.observedCycleCount === 1 ? '' : 's'}` : 'Waiting for at least one completed financial cycle with usable activity'}</p>\n              {result.normalLivingSpending.estimateUsable && <p className=\"mt-2 text-xs text-on-surface-variant\">CoinBuddy adds only the portion not already represented by scheduled NORMAL expenses.</p>}\n            </div>\n            <div className=\"rounded-2xl border border-outline-variant/20 bg-surface-container p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3\">\n            <div>\n              <p className=\"text-sm font-semibold text-on-surface\">Unexpected-spending estimate</p>\n"""
if old not in text:
    raise SystemExit('Planner estimate-card anchor missing')
text = text.replace(old, new, 1)
old_close = """            {result.irregularSpending.requiresCategoryReview ? <button type=\"button\" onClick={() => setShowCategories(true)} className=\"text-sm font-bold text-primary\">Review irregular categories</button> : result.irregularSpending.requiresUserInput ? <button type=\"button\" onClick={() => setShowSettings(true)} className=\"text-sm font-bold text-primary\">Use a fixed buffer</button> : null}\n          </div>\n\n          <button type=\"button\""""
new_close = """            {result.irregularSpending.requiresCategoryReview ? <button type=\"button\" onClick={() => setShowCategories(true)} className=\"text-sm font-bold text-primary\">Review irregular categories</button> : result.irregularSpending.requiresUserInput ? <button type=\"button\" onClick={() => setShowSettings(true)} className=\"text-sm font-bold text-primary\">Use a fixed buffer</button> : null}\n            </div>\n          </div>\n\n          <button type=\"button\""""
if old_close not in text:
    raise SystemExit('Planner estimate-card closing anchor missing')
text = text.replace(old_close, new_close, 1)

old_rows = """                ['Expected income', result.projection.expectedIncome + result.projection.otherCashInflows, '+'],\n                ['Known scheduled expenses', result.projection.expectedExpenses, '-'],\n                ['Scheduled savings', result.projection.scheduledSavings, '-'],\n"""
new_rows = """                ['Expected income', result.projection.expectedIncome + result.projection.otherCashInflows, '+'],\n                ['Known scheduled expenses', Math.max(0, result.projection.expectedExpenses - result.projection.creditCardOutstandingReserve), '-'],\n                ['Credit-card outstanding still to cover', result.projection.creditCardOutstandingReserve, '-'],\n                ['Additional normal living expenses (history)', result.projection.normalLivingExpenseForecast, '-'],\n                ['Scheduled savings', result.projection.scheduledSavings, '-'],\n"""
if old_rows not in text:
    raise SystemExit('Planner breakdown rows anchor missing')
text = text.replace(old_rows, new_rows, 1)
text = text.replace(
    """<p><strong className=\"text-on-surface\">Known projected expenses</strong> are concrete future obligations CoinBuddy can see, such as scheduled recurring entries, card dues and EMIs. Category behavior labels describe how spending is treated; they do not create a forecast amount by themselves. Recurring card charges count as expenses, while transfers into investments/savings appear under Scheduled savings.</p>""",
    """<p><strong className=\"text-on-surface\">Known scheduled expenses</strong> are concrete future obligations CoinBuddy can see, such as recurring entries and EMIs. <strong className=\"text-on-surface\">Credit-card outstanding</strong> separately protects today's revolving card debt even when it is still unbilled or the current due amount is zero. <strong className=\"text-on-surface\">Normal living expenses</strong> use the median NORMAL-category spend from completed cycles and only add the portion not already scheduled.</p>""",
    1,
)
p.write_text(text)

# Add unit coverage for full card outstanding and normal living de-dup.
p = Path('src/domain/affordability.phase3.test.ts')
text = p.read_text()
anchor = """  it('tops up only the unpaid remainder when an explicit card payment is smaller than the amount due', () => {\n"""
block = """  it('protects unbilled credit-card outstanding even when due amount is zero', () => {\n    const cc = liability('cc', 6000, { group: 'Credit Card' });\n    const card: CreditCardInfo = { id: 'cc', name: 'Card', balance: 6000, dueAmount: 0, dueDate: '2026-10-10', billingCycleDay: 10, limit: 100000 };\n    const result = run({ accounts: [bank('bank', 50000), cc], creditCards: [card] });\n    expect(result.creditCardOutstandingReserve).toBe(6000);\n    expect(result.expectedExpenses).toBe(6000);\n    expect(result.safePurchaseCapacity).toBe(44000);\n  });\n\n  it('subtracts scheduled card payments from the outstanding reserve instead of double counting them', () => {\n    const cc = liability('cc', 6000, { group: 'Credit Card' });\n    const card: CreditCardInfo = { id: 'cc', name: 'Card', balance: 6000, dueAmount: 0, dueDate: '2026-10-10', billingCycleDay: 10, limit: 100000 };\n    const result = run({\n      accounts: [bank('bank', 50000), cc],\n      creditCards: [card],\n      transactions: [tx({ id: 'scheduled-card-payment', amount: 2000, date: '2026-09-10T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'cc' })],\n    });\n    expect(result.creditCardOutstandingReserve).toBe(4000);\n    expect(result.expectedExpenses).toBe(6000);\n  });\n\n"""
if 'protects unbilled credit-card outstanding even when due amount is zero' not in text:
    if anchor not in text:
        raise SystemExit('Phase3 test anchor missing')
    text = text.replace(anchor, block + anchor, 1)
p.write_text(text)

print('Applied normal-living forecast and credit-card outstanding affordability updates.')
