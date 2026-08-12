import { expect, test, type Page } from '@playwright/test';

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

test('Settings exposes one clear export/restore path and removes dead controls', async ({ page }) => {
  const errors = await prepare(page);
  await expect(page.getByText('Auto-create recurring entries', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Load CoinBuddy Test Data', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Export Excel/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Restore Backup/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Verify Data Integrity/i })).toBeVisible();

  await page.getByRole('button', { name: /Backup & Security/i }).click();
  await expect(page.getByText('Auto-Backup Settings', { exact: true })).toBeVisible();
  await expect(page.getByText('Wi-Fi Only', { exact: true })).toHaveCount(0);
  await expect(page.locator('option[value="CUSTOM"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore Data Wizard' })).toHaveCount(0);
  await page.getByTitle('Back to Settings').click();

  await page.getByRole('button', { name: /Restore Backup/i }).click();
  await expect(page.getByText('Restore Data Wizard', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('managed Investment SIP uses mobile width without a fake edit button', async ({ page }) => {
  const errors = await prepare(page);
  // Existing/demo data may not contain a managed SIP; if present, it must use
  // full-width explanatory copy rather than the old button-looking span.
  await expect(page.getByText('Edit in Manage → Investment', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth));
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
