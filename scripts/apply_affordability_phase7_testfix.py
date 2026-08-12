from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1))

# The dashboard heading is Net Worth; Total Balance was an obsolete smoke selector.
replace_once(
    'e2e/ui-smoke.spec.ts',
    "  await expect(page.getByText('Total Balance', { exact: false }).first()).toBeVisible();",
    "  await expect(page.getByText('Net Worth', { exact: true }).first()).toBeVisible();",
)
replace_once(
    'e2e/affordability-phase7.spec.ts',
    "  await expect(page.getByText('Total Balance', { exact: false }).first()).toBeVisible();",
    "  await expect(page.getByText('Net Worth', { exact: true }).first()).toBeVisible();",
)

# addInitScript runs again on page.reload(). The old first-use test therefore
# deleted the completion flags it had just verified. Clear once, then reload.
replace_once(
    'e2e/ui-smoke.spec.ts',
    "  await page.addInitScript(() => {\n    localStorage.removeItem('coinbuddy_onboarding_seen');\n    localStorage.removeItem('hasCompletedButtonTour');\n    localStorage.removeItem('coinbuddy_backup_config');\n  });\n  await page.goto('/');",
    "  await page.goto('/');\n  await page.evaluate(() => {\n    localStorage.removeItem('coinbuddy_onboarding_seen');\n    localStorage.removeItem('hasCompletedButtonTour');\n    localStorage.removeItem('coinbuddy_backup_config');\n  });\n  await page.reload();",
)

# The spotlight itself animates for 400 ms after the target rect updates. Wait
# for the UI to settle before comparing geometry, rather than sampling mid-tween.
replace_once(
    'e2e/ui-smoke.spec.ts',
    "  await expect(spotlight).toBeVisible();\n\n  const [targetBounds, tooltipBounds, spotlightBounds, viewport] = await Promise.all([",
    "  await expect(spotlight).toBeVisible();\n  await page.waitForTimeout(900);\n\n  const [targetBounds, tooltipBounds, spotlightBounds, viewport] = await Promise.all([",
)

print('Phase 7 browser harness fixes applied.')
