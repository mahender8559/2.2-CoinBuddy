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

test('wallet summary is a compact floating assets and liabilities quick peek', async ({ page }) => {
  await prepareDemo(page);
  await page.goto('/?tab=dashboard');
  await openWallet(page);

  const wallet = page.getByTestId('wallet-summary-sheet');
  await expect(wallet).toBeVisible();
  await expect(wallet.getByRole('heading', { name: 'Wallet Summary', exact: true })).toBeVisible();
  await expect(wallet.getByText('Total Assets', { exact: true })).toBeVisible();
  await expect(wallet.getByText('Total Liabilities', { exact: true })).toBeVisible();
  await expect(wallet.getByText('Net Position', { exact: true })).toBeVisible();
  await expect(wallet.getByText('Account breakdown', { exact: true })).toBeVisible();

  const assetBreakdown = wallet.locator('details[data-wallet-breakdown="assets"]');
  const liabilityBreakdown = wallet.locator('details[data-wallet-breakdown="liabilities"]');
  await expect(assetBreakdown).toBeVisible();
  await expect(liabilityBreakdown).toBeVisible();
  await expect(assetBreakdown).not.toHaveAttribute('open', '');
  await expect(liabilityBreakdown).not.toHaveAttribute('open', '');

  await assetBreakdown.locator('summary').click();
  expect(await assetBreakdown.locator('[data-wallet-account]').count()).toBeGreaterThan(0);
  await liabilityBreakdown.locator('summary').click();
  expect(await liabilityBreakdown.locator('[data-wallet-account]').count()).toBeGreaterThan(0);

  await expect(wallet.getByText('Recent Transactions', { exact: true })).toHaveCount(0);
  await expect(wallet.getByRole('button', { name: 'Add Money', exact: true })).toHaveCount(0);
  await expect(wallet.locator('[aria-label*="share of assets"]')).toHaveCount(0);

  const bounds = await wallet.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThan(8);
  expect(bounds!.y).toBeGreaterThan(8);
  expect(bounds!.x + bounds!.width).toBeLessThan(viewport!.width - 8);
  expect(bounds!.y + bounds!.height).toBeLessThan(viewport!.height - 8);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
