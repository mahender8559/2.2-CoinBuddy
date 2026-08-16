import { expect, test, type Page } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

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
  await openAppDestination(page, 'Goals');
  await expect(page.getByTestId('page-goals')).toBeVisible();
}

test('Goal can link multiple asset accounts and restores them when edited', async ({ page }) => {
  await prepareDemo(page);

  await page.getByTestId('page-goals').getByRole('button', { name: 'Add goal', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Goal', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.locator('#goal-name').fill('Multi Account Goal');
  await dialog.getByLabel('Target Amount').fill('150000');
  await dialog.getByText('More options', { exact: true }).click();

  const accountGroup = dialog.getByRole('group', { name: 'Linked goal accounts' });
  const choices = accountGroup.getByRole('button', { name: /^Link account / });
  expect(await choices.count()).toBeGreaterThanOrEqual(2);

  await choices.nth(0).click();
  await choices.nth(1).click();
  await expect(choices.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(choices.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('2 selected', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Create Goal', exact: true }).click();
  const goal = page.getByRole('article', { name: 'Goal Multi Account Goal' });
  await expect(goal).toBeVisible();
  await expect(goal.getByText(/Progress tracked from/)).toBeVisible();

  await page.reload();
  await openAppDestination(page, 'Goals');
  const restoredGoal = page.getByRole('article', { name: 'Goal Multi Account Goal' });
  await expect(restoredGoal).toBeVisible();
  await restoredGoal.getByRole('button', { name: 'Edit Multi Account Goal', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit Goal', exact: true });
  await expect(editDialog).toBeVisible();
  await editDialog.getByText('More options', { exact: true }).click();
  const restoredChoices = editDialog.getByRole('group', { name: 'Linked goal accounts' }).getByRole('button', { name: /^Link account / });
  await expect(restoredChoices.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(restoredChoices.nth(1)).toHaveAttribute('aria-pressed', 'true');
});
