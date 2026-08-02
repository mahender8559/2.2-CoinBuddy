import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction, CreditCardInfo, Category, Account, Widget, LoanRevision } from '../types';
import { calculateEmiSplit, getOriginalPrincipal, getTotalInterestPaid } from '../utils/emi';
import { recomputeAllAccountBalances, syncCreditCardsWithAccounts } from '../utils/balanceManager';
import {
  initializeDatabase,
  persistDatabase,
  loadStateFromDatabase,
  seedDemoData,
  insertAccountRow,
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
  loadAppSettings,
  upsertAppSetting,
  SqlJsDatabaseDriver,
} from '../db/dbClient';
import { deleteAccountInDB, updateOpeningBalance } from '../db/sqliteSchema';
import { isSafeMathError, safeCompute, SAFE_MATH_ERRORS, getSafeNumericValue } from '../utils/safeMath';

export type UndoRedoCommand = {
  entityType: 'account' | 'transaction';
  actionType: 'add' | 'update' | 'delete';
  previousState: any;
  newState: any;
};

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
  validateInitialBalanceChange?: (id: string, newInitialBalance: number, creditLimitOverride?: number) => { currentBalance: number; minAllowed: number; maxAllowed: number };
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STATE_VERSION = 'v2_demo_rules';

// Helper function to load initial state safely from localStorage
const loadInitialState = <T,>(key: string, defaultVal: T): T => {
  try {
    const saved = localStorage.getItem('monthly-tracker-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.version === STATE_VERSION && parsed[key] !== undefined) {
        return parsed[key];
      }
    }
  } catch (e) {}
  return defaultVal;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [colorPalette, setColorPalette] = useState('blue');
  const [currency, setCurrency] = useState('INR');
  const [autoRecur, setAutoRecur] = useState(true);
  const [biometric, setBiometric] = useState(false);
  const [passcode, setPasscode] = useState<string | null>(null);
  const [isUnlocked, setUnlocked] = useState(false);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isOnboardingOpen, setOnboardingOpen] = useState(() => localStorage.getItem('coinbuddy_onboarding_seen') !== 'true');
  const [isButtonTourOpen, setButtonTourOpen] = useState(() => localStorage.getItem('hasCompletedButtonTour') !== 'true');
  const [isManageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [addAccountModalType, setAddAccountModalType] = useState<'asset' | 'liability' | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingCreditCard, setEditingCreditCard] = useState<CreditCardInfo | null>(null);
  const [isWalletModalOpen, setWalletModalOpen] = useState(false);
  const [payCardModalState, setPayCardModalState] = useState<{isOpen: boolean, cardId: string | null}>({isOpen: false, cardId: null});
  
  const [lastUpdated, setLastUpdated] = useState<string>(() => loadInitialState('lastUpdated', new Date().toISOString()));

  const [dbDriver, setDbDriver] = useState<SqlJsDatabaseDriver | null>(null);
  const [dbReady, setDbReady] = useState(false);

  const [undoStack, setUndoStack] = useState<UndoRedoCommand[]>([]);
  const [redoStack, setRedoStack] = useState<UndoRedoCommand[]>([]);

  const pushCommand = (cmd: UndoRedoCommand) => {
    setUndoStack(prev => {
      const next = [...prev, cmd];
      if (next.length > 5) return next.slice(next.length - 5);
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
    const nextCards = syncCreditCardsWithAccounts(nextAccs, creditCards);

    setTransactions(nextTxs);
    setAccounts(nextAccs);
    setCreditCards(nextCards);
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
      return next.length > 5 ? next.slice(next.length - 5) : next;
    });
    executeCommand(cmd, false);
  };


  const [profile, setProfile] = useState<{ name: string; email: string; avatar: string; offlineReady: boolean }>(loadInitialState('profile', {
    name: 'Financial Sovereign',
    email: 'sovereign@vault.vellum',
    avatar: '',
    offlineReady: true
  }));

  const getCycleRelativeDate = (dayOffset: number) => {
    const now = new Date();
    const day = Math.max(1, now.getDate() - dayOffset);
    const d = new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0);
    return d.toISOString();
  };

  const [accounts, setAccounts] = useState<Account[]>(loadInitialState('accounts', []));

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

  const getAccountBalance = (accountId: string) => {
    return accounts.find(a => a.id === accountId)?.balance ?? 0;
  };

  const [transactions, setTransactions] = useState<Transaction[]>(loadInitialState('transactions', []));

  const [creditCards, setCreditCards] = useState<CreditCardInfo[]>(loadInitialState('creditCards', []));

  const [categories, setCategories] = useState<Category[]>(loadInitialState('categories', []));

  const [widgets, setWidgets] = useState<Widget[]>(loadInitialState('widgets', []));
  const addWidget = (widget: Omit<Widget, 'id'>) => { const newWidget: Widget = { ...widget, id: Math.random().toString(36).substr(2, 9) }; setWidgets([...widgets, newWidget]); if (dbDriver) { insertWidgetRow(dbDriver, newWidget).then(() => { persistDatabase(dbDriver); }).catch(console.error); } };
  const removeWidget = (id: string) => { setWidgets(widgets.filter(w => w.id !== id)); if (dbDriver) { deleteWidgetRow(dbDriver, id).then(() => { persistDatabase(dbDriver); }).catch(console.error); } };

  const [loanRevisions, setLoanRevisions] = useState<LoanRevision[]>(loadInitialState('loanRevisions', []));

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
    setAccounts(state.accounts);
    setTransactions(state.transactions);
    setCategories(state.categories);
    setCreditCards(state.creditCards);
    setWidgets(state.widgets);
    setLoanRevisions(state.loanRevisions);
  };

  const refreshStateFromDatabase = async (driver: SqlJsDatabaseDriver) => {
    const state = await loadStateFromDatabase(driver);
    setStateFromDbState(state);
  };

  const persistAppSetting = async (key: string, value: unknown) => {
    if (!dbDriver) return;
    try {
      await upsertAppSetting(dbDriver, key, value);
      persistDatabase(dbDriver);
    } catch (error) {
      console.error(`Failed to persist app setting ${key}:`, error);
    }
  };

  const persistDbAction = async (action: () => Promise<unknown>) => {
    if (!dbDriver) return;
    try {
      await action();
      persistDatabase(dbDriver);
      await refreshStateFromDatabase(dbDriver);
    } catch (error) {
      console.error('SQLite persistence failed:', error);
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
          persistDatabase(driver);
        }
        await refreshStateFromDatabase(driver);
        const settings = await loadAppSettings(driver);
        if (settings.theme === 'light' || settings.theme === 'dark') setTheme(settings.theme);
        if (typeof settings.colorPalette === 'string') setColorPalette(settings.colorPalette);
        if (typeof settings.currency === 'string') setCurrency(settings.currency);
        if (typeof settings.autoRecur === 'boolean') setAutoRecur(settings.autoRecur);
        if (typeof settings.biometric === 'boolean') setBiometric(settings.biometric);
        if (typeof settings.passcode === 'string' || settings.passcode === null) setPasscode(settings.passcode as string | null);
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

  // Rehydrate basic settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem('monthly-tracker-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.theme) setTheme(parsed.theme);
        if (parsed.colorPalette) setColorPalette(parsed.colorPalette);
        if (parsed.currency) setCurrency(parsed.currency);
        if (parsed.autoRecur !== undefined) setAutoRecur(parsed.autoRecur);
        if (parsed.biometric !== undefined) setBiometric(parsed.biometric);
        if (parsed.passcode !== undefined) setPasscode(parsed.passcode);
        if (parsed.monthCycleDay !== undefined) setMonthCycleDay(parsed.monthCycleDay);
        if (parsed.lastUpdated) setLastUpdated(parsed.lastUpdated);
      }
    } catch (e) {}
  }, []);

  // Persist user preferences in SQLite. Local storage remains only as a migration fallback.
  useEffect(() => {
    const updatedTime = new Date().toISOString();
    setLastUpdated(updatedTime);
    const state = {
      version: STATE_VERSION,
      lastUpdated: updatedTime,
      theme, colorPalette, currency, autoRecur, biometric, passcode, monthCycleDay,
      profile
    };
    localStorage.setItem('monthly-tracker-state', JSON.stringify(state));
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
    if (transactions.length === 0) return;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const recurringTemplates = transactions.filter(t => t.isRecurring && t.is_verified !== 0 && !t.isOpeningBalance);
    if (recurringTemplates.length === 0) return;

    let newTxs: Transaction[] = [];
    let updatedAccounts = accounts;
    let updatedCards = creditCards;
    let hasChanges = false;

    recurringTemplates.forEach(template => {
      const templateDate = new Date(template.date);
      let targetMonth = currentMonth;
      let targetYear = currentYear;
      
      let targetDate = new Date(targetYear, targetMonth, templateDate.getDate());
      
      // If we've already passed the target date for this month, consider next month's occurrence
      // Wait, we also want to generate for this month if it hasn't been generated yet and it's past
      // To keep it simple, we just check if it's already generated for targetDate's month/year
      
      // Let's adjust targetDate if it's currently > 5 days in the past? No, if it's in the past and not generated, we should generate it.
      // If it's in the future, we check if it's <= 5 days away.
      
      let timeDiff = targetDate.getTime() - now.getTime();
      let daysUntil = timeDiff / (1000 * 3600 * 24);
      
      if (daysUntil < -15) { // If it's more than 15 days in the past, maybe they already moved to next month? Actually let's just look forward if it's past targetDate + some buffer, but realistically we should just check if this month is generated.
         // Actually, if we just check if this month's is generated.
      }

      const checkAndGenerateForDate = (dateToGenerate: Date) => {
        const diff = dateToGenerate.getTime() - now.getTime();
        const days = diff / (1000 * 3600 * 24);
        
        if (days > 5) return false; // Too far in the future
        
        const alreadyExists = transactions.some(t => 
          t.title === template.title && 
          t.amount === template.amount &&
          t.id !== template.id &&
          new Date(t.date).getMonth() === dateToGenerate.getMonth() &&
          new Date(t.date).getFullYear() === dateToGenerate.getFullYear()
        );
        
        if (!alreadyExists && (dateToGenerate.getMonth() !== templateDate.getMonth() || dateToGenerate.getFullYear() !== templateDate.getFullYear())) {
           // We generate it!
           // If autoRecur is on, and the date has passed (days <= 0), it's verified. Otherwise it's 0.
           const isVerified = (autoRecur && days <= 0) ? 1 : 0;
           
           const newTx: Transaction = {
             ...template,
             id: Math.random().toString(),
             date: dateToGenerate.toISOString().split('T')[0],
             is_verified: isVerified,
             isRecurring: false
           };
           
           newTxs.push(newTx);
           
           if (isVerified === 1) {
             updatedAccounts = processAccountsForTx(newTx, 1, updatedAccounts);
             updatedCards = syncCreditCardsWithAccounts(updatedAccounts, updatedCards);
           }
           
           hasChanges = true;
           return true;
        }
        return false;
      };

      // Check for current month
      checkAndGenerateForDate(new Date(currentYear, currentMonth, templateDate.getDate()));
      // Check for next month (in case we are at the end of the month and next month's is within 5 days)
      checkAndGenerateForDate(new Date(currentYear, currentMonth + 1, templateDate.getDate()));
    });

    if (hasChanges) {
      const combinedTxs = [...newTxs, ...transactions];
      const rebalancedAccs = recomputeAllAccountBalances(accounts, combinedTxs);
      const rebalancedCards = syncCreditCardsWithAccounts(rebalancedAccs, creditCards);
      setTransactions(combinedTxs);
      setAccounts(rebalancedAccs);
      setCreditCards(rebalancedCards);
      if (dbDriver) {
        void persistDbAction(async () => {
          for (const transaction of newTxs) {
            await insertTransactionRow(dbDriver, transaction);
          }
        });
      }
    }
  }, [transactions, accounts, creditCards, autoRecur, dbDriver]);

  const processAccountsForTx = (tx: Omit<Transaction, 'id'>, direction: 1 | -1, accs: Account[]): Account[] => {
    const amount = Math.abs(tx.amount) * direction;

    // A. Income (Money entering the ecosystem)
    if (tx.type === 'income') {
      const targetId = tx.toAccountId || tx.account || 'cash';
      return accs.map(a => {
        if (a.id === targetId) {
          if (a.type === 'asset') {
            return { ...a, balance: Math.max(0, a.balance + amount) };
          } else {
            // Income should not be deposited into liability, but if processed, reduce debt
            return { ...a, balance: Math.max(0, a.balance - amount) };
          }
        }
        return a;
      });
    }

    // B. Expense (Money leaving the ecosystem)
    if (tx.type === 'expense') {
      const sourceId = tx.fromAccountId || tx.account || 'cash';
      const isInterestOnly = 
        tx.isInterestOnly ||
        tx.category === '#interest' ||
        tx.category?.toLowerCase().includes('interest') ||
        tx.title?.toLowerCase().includes('interest payment');

      return accs.map(a => {
        if (a.id === sourceId) {
          if (a.type === 'asset') {
            return { ...a, balance: Math.max(0, a.balance - amount) };
          } else if (a.type === 'liability') {
            if (isInterestOnly) {
              // Special Edge Case: Interest-Only Payment
              // Reduces Asset balance, but does NOT reduce Principal balance of Liability account
              return a;
            } else {
              // Paid from Liability: Debt grows (Source Liability Balance + amount)
              return { ...a, balance: a.balance + amount };
            }
          }
        }
        return a;
      });
    }

    // C. Transfer (Internal money movement - ZERO Net Worth Impact)
    if (tx.type === 'transfer') {
      const fromId = tx.fromAccountId;
      const toId = tx.toAccountId;

      return accs.map(a => {
        let newBalance = a.balance;

        if (a.id === fromId) {
          if (a.type === 'asset') {
            newBalance = Math.max(0, newBalance - amount); // Liquid cash drops
          } else if (a.type === 'liability') {
            newBalance = newBalance + amount; // Debt increases
          }
        }

        if (a.id === toId) {
          if (a.type === 'asset') {
            newBalance = Math.max(0, newBalance + amount); // Liquid cash increases
          } else if (a.type === 'liability') {
            newBalance = Math.max(0, newBalance - amount); // Debt decreases (e.g. paying card/loan)
          }
        }

        return { ...a, balance: newBalance };
      });
    }

    return accs;
  };

  const syncCreditCardsWithAccounts = (newAccounts: Account[], cards: CreditCardInfo[]): CreditCardInfo[] => {
    return cards.map(c => {
      const acc = newAccounts.find(a => a.id === c.id);
      if (acc) {
        return { ...c, balance: acc.balance, limit: acc.limit ?? c.limit };
      }
      return c;
    });
  };

  // Startup Migration & Rebalance Routine
  useEffect(() => {
    setAccounts(prevAccs => {
      const rebalanced = recomputeAllAccountBalances(prevAccs, transactions);
      setCreditCards(prevCards => syncCreditCardsWithAccounts(rebalanced, prevCards));
      return rebalanced;
    });
  }, []);

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

    const finalTx = { ...tx, id: Math.random().toString() };
    const nextTxs = [finalTx, ...transactions];
    const newAccounts = recomputeAllAccountBalances(accounts, nextTxs);
    const newCreditCards = syncCreditCardsWithAccounts(newAccounts, creditCards);

    pushCommand({
      entityType: 'transaction',
      actionType: 'add',
      previousState: null,
      newState: finalTx
    });
    setTransactions(nextTxs);
    setAccounts(newAccounts);
    setCreditCards(newCreditCards);

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
    const newAccounts = recomputeAllAccountBalances(accounts, nextTxs);
    const newCreditCards = syncCreditCardsWithAccounts(newAccounts, creditCards);

    pushCommand({
      entityType: 'transaction',
      actionType: 'update',
      previousState: existingTx,
      newState: updatedTx
    });

    setTransactions(nextTxs);
    setAccounts(newAccounts);
    setCreditCards(newCreditCards);

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
      const newAccounts = recomputeAllAccountBalances(accounts, nextTxs);
      const newCreditCards = syncCreditCardsWithAccounts(newAccounts, creditCards);
      pushCommand({
        entityType: 'transaction',
        actionType: 'delete',
        previousState: tx,
        newState: null
      });
      setAccounts(newAccounts);
      setCreditCards(newCreditCards);
      setTransactions(nextTxs);

      if (dbDriver) {
        persistDbAction(() => deleteTransactionRow(dbDriver, id));
      }
    } else {
      setTransactions(txs => txs.filter(t => t.id !== id));
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
    const newId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const accId = revision.accountId || revision.account_id || '';
    const newRev: LoanRevision = {
      ...revision,
      id: newId,
      accountId: accId,
      account_id: accId,
      effectiveDate: revision.effectiveDate || revision.effective_date || '',
      effective_date: revision.effectiveDate || revision.effective_date || '',
      newInterestRate: revision.newInterestRate ?? revision.new_interest_rate ?? 0,
      new_interest_rate: revision.newInterestRate ?? revision.new_interest_rate ?? 0,
      newEmi: revision.newEmi ?? revision.new_emi ?? 0,
      new_emi: revision.newEmi ?? revision.new_emi ?? 0,
      newTenureMonths: revision.newTenureMonths ?? revision.new_tenure_months ?? 0,
      new_tenure_months: revision.newTenureMonths ?? revision.new_tenure_months ?? 0,
      paymentFrequency: revision.paymentFrequency || revision.payment_frequency,
      payment_frequency: revision.paymentFrequency || revision.payment_frequency,
    };

    setLoanRevisions(prev => [...prev, newRev]);
    setAccounts(prevAccs => prevAccs.map(acc => {
      if (acc.id === accId) {
        const existing = acc.revisions || [];
        return {
          ...acc,
          interestRate: newRev.newInterestRate,
          interest_rate: newRev.newInterestRate,
          monthlyEMI: newRev.newEmi,
          monthly_emi: newRev.newEmi,
          tenureMonths: newRev.newTenureMonths,
          tenure_months: newRev.newTenureMonths,
          paymentFrequency: newRev.paymentFrequency || acc.paymentFrequency,
          payment_frequency: newRev.payment_frequency || acc.payment_frequency,
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
    setLoanRevisions(prev => prev.filter(r => r.id !== id));
    setAccounts(prevAccs => prevAccs.map(acc => {
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
  };

  const addCreditCard = (card: Omit<CreditCardInfo, 'id'>) => {
    const newId = Math.random().toString();
    const initialBalance = card.balance || 0;
    const newCard: CreditCardInfo = { ...card, id: newId, balance: initialBalance };
    const newAccount: Account = { id: newId, name: card.name, type: 'liability', balance: initialBalance, limit: card.limit };

    setCreditCards(cards => [{ ...newCard }, ...cards]);
    setAccounts(prev => [newAccount, ...prev]);

    let openingTx: Transaction | null = null;
    if (initialBalance > 0) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const newOpeningTx: Transaction = {
        id: Math.random().toString(),
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
        await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id);
        await insertCreditCardRow(dbDriver, newCard);
      });
    }
  };  
  const validateAndCalculateBalance = (id: string, newInitialBalance: number, creditLimitOverride?: number) => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return { currentBalance: newInitialBalance, minAllowed: 0, maxAllowed: Infinity };

    const isLiability = targetAccount.type === 'liability';

    const nonOpeningTxs = transactions.filter(t => 
      !(t.isOpeningBalance || t.category === '#opening' || (t as any).transaction_type === 'OPENING_BALANCE') &&
      (t.account === id || t.toAccountId === id || t.fromAccountId === id)
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningChange = 0;
    let C_lowest = 0;
    let C_highest = 0;

    for (const tx of nonOpeningTxs) {
      if (tx.is_verified === 0) continue;
      
      const amount = Math.abs(tx.amount);
      const sourceId = tx.fromAccountId || tx.account || 'cash';
      const targetId = tx.toAccountId || tx.account || 'cash';
      
      let change = 0;

      if (tx.type === 'income' && targetId === id) {
        if (!isLiability) change = amount;
        else change = -amount;
      } else if (tx.type === 'expense' && sourceId === id) {
        const isInterestOnly = tx.isInterestOnly || tx.category === '#interest' || tx.category?.toLowerCase().includes('interest') || tx.title?.toLowerCase().includes('interest payment');
        if (!isLiability) change = -amount;
        else if (!isInterestOnly) change = amount;
      } else if (tx.type === 'transfer') {
        if (sourceId === id) {
          if (!isLiability) change = -amount;
          else change = amount;
        }
        if (targetId === id) {
          if (!isLiability) change = amount;
          else change = -amount;
        }
      }
      
      runningChange += change;
      if (runningChange < C_lowest) {
        C_lowest = runningChange;
      }
      if (runningChange > C_highest) {
        C_highest = runningChange;
      }
    }

    if (!isLiability) {
      const minAllowed = Math.max(0, -C_lowest);
      if (newInitialBalance < minAllowed) {
        throw new Error(`Cannot set initial balance lower than ${formatCurrency(minAllowed)}. Existing expenses in this account would cause a negative balance.`);
      }
      return { currentBalance: newInitialBalance + runningChange, minAllowed, maxAllowed: Infinity };
    } else {
      const minAllowed = Math.max(0, -C_lowest);
      const newInitialOwed = newInitialBalance;

      if (newInitialOwed < minAllowed) {
        throw new Error(`Initial debt cannot be lower than ${formatCurrency(minAllowed)} due to past repayments.`);
      }

      const creditCard = creditCards.find(c => c.id === id);
      const creditLimit = creditLimitOverride ?? targetAccount.limit ?? creditCard?.limit;

      if (creditLimit !== undefined && creditLimit !== null && creditLimit > 0) {
        const maxAllowed = Math.max(0, creditLimit - C_highest);
        if (newInitialOwed + C_highest > creditLimit) {
          throw new Error(`Initial debt cannot exceed ${formatCurrency(maxAllowed)} as past spending would breach your credit limit.`);
        }
        return { currentBalance: newInitialOwed + runningChange, minAllowed, maxAllowed };
      }

      return { currentBalance: newInitialOwed + runningChange, minAllowed, maxAllowed: Infinity };
    }
  };

  const validateInitialBalanceChange = validateAndCalculateBalance;

  const updateCreditCard = (id: string, card: Omit<CreditCardInfo, 'id'>) => {
    const targetAccount = accounts.find(a => a.id === id);
    if (!targetAccount) return;

    const existingTxIndex = transactions.findIndex(t => 
      (t.isOpeningBalance || t.category === '#opening') &&
      (t.account === id || t.toAccountId === id || t.fromAccountId === id)
    );

    const { currentBalance } = validateAndCalculateBalance(id, card.balance, card.limit);

    const updatedCard: CreditCardInfo = { ...card, id, balance: currentBalance };

    if (existingTxIndex >= 0) {
      const newAmount = card.balance;
      setTransactions(prevTxs => prevTxs.map((t, idx) => idx === existingTxIndex ? { ...t, amount: newAmount } : t));
      setCreditCards(cards => cards.map(c => c.id === id ? { ...updatedCard } : c));
      setAccounts(accs => accs.map(a => a.id === id ? { ...a, name: card.name, balance: currentBalance, limit: card.limit } : a));
    } else {
      if (card.balance > 0) {
        const now = new Date();
        const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const openingTx: Transaction = {
          id: Math.random().toString(),
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
      setCreditCards(cards => cards.map(c => c.id === id ? { ...updatedCard } : c));
      setAccounts(accs => accs.map(a => a.id === id ? { ...a, name: card.name, balance: currentBalance, limit: card.limit } : a));
    }

    if (dbDriver) {
      persistDbAction(async () => {
        await updateAccountRow(dbDriver, { ...targetAccount, name: card.name, limit: card.limit, balance: currentBalance });
        await updateCreditCardRow(dbDriver, updatedCard);
      });
    }
  };

  const addAccount = (account: Omit<Account, 'id'>) => {
    const newId = Math.random().toString();
    const initialBalance = account.balance || 0;
    const newAccount: Account = { ...account, id: newId, balance: initialBalance };
    
    let openingTx: Transaction | null = null;
    if (initialBalance > 0) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      
      if (account.type === 'asset') {
        openingTx = {
          id: Math.random().toString(),
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
          id: Math.random().toString(),
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

    setAccounts(prev => [newAccount, ...prev]);
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
    
    const { currentBalance } = validateAndCalculateBalance(id, account.balance);

    if (existingTxIndex >= 0) {
      const newAmount = account.balance;
      const updatedTx = { ...transactions[existingTxIndex], amount: newAmount };
      const mergedAccount = {
        ...account,
        id,
        balance: currentBalance,
        originalPrincipal: account.originalPrincipal || targetAccount.originalPrincipal || account.balance
      };
      pushCommand({
        entityType: 'account',
        actionType: 'update',
        previousState: { account: targetAccount, openingTx: transactions[existingTxIndex] },
        newState: { account: mergedAccount, openingTx: updatedTx }
      });

      setTransactions(prevTxs => prevTxs.map((t, idx) => idx === existingTxIndex ? updatedTx : t));
      setAccounts(accs => accs.map(a => a.id === id ? mergedAccount : a));
      setCreditCards(cards => cards.map(c => c.id === id ? { ...c, name: account.name, balance: currentBalance } : c));

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
          id: Math.random().toString(),
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
        newState: { account: { ...account, id, balance: currentBalance }, openingTx: newOpeningTx }
      });
      setAccounts(accs => accs.map(a => a.id === id ? { ...account, id, balance: currentBalance } : a));
      setCreditCards(cards => cards.map(c => c.id === id ? { ...c, name: account.name, balance: currentBalance } : c));

      if (dbDriver) {
        persistDbAction(async () => {
          await updateAccountRow(dbDriver, { ...account, id, balance: currentBalance });
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
      setAccounts(prev => prev.filter(a => a.id !== id));
      setCreditCards(prev => prev.filter(c => c.id !== id));
    } else {
      if (Math.abs(targetAccount.balance) > 0.0001) {
        throw new Error("Account must have a zero balance before closing. Please transfer funds or log an expense.");
      }
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, is_archived: 1 } : a));
      setCreditCards(prev => prev.filter(c => c.id !== id));
    }
  };

  const transferFunds = (amount: number, fromId: string, toId: string) => {
    const fromAccount = accounts.find(a => a.id === fromId);
    const toAccount = accounts.find(a => a.id === toId);

    addTransaction({
      title: `Transfer: ${fromAccount?.name || 'Unknown'} to ${toAccount?.name || 'Unknown'}`,
      subtitle: `Today • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      amount: -amount,
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
    const defaultAsset = fromAccountId || accounts.find(a => a.type === 'asset')?.id || 'checking';
    const liabilityAcc = accounts.find(a => a.id === id);

    let pAmount = principalAmount;
    let iAmount = interestAmount;

    if (pAmount === undefined || iAmount === undefined) {
      if (liabilityAcc && (liabilityAcc.group === 'Bank Loan' || liabilityAcc.group === 'Loan' || liabilityAcc.group === 'Mortgage' || liabilityAcc.group === 'Interest-Only Loan' || liabilityAcc.interestRate !== undefined || liabilityAcc.monthlyEMI !== undefined)) {
        const rate = liabilityAcc.interestRate ?? liabilityAcc.interest_rate ?? 0;
        const type = (liabilityAcc.interestCalculationType || liabilityAcc.interest_calculation_type || 'REDUCING') as any;
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
    setCreditCards(cards => cards.filter(c => c.id !== cardId));
  };

  const addCategory = (category: Omit<Category, 'id'>) => {
    const newCategory = { ...category, id: Math.random().toString() };
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
    setCategories(cats => cats.filter(c => c.id !== id));
    if (dbDriver) {
      persistDbAction(() => deleteCategoryRow(dbDriver, id));
    }
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
    const defaultCats: Category[] = [
      { id: '1', name: 'Housing', icon: 'Home', budget: 0, tags: ['#rent', '#utilities'], group: 'Essential', type: 'expense' },
      { id: '2', name: 'Food & Dining', icon: 'Utensils', budget: 0, tags: ['#groceries', '#eatout'], group: 'Essential', type: 'expense' },
      { id: '3', name: 'Transportation', icon: 'Car', budget: 0, tags: ['#fuel', '#maintenance'], group: 'Essential', type: 'expense' },
      { id: '4', name: 'Entertainment', icon: 'Briefcase', budget: 0, tags: ['#streaming', '#events'], group: 'Leisure', type: 'expense' },
      { id: '5', name: 'Health', icon: 'Zap', budget: 0, tags: ['#gym', '#medical'], group: 'Savings', type: 'expense' },
      { id: '6', name: 'Shopping', icon: 'ShoppingBag', budget: 0, tags: ['#clothing'], group: 'Leisure', type: 'expense' },
      { id: '7', name: 'Salary', icon: 'Banknote', tags: ['#paycheck', '#salary'], group: 'Essential', type: 'income' },
      { id: '8', name: 'Other Income', icon: 'Gift', tags: ['#bonus', '#freelance'], group: 'Essential', type: 'income' },
    ];
    const defaultProf = {
      name: 'Financial Sovereign',
      email: 'sovereign@vault.vellum',
      avatar: '',
      offlineReady: true
    };

    setTransactions([]);
    setCreditCards([]);
    setAccounts([]);
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
    if (dbDriver) {
      persistDbAction(async () => {
        await importLedgerToDatabase(dbDriver, data);
      });
      const refreshed = await loadStateFromDatabase(dbDriver);
      setAccounts(refreshed.accounts);
      setTransactions(refreshed.transactions);
      setCategories(refreshed.categories);
      setCreditCards(refreshed.creditCards);
      setWidgets(refreshed.widgets);
      setLoanRevisions(refreshed.loanRevisions);
    } else {
      if (data.accounts && Array.isArray(data.accounts)) setAccounts(data.accounts);
      if (data.transactions && Array.isArray(data.transactions)) setTransactions(data.transactions);
      if (data.categories && Array.isArray(data.categories)) setCategories(data.categories);
      if (data.creditCards && Array.isArray(data.creditCards)) setCreditCards(data.creditCards);
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
    try {
      localStorage.removeItem('monthly-tracker-state');
    } catch (e) {}
    window.location.reload();
  };

  return (
    <AppContext.Provider value={{
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      handleUndo,
      handleRedo,
      theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, formatCurrency, getCurrencySymbol, 
      accounts, calculateEmiSplit, validateInitialBalanceChange, addAccount, updateAccount, deleteAccount, editingAccount, setEditingAccount, editingCreditCard, setEditingCreditCard, transferFunds, netWorth,
      widgets, addWidget, removeWidget,
      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, 
      biometric, setBiometric, passcode, setPasscode, isUnlocked, setUnlocked, isAddModalOpen, setAddModalOpen, isOnboardingOpen, setOnboardingOpen, isButtonTourOpen, setButtonTourOpen,
      isManageCategoriesOpen, setManageCategoriesOpen,
      addAccountModalType, setAddAccountModalType, creditCards, addCreditCard, updateCreditCard, payCreditCard, payLiability, deleteCreditCard,
      loanRevisions, addLoanRevision, deleteLoanRevision,
      isWalletModalOpen, setWalletModalOpen,
      payCardModalState, setPayCardModalState,
      categories, addCategory, updateCategory, deleteCategory,
      profile, setProfile,
      monthCycleDay, setMonthCycleDay, isDateInCurrentCycle, getCycleDetails,
      lastUpdated, exportLedgerData, importLedgerData, getAccountBalance,
      clearAllData, resetToDemoData
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
