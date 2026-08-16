import { expect, test, type Locator, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

const LOAN_NAME = 'Car Loan';
const SOURCE_NAME = 'HDFC Salary Account';
const PRINCIPAL_TITLE = `Transfer: ${SOURCE_NAME} to ${LOAN_NAME}`;
const INTEREST_TITLE = `Interest Payment: ${LOAN_NAME}`;

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
  const demoReload = page.waitForEvent('load', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await demoReload;
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15_000 });
}

function accountToggle(page: Page, accountName: string): Locator {
  return page
    .getByTestId('page-accounts')
    .getByText(accountName, { exact: true })
    .locator('xpath=ancestor::button[1]');
}

async function expandAccount(page: Page, accountName: string): Promise<Locator> {
  const toggle = accountToggle(page, accountName);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return toggle.locator('xpath=..');
}

async function openLoanPayment(page: Page) {
  await openAppDestination(page, 'Accounts');
  const container = await expandAccount(page, LOAN_NAME);
  const payDown = container.getByRole('button', { name: 'Pay down', exact: true });
  await expect(payDown).toBeVisible();
  await payDown.click();

  const modal = page.getByTestId('pay-modal');
  await expect(modal).toBeVisible();
  const source = page.getByTestId('pay-from-select');
  await source.selectOption({ label: SOURCE_NAME });
  await expect(source).toHaveValue('acc_sbi_01');
  await expect(page.getByTestId('confirm-payment')).toBeEnabled();
  return modal;
}

function activityRow(page: Page, title: string) {
  return page.getByRole('button', { name: `Open transaction ${title}`, exact: true });
}

async function expectPaymentRows(page: Page, expectedCount: number) {
  await expect(activityRow(page, PRINCIPAL_TITLE)).toHaveCount(expectedCount);
  await expect(activityRow(page, INTEREST_TITLE)).toHaveCount(expectedCount);
}

async function forceDurableStorageFailure(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(IDBObjectStore.prototype, 'put', {
      configurable: true,
      writable: true,
      value: function forcedIndexedDbFailure() {
        throw new Error('Phase D forced IndexedDB failure');
      },
    });

    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: async () => {
        throw new Error('Phase D forced OPFS failure');
      },
    });
  });
}

test('loan principal and interest stay together through Undo, Redo and reload', async ({ page }) => {
  await prepareDemo(page);
  const modal = await openLoanPayment(page);

  await page.getByTestId('confirm-payment').click();
  await expect(modal.getByRole('heading', { name: 'Payment completed', exact: true })).toBeVisible();
  await expect(modal).not.toBeVisible({ timeout: 10_000 });

  await openAppDestination(page, 'Activity');
  await expectPaymentRows(page, 1);

  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expectPaymentRows(page, 0);

  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expectPaymentRows(page, 1);

  await page.reload();
  await openAppDestination(page, 'Activity');
  await expectPaymentRows(page, 1);
});

test('failed durable loan payment leaves neither principal nor interest leg behind', async ({ page }) => {
  await prepareDemo(page);
  const modal = await openLoanPayment(page);
  await forceDurableStorageFailure(page);

  let persistenceAlert = '';
  page.once('dialog', async dialog => {
    persistenceAlert = dialog.message();
    await dialog.dismiss();
  });

  await page.getByTestId('confirm-payment').click();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('alert')).toContainText(/liability payment could not be saved/i);
  expect(persistenceAlert).toContain('Your change was not saved');

  await modal.getByRole('button', { name: 'Close payment', exact: true }).click();
  await openAppDestination(page, 'Activity');
  await expectPaymentRows(page, 0);

  await page.reload();
  await openAppDestination(page, 'Activity');
  await expectPaymentRows(page, 0);
});