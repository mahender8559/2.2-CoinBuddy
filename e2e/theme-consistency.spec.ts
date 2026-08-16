import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
}

async function openActivity(page: Page) {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Activity', exact: true }).click();
  } else {
    await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Activity', exact: true }).click();
  }
}

function brightness([r, g, b]: [number, number, number]) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

test('light mode updates V3.5 cards and navigation instead of leaving dark containers', async ({ page }) => {
  await prepare(page);

  const themeSwitch = page.getByRole('switch', { name: /Dark Theme/i });
  await expect(themeSwitch).toBeVisible();
  if (await themeSwitch.getAttribute('aria-checked') === 'true') await themeSwitch.click();
  await expect(themeSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

  await openActivity(page);
  const activity = page.getByTestId('page-activity');
  await expect(activity).toBeVisible();

  const surface = activity.locator('.v35-surface').first();
  await expect(surface).toBeVisible();
  const surfaceRgb = await surface.evaluate(element => {
    const image = getComputedStyle(element).backgroundImage;
    const match = image.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] as [number, number, number] : null;
  });
  expect(surfaceRgb, 'Expected a resolved light-mode V3.5 surface gradient').not.toBeNull();
  expect(brightness(surfaceRgb!)).toBeGreaterThan(180);

  const nav = (page.viewportSize()?.width ?? 0) >= 768
    ? page.getByTestId('desktop-sidebar')
    : page.getByTestId('mobile-bottom-nav');
  const navBackground = await nav.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(navBackground).not.toMatch(/rgb\(4,\s*11,\s*21\)/);
});

test('selected color palette propagates into the legacy V3.5 accent tokens', async ({ page }) => {
  await prepare(page);

  await page.getByRole('button', { name: 'Use green color theme', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/theme-green/);

  const accents = await page.locator('html').evaluate(element => {
    const styles = getComputedStyle(element);
    return {
      accent: styles.getPropertyValue('--cb-accent').trim(),
      legacyBlue: styles.getPropertyValue('--cb-blue').trim(),
      lockedBlue: styles.getPropertyValue('--cb-locked-blue').trim(),
    };
  });

  expect(accents.accent.toLowerCase()).toBe('#15803d');
  expect(accents.legacyBlue).toContain('var(--cb-accent)');
  expect(accents.lockedBlue).toContain('var(--cb-accent)');
});
