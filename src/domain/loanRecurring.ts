import type { Account, LoanContributionRule, LoanSharingRule, Person, RecurrenceFrequency, RecurringRule, Transaction } from '../types';
import { advanceRecurringDate, toLocalDateKey } from './recurring';

export const MANAGED_LOAN_SCHEDULE_PREFIX = 'coinbuddy-managed-loan:';

export interface ManagedLoanScheduleConfig {
  accountId: string;
  amount: number;
  frequency: RecurrenceFrequency;
  configuredDate: string;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isSchedulableLoanAccount(account: Account): boolean {
  if (account.is_archived === 1 || account.type !== 'liability') return false;
  if (String(account.group ?? '').trim().toUpperCase() === 'CREDIT CARD') return false;
  return Number(account.monthlyEMI ?? 0) > 0 && Boolean(account.nextEMIDate);
}

/**
 * Returns the amount that should actually leave the tracked user's account.
 * Shared-loan contribution rules remain authoritative: a self contribution of
 * zero must never create a fake cash payment merely because the lender EMI is
 * non-zero.
 */
export function getTrackedLoanScheduleAmount(
  account: Account,
  people: Person[],
  sharingRules: LoanSharingRule[],
  contributionRules: LoanContributionRule[],
): number {
  const fullPayment = Math.max(0, Number(account.monthlyEMI ?? 0));
  const sharing = sharingRules.find(rule => rule.accountId === account.id && rule.isShared);
  if (!sharing) return roundMoney(fullPayment);

  const self = people.find(person => person.isSelf && !person.isArchived);
  if (!self) return 0;
  const contribution = contributionRules.find(rule =>
    rule.accountId === account.id && rule.personId === self.id && rule.isActive
  );
  if (!contribution) return 0;

  const value = Math.max(0, Number(contribution.value) || 0);
  return roundMoney(contribution.mode === 'PERCENT'
    ? fullPayment * Math.min(100, value) / 100
    : value);
}

export function getLoanPaymentSourceAccounts(accounts: Account[]): Account[] {
  const activeAssets = accounts.filter(account => account.type === 'asset' && account.is_archived !== 1);
  const liquidGroups = new Set(['BANK', 'BANK ACCOUNT', 'CASH', 'WALLET', 'CHECKING', 'SAVINGS ACCOUNT']);
  const liquid = activeAssets.filter(account => liquidGroups.has(String(account.group ?? '').trim().toUpperCase()));
  if (liquid.length) return liquid;
  return activeAssets.filter(account => {
    const group = String(account.group ?? '').trim().toUpperCase();
    return group !== 'INVESTMENT' && group !== 'PHYSICAL ASSET';
  });
}

export function serializeManagedLoanSchedule(config: ManagedLoanScheduleConfig): string {
  return `${MANAGED_LOAN_SCHEDULE_PREFIX}${config.accountId}|amount=${roundMoney(config.amount)}|frequency=${config.frequency}|date=${config.configuredDate}`;
}

export function parseManagedLoanSchedule(notes?: string): ManagedLoanScheduleConfig | null {
  if (!notes?.startsWith(MANAGED_LOAN_SCHEDULE_PREFIX)) return null;
  const [accountPart, ...parts] = notes.slice(MANAGED_LOAN_SCHEDULE_PREFIX.length).split('|');
  const values = new Map(parts.map(part => {
    const splitAt = part.indexOf('=');
    return splitAt > 0 ? [part.slice(0, splitAt), part.slice(splitAt + 1)] : [part, ''];
  }));
  const amount = Number(values.get('amount'));
  const frequency = values.get('frequency') as RecurrenceFrequency | undefined;
  const configuredDate = values.get('date') ?? '';
  if (!accountPart || !Number.isFinite(amount) || !frequency || !configuredDate) return null;
  if (!['MONTHLY', 'QUARTERLY', 'ANNUALLY'].includes(frequency)) return null;
  return { accountId: accountPart, amount, frequency, configuredDate };
}

export function isManagedLoanPaymentRule(rule: RecurringRule, accountId?: string): boolean {
  const managed = parseManagedLoanSchedule(rule.notes);
  return Boolean(managed && (!accountId || managed.accountId === accountId));
}

/** Any existing transfer schedule to the lender blocks auto-creation, even if it was created manually. */
export function findLoanPaymentRule(accountId: string, rules: RecurringRule[]): RecurringRule | undefined {
  return rules.find(rule => isManagedLoanPaymentRule(rule, accountId)) ??
    rules.find(rule => rule.transactionType === 'TRANSFER' && rule.toAccountId === accountId);
}

/**
 * For legacy loans whose stored next date is already due/overdue, start the
 * automatic recurring series at the next future occurrence. The existing EMI
 * reminder continues to surface the unpaid current/overdue payment; this avoids
 * silently posting an unsplit historical EMI against principal.
 */
export function nextFutureLoanScheduleDate(
  configuredDate: string,
  frequency: RecurrenceFrequency,
  today = new Date(),
): string {
  let next = configuredDate;
  const todayKey = toLocalDateKey(today);
  const anchorDay = Number(configuredDate.slice(8, 10));
  while (next <= todayKey) next = advanceRecurringDate(next, frequency, anchorDay);
  return next;
}

export function buildManagedLoanRecurringTransaction(
  account: Account,
  sourceAccountId: string,
  amount: number,
  today = new Date(),
): Omit<Transaction, 'id'> {
  if (!isSchedulableLoanAccount(account)) throw new Error('Loan does not have an EMI amount and next payment date.');
  if (!sourceAccountId) throw new Error('Choose the account that pays this EMI.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Tracked EMI contribution must be greater than zero.');

  const configuredDate = String(account.nextEMIDate);
  const frequency = account.paymentFrequency ?? 'MONTHLY';
  const firstScheduleDate = nextFutureLoanScheduleDate(configuredDate, frequency, today);
  return {
    title: `EMI: ${account.name}`,
    subtitle: 'Scheduled loan payment · confirm when it happens',
    amount: roundMoney(amount),
    date: `${firstScheduleDate}T12:00:00`,
    category: '#loanpayment',
    icon: 'Landmark',
    type: 'transfer',
    fromAccountId: sourceAccountId,
    toAccountId: account.id,
    transaction_type: 'TRANSFER',
    isRecurring: true,
    recurrenceFrequency: frequency,
    // Creating the schedule itself must never move cash. Due occurrences are
    // generated by the existing recurring engine as pending confirmations.
    is_verified: 0,
    notes: serializeManagedLoanSchedule({ accountId: account.id, amount, frequency, configuredDate }),
  };
}

/** Returns a managed-rule update only when loan-owned schedule metadata changed. */
export function buildManagedLoanRuleUpdate(
  rule: RecurringRule,
  account: Account,
  amount: number,
  today = new Date(),
): RecurringRule | null {
  const previous = parseManagedLoanSchedule(rule.notes);
  if (!previous || previous.accountId !== account.id || !isSchedulableLoanAccount(account) || amount <= 0) return null;
  const configuredDate = String(account.nextEMIDate);
  const frequency = account.paymentFrequency ?? 'MONTHLY';
  const amountChanged = Math.abs(previous.amount - amount) > 0.009;
  const scheduleChanged = previous.frequency !== frequency || previous.configuredDate !== configuredDate;
  if (!amountChanged && !scheduleChanged) return null;

  const nextDueDate = nextFutureLoanScheduleDate(configuredDate, frequency, today);
  return {
    ...rule,
    title: `EMI: ${account.name}`,
    subtitle: 'Scheduled loan payment · confirm when it happens',
    amount: roundMoney(amount),
    transactionType: 'TRANSFER',
    toAccountId: account.id,
    category: '#loanpayment',
    icon: 'Landmark',
    frequency,
    nextDueDate,
    anchorDay: Number(configuredDate.slice(8, 10)),
    notes: serializeManagedLoanSchedule({ accountId: account.id, amount, frequency, configuredDate }),
  };
}
