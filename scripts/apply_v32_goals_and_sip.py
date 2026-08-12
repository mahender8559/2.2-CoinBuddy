from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Anchor missing in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))


def add_import(path: str, anchor: str, new_import: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new_import in text:
        return
    if anchor not in text:
        raise SystemExit(f'Import anchor missing in {path}: {anchor!r}')
    p.write_text(text.replace(anchor, anchor + '\n' + new_import, 1))

# ---------------------------------------------------------------------------
# dbClient: persist Goals in app_settings and sync investment SIP metadata to a
# real recurring transfer rule.
# ---------------------------------------------------------------------------
add_import(
    'src/db/dbClient.ts',
    "import { AFFORDABILITY_SETTINGS_KEY, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';",
    "import { SAVINGS_GOALS_KEY, normalizeSavingsGoals } from '../domain/savingsGoals';\nimport { buildInvestmentSipRule, investmentSipRuleId, isInvestmentSipAccount } from '../domain/investmentSip';",
)

replace_once(
    'src/db/dbClient.ts',
    """export async function deleteRecurringRuleRow(driver: SqlJsDatabaseDriver, id: string): Promise<void> {\n  await driver.execute(`DELETE FROM recurring_rules WHERE id = ?;`, [id]);\n}\n\nexport async function skipRecurringRuleOccurrence""",
    """export async function deleteRecurringRuleRow(driver: SqlJsDatabaseDriver, id: string): Promise<void> {\n  await driver.execute(`DELETE FROM recurring_rules WHERE id = ?;`, [id]);\n}\n\n/** Keep Investment-account SIP metadata and the recurring scheduler in sync. */\nexport async function syncInvestmentSipRecurringRule(\n  driver: SqlJsDatabaseDriver,\n  accountId: string,\n  account: Account,\n  sourceAccountId?: string,\n): Promise<void> {\n  const ruleId = investmentSipRuleId(accountId);\n  const existing = await driver.query(`SELECT id FROM recurring_rules WHERE id = ?`, [ruleId]);\n\n  if (!isInvestmentSipAccount(account)) {\n    if (existing.length) await deleteRecurringRuleRow(driver, ruleId);\n    return;\n  }\n  if (!sourceAccountId) throw new Error('Choose the account that funds this SIP.');\n\n  const rule = buildInvestmentSipRule(accountId, account, sourceAccountId);\n  if (existing.length) {\n    await updateRecurringRuleRow(driver, rule);\n  } else {\n    await createRecurringRule(driver, {\n      title: rule.title,\n      subtitle: rule.subtitle ?? '',\n      amount: rule.amount,\n      date: `${rule.nextDueDate}T12:00:00`,\n      category: rule.category ?? '#investment',\n      icon: rule.icon ?? 'Target',\n      type: 'transfer',\n      fromAccountId: rule.fromAccountId,\n      toAccountId: rule.toAccountId,\n      transaction_type: 'TRANSFER',\n      isRecurring: true,\n      recurrenceFrequency: 'MONTHLY',\n      notes: rule.notes,\n    }, { id: rule.id, nextDueDate: rule.nextDueDate });\n  }\n\n  // If the first SIP is already due, create it as Needs confirmation now.\n  await generateDueRecurringTransactions(driver, false);\n}\n\nexport async function skipRecurringRuleOccurrence""",
)

replace_once(
    'src/db/dbClient.ts',
    """    await upsertAppSetting(driver, AFFORDABILITY_SETTINGS_KEY, normalizeAffordabilitySettings(data.affordabilitySettings));\n    await driver.execute('COMMIT');""",
    """    await upsertAppSetting(driver, AFFORDABILITY_SETTINGS_KEY, normalizeAffordabilitySettings(data.affordabilitySettings));\n    await upsertAppSetting(driver, SAVINGS_GOALS_KEY, normalizeSavingsGoals(data.savingsGoals));\n    await driver.execute('COMMIT');""",
)

# ---------------------------------------------------------------------------
# Backup schema: keep Goals through encrypted backup/import and old migrations.
# ---------------------------------------------------------------------------
add_import(
    'src/utils/ledgerSchema.ts',
    "import { DEFAULT_AFFORDABILITY_SETTINGS, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';",
    "import { normalizeSavingsGoals } from '../domain/savingsGoals';",
)
replace_once(
    'src/utils/ledgerSchema.ts',
    """  if (ledger.affordabilitySettings !== undefined && (!ledger.affordabilitySettings || typeof ledger.affordabilitySettings !== 'object' || Array.isArray(ledger.affordabilitySettings))) return 'Backup field \\"affordabilitySettings\\" must be an object when present.';\n""",
    """  if (ledger.affordabilitySettings !== undefined && (!ledger.affordabilitySettings || typeof ledger.affordabilitySettings !== 'object' || Array.isArray(ledger.affordabilitySettings))) return 'Backup field \\"affordabilitySettings\\" must be an object when present.';\n  if (ledger.savingsGoals !== undefined && !Array.isArray(ledger.savingsGoals)) return 'Backup field \\"savingsGoals\\" must be an array when present.';\n""",
)
replace_once(
    'src/utils/ledgerSchema.ts',
    """      affordabilitySettings: normalizeAffordabilitySettings(data.affordabilitySettings),\n      currency: data.currency || 'INR',""",
    """      affordabilitySettings: normalizeAffordabilitySettings(data.affordabilitySettings),\n      savingsGoals: normalizeSavingsGoals(data.savingsGoals),\n      currency: data.currency || 'INR',""",
)
replace_once(
    'src/utils/ledgerSchema.ts',
    """    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [], recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [], affordabilitySettings: { ...DEFAULT_AFFORDABILITY_SETTINGS }, currency: data.currency || '$', lastUpdated: new Date().toISOString(),\n""",
    """    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [], recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [], affordabilitySettings: { ...DEFAULT_AFFORDABILITY_SETTINGS }, savingsGoals: [], currency: data.currency || '$', lastUpdated: new Date().toISOString(),\n""",
)

# ---------------------------------------------------------------------------
# AppContext: first-class Goal state + SIP scheduling as part of account save.
# ---------------------------------------------------------------------------
replace_once(
    'src/context/AppContext.tsx',
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings } from '../types';",
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings, SavingsGoal } from '../types';",
)
replace_once(
    'src/context/AppContext.tsx',
    """  generateDueRecurringTransactions,\n  repairLegacyRecurringConfirmationState,\n""",
    """  generateDueRecurringTransactions,\n  repairLegacyRecurringConfirmationState,\n  syncInvestmentSipRecurringRule,\n""",
)
add_import(
    'src/context/AppContext.tsx',
    "import { AFFORDABILITY_SETTINGS_KEY, DEFAULT_AFFORDABILITY_SETTINGS, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';",
    "import { SAVINGS_GOALS_KEY, normalizeSavingsGoal, normalizeSavingsGoals } from '../domain/savingsGoals';",
)
replace_once(
    'src/context/AppContext.tsx',
    """  affordabilitySettings?: AffordabilitySettings;\n  currency?: string;\n};""",
    """  affordabilitySettings?: AffordabilitySettings;\n  savingsGoals?: SavingsGoal[];\n  currency?: string;\n};""",
)
replace_once(
    'src/context/AppContext.tsx',
    """  addAccount: (account: Omit<Account, 'id'>) => void;\n  updateAccount: (id: string, account: Omit<Account, 'id'>) => void;""",
    """  addAccount: (account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string }) => void;\n  updateAccount: (id: string, account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string }) => void;""",
)
replace_once(
    'src/context/AppContext.tsx',
    """  setAffordabilitySettings: (settings: AffordabilitySettings) => void;\n  updateRecurringRule:""",
    """  setAffordabilitySettings: (settings: AffordabilitySettings) => void;\n  savingsGoals: SavingsGoal[];\n  addSavingsGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;\n  updateSavingsGoal: (id: string, goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;\n  deleteSavingsGoal: (id: string) => void;\n  updateRecurringRule:""",
)
replace_once(
    'src/context/AppContext.tsx',
    """  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);\n  const [affordabilitySettings,""",
    """  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);\n  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);\n  const [affordabilitySettings,""",
)
replace_once(
    'src/context/AppContext.tsx',
    """        setAffordabilitySettingsState(normalizeAffordabilitySettings(settings[AFFORDABILITY_SETTINGS_KEY]));\n        setDbReady(true);""",
    """        setAffordabilitySettingsState(normalizeAffordabilitySettings(settings[AFFORDABILITY_SETTINGS_KEY]));\n        setSavingsGoals(normalizeSavingsGoals(settings[SAVINGS_GOALS_KEY]));\n        setDbReady(true);""",
)
replace_once(
    'src/context/AppContext.tsx',
    """        persistAppSetting(AFFORDABILITY_SETTINGS_KEY, affordabilitySettings),\n      ]);""",
    """        persistAppSetting(AFFORDABILITY_SETTINGS_KEY, affordabilitySettings),\n        persistAppSetting(SAVINGS_GOALS_KEY, savingsGoals),\n      ]);""",
)
replace_once(
    'src/context/AppContext.tsx',
    """  }, [theme, colorPalette, currency, autoRecur, biometric, passcode, monthCycleDay, profile, affordabilitySettings, dbReady, dbDriver]);""",
    """  }, [theme, colorPalette, currency, autoRecur, biometric, passcode, monthCycleDay, profile, affordabilitySettings, savingsGoals, dbReady, dbDriver]);""",
)

replace_once(
    'src/context/AppContext.tsx',
    """  const addAccount = (account: Omit<Account, 'id'>) => {""",
    """  const addAccount = (account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string } = {}) => {""",
)
replace_once(
    'src/context/AppContext.tsx',
    """        await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id);\n      });""",
    """        await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id);\n        await syncInvestmentSipRecurringRule(dbDriver, newId, { ...newAccount, balance: initialBalance }, options.sipSourceAccountId);\n      });""",
)
replace_once(
    'src/context/AppContext.tsx',
    """  const updateAccount = (id: string, account: Omit<Account, 'id'>) => {""",
    """  const updateAccount = (id: string, account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string } = {}) => {""",
)
# Two persistence branches inside updateAccount need SIP synchronization.
replace_once(
    'src/context/AppContext.tsx',
    """          await updateAccountRow(dbDriver, mergedAccount);\n          await updateOpeningBalance(dbDriver, id, account.balance);\n""",
    """          await updateAccountRow(dbDriver, mergedAccount);\n          await updateOpeningBalance(dbDriver, id, account.balance);\n          await syncInvestmentSipRecurringRule(dbDriver, id, { ...mergedAccount, balance: account.balance }, options.sipSourceAccountId);\n""",
)
replace_once(
    'src/context/AppContext.tsx',
    """          await updateAccountRow(dbDriver, { ...account, id, balance: 0 });\n          if (newOpeningTx) {\n            await insertTransactionRow(dbDriver, newOpeningTx);\n          }\n""",
    """          await updateAccountRow(dbDriver, { ...account, id, balance: 0 });\n          if (newOpeningTx) {\n            await insertTransactionRow(dbDriver, newOpeningTx);\n          }\n          await syncInvestmentSipRecurringRule(dbDriver, id, { ...account, id }, options.sipSourceAccountId);\n""",
)

# Goal CRUD beside category CRUD.
replace_once(
    'src/context/AppContext.tsx',
    """  const addCategory = (category: Omit<Category, 'id'>) => {""",
    """  const addSavingsGoal = (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => {\n    setSavingsGoals(previous => [normalizeSavingsGoal({ ...goal, id: crypto.randomUUID(), createdAt: new Date().toISOString() }), ...previous]);\n  };\n\n  const updateSavingsGoal = (id: string, goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => {\n    setSavingsGoals(previous => previous.map(item => item.id === id ? normalizeSavingsGoal({ ...item, ...goal, id }) : item));\n  };\n\n  const deleteSavingsGoal = (id: string) => {\n    const removed = savingsGoals.find(goal => goal.id === id);\n    setSavingsGoals(previous => previous.filter(goal => goal.id !== id));\n    if (removed) showToast('Goal deleted', 'Undo', () => setSavingsGoals(previous => previous.some(goal => goal.id === removed.id) ? previous : [removed, ...previous]));\n  };\n\n  const addCategory = (category: Omit<Category, 'id'>) => {""",
)
replace_once(
    'src/context/AppContext.tsx',
    """    setRecurringRules([]);\n    setAffordabilitySettingsState({ ...DEFAULT_AFFORDABILITY_SETTINGS });""",
    """    setRecurringRules([]);\n    setSavingsGoals([]);\n    setAffordabilitySettingsState({ ...DEFAULT_AFFORDABILITY_SETTINGS });""",
)
replace_once(
    'src/context/AppContext.tsx',
    """      setAffordabilitySettingsState(normalizeAffordabilitySettings(restoredAppSettings[AFFORDABILITY_SETTINGS_KEY]));\n      const integrity""",
    """      setAffordabilitySettingsState(normalizeAffordabilitySettings(restoredAppSettings[AFFORDABILITY_SETTINGS_KEY]));\n      setSavingsGoals(normalizeSavingsGoals(restoredAppSettings[SAVINGS_GOALS_KEY]));\n      const integrity""",
)
replace_once(
    'src/context/AppContext.tsx',
    """      if (data.recurringRules && Array.isArray(data.recurringRules)) setRecurringRules(data.recurringRules);\n      setAffordabilitySettingsState(normalizeAffordabilitySettings(data.affordabilitySettings));""",
    """      if (data.recurringRules && Array.isArray(data.recurringRules)) setRecurringRules(data.recurringRules);\n      setAffordabilitySettingsState(normalizeAffordabilitySettings(data.affordabilitySettings));\n      setSavingsGoals(normalizeSavingsGoals(data.savingsGoals));""",
)
replace_once(
    'src/context/AppContext.tsx',
    """    recurringRules,\n    affordabilitySettings,\n    currency,""",
    """    recurringRules,\n    affordabilitySettings,\n    savingsGoals,\n    currency,""",
)
replace_once(
    'src/context/AppContext.tsx',
    """      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, recurringRules, affordabilitySettings, setAffordabilitySettings, updateRecurringRule, deleteRecurringRule, skipRecurringRule, \n""",
    """      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, recurringRules, affordabilitySettings, setAffordabilitySettings, savingsGoals, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal, updateRecurringRule, deleteRecurringRule, skipRecurringRule, \n""",
)

# ---------------------------------------------------------------------------
# Investment form: choose funding account and pass that choice into account save.
# ---------------------------------------------------------------------------
replace_once(
    'src/components/AddAccountModal.tsx',
    """    transactions,\n    getCurrencySymbol\n  } = useAppContext();""",
    """    transactions,\n    accounts,\n    recurringRules,\n    getCurrencySymbol\n  } = useAppContext();""",
)
add_import(
    'src/components/AddAccountModal.tsx',
    "import { CurrencyInput } from './CurrencyInput';",
    "import { findInvestmentSipRule } from '../domain/investmentSip';",
)
replace_once(
    'src/components/AddAccountModal.tsx',
    """  const [monthlySIPAmount, setMonthlySIPAmount] = useState('');\n  const [nextSIPDate, setNextSIPDate] = useState('');""",
    """  const [monthlySIPAmount, setMonthlySIPAmount] = useState('');\n  const [nextSIPDate, setNextSIPDate] = useState('');\n  const [sipSourceAccountId, setSipSourceAccountId] = useState('');""",
)
replace_once(
    'src/components/AddAccountModal.tsx',
    """        setMonthlySIPAmount(editingAccount.monthlySIPAmount !== undefined ? editingAccount.monthlySIPAmount.toString() : '');\n        setNextSIPDate(editingAccount.nextSIPDate || '');""",
    """        setMonthlySIPAmount(editingAccount.monthlySIPAmount !== undefined ? editingAccount.monthlySIPAmount.toString() : '');\n        const sipRule = findInvestmentSipRule(editingAccount.id, recurringRules);\n        setNextSIPDate(sipRule?.nextDueDate || editingAccount.nextSIPDate || '');\n        setSipSourceAccountId(sipRule?.fromAccountId || '');""",
)
replace_once(
    'src/components/AddAccountModal.tsx',
    """      setMonthlySIPAmount('');\n      setNextSIPDate('');""",
    """      setMonthlySIPAmount('');\n      setNextSIPDate('');\n      setSipSourceAccountId('');""",
)
# Ensure effect observes recurringRules because it infers SIP source/date.
replace_once(
    'src/components/AddAccountModal.tsx',
    """  }, [addAccountModalType, editingAccount, editingCreditCard]);""",
    """  }, [addAccountModalType, editingAccount, editingCreditCard, recurringRules]);""",
)
# Default funding source to first active non-investment asset when none exists.
replace_once(
    'src/components/AddAccountModal.tsx',
    """  // Auto-set interestCalculationType when liabilityType changes\n""",
    """  useEffect(() => {\n    if (group !== 'Investment' || investmentMethod !== 'SIP' || sipSourceAccountId) return;\n    const defaultSource = accounts.find(account => account.type === 'asset' && account.is_archived !== 1 && !['Investment', 'Physical Asset'].includes(String(account.group ?? '')));\n    if (defaultSource) setSipSourceAccountId(defaultSource.id);\n  }, [group, investmentMethod, sipSourceAccountId, accounts]);\n\n  // Auto-set interestCalculationType when liabilityType changes\n""",
)
# Validation + options on save.
replace_once(
    'src/components/AddAccountModal.tsx',
    """    if (addAccountModalType === 'asset') {\n      const assetData = {""",
    """    if (addAccountModalType === 'asset') {\n      if (group === 'Investment' && investmentMethod === 'SIP' && (!monthlySIPAmount || Number(monthlySIPAmount) <= 0 || !nextSIPDate || !sipSourceAccountId)) {\n        showError('For an SIP, enter the monthly amount, next SIP date, and funding account.');\n        return;\n      }\n      const assetData = {""",
)
replace_once(
    'src/components/AddAccountModal.tsx',
    """          updateAccount(editingAccount.id, assetData);""",
    """          updateAccount(editingAccount.id, assetData, { sipSourceAccountId });""",
)
replace_once(
    'src/components/AddAccountModal.tsx',
    """          addAccount(assetData);""",
    """          addAccount(assetData, { sipSourceAccountId });""",
)
# Funding source selector after SIP amount/date row.
p = Path('src/components/AddAccountModal.tsx')
text = p.read_text()
anchor = """                </div>\n              )}\n            </div>\n          )}\n\n          {addAccountModalType === 'asset' && group !== 'Investment' && ("""
replacement = """                </div>\n              )}\n              {investmentMethod === 'SIP' && (\n                <div>\n                  <label className=\"block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2\">SIP Funding Account</label>\n                  <select\n                    aria-label=\"SIP Funding Account\"\n                    required\n                    value={sipSourceAccountId}\n                    onChange={event => setSipSourceAccountId(event.target.value)}\n                    className=\"w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all\"\n                  >\n                    <option value=\"\">Select funding account</option>\n                    {accounts.filter(account => account.type === 'asset' && account.is_archived !== 1 && !['Investment', 'Physical Asset'].includes(String(account.group ?? ''))).map(account => (\n                      <option key={account.id} value={account.id}>{account.name} ({account.group ?? 'Asset'})</option>\n                    ))}\n                  </select>\n                  <p className=\"mt-1 text-xs text-on-surface-variant\">Saving this investment creates a monthly recurring transfer. The transfer stays pending until you confirm it on the due date.</p>\n                </div>\n              )}\n            </div>\n          )}\n\n          {addAccountModalType === 'asset' && group !== 'Investment' && ("""
if anchor not in text:
    raise SystemExit('Investment SIP UI anchor missing')
p.write_text(text.replace(anchor, replacement, 1))

# ---------------------------------------------------------------------------
# Manage Finances: old fake Savings Goals category view becomes real GoalsPanel.
# ---------------------------------------------------------------------------
add_import(
    'src/components/ManageFinances.tsx',
    "import { CurrencyInput } from './CurrencyInput';",
    "import { GoalsPanel } from './GoalsPanel';",
)
replace_once(
    'src/components/ManageFinances.tsx',
    """  const [activeTab, setActiveTab] = useState<'Categories' | 'Savings Goals'>('Categories');""",
    """  const [activeTab, setActiveTab] = useState<'Categories' | 'Goals'>('Categories');""",
)
# Categories now show SAVINGS-behavior categories too; Goals are separate objects.
p = Path('src/components/ManageFinances.tsx')
text = p.read_text()
start = text.index('  const displayedItems = categories.filter(c => {')
end = text.index('\n\n  const getSpent', start)
text = text[:start] + """  const displayedItems = categories.filter(c => {\n    if (filterType !== 'All' && (c.type || 'expense') !== filterType) return false;\n    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;\n    return true;\n  });""" + text[end:]
# Remove obsolete fake-goal transaction counter.
start = text.find('  const getSavingsTotal = (catId: string, catName: string) => {')
if start >= 0:
    end = text.index('\n\n  const handleEdit', start)
    text = text[:start] + text[end:]
# Category save no longer changes semantics based on tab.
old = """    const categoryType = activeTab === 'Savings Goals' ? 'expense' : editType;\n    const finalBudget = categoryType === 'income' ? 0 : editBudget;\n    \n    const affordabilityClass: AffordabilityClass = activeTab === 'Savings Goals' ? 'SAVINGS' : categoryType === 'income' ? 'NORMAL' : editAffordabilityClass;"""
new = """    const categoryType = editType;\n    const finalBudget = categoryType === 'income' ? 0 : editBudget;\n    const affordabilityClass: AffordabilityClass = categoryType === 'income' ? 'NORMAL' : editAffordabilityClass;"""
if old not in text:
    raise SystemExit('ManageFinances saveCategory anchor missing')
text = text.replace(old, new, 1)
# Header: category add button only on Categories.
old_header_start = text.index('          <div className="flex items-center justify-between mb-8">')
old_header_end = text.index('\n\n          <div className="bg-surface-container rounded-3xl', old_header_start)
new_header = """          <div className=\"flex items-center justify-between mb-8\">\n            <div className=\"flex items-center gap-3\">\n              <ShieldCheck className=\"w-8 h-8 text-primary\" />\n              <h1 className=\"text-2xl font-bold text-primary-container-on\">Categories & Goals</h1>\n            </div>\n            {activeTab === 'Categories' && (\n              <button\n                aria-label=\"Add category\"\n                onClick={() => {\n                  setEditingId(null);\n                  setEditName('');\n                  setEditIcon('ShoppingBag');\n                  setEditType('expense');\n                  setEditAffordabilityClass('NORMAL');\n                  setEditBudget(0);\n                  setEditIsRollover(false);\n                  setEditRolloverAccountId(undefined);\n                  setIsEditingModalOpen(true);\n                }}\n                className=\"p-2 text-on-surface hover:bg-surface-container-high rounded-full transition-colors\"\n              >\n                <Plus className=\"w-6 h-6\" />\n              </button>\n            )}\n          </div>"""
text = text[:old_header_start] + new_header + text[old_header_end:]
# Monthly budget summary only belongs to category budgets.
summary_start = text.index('          <div className="bg-surface-container rounded-3xl')
summary_end = text.index('\n\n      <div className="flex bg-surface-container rounded-xl p-1">', summary_start)
summary = text[summary_start:summary_end]
text = text[:summary_start] + "          {activeTab === 'Categories' && (\n" + summary + "\n          )}" + text[summary_end:]
# Tabs: rename Savings Goals -> Goals.
text = text.replace("activeTab === 'Savings Goals'", "activeTab === 'Goals'")
text = text.replace("setActiveTab('Savings Goals')", "setActiveTab('Goals')")
text = text.replace('Savings Goals', 'Goals')
# Replace list/add block with category-only list or GoalsPanel.
list_start = text.index('      <div className="space-y-4">')
list_end = text.index('\n\n      {isEditingModalOpen && (', list_start)
category_block = """      {activeTab === 'Categories' ? (\n        <div className=\"space-y-4\">\n          {displayedItems.map(c => {\n            const Icon = icons[c.icon as keyof typeof icons] || ShoppingBag;\n            const currentAmount = getSpent(c.id, c.name);\n            const target = c.budget || 0;\n            const percent = target > 0 ? Math.min(100, (currentAmount / target) * 100) : 0;\n            return (\n              <div key={c.id} className=\"bg-surface-container-low p-5 rounded-2xl border border-outline-variant/30\">\n                <div className=\"flex justify-between items-start mb-4\">\n                  <div className=\"flex items-center gap-4 min-w-0\">\n                    <div className=\"w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center shrink-0\"><Icon className=\"w-6 h-6 text-on-surface-variant\" /></div>\n                    <div className=\"min-w-0\">\n                      <div className=\"flex items-center gap-2 flex-wrap\"><h3 className=\"font-semibold text-on-surface text-lg\">{c.name}</h3>{c.type === 'income' && <span className=\"text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20\">Income</span>}</div>\n                      {c.tags && c.tags.length > 0 && <p className=\"text-xs text-on-surface-variant font-mono\">{c.tags.join(' ')}</p>}\n                      {c.type !== 'income' && <span className=\"inline-flex mt-1 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full\">{(c.affordabilityClass ?? (c.group === 'Savings' ? 'SAVINGS' : c.group === 'Leisure' ? 'FLEXIBLE' : 'NORMAL')).toLowerCase().replace('_', ' ')}</span>}\n                    </div>\n                  </div>\n                  <div className=\"flex items-center gap-1 shrink-0\"><button aria-label={`Edit ${c.name}`} onClick={() => handleEdit(c)} className=\"p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-on-surface transition-colors\"><Edit2 className=\"w-4 h-4\" /></button><button aria-label={`Delete ${c.name}`} onClick={() => deleteCategory(c.id)} className=\"p-2 hover:bg-error/10 rounded-lg text-on-surface-variant hover:text-error transition-colors\"><Trash2 className=\"w-4 h-4\" /></button></div>\n                </div>\n                {c.type === 'income' ? (\n                  <div className=\"flex items-center justify-between pt-2 border-t border-outline-variant/10\"><span className=\"text-xs font-semibold text-emerald-500/90\">Income Category</span><span className=\"text-xs text-on-surface-variant/70\">No budget limit</span></div>\n                ) : (\n                  <div><p className=\"text-xs font-semibold text-on-surface-variant mb-1\">Budget</p><div className=\"flex items-end justify-between mb-2 gap-3\"><div className=\"text-primary font-bold font-numeric text-lg\">{formatCurrency(target)} <span className=\"text-xs text-on-surface-variant font-normal\">/mo</span></div><div className=\"w-32 h-1.5 bg-surface-container-highest rounded-full overflow-hidden flex\"><div className=\"bg-primary h-full rounded-full transition-all\" style={{ width: `${percent}%` }} /></div></div></div>\n                )}\n              </div>\n            );\n          })}\n          <button onClick={() => { setEditingId(null); setEditName(''); setEditIcon('ShoppingBag'); setEditType('expense'); setEditAffordabilityClass('NORMAL'); setEditBudget(0); setEditIsRollover(false); setEditRolloverAccountId(undefined); setIsEditingModalOpen(true); }} className=\"w-full bg-transparent border border-dashed border-outline-variant/50 hover:bg-surface-container-high hover:border-primary/50 text-on-surface font-semibold py-6 rounded-2xl transition-colors flex flex-col items-center justify-center gap-3 group\"><div className=\"w-10 h-10 rounded-full bg-surface-container flex items-center justify-center group-hover:bg-primary/20 transition-colors\"><Plus className=\"w-5 h-5 group-hover:text-primary\" /></div><span className=\"text-xs tracking-wider uppercase font-bold text-on-surface-variant group-hover:text-primary transition-colors\">ADD CATEGORY</span></button>\n        </div>\n      ) : (\n        <GoalsPanel searchQuery={searchQuery} />\n      )}"""
text = text[:list_start] + category_block + text[list_end:]
# Category editor must never appear over Goals.
text = text.replace('{isEditingModalOpen && (', "{activeTab === 'Categories' && isEditingModalOpen && (", 1)
# Category modal copy/fields no longer have goal branches.
text = text.replace("{editingId ? 'Edit' : 'Add'} {activeTab === 'Goals' ? 'Goal' : 'Category'}", "{editingId ? 'Edit' : 'Add'} Category")
text = text.replace("placeholder={activeTab === 'Goals' ? 'e.g. Vacation Fund' : (editType === 'income' ? 'e.g. Freelance Income' : 'e.g. Groceries')}", "placeholder={editType === 'income' ? 'e.g. Freelance Income' : 'e.g. Groceries'}")
text = text.replace("{(activeTab === 'Goals' || editType !== 'income') && (", "{editType !== 'income' && (")
text = text.replace("{activeTab === 'Goals' ? 'Target Amount' : 'Monthly Budget'}", "Monthly Budget")
text = text.replace("{activeTab !== 'Goals' && editType === 'expense' && (", "{editType === 'expense' && (")
text = text.replace("Save {activeTab === 'Goals' ? 'Goal' : 'Category'}", "Save Category")
# No stale unreachable savings-goal behavior should remain.
if "Savings Goals" in text:
    raise SystemExit('Stale Savings Goals label remains in ManageFinances')
p.write_text(text)

# ---------------------------------------------------------------------------
# Affordability UI passes Goals and explains their protection.
# ---------------------------------------------------------------------------
replace_once(
    'src/components/AffordabilityPlanner.tsx',
    """  const { accounts, transactions, recurringRules, categories, creditCards, affordabilitySettings, monthCycleDay, formatCurrency } = useAppContext();""",
    """  const { accounts, transactions, recurringRules, categories, creditCards, affordabilitySettings, savingsGoals, monthCycleDay, formatCurrency } = useAppContext();""",
)
replace_once(
    'src/components/AffordabilityPlanner.tsx',
    """      affordabilitySettings,\n      monthCycleDay,\n    }));""",
    """      affordabilitySettings,\n      savingsGoals,\n      monthCycleDay,\n    }));""",
)
replace_once(
    'src/components/AffordabilityPlanner.tsx',
    """                ['Additional savings target to protect', additionalSavingsTarget, '-'],""",
    """                ['Additional savings target to protect (preferences / goals)', additionalSavingsTarget, '-'],""",
)
replace_once(
    'src/components/AffordabilityPlanner.tsx',
    """                <p><strong className=\"text-on-surface\">Known scheduled expenses</strong> are concrete future obligations CoinBuddy can see, such as recurring entries and EMIs. <strong className=\"text-on-surface\">Credit-card outstanding</strong> separately protects today's revolving card debt even when it is still unbilled or the current due amount is zero. <strong className=\"text-on-surface\">Normal living expenses</strong> use the median NORMAL-category spend from completed cycles and only add the portion not already scheduled.</p>""",
    """                <p><strong className=\"text-on-surface\">Known scheduled expenses</strong> are concrete future obligations CoinBuddy can see, such as recurring entries and EMIs. <strong className=\"text-on-surface\">Credit-card outstanding</strong> separately protects today's revolving card debt even when it is still unbilled or the current due amount is zero. <strong className=\"text-on-surface\">Normal living expenses</strong> use the median NORMAL-category spend from completed cycles and only add the portion not already scheduled. Active <strong className=\"text-on-surface\">Goals</strong> can raise the protected monthly savings target, and an emergency goal linked to liquid cash can raise the protected cash reserve.</p>""",
)
# Add a compact goal summary card when relevant.
replace_once(
    'src/components/AffordabilityPlanner.tsx',
    """          <button type=\"button\" onClick={() => setShowBreakdown(value => !value)}""",
    """          {result.goalSummary.activeGoalCount > 0 && (\n            <div className=\"rounded-2xl border border-primary/20 bg-primary/8 p-4 text-sm text-on-surface-variant\">\n              <strong className=\"text-on-surface\">Goals protection:</strong> {result.goalSummary.activeGoalCount} active goal{result.goalSummary.activeGoalCount === 1 ? '' : 's'} · {formatCurrency(result.goalSummary.monthlyContributionTarget)}/month planned contribution{result.goalSummary.protectedReserve > 0 ? ` · ${formatCurrency(result.goalSummary.protectedReserve)} linked emergency cash protected` : ''}.\n            </div>\n          )}\n\n          <button type=\"button\" onClick={() => setShowBreakdown(value => !value)}""",
)

# ---------------------------------------------------------------------------
# v3.2 labels and package metadata.
# ---------------------------------------------------------------------------
for path in ['package.json', 'package-lock.json']:
    p = Path(path)
    text = p.read_text().replace('"version": "3.1.0"', '"version": "3.2.0"')
    p.write_text(text)
p = Path('src/components/Settings.tsx')
text = p.read_text().replace('Coin Buddy V3.1', 'Coin Buddy V3.2').replace('>v3.1<', '>v3.2<')
p.write_text(text)

print('Applied CoinBuddy v3.2 Goals, SIP recurring sync, backup and affordability integration.')
