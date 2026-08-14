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

async function openDestination(page: Page, destination: 'Insights' | 'Settings') {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: destination, exact: true }).click();
    return;
  }
  await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: destination, exact: true }).click();
}

test('v3.5 Insights uses focused views and preserves deep tools', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepare(page);
  await openDestination(page, 'Insights');

  await expect(page.getByTestId('page-insights')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
  await expect(page.getByTestId('insights-overview')).toBeVisible();
  await expect(page.getByText('Spending overview', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await expect(page.getByTestId('insights-planning')).toBeVisible();
  await expect(page.getByText('Can I Afford It?', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Debt', exact: true }).click();
  await expect(page.getByTestId('insights-debt')).toBeVisible();
  await expect(page.getByText('Personal debt exposure', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await expect(page.getByTestId('insights-advanced')).toBeVisible();
  await expect(page.getByTestId('advanced-insights-content')).toBeVisible();
  await expect(page.getByText('Category Spending & Growth Trend', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('v35-insights.png'), fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('v3.5 Settings keeps important controls in compact groups', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepare(page);
  await openDestination(page, 'Settings');

  await expect(page.getByTestId('page-settings')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settings & Manage ⚙️', exact: true })).toBeVisible();
  await expect(page.getByText('Preferences', { exact: true })).toBeVisible();
  await expect(page.getByText('Security', { exact: true })).toBeVisible();
  await expect(page.getByText('Data Management', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Backup & Security/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Export Excel/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Restore Backup/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Verify Data Integrity/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Load demo data/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Clear Local Storage/i })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('v35-settings.png'), fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
