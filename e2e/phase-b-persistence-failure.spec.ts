import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepareDemo(page: Page) {
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

async function forceDurableStorageFailure(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(IDBObjectStore.prototype, 'put', {
      configurable: true,
      writable: true,
      value: function forcedIndexedDbFailure() {
        throw new Error('Phase B forced IndexedDB failure');
      },
    });

    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: async () => {
        throw new Error('Phase B forced OPFS failure');
      },
    });
  });
}

test('failed durable persistence keeps the transaction form open and reload does not resurrect the unsaved mutation', async ({ page }) => {
  const title = 'Phase B Must Not Save';
  await prepareDemo(page);
  await openAppDestination(page, 'Activity');
  await page.locator('[data-tour-id="tour-add-transaction"]:visible').click();

  const form = page.getByTestId('transaction-form-sheet');
  await expect(form).toBeVisible();
  await form.locator('#transaction-title').fill(title);
  await form.locator('#transaction-amount').fill('777');

  await forceDurableStorageFailure(page);

  let alertMessage = '';
  page.once('dialog', async dialog => {
    alertMessage = dialog.message();
    await dialog.dismiss();
  });

  await form.getByRole('button', { name: 'Save Expense', exact: true }).click();
  await expect(form).toBeVisible();
  await expect(form.getByRole('alert')).toContainText('transaction could not be saved');
  expect(alertMessage).toContain('Your change was not saved');
  await expect(page.getByRole('button', { name: `Open transaction ${title}`, exact: true })).toHaveCount(0);

  await page.reload();
  await openAppDestination(page, 'Activity');
  await expect(page.getByRole('button', { name: `Open transaction ${title}`, exact: true })).toHaveCount(0);
});
