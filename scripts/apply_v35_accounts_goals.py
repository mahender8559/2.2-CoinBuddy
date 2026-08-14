from pathlib import Path

path = Path('src/components/ManageFinances.tsx')
text = path.read_text()

text = text.replace("import { Cards } from './Cards';\n", "import { V35AccountsPanel } from './V35AccountsPanel';\n")
text = text.replace("import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';\n", "")
text = text.replace("import { GoalsPanel } from './GoalsPanel';\n", "import { V35GoalsPanel } from './V35GoalsPanel';\n")

swipe = """  const mainTabSwipe = useHorizontalSwipe(() => {\n    setMainTab(current => current === 'Accounts' ? 'Categories' : current === 'Categories' ? 'Sharing' : 'Accounts');\n  });\n"""
text = text.replace(swipe, '')
text = text.replace('className="w-full space-y-6 animate-fade-in pb-safe touch-pan-y" {...mainTabSwipe}', 'className="w-full space-y-6 animate-fade-in pb-safe touch-pan-y"')

start_marker = '      {/* Top Segmented Control matching the mockup */}\n'
end_marker = "      {mainTab === 'Accounts' ? (\n"
if start_marker in text:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    text = text[:start] + text[end:]

text = text.replace('        <Cards />', '        <V35AccountsPanel />')

old_branch = """      ) : mainTab === 'Sharing' ? (\n        <SharingPanel />\n      ) : (\n        <>\n"""
new_branch = """      ) : mainTab === 'Sharing' ? (\n        <SharingPanel />\n      ) : (activeTab as 'Categories' | 'Goals') === 'Goals' ? (\n        <V35GoalsPanel searchQuery={searchQuery} />\n      ) : (\n        <>\n"""
legacy_new_branch = """      ) : mainTab === 'Sharing' ? (\n        <SharingPanel />\n      ) : activeTab === 'Goals' ? (\n        <V35GoalsPanel searchQuery={searchQuery} />\n      ) : (\n        <>\n"""
if new_branch not in text:
    if legacy_new_branch in text:
        text = text.replace(legacy_new_branch, new_branch, 1)
    elif old_branch in text:
        text = text.replace(old_branch, new_branch, 1)
    else:
        raise SystemExit('Manage branch marker not found')
text = text.replace('Categories & Goals</h1>', 'Categories</h1>', 1)
text = text.replace('<GoalsPanel searchQuery={searchQuery} />', '<V35GoalsPanel searchQuery={searchQuery} />')
path.write_text(text)

# Keep the compact Goals design while retaining the explanatory affordabilty
# semantics that existing users/tests rely on.
goals_path = Path('src/components/V35GoalsPanel.tsx')
goals = goals_path.read_text()
goals = goals.replace(
    '<button type="button" onClick={openNew} className="v35-focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-[0_0_24px_rgba(76,141,255,.18)]">',
    '<button type="button" aria-label="Add goal" onClick={openNew} className="v35-focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-[0_0_24px_rgba(76,141,255,.18)]">',
)
goals = goals.replace(
    '<h2 className="truncate text-base font-semibold text-on-surface">{goal.name} <span aria-hidden="true">{goalEmoji(goal.type)}</span></h2>',
    '<h2 className="truncate text-base font-semibold text-on-surface"><span>{goal.name}</span> <span aria-hidden="true">{goalEmoji(goal.type)}</span></h2>',
)
old_progress = """                <p className=\"mt-4 text-xs leading-5 text-on-surface-variant\">{linked ? `Progress tracked from ${linked.name}.` : 'Progress uses manual saved amount and verified Goal-linked contributions.'}</p>\n"""
new_progress = """                <p className=\"mt-4 text-xs leading-5 text-on-surface-variant\">{linked ? `Progress tracked from ${linked.name}.` : 'Progress uses manual saved amount and verified Goal-linked contributions.'}</p>\n                {goal.monthlyContribution > 0 ? <p className=\"mt-1 text-xs leading-5 text-on-surface-variant\">Planner protects {formatCurrency(goal.monthlyContribution)} each cycle for this goal.</p> : null}\n"""
if new_progress not in goals:
    if old_progress not in goals:
        raise SystemExit('Goal progress copy marker not found')
    goals = goals.replace(old_progress, new_progress, 1)
goals = goals.replace(
    '<span>{linked.name} can track this goal without being treated as liquid cash in affordability.</span>',
    '<span>{linked.name} tracks progress only. It is excluded from affordability liquid cash and protected reserves.</span>',
)
goals_path.write_text(goals)

# Categories remains a real destination and must stay reachable on desktop now
# that the old three-way Manage segmented control is gone.
nav_path = Path('src/components/Navigation.tsx')
nav = nav_path.read_text()
accounts_item = """    { key: 'accounts', label: 'Accounts', icon: WalletCards, active: activeTab === 'manage' && manageDestination === 'Accounts', action: () => openManage('Accounts'), group: 'Money' },\n"""
categories_item = """    { key: 'categories', label: 'Categories', icon: Tags, active: activeTab === 'manage' && manageDestination === 'Categories', action: () => openManage('Categories') },\n"""
if categories_item not in nav:
    if accounts_item not in nav:
        raise SystemExit('Desktop Accounts navigation marker not found')
    nav = nav.replace(accounts_item, accounts_item + categories_item, 1)
nav_path.write_text(nav)

# Migrate old Manage-local navigation assumptions to the V3.5 shell. The helper
# intentionally scans all browser specs so legacy regressions keep testing the
# same behavior through the new navigation rather than through removed tabs.
for test_path in Path('e2e').glob('*.spec.ts'):
    test = test_path.read_text()

    # Mobile Sharing is a primary nav item; desktop Sharing is in the sidebar.
    test = test.replace(
        "if (destination === 'Home' || destination === 'Activity') {",
        "if (destination === 'Home' || destination === 'Activity' || destination === 'Sharing') {",
    )
    test = test.replace(
        "destination: 'Home' | 'Accounts' | 'Activity' | 'Insights' | 'Settings'",
        "destination: 'Home' | 'Accounts' | 'Activity' | 'Insights' | 'Settings' | 'Sharing'",
    )

    goal_sequences = [
        """  await openTab(page, 'Manage');\n  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();\n  await page.getByTestId('page-manage').getByRole('button', { name: 'Goals', exact: true }).click();\n""",
        """  await openTab(page, 'Manage');\n  await page.getByTestId('page-manage').getByRole('button', { name: 'Goals', exact: true }).click();\n""",
    ]
    for sequence in goal_sequences:
        test = test.replace(sequence, "  await openTab(page, 'Goals');\n")

    sharing_sequence = """  await openTab(page, 'Manage');\n  await page.getByTestId('page-manage').getByRole('button', { name: 'Sharing', exact: true }).click();\n"""
    test = test.replace(sharing_sequence, "  await openTab(page, 'Sharing');\n")

    category_sequence = """  await openTab(page, 'Manage');\n  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();\n"""
    test = test.replace(category_sequence, "  await openTab(page, 'Categories');\n")

    add_asset = """  await openTab(page, 'Manage');\n  await page.getByRole('button', { name: 'Add Asset' }).click();\n"""
    add_asset_v35 = """  await openTab(page, 'Manage');\n  await page.getByRole('button', { name: 'Add account', exact: false }).click();\n  await page.getByRole('button', { name: 'Asset / investment', exact: true }).click();\n"""
    test = test.replace(add_asset, add_asset_v35)

    add_liability = """  await openTab(page, 'Manage');\n  await page.getByRole('button', { name: 'Add Liability' }).click();\n"""
    add_liability_v35 = """  await openTab(page, 'Manage');\n  await page.getByRole('button', { name: 'Add account', exact: false }).click();\n  await page.getByRole('button', { name: 'Loan / credit card', exact: true }).click();\n"""
    test = test.replace(add_liability, add_liability_v35)

    test_path.write_text(test)

# A compact account row intentionally hides secondary operations until expanded.
ui_path = Path('e2e/ui-smoke.spec.ts')
ui = ui_path.read_text()
old_pay = """  const payDown = page.getByRole('button', { name: 'Pay Down' }).first();\n  await expect(payDown).toBeVisible();\n"""
new_pay = """  const liabilityToggle = page.locator('[data-testid=\"account-group-loan\"] button[aria-expanded], [data-testid=\"account-group-card\"] button[aria-expanded]').first();\n  await expect(liabilityToggle).toBeVisible();\n  await liabilityToggle.click();\n  const payDown = page.getByRole('button', { name: 'Pay Down' }).first();\n  await expect(payDown).toBeVisible();\n"""
if new_pay not in ui:
    if old_pay not in ui:
        raise SystemExit('Pay Down test marker not found')
    ui = ui.replace(old_pay, new_pay, 1)
ui_path.write_text(ui)

# This regression starts directly on Manage, so route Categories through the
# global V3.5 navigation instead of the removed local segmented control.
clutter_path = Path('e2e/cross-page-clutter.spec.ts')
clutter = clutter_path.read_text()
old_categories_click = "  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();\n"
new_categories_click = """  if (await mobileNav.isVisible()) {\n    await mobileNav.getByRole('button', { name: 'More', exact: true }).click();\n    await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: 'Categories', exact: true }).click();\n  } else {\n    await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Categories', exact: true }).click();\n  }\n"""
if new_categories_click not in clutter:
    if old_categories_click not in clutter:
        raise SystemExit('Categories clutter test marker not found')
    clutter = clutter.replace(old_categories_click, new_categories_click, 1)
clutter_path.write_text(clutter)

print('Applied V3.5 grouped Accounts + Goals and migrated navigation regressions')
