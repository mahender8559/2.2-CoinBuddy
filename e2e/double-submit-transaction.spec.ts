import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepareDemo(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await page.getByRole('button', { name: /Load demo data/i }).click();
  const reloaded = page.waitForEvent('load', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await reloaded;
}

async function openTransactionForm(page: Page) {
  await openAppDestination(page, 'Activity');
  await page.locator('[data-tour-id="tour-add-transaction"]:visible').click();
  const form = page.getByTestId('transaction-form-sheet');
  await expect(form).toBeVisible();
  return form;
}

test('Add Transaction — rapid double submit creates exactly one transaction', async ({ page }) => {
  await prepareDemo(page);
  const title = 'Exactly Once Expense';
  const form = await openTransactionForm(page);
  await form.locator('#transaction-title').fill(title);
  await form.locator('#transaction-amount').fill('321');
  const save = form.getByRole('button', { name: 'Save Expense', exact: true });
  await save.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(form).not.toBeVisible();
  await openAppDestination(page, 'Activity');
  await expect(page.getByRole('button', { name: 'Open transaction ' + title, exact: true })).toHaveCount(1);
  await page.reload();
  await openAppDestination(page, 'Activity');
  await expect(page.getByRole('button', { name: 'Open transaction ' + title, exact: true })).toHaveCount(1);
});

test('Transfer — rapid double submit creates one transfer intent', async ({ page }) => {
  await prepareDemo(page);
  const form = await openTransactionForm(page);
  await form.getByRole('button', { name: 'Transfer', exact: true }).click();
  await form.locator('#transaction-amount').fill('111');
  const fromChoices = form.getByRole('radio', { name: /^Paid From / });
  const toChoices = form.getByRole('radio', { name: /^Paid To / });
  await expect(fromChoices.first()).toBeVisible();
  await expect(toChoices.first()).toBeVisible();
  await fromChoices.first().check({ force: true });
  await toChoices.first().check({ force: true });
  const transfer = form.getByRole('button', { name: 'Transfer Money', exact: true });
  await transfer.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(form).not.toBeVisible();
  await page.reload();
  await openAppDestination(page, 'Activity');
  await expect(page.getByRole('button', { name: /^Open transaction Transfer:/ })).toHaveCount(1);
});
