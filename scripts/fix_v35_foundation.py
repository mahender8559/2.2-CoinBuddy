from pathlib import Path

manage_path = Path('src/components/ManageFinances.tsx')
manage = manage_path.read_text()
manage = manage.replace('\\n  useEffect(() => {', '\n  useEffect(() => {', 1)
manage_path.write_text(manage)

tour_path = Path('src/components/ButtonTourOverlay.tsx')
tour = tour_path.read_text()
start = tour.find('\\nfunction findVisibleTourTarget')
if start != -1:
    end = tour.find('export const TOUR_STEPS', start)
    if end == -1:
        raise SystemExit('Tour helper end marker missing')
    helper = tour[start:end].replace('\\n', '\n')
    tour = tour[:start] + helper + tour[end:]
tour_path.write_text(tour)

old_open_tab = """async function openTab(page: Page, name: string) {
  const desktop = page.getByTitle(name);
  const mobile = page.getByRole('button', { name, exact: true });
  if (await desktop.isVisible()) await desktop.click(); else await mobile.click();
}
"""

new_open_tab = """async function openTab(page: Page, name: string) {
  const destination = name === 'Dashboard' ? 'Home' : name === 'Manage' ? 'Accounts' : name;
  const desktopSidebar = page.getByTestId('desktop-sidebar');
  if (await desktopSidebar.isVisible()) {
    await desktopSidebar.getByRole('button', { name: destination, exact: true }).click();
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
"""

for filename in [
    'e2e/affordability-phase7.spec.ts',
    'e2e/demo-data-v33.spec.ts',
    'e2e/v33-planning-reliability.spec.ts',
    'e2e/v34-shared-finances.spec.ts',
]:
    path = Path(filename)
    text = path.read_text()
    if new_open_tab not in text:
        if old_open_tab not in text:
            raise SystemExit(f'Legacy navigation helper not found in {filename}')
        text = text.replace(old_open_tab, new_open_tab, 1)
    path.write_text(text)

# Once Manage is visible, scope its own Categories/Goals/Sharing controls to the
# Manage surface so they do not collide with the new global navigation labels.
for filename in [
    'e2e/affordability-phase7.spec.ts',
    'e2e/demo-data-v33.spec.ts',
    'e2e/v33-planning-reliability.spec.ts',
]:
    path = Path(filename)
    text = path.read_text()
    text = text.replace(
        "await page.getByRole('button', { name: 'Goals', exact: true }).click();",
        "await page.getByTestId('page-manage').getByRole('button', { name: 'Goals', exact: true }).click();",
    )
    path.write_text(text)

v34_path = Path('e2e/v34-shared-finances.spec.ts')
v34 = v34_path.read_text().replace(
    "await page.getByRole('button', { name: 'Sharing', exact: true }).click();",
    "await page.getByTestId('page-manage').getByRole('button', { name: 'Sharing', exact: true }).click();",
    1,
)
v34_path.write_text(v34)

shell_path = Path('e2e/v35-shell.spec.ts')
shell = shell_path.read_text()
shell = shell.replace(
    "await page.getByRole('button', { name: 'More' }).click();",
    "await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'More' }).click();",
)
shell = shell.replace(
    "await page.getByRole('button', { name: 'Accounts' }).click();\n    await expect(page.getByTestId('page-accounts')).toBeVisible();\n\n    await page.getByRole('button', { name: 'Sharing' }).click();",
    "await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: 'Accounts' }).click();\n    await expect(page.getByTestId('page-accounts')).toBeVisible();\n\n    await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Sharing' }).click();",
    1,
)
shell = shell.replace(
    "await page.getByRole('button', { name: 'Sharing' }).click();\n    await expect(page.getByText('What do you want to do?')).toBeVisible();\n    await page.getByRole('button', { name: 'Accounts' }).click();",
    "await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Sharing' }).click();\n    await expect(page.getByText('What do you want to do?')).toBeVisible();\n    await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Accounts' }).click();",
    1,
)
shell_path.write_text(shell)

# The locked V3.5 mobile IA intentionally provides exactly one global Add action
# even while Manage is open. Keep the original anti-duplication intent by
# checking for no page-local Add while allowing the single nav action.
clutter_path = Path('e2e/cross-page-clutter.spec.ts')
clutter = clutter_path.read_text()
old = "await expect(page.getByRole('button', { name: 'Add Transaction' })).toHaveCount(0);"
new = """const mobileNav = page.getByTestId('mobile-bottom-nav');
  if (await mobileNav.isVisible()) {
    await expect(mobileNav.getByRole('button', { name: 'Add Transaction' })).toHaveCount(1);
    await expect(page.getByTestId('page-manage').getByRole('button', { name: 'Add Transaction' })).toHaveCount(0);
  } else {
    await expect(page.getByRole('button', { name: 'Add Transaction' })).toHaveCount(0);
  }"""
if new not in clutter:
    if old not in clutter:
        raise SystemExit('cross-page Add expectation marker not found')
    clutter = clutter.replace(old, new, 1)
clutter_path.write_text(clutter)

print('Normalized V3.5 generated source and migrated navigation tests')
