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

async function openTab(page: Page, name: string) {
  const desktopButton = page.getByTitle(name);
  const mobileButton = page.getByRole('button', { name, exact: true });
  if (await desktopButton.isVisible()) await desktopButton.click();
  else await mobileButton.click();
}

async function waitForActivatedServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker?.ready;
    return registration?.active?.state === 'activated' && navigator.serviceWorker.controller !== null;
  });
}

test('primary navigation buttons work without runtime errors', async ({ page }) => {
  const errors = await prepareApp(page);

  for (const tab of ['Manage', 'Activity', 'Insights', 'Settings', 'Dashboard']) {
    await openTab(page, tab);
    await expect(page).toHaveURL(new RegExp(`tab=${tab.toLowerCase()}`));
  }

  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Pay Down opens a usable Pay From dropdown', async ({ page }) => {
  const errors = await prepareApp(page);
  await openTab(page, 'Manage');

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
  const tabs = ['Dashboard', 'Manage', 'Activity', 'Insights', 'Settings'];

  for (const tab of tabs) {
    await openTab(page, tab);
    const unnamed = await page.locator('button:visible').evaluateAll(buttons =>
      buttons
        .filter(button => {
          const name = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent;
          return !name?.trim();
        })
        .map(button => button.outerHTML.slice(0, 180)),
    );
    expect(unnamed, `Unnamed buttons on ${tab}`).toEqual([]);
  }

  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('first tour spotlight and description match the add transaction button', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.removeItem('hasCompletedButtonTour');
    localStorage.setItem('coinbuddy_backup_config', JSON.stringify({ hasPassword: true, backupPassword: 'test-password' }));
  });
  await page.goto('/');

  const target = page.locator('[data-tour-id="tour-add-transaction"]');
  const tooltip = page.getByRole('heading', { name: 'Add Transaction' }).locator('xpath=../../..');
  const spotlight = page.locator('div[style*="box-shadow"]').first();

  await expect(target).toBeVisible();
  await expect(tooltip).toContainText('quickly log income, expenses, or transfers');
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

test('first-use setup runs walkthrough, password step, then spotlight tour once', async ({ page }) => {
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

  await expect(page.getByRole('heading', { name: 'Set Backup Password' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip For Now' }).click();
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
