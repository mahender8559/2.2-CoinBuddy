import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepareDemo(page: Page) {
  // Undo/Redo controls live in the desktop header. Use the same wide layout in
  // every project so the persistence behavior is exercised once per browser
  // configuration instead of being coupled to responsive navigation.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  const demo = page.getByRole('button', { name: /Load demo data/i });
  await expect(demo).toBeVisible();
  await demo.click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function localDateKey(page: Page) {
  return page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
}

async function createPendingRecurringExpense(page: Page, title: string) {
  await openAppDestination(page, 'Activity');
  await expect(page.getByTestId('page-activity')).toBeVisible();

  await page.locator('[data-tour-id="tour-add-transaction"]:visible').click();
  await expect(page.getByTestId('transaction-form-sheet')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Transaction', exact: true })).toBeVisible();

  await page.locator('#transaction-title').fill(title);
  await page.locator('#transaction-amount').fill('500');
  await page.locator('#transaction-date').fill(await localDateKey(page));

  // Recurrence is intentionally tucked into the collapsed More options section.
  // Open that section before interacting with its accessible toggle button.
  const moreOptions = page.getByText('More options', { exact: true });
  await expect(moreOptions).toBeVisible();
  await moreOptions.click();
  const recurringToggle = page.getByRole('button', { name: 'Toggle recurring transaction' });
  await expect(recurringToggle).toBeVisible();
  await recurringToggle.click();

  await page.getByRole('button', { name: 'Save Expense' }).click();
  await expect(page.getByTestId('transaction-form-sheet')).not.toBeVisible();
}

async function openPendingPanel(page: Page) {
  const toggle = page.getByRole('button', { name: /Needs confirmation/ });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page.locator('#pending-confirmations');
}

async function pendingRow(page: Page, title: string) {
  const panel = await openPendingPanel(page);
  const titleText = panel.getByText(new RegExp(title));
  await expect(titleText).toBeVisible();
  return titleText.locator('..');
}

async function rejectPending(page: Page, title: string) {
  const row = await pendingRow(page, title);
  await row.getByRole('button', { name: 'Skip', exact: true }).click();
  const toast = page.getByRole('status');
  await expect(toast).toContainText('Transaction deleted');
  return toast;
}

test('Undo restoration survives a reload', async ({ page }) => {
  const marker = 'Undo Persistence Check';
  await prepareDemo(page);
  await createPendingRecurringExpense(page, marker);

  const toast = await rejectPending(page, marker);
  await toast.getByRole('button', { name: /^Undo/ }).click();
  await expect(toast).not.toBeVisible();
  await expect((await pendingRow(page, marker))).toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Activity');
  await expect((await pendingRow(page, marker))).toBeVisible();
});

test('Redo deletion survives a reload', async ({ page }) => {
  const marker = 'Redo Persistence Check';
  await prepareDemo(page);
  await createPendingRecurringExpense(page, marker);

  const toast = await rejectPending(page, marker);
  await toast.getByRole('button', { name: /^Undo/ }).click();
  await expect((await pendingRow(page, marker))).toBeVisible();

  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByText(new RegExp(marker))).not.toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Activity');
  await expect(page.getByText(new RegExp(marker))).not.toBeVisible();
});
