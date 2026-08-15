import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=manage');
  const width = page.viewportSize()?.width ?? 0;
  if (width >= 768) await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Sharing', exact: true }).click();
  else await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Sharing', exact: true }).click();
}

test('v3.5 Sharing presents one calm task hub', async ({ page }, testInfo: TestInfo) => {
  await prepare(page);
  await expect(page.getByTestId('sharing-hub')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sharing ✨', exact: true })).toBeVisible();
  await expect(page.getByText('You should receive', { exact: true })).toBeVisible();
  await expect(page.getByText('You owe', { exact: true })).toBeVisible();
  await expect(page.getByText('Active bills', { exact: true })).toBeVisible();

  for (const task of ['Shared expenses', 'Settle / reimburse', 'Recurring shared bills', 'Shared loans', 'People']) {
    await expect(page.getByRole('button', { name: `Open ${task}`, exact: true })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Open Shared expenses', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shared expenses', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Back to Sharing/ }).click();
  await expect(page.getByTestId('sharing-hub')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('v35-sharing.png'), fullPage: false });
});
