import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { openAppDestination, openWalletSummary } from './helpers/navigation';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  const demo = page.getByRole('button', { name: /Load demo data/i });
  await expect(demo).toBeVisible();
  await demo.click();
  await expect(page.getByText('Load Demo Data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15000 });
}

async function expectInsideViewport(page: Page, sheet: Locator, bottomSheet = true) {
  await expect(sheet).toBeVisible();
  const bounds = await sheet.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height + 1);

  if (viewport!.width < 640 && bottomSheet) {
    expect(Math.abs(bounds!.y + bounds!.height - viewport!.height)).toBeLessThanOrEqual(2);

    const handle = sheet.locator(':scope > .v35-sheet-handle');
    if (await handle.count()) {
      await expect(handle).toBeVisible();
      const handleBox = await handle.boundingBox();
      expect(handleBox).not.toBeNull();
      expect(handleBox!.height).toBeLessThanOrEqual(5);
      expect(handleBox!.width).toBeGreaterThanOrEqual(36);
      expect(handleBox!.width).toBeLessThanOrEqual(44);
    }
  }
}

test('core money forms stay responsive after the locked redesign', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepare(page);

  await openAppDestination(page, 'Activity');

  await page.getByRole('button', { name: 'Add Transaction', exact: true }).first().click();
  const newTransactionSheet = page.getByTestId('transaction-form-sheet');
  await expectInsideViewport(page, newTransactionSheet);
  await expect(newTransactionSheet.getByLabel('Paid From HDFC Salary Account')).toBeVisible();
  await expect(newTransactionSheet.getByText('Car Loan', { exact: true })).toHaveCount(0);
  await newTransactionSheet.getByRole('button', { name: 'Transfer', exact: true }).click();
  await expect(newTransactionSheet.getByText('Car Loan', { exact: true })).toHaveCount(0);
  await newTransactionSheet.getByRole('button', { name: 'Back from transaction form', exact: true }).click();

  await page.getByPlaceholder('Search transactions...').fill('Dinner Out');
  await page.getByRole('button', { name: 'Open transaction Dinner Out', exact: true }).click();
  await page.getByTestId('transaction-detail').getByRole('button', { name: 'Edit transaction', exact: true }).click();
  const transactionSheet = page.getByTestId('transaction-form-sheet');
  await expectInsideViewport(page, transactionSheet);
  await expect(transactionSheet.getByRole('heading', { name: 'Edit Transaction', exact: true })).toBeVisible();
  await expect(transactionSheet.getByLabel('Transaction amount')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('locked-transaction-form.png'), fullPage: false });
  await transactionSheet.getByRole('button', { name: 'Back from transaction form', exact: true }).click();

  await openAppDestination(page, 'Accounts');
  await page.getByRole('button', { name: /Add account/i }).click();
  await page.getByRole('button', { name: 'Asset / investment', exact: true }).click();
  const accountSheet = page.getByTestId('account-form-sheet');
  await expectInsideViewport(page, accountSheet);
  await expect(accountSheet.getByRole('heading', { name: 'Add Account', exact: true })).toBeVisible();
  await expect(accountSheet.getByRole('button', { name: 'Investment', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('locked-account-form.png'), fullPage: false });
  await accountSheet.getByRole('button', { name: 'Back from account form', exact: true }).click();

  await page.getByRole('button', { name: /HDFC Salary Account/ }).click();
  await page.getByRole('button', { name: 'Reconcile', exact: true }).first().click();
  const reconcileSheet = page.getByTestId('reconcile-sheet');
  await expectInsideViewport(page, reconcileSheet);
  await expect(reconcileSheet.getByRole('heading', { name: 'Reconcile Account', exact: true })).toBeVisible();
  await expect(reconcileSheet.getByLabel('Current actual balance')).toBeVisible();
  await expect(reconcileSheet.getByLabel('Upload statement')).toHaveCount(0);
  await reconcileSheet.getByRole('button', { name: 'Review adjustment', exact: true }).click();
  await expect(reconcileSheet.getByText(/Adjustment/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('locked-reconcile-review.png'), fullPage: false });
  await reconcileSheet.getByRole('button', { name: /Close reconcile account/i }).click();

  await page.getByRole('button', { name: /Car Loan/ }).click();
  await page.getByRole('button', { name: 'Pay down', exact: true }).click();
  const paySheet = page.getByTestId('pay-modal');
  await expectInsideViewport(page, paySheet);
  await expect(paySheet.getByLabel('Pay From')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('locked-pay-down.png'), fullPage: false });
  await paySheet.getByText('Loan payment details', { exact: true }).click();
  await paySheet.getByRole('button', { name: 'Update Floating Interest Rate', exact: true }).click();
  const rateSheet = page.getByTestId('loan-rate-sheet');
  await expectInsideViewport(page, rateSheet);
  await expect(rateSheet.getByRole('heading', { name: 'Update Loan Rate', exact: true })).toBeVisible();
  await rateSheet.locator('input[type="number"]').first().fill('9');
  await expect(rateSheet.getByText('Adjustment strategy', { exact: true })).toBeVisible();
  await rateSheet.getByRole('button', { name: 'Close loan rate update', exact: true }).click();
  await paySheet.getByRole('button', { name: 'Close payment', exact: true }).click();

  await openWalletSummary(page);
  const walletSheet = page.getByTestId('wallet-summary-sheet');
  await expectInsideViewport(page, walletSheet, false);
  await expect(walletSheet.getByRole('heading', { name: 'Wallet Summary', exact: true })).toBeVisible();
  await expect(walletSheet.getByText('Total Assets', { exact: true })).toBeVisible();
  await expect(walletSheet.getByText('Total Liabilities', { exact: true })).toBeVisible();
  await expect(walletSheet.getByText('Net Position', { exact: true })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 640) {
    const bounds = await walletSheet.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(bounds!.y).toBeGreaterThan(8);
    expect(bounds!.y + bounds!.height).toBeLessThan(viewport!.height - 8);
  }
  await walletSheet.getByRole('button', { name: 'Close wallet summary', exact: true }).click();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});