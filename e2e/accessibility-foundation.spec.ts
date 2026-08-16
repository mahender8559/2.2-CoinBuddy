import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openAppDestination } from './helpers/navigation';

async function prepareDemo(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await page.getByRole('button', { name: /Load demo data/i }).click();
  const reloaded = page.waitForEvent('load', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await reloaded;
}

test.describe('shared modal accessibility foundation', () => {
  test('Add Transaction traps focus, closes with Escape, and restores the trigger', async ({ page }) => {
    await prepareDemo(page);
    await openAppDestination(page, 'Activity');
    const trigger = page.locator('[data-tour-id="tour-add-transaction"]:visible');
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByTestId('transaction-form-sheet');
    await expect(dialog).toBeVisible();
    await expect.poll(async () => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);

    // Shift+Tab from the first focused control must wrap inside the active dialog.
    await page.keyboard.press('Shift+Tab');
    await expect.poll(async () => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('Add Transaction modal has no WCAG A/AA axe violations', async ({ page }) => {
    await prepareDemo(page);
    await openAppDestination(page, 'Activity');
    await page.locator('[data-tour-id="tour-add-transaction"]:visible').click();
    const dialog = page.getByTestId('transaction-form-sheet');
    await expect(dialog).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="transaction-form-sheet"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
