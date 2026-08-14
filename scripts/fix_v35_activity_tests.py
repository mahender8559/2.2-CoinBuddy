from pathlib import Path

path = Path('e2e/cross-page-clutter.spec.ts')
text = path.read_text()
old = """  await expect(page.getByRole('option', { name: 'Title (A to Z)' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Notes (A to Z)' })).toHaveCount(0);
  await expect(page.getByTitle('Edit Transaction')).toHaveCount(0);
"""
new = """  await page.getByRole('button', { name: 'Advanced filters' }).click();
  await expect(page.getByRole('option', { name: 'Title (A to Z)' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Notes (A to Z)' })).toHaveCount(0);
  await expect(page.getByTitle('Edit Transaction')).toHaveCount(0);
"""
if new not in text:
    if old not in text:
        raise SystemExit('Activity anti-clutter sort assertions not found')
    text = text.replace(old, new, 1)
path.write_text(text)

affordability_path = Path('e2e/affordability-phase7.spec.ts')
affordability = affordability_path.read_text()
old_pending = """  const pending = page.getByText(/Transfer: HDFC Salary Account to Cash Wallet/).first();
  await expect(pending).toBeVisible();
  await page.getByRole('button', { name: 'Transferred ✓' }).first().click();
"""
new_pending = """  const pending = page.getByText(/Transfer: HDFC Salary Account to Cash Wallet/).first();
  await expect(pending).toBeVisible();
  const pendingToggle = page.getByRole('button', { name: /Needs confirmation/ }).first();
  if (await pendingToggle.getAttribute('aria-expanded') === 'false') await pendingToggle.click();
  await page.getByRole('button', { name: 'Transferred ✓' }).first().click();
"""
if new_pending not in affordability:
    if old_pending not in affordability:
        raise SystemExit('Recurring-transfer pending confirmation test marker not found')
    affordability = affordability.replace(old_pending, new_pending, 1)
affordability_path.write_text(affordability)

print('Updated Activity regressions for collapsed filters and pending confirmations')
