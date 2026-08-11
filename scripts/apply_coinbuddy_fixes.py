from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(rel, old, new):
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected pattern not found in {rel}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")

def append_after(rel, anchor, addition):
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if anchor not in text:
        raise RuntimeError(f"Anchor not found in {rel}")
    path.write_text(text.replace(anchor, anchor + addition, 1), encoding="utf-8")

def write(rel, content):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------
replace_once(
    "src/types.ts",
    "export type TransactionType =\n  | 'INCOME'\n  | 'EXPENSE'\n  | 'TRANSFER'\n  | 'OPENING_BALANCE'\n  | 'MARKET_ADJUSTMENT'\n  | 'BALANCE_ADJUSTMENT';\n",
    "export type TransactionType =\n  | 'INCOME'\n  | 'EXPENSE'\n  | 'TRANSFER'\n  | 'OPENING_BALANCE'\n  | 'MARKET_ADJUSTMENT'\n  | 'BALANCE_ADJUSTMENT';\n\nexport type RecurrenceFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';\n\nexport interface RecurringRule {\n  id: string;\n  title: string;\n  subtitle?: string;\n  amount: number;\n  transactionType: 'INCOME' | 'EXPENSE' | 'TRANSFER';\n  account?: string;\n  fromAccountId?: string;\n  toAccountId?: string;\n  category?: string;\n  icon?: IconName;\n  notes?: string;\n  isInterestOnly?: boolean;\n  frequency: RecurrenceFrequency;\n  nextDueDate: string;\n  isActive: boolean;\n  eventId?: string;\n  anchorDay?: number;\n}\n"
)
replace_once(
    "src/types.ts",
    "  isRecurring?: boolean;\n",
    "  isRecurring?: boolean;\n  recurrenceFrequency?: RecurrenceFrequency;\n"
)

# ---------------------------------------------------------------------------
# Pure recurring-date helpers
# ---------------------------------------------------------------------------
write("src/domain/recurring.ts", """import type { RecurrenceFrequency } from '../types';

export function toLocalDateKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(dateKey: string): { year: number; monthIndex: number; day: number } {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid recurring date: ${dateKey}`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const candidate = new Date(year, monthIndex, day, 12, 0, 0);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== monthIndex ||
    candidate.getDate() !== day
  ) {
    throw new Error(`Invalid recurring date: ${dateKey}`);
  }
  return { year, monthIndex, day };
}

function monthsForFrequency(frequency: RecurrenceFrequency): number {
  if (frequency === 'ANNUALLY') return 12;
  if (frequency === 'QUARTERLY') return 3;
  return 1;
}

/**
 * Advances a schedule while retaining the original day-of-month anchor.
 * Example: Jan 31 -> Feb 28 -> Mar 31, instead of drifting to Mar 28.
 */
export function advanceRecurringDate(
  dateKey: string,
  frequency: RecurrenceFrequency,
  anchorDay?: number,
): string {
  const { year, monthIndex, day } = parseDateKey(dateKey);
  const target = new Date(year, monthIndex + monthsForFrequency(frequency), 1, 12, 0, 0);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12, 0, 0).getDate();
  const requestedDay = Math.min(31, Math.max(1, Math.round(anchorDay ?? day)));
  const clampedDay = Math.min(requestedDay, lastDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function shouldCreateInitialOccurrence(startDateKey: string, today = new Date()): boolean {
  return startDateKey <= toLocalDateKey(today);
}
""")

# ---------------------------------------------------------------------------
# Search helper (amount + existing textual fields + linked account/event names)
# ---------------------------------------------------------------------------
write("src/utils/transactionSearch.ts", """import type { Transaction } from '../types';

export interface TransactionSearchContext {
  accountNames?: string[];
  eventName?: string;
  categoryName?: string;
}

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase();

function numericCandidate(query: string): number | null {
  const cleaned = query
    .replace(/[₹$€£¥\\s]/g, '')
    .replace(/,/g, '');
  if (!/^-?\\d+(?:\\.\\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.abs(value) : null;
}

export function transactionMatchesSearch(
  tx: Transaction,
  query: string,
  context: TransactionSearchContext = {},
): boolean {
  const q = normalize(query);
  if (!q) return true;

  const haystack = [
    tx.title,
    tx.subtitle,
    tx.category,
    tx.notes,
    tx.type,
    tx.transaction_type,
    tx.dueDate,
    ...context.accountNames ?? [],
    context.eventName,
    context.categoryName,
  ].map(normalize).join(' ');

  if (haystack.includes(q)) return true;

  const requestedAmount = numericCandidate(q);
  if (requestedAmount === null) return false;

  const amount = Math.abs(Number(tx.amount));
  if (!Number.isFinite(amount)) return false;
  if (Math.abs(amount - requestedAmount) < 0.005) return true;

  const compactQuery = q.replace(/[₹$€£¥,\\s]/g, '');
  return [
    String(amount),
    amount.toFixed(2),
    amount.toLocaleString('en-IN'),
    amount.toLocaleString('en-US'),
  ].some(value => value.replace(/,/g, '').includes(compactQuery));
}
""")

# ---------------------------------------------------------------------------
# SQLite schema: recurring rules retain event + anchor day.
# ---------------------------------------------------------------------------
replace_once(
    "src/db/sqliteSchema.ts",
    "  is_interest_only INTEGER NOT NULL DEFAULT 0,\n  frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),\n  next_due_date TEXT NOT NULL,\n  is_active INTEGER NOT NULL DEFAULT 1\n);",
    "  is_interest_only INTEGER NOT NULL DEFAULT 0,\n  frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),\n  next_due_date TEXT NOT NULL,\n  is_active INTEGER NOT NULL DEFAULT 1,\n  event_id TEXT,\n  anchor_day INTEGER CHECK(anchor_day BETWEEN 1 AND 31),\n  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE SET NULL\n);"
)
replace_once(
    "src/db/sqliteSchema.ts",
    "  `ALTER TABLE transactions ADD COLUMN event_id TEXT REFERENCES events(event_id) ON DELETE SET NULL;`,\n  `ALTER TABLE categories ADD COLUMN rollover_account_id TEXT;`,\n",
    "  `ALTER TABLE transactions ADD COLUMN event_id TEXT REFERENCES events(event_id) ON DELETE SET NULL;`,\n  `ALTER TABLE categories ADD COLUMN rollover_account_id TEXT;`,\n  `ALTER TABLE recurring_rules ADD COLUMN event_id TEXT REFERENCES events(event_id) ON DELETE SET NULL;`,\n  `ALTER TABLE recurring_rules ADD COLUMN anchor_day INTEGER;`,\n"
)

# ---------------------------------------------------------------------------
# dbClient imports and recurring rule persistence/state.
# ---------------------------------------------------------------------------
replace_once(
    "src/db/dbClient.ts",
    "import { Account, Category, CreditCardInfo, Event, LoanRevision, Transaction, Widget } from '../types';\n",
    "import { Account, Category, CreditCardInfo, Event, LoanRevision, RecurrenceFrequency, RecurringRule, Transaction, Widget } from '../types';\n"
)
replace_once(
    "src/db/dbClient.ts",
    "import { validateLedgerSchema } from '../utils/ledgerSchema';\n",
    "import { validateLedgerSchema } from '../utils/ledgerSchema';\nimport { advanceRecurringDate, toLocalDateKey } from '../domain/recurring';\n"
)

replace_once(
    "src/db/dbClient.ts",
    "}\n\nexport async function loadStateFromDatabase(driver: SqlJsDatabaseDriver) {\n  const [accountRows, txRows, categoryRows, creditCardRows, widgetRows, loanRows, eventRows] = await Promise.all([\n",
    "}\n\nexport function normalizeRecurringRuleRow(row: any): RecurringRule {\n  const nextDueDate = row.next_due_date ?? row.nextDueDate ?? toLocalDateKey(new Date());\n  const fallbackAnchor = Number(String(nextDueDate).slice(8, 10));\n  return {\n    id: row.id,\n    title: row.title ?? '',\n    subtitle: row.subtitle ?? undefined,\n    amount: Number(row.amount ?? 0),\n    transactionType: (row.transaction_type ?? 'EXPENSE').toUpperCase(),\n    account: row.account ?? undefined,\n    fromAccountId: row.from_account_id ?? undefined,\n    toAccountId: row.to_account_id ?? undefined,\n    category: row.category ?? undefined,\n    icon: row.icon ?? undefined,\n    notes: row.notes ?? undefined,\n    isInterestOnly: Boolean(Number(row.is_interest_only ?? 0)),\n    frequency: (row.frequency ?? 'MONTHLY') as RecurrenceFrequency,\n    nextDueDate,\n    isActive: Number(row.is_active ?? 1) === 1,\n    eventId: row.event_id ?? undefined,\n    anchorDay: Number(row.anchor_day ?? fallbackAnchor) || undefined,\n  } as RecurringRule;\n}\n\nexport async function loadStateFromDatabase(driver: SqlJsDatabaseDriver) {\n  const [accountRows, txRows, categoryRows, creditCardRows, widgetRows, loanRows, eventRows, recurringRuleRows] = await Promise.all([\n"
)
replace_once(
    "src/db/dbClient.ts",
    "    driver.query(`SELECT * FROM events ORDER BY created_at DESC, name ASC;`),\n  ]);\n",
    "    driver.query(`SELECT * FROM events ORDER BY created_at DESC, name ASC;`),\n    driver.query(`SELECT * FROM recurring_rules ORDER BY is_active DESC, next_due_date ASC, title ASC;`),\n  ]);\n"
)
replace_once(
    "src/db/dbClient.ts",
    "    loanRevisions: loanRows.map(normalizeLoanRevisionRow),\n    events: eventRows.map(normalizeEventRow),\n  };\n",
    "    loanRevisions: loanRows.map(normalizeLoanRevisionRow),\n    events: eventRows.map(normalizeEventRow),\n    recurringRules: recurringRuleRows.map(normalizeRecurringRuleRow),\n  };\n"
)

old_recurring_block = """export async function createRecurringRule(driver: SqlJsDatabaseDriver, template: Omit<Transaction, 'id'> & { id?: string }): Promise<string> {
  const amount = Math.abs(Number(template.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Recurring rule amount must be a finite positive number.');
  const id = template.id ?? crypto.randomUUID();
  const type = (template.transaction_type ?? template.type).toUpperCase();
  if (!['INCOME', 'EXPENSE', 'TRANSFER'].includes(type)) throw new Error(`Unsupported recurring transaction type: ${type}.`);
  const fromAccountId = template.fromAccountId ?? (type === 'EXPENSE' ? template.account : undefined);
  const toAccountId = template.toAccountId ?? (type === 'INCOME' ? template.account : undefined);
  if ((type === 'EXPENSE' || type === 'TRANSFER') && !fromAccountId) throw new Error('A recurring expense or transfer requires a source account.');
  if ((type === 'INCOME' || type === 'TRANSFER') && !toAccountId) throw new Error('A recurring income or transfer requires a destination account.');
  const nextDueDate = toLocalDateKey(new Date(template.date));
  await driver.execute(
    `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, next_due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, template.title, template.subtitle ?? null, amount, type, template.account ?? null, fromAccountId ?? null, toAccountId ?? null, template.category ?? null, template.icon ?? null, template.notes ?? null, template.isInterestOnly ? 1 : 0, nextDueDate]
  );
  return id;
}

function toLocalDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function localNoonIso(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}

function advanceRecurringDate(date: string, frequency: string): string {
  const value = new Date(`${date}T12:00:00`);
  value.setMonth(value.getMonth() + (frequency === 'ANNUALLY' ? 12 : frequency === 'QUARTERLY' ? 3 : 1));
  return toLocalDateKey(value);
}
"""
new_recurring_block = """export async function createRecurringRule(
  driver: SqlJsDatabaseDriver,
  template: Omit<Transaction, 'id'> & { id?: string },
  options: { id?: string; nextDueDate?: string } = {},
): Promise<string> {
  const amount = Math.abs(Number(template.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Recurring rule amount must be a finite positive number.');
  const id = options.id ?? template.recurringRuleId ?? template.id ?? crypto.randomUUID();
  const type = (template.transaction_type ?? template.type).toUpperCase();
  if (!['INCOME', 'EXPENSE', 'TRANSFER'].includes(type)) throw new Error(`Unsupported recurring transaction type: ${type}.`);
  const fromAccountId = template.fromAccountId ?? (type === 'EXPENSE' ? template.account : undefined);
  const toAccountId = template.toAccountId ?? (type === 'INCOME' ? template.account : undefined);
  if ((type === 'EXPENSE' || type === 'TRANSFER') && !fromAccountId) throw new Error('A recurring expense or transfer requires a source account.');
  if ((type === 'INCOME' || type === 'TRANSFER') && !toAccountId) throw new Error('A recurring income or transfer requires a destination account.');
  const startDate = toLocalDateKey(template.date);
  const anchorDay = Number(startDate.slice(8, 10));
  const frequency = (template.recurrenceFrequency ?? 'MONTHLY') as RecurrenceFrequency;
  const nextDueDate = options.nextDueDate ?? startDate;
  await driver.execute(
    `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, frequency, next_due_date, is_active, event_id, anchor_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, template.title, template.subtitle ?? null, amount, type, template.account ?? null, fromAccountId ?? null, toAccountId ?? null, template.category ?? null, template.icon ?? null, template.notes ?? null, template.isInterestOnly ? 1 : 0, frequency, nextDueDate, 1, template.eventId ?? null, anchorDay]
  );
  return id;
}

export async function updateRecurringRuleRow(driver: SqlJsDatabaseDriver, rule: RecurringRule): Promise<void> {
  const amount = Math.abs(Number(rule.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Recurring rule amount must be a finite positive number.');
  if (!rule.nextDueDate) throw new Error('Recurring rule requires a next due date.');
  await driver.execute(
    `UPDATE recurring_rules SET title = ?, subtitle = ?, amount = ?, transaction_type = ?, account = ?, from_account_id = ?, to_account_id = ?, category = ?, icon = ?, notes = ?, is_interest_only = ?, frequency = ?, next_due_date = ?, is_active = ?, event_id = ?, anchor_day = ? WHERE id = ?;`,
    [rule.title.trim() || 'Recurring payment', rule.subtitle ?? null, amount, rule.transactionType, rule.account ?? null, rule.fromAccountId ?? null, rule.toAccountId ?? null, rule.category ?? null, rule.icon ?? null, rule.notes ?? null, rule.isInterestOnly ? 1 : 0, rule.frequency, rule.nextDueDate, rule.isActive ? 1 : 0, rule.eventId ?? null, rule.anchorDay ?? Number(rule.nextDueDate.slice(8, 10)), rule.id]
  );
}

export async function deleteRecurringRuleRow(driver: SqlJsDatabaseDriver, id: string): Promise<void> {
  await driver.execute(`DELETE FROM recurring_rules WHERE id = ?;`, [id]);
}

export async function skipRecurringRuleOccurrence(driver: SqlJsDatabaseDriver, id: string): Promise<void> {
  const rows = await driver.query(`SELECT next_due_date, frequency, anchor_day FROM recurring_rules WHERE id = ?`, [id]);
  const row = rows[0];
  if (!row) throw new Error('Recurring rule no longer exists.');
  const frequency = (row.frequency ?? 'MONTHLY') as RecurrenceFrequency;
  const anchorDay = Number(row.anchor_day ?? String(row.next_due_date).slice(8, 10));
  const nextDueDate = advanceRecurringDate(row.next_due_date, frequency, anchorDay);
  await driver.execute(`UPDATE recurring_rules SET next_due_date = ? WHERE id = ?`, [nextDueDate, id]);
}

function localNoonIso(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}
"""
replace_once("src/db/dbClient.ts", old_recurring_block, new_recurring_block)

replace_once(
    "src/db/dbClient.ts",
    "      dueDate = advanceRecurringDate(dueDate, rule.frequency);\n",
    "      dueDate = advanceRecurringDate(dueDate, (rule.frequency ?? 'MONTHLY') as RecurrenceFrequency, Number(rule.anchor_day) || Number(String(rule.next_due_date).slice(8, 10)));\n"
)
replace_once(
    "src/db/dbClient.ts",
    "          transaction_type: rule.transaction_type, is_verified: autoApprove ? 1 : 0, isRecurring: true, recurringRuleId: rule.id, dueDate: d,\n",
    "          transaction_type: rule.transaction_type, is_verified: autoApprove ? 1 : 0, isRecurring: true, recurrenceFrequency: rule.frequency, recurringRuleId: rule.id, dueDate: d, eventId: rule.event_id ?? undefined,\n"
)
replace_once(
    "src/db/dbClient.ts",
    "            transaction_type: 'EXPENSE', isInterestOnly: true, is_verified: autoApprove ? 1 : 0, isRecurring: true, recurringRuleId: rule.id, dueDate: d,\n",
    "            transaction_type: 'EXPENSE', isInterestOnly: true, is_verified: autoApprove ? 1 : 0, isRecurring: true, recurrenceFrequency: rule.frequency, recurringRuleId: rule.id, dueDate: d, eventId: rule.event_id ?? undefined,\n"
)

replace_once(
    "src/db/dbClient.ts",
    "    const loanRevisions: LoanRevision[] = Array.isArray(data.loanRevisions) ? data.loanRevisions : [];\n    const userConfig = Array.isArray(data.users_config) ? data.users_config[0] : undefined;\n",
    "    const loanRevisions: LoanRevision[] = Array.isArray(data.loanRevisions) ? data.loanRevisions : [];\n    const recurringRules: RecurringRule[] = Array.isArray(data.recurringRules) ? data.recurringRules : [];\n    const userConfig = Array.isArray(data.users_config) ? data.users_config[0] : undefined;\n"
)
replace_once(
    "src/db/dbClient.ts",
    "    executePreparedRows(driver, `INSERT INTO events (event_id, name, created_at) VALUES (?, ?, ?);`, events.map(event => [event.id, event.name, event.createdAt]));\n    executePreparedRows(driver, `INSERT INTO transactions",
    "    executePreparedRows(driver, `INSERT INTO events (event_id, name, created_at) VALUES (?, ?, ?);`, events.map(event => [event.id, event.name, event.createdAt]));\n    executePreparedRows(driver, `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, frequency, next_due_date, is_active, event_id, anchor_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, recurringRules.map(rule => [rule.id, rule.title, rule.subtitle ?? null, Math.abs(Number(rule.amount)), rule.transactionType, rule.account ?? null, rule.fromAccountId ?? null, rule.toAccountId ?? null, rule.category ?? null, rule.icon ?? null, rule.notes ?? null, rule.isInterestOnly ? 1 : 0, rule.frequency ?? 'MONTHLY', rule.nextDueDate, rule.isActive === false ? 0 : 1, rule.eventId ?? null, rule.anchorDay ?? Number(String(rule.nextDueDate).slice(8, 10))]));\n    executePreparedRows(driver, `INSERT INTO transactions"
)

# ---------------------------------------------------------------------------
# Backup validation/migration: optional for older v3 backups, included when present.
# ---------------------------------------------------------------------------
replace_once(
    "src/utils/ledgerSchema.ts",
    "  if (!(ledger.accounts as unknown[]).every(value => value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string')) return 'Every imported account must have an id.';\n",
    "  if (ledger.recurringRules !== undefined && !Array.isArray(ledger.recurringRules)) return 'Backup field \\\"recurringRules\\\" must be an array when present.';\n  if (!(ledger.accounts as unknown[]).every(value => value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string')) return 'Every imported account must have an id.';\n"
)
replace_once(
    "src/utils/ledgerSchema.ts",
    "      loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [],\n      currency: data.currency || 'INR',\n",
    "      loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [],\n      recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [],\n      currency: data.currency || 'INR',\n"
)
replace_once(
    "src/utils/ledgerSchema.ts",
    "    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [], currency: data.currency || '$', lastUpdated: new Date().toISOString(),\n",
    "    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [], recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [], currency: data.currency || '$', lastUpdated: new Date().toISOString(),\n"
)

# ---------------------------------------------------------------------------
# AppContext: async save path + recurring state/lifecycle + backup.
# ---------------------------------------------------------------------------
replace_once(
    "src/context/AppContext.tsx",
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision } from '../types';\n",
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule } from '../types';\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "  createRecurringRule,\n  generateDueRecurringTransactions,\n  SqlJsDatabaseDriver,\n",
    "  createRecurringRule,\n  updateRecurringRuleRow,\n  deleteRecurringRuleRow,\n  skipRecurringRuleOccurrence,\n  generateDueRecurringTransactions,\n  SqlJsDatabaseDriver,\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "import { isEventAssignableTransaction } from '../domain/eventRules';\n",
    "import { isEventAssignableTransaction } from '../domain/eventRules';\nimport { advanceRecurringDate, shouldCreateInitialOccurrence, toLocalDateKey } from '../domain/recurring';\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "  loanRevisions?: LoanRevision[];\n  currency?: string;\n",
    "  loanRevisions?: LoanRevision[];\n  recurringRules?: RecurringRule[];\n  currency?: string;\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "  addTransaction: (tx: Omit<Transaction, 'id'>) => { success: boolean; error?: string };\n",
    "  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<{ success: boolean; error?: string }>;\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "  autoRecur: boolean;\n  setAutoRecur: (val: boolean) => void;\n",
    "  autoRecur: boolean;\n  setAutoRecur: (val: boolean) => void;\n  recurringRules: RecurringRule[];\n  updateRecurringRule: (rule: RecurringRule) => Promise<boolean>;\n  deleteRecurringRule: (id: string) => Promise<boolean>;\n  skipRecurringRule: (id: string) => Promise<boolean>;\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "  const [loanRevisions, setLoanRevisions] = useState<LoanRevision[]>([]);\n\n  const [editingTransaction",
    "  const [loanRevisions, setLoanRevisions] = useState<LoanRevision[]>([]);\n  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);\n\n  const [editingTransaction"
)
replace_once(
    "src/context/AppContext.tsx",
    "    widgets: Widget[];\n    loanRevisions: LoanRevision[];\n  }) => {\n",
    "    widgets: Widget[];\n    loanRevisions: LoanRevision[];\n    recurringRules: RecurringRule[];\n  }) => {\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "    setWidgets(state.widgets);\n    setLoanRevisions(state.loanRevisions);\n  };\n",
    "    setWidgets(state.widgets);\n    setLoanRevisions(state.loanRevisions);\n    setRecurringRules(state.recurringRules);\n  };\n"
)

old_add = """  const addTransaction = (tx: Omit<Transaction, 'id'>): { success: boolean; error?: string } => {
    const validation = validateTransaction(tx, accounts);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const finalTx = { ...tx, id: crypto.randomUUID(), amount: Math.abs(tx.amount) };
    if (tx.isRecurring) {
      if (dbDriver) void persistDbAction(() => createRecurringRule(dbDriver, finalTx));
      return { success: true };
    }
    const nextTxs = [finalTx, ...transactions];

    pushCommand({
      entityType: 'transaction',
      actionType: 'add',
      previousState: null,
      newState: finalTx
    });
    setTransactions(nextTxs);

    if (dbDriver) {
      persistDbAction(() => insertTransactionRow(dbDriver, finalTx));
    }

    return { success: true };
  };
"""
new_add = """  const addTransaction = async (tx: Omit<Transaction, 'id'>): Promise<{ success: boolean; error?: string }> => {
    const validation = validateTransaction(tx, accounts);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    if (!dbDriver) {
      return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    }

    const finalTx: Transaction = { ...tx, id: crypto.randomUUID(), amount: Math.abs(tx.amount) };

    if (tx.isRecurring) {
      const frequency = tx.recurrenceFrequency ?? 'MONTHLY';
      const startDateKey = toLocalDateKey(finalTx.date);
      const anchorDay = Number(startDateKey.slice(8, 10));
      const ruleId = crypto.randomUUID();
      const createInitial = shouldCreateInitialOccurrence(startDateKey);
      const nextDueDate = createInitial
        ? advanceRecurringDate(startDateKey, frequency, anchorDay)
        : startDateKey;
      const initialTx: Transaction | null = createInitial
        ? {
            ...finalTx,
            recurringRuleId: ruleId,
            dueDate: startDateKey,
            recurrenceFrequency: frequency,
            isRecurring: true,
            is_verified: 1,
          }
        : null;

      const saved = await persistDbAction(async () => {
        await dbDriver.execute('BEGIN TRANSACTION');
        try {
          await createRecurringRule(
            dbDriver,
            { ...finalTx, recurringRuleId: ruleId, recurrenceFrequency: frequency },
            { id: ruleId, nextDueDate },
          );
          if (initialTx) await insertTransactionRow(dbDriver, initialTx);
          // A past start date may have more than one missed occurrence. Generate
          // them now and rely on (rule id, due date) de-duplication.
          await generateDueRecurringTransactions(dbDriver, autoRecur);
          await dbDriver.execute('COMMIT');
        } catch (error) {
          await dbDriver.execute('ROLLBACK');
          throw error;
        }
      });

      if (!saved) return { success: false, error: 'The recurring payment could not be saved.' };
      if (initialTx) {
        pushCommand({
          entityType: 'transaction',
          actionType: 'add',
          previousState: null,
          newState: initialTx,
        });
      }
      return { success: true };
    }

    const saved = await persistDbAction(() => insertTransactionRow(dbDriver, finalTx));
    if (!saved) return { success: false, error: 'The transaction could not be saved.' };

    pushCommand({
      entityType: 'transaction',
      actionType: 'add',
      previousState: null,
      newState: finalTx,
    });
    return { success: true };
  };
"""
replace_once("src/context/AppContext.tsx", old_add, new_add)

replace_once(
    "src/context/AppContext.tsx",
    "\n  const updateTransaction = (id: string, newTx: Omit<Transaction, 'id'>): { success: boolean; error?: string } => {\n",
    "\n  const updateRecurringRule = async (rule: RecurringRule): Promise<boolean> => {\n    if (!dbDriver) return false;\n    return persistDbAction(() => updateRecurringRuleRow(dbDriver, rule));\n  };\n\n  const deleteRecurringRule = async (id: string): Promise<boolean> => {\n    if (!dbDriver) return false;\n    return persistDbAction(() => deleteRecurringRuleRow(dbDriver, id));\n  };\n\n  const skipRecurringRule = async (id: string): Promise<boolean> => {\n    if (!dbDriver) return false;\n    return persistDbAction(() => skipRecurringRuleOccurrence(dbDriver, id));\n  };\n\n  const updateTransaction = (id: string, newTx: Omit<Transaction, 'id'>): { success: boolean; error?: string } => {\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "    addTransaction({\n      title: `Transfer:",
    "    void addTransaction({\n      title: `Transfer:"
)
replace_once(
    "src/context/AppContext.tsx",
    "      addTransaction({\n        title: `Interest Payment:",
    "      void addTransaction({\n        title: `Interest Payment:"
)
replace_once(
    "src/context/AppContext.tsx",
    "    setLoanRevisions([]);\n    setIntegrityWarning(null);\n",
    "    setLoanRevisions([]);\n    setRecurringRules([]);\n    setIntegrityWarning(null);\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "      setWidgets(refreshed.widgets);\n      setLoanRevisions(refreshed.loanRevisions);\n",
    "      setWidgets(refreshed.widgets);\n      setLoanRevisions(refreshed.loanRevisions);\n      setRecurringRules(refreshed.recurringRules);\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "      if (data.loanRevisions && Array.isArray(data.loanRevisions)) setLoanRevisions(data.loanRevisions);\n",
    "      if (data.loanRevisions && Array.isArray(data.loanRevisions)) setLoanRevisions(data.loanRevisions);\n      if (data.recurringRules && Array.isArray(data.recurringRules)) setRecurringRules(data.recurringRules);\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "    loanRevisions,\n    currency,\n",
    "    loanRevisions,\n    recurringRules,\n    currency,\n"
)
replace_once(
    "src/context/AppContext.tsx",
    "      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, \n",
    "      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, recurringRules, updateRecurringRule, deleteRecurringRule, skipRecurringRule, \n"
)

# ---------------------------------------------------------------------------
# Add transaction UI: async save + frequency + editing-series guidance.
# ---------------------------------------------------------------------------
replace_once(
    "src/components/AddTransactionModal.tsx",
    "  const { isAddModalOpen, setAddModalOpen, addTransaction, updateTransaction, editingTransaction, setEditingTransaction, formatCurrency, getCurrencySymbol, accounts, creditCards, categories, events, createEvent, setManageCategoriesOpen } = useAppContext();\n",
    "  const { isAddModalOpen, setAddModalOpen, addTransaction, updateTransaction, editingTransaction, setEditingTransaction, formatCurrency, getCurrencySymbol, accounts, creditCards, categories, events, recurringRules, createEvent, setManageCategoriesOpen } = useAppContext();\n"
)
replace_once(
    "src/components/AddTransactionModal.tsx",
    "  const [isRecurring, setIsRecurring] = useState(false);\n  const [date, setDate]",
    "  const [isRecurring, setIsRecurring] = useState(false);\n  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'>('MONTHLY');\n  const [date, setDate]"
)
replace_once(
    "src/components/AddTransactionModal.tsx",
    "      setIsRecurring(editingTransaction.isRecurring || false);\n      setDate(new Date(editingTransaction.date).toISOString().split('T')[0]);\n",
    "      setIsRecurring(editingTransaction.isRecurring || false);\n      setRecurrenceFrequency(recurringRules.find(rule => rule.id === editingTransaction.recurringRuleId)?.frequency ?? 'MONTHLY');\n      setDate(new Date(editingTransaction.date).toISOString().split('T')[0]);\n"
)
replace_once(
    "src/components/AddTransactionModal.tsx",
    "      setIsRecurring(false);\n      setDate(new Date().toISOString().split('T')[0]);\n",
    "      setIsRecurring(false);\n      setRecurrenceFrequency('MONTHLY');\n      setDate(new Date().toISOString().split('T')[0]);\n"
)
replace_once(
    "src/components/AddTransactionModal.tsx",
    "  }, [editingTransaction, isAddModalOpen, categories, assets, liabilities, accounts]);\n",
    "  }, [editingTransaction, isAddModalOpen, categories, assets, liabilities, accounts, events, recurringRules]);\n"
)
replace_once(
    "src/components/AddTransactionModal.tsx",
    "  const handleSubmit = (e: FormEvent) => {\n",
    "  const handleSubmit = async (e: FormEvent) => {\n"
)
replace_once(
    "src/components/AddTransactionModal.tsx",
    "      isRecurring,\n      isInterestOnly,\n",
    "      isRecurring,\n      recurrenceFrequency: isRecurring ? recurrenceFrequency : undefined,\n      isInterestOnly,\n"
)
replace_once(
    "src/components/AddTransactionModal.tsx",
    "    if (editingTransaction) {\n      res = updateTransaction(editingTransaction.id, newTx);\n    } else {\n      res = addTransaction(newTx);\n    }\n",
    "    if (editingTransaction) {\n      res = updateTransaction(editingTransaction.id, newTx);\n    } else {\n      res = await addTransaction(newTx);\n    }\n"
)

old_recur_ui = """          <div className=\"bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 flex items-center justify-between\">
            <div className=\"flex items-center gap-4\">
              <div className=\"w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary\">
                <Layers className=\"w-5 h-5\" />
              </div>
              <div>
                <h3 className=\"font-semibold text-on-surface\">Recurring</h3>
                <p className=\"text-xs text-on-surface-variant\">Set monthly schedule</p>
              </div>
            </div>
            <button 
              type=\"button\"
              onClick={() => setIsRecurring(!isRecurring)}
              className=\"shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none\" style={{ backgroundColor: isRecurring ? 'var(--primary)' : 'var(--surface-container-highest)' }}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
"""
new_recur_ui = """          <div className=\"bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 space-y-4\">
            <div className=\"flex items-center justify-between\">
              <div className=\"flex items-center gap-4\">
                <div className=\"w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary\">
                  <Layers className=\"w-5 h-5\" />
                </div>
                <div>
                  <h3 className=\"font-semibold text-on-surface\">Recurring</h3>
                  <p className=\"text-xs text-on-surface-variant\">
                    {editingTransaction?.recurringRuleId ? 'This occurrence belongs to a recurring schedule' : 'Create future scheduled occurrences'}
                  </p>
                </div>
              </div>
              <button
                type=\"button\"
                disabled={Boolean(editingTransaction)}
                onClick={() => setIsRecurring(!isRecurring)}
                className=\"shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60\"
                style={{ backgroundColor: isRecurring ? 'var(--primary)' : 'var(--surface-container-highest)' }}
                aria-label=\"Toggle recurring transaction\"
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {isRecurring && (
              <div className=\"flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between\">
                <label className=\"text-xs font-semibold uppercase tracking-wider text-on-surface-variant\">Frequency</label>
                <select
                  value={recurrenceFrequency}
                  disabled={Boolean(editingTransaction)}
                  onChange={e => setRecurrenceFrequency(e.target.value as typeof recurrenceFrequency)}
                  className=\"rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary/60 disabled:opacity-60\"
                >
                  <option value=\"MONTHLY\">Monthly</option>
                  <option value=\"QUARTERLY\">Quarterly</option>
                  <option value=\"ANNUALLY\">Annually</option>
                </select>
              </div>
            )}
            {editingTransaction?.recurringRuleId && (
              <p className=\"text-[11px] leading-relaxed text-on-surface-variant\">
                Editing this transaction changes only this occurrence. Manage the future series from Settings → Recurring Payments.
              </p>
            )}
          </div>
"""
replace_once("src/components/AddTransactionModal.tsx", old_recur_ui, new_recur_ui)

# ---------------------------------------------------------------------------
# Activity search: title/category + amount + linked names while composing filters.
# ---------------------------------------------------------------------------
replace_once(
    "src/components/Activity.tsx",
    "import { isEventAssignableTransaction } from '../domain/eventRules';\n",
    "import { isEventAssignableTransaction } from '../domain/eventRules';\nimport { transactionMatchesSearch } from '../utils/transactionSearch';\n"
)
replace_once(
    "src/components/Activity.tsx",
    "      const q = debouncedQuery.toLowerCase();\n      const matchesSearch = tx.title.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q);\n",
    "      const categoryName = categories.find(c => c.id === tx.category || `#${c.name.toLowerCase().replace(/\\s+/g, '')}` === tx.category)?.name;\n      const matchesSearch = transactionMatchesSearch(tx, debouncedQuery, {\n        accountNames: accounts.filter(account => tx.account === account.id || tx.fromAccountId === account.id || tx.toAccountId === account.id).map(account => account.name),\n        eventName: events.find(event => event.id === tx.eventId)?.name,\n        categoryName,\n      });\n"
)
replace_once(
    "src/components/Activity.tsx",
    "  }, [transactions, debouncedQuery, selectedCategoryFilter, categories, selectedCycle, getCycleDetails, selectedTypeFilter, selectedAccountFilter, selectedEventFilter, selectedSort]);\n",
    "  }, [transactions, debouncedQuery, selectedCategoryFilter, categories, selectedCycle, getCycleDetails, selectedTypeFilter, selectedAccountFilter, selectedEventFilter, selectedSort, accounts, events]);\n"
)
replace_once(
    "src/components/Activity.tsx",
    '            placeholder=\"Search transactions...\" \n',
    '            placeholder=\"Search title, category, account or amount...\" \n'
)

# ---------------------------------------------------------------------------
# Recurring schedule manager
# ---------------------------------------------------------------------------
write("src/components/RecurringPayments.tsx", """import { useEffect, useState } from 'react';
import { CalendarClock, Pause, Play, SkipForward, Trash2, Pencil, Save, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { RecurringRule } from '../types';

export function RecurringPayments() {
  const { recurringRules, events, formatCurrency, updateRecurringRule, deleteRecurringRule, skipRecurringRule } = useAppContext();
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    const fresh = recurringRules.find(rule => rule.id === editing.id);
    if (!fresh) setEditing(null);
  }, [recurringRules, editing]);

  const run = async (id: string, action: () => Promise<boolean>) => {
    setBusyId(id);
    try {
      return await action();
    } finally {
      setBusyId(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      window.alert('Recurring payment title is required.');
      return;
    }
    if (!Number.isFinite(Number(editing.amount)) || Number(editing.amount) <= 0) {
      window.alert('Recurring payment amount must be greater than zero.');
      return;
    }
    const ok = await run(editing.id, () => updateRecurringRule({
      ...editing,
      title: editing.title.trim(),
      amount: Math.abs(Number(editing.amount)),
      anchorDay: editing.anchorDay ?? Number(editing.nextDueDate.slice(8, 10)),
    }));
    if (ok) setEditing(null);
  };

  return (
    <section>
      <div className=\"mb-3 ml-2 flex items-center gap-2\">
        <h3 className=\"text-[10px] font-bold uppercase tracking-widest text-primary\">Recurring Payments</h3>
        <CalendarClock className=\"h-4 w-4 text-on-surface-variant\" />
      </div>
      <div className=\"overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container\">
        {recurringRules.length === 0 ? (
          <div className=\"p-5 text-sm text-on-surface-variant\">
            No recurring schedules yet. Turn on Recurring while creating a transaction to add one.
          </div>
        ) : (
          <div className=\"divide-y divide-outline-variant/20\">
            {recurringRules.map(rule => {
              const eventName = events.find(event => event.id === rule.eventId)?.name;
              const isBusy = busyId === rule.id;
              return (
                <div key={rule.id} className=\"p-4\">
                  <div className=\"flex flex-wrap items-start justify-between gap-3\">
                    <div className=\"min-w-0 flex-1\">
                      <div className=\"flex flex-wrap items-center gap-2\">
                        <p className=\"truncate font-semibold text-on-surface\">{rule.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${rule.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                          {rule.isActive ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <p className=\"mt-1 text-xs text-on-surface-variant\">
                        {formatCurrency(rule.amount)} · {rule.frequency.toLowerCase()} · Next {rule.nextDueDate}
                        {eventName ? ` · ${eventName}` : ''}
                      </p>
                    </div>
                    <div className=\"flex flex-wrap gap-2\">
                      <button type=\"button\" disabled={isBusy} onClick={() => setEditing({ ...rule })} className=\"rounded-lg border border-outline-variant/40 p-2 text-on-surface-variant hover:text-primary disabled:opacity-50\" aria-label={`Edit ${rule.title}`}>
                        <Pencil className=\"h-4 w-4\" />
                      </button>
                      <button type=\"button\" disabled={isBusy} onClick={() => void run(rule.id, () => updateRecurringRule({ ...rule, isActive: !rule.isActive }))} className=\"rounded-lg border border-outline-variant/40 p-2 text-on-surface-variant hover:text-primary disabled:opacity-50\" aria-label={rule.isActive ? `Pause ${rule.title}` : `Resume ${rule.title}`}>
                        {rule.isActive ? <Pause className=\"h-4 w-4\" /> : <Play className=\"h-4 w-4\" />}
                      </button>
                      <button type=\"button\" disabled={isBusy || !rule.isActive} onClick={() => { if (window.confirm(`Skip the next ${rule.title} occurrence? Existing ledger entries will not be changed.`)) void run(rule.id, () => skipRecurringRule(rule.id)); }} className=\"rounded-lg border border-outline-variant/40 p-2 text-on-surface-variant hover:text-primary disabled:opacity-50\" aria-label={`Skip next ${rule.title}`}>
                        <SkipForward className=\"h-4 w-4\" />
                      </button>
                      <button type=\"button\" disabled={isBusy} onClick={() => { if (window.confirm(`Delete the recurring schedule \"${rule.title}\"? Existing transactions will remain in the ledger.`)) void run(rule.id, () => deleteRecurringRule(rule.id)); }} className=\"rounded-lg border border-error/30 p-2 text-error hover:bg-error/10 disabled:opacity-50\" aria-label={`Delete recurring schedule ${rule.title}`}>
                        <Trash2 className=\"h-4 w-4\" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <div className=\"fixed inset-0 z-[220] flex items-end justify-center bg-black/60 p-4 sm:items-center\" role=\"dialog\" aria-modal=\"true\">
          <div className=\"w-full max-w-md space-y-4 rounded-3xl border border-outline-variant/30 bg-surface-container p-6 shadow-2xl\">
            <div className=\"flex items-center justify-between\">
              <h4 className=\"text-lg font-bold text-on-surface\">Edit recurring series</h4>
              <button type=\"button\" onClick={() => setEditing(null)} className=\"rounded-full p-2 hover:bg-surface-container-high\"><X className=\"h-5 w-5\" /></button>
            </div>
            <label className=\"block text-xs font-bold uppercase tracking-wider text-on-surface-variant\">Title
              <input value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} className=\"mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary\" />
            </label>
            <label className=\"block text-xs font-bold uppercase tracking-wider text-on-surface-variant\">Amount
              <input type=\"number\" min=\"0.01\" step=\"0.01\" value={editing.amount} onChange={event => setEditing({ ...editing, amount: Number(event.target.value) })} className=\"mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary\" />
            </label>
            <div className=\"grid grid-cols-2 gap-3\">
              <label className=\"block text-xs font-bold uppercase tracking-wider text-on-surface-variant\">Frequency
                <select value={editing.frequency} onChange={event => setEditing({ ...editing, frequency: event.target.value as RecurringRule['frequency'] })} className=\"mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary\">
                  <option value=\"MONTHLY\">Monthly</option><option value=\"QUARTERLY\">Quarterly</option><option value=\"ANNUALLY\">Annually</option>
                </select>
              </label>
              <label className=\"block text-xs font-bold uppercase tracking-wider text-on-surface-variant\">Next due
                <input type=\"date\" value={editing.nextDueDate} onChange={event => setEditing({ ...editing, nextDueDate: event.target.value })} className=\"mt-2 w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium normal-case text-on-surface outline-none focus:border-primary\" />
              </label>
            </div>
            <p className=\"text-xs leading-relaxed text-on-surface-variant\">Changes apply only to future occurrences. Existing ledger transactions remain unchanged.</p>
            <button type=\"button\" disabled={busyId === editing.id} onClick={() => void save()} className=\"flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-on-primary disabled:opacity-50\"><Save className=\"h-4 w-4\" /> Save recurring series</button>
          </div>
        </div>
      )}
    </section>
  );
}
""")

replace_once(
    "src/components/Settings.tsx",
    "import { BackupSecurity } from './BackupSecurity';\n",
    "import { BackupSecurity } from './BackupSecurity';\nimport { RecurringPayments } from './RecurringPayments';\n"
)
replace_once(
    "src/components/Settings.tsx",
    '            desc=\"Process scheduled transfers automatically\" \n',
    '            desc=\"Automatically approve due scheduled entries; turn off to require confirmation\" \n'
)
replace_once(
    "src/components/Settings.tsx",
    "      {/* Data Management */}\n",
    "      <RecurringPayments />\n\n      {/* Data Management */}\n"
)

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
write("src/__tests__/recurringRules.test.ts", """import { describe, expect, it } from 'vitest';
import { advanceRecurringDate, shouldCreateInitialOccurrence } from '../domain/recurring';

describe('recurring schedule dates', () => {
  it('keeps a month-end anchor without drifting', () => {
    const feb = advanceRecurringDate('2027-01-31', 'MONTHLY', 31);
    expect(feb).toBe('2027-02-28');
    expect(advanceRecurringDate(feb, 'MONTHLY', 31)).toBe('2027-03-31');
  });

  it('handles leap-year annual schedules using the original anchor day', () => {
    const next = advanceRecurringDate('2024-02-29', 'ANNUALLY', 29);
    expect(next).toBe('2025-02-28');
    expect(advanceRecurringDate('2027-02-28', 'ANNUALLY', 29)).toBe('2028-02-29');
  });

  it('creates the initial ledger entry only when the start date is due', () => {
    const today = new Date('2026-08-11T12:00:00');
    expect(shouldCreateInitialOccurrence('2026-08-11', today)).toBe(true);
    expect(shouldCreateInitialOccurrence('2026-08-10', today)).toBe(true);
    expect(shouldCreateInitialOccurrence('2026-08-12', today)).toBe(false);
  });
});
""")

write("src/__tests__/transactionSearch.test.ts", """import { describe, expect, it } from 'vitest';
import { transactionMatchesSearch } from '../utils/transactionSearch';
import type { Transaction } from '../types';

const tx: Transaction = {
  id: 'tx-1', title: 'Bike EMI', subtitle: 'Aug 11, 2026', amount: 12500,
  date: '2026-08-11T12:00:00.000Z', category: '#loanpayment', icon: 'CreditCard',
  type: 'expense', account: 'hdfc', fromAccountId: 'hdfc', eventId: 'trip',
  transaction_type: 'EXPENSE', is_verified: 1,
};

describe('transactionMatchesSearch', () => {
  it('finds exact amounts with plain digits', () => expect(transactionMatchesSearch(tx, '12500')).toBe(true));
  it('finds formatted/currency amounts', () => {
    expect(transactionMatchesSearch(tx, '₹12,500')).toBe(true);
    expect(transactionMatchesSearch(tx, '12,500.00')).toBe(true);
  });
  it('finds linked account and event names', () => {
    expect(transactionMatchesSearch(tx, 'HDFC Bank', { accountNames: ['HDFC Bank'] })).toBe(true);
    expect(transactionMatchesSearch(tx, 'Goa Trip', { eventName: 'Goa Trip' })).toBe(true);
  });
  it('does not match an unrelated amount', () => expect(transactionMatchesSearch(tx, '13000')).toBe(false));
});
""")

write("src/__tests__/recurringBackup.test.ts", """import { describe, expect, it } from 'vitest';
import { migrateBackupDataToLatest, validateLedgerSchema } from '../utils/ledgerSchema';

const base = {
  schemaVersion: 'coinbuddy-ledger-v3', accounts: [], transactions: [], categories: [],
  creditCards: [], widgets: [], loanRevisions: [], events: [], currency: 'INR',
};

describe('recurring rules backup compatibility', () => {
  it('accepts older v3 exports that do not contain recurringRules', () => {
    expect(validateLedgerSchema(base)).toBeNull();
    expect(migrateBackupDataToLatest(JSON.stringify(base)).recurringRules).toEqual([]);
  });

  it('preserves recurring rules in current exports', () => {
    const recurringRule = {
      id: 'rule-1', title: 'Rent', amount: 20000, transactionType: 'EXPENSE',
      fromAccountId: 'bank', frequency: 'MONTHLY', nextDueDate: '2026-09-01',
      isActive: true, anchorDay: 1,
    };
    const data = { ...base, recurringRules: [recurringRule] };
    expect(validateLedgerSchema(data)).toBeNull();
    expect(migrateBackupDataToLatest(JSON.stringify(data)).recurringRules).toEqual([recurringRule]);
  });
});
""")

print("CoinBuddy fixes applied.")
