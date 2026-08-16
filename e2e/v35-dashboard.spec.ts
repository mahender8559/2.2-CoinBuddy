import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=dashboard');
}

test('v3.5 dashboard presents the locked financial hierarchy', async ({ page }, testInfo: TestInfo) => {
  await prepare(page);
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await expect(page.getByText(/Good (morning|afternoon|evening),/)).toBeVisible();
  await expect(page.getByRole('article', { name: 'Net Worth overview' })).toBeVisible();
  await expect(page.getByText('Assets', { exact: true })).toBeVisible();
  await expect(page.getByText('Liabilities', { exact: true })).toBeVisible();
  await expect(page.getByText('Income', { exact: true })).toBeVisible();
  await expect(page.getByText('Expenses', { exact: true })).toBeVisible();
  await expect(page.getByText('Goal Progress', { exact: true })).toBeVisible();
  await expect(page.getByText('Needs Attention', { exact: true })).toBeVisible();

  const quickActions = page.getByTestId('dashboard-quick-actions');
  await expect(quickActions).toBeVisible();
  await expect(quickActions.getByRole('button', { name: /Hide balances|Show balances/ })).toBeVisible();
  await expect(quickActions.getByRole('button', { name: 'Wallet Summary', exact: true })).toBeVisible();
  await expect(quickActions.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('v35-dashboard.png'), fullPage: false });
});

test('net worth quick actions open privacy, wallet and settings controls', async ({ page }) => {
  await prepare(page);

  const quickActions = page.getByTestId('dashboard-quick-actions');
  await expect(quickActions).toBeVisible();

  const privacy = quickActions.getByRole('button', { name: /Hide balances|Show balances/ });
  const initialPrivacyLabel = await privacy.getAttribute('aria-label');
  await privacy.click();
  await expect(privacy).not.toHaveAttribute('aria-label', initialPrivacyLabel ?? '');

  await quickActions.getByRole('button', { name: 'Wallet Summary', exact: true }).click();
  const wallet = page.getByTestId('wallet-summary-sheet');
  await expect(wallet).toBeVisible();
  await wallet.getByRole('button', { name: 'Close wallet summary', exact: true }).click();

  await quickActions.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\?tab=settings$/);
  await expect(page.getByTestId('page-settings')).toBeVisible();
});
