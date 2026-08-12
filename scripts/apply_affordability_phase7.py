from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# Preserve the one-shot "do not demo seed" decision long enough for AppContext to use it.
replace_once(
    'src/db/dbClient.ts',
    "  /** True only when startup found no previously persisted database snapshot. */\n  isNewDatabase?: boolean;\n",
    "  /** True only when startup found no previously persisted database snapshot. */\n  isNewDatabase?: boolean;\n  /** One-shot startup decision used after destructive clear so a fresh empty ledger stays empty. */\n  skipDemoSeed?: boolean;\n",
)
replace_once(
    'src/db/dbClient.ts',
    "function createDriver(db: any, isNewDatabase = false): SqlJsDatabaseDriver {\n  return {\n    rawDb: db,\n    isNewDatabase,\n",
    "function createDriver(db: any, isNewDatabase = false, skipDemoSeed = false): SqlJsDatabaseDriver {\n  return {\n    rawDb: db,\n    isNewDatabase,\n    skipDemoSeed,\n",
)
replace_once(
    'src/db/dbClient.ts',
    "  return createDriver(db, isNewDatabase);\n",
    "  return createDriver(db, isNewDatabase, shouldSkipDemoSeed);\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "        if (driver.isNewDatabase && localStorage.getItem('coinbuddy_skip_demo_seed') !== 'true') {\n",
    "        if (driver.isNewDatabase && !driver.skipDemoSeed) {\n",
)

Path('src/domain/affordability.phase7.integration.test.ts').write_text(r'''import { describe, expect, it } from 'vitest';
import type { Account, AffordabilitySettings, Category, CreditCardInfo, RecurringRule, Transaction } from '../types';
import { projectAffordabilityWithHistory } from './affordabilityPlanner';

const accounts: Account[] = [
  { id: 'bank', name: 'Primary Bank', type: 'asset', group: 'Bank Account', balance: 120000 },
  { id: 'cash', name: 'Cash', type: 'asset', group: 'Cash', balance: 5000 },
  { id: 'invest', name: 'Index Fund', type: 'asset', group: 'Investment', balance: 250000 },
  { id: 'card', name: 'Credit Card', type: 'liability', group: 'Credit Card', balance: 30000, limit: 100000 },
  { id: 'loan', name: 'Bike Loan', type: 'liability', group: 'Loan', balance: 300000, monthlyEMI: 15000, nextEMIDate: '2026-09-05', paymentFrequency: 'MONTHLY' },
];

const categories: Category[] = [
  { id: 'salary', name: 'Salary', icon: 'Banknote', type: 'income' },
  { id: 'rent', name: 'Rent', icon: 'Home', type: 'expense', affordabilityClass: 'COMMITTED' },
  { id: 'utilities', name: 'Utilities', icon: 'Zap', type: 'expense', affordabilityClass: 'NORMAL' },
  { id: 'savings', name: 'Investing', icon: 'Target', type: 'expense', affordabilityClass: 'SAVINGS' },
  { id: 'medical', name: 'Medical', icon: 'Heart', type: 'expense', affordabilityClass: 'IRREGULAR' },
];

const recurringRules: RecurringRule[] = [
  { id: 'salary-rule', title: 'Salary', amount: 80000, transactionType: 'INCOME', toAccountId: 'bank', category: 'salary', frequency: 'MONTHLY', nextDueDate: '2026-09-01', isActive: true, anchorDay: 1 },
  { id: 'rent-rule', title: 'Rent', amount: 25000, transactionType: 'EXPENSE', fromAccountId: 'bank', category: 'rent', frequency: 'MONTHLY', nextDueDate: '2026-09-03', isActive: true, anchorDay: 3 },
  { id: 'internet-rule', title: 'Internet', amount: 2000, transactionType: 'EXPENSE', fromAccountId: 'bank', category: 'utilities', frequency: 'MONTHLY', nextDueDate: '2026-09-06', isActive: true, anchorDay: 6 },
  { id: 'sip-rule', title: 'Monthly SIP', amount: 10000, transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'invest', category: 'savings', frequency: 'MONTHLY', nextDueDate: '2026-09-07', isActive: true, anchorDay: 7 },
];

const transaction = (value: Partial<Transaction> & Pick<Transaction, 'id' | 'title' | 'amount' | 'date' | 'category' | 'type'>): Transaction => ({
  subtitle: '', icon: 'ShoppingBag', is_verified: 1, transaction_type: value.type === 'income' ? 'INCOME' : value.type === 'transfer' ? 'TRANSFER' : 'EXPENSE', ...value,
});

const transactions: Transaction[] = [
  transaction({ id: 'past-grocery', title: 'Already reflected grocery', amount: 3000, date: '2026-08-10T12:00:00', category: 'utilities', type: 'expense', fromAccountId: 'bank' }),
  transaction({ id: 'rent-pending', title: 'Rent', amount: 25000, date: '2026-09-03T12:00:00', category: 'rent', type: 'expense', fromAccountId: 'bank', recurringRuleId: 'rent-rule', dueDate: '2026-09-03', isRecurring: true, is_verified: 0 }),
  transaction({ id: 'card-partial', title: 'Card payment', amount: 5000, date: '2026-09-10T12:00:00', category: 'rent', type: 'transfer', fromAccountId: 'bank', toAccountId: 'card' }),
  transaction({ id: 'loan-partial', title: 'Loan payment', amount: 5000, date: '2026-09-05T12:00:00', category: 'rent', type: 'transfer', fromAccountId: 'bank', toAccountId: 'loan' }),
];

const creditCards: CreditCardInfo[] = [
  { id: 'card', name: 'Credit Card', balance: 30000, dueAmount: 20000, dueDate: '2026-09-10', billingCycleDay: 20, limit: 100000 },
];

const settings = (overrides: Partial<AffordabilitySettings> = {}): AffordabilitySettings => ({
  version: 1,
  setupCompleted: true,
  monthlySavingsTarget: 20000,
  protectedCashReserve: 30000,
  contingencyMode: 'FIXED',
  fixedContingencyAmount: 15000,
  historicalMonths: 6,
  safetyLevel: 'BALANCED',
  ...overrides,
});

function plan(purchaseAmount: number) {
  return projectAffordabilityWithHistory({
    asOfDate: '2026-08-12',
    endDate: '2026-09-24',
    monthCycleDay: 25,
    accounts,
    transactions,
    recurringRules,
    categories,
    creditCards,
    affordabilitySettings: settings(),
    purchaseAmount,
  });
}

describe('affordability phase 7 realistic integration', () => {
  it('projects recurring income, commitments, savings, card dues and EMI fallback without double counting', () => {
    const result = plan(60000).projection;
    expect(result.status).toBe('SAFE');
    expect(result.openingCash).toBe(125000); // investment value must not be treated as spendable cash
    expect(result.expectedIncome).toBe(80000);
    expect(result.expectedExpenses).toBe(62000);
    expect(result.scheduledSavings).toBe(10000);
    expect(result.plannedSavings).toBe(20000);
    expect(result.expensesByClass.COMMITTED).toBe(60000);
    expect(result.expensesByClass.NORMAL).toBe(2000);
    expect(result.projectedOccurrenceCount).toBe(8);
    expect(result.projectedCashBeforeSafety).toBe(123000);
    expect(result.safePurchaseCapacity).toBe(78000);
    expect(result.riskyPurchaseCapacity).toBe(93000);
  });

  it('uses the contingency band for a risky purchase without touching the protected reserve', () => {
    const result = plan(85000).projection;
    expect(result.status).toBe('RISKY');
    expect(result.contingencyUsedByPurchase).toBe(7000);
    expect(result.remainingContingency).toBe(8000);
    expect(result.protectedPlanShortfall).toBe(0);
  });

  it('rejects a purchase that would spend through the protected cash reserve', () => {
    const result = plan(100000).projection;
    expect(result.status).toBe('NOT_AFFORDABLE');
    expect(result.contingencyUsedByPurchase).toBe(15000);
    expect(result.remainingContingency).toBe(0);
    expect(result.protectedPlanShortfall).toBe(7000);
  });
});
''')

Path('src/__tests__/affordabilityBackupPhase7.test.ts').write_text(r'''import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from '../db/sqliteSchema';
import { importLedgerToDatabase, loadAppSettings, loadStateFromDatabase, type SqlJsDatabaseDriver } from '../db/dbClient';
import { AFFORDABILITY_SETTINGS_KEY } from '../domain/affordabilitySettings';
import { validateLedgerSchema } from '../utils/ledgerSchema';

async function createDriver(): Promise<SqlJsDatabaseDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(SQLITE_PRAGMA_SETUP);
  db.exec(CREATE_TABLES_SQL);
  for (const migration of SQLITE_MIGRATIONS) {
    try { db.run(migration); } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
    }
  }
  return {
    rawDb: db,
    async execute(sql, params = []) { params.length ? db.run(sql, params) : db.exec(sql); },
    async query(sql, params = []) {
      const stmt = db.prepare(sql);
      if (params.length) stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
    exportToBase64: () => '',
  };
}

describe('affordability phase 7 backup restore', () => {
  it('restores planner settings, category behavior and recurring schedule together', async () => {
    const driver = await createDriver();
    const backup = {
      schemaVersion: 'coinbuddy-ledger-v3',
      exportedAt: '2026-08-12T00:00:00.000Z',
      accounts: [],
      transactions: [],
      categories: [
        { id: 'medical', name: 'Medical', icon: 'Heart', type: 'expense', affordabilityClass: 'IRREGULAR' },
        { id: 'rent', name: 'Rent', icon: 'Home', type: 'expense', affordabilityClass: 'COMMITTED' },
      ],
      events: [],
      creditCards: [],
      widgets: [],
      loanRevisions: [],
      recurringRules: [
        { id: 'rent-rule', title: 'Rent', amount: 25000, transactionType: 'EXPENSE', category: 'rent', frequency: 'MONTHLY', nextDueDate: '2026-09-03', isActive: true, anchorDay: 3 },
      ],
      affordabilitySettings: {
        version: 1,
        setupCompleted: true,
        monthlySavingsTarget: 15000,
        protectedCashReserve: 40000,
        contingencyMode: 'FIXED',
        fixedContingencyAmount: 8000,
        historicalMonths: 12,
        safetyLevel: 'CONSERVATIVE',
      },
      currency: 'INR',
    };

    expect(validateLedgerSchema(backup)).toBeNull();
    await importLedgerToDatabase(driver, backup);

    const [state, settings] = await Promise.all([loadStateFromDatabase(driver), loadAppSettings(driver)]);
    expect(state.categories.find(category => category.id === 'medical')?.affordabilityClass).toBe('IRREGULAR');
    expect(state.categories.find(category => category.id === 'rent')?.affordabilityClass).toBe('COMMITTED');
    expect(state.recurringRules).toHaveLength(1);
    expect(state.recurringRules[0]).toMatchObject({ id: 'rent-rule', frequency: 'MONTHLY', nextDueDate: '2026-09-03', anchorDay: 3 });
    expect(settings[AFFORDABILITY_SETTINGS_KEY]).toEqual(backup.affordabilitySettings);
  });
});
''')

Path('e2e/affordability-phase7.spec.ts').write_text(r'''import { expect, test, type Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const desktopButton = page.getByTitle(name);
  const mobileButton = page.getByRole('button', { name, exact: true });
  if (await desktopButton.isVisible()) await desktopButton.click();
  else await mobileButton.click();
}

async function prepare(page: Page, clean = false) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ clean }) => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
    if (clean) localStorage.setItem('coinbuddy_skip_demo_seed', 'true');
  }, { clean });
  await page.goto('/');
  await expect(page.getByText('Total Balance', { exact: false }).first()).toBeVisible();
  return errors;
}

async function assertNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('clean-ledger affordability setup survives reload and does not silently demo-seed', async ({ page }) => {
  const errors = await prepare(page, true);
  await openTab(page, 'Insights');

  await expect(page.getByText('Can I Afford It?', { exact: true })).toBeVisible();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  await expect(page.getByText('Not affordable safely', { exact: true })).toBeVisible();
  await expect(page.getByText(/history is unavailable/i)).toBeVisible();

  await page.getByRole('button', { name: 'Safety preferences' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Monthly savings target').fill('10000');
  await page.getByLabel('Protected cash reserve').fill('20000');
  await page.getByRole('button', { name: 'Use fixed amount' }).click();
  await page.getByLabel('Fixed contingency amount').fill('5000');
  await page.getByRole('button', { name: 'Save safety preferences' }).click();
  await expect(page.getByText('Affordability safety preferences saved')).toBeVisible();

  await page.reload();
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Safety preferences' }).click();
  await expect(page.getByLabel('Monthly savings target')).toHaveValue('10000');
  await expect(page.getByLabel('Protected cash reserve')).toHaveValue('20000');
  await expect(page.getByLabel('Fixed contingency amount')).toHaveValue('5000');
  await page.getByRole('button', { name: 'Close safety preferences' }).click();

  await page.getByRole('button', { name: 'Review categories' }).click();
  await expect(page.getByText('No expense categories are available yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Close category review' }).click();
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('category financial behavior can be changed and persists after reload', async ({ page }) => {
  const errors = await prepare(page, false);
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Review categories' }).click();

  const groceries = page.getByLabel('Groceries affordability behavior');
  await expect(groceries).toBeVisible();
  await groceries.selectOption('IRREGULAR');
  await expect(groceries).toHaveValue('IRREGULAR');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(500);

  await page.reload();
  await openTab(page, 'Insights');
  await page.getByRole('button', { name: 'Review categories' }).click();
  await expect(page.getByLabel('Groceries affordability behavior')).toHaveValue('IRREGULAR');
  await assertNoDocumentOverflow(page);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
''')

print('Affordability Phase 7 hardening applied.')
