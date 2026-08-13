from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label} anchor not found in {path}')
    p.write_text(text.replace(old, new, 1))

# Types -----------------------------------------------------------------------
replace_once('src/types.ts', '''  totalAmount: number;\n  dueDate?: string;\n  transactionId?: string;''', '''  totalAmount: number;\n  categoryId?: string;\n  dueDate?: string;\n  transactionId?: string;''', 'SharedObligation categoryId')

# Schema ----------------------------------------------------------------------
replace_once('src/db/sqliteSchema.ts', '''  total_amount REAL NOT NULL CHECK(total_amount > 0),\n  due_date TEXT,\n  transaction_id TEXT,''', '''  total_amount REAL NOT NULL CHECK(total_amount > 0),\n  category_id TEXT,\n  due_date TEXT,\n  transaction_id TEXT,''', 'shared category column')
replace_once('src/db/sqliteSchema.ts', '''  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,''', '''  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,\n  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,''', 'shared category FK')
replace_once('src/db/sqliteSchema.ts', '''CREATE INDEX IF NOT EXISTS idx_shared_responsibility_obligation ON shared_responsibilities(obligation_id);''', '''CREATE UNIQUE INDEX IF NOT EXISTS one_shared_expense_per_transaction\n  ON shared_obligations(transaction_id) WHERE transaction_id IS NOT NULL AND kind = 'EXPENSE';\nCREATE INDEX IF NOT EXISTS idx_shared_responsibility_obligation ON shared_responsibilities(obligation_id);''', 'shared transaction unique index')
replace_once('src/db/sqliteSchema.ts', '''  o.id, o.title, o.kind, o.total_amount, o.due_date, o.transaction_id,''', '''  o.id, o.title, o.kind, o.total_amount, o.category_id, o.due_date, o.transaction_id,''', 'shared summary category')
replace_once('src/db/sqliteSchema.ts', '''  `ALTER TABLE recurring_rules ADD COLUMN goal_id TEXT;`,\n  `UPDATE categories SET affordability_class''', '''  `ALTER TABLE recurring_rules ADD COLUMN goal_id TEXT;`,\n  `ALTER TABLE shared_obligations ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;`,\n  `CREATE UNIQUE INDEX IF NOT EXISTS one_shared_expense_per_transaction ON shared_obligations(transaction_id) WHERE transaction_id IS NOT NULL AND kind = 'EXPENSE';`,\n  `UPDATE categories SET affordability_class''', 'shared category migration')

# Repository ------------------------------------------------------------------
replace_once('src/db/sharedFinanceRepository.ts', '''    totalAmount: Number(row.total_amount), dueDate: row.due_date ?? undefined,''', '''    totalAmount: Number(row.total_amount), categoryId: row.category_id ?? undefined, dueDate: row.due_date ?? undefined,''', 'obligation row category')
replace_once('src/db/sharedFinanceRepository.ts', '''      `INSERT INTO shared_obligations (id, title, kind, total_amount, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,\n      [obligation.id, obligation.title.trim(), obligation.kind, obligation.totalAmount, obligation.dueDate ?? null, obligation.transactionId ?? null, obligation.liabilityAccountId ?? null, obligation.recurringRuleId ?? null, obligation.settlementMode, obligation.status, obligation.createdAt],''', '''      `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,\n      [obligation.id, obligation.title.trim(), obligation.kind, obligation.totalAmount, obligation.categoryId ?? null, obligation.dueDate ?? null, obligation.transactionId ?? null, obligation.liabilityAccountId ?? null, obligation.recurringRuleId ?? null, obligation.settlementMode, obligation.status, obligation.createdAt],''', 'obligation insert category')

# Backup import ---------------------------------------------------------------
replace_once('src/db/dbClient.ts', '''executePreparedRows(driver, `INSERT INTO shared_obligations (id, title, kind, total_amount, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligations.map(item => [item.id, item.title, item.kind, Math.abs(Number(item.totalAmount)), item.dueDate ?? null, item.transactionId ?? null, item.liabilityAccountId ?? null, item.recurringRuleId ?? null, item.settlementMode ?? 'TRACK', item.status ?? 'OPEN', item.createdAt ?? new Date().toISOString()]));''', '''executePreparedRows(driver, `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligations.map(item => [item.id, item.title, item.kind, Math.abs(Number(item.totalAmount)), item.categoryId ?? null, item.dueDate ?? null, item.transactionId ?? null, item.liabilityAccountId ?? null, item.recurringRuleId ?? null, item.settlementMode ?? 'TRACK', item.status ?? 'OPEN', item.createdAt ?? new Date().toISOString()]));''', 'backup obligation category')

# AppContext ------------------------------------------------------------------
replace_once('src/context/AppContext.tsx', '''import { SAVINGS_GOALS_KEY, normalizeSavingsGoal, normalizeSavingsGoals } from '../domain/savingsGoals';''', '''import { SAVINGS_GOALS_KEY, normalizeSavingsGoal, normalizeSavingsGoals } from '../domain/savingsGoals';\nimport { buildPersonalExpenseRecords, type PersonalExpenseRecord } from '../domain/personalSpending';''', 'personal spending import')
replace_once('src/context/AppContext.tsx', '''  loanContributionRules: LoanContributionRule[];\n  addSharedPerson:''', '''  loanContributionRules: LoanContributionRule[];\n  personalExpenseRecords: PersonalExpenseRecord[];\n  addSharedPerson:''', 'context personal records')
replace_once('src/context/AppContext.tsx', '''  const loanContributionRules = sharedFinance.loanContributionRules;\n\n  // `balance` remains''', '''  const loanContributionRules = sharedFinance.loanContributionRules;\n  const personalExpenseRecords = useMemo(\n    () => buildPersonalExpenseRecords(transactions, people, sharedObligations, sharedResponsibilities),\n    [transactions, people, sharedObligations, sharedResponsibilities],\n  );\n\n  // `balance` remains''', 'personal records memo')
replace_once('src/context/AppContext.tsx', '''  createSharedExpense: (input: { title: string; totalAmount: number; transactionId?: string; allocations:''', '''  createSharedExpense: (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations:''', 'create shared interface')
replace_once('src/context/AppContext.tsx', '''  const createSharedExpense = async (input: { title: string; totalAmount: number; transactionId?: string; allocations:''', '''  const createSharedExpense = async (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations:''', 'create shared implementation')
replace_once('src/context/AppContext.tsx', '''      title: input.title, kind: 'EXPENSE', totalAmount: input.totalAmount, transactionId: input.transactionId,\n      settlementMode: 'TRACK',''', '''      title: input.title, kind: 'EXPENSE', totalAmount: input.totalAmount, categoryId: input.categoryId, dueDate: input.dueDate, transactionId: input.transactionId,\n      settlementMode: 'TRACK',''', 'persist category date')
replace_once('src/context/AppContext.tsx', '''      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, addSharedPerson,''', '''      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, personalExpenseRecords, addSharedPerson,''', 'provider personal records')

# Sharing UI ------------------------------------------------------------------
replace_once('src/components/SharingPanel.tsx', '''    transactions, formatCurrency,\n  } = useAppContext();''', '''    transactions, categories, formatCurrency,\n  } = useAppContext();''', 'sharing categories')
replace_once('src/components/SharingPanel.tsx', '''  const [totalAmount, setTotalAmount] = useState('');\n  const [shares,''', '''  const [totalAmount, setTotalAmount] = useState('');\n  const [categoryId, setCategoryId] = useState('');\n  const [obligationDate, setObligationDate] = useState(new Date().toISOString().slice(0, 10));\n  const [shares,''', 'sharing category date state')
replace_once('src/components/SharingPanel.tsx', '''    setTotalAmount(String(amount));\n    if (me) setShares''', '''    setTotalAmount(String(amount));\n    const matchedCategory = categories.find(category => category.id === tx.category || `#${category.name.toLowerCase().replace(/\\s+/g, '')}` === tx.category);\n    setCategoryId(matchedCategory?.id || '');\n    setObligationDate(new Date(tx.date).toISOString().slice(0, 10));\n    if (me) setShares''', 'hydrate category date')
replace_once('src/components/SharingPanel.tsx', '''    if (!title.trim() || !selectedTotal || selectedTotal <= 0) { setError('Enter a title and total household amount.'); return; }\n    if (Math.abs(allocatedTotal''', '''    if (!title.trim() || !selectedTotal || selectedTotal <= 0) { setError('Enter a title and total household amount.'); return; }\n    if (!categoryId) { setError('Choose an expense category so personal-spending reports stay accurate.'); return; }\n    if (!obligationDate) { setError('Choose the date this shared expense belongs to.'); return; }\n    if (Math.abs(allocatedTotal''', 'validate category date')
replace_once('src/components/SharingPanel.tsx', '''      title: title.trim(), totalAmount: selectedTotal,\n      transactionId:''', '''      title: title.trim(), totalAmount: selectedTotal, categoryId, dueDate: obligationDate,\n      transactionId:''', 'save category date')
replace_once('src/components/SharingPanel.tsx', '''    setLinkedTransactionId(''); setTitle(''); setTotalAmount(''); setShares({}); setExternalPaid({});''', '''    setLinkedTransactionId(''); setTitle(''); setTotalAmount(''); setCategoryId(''); setObligationDate(new Date().toISOString().slice(0, 10)); setShares({}); setExternalPaid({});''', 'reset category date')
replace_once('src/components/SharingPanel.tsx', '''          <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Household total</span><div className="mt-1.5"><CurrencyInput value={totalAmount} onValueChange={setTotalAmount} /></div></label>\n        </div>''', '''          <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Household total</span><div className="mt-1.5"><CurrencyInput value={totalAmount} onValueChange={setTotalAmount} /></div></label>\n          <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Expense category</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-3 text-sm text-on-surface"><option value="">Choose category</option>{categories.filter(category => category.type !== 'income').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>\n          <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Expense date</span><input type="date" value={obligationDate} onChange={event => setObligationDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-3 text-sm text-on-surface" /></label>\n        </div>''', 'category date controls')

# Budget: preserve rollover behavior, change only spend source ----------------
Path('src/utils/budget.ts').write_text('''import type { Category, Transaction } from '../types';
import type { PersonalExpenseRecord } from '../domain/personalSpending';
import { isCashFlowTransaction } from '../domain/ledgerRules';

type CycleDetails = { month: number; year: number; key: string };
type CycleResolver = (date: string) => CycleDetails;

export function categoryTag(category: Category): string {
  return `#${category.name.toLowerCase().replace(/\\s+/g, '')}`;
}

export function getCategorySpend(
  category: Category,
  transactions: Transaction[],
  isInCycle: (date: string) => boolean,
  personalExpenseRecords?: PersonalExpenseRecord[],
): number {
  if (category.type === 'income') return 0;
  const tag = categoryTag(category);
  if (personalExpenseRecords) {
    return personalExpenseRecords
      .filter(record => isInCycle(record.date) && (record.category === tag || record.category === category.id))
      .reduce((total, record) => total + Math.abs(record.amount), 0);
  }
  return transactions.filter(transaction =>
    isInCycle(transaction.date) && !transaction.isOpeningBalance && transaction.is_verified !== 0 &&
    isCashFlowTransaction(transaction) && transaction.type === 'expense' &&
    (transaction.category === tag || transaction.category === category.id)
  ).reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
}

function cycleKeysBetween(first: CycleDetails, last: CycleDetails): string[] {
  const keys: string[] = [];
  let year = first.year;
  let month = first.month;
  while (year < last.year || (year === last.year && month <= last.month)) {
    keys.push(`${year}-${month}`);
    month += 1;
    if (month === 12) { month = 0; year += 1; }
  }
  return keys;
}

export function getBudgetSummary(
  categories: Category[],
  transactions: Transaction[],
  getCycleDetails: CycleResolver,
  personalExpenseRecords?: PersonalExpenseRecord[],
) {
  const budgetCategories = categories.filter(category => category.type !== 'income' && category.group !== 'Savings');
  const currentCycle = getCycleDetails(new Date().toISOString());
  const eligibleTransactions = transactions.filter(transaction =>
    !transaction.isOpeningBalance && transaction.is_verified !== 0 &&
    isCashFlowTransaction(transaction) && transaction.type === 'expense'
  );
  let budget = 0;
  let spent = 0;
  for (const category of budgetCategories) {
    const tag = categoryTag(category);
    const cycleSpend = new Map<string, number>();
    const categoryTransactions = eligibleTransactions.filter(transaction => transaction.category === tag || transaction.category === category.id);
    const categoryPersonalRecords = personalExpenseRecords?.filter(record => record.category === tag || record.category === category.id);
    const spendRecords = categoryPersonalRecords ?? categoryTransactions.map(transaction => ({ date: transaction.date, amount: Math.abs(transaction.amount) }));
    for (const record of spendRecords) {
      const key = getCycleDetails(record.date).key;
      cycleSpend.set(key, (cycleSpend.get(key) ?? 0) + Math.abs(record.amount));
    }
    const firstCycle = spendRecords.length
      ? spendRecords.reduce((first, record) => {
          const cycle = getCycleDetails(record.date);
          return cycle.year < first.year || (cycle.year === first.year && cycle.month < first.month) ? cycle : first;
        }, currentCycle)
      : currentCycle;
    const cycleKeys = cycleKeysBetween(firstCycle, currentCycle);
    const baseBudget = Math.max(0, Number(category.budget) || 0);
    let carry = 0;
    let currentBudget = baseBudget;
    for (const key of cycleKeys) {
      currentBudget = category.isRollover ? baseBudget + carry : baseBudget;
      const currentSpend = cycleSpend.get(key) ?? 0;
      carry = category.isRollover ? Math.max(0, currentBudget - currentSpend) : 0;
    }
    budget += currentBudget;
    spent += cycleSpend.get(currentCycle.key) ?? 0;
  }
  return { budget, spent, progress: budget > 0 ? spent / budget * 100 : 0 };
}
''')

# Manage + Dashboard -----------------------------------------------------------
replace_once('src/components/ManageFinances.tsx', '''  const { categories, accounts, addCategory, updateCategory, deleteCategory, formatCurrency, transactions, getCurrencySymbol,''', '''  const { categories, accounts, addCategory, updateCategory, deleteCategory, formatCurrency, transactions, personalExpenseRecords, getCurrencySymbol,''', 'Manage personal records')
replace_once('src/components/ManageFinances.tsx', '''return category ? getCategorySpend(category, transactions, isDateInCurrentCycle) : 0;''', '''return category ? getCategorySpend(category, transactions, isDateInCurrentCycle, personalExpenseRecords) : 0;''', 'Manage economic spend')
replace_once('src/components/Dashboard.tsx', '''  const { transactions, addTransaction, formatCurrency,''', '''  const { transactions, personalExpenseRecords, addTransaction, formatCurrency,''', 'Dashboard personal records')
replace_once('src/components/Dashboard.tsx', '''getBudgetSummary(categories, transactions, getCycleDetails);''', '''getBudgetSummary(categories, transactions, getCycleDetails, personalExpenseRecords);''', 'Dashboard economic budget')
