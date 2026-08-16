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

async function openThemePicker(page: Page) {
  const toggle = page.getByTestId('app-theme-toggle');
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
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
      customAccent: styles.getPropertyValue('--cb-custom-accent').trim(),
    };
  });
}

async function resolvedChartThemeColor(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--cb-blue)';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
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

test('App Theme stays compact until opened and uses swatches instead of large cards', async ({ page }) => {
  await prepare(page);

  const toggle = page.getByTestId('app-theme-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Use custom color theme', exact: true })).not.toBeVisible();

  await openThemePicker(page);
  const expected = [
    'Use blue color theme',
    'Use green color theme',
    'Use purple color theme',
    'Use orange color theme',
    'Use pink color theme',
    'Use custom color theme',
  ];

  for (const label of expected) {
    const option = page.getByRole('button', { name: label, exact: true });
    await expect(option).toBeVisible();
    const box = await option.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(70);
  }
});

test('Ocean Emerald Violet Amber and Rose change the full light environment', async ({ page }) => {
  await prepare(page);
  await setLight(page);
  await openThemePicker(page);

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

test('Custom exposes a full hue ring and changes the environmental theme', async ({ page }) => {
  await prepare(page);
  await setLight(page);
  await openThemePicker(page);

  await page.getByRole('button', { name: 'Use blue color theme', exact: true }).click();
  const ocean = await themeTokens(page);

  await page.getByRole('button', { name: 'Use custom color theme', exact: true }).click();
  await expect(page.getByTestId('custom-theme-controls')).toBeVisible();
  const hueRing = page.getByRole('slider', { name: 'Custom theme hue', exact: true });
  await expect(hueRing).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Custom theme saturation', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Custom theme brightness', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/theme-custom-[0-9a-f]{6}/i);

  const before = await themeTokens(page);
  await hueRing.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const after = await themeTokens(page);

  expect(before.customAccent).toMatch(/^#[0-9a-f]{6}$/i);
  expect(after.customAccent).toMatch(/^#[0-9a-f]{6}$/i);
  expect(after.customAccent).not.toBe(before.customAccent);
  expect(after.background).not.toBe(ocean.background);
  expect(after.surface).not.toBe(ocean.surface);
  expect(after.primary).not.toBe(ocean.primary);
  expect(after.nav).not.toBe(ocean.nav);
});

test('selected theme reaches dashboard card environment and Net Worth chart', async ({ page }) => {
  await prepare(page);
  await setLight(page);
  await openThemePicker(page);

  await page.getByRole('button', { name: 'Use blue color theme', exact: true }).click();
  const oceanTokens = await themeTokens(page);
  await openDashboard(page);
  const oceanCard = await page.getByRole('article', { name: 'Net Worth overview' }).evaluate(element => getComputedStyle(element).backgroundImage);
  const oceanChart = page.locator('.recharts-area-curve').first();
  await expect(oceanChart).toHaveAttribute('stroke', 'var(--cb-blue)');
  const oceanChartColor = await resolvedChartThemeColor(page);

  await page.goto('/?tab=settings');
  await openThemePicker(page);
  await page.getByRole('button', { name: 'Use green color theme', exact: true }).click();
  const emeraldTokens = await themeTokens(page);
  await openDashboard(page);
  const emeraldCard = await page.getByRole('article', { name: 'Net Worth overview' }).evaluate(element => getComputedStyle(element).backgroundImage);
  const emeraldChart = page.locator('.recharts-area-curve').first();
  await expect(emeraldChart).toHaveAttribute('stroke', 'var(--cb-blue)');
  const emeraldChartColor = await resolvedChartThemeColor(page);

  expect(emeraldTokens.background).not.toBe(oceanTokens.background);
  expect(emeraldTokens.surface).not.toBe(oceanTokens.surface);
  expect(emeraldTokens.accent).not.toBe(oceanTokens.accent);
  expect(emeraldCard).not.toBe(oceanCard);
  expect(emeraldChartColor).not.toBe(oceanChartColor);
});

test('dark appearance retains each theme personality and supports Custom', async ({ page }) => {
  await prepare(page);
  await setDark(page);
  await openThemePicker(page);

  await page.getByRole('button', { name: 'Use purple color theme', exact: true }).click();
  const violet = await themeTokens(page);
  await page.getByRole('button', { name: 'Use orange color theme', exact: true }).click();
  const amber = await themeTokens(page);
  await page.getByRole('button', { name: 'Use custom color theme', exact: true }).click();
  const custom = await themeTokens(page);

  expect(violet.background).not.toBe(amber.background);
  expect(violet.surface).not.toBe(amber.surface);
  expect(violet.primary).not.toBe(amber.primary);
  expect(violet.nav).not.toBe(amber.nav);
  expect(custom.background).not.toBe(amber.background);
  expect(custom.primary).toMatch(/var\(--cb-custom-accent\)|#[0-9a-f]{6}|color-mix/i);
});
