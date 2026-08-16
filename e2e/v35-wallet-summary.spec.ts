import { expect, test, type Page } from '@playwright/test';

async function prepareDemo(page: Page) {
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
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function openWallet(page: Page) {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('app-header').getByRole('button', { name: 'Wallet Summary', exact: true }).click();
    return;
  }

  await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: 'Wallet Summary', exact: true }).click();
}

test('wallet summary explains where asset balances are held', async ({ page }) => {
  await prepareDemo(page);
  await page.goto('/?tab=dashboard');
  await openWallet(page);

  const wallet = page.getByTestId('wallet-summary-sheet');
  await expect(wallet).toBeVisible();
  await expect(wallet.getByRole('heading', { name: 'Wallet Summary', exact: true })).toBeVisible();
  await expect(wallet.getByText('Total assets', { exact: true })).toBeVisible();
  await expect(wallet.getByText('Spendable now', { exact: true })).toBeVisible();
  await expect(wallet.getByText('Investments', { exact: true }).first()).toBeVisible();
  await expect(wallet.getByText('Account breakdown', { exact: true })).toBeVisible();

  expect(await wallet.locator('[data-wallet-group]').count()).toBeGreaterThan(0);
  expect(await wallet.locator('[data-wallet-account]').count()).toBeGreaterThan(0);

  await expect(wallet.getByText('Recent Transactions', { exact: true })).toHaveCount(0);
  await expect(wallet.getByRole('button', { name: 'Add Money', exact: true })).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
