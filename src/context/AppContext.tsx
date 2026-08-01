import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction, CreditCardInfo, Category, Account, Widget } from '../types';

interface AppContextType {
  theme: 'light' | 'dark';
  colorPalette: string;
  setColorPalette: (color: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  currency: string;
  setCurrency: (curr: string) => void;
  formatCurrency: (amount: number) => string;
  getCurrencySymbol: () => string;
  accounts: Account[];
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
  editingTransaction: Transaction | null;
  setEditingTransaction: (tx: Transaction | null) => void;
  autoRecur: boolean;
  setAutoRecur: (val: boolean) => void;
  biometric: boolean;
  setBiometric: (val: boolean) => void;
  isAddModalOpen: boolean;
  setAddModalOpen: (val: boolean) => void;
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
  creditCards: CreditCardInfo[];
  addCreditCard: (card: Omit<CreditCardInfo, 'id'>) => void;
  updateCreditCard: (id: string, card: Omit<CreditCardInfo, 'id'>) => void;
  payCreditCard: (cardId: string, amount: number) => void;
  payLiability: (id: string, amount: number) => void;
  deleteCreditCard: (cardId: string) => void;
  categories: Category[];
  addCategory: (category: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, category: Omit<Category, 'id'>) => void;
  deleteCategory: (id: string) => void;
  savingsGoal: number;
  setSavingsGoal: (val: number) => void;
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
  const [savingsGoal, setSavingsGoal] = useState(5000);
  const [autoRecur, setAutoRecur] = useState(true);
  const [biometric, setBiometric] = useState(false);
  const [passcode, setPasscode] = useState<string | null>(null);
  const [isUnlocked, setUnlocked] = useState(false);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isManageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [addAccountModalType, setAddAccountModalType] = useState<'asset' | 'liability' | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingCreditCard, setEditingCreditCard] = useState<CreditCardInfo | null>(null);
  const [isWalletModalOpen, setWalletModalOpen] = useState(false);
  const [payCardModalState, setPayCardModalState] = useState<{isOpen: boolean, cardId: string | null}>({isOpen: false, cardId: null});
  
  const [lastUpdated, setLastUpdated] = useState<string>(() => loadInitialState('lastUpdated', new Date().toISOString()));

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

  const [accounts, setAccounts] = useState<Account[]>(loadInitialState('accounts', [
    { id: 'checking', name: 'Checking Account', type: 'asset', balance: 8257.50 },
    { id: 'cash', name: 'Cash Wallet', type: 'asset', balance: 475.10 },
    { id: 'card1', name: 'Infinite Silver', type: 'liability', balance: 1089.00 },
  ]));

  const totalAssets = accounts.filter(a => a.type === 'asset').reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = accounts.filter(a => a.type === 'liability').reduce((sum, a) => sum + a.balance, 0);
  const netWorth = totalAssets - totalLiabilities;

  const [transactions, setTransactions] = useState<Transaction[]>(loadInitialState('transactions', [
    { 
      id: 'ob_checking', 
      title: 'Opening Balance', 
      subtitle: 'Initial Balance', 
      amount: 5000.00, 
      date: getCycleRelativeDate(10), 
      category: '#opening', 
      icon: 'Landmark', 
      type: 'income', 
      account: 'checking', 
      toAccountId: 'checking',
      isOpeningBalance: true 
    },
    { 
      id: 'ob_cash', 
      title: 'Opening Balance', 
      subtitle: 'Initial Balance', 
      amount: 300.00, 
      date: getCycleRelativeDate(10), 
      category: '#opening', 
      icon: 'Wallet', 
      type: 'income', 
      account: 'cash', 
      toAccountId: 'cash',
      isOpeningBalance: true 
    },
    { 
      id: 'ob_card1', 
      title: 'Opening Balance', 
      subtitle: 'Initial Debt', 
      amount: 1200.00, 
      date: getCycleRelativeDate(10), 
      category: '#opening', 
      icon: 'CreditCard', 
      type: 'expense', 
      account: 'card1', 
      fromAccountId: 'card1',
      isOpeningBalance: true 
    },
    { 
      id: 'tx_salary', 
      title: 'Tech Corp Salary', 
      subtitle: 'Bi-weekly Paycheck', 
      amount: 3800.00, 
      date: getCycleRelativeDate(5), 
      category: '#income', 
      icon: 'Briefcase', 
      type: 'income', 
      account: 'checking', 
      toAccountId: 'checking' 
    },
    { 
      id: 'tx_groceries', 
      title: 'Whole Foods Market', 
      subtitle: 'Weekly Groceries', 
      amount: 142.50, 
      date: getCycleRelativeDate(4), 
      category: '#groceries', 
      icon: 'Utensils', 
      type: 'expense', 
      account: 'checking', 
      fromAccountId: 'checking' 
    },
    { 
      id: 'tx_atm', 
      title: 'ATM Cash Withdrawal', 
      subtitle: 'Cash for daily expenses', 
      amount: 200.00, 
      date: getCycleRelativeDate(3), 
      category: '#transfer', 
      icon: 'ArrowRightLeft', 
      type: 'transfer', 
      fromAccountId: 'checking', 
      toAccountId: 'cash' 
    },
    { 
      id: 'tx_uber', 
      title: 'Uber Ride', 
      subtitle: 'Downtown commute', 
      amount: 24.90, 
      date: getCycleRelativeDate(2), 
      category: '#fuel', 
      icon: 'Car', 
      type: 'expense', 
      account: 'cash', 
      fromAccountId: 'cash' 
    },
    { 
      id: 'tx_electric', 
      title: 'Cloud Electric Utility', 
      subtitle: 'Monthly Power Bill', 
      amount: 89.00, 
      date: getCycleRelativeDate(1), 
      category: '#utilities', 
      icon: 'Zap', 
      type: 'expense', 
      account: 'card1', 
      fromAccountId: 'card1' 
    },
    { 
      id: 'tx_card_pay', 
      title: 'Credit Card Payment', 
      subtitle: 'Infinite Silver Payment', 
      amount: 200.00, 
      date: getCycleRelativeDate(0), 
      category: '#transfer', 
      icon: 'CreditCard', 
      type: 'transfer', 
      fromAccountId: 'checking', 
      toAccountId: 'card1' 
    }
  ]));

  const [creditCards, setCreditCards] = useState<CreditCardInfo[]>(loadInitialState('creditCards', [
    { id: 'card1', name: 'Infinite Silver', balance: 1089.00, dueAmount: 85.00, dueDate: '2026-08-18', billingCycleDay: 1, limit: 10000 }
  ]));

  const [categories, setCategories] = useState<Category[]>(loadInitialState('categories', [
    { id: '1', name: 'Housing', icon: 'Home', budget: 1800, tags: ['#rent', '#utilities'], group: 'Essential' },
    { id: '2', name: 'Food & Dining', icon: 'Utensils', budget: 600, tags: ['#groceries', '#eatout'], group: 'Essential' },
    { id: '3', name: 'Transportation', icon: 'Car', budget: 400, tags: ['#fuel', '#maintenance'], group: 'Essential' },
    { id: '4', name: 'Entertainment', icon: 'Briefcase', budget: 250, tags: ['#streaming', '#events'], group: 'Leisure' },
    { id: '5', name: 'Health', icon: 'Zap', budget: 300, tags: ['#gym', '#medical'], group: 'Savings' },
    { id: '6', name: 'Shopping', icon: 'ShoppingBag', budget: 200, tags: ['#clothing'], group: 'Leisure' },
  ]));

  const [widgets, setWidgets] = useState<Widget[]>(loadInitialState('widgets', []));
  const addWidget = (widget: Omit<Widget, 'id'>) => { const newWidget: Widget = { ...widget, id: Math.random().toString(36).substr(2, 9) }; setWidgets([...widgets, newWidget]); };
  const removeWidget = (id: string) => { setWidgets(widgets.filter(w => w.id !== id)); };

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [monthCycleDay, setMonthCycleDay] = useState(1);

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

  // Rehydrate basic settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem('monthly-tracker-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.theme) setTheme(parsed.theme);
        if (parsed.colorPalette) setColorPalette(parsed.colorPalette);
        if (parsed.currency) setCurrency(parsed.currency);
        if (parsed.savingsGoal !== undefined) setSavingsGoal(parsed.savingsGoal);
        if (parsed.autoRecur !== undefined) setAutoRecur(parsed.autoRecur);
        if (parsed.biometric !== undefined) setBiometric(parsed.biometric);
        if (parsed.passcode !== undefined) setPasscode(parsed.passcode);
        if (parsed.monthCycleDay !== undefined) setMonthCycleDay(parsed.monthCycleDay);
        if (parsed.lastUpdated) setLastUpdated(parsed.lastUpdated);
      }
    } catch (e) {}
  }, []);

  // Persist state to localStorage on any change
  useEffect(() => {
    const updatedTime = new Date().toISOString();
    setLastUpdated(updatedTime);
    const state = {
      version: STATE_VERSION,
      lastUpdated: updatedTime,
      theme, colorPalette, currency, savingsGoal, autoRecur, biometric, passcode, monthCycleDay,
      transactions, creditCards, categories, profile, accounts, widgets
    };
    localStorage.setItem('monthly-tracker-state', JSON.stringify(state));
  }, [theme, colorPalette, currency, savingsGoal, autoRecur, biometric, passcode, monthCycleDay, transactions, creditCards, categories, profile, accounts, widgets]);

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

  const validateTransaction = (
    tx: Omit<Transaction, 'id'>, 
    currentAccounts: Account[], 
    existingTx?: Transaction
  ): { valid: boolean; error?: string } => {
    const numAmount = Math.abs(Number(tx.amount));

    // 1. Core Validation Rule: No Negative or Zero Transaction Amounts
    if (isNaN(numAmount) || numAmount <= 0) {
      return { valid: false, error: 'Transaction amount must strictly be a positive number (> 0).' };
    }

    // 2. Core Validation Rule: Source/Destination Restrictions for Income
    if (tx.type === 'income') {
      const targetId = tx.toAccountId || tx.account || 'cash';
      const targetAcc = currentAccounts.find(a => a.id === targetId);
      if (targetAcc && targetAcc.type === 'liability') {
        return { valid: false, error: 'Credit Cards and Loans (Liabilities) cannot be selected as the destination account for Income. Income can only flow into Asset accounts.' };
      }
    }

    // Calculate available balance for accounts (considering reversal if updating existingTx)
    let effectiveAccounts = currentAccounts;
    if (existingTx) {
      effectiveAccounts = processAccountsForTx(existingTx, -1, currentAccounts);
    }

    // 3. Asset Validation (The Floor): Asset balance must never drop below 0
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
          // Liability Validation (The Ceiling): Check creditLimit if defined
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

    const newAccounts = processAccountsForTx(tx, 1, accounts);
    const newCreditCards = syncCreditCardsWithAccounts(newAccounts, creditCards);

    setTransactions(prev => [{ ...tx, id: Math.random().toString() }, ...prev]);
    setAccounts(newAccounts);
    setCreditCards(newCreditCards);
    return { success: true };
  };

  const updateTransaction = (id: string, newTx: Omit<Transaction, 'id'>): { success: boolean; error?: string } => {
    const existingTx = transactions.find(t => t.id === id);
    const validation = validateTransaction(newTx, accounts, existingTx);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    let newAccounts = accounts;
    if (existingTx) {
      const reversed = processAccountsForTx(existingTx, -1, accounts);
      newAccounts = processAccountsForTx(newTx, 1, reversed);
    } else {
      newAccounts = processAccountsForTx(newTx, 1, accounts);
    }

    const newCreditCards = syncCreditCardsWithAccounts(newAccounts, creditCards);

    setTransactions(txs => txs.map(t => t.id === id ? { ...newTx, id } : t));
    setAccounts(newAccounts);
    setCreditCards(newCreditCards);
    return { success: true };
  };

  const deleteTransaction = (id: string) => {
    const tx = transactions.find(t => t.id === id);
    if (tx) {
      const newAccounts = processAccountsForTx(tx, -1, accounts);
      const newCreditCards = syncCreditCardsWithAccounts(newAccounts, creditCards);
      setAccounts(newAccounts);
      setCreditCards(newCreditCards);
    }
    setTransactions(txs => txs.filter(t => t.id !== id));
  };

  const addCreditCard = (card: Omit<CreditCardInfo, 'id'>) => {
    const newId = Math.random().toString();
    const initialBalance = card.balance || 0;

    setCreditCards(cards => [{ ...card, id: newId, balance: initialBalance }, ...cards]);
    setAccounts(prev => [{ id: newId, name: card.name, type: 'liability', balance: initialBalance, limit: card.limit }, ...prev]);

    if (initialBalance > 0) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const openingTx: Transaction = {
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
        isOpeningBalance: true
      };
      setTransactions(prev => [openingTx, ...prev]);
    }
  };

  const syncOpeningBalanceTransaction = (
    accountId: string,
    newAccountBalance: number,
    accountType: 'asset' | 'liability'
  ) => {
    setTransactions(prevTxs => {
      // Calculate net impact of all NON-opening transactions for this account
      let nonOpeningDelta = 0;
      prevTxs.forEach(t => {
        const isOpening = t.isOpeningBalance || t.category === '#opening';
        if (isOpening) return;

        const isAccountInvolved = t.account === accountId || t.toAccountId === accountId || t.fromAccountId === accountId;
        if (!isAccountInvolved) return;

        if (accountType === 'asset') {
          if (t.type === 'income' && (t.toAccountId === accountId || t.account === accountId)) {
            nonOpeningDelta += Math.abs(t.amount);
          } else if (t.type === 'expense' && (t.fromAccountId === accountId || t.account === accountId)) {
            nonOpeningDelta -= Math.abs(t.amount);
          } else if (t.type === 'transfer') {
            if (t.toAccountId === accountId) nonOpeningDelta += Math.abs(t.amount);
            if (t.fromAccountId === accountId) nonOpeningDelta -= Math.abs(t.amount);
          }
        } else {
          // Liability account
          if (t.type === 'expense' && (t.fromAccountId === accountId || t.account === accountId)) {
            nonOpeningDelta += Math.abs(t.amount); // Increases debt
          } else if (t.type === 'income' && (t.toAccountId === accountId || t.account === accountId)) {
            nonOpeningDelta -= Math.abs(t.amount); // Decreases debt
          } else if (t.type === 'transfer') {
            if (t.fromAccountId === accountId) nonOpeningDelta += Math.abs(t.amount); // Increases debt
            if (t.toAccountId === accountId) nonOpeningDelta -= Math.abs(t.amount); // Decreases debt
          }
        }
      });

      const targetOpeningAmount = Math.max(0, newAccountBalance - nonOpeningDelta);

      const existingOpeningIndex = prevTxs.findIndex(t => 
        (t.isOpeningBalance || t.category === '#opening') &&
        (t.account === accountId || t.toAccountId === accountId || t.fromAccountId === accountId)
      );

      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

      if (existingOpeningIndex >= 0) {
        return prevTxs.map((t, idx) => {
          if (idx === existingOpeningIndex) {
            return {
              ...t,
              title: 'Opening Balance',
              subtitle: `${formattedDate} • ${accountType === 'asset' ? 'Initial Balance' : 'Initial Debt'}`,
              amount: targetOpeningAmount,
              type: accountType === 'asset' ? ('income' as const) : ('expense' as const),
              category: '#opening',
              isOpeningBalance: true,
              account: accountId,
              toAccountId: accountType === 'asset' ? accountId : undefined,
              fromAccountId: accountType === 'liability' ? accountId : undefined,
            };
          }
          return t;
        });
      } else if (targetOpeningAmount > 0 || newAccountBalance > 0) {
        const openingTx: Transaction = {
          id: Math.random().toString(),
          title: 'Opening Balance',
          subtitle: `${formattedDate} • ${accountType === 'asset' ? 'Initial Balance' : 'Initial Debt'}`,
          amount: targetOpeningAmount > 0 ? targetOpeningAmount : newAccountBalance,
          date: now.toISOString(),
          category: '#opening',
          icon: accountType === 'asset' ? 'Landmark' : 'CreditCard',
          type: accountType === 'asset' ? 'income' : 'expense',
          account: accountId,
          toAccountId: accountType === 'asset' ? accountId : undefined,
          fromAccountId: accountType === 'liability' ? accountId : undefined,
          isOpeningBalance: true
        };
        return [openingTx, ...prevTxs];
      }

      return prevTxs;
    });
  };

  const updateCreditCard = (id: string, card: Omit<CreditCardInfo, 'id'>) => {
    setCreditCards(cards => cards.map(c => c.id === id ? { ...card, id } : c));
    setAccounts(accs => accs.map(a => a.id === id ? { ...a, name: card.name, balance: card.balance, limit: card.limit } : a));
    syncOpeningBalanceTransaction(id, card.balance, 'liability');
  };

  const addAccount = (account: Omit<Account, 'id'>) => {
    const newId = Math.random().toString();
    const initialBalance = account.balance || 0;
    const newAccount: Account = { ...account, id: newId, balance: initialBalance };

    setAccounts(prev => [newAccount, ...prev]);

    if (initialBalance > 0) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      
      if (account.type === 'asset') {
        const openingTx: Transaction = {
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
          isOpeningBalance: true
        };
        setTransactions(prev => [openingTx, ...prev]);
      } else if (account.type === 'liability') {
        const openingTx: Transaction = {
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
          isOpeningBalance: true
        };
        setTransactions(prev => [openingTx, ...prev]);
      }
    }
  };

  const updateAccount = (id: string, account: Omit<Account, 'id'>) => {
    setAccounts(accs => accs.map(a => a.id === id ? { ...account, id } : a));
    setCreditCards(cards => cards.map(c => c.id === id ? { ...c, name: account.name, balance: account.balance } : c));
    syncOpeningBalanceTransaction(id, account.balance, account.type);
  };

  const deleteAccount = (id: string) => {
    setAccounts(accs => accs.filter(a => a.id !== id));
    setCreditCards(cards => cards.filter(c => c.id !== id));
    setTransactions(txs => txs.filter(t => !(t.isOpeningBalance && (t.account === id || t.fromAccountId === id || t.toAccountId === id))));
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

  const payCreditCard = (cardId: string, amount: number) => {
    const defaultAsset = accounts.find(a => a.type === 'asset')?.id || 'checking';
    transferFunds(amount, defaultAsset, cardId);
  };

  const payLiability = (id: string, amount: number) => {
    const defaultAsset = accounts.find(a => a.type === 'asset')?.id || 'checking';
    transferFunds(amount, defaultAsset, id);
  };

  const deleteCreditCard = (cardId: string) => {
    setCreditCards(cards => cards.filter(c => c.id !== cardId));
  };

  const addCategory = (category: Omit<Category, 'id'>) => {
    setCategories([{ ...category, id: Math.random().toString() }, ...categories]);
  };

  const updateCategory = (id: string, category: Omit<Category, 'id'>) => {
    setCategories(cats => cats.map(c => c.id === id ? { ...c, ...category } : c));
  };

  const deleteCategory = (id: string) => {
    setCategories(cats => cats.filter(c => c.id !== id));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const getCurrencySymbol = () => {
    return (0).toLocaleString('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).replace(/\d/g, '').trim();
  };

  const clearAllData = () => {
    const defaultCats: Category[] = [
      { id: '1', name: 'Housing', icon: 'Home', budget: 0, tags: ['#rent', '#utilities'], group: 'Essential' },
      { id: '2', name: 'Food & Dining', icon: 'Utensils', budget: 0, tags: ['#groceries', '#eatout'], group: 'Essential' },
      { id: '3', name: 'Transportation', icon: 'Car', budget: 0, tags: ['#fuel', '#maintenance'], group: 'Essential' },
      { id: '4', name: 'Entertainment', icon: 'Briefcase', budget: 0, tags: ['#streaming', '#events'], group: 'Leisure' },
      { id: '5', name: 'Health', icon: 'Zap', budget: 0, tags: ['#gym', '#medical'], group: 'Savings' },
      { id: '6', name: 'Shopping', icon: 'ShoppingBag', budget: 0, tags: ['#clothing'], group: 'Leisure' },
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
    setSavingsGoal(0);
    setPasscode(null);
    setBiometric(false);
    setProfile(defaultProf);
    setCategories(defaultCats);

    const emptyState = {
      theme,
      colorPalette,
      currency,
      savingsGoal: 0,
      autoRecur: true,
      biometric: false,
      passcode: null,
      monthCycleDay: 1,
      transactions: [],
      creditCards: [],
      categories: defaultCats,
      profile: defaultProf,
      accounts: [], widgets: []
    };

    try {
      localStorage.setItem('monthly-tracker-state', JSON.stringify(emptyState));
    } catch (e) {}
  };

  const resetToDemoData = () => {
    try {
      localStorage.removeItem('monthly-tracker-state');
    } catch (e) {}
    window.location.reload();
  };

  return (
    <AppContext.Provider value={{
      theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, formatCurrency, getCurrencySymbol, 
      accounts, addAccount, updateAccount, deleteAccount, editingAccount, setEditingAccount, editingCreditCard, setEditingCreditCard, transferFunds, netWorth,
      widgets, addWidget, removeWidget,
      transactions, addTransaction, updateTransaction, deleteTransaction, editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, 
      biometric, setBiometric, passcode, setPasscode, isUnlocked, setUnlocked, isAddModalOpen, setAddModalOpen,
      isManageCategoriesOpen, setManageCategoriesOpen,
      addAccountModalType, setAddAccountModalType, creditCards, addCreditCard, updateCreditCard, payCreditCard, payLiability, deleteCreditCard,
      isWalletModalOpen, setWalletModalOpen,
      payCardModalState, setPayCardModalState,
      categories, addCategory, updateCategory, deleteCategory,
      savingsGoal, setSavingsGoal, profile, setProfile,
      monthCycleDay, setMonthCycleDay, isDateInCurrentCycle, getCycleDetails,
      lastUpdated,
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
