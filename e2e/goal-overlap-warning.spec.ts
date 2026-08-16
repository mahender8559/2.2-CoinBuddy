import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepareDemo(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await page.getByRole('button', { name: /Load demo data/i }).click();
  const reloaded = page.waitForEvent('load', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await reloaded;
  await openAppDestination(page, 'Goals');
}

async function createGoal(page: Page, name: string, expectOverlapWarning: boolean) {
  await page.getByRole('button', { name: 'Add goal', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Goal' });
  await expect(dialog).toBeVisible();
  await dialog.locator('#goal-name').fill(name);
  await dialog.getByLabel('Target Amount').fill('100000');
  await dialog.getByText('More options', { exact: true }).click();
  const accountChoices = dialog.getByRole('button', { name: /^Link account / });
  await expect(accountChoices.first()).toBeVisible();
  await accountChoices.first().click();
  await dialog.getByRole('button', { name: 'Create Goal', exact: true }).click();

  if (expectOverlapWarning) {
    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText('already used by');
    await expect(alert).toContainText('Press Save again to continue');
    await dialog.getByRole('button', { name: 'Create Goal', exact: true }).click();
  }
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('article', { name: `Goal ${name}` })).toBeVisible();
}

test('Savings Goals — sharing one account across goals requires explicit acknowledgement', async ({ page }) => {
  await prepareDemo(page);
  await createGoal(page, 'Overlap Test Alpha', false);
  await createGoal(page, 'Overlap Test Beta', true);
  await page.reload();
  await openAppDestination(page, 'Goals');
  await expect(page.getByRole('article', { name: 'Goal Overlap Test Alpha' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Goal Overlap Test Beta' })).toBeVisible();
});
