import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
});

test('v3.5 secondary dialogs use the shared responsive sheet system', async ({ page }, testInfo: TestInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('/?tab=settings');
  await expect(page.getByTestId('page-settings')).toBeVisible();

  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  const profileSheet = page.getByTestId('profile-edit-sheet');
  await expectInsideViewport(page, profileSheet);
  await expect(profileSheet.getByRole('heading', { name: 'Edit Profile', exact: true })).toBeVisible();
  await expect(profileSheet.getByRole('button', { name: 'Change profile photo', exact: true })).toBeVisible();
  await profileSheet.getByLabel('Full Name').fill('V3.5 Test User');
  await page.screenshot({ path: testInfo.outputPath('v35-profile-sheet.png'), fullPage: false });
  await profileSheet.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(profileSheet).toHaveCount(0);
  await expect(page.getByText('V3.5 Test User', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Feature Walkthrough & Tour/i }).click();
  const onboardingSheet = page.getByTestId('onboarding-sheet');
  await expectInsideViewport(page, onboardingSheet);
  await expect(onboardingSheet.getByRole('heading', { name: 'Welcome to CoinBuddy', exact: true })).toBeVisible();
  await expect(onboardingSheet.getByText('Step 1 of 5', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-onboarding-sheet.png'), fullPage: false });
  for (let step = 0; step < 4; step += 1) {
    await onboardingSheet.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(onboardingSheet.getByRole('heading', { name: 'Encrypted Backups & Security', exact: true })).toBeVisible();
  await onboardingSheet.getByRole('button', { name: 'Get Started', exact: true }).click();
  await expect(onboardingSheet).toHaveCount(0);

  await page.goto('/?tab=dashboard');
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Add Widget', exact: true }).click();
  const widgetSheet = page.getByTestId('widget-config-sheet');
  await expectInsideViewport(page, widgetSheet);
  await expect(widgetSheet.getByRole('heading', { name: 'Add Widget', exact: true })).toBeVisible();
  await expect(widgetSheet.getByRole('button', { name: 'Category Spending', exact: true })).toBeVisible();
  await widgetSheet.getByRole('button', { name: 'Category Spending', exact: true }).click();
  await expect(widgetSheet.getByRole('heading', { name: 'Select Category', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('v35-widget-sheet.png'), fullPage: false });
  await widgetSheet.getByRole('button', { name: 'Close widget configuration', exact: true }).click();
  await expect(widgetSheet).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
