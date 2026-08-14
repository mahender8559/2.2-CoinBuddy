import { expect, test, type Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const destination = name === 'Dashboard' ? 'Home' : name === 'Manage' ? 'Accounts' : name;
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  const mobileNav = page.getByTestId('mobile-bottom-nav');
  if (destination === 'Home' || destination === 'Activity') {
    await mobileNav.getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  await mobileNav.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: destination, exact: true }).click();
}

async function prepare(page: Page, preserveDatabase = false) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ preserve }) => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
    if (!preserve) localStorage.removeItem('coinbuddy_sqlite_db_v1');
  }, { preserve: preserveDatabase });
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
  await openTab(page, 'Settings');
  await page.getByRole('button', { name: /Clear Local Storage/i }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Storage Cleared', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.evaluate(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=dashboard');
  await expect(page.getByText('Net Worth', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('HDFC Salary Account', { exact: true })).toHaveCount(0);

  await openTab(page, 'Insights');
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  await expect(page.getByText('Can I Afford It?', { exact: true })).toBeVisible();
  await page.reload();
  await openTab(page, 'Insights');
  await expect(page.getByText('Can I Afford It?', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});


test('category financial behavior can be changed and persists after reload', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Review categories' }).click();
  const groceries = page.getByLabel('Groceries affordability behavior');
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
  const pending = page.getByText(/Transfer: HDFC Salary Account to Cash Wallet/).first();
  await expect(pending).toBeVisible();
  await page.getByRole('button', { name: 'Transferred ✓' }).first().click();
  await expect(page.getByRole('alert')).toContainText(/Insufficient funds in HDFC Salary Account/i);
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
  await page.getByTestId('page-manage').getByRole('button', { name: 'Goals', exact: true }).click();
  await page.getByRole('button', { name: 'Add goal' }).click();
  await page.getByLabel('Goal name').fill('Laptop Fund');
  await page.getByLabel('Target amount').fill('80000');
  await page.getByLabel('Monthly contribution').fill('5000');
  await page.getByRole('button', { name: 'Save goal' }).click();
  const laptopGoal = page.getByRole('article', { name: 'Goal Laptop Fund' });
  await expect(laptopGoal).toBeVisible();
  await expect(laptopGoal).toContainText(/Planner protects.*5,000/i);

  await page.reload();
  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await page.getByTestId('page-manage').getByRole('button', { name: 'Goals', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Goal Laptop Fund' })).toBeVisible();

  await openTab(page, 'Insights');
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  const goalProtection = page.getByText('Goals protection:', { exact: true }).locator('..');
  await expect(goalProtection).toContainText(/24,000/);
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('investment SIP setup creates a recurring transfer rule', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Add Asset' }).click();
  await expect(page.getByRole('heading', { name: 'Add Asset', exact: true })).toBeVisible();
  await page.getByPlaceholder('e.g. Primary Checking').fill('Emergency Fund');
  await page.getByRole('button', { name: 'Investment', exact: true }).click();
  await page.getByLabel('Total Invested Amount').fill('25000');
  await page.getByLabel('Current Market Value').fill('25000');
  await page.getByRole('button', { name: 'SIP', exact: true }).click();
  await page.getByLabel('Monthly SIP Amount').fill('10000');
  await page.getByLabel('Next SIP Date').fill('2026-09-01');
  await page.getByLabel('SIP Funding Account').selectOption('acc_sbi_01');
  await page.locator('form').getByRole('button', { name: 'Add Asset', exact: true }).click();

  await openTab(page, 'Settings');
  await expect(page.getByText('SIP: Emergency Fund', { exact: true })).toBeVisible();
  await expect(page.getByText('Investment SIP', { exact: true }).first()).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
