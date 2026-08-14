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
new_branch = """      ) : mainTab === 'Sharing' ? (\n        <SharingPanel />\n      ) : activeTab === 'Goals' ? (\n        <V35GoalsPanel searchQuery={searchQuery} />\n      ) : (\n        <>\n"""
if new_branch not in text:
    if old_branch not in text:
        raise SystemExit('Manage branch marker not found')
    text = text.replace(old_branch, new_branch, 1)
text = text.replace('Categories & Goals</h1>', 'Categories</h1>', 1)
text = text.replace('<GoalsPanel searchQuery={searchQuery} />', '<V35GoalsPanel searchQuery={searchQuery} />')
path.write_text(text)

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

print('Applied V3.5 grouped Accounts + Goals and migrated navigation regressions')
