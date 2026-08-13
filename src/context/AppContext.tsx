import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings, SavingsGoal, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule } from '../types';
import { calculateEmiSplit, getOriginalPrincipal, getTotalInterestPaid } from '../utils/emi';
import { recomputeAllAccountBalances, syncCreditCardsWithAccounts as projectCreditCards } from '../utils/balanceManager';
import {
  initializeDatabase,
  persistDatabase,
  deletePersistedDatabase,
  clearAppBrowserStorage,
  markClearStoragePending,
  loadStateFromDatabase,
  seedDemoData,
  loadDemoDataFromJson,
  insertAccountRow,
  insertCreditCardAccount,
  updateAccountRow,
  insertTransactionRow,
  updateTransactionRow,
  deleteTransactionRow,
  insertCategoryRow,
  updateCategoryRow,
  deleteCategoryRow,
  insertEventRow,
  updateTransactionEvents,
  insertCreditCardRow,
  updateCreditCardRow,
  deleteCreditCardRow,
  insertWidgetRow,
  deleteWidgetRow,
  insertLoanRevisionRow,
  deleteLoanRevisionRow,
  clearDatabase,
  importLedgerToDatabase,
  validateLedgerImport,
  loadAppSettings,
  upsertAppSetting,
  loadUserConfig,
  upsertUserConfig,
  createRecurringRule,
  updateRecurringRuleRow,
  deleteRecurringRuleRow,
  skipRecurringRuleOccurrence,
  generateDueRecurringTransactions,
  repairLegacyRecurringConfirmationState,
  syncInvestmentSipRecurringRule,
  SqlJsDatabaseDriver,
} from '../db/dbClient';
import { auditDatabaseIntegrity, deleteAccountInDB, updateOpeningBalance, type DataIntegrityAuditResult, type DataIntegrityIssue } from '../db/sqliteSchema';
import { isSafeMathError, safeCompute, SAFE_MATH_ERRORS, getSafeNumericValue } from '../utils/safeMath';
import { hashPasscode, verifyPasscode as verifyPasscodeHash } from '../utils/passcode';
import { getCycleDetailsForDay } from '../utils/cycles';
import { isEventAssignableTransaction } from '../domain/eventRules';
import { advanceRecurringDate, shouldCreateInitialOccurrence, toLocalDateKey } from '../domain/recurring';
import { ensureCategoryAffordabilityClass } from '../domain/categoryAffordability';
import { AFFORDABILITY_SETTINGS_KEY, DEFAULT_AFFORDABILITY_SETTINGS, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';
import { SAVINGS_GOALS_KEY, normalizeSavingsGoal, normalizeSavingsGoals } from '../domain/savingsGoals';
import { buildPersonalExpenseRecords, type PersonalExpenseRecord } from '../domain/personalSpending';
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
} from '../db/sharedFinanceRepository';

export type UndoRedoCommand = {
  entityType: 'account' | 'transaction';
  actionType: 'add' | 'update' | 'delete';
  previousState: AccountUndoState | Transaction | null;
  newState: AccountUndoState | Transaction | null;
};
export type AccountUndoState = { account: Account; openingTx: Transaction | null };
type LedgerImportData = {
  accounts?: Account[];
  transactions?: Transaction[];
  categories?: Category[];
  events?: Event[];
  users_config?: { month_cycle_day?: number; currency_code?: string }[];
  creditCards?: CreditCardInfo[];
  widgets?: Widget[];
  loanRevisions?: LoanRevision[];
  recurringRules?: RecurringRule[];
  affordabilitySettings?: AffordabilitySettings;
  savingsGoals?: SavingsGoal[];
  people?: Person[];
  sharedObligations?: SharedObligation[];
  sharedResponsibilities?: SharedResponsibility[];
  sharedPayments?: SharedPayment[];
  sharedSettlements?: SharedSettlement[];
  loanSharingRules?: LoanSharingRule[];
  loanContributionRules?: LoanContributionRule[];
  currency?: string;
};
const MAX_UNDO_HISTORY = 5;

interface AppContextType {
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  theme: 'light' | 'dark';
  colorPalette: string;
  setColorPalette: (color: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  currency: string;
  setCurrency: (curr: string) => void;
  balancesVisible: boolean;
  toggleBalancesVisible: () => void;
  formatCurrency: (amount: number | string) => string;
  getCurrencySymbol: () => string;
  getAccountBalance: (accountId: string) => number;
  accounts: Account[];
  calculateEmiSplit?: (balance: number, annualRate: number, emi: number) => { interestAmount: number; principalAmount: number };
  addAccount: (account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string }) => void;
  updateAccount: (id: string, account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string }) => void;
  deleteAccount: (id: string) => void;
  editingAccount: Account | null;
  setEditingAccount: (account: Account | null) => void;
  editingCreditCard: CreditCardInfo | null;
  setEditingCreditCard: (card: CreditCardInfo | null) => void;
  transferFunds: (amount: number, fromId: string, toId: string) => void;
  netWorth: number;
  transactions: Transaction[];
  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateTransaction: (id: string, tx: Omit<Transaction, 'id'>) => { success: boolean; error?: string };
  deleteTransaction: (id: string) => void;
  approveTransaction: (id: string, date?: string) => { success: boolean; error?: string };
  rejectTransaction: (id: string) => void;
  editingTransaction: Transaction | null;
  setEditingTransaction: (tx: Transaction | null) => void;
  recurringRules: RecurringRule[];
  affordabilitySettings: AffordabilitySettings;
  setAffordabilitySettings: (settings: AffordabilitySettings) => Promise<boolean>;
  savingsGoals: SavingsGoal[];
  addSavingsGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => Promise<boolean>;
  updateSavingsGoal: (id: string, goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => Promise<boolean>;
  deleteSavingsGoal: (id: string) => Promise<boolean>;
  people: Person[];
  sharedObligations: SharedObligation[];
  sharedResponsibilities: SharedResponsibility[];
  sharedPayments: SharedPayment[];
  sharedSettlements: SharedSettlement[];
  loanSharingRules: LoanSharingRule[];
  loanContributionRules: LoanContributionRule[];
  personalExpenseRecords: PersonalExpenseRecord[];
  addSharedPerson: (name: string, relationship?: string) => Promise<boolean>;
  archiveSharedPerson: (id: string) => Promise<boolean>;
  createSharedExpense: (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }> }) => Promise<boolean>;
  recordSharedPayment: (payment: Omit<SharedPayment, 'id'>) => Promise<boolean>;
  recordSharedSettlement: (settlement: Omit<SharedSettlement, 'id'>) => Promise<boolean>;
  configureLoanSharing: (accountId: string, personalResponsibilityPercent: number, contributions: Array<Omit<LoanContributionRule, 'id' | 'accountId'>>) => Promise<boolean>;
  updateRecurringRule: (rule: RecurringRule) => Promise<boolean>;
  deleteRecurringRule: (id: string) => Promise<boolean>;
  skipRecurringRule: (id: string) => Promise<boolean>;
  biometric: boolean;
  setBiometric: (val: boolean) => void;
  isAddModalOpen: boolean;
  setAddModalOpen: (val: boolean) => void;
  isOnboardingOpen: boolean;
  setOnboardingOpen: (val: boolean) => void;
  isButtonTourOpen: boolean;
  setButtonTourOpen: (val: boolean) => void;
  isUnlocked: boolean;
  setUnlocked: (val: boolean) => void;
  passcode: string | null;
  setPasscode: (val: string | null) => void;
  verifyPasscode: (val: string) => Promise<boolean>;
  isManageCategoriesOpen: boolean;
  setManageCategoriesOpen: (val: boolean) => void;
  addAccountModalType: 'asset' | 'liability' | null;
  setAddAccountModalType: (val: 'asset' | 'liability' | null) => void;
  isWalletModalOpen: boolean;
  setWalletModalOpen: (val: boolean) => void;
  payCardModalState: {isOpen: boolean, cardId: string | null};
  setPayCardModalState: (val: {isOpen: boolean, cardId: string | null}) => void;
  loanRevisions: LoanRevision[];
  addLoanRevision: (revision: Omit<LoanRevision, 'id'>) => void;
  deleteLoanRevision: (id: string) => void;
  creditCards: CreditCardInfo[];
  addCreditCard: (card: Omit<CreditCardInfo, 'id'>) => void;
  updateCreditCard: (id: string, card: Omit<CreditCardInfo, 'id'>) => void;
  payCreditCard: (cardId: string, amount: number, fromAccountId?: string) => void;
  payLiability: (id: string, amount: number, principalAmount?: number, interestAmount?: number, fromAccountId?: string) => void;
  deleteCreditCard: (cardId: string) => void;
  categories: Category[];
  events: Event[];
  createEvent: (name: string) => Event;
  fetchEvents: () => Event[];
  groupTransactionsToEvent: (transactionIds: string[], eventId: string | null) => void;
  addCategory: (category: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, category: Omit<Category, 'id'>) => void;
  deleteCategory: (id: string) => void;
  profile: { name: string; email: string; avatar: string; offlineReady: boolean };
  setProfile: (val: { name: string; email: string; avatar: string; offlineReady: boolean }) => void;
  monthCycleDay: number;
  setMonthCycleDay: (val: number) => void;
  isDateInCurrentCycle: (dateString: string) => boolean;
  getCycleDetails: (dateString: string) => { month: number, year: number, key: string };
  widgets: Widget[];
  addWidget: (widget: Omit<Widget, 'id'>) => void;
  removeWidget: (id: string) => void;
  lastUpdated: string;
  exportLedgerData: () => Record<string, unknown>;
  importLedgerData: (data: LedgerImportData) => Promise<void>;
  clearAllData: () => Promise<void>;
  resetToDemoData: () => void;
  integrityWarning: string | null;
  dismissIntegrityWarning: () => void;
  verifyDataIntegrity: () => Promise<DataIntegrityAuditResult>;
  repairDataIntegrityIssues: (issues: DataIntegrityIssue[]) => Promise<DataIntegrityAuditResult>;
  getStoredSetting: (key: string) => Promise<unknown>;
  setStoredSetting: (key: string, value: unknown) => Promise<void>;
  toast: { message: string; actionLabel?: string; onAction?: () => void } | null;
  showToast: (message: string, actionLabel?: string, onAction?: () => void) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/** Applies a command without React state so every restore path is testable. */
export function applyUndoRedoCommand(cmd: UndoRedoCommand, isUndo: boolean, accounts: Account[], transactions: Transaction[]) {
  const targetState = isUndo ? cmd.previousState : cmd.newState;
  const targetAction = isUndo ? (cmd.actionType === 'add' ? 'delete' : cmd.actionType === 'delete' ? 'add' : 'update') : cmd.actionType;
  let nextTransactions = [...transactions];
  let nextAccounts = [...accounts];
  if (cmd.entityType === 'transaction') {
    const transaction = targetState as Transaction;
    if (targetAction === 'add') nextTransactions = [transaction, ...nextTransactions.filter(item => item.id !== transaction.id)];
    else if (targetAction === 'delete') {
      const removed = (isUndo ? cmd.newState : cmd.previousState) as Transaction;
      nextTransactions = nextTransactions.filter(item => item.id !== removed.id);
    } else nextTransactions = nextTransactions.map(item => item.id === transaction.id ? transaction : item);
  } else {
    const state = targetState as AccountUndoState;
    if (targetAction === 'add') {
      nextAccounts = [state.account, ...nextAccounts.filter(item => item.id !== state.account.id)];
      if (state.openingTx) nextTransactions = [state.openingTx, ...nextTransactions.filter(item => item.id !== state.openingTx!.id)];
    } else if (targetAction === 'delete') {
      const stateToRemove = (isUndo ? cmd.newState : cmd.previousState) as AccountUndoState;
      nextAccounts = nextAccounts.filter(item => item.id !== stateToRemove.account.id);
      if (stateToRemove.openingTx) nextTransactions = nextTransactions.filter(item => item.id !== stateToRemove.openingTx!.id);
    } else {
      nextAccounts = nextAccounts.map(item => item.id === state.account.id ? state.account : item);
      if (state.openingTx) nextTransactions = nextTransactions.map(item => item.id === state.openingTx!.id ? state.openingTx! : item);
    }
  }
  return { accounts: recomputeAllAccountBalances(nextAccounts, nextTransactions), transactions: nextTransactions };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [colorPalette, setColorPalette] = useState('blue');
  const [currency, setCurrency] = useState('INR');
  const [balancesVisible, setBalancesVisible] = useState(() => localStorage.getItem('coinbuddy_balances_visible') !== 'false');
  const [biometric, setBiometric] = useState(false);
  const [passcode, setPasscodeHash] = useState<string | null>(null);
  const setPasscode = (value: string | null) => {
    if (value === null) { setPasscodeHash(null); return; }
    void hashPasscode(value).then(setPasscodeHash).catch(error => {
      console.error('Unable to secure passcode:', error);
      window.alert('Unable to save passcode securely on this device.');
    });
  };
  const verifyPasscode = (value: string) => verifyPasscodeHash(value, passcode);
  const [isUnlocked, setUnlocked] = useState(false);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isOnboardingOpen, setOnboardingOpen] = useState(() => localStorage.getItem('coinbuddy_onboarding_seen') !== 'true');
  const [isButtonTourOpen, setButtonTourOpen] = useState(() =>
    localStorage.getItem('coinbuddy_onboarding_seen') === 'true' &&
    localStorage.getItem('hasCompletedButtonTour') !== 'true'
  );
  const [isManageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [addAccountModalType, setAddAccountModalType] = useState<'asset' | 'liability' | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingCreditCard, setEditingCreditCard] = useState<CreditCardInfo | null>(null);
  const [isWalletModalOpen, setWalletModalOpen] = useState(false);
  const [payCardModalState, setPayCardModalState] = useState<{isOpen: boolean, cardId: string | null}>({isOpen: false, cardId: null});
  
  const [lastUpdated, setLastUpdated] = useState<string>(() => new Date().toISOString());

  const [dbDriver, setDbDriver] = useState<SqlJsDatabaseDriver | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [integrityWarning, setIntegrityWarning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  const pendingLiabilityPayments = useRef(new Set<string>());
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, actionLabel, onAction });
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  const getStoredSetting = useCallback(async (key: string): Promise<unknown> => {
    if (!dbDriver) return undefined;
    return (await loadAppSettings(dbDriver))[key];
  }, [dbDriver]);
  const setStoredSetting = useCallback(async (key: string, value: unknown): Promise<void> => {
    if (!dbDriver) return;
    await upsertAppSetting(dbDriver, key, value);
    await persistDatabase(dbDriver);
  }, [dbDriver]);

  const [undoStack, setUndoStack] = useState<UndoRedoCommand[]>([]);
  const [redoStack, setRedoStack] = useState<UndoRedoCommand[]>([]);

  const pushCommand = (cmd: UndoRedoCommand) => {
    setUndoStack(prev => {
      const next = [...prev, cmd];
      if (next.length > MAX_UNDO_HISTORY) return next.slice(next.length - MAX_UNDO_HISTORY);
      return next;
    });
    setRedoStack([]);
  };

  const clearStacks = () => {
    setUndoStack([]);
    setRedoStack([]);
  };

function applyUndoRedoCommandInProvider(cmd: UndoRedoCommand, isUndo: boolean, accounts: Account[], transactions: Transaction[]) {
    const { entityType, actionType, previousState, newState } = cmd;
    const targetState = isUndo ? previousState : newState;
    const targetAction = isUndo ? (actionType === 'add' ? 'delete' : actionType === 'delete' ? 'add' : 'update') : actionType;

    let nextTxs = [...transactions];
    let nextAccs = [...accounts];

    if (entityType === 'transaction') {
      const txToApply = targetState as Transaction;
      if (targetAction === 'add') {
        nextTxs = [txToApply, ...nextTxs.filter(t => t.id !== txToApply.id)];
      } else if (targetAction === 'delete') {
        const tx = (isUndo ? newState : previousState) as Transaction;
        nextTxs = nextTxs.filter(t => t.id !== tx.id);
      } else if (targetAction === 'update') {
        nextTxs = nextTxs.map(t => t.id === txToApply.id ? txToApply : t);
      }
    } else if (entityType === 'account') {
      const accountState = targetState as AccountUndoState;
      if (targetAction === 'add') {
         const { account, openingTx } = accountState;
         nextAccs = [account, ...nextAccs.filter(a => a.id !== account.id)];
         if (openingTx) nextTxs = [openingTx, ...nextTxs.filter(t => t.id !== openingTx.id)];
      } else if (targetAction === 'delete') {
         const { account, openingTx } = (isUndo ? newState : previousState) as AccountUndoState;
         nextAccs = nextAccs.filter(a => a.id !== account.id);
         if (openingTx) nextTxs = nextTxs.filter(t => t.id !== openingTx.id);
      } else if (targetAction === 'update') {
         const { account, openingTx } = accountState;
         nextAccs = nextAccs.map(a => a.id === account.id ? account : a);
         if (openingTx) {
            nextTxs = nextTxs.map(t => t.id === openingTx.id ? openingTx : t);
         }
      }
    }

    // Recompute all account balances dynamically from scratch using the filtered transaction array
    nextAccs = recomputeAllAccountBalances(nextAccs, nextTxs);
    return { accounts: nextAccs, transactions: nextTxs };
}

  const executeCommand = (cmd: UndoRedoCommand, isUndo: boolean) => {
    const nextState = applyUndoRedoCommand(cmd, isUndo, accounts, transactions);
    const nextCards = projectCreditCards(nextState.accounts, creditCards);

    setTransactions(nextState.transactions);
    setAccountRecords(stripAccountBalances(nextState.accounts));
    setCreditCardRecords(stripCardBalances(nextCards));
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const cmd = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [cmd, ...prev]);
    executeCommand(cmd, true);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const cmd = redoStack[0];
    setRedoStack(prev => prev.slice(1));
    setUndoStack(prev => {
      const next = [...prev, cmd];
      return next.length > MAX_UNDO_HISTORY ? next.slice(next.length - MAX_UNDO_HISTORY) : next;
    });
    executeCommand(cmd, false);
  };


  const [profile, setProfile] = useState<{ name: string; email: string; avatar: string; offlineReady: boolean }>({
    name: 'Financial Sovereign',
    email: 'sovereign@vault.vellum',
    avatar: '',
    offlineReady: true
  });

  const getCycleRelativeDate = (dayOffset: number) => {
    const now = new Date();
    const day = Math.max(1, now.getDate() - dayOffset);
    const d = new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0);
    return d.toISOString();
  };

  const [accountRecords, setAccountRecords] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [creditCardRecords, setCreditCardRecords] = useState<CreditCardInfo[]>([]);
  const EMPTY_SHARED_FINANCE: SharedFinanceState = { people: [], obligations: [], responsibilities: [], payments: [], settlements: [], loanSharingRules: [], loanContributionRules: [] };
  const [sharedFinance, setSharedFinance] = useState<SharedFinanceState>(EMPTY_SHARED_FINANCE);
  const people = sharedFinance.people;
  const sharedObligations = sharedFinance.obligations;
  const sharedResponsibilities = sharedFinance.responsibilities;
  const sharedPayments = sharedFinance.payments;
  const sharedSettlements = sharedFinance.settlements;
  const loanSharingRules = sharedFinance.loanSharingRules;
  const loanContributionRules = sharedFinance.loanContributionRules;
  const personalExpenseRecords = useMemo(
    () => buildPersonalExpenseRecords(transactions, people, sharedObligations, sharedResponsibilities),
    [transactions, people, sharedObligations, sharedResponsibilities],
  );

  // `balance` remains on the UI types for backwards compatibility, but records
  // deliberately retain no balance value. Only the ledger projection below may
  // supply one to consumers.
  const stripAccountBalances = (records: Account[]) => records.map(record => ({ ...record, balance: 0 }));
  const stripCardBalances = (records: CreditCardInfo[]) => records.map(record => ({ ...record, balance: 0 }));

  // Accounts and cards hold only persisted metadata in state. Their balances are
  // projections of the transaction table, never independently writable values.
  const accounts = useMemo(
    () => recomputeAllAccountBalances(accountRecords, transactions),
    [accountRecords, transactions]
  );
  const creditCards = useMemo(
    () => projectCreditCards(accounts, creditCardRecords),
    [accounts, creditCardRecords]
  );

  const totalAssetsRes = safeCompute(() =>
    accounts.filter(a => a.type === 'asset' && !a.is_archived).reduce((sum, a) => sum + getSafeNumericValue(a.balance), 0),
    SAFE_MATH_ERRORS.DRIFT
  );
  const totalAssets = typeof totalAssetsRes === 'number' ? totalAssetsRes : 0;
  const totalLiabilitiesRes = safeCompute(() =>
    accounts.filter(a => a.type === 'liability' && !a.is_archived).reduce((sum, a) => {
      const sharing = loanSharingRules.find(rule => rule.accountId === a.id && rule.isShared);
      const responsibility = sharing ? Math.max(0, Math.min(100, sharing.personalResponsibilityPercent)) / 100 : 1;
      return sum + getSafeNumericValue(a.balance) * responsibility;
    }, 0),
    SAFE_MATH_ERRORS.DRIFT
  );
  const totalLiabilities = typeof totalLiabilitiesRes === 'number' ? totalLiabilitiesRes : 0;
  const netWorthRes = safeCompute(() => totalAssets - totalLiabilities, SAFE_MATH_ERRORS.DRIFT);
  const netWorth = typeof netWorthRes === 'number' ? netWorthRes : 0;
  const getAccountBalance = (accountId: string) => accounts.find(a => a.id === accountId)?.balance ?? 0;

  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const addWidget = (widget: Omit<Widget, 'id'>) => { const newWidget: Widget = { ...widget, id: crypto.randomUUID() }; setWidgets([...widgets, newWidget]); if (dbDriver) { insertWidgetRow(dbDriver, newWidget).then(() => persistDatabase(dbDriver)).catch(console.error); } };
  const removeWidget = (id: string) => { setWidgets(widgets.filter(w => w.id !== id)); if (dbDriver) { deleteWidgetRow(dbDriver, id).then(() => persistDatabase(dbDriver)).catch(console.error); } };

  const [loanRevisions, setLoanRevisions] = useState<LoanRevision[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const savingsGoalsRef = useRef<SavingsGoal[]>([]);
  useEffect(() => { savingsGoalsRef.current = savingsGoals; }, [savingsGoals]);
  const [affordabilitySettings, setAffordabilitySettingsState] = useState<AffordabilitySettings>(() => ({ ...DEFAULT_AFFORDABILITY_SETTINGS }));
  const setAffordabilitySettings = useCallback(async (settings: AffordabilitySettings): Promise<boolean> => {
    if (!dbDriver) return false;
    const normalized = normalizeAffordabilitySettings(settings);
    try {
      await setStoredSetting(AFFORDABILITY_SETTINGS_KEY, normalized);
      setAffordabilitySettingsState(normalized);
      return true;
    } catch (error) {
      console.error('Failed to save affordability settings:', error);
      return false;
    }
  }, [dbDriver, setStoredSetting]);

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [monthCycleDay, setMonthCycleDay] = useState(25);

  const getCycleDetails = (dateString: string) => getCycleDetailsForDay(dateString, monthCycleDay);

  const isDateInCurrentCycle = (dateString: string) => {
    const current = getCycleDetails(new Date().toISOString());
    const txDetails = getCycleDetails(dateString);
    return current.key === txDetails.key;
  };

  const setStateFromDbState = (state: {
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    events: Event[];
    creditCards: CreditCardInfo[];
    widgets: Widget[];
    loanRevisions: LoanRevision[];
    recurringRules: RecurringRule[];
  }) => {
    setAccountRecords(stripAccountBalances(state.accounts));
    setTransactions(state.transactions);
    setCategories(state.categories);
    setEvents(state.events);
    setCreditCardRecords(stripCardBalances(state.creditCards));
    setWidgets(state.widgets);
    setLoanRevisions(state.loanRevisions);
    setRecurringRules(state.recurringRules);
  };

  const refreshStateFromDatabase = async (driver: SqlJsDatabaseDriver) => {
    const state = await loadStateFromDatabase(driver);
    setStateFromDbState(state);
  };

  const refreshSharedFinance = async (driver: SqlJsDatabaseDriver) => {
    setSharedFinance(await loadSharedFinanceState(driver));
  };

  const verifyDataIntegrity = async (): Promise<DataIntegrityAuditResult> => {
    if (!dbDriver) throw new Error('Database is not ready yet.');
    const result = await auditDatabaseIntegrity(dbDriver);
    const criticalCount = result.issues.filter(issue => issue.severity === 'error').length;
    setIntegrityWarning(criticalCount > 0
      ? `Data integrity warning: ${criticalCount} critical issue${criticalCount === 1 ? '' : 's'} detected. Open Settings → Verify Data Integrity for details.`
      : null);
    return result;
  };

  const repairDataIntegrityIssues = async (issues: DataIntegrityIssue[]): Promise<DataIntegrityAuditResult> => {
    if (!dbDriver) throw new Error('Database is not ready yet.');
    const repairable = new Set(['CATEGORY_AFFORDABILITY', 'RECURRING_ARCHIVED_ACCOUNT', 'RECURRING_SOURCE', 'RECURRING_DESTINATION', 'RECURRING_SELF_TRANSFER', 'RECURRING_DATE', 'CREDIT_CARD_DUE', 'GOAL_ACCOUNT', 'GOAL_TRANSACTION_LINK', 'GOAL_RECURRING_LINK']);
    const selected = issues.filter(issue => repairable.has(issue.code));
    if (!selected.length) return verifyDataIntegrity();

    await dbDriver.execute('BEGIN TRANSACTION');
    try {
      for (const issue of selected) {
        if (!issue.entityId) continue;
        if (issue.code === 'CATEGORY_AFFORDABILITY') await dbDriver.execute(`UPDATE categories SET affordability_class = 'NORMAL' WHERE id = ?`, [issue.entityId]);
        else if (issue.code.startsWith('RECURRING_') && issue.code !== 'GOAL_RECURRING_LINK') await dbDriver.execute(`UPDATE recurring_rules SET is_active = 0 WHERE id = ?`, [issue.entityId]);
        else if (issue.code === 'CREDIT_CARD_DUE') await dbDriver.execute(`UPDATE credit_cards SET due_amount = 0 WHERE id = ? OR account_id = ?`, [issue.entityId, issue.entityId]);
        else if (issue.code === 'GOAL_TRANSACTION_LINK') await dbDriver.execute(`UPDATE transactions SET goal_id = NULL WHERE id = ?`, [issue.entityId]);
        else if (issue.code === 'GOAL_RECURRING_LINK') await dbDriver.execute(`UPDATE recurring_rules SET goal_id = NULL WHERE id = ?`, [issue.entityId]);
      }
      await dbDriver.execute('COMMIT');
    } catch (error) {
      await dbDriver.execute('ROLLBACK');
      throw error;
    }

    const goalIssueIds = new Set(selected.filter(issue => issue.code === 'GOAL_ACCOUNT').map(issue => issue.entityId).filter(Boolean));
    if (goalIssueIds.size) {
      const nextGoals = savingsGoalsRef.current.map(goal => goalIssueIds.has(goal.id) ? { ...goal, linkedAccountId: undefined, protectLinkedBalance: false } : goal);
      await setStoredSetting(SAVINGS_GOALS_KEY, nextGoals);
      savingsGoalsRef.current = normalizeSavingsGoals(nextGoals);
      setSavingsGoals(savingsGoalsRef.current);
    }
    await persistDatabase(dbDriver);
    await refreshStateFromDatabase(dbDriver);
    return verifyDataIntegrity();
  };

  const persistAppSetting = async (key: string, value: unknown) => {
    if (!dbDriver) return;
    try {
      await upsertAppSetting(dbDriver, key, value);
      await persistDatabase(dbDriver);
    } catch (error) {
      console.error(`Failed to persist app setting ${key}:`, error);
    }
  };

  const persistDbAction = async (action: () => Promise<unknown>): Promise<boolean> => {
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

  const createSharedExpense = async (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }> }): Promise<boolean> => {
    if (!dbDriver) return false;
    const me = people.find(person => person.isSelf && !person.isArchived);
    if (!me) return false;
    const now = new Date().toISOString();
    const initialPayments: Array<Omit<SharedPayment, 'id' | 'obligationId'>> = [];
    if ((input.trackedPaymentAmount ?? 0) > 0) initialPayments.push({ personId: me.id, transactionId: input.transactionId, amount: input.trackedPaymentAmount!, source: 'TRACKED', paidAt: now });
    for (const payment of input.externalPayments ?? []) if (payment.amount > 0) initialPayments.push({ personId: payment.personId, amount: payment.amount, source: 'EXTERNAL', paidAt: now });
    return persistSharedAction(() => createSharedObligationRow(dbDriver, {
      title: input.title, kind: 'EXPENSE', totalAmount: input.totalAmount, categoryId: input.categoryId, dueDate: input.dueDate, transactionId: input.transactionId,
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

  useEffect(() => {
    let mounted = true;
    initializeDatabase()
      .then(async (driver) => {
        if (!mounted) return;
        setDbDriver(driver);
        // Seed only a genuinely new database. An intentionally empty persisted
        // ledger must remain empty after refresh.
        if (driver.isNewDatabase && !driver.skipDemoSeed) {
          await seedDemoData(driver);
          await persistDatabase(driver);
        }
        await refreshStateFromDatabase(driver);
        await ensureSelfPerson(driver, 'Me');
        await refreshSharedFinance(driver);
        const integrity = await auditDatabaseIntegrity(driver);
        if (integrity.hasCriticalIssues) setIntegrityWarning(`Data integrity warning: ${integrity.issues.filter(issue => issue.severity === 'error').length} critical issue(s) detected. Open Settings → Verify Data Integrity for details.`);
        const settings = await loadAppSettings(driver);
        if (settings.theme === 'light' || settings.theme === 'dark') setTheme(settings.theme);
        if (typeof settings.colorPalette === 'string') setColorPalette(settings.colorPalette);
        if (typeof settings.biometric === 'boolean') setBiometric(settings.biometric);
        if (typeof settings.passcode === 'string' || settings.passcode === null) {
          const storedPasscode = settings.passcode as string | null;
          if (storedPasscode && !storedPasscode.startsWith('sha256:')) setPasscode(storedPasscode);
          else setPasscodeHash(storedPasscode);
        }
        const userConfig = await loadUserConfig(driver);
        setCurrency(userConfig.currency);
        setMonthCycleDay(userConfig.monthCycleDay);
        if (settings.profile && typeof settings.profile === 'object') setProfile(settings.profile as typeof profile);
        setAffordabilitySettingsState(normalizeAffordabilitySettings(settings[AFFORDABILITY_SETTINGS_KEY]));
        setSavingsGoals(normalizeSavingsGoals(settings[SAVINGS_GOALS_KEY]));
        setDbReady(true);
      })
      .catch((err) => {
        console.error('SQLite initialization failed:', err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // SQLite is the single persisted source for preferences.
  useEffect(() => {
    const updatedTime = new Date().toISOString();
    setLastUpdated(updatedTime);
    if (dbReady) {
      void Promise.all([
        persistAppSetting('theme', theme),
        persistAppSetting('colorPalette', colorPalette),
        persistAppSetting('biometric', biometric),
        persistAppSetting('passcode', passcode),
        persistAppSetting('profile', profile),
      ]);
      void persistDbAction(() => upsertUserConfig(dbDriver!, { currency, monthCycleDay }));
    }
  }, [theme, colorPalette, currency, biometric, passcode, monthCycleDay, profile, dbReady, dbDriver]);

  useEffect(() => {
    localStorage.setItem('coinbuddy_balances_visible', String(balancesVisible));
  }, [balancesVisible]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Remove old theme classes
    document.documentElement.classList.remove('theme-blue', 'theme-green', 'theme-purple', 'theme-orange', 'theme-pink');
    
    // Add new theme class
    document.documentElement.classList.add(`theme-${colorPalette}`);
  }, [theme, colorPalette]);

  useEffect(() => {
    if (!dbDriver || !dbReady) return;
    void persistDbAction(async () => {
      const migrationKey = 'coinbuddy_recurring_confirmation_v1';
      if (localStorage.getItem(migrationKey) !== 'true') {
        await repairLegacyRecurringConfirmationState(dbDriver);
        localStorage.setItem(migrationKey, 'true');
      }
      // Due schedules always become pending ledger entries. They never change
      // balances until the user confirms them, so a separate auto-create toggle
      // only made schedules silently disappear when disabled.
      await generateDueRecurringTransactions(dbDriver, false);
    });
  }, [dbDriver, dbReady]);

  const validateTransaction = (
    tx: Omit<Transaction, 'id'>, 
    currentAccounts: Account[], 
    existingTx?: Transaction
  ): { valid: boolean; error?: string } => {
    const numAmount = Math.abs(Number(tx.amount));
    const ledgerType = (tx.transaction_type ?? tx.type).toUpperCase();
    const allowedTypes = new Set([
      'INCOME', 'EXPENSE', 'TRANSFER', 'OPENING_BALANCE',
      'MARKET_ADJUSTMENT', 'BALANCE_ADJUSTMENT',
    ]);

    if (isNaN(numAmount) || numAmount <= 0) {
      return { valid: false, error: 'Transaction amount must strictly be a positive number (> 0).' };
    }

    if (!allowedTypes.has(ledgerType)) {
      return { valid: false, error: `Unsupported transaction type: ${ledgerType}.` };
    }

    if (ledgerType === 'MARKET_ADJUSTMENT' || ledgerType === 'BALANCE_ADJUSTMENT') {
      const hasFrom = Boolean(tx.fromAccountId);
      const hasTo = Boolean(tx.toAccountId);
      if (hasFrom === hasTo) {
        return { valid: false, error: 'An adjustment must have exactly one account direction: to for an increase or from for a decrease.' };
      }
    }

    if (tx.type === 'income') {
      const targetId = tx.toAccountId || tx.account || 'cash';
      const targetAcc = currentAccounts.find(a => a.id === targetId);
      if (targetAcc && targetAcc.type === 'liability') {
        return { valid: false, error: 'Credit Cards and Loans (Liabilities) cannot be selected as the destination account for Income. Income can only flow into Asset accounts.' };
      }
    }

    let nextTxs = transactions;
    if (existingTx) {
      nextTxs = transactions.filter(t => t.id !== existingTx.id);
    }
    const effectiveAccounts = recomputeAllAccountBalances(currentAccounts, nextTxs);

    if (tx.is_verified !== 0 && tx.type === 'expense') {
      const sourceId = tx.fromAccountId || tx.account || 'cash';
      const sourceAcc = effectiveAccounts.find(a => a.id === sourceId);
      if (sourceAcc) {
        if (sourceAcc.type === 'asset') {
          const subtype = sourceAcc.group?.trim().toUpperCase();
          const minimumBalance = subtype === 'BANK' || subtype === 'BANK ACCOUNT'
            ? -Math.max(0, sourceAcc.overdraftLimit ?? 0)
            : 0;
          if (sourceAcc.balance - numAmount < minimumBalance) {
            return { 
              valid: false, 
              error: minimumBalance === 0
                ? `Insufficient funds in ${sourceAcc.name}. Asset balance cannot drop below 0.`
                : `Insufficient funds in ${sourceAcc.name}. Bank balance cannot drop below its overdraft limit of ${Math.abs(minimumBalance)}.`
            };
          }
        } else if (sourceAcc.type === 'liability') {
          const limit = sourceAcc.limit;
          const isRevolvingCredit = sourceAcc.group?.toUpperCase() === 'CREDIT CARD';
          if (isRevolvingCredit && limit !== undefined && limit > 0) {
            if ((sourceAcc.balance + numAmount) > limit) {
              return {
                valid: false,
                error: `Credit limit exceeded for ${sourceAcc.name}. New balance would exceed credit limit of ${limit}.`
              };
            }
          }
        }
      }
    } else if (tx.is_verified !== 0 && tx.type === 'transfer') {
      const sourceId = tx.fromAccountId;
      const sourceAcc = effectiveAccounts.find(a => a.id === sourceId);
      if (sourceAcc) {
        if (sourceAcc.type === 'asset') {
          const subtype = sourceAcc.group?.trim().toUpperCase();
          const minimumBalance = subtype === 'BANK' || subtype === 'BANK ACCOUNT'
            ? -Math.max(0, sourceAcc.overdraftLimit ?? 0)
            : 0;
          if (sourceAcc.balance - numAmount < minimumBalance) {
            return { 
              valid: false, 
              error: minimumBalance === 0
                ? `Insufficient funds in ${sourceAcc.name}. Asset balance cannot drop below 0.`
                : `Insufficient funds in ${sourceAcc.name}. Bank balance cannot drop below its overdraft limit of ${Math.abs(minimumBalance)}.`
            };
          }
        } else if (sourceAcc.type === 'liability') {
          const limit = sourceAcc.limit;
          const isRevolvingCredit = sourceAcc.group?.toUpperCase() === 'CREDIT CARD';
          if (isRevolvingCredit && limit !== undefined && limit > 0) {
            if ((sourceAcc.balance + numAmount) > limit) {
              return {
                valid: false,
                error: `Credit limit exceeded for ${sourceAcc.name}. New balance would exceed credit limit of ${limit}.`
              };
            }
          }
        }
      }
    }

    return { valid: true };
  };

  const addTransaction = async (tx: Omit<Transaction, 'id'>): Promise<{ success: boolean; error?: string }> => {
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
            is_verified: 0,
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
          await generateDueRecurringTransactions(dbDriver, false);
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

  const updateRecurringRule = async (rule: RecurringRule): Promise<boolean> => {
    if (!dbDriver) return false;
    return persistDbAction(() => updateRecurringRuleRow(dbDriver, rule));
  };

  const deleteRecurringRule = async (id: string): Promise<boolean> => {
    if (!dbDriver) return false;
    return persistDbAction(() => deleteRecurringRuleRow(dbDriver, id));
  };

  const skipRecurringRule = async (id: string): Promise<boolean> => {
    if (!dbDriver) return false;
    return persistDbAction(() => skipRecurringRuleOccurrence(dbDriver, id));
  };

  const updateTransaction = (id: string, newTx: Omit<Transaction, 'id'>): { success: boolean; error?: string } => {
    const existingTx = transactions.find(t => t.id === id);
    if (existingTx?.isOpeningBalance) {
      throw new Error('Opening balances cannot be edited or deleted directly. Please update the starting balance in Account Settings.');
    }
    if (existingTx?.transaction_type === 'BALANCE_ADJUSTMENT') {
      throw new Error('Balance adjustments are immutable. Delete the adjustment and reconcile again if a correction is needed.');
    }
    if (existingTx && existingTx.type !== newTx.type) {
      throw new Error('Transaction type cannot be changed after creation. Please delete and recreate the transaction if needed.');
    }
    const validation = validateTransaction(newTx, accounts, existingTx);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const updatedTx = { ...newTx, id };
    const nextTxs = transactions.map(t => t.id === id ? updatedTx : t);

    pushCommand({
      entityType: 'transaction',
      actionType: 'update',
      previousState: existingTx,
      newState: updatedTx
    });

    setTransactions(nextTxs);

    if (dbDriver) {
      persistDbAction(() => updateTransactionRow(dbDriver, id, newTx));
    }

    return { success: true };
  };

  const deleteTransaction = (id: string) => {
    const tx = transactions.find(t => t.id === id);
    if (tx?.isOpeningBalance) {
      throw new Error('Opening balances cannot be edited or deleted directly. Please update the starting balance in Account Settings.');
    }
    if (tx) {
      const nextTxs = transactions.filter(t => t.id !== id);
      pushCommand({
        entityType: 'transaction',
        actionType: 'delete',
        previousState: tx,
        newState: null
      });
      setTransactions(nextTxs);
      showToast('Transaction deleted', 'Undo', handleUndo);

      if (dbDriver) {
        persistDbAction(() => deleteTransactionRow(dbDriver, id));
      }
    } else {
      setTransactions(txs => txs.filter(t => t.id !== id));
      showToast('Transaction deleted', 'Undo', handleUndo);
    }
  };

  const approveTransaction = (id: string, userSelectedDate?: string): { success: boolean; error?: string } => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return { success: false, error: 'Scheduled transaction could not be found.' };
    if (tx.is_verified !== 0) return { success: true };

    // Confirmation is the point where a scheduled transaction becomes real,
    // so normal balance/credit-limit validation is intentionally enforced here.
    return updateTransaction(id, {
      ...tx,
      date: userSelectedDate || tx.date,
      is_verified: 1
    });
  };

  const rejectTransaction = (id: string) => {
    deleteTransaction(id);
  };

  const addLoanRevision = (revision: Omit<LoanRevision, 'id'>) => {
    const newId = crypto.randomUUID();
    const accId = revision.accountId;
    const newRev: LoanRevision = {
      ...revision,
      id: newId,
      accountId: accId,
      effectiveDate: revision.effectiveDate,
      newInterestRate: revision.newInterestRate,
      newEmi: revision.newEmi,
      newTenureMonths: revision.newTenureMonths,
      paymentFrequency: revision.paymentFrequency,
    };

    setLoanRevisions(prev => [...prev, newRev]);
    setAccountRecords(prevAccs => prevAccs.map(acc => {
      if (acc.id === accId) {
        const existing = acc.revisions || [];
        return {
          ...acc,
          interestRate: newRev.newInterestRate,
          monthlyEMI: newRev.newEmi,
          tenureMonths: newRev.newTenureMonths,
          paymentFrequency: newRev.paymentFrequency || acc.paymentFrequency,
          revisions: [...existing, newRev]
        };
      }
      return acc;
    }));

    if (dbDriver) {
      persistDbAction(() => insertLoanRevisionRow(dbDriver, newRev));
    }
  };

  const deleteLoanRevision = (id: string) => {
    const revision = loanRevisions.find(item => item.id === id);
    if (!revision) return;
    const accountsBeforeDelete = accountRecords;
    setLoanRevisions(prev => prev.filter(r => r.id !== id));
    setAccountRecords(prevAccs => prevAccs.map(acc => {
      if (acc.revisions) {
        return {
          ...acc,
          revisions: acc.revisions.filter(r => r.id !== id)
        };
      }
      return acc;
    }));

    if (dbDriver) {
      persistDbAction(() => deleteLoanRevisionRow(dbDriver, id));
    }
    showToast('Loan revision deleted', 'Undo', () => {
      setLoanRevisions(prev => prev.some(item => item.id === revision.id) ? prev : [...prev, revision]);
      setAccountRecords(accountsBeforeDelete);
      if (dbDriver) persistDbAction(() => insertLoanRevisionRow(dbDriver, revision));
    });
  };

  const addCreditCard = (card: Omit<CreditCardInfo, 'id'>) => {
    const newId = crypto.randomUUID();
    const initialBalance = card.balance || 0;
    const newCard: CreditCardInfo = { ...card, id: newId, balance: 0 };
    const newAccount: Account = { id: newId, name: card.name, type: 'liability', group: 'Credit Card', balance: 0, limit: card.limit };

    setCreditCardRecords(cards => [{ ...newCard }, ...cards]);
    setAccountRecords(prev => [newAccount, ...prev]);

    let openingTx: Transaction | null = null;
    if (initialBalance > 0) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const newOpeningTx: Transaction = {
        id: crypto.randomUUID(),
        title: 'Opening Balance',
        subtitle: `${formattedDate} • Initial Debt`,
        amount: initialBalance,
        date: now.toISOString(),
        category: '#opening',
        icon: 'CreditCard',
        type: 'expense',
        account: newId,
        fromAccountId: newId,
        isOpeningBalance: true,
        transaction_type: 'OPENING_BALANCE'
      };
      openingTx = newOpeningTx;
      setTransactions(prev => [newOpeningTx, ...prev]);
    }

    if (dbDriver) {
      persistDbAction(async () => {
        await insertCreditCardAccount(dbDriver, newAccount, newCard, initialBalance, openingTx?.id);
      });
    }
  };  
  const updateCreditCard = (id: string, card: Omit<CreditCardInfo, 'id'>) => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return;

    if (card.limit < targetAccount.balance) {
      throw new Error('Credit limit cannot be lower than the current outstanding balance.');
    }

    const existingTxIndex = transactions.findIndex(t => 
      (t.isOpeningBalance || t.category === '#opening') &&
      (t.account === id || t.toAccountId === id || t.fromAccountId === id)
    );

    const updatedCard: CreditCardInfo = { ...card, id, balance: 0 };

    if (existingTxIndex >= 0) {
      const newAmount = card.balance;
      setTransactions(prevTxs => prevTxs.map((t, idx) => idx === existingTxIndex ? { ...t, amount: newAmount } : t));
      setCreditCardRecords(cards => cards.map(c => c.id === id ? { ...updatedCard } : c));
      setAccountRecords(accs => accs.map(a => a.id === id ? { ...a, name: card.name, balance: 0, limit: card.limit } : a));
    } else {
      if (card.balance > 0) {
        const now = new Date();
        const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const openingTx: Transaction = {
          id: crypto.randomUUID(),
          title: 'Opening Balance',
          subtitle: `${formattedDate} • Initial Balance`,
          amount: card.balance,
          date: now.toISOString(),
          category: '#opening',
          icon: 'CreditCard',
          type: 'expense',
          account: id,
          fromAccountId: id,
          isOpeningBalance: true,
          transaction_type: 'OPENING_BALANCE'
        };
        setTransactions(prev => [...prev, openingTx]);
        if (dbDriver) {
          persistDbAction(() => insertTransactionRow(dbDriver, openingTx));
        }
      }
      setCreditCardRecords(cards => cards.map(c => c.id === id ? { ...updatedCard } : c));
      setAccountRecords(accs => accs.map(a => a.id === id ? { ...a, name: card.name, balance: 0, limit: card.limit } : a));
    }

    if (dbDriver) {
      persistDbAction(async () => {
        await updateAccountRow(dbDriver, { ...targetAccount, name: card.name, limit: card.limit, balance: 0 });
        // The entered card balance is an opening-ledger transaction, not card
        // metadata. Persist its edit through the same authoritative path used
        // for normal account opening balances.
        if (existingTxIndex >= 0) {
          await updateOpeningBalance(dbDriver, id, card.balance);
        }
        await updateCreditCardRow(dbDriver, updatedCard);
      });
    }
  };

  const addAccount = (account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string } = {}) => {
    const newId = crypto.randomUUID();
    const initialBalance = account.balance || 0;
    const newAccount: Account = { ...account, id: newId, balance: 0 };
    
    let openingTx: Transaction | null = null;
    if (initialBalance > 0) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      
      if (account.type === 'asset') {
        openingTx = {
          id: crypto.randomUUID(),
          title: 'Opening Balance',
          subtitle: `${formattedDate} • Initial Balance`,
          amount: initialBalance,
          date: now.toISOString(),
          category: '#opening',
          icon: 'Landmark',
          type: 'income',
          account: newId,
          toAccountId: newId,
          isOpeningBalance: true,
          transaction_type: 'OPENING_BALANCE'
        };
      } else if (account.type === 'liability') {
        openingTx = {
          id: crypto.randomUUID(),
          title: 'Opening Balance',
          subtitle: `${formattedDate} • Initial Debt`,
          amount: initialBalance,
          date: now.toISOString(),
          category: '#opening',
          icon: 'Landmark',
          type: 'expense',
          account: newId,
          fromAccountId: newId,
          isOpeningBalance: true,
          transaction_type: 'OPENING_BALANCE'
        };
      }
    }

    pushCommand({
      entityType: 'account',
      actionType: 'add',
      previousState: null,
      newState: { account: newAccount, openingTx }
    });

    setAccountRecords(prev => [newAccount, ...prev]);
    if (openingTx) {
      setTransactions(prev => [openingTx, ...prev]);
    }

    if (dbDriver) {
      persistDbAction(async () => {
        await dbDriver.execute('BEGIN TRANSACTION');
        try {
          await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id, false);
          await syncInvestmentSipRecurringRule(dbDriver, newId, { ...newAccount, balance: initialBalance }, options.sipSourceAccountId);
          await dbDriver.execute('COMMIT');
        } catch (error) {
          await dbDriver.execute('ROLLBACK');
          throw error;
        }
      });
    }
  };

  const updateAccount = (id: string, account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string } = {}) => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return;

    if (targetAccount.type === 'liability' && account.type === 'liability' && account.limit !== targetAccount.limit) {
      const newLimit = Math.max(0, Number(account.limit ?? 0));
      if (newLimit < targetAccount.balance) {
        throw new Error(`Credit limit cannot be lower than the current outstanding balance of ${targetAccount.balance}.`);
      }
    }

    const existingTxIndex = transactions.findIndex(t => 
      (t.isOpeningBalance || t.category === '#opening' || t.transaction_type === 'OPENING_BALANCE') &&
      (t.account === id || t.toAccountId === id || t.fromAccountId === id)
    );
    

    if (existingTxIndex >= 0) {
      const newAmount = account.balance;
      const updatedTx = { ...transactions[existingTxIndex], amount: newAmount };
      const mergedAccount = {
        ...account,
        id,
        balance: 0,
        originalPrincipal: account.originalPrincipal || targetAccount.originalPrincipal || account.balance
      };
      pushCommand({
        entityType: 'account',
        actionType: 'update',
        previousState: { account: targetAccount, openingTx: transactions[existingTxIndex] },
        newState: { account: mergedAccount, openingTx: updatedTx }
      });

      setTransactions(prevTxs => prevTxs.map((t, idx) => idx === existingTxIndex ? updatedTx : t));
      setAccountRecords(accs => accs.map(a => a.id === id ? mergedAccount : a));
      setCreditCardRecords(cards => cards.map(c => c.id === id ? { ...c, name: account.name, balance: 0 } : c));

      if (dbDriver) {
        persistDbAction(async () => {
          await updateAccountRow(dbDriver, mergedAccount);
          await updateOpeningBalance(dbDriver, id, account.balance);
          await syncInvestmentSipRecurringRule(dbDriver, id, { ...mergedAccount, balance: account.balance }, options.sipSourceAccountId);
        });
      }
    } else {
      let newOpeningTx: Transaction | null = null;
      if (account.balance > 0) {
        const now = new Date();
        const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const openingTx: Transaction = {
          id: crypto.randomUUID(),
          title: 'Opening Balance',
          subtitle: `${formattedDate} • Initial Balance`,
          amount: account.balance,
          date: now.toISOString(),
          category: '#opening',
          icon: account.type === 'asset' ? 'Landmark' : (account.group === 'Credit Card' ? 'CreditCard' : 'Building'),
          type: account.type === 'asset' ? 'income' : 'expense',
          account: id,
          toAccountId: account.type === 'asset' ? id : undefined,
          fromAccountId: account.type === 'liability' ? id : undefined,
          isOpeningBalance: true,
          transaction_type: 'OPENING_BALANCE'
        };
        newOpeningTx = openingTx;
        setTransactions(prev => [...prev, openingTx]);
      }
      pushCommand({
        entityType: 'account',
        actionType: 'update',
        previousState: { account: targetAccount, openingTx: null },
        newState: { account: { ...account, id, balance: 0 }, openingTx: newOpeningTx }
      });
      setAccountRecords(accs => accs.map(a => a.id === id ? { ...account, id, balance: 0 } : a));
      setCreditCardRecords(cards => cards.map(c => c.id === id ? { ...c, name: account.name, balance: 0 } : c));

      if (dbDriver) {
        persistDbAction(async () => {
          await updateAccountRow(dbDriver, { ...account, id, balance: 0 });
          if (newOpeningTx) {
            await insertTransactionRow(dbDriver, newOpeningTx);
          }
          await syncInvestmentSipRecurringRule(dbDriver, id, { ...account, id }, options.sipSourceAccountId);
        });
      }
    }
  };

  const deleteAccount = (id: string) => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return;
    const openingTransactions = transactions.filter(transaction =>
      (transaction.isOpeningBalance || transaction.category === '#opening' || transaction.transaction_type === 'OPENING_BALANCE') &&
      (transaction.account === id || transaction.toAccountId === id || transaction.fromAccountId === id)
    );
    const relatedCard = creditCards.find(card => card.id === id);
    clearStacks();

    if (dbDriver) {
      persistDbAction(async () => {
        await deleteAccountInDB(dbDriver, id);
      });
    }

    const hasHistory = transactions.some(t => {
      const isOpening = t.isOpeningBalance || t.category === '#opening' || t.transaction_type === 'OPENING_BALANCE';
      if (isOpening) return false;

      const isInvolved = t.account === id || t.fromAccountId === id || t.toAccountId === id;
      return isInvolved;
    });

    if (!hasHistory) {
      setTransactions(prev => prev.filter(t => !(
        (t.isOpeningBalance || t.category === '#opening' || t.transaction_type === 'OPENING_BALANCE') &&
        (t.account === id || t.fromAccountId === id || t.toAccountId === id)
      )));
      setAccountRecords(prev => prev.filter(a => a.id !== id));
      setCreditCardRecords(prev => prev.filter(c => c.id !== id));
    } else {
      if (Math.abs(targetAccount.balance) > 0.0001) {
        throw new Error("Account must have a zero balance before closing. Please transfer funds or log an expense.");
      }
      setAccountRecords(prev => prev.map(a => a.id === id ? { ...a, is_archived: 1 } : a));
      setCreditCardRecords(prev => prev.filter(c => c.id !== id));
    }
    showToast(hasHistory ? 'Account archived' : 'Account deleted', 'Undo', () => {
      if (hasHistory) {
        setAccountRecords(prev => prev.map(account => account.id === id ? { ...account, is_archived: 0 } : account));
        if (relatedCard) setCreditCardRecords(prev => prev.some(card => card.id === id) ? prev : [relatedCard, ...prev]);
        if (dbDriver) persistDbAction(() => updateAccountRow(dbDriver, { ...targetAccount, is_archived: 0 }));
      } else {
        setAccountRecords(prev => prev.some(account => account.id === id) ? prev : [targetAccount, ...prev]);
        setTransactions(prev => [...openingTransactions.filter(transaction => !prev.some(existing => existing.id === transaction.id)), ...prev]);
        if (relatedCard) setCreditCardRecords(prev => prev.some(card => card.id === id) ? prev : [relatedCard, ...prev]);
        if (dbDriver) persistDbAction(async () => {
          await insertAccountRow(dbDriver, targetAccount, 0);
          for (const transaction of openingTransactions) await insertTransactionRow(dbDriver, transaction);
          if (relatedCard) await insertCreditCardRow(dbDriver, relatedCard);
        });
      }
    });
  };

  const transferFunds = (amount: number, fromId: string, toId: string) => {
    const fromAccount = accounts.find(a => a.id === fromId);
    const toAccount = accounts.find(a => a.id === toId);

    void addTransaction({
      title: `Transfer: ${fromAccount?.name || 'Unknown'} to ${toAccount?.name || 'Unknown'}`,
      subtitle: `Today • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      amount: Math.abs(amount),
      date: new Date().toISOString(),
      category: '#transfer',
      icon: 'ArrowRightLeft',
      type: 'transfer',
      fromAccountId: fromId,
      toAccountId: toId,
    });
  };

  const payCreditCard = (cardId: string, amount: number, fromAccountId?: string) => {
    const defaultAsset = fromAccountId || accounts.find(a => a.type === 'asset')?.id || 'checking';
    transferFunds(amount, defaultAsset, cardId);
  };

  const payLiability = (id: string, amount: number, principalAmount?: number, interestAmount?: number, fromAccountId?: string) => {
    if (pendingLiabilityPayments.current.has(id)) {
      window.alert('A payment for this liability is already being saved. Please wait.');
      return;
    }
    pendingLiabilityPayments.current.add(id);
    // addTransaction persists asynchronously; retain a short UI lock through
    // the optimistic update and database refresh to prevent double-taps.
    window.setTimeout(() => pendingLiabilityPayments.current.delete(id), 1500);
    const defaultAsset = fromAccountId || accounts.find(a => a.type === 'asset')?.id || 'checking';
    const liabilityAcc = accounts.find(a => a.id === id);

    let pAmount = principalAmount;
    let iAmount = interestAmount;

    if (pAmount === undefined || iAmount === undefined) {
      if (liabilityAcc && (liabilityAcc.group === 'Bank Loan' || liabilityAcc.group === 'Loan' || liabilityAcc.group === 'Mortgage' || liabilityAcc.group === 'Interest-Only Loan' || liabilityAcc.interestRate !== undefined || liabilityAcc.monthlyEMI !== undefined)) {
        const rate = liabilityAcc.interestRate ?? 0;
        const type = liabilityAcc.interestCalculationType || 'REDUCING';
        const split = calculateEmiSplit(liabilityAcc.balance, rate, amount, type);
        pAmount = split.principalAmount;
        iAmount = split.interestAmount;
      } else {
        pAmount = amount;
        iAmount = 0;
      }
    }

    if (pAmount > 0) {
      transferFunds(pAmount, defaultAsset, id);
    }
    if (iAmount > 0) {
      void addTransaction({
        title: `Interest Payment: ${liabilityAcc?.name || 'Loan'}`,
        subtitle: `Today • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        amount: iAmount,
        date: new Date().toISOString(),
        category: '#interest',
        icon: 'Flame',
        type: 'expense',
        fromAccountId: defaultAsset,
        account: id,
        toAccountId: id,
        isInterestOnly: true,
      });
    }
  };

  const deleteCreditCard = (cardId: string) => {
    const card = creditCards.find(item => item.id === cardId);
    if (!card) return;
    setCreditCardRecords(cards => cards.filter(c => c.id !== cardId));
    showToast('Credit card removed', 'Undo', () => setCreditCardRecords(cards => cards.some(item => item.id === card.id) ? cards : [card, ...cards]));
  };

  const persistSavingsGoals = useCallback(async (nextGoals: SavingsGoal[]): Promise<boolean> => {
    if (!dbDriver) return false;
    const normalized = normalizeSavingsGoals(nextGoals);
    try {
      await setStoredSetting(SAVINGS_GOALS_KEY, normalized);
      savingsGoalsRef.current = normalized;
      setSavingsGoals(normalized);
      return true;
    } catch (error) {
      console.error('Failed to save Goals:', error);
      return false;
    }
  }, [dbDriver, setStoredSetting]);

  const addSavingsGoal = async (goal: Omit<SavingsGoal, 'id' | 'createdAt'>): Promise<boolean> => {
    const created = normalizeSavingsGoal({ ...goal, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    return persistSavingsGoals([created, ...savingsGoalsRef.current]);
  };

  const updateSavingsGoal = async (id: string, goal: Omit<SavingsGoal, 'id' | 'createdAt'>): Promise<boolean> => {
    const next = savingsGoalsRef.current.map(item => item.id === id ? normalizeSavingsGoal({ ...item, ...goal, id }) : item);
    return persistSavingsGoals(next);
  };

  const deleteSavingsGoal = async (id: string): Promise<boolean> => {
    const removed = savingsGoalsRef.current.find(goal => goal.id === id);
    const ok = await persistSavingsGoals(savingsGoalsRef.current.filter(goal => goal.id !== id));
    if (ok && removed) showToast('Goal deleted', 'Undo', () => {
      const restored = savingsGoalsRef.current.some(goal => goal.id === removed.id) ? savingsGoalsRef.current : [removed, ...savingsGoalsRef.current];
      void persistSavingsGoals(restored);
    });
    return ok;
  };

  const addCategory = (category: Omit<Category, 'id'>) => {
    const newCategory: Category = ensureCategoryAffordabilityClass({ ...category, id: crypto.randomUUID() });
    setCategories(prev => [newCategory, ...prev]);
    if (dbDriver) {
      persistDbAction(() => insertCategoryRow(dbDriver, newCategory));
    }
  };

  const updateCategory = (id: string, category: Omit<Category, 'id'>) => {
    const normalizedCategory: Category = ensureCategoryAffordabilityClass({ ...category, id });
    setCategories(cats => cats.map(c => c.id === id ? { ...c, ...normalizedCategory } : c));
    if (dbDriver) {
      persistDbAction(() => updateCategoryRow(dbDriver, id, normalizedCategory));
    }
  };

  const createEvent = (name: string): Event => {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Event name is required.');
    const existing = events.find(event => event.name.localeCompare(normalizedName, undefined, { sensitivity: 'accent' }) === 0);
    if (existing) return existing;
    const event: Event = { id: crypto.randomUUID(), name: normalizedName, createdAt: new Date().toISOString() };
    setEvents(previous => [event, ...previous]);
    if (dbDriver) persistDbAction(() => insertEventRow(dbDriver, event));
    return event;
  };

  const fetchEvents = () => events;

const groupTransactionsToEvent = (transactionIds: string[], eventId: string | null) => {
  const ids = transactionIds.filter(id => {
    const transaction = transactions.find(item => item.id === id);
    return Boolean(transaction && (eventId === null || isEventAssignableTransaction(transaction)));
  });
  if (!ids.length) return;
  setTransactions(previous => previous.map(transaction =>
    ids.includes(transaction.id) ? { ...transaction, eventId: eventId ?? undefined } : transaction
  ));
  if (dbDriver) persistDbAction(() => updateTransactionEvents(dbDriver, ids, eventId));
};


  const deleteCategory = (id: string) => {
    const category = categories.find(item => item.id === id);
    if (!category) return;
    setCategories(cats => cats.filter(c => c.id !== id));
    if (dbDriver) {
      persistDbAction(() => deleteCategoryRow(dbDriver, id));
    }
    showToast('Category deleted', 'Undo', () => {
      setCategories(cats => cats.some(item => item.id === category.id) ? cats : [category, ...cats]);
      if (dbDriver) persistDbAction(() => insertCategoryRow(dbDriver, category));
    });
  };

  const formatCurrency = (amount: number | string) => {
    if (!balancesVisible) return '••••••';
    if (isSafeMathError(amount)) {
      return `⚠️ [${amount}]`;
    }
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
    if (isNaN(num) || !isFinite(num)) {
      return `⚠️ [ERR_CALC_NAN]`;
    }
    const locales: Record<string, string> = {
      'USD': 'en-US',
      'EUR': 'de-DE',
      'GBP': 'en-GB',
      'INR': 'en-IN',
      'JPY': 'ja-JP'
    };
    return new Intl.NumberFormat(locales[currency] || 'en-US', {
      style: 'currency',
      currency: currency,
    }).format(num);
  };

  const getCurrencySymbol = () => {
    const locales: Record<string, string> = {
      'USD': 'en-US',
      'EUR': 'de-DE',
      'GBP': 'en-GB',
      'INR': 'en-IN',
      'JPY': 'ja-JP'
    };
    return (0).toLocaleString(locales[currency] || 'en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).replace(/\d/g, '').trim();
  };

  const clearAllData = async () => {
    const defaultProf = {
      name: 'Financial Sovereign',
      email: 'sovereign@vault.vellum',
      avatar: '',
      offlineReady: true
    };

    try {
      if (dbDriver) {
        await persistDbAction(async () => {
          await dbDriver.execute('BEGIN TRANSACTION');
          try {
            await clearDatabase(dbDriver);
            await dbDriver.execute('COMMIT');
          } catch (error) {
            await dbDriver.execute('ROLLBACK');
            throw error;
          }
        });
      }

      await deletePersistedDatabase();
      clearAppBrowserStorage();
      markClearStoragePending();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not clear the local database.';
      throw new Error(message);
    }

    setTransactions([]);
    setCreditCardRecords([]);
    setAccountRecords([]);
    setWidgets([]);
    setPasscode(null);
    setBiometric(false);
    setProfile(defaultProf);
    setCategories([]);
    setEvents([]);
    setLoanRevisions([]);
    setRecurringRules([]);
    setSavingsGoals([]);
    setSharedFinance(EMPTY_SHARED_FINANCE);
    setAffordabilitySettingsState({ ...DEFAULT_AFFORDABILITY_SETTINGS });
    setIntegrityWarning(null);
    clearStacks();
    setLastUpdated(new Date().toISOString());
  };

  const importLedgerData = async (data: LedgerImportData) => {
    const validationError = validateLedgerImport(data);
    if (validationError) throw new Error(validationError);
    if (dbDriver) {
      const imported = await persistDbAction(async () => {
        await importLedgerToDatabase(dbDriver, data, { skipValidation: true });
      });
      if (!imported) {
        throw new Error('Import failed. Your existing ledger was left unchanged.');
      }
      const refreshed = await loadStateFromDatabase(dbDriver);
      setAccountRecords(stripAccountBalances(refreshed.accounts));
      setTransactions(refreshed.transactions);
      setCategories(refreshed.categories);
      setEvents(refreshed.events);
      setCreditCardRecords(stripCardBalances(refreshed.creditCards));
      setWidgets(refreshed.widgets);
      setLoanRevisions(refreshed.loanRevisions);
      setRecurringRules(refreshed.recurringRules);
      await ensureSelfPerson(dbDriver, 'Me');
      await refreshSharedFinance(dbDriver);
      const restoredAppSettings = await loadAppSettings(dbDriver);
      setAffordabilitySettingsState(normalizeAffordabilitySettings(restoredAppSettings[AFFORDABILITY_SETTINGS_KEY]));
      setSavingsGoals(normalizeSavingsGoals(restoredAppSettings[SAVINGS_GOALS_KEY]));
      const integrity = await auditDatabaseIntegrity(dbDriver);
      if (integrity.mismatches.length > 0) {
        setIntegrityWarning(`Imported ledger needs attention: ${integrity.mismatches.length} account balance${integrity.mismatches.length === 1 ? '' : 's'} could not be verified.`);
      } else {
        setIntegrityWarning(null);
      }
    } else {
      if (data.accounts && Array.isArray(data.accounts)) setAccountRecords(stripAccountBalances(data.accounts));
      if (data.transactions && Array.isArray(data.transactions)) setTransactions(data.transactions);
      if (data.categories && Array.isArray(data.categories)) setCategories(data.categories);
      if (data.events && Array.isArray(data.events)) setEvents(data.events);
      if (data.creditCards && Array.isArray(data.creditCards)) setCreditCardRecords(stripCardBalances(data.creditCards));
      if (data.widgets && Array.isArray(data.widgets)) setWidgets(data.widgets);
      if (data.loanRevisions && Array.isArray(data.loanRevisions)) setLoanRevisions(data.loanRevisions);
      if (data.recurringRules && Array.isArray(data.recurringRules)) setRecurringRules(data.recurringRules);
      setAffordabilitySettingsState(normalizeAffordabilitySettings(data.affordabilitySettings));
      setSavingsGoals(normalizeSavingsGoals(data.savingsGoals));
    }

    if (data.currency) setCurrency(data.currency);
    const importedConfig = data.users_config?.[0];
    if (importedConfig?.currency_code) setCurrency(importedConfig.currency_code);
    if (typeof importedConfig?.month_cycle_day === 'number') setMonthCycleDay(importedConfig.month_cycle_day);
    clearStacks();
    setLastUpdated(new Date().toISOString());
  };

  const exportLedgerData = () => ({
    schemaVersion: 'coinbuddy-ledger-v4',
    exportedAt: new Date().toISOString(),
    accounts,
    transactions,
    categories,
    events,
    creditCards,
    widgets,
    loanRevisions,
    recurringRules,
    affordabilitySettings,
    savingsGoals,
    people,
    sharedObligations,
    sharedResponsibilities,
    sharedPayments,
    sharedSettlements,
    loanSharingRules,
    loanContributionRules,
    currency,
  });

  const resetToDemoData = () => {
    if (!dbDriver) {
      window.alert('The local ledger is still loading. Please try again in a moment.');
      return;
    }
    void (async () => {
      try {
        await loadDemoDataFromJson(dbDriver);
        await persistDatabase(dbDriver);
        window.location.reload();
      } catch (error) {
        console.error('Unable to load CoinBuddy demo data:', error);
        window.alert(`Demo data could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };

  return (
    <AppContext.Provider value={{
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      handleUndo,
      handleRedo,
      theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, balancesVisible, toggleBalancesVisible: () => setBalancesVisible(visible => !visible), formatCurrency, getCurrencySymbol,
      accounts, calculateEmiSplit, addAccount, updateAccount, deleteAccount, editingAccount, setEditingAccount, editingCreditCard, setEditingCreditCard, transferFunds, netWorth,
      widgets, addWidget, removeWidget,
      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, recurringRules, affordabilitySettings, setAffordabilitySettings, savingsGoals, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, personalExpenseRecords, addSharedPerson, archiveSharedPerson, createSharedExpense, recordSharedPayment, recordSharedSettlement, configureLoanSharing,
      updateRecurringRule, deleteRecurringRule, skipRecurringRule, 
      biometric, setBiometric, passcode, setPasscode, verifyPasscode, isUnlocked, setUnlocked, isAddModalOpen, setAddModalOpen, isOnboardingOpen, setOnboardingOpen, isButtonTourOpen, setButtonTourOpen,
      isManageCategoriesOpen, setManageCategoriesOpen,
      addAccountModalType, setAddAccountModalType, creditCards, addCreditCard, updateCreditCard, payCreditCard, payLiability, deleteCreditCard,
      loanRevisions, addLoanRevision, deleteLoanRevision,
      isWalletModalOpen, setWalletModalOpen,
      payCardModalState, setPayCardModalState,
      categories, events, createEvent, fetchEvents, groupTransactionsToEvent, addCategory, updateCategory, deleteCategory,
      profile, setProfile,
      monthCycleDay, setMonthCycleDay, isDateInCurrentCycle, getCycleDetails,
      lastUpdated, exportLedgerData, importLedgerData, getAccountBalance,
      clearAllData, resetToDemoData, integrityWarning, dismissIntegrityWarning: () => setIntegrityWarning(null), verifyDataIntegrity, repairDataIntegrityIssues, getStoredSetting, setStoredSetting, toast, showToast
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
