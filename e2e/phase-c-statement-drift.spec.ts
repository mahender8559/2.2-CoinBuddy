import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await expect(page.getByTestId('page-settings')).toBeVisible();
}

test('visible storage and backup claims match current implementation', async ({ page }) => {
  await prepare(page);

  await expect(page.getByText('V3.5', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Export Excel/i })).toBeVisible();
  await expect(page.getByText(/Export PDF/i)).toHaveCount(0);
  await expect(page.getByText(/Export CSV/i)).toHaveCount(0);

  await page.getByRole('button', { name: /Load demo data/i }).click();
  const demoDialog = page.getByRole('dialog', { name: 'Load Demo Data' });
  await expect(demoDialog).toContainText('realistic CoinBuddy sample');
  await expect(demoDialog).not.toContainText('v3.4 sample');
  await demoDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.getByRole('button', { name: /Backup & Security/i }).click();
  await expect(page.getByText('Run scheduled backups while CoinBuddy is open', { exact: true })).toBeVisible();
  await expect(page.getByText('Perform scheduled background synchronization', { exact: true })).toHaveCount(0);
  await expect(page.locator('option[value="LOCAL"]')).toHaveText('CoinBuddy Local Backup');
  await expect(page.getByText('Local Device Storage', { exact: true })).toHaveCount(0);
  const automationStatus = page.locator('p').filter({ hasText: /^Automation:/ }).first();
  await expect(automationStatus).toContainText(/Runs while CoinBuddy is open|Off/);
  await expect(page.getByText('App-wide scheduler active', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Next due:/)).toBeVisible();
});

test('walkthrough avoids unsupported security and zero-drift guarantees', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: /Feature Walkthrough & Tour/i }).click();

  const walkthrough = page.getByTestId('onboarding-sheet');
  await expect(walkthrough).toBeVisible();
  await expect(walkthrough).toContainText('Your local-first financial ledger with encrypted backups and consistency checks.');
  await expect(walkthrough).not.toContainText('highly secure');
  await expect(walkthrough).not.toContainText('zero-drift');

  await walkthrough.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(walkthrough).toContainText('integrity checks available to detect inconsistencies');
  await expect(walkthrough).not.toContainText('absolutely zero balance drift');
});