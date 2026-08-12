from pathlib import Path

p = Path('e2e/affordability-phase7.spec.ts')
text = p.read_text()
if "real Goals persist and feed affordability protection" not in text:
    text += r'''

test('real Goals persist and feed affordability protection', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await page.getByRole('button', { name: 'Goals', exact: true }).click();
  await page.getByRole('button', { name: 'Add goal' }).click();
  await page.getByLabel('Goal name').fill('Laptop Fund');
  await page.getByLabel('Target amount').fill('80000');
  await page.getByLabel('Monthly contribution').fill('5000');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByText('Laptop Fund', { exact: true })).toBeVisible();
  await expect(page.getByText(/Planner protects.*5,000/i)).toBeVisible();

  await page.reload();
  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await page.getByRole('button', { name: 'Goals', exact: true }).click();
  await expect(page.getByText('Laptop Fund', { exact: true })).toBeVisible();

  await openTab(page, 'Insights');
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  const goalProtection = page.getByText('Goals protection:', { exact: true }).locator('..');
  await expect(goalProtection).toContainText(/5,000/);
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('investment SIP setup creates a recurring transfer rule', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Add Asset', exact: true }).click();
  await page.getByPlaceholder('e.g. Primary Checking').fill('Retirement SIP');
  await page.getByRole('button', { name: 'Investment', exact: true }).click();
  await page.getByLabel('Total Invested Amount').fill('10000');
  await page.getByLabel('Current Market Value').fill('10000');
  await page.getByLabel('Monthly SIP Amount').fill('5000');
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-05`;
  await page.getByLabel('Next SIP Date').fill(nextDate);
  await page.getByLabel('SIP Funding Account').selectOption('acc_sbi_01');
  await page.getByRole('button', { name: 'Add Asset', exact: true }).last().click();
  await expect(page.getByText('Retirement SIP', { exact: true })).toBeVisible();

  await openTab(page, 'Settings');
  await expect(page.getByText('SIP: Retirement SIP', { exact: true })).toBeVisible();
  await expect(page.getByText(/5,000/).first()).toBeVisible();
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
'''
p.write_text(text)
print('Added v3.2 Goals and SIP browser tests.')
