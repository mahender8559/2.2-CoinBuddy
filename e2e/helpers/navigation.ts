import { expect, type Page } from '@playwright/test';

export type AppDestination =
  | 'Home'
  | 'Activity'
  | 'Sharing'
  | 'Accounts'
  | 'Categories'
  | 'Goals'
  | 'Insights'
  | 'Settings';

const directMobileDestinations = new Set<AppDestination>(['Home', 'Activity', 'Sharing']);
const moneyToolDestinations = new Set<AppDestination>(['Accounts', 'Categories', 'Goals', 'Insights']);

export async function openAppDestination(page: Page, destination: AppDestination) {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;

  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  const mobileNav = page.getByTestId('mobile-bottom-nav');

  if (directMobileDestinations.has(destination)) {
    await mobileNav.getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  if (destination === 'Settings') {
    await mobileNav.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    await page.getByTestId('dashboard-settings-shortcut').click();
    await expect(page.getByTestId('page-settings')).toBeVisible();
    return;
  }

  if (moneyToolDestinations.has(destination)) {
    await mobileNav.getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Money tools navigation', exact: true });
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  throw new Error(`Unsupported app destination: ${destination}`);
}

export async function openWalletSummary(page: Page) {
  await openAppDestination(page, 'Home');
  const walletButton = page.getByTestId('dashboard-wallet-summary');
  await expect(walletButton).toBeVisible();
  await walletButton.click();
  await expect(page.getByTestId('wallet-summary-sheet')).toBeVisible();
}
