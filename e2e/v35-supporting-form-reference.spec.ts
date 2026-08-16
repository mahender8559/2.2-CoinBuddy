import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepareDemo(page: Page) {
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
  await page.goto('/?tab=manage');
  await expect(page.getByTestId('page-manage')).toBeVisible();
}

async function chooseManageDestination(page: Page, destination: 'Categories' | 'Goals' | 'Sharing') {
  await page.evaluate((detail) => {
    document.dispatchEvent(new CustomEvent('coinbuddy:manage-destination', { detail }));
  }, destination);
}

test('category and goal supporting forms follow the locked responsive field system', async ({ page }, testInfo: TestInfo) => {
  await prepareDemo(page);

  await chooseManageDestination(page, 'Categories');
  const categories = page.getByTestId('page-categories');
  await expect(categories).toBeVisible();
  await categories.getByRole('button', { name: 'Add category', exact: true }).click();

  const categoryDialog = page.getByRole('dialog', { name: 'Add Category', exact: true });
  await expect(categoryDialog).toBeVisible();
  await expect(categoryDialog.getByText('Icon & Color', { exact: true })).toBeVisible();
  await expect(categoryDialog.getByLabel('Category name')).toBeVisible();
  await expect(categoryDialog.getByRole('button', { name: 'Save Category', exact: true })).toBeVisible();
  const categoryNameBox = await categoryDialog.getByLabel('Category name').boundingBox();
  expect(categoryNameBox?.height).toBeGreaterThanOrEqual(43);
  expect(categoryNameBox?.height).toBeLessThanOrEqual(45);
  await page.screenshot({ path: testInfo.outputPath('locked-category-form.png'), fullPage: false });
  await categoryDialog.getByRole('button', { name: 'Close category form', exact: true }).click();

  await chooseManageDestination(page, 'Goals');
  const goals = page.getByTestId('page-goals');
  await expect(goals).toBeVisible();
  await goals.getByRole('button', { name: 'Add goal', exact: true }).click();

  const goalDialog = page.getByRole('dialog', { name: 'Add Goal', exact: true });
  await expect(goalDialog).toBeVisible();
  await expect(goalDialog.getByLabel('Target Amount')).toBeVisible();
  await expect(goalDialog.getByRole('button', { name: /Create Goal/i })).toBeVisible();
  const goalNameBox = await goalDialog.locator('#goal-name').boundingBox();
  expect(goalNameBox?.height).toBeGreaterThanOrEqual(43);
  expect(goalNameBox?.height).toBeLessThanOrEqual(45);
  await page.screenshot({ path: testInfo.outputPath('locked-goal-form.png'), fullPage: false });
  await goalDialog.getByRole('button', { name: 'Close goal form', exact: true }).click();
});
