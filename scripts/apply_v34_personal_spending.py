from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label} anchor not found in {path}')
    p.write_text(text.replace(old, new, 1))

# ---------------------------------------------------------------------------
# Types: an obligation carries its own economic category so external-only
# expenses remain classifiable without fabricating a transaction.
# ---------------------------------------------------------------------------
replace_once(
    'src/types.ts',
    """  totalAmount: number;
  dueDate?: string;
  transactionId?: string;""",
    """  totalAmount: number;
  categoryId?: string;
  dueDate?: string;
  transactionId?: string;""",
    'SharedObligation categoryId',
)

# ---------------------------------------------------------------------------
# Schema + migration.
# ---------------------------------------------------------------------------
replace_once(
    'src/db/sqliteSchema.ts',
    """  total_amount REAL NOT NULL CHECK(total_amount > 0),
  due_date TEXT,
  transaction_id TEXT,""",
    """  total_amount REAL NOT NULL CHECK(total_amount > 0),
  category_id TEXT,
  due_date TEXT,
  transaction_id TEXT,""",
    'shared obligation category column',
)
replace_once(
    'src/db/sqliteSchema.ts',
    """  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,""",
    """  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,""",
    'shared obligation category FK',
)
replace_once(
    'src/db/sqliteSchema.ts',
    """CREATE INDEX IF NOT EXISTS idx_shared_responsibility_obligation ON shared_responsibilities(obligation_id);""",
    """CREATE UNIQUE INDEX IF NOT EXISTS one_shared_expense_per_transaction
  ON shared_obligations(transaction_id) WHERE transaction_id IS NOT NULL AND kind = 'EXPENSE';
CREATE INDEX IF NOT EXISTS idx_shared_responsibility_obligation ON shared_responsibilities(obligation_id);""",
    'shared transaction unique index',
)
replace_once(
    'src/db/sqliteSchema.ts',
    """  o.id, o.title, o.kind, o.total_amount, o.due_date, o.transaction_id,""",
    """  o.id, o.title, o.kind, o.total_amount, o.category_id, o.due_date, o.transaction_id,""",
    'shared summary category',
)
replace_once(
    'src/db/sqliteSchema.ts',
    """  `ALTER TABLE recurring_rules ADD COLUMN goal_id TEXT;`,
  `UPDATE categories SET affordability_class""",
    """  `ALTER TABLE recurring_rules ADD COLUMN goal_id TEXT;`,
  `ALTER TABLE shared_obligations ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS one_shared_expense_per_transaction ON shared_obligations(transaction_id) WHERE transaction_id IS NOT NULL AND kind = 'EXPENSE';`,
  `UPDATE categories SET affordability_class""",
    'shared category migration',
)

# ---------------------------------------------------------------------------
# Repository row mapping + insert.
# ---------------------------------------------------------------------------
replace_once(
    'src/db/sharedFinanceRepository.ts',
    """    totalAmount: Number(row.total_amount), dueDate: row.due_date ?? undefined,""",
    """    totalAmount: Number(row.total_amount), categoryId: row.category_id ?? undefined, dueDate: row.due_date ?? undefined,""",
    'obligation row category',
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    """      `INSERT INTO shared_obligations (id, title, kind, total_amount, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [obligation.id, obligation.title.trim(), obligation.kind, obligation.totalAmount, obligation.dueDate ?? null, obligation.transactionId ?? null, obligation.liabilityAccountId ?? null, obligation.recurringRuleId ?? null, obligation.settlementMode, obligation.status, obligation.createdAt],""",
    """      `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [obligation.id, obligation.title.trim(), obligation.kind, obligation.totalAmount, obligation.categoryId ?? null, obligation.dueDate ?? null, obligation.transactionId ?? null, obligation.liabilityAccountId ?? null, obligation.recurringRuleId ?? null, obligation.settlementMode, obligation.status, obligation.createdAt],""",
    'obligation insert category',
)

# ---------------------------------------------------------------------------
# Backup import includes category_id.
# ---------------------------------------------------------------------------
replace_once(
    'src/db/dbClient.ts',
    """executePreparedRows(driver, `INSERT INTO shared_obligations (id, title, kind, total_amount, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligations.map(item => [item.id, item.title, item.kind, Math.abs(Number(item.totalAmount)), item.dueDate ?? null, item.transactionId ?? null, item.liabilityAccountId ?? null, item.recurringRuleId ?? null, item.settlementMode ?? 'TRACK', item.status ?? 'OPEN', item.createdAt ?? new Date().toISOString()]));""",
    """executePreparedRows(driver, `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligations.map(item => [item.id, item.title, item.kind, Math.abs(Number(item.totalAmount)), item.categoryId ?? null, item.dueDate ?? null, item.transactionId ?? null, item.liabilityAccountId ?? null, item.recurringRuleId ?? null, item.settlementMode ?? 'TRACK', item.status ?? 'OPEN', item.createdAt ?? new Date().toISOString()]));""",
    'backup shared obligation category',
)

# ---------------------------------------------------------------------------
# AppContext exposes one derived personal-spending collection for every UI.
# ---------------------------------------------------------------------------
replace_once(
    'src/context/AppContext.tsx',
    """import { SAVINGS_GOALS_KEY, normalizeSavingsGoal, normalizeSavingsGoals } from '../domain/savingsGoals';""",
    """import { SAVINGS_GOALS_KEY, normalizeSavingsGoal, normalizeSavingsGoals } from '../domain/savingsGoals';
import { buildPersonalExpenseRecords, type PersonalExpenseRecord } from '../domain/personalSpending';""",
    'personal spending import',
)
replace_once(
    'src/context/AppContext.tsx',
    """  loanContributionRules: LoanContributionRule[];
  addSharedPerson:""",
    """  loanContributionRules: LoanContributionRule[];
  personalExpenseRecords: PersonalExpenseRecord[];
  addSharedPerson:""",
    'context personal expense type',
)
replace_once(
    'src/context/AppContext.tsx',
    """  const loanContributionRules = sharedFinance.loanContributionRules;

  // `balance` remains""",
    """  const loanContributionRules = sharedFinance.loanContributionRules;
  const personalExpenseRecords = useMemo(
    () => buildPersonalExpenseRecords(transactions, people, sharedObligations, sharedResponsibilities),
    [transactions, people, sharedObligations, sharedResponsibilities],
  );

  // `balance` remains""",
    'personal expense records memo',
)
replace_once(
    'src/context/AppContext.tsx',
    """  createSharedExpense: (input: { title: string; totalAmount: number; transactionId?: string; allocations:""",
    """  createSharedExpense: (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations:""",
    'createSharedExpense interface fields',
)
replace_once(
    'src/context/AppContext.tsx',
    """  const createSharedExpense = async (input: { title: string; totalAmount: number; transactionId?: string; allocations:""",
    """  const createSharedExpense = async (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations:""",
    'createSharedExpense implementation fields',
)
replace_once(
    'src/context/AppContext.tsx',
    """      title: input.title, kind: 'EXPENSE', totalAmount: input.totalAmount, transactionId: input.transactionId,
      settlementMode: 'TRACK',""",
    """      title: input.title, kind: 'EXPENSE', totalAmount: input.totalAmount, categoryId: input.categoryId, dueDate: input.dueDate, transactionId: input.transactionId,
      settlementMode: 'TRACK',""",
    'persist shared expense category date',
)
replace_once(
    'src/context/AppContext.tsx',
    """      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, addSharedPerson,""",
    """      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, personalExpenseRecords, addSharedPerson,""",
    'provider personal records',
)

# ---------------------------------------------------------------------------
# Sharing UI: date/category for external-only obligations; linked transaction
# auto-hydrates both but remains editable.
# ---------------------------------------------------------------------------
replace_once(
    'src/components/SharingPanel.tsx',
    """    transactions, formatCurrency,
  } = useAppContext();""",
    """    transactions, categories, formatCurrency,
  } = useAppContext();""",
    'SharingPanel categories context',
)
replace_once(
    'src/components/SharingPanel.tsx',
    """  const [totalAmount, setTotalAmount] = useState('');
  const [shares,""",
    """  const [totalAmount, setTotalAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [obligationDate, setObligationDate] = useState(new Date().toISOString().slice(0, 10));
  const [shares,""",
    'sharing category date state',
)
replace_once(
    'src/components/SharingPanel.tsx',
    """    setTotalAmount(String(amount));
    if (me) setShares""",
    """    setTotalAmount(String(amount));
    const matchedCategory = categories.find(category => category.id === tx.category || `#${category.name.toLowerCase().replace(/\\s+/g, '')}` === tx.category);
    setCategoryId(matchedCategory?.id || '');
    setObligationDate(new Date(tx.date).toISOString().slice(0, 10));
    if (me) setShares""",
    'hydrate linked category date',
)
replace_once(
    'src/components/SharingPanel.tsx',
    """    if (!title.trim() || !selectedTotal || selectedTotal <= 0) { setError('Enter a title and total household amount.'); return; }
    if (Math.abs(allocatedTotal""",
    """    if (!title.trim() || !selectedTotal || selectedTotal <= 0) { setError('Enter a title and total household amount.'); return; }
    if (!categoryId) { setError('Choose an expense category so personal-spending reports stay accurate.'); return; }
    if (!obligationDate) { setError('Choose the date this shared expense belongs to.'); return; }
    if (Math.abs(allocatedTotal""",
    'validate shared category date',
)
replace_once(
    'src/components/SharingPanel.tsx',
    """      title: title.trim(), totalAmount: selectedTotal,
      transactionId:""",
    """      title: title.trim(), totalAmount: selectedTotal, categoryId, dueDate: obligationDate,
      transactionId:""",
    'save shared category date',
)
replace_once(
    'src/components/SharingPanel.tsx',
    """    setLinkedTransactionId(''); setTitle(''); setTotalAmount(''); setShares({}); setExternalPaid({});""",
    """    setLinkedTransactionId(''); setTitle(''); setTotalAmount(''); setCategoryId(''); setObligationDate(new Date().toISOString().slice(0, 10)); setShares({}); setExternalPaid({});""",
    'reset sharing category date',
)
replace_once(
    'src/components/SharingPanel.tsx',
    """          <label className=\"block\"><span className=\"text-xs font-bold uppercase tracking-wide text-on-surface-variant\">Household total</span><div className=\"mt-1.5\"><CurrencyInput value={totalAmount} onValueChange={setTotalAmount} /></div></label>
        </div>""",
    """          <label className=\"block\"><span className=\"text-xs font-bold uppercase tracking-wide text-on-surface-variant\">Household total</span><div className=\"mt-1.5\"><CurrencyInput value={totalAmount} onValueChange={setTotalAmount} /></div></label>
          <label className=\"block\"><span className=\"text-xs font-bold uppercase tracking-wide text-on-surface-variant\">Expense category</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)} className=\"mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-3 text-sm text-on-surface\"><option value=\"\">Choose category</option>{categories.filter(category => category.type !== 'income').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className=\"block\"><span className=\"text-xs font-bold uppercase tracking-wide text-on-surface-variant\">Expense date</span><input type=\"date\" value={obligationDate} onChange={event => setObligationDate(event.target.value)} className=\"mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-3 text-sm text-on-surface\" /></label>
        </div>""",
    'sharing category date controls',
)

# ---------------------------------------------------------------------------
# Budget helpers can consume personal economic expense records.
# ---------------------------------------------------------------------------
p = Path('src/utils/budget.ts')
s = p.read_text()
s = s.replace("import type { Category, Transaction } from '../types';", "import type { Category, Transaction } from '../types';\nimport type { PersonalExpenseRecord } from '../domain/personalSpending';")
s = s.replace(
    """export function getCategorySpend(
  category: Category,
  transactions: Transaction[],
  isDateInCurrentCycle: (date: string) => boolean,
): number {""",
    """export function getCategorySpend(
  category: Category,
  transactions: Transaction[],
  isDateInCurrentCycle: (date: string) => boolean,
  personalExpenseRecords?: PersonalExpenseRecord[],
): number {""",
)
old_body = """  if (!isSpendableExpenseCategory(category)) return 0;
  return transactions
    .filter(transaction =>
      !transaction.isOpeningBalance &&
      transaction.is_verified !== 0 &&
      isCashFlowTransaction(transaction) &&
      transaction.type === 'expense' &&
      isDateInCurrentCycle(transaction.date) &&
      matchesCategory(transaction, category)
    )
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);"""
new_body = """  if (!isSpendableExpenseCategory(category)) return 0;
  if (personalExpenseRecords) {
    const normalizedName = `#${category.name.toLowerCase().replace(/\\s+/g, '')}`;
    return personalExpenseRecords
      .filter(record => isDateInCurrentCycle(record.date) && (record.category === category.id || record.category === normalizedName))
      .reduce((total, record) => total + Math.abs(record.amount), 0);
  }
  return transactions
    .filter(transaction =>
      !transaction.isOpeningBalance &&
      transaction.is_verified !== 0 &&
      isCashFlowTransaction(transaction) &&
      transaction.type === 'expense' &&
      isDateInCurrentCycle(transaction.date) &&
      matchesCategory(transaction, category)
    )
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);"""
if old_body not in s:
    raise SystemExit('category spend body anchor not found')
s = s.replace(old_body, new_body, 1)
s = s.replace(
    """export function getBudgetSummary(
  categories: Category[],
  transactions: Transaction[],
  getCycleDetails: (date: string) => { key: string },
) {""",
    """export function getBudgetSummary(
  categories: Category[],
  transactions: Transaction[],
  getCycleDetails: (date: string) => { key: string },
  personalExpenseRecords?: PersonalExpenseRecord[],
) {""",
)
old_spent = """  const spent = transactions
    .filter(transaction => {
      if (transaction.isOpeningBalance || transaction.is_verified === 0 || !isCashFlowTransaction(transaction) || transaction.type !== 'expense') return false;
      if (getCycleDetails(transaction.date).key !== currentCycle) return false;
      const category = categories.find(item => matchesCategory(transaction, item));
      return category ? isSpendableExpenseCategory(category) : true;
    })
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);"""
new_spent = """  const spent = personalExpenseRecords
    ? personalExpenseRecords
      .filter(record => {
        if (getCycleDetails(record.date).key !== currentCycle) return false;
        const category = categories.find(item => item.id === record.category || `#${item.name.toLowerCase().replace(/\\s+/g, '')}` === record.category);
        return category ? isSpendableExpenseCategory(category) : true;
      })
      .reduce((total, record) => total + Math.abs(record.amount), 0)
    : transactions
      .filter(transaction => {
        if (transaction.isOpeningBalance || transaction.is_verified === 0 || !isCashFlowTransaction(transaction) || transaction.type !== 'expense') return false;
        if (getCycleDetails(transaction.date).key !== currentCycle) return false;
        const category = categories.find(item => matchesCategory(transaction, item));
        return category ? isSpendableExpenseCategory(category) : true;
      })
      .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);"""
if old_spent not in s:
    raise SystemExit('budget spent anchor not found')
s = s.replace(old_spent, new_spent, 1)
p.write_text(s)

# Manage category budget progress uses personal economic spending.
replace_once(
    'src/components/ManageFinances.tsx',
    """  const { categories, accounts, addCategory, updateCategory, deleteCategory, formatCurrency, transactions, getCurrencySymbol,""",
    """  const { categories, accounts, addCategory, updateCategory, deleteCategory, formatCurrency, transactions, personalExpenseRecords, getCurrencySymbol,""",
    'Manage personal records context',
)
replace_once(
    'src/components/ManageFinances.tsx',
    """return category ? getCategorySpend(category, transactions, isDateInCurrentCycle) : 0;""",
    """return category ? getCategorySpend(category, transactions, isDateInCurrentCycle, personalExpenseRecords) : 0;""",
    'Manage personal category spend',
)

# Dashboard budget status uses economic spend while its cycle cash-flow card stays raw.
replace_once(
    'src/components/Dashboard.tsx',
    """  const { transactions, addTransaction, formatCurrency,""",
    """  const { transactions, personalExpenseRecords, addTransaction, formatCurrency,""",
    'Dashboard personal records context',
)
replace_once(
    'src/components/Dashboard.tsx',
    """getBudgetSummary(categories, transactions, getCycleDetails);""",
    """getBudgetSummary(categories, transactions, getCycleDetails, personalExpenseRecords);""",
    'Dashboard budget personal spend',
)
