import { recomputeAllAccountBalances, syncCreditCardsWithAccounts } from './balanceManager';
import { DEFAULT_AFFORDABILITY_SETTINGS, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';
import { normalizeSavingsGoals } from '../domain/savingsGoals';
import { createDefaultCategories } from '../constants/defaultCategories';

export const LEDGER_SCHEMA_VERSION = 'coinbuddy-ledger-v5';
export const PREVIOUS_LEDGER_SCHEMA_VERSIONS = ['coinbuddy-ledger-v4', 'coinbuddy-ledger-v3'] as const;

function stableSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
}

function normalizeCategoryRecords(value: unknown): any[] {
  const defaults = createDefaultCategories();
  const records = Array.isArray(value) && value.length ? value : defaults;
  return records.map((record: any, index: number) => {
    const source = record && typeof record === 'object' ? record : { name: String(record ?? '') };
    const name = String(source.name ?? '').trim() || `Category ${index + 1}`;
    const defaultMatch = defaults.find(item => item.id === source.id || item.name.toLowerCase() === name.toLowerCase());
    const rawType = String(source.type ?? defaultMatch?.type ?? '').toLowerCase();
    const inferredIncome = /income|salary|bonus|freelance|paycheck/i.test(name);
    const type = rawType === 'income' ? 'income' : rawType === 'expense' ? 'expense' : inferredIncome ? 'income' : 'expense';
    return {
      ...(defaultMatch ?? {}),
      ...source,
      id: String(source.id ?? defaultMatch?.id ?? `legacy-${stableSlug(name)}-${index + 1}`),
      name,
      icon: source.icon ?? source.iconName ?? source.icon_name ?? defaultMatch?.icon ?? 'Briefcase',
      budget: Number.isFinite(Number(source.budget)) ? Number(source.budget) : Number(defaultMatch?.budget ?? 0),
      type,
      tags: Array.isArray(source.tags) ? source.tags : defaultMatch?.tags,
      affordabilityClass: source.affordabilityClass ?? source.affordability_class ?? defaultMatch?.affordabilityClass,
    };
  });
}

function normalizeTransactionType(value: unknown): 'income' | 'expense' | 'transfer' {
  const normalized = String(value ?? '').toUpperCase();
  if (normalized === 'INCOME' || normalized === 'DEPOSIT') return 'income';
  if (normalized === 'TRANSFER' || normalized === 'CREDIT_PAYMENT' || normalized === 'DEBT_PAYMENT' || normalized === 'LOAN_DISBURSEMENT' || normalized === 'REPAYMENT_RECEIVED') return 'transfer';
  return 'expense';
}

function normalizeTransactionRecord(tx: any, accounts: any[], index: number): any {
  const type = normalizeTransactionType(tx?.type ?? tx?.transaction_type);
  const fallbackAccountId = String(tx?.account ?? tx?.accountId ?? tx?.account_id ?? accounts[0]?.id ?? '');
  const fromAccountId = tx?.fromAccountId ?? tx?.from_account_id ?? (type === 'expense' ? fallbackAccountId : undefined);
  const toAccountId = tx?.toAccountId ?? tx?.to_account_id ?? (type === 'income' ? fallbackAccountId : undefined);
  const rawAmount = Number(tx?.amount);
  const amount = Number.isFinite(rawAmount) ? Math.abs(rawAmount) : 0;
  const note = String(tx?.notes ?? tx?.note ?? '').trim();
  const title = String(tx?.title ?? tx?.description ?? note ?? '').trim() || `Imported transaction ${index + 1}`;
  const transactionType = String(tx?.transaction_type ?? type).toUpperCase();
  return {
    ...tx,
    id: String(tx?.id ?? `legacy-transaction-${index + 1}`),
    title,
    subtitle: String(tx?.subtitle ?? ''),
    amount,
    date: tx?.date ?? new Date().toISOString().slice(0, 10),
    category: tx?.category ?? 'General',
    categoryId: tx?.categoryId ?? tx?.category_id,
    icon: tx?.icon ?? 'Briefcase',
    type,
    transaction_type: transactionType,
    account: fallbackAccountId,
    accountId: fallbackAccountId,
    fromAccountId,
    toAccountId,
    notes: note,
    note,
    is_verified: tx?.is_verified ?? tx?.isVerified ?? 1,
    isRecurring: Boolean(tx?.isRecurring ?? tx?.is_recurring),
    isOpeningBalance: Boolean(tx?.isOpeningBalance ?? tx?.is_opening_balance),
    isInterestOnly: Boolean(tx?.isInterestOnly ?? tx?.is_interest_only),
    eventId: tx?.eventId ?? tx?.event_id,
    recurringRuleId: tx?.recurringRuleId ?? tx?.recurring_rule_id,
    dueDate: tx?.dueDate ?? tx?.due_date,
    goalId: tx?.goalId ?? tx?.goal_id,
  };
}

function normalizeAccountRecords(value: unknown): any[] {
  if (!Array.isArray(value)) return [];
  return value.map((acc: any, index: number) => ({
    ...acc,
    id: String(acc?.id ?? `legacy-account-${index + 1}`),
    name: String(acc?.name ?? '').trim() || `Account ${index + 1}`,
    type: acc?.type === 'liability' || String(acc?.type).toUpperCase() === 'LIABILITY' ? 'liability' : 'asset',
    balance: Number(acc?.balance) || 0,
    initialBalance: acc?.initialBalance ?? acc?.openingBalance ?? acc?.opening_balance ?? (acc?.balance !== undefined ? Number(acc.balance) : 0),
    originalPrincipal: acc?.originalPrincipal ?? acc?.original_principal ?? acc?.balance ?? 0,
    monthlyEMI: acc?.monthlyEMI ?? acc?.monthly_emi ?? 0,
    interestRate: acc?.interestRate ?? acc?.interest_rate ?? 0,
    tenureMonths: acc?.tenureMonths ?? acc?.tenure_months ?? 0,
    interestCalculationType: acc?.interestCalculationType || acc?.interest_calculation_type || 'REDUCING',
    paymentFrequency: acc?.paymentFrequency || acc?.payment_frequency || 'MONTHLY',
    loanStartDate: acc?.loanStartDate || acc?.loan_start_date,
    revisions: Array.isArray(acc?.revisions) ? acc.revisions : [],
  }));
}

export function validateLedgerSchema(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Backup must be a JSON object.';
  const ledger = data as Record<string, unknown>;
  if (ledger.schemaVersion !== LEDGER_SCHEMA_VERSION && !PREVIOUS_LEDGER_SCHEMA_VERSIONS.includes(ledger.schemaVersion as any)) return 'This backup is not a supported CoinBuddy ledger export.';
  for (const key of ['accounts', 'transactions', 'categories', 'creditCards', 'widgets', 'loanRevisions']) {
    if (!Array.isArray(ledger[key])) return `Backup field "${key}" must be an array.`;
  }
  if (ledger.recurringRules !== undefined && !Array.isArray(ledger.recurringRules)) return 'Backup field "recurringRules" must be an array when present.';
  if (ledger.affordabilitySettings !== undefined && (!ledger.affordabilitySettings || typeof ledger.affordabilitySettings !== 'object' || Array.isArray(ledger.affordabilitySettings))) return 'Backup field "affordabilitySettings" must be an object when present.';
  if (ledger.savingsGoals !== undefined && !Array.isArray(ledger.savingsGoals)) return 'Backup field "savingsGoals" must be an array when present.';
  for (const key of ['people', 'sharedObligations', 'sharedResponsibilities', 'sharedPayments', 'sharedSettlements', 'loanSharingRules', 'loanContributionRules', 'sharedObligationTemplates', 'sharedTemplateResponsibilities', 'externalLoanContributions']) {
    if (ledger[key] !== undefined && !Array.isArray(ledger[key])) return `Backup field "${key}" must be an array when present.`;
  }
  if (!(ledger.accounts as unknown[]).every(value => value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string')) return 'Every imported account must have an id.';
  if (!(ledger.transactions as unknown[]).every(value => value && typeof value === 'object' && typeof (value as { id?: unknown; amount?: unknown }).id === 'string' && Number.isFinite(Number((value as { amount?: unknown }).amount)) && Number((value as { amount?: unknown }).amount) > 0)) return 'Every imported transaction must have an id and positive amount.';
  if (!(ledger.categories as unknown[]).every(value => value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string' && typeof (value as { name?: unknown }).name === 'string')) return 'Every imported category must have an id and name.';
  for (const key of ['accounts', 'transactions', 'categories', 'creditCards', 'widgets', 'loanRevisions', 'recurringRules', 'people', 'sharedObligations', 'sharedResponsibilities', 'sharedPayments', 'sharedSettlements']) {
    const rows = ledger[key];
    if (!Array.isArray(rows)) continue;
    const ids = rows.map(value => value && typeof value === 'object' ? String((value as { id?: unknown; event_id?: unknown }).id ?? (value as { event_id?: unknown }).event_id ?? '') : '').filter(Boolean);
    if (new Set(ids).size !== ids.length) return `Backup field "${key}" contains duplicate identifiers.`;
  }
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

  const supportedSchema = data.schemaVersion === LEDGER_SCHEMA_VERSION || PREVIOUS_LEDGER_SCHEMA_VERSIONS.includes(data.schemaVersion);
  if (supportedSchema) {
    const accounts = normalizeAccountRecords(data.accounts);
    const transactions = Array.isArray(data.transactions) ? data.transactions.map((tx: any, index: number) => normalizeTransactionRecord(tx, accounts, index)) : [];
    return {
      ...data,
      schemaVersion: LEDGER_SCHEMA_VERSION,
      accounts,
      transactions,
      categories: normalizeCategoryRecords(data.categories),
      creditCards: Array.isArray(data.creditCards) ? data.creditCards : [],
      widgets: Array.isArray(data.widgets) ? data.widgets : [],
      loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [],
      recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [],
      affordabilitySettings: normalizeAffordabilitySettings(data.affordabilitySettings),
      savingsGoals: normalizeSavingsGoals(data.savingsGoals),
      people: Array.isArray(data.people) ? data.people : [],
      sharedObligations: Array.isArray(data.sharedObligations) ? data.sharedObligations : [],
      sharedResponsibilities: Array.isArray(data.sharedResponsibilities) ? data.sharedResponsibilities : [],
      sharedPayments: Array.isArray(data.sharedPayments) ? data.sharedPayments : [],
      sharedSettlements: Array.isArray(data.sharedSettlements) ? data.sharedSettlements : [],
      loanSharingRules: Array.isArray(data.loanSharingRules) ? data.loanSharingRules : [],
      loanContributionRules: Array.isArray(data.loanContributionRules) ? data.loanContributionRules : [],
      sharedObligationTemplates: Array.isArray(data.sharedObligationTemplates) ? data.sharedObligationTemplates : [],
      sharedTemplateResponsibilities: Array.isArray(data.sharedTemplateResponsibilities) ? data.sharedTemplateResponsibilities : [],
      externalLoanContributions: Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : [],
      currency: data.currency || 'INR',
    };
  }

  const accounts = normalizeAccountRecords(data.accounts);
  const transactions = Array.isArray(data.transactions) ? data.transactions.map((tx: any, index: number) => normalizeTransactionRecord(tx, accounts, index)) : [];
  const categories = normalizeCategoryRecords(data.categories);
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
    schemaVersion: LEDGER_SCHEMA_VERSION,
    exportedAt: data.exportedAt || data.lastUpdated || new Date().toISOString(),
    accounts: migratedAccounts,
    transactions,
    categories,
    creditCards: migratedCards,
    events: Array.isArray(data.events) ? data.events : [],
    widgets: Array.isArray(data.widgets) ? data.widgets : [],
    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [],
    recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [],
    affordabilitySettings: normalizeAffordabilitySettings(data.affordabilitySettings ?? DEFAULT_AFFORDABILITY_SETTINGS),
    savingsGoals: normalizeSavingsGoals(data.savingsGoals),
    people: Array.isArray(data.people) ? data.people : [],
    sharedObligations: Array.isArray(data.sharedObligations) ? data.sharedObligations : [],
    sharedResponsibilities: Array.isArray(data.sharedResponsibilities) ? data.sharedResponsibilities : [],
    sharedPayments: Array.isArray(data.sharedPayments) ? data.sharedPayments : [],
    sharedSettlements: Array.isArray(data.sharedSettlements) ? data.sharedSettlements : [],
    loanSharingRules: Array.isArray(data.loanSharingRules) ? data.loanSharingRules : [],
    loanContributionRules: Array.isArray(data.loanContributionRules) ? data.loanContributionRules : [],
    sharedObligationTemplates: Array.isArray(data.sharedObligationTemplates) ? data.sharedObligationTemplates : [],
    sharedTemplateResponsibilities: Array.isArray(data.sharedTemplateResponsibilities) ? data.sharedTemplateResponsibilities : [],
    externalLoanContributions: Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : [],
    currency: data.currency || 'INR',
    lastUpdated: new Date().toISOString(),
  };
}
