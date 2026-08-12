from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Anchor missing in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


def add_import(path: str, anchor: str, new_import: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new_import in text:
        return
    if anchor not in text:
        raise SystemExit(f"Import anchor missing in {path}: {anchor!r}")
    p.write_text(text.replace(anchor, anchor + "\n" + new_import, 1))

# 1) Affordability: recurring expenses charged to liabilities are still known future spending.
replace_once(
    'src/domain/affordability.ts',
    """  if (type === 'EXPENSE') {\n    if (fromLiquid) {\n      const destination = toId ? accountsById.get(toId) : undefined;\n      if (destination?.type === 'liability' && toId) {\n        accumulator.expectedExpenses += amount;\n        accumulator.expensesByClass.COMMITTED += amount;\n        recordLiabilityPayment(accumulator, toId, projectedTransactionDate(transaction), amount);\n      } else if (classification === 'SAVINGS') {\n        accumulator.scheduledSavings += amount;\n      } else {\n        accumulator.expectedExpenses += amount;\n        accumulator.expensesByClass[classification] += amount;\n      }\n    }\n    accumulator.occurrenceCount += 1;\n    return;\n  }\n""",
    """  if (type === 'EXPENSE') {\n    const source = fromId ? accountsById.get(fromId) : undefined;\n    if (fromLiquid) {\n      const destination = toId ? accountsById.get(toId) : undefined;\n      if (destination?.type === 'liability' && toId) {\n        accumulator.expectedExpenses += amount;\n        accumulator.expensesByClass.COMMITTED += amount;\n        recordLiabilityPayment(accumulator, toId, projectedTransactionDate(transaction), amount);\n      } else if (classification === 'SAVINGS') {\n        accumulator.scheduledSavings += amount;\n      } else {\n        accumulator.expectedExpenses += amount;\n        accumulator.expensesByClass[classification] += amount;\n      }\n    } else if (source?.type === 'liability') {\n      // A future card-financed purchase is still known consumption even though\n      // cash leaves later when the card is repaid. Do not record it as a\n      // liability payment: this occurrence increases the obligation.\n      if (classification === 'SAVINGS') {\n        accumulator.scheduledSavings += amount;\n      } else {\n        accumulator.expectedExpenses += amount;\n        accumulator.expensesByClass[classification] += amount;\n      }\n    }\n    accumulator.occurrenceCount += 1;\n    return;\n  }\n""",
)

# 2) Unit coverage for the missing recurring-card-expense case.
p = Path('src/domain/affordability.test.ts')
text = p.read_text()
anchor = """  it('does not treat transfers between liquid accounts as spending', () => {\n"""
test_block = """  it('projects recurring expenses charged to a credit-card liability', () => {\n    const cardAccount = liability('cc', 5000, { group: 'Credit Card' });\n    const result = run({\n      accounts: [bank('bank', 40000), cardAccount],\n      recurringRules: [\n        rule({ id: 'subscription-card', amount: 999, transactionType: 'EXPENSE', account: 'cc', fromAccountId: 'cc', category: 'general', nextDueDate: '2026-09-05' }),\n      ],\n    });\n    expect(result.expectedExpenses).toBe(999);\n    expect(result.expensesByClass.NORMAL).toBe(999);\n  });\n\n"""
if "projects recurring expenses charged to a credit-card liability" not in text:
    if anchor not in text:
        raise SystemExit('affordability test anchor missing')
    p.write_text(text.replace(anchor, test_block + anchor, 1))

# 3) Affordability planner: mobile-safe cards/breakdown and formatted purchase input.
add_import('src/components/AffordabilityPlanner.tsx', "import { AffordabilitySettings } from './AffordabilitySettings';", "import { CurrencyInput } from './CurrencyInput';")
replace_once(
    'src/components/AffordabilityPlanner.tsx',
    '<input type="number" min="0" step="100" value={purchaseAmount} onChange={event => setPurchaseAmount(event.target.value)} placeholder="0" className="mt-1.5 w-full min-h-12 rounded-xl border border-outline-variant/30 bg-surface-container px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/60" />',
    '<CurrencyInput value={purchaseAmount} onValueChange={setPurchaseAmount} placeholder="0.00" className="mt-1.5 w-full min-h-12 rounded-xl border border-outline-variant/30 bg-surface-container px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/60" />',
)
replace_once('src/components/AffordabilityPlanner.tsx', 'grid grid-cols-1 min-[390px]:grid-cols-3 gap-3', 'grid grid-cols-2 sm:grid-cols-3 gap-3')
p = Path('src/components/AffordabilityPlanner.tsx')
text = p.read_text()
old_cards = '''            <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-4"><span className="text-xs text-on-surface-variant">Safe to spend</span><strong className="mt-1 block text-xl font-numeric text-on-surface">{formatCurrency(result.projection.safePurchaseCapacity)}</strong></div>\n            <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-4"><span className="text-xs text-on-surface-variant">Purchase</span><strong className="mt-1 block text-xl font-numeric text-on-surface">{formatCurrency(result.projection.purchaseAmount)}</strong></div>\n            <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-4"><span className="text-xs text-on-surface-variant">Against safe limit</span><strong className={`mt-1 block text-xl font-numeric ${safeDifference <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>{safeDifference <= 0 ? `${formatCurrency(Math.abs(safeDifference))} spare` : `${formatCurrency(safeDifference)} over`}</strong></div>'''
new_cards = '''            <div className="min-w-0 overflow-hidden rounded-2xl bg-surface-container border border-outline-variant/20 p-3.5 sm:p-4"><span className="text-xs text-on-surface-variant">Safe to spend</span><strong className="mt-1 block text-lg min-[390px]:text-xl font-numeric tabular-nums whitespace-nowrap text-on-surface">{formatCurrency(result.projection.safePurchaseCapacity)}</strong></div>\n            <div className="min-w-0 overflow-hidden rounded-2xl bg-surface-container border border-outline-variant/20 p-3.5 sm:p-4"><span className="text-xs text-on-surface-variant">Purchase</span><strong className="mt-1 block text-lg min-[390px]:text-xl font-numeric tabular-nums whitespace-nowrap text-on-surface">{formatCurrency(result.projection.purchaseAmount)}</strong></div>\n            <div className="col-span-2 sm:col-span-1 min-w-0 rounded-2xl bg-surface-container border border-outline-variant/20 p-3.5 sm:p-4"><span className="text-xs text-on-surface-variant">Against safe limit</span><strong className={`mt-1 block text-lg min-[390px]:text-xl font-numeric tabular-nums break-words ${safeDifference <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>{safeDifference <= 0 ? `${formatCurrency(Math.abs(safeDifference))} spare` : `${formatCurrency(safeDifference)} over`}</strong></div>'''
if old_cards not in text:
    raise SystemExit('Affordability summary cards anchor missing')
text = text.replace(old_cards, new_cards, 1)
text = text.replace("['Known projected expenses (scheduled)', result.projection.expectedExpenses, '-']", "['Known scheduled expenses', result.projection.expectedExpenses, '-']", 1)
text = text.replace('className="flex items-center justify-between gap-4 px-4 py-3 border-b last:border-b-0 border-outline-variant/15 bg-surface-container"><span className="text-on-surface-variant">{label}</span><span className="font-numeric font-semibold text-on-surface">{sign}{formatCurrency(Number(raw))}</span>', 'className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 border-b last:border-b-0 border-outline-variant/15 bg-surface-container"><span className="min-w-0 text-on-surface-variant leading-snug">{label}</span><span className="whitespace-nowrap font-numeric font-semibold tabular-nums text-on-surface">{sign}{formatCurrency(Number(raw))}</span>', 1)
text = text.replace('Category behavior labels describe how spending is treated; they do not create a forecast amount by themselves.</p>', 'Category behavior labels describe how spending is treated; they do not create a forecast amount by themselves. Recurring card charges count as expenses, while transfers into investments/savings appear under Scheduled savings.</p>', 1)
p.write_text(text)

# 4) Affordability settings monetary inputs.
add_import('src/components/AffordabilitySettings.tsx', "import { normalizeAffordabilitySettings } from '../domain/affordabilitySettings';", "import { CurrencyInput } from './CurrencyInput';")
for old, new in [
    ('<input type="number" min="0" step="100" value={draft.monthlySavingsTarget || \'\'} onChange={event => update(\'monthlySavingsTarget\', Math.max(0, Number(event.target.value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0" />', '<CurrencyInput value={draft.monthlySavingsTarget || \'\'} onValueChange={value => update(\'monthlySavingsTarget\', Math.max(0, Number(value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0.00" />'),
    ('<input type="number" min="0" step="100" value={draft.protectedCashReserve || \'\'} onChange={event => update(\'protectedCashReserve\', Math.max(0, Number(event.target.value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0" />', '<CurrencyInput value={draft.protectedCashReserve || \'\'} onValueChange={value => update(\'protectedCashReserve\', Math.max(0, Number(value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0.00" />'),
    ('<input type="number" min="0" step="100" value={draft.fixedContingencyAmount || \'\'} onChange={event => update(\'fixedContingencyAmount\', Math.max(0, Number(event.target.value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0" />', '<CurrencyInput value={draft.fixedContingencyAmount || \'\'} onValueChange={value => update(\'fixedContingencyAmount\', Math.max(0, Number(value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0.00" />'),
]:
    replace_once('src/components/AffordabilitySettings.tsx', old, new)

# 5) Add Transaction amount.
add_import('src/components/AddTransactionModal.tsx', "import { useAppContext } from '../context/AppContext';", "import { CurrencyInput } from './CurrencyInput';")
p = Path('src/components/AddTransactionModal.tsx')
text = p.read_text()
old = '''              <input \n                type="number"\n                step="0.01"\n                required\n                value={amount}\n                onChange={(e) => {\n                  const val = parseFloat(e.target.value);\n                  setAmount(isNaN(val) ? '' : e.target.value);\n                }}'''
new = '''              <CurrencyInput\n                aria-label="Transaction amount"\n                required\n                value={amount}\n                onValueChange={setAmount}'''
if old not in text:
    raise SystemExit('AddTransaction amount anchor missing')
text = text.replace(old, new, 1)
p.write_text(text)

# 6) Recurring Payments amount.
add_import('src/components/RecurringPayments.tsx', "import type { RecurringRule } from '../types';", "import { CurrencyInput } from './CurrencyInput';")
replace_once('src/components/RecurringPayments.tsx', '<input type="number" min="0.01" step="0.01" value={editing.amount} onChange={event => setEditing({ ...editing, amount: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary" />', '<CurrencyInput value={editing.amount || \'\'} onValueChange={value => setEditing({ ...editing, amount: Number(value) || 0 })} className="mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary" />')

# 7) Reconcile balance.
add_import('src/components/ReconcileWizard.tsx', "import { useAppContext } from '../context/AppContext';", "import { CurrencyInput } from './CurrencyInput';")
replace_once('src/components/ReconcileWizard.tsx', '<input autoFocus inputMode="decimal" type="number" min="0" value={actualValue} onChange={event => setActualValue(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-high px-4 py-3 text-lg font-bold font-numeric text-on-surface outline-none focus:ring-2 focus:ring-primary" />', '<CurrencyInput autoFocus aria-label="Current actual balance" value={actualValue} onValueChange={setActualValue} className="mt-2 w-full rounded-2xl bg-surface-container-high px-4 py-3 text-lg font-bold font-numeric text-on-surface outline-none focus:ring-2 focus:ring-primary" />')

# 8) Manage Finances budget / savings target.
add_import('src/components/ManageFinances.tsx', "import { getCategorySpend } from '../utils/budget';", "import { CurrencyInput } from './CurrencyInput';")
p = Path('src/components/ManageFinances.tsx')
text = p.read_text()
old = '''                    <input \n                      type="number" \n                      value={editBudget || ''}\n                      onChange={e => setEditBudget(Number(e.target.value))}'''
new = '''                    <CurrencyInput\n                      value={editBudget || ''}\n                      onValueChange={value => setEditBudget(Number(value) || 0)}'''
if old not in text:
    raise SystemExit('ManageFinances budget anchor missing')
text = text.replace(old, new, 1)
p.write_text(text)

# 9) Loan explorer principal only; rate and tenure remain plain numeric fields.
add_import('src/components/LoanAmortizationExplorer.tsx', "import { UpdateLoanRateModal } from './UpdateLoanRateModal';", "import { CurrencyInput } from './CurrencyInput';")
p = Path('src/components/LoanAmortizationExplorer.tsx')
text = p.read_text()
old = '''          <input\n            type="number"\n            step="1000"\n            value={principal}\n            onChange={(e) => {\n              setPrincipal(e.target.value);'''
new = '''          <CurrencyInput\n            value={principal}\n            onValueChange={(value) => {\n              setPrincipal(value);'''
if old not in text:
    raise SystemExit('Loan explorer principal anchor missing')
text = text.replace(old, new, 1)
p.write_text(text)

# 10) Pay card / loan payment money inputs and dynamic symbols.
add_import('src/components/PayCardModal.tsx', "import { UpdateLoanRateModal } from './UpdateLoanRateModal';", "import { CurrencyInput } from './CurrencyInput';")
p = Path('src/components/PayCardModal.tsx')
text = p.read_text()
text = text.replace('payLiability, formatCurrency } = useAppContext();', 'payLiability, formatCurrency, getCurrencySymbol } = useAppContext();', 1)
old = '''              <input \n                type="number"\n                step="0.01"\n                required\n                value={amount}\n                onChange={(e) => {\n                  updateSplitForAmount(e.target.value, paymentMode);\n                }}'''
new = '''              <CurrencyInput\n                required\n                value={amount}\n                onValueChange={(value) => {\n                  updateSplitForAmount(value, paymentMode);\n                }}'''
if old not in text:
    raise SystemExit('PayCard total amount anchor missing')
text = text.replace(old, new, 1)
text = text.replace('''                      ₹\n                    </span>\n                    <input\n                      type="number"\n                      step="0.01"\n                      value={principalAmount}\n                      onChange={(e) => {\n                        const newP = e.target.value;''', '''                      {getCurrencySymbol()}\n                    </span>\n                    <CurrencyInput\n                      value={principalAmount}\n                      onValueChange={(newP) => {''', 1)
text = text.replace('''                      ₹\n                    </span>\n                    <input\n                      type="number"\n                      step="0.01"\n                      value={interestAmount}\n                      onChange={(e) => {\n                        const newI = e.target.value;''', '''                      {getCurrencySymbol()}\n                    </span>\n                    <CurrencyInput\n                      value={interestAmount}\n                      onValueChange={(newI) => {''', 1)
text = text.replace("celebration.newBalance === 0 ? '₹0.00 (DEBT FREE)' : formatCurrency(celebration.newBalance)", "celebration.newBalance === 0 ? `${formatCurrency(0)} (DEBT FREE)` : formatCurrency(celebration.newBalance)")
text = text.replace("newBalance === 0 ? '₹0.00 (DEBT FREE! 🎉)' : formatCurrency(newBalance)", "newBalance === 0 ? `${formatCurrency(0)} (DEBT FREE! 🎉)` : formatCurrency(newBalance)")
p.write_text(text)

# 11) Add Account monetary inputs; day/rate/tenure fields intentionally remain numeric.
add_import('src/components/AddAccountModal.tsx', "import { calculateEmiAmount } from '../utils/emi';", "import { CurrencyInput } from './CurrencyInput';")
p = Path('src/components/AddAccountModal.tsx')
text = p.read_text()
text = text.replace('    transactions\n  } = useAppContext();', '    transactions,\n    getCurrencySymbol\n  } = useAppContext();', 1)

def swap(block_old: str, block_new: str, label: str) -> None:
    global text
    if block_old not in text:
        raise SystemExit(f'AddAccount anchor missing: {label}')
    text = text.replace(block_old, block_new, 1)

swap('''              <input \n                type="number"\n                step="0.01"\n                required\n                value={limit}\n                onChange={(e) => {\n                  const val = parseFloat(e.target.value);\n                  setLimit(isNaN(val) ? '' : e.target.value);\n                }}''', '''              <CurrencyInput\n                required\n                value={limit}\n                onValueChange={setLimit}''', 'credit limit')
swap('''                  <input \n                    type="number"\n                    step="0.01"\n                    required\n                    value={investedAmount}\n                    onChange={(e) => {\n                      const val = parseFloat(e.target.value);\n                      setInvestedAmount(isNaN(val) ? '' : e.target.value);\n                    }}''', '''                  <CurrencyInput\n                    required\n                    value={investedAmount}\n                    onValueChange={setInvestedAmount}''', 'invested amount')
swap('''                  <input \n                    type="number"\n                    step="0.01"\n                    required\n                    value={balance}\n                    onChange={(e) => {\n                      const val = parseFloat(e.target.value);\n                      setBalance(isNaN(val) ? '' : e.target.value);\n                    }}''', '''                  <CurrencyInput\n                    required\n                    value={balance}\n                    onValueChange={setBalance}''', 'market value')
swap('''                    <input \n                      type="number"\n                      step="0.01"\n                      required\n                      value={monthlySIPAmount}\n                      onChange={(e) => {\n                        const val = parseFloat(e.target.value);\n                        setMonthlySIPAmount(isNaN(val) ? '' : e.target.value);\n                      }}''', '''                    <CurrencyInput\n                      required\n                      value={monthlySIPAmount}\n                      onValueChange={setMonthlySIPAmount}''', 'sip amount')
swap('''              <input \n                type="number"\n                step="0.01"\n                required\n                value={balance}\n                onChange={(e) => {\n                  const val = parseFloat(e.target.value);\n                  setBalance(isNaN(val) ? '' : e.target.value);\n                }}''', '''              <CurrencyInput\n                required\n                value={balance}\n                onValueChange={setBalance}''', 'asset balance')
swap('''                  <input \n                    type="number"\n                    step="0.01"\n                    required\n                    value={balance}\n                    onChange={(e) => setBalance(e.target.value)}''', '''                  <CurrencyInput\n                    required\n                    value={balance}\n                    onValueChange={setBalance}''', 'liability balance')
swap('''                  <input \n                    type="number"\n                    step="0.01"\n                    value={dueAmount}\n                    onChange={(e) => setDueAmount(e.target.value)}''', '''                  <CurrencyInput\n                    value={dueAmount}\n                    onValueChange={setDueAmount}''', 'due amount')
swap('''                  <input \n                    type="number"\n                    step="0.01"\n                    required\n                    value={originalPrincipal}\n                    onChange={(e) => {\n                      const val = e.target.value;\n                      setOriginalPrincipal(val);\n                      if (!isEditing || !balance) {\n                        setBalance(val);\n                      }\n                    }}''', '''                  <CurrencyInput\n                    required\n                    value={originalPrincipal}\n                    onValueChange={(value) => {\n                      setOriginalPrincipal(value);\n                      if (!isEditing || !balance) {\n                        setBalance(value);\n                      }\n                    }}''', 'loan principal')
swap('''                  <input \n                    type="number"\n                    step="0.01"\n                    required\n                    value={monthlyEMI}\n                    onChange={(e) => {\n                      setMonthlyEMI(e.target.value);\n                      setIsEmiManualOverride(true);\n                    }}''', '''                  <CurrencyInput\n                    required\n                    value={monthlyEMI}\n                    onValueChange={(value) => {\n                      setMonthlyEMI(value);\n                      setIsEmiManualOverride(true);\n                    }}''', 'monthly emi')
swap('''                    <input \n                      type="number"\n                      step="0.01"\n                      value={lateFeeFixedAmount}\n                      onChange={(e) => setLateFeeFixedAmount(e.target.value)}''', '''                    <CurrencyInput\n                      value={lateFeeFixedAmount}\n                      onValueChange={setLateFeeFixedAmount}''', 'late fee')
text = text.replace('Fixed Late Fee (₹)', 'Fixed Late Fee ({getCurrencySymbol()})', 1)
p.write_text(text)

# 12) Currency formatting tests.
Path('src/utils/currencyFormatting.test.ts').write_text('''import { describe, expect, it } from 'vitest';\nimport { formatCurrencyInput, getCurrencyFractionDigits, parseCurrencyInput } from './currencyFormatting';\n\ndescribe('currency input formatting', () => {\n  it('uses Indian grouping for INR', () => {\n    expect(formatCurrencyInput('10000', 'INR', true)).toBe('10,000.00');\n    expect(formatCurrencyInput('100000', 'INR', true)).toBe('1,00,000.00');\n    expect(parseCurrencyInput('1,00,000.50', 'INR')).toBe('100000.50');\n  });\n\n  it('uses western grouping for USD and GBP', () => {\n    expect(formatCurrencyInput('1000000.5', 'USD', true)).toBe('1,000,000.50');\n    expect(formatCurrencyInput('1000000.5', 'GBP', true)).toBe('1,000,000.50');\n  });\n\n  it('uses locale separators for EUR', () => {\n    expect(formatCurrencyInput('10000.5', 'EUR', true)).toBe('10.000,50');\n    expect(parseCurrencyInput('10.000,50', 'EUR')).toBe('10000.50');\n  });\n\n  it('uses zero fraction digits for JPY', () => {\n    expect(getCurrencyFractionDigits('JPY')).toBe(0);\n    expect(formatCurrencyInput('10000.99', 'JPY', true)).toBe('10,000');\n  });\n\n  it('preserves a typed fractional part while focused', () => {\n    expect(formatCurrencyInput('10000.5', 'INR', false)).toBe('10,000.5');\n    expect(formatCurrencyInput('10000.', 'INR', false)).toBe('10,000.');\n  });\n});\n''')

# 13) Update E2E for text-based formatted money fields and add mobile overflow/currency proof.
p = Path('e2e/affordability-phase7.spec.ts')
text = p.read_text()
text = text.replace("await expect(page.getByLabel('Monthly savings target')).toHaveValue('10000');", "await expect(page.getByLabel('Monthly savings target')).toHaveValue('10,000.00');")
text = text.replace("await expect(page.getByLabel('Protected cash reserve')).toHaveValue('20000');", "await expect(page.getByLabel('Protected cash reserve')).toHaveValue('20,000.00');")
text = text.replace("await expect(page.getByLabel('Fixed contingency amount')).toHaveValue('5000');", "await expect(page.getByLabel('Fixed contingency amount')).toHaveValue('5,000.00');")
text = text.replace("await page.locator('input[type=\"number\"]').first().fill('999999');", "await page.getByLabel('Transaction amount').fill('999999');")
if "money inputs use selected-currency grouping" not in text:
    text += '''\n\ntest('money inputs use selected-currency grouping and affordability cards do not overflow mobile', async ({ page }) => {\n  const errors = await prepare(page, false);\n  await openTab(page, 'Insights');\n\n  const amount = page.getByLabel('Amount', { exact: true });\n  await amount.fill('100000');\n  await expect(amount).toHaveValue('1,00,000');\n  await page.getByRole('button', { name: 'Check affordability' }).click();\n  await expect(amount).toHaveValue('1,00,000.00');\n\n  await assertNoDocumentOverflow(page);\n  const summaryCards = page.getByText('Safe to spend', { exact: true }).locator('..');\n  await expect(summaryCards).toBeVisible();\n  expect(errors, `Runtime errors:\\n${errors.join('\\n')}`).toEqual([]);\n});\n'''
p.write_text(text)

print('Applied affordability recurring-expense, responsive layout, and app-wide currency input formatting changes.')
