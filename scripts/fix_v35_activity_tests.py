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
print('Updated Activity anti-clutter test for collapsed advanced filters')
