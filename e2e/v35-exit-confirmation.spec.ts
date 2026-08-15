import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=dashboard');
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
}

test('v3.5 back navigation uses an in-app exit confirmation and still closes money forms first', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  const nativeDialogs: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => {
    nativeDialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await prepare(page);

  // Core money forms retain first priority on Back; no exit prompt should leak
  // through while a form is open.
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click();
  const transactionSheet = page.getByTestId('transaction-form-sheet');
  await expect(transactionSheet).toBeVisible();
  await page.goBack();
  await expect(transactionSheet).toHaveCount(0);
  await expect(page.getByTestId('exit-confirm-sheet')).toHaveCount(0);

  // The next Back reaches the app boundary and now uses the V3.5 sheet instead
  // of browser-native window.confirm.
  await page.goBack();
  const exitSheet = page.getByTestId('exit-confirm-sheet');
  await expect(exitSheet).toBeVisible();
  await expect(exitSheet.getByRole('heading', { name: 'Exit CoinBuddy?', exact: true })).toBeVisible();
  await expect(exitSheet.getByRole('button', { name: 'Stay', exact: true })).toBeVisible();
  await expect(exitSheet.getByRole('button', { name: 'Exit', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-exit-confirmation.png'), fullPage: false });

  const bounds = await exitSheet.boundingBox();
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

  await exitSheet.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(exitSheet).toHaveCount(0);
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  expect(await page.evaluate(() => history.state?.tab)).toBe('dashboard');

  // Repeating Back should show the same in-app confirmation again, proving the
  // Stay action restores the guard rather than disabling exit protection.
  await page.goBack();
  await expect(page.getByTestId('exit-confirm-sheet')).toBeVisible();
  await page.getByTestId('exit-confirm-sheet').getByRole('button', { name: 'Stay', exact: true }).click();

  expect(nativeDialogs, 'No browser-native confirm should be shown').toEqual([]);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
