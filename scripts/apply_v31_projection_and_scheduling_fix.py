from pathlib import Path


def replace_once(path_str: str, old: str, new: str) -> None:
    path = Path(path_str)
    text = path.read_text()
    if old not in text:
        raise SystemExit(f'Expected text not found in {path_str}: {old[:120]!r}')
    path.write_text(text.replace(old, new, 1))

# 1) Make the affordability explanation match the actual max(target, scheduled) math.
path = Path('src/components/AffordabilityPlanner.tsx')
text = path.read_text()
old = "  const safeDifference = result ? amount - result.projection.safePurchaseCapacity : 0;\n"
new = "  const safeDifference = result ? amount - result.projection.safePurchaseCapacity : 0;\n  const additionalSavingsTarget = result ? Math.max(0, result.projection.plannedSavings - result.projection.scheduledSavings) : 0;\n"
if old not in text:
    raise SystemExit('AffordabilityPlanner safeDifference anchor missing')
text = text.replace(old, new, 1)
old = "                ['Known projected expenses', result.projection.expectedExpenses, '-'],\n                ['Scheduled savings', result.projection.scheduledSavings, '-'],\n                ['Savings target still to protect', result.projection.plannedSavings, '-'],"
new = "                ['Known projected expenses (scheduled)', result.projection.expectedExpenses, '-'],\n                ['Scheduled savings', result.projection.scheduledSavings, '-'],\n                ['Additional savings target to protect', additionalSavingsTarget, '-'],"
if old not in text:
    raise SystemExit('AffordabilityPlanner breakdown rows anchor missing')
text = text.replace(old, new, 1)
old = "              ].map(([label, raw, sign]) => <div key={String(label)} className=\"flex items-center justify-between gap-4 px-4 py-3 border-b last:border-b-0 border-outline-variant/15 bg-surface-container\"><span className=\"text-on-surface-variant\">{label}</span><span className=\"font-numeric font-semibold text-on-surface\">{sign}{formatCurrency(Number(raw))}</span></div>)}\n              <div className=\"flex items-center justify-between gap-4 px-4 py-4 bg-primary/10\"><strong className=\"text-on-surface\">Safe purchase capacity</strong><strong className=\"font-numeric text-primary text-lg\">{formatCurrency(result.projection.safePurchaseCapacity)}</strong></div>"
new = "              ].map(([label, raw, sign]) => <div key={String(label)} className=\"flex items-center justify-between gap-4 px-4 py-3 border-b last:border-b-0 border-outline-variant/15 bg-surface-container\"><span className=\"text-on-surface-variant\">{label}</span><span className=\"font-numeric font-semibold text-on-surface\">{sign}{formatCurrency(Number(raw))}</span></div>)}\n              <div className=\"px-4 py-3 border-t border-outline-variant/15 bg-surface-container-low text-xs leading-relaxed text-on-surface-variant\">\n                <p><strong className=\"text-on-surface\">Known projected expenses</strong> are concrete future obligations CoinBuddy can see, such as scheduled recurring entries, card dues and EMIs. Category behavior labels describe how spending is treated; they do not create a forecast amount by themselves.</p>\n                {result.projection.expectedExpenses === 0 && <p className=\"mt-2\">No concrete expense is currently scheduled in this horizon. Spending already logged in your current cycle is already reflected in today&apos;s balances and is not counted a second time.</p>}\n              </div>\n              <div className=\"flex items-center justify-between gap-4 px-4 py-4 bg-primary/10\"><strong className=\"text-on-surface\">Safe purchase capacity</strong><strong className=\"font-numeric text-primary text-lg\">{formatCurrency(result.projection.safePurchaseCapacity)}</strong></div>"
if old not in text:
    raise SystemExit('AffordabilityPlanner explanation anchor missing')
path.write_text(text.replace(old, new, 1))

# 2) Future/pending schedules should not be blocked by today's balance.
path = Path('src/components/AddTransactionModal.tsx')
text = path.read_text()
old = "    if (!amount || isNaN(numAmount) || numAmount <= 0) {\n      showError('Transaction amount must strictly be a positive number (> 0).');\n      return;\n    }\n\n    if (type === 'income') {"
new = "    if (!amount || isNaN(numAmount) || numAmount <= 0) {\n      showError('Transaction amount must strictly be a positive number (> 0).');\n      return;\n    }\n\n    // Future transactions and newly-created recurring schedules stay pending\n    // until confirmation, so today's balance must not prevent planning them.\n    const now = new Date();\n    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;\n    const isFuture = date > todayStr;\n    const shouldRemainPending = isFuture || editingTransaction?.is_verified === 0 || (!editingTransaction && isRecurring);\n\n    if (type === 'income') {"
if old not in text:
    raise SystemExit('AddTransactionModal amount anchor missing')
text = text.replace(old, new, 1)
text = text.replace("    if (type === 'expense') {\n", "    if (!shouldRemainPending && type === 'expense') {\n", 1)
text = text.replace("    } else if (type === 'transfer') {\n", "    } else if (!shouldRemainPending && type === 'transfer') {\n", 1)
old = "    // Compare just the YYYY-MM-DD parts to see if it's strictly in the future\n    const now = new Date();\n    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;\n    const isFuture = date > todayStr;\n\n"
if old not in text:
    raise SystemExit('AddTransactionModal duplicate future-date block missing')
text = text.replace(old, '', 1)
text = text.replace("      is_verified: isFuture ? 0 : 1\n", "      is_verified: shouldRemainPending ? 0 : 1\n", 1)
path.write_text(text)

# 3) Central validation skips available-funds checks only while pending; approval re-enables them.
path = Path('src/context/AppContext.tsx')
text = path.read_text()
text = text.replace("  approveTransaction: (id: string, date?: string) => void;", "  approveTransaction: (id: string, date?: string) => { success: boolean; error?: string };", 1)
anchor = "    if (tx.type === 'expense') {\n"
if anchor not in text:
    raise SystemExit('AppContext expense validation anchor missing')
text = text.replace(anchor, "    if (tx.is_verified !== 0 && tx.type === 'expense') {\n", 1)
anchor = "    } else if (tx.type === 'transfer') {\n"
if anchor not in text:
    raise SystemExit('AppContext transfer validation anchor missing')
text = text.replace(anchor, "    } else if (tx.is_verified !== 0 && tx.type === 'transfer') {\n", 1)
old = "  const approveTransaction = (id: string, userSelectedDate?: string) => {\n    const tx = transactions.find(t => t.id === id);\n    if (!tx || tx.is_verified !== 0) return;\n    \n    updateTransaction(id, {\n      ...tx,\n      date: userSelectedDate || tx.date,\n      is_verified: 1\n    });\n  };"
new = "  const approveTransaction = (id: string, userSelectedDate?: string): { success: boolean; error?: string } => {\n    const tx = transactions.find(t => t.id === id);\n    if (!tx) return { success: false, error: 'Scheduled transaction could not be found.' };\n    if (tx.is_verified !== 0) return { success: true };\n\n    // Confirmation is the point where a scheduled transaction becomes real,\n    // so normal balance/credit-limit validation is intentionally enforced here.\n    return updateTransaction(id, {\n      ...tx,\n      date: userSelectedDate || tx.date,\n      is_verified: 1\n    });\n  };"
if old not in text:
    raise SystemExit('AppContext approveTransaction anchor missing')
path.write_text(text.replace(old, new, 1))

# 4) Dashboard keeps the confirmation dialog open and surfaces insufficient funds.
path = Path('src/components/Dashboard.tsx')
text = path.read_text()
old = "  const [pendingConfirmTx, setPendingConfirmTx] = useState<Transaction | null>(null);\n  const [pendingConfirmDate, setPendingConfirmDate] = useState<string>('');\n"
new = "  const [pendingConfirmTx, setPendingConfirmTx] = useState<Transaction | null>(null);\n  const [pendingConfirmDate, setPendingConfirmDate] = useState<string>('');\n  const [pendingConfirmError, setPendingConfirmError] = useState<string>('');\n"
if old not in text:
    raise SystemExit('Dashboard pending state anchor missing')
text = text.replace(old, new, 1)
text = text.replace("                onClick={() => setPendingConfirmTx(null)}\n", "                onClick={() => { setPendingConfirmTx(null); setPendingConfirmError(''); }}\n", 1)
old = "                onClick={() => {\n                  rejectTransaction(pendingConfirmTx.id);\n                  setPendingConfirmTx(null);\n                }}"
new = "                onClick={() => {\n                  rejectTransaction(pendingConfirmTx.id);\n                  setPendingConfirmTx(null);\n                  setPendingConfirmError('');\n                }}"
if old not in text:
    raise SystemExit('Dashboard skip anchor missing')
text = text.replace(old, new, 1)
old = "            <div className=\"flex gap-2 pt-2\">"
new = "            {pendingConfirmError && (\n              <div role=\"alert\" className=\"rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-medium text-error\">\n                {pendingConfirmError} The scheduled item is still pending; add funds or choose another confirmation date and try again.\n              </div>\n            )}\n\n            <div className=\"flex gap-2 pt-2\">"
if old not in text:
    raise SystemExit('Dashboard button group anchor missing')
text = text.replace(old, new, 1)
old = "                onClick={() => {\n                  approveTransaction(pendingConfirmTx.id, pendingConfirmDate);\n                  setPendingConfirmTx(null);\n                }}"
new = "                onClick={() => {\n                  const outcome = approveTransaction(pendingConfirmTx.id, pendingConfirmDate);\n                  if (outcome.success) {\n                    setPendingConfirmTx(null);\n                    setPendingConfirmError('');\n                  } else {\n                    setPendingConfirmError(outcome.error || 'This scheduled transaction cannot be confirmed yet.');\n                  }\n                }}"
if old not in text:
    raise SystemExit('Dashboard approve anchor missing')
path.write_text(text.replace(old, new, 1))

# 5) Activity shows the same approval failure inline instead of silently doing nothing.
path = Path('src/components/Activity.tsx')
text = path.read_text()
old = "  const [approvalDates, setApprovalDates] = useState<Record<string, string>>({});\n"
new = "  const [approvalDates, setApprovalDates] = useState<Record<string, string>>({});\n  const [approvalErrors, setApprovalErrors] = useState<Record<string, string>>({});\n"
if old not in text:
    raise SystemExit('Activity approvalDates anchor missing')
text = text.replace(old, new, 1)
old = "                <button className=\"rounded-lg bg-primary px-3 text-sm font-medium text-on-primary\" onClick={() => approveTransaction(tx.id, approvalDates[tx.id] ?? tx.date.slice(0, 10))}>{tx.type === 'income' ? 'Received ✓' : tx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}</button>\n                <button className=\"rounded-lg border border-outline px-3 text-sm\" onClick={() => rejectTransaction(tx.id)}>Skip</button>"
new = "                <button className=\"rounded-lg bg-primary px-3 text-sm font-medium text-on-primary\" onClick={() => {\n                  const outcome = approveTransaction(tx.id, approvalDates[tx.id] ?? tx.date.slice(0, 10));\n                  setApprovalErrors(previous => ({ ...previous, [tx.id]: outcome.success ? '' : (outcome.error || 'This scheduled transaction cannot be confirmed yet.') }));\n                }}>{tx.type === 'income' ? 'Received ✓' : tx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}</button>\n                <button className=\"rounded-lg border border-outline px-3 text-sm\" onClick={() => { rejectTransaction(tx.id); setApprovalErrors(previous => ({ ...previous, [tx.id]: '' })); }}>Skip</button>\n                {approvalErrors[tx.id] && <span role=\"alert\" className=\"basis-full text-xs font-medium text-error\">{approvalErrors[tx.id]} The item remains pending until it can be confirmed.</span>}"
if old not in text:
    raise SystemExit('Activity approval buttons anchor missing')
path.write_text(text.replace(old, new, 1))

# 6) Add browser coverage for scheduling above today's balance and enforcing funds at confirmation.
path = Path('e2e/affordability-phase7.spec.ts')
text = path.read_text()
addition = r'''

test('recurring transfer can be scheduled above today\'s balance but confirmation enforces funds', async ({ page }) => {
  const errors = await prepare(page, false);

  const addButton = page.getByRole('button', { name: /add transaction/i }).first();
  await addButton.click();
  await page.getByRole('button', { name: 'Transfer', exact: true }).click();
  await page.locator('input[type="number"]').first().fill('999999');
  await page.locator('input[name="fromAccount"][value="acc_sbi_01"]').check({ force: true });
  await page.locator('input[name="toAccount"][value="acc_cash_01"]').check({ force: true });
  await page.getByRole('button', { name: 'Toggle recurring transaction' }).click();
  await page.getByRole('button', { name: 'Save Transaction' }).click();

  await expect(page.getByRole('button', { name: 'Save Transaction' })).toHaveCount(0);
  await openTab(page, 'Activity');
  const pending = page.getByText(/Transfer: SBI to Hand Cash/).first();
  await expect(pending).toBeVisible();
  await page.getByRole('button', { name: 'Transferred ✓' }).first().click();
  await expect(page.getByRole('alert')).toContainText(/Insufficient funds in SBI/i);
  await expect(pending).toBeVisible();

  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
'''
if "recurring transfer can be scheduled above today's balance" not in text:
    text += addition
path.write_text(text)

print('Applied v3.1 affordability explanation and scheduled-transfer validation fixes.')
