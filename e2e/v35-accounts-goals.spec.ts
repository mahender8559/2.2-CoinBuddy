import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  const demoButton = page.getByRole('button', { name: /Load demo data/i });
  await expect(demoButton).toBeVisible();
  await demoButton.click();
  await expect(page.getByText('Load Demo Data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15000 });
}

test('v3.5 Accounts and Goals use focused grouped surfaces', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepare(page);

  await openAppDestination(page, 'Accounts');
  await expect(page.getByTestId('page-accounts')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your Accounts 👋', exact: true })).toBeVisible();
  await expect(page.getByTestId('account-group-bank')).toBeVisible();
  await expect(page.getByTestId('account-group-investment')).toBeVisible();
  await expect(page.getByTestId('account-group-loan')).toBeVisible();
  await page.getByRole('button', { name: /HDFC Salary Account/ }).click();
  await expect(page.getByRole('button', { name: 'Reconcile', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Add account/i })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-accounts.png'), fullPage: false });

  await openAppDestination(page, 'Goals');
  await expect(page.getByTestId('page-goals')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Goals', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All goals', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Completed', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Goal Emergency Fund' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add goal/i })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-goals.png'), fullPage: false });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
