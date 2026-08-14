import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=activity');
}

test('v3.5 Activity keeps search and primary filters simple', async ({ page }, testInfo: TestInfo) => {
  await prepare(page);
  await expect(page.getByTestId('page-activity')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search transactions...')).toBeVisible();
  for (const filter of ['All', 'Income', 'Expense', 'Transfer']) {
    await expect(page.getByRole('button', { name: filter, exact: true })).toBeVisible();
  }

  const advanced = page.getByRole('button', { name: 'Advanced filters' });
  await advanced.click();
  await expect(page.getByRole('region', { name: 'Advanced transaction filters' })).toBeVisible();
  await advanced.click();
  await expect(page.getByRole('region', { name: 'Advanced transaction filters' })).toBeHidden();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('v35-activity.png'), fullPage: false });
});
