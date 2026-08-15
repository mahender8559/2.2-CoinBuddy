import { expect, test, type Page } from '@playwright/test';

async function prepareDemo(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  const demo = page.getByRole('button', { name: /Load demo data/i });
  await expect(demo).toBeVisible();
  await demo.click();
  await expect(page.getByText('Load Demo Data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Recurring Payments', { exact: true })).toBeVisible({ timeout: 15000 });
}

async function openDestination(page: Page, destination: 'Activity' | 'Accounts') {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (isDesktop) {
    await page.getByTestId('desktop-sidebar').getByRole('button', { name: destination, exact: true }).click();
    return;
  }
  if (destination === 'Activity') {
    await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Activity', exact: true }).click();
    return;
  }
  await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More navigation' }).getByRole('button', { name: destination, exact: true }).click();
}

test('locked V3.5 form design tokens and compact controls are applied to money forms', async ({ page }) => {
  await prepareDemo(page);

  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      controlHeight: styles.getPropertyValue('--cb-form-control-height').trim(),
      controlRadius: styles.getPropertyValue('--cb-form-radius').trim(),
      panelRadius: styles.getPropertyValue('--cb-form-panel-radius').trim(),
      panel: styles.getPropertyValue('--cb-form-panel').trim(),
      field: styles.getPropertyValue('--cb-form-field').trim(),
      blue: styles.getPropertyValue('--cb-form-blue').trim(),
      purple: styles.getPropertyValue('--cb-form-purple').trim(),
    };
  });
  expect(tokens).toEqual({
    controlHeight: '40px',
    controlRadius: '8px',
    panelRadius: '18px',
    panel: '#0b1523',
    field: '#111c2c',
    blue: '#1258e6',
    purple: '#7425c9',
  });

  await openDestination(page, 'Activity');
  await page.getByPlaceholder('Search transactions...').fill('Dinner Out');
  await page.getByRole('button', { name: 'Open transaction Dinner Out', exact: true }).click();
  await page.getByTestId('transaction-detail').getByRole('button', { name: 'Edit transaction', exact: true }).click();

  const transactionSheet = page.getByTestId('transaction-form-sheet');
  await expect(transactionSheet).toHaveAttribute('data-v35-form-system', 'locked');
  const amount = transactionSheet.getByLabel('Transaction amount');
  const amountBox = await amount.boundingBox();
  expect(amountBox).not.toBeNull();
  expect(amountBox!.height).toBeGreaterThanOrEqual(39);
  expect(amountBox!.height).toBeLessThanOrEqual(41);
  const amountStyle = await amount.evaluate(element => {
    const style = getComputedStyle(element);
    return { borderRadius: style.borderRadius, fontSize: style.fontSize };
  });
  expect(amountStyle.borderRadius).toBe('8px');
  expect(amountStyle.fontSize).toBe('14px');
  await transactionSheet.getByRole('button', { name: 'Close transaction form', exact: true }).click();

  await openDestination(page, 'Accounts');
  await page.getByRole('button', { name: /Add account/i }).click();
  await page.getByRole('button', { name: 'Asset / investment', exact: true }).click();
  const accountSheet = page.getByTestId('account-form-sheet');
  await expect(accountSheet).toHaveAttribute('data-v35-form-system', 'locked');
  await accountSheet.getByRole('button', { name: 'Close account form', exact: true }).click();

  await page.getByRole('button', { name: /Car Loan/ }).click();
  await page.getByRole('button', { name: 'Pay down', exact: true }).click();
  const paySheet = page.getByTestId('pay-modal');
  await expect(paySheet).toHaveAttribute('data-v35-form-system', 'locked');
  const payButton = paySheet.getByTestId('confirm-payment');
  const payButtonStyle = await payButton.evaluate(element => getComputedStyle(element).backgroundImage);
  expect(payButtonStyle).toContain('linear-gradient');
  await paySheet.getByRole('button', { name: 'Close payment', exact: true }).click();
});
