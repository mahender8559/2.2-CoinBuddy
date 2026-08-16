import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

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

test('v3.5 Categories is a compact budget and behavior list', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepare(page);
  await openAppDestination(page, 'Categories');

  await expect(page.getByTestId('page-categories')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Categories', exact: true })).toBeVisible();
  await expect(page.getByText('Monthly budget', { exact: true })).toBeVisible();
  await expect(page.getByTestId('category-list')).toBeVisible();
  await expect(page.getByText('Groceries', { exact: true })).toBeVisible();
  await expect(page.getByText('Normal', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Edit Groceries', exact: true }).click();
  const categoryDialog = page.getByRole('dialog', { name: 'Edit Category', exact: true });
  await expect(categoryDialog).toBeVisible();
  await expect(categoryDialog.getByLabel('Financial behavior')).toHaveValue('NORMAL');
  await categoryDialog.getByRole('button', { name: 'Close category form', exact: true }).click();
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
  await openAppDestination(page, 'Activity');

  const search = page.getByPlaceholder('Search transactions...');
  await search.fill('Dinner Out');
  await expect(page.getByRole('button', { name: 'Open transaction Dinner Out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open transaction Dinner Out', exact: true }).click();

  const detail = page.getByTestId('transaction-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Dinner Out', exact: true })).toBeVisible();
  await expect(detail.getByText('HDFC Salary Account', { exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Split with friends', exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-transaction-detail.png'), fullPage: false });

  await detail.getByRole('button', { name: 'Split with friends', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Shared expenses', exact: true })).toBeVisible();
  await expect(page.getByLabel('Shared expense title')).toHaveValue('Dinner Out');
  await expect(page.getByLabel('Household total')).toHaveValue(/1,650|1650/);
  await expect(page.getByLabel('Link tracked expense')).toHaveValue('tx_dining');

  await openAppDestination(page, 'Activity');
  await search.fill('Dinner Out');
  await expect(page.getByRole('button', { name: 'Open transaction Dinner Out', exact: true })).toHaveCount(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
