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

  const privacy = page.getByTestId('dashboard-privacy-toggle');
  await expect(privacy).toBeVisible();

  const headerActions = page.getByTestId('dashboard-header-actions');
  await expect(headerActions).toBeVisible();
  await expect(headerActions.getByRole('button', { name: 'Wallet Summary', exact: true })).toBeVisible();
  await expect(headerActions.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();

  const incomeCard = page.locator('[data-tour-id="tour-summary-widgets"]');
  const cycle = page.getByTestId('dashboard-cycle-indicator');
  await expect(cycle).toBeVisible();
  await expect(incomeCard).toContainText(await cycle.textContent() ?? '');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('v35-dashboard.png'), fullPage: false });
});

test('repositioned dashboard shortcuts open privacy, wallet and settings controls', async ({ page }) => {
  await prepare(page);

  const privacy = page.getByTestId('dashboard-privacy-toggle');
  const initialPrivacyLabel = await privacy.getAttribute('aria-label');
  await privacy.click();
  await expect(privacy).not.toHaveAttribute('aria-label', initialPrivacyLabel ?? '');

  const headerActions = page.getByTestId('dashboard-header-actions');
  await headerActions.getByRole('button', { name: 'Wallet Summary', exact: true }).click();
  const wallet = page.getByTestId('wallet-summary-sheet');
  await expect(wallet).toBeVisible();
  await wallet.getByRole('button', { name: 'Close wallet summary', exact: true }).click();

  await headerActions.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\?tab=settings$/);
  await expect(page.getByTestId('page-settings')).toBeVisible();
});
