import { expect, test, type Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const desktopButton = page.getByTitle(name);
  const mobileButton = page.getByRole('button', { name, exact: true });
  if (await desktopButton.isVisible()) await desktopButton.click();
  else await mobileButton.click();
}

async function prepare(page: Page, clean = false) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ clean }) => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
    if (clean) localStorage.setItem('coinbuddy_skip_demo_seed', 'true');
  }, { clean });
  await page.goto('/');
  await expect(page.getByText('Net Worth', { exact: true }).first()).toBeVisible();
  return errors;
}

async function assertNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('clean-ledger affordability setup survives reload and does not silently demo-seed', async ({ page }) => {
  const errors = await prepare(page, true);
  await openTab(page, 'Insights');

  await expect(page.getByText('Can I Afford It?', { exact: true })).toBeVisible();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  await expect(page.getByText('Not affordable safely', { exact: true })).toBeVisible();
  await expect(page.getByText(/history is unavailable/i)).toBeVisible();

  await page.getByRole('button', { name: 'Safety preferences' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Monthly savings target').fill('10000');
  await page.getByLabel('Protected cash reserve').fill('20000');
  await page.getByRole('button', { name: 'Use fixed amount' }).click();
  await page.getByLabel('Fixed contingency amount').fill('5000');
  await page.getByRole('button', { name: 'Save safety preferences' }).click();
  await expect(page.getByText('Affordability safety preferences saved')).toBeVisible();

  await page.reload();
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Safety preferences' }).click();
  await expect(page.getByLabel('Monthly savings target')).toHaveValue('10,000.00');
  await expect(page.getByLabel('Protected cash reserve')).toHaveValue('20,000.00');
  await expect(page.getByLabel('Fixed contingency amount')).toHaveValue('5,000.00');
  await page.getByRole('button', { name: 'Close safety preferences' }).click();

  await page.getByRole('button', { name: 'Review categories' }).click();
  await expect(page.getByText('No expense categories are available yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Close category review' }).click();
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('category financial behavior can be changed and persists after reload', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Review categories' }).click();

  const groceries = page.getByLabel('Groceries affordability behavior');
  await expect(groceries).toBeVisible();
  await groceries.selectOption('IRREGULAR');
  await expect(groceries).toHaveValue('IRREGULAR');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(500);

  await page.reload();
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Review categories' }).click();
  await expect(page.getByLabel('Groceries affordability behavior')).toHaveValue('IRREGULAR');
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});


test('recurring transfer can be scheduled above today\'s balance but confirmation enforces funds', async ({ page }) => {
  const errors = await prepare(page, false);

  const addButton = page.getByRole('button', { name: /add transaction/i }).first();
  await addButton.click();
  await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
  await page.getByLabel('Transaction amount').fill('999999');
  await page.locator('label').filter({ has: page.locator('input[name="fromAccount"][value="acc_sbi_01"]') }).click();
  await page.locator('label').filter({ has: page.locator('input[name="toAccount"][value="acc_cash_01"]') }).click();
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


test('money inputs use selected-currency grouping and affordability cards do not overflow mobile', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Insights');

  const amount = page.getByLabel('Amount', { exact: true });
  await amount.fill('100000');
  await expect(amount).toHaveValue('1,00,000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  await expect(amount).toHaveValue('1,00,000.00');

  await assertNoDocumentOverflow(page);
  const summaryCards = page.getByText('Safe to spend', { exact: true }).locator('..');
  await expect(summaryCards).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});


test('real Goals persist and feed affordability protection', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await page.getByRole('button', { name: 'Goals', exact: true }).click();
  await page.getByRole('button', { name: 'Add goal' }).click();
  await page.getByLabel('Goal name').fill('Laptop Fund');
  await page.getByLabel('Target amount').fill('80000');
  await page.getByLabel('Monthly contribution').fill('5000');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByText('Laptop Fund', { exact: true })).toBeVisible();
  await expect(page.getByText(/Planner protects.*5,000/i)).toBeVisible();

  await page.reload();
  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await page.getByRole('button', { name: 'Goals', exact: true }).click();
  await expect(page.getByText('Laptop Fund', { exact: true })).toBeVisible();

  await openTab(page, 'Insights');
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  const goalProtection = page.getByText('Goals protection:', { exact: true }).locator('..');
  await expect(goalProtection).toContainText(/5,000/);
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('investment SIP setup creates a recurring transfer rule', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Add Asset', exact: true }).click();
  await page.getByPlaceholder('e.g. Primary Checking').fill('Retirement SIP');
  await page.getByRole('button', { name: 'Investment', exact: true }).click();
  await page.getByLabel('Total Invested Amount').fill('10000');
  await page.getByLabel('Current Market Value').fill('10000');
  await page.getByLabel('Monthly SIP Amount').fill('5000');
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-05`;
  await page.getByLabel('Next SIP Date').fill(nextDate);
  await page.getByLabel('SIP Funding Account').selectOption('acc_sbi_01');
  await page.getByRole('button', { name: 'Add Asset', exact: true }).last().click();
  await expect(page.getByText('Retirement SIP', { exact: true })).toBeVisible();

  await openTab(page, 'Settings');
  await expect(page.getByText('SIP: Retirement SIP', { exact: true })).toBeVisible();
  await expect(page.getByText(/5,000/).first()).toBeVisible();
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
