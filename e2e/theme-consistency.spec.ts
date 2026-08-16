import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
}

async function setLight(page: Page) {
  const themeSwitch = page.getByRole('switch', { name: /Dark Theme/i });
  await expect(themeSwitch).toBeVisible();
  if (await themeSwitch.getAttribute('aria-checked') === 'true') await themeSwitch.click();
  await expect(themeSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
}

async function setDark(page: Page) {
  const themeSwitch = page.getByRole('switch', { name: /Dark Theme/i });
  await expect(themeSwitch).toBeVisible();
  if (await themeSwitch.getAttribute('aria-checked') !== 'true') await themeSwitch.click();
  await expect(themeSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
}

async function openActivity(page: Page) {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Activity', exact: true }).click();
  } else {
    await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Activity', exact: true }).click();
  }
}

async function openDashboard(page: Page) {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Home', exact: true }).click();
  } else {
    await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Home', exact: true }).click();
  }
}

async function themeTokens(page: Page) {
  return page.locator('html').evaluate(element => {
    const styles = getComputedStyle(element);
    return {
      background: styles.getPropertyValue('--background').trim(),
      surface: styles.getPropertyValue('--surface-container-low').trim(),
      primary: styles.getPropertyValue('--primary').trim(),
      nav: styles.getPropertyValue('--cb-theme-nav').trim(),
      accent: styles.getPropertyValue('--cb-theme-accent').trim(),
    };
  });
}

test('light appearance updates cards and navigation instead of leaving dark containers', async ({ page }) => {
  await prepare(page);
  await setLight(page);
  await openActivity(page);

  const activity = page.getByTestId('page-activity');
  await expect(activity).toBeVisible();
  const surface = activity.locator('.v35-surface').first();
  await expect(surface).toBeVisible();

  const colors = await surface.evaluate(element => {
    const styles = getComputedStyle(element);
    return { background: styles.backgroundImage, color: styles.color, border: styles.borderColor };
  });
  expect(colors.background).not.toContain('rgb(13, 27, 46)');
  expect(colors.color).not.toBe('rgb(248, 250, 252)');

  const nav = (page.viewportSize()?.width ?? 0) >= 768
    ? page.getByTestId('desktop-sidebar')
    : page.getByTestId('mobile-bottom-nav');
  const navBackground = await nav.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(navBackground).not.toMatch(/rgb\(4,\s*11,\s*21\)/);
});

test('theme picker presents complete app-theme previews instead of color dots', async ({ page }) => {
  await prepare(page);

  const expected = [
    ['Use blue color theme', 'Ocean'],
    ['Use green color theme', 'Emerald'],
    ['Use purple color theme', 'Violet'],
    ['Use orange color theme', 'Amber'],
    ['Use pink color theme', 'Rose'],
  ] as const;

  for (const [label, visualName] of expected) {
    const option = page.getByRole('button', { name: label, exact: true });
    await expect(option).toBeVisible();
    const box = await option.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(88);
    const generatedName = await option.evaluate((element, name) => {
      const value = getComputedStyle(element, '::after').content.replace(/^['"]|['"]$/g, '');
      return { value, expected: name };
    }, visualName);
    expect(generatedName.value).toBe(generatedName.expected);
  }
});

test('Ocean Emerald Violet Amber and Rose change the full light environment', async ({ page }) => {
  await prepare(page);
  await setLight(page);

  const options = [
    ['blue', 'Use blue color theme'],
    ['green', 'Use green color theme'],
    ['purple', 'Use purple color theme'],
    ['orange', 'Use orange color theme'],
    ['pink', 'Use pink color theme'],
  ] as const;

  const snapshots: Record<string, Awaited<ReturnType<typeof themeTokens>>> = {};
  for (const [id, label] of options) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${id}`));
    snapshots[id] = await themeTokens(page);
  }

  expect(new Set(Object.values(snapshots).map(item => item.background)).size).toBe(5);
  expect(new Set(Object.values(snapshots).map(item => item.surface)).size).toBe(5);
  expect(new Set(Object.values(snapshots).map(item => item.primary)).size).toBe(5);
  expect(new Set(Object.values(snapshots).map(item => item.nav)).size).toBe(5);
  expect(new Set(Object.values(snapshots).map(item => item.accent)).size).toBe(5);
});

test('selected theme reaches dashboard card environment and Net Worth chart', async ({ page }) => {
  await prepare(page);
  await setLight(page);

  await page.getByRole('button', { name: 'Use blue color theme', exact: true }).click();
  const oceanTokens = await themeTokens(page);
  await openDashboard(page);
  const oceanCard = await page.getByRole('article', { name: 'Net Worth overview' }).evaluate(element => getComputedStyle(element).backgroundImage);
  const oceanStroke = await page.locator('.recharts-area-curve').first().evaluate(element => getComputedStyle(element).stroke);

  await page.goto('/?tab=settings');
  await page.getByRole('button', { name: 'Use green color theme', exact: true }).click();
  const emeraldTokens = await themeTokens(page);
  await openDashboard(page);
  const emeraldCard = await page.getByRole('article', { name: 'Net Worth overview' }).evaluate(element => getComputedStyle(element).backgroundImage);
  const emeraldStroke = await page.locator('.recharts-area-curve').first().evaluate(element => getComputedStyle(element).stroke);

  expect(emeraldTokens.background).not.toBe(oceanTokens.background);
  expect(emeraldTokens.surface).not.toBe(oceanTokens.surface);
  expect(emeraldTokens.accent).not.toBe(oceanTokens.accent);
  expect(emeraldCard).not.toBe(oceanCard);
  expect(emeraldStroke).not.toBe(oceanStroke);
});

test('dark appearance retains each theme personality instead of reverting to Ocean', async ({ page }) => {
  await prepare(page);
  await setDark(page);

  await page.getByRole('button', { name: 'Use purple color theme', exact: true }).click();
  const violet = await themeTokens(page);
  await page.getByRole('button', { name: 'Use orange color theme', exact: true }).click();
  const amber = await themeTokens(page);

  expect(violet.background).not.toBe(amber.background);
  expect(violet.surface).not.toBe(amber.surface);
  expect(violet.primary).not.toBe(amber.primary);
  expect(violet.nav).not.toBe(amber.nav);
});
