import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, tab = 'dashboard') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto(`/?tab=${tab}`);
  return errors;
}

test('Manage does not expose duplicate or unwired add/market/sinking-fund controls', async ({ page }) => {
  const errors = await prepare(page, 'manage');
  await expect(page.getByRole('button', { name: 'Add Transaction' })).toHaveCount(0);
  await expect(page.getByText('Local Storage Encryption Active', { exact: true })).toHaveCount(0);
  // Market valuation is legitimate for Investment assets; it must not appear on loans.
  const loanCard = page.getByText('Car Loan', { exact: true }).locator('..').locator('..').locator('..');
  await expect(loanCard.getByRole('button', { name: 'Market', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await expect(page.getByText('Updated just now', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'ADD CATEGORY', exact: true }).click();
  await expect(page.getByText('Enable Rollover / Sinking Fund', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Where should leftover funds go?', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Carry unused budget forward', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Activity sort labels and row actions do not present duplicate edit controls', async ({ page }) => {
  const errors = await prepare(page, 'activity');
  await expect(page.getByRole('option', { name: 'Title (A to Z)' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Notes (A to Z)' })).toHaveCount(0);
  await expect(page.getByTitle('Edit Transaction')).toHaveCount(0);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Insights removes fake clickable savings advice and duplicate security badge', async ({ page }) => {
  const errors = await prepare(page, 'insights');
  await expect(page.getByText('Data stored securely on this device', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Savings Potential', { exact: true })).toHaveCount(0);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('first-use tour goes directly from onboarding to UI spotlight without writing backup password', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('coinbuddy_onboarding_seen');
    localStorage.removeItem('hasCompletedButtonTour');
    localStorage.removeItem('backupConfig');
    localStorage.removeItem('coinbuddy_backup_config');
  });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Welcome to CoinBuddy' })).toBeVisible();
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('button', { name: 'Get Started' }).click();
  await expect(page.getByRole('heading', { name: 'Add Transaction' })).toBeVisible();
  await expect(page.getByText(/Dashboard, Activity, or Insights to log income, expenses, or transfers/i)).toBeVisible();
  const legacyBackup = await page.evaluate(() => ({
    old: localStorage.getItem('backupConfig'),
    current: localStorage.getItem('coinbuddy_backup_config'),
  }));
  expect(legacyBackup.old).toBeNull();
  expect(legacyBackup.current).toBeNull();
});
