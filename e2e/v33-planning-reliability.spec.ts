import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepare(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { localStorage.setItem('coinbuddy_onboarding_seen', 'true'); localStorage.setItem('hasCompletedButtonTour', 'true'); });
  await page.goto('/');
  await expect(page.getByText('Net Worth', { exact: true }).first()).toBeVisible();
  return errors;
}

test('v3.3 shows Upcoming Money and expandable affordability sources', async ({ page }) => {
  const errors = await prepare(page);
  await openAppDestination(page, 'Insights');
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await expect(page.getByText('Upcoming Money', { exact: true })).toBeVisible();
  await expect(page.getByText('Projected free cash', { exact: true })).toBeVisible();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  await page.getByRole('button', { name: /How did we calculate this/i }).click();
  await page.getByRole('button', { name: /Expected income/i }).click();
  await expect(page.getByText(/Salary|No separate scheduled source|Expected income/i).first()).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('v3.3 Goal-linked transaction advances unlinked Goal after confirmation', async ({ page }) => {
  const errors = await prepare(page);
  await openAppDestination(page, 'Goals');
  await page.getByRole('button', { name: 'Add goal', exact: true }).click();
  const goalDialog = page.getByRole('dialog', { name: 'Add Goal', exact: true });
  await goalDialog.locator('#goal-name').fill('V33 Goal');
  await goalDialog.getByLabel('Target Amount').fill('10000');
  await goalDialog.getByRole('button', { name: 'Create Goal', exact: true }).click();
  await expect(page.getByText('V33 Goal', { exact: true })).toBeVisible();

  await openAppDestination(page, 'Home');
  await page.getByRole('button', { name: /add transaction/i }).first().click();
  const transaction = page.getByTestId('transaction-form-sheet');
  await transaction.getByRole('button', { name: 'Transfer', exact: true }).click();
  await transaction.getByLabel('Transaction amount').fill('1000');
  await transaction.getByText('More options', { exact: true }).click();
  await transaction.getByLabel('Goal contribution').selectOption({ label: 'V33 Goal' });

  const sourceAccount = transaction.locator('input[name="fromAccount"]').first();
  await expect(sourceAccount).toBeAttached({ timeout: 15_000 });
  await sourceAccount.check({ force: true });
  const sourceId = await sourceAccount.getAttribute('value');

  const destinationAccount = transaction.locator('input[name="toAccount"]').first();
  await expect(destinationAccount).toBeAttached({ timeout: 15_000 });
  await destinationAccount.check({ force: true });
  const destinationId = await destinationAccount.getAttribute('value');
  expect(sourceId).toBeTruthy();
  expect(destinationId).toBeTruthy();
  expect(destinationId).not.toBe(sourceId);

  await transaction.getByRole('button', { name: 'Transfer Money', exact: true }).click();

  await openAppDestination(page, 'Goals');
  await expect(page.getByRole('article', { name: 'Goal V33 Goal' })).toContainText(/1,000/);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('v3.3 recurring status filters and backup reliability status are visible', async ({ page }) => {
  const errors = await prepare(page);
  await openAppDestination(page, 'Settings');
  await expect(page.getByRole('button', { name: /Upcoming ·/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Needs confirmation ·/ })).toBeVisible();
  await page.getByRole('button', { name: /Backup & Security/i }).click();
  await expect(page.getByText('Next scheduled:', { exact: true })).toBeVisible();
  await expect(page.getByText('Destination:', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified:', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});