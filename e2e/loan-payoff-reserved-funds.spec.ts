import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await page.getByRole('button', { name: /Load demo data/i }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15000 });
}

test('loan payoff plan reserves tracked cash and protects it from normal spending', async ({ page }) => {
  await prepare(page);
  await openAppDestination(page, 'Accounts');
  await page.getByRole('button', { name: /Car Loan/ }).click();
  await page.getByRole('button', { name: 'Payoff plan', exact: true }).click();
  const sheet = page.getByTestId('loan-payoff-plan-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Payoff target amount').fill('10000');
  const selfTarget = sheet.getByLabel(/Me.*payoff target/i);
  await selfTarget.fill('10000');
  await sheet.getByRole('button', { name: 'Create payoff plan', exact: true }).click();
  await expect(sheet.getByText('Reserved funds', { exact: true })).toBeVisible();
  await sheet.getByLabel('Reserve amount').fill('5000');
  await sheet.getByRole('button', { name: 'Reserve funds', exact: true }).click();
  await expect(sheet.getByText(/5,000/).first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Close loan payoff plan' }).click();

  await page.getByRole('button', { name: 'HDFC Salary Account' }).click();
  await expect(page.getByText(/reserved/)).toBeVisible();
});

test('pay down can consume funds reserved for the matching loan', async ({ page }) => {
  await prepare(page);
  await openAppDestination(page, 'Accounts');
  await page.getByRole('button', { name: /Car Loan/ }).click();
  await page.getByRole('button', { name: 'Payoff plan', exact: true }).click();
  const plan = page.getByTestId('loan-payoff-plan-sheet');
  await plan.getByLabel('Payoff target amount').fill('5000');
  await plan.getByLabel(/Me.*payoff target/i).fill('5000');
  await plan.getByRole('button', { name: 'Create payoff plan', exact: true }).click();
  await plan.getByLabel('Reserve amount').fill('5000');
  await plan.getByRole('button', { name: 'Reserve funds', exact: true }).click();
  await plan.getByRole('button', { name: 'Close loan payoff plan' }).click();
  await page.getByRole('button', { name: 'Pay down', exact: true }).click();
  const pay = page.getByTestId('pay-modal');
  await expect(pay.getByText('Use reserved payoff funds')).toBeVisible();
});
