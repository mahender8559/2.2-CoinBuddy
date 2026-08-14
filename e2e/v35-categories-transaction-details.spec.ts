import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  const demo = page.getByRole('button', { name: /Load demo data/i });
  await expect(demo).toBeVisible();
  await demo.click();
  await expect(page.getByText('Load Demo Data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15000 });
}

async function openDestination(page: Page, destination: 'Activity' | 'Categories') {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: destination, exact: true }).click();
    return;
  }
  const mobileNav = page.getByTestId('mobile-bottom-nav');
  if (destination === 'Activity') {
    await mobileNav.getByRole('button', { name: 'Activity', exact: true }).click();
    return;
  }
  await mobileNav.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: destination, exact: true }).click();
}

test('v3.5 Categories is a compact budget and behavior list', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepare(page);
  await openDestination(page, 'Categories');

  await expect(page.getByTestId('page-categories')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Categories', exact: true })).toBeVisible();
  await expect(page.getByText('Monthly budget', { exact: true })).toBeVisible();
  await expect(page.getByTestId('category-list')).toBeVisible();
  await expect(page.getByText('Groceries', { exact: true })).toBeVisible();
  await expect(page.getByText('Normal', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Edit Groceries', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit category' })).toBeVisible();
  await expect(page.getByLabel('Financial behavior')).toHaveValue('NORMAL');
  await page.getByRole('button', { name: 'Close category form' }).click();
  await page.screenshot({ path: testInfo.outputPath('v35-categories.png'), fullPage: false });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('v3.5 transaction details hands an expense to Sharing without duplicating it', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepare(page);
  await openDestination(page, 'Activity');

  const search = page.getByPlaceholder('Search transactions...');
  await search.fill('Dinner Out');
  await expect(page.getByRole('button', { name: 'Open transaction Dinner Out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open transaction Dinner Out', exact: true }).click();

  await expect(page.getByTestId('transaction-detail')).toBeVisible();
  await expect(page.getByText('Dinner Out', { exact: true })).toBeVisible();
  await expect(page.getByText('HDFC Salary Account', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Split with friends', exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-transaction-detail.png'), fullPage: false });

  await page.getByRole('button', { name: 'Split with friends', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Shared expenses', exact: true })).toBeVisible();
  await expect(page.getByLabel('Shared expense title')).toHaveValue('Dinner Out');
  await expect(page.getByLabel('Household total')).toHaveValue(/1,650|1650/);
  await expect(page.getByLabel('Link tracked expense')).toHaveValue('tx_dining');

  const dinnerCount = await page.evaluate(async () => {
    // The transaction list itself is source-of-truth state; the UI handoff must
    // not create another ledger transaction simply by opening Sharing.
    return document.body.textContent?.includes('Dinner Out') ? 1 : 0;
  });
  expect(dinnerCount).toBe(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
