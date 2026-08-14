import { expect, test, type Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const destination = name === 'Dashboard' ? 'Home' : name === 'Manage' ? 'Accounts' : name;
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  const mobileNav = page.getByTestId('mobile-bottom-nav');
  if (destination === 'Home' || destination === 'Activity' || destination === 'Sharing') {
    await mobileNav.getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  await mobileNav.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: destination, exact: true }).click();
}

async function prepare(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { localStorage.setItem('coinbuddy_onboarding_seen', 'true'); localStorage.setItem('hasCompletedButtonTour', 'true'); });
  await page.goto('/');
  await expect(page.getByText('Net Worth', { exact: true }).first()).toBeVisible();
  return errors;
}

test('v3.3 shows Upcoming Money and expandable affordability sources', async ({ page }) => {
  const errors = await prepare(page);
  await openTab(page, 'Insights');
  await expect(page.getByText('Upcoming Money', { exact: true })).toBeVisible();
  await expect(page.getByText('Projected free cash', { exact: true })).toBeVisible();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  await page.getByRole('button', { name: /How did we calculate this/i }).click();
  await page.getByRole('button', { name: /Expected income/i }).click();
  await expect(page.getByText(/Salary|No separate scheduled source|Expected income/i).first()).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('v3.3 Goal-linked transaction advances unlinked Goal after confirmation', async ({ page }) => {
  const errors = await prepare(page);
  await openTab(page, 'Goals');
  await page.getByRole('button', { name: 'Add goal' }).click();
  await page.getByLabel('Goal name').fill('V33 Goal');
  await page.getByLabel('Target amount').fill('10000');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByText('V33 Goal', { exact: true })).toBeVisible();

  await openTab(page, 'Dashboard');
  await page.getByRole('button', { name: /add transaction/i }).first().click();
  await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
  await page.getByLabel('Transaction amount').fill('1000');
  await page.getByLabel('Goal contribution').selectOption({ label: 'V33 Goal' });
  await page.locator('label').filter({ has: page.locator('input[name="fromAccount"][value="acc_sbi_01"]') }).click();
  await page.locator('label').filter({ has: page.locator('input[name="toAccount"][value="acc_cash_01"]') }).click();
  await page.getByRole('button', { name: 'Save Transaction' }).click();

  await openTab(page, 'Goals');
  await expect(page.getByRole('article', { name: 'Goal V33 Goal' })).toContainText(/1,000/);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('v3.3 recurring status filters and backup reliability status are visible', async ({ page }) => {
  const errors = await prepare(page);
  await openTab(page, 'Settings');
  await expect(page.getByRole('button', { name: /Upcoming ·/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Needs confirmation ·/ })).toBeVisible();
  await page.getByRole('button', { name: /Backup & Security/i }).click();
  await expect(page.getByText('Next scheduled:', { exact: true })).toBeVisible();
  await expect(page.getByText('Destination:', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified:', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
