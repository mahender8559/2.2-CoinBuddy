import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

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

async function openDestination(page: Page, destination: 'Activity' | 'Accounts') {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: destination, exact: true }).click();
    return;
  }
  if (destination === 'Activity') {
    await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Activity', exact: true }).click();
    return;
  }
  await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: destination, exact: true }).click();
}

async function expectInsideViewport(page: Page, sheet: Locator) {
  await expect(sheet).toBeVisible();
  const bounds = await sheet.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height + 1);
  if (viewport!.width < 768) {
    expect(Math.abs(bounds!.y + bounds!.height - viewport!.height)).toBeLessThanOrEqual(2);
  }
}

async function openWallet(page: Page) {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('app-header').getByRole('button', { name: 'Wallet Summary', exact: true }).click();
    return;
  }
  await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: 'Wallet Summary', exact: true }).click();
}

test('v3.5 uses one responsive sheet system for core money forms', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepare(page);

  // Transaction form: reach the same component through an existing expense so
  // both desktop and mobile exercise the real edit flow without changing data.
  await openDestination(page, 'Activity');
  const search = page.getByPlaceholder('Search transactions...');
  await search.fill('Dinner Out');
  await page.getByRole('button', { name: 'Open transaction Dinner Out', exact: true }).click();
  const detail = page.getByTestId('transaction-detail');
  await detail.getByRole('button', { name: 'Edit transaction', exact: true }).click();
  const transactionSheet = page.getByTestId('transaction-form-sheet');
  await expectInsideViewport(page, transactionSheet);
  await expect(transactionSheet.getByRole('heading', { name: 'Edit Transaction', exact: true })).toBeVisible();
  await expect(transactionSheet.getByLabel('Transaction amount')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-transaction-form.png'), fullPage: false });
  await transactionSheet.getByRole('button', { name: 'Close transaction form', exact: true }).click();

  // Account creation form.
  await openDestination(page, 'Accounts');
  await page.getByRole('button', { name: /Add account/i }).click();
  await page.getByRole('button', { name: 'Asset / investment', exact: true }).click();
  const accountSheet = page.getByTestId('account-form-sheet');
  await expectInsideViewport(page, accountSheet);
  await expect(accountSheet.getByRole('heading', { name: 'Add Account', exact: true })).toBeVisible();
  await expect(accountSheet.getByText('Account Type', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-account-form.png'), fullPage: false });
  await accountSheet.getByRole('button', { name: 'Close account form', exact: true }).click();

  // Reconciliation now mirrors the approved Upload → Match → Review flow while
  // retaining the same balance-adjustment guardrails in the Match step.
  await page.getByRole('button', { name: /HDFC Salary Account/ }).click();
  await page.getByRole('button', { name: 'Reconcile', exact: true }).first().click();
  const reconcileSheet = page.getByTestId('reconcile-sheet');
  await expectInsideViewport(page, reconcileSheet);
  await expect(reconcileSheet.getByRole('heading', { name: 'Reconcile Account', exact: true })).toBeVisible();
  await expect(reconcileSheet.getByLabel('Upload statement')).toBeAttached();
  await reconcileSheet.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(reconcileSheet.getByLabel('Current actual balance')).toBeVisible();
  await reconcileSheet.getByRole('button', { name: 'Close reconciliation', exact: true }).click();

  // Pay Down + floating-rate revision stay financially unchanged but now share
  // the same compact reference hierarchy.
  await page.getByRole('button', { name: /Car Loan/ }).click();
  await page.getByRole('button', { name: 'Pay down', exact: true }).click();
  const paySheet = page.getByTestId('pay-modal');
  await expectInsideViewport(page, paySheet);
  await expect(paySheet.getByLabel('Pay From')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-pay-down.png'), fullPage: false });
  await paySheet.getByRole('button', { name: 'Update Floating Interest Rate', exact: true }).click();
  const rateSheet = page.getByTestId('loan-rate-sheet');
  await expectInsideViewport(page, rateSheet);
  await expect(rateSheet.getByRole('heading', { name: 'Update Loan Rate', exact: true })).toBeVisible();
  await rateSheet.locator('input[type="number"]').first().fill('9');
  await expect(rateSheet.getByText('Adjustment strategy', { exact: true })).toBeVisible();
  await rateSheet.getByRole('button', { name: 'Close loan rate update', exact: true }).click();
  await paySheet.getByRole('button', { name: 'Close payment', exact: true }).click();

  // Wallet Summary matches the same bottom-sheet/desktop-dialog geometry.
  await openWallet(page);
  const walletSheet = page.getByTestId('wallet-summary-sheet');
  await expectInsideViewport(page, walletSheet);
  await expect(walletSheet.getByRole('heading', { name: 'Wallet Summary', exact: true })).toBeVisible();
  await expect(walletSheet.getByText('Cash Wallet', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-wallet-summary.png'), fullPage: false });
  await walletSheet.getByRole('button', { name: 'Close wallet summary', exact: true }).click();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
