import { expect, test, type Page } from '@playwright/test';

async function prepareApp(page: Page) {
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/');
  await expect(page.getByText('Net Worth', { exact: true }).first()).toBeVisible();
  return runtimeErrors;
}

async function openDestination(page: Page, destination: 'Home' | 'Accounts' | 'Activity' | 'Insights' | 'Settings') {
  const desktopSidebar = page.getByTestId('desktop-sidebar');
  if (await desktopSidebar.isVisible()) {
    await desktopSidebar.getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  if (destination === 'Home' || destination === 'Activity') {
    await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: destination, exact: true }).click();
}

async function waitForActivatedServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker?.ready;
    return registration?.active?.state === 'activated' && navigator.serviceWorker.controller !== null;
  });
}

test('primary navigation buttons work without runtime errors', async ({ page }) => {
  const errors = await prepareApp(page);

  await openDestination(page, 'Accounts');
  await expect(page).toHaveURL(/tab=manage/);
  await openDestination(page, 'Activity');
  await expect(page).toHaveURL(/tab=activity/);
  await openDestination(page, 'Insights');
  await expect(page).toHaveURL(/tab=insights/);
  await openDestination(page, 'Settings');
  await expect(page).toHaveURL(/tab=settings/);
  await openDestination(page, 'Home');
  await expect(page).toHaveURL(/tab=dashboard/);

  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Pay Down opens a usable Pay From dropdown', async ({ page }) => {
  const errors = await prepareApp(page);
  await openDestination(page, 'Accounts');

  const payDown = page.getByRole('button', { name: 'Pay Down' }).first();
  await expect(payDown).toBeVisible();
  await payDown.click();

  const modal = page.getByTestId('pay-modal');
  const source = page.getByTestId('pay-from-select');
  await expect(modal).toBeVisible();
  await expect(source).toBeVisible();
  await expect(source).toBeEnabled();
  expect(await source.locator('option:not([disabled])').count()).toBeGreaterThan(0);

  const availableValues = await source.locator('option:not([disabled])').evaluateAll(options =>
    options.map(option => (option as HTMLOptionElement).value),
  );
  await source.selectOption(availableValues.at(-1)!);
  await expect(source).toHaveValue(availableValues.at(-1)!);
  await expect(page.getByTestId('confirm-payment')).toBeEnabled();

  const bounds = await modal.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('interactive buttons expose an accessible name', async ({ page }) => {
  const errors = await prepareApp(page);
  const destinations: Array<'Home' | 'Accounts' | 'Activity' | 'Insights' | 'Settings'> = ['Home', 'Accounts', 'Activity', 'Insights', 'Settings'];

  for (const destination of destinations) {
    await openDestination(page, destination);
    const unnamed = await page.locator('button:visible').evaluateAll(buttons =>
      buttons
        .filter(button => {
          const name = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent;
          return !name?.trim();
        })
        .map(button => button.outerHTML.slice(0, 180)),
    );
    expect(unnamed, `Unnamed buttons on ${destination}`).toEqual([]);
  }

  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('first tour spotlight and description match the visible add transaction button', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.removeItem('hasCompletedButtonTour');
    localStorage.setItem('coinbuddy_backup_config', JSON.stringify({ hasPassword: true, backupPassword: 'test-password' }));
  });
  await page.goto('/');

  const target = page.locator('[data-tour-id="tour-add-transaction"]:visible').first();
  const tooltip = page.getByRole('heading', { name: 'Add Transaction' }).locator('xpath=../../..');
  const spotlight = page.locator('div[style*="box-shadow"]').first();

  await expect(target).toBeVisible();
  await expect(tooltip).toContainText('Dashboard, Activity, or Insights to log income, expenses, or transfers');
  await expect(spotlight).toBeVisible();
  await page.waitForTimeout(900);

  const [targetBounds, tooltipBounds, spotlightBounds, viewport] = await Promise.all([
    target.boundingBox(),
    tooltip.boundingBox(),
    spotlight.boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ]);

  expect(targetBounds).not.toBeNull();
  expect(tooltipBounds).not.toBeNull();
  expect(spotlightBounds).not.toBeNull();
  expect(spotlightBounds!.x).toBeCloseTo(targetBounds!.x - 8, 0);
  expect(spotlightBounds!.y).toBeCloseTo(targetBounds!.y - 8, 0);
  expect(spotlightBounds!.width).toBeCloseTo(targetBounds!.width + 16, 0);
  expect(spotlightBounds!.height).toBeCloseTo(targetBounds!.height + 16, 0);
  expect(tooltipBounds!.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBounds!.y).toBeGreaterThanOrEqual(0);
  expect(tooltipBounds!.x + tooltipBounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(tooltipBounds!.y + tooltipBounds!.height).toBeLessThanOrEqual(viewport.height + 1);
});

test('first-use setup runs walkthrough then spotlight tour once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('coinbuddy_onboarding_seen');
    localStorage.removeItem('hasCompletedButtonTour');
    localStorage.removeItem('coinbuddy_backup_config');
  });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Welcome to CoinBuddy' })).toBeVisible();
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('button', { name: 'Get Started' }).click();

  await expect(page.getByRole('heading', { name: 'Add Transaction' })).toBeVisible();

  await page.getByRole('button', { name: 'Skip Tour' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to CoinBuddy' })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Transaction' })).not.toBeVisible();
});

test('cached app shell remains usable offline after an initial load', async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/');
  await expect(page.getByText('Net Worth', { exact: true })).toBeVisible();
  await waitForActivatedServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Net Worth', { exact: true })).toBeVisible();
  await context.setOffline(false);
});
