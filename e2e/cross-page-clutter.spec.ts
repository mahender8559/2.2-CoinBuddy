import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

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
  const mobileNav = page.getByTestId('mobile-bottom-nav');
  if (await mobileNav.isVisible()) {
    await expect(mobileNav.getByRole('button', { name: 'Add Transaction' })).toHaveCount(1);
    await expect(page.getByTestId('page-manage').getByRole('button', { name: 'Add Transaction' })).toHaveCount(0);
  } else {
    await expect(page.getByRole('button', { name: 'Add Transaction' })).toHaveCount(0);
  }
  await expect(page.getByText('Local Storage Encryption Active', { exact: true })).toHaveCount(0);
  const loanCard = page.getByText('Car Loan', { exact: true }).locator('..').locator('..').locator('..');
  await expect(loanCard.getByRole('button', { name: 'Market', exact: true })).toHaveCount(0);

  await openAppDestination(page, 'Categories');
  await expect(page.getByText('Updated just now', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  const categoryDialog = page.getByRole('dialog', { name: 'Add Category', exact: true });
  await expect(categoryDialog).toBeVisible();
  await expect(categoryDialog.getByText('Enable Rollover / Sinking Fund', { exact: true })).toHaveCount(0);
  await expect(categoryDialog.getByText('Where should leftover funds go?', { exact: true })).toHaveCount(0);

  const planningOptions = categoryDialog.getByText('Budget & planning options', { exact: true });
  await expect(planningOptions).toBeVisible();
  await planningOptions.click();
  await expect(categoryDialog.getByText('Rollover unused budget', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Activity sort labels and row actions do not present duplicate edit controls', async ({ page }) => {
  const errors = await prepare(page, 'activity');
  await page.getByRole('button', { name: 'Advanced filters' }).click();
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

test('first-use flow reaches the spotlight tour without backup-password clutter', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('coinbuddy_onboarding_seen');
    localStorage.removeItem('hasCompletedButtonTour');
    localStorage.removeItem('coinbuddy_backup_config');
  });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Welcome to CoinBuddy' })).toBeVisible();
  await expect(page.getByText(/backup password/i)).toHaveCount(0);
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('button', { name: 'Get Started' }).click();
  await expect(page.getByRole('heading', { name: 'Add Transaction' })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
