import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

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
  await openAppDestination(page, 'Settings');
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

  await openAppDestination(page, 'Insights');
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  await expect(page.getByText('Can I Afford It?', { exact: true })).toBeVisible();
  await page.reload();
  await openAppDestination(page, 'Insights');
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await expect(page.getByText('Can I Afford It?', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('category financial behavior can be changed and persists after reload', async ({ page }) => {
  const errors = await prepare(page, false);
  await openAppDestination(page, 'Insights');
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await page.getByRole('button', { name: 'Review categories' }).click();
  const groceries = page.getByLabel('Groceries affordability behavior');
  await groceries.selectOption('IRREGULAR');
  await expect(groceries).toHaveValue('IRREGULAR');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(500);

  await page.reload();
  await openAppDestination(page, 'Insights');
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await page.getByRole('button', { name: 'Review categories' }).click();
  await expect(page.getByLabel('Groceries affordability behavior')).toHaveValue('IRREGULAR');
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('recurring transfer can be scheduled above today\'s balance but confirmation enforces funds', async ({ page }) => {
  test.slow();
  const errors = await prepare(page, false);

  await openAppDestination(page, 'Settings');
  const demoButton = page.getByRole('button', { name: /Load demo data/i });
  await expect(demoButton).toBeVisible();
  await demoButton.click();
  await expect(page.getByText('Load Demo Data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15_000 });
  await openAppDestination(page, 'Home');

  const addButton = page.getByRole('button', { name: /add transaction/i }).first();
  await addButton.click();
  const transaction = page.getByTestId('transaction-form-sheet');
  await transaction.getByRole('button', { name: 'Transfer', exact: true }).click();
  await transaction.getByLabel('Transaction amount').fill('999999');

  const sourceAccount = transaction.locator('input[name="fromAccount"]').first();
  await expect(sourceAccount).toBeAttached();
  const sourceLabel = sourceAccount.locator('xpath=ancestor::label');
  const sourceName = (await sourceLabel.locator('.cb-account-choice-name').textContent())?.trim();
  expect(sourceName).toBeTruthy();
  await sourceAccount.check({ force: true });

  const destinationAccount = transaction.locator('input[name="toAccount"]').first();
  await expect(destinationAccount).toBeAttached();
  const destinationLabel = destinationAccount.locator('xpath=ancestor::label');
  const destinationName = (await destinationLabel.locator('.cb-account-choice-name').textContent())?.trim();
  expect(destinationName).toBeTruthy();
  await destinationAccount.check({ force: true });

  await transaction.getByText('More options', { exact: true }).click();
  await transaction.getByRole('button', { name: 'Toggle recurring transaction' }).click();
  await transaction.getByRole('button', { name: 'Transfer Money', exact: true }).click();

  await expect(transaction).toHaveCount(0);
  await openAppDestination(page, 'Activity');
  const pending = page.getByText(`Transfer: ${sourceName} to ${destinationName}`, { exact: true }).first();
  await expect(pending).toBeVisible();
  const pendingToggle = page.getByRole('button', { name: /Needs confirmation/ }).first();
  if (await pendingToggle.getAttribute('aria-expanded') === 'false') await pendingToggle.click();
  await page.getByRole('button', { name: 'Transferred ✓' }).first().click();
  await expect(page.getByRole('alert')).toContainText(`Insufficient funds in ${sourceName}`);
  await expect(pending).toBeVisible();

  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('money inputs use selected-currency grouping and affordability cards do not overflow mobile', async ({ page }) => {
  const errors = await prepare(page, false);
  await openAppDestination(page, 'Insights');
  await page.getByRole('button', { name: 'Planning', exact: true }).click();

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
  await openAppDestination(page, 'Goals');
  await page.getByRole('button', { name: 'Add goal', exact: true }).click();
  const goalDialog = page.getByRole('dialog', { name: 'Add Goal', exact: true });
  await goalDialog.locator('#goal-name').fill('Laptop Fund');
  await goalDialog.getByLabel('Target Amount').fill('80000');
  await goalDialog.getByText('More options', { exact: true }).click();
  await goalDialog.getByLabel('Monthly contribution').fill('5000');
  await goalDialog.getByRole('button', { name: 'Create Goal', exact: true }).click();
  const laptopGoal = page.getByRole('article', { name: 'Goal Laptop Fund' });
  await expect(laptopGoal).toBeVisible();
  await expect(laptopGoal).toContainText(/Planner protects.*5,000/i);

  await page.reload();
  await openAppDestination(page, 'Goals');
  await expect(page.getByRole('article', { name: 'Goal Laptop Fund' })).toBeVisible();

  await openAppDestination(page, 'Insights');
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  const goalProtection = page.getByText('Goals protection:', { exact: true }).locator('..');
  await expect(goalProtection).toContainText(/24,000/);
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('investment SIP setup creates a recurring transfer rule', async ({ page }) => {
  const errors = await prepare(page, false);
  await openAppDestination(page, 'Accounts');
  await page.getByRole('button', { name: /Add account/i }).click();
  await page.getByRole('button', { name: 'Asset / investment', exact: true }).click();
  const accountSheet = page.getByTestId('account-form-sheet');
  await expect(accountSheet.getByRole('heading', { name: 'Add Account', exact: true })).toBeVisible();
  await accountSheet.getByRole('button', { name: 'Investment', exact: true }).click();
  await expect(accountSheet.getByRole('heading', { name: 'Add Investment', exact: true })).toBeVisible();
  await accountSheet.locator('#account-name').fill('Emergency Fund');
  await accountSheet.getByLabel('Opening Balance').fill('25000');
  await accountSheet.getByLabel('Total Invested Amount').fill('25000');
  await accountSheet.getByRole('button', { name: 'SIP', exact: true }).click();
  await accountSheet.getByLabel('Monthly SIP Amount').fill('10000');
  await accountSheet.getByLabel('Next SIP Date').fill('2026-09-01');
  await accountSheet.getByLabel('Funding Account').selectOption('acc_sbi_01');
  await accountSheet.getByRole('button', { name: 'Add Investment', exact: true }).click();

  await openAppDestination(page, 'Settings');
  await expect(page.getByText('SIP: Emergency Fund', { exact: true })).toBeVisible();
  await expect(page.getByText('Investment SIP', { exact: true }).first()).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
