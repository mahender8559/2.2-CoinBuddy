import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await expect(page.getByTestId('page-settings')).toBeVisible();
}

async function enterPin(page: Page, digits: string) {
  for (const digit of digits) {
    await page.getByRole('button', { name: `PIN digit ${digit}`, exact: true }).click();
  }
}

test('v3.5 lock screen preserves hashed PIN unlock behavior in a compact responsive surface', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await prepare(page);

  const passcodeSwitch = page.getByRole('switch', { name: /Passcode Authentication/i });
  await expect(passcodeSwitch).toHaveAttribute('aria-checked', 'false');
  await passcodeSwitch.click();

  const setPasscodeDialog = page.getByRole('dialog', { name: 'Set Passcode', exact: true });
  await expect(setPasscodeDialog).toBeVisible();
  for (const digit of ['1', '2', '3', '4']) {
    await setPasscodeDialog.getByRole('button', { name: digit, exact: true }).click();
  }
  await expect(setPasscodeDialog).toHaveCount(0);
  await expect(passcodeSwitch).toHaveAttribute('aria-checked', 'true');

  // Wait for the hashed setting to be persisted by the existing settings effect,
  // then reload to exercise the real locked startup path.
  await page.waitForTimeout(400);
  await page.reload();

  const lockScreen = page.getByTestId('locked-app-screen');
  await expect(lockScreen).toBeVisible();
  await expect(lockScreen.getByRole('heading', { name: 'CoinBuddy is locked', exact: true })).toBeVisible();
  await expect(lockScreen.getByText('Enter your 4-digit PIN', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-lock-screen.png'), fullPage: false });

  const bounds = await lockScreen.locator('section').boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height + 1);

  // Wrong PIN must keep the vault locked and expose a readable error.
  await enterPin(page, '1111');
  await expect(lockScreen.getByRole('alert')).toHaveText('Incorrect PIN. Try again.');
  await expect(lockScreen).toBeVisible();
  await expect(lockScreen.getByLabel('4 of 4 PIN digits entered')).toBeVisible();
  await expect(lockScreen.getByLabel('0 of 4 PIN digits entered')).toBeVisible({ timeout: 1500 });

  // Correct PIN must unlock through the existing verifyPasscode implementation.
  await enterPin(page, '1234');
  await expect(lockScreen).toHaveCount(0);
  await expect(page.getByTestId('page-settings')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
