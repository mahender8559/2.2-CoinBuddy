from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label} anchor not found in {path}')
    p.write_text(text.replace(old, new, 1))

# AppContext types/imports ------------------------------------------------------
replace_once(
    'src/context/AppContext.tsx',
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings, SavingsGoal } from '../types';",
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings, SavingsGoal, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule } from '../types';",
    'AppContext shared type imports',
)
replace_once(
    'src/context/AppContext.tsx',
    "import { SAVINGS_GOALS_KEY, normalizeSavingsGoal, normalizeSavingsGoals } from '../domain/savingsGoals';",
    """import { SAVINGS_GOALS_KEY, normalizeSavingsGoal, normalizeSavingsGoals } from '../domain/savingsGoals';
import {
  ensureSelfPerson,
  loadSharedFinanceState,
  createPerson as createSharedPersonRow,
  archivePerson as archiveSharedPersonRow,
  createSharedObligation as createSharedObligationRow,
  addSharedPayment as addSharedPaymentRow,
  addSharedSettlement as addSharedSettlementRow,
  setLoanSharingRule as setLoanSharingRuleRow,
  replaceLoanContributionRules,
  type SharedFinanceState,
} from '../db/sharedFinanceRepository';""",
    'AppContext shared repository imports',
)

replace_once(
    'src/context/AppContext.tsx',
    """  savingsGoals?: SavingsGoal[];
  currency?: string;
};""",
    """  savingsGoals?: SavingsGoal[];
  people?: Person[];
  sharedObligations?: SharedObligation[];
  sharedResponsibilities?: SharedResponsibility[];
  sharedPayments?: SharedPayment[];
  sharedSettlements?: SharedSettlement[];
  loanSharingRules?: LoanSharingRule[];
  loanContributionRules?: LoanContributionRule[];
  currency?: string;
};""",
    'LedgerImportData shared fields',
)

replace_once(
    'src/context/AppContext.tsx',
    """  deleteSavingsGoal: (id: string) => Promise<boolean>;
  updateRecurringRule: (rule: RecurringRule) => Promise<boolean>;""",
    """  deleteSavingsGoal: (id: string) => Promise<boolean>;
  people: Person[];
  sharedObligations: SharedObligation[];
  sharedResponsibilities: SharedResponsibility[];
  sharedPayments: SharedPayment[];
  sharedSettlements: SharedSettlement[];
  loanSharingRules: LoanSharingRule[];
  loanContributionRules: LoanContributionRule[];
  addSharedPerson: (name: string, relationship?: string) => Promise<boolean>;
  archiveSharedPerson: (id: string) => Promise<boolean>;
  createSharedExpense: (input: { title: string; totalAmount: number; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }> }) => Promise<boolean>;
  recordSharedPayment: (payment: Omit<SharedPayment, 'id'>) => Promise<boolean>;
  recordSharedSettlement: (settlement: Omit<SharedSettlement, 'id'>) => Promise<boolean>;
  configureLoanSharing: (accountId: string, personalResponsibilityPercent: number, contributions: Array<Omit<LoanContributionRule, 'id' | 'accountId'>>) => Promise<boolean>;
  updateRecurringRule: (rule: RecurringRule) => Promise<boolean>;""",
    'AppContext interface shared fields',
)

# Shared state exists before net-worth derivation.
replace_once(
    'src/context/AppContext.tsx',
    """  const [creditCardRecords, setCreditCardRecords] = useState<CreditCardInfo[]>([]);

  // `balance` remains on the UI types""",
    """  const [creditCardRecords, setCreditCardRecords] = useState<CreditCardInfo[]>([]);
  const EMPTY_SHARED_FINANCE: SharedFinanceState = { people: [], obligations: [], responsibilities: [], payments: [], settlements: [], loanSharingRules: [], loanContributionRules: [] };
  const [sharedFinance, setSharedFinance] = useState<SharedFinanceState>(EMPTY_SHARED_FINANCE);
  const people = sharedFinance.people;
  const sharedObligations = sharedFinance.obligations;
  const sharedResponsibilities = sharedFinance.responsibilities;
  const sharedPayments = sharedFinance.payments;
  const sharedSettlements = sharedFinance.settlements;
  const loanSharingRules = sharedFinance.loanSharingRules;
  const loanContributionRules = sharedFinance.loanContributionRules;

  // `balance` remains on the UI types""",
    'shared state',
)

replace_once(
    'src/context/AppContext.tsx',
    """  const totalLiabilitiesRes = safeCompute(() =>
    accounts.filter(a => a.type === 'liability' && !a.is_archived).reduce((sum, a) => sum + getSafeNumericValue(a.balance), 0),
    SAFE_MATH_ERRORS.DRIFT
  );""",
    """  const totalLiabilitiesRes = safeCompute(() =>
    accounts.filter(a => a.type === 'liability' && !a.is_archived).reduce((sum, a) => {
      const sharing = loanSharingRules.find(rule => rule.accountId === a.id && rule.isShared);
      const responsibility = sharing ? Math.max(0, Math.min(100, sharing.personalResponsibilityPercent)) / 100 : 1;
      return sum + getSafeNumericValue(a.balance) * responsibility;
    }, 0),
    SAFE_MATH_ERRORS.DRIFT
  );""",
    'personal liability net worth',
)

replace_once(
    'src/context/AppContext.tsx',
    """  const refreshStateFromDatabase = async (driver: SqlJsDatabaseDriver) => {
    const state = await loadStateFromDatabase(driver);
    setStateFromDbState(state);
  };
""",
    """  const refreshStateFromDatabase = async (driver: SqlJsDatabaseDriver) => {
    const state = await loadStateFromDatabase(driver);
    setStateFromDbState(state);
  };

  const refreshSharedFinance = async (driver: SqlJsDatabaseDriver) => {
    setSharedFinance(await loadSharedFinanceState(driver));
  };
""",
    'refresh shared finance',
)

# Add persisted shared actions immediately after generic persistence helper.
anchor = """  const persistDbAction = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (!dbDriver) return false;
    try {
      await action();
      await persistDatabase(dbDriver);
      await refreshStateFromDatabase(dbDriver);
      return true;
    } catch (error) {
      console.error('SQLite persistence failed:', error);
      // Restore the projection from the durable ledger and make failure visible.
      await refreshStateFromDatabase(dbDriver).catch(() => undefined);
      window.alert(`Your change was not saved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
"""
insert = anchor + """

  const persistSharedAction = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (!dbDriver) return false;
    try {
      await action();
      await persistDatabase(dbDriver);
      await refreshSharedFinance(dbDriver);
      return true;
    } catch (error) {
      console.error('Shared finance persistence failed:', error);
      await refreshSharedFinance(dbDriver).catch(() => undefined);
      window.alert(`Your shared-finance change was not saved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const addSharedPerson = async (name: string, relationship?: string): Promise<boolean> =>
    persistSharedAction(() => createSharedPersonRow(dbDriver!, { name, relationship }));

  const archiveSharedPerson = async (id: string): Promise<boolean> =>
    persistSharedAction(() => archiveSharedPersonRow(dbDriver!, id));

  const createSharedExpense = async (input: { title: string; totalAmount: number; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }> }): Promise<boolean> => {
    if (!dbDriver) return false;
    const me = people.find(person => person.isSelf && !person.isArchived);
    if (!me) return false;
    const now = new Date().toISOString();
    const initialPayments: Array<Omit<SharedPayment, 'id' | 'obligationId'>> = [];
    if ((input.trackedPaymentAmount ?? 0) > 0) initialPayments.push({ personId: me.id, transactionId: input.transactionId, amount: input.trackedPaymentAmount!, source: 'TRACKED', paidAt: now });
    for (const payment of input.externalPayments ?? []) if (payment.amount > 0) initialPayments.push({ personId: payment.personId, amount: payment.amount, source: 'EXTERNAL', paidAt: now });
    return persistSharedAction(() => createSharedObligationRow(dbDriver, {
      title: input.title, kind: 'EXPENSE', totalAmount: input.totalAmount, transactionId: input.transactionId,
      settlementMode: 'TRACK',
    }, input.allocations, initialPayments));
  };

  const recordSharedPayment = async (payment: Omit<SharedPayment, 'id'>): Promise<boolean> =>
    persistSharedAction(() => addSharedPaymentRow(dbDriver!, payment));

  const recordSharedSettlement = async (settlement: Omit<SharedSettlement, 'id'>): Promise<boolean> =>
    persistSharedAction(() => addSharedSettlementRow(dbDriver!, settlement));

  const configureLoanSharing = async (accountId: string, personalResponsibilityPercent: number, contributions: Array<Omit<LoanContributionRule, 'id' | 'accountId'>>): Promise<boolean> =>
    persistSharedAction(async () => {
      await setLoanSharingRuleRow(dbDriver!, { accountId, personalResponsibilityPercent, isShared: true });
      await replaceLoanContributionRules(dbDriver!, accountId, contributions);
    });
"""
replace_once('src/context/AppContext.tsx', anchor, insert, 'shared persistence actions')

replace_once(
    'src/context/AppContext.tsx',
    """        await refreshStateFromDatabase(driver);
        const integrity = await auditDatabaseIntegrity(driver);""",
    """        await refreshStateFromDatabase(driver);
        await ensureSelfPerson(driver, 'Me');
        await refreshSharedFinance(driver);
        const integrity = await auditDatabaseIntegrity(driver);""",
    'initialize shared state',
)

replace_once(
    'src/context/AppContext.tsx',
    """    setSavingsGoals([]);
    setAffordabilitySettingsState({ ...DEFAULT_AFFORDABILITY_SETTINGS });""",
    """    setSavingsGoals([]);
    setSharedFinance(EMPTY_SHARED_FINANCE);
    setAffordabilitySettingsState({ ...DEFAULT_AFFORDABILITY_SETTINGS });""",
    'clear shared state',
)

replace_once(
    'src/context/AppContext.tsx',
    """      setRecurringRules(refreshed.recurringRules);
      const restoredAppSettings = await loadAppSettings(dbDriver);""",
    """      setRecurringRules(refreshed.recurringRules);
      await ensureSelfPerson(dbDriver, 'Me');
      await refreshSharedFinance(dbDriver);
      const restoredAppSettings = await loadAppSettings(dbDriver);""",
    'import refresh shared state',
)

replace_once(
    'src/context/AppContext.tsx',
    """    schemaVersion: 'coinbuddy-ledger-v3',""",
    """    schemaVersion: 'coinbuddy-ledger-v4',""",
    'export schema v4',
)
replace_once(
    'src/context/AppContext.tsx',
    """    savingsGoals,
    currency,""",
    """    savingsGoals,
    people,
    sharedObligations,
    sharedResponsibilities,
    sharedPayments,
    sharedSettlements,
    loanSharingRules,
    loanContributionRules,
    currency,""",
    'export shared finance',
)

replace_once(
    'src/context/AppContext.tsx',
    """      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, recurringRules, affordabilitySettings, setAffordabilitySettings, savingsGoals, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal, updateRecurringRule, deleteRecurringRule, skipRecurringRule, """,
    """      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, recurringRules, affordabilitySettings, setAffordabilitySettings, savingsGoals, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, addSharedPerson, archiveSharedPerson, createSharedExpense, recordSharedPayment, recordSharedSettlement, configureLoanSharing,
      updateRecurringRule, deleteRecurringRule, skipRecurringRule, """,
    'provider shared values',
)

# Clear normalized child tables before core ledger tables.
replace_once(
    'src/db/dbClient.ts',
    """  await driver.execute(`DELETE FROM transactions; DELETE FROM recurring_rules; DELETE FROM credit_cards; DELETE FROM widgets; DELETE FROM loan_revisions; DELETE FROM categories; DELETE FROM events; DELETE FROM accounts; DELETE FROM users_config; DELETE FROM app_settings;`);""",
    """  await driver.execute(`DELETE FROM shared_settlements; DELETE FROM shared_payments; DELETE FROM shared_responsibilities; DELETE FROM loan_contribution_rules; DELETE FROM loan_sharing_rules; DELETE FROM shared_obligations; DELETE FROM people; DELETE FROM transactions; DELETE FROM recurring_rules; DELETE FROM credit_cards; DELETE FROM widgets; DELETE FROM loan_revisions; DELETE FROM categories; DELETE FROM events; DELETE FROM accounts; DELETE FROM users_config; DELETE FROM app_settings;`);""",
    'clear shared tables',
)

# Manage -> Sharing ------------------------------------------------------------
replace_once(
    'src/components/ManageFinances.tsx',
    "import { GoalsPanel } from './GoalsPanel';",
    "import { GoalsPanel } from './GoalsPanel';\nimport { SharingPanel } from './SharingPanel';",
    'SharingPanel import',
)
replace_once(
    'src/components/ManageFinances.tsx',
    """  const [mainTab, setMainTab] = useState<'Accounts' | 'Categories'>(() => isManageCategoriesOpen ? 'Categories' : 'Accounts');
  const mainTabSwipe = useHorizontalSwipe(() => {
    setMainTab(current => current === 'Accounts' ? 'Categories' : 'Accounts');
  });""",
    """  const [mainTab, setMainTab] = useState<'Accounts' | 'Categories' | 'Sharing'>(() => isManageCategoriesOpen ? 'Categories' : 'Accounts');
  const mainTabSwipe = useHorizontalSwipe(() => {
    setMainTab(current => current === 'Accounts' ? 'Categories' : current === 'Categories' ? 'Sharing' : 'Accounts');
  });""",
    'Manage main tabs',
)
replace_once(
    'src/components/ManageFinances.tsx',
    """          <button 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors ${mainTab === 'Categories' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
            onClick={() => setMainTab('Categories')}
          >
            Categories
          </button>
        </div>""",
    """          <button 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors ${mainTab === 'Categories' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
            onClick={() => setMainTab('Categories')}
          >
            Categories
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors ${mainTab === 'Sharing' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
            onClick={() => setMainTab('Sharing')}
          >
            Sharing
          </button>
        </div>""",
    'Sharing top tab',
)
replace_once(
    'src/components/ManageFinances.tsx',
    """      {mainTab === 'Accounts' ? (
        <Cards />
      ) : (
        <>""",
    """      {mainTab === 'Accounts' ? (
        <Cards />
      ) : mainTab === 'Sharing' ? (
        <SharingPanel />
      ) : (
        <>""",
    'Sharing panel routing',
)
