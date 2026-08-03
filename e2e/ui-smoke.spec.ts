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
  await expect(page.getByText('Total Balance', { exact: false }).first()).toBeVisible();
  return runtimeErrors;
}

async function openTab(page: Page, name: string) {
  const desktopButton = page.getByTitle(name);
  const mobileButton = page.getByRole('button', { name, exact: true });
  if (await desktopButton.isVisible()) await desktopButton.click();
  else await mobileButton.click();
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
