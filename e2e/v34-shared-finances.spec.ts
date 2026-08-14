import { expect, test, type Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const destination = name === 'Dashboard' ? 'Home' : name === 'Manage' ? 'Accounts' : name;
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  const mobileNav = page.getByTestId('mobile-bottom-nav');
  if (destination === 'Home' || destination === 'Activity') {
    await mobileNav.getByRole('button', { name: destination, exact: true }).click();
    return;
  }

  await mobileNav.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: destination, exact: true }).click();
}

async function loadDemo(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await page.getByRole('button', { name: /Load demo data/i }).click();
  await expect(page.getByText('Load Demo Data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15000 });
}

async function backToSharing(page: Page) {
  await page.getByRole('button', { name: 'Back to Sharing', exact: true }).click();
  await expect(page.getByTestId('sharing-hub')).toBeVisible();
}

test('v3.4 Sharing hub keeps shared-finance tasks focused and navigable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await loadDemo(page);

  await openTab(page, 'Manage');
  await page.getByTestId('page-manage').getByRole('button', { name: 'Sharing', exact: true }).click();

  await expect(page.getByTestId('sharing-hub')).toBeVisible();
  await expect(page.getByText('What do you want to do?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Shared expenses', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Settle / reimburse', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Recurring shared bills', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Shared loans', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open People', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Open People', exact: true }).click();
  await expect(page.getByText('People', { exact: true })).toBeVisible();
  await expect(page.getByText(/Rohan Rao/).first()).toBeVisible();
  await expect(page.getByText(/Maya Rao/).first()).toBeVisible();
  await backToSharing(page);

  await page.getByRole('button', { name: 'Open Shared expenses', exact: true }).click();
  await expect(page.getByText('Shared expenses', { exact: true })).toBeVisible();
  const rent = page.getByRole('article', { name: 'Shared obligation Apartment Rent' });
  await expect(rent).toBeVisible();
  await expect(rent).toContainText('Your responsibility');
  await expect(rent).toContainText('You should receive');
  const groceries = page.getByRole('article', { name: 'Shared obligation Family Groceries' });
  await expect(groceries).toContainText('You still owe');
  await backToSharing(page);

  await page.getByRole('button', { name: 'Open Settle / reimburse', exact: true }).click();
  await expect(page.getByText('Settle / reimburse', { exact: true })).toBeVisible();
  await expect(page.getByText(/does not count it as salary\/income/i)).toBeVisible();
  await backToSharing(page);

  await page.getByRole('button', { name: 'Open Recurring shared bills', exact: true }).click();
  await expect(page.getByText('Recurring shared bills', { exact: true })).toBeVisible();
  await expect(page.getByText('Family Utilities', { exact: true })).toBeVisible();
  await backToSharing(page);

  await page.getByRole('button', { name: 'Open Shared loans', exact: true }).click();
  const loan = page.getByRole('article', { name: 'Shared loan Car Loan' });
  await expect(loan).toBeVisible();
  await expect(loan).toContainText(/personal exposure/i);
  await expect(loan).toContainText(/Rohan Rao/);
  await expect(loan).toContainText(/Direct lender payments/i);

  await openTab(page, 'Insights');
  await expect(page.getByText('Upcoming Money', { exact: true })).toBeVisible();

  await openTab(page, 'Settings');
  await expect(page.getByText('Coin Buddy V3.4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Verify Data Integrity/i }).click();
  await expect(page.getByText('Integrity Verified', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
