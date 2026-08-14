import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
}

async function measure(page: Page, route: string, testId: string) {
  await page.goto(`/?tab=${route}`);
  const root = page.getByTestId(testId);
  await expect(root).toBeVisible();
  const box = await root.boundingBox();
  expect(box, `${route} root should have a rendered box`).not.toBeNull();
  return box!;
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: false });
}

test('main pages share one responsive canvas', async ({ page }, testInfo) => {
  await prepare(page);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  const dashboard = await measure(page, 'dashboard', 'page-dashboard');
  await capture(page, testInfo, 'dashboard-layout');
  const activity = await measure(page, 'activity', 'page-activity');
  await capture(page, testInfo, 'activity-layout');

  await page.goto('/?tab=manage');
  await expect(page.getByTestId('page-manage')).toBeVisible();
  await expect(page.getByTestId('page-accounts')).toBeVisible();
  const accounts = (await page.getByTestId('page-accounts').boundingBox())!;
  await capture(page, testInfo, 'accounts-layout');

  const insights = await measure(page, 'insights', 'page-insights');
  const settings = await measure(page, 'settings', 'page-settings');
  await capture(page, testInfo, 'settings-layout');

  const boxes = [dashboard, activity, accounts, insights, settings];
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);

  if ((viewport?.width ?? 0) >= 768) {
    const widths = boxes.map(box => box.width);
    const spread = Math.max(...widths) - Math.min(...widths);
    expect(spread, `desktop page width spread was ${spread}px`).toBeLessThanOrEqual(2);
    expect(Math.min(...widths)).toBeGreaterThan((viewport?.width ?? 0) * 0.75);
  } else {
    for (const box of boxes) {
      expect(box.width).toBeLessThanOrEqual((viewport?.width ?? 0) - 16);
      expect(box.width).toBeGreaterThan((viewport?.width ?? 0) - 48);
    }
  }
});
