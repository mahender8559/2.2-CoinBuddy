import { expect, test, type Locator, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepareDemo(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  const demo = page.getByRole('button', { name: /Load demo data/i });
  await expect(demo).toBeVisible();
  await demo.click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function localDateKey(page: Page, offsetDays = 0) {
  return page.evaluate(offset => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }, offsetDays);
}

async function expectCurrencyInputValue(input: Locator, expected: number) {
  await expect.poll(async () => {
    const raw = await input.inputValue();
    return Number(raw.replace(/,/g, ''));
  }).toBe(expected);
}

async function replaceCurrencyInputValue(input: Locator, value: string) {
  // CurrencyInput is controlled and re-formats on focus. Empty it first so
  // Playwright does not race that focus render and append to the previous value.
  await input.fill('');
  await expect(input).toHaveValue('');
  await input.fill(value);
}

async function openTransactionForm(page: Page) {
  await openAppDestination(page, 'Activity');
  await expect(page.getByTestId('page-activity')).toBeVisible();
  await page.locator('[data-tour-id="tour-add-transaction"]:visible').click();
  const form = page.getByTestId('transaction-form-sheet');
  await expect(form).toBeVisible();
  return form;
}

async function createExpense(page: Page, title: string, amount: string, eventName?: string) {
  const form = await openTransactionForm(page);
  await form.locator('#transaction-title').fill(title);
  await form.locator('#transaction-amount').fill(amount);
  if (eventName) {
    await form.getByText('More options', { exact: true }).click();
    await form.locator('#transaction-event').fill(eventName);
  }
  await form.getByRole('button', { name: 'Save Expense', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole('button', { name: `Open transaction ${title}`, exact: true })).toBeVisible();
}

async function createIncome(page: Page, title: string, amount: string, accountName: string) {
  const form = await openTransactionForm(page);
  await form.getByRole('button', { name: 'Income', exact: true }).click();
  await form.locator('#transaction-title').fill(title);
  await form.locator('#transaction-amount').fill(amount);
  await form.getByRole('radio', { name: `Paid To ${accountName}`, exact: true }).check({ force: true });
  await form.getByRole('button', { name: 'Save Income', exact: true }).click();
  await expect(form).not.toBeVisible();
}

function accountToggle(page: Page, accountName: string): Locator {
  return page
    .getByTestId('page-accounts')
    .getByText(accountName, { exact: true })
    .locator('xpath=ancestor::button[1]');
}

async function expandAccount(page: Page, accountName: string): Promise<Locator> {
  const toggle = accountToggle(page, accountName);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return toggle.locator('xpath=..');
}

async function addBasicAccount(page: Page, name: string, openingBalance = '0') {
  await openAppDestination(page, 'Accounts');
  await expect(page.getByTestId('page-accounts')).toBeVisible();
  await page.locator('[data-tour-id="tour-add-account"]').click();
  await page.getByRole('button', { name: 'Asset / investment', exact: true }).click();
  const form = page.getByTestId('account-form-sheet');
  await expect(form).toBeVisible();
  await form.locator('#account-name').fill(name);
  await form.locator('#opening-balance').fill(openingBalance);
  await form.getByRole('button', { name: 'Create Account', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(accountToggle(page, name)).toBeVisible();
}

test('transaction create, event, update and delete all survive reloads', async ({ page }) => {
  const originalTitle = 'Phase B Durable Expense';
  const updatedTitle = 'Phase B Durable Expense Edited';
  const eventName = 'Phase B Durable Event';

  await prepareDemo(page);
  await createExpense(page, originalTitle, '321', eventName);

  await page.reload();
  await openAppDestination(page, 'Activity');
  const createdRow = page.getByRole('button', { name: `Open transaction ${originalTitle}`, exact: true });
  await expect(createdRow).toBeVisible();
  await createdRow.click();
  const detail = page.getByTestId('transaction-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(eventName);

  await detail.getByRole('button', { name: 'Edit transaction', exact: true }).click();
  const form = page.getByTestId('transaction-form-sheet');
  await expect(form).toBeVisible();
  await form.locator('#transaction-title').fill(updatedTitle);
  await form.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(form).not.toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Activity');
  await expect(page.getByRole('button', { name: `Open transaction ${originalTitle}`, exact: true })).toHaveCount(0);
  const updatedRow = page.getByRole('button', { name: `Open transaction ${updatedTitle}`, exact: true });
  await expect(updatedRow).toBeVisible();

  await updatedRow.hover();
  await updatedRow.locator('button[title="Delete Transaction"]').click();
  await expect(page.getByRole('button', { name: `Open transaction ${updatedTitle}`, exact: true })).toHaveCount(0);

  await page.reload();
  await openAppDestination(page, 'Activity');
  await expect(page.getByRole('button', { name: `Open transaction ${updatedTitle}`, exact: true })).toHaveCount(0);
});

test('editing a zero-opening-balance account does not turn later income into an opening balance', async ({ page }) => {
  const accountName = 'Phase B Zero Start';
  const editedName = 'Phase B Zero Start Renamed';

  await prepareDemo(page);
  await addBasicAccount(page, accountName, '0');
  await createIncome(page, 'Phase B Later Income', '1234', accountName);

  await page.reload();
  await openAppDestination(page, 'Accounts');
  let container = await expandAccount(page, accountName);
  await expect(accountToggle(page, accountName)).toContainText('₹1,234.00');
  await container.getByRole('button', { name: 'Edit', exact: true }).click();

  const form = page.getByTestId('account-form-sheet');
  await expect(form).toBeVisible();
  await expectCurrencyInputValue(form.locator('#opening-balance'), 0);
  await form.locator('#account-name').fill(editedName);
  await form.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(form).not.toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Accounts');
  await expect(accountToggle(page, accountName)).toHaveCount(0);
  await expect(accountToggle(page, editedName)).toContainText('₹1,234.00');

  container = await expandAccount(page, editedName);
  await container.getByRole('button', { name: 'Delete', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Delete account?' });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Account must have a zero balance before closing');

  await page.reload();
  await openAppDestination(page, 'Accounts');
  await expect(accountToggle(page, editedName)).toContainText('₹1,234.00');
});

test('hard-deleting an unused account survives reload', async ({ page }) => {
  const accountName = 'Phase B Disposable Account';

  await prepareDemo(page);
  await addBasicAccount(page, accountName, '0');
  const container = await expandAccount(page, accountName);
  await container.getByRole('button', { name: 'Delete', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Delete account?' });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(accountToggle(page, accountName)).toHaveCount(0);

  await page.reload();
  await openAppDestination(page, 'Accounts');
  await expect(accountToggle(page, accountName)).toHaveCount(0);
});

test('credit-card add, edit and delete survive reloads', async ({ page }) => {
  const cardName = 'Phase B Test Card';
  const editedName = 'Phase B Test Card Edited';

  await prepareDemo(page);
  await openAppDestination(page, 'Accounts');
  await page.locator('[data-tour-id="tour-add-account"]').click();
  await page.getByRole('button', { name: 'Loan / credit card', exact: true }).click();

  let form = page.getByTestId('account-form-sheet');
  await expect(form).toBeVisible();
  await form.locator('#account-name').fill(cardName);
  await form.locator('#opening-balance').fill('2000');
  await form.locator('#credit-limit').fill('50000');
  await form.locator('#amount-due').fill('1500');
  await form.locator('#credit-due-date').fill(await localDateKey(page, 10));
  await form.getByRole('button', { name: 'Add Credit Card', exact: true }).click();
  await expect(form).not.toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Accounts');
  let container = await expandAccount(page, cardName);
  await container.getByRole('button', { name: 'Edit', exact: true }).click();

  form = page.getByTestId('account-form-sheet');
  await expect(form).toBeVisible();
  await expectCurrencyInputValue(form.locator('#opening-balance'), 2000);
  await form.locator('#account-name').fill(editedName);
  await replaceCurrencyInputValue(form.locator('#credit-limit'), '60000');
  await replaceCurrencyInputValue(form.locator('#amount-due'), '1200');
  await form.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(form).not.toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Accounts');
  await expect(accountToggle(page, cardName)).toHaveCount(0);
  container = await expandAccount(page, editedName);
  await container.getByRole('button', { name: 'Edit', exact: true }).click();
  form = page.getByTestId('account-form-sheet');
  await expectCurrencyInputValue(form.locator('#credit-limit'), 60000);
  await expectCurrencyInputValue(form.locator('#amount-due'), 1200);
  await form.getByRole('button', { name: 'Back from account form', exact: true }).click();

  container = await expandAccount(page, editedName);
  await container.getByRole('button', { name: 'Delete', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Delete account?' });
  await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(accountToggle(page, editedName)).toHaveCount(0);

  await page.reload();
  await openAppDestination(page, 'Accounts');
  await expect(accountToggle(page, editedName)).toHaveCount(0);
});

test('category add, update and delete survive reloads', async ({ page }) => {
  const categoryName = 'Phase B Durable Category';
  const editedName = 'Phase B Durable Category Edited';

  await prepareDemo(page);
  await openAppDestination(page, 'Categories');
  await expect(page.getByTestId('page-categories')).toBeVisible();
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add Category' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Category name' }).fill(categoryName);
  await dialog.getByRole('button', { name: 'Save Category', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Categories');
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Edit ${categoryName}`, exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit Category' });
  await dialog.getByRole('textbox', { name: 'Category name' }).fill(editedName);
  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Categories');
  await expect(page.getByText(categoryName, { exact: true })).toHaveCount(0);
  await expect(page.getByText(editedName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Delete ${editedName}`, exact: true }).click();
  await expect(page.getByText(editedName, { exact: true })).toHaveCount(0);

  await page.reload();
  await openAppDestination(page, 'Categories');
  await expect(page.getByText(editedName, { exact: true })).toHaveCount(0);
});

test('effective loan-rate revision survives reload and becomes the current loan terms', async ({ page }) => {
  const persistenceAlerts: string[] = [];
  page.on('dialog', async dialog => {
    persistenceAlerts.push(dialog.message());
    await dialog.dismiss();
  });

  await prepareDemo(page);
  await openAppDestination(page, 'Accounts');
  let container = await expandAccount(page, 'Car Loan');
  await container.getByRole('button', { name: 'Update rate', exact: true }).click();

  let modal = page.getByTestId('loan-rate-sheet');
  await expect(modal).toBeVisible();
  await modal.locator('#new-interest-rate').fill('9.75');
  await modal.locator('#loan-rate-effective-date').fill(await localDateKey(page));
  await modal.getByRole('button', { name: 'Update Rate', exact: true }).click();
  try {
    await expect(modal.getByRole('status')).toContainText('Interest rate revised to 9.75%', { timeout: 3_000 });
  } catch (error) {
    if (persistenceAlerts.length) {
      throw new Error(`Loan revision persistence failed: ${persistenceAlerts.join(' | ')}`);
    }
    throw error;
  }
  await expect(modal).not.toBeVisible({ timeout: 3_000 });

  await page.reload();
  await openAppDestination(page, 'Accounts');
  container = await expandAccount(page, 'Car Loan');
  await container.getByRole('button', { name: 'Update rate', exact: true }).click();
  modal = page.getByTestId('loan-rate-sheet');
  await expect(modal.locator('#new-interest-rate')).toHaveAttribute('placeholder', '9.75');
});
