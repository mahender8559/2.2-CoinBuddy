import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
}

test('v3.5 shell exposes intentional mobile and desktop navigation', async ({ page }) => {
  await prepare(page);
  await page.goto('/?tab=dashboard');
  const width = page.viewportSize()?.width ?? 0;

  if (width < 768) {
    await expect(page.getByTestId('mobile-bottom-nav')).toBeVisible();
    await expect(page.getByTestId('desktop-sidebar')).toBeHidden();
    await expect(page.getByTestId('app-header')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add Transaction' })).toBeVisible();

    await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Money tools navigation', exact: true });
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'Accounts', exact: true }).click();
    await expect(page.getByTestId('page-accounts')).toBeVisible();

    await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Sharing', exact: true }).click();
    await expect(page.getByText('What do you want to do?')).toBeVisible();
  } else {
    await expect(page.getByTestId('desktop-sidebar')).toBeVisible();
    await expect(page.getByTestId('mobile-bottom-nav')).toBeHidden();
    await expect(page.getByTestId('app-header')).toBeVisible();
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Sharing', exact: true }).click();
    await expect(page.getByText('What do you want to do?')).toBeVisible();
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Accounts', exact: true }).click();
    await expect(page.getByTestId('page-accounts')).toBeVisible();
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
