import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepareDemo(page: Page) {
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
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15_000 });
}

test('locked finance form system uses the new responsive amount-first design', async ({ page }) => {
  await prepareDemo(page);

  await openAppDestination(page, 'Activity');
  await page.getByPlaceholder('Search transactions...').fill('Dinner Out');
  await page.getByRole('button', { name: 'Open transaction Dinner Out', exact: true }).click();
  await page.getByTestId('transaction-detail').getByRole('button', { name: 'Edit transaction', exact: true }).click();

  const transaction = page.getByTestId('transaction-form-sheet');
  await expect(transaction).toHaveAttribute('data-v35-form-system', 'locked');
  await expect(transaction.getByRole('heading', { name: 'Edit Transaction', exact: true })).toBeVisible();
  const amount = transaction.getByLabel('Transaction amount');
  await expect(amount).toBeVisible();
  const amountBox = await amount.boundingBox();
  expect(amountBox).not.toBeNull();
  expect(amountBox!.height).toBeGreaterThanOrEqual(64);
  const amountFont = await amount.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(amountFont).toBeGreaterThanOrEqual(36);

  const accountChoices = transaction.locator('input[name="account"]');
  expect(await accountChoices.count()).toBeGreaterThan(0);
  await expect(accountChoices.first()).toBeAttached();
  await expect(transaction.locator('.cb-account-choice').first()).toBeVisible();
  await expect(transaction.locator('.cb-account-choice svg').first()).toBeVisible();
  const category = transaction.getByLabel('Category');
  await expect(category).toBeVisible();
  expect(await category.evaluate(element => element.tagName)).toBe('SELECT');
  await expect(transaction.locator('.cb-finance-control-icon svg').first()).toBeVisible();

  const description = transaction.getByLabel('What was this for?');
  const descriptionPadding = await description.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft));
  expect(descriptionPadding).toBeGreaterThanOrEqual(40);

  const moreOptions = transaction.getByText('More options', { exact: true });
  await expect(moreOptions).toBeVisible();
  await moreOptions.click();
  const notes = transaction.getByLabel('Notes');
  const event = transaction.getByLabel('Event / outing (optional)');
  await expect(notes).toBeVisible();
  await expect(event).toBeVisible();
  expect(await notes.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(40);
  expect(await event.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(40);
  await transaction.getByRole('button', { name: /Back from transaction form/i }).click();

  await openAppDestination(page, 'Accounts');
  await page.getByRole('button', { name: /Add account/i }).click();
  await page.getByRole('button', { name: 'Asset / investment', exact: true }).click();
  const account = page.getByTestId('account-form-sheet');
  await expect(account).toHaveAttribute('data-v35-form-system', 'locked');
  await expect(account.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
  await expect(account.getByRole('button', { name: 'Investment', exact: true })).toBeVisible();
  await expect(account.getByRole('button', { name: 'Liability', exact: true })).toBeVisible();

  await account.getByRole('button', { name: 'Investment', exact: true }).click();
  await expect(account.getByRole('heading', { name: 'Add Investment', exact: true })).toBeVisible();
  await expect(account.getByLabel('Total Invested Amount')).toBeVisible();
  await expect(account.getByLabel('Monthly SIP Amount')).toBeVisible();
  await expect(account.getByLabel('Funding Account')).toBeVisible();
  await expect(account.getByText(/Provider|Platform|Fund Type/i)).toHaveCount(0);

  await account.getByRole('button', { name: 'Liability', exact: true }).click();
  await expect(account.getByRole('heading', { name: 'Add Credit Card', exact: true })).toBeVisible();
  await expect(account.getByLabel('Credit Limit')).toBeVisible();
  await expect(account.getByLabel('Billing Cycle Day')).toBeVisible();
  await account.getByRole('button', { name: /Back from account form/i }).click();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('transfer account cards stay before the action and remain readable', async ({ page }) => {
  await prepareDemo(page);
  await openAppDestination(page, 'Home');
  await page.getByRole('button', { name: /add transaction/i }).first().click();
  await page.getByRole('button', { name: 'Transfer', exact: true }).click();

  const transaction = page.getByTestId('transaction-form-sheet');
  const transferGroups = transaction.locator('.cb-transfer-account-groups');
  const submit = transaction.getByRole('button', { name: 'Transfer Money', exact: true });
  await expect(transferGroups).toBeVisible();
  await expect(submit).toBeVisible();
  expect(await transaction.locator('input[name="fromAccount"]').count()).toBeGreaterThan(0);
  expect(await transaction.locator('input[name="toAccount"]').count()).toBeGreaterThan(0);

  const layout = await transaction.evaluate(element => {
    const form = element.querySelector('.cb-finance-form');
    const groups = element.querySelector('.cb-transfer-account-groups');
    const action = element.querySelector('.cb-finance-submit');
    if (!form || !groups || !action) return null;
    return {
      groupIndex: Array.from(form.children).indexOf(groups),
      actionIndex: Array.from(form.children).indexOf(action),
      groupOrder: Number.parseInt(getComputedStyle(groups).order || '0', 10),
      actionOrder: Number.parseInt(getComputedStyle(action).order || '0', 10),
    };
  });
  expect(layout).not.toBeNull();
  expect(layout!.groupIndex).toBeLessThan(layout!.actionIndex);
  expect(layout!.groupOrder).toBe(0);
  expect(layout!.actionOrder).toBeGreaterThan(layout!.groupOrder);

  const metadata = transaction.locator('.cb-account-choice-meta').first();
  await expect(metadata).toBeVisible();
  expect(await metadata.evaluate(element => getComputedStyle(element).whiteSpace)).toBe('normal');

  const titleInput = transaction.getByLabel('Transfer title (optional)');
  expect(await titleInput.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(40);

  await transaction.getByRole('button', { name: /Back from transaction form/i }).click();
});
