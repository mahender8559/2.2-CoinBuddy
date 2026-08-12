import { expect, test, type Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const desktopButton = page.getByTitle(name);
  const mobileButton = page.getByRole('button', { name, exact: true });
  if (await desktopButton.isVisible()) await desktopButton.click();
  else await mobileButton.click();
}

async function prepare(page: Page, clean = false) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ clean }) => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
    if (clean) localStorage.setItem('coinbuddy_skip_demo_seed', 'true');
  }, { clean });
  await page.goto('/');
  await expect(page.getByText('Net Worth', { exact: true }).first()).toBeVisible();
  return errors;
}

async function assertNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('clean-ledger affordability setup survives reload and does not silently demo-seed', async ({ page }) => {
  const errors = await prepare(page, true);
  await openTab(page, 'Insights');

  await expect(page.getByText('Can I Afford It?', { exact: true })).toBeVisible();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  await expect(page.getByText('Not affordable safely', { exact: true })).toBeVisible();
  await expect(page.getByText(/history is unavailable/i)).toBeVisible();

  await page.getByRole('button', { name: 'Safety preferences' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Monthly savings target').fill('10000');
  await page.getByLabel('Protected cash reserve').fill('20000');
  await page.getByRole('button', { name: 'Use fixed amount' }).click();
  await page.getByLabel('Fixed contingency amount').fill('5000');
  await page.getByRole('button', { name: 'Save safety preferences' }).click();
  await expect(page.getByText('Affordability safety preferences saved')).toBeVisible();

  await page.reload();
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Safety preferences' }).click();
  await expect(page.getByLabel('Monthly savings target')).toHaveValue('10000');
  await expect(page.getByLabel('Protected cash reserve')).toHaveValue('20000');
  await expect(page.getByLabel('Fixed contingency amount')).toHaveValue('5000');
  await page.getByRole('button', { name: 'Close safety preferences' }).click();

  await page.getByRole('button', { name: 'Review categories' }).click();
  await expect(page.getByText('No expense categories are available yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Close category review' }).click();
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('category financial behavior can be changed and persists after reload', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Review categories' }).click();

  const groceries = page.getByLabel('Groceries affordability behavior');
  await expect(groceries).toBeVisible();
  await groceries.selectOption('IRREGULAR');
  await expect(groceries).toHaveValue('IRREGULAR');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(500);

  await page.reload();
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Review categories' }).click();
  await expect(page.getByLabel('Groceries affordability behavior')).toHaveValue('IRREGULAR');
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
