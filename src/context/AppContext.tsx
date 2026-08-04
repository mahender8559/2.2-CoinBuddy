import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import { Transaction, CreditCardInfo, Category, Account, Widget, LoanRevision } from '../types';
import { calculateEmiSplit, getOriginalPrincipal, getTotalInterestPaid } from '../utils/emi';
import { recomputeAllAccountBalances, syncCreditCardsWithAccounts as projectCreditCards } from '../utils/balanceManager';
import {
  initializeDatabase,
  persistDatabase,
  deletePersistedDatabase,
  loadStateFromDatabase,
  seedDemoData,
  insertAccountRow,
  insertCreditCardAccount,
  updateAccountRow,
  insertTransactionRow,
  updateTransactionRow,
  deleteTransactionRow,
  insertCategoryRow,
  updateCategoryRow,
  deleteCategoryRow,
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
  createRecurringRule,
  generateDueRecurringTransactions,
  SqlJsDatabaseDriver,
} from '../db/dbClient';
import { auditDatabaseIntegrity, deleteAccountInDB, updateOpeningBalance } from '../db/sqliteSchema';
import { isSafeMathError, safeCompute, SAFE_MATH_ERRORS, getSafeNumericValue } from '../utils/safeMath';
import { hashPasscode, verifyPasscode as verifyPasscodeHash } from '../utils/passcode';
import { createDefaultCategories } from '../constants/defaultCategories';

export type UndoRedoCommand = {
  entityType: 'account' | 'transaction';
  actionType: 'add' | 'update' | 'delete';
  previousState: any;
  newState: any;
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
  formatCurrency: (amount: number | string) => string;
  getCurrencySymbol: () => string;
  getAccountBalance: (accountId: string) => number;
  accounts: Account[];
  calculateEmiSplit?: (balance: number, annualRate: number, emi: number) => { interestAmount: number; principalAmount: number };
  addAccount: (account: Omit<Account, 'id'>) => void;
  updateAccount: (id: string, account: Omit<Account, 'id'>) => void;
  deleteAccount: (id: string) => void;
  editingAccount: Account | null;
  setEditingAccount: (account: Account | null) => void;
  editingCreditCard: CreditCardInfo | null;
  setEditingCreditCard: (card: CreditCardInfo | null) => void;
  transferFunds: (amount: number, fromId: string, toId: string) => void;
  netWorth: number;
  transactions: Transaction[];
  addTransaction: (tx: Omit<Transaction, 'id'>) => { success: boolean; error?: string };
  updateTransaction: (id: string, tx: Omit<Transaction, 'id'>) => { success: boolean; error?: string };
  deleteTransaction: (id: string) => void;
  approveTransaction: (id: string, date?: string) => void;
  rejectTransaction: (id: string) => void;
  editingTransaction: Transaction | null;
  setEditingTransaction: (tx: Transaction | null) => void;
  autoRecur: boolean;
  setAutoRecur: (val: boolean) => void;
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
  importLedgerData: (data: any) => void;
  clearAllData: () => void;
  resetToDemoData: () => void;
  integrityWarning: string | null;
  dismissIntegrityWarning: () => void;
  verifyDataIntegrity: () => Promise<boolean>;
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
  const [autoRecur, setAutoRecur] = useState(true);
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

  const executeCommand = (cmd: UndoRedoCommand, isUndo: boolean) => {
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
        const tx = isUndo ? newState : previousState;
        nextTxs = nextTxs.filter(t => t.id !== tx.id);
      } else if (targetAction === 'update') {
        nextTxs = nextTxs.map(t => t.id === txToApply.id ? txToApply : t);
      }
    } else if (entityType === 'account') {
      if (targetAction === 'add') {
         const { account, openingTx } = targetState;
         nextAccs = [account, ...nextAccs.filter(a => a.id !== account.id)];
         if (openingTx) nextTxs = [openingTx, ...nextTxs.filter(t => t.id !== openingTx.id)];
      } else if (targetAction === 'delete') {
         const { account, openingTx } = isUndo ? newState : previousState;
         nextAccs = nextAccs.filter(a => a.id !== account.id);
         if (openingTx) nextTxs = nextTxs.filter(t => t.id !== openingTx.id);
      } else if (targetAction === 'update') {
         const { account, openingTx } = targetState;
         nextAccs = nextAccs.map(a => a.id === account.id ? account : a);
         if (openingTx) {
            nextTxs = nextTxs.map(t => t.id === openingTx.id ? openingTx : t);
         }
      }
    }

    // Recompute all account balances dynamically from scratch using the filtered transaction array
    nextAccs = recomputeAllAccountBalances(nextAccs, nextTxs);
    const nextCards = projectCreditCards(nextAccs, creditCards);

    setTransactions(nextTxs);
    setAccountRecords(stripAccountBalances(nextAccs));
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
    accounts.filter(a => a.type === 'liability' && !a.is_archived).reduce((sum, a) => sum + getSafeNumericValue(a.balance), 0),
    SAFE_MATH_ERRORS.DRIFT
  );
  const totalLiabilities = typeof totalLiabilitiesRes === 'number' ? totalLiabilitiesRes : 0;
  const netWorthRes = safeCompute(() => totalAssets - totalLiabilities, SAFE_MATH_ERRORS.DRIFT);
  const netWorth = typeof netWorthRes === 'number' ? netWorthRes : (netWorthRes as any);
  const getAccountBalance = (accountId: string) => accounts.find(a => a.id === accountId)?.balance ?? 0;

  const [categories, setCategories] = useState<Category[]>([]);

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const addWidget = (widget: Omit<Widget, 'id'>) => { const newWidget: Widget = { ...widget, id: crypto.randomUUID() }; setWidgets([...widgets, newWidget]); if (dbDriver) { insertWidgetRow(dbDriver, newWidget).then(() => persistDatabase(dbDriver)).catch(console.error); } };
  const removeWidget = (id: string) => { setWidgets(widgets.filter(w => w.id !== id)); if (dbDriver) { deleteWidgetRow(dbDriver, id).then(() => persistDatabase(dbDriver)).catch(console.error); } };

  const [loanRevisions, setLoanRevisions] = useState<LoanRevision[]>([]);

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [monthCycleDay, setMonthCycleDay] = useState(25);

  const getCycleDetails = (dateString: string) => {
    const txDate = new Date(dateString);
    let year = txDate.getFullYear();
    let month = txDate.getMonth();
    let day = txDate.getDate();
    
    if (day >= monthCycleDay && monthCycleDay > 1) {
      month += 1;
      if (month > 11) {
        month = 0;
        year++;
      }
    }
    return { month, year, key: `${year}-${month}` };
  };

  const isDateInCurrentCycle = (dateString: string) => {
    const current = getCycleDetails(new Date().toISOString());
    const txDetails = getCycleDetails(dateString);
    return current.key === txDetails.key;
  };

  const setStateFromDbState = (state: {
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    creditCards: CreditCardInfo[];
    widgets: Widget[];
    loanRevisions: LoanRevision[];
  }) => {
    setAccountRecords(stripAccountBalances(state.accounts));
    setTransactions(state.transactions);
    setCategories(state.categories);
    setCreditCardRecords(stripCardBalances(state.creditCards));
    setWidgets(state.widgets);
    setLoanRevisions(state.loanRevisions);
  };

  const refreshStateFromDatabase = async (driver: SqlJsDatabaseDriver) => {
    const state = await loadStateFromDatabase(driver);
    setStateFromDbState(state);
  };

  const verifyDataIntegrity = async (): Promise<boolean> => {
    if (!dbDriver) return false;
    const result = await auditDatabaseIntegrity(dbDriver);
    const message = result.mismatches.length || !result.isNetWorthAccurate
      ? 'Ledger integrity warning: one or more balances do not match the transaction ledger.'
      : null;
    setIntegrityWarning(message);
    return !message;
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

  useEffect(() => {
    let mounted = true;
    initializeDatabase()
      .then(async (driver) => {
        if (!mounted) return;
        setDbDriver(driver);
        const row = (await driver.query(`SELECT COUNT(*) as count FROM accounts;`))[0] || { count: 0 };
        const count = Number(row.count ?? 0);
        if (count === 0) {
          await seedDemoData(driver);
          await persistDatabase(driver);
        }
        await refreshStateFromDatabase(driver);
        const integrity = await auditDatabaseIntegrity(driver);
        if (integrity.mismatches.length || !integrity.isNetWorthAccurate) setIntegrityWarning('Ledger integrity warning: one or more balances do not match the transaction ledger.');
        const settings = await loadAppSettings(driver);
        if (settings.theme === 'light' || settings.theme === 'dark') setTheme(settings.theme);
        if (typeof settings.colorPalette === 'string') setColorPalette(settings.colorPalette);
        if (typeof settings.currency === 'string') setCurrency(settings.currency);
        if (typeof settings.autoRecur === 'boolean') setAutoRecur(settings.autoRecur);
        if (typeof settings.biometric === 'boolean') setBiometric(settings.biometric);
        if (typeof settings.passcode === 'string' || settings.passcode === null) {
          const storedPasscode = settings.passcode as string | null;
          if (storedPasscode && !storedPasscode.startsWith('sha256:')) setPasscode(storedPasscode);
          else setPasscodeHash(storedPasscode);
        }
        if (typeof settings.monthCycleDay === 'number') setMonthCycleDay(settings.monthCycleDay);
        if (settings.profile && typeof settings.profile === 'object') setProfile(settings.profile as typeof profile);
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
        persistAppSetting('currency', currency),
        persistAppSetting('autoRecur', autoRecur),
        persistAppSetting('biometric', biometric),
        persistAppSetting('passcode', passcode),
        persistAppSetting('monthCycleDay', monthCycleDay),
        persistAppSetting('profile', profile),
      ]);
    }
  }, [theme, colorPalette, currency, autoRecur, biometric, passcode, monthCycleDay, profile, dbReady, dbDriver]);

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
    void persistDbAction(() => generateDueRecurringTransactions(dbDriver, autoRecur));
  }, [dbDriver, dbReady, autoRecur]);

  const validateTransaction = (
    tx: Omit<Transaction, 'id'>, 
    currentAccounts: Account[], 
    existingTx?: Transaction
  ): { valid: boolean; error?: string } => {
    const numAmount = Math.abs(Number(tx.amount));

    if (isNaN(numAmount) || numAmount <= 0) {
      return { valid: false, error: 'Transaction amount must strictly be a positive number (> 0).' };
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

    if (tx.type === 'expense') {
      const sourceId = tx.fromAccountId || tx.account || 'cash';
      const sourceAcc = effectiveAccounts.find(a => a.id === sourceId);
      if (sourceAcc) {
        if (sourceAcc.type === 'asset') {
          if (numAmount > sourceAcc.balance) {
            return { 
              valid: false, 
              error: `Insufficient funds in ${sourceAcc.name}. Asset balance cannot drop below 0.` 
            };
          }
        } else if (sourceAcc.type === 'liability') {
          const limit = sourceAcc.limit;
          if (limit !== undefined && limit > 0) {
            if ((sourceAcc.balance + numAmount) > limit) {
              return {
                valid: false,
                error: `Credit limit exceeded for ${sourceAcc.name}. New balance would exceed credit limit of ${limit}.`
              };
            }
          }
        }
      }
    } else if (tx.type === 'transfer') {
      const sourceId = tx.fromAccountId;
      const sourceAcc = effectiveAccounts.find(a => a.id === sourceId);
      if (sourceAcc) {
        if (sourceAcc.type === 'asset') {
          if (numAmount > sourceAcc.balance) {
            return { 
              valid: false, 
              error: `Insufficient funds in ${sourceAcc.name}. Asset balance cannot drop below 0.` 
            };
          }
        } else if (sourceAcc.type === 'liability') {
          const limit = sourceAcc.limit;
          if (limit !== undefined && limit > 0) {
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

  const addTransaction = (tx: Omit<Transaction, 'id'>): { success: boolean; error?: string } => {
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

  const updateTransaction = (id: string, newTx: Omit<Transaction, 'id'>): { success: boolean; error?: string } => {
    const existingTx = transactions.find(t => t.id === id);
    if (existingTx?.isOpeningBalance) {
      throw new Error('Opening balances cannot be edited or deleted directly. Please update the starting balance in Account Settings.');
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

  const approveTransaction = (id: string, userSelectedDate?: string) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx || tx.is_verified !== 0) return;
    
    updateTransaction(id, {
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

  const addAccount = (account: Omit<Account, 'id'>) => {
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
        await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id);
      });
    }
  };

    const updateAccount = (id: string, account: Omit<Account, 'id'>) => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return;

    const existingTxIndex = transactions.findIndex(t => 
      (t.isOpeningBalance || t.category === '#opening' || (t as any).transaction_type === 'OPENING_BALANCE') &&
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
        });
      }
    }
  };

  const deleteAccount = (id: string) => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return;
    clearStacks();

    if (dbDriver) {
      persistDbAction(async () => {
        await deleteAccountInDB(dbDriver, id);
      });
    }

    const hasHistory = transactions.some(t => {
      const isOpening = t.isOpeningBalance || t.category === '#opening' || (t as any).transaction_type === 'OPENING_BALANCE';
      if (isOpening) return false;

      const isInvolved = t.account === id || t.fromAccountId === id || t.toAccountId === id;
      return isInvolved;
    });

    if (!hasHistory) {
      setTransactions(prev => prev.filter(t => !(
        (t.isOpeningBalance || t.category === '#opening' || (t as any).transaction_type === 'OPENING_BALANCE') &&
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
  };

  const transferFunds = (amount: number, fromId: string, toId: string) => {
    const fromAccount = accounts.find(a => a.id === fromId);
    const toAccount = accounts.find(a => a.id === toId);

    addTransaction({
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
      addTransaction({
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

  const addCategory = (category: Omit<Category, 'id'>) => {
    const newCategory = { ...category, id: crypto.randomUUID() };
    setCategories(prev => [newCategory, ...prev]);
    if (dbDriver) {
      persistDbAction(() => insertCategoryRow(dbDriver, newCategory));
    }
  };

  const updateCategory = (id: string, category: Omit<Category, 'id'>) => {
    setCategories(cats => cats.map(c => c.id === id ? { ...c, ...category } : c));
    if (dbDriver) {
      persistDbAction(() => updateCategoryRow(dbDriver, id, category as Category));
    }
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

  const clearAllData = () => {
    const defaultCats = createDefaultCategories();
    const defaultProf = {
      name: 'Financial Sovereign',
      email: 'sovereign@vault.vellum',
      avatar: '',
      offlineReady: true
    };

    setTransactions([]);
    setCreditCardRecords([]);
    setAccountRecords([]);
    setWidgets([]);
    setPasscode(null);
    setBiometric(false);
    setProfile(defaultProf);
    setCategories(defaultCats);

    if (dbDriver) {
      persistDbAction(async () => {
        await clearDatabase(dbDriver);
        for (const category of defaultCats) {
          await insertCategoryRow(dbDriver, category);
        }
      });
    }
  };

  const importLedgerData = async (data: any) => {
    const validationError = validateLedgerImport(data);
    if (validationError) throw new Error(validationError);
    if (dbDriver) {
      persistDbAction(async () => {
        await importLedgerToDatabase(dbDriver, data);
      });
      const refreshed = await loadStateFromDatabase(dbDriver);
      setAccountRecords(stripAccountBalances(refreshed.accounts));
      setTransactions(refreshed.transactions);
      setCategories(refreshed.categories);
      setCreditCardRecords(stripCardBalances(refreshed.creditCards));
      setWidgets(refreshed.widgets);
      setLoanRevisions(refreshed.loanRevisions);
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
      if (data.creditCards && Array.isArray(data.creditCards)) setCreditCardRecords(stripCardBalances(data.creditCards));
      if (data.widgets && Array.isArray(data.widgets)) setWidgets(data.widgets);
      if (data.loanRevisions && Array.isArray(data.loanRevisions)) setLoanRevisions(data.loanRevisions);
    }

    if (data.currency) setCurrency(data.currency);
    clearStacks();
    setLastUpdated(new Date().toISOString());
  };

  const exportLedgerData = () => ({
    schemaVersion: 'coinbuddy-ledger-v3',
    exportedAt: new Date().toISOString(),
    accounts,
    transactions,
    categories,
    creditCards,
    widgets,
    loanRevisions,
    currency,
  });

  const resetToDemoData = () => {
    void deletePersistedDatabase().finally(() => window.location.reload());
  };

  return (
    <AppContext.Provider value={{
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      handleUndo,
      handleRedo,
      theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, formatCurrency, getCurrencySymbol, 
      accounts, calculateEmiSplit, addAccount, updateAccount, deleteAccount, editingAccount, setEditingAccount, editingCreditCard, setEditingCreditCard, transferFunds, netWorth,
      widgets, addWidget, removeWidget,
      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, 
      biometric, setBiometric, passcode, setPasscode, verifyPasscode, isUnlocked, setUnlocked, isAddModalOpen, setAddModalOpen, isOnboardingOpen, setOnboardingOpen, isButtonTourOpen, setButtonTourOpen,
      isManageCategoriesOpen, setManageCategoriesOpen,
      addAccountModalType, setAddAccountModalType, creditCards, addCreditCard, updateCreditCard, payCreditCard, payLiability, deleteCreditCard,
      loanRevisions, addLoanRevision, deleteLoanRevision,
      isWalletModalOpen, setWalletModalOpen,
      payCardModalState, setPayCardModalState,
      categories, addCategory, updateCategory, deleteCategory,
      profile, setProfile,
      monthCycleDay, setMonthCycleDay, isDateInCurrentCycle, getCycleDetails,
      lastUpdated, exportLedgerData, importLedgerData, getAccountBalance,
      clearAllData, resetToDemoData, integrityWarning, dismissIntegrityWarning: () => setIntegrityWarning(null), verifyDataIntegrity, getStoredSetting, setStoredSetting, toast, showToast
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
