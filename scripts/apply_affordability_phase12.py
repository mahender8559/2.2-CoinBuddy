from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Phase 1: category financial behavior model
# ---------------------------------------------------------------------------

types_path = Path('src/types.ts')
types = types_path.read_text(encoding='utf-8')
types = replace_once(
    types,
    "export type Category = {\n  id: string;\n  name: string;\n  icon: IconName;\n  budget?: number;\n  isRollover?: boolean;\n  rolloverAccountId?: string;\n  tags?: string[];\n  group?: 'Essential' | 'Leisure' | 'Savings';\n  type?: 'expense' | 'income';\n};",
    "export type AffordabilityClass = 'COMMITTED' | 'NORMAL' | 'FLEXIBLE' | 'IRREGULAR' | 'SAVINGS';\n\nexport type Category = {\n  id: string;\n  name: string;\n  icon: IconName;\n  budget?: number;\n  isRollover?: boolean;\n  rolloverAccountId?: string;\n  tags?: string[];\n  /** @deprecated Legacy presentation grouping kept only for old backups/UI compatibility. */\n  group?: 'Essential' | 'Leisure' | 'Savings';\n  /** Financial behavior used by planning/projection features. */\n  affordabilityClass?: AffordabilityClass;\n  type?: 'expense' | 'income';\n};",
    'types Category model',
)
types_path.write_text(types, encoding='utf-8')

category_domain = r'''import type { AffordabilityClass, Category } from '../types';

export const AFFORDABILITY_CLASSES: readonly AffordabilityClass[] = [
  'COMMITTED',
  'NORMAL',
  'FLEXIBLE',
  'IRREGULAR',
  'SAVINGS',
] as const;

const CLASS_SET = new Set<string>(AFFORDABILITY_CLASSES);

/**
 * Converts persisted/legacy category metadata into the planning classification.
 * We intentionally do not guess from category names. The old three-way grouping
 * is used only as a safe migration hint and can be removed after legacy UI is
 * retired.
 */
export function normalizeAffordabilityClass(
  value?: string | null,
  legacyGroup?: string | null,
  categoryType?: string | null,
): AffordabilityClass {
  const explicit = String(value ?? '').trim().toUpperCase();
  if (CLASS_SET.has(explicit)) return explicit as AffordabilityClass;

  const legacy = String(legacyGroup ?? '').trim().toLowerCase();
  if (legacy === 'savings') return 'SAVINGS';
  if (legacy === 'leisure') return 'FLEXIBLE';
  if (legacy === 'essential') return 'NORMAL';

  // Income categories do not consume an expense class in the affordability
  // engine. NORMAL is the neutral persisted fallback for them.
  if (String(categoryType ?? '').trim().toLowerCase() === 'income') return 'NORMAL';
  return 'NORMAL';
}

export function ensureCategoryAffordabilityClass<T extends Category>(category: T): T {
  return {
    ...category,
    affordabilityClass: normalizeAffordabilityClass(
      category.affordabilityClass,
      category.group,
      category.type,
    ),
  };
}
'''
Path('src/domain/categoryAffordability.ts').write_text(category_domain, encoding='utf-8')

schema_path = Path('src/db/sqliteSchema.ts')
schema = schema_path.read_text(encoding='utf-8')
schema = replace_once(
    schema,
    "  tags_json TEXT,\n  group_name TEXT\n);",
    "  tags_json TEXT,\n  group_name TEXT,\n  affordability_class TEXT CHECK(affordability_class IN ('COMMITTED', 'NORMAL', 'FLEXIBLE', 'IRREGULAR', 'SAVINGS'))\n);",
    'categories schema affordability column',
)
schema = replace_once(
    schema,
    "  `ALTER TABLE recurring_rules ADD COLUMN anchor_day INTEGER;`,\n];",
    "  `ALTER TABLE recurring_rules ADD COLUMN anchor_day INTEGER;`,\n  `ALTER TABLE categories ADD COLUMN affordability_class TEXT;`,\n  `UPDATE categories SET affordability_class = CASE LOWER(COALESCE(group_name, '')) WHEN 'savings' THEN 'SAVINGS' WHEN 'leisure' THEN 'FLEXIBLE' WHEN 'essential' THEN 'NORMAL' ELSE 'NORMAL' END WHERE affordability_class IS NULL OR affordability_class = '';`,\n];",
    'category affordability migrations',
)
schema = replace_once(
    schema,
    "  rollover_account_id?: string | null;\n}",
    "  rollover_account_id?: string | null;\n  affordability_class?: string | null;\n}",
    'CategoryRow affordability field',
)
schema_path.write_text(schema, encoding='utf-8')

client_path = Path('src/db/dbClient.ts')
client = client_path.read_text(encoding='utf-8')
client = replace_once(
    client,
    "import { advanceRecurringDate, toLocalDateKey } from '../domain/recurring';",
    "import { advanceRecurringDate, toLocalDateKey } from '../domain/recurring';\nimport { normalizeAffordabilityClass } from '../domain/categoryAffordability';",
    'dbClient category affordability import',
)
client = replace_once(
    client,
    "`INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, tags_json, group_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,\n      [category.id, category.name, normalizeDemoCategoryType(category.type), category.icon ?? category.icon_name ?? 'Tag', Number(category.budget ?? 0), category.isRollover ? 1 : 0, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null]",
    "`INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, tags_json, group_name, affordability_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,\n      [category.id, category.name, normalizeDemoCategoryType(category.type), category.icon ?? category.icon_name ?? 'Tag', Number(category.budget ?? 0), category.isRollover ? 1 : 0, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null, normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type)]",
    'demo category persistence',
)
client = replace_once(
    client,
    "    group: row.group_name ?? undefined,\n    type: row.type?.toLowerCase() === 'income' ? 'income' : 'expense',",
    "    group: row.group_name ?? undefined,\n    affordabilityClass: normalizeAffordabilityClass(row.affordability_class, row.group_name, row.type),\n    type: row.type?.toLowerCase() === 'income' ? 'income' : 'expense',",
    'normalizeCategoryRow affordability field',
)
client = replace_once(
    client,
    "`INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, rollover_account_id, tags_json, group_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,\n    [category.id, category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null]",
    "`INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, rollover_account_id, tags_json, group_name, affordability_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,\n    [category.id, category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null, normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type)]",
    'insertCategoryRow affordability persistence',
)
client = replace_once(
    client,
    "`UPDATE categories SET name = ?, type = ?, icon_name = ?, budget = ?, is_rollover = ?, rollover_account_id = ?, tags_json = ?, group_name = ? WHERE id = ?;`,\n    [category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null, id]",
    "`UPDATE categories SET name = ?, type = ?, icon_name = ?, budget = ?, is_rollover = ?, rollover_account_id = ?, tags_json = ?, group_name = ?, affordability_class = ? WHERE id = ?;`,\n    [category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null, normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type), id]",
    'updateCategoryRow affordability persistence',
)
client = replace_once(
    client,
    "executePreparedRows(driver, `INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, rollover_account_id, tags_json, group_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, categories.map(category => [category.id, category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null]));",
    "executePreparedRows(driver, `INSERT INTO categories (id, name, type, icon_name, budget, is_rollover, rollover_account_id, tags_json, group_name, affordability_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, categories.map(category => [category.id, category.name, category.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE', category.icon, category.budget ?? 0, category.isRollover ? 1 : 0, category.rolloverAccountId ?? null, category.tags ? JSON.stringify(category.tags) : null, category.group ?? null, normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type)]));",
    'ledger import category affordability persistence',
)
client_path.write_text(client, encoding='utf-8')

context_path = Path('src/context/AppContext.tsx')
context = context_path.read_text(encoding='utf-8')
context = replace_once(
    context,
    "import { advanceRecurringDate, shouldCreateInitialOccurrence, toLocalDateKey } from '../domain/recurring';",
    "import { advanceRecurringDate, shouldCreateInitialOccurrence, toLocalDateKey } from '../domain/recurring';\nimport { ensureCategoryAffordabilityClass } from '../domain/categoryAffordability';",
    'AppContext category affordability import',
)
context = replace_once(
    context,
    "  const addCategory = (category: Omit<Category, 'id'>) => {\n    const newCategory = { ...category, id: crypto.randomUUID() };",
    "  const addCategory = (category: Omit<Category, 'id'>) => {\n    const newCategory: Category = ensureCategoryAffordabilityClass({ ...category, id: crypto.randomUUID() });",
    'AppContext addCategory normalization',
)
context = replace_once(
    context,
    "  const updateCategory = (id: string, category: Omit<Category, 'id'>) => {\n    setCategories(cats => cats.map(c => c.id === id ? { ...c, ...category } : c));\n    if (dbDriver) {\n      persistDbAction(() => updateCategoryRow(dbDriver, id, category as Category));\n    }\n  };",
    "  const updateCategory = (id: string, category: Omit<Category, 'id'>) => {\n    const normalizedCategory: Category = ensureCategoryAffordabilityClass({ ...category, id });\n    setCategories(cats => cats.map(c => c.id === id ? { ...c, ...normalizedCategory } : c));\n    if (dbDriver) {\n      persistDbAction(() => updateCategoryRow(dbDriver, id, normalizedCategory));\n    }\n  };",
    'AppContext updateCategory normalization',
)
context_path.write_text(context, encoding='utf-8')

# ---------------------------------------------------------------------------
# Phase 2: pure affordability projection engine
# ---------------------------------------------------------------------------

affordability_domain = r'''import type {
  Account,
  AffordabilityClass,
  Category,
  CreditCardInfo,
  RecurringRule,
  Transaction,
} from '../types';
import { advanceRecurringDate } from './recurring';
import { normalizeAffordabilityClass } from './categoryAffordability';

export type AffordabilityStatus = 'SAFE' | 'RISKY' | 'NOT_AFFORDABLE';

export interface AffordabilityProjectionSettings {
  /** Savings amount to protect over this projection horizon. */
  plannedSavingsTarget: number;
  /** Buffer supplied by the historical/automatic estimator (Phase 5) or user override. */
  contingencyBuffer: number;
  /** Liquid cash the user does not want the planner to consume. */
  protectedCashReserve: number;
}

export interface AffordabilityInput {
  /** Date represented by the current account-balance snapshot (YYYY-MM-DD). */
  asOfDate: string;
  /** Inclusive final date for the purchase projection (YYYY-MM-DD). */
  endDate: string;
  accounts: Account[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  categories: Category[];
  creditCards?: CreditCardInfo[];
  settings: AffordabilityProjectionSettings;
  purchaseAmount: number;
}

export interface AffordabilityResult {
  status: AffordabilityStatus;
  purchaseAmount: number;
  openingCash: number;
  expectedIncome: number;
  otherCashInflows: number;
  expectedExpenses: number;
  scheduledSavings: number;
  plannedSavings: number;
  contingencyBuffer: number;
  protectedCashReserve: number;
  projectedCashBeforeSafety: number;
  safePurchaseCapacity: number;
  riskyPurchaseCapacity: number;
  remainingCapacity: number;
  contingencyUsedByPurchase: number;
  remainingContingency: number;
  protectedPlanShortfall: number;
  expensesByClass: Record<AffordabilityClass, number>;
  projectedOccurrenceCount: number;
  reasons: string[];
}

const LIQUID_ACCOUNT_GROUPS = new Set([
  'bank account',
  'cash',
  'wallet',
  'savings account',
  'current account',
  'checking account',
]);

const ZERO_EXPENSES_BY_CLASS = (): Record<AffordabilityClass, number> => ({
  COMMITTED: 0,
  NORMAL: 0,
  FLEXIBLE: 0,
  IRREGULAR: 0,
  SAVINGS: 0,
});

function nonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function dateKey(value: string): string {
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
  if (direct) return direct;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid affordability date: ${value}`);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function assertDateRange(asOfDate: string, endDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Affordability projection dates must use YYYY-MM-DD.');
  }
  if (endDate < asOfDate) throw new Error('Affordability projection end date cannot be before the as-of date.');
}

export function isLiquidCashAccount(account: Account): boolean {
  if (account.type !== 'asset' || account.is_archived === 1) return false;
  return LIQUID_ACCOUNT_GROUPS.has(String(account.group ?? '').trim().toLowerCase());
}

function normalizedCategoryRef(value?: string): string {
  return String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

function findCategory(reference: string | undefined, categories: Category[]): Category | undefined {
  if (!reference) return undefined;
  const direct = categories.find(category => category.id === reference);
  if (direct) return direct;
  const normalized = normalizedCategoryRef(reference);
  return categories.find(category => normalizedCategoryRef(category.name) === normalized);
}

function categoryClass(reference: string | undefined, categories: Category[]): AffordabilityClass {
  const category = findCategory(reference, categories);
  return normalizeAffordabilityClass(category?.affordabilityClass, category?.group, category?.type);
}

function transactionType(transaction: Transaction): 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'EXCLUDED' {
  const type = String(transaction.transaction_type ?? transaction.type ?? '').toUpperCase();
  if (type === 'INCOME' || type === 'EXPENSE' || type === 'TRANSFER') return type;
  return 'EXCLUDED';
}

function recurringTransaction(rule: RecurringRule, dueDate: string): Transaction {
  const type = rule.transactionType;
  return {
    id: `projection:${rule.id}:${dueDate}`,
    title: rule.title,
    subtitle: rule.subtitle ?? '',
    amount: nonNegative(rule.amount),
    date: `${dueDate}T12:00:00`,
    category: rule.category ?? '#uncategorized',
    icon: rule.icon ?? 'Wallet',
    type: type === 'INCOME' ? 'income' : type === 'TRANSFER' ? 'transfer' : 'expense',
    account: rule.account,
    fromAccountId: rule.fromAccountId ?? (type === 'EXPENSE' ? rule.account : undefined),
    toAccountId: rule.toAccountId ?? (type === 'INCOME' ? rule.account : undefined),
    isRecurring: true,
    recurrenceFrequency: rule.frequency,
    recurringRuleId: rule.id,
    dueDate,
    eventId: rule.eventId,
    transaction_type: type,
    is_verified: 0,
    notes: rule.notes,
  };
}

function projectedTransactionDate(transaction: Transaction): string {
  return transaction.dueDate ?? dateKey(transaction.date);
}

function shouldProjectExistingTransaction(transaction: Transaction, asOfDate: string, endDate: string): boolean {
  if (transactionType(transaction) === 'EXCLUDED') return false;
  const dueDate = projectedTransactionDate(transaction);
  if (dueDate > endDate) return false;

  // Confirmed transactions on/before the balance snapshot are already reflected
  // in Account.balance. Pending recurring occurrences are not, so they remain a
  // future obligation even when due today or overdue.
  if (transaction.is_verified === 0) {
    return Boolean(transaction.recurringRuleId || transaction.isRecurring) && dueDate >= asOfDate;
  }
  return dueDate > asOfDate;
}

interface ProjectionAccumulator {
  expectedIncome: number;
  otherCashInflows: number;
  expectedExpenses: number;
  scheduledSavings: number;
  expensesByClass: Record<AffordabilityClass, number>;
  coveredLiabilityIds: Set<string>;
  occurrenceCount: number;
}

function applyProjectedTransaction(
  transaction: Transaction,
  accountsById: Map<string, Account>,
  liquidAccountIds: Set<string>,
  categories: Category[],
  accumulator: ProjectionAccumulator,
): void {
  const type = transactionType(transaction);
  if (type === 'EXCLUDED') return;
  const amount = nonNegative(transaction.amount);
  if (amount <= 0) return;

  const fromId = transaction.fromAccountId ?? (type === 'EXPENSE' ? transaction.account : undefined);
  const toId = transaction.toAccountId ?? (type === 'INCOME' ? transaction.account : undefined);
  const fromLiquid = Boolean(fromId && liquidAccountIds.has(fromId));
  const toLiquid = Boolean(toId && liquidAccountIds.has(toId));
  const classification = categoryClass(transaction.category, categories);

  if (type === 'INCOME') {
    if (toLiquid) accumulator.expectedIncome += amount;
    accumulator.occurrenceCount += 1;
    return;
  }

  if (type === 'EXPENSE') {
    if (fromLiquid) {
      if (classification === 'SAVINGS') {
        accumulator.scheduledSavings += amount;
      } else {
        accumulator.expectedExpenses += amount;
        accumulator.expensesByClass[classification] += amount;
      }
    }
    accumulator.occurrenceCount += 1;
    return;
  }

  // Transfers are evaluated by their net effect on liquid cash. Asset-to-asset
  // liquid transfers therefore net to zero, while a payment from bank cash to a
  // liability or investment reduces spendable cash without pretending it is
  // ordinary consumption.
  const liquidDelta = (toLiquid ? amount : 0) - (fromLiquid ? amount : 0);
  if (liquidDelta > 0) {
    accumulator.otherCashInflows += liquidDelta;
  } else if (liquidDelta < 0) {
    const outflow = Math.abs(liquidDelta);
    const destination = toId ? accountsById.get(toId) : undefined;
    if (classification === 'SAVINGS' || String(destination?.group ?? '').toLowerCase() === 'investment') {
      accumulator.scheduledSavings += outflow;
    } else {
      accumulator.expectedExpenses += outflow;
      accumulator.expensesByClass[classification] += outflow;
    }
    if (destination?.type === 'liability' && toId) accumulator.coveredLiabilityIds.add(toId);
  }
  accumulator.occurrenceCount += 1;
}

function addCommittedFallbackExpense(accumulator: ProjectionAccumulator, amount: number): void {
  const value = nonNegative(amount);
  if (value <= 0) return;
  accumulator.expectedExpenses += value;
  accumulator.expensesByClass.COMMITTED += value;
  accumulator.occurrenceCount += 1;
}

function projectRecurringRules(
  recurringRules: RecurringRule[],
  existingOccurrenceKeys: Set<string>,
  asOfDate: string,
  endDate: string,
): Transaction[] {
  const projected: Transaction[] = [];
  for (const rule of recurringRules) {
    if (!rule.isActive || nonNegative(rule.amount) <= 0) continue;
    let dueDate = rule.nextDueDate;
    let guard = 0;
    while (dueDate < asOfDate && guard++ < 240) {
      dueDate = advanceRecurringDate(dueDate, rule.frequency, rule.anchorDay);
    }
    while (dueDate <= endDate && guard++ < 240) {
      const key = `${rule.id}:${dueDate}`;
      if (!existingOccurrenceKeys.has(key)) projected.push(recurringTransaction(rule, dueDate));
      dueDate = advanceRecurringDate(dueDate, rule.frequency, rule.anchorDay);
    }
  }
  return projected;
}

function projectLoanFallbacks(
  accounts: Account[],
  coveredLiabilityIds: Set<string>,
  creditCardIds: Set<string>,
  asOfDate: string,
  endDate: string,
  accumulator: ProjectionAccumulator,
): void {
  for (const account of accounts) {
    if (
      account.type !== 'liability' ||
      account.is_archived === 1 ||
      creditCardIds.has(account.id) ||
      coveredLiabilityIds.has(account.id) ||
      nonNegative(account.monthlyEMI) <= 0 ||
      !account.nextEMIDate
    ) continue;

    let dueDate = dateKey(account.nextEMIDate);
    let guard = 0;
    while (dueDate < asOfDate && guard++ < 240) {
      dueDate = advanceRecurringDate(dueDate, account.paymentFrequency ?? 'MONTHLY');
    }
    while (dueDate <= endDate && guard++ < 240) {
      addCommittedFallbackExpense(accumulator, nonNegative(account.monthlyEMI));
      dueDate = advanceRecurringDate(dueDate, account.paymentFrequency ?? 'MONTHLY');
    }
  }
}

export function projectAffordability(input: AffordabilityInput): AffordabilityResult {
  assertDateRange(input.asOfDate, input.endDate);

  const accounts = input.accounts.filter(account => account.is_archived !== 1);
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const liquidAccounts = accounts.filter(isLiquidCashAccount);
  const liquidAccountIds = new Set(liquidAccounts.map(account => account.id));
  const openingCash = Math.max(0, liquidAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0));

  const accumulator: ProjectionAccumulator = {
    expectedIncome: 0,
    otherCashInflows: 0,
    expectedExpenses: 0,
    scheduledSavings: 0,
    expensesByClass: ZERO_EXPENSES_BY_CLASS(),
    coveredLiabilityIds: new Set<string>(),
    occurrenceCount: 0,
  };

  const existingOccurrenceKeys = new Set(
    input.transactions
      .filter(transaction => transaction.recurringRuleId && transaction.dueDate)
      .map(transaction => `${transaction.recurringRuleId}:${transaction.dueDate}`),
  );

  const projectedExisting = input.transactions.filter(transaction =>
    shouldProjectExistingTransaction(transaction, input.asOfDate, input.endDate),
  );
  for (const transaction of projectedExisting) {
    applyProjectedTransaction(transaction, accountsById, liquidAccountIds, input.categories, accumulator);
  }

  const projectedRules = projectRecurringRules(
    input.recurringRules,
    existingOccurrenceKeys,
    input.asOfDate,
    input.endDate,
  );
  for (const transaction of projectedRules) {
    applyProjectedTransaction(transaction, accountsById, liquidAccountIds, input.categories, accumulator);
  }

  const creditCards = input.creditCards ?? [];
  const creditCardIds = new Set(creditCards.map(card => card.id));
  for (const card of creditCards) {
    if (
      nonNegative(card.dueAmount) > 0 &&
      card.dueDate &&
      dateKey(card.dueDate) <= input.endDate &&
      !accumulator.coveredLiabilityIds.has(card.id)
    ) {
      addCommittedFallbackExpense(accumulator, card.dueAmount);
      accumulator.coveredLiabilityIds.add(card.id);
    }
  }

  projectLoanFallbacks(
    accounts,
    accumulator.coveredLiabilityIds,
    creditCardIds,
    input.asOfDate,
    input.endDate,
    accumulator,
  );

  const plannedSavingsTarget = nonNegative(input.settings.plannedSavingsTarget);
  const plannedSavings = Math.max(plannedSavingsTarget, accumulator.scheduledSavings);
  const contingencyBuffer = nonNegative(input.settings.contingencyBuffer);
  const protectedCashReserve = nonNegative(input.settings.protectedCashReserve);
  const purchaseAmount = nonNegative(input.purchaseAmount);

  const projectedCashBeforeSafety = Math.max(
    0,
    openingCash + accumulator.expectedIncome + accumulator.otherCashInflows - accumulator.expectedExpenses - plannedSavings,
  );
  const safePurchaseCapacity = Math.max(0, projectedCashBeforeSafety - contingencyBuffer - protectedCashReserve);
  const riskyPurchaseCapacity = Math.max(0, projectedCashBeforeSafety - protectedCashReserve);
  const remainingCapacity = safePurchaseCapacity - purchaseAmount;
  const contingencyUsedByPurchase = Math.min(contingencyBuffer, Math.max(0, purchaseAmount - safePurchaseCapacity));
  const remainingContingency = Math.max(0, contingencyBuffer - contingencyUsedByPurchase);
  const protectedPlanShortfall = Math.max(0, purchaseAmount - riskyPurchaseCapacity);

  let status: AffordabilityStatus;
  const reasons: string[] = [];
  if (purchaseAmount <= safePurchaseCapacity) {
    status = 'SAFE';
    reasons.push('The purchase fits within safe capacity after savings, contingency, and protected cash are reserved.');
  } else if (purchaseAmount <= riskyPurchaseCapacity) {
    status = 'RISKY';
    reasons.push('The purchase is possible without using protected cash, but it consumes part of the contingency buffer.');
  } else {
    status = 'NOT_AFFORDABLE';
    reasons.push('The purchase would require using protected cash or money already reserved by the financial plan.');
  }
  if (accumulator.scheduledSavings > plannedSavingsTarget) {
    reasons.push('Scheduled savings/investment outflows are higher than the supplied savings target, so the larger amount was protected.');
  }

  return {
    status,
    purchaseAmount,
    openingCash,
    expectedIncome: accumulator.expectedIncome,
    otherCashInflows: accumulator.otherCashInflows,
    expectedExpenses: accumulator.expectedExpenses,
    scheduledSavings: accumulator.scheduledSavings,
    plannedSavings,
    contingencyBuffer,
    protectedCashReserve,
    projectedCashBeforeSafety,
    safePurchaseCapacity,
    riskyPurchaseCapacity,
    remainingCapacity,
    contingencyUsedByPurchase,
    remainingContingency,
    protectedPlanShortfall,
    expensesByClass: accumulator.expensesByClass,
    projectedOccurrenceCount: accumulator.occurrenceCount,
    reasons,
  };
}
'''
Path('src/domain/affordability.ts').write_text(affordability_domain, encoding='utf-8')

category_tests = r'''import { describe, expect, it } from 'vitest';
import { ensureCategoryAffordabilityClass, normalizeAffordabilityClass } from './categoryAffordability';


describe('category affordability classification', () => {
  it('preserves an explicit new affordability class', () => {
    expect(normalizeAffordabilityClass('IRREGULAR', 'Essential', 'expense')).toBe('IRREGULAR');
  });

  it('migrates legacy Savings, Leisure, and Essential groups without name guessing', () => {
    expect(normalizeAffordabilityClass(undefined, 'Savings', 'expense')).toBe('SAVINGS');
    expect(normalizeAffordabilityClass(undefined, 'Leisure', 'expense')).toBe('FLEXIBLE');
    expect(normalizeAffordabilityClass(undefined, 'Essential', 'expense')).toBe('NORMAL');
  });

  it('uses NORMAL as the neutral fallback for unclassified categories', () => {
    expect(normalizeAffordabilityClass(undefined, undefined, 'expense')).toBe('NORMAL');
    expect(normalizeAffordabilityClass(undefined, undefined, 'income')).toBe('NORMAL');
  });

  it('normalizes an in-memory category immediately', () => {
    const category = ensureCategoryAffordabilityClass({
      id: 'repairs', name: 'Repairs', icon: 'Wrench', type: 'expense', affordabilityClass: 'IRREGULAR',
    });
    expect(category.affordabilityClass).toBe('IRREGULAR');
  });
});
'''
Path('src/domain/categoryAffordability.test.ts').write_text(category_tests, encoding='utf-8')

affordability_tests = r'''import { describe, expect, it } from 'vitest';
import type { Account, Category, CreditCardInfo, RecurringRule, Transaction } from '../types';
import { projectAffordability } from './affordability';

const bank = (id: string, balance: number): Account => ({ id, name: id, type: 'asset', balance, group: 'Bank Account' });
const cash = (id: string, balance: number): Account => ({ id, name: id, type: 'asset', balance, group: 'Cash' });
const investment = (id: string, balance: number): Account => ({ id, name: id, type: 'asset', balance, group: 'Investment' });
const liability = (id: string, balance = 0, extra: Partial<Account> = {}): Account => ({ id, name: id, type: 'liability', balance, group: 'Loan', ...extra });

const category = (id: string, affordabilityClass: Category['affordabilityClass']): Category => ({
  id, name: id, icon: 'Tag', type: 'expense', affordabilityClass,
});

const tx = (partial: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date' | 'type'>): Transaction => ({
  title: partial.id,
  subtitle: '',
  category: '#general',
  icon: 'Wallet',
  ...partial,
});

const rule = (partial: Partial<RecurringRule> & Pick<RecurringRule, 'id' | 'amount' | 'transactionType' | 'nextDueDate'>): RecurringRule => ({
  title: partial.id,
  frequency: 'MONTHLY',
  isActive: true,
  ...partial,
});

function run(overrides: Partial<Parameters<typeof projectAffordability>[0]> = {}) {
  return projectAffordability({
    asOfDate: '2026-08-12',
    endDate: '2026-09-30',
    accounts: [bank('bank', 40000)],
    transactions: [],
    recurringRules: [],
    categories: [
      category('general', 'NORMAL'),
      category('rent', 'COMMITTED'),
      category('sip', 'SAVINGS'),
    ],
    creditCards: [],
    settings: { plannedSavingsTarget: 0, contingencyBuffer: 0, protectedCashReserve: 0 },
    purchaseAmount: 0,
    ...overrides,
  });
}

describe('projectAffordability', () => {
  it('counts only liquid cash accounts as opening spendable cash', () => {
    const result = run({
      accounts: [bank('bank', 40000), cash('wallet', 5000), investment('fund', 60000), { id: 'house', name: 'House', type: 'asset', balance: 1000000, group: 'Physical Asset' }, liability('card', 10000)],
    });
    expect(result.openingCash).toBe(45000);
  });

  it('projects active recurring income and expenses inside the horizon', () => {
    const result = run({
      recurringRules: [
        rule({ id: 'salary', amount: 57000, transactionType: 'INCOME', account: 'bank', nextDueDate: '2026-09-01' }),
        rule({ id: 'rent-rule', amount: 20000, transactionType: 'EXPENSE', account: 'bank', category: 'rent', nextDueDate: '2026-09-05' }),
      ],
    });
    expect(result.expectedIncome).toBe(57000);
    expect(result.expectedExpenses).toBe(20000);
    expect(result.expensesByClass.COMMITTED).toBe(20000);
  });

  it('does not treat transfers between liquid accounts as spending', () => {
    const result = run({
      accounts: [bank('bank', 40000), cash('wallet', 5000)],
      transactions: [tx({ id: 'move', amount: 10000, date: '2026-09-01T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'wallet', is_verified: 1 })],
    });
    expect(result.expectedExpenses).toBe(0);
    expect(result.otherCashInflows).toBe(0);
  });

  it('protects transfers to investments as scheduled savings', () => {
    const result = run({
      accounts: [bank('bank', 40000), investment('fund', 10000)],
      transactions: [tx({ id: 'sip-transfer', amount: 10000, date: '2026-09-01T12:00:00', type: 'transfer', transaction_type: 'TRANSFER', category: 'sip', fromAccountId: 'bank', toAccountId: 'fund', is_verified: 1 })],
      settings: { plannedSavingsTarget: 5000, contingencyBuffer: 0, protectedCashReserve: 0 },
    });
    expect(result.scheduledSavings).toBe(10000);
    expect(result.plannedSavings).toBe(10000);
    expect(result.expectedExpenses).toBe(0);
  });

  it('does not double-count a recurring occurrence already generated by the ledger', () => {
    const result = run({
      transactions: [tx({ id: 'pending-rent', amount: 5000, date: '2026-09-01T12:00:00', dueDate: '2026-09-01', type: 'expense', transaction_type: 'EXPENSE', category: 'rent', account: 'bank', fromAccountId: 'bank', recurringRuleId: 'rent-rule', isRecurring: true, is_verified: 0 })],
      recurringRules: [rule({ id: 'rent-rule', amount: 5000, transactionType: 'EXPENSE', account: 'bank', category: 'rent', nextDueDate: '2026-09-01' })],
    });
    expect(result.expectedExpenses).toBe(5000);
  });

  it('includes a credit-card due as a committed future cash obligation', () => {
    const cardAccount = liability('cc', 12000, { group: 'Credit Card' });
    const card: CreditCardInfo = { id: 'cc', name: 'Card', balance: 12000, dueAmount: 8000, dueDate: '2026-09-10', billingCycleDay: 10, limit: 100000 };
    const result = run({ accounts: [bank('bank', 40000), cardAccount], creditCards: [card] });
    expect(result.expectedExpenses).toBe(8000);
    expect(result.expensesByClass.COMMITTED).toBe(8000);
  });

  it('uses loan EMI metadata as a fallback obligation when no explicit payment covers it', () => {
    const loan = liability('loan', 100000, { monthlyEMI: 5000, nextEMIDate: '2026-09-05', paymentFrequency: 'MONTHLY' });
    const result = run({ accounts: [bank('bank', 40000), loan] });
    expect(result.expectedExpenses).toBe(5000);
  });

  it('ignores opening balances and accounting adjustments in future spending', () => {
    const result = run({
      transactions: [
        tx({ id: 'opening', amount: 10000, date: '2026-09-01T12:00:00', type: 'income', transaction_type: 'OPENING_BALANCE', toAccountId: 'bank', isOpeningBalance: true, is_verified: 1 }),
        tx({ id: 'adjust', amount: 5000, date: '2026-09-02T12:00:00', type: 'expense', transaction_type: 'BALANCE_ADJUSTMENT', fromAccountId: 'bank', is_verified: 1 }),
      ],
    });
    expect(result.expectedIncome).toBe(0);
    expect(result.expectedExpenses).toBe(0);
  });

  it('classifies SAFE, RISKY, and NOT_AFFORDABLE by which protected pool the purchase consumes', () => {
    const base = {
      accounts: [bank('bank', 100000)],
      recurringRules: [rule({ id: 'known', amount: 35000, transactionType: 'EXPENSE' as const, account: 'bank', category: 'rent', nextDueDate: '2026-09-01' })],
      settings: { plannedSavingsTarget: 20000, contingencyBuffer: 10000, protectedCashReserve: 20000 },
    };
    const safe = run({ ...base, purchaseAmount: 12000 });
    const risky = run({ ...base, purchaseAmount: 18000 });
    const no = run({ ...base, purchaseAmount: 40000 });

    expect(safe.safePurchaseCapacity).toBe(15000);
    expect(safe.riskyPurchaseCapacity).toBe(25000);
    expect(safe.status).toBe('SAFE');
    expect(risky.status).toBe('RISKY');
    expect(risky.contingencyUsedByPurchase).toBe(3000);
    expect(risky.remainingContingency).toBe(7000);
    expect(no.status).toBe('NOT_AFFORDABLE');
    expect(no.protectedPlanShortfall).toBe(15000);
  });
});
'''
Path('src/domain/affordability.test.ts').write_text(affordability_tests, encoding='utf-8')

persistence_tests = r'''import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from '../db/sqliteSchema';
import { insertCategoryRow, normalizeCategoryRow, type SqlJsDatabaseDriver } from '../db/dbClient';

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

describe('category affordability persistence', () => {
  it('persists the new affordability class in SQLite', async () => {
    const driver = await createDriver();
    await insertCategoryRow(driver, { id: 'medical', name: 'Medical', icon: 'Heart', type: 'expense', affordabilityClass: 'IRREGULAR' });
    const rows = await driver.query(`SELECT affordability_class FROM categories WHERE id = 'medical'`);
    expect(rows).toEqual([{ affordability_class: 'IRREGULAR' }]);
  });

  it('normalizes legacy category rows into the new model', () => {
    expect(normalizeCategoryRow({ id: 'old-save', name: 'SIP', type: 'EXPENSE', icon_name: 'Target', group_name: 'Savings' }).affordabilityClass).toBe('SAVINGS');
    expect(normalizeCategoryRow({ id: 'old-fun', name: 'Movies', type: 'EXPENSE', icon_name: 'Film', group_name: 'Leisure' }).affordabilityClass).toBe('FLEXIBLE');
    expect(normalizeCategoryRow({ id: 'old-food', name: 'Food', type: 'EXPENSE', icon_name: 'Utensils', group_name: 'Essential' }).affordabilityClass).toBe('NORMAL');
  });
});
'''
Path('src/__tests__/categoryAffordabilityPersistence.test.ts').write_text(persistence_tests, encoding='utf-8')

print('Affordability phases 1 and 2 patch applied.')
