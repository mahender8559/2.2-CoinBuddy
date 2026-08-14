from pathlib import Path

# V3.5 intentionally opens Insights on a restrained Overview. Existing
# affordability/planning regressions still validate the same functionality,
# but must explicitly enter the Planning workspace first.
planning_files = [
    'e2e/affordability-phase7.spec.ts',
    'e2e/demo-data-v33.spec.ts',
    'e2e/v33-planning-reliability.spec.ts',
    'e2e/v34-shared-finances.spec.ts',
]

for filename in planning_files:
    path = Path(filename)
    text = path.read_text()
    marker = "  await openTab(page, 'Insights');\n"
    replacement = marker + "  await page.getByRole('button', { name: 'Planning', exact: true }).click();\n"
    # Add the Planning hop only where a legacy test opens Insights directly.
    # The replacement is idempotent because the marker inside an already
    # migrated block is immediately followed by the Planning line.
    pieces = text.split(marker)
    if len(pieces) > 1:
        rebuilt = pieces[0]
        for piece in pieces[1:]:
            if piece.startswith("  await page.getByRole('button', { name: 'Planning', exact: true }).click();\n"):
                rebuilt += marker + piece
            else:
                rebuilt += replacement + piece
        text = rebuilt
    path.write_text(text)

# The old v3.4 shared-finance browser test used the former Settings version
# footer only as a route sentinel. V3.5 replaces that footer with the compact
# Settings shell, so keep the route assertion meaningful without requiring old
# presentation copy.
v34_path = Path('e2e/v34-shared-finances.spec.ts')
v34 = v34_path.read_text()
v34 = v34.replace(
    "  await expect(page.getByText('Coin Buddy V3.4', { exact: true })).toBeVisible();\n",
    "  await expect(page.getByRole('heading', { name: 'Settings & Manage ⚙️', exact: true })).toBeVisible();\n",
)
v34_path.write_text(v34)

print('Migrated legacy Insights regressions to V3.5 Planning and Settings shell')
