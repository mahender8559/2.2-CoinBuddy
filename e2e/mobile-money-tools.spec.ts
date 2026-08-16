import { expect, test } from '@playwright/test';

test('mobile Menu keeps only money destinations and avoids duplicate dashboard shortcuts', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'Mobile navigation only');

  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=dashboard');

  const nav = page.getByTestId('mobile-bottom-nav');
  await expect(nav.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
  await expect(nav.getByText('More', { exact: true })).toHaveCount(0);

  await nav.getByRole('button', { name: 'Menu', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Money tools navigation', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Money tools', exact: true })).toBeVisible();
  await expect(dialog.getByText('Accounts, categories, goals and insights.', { exact: true })).toBeVisible();

  for (const label of ['Accounts', 'Categories', 'Goals', 'Insights']) {
    await expect(dialog.getByRole('button', { name: label, exact: true })).toBeVisible();
  }

  await expect(dialog.getByRole('button', { name: 'Wallet Summary', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Hide balances|Show balances/i })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
});
