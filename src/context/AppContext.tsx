import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings, SavingsGoal, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule, SharedObligationTemplate, SharedTemplateResponsibility, ExternalLoanContribution, LoanPayoffPlan, LoanPayoffResponsibility, LoanPayoffFundMovement, LoanPayoffHoldingType, LoanPayoffType, RecurrenceFrequency } from '../types';
import { calculateEmiSplit, getOriginalPrincipal, getTotalInterestPaid } from '../utils/emi';
import { recomputeAllAccountBalances, syncCreditCardsWithAccounts as projectCreditCards } from '../utils/balanceManager';
import {
  initializeDatabase,
  persistDatabase,
  runAtomicDatabaseAction,
  createRecoverySnapshot,
  listRecoverySnapshots,
  restoreRecoverySnapshot,
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
import { hashPasscode, isPasscodeHash, verifyPasscode as verifyPasscodeHash } from '../utils/passcode';
import { getCycleDetailsForDay } from '../utils/cycles';
import { isEventAssignableTransaction } from '../domain/eventRules';
import { applyLoanRevisionProjection } from '../domain/loanRevisionProjection';
import { advanceRecurringDate, shouldCreateInitialOccurrence, toLocalDateKey } from '../domain/recurring';
import { ensureCategoryAffordabilityClass } from '../domain/categoryAffordability';
import { AFFORDABILITY_SETTINGS_KEY, DEFAULT_AFFORDABILITY_SETTINGS, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';
import { SAVINGS_GOALS_KEY, normalizeSavingsGoal, normalizeSavingsGoals } from '../domain/savingsGoals';
import { buildPersonalExpenseRecords, type PersonalExpenseRecord } from '../domain/personalSpending';
import {
  applyUndoRedoCommand,
  insertLiabilityPaymentRows,
  persistUndoRedoCommand,
  type AccountUndoState,
  type UndoRedoCommand,
} from '../domain/ledgerSafety';
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
  createSharedObligationTemplate as createSharedObligationTemplateRow,
  generateDueSharedObligations,
  addSharedSettlementWithBalanceAdjustment,
  addExternalLoanContribution,
  setSharedObligationTemplateActive,
  type SharedFinanceState,
} from '../db/sharedFinanceRepository';
import {
  loadLoanPayoffState,
  saveLoanPayoffPlan as saveLoanPayoffPlanRow,
  reserveLoanPayoffFunds as reserveLoanPayoffFundsRow,
  releaseLoanPayoffFunds as releaseLoanPayoffFundsRow,
  consumeTrackedReservedForLoanPayment,
  consumeExternalReservedForLoanPayment,
  cancelLoanPayoffPlan as cancelLoanPayoffPlanRow,
  completeLoanPayoffPlan as completeLoanPayoffPlanRow,
  type LoanPayoffState,
} from '../db/loanPayoffRepository';
import { getActiveLoanPayoffPlan, getLoanPayoffTrackedReservedForAccount, getSpendableAccountBalance, getTrackedReservedForAccount } from '../domain/loanPayoff';

export { applyUndoRedoCommand };
export type { UndoRedoCommand, AccountUndoState };
type LoanSharingSaveConfig = { isShared: boolean; personalResponsibilityPercent: number; contributions: Array<Omit<LoanContributionRule, 'id' | 'accountId'>> };
type MutationResult = { success: boolean; error?: string };
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
  sharedObligationTemplates?: SharedObligationTemplate[];
  sharedTemplateResponsibilities?: SharedTemplateResponsibility[];
  externalLoanContributions?: ExternalLoanContribution[];
  loanPayoffPlans?: LoanPayoffPlan[];
  loanPayoffResponsibilities?: LoanPayoffResponsibility[];
  loanPayoffFundMovements?: LoanPayoffFundMovement[];
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
  addAccount: (account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string; loanSharing?: LoanSharingSaveConfig }) => Promise<MutationResult>;
  updateAccount: (id: string, account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string; loanSharing?: LoanSharingSaveConfig }) => Promise<MutationResult>;
  deleteAccount: (id: string) => Promise<MutationResult>;
  editingAccount: Account | null;
  setEditingAccount: (account: Account | null) => void;
  editingCreditCard: CreditCardInfo | null;
  setEditingCreditCard: (card: CreditCardInfo | null) => void;
  transferFunds: (amount: number, fromId: string, toId: string) => Promise<MutationResult>;
  netWorth: number;
  transactions: Transaction[];
  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateTransaction: (id: string, tx: Omit<Transaction, 'id'>) => Promise<MutationResult>;
  deleteTransaction: (id: string) => Promise<MutationResult>;
  approveTransaction: (id: string, date?: string) => Promise<MutationResult>;
  rejectTransaction: (id: string) => Promise<MutationResult>;
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
  sharedObligationTemplates: SharedObligationTemplate[];
  sharedTemplateResponsibilities: SharedTemplateResponsibility[];
  externalLoanContributions: ExternalLoanContribution[];
  loanPayoffPlans: LoanPayoffPlan[];
  loanPayoffResponsibilities: LoanPayoffResponsibility[];
  loanPayoffFundMovements: LoanPayoffFundMovement[];
  getReservedBalance: (accountId: string) => number;
  getSpendableBalance: (accountId: string) => number;
  getLoanPayoffPlanForLiability: (accountId: string) => LoanPayoffPlan | undefined;
  getLoanPayoffReservedForAccount: (liabilityAccountId: string, assetAccountId: string) => number;
  saveLoanPayoffPlan: (input: { id?: string; liabilityAccountId: string; targetAmount: number; targetDate: string; payoffType: LoanPayoffType; responsibilities: Array<{ personId: string; targetAmount: number }> }) => Promise<boolean>;
  reserveLoanPayoffFunds: (input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }) => Promise<boolean>;
  releaseLoanPayoffFunds: (input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }) => Promise<boolean>;
  cancelLoanPayoffPlan: (planId: string) => Promise<boolean>;
  completeLoanPayoffPlan: (planId: string) => Promise<boolean>;
  personalExpenseRecords: PersonalExpenseRecord[];
  addSharedPerson: (name: string, relationship?: string) => Promise<boolean>;
  archiveSharedPerson: (id: string) => Promise<boolean>;
  createSharedExpense: (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }>; repeatFrequency?: RecurrenceFrequency }) => Promise<boolean>;
  recordSharedPayment: (payment: Omit<SharedPayment, 'id'>) => Promise<boolean>;
  recordSharedSettlement: (settlement: Omit<SharedSettlement, 'id'>) => Promise<boolean>;
  configureLoanSharing: (accountId: string, personalResponsibilityPercent: number, contributions: Array<Omit<LoanContributionRule, 'id' | 'accountId'>>) => Promise<boolean>;
  settleSharedBalance: (input: { obligationId?: string; fromPersonId: string; toPersonId: string; amount: number; settledAt: string; accountId?: string }) => Promise<boolean>;
  recordExternalLoanPayment: (input: { accountId: string; personId: string; amount: number; paidAt: string }) => Promise<boolean>;
  setSharedTemplateActive: (templateId: string, isActive: boolean) => Promise<boolean>;
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
  addLoanRevision: (revision: Omit<LoanRevision, 'id'>) => Promise<MutationResult>;
  deleteLoanRevision: (id: string) => Promise<MutationResult>;
  creditCards: CreditCardInfo[];
  addCreditCard: (card: Omit<CreditCardInfo, 'id'>) => Promise<MutationResult>;
  updateCreditCard: (id: string, card: Omit<CreditCardInfo, 'id'>) => Promise<MutationResult>;
  payCreditCard: (cardId: string, amount: number, fromAccountId?: string) => Promise<MutationResult>;
  payLiability: (id: string, amount: number, principalAmount?: number, interestAmount?: number, fromAccountId?: string, useReservedFunds?: boolean) => Promise<MutationResult>;
  deleteCreditCard: (cardId: string) => Promise<MutationResult>;
  categories: Category[];
  events: Event[];
  createEvent: (name: string) => Promise<Event | null>;
  fetchEvents: () => Event[];
  groupTransactionsToEvent: (transactionIds: string[], eventId: string | null) => Promise<MutationResult>;
  addCategory: (category: Omit<Category, 'id'>) => Promise<MutationResult>;
  updateCategory: (id: string, category: Omit<Category, 'id'>) => Promise<MutationResult>;
  deleteCategory: (id: string) => Promise<MutationResult>;
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
  recoverySnapshotCount: number;
  restoreLatestRecoverySnapshot: () => Promise<boolean>;
  getStoredSetting: (key: string) => Promise<unknown>;
  setStoredSetting: (key: string, value: unknown) => Promise<void>;
  toast: { message: string; actionLabel?: string; onAction?: () => void } | null;
  showToast: (message: string, actionLabel?: string, onAction?: () => void) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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
  const [recoverySnapshotCount, setRecoverySnapshotCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  const pendingLiabilityPayments = useRef(new Set<string>());
  const undoRedoInFlight = useRef(false);
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
  const undoStackRef = useRef<UndoRedoCommand[]>([]);
  const redoStackRef = useRef<UndoRedoCommand[]>([]);

  const replaceUndoStack = (next: UndoRedoCommand[]) => {
    undoStackRef.current = next;
    setUndoStack(next);
  };

  const replaceRedoStack = (next: UndoRedoCommand[]) => {
    redoStackRef.current = next;
    setRedoStack(next);
  };

  const pushCommand = (cmd: UndoRedoCommand) => {
    const appended = [...undoStackRef.current, cmd];
    const next = appended.length > MAX_UNDO_HISTORY
      ? appended.slice(appended.length - MAX_UNDO_HISTORY)
      : appended;
    replaceUndoStack(next);
    replaceRedoStack([]);
  };

  const clearStacks = () => {
    replaceUndoStack([]);
    replaceRedoStack([]);
  };

  const executeCommand = async (cmd: UndoRedoCommand, isUndo: boolean): Promise<boolean> => {
    if (!dbDriver) return false;
    return persistDbAction(() => persistUndoRedoCommand(dbDriver, cmd, isUndo));
  };

  const clearActionToast = () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToast(null);
  };

  const handleUndo = () => {
    if (undoRedoInFlight.current) return;
    const currentUndo = undoStackRef.current;
    if (currentUndo.length === 0) return;
    const cmd = currentUndo[currentUndo.length - 1];
    undoRedoInFlight.current = true;
    void (async () => {
      try {
        const saved = await executeCommand(cmd, true);
        if (!saved) return;
        const latestUndo = undoStackRef.current;
        const commandIndex = latestUndo.lastIndexOf(cmd);
        if (commandIndex >= 0) {
          replaceUndoStack([...latestUndo.slice(0, commandIndex), ...latestUndo.slice(commandIndex + 1)]);
        }
        replaceRedoStack([cmd, ...redoStackRef.current]);
        clearActionToast();
      } finally {
        undoRedoInFlight.current = false;
      }
    })();
  };

  const handleRedo = () => {
    if (undoRedoInFlight.current) return;
    const currentRedo = redoStackRef.current;
    if (currentRedo.length === 0) return;
    const cmd = currentRedo[0];
    undoRedoInFlight.current = true;
    void (async () => {
      try {
        const saved = await executeCommand(cmd, false);
        if (!saved) return;
        const latestRedo = redoStackRef.current;
        const commandIndex = latestRedo.indexOf(cmd);
        if (commandIndex >= 0) {
          replaceRedoStack([...latestRedo.slice(0, commandIndex), ...latestRedo.slice(commandIndex + 1)]);
        }
        const appended = [...undoStackRef.current, cmd];
        replaceUndoStack(appended.length > MAX_UNDO_HISTORY
          ? appended.slice(appended.length - MAX_UNDO_HISTORY)
          : appended);
        clearActionToast();
      } finally {
        undoRedoInFlight.current = false;
      }
    })();
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
  const EMPTY_SHARED_FINANCE: SharedFinanceState = { people: [], obligations: [], responsibilities: [], payments: [], settlements: [], loanSharingRules: [], loanContributionRules: [], obligationTemplates: [], templateResponsibilities: [], externalLoanContributions: [] };
  const [sharedFinance, setSharedFinance] = useState<SharedFinanceState>(EMPTY_SHARED_FINANCE);
  const people = sharedFinance.people;
  const sharedObligations = sharedFinance.obligations;
  const sharedResponsibilities = sharedFinance.responsibilities;
  const sharedPayments = sharedFinance.payments;
  const sharedSettlements = sharedFinance.settlements;
  const loanSharingRules = sharedFinance.loanSharingRules;
  const loanContributionRules = sharedFinance.loanContributionRules;
  const sharedObligationTemplates = sharedFinance.obligationTemplates;
  const sharedTemplateResponsibilities = sharedFinance.templateResponsibilities;
  const externalLoanContributions = sharedFinance.externalLoanContributions;
  const EMPTY_LOAN_PAYOFF_STATE: LoanPayoffState = { plans: [], responsibilities: [], movements: [] };
  const [loanPayoffState, setLoanPayoffState] = useState<LoanPayoffState>(EMPTY_LOAN_PAYOFF_STATE);
  const loanPayoffPlans = loanPayoffState.plans;
  const loanPayoffResponsibilities = loanPayoffState.responsibilities;
  const loanPayoffFundMovements = loanPayoffState.movements;
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

  const getReservedBalance = useCallback((accountId: string) => getTrackedReservedForAccount(loanPayoffState.plans, loanPayoffState.movements, accountId), [loanPayoffState]);
  const getSpendableBalance = useCallback((accountId: string) => {
    const account = accounts.find(item => item.id === accountId);
    return account ? getSpendableAccountBalance(account, getReservedBalance(accountId)) : 0;
  }, [accounts, getReservedBalance]);
  const getLoanPayoffPlanForLiability = useCallback((accountId: string) => getActiveLoanPayoffPlan(loanPayoffState.plans, accountId), [loanPayoffState.plans]);
  const getLoanPayoffReservedForAccount = useCallback((liabilityAccountId: string, assetAccountId: string) => {
    const plan = getActiveLoanPayoffPlan(loanPayoffState.plans, liabilityAccountId);
    return plan ? getLoanPayoffTrackedReservedForAccount(plan.id, assetAccountId, loanPayoffState.movements) : 0;
  }, [loanPayoffState]);

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
    setAccountRecords(stripAccountBalances(applyLoanRevisionProjection(state.accounts, state.loanRevisions)));
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

  const refreshLoanPayoff = async (driver: SqlJsDatabaseDriver) => {
    setLoanPayoffState(await loadLoanPayoffState(driver));
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

  const restoreLatestRecoverySnapshot = async (): Promise<boolean> => {
    if (!dbDriver) return false;
    const snapshots = await listRecoverySnapshots();
    if (!snapshots.length) return false;
    await createRecoverySnapshot(dbDriver, 'restore');
    await restoreRecoverySnapshot(dbDriver, snapshots[0]);
    await refreshStateFromDatabase(dbDriver);
    await refreshSharedFinance(dbDriver);
    await refreshLoanPayoff(dbDriver);
    const settings = await loadAppSettings(dbDriver);
    setAffordabilitySettingsState(normalizeAffordabilitySettings(settings[AFFORDABILITY_SETTINGS_KEY]));
    setSavingsGoals(normalizeSavingsGoals(settings[SAVINGS_GOALS_KEY]));
    setRecoverySnapshotCount((await listRecoverySnapshots()).length);
    await verifyDataIntegrity();
    clearStacks();
    setLastUpdated(new Date().toISOString());
    return true;
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
      await runAtomicDatabaseAction(dbDriver, action);
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
      await runAtomicDatabaseAction(dbDriver, action);
      await refreshSharedFinance(dbDriver);
      return true;
    } catch (error) {
      console.error('Shared finance persistence failed:', error);
      await refreshSharedFinance(dbDriver).catch(() => undefined);
      window.alert(`Your shared-finance change was not saved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const persistLoanPayoffAction = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (!dbDriver) return false;
    try {
      await runAtomicDatabaseAction(dbDriver, action);
      await refreshLoanPayoff(dbDriver);
      return true;
    } catch (error) {
      console.error('Loan payoff persistence failed:', error);
      await refreshLoanPayoff(dbDriver).catch(() => undefined);
      window.alert(`Loan payoff change was not saved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const saveLoanPayoffPlan = (input: { id?: string; liabilityAccountId: string; targetAmount: number; targetDate: string; payoffType: LoanPayoffType; responsibilities: Array<{ personId: string; targetAmount: number }> }): Promise<boolean> =>
    persistLoanPayoffAction(() => saveLoanPayoffPlanRow(dbDriver!, input));
  const reserveLoanPayoffFunds = (input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }): Promise<boolean> =>
    persistLoanPayoffAction(() => reserveLoanPayoffFundsRow(dbDriver!, input));
  const releaseLoanPayoffFunds = (input: { planId: string; personId: string; holdingType: LoanPayoffHoldingType; assetAccountId?: string; amount: number }): Promise<boolean> =>
    persistLoanPayoffAction(() => releaseLoanPayoffFundsRow(dbDriver!, input));
  const cancelLoanPayoffPlan = (planId: string): Promise<boolean> => persistLoanPayoffAction(() => cancelLoanPayoffPlanRow(dbDriver!, planId));
  const completeLoanPayoffPlan = (planId: string): Promise<boolean> => persistLoanPayoffAction(() => completeLoanPayoffPlanRow(dbDriver!, planId));

  const addSharedPerson = async (name: string, relationship?: string): Promise<boolean> =>
    persistSharedAction(() => createSharedPersonRow(dbDriver!, { name, relationship }));

  const archiveSharedPerson = async (id: string): Promise<boolean> =>
    persistSharedAction(() => archiveSharedPersonRow(dbDriver!, id));

  const createSharedExpense = async (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }>; repeatFrequency?: RecurrenceFrequency }): Promise<boolean> => {
    if (!dbDriver) return false;
    const me = people.find(person => person.isSelf && !person.isArchived);
    if (!me) return false;
    const now = new Date().toISOString();
    const initialPayments: Array<Omit<SharedPayment, 'id' | 'obligationId'>> = [];
    if ((input.trackedPaymentAmount ?? 0) > 0) initialPayments.push({ personId: me.id, transactionId: input.transactionId, amount: input.trackedPaymentAmount!, source: 'TRACKED', paidAt: now });
    for (const payment of input.externalPayments ?? []) if (payment.amount > 0) initialPayments.push({ personId: payment.personId, amount: payment.amount, source: 'EXTERNAL', paidAt: now });
    return persistSharedAction(async () => {
      await dbDriver.execute('BEGIN TRANSACTION');
      try {
        await createSharedObligationRow(dbDriver, { title: input.title, kind: 'EXPENSE', totalAmount: input.totalAmount, categoryId: input.categoryId, dueDate: input.dueDate, transactionId: input.transactionId, settlementMode: 'TRACK' }, input.allocations, initialPayments, false);
        if (input.repeatFrequency) {
          const baseDate = input.dueDate || toLocalDateKey(new Date());
          await createSharedObligationTemplateRow(dbDriver, { title: input.title, totalAmount: input.totalAmount, categoryId: input.categoryId, frequency: input.repeatFrequency, nextDueDate: advanceRecurringDate(baseDate, input.repeatFrequency), settlementMode: 'TRACK' }, input.allocations, false);
        }
        await dbDriver.execute('COMMIT');
      } catch (error) {
        await dbDriver.execute('ROLLBACK');
        throw error;
      }
    });
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


  const settleSharedBalance = async (input: { obligationId?: string; fromPersonId: string; toPersonId: string; amount: number; settledAt: string; accountId?: string }): Promise<boolean> => {
    if (!dbDriver) return false;
    try {
      await addSharedSettlementWithBalanceAdjustment(dbDriver, input);
      await persistDatabase(dbDriver);
      await refreshStateFromDatabase(dbDriver);
      await refreshSharedFinance(dbDriver);
      return true;
    } catch (error) {
      console.error('Shared settlement failed:', error);
      window.alert(`Settlement was not saved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const recordExternalLoanPayment = async (input: { accountId: string; personId: string; amount: number; paidAt: string }): Promise<boolean> => {
    if (!dbDriver) return false;
    try {
      await runAtomicDatabaseAction(dbDriver, async () => {
        const contribution = await addExternalLoanContribution(dbDriver, input);
        await consumeExternalReservedForLoanPayment(dbDriver, {
          liabilityAccountId: input.accountId,
          personId: input.personId,
          amount: input.amount,
          externalLoanContributionId: contribution.id,
        });
      });
      await refreshStateFromDatabase(dbDriver);
      await refreshSharedFinance(dbDriver);
      await refreshLoanPayoff(dbDriver);
      return true;
    } catch (error) {
      console.error('External loan contribution failed:', error);
      window.alert(`External loan payment was not saved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };


  const setSharedTemplateActive = async (templateId: string, isActive: boolean): Promise<boolean> =>
    persistSharedAction(async () => {
      await setSharedObligationTemplateActive(dbDriver!, templateId, isActive);
      if (isActive) await generateDueSharedObligations(dbDriver!);
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
        await generateDueSharedObligations(driver);
        await refreshSharedFinance(driver);
        await refreshLoanPayoff(driver);
        const integrity = await auditDatabaseIntegrity(driver);
        if (integrity.hasCriticalIssues) setIntegrityWarning(`Data integrity warning: ${integrity.issues.filter(issue => issue.severity === 'error').length} critical issue(s) detected. Open Settings → Verify Data Integrity for details.`);
        const settings = await loadAppSettings(driver);
        if (settings.theme === 'light' || settings.theme === 'dark') setTheme(settings.theme);
        if (typeof settings.colorPalette === 'string') setColorPalette(settings.colorPalette);
        if (typeof settings.biometric === 'boolean') setBiometric(settings.biometric);
        if (typeof settings.passcode === 'string' || settings.passcode === null) {
          const storedPasscode = settings.passcode as string | null;
          if (storedPasscode && !isPasscodeHash(storedPasscode)) setPasscode(storedPasscode);
          else setPasscodeHash(storedPasscode);
        }
        const userConfig = await loadUserConfig(driver);
        setCurrency(userConfig.currency);
        setMonthCycleDay(userConfig.monthCycleDay);
        if (settings.profile && typeof settings.profile === 'object') setProfile(settings.profile as typeof profile);
        setAffordabilitySettingsState(normalizeAffordabilitySettings(settings[AFFORDABILITY_SETTINGS_KEY]));
        setSavingsGoals(normalizeSavingsGoals(settings[SAVINGS_GOALS_KEY]));
        setDbReady(true);
        setRecoverySnapshotCount((await listRecoverySnapshots()).length);
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
    existingTx?: Transaction,
    ignoreReservedFunds = false
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

    if (!ignoreReservedFunds && tx.is_verified !== 0 && (tx.type === 'expense' || tx.type === 'transfer')) {
      const sourceId = tx.type === 'transfer' ? tx.fromAccountId : (tx.fromAccountId || tx.account);
      const sourceAcc = sourceId ? effectiveAccounts.find(account => account.id === sourceId) : undefined;
      if (sourceAcc?.type === 'asset') {
        const reserved = getReservedBalance(sourceAcc.id);
        if (reserved > 0.009 && sourceAcc.balance - numAmount < reserved - 0.009) {
          const spendable = Math.max(0, sourceAcc.balance - reserved);
          return { valid: false, error: `${sourceAcc.name} has ${reserved.toFixed(2)} reserved for a loan payoff plan. Only ${spendable.toFixed(2)} is available for normal spending.` };
        }
      }
    }

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

  const updateTransaction = async (id: string, newTx: Omit<Transaction, 'id'>): Promise<MutationResult> => {
    const existingTx = transactions.find(t => t.id === id);
    if (!existingTx) return { success: false, error: 'Transaction could not be found.' };
    if (existingTx.isOpeningBalance) {
      throw new Error('Opening balances cannot be edited or deleted directly. Please update the starting balance in Account Settings.');
    }
    if (existingTx.transaction_type === 'BALANCE_ADJUSTMENT') {
      throw new Error('Balance adjustments are immutable. Delete the adjustment and reconcile again if a correction is needed.');
    }
    if (existingTx.type !== newTx.type) {
      throw new Error('Transaction type cannot be changed after creation. Please delete and recreate the transaction if needed.');
    }
    const validation = validateTransaction(newTx, accounts, existingTx);
    if (!validation.valid) return { success: false, error: validation.error };
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };

    const normalizedTx = { ...newTx, amount: Math.abs(Number(newTx.amount)) };
    const updatedTx: Transaction = { ...normalizedTx, id };
    const saved = await persistDbAction(() => updateTransactionRow(dbDriver, id, normalizedTx));
    if (!saved) return { success: false, error: 'The transaction update could not be saved.' };

    pushCommand({
      entityType: 'transaction',
      actionType: 'update',
      previousState: existingTx,
      newState: updatedTx,
    });
    return { success: true };
  };

  const deleteTransaction = async (id: string): Promise<MutationResult> => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return { success: false, error: 'Transaction could not be found.' };
    if (tx.isOpeningBalance) {
      throw new Error('Opening balances cannot be edited or deleted directly. Please update the starting balance in Account Settings.');
    }
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };

    const saved = await persistDbAction(() => deleteTransactionRow(dbDriver, id));
    if (!saved) return { success: false, error: 'The transaction could not be deleted.' };

    pushCommand({
      entityType: 'transaction',
      actionType: 'delete',
      previousState: tx,
      newState: null,
    });
    showToast('Transaction deleted', 'Undo', handleUndo);
    return { success: true };
  };

  const approveTransaction = async (id: string, userSelectedDate?: string): Promise<MutationResult> => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return { success: false, error: 'Scheduled transaction could not be found.' };
    if (tx.is_verified !== 0) return { success: true };
    return updateTransaction(id, {
      ...tx,
      date: userSelectedDate || tx.date,
      is_verified: 1,
    });
  };

  const rejectTransaction = (id: string): Promise<MutationResult> => deleteTransaction(id);

  const addLoanRevision = async (revision: Omit<LoanRevision, 'id'>): Promise<MutationResult> => {
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    if (!accounts.some(account => account.id === revision.accountId)) return { success: false, error: 'Loan account could not be found.' };
    const newRev: LoanRevision = { ...revision, id: crypto.randomUUID() };
    const saved = await persistDbAction(() => insertLoanRevisionRow(dbDriver, newRev));
    return saved ? { success: true } : { success: false, error: 'The loan revision could not be saved.' };
  };

  const deleteLoanRevision = async (id: string): Promise<MutationResult> => {
    const revision = loanRevisions.find(item => item.id === id);
    if (!revision) return { success: false, error: 'Loan revision could not be found.' };
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    const saved = await persistDbAction(() => deleteLoanRevisionRow(dbDriver, id));
    if (!saved) return { success: false, error: 'The loan revision could not be deleted.' };
    showToast('Loan revision deleted', 'Undo', () => {
      void persistDbAction(() => insertLoanRevisionRow(dbDriver, revision));
    });
    return { success: true };
  };

  const addCreditCard = async (card: Omit<CreditCardInfo, 'id'>): Promise<MutationResult> => {
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    const newId = crypto.randomUUID();
    const initialBalance = Math.max(0, Number(card.balance) || 0);
    const newCard: CreditCardInfo = { ...card, id: newId, balance: 0 };
    const newAccount: Account = { id: newId, name: card.name, type: 'liability', group: 'Credit Card', balance: 0, limit: card.limit };
    const openingTransactionId = initialBalance > 0 ? crypto.randomUUID() : undefined;
    const saved = await persistDbAction(() => insertCreditCardAccount(dbDriver, newAccount, newCard, initialBalance, openingTransactionId));
    return saved ? { success: true } : { success: false, error: 'The credit card could not be saved.' };
  };

  const updateCreditCard = async (id: string, card: Omit<CreditCardInfo, 'id'>): Promise<MutationResult> => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return { success: false, error: 'Credit card account could not be found.' };
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    if (card.limit < targetAccount.balance) {
      throw new Error('Credit limit cannot be lower than the current outstanding balance.');
    }

    const existingOpening = transactions.find(t =>
      (t.isOpeningBalance || t.category === '#opening' || t.transaction_type === 'OPENING_BALANCE') &&
      (t.account === id || t.toAccountId === id || t.fromAccountId === id)
    );
    const updatedCard: CreditCardInfo = { ...card, id, balance: 0 };
    const openingAmount = Math.max(0, Number(card.balance) || 0);
    let newOpeningTx: Transaction | null = null;
    if (!existingOpening && openingAmount > 0) {
      const now = new Date();
      newOpeningTx = {
        id: crypto.randomUUID(),
        title: 'Opening Balance',
        subtitle: `${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • Initial Debt`,
        amount: openingAmount,
        date: now.toISOString(),
        category: '#opening',
        icon: 'CreditCard',
        type: 'expense',
        account: id,
        fromAccountId: id,
        isOpeningBalance: true,
        transaction_type: 'OPENING_BALANCE',
      };
    }

    const saved = await persistDbAction(async () => {
      await updateAccountRow(dbDriver, { ...targetAccount, name: card.name, limit: card.limit, balance: 0 });
      if (existingOpening) {
        if (openingAmount > 0) await updateOpeningBalance(dbDriver, id, openingAmount);
        else await deleteTransactionRow(dbDriver, existingOpening.id);
      } else if (newOpeningTx) {
        await insertTransactionRow(dbDriver, newOpeningTx);
      }
      await updateCreditCardRow(dbDriver, updatedCard);
    });
    return saved ? { success: true } : { success: false, error: 'The credit card update could not be saved.' };
  };

  const addAccount = async (account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string; loanSharing?: LoanSharingSaveConfig } = {}): Promise<MutationResult> => {
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    const newId = crypto.randomUUID();
    const initialBalance = Math.max(0, Number(account.balance) || 0);
    const newAccount: Account = { ...account, id: newId, balance: 0 };
    let openingTx: Transaction | null = null;
    if (initialBalance > 0) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      openingTx = {
        id: crypto.randomUUID(),
        title: 'Opening Balance',
        subtitle: `${formattedDate} • ${account.type === 'asset' ? 'Initial Balance' : 'Initial Debt'}`,
        amount: initialBalance,
        date: now.toISOString(),
        category: '#opening',
        icon: 'Landmark',
        type: account.type === 'asset' ? 'income' : 'expense',
        account: newId,
        toAccountId: account.type === 'asset' ? newId : undefined,
        fromAccountId: account.type === 'liability' ? newId : undefined,
        isOpeningBalance: true,
        transaction_type: 'OPENING_BALANCE',
      };
    }

    const saved = await persistDbAction(async () => {
      await dbDriver.execute('BEGIN TRANSACTION');
      try {
        await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id, false);
        await syncInvestmentSipRecurringRule(dbDriver, newId, { ...newAccount, balance: initialBalance }, options.sipSourceAccountId);
        if (account.type === 'liability' && options.loanSharing) {
          await setLoanSharingRuleRow(dbDriver, { accountId: newId, personalResponsibilityPercent: options.loanSharing.personalResponsibilityPercent, isShared: options.loanSharing.isShared });
          await replaceLoanContributionRules(dbDriver, newId, options.loanSharing.isShared ? options.loanSharing.contributions : [], false);
        }
        await dbDriver.execute('COMMIT');
      } catch (error) {
        await dbDriver.execute('ROLLBACK');
        throw error;
      }
    });
    if (!saved) return { success: false, error: 'The account could not be saved.' };
    if (options.loanSharing) await refreshSharedFinance(dbDriver).catch(error => console.error('Unable to refresh loan sharing after account save:', error));

    const complexMetadata = account.group === 'Investment' || Boolean(options.loanSharing);
    if (complexMetadata) clearStacks();
    else pushCommand({ entityType: 'account', actionType: 'add', previousState: null, newState: { account: newAccount, openingTx } });
    return { success: true };
  };

  const updateAccount = async (id: string, account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string; loanSharing?: LoanSharingSaveConfig } = {}): Promise<MutationResult> => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return { success: false, error: 'Account could not be found.' };
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };

    if (targetAccount.type === 'liability' && account.type === 'liability' && account.limit !== targetAccount.limit) {
      const newLimit = Math.max(0, Number(account.limit ?? 0));
      if (newLimit < targetAccount.balance) {
        throw new Error(`Credit limit cannot be lower than the current outstanding balance of ${targetAccount.balance}.`);
      }
    }

    const existingOpening = transactions.find(t =>
      (t.isOpeningBalance || t.category === '#opening' || t.transaction_type === 'OPENING_BALANCE') &&
      (t.account === id || t.toAccountId === id || t.fromAccountId === id)
    ) ?? null;
    const openingAmount = Math.max(0, Number(account.balance) || 0);
    const mergedAccount: Account = {
      ...account,
      id,
      balance: 0,
      originalPrincipal: account.originalPrincipal || targetAccount.originalPrincipal || (account.type === 'liability' ? openingAmount : undefined),
    };
    let nextOpeningTx: Transaction | null = null;
    if (existingOpening && openingAmount > 0) {
      nextOpeningTx = { ...existingOpening, amount: openingAmount };
    } else if (!existingOpening && openingAmount > 0) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      nextOpeningTx = {
        id: crypto.randomUUID(),
        title: 'Opening Balance',
        subtitle: `${formattedDate} • ${account.type === 'asset' ? 'Initial Balance' : 'Initial Debt'}`,
        amount: openingAmount,
        date: now.toISOString(),
        category: '#opening',
        icon: account.type === 'asset' ? 'Landmark' : (account.group === 'Credit Card' ? 'CreditCard' : 'Building'),
        type: account.type === 'asset' ? 'income' : 'expense',
        account: id,
        toAccountId: account.type === 'asset' ? id : undefined,
        fromAccountId: account.type === 'liability' ? id : undefined,
        isOpeningBalance: true,
        transaction_type: 'OPENING_BALANCE',
      };
    }

    const saved = await persistDbAction(async () => {
      await updateAccountRow(dbDriver, mergedAccount);
      if (existingOpening) {
        if (openingAmount > 0) await updateOpeningBalance(dbDriver, id, openingAmount);
        else await deleteTransactionRow(dbDriver, existingOpening.id);
      } else if (nextOpeningTx) {
        await insertTransactionRow(dbDriver, nextOpeningTx);
      }
      await syncInvestmentSipRecurringRule(dbDriver, id, { ...mergedAccount, balance: openingAmount }, options.sipSourceAccountId);
      if (account.type === 'liability' && options.loanSharing) {
        await setLoanSharingRuleRow(dbDriver, { accountId: id, personalResponsibilityPercent: options.loanSharing.personalResponsibilityPercent, isShared: options.loanSharing.isShared });
        await replaceLoanContributionRules(dbDriver, id, options.loanSharing.isShared ? options.loanSharing.contributions : []);
      }
    });
    if (!saved) return { success: false, error: 'The account update could not be saved.' };
    if (options.loanSharing) await refreshSharedFinance(dbDriver).catch(error => console.error('Unable to refresh loan sharing after account update:', error));

    const complexMetadata = targetAccount.group === 'Investment' || account.group === 'Investment' || Boolean(options.loanSharing) || loanSharingRules.some(rule => rule.accountId === id);
    if (complexMetadata) clearStacks();
    else pushCommand({
      entityType: 'account',
      actionType: 'update',
      previousState: { account: targetAccount, openingTx: existingOpening },
      newState: { account: mergedAccount, openingTx: nextOpeningTx },
    });
    return { success: true };
  };

  const deleteAccount = async (id: string): Promise<MutationResult> => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return { success: false, error: 'Account could not be found.' };
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };

    const openingTransactions = transactions.filter(transaction =>
      (transaction.isOpeningBalance || transaction.category === '#opening' || transaction.transaction_type === 'OPENING_BALANCE') &&
      (transaction.account === id || transaction.toAccountId === id || transaction.fromAccountId === id)
    );
    const relatedCard = creditCards.find(card => card.id === id);
    const hasHistory = transactions.some(transaction => {
      const isOpening = transaction.isOpeningBalance || transaction.category === '#opening' || transaction.transaction_type === 'OPENING_BALANCE';
      if (isOpening) return false;
      return transaction.account === id || transaction.fromAccountId === id || transaction.toAccountId === id;
    });
    if (hasHistory && Math.abs(targetAccount.balance) > 0.0001) {
      throw new Error('Account must have a zero balance before closing. Please transfer funds or log an expense.');
    }

    const hasComplexMetadata = targetAccount.group === 'Investment' || loanSharingRules.some(rule => rule.accountId === id);
    const saved = await persistDbAction(async () => {
      if (!hasHistory && targetAccount.group === 'Investment' && targetAccount.investmentMethod === 'SIP') {
        await syncInvestmentSipRecurringRule(dbDriver, id, { ...targetAccount, investmentMethod: 'Lump Sum', monthlySIPAmount: 0 }, undefined);
      }
      await deleteAccountInDB(dbDriver, id);
      if (hasHistory && relatedCard) await deleteCreditCardRow(dbDriver, id);
    });
    if (!saved) return { success: false, error: 'The account could not be deleted.' };

    clearStacks();
    if (!hasHistory && hasComplexMetadata) {
      showToast('Account deleted');
      return { success: true };
    }

    showToast(hasHistory ? 'Account archived' : 'Account deleted', 'Undo', () => {
      void (async () => {
        if (hasHistory) {
          await persistDbAction(async () => {
            await updateAccountRow(dbDriver, { ...targetAccount, is_archived: 0, balance: 0 });
            if (relatedCard) await insertCreditCardRow(dbDriver, relatedCard);
          });
          return;
        }
        await persistDbAction(async () => {
          await dbDriver.execute('BEGIN TRANSACTION');
          try {
            await insertAccountRow(dbDriver, { ...targetAccount, balance: 0 }, 0, undefined, false);
            for (const transaction of openingTransactions) await insertTransactionRow(dbDriver, transaction);
            if (relatedCard) await insertCreditCardRow(dbDriver, relatedCard);
            await dbDriver.execute('COMMIT');
          } catch (error) {
            await dbDriver.execute('ROLLBACK');
            throw error;
          }
        });
      })();
    });
    return { success: true };
  };

  const transferFunds = (amount: number, fromId: string, toId: string): Promise<MutationResult> => {
    const fromAccount = accounts.find(a => a.id === fromId);
    const toAccount = accounts.find(a => a.id === toId);
    return addTransaction({
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

  const payCreditCard = (cardId: string, amount: number, fromAccountId?: string): Promise<MutationResult> => {
    const defaultAsset = fromAccountId || accounts.find(a => a.type === 'asset')?.id || 'checking';
    return transferFunds(amount, defaultAsset, cardId);
  };

  const payLiability = async (id: string, amount: number, principalAmount?: number, interestAmount?: number, fromAccountId?: string, useReservedFunds = false): Promise<MutationResult> => {
    if (pendingLiabilityPayments.current.has(id)) return { success: false, error: 'A payment for this liability is already being saved.' };
    pendingLiabilityPayments.current.add(id);
    try {
      if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
      const defaultAsset = fromAccountId || accounts.find(a => a.type === 'asset')?.id || 'checking';
      const liabilityAcc = accounts.find(a => a.id === id);
      if (!liabilityAcc) return { success: false, error: 'Liability account could not be found.' };

      let pAmount = principalAmount;
      let iAmount = interestAmount;
      if (pAmount === undefined || iAmount === undefined) {
        if (liabilityAcc.group === 'Bank Loan' || liabilityAcc.group === 'Loan' || liabilityAcc.group === 'Mortgage' || liabilityAcc.group === 'Interest-Only Loan' || liabilityAcc.interestRate !== undefined || liabilityAcc.monthlyEMI !== undefined) {
          const split = calculateEmiSplit(liabilityAcc.balance, liabilityAcc.interestRate ?? 0, amount, liabilityAcc.interestCalculationType || 'REDUCING');
          pAmount = split.principalAmount;
          iAmount = split.interestAmount;
        } else { pAmount = amount; iAmount = 0; }
      }

      const principal = Math.max(0, Number(pAmount ?? 0));
      const interest = Math.max(0, Number(iAmount ?? 0));
      const totalPayment = principal + interest;
      if (!Number.isFinite(principal) || !Number.isFinite(interest) || totalPayment <= 0) return { success: false, error: 'Payment amount must be a positive number.' };

      const sourceAccount = accounts.find(account => account.id === defaultAsset);
      if (!sourceAccount) return { success: false, error: 'Payment source account could not be found.' };
      const reservedForThisLoan = useReservedFunds ? getLoanPayoffReservedForAccount(id, defaultAsset) : 0;
      const allReserved = getReservedBalance(defaultAsset);
      const protectedOtherReserves = Math.max(0, allReserved - reservedForThisLoan);
      if (sourceAccount.type === 'asset' && sourceAccount.balance - totalPayment < protectedOtherReserves - 0.009) {
        const allowed = Math.max(0, sourceAccount.balance - protectedOtherReserves);
        return { success: false, error: `Only ${allowed.toFixed(2)} is available from ${sourceAccount.name} after protecting other reserved funds.` };
      }

      const now = new Date();
      const subtitle = `Today • ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const paymentTransactions: Transaction[] = [];
      if (principal > 0) {
        const principalTx: Transaction = { id: crypto.randomUUID(), title: `Transfer: ${sourceAccount.name} to ${liabilityAcc.name}`, subtitle, amount: principal, date: now.toISOString(), category: '#transfer', icon: 'ArrowRightLeft', type: 'transfer', fromAccountId: defaultAsset, toAccountId: id };
        const validation = validateTransaction(principalTx, accounts, undefined, true);
        if (!validation.valid) return { success: false, error: validation.error || 'The principal payment is invalid.' };
        paymentTransactions.push(principalTx);
      }
      if (interest > 0) {
        const interestTx: Transaction = { id: crypto.randomUUID(), title: `Interest Payment: ${liabilityAcc.name}`, subtitle, amount: interest, date: now.toISOString(), category: '#interest', icon: 'Flame', type: 'expense', fromAccountId: defaultAsset, account: id, toAccountId: id, isInterestOnly: true };
        const validation = validateTransaction(interestTx, accounts, undefined, true);
        if (!validation.valid) return { success: false, error: validation.error || 'The interest payment is invalid.' };
        paymentTransactions.push(interestTx);
      }

      let consumedReserved = 0;
      const saved = await persistDbAction(async () => {
        await insertLiabilityPaymentRows(dbDriver, paymentTransactions);
        if (useReservedFunds) consumedReserved = await consumeTrackedReservedForLoanPayment(dbDriver, { liabilityAccountId: id, assetAccountId: defaultAsset, amount: totalPayment, transactionId: paymentTransactions[0]?.id });
      });
      if (!saved) return { success: false, error: 'The liability payment could not be saved.' };
      if (consumedReserved > 0.009) {
        await refreshLoanPayoff(dbDriver);
        clearStacks();
      } else {
        pushCommand({ entityType: 'transactionBatch', actionType: 'add', previousState: null, newState: paymentTransactions });
      }
      return { success: true };
    } finally { pendingLiabilityPayments.current.delete(id); }
  };

  const deleteCreditCard = async (cardId: string): Promise<MutationResult> => {
    const card = creditCards.find(item => item.id === cardId);
    if (!card) return { success: false, error: 'Credit card could not be found.' };
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    const saved = await persistDbAction(() => deleteCreditCardRow(dbDriver, cardId));
    if (!saved) return { success: false, error: 'The credit card could not be removed.' };
    showToast('Credit card removed', 'Undo', () => { void persistDbAction(() => insertCreditCardRow(dbDriver, card)); });
    return { success: true };
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

  const addCategory = async (category: Omit<Category, 'id'>): Promise<MutationResult> => {
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    const newCategory: Category = ensureCategoryAffordabilityClass({ ...category, id: crypto.randomUUID() });
    const saved = await persistDbAction(() => insertCategoryRow(dbDriver, newCategory));
    return saved ? { success: true } : { success: false, error: 'The category could not be saved.' };
  };

  const updateCategory = async (id: string, category: Omit<Category, 'id'>): Promise<MutationResult> => {
    if (!categories.some(item => item.id === id)) return { success: false, error: 'Category could not be found.' };
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    const normalizedCategory: Category = ensureCategoryAffordabilityClass({ ...category, id });
    const saved = await persistDbAction(() => updateCategoryRow(dbDriver, id, normalizedCategory));
    return saved ? { success: true } : { success: false, error: 'The category update could not be saved.' };
  };

  const createEvent = async (name: string): Promise<Event | null> => {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Event name is required.');
    const existing = events.find(event => event.name.localeCompare(normalizedName, undefined, { sensitivity: 'accent' }) === 0);
    if (existing) return existing;
    if (!dbDriver) return null;
    const event: Event = { id: crypto.randomUUID(), name: normalizedName, createdAt: new Date().toISOString() };
    const saved = await persistDbAction(() => insertEventRow(dbDriver, event));
    return saved ? event : null;
  };

  const fetchEvents = () => events;

  const groupTransactionsToEvent = async (transactionIds: string[], eventId: string | null): Promise<MutationResult> => {
    const ids = transactionIds.filter(id => {
      const transaction = transactions.find(item => item.id === id);
      return Boolean(transaction && (eventId === null || isEventAssignableTransaction(transaction)));
    });
    if (!ids.length) return { success: false, error: 'No eligible transactions were selected.' };
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    const saved = await persistDbAction(() => updateTransactionEvents(dbDriver, ids, eventId));
    return saved ? { success: true } : { success: false, error: 'The event assignment could not be saved.' };
  };

  const deleteCategory = async (id: string): Promise<MutationResult> => {
    const category = categories.find(item => item.id === id);
    if (!category) return { success: false, error: 'Category could not be found.' };
    if (!dbDriver) return { success: false, error: 'The local ledger is still loading. Please try again in a moment.' };
    const saved = await persistDbAction(() => deleteCategoryRow(dbDriver, id));
    if (!saved) return { success: false, error: 'The category could not be deleted.' };
    showToast('Category deleted', 'Undo', () => { void persistDbAction(() => insertCategoryRow(dbDriver, category)); });
    return { success: true };
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
      await createRecoverySnapshot(dbDriver, 'clear');
        setRecoverySnapshotCount((await listRecoverySnapshots()).length);
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
    setLoanPayoffState(EMPTY_LOAN_PAYOFF_STATE);
    setAffordabilitySettingsState({ ...DEFAULT_AFFORDABILITY_SETTINGS });
    setIntegrityWarning(null);
    clearStacks();
    setLastUpdated(new Date().toISOString());
  };

  const importLedgerData = async (data: LedgerImportData) => {
    const validationError = validateLedgerImport(data);
    if (validationError) throw new Error(validationError);
    if (dbDriver) {
      await createRecoverySnapshot(dbDriver, 'restore');
      setRecoverySnapshotCount((await listRecoverySnapshots()).length);
      const imported = await persistDbAction(async () => {
        await importLedgerToDatabase(dbDriver, data, { skipValidation: true });
      });
      if (!imported) {
        throw new Error('Import failed. Your existing ledger was left unchanged.');
      }
      const refreshed = await loadStateFromDatabase(dbDriver);
      setStateFromDbState(refreshed);
      await ensureSelfPerson(dbDriver, 'Me');
      await refreshSharedFinance(dbDriver);
      await refreshLoanPayoff(dbDriver);
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
      const importedLoanRevisions = Array.isArray(data.loanRevisions) ? data.loanRevisions : [];
      if (data.accounts && Array.isArray(data.accounts)) setAccountRecords(stripAccountBalances(applyLoanRevisionProjection(data.accounts, importedLoanRevisions)));
      if (data.transactions && Array.isArray(data.transactions)) setTransactions(data.transactions);
      if (data.categories && Array.isArray(data.categories)) setCategories(data.categories);
      if (data.events && Array.isArray(data.events)) setEvents(data.events);
      if (data.creditCards && Array.isArray(data.creditCards)) setCreditCardRecords(stripCardBalances(data.creditCards));
      if (data.widgets && Array.isArray(data.widgets)) setWidgets(data.widgets);
      if (data.loanRevisions && Array.isArray(data.loanRevisions)) setLoanRevisions(importedLoanRevisions);
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
    schemaVersion: 'coinbuddy-ledger-v6',
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
    sharedObligationTemplates,
    sharedTemplateResponsibilities,
    externalLoanContributions,
    loanPayoffPlans,
    loanPayoffResponsibilities,
    loanPayoffFundMovements,
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
      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, sharedObligationTemplates, sharedTemplateResponsibilities, externalLoanContributions,
      loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements, getReservedBalance, getSpendableBalance, getLoanPayoffPlanForLiability, getLoanPayoffReservedForAccount, saveLoanPayoffPlan, reserveLoanPayoffFunds, releaseLoanPayoffFunds, cancelLoanPayoffPlan, completeLoanPayoffPlan, personalExpenseRecords, addSharedPerson, archiveSharedPerson, createSharedExpense, recordSharedPayment, recordSharedSettlement, configureLoanSharing, settleSharedBalance, recordExternalLoanPayment, setSharedTemplateActive,
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
      clearAllData, resetToDemoData, integrityWarning, dismissIntegrityWarning: () => setIntegrityWarning(null), verifyDataIntegrity, repairDataIntegrityIssues, recoverySnapshotCount, restoreLatestRecoverySnapshot, getStoredSetting, setStoredSetting, toast, showToast
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
