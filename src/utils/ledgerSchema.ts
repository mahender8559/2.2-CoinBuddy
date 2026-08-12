import { recomputeAllAccountBalances, syncCreditCardsWithAccounts } from './balanceManager';
import { DEFAULT_AFFORDABILITY_SETTINGS, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';
import { normalizeSavingsGoals } from '../domain/savingsGoals';

export const LEDGER_SCHEMA_VERSION = 'coinbuddy-ledger-v3';

export function validateLedgerSchema(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Backup must be a JSON object.';
  const ledger = data as Record<string, unknown>;
  if (ledger.schemaVersion !== LEDGER_SCHEMA_VERSION) return 'This backup is not a supported CoinBuddy ledger export.';
  for (const key of ['accounts', 'transactions', 'categories', 'creditCards', 'widgets', 'loanRevisions']) {
    if (!Array.isArray(ledger[key])) return `Backup field "${key}" must be an array.`;
  }
  if (ledger.recurringRules !== undefined && !Array.isArray(ledger.recurringRules)) return 'Backup field \"recurringRules\" must be an array when present.';
  if (ledger.affordabilitySettings !== undefined && (!ledger.affordabilitySettings || typeof ledger.affordabilitySettings !== 'object' || Array.isArray(ledger.affordabilitySettings))) return 'Backup field \"affordabilitySettings\" must be an object when present.';
  if (ledger.savingsGoals !== undefined && !Array.isArray(ledger.savingsGoals)) return 'Backup field \"savingsGoals\" must be an array when present.';
  if (!(ledger.accounts as unknown[]).every(value => value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string')) return 'Every imported account must have an id.';
  if (!(ledger.transactions as unknown[]).every(value => value && typeof value === 'object' && typeof (value as { id?: unknown; amount?: unknown }).id === 'string' && Number.isFinite(Number((value as { amount?: unknown }).amount)) && Number((value as { amount?: unknown }).amount) > 0)) return 'Every imported transaction must have an id and positive amount.';
  return null;
}

export function migrateBackupDataToLatest(rawJsonString: string, options: { recomputeBalances?: boolean } = {}): any {
  let data: any;
  try {
    data = JSON.parse(rawJsonString);
  } catch {
    throw new Error('Invalid JSON structure inside backup.');
  }
  if (data.data && typeof data.data === 'object') data = data.data;

  if (data.schemaVersion === LEDGER_SCHEMA_VERSION) {
    return {
      ...data,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
      creditCards: Array.isArray(data.creditCards) ? data.creditCards : [],
      widgets: Array.isArray(data.widgets) ? data.widgets : [],
      loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [],
      recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [],
      affordabilitySettings: normalizeAffordabilitySettings(data.affordabilitySettings),
      savingsGoals: normalizeSavingsGoals(data.savingsGoals),
      currency: data.currency || 'INR',
    };
  }

  const accounts = Array.isArray(data.accounts) ? data.accounts.map((acc: any) => ({
    id: acc.id || crypto.randomUUID(), name: acc.name || 'Account', type: acc.type || 'asset', balance: Number(acc.balance) || 0,
    initialBalance: acc.initialBalance ?? acc.openingBalance ?? (acc.balance !== undefined ? Number(acc.balance) : 0),
    originalPrincipal: acc.originalPrincipal ?? acc.original_principal ?? acc.balance ?? 0, monthlyEMI: acc.monthlyEMI ?? acc.monthly_emi ?? 0,
    interestRate: acc.interestRate ?? acc.interest_rate ?? 0, tenureMonths: acc.tenureMonths ?? acc.tenure_months ?? 0,
    interestCalculationType: acc.interestCalculationType || acc.interest_calculation_type || 'REDUCING', paymentFrequency: acc.paymentFrequency || acc.payment_frequency || 'MONTHLY',
    loanStartDate: acc.loanStartDate || acc.loan_start_date || new Date().toISOString().slice(0, 10), revisions: Array.isArray(acc.revisions) ? acc.revisions : [],
  })) : [];
  const transactions = Array.isArray(data.transactions) ? data.transactions.map((tx: any) => ({
    id: tx.id || crypto.randomUUID(), amount: Number(tx.amount) || 0, type: tx.type || 'expense', category: tx.category || 'General',
    accountId: tx.accountId || tx.account_id || accounts[0]?.id || '', date: tx.date || new Date().toISOString().slice(0, 10), note: tx.note || '',
  })) : [];
  const categories = Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : ['Food & Dining', 'Housing & Rent', 'Utilities', 'Shopping', 'Salary', 'Investment', 'Debt Payment'];
  const creditCards = Array.isArray(data.creditCards) ? data.creditCards : [];

  let migratedAccounts = accounts;
  let migratedCards = creditCards;
  if (options.recomputeBalances !== false) {
    migratedAccounts = recomputeAllAccountBalances(accounts, transactions).map(account => {
      const hasLedgerEntry = transactions.some((tx: any) => tx.accountId === account.id || tx.account === account.id || tx.fromAccountId === account.id || tx.toAccountId === account.id);
      return hasLedgerEntry ? account : { ...account, balance: Number((account as any).initialBalance ?? 0) };
    });
    migratedCards = syncCreditCardsWithAccounts(migratedAccounts, creditCards);
  }

  return {
    schemaVersion: LEDGER_SCHEMA_VERSION, exportedAt: data.exportedAt || data.lastUpdated || new Date().toISOString(), accounts: migratedAccounts, transactions, categories,
    creditCards: migratedCards, events: Array.isArray(data.events) ? data.events : [], widgets: Array.isArray(data.widgets) ? data.widgets : [],
    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [], recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [], affordabilitySettings: { ...DEFAULT_AFFORDABILITY_SETTINGS }, savingsGoals: [], currency: data.currency || '$', lastUpdated: new Date().toISOString(),
  };
}
