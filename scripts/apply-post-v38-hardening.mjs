import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, content) => fs.writeFileSync(file, content);

function replaceOnce(file, before, after) {
  const source = read(file);
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Expected source not found in ${file}: ${before.slice(0, 120)}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Expected source is not unique in ${file}: ${before.slice(0, 120)}`);
  write(file, source.slice(0, index) + after + source.slice(index + before.length));
}

function insertBefore(file, marker, insertion) {
  const source = read(file);
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Marker not found in ${file}: ${marker}`);
  write(file, source.slice(0, index) + insertion + source.slice(index));
}

function replaceBetween(file, startMarker, endMarker, replacement) {
  const source = read(file);
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Start marker not found in ${file}: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`End marker not found in ${file}: ${endMarker}`);
  write(file, source.slice(0, start) + replacement + source.slice(end));
}

// ---------------------------------------------------------------------------
// Phase 1A — exactly-once transaction mutations at both UI and context layers.
// ---------------------------------------------------------------------------
replaceOnce(
  'src/components/AddTransactionModal.tsx',
  "import { useEffect, useMemo, useState, type FormEvent } from 'react';",
  "import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';",
);
replaceOnce(
  'src/components/AddTransactionModal.tsx',
  "  const [error, setError] = useState<{ message: string; id: number } | null>(null);\n",
  "  const [error, setError] = useState<{ message: string; id: number } | null>(null);\n  const [isSubmitting, setIsSubmitting] = useState(false);\n  const submitInFlight = useRef(false);\n",
);
replaceOnce(
  'src/components/AddTransactionModal.tsx',
  "  const handleSubmit = async (event: FormEvent) => {\n    event.preventDefault();\n",
  "  const handleSubmit = async (event: FormEvent) => {\n    event.preventDefault();\n    if (submitInFlight.current) return;\n",
);
replaceOnce(
  'src/components/AddTransactionModal.tsx',
  "    const eventName = groupId.trim();\n    let eventId: string | undefined;\n    if (eventName) {\n      const existingEvent = events.find(item => item.name.localeCompare(eventName, undefined, { sensitivity: 'accent' }) === 0);\n      const event = existingEvent ?? await createEvent(eventName);\n      if (!event) return showError('Unable to save this event.');\n      eventId = event.id;\n    }\n    const isInterestOnly = categoryName.toLowerCase().includes('interest') || finalTitle.toLowerCase().includes('interest payment');\n\n    const newTx = {",
  "    submitInFlight.current = true;\n    setIsSubmitting(true);\n    try {\n      const eventName = groupId.trim();\n      let eventId: string | undefined;\n      if (eventName) {\n        const existingEvent = events.find(item => item.name.localeCompare(eventName, undefined, { sensitivity: 'accent' }) === 0);\n        const event = existingEvent ?? await createEvent(eventName);\n        if (!event) return showError('Unable to save this event.');\n        eventId = event.id;\n      }\n      const isInterestOnly = categoryName.toLowerCase().includes('interest') || finalTitle.toLowerCase().includes('interest payment');\n\n      const newTx = {",
);
replaceOnce(
  'src/components/AddTransactionModal.tsx',
  "    const result = editingTransaction ? await updateTransaction(editingTransaction.id, newTx) : await addTransaction(newTx);\n    if (!result.success) return showError(result.error || 'Unable to save this transaction.');\n    close();\n  };",
  "      const result = editingTransaction ? await updateTransaction(editingTransaction.id, newTx) : await addTransaction(newTx);\n      if (!result.success) return showError(result.error || 'Unable to save this transaction.');\n      close();\n    } finally {\n      submitInFlight.current = false;\n      setIsSubmitting(false);\n    }\n  };",
);
replaceOnce(
  'src/components/AddTransactionModal.tsx',
  "        onClose={close}\n",
  "        onClose={() => { if (!isSubmitting) close(); }}\n",
);
replaceOnce(
  'src/components/AddTransactionModal.tsx',
  "          <FinanceSubmitButton tone={type === 'expense' ? 'danger' : type === 'income' ? 'success' : 'primary'}>\n            {editingTransaction ? <><Save className=\"h-4 w-4\" />Save Changes</> : type === 'expense' ? <><ArrowUpRight className=\"h-4 w-4\" />Save Expense</> : type === 'income' ? <><ArrowDownLeft className=\"h-4 w-4\" />Save Income</> : <><ArrowRightLeft className=\"h-4 w-4\" />Transfer Money</>}\n          </FinanceSubmitButton>",
  "          <FinanceSubmitButton disabled={isSubmitting} tone={type === 'expense' ? 'danger' : type === 'income' ? 'success' : 'primary'}>\n            {isSubmitting ? 'Saving…' : editingTransaction ? <><Save className=\"h-4 w-4\" />Save Changes</> : type === 'expense' ? <><ArrowUpRight className=\"h-4 w-4\" />Save Expense</> : type === 'income' ? <><ArrowDownLeft className=\"h-4 w-4\" />Save Income</> : <><ArrowRightLeft className=\"h-4 w-4\" />Transfer Money</>}\n          </FinanceSubmitButton>",
);

replaceOnce(
  'src/context/AppContext.tsx',
  "  const pendingLiabilityPayments = useRef(new Set<string>());\n  const undoRedoInFlight = useRef(false);",
  "  const pendingLiabilityPayments = useRef(new Set<string>());\n  const pendingTransactionMutations = useRef(new Set<string>());\n  const undoRedoInFlight = useRef(false);",
);
replaceOnce(
  'src/context/AppContext.tsx',
  "    const finalTx: Transaction = { ...tx, id: crypto.randomUUID(), amount: Math.abs(tx.amount) };\n\n    if (tx.isRecurring) {",
  "    const mutationKey = 'add';\n    if (pendingTransactionMutations.current.has(mutationKey)) {\n      return { success: false, error: 'Another transaction is already being saved.' };\n    }\n    pendingTransactionMutations.current.add(mutationKey);\n    try {\n      const finalTx: Transaction = { ...tx, id: crypto.randomUUID(), amount: Math.abs(tx.amount) };\n\n      if (tx.isRecurring) {",
);
replaceOnce(
  'src/context/AppContext.tsx',
  "    return { success: true };\n  };\n\n  const updateRecurringRule = async",
  "      return { success: true };\n    } finally {\n      pendingTransactionMutations.current.delete(mutationKey);\n    }\n  };\n\n  const updateRecurringRule = async",
);
replaceOnce(
  'src/context/AppContext.tsx',
  "    const normalizedTx = { ...newTx, amount: Math.abs(Number(newTx.amount)) };\n    const updatedTx: Transaction = { ...normalizedTx, id };",
  "    const mutationKey = `update:${id}`;\n    if (pendingTransactionMutations.current.has(mutationKey)) return { success: false, error: 'This transaction is already being updated.' };\n    pendingTransactionMutations.current.add(mutationKey);\n    try {\n      const normalizedTx = { ...newTx, amount: Math.abs(Number(newTx.amount)) };\n      const updatedTx: Transaction = { ...normalizedTx, id };",
);
replaceOnce(
  'src/context/AppContext.tsx',
  "    return { success: true };\n  };\n\n  const deleteTransaction = async",
  "      return { success: true };\n    } finally {\n      pendingTransactionMutations.current.delete(mutationKey);\n    }\n  };\n\n  const deleteTransaction = async",
);

// ---------------------------------------------------------------------------
// Phase 1B — correct and directly-test EMI principal/interest allocation.
// ---------------------------------------------------------------------------
replaceBetween(
  'src/utils/emi.ts',
  'export function calculateEmiSplit(',
  '/**\n * Calculates monthly or periodic EMI/interest amount',
  `export function calculateEmiSplit(
  balance: number,
  annualRate: number,
  emi: number,
  interestType: 'REDUCING' | 'FLAT' | 'INTEREST_ONLY' = 'REDUCING',
  isPrepayment: boolean = false,
  originalPrincipal: number = balance,
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' = 'MONTHLY',
) {
  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const safeBalance = Math.max(0, Number(balance) || 0);
  const safeAnnualRate = Math.max(0, Number(annualRate) || 0);
  const safeEmi = Math.max(0, Number(emi) || 0);
  const safeOriginalPrincipal = Math.max(0, Number(originalPrincipal) || safeBalance);

  if (isPrepayment) {
    return {
      interestAmount: 0,
      principalAmount: roundMoney(Math.min(safeBalance, safeEmi)),
    };
  }

  if (interestType === 'INTEREST_ONLY') {
    return {
      interestAmount: roundMoney(safeEmi),
      principalAmount: 0,
    };
  }

  const periodsPerYear = frequency === 'QUARTERLY' ? 4 : frequency === 'ANNUALLY' ? 1 : 12;
  const interestBase = interestType === 'FLAT' ? safeOriginalPrincipal : safeBalance;
  const interestRes = safeCompute(
    () => interestBase * (safeAnnualRate / 100) / periodsPerYear,
    SAFE_MATH_ERRORS.NAN,
  );
  const periodInterest = typeof interestRes === 'number' ? roundMoney(interestRes) : 0;

  // The amount entered by the user is the total payment for this occurrence.
  // Interest is satisfied first and the remainder reduces principal. A payment
  // above the current payoff amount is capped here; callers can reject that
  // mismatch rather than silently recording more money than the liability needs.
  const applicablePayment = roundMoney(Math.min(safeEmi, safeBalance + periodInterest));
  const interestAmount = roundMoney(Math.min(periodInterest, applicablePayment));
  const principalAmount = roundMoney(Math.min(safeBalance, Math.max(0, applicablePayment - interestAmount)));

  return {
    interestAmount: roundMoney(applicablePayment - principalAmount),
    principalAmount,
  };
}

`,
);
replaceOnce(
  'src/context/AppContext.tsx',
  "          const split = calculateEmiSplit(liabilityAcc.balance, liabilityAcc.interestRate ?? 0, amount, liabilityAcc.interestCalculationType || 'REDUCING');",
  "          const split = calculateEmiSplit(liabilityAcc.balance, liabilityAcc.interestRate ?? 0, amount, liabilityAcc.interestCalculationType || 'REDUCING', false, getOriginalPrincipal(liabilityAcc, transactions), liabilityAcc.paymentFrequency ?? 'MONTHLY');",
);
replaceOnce(
  'src/context/AppContext.tsx',
  "      const principal = Math.max(0, Number(pAmount ?? 0));\n      const interest = Math.max(0, Number(iAmount ?? 0));\n      if (!Number.isFinite(principal) || !Number.isFinite(interest) || principal + interest <= 0) return { success: false, error: 'Payment amount must be a positive number.' };",
  "      const principal = Math.max(0, Number(pAmount ?? 0));\n      const interest = Math.max(0, Number(iAmount ?? 0));\n      if (!Number.isFinite(principal) || !Number.isFinite(interest) || principal + interest <= 0) return { success: false, error: 'Payment amount must be a positive number.' };\n      if ((principalAmount === undefined || interestAmount === undefined) && Math.abs((principal + interest) - Math.abs(amount)) >= 0.01) {\n        return { success: false, error: `Payment exceeds the current payoff amount of ${(principal + interest).toFixed(2)}.` };\n      }",
);
replaceOnce(
  'src/db/dbClientCore.ts',
  "          ? calculateEmiSplit(Number(liability.cached_balance), Number(liability.interest_rate ?? 0), Number(rule.amount), liability.interest_calculation_type ?? 'REDUCING')",
  "          ? calculateEmiSplit(Number(liability.cached_balance), Number(liability.interest_rate ?? 0), Number(rule.amount), liability.interest_calculation_type ?? 'REDUCING', false, Number(liability.original_principal ?? liability.cached_balance), liability.payment_frequency ?? 'MONTHLY')",
);

write('src/utils/emi.test.ts', `import { describe, expect, it } from 'vitest';
import { calculateEmiSplit } from './emi';

describe('calculateEmiSplit', () => {
  it('splits a normal reducing-balance payment', () => {
    expect(calculateEmiSplit(100_000, 12, 10_000, 'REDUCING')).toEqual({
      interestAmount: 1_000,
      principalAmount: 9_000,
    });
  });

  it('uses original principal for flat-rate interest', () => {
    expect(calculateEmiSplit(60_000, 12, 10_000, 'FLAT', false, 100_000)).toEqual({
      interestAmount: 1_000,
      principalAmount: 9_000,
    });
  });

  it('respects payment frequency for flat-rate interest', () => {
    expect(calculateEmiSplit(80_000, 12, 20_000, 'FLAT', false, 100_000, 'QUARTERLY')).toEqual({
      interestAmount: 3_000,
      principalAmount: 17_000,
    });
  });

  it('handles zero-interest loans without NaN or rounding noise', () => {
    expect(calculateEmiSplit(5_000, 0, 1_000)).toEqual({ interestAmount: 0, principalAmount: 1_000 });
  });

  it('supports an exact final payoff including current-period interest', () => {
    expect(calculateEmiSplit(5_000, 12, 5_050)).toEqual({ interestAmount: 50, principalAmount: 5_000 });
  });

  it('caps an overpayment at the current payoff amount', () => {
    expect(calculateEmiSplit(5_000, 12, 6_000)).toEqual({ interestAmount: 50, principalAmount: 5_000 });
  });

  it('keeps interest-only payments out of principal', () => {
    expect(calculateEmiSplit(5_000, 12, 200, 'INTEREST_ONLY')).toEqual({ interestAmount: 200, principalAmount: 0 });
  });

  it('keeps rounded principal plus interest equal to the applied payment', () => {
    const split = calculateEmiSplit(12_345.67, 8.75, 1_500);
    expect(Number((split.principalAmount + split.interestAmount).toFixed(2))).toBe(1_500);
  });

  it('treats a prepayment as pure principal and never exceeds the balance', () => {
    expect(calculateEmiSplit(3_500, 12, 5_000, 'REDUCING', true)).toEqual({ interestAmount: 0, principalAmount: 3_500 });
  });
});
`);

write('e2e/double-submit-transaction.spec.ts', `import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepareDemo(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await page.getByRole('button', { name: /Load demo data/i }).click();
  const reloaded = page.waitForEvent('load', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await reloaded;
}

async function openTransactionForm(page: Page) {
  await openAppDestination(page, 'Activity');
  await page.locator('[data-tour-id="tour-add-transaction"]:visible').click();
  const form = page.getByTestId('transaction-form-sheet');
  await expect(form).toBeVisible();
  return form;
}

test('Add Transaction — rapid double submit creates exactly one transaction', async ({ page }) => {
  await prepareDemo(page);
  const title = 'Exactly Once Expense';
  const form = await openTransactionForm(page);
  await form.locator('#transaction-title').fill(title);
  await form.locator('#transaction-amount').fill('321');

  const save = form.getByRole('button', { name: 'Save Expense', exact: true });
  await save.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(form).not.toBeVisible();
  await openAppDestination(page, 'Activity');
  await expect(page.getByRole('button', { name: `Open transaction ${title}`, exact: true })).toHaveCount(1);

  await page.reload();
  await openAppDestination(page, 'Activity');
  await expect(page.getByRole('button', { name: `Open transaction ${title}`, exact: true })).toHaveCount(1);
});

test('Transfer — rapid double submit creates one transfer intent', async ({ page }) => {
  await prepareDemo(page);
  const form = await openTransactionForm(page);
  await form.getByRole('button', { name: 'Transfer', exact: true }).click();
  await form.locator('#transaction-amount').fill('111');

  const fromChoices = form.getByRole('radio', { name: /^Paid From / });
  const toChoices = form.getByRole('radio', { name: /^Paid To / });
  await expect(fromChoices.first()).toBeVisible();
  await expect(toChoices.first()).toBeVisible();
  await fromChoices.first().check({ force: true });
  await toChoices.first().check({ force: true });

  const transfer = form.getByRole('button', { name: 'Transfer Money', exact: true });
  await transfer.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(form).not.toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Activity');
  await expect(page.getByRole('button', { name: /^Open transaction Transfer:/ })).toHaveCount(1);
});
`);

console.log('Phase 1 financial-integrity hardening staged.');
