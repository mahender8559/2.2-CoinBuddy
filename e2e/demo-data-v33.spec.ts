import { expect, test, type Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const desktop = page.getByTitle(name);
  const mobile = page.getByRole('button', { name, exact: true });
  if (await desktop.isVisible()) await desktop.click(); else await mobile.click();
}

async function prepare(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await expect(page.getByText('Data Management', { exact: true })).toBeVisible();
  return errors;
}

test('demo data loads a realistic v3.3 showcase and investment Goal stays non-liquid', async ({ page }) => {
  const errors = await prepare(page);
  const demoButton = page.getByRole('button', { name: /Load demo data/i });
  await expect(demoButton).toBeVisible();
  await demoButton.click();
  await expect(page.getByText('Load Demo Data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('SIP: Liquid Mutual Fund', { exact: true })).toBeVisible();
  await expect(page.getByText('Investment SIP', { exact: true })).toBeVisible();

  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await page.getByRole('button', { name: 'Goals', exact: true }).click();
  const emergency = page.getByRole('article', { name: 'Goal Emergency Fund' });
  await expect(emergency).toContainText('Liquid Mutual Fund');
  await expect(emergency).toContainText(/excluded from affordability liquid cash and protected reserves/i);

  await openTab(page, 'Insights');
  await expect(page.getByText('Upcoming Money', { exact: true })).toBeVisible();
  await expect(page.getByText('Projected free cash', { exact: true })).toBeVisible();

  await openTab(page, 'Settings');
  await page.getByRole('button', { name: /Verify Data Integrity/i }).click();
  await expect(page.getByText('Integrity Verified', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
