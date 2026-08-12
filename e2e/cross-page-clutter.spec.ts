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
  await page.addInitScript(() => {
    localStorage.removeItem('coinbuddy_onboarding_seen');
    localStorage.removeItem('hasCompletedButtonTour');
    localStorage.removeItem('backupConfig');
  });
  await page.goto('/');
  const getStarted = page.getByRole('button', { name: /Get Started/i });
  if (await getStarted.isVisible()) await getStarted.click();
  const next = page.getByRole('button', { name: /Next/i });
  while (await next.isVisible()) await next.click();
  const finish = page.getByRole('button', { name: /Finish/i });
  if (await finish.isVisible()) await finish.click();
  await expect(page.getByText(/Track your income, expenses, and transfers/i)).toBeVisible();
  const legacyBackup = await page.evaluate(() => localStorage.getItem('backupConfig'));
  expect(legacyBackup).toBeNull();
});
