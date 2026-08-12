from pathlib import Path
import json


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label}: expected text not found in {path}')
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected exactly one match in {path}, found {text.count(old)}')
    p.write_text(text.replace(old, new, 1))


def write(path: str, content: str):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)

# ---------------------------------------------------------------------------
# Version
# ---------------------------------------------------------------------------
p = Path('package.json')
text = p.read_text().replace('"version": "3.2.0"', '"version": "3.3.0"', 1)
p.write_text(text)
p = Path('package-lock.json')
text = p.read_text().replace('"version": "3.2.0"', '"version": "3.3.0"', 2)
p.write_text(text)
replace_once('src/components/Header.tsx', '>V3.2</span>', '>V3.3</span>', 'header version')
replace_once('src/components/Settings.tsx', 'Coin Buddy V3.2', 'Coin Buddy V3.3', 'settings footer version title')
replace_once('src/components/Settings.tsx', 'CoinBuddy <strong className="font-numeric text-on-surface">v3.2</strong>', 'CoinBuddy <strong className="font-numeric text-on-surface">v3.3</strong>', 'settings footer build version')

# ---------------------------------------------------------------------------
# Types: Goal link on transactions and recurring schedules
# ---------------------------------------------------------------------------
p = Path('src/types.ts')
text = p.read_text()
text = text.replace('  eventId?: string;\n  transaction_type?: TransactionType;', '  eventId?: string;\n  goalId?: string;\n  transaction_type?: TransactionType;', 1)
text = text.replace('  eventId?: string;\n  anchorDay?: number;\n}', '  eventId?: string;\n  goalId?: string;\n  anchorDay?: number;\n}', 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# SQLite schema + integrity checks for goal links
# ---------------------------------------------------------------------------
p = Path('src/db/sqliteSchema.ts')
text = p.read_text()
text = text.replace('  event_id TEXT,\n  FOREIGN KEY (from_account_id)', '  event_id TEXT,\n  goal_id TEXT,\n  FOREIGN KEY (from_account_id)', 1)
text = text.replace('  event_id TEXT,\n  anchor_day INTEGER CHECK(anchor_day BETWEEN 1 AND 31),', '  event_id TEXT,\n  goal_id TEXT,\n  anchor_day INTEGER CHECK(anchor_day BETWEEN 1 AND 31),', 1)
text = text.replace('  `ALTER TABLE categories ADD COLUMN affordability_class TEXT;`,', '  `ALTER TABLE categories ADD COLUMN affordability_class TEXT;`,\n  `ALTER TABLE transactions ADD COLUMN goal_id TEXT;`,\n  `ALTER TABLE recurring_rules ADD COLUMN goal_id TEXT;`,', 1)
needle = '''  for (const goal of goals) {
    const id = String(goal?.id ?? '');
    if (!id) { addIssue('GOAL_ID', 'warning', 'A Goal is missing its identifier.'); continue; }
    if (goalIds.has(id)) addIssue('GOAL_ID', 'warning', `Goal ${String(goal?.name ?? id)} has a duplicate identifier.`, id);
    goalIds.add(id);
    if (!Number.isFinite(Number(goal?.targetAmount)) || Number(goal.targetAmount) <= 0) addIssue('GOAL_TARGET', 'warning', `Goal ${String(goal?.name ?? id)} has an invalid target amount.`, id);
    if (goal?.linkedAccountId) {
      const linked = accountMap.get(String(goal.linkedAccountId));
      if (!linked) addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} points to a missing account.`, id);
      else if (Number(linked.is_archived) === 1) addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} points to archived account ${String(linked.name)}.`, id);
      else if (linked.type !== 'ASSET') addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} is linked to a liability instead of an asset.`, id);
      if (goal?.protectLinkedBalance && linked) {
        const group = String(linked.subtype ?? '').trim().toLowerCase();
        if (group === 'investment' || group === 'physical asset') addIssue('GOAL_PROTECTED_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} cannot protect a non-liquid ${String(linked.subtype)} balance as cash reserve.`, id);
      }
    }
  }

  return {'''
replacement = '''  for (const goal of goals) {
    const id = String(goal?.id ?? '');
    if (!id) { addIssue('GOAL_ID', 'warning', 'A Goal is missing its identifier.'); continue; }
    if (goalIds.has(id)) addIssue('GOAL_ID', 'warning', `Goal ${String(goal?.name ?? id)} has a duplicate identifier.`, id);
    goalIds.add(id);
    if (!Number.isFinite(Number(goal?.targetAmount)) || Number(goal.targetAmount) <= 0) addIssue('GOAL_TARGET', 'warning', `Goal ${String(goal?.name ?? id)} has an invalid target amount.`, id);
    if (goal?.linkedAccountId) {
      const linked = accountMap.get(String(goal.linkedAccountId));
      if (!linked) addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} points to a missing account.`, id);
      else if (Number(linked.is_archived) === 1) addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} points to archived account ${String(linked.name)}.`, id);
      else if (linked.type !== 'ASSET') addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} is linked to a liability instead of an asset.`, id);
      if (goal?.protectLinkedBalance && linked) {
        const group = String(linked.subtype ?? '').trim().toLowerCase();
        if (group === 'investment' || group === 'physical asset') addIssue('GOAL_PROTECTED_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} cannot protect a non-liquid ${String(linked.subtype)} balance as cash reserve.`, id);
      }
    }
  }

  const transactionGoalLinks = await db.query(`SELECT id, title, goal_id FROM transactions WHERE goal_id IS NOT NULL AND goal_id <> ''`);
  for (const row of transactionGoalLinks) {
    if (!goalIds.has(String(row.goal_id))) addIssue('GOAL_TRANSACTION_LINK', 'warning', `Transaction “${String(row.title ?? row.id)}” points to a Goal that no longer exists.`, String(row.id));
  }
  const recurringGoalLinks = await db.query(`SELECT id, title, goal_id FROM recurring_rules WHERE goal_id IS NOT NULL AND goal_id <> ''`);
  for (const row of recurringGoalLinks) {
    if (!goalIds.has(String(row.goal_id))) addIssue('GOAL_RECURRING_LINK', 'warning', `Recurring schedule “${String(row.title ?? row.id)}” points to a Goal that no longer exists.`, String(row.id));
  }

  return {'''
if needle not in text:
    raise SystemExit('sqlite goal audit block not found')
text = text.replace(needle, replacement, 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# DB client: persist goal links on ledger and recurring rows
# ---------------------------------------------------------------------------
p = Path('src/db/dbClient.ts')
text = p.read_text()
text = text.replace('    eventId: row.event_id ?? undefined,\n    transaction_type:', '    eventId: row.event_id ?? undefined,\n    goalId: row.goal_id ?? undefined,\n    transaction_type:', 1)
text = text.replace('    eventId: row.event_id ?? undefined,\n    anchorDay:', '    eventId: row.event_id ?? undefined,\n    goalId: row.goal_id ?? undefined,\n    anchorDay:', 1)
old = '''    `INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only, recurring_rule_id, due_date, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.recurringRuleId ?? null, tx.dueDate ?? null, tx.eventId ?? null]'''
new = '''    `INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only, recurring_rule_id, due_date, event_id, goal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.recurringRuleId ?? null, tx.dueDate ?? null, tx.eventId ?? null, tx.goalId ?? null]'''
if old not in text: raise SystemExit('insert tx block not found')
text = text.replace(old, new, 1)
old = '''    `UPDATE transactions SET transaction_type = ?, title = ?, subtitle = ?, amount = ?, date = ?, category = ?, icon = ?, account = ?, from_account_id = ?, to_account_id = ?, notes = ?, is_verified = ?, is_recurring = ?, is_opening_balance = ?, is_interest_only = ?, event_id = ? WHERE id = ?;`,
    [parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.eventId ?? null, id]'''
new = '''    `UPDATE transactions SET transaction_type = ?, title = ?, subtitle = ?, amount = ?, date = ?, category = ?, icon = ?, account = ?, from_account_id = ?, to_account_id = ?, notes = ?, is_verified = ?, is_recurring = ?, is_opening_balance = ?, is_interest_only = ?, event_id = ?, goal_id = ? WHERE id = ?;`,
    [parsedType, tx.title, tx.subtitle ?? null, amount, new Date(tx.date).getTime(), tx.category ?? null, tx.icon ?? null, tx.account ?? null, tx.fromAccountId ?? null, tx.toAccountId ?? null, tx.notes ?? null, tx.is_verified ?? 1, tx.isRecurring ? 1 : 0, tx.isOpeningBalance ? 1 : 0, tx.isInterestOnly ? 1 : 0, tx.eventId ?? null, tx.goalId ?? null, id]'''
if old not in text: raise SystemExit('update tx block not found')
text = text.replace(old, new, 1)
old = '''    `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, frequency, next_due_date, is_active, event_id, anchor_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, template.title, template.subtitle ?? null, amount, type, template.account ?? null, fromAccountId ?? null, toAccountId ?? null, template.category ?? null, template.icon ?? null, template.notes ?? null, template.isInterestOnly ? 1 : 0, frequency, nextDueDate, 1, template.eventId ?? null, anchorDay]'''
new = '''    `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, frequency, next_due_date, is_active, event_id, goal_id, anchor_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, template.title, template.subtitle ?? null, amount, type, template.account ?? null, fromAccountId ?? null, toAccountId ?? null, template.category ?? null, template.icon ?? null, template.notes ?? null, template.isInterestOnly ? 1 : 0, frequency, nextDueDate, 1, template.eventId ?? null, template.goalId ?? null, anchorDay]'''
if old not in text: raise SystemExit('create recurring block not found')
text = text.replace(old, new, 1)
old = '''    `UPDATE recurring_rules SET title = ?, subtitle = ?, amount = ?, transaction_type = ?, account = ?, from_account_id = ?, to_account_id = ?, category = ?, icon = ?, notes = ?, is_interest_only = ?, frequency = ?, next_due_date = ?, is_active = ?, event_id = ?, anchor_day = ? WHERE id = ?;`,
    [rule.title.trim() || 'Recurring payment', rule.subtitle ?? null, amount, rule.transactionType, rule.account ?? null, rule.fromAccountId ?? null, rule.toAccountId ?? null, rule.category ?? null, rule.icon ?? null, rule.notes ?? null, rule.isInterestOnly ? 1 : 0, rule.frequency, rule.nextDueDate, rule.isActive ? 1 : 0, rule.eventId ?? null, rule.anchorDay ?? Number(rule.nextDueDate.slice(8, 10)), rule.id]'''
new = '''    `UPDATE recurring_rules SET title = ?, subtitle = ?, amount = ?, transaction_type = ?, account = ?, from_account_id = ?, to_account_id = ?, category = ?, icon = ?, notes = ?, is_interest_only = ?, frequency = ?, next_due_date = ?, is_active = ?, event_id = ?, goal_id = ?, anchor_day = ? WHERE id = ?;`,
    [rule.title.trim() || 'Recurring payment', rule.subtitle ?? null, amount, rule.transactionType, rule.account ?? null, rule.fromAccountId ?? null, rule.toAccountId ?? null, rule.category ?? null, rule.icon ?? null, rule.notes ?? null, rule.isInterestOnly ? 1 : 0, rule.frequency, rule.nextDueDate, rule.isActive ? 1 : 0, rule.eventId ?? null, rule.goalId ?? null, rule.anchorDay ?? Number(rule.nextDueDate.slice(8, 10)), rule.id]'''
if old not in text: raise SystemExit('update recurring block not found')
text = text.replace(old, new, 1)
text = text.replace('recurringRuleId: rule.id, dueDate: d, eventId: rule.event_id ?? undefined,', 'recurringRuleId: rule.id, dueDate: d, eventId: rule.event_id ?? undefined, goalId: rule.goal_id ?? undefined,', 1)
# import recurring rows
old = '''executePreparedRows(driver, `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, frequency, next_due_date, is_active, event_id, anchor_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, recurringRules.map(rule => [rule.id, rule.title, rule.subtitle ?? null, Math.abs(Number(rule.amount)), rule.transactionType, rule.account ?? null, rule.fromAccountId ?? null, rule.toAccountId ?? null, rule.category ?? null, rule.icon ?? null, rule.notes ?? null, rule.isInterestOnly ? 1 : 0, rule.frequency ?? 'MONTHLY', rule.nextDueDate, rule.isActive === false ? 0 : 1, rule.eventId ?? null, rule.anchorDay ?? Number(String(rule.nextDueDate).slice(8, 10))]));'''
new = '''executePreparedRows(driver, `INSERT INTO recurring_rules (id, title, subtitle, amount, transaction_type, account, from_account_id, to_account_id, category, icon, notes, is_interest_only, frequency, next_due_date, is_active, event_id, goal_id, anchor_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, recurringRules.map(rule => [rule.id, rule.title, rule.subtitle ?? null, Math.abs(Number(rule.amount)), rule.transactionType, rule.account ?? null, rule.fromAccountId ?? null, rule.toAccountId ?? null, rule.category ?? null, rule.icon ?? null, rule.notes ?? null, rule.isInterestOnly ? 1 : 0, rule.frequency ?? 'MONTHLY', rule.nextDueDate, rule.isActive === false ? 0 : 1, rule.eventId ?? null, rule.goalId ?? null, rule.anchorDay ?? Number(String(rule.nextDueDate).slice(8, 10))]));'''
if old not in text: raise SystemExit('import recurring prepared block not found')
text = text.replace(old, new, 1)
old = '''executePreparedRows(driver, `INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only, recurring_rule_id, due_date, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, transactions.map(tx => {'''
new = '''executePreparedRows(driver, `INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only, recurring_rule_id, due_date, event_id, goal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, transactions.map(tx => {'''
if old not in text: raise SystemExit('import tx prepared query not found')
text = text.replace(old, new, 1)
text = text.replace('tx.recurringRuleId ?? null, tx.dueDate ?? null, tx.eventId ?? null];', 'tx.recurringRuleId ?? null, tx.dueDate ?? null, tx.eventId ?? null, tx.goalId ?? null];', 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# Savings goal progress from verified linked ledger contributions
# ---------------------------------------------------------------------------
p = Path('src/domain/savingsGoals.ts')
text = p.read_text()
text = text.replace("import type { Account, SavingsGoal, SavingsGoalPriority, SavingsGoalType } from '../types';", "import type { Account, SavingsGoal, SavingsGoalPriority, SavingsGoalType, Transaction } from '../types';")
old = '''export function getGoalCurrentAmount(goal: SavingsGoal, accounts: Account[]): number {
  if (goal.linkedAccountId) {
    const account = accounts.find(item => item.id === goal.linkedAccountId && item.is_archived !== 1);
    if (account) return nonNegative(account.balance);
  }
  return nonNegative(goal.manualSavedAmount);
}

export function getGoalProgressPercent(goal: SavingsGoal, accounts: Account[]): number {
  if (goal.targetAmount <= 0) return 0;
  return Math.min(100, (getGoalCurrentAmount(goal, accounts) / goal.targetAmount) * 100);
}

export function getRequiredMonthlyContribution(goal: SavingsGoal, accounts: Account[], asOfDate = new Date()): number {
  if (!goal.targetDate || goal.targetAmount <= 0) return 0;
  const target = new Date(`${goal.targetDate}T12:00:00`);
  if (Number.isNaN(target.getTime()) || target <= asOfDate) return Math.max(0, goal.targetAmount - getGoalCurrentAmount(goal, accounts));
  const months = Math.max(1,
    (target.getFullYear() - asOfDate.getFullYear()) * 12 +
    (target.getMonth() - asOfDate.getMonth()) +
    (target.getDate() >= asOfDate.getDate() ? 1 : 0),
  );
  return Math.max(0, goal.targetAmount - getGoalCurrentAmount(goal, accounts)) / months;
}'''
new = '''export function getGoalLedgerContributions(goalId: string, transactions: Transaction[] = []): number {
  return transactions
    .filter(transaction => transaction.goalId === goalId && transaction.is_verified !== 0 && transaction.type !== 'income' && !transaction.isOpeningBalance)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
}

export function getGoalCurrentAmount(goal: SavingsGoal, accounts: Account[], transactions: Transaction[] = []): number {
  if (goal.linkedAccountId) {
    const account = accounts.find(item => item.id === goal.linkedAccountId && item.is_archived !== 1);
    if (account) return nonNegative(account.balance);
  }
  return nonNegative(goal.manualSavedAmount) + getGoalLedgerContributions(goal.id, transactions);
}

export function getGoalProgressPercent(goal: SavingsGoal, accounts: Account[], transactions: Transaction[] = []): number {
  if (goal.targetAmount <= 0) return 0;
  return Math.min(100, (getGoalCurrentAmount(goal, accounts, transactions) / goal.targetAmount) * 100);
}

export function getRequiredMonthlyContribution(goal: SavingsGoal, accounts: Account[], transactions: Transaction[] = [], asOfDate = new Date()): number {
  if (!goal.targetDate || goal.targetAmount <= 0) return 0;
  const target = new Date(`${goal.targetDate}T12:00:00`);
  if (Number.isNaN(target.getTime()) || target <= asOfDate) return Math.max(0, goal.targetAmount - getGoalCurrentAmount(goal, accounts, transactions));
  const months = Math.max(1,
    (target.getFullYear() - asOfDate.getFullYear()) * 12 +
    (target.getMonth() - asOfDate.getMonth()) +
    (target.getDate() >= asOfDate.getDate() ? 1 : 0),
  );
  return Math.max(0, goal.targetAmount - getGoalCurrentAmount(goal, accounts, transactions)) / months;
}'''
if old not in text: raise SystemExit('savings goal current block not found')
text = text.replace(old, new, 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# Upcoming money domain
# ---------------------------------------------------------------------------
write('src/domain/upcomingMoney.ts', r'''import type { Account, CreditCardInfo, RecurringRule, SavingsGoal, Transaction } from '../types';
import { isLiquidCashAccount } from './affordability';
import { advanceRecurringDate } from './recurring';

export type UpcomingMoneyKind = 'INCOME' | 'OBLIGATION' | 'SAVINGS' | 'TRANSFER';
export type UpcomingMoneyStatus = 'SCHEDULED' | 'NEEDS_CONFIRMATION';

export interface UpcomingMoneyItem {
  id: string;
  date: string;
  title: string;
  amount: number;
  kind: UpcomingMoneyKind;
  status: UpcomingMoneyStatus;
  source: 'RECURRING' | 'PENDING' | 'CREDIT_CARD' | 'LOAN' | 'GOAL';
  sourceId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  goalId?: string;
}

export interface UpcomingMoneyProjection {
  items: UpcomingMoneyItem[];
  warnings: string[];
  totals: {
    openingLiquidCash: number;
    expectedIncome: number;
    obligations: number;
    savings: number;
    transfers: number;
    projectedFreeCash: number;
  };
}

export interface UpcomingMoneyInput {
  asOfDate: string;
  startDate: string;
  endDate: string;
  accounts: Account[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  creditCards: CreditCardInfo[];
  savingsGoals: SavingsGoal[];
}

function key(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function inRange(value: string, start: string, end: string): boolean {
  const date = key(value);
  return Boolean(date && date >= start && date <= end);
}

function accountGroup(account?: Account): string {
  return String(account?.group ?? '').trim().toLowerCase();
}

function classify(type: 'income' | 'expense' | 'transfer' | 'INCOME' | 'EXPENSE' | 'TRANSFER', toAccount: Account | undefined, goalId?: string): UpcomingMoneyKind {
  const normalized = String(type).toUpperCase();
  if (normalized === 'INCOME') return 'INCOME';
  if (normalized === 'EXPENSE') return 'OBLIGATION';
  if (toAccount?.type === 'liability') return 'OBLIGATION';
  if (goalId || accountGroup(toAccount) === 'investment') return 'SAVINGS';
  return 'TRANSFER';
}

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.abs(parsed)) : 0;
}

function uniqueWarnings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildUpcomingMoneyProjection(input: UpcomingMoneyInput): UpcomingMoneyProjection {
  const accountMap = new Map(input.accounts.map(account => [account.id, account]));
  const items: UpcomingMoneyItem[] = [];
  const warnings: string[] = [];
  const pendingIdentities = new Set<string>();

  for (const transaction of input.transactions) {
    if (transaction.is_verified !== 0 || transaction.isOpeningBalance) continue;
    const date = transaction.dueDate ?? key(transaction.date);
    if (!inRange(date, input.startDate, input.endDate)) continue;
    if (transaction.recurringRuleId && transaction.dueDate) pendingIdentities.add(`${transaction.recurringRuleId}:${transaction.dueDate}`);
    const to = transaction.toAccountId ? accountMap.get(transaction.toAccountId) : undefined;
    const sourceId = transaction.fromAccountId ?? (transaction.type === 'expense' ? transaction.account : undefined);
    const destinationId = transaction.toAccountId ?? (transaction.type === 'income' ? transaction.account : undefined);
    items.push({
      id: `pending:${transaction.id}`,
      date,
      title: transaction.title,
      amount: amount(transaction.amount),
      kind: classify(transaction.type, to, transaction.goalId),
      status: 'NEEDS_CONFIRMATION',
      source: 'PENDING',
      sourceId: transaction.id,
      fromAccountId: sourceId,
      toAccountId: destinationId,
      goalId: transaction.goalId,
    });
  }

  for (const rule of input.recurringRules.filter(rule => rule.isActive)) {
    let due = rule.nextDueDate;
    const anchor = rule.anchorDay ?? Number(rule.nextDueDate.slice(8, 10));
    let guard = 0;
    while (due < input.startDate && guard++ < 60) due = advanceRecurringDate(due, rule.frequency, anchor);
    while (due <= input.endDate && guard++ < 120) {
      const identity = `${rule.id}:${due}`;
      if (!pendingIdentities.has(identity)) {
        const to = rule.toAccountId ? accountMap.get(rule.toAccountId) : undefined;
        items.push({
          id: `rule:${rule.id}:${due}`,
          date: due,
          title: rule.title,
          amount: amount(rule.amount),
          kind: classify(rule.transactionType, to, rule.goalId),
          status: 'SCHEDULED',
          source: 'RECURRING',
          sourceId: rule.id,
          fromAccountId: rule.fromAccountId ?? (rule.transactionType === 'EXPENSE' ? rule.account : undefined),
          toAccountId: rule.toAccountId ?? (rule.transactionType === 'INCOME' ? rule.account : undefined),
          goalId: rule.goalId,
        });
      }
      due = advanceRecurringDate(due, rule.frequency, anchor);
    }
  }

  // Explicit card due amounts are obligations when a recurring payment does not already cover the card in the period.
  for (const card of input.creditCards) {
    if (!card.dueDate || !inRange(card.dueDate, input.startDate, input.endDate) || amount(card.dueAmount) <= 0) continue;
    const alreadyCovered = items.some(item => item.kind === 'OBLIGATION' && item.toAccountId === card.id);
    if (!alreadyCovered) items.push({
      id: `card:${card.id}:${card.dueDate}`,
      date: key(card.dueDate),
      title: `${card.name} due`,
      amount: amount(card.dueAmount),
      kind: 'OBLIGATION', status: 'SCHEDULED', source: 'CREDIT_CARD', sourceId: card.id, toAccountId: card.id,
    });
  }

  // Loan EMI metadata provides a fallback when no recurring rule exists.
  for (const account of input.accounts) {
    if (account.type !== 'liability' || account.is_archived === 1 || !account.nextEMIDate || !inRange(account.nextEMIDate, input.startDate, input.endDate) || amount(account.monthlyEMI) <= 0) continue;
    const alreadyCovered = items.some(item => item.kind === 'OBLIGATION' && item.toAccountId === account.id);
    if (!alreadyCovered) items.push({
      id: `loan:${account.id}:${account.nextEMIDate}`,
      date: key(account.nextEMIDate), title: `${account.name} EMI`, amount: amount(account.monthlyEMI),
      kind: 'OBLIGATION', status: 'SCHEDULED', source: 'LOAN', sourceId: account.id, toAccountId: account.id,
    });
  }

  // Active goals protect at least their planned monthly amount. Explicit Goal-linked schedules cover this floor first.
  for (const goal of input.savingsGoals.filter(goal => goal.isActive && goal.monthlyContribution > 0)) {
    const explicitlyScheduled = items.filter(item => item.goalId === goal.id && item.kind === 'SAVINGS').reduce((sum, item) => sum + item.amount, 0);
    const uncovered = Math.max(0, amount(goal.monthlyContribution) - explicitlyScheduled);
    if (uncovered > 0) items.push({
      id: `goal:${goal.id}:${input.startDate}`,
      date: input.startDate,
      title: `${goal.name} contribution`,
      amount: uncovered,
      kind: 'SAVINGS', status: 'SCHEDULED', source: 'GOAL', sourceId: goal.id, goalId: goal.id,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  for (const item of items) {
    if (item.fromAccountId) {
      const source = accountMap.get(item.fromAccountId);
      if (!source) warnings.push(`${item.title} points to a missing funding account.`);
      else if (source.is_archived === 1) warnings.push(`${item.title} uses archived funding account ${source.name}.`);
      else if ((item.kind === 'OBLIGATION' || item.kind === 'SAVINGS') && source.type === 'asset' && item.amount > Math.max(0, Number(source.balance) || 0)) warnings.push(`${source.name} currently has less than ${item.title} requires.`);
    }
    if (item.toAccountId) {
      const destination = accountMap.get(item.toAccountId);
      if (!destination) warnings.push(`${item.title} points to a missing destination account.`);
      else if (destination.is_archived === 1) warnings.push(`${item.title} uses archived destination account ${destination.name}.`);
    }
  }

  const openingLiquidCash = input.accounts.filter(account => account.type === 'asset' && account.is_archived !== 1 && isLiquidCashAccount(account)).reduce((sum, account) => sum + Math.max(0, Number(account.balance) || 0), 0);
  const expectedIncome = items.filter(item => item.kind === 'INCOME').reduce((sum, item) => sum + item.amount, 0);
  const obligations = items.filter(item => item.kind === 'OBLIGATION').reduce((sum, item) => sum + item.amount, 0);
  const savings = items.filter(item => item.kind === 'SAVINGS').reduce((sum, item) => sum + item.amount, 0);
  const transfers = items.filter(item => item.kind === 'TRANSFER').reduce((sum, item) => sum + item.amount, 0);
  const projectedFreeCash = openingLiquidCash + expectedIncome - obligations - savings;

  return { items, warnings: uniqueWarnings(warnings), totals: { openingLiquidCash, expectedIncome, obligations, savings, transfers, projectedFreeCash } };
}
''')

write('src/domain/upcomingMoney.test.ts', r'''import { describe, expect, it } from 'vitest';
import { buildUpcomingMoneyProjection } from './upcomingMoney';
import type { Account, RecurringRule, SavingsGoal, Transaction } from '../types';

const accounts: Account[] = [
  { id: 'bank', name: 'Bank', type: 'asset', group: 'Bank Account', balance: 50000 },
  { id: 'invest', name: 'Mutual Fund', type: 'asset', group: 'Investment', balance: 10000 },
  { id: 'loan', name: 'Loan', type: 'liability', group: 'Loan', balance: 20000 },
];
const rule = (overrides: Partial<RecurringRule>): RecurringRule => ({ id: 'r', title: 'Rule', amount: 1000, transactionType: 'EXPENSE', fromAccountId: 'bank', frequency: 'MONTHLY', nextDueDate: '2026-09-01', isActive: true, ...overrides });
const goal: SavingsGoal = { id: 'g1', name: 'Laptop', type: 'PURCHASE', targetAmount: 80000, monthlyContribution: 5000, manualSavedAmount: 0, protectLinkedBalance: false, priority: 'MEDIUM', isActive: true, createdAt: '2026-01-01' };

function project(recurringRules: RecurringRule[], transactions: Transaction[] = [], goals: SavingsGoal[] = []) {
  return buildUpcomingMoneyProjection({ asOfDate: '2026-08-12', startDate: '2026-08-25', endDate: '2026-09-24', accounts, transactions, recurringRules, creditCards: [], savingsGoals: goals });
}

describe('Upcoming Money projection', () => {
  it('separates income, obligations, savings and neutral liquid transfers', () => {
    const result = project([
      rule({ id: 'salary', title: 'Salary', transactionType: 'INCOME', fromAccountId: undefined, toAccountId: 'bank', amount: 60000 }),
      rule({ id: 'rent', title: 'Rent', amount: 15000 }),
      rule({ id: 'sip', title: 'SIP', transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'invest', amount: 10000 }),
      rule({ id: 'move', title: 'Move cash', transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'bank', amount: 1000 }),
    ]);
    expect(result.totals.expectedIncome).toBe(60000);
    expect(result.totals.obligations).toBe(15000);
    expect(result.totals.savings).toBe(10000);
    expect(result.totals.transfers).toBe(1000);
    expect(result.totals.projectedFreeCash).toBe(85000);
  });

  it('does not double count a generated pending recurring occurrence', () => {
    const transactions: Transaction[] = [{ id: 'p1', title: 'Rent', subtitle: '', amount: -15000, date: '2026-09-01T12:00:00.000Z', category: '#rent', icon: 'Home', type: 'expense', fromAccountId: 'bank', is_verified: 0, isRecurring: true, recurringRuleId: 'rent', dueDate: '2026-09-01' }];
    const result = project([rule({ id: 'rent', title: 'Rent', amount: 15000 })], transactions);
    expect(result.items.filter(item => item.title === 'Rent')).toHaveLength(1);
    expect(result.items[0].status).toBe('NEEDS_CONFIRMATION');
  });

  it('protects uncovered active goal contributions without double counting Goal-linked schedules', () => {
    const result = project([rule({ id: 'goal-rule', title: 'Laptop saving', transactionType: 'TRANSFER', fromAccountId: 'bank', toAccountId: 'invest', amount: 3000, goalId: 'g1' })], [], [goal]);
    expect(result.items.filter(item => item.kind === 'SAVINGS').reduce((sum, item) => sum + item.amount, 0)).toBe(5000);
    expect(result.items.some(item => item.source === 'GOAL' && item.amount === 2000)).toBe(true);
  });
});
''')

# ---------------------------------------------------------------------------
# Upcoming Money UI
# ---------------------------------------------------------------------------
write('src/components/UpcomingMoney.tsx', r'''import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CalendarDays, ChevronDown, ChevronUp, PiggyBank } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { buildUpcomingMoneyProjection, type UpcomingMoneyKind } from '../domain/upcomingMoney';
import { getCycleDetailsForDay, getCycleRange, shiftCycle } from '../utils/cycles';

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const kindMeta: Record<UpcomingMoneyKind, { label: string; icon: typeof ArrowUpRight; classes: string }> = {
  INCOME: { label: 'Income', icon: ArrowDownLeft, classes: 'text-emerald-500 bg-emerald-500/10' },
  OBLIGATION: { label: 'Obligation', icon: ArrowUpRight, classes: 'text-rose-500 bg-rose-500/10' },
  SAVINGS: { label: 'Savings', icon: PiggyBank, classes: 'text-primary bg-primary/10' },
  TRANSFER: { label: 'Transfer', icon: ArrowRightLeft, classes: 'text-on-surface-variant bg-surface-container-highest' },
};

export function UpcomingMoney() {
  const { accounts, transactions, recurringRules, creditCards, savingsGoals, monthCycleDay, formatCurrency } = useAppContext();
  const [expanded, setExpanded] = useState(true);
  const horizon = useMemo(() => {
    const today = new Date();
    const current = getCycleDetailsForDay(today.toISOString(), monthCycleDay);
    const next = shiftCycle(current.year, current.month, 1);
    const range = getCycleRange(next.year, next.month, monthCycleDay);
    return { asOfDate: localDateKey(today), startDate: localDateKey(range.start), endDate: localDateKey(range.end), label: `${range.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${range.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` };
  }, [monthCycleDay]);
  const projection = useMemo(() => buildUpcomingMoneyProjection({ ...horizon, accounts, transactions, recurringRules, creditCards, savingsGoals }), [horizon, accounts, transactions, recurringRules, creditCards, savingsGoals]);

  return (
    <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-low overflow-hidden shadow-sm" data-testid="upcoming-money">
      <button type="button" onClick={() => setExpanded(value => !value)} className="w-full p-5 sm:p-6 flex items-start justify-between gap-4 text-left">
        <div>
          <div className="flex items-center gap-2 text-primary"><CalendarDays className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">Upcoming Money</span></div>
          <h3 className="mt-2 text-xl sm:text-2xl font-bold text-on-surface">Your next financial cycle at a glance</h3>
          <p className="mt-1 text-sm text-on-surface-variant">{horizon.label} · recurring income, bills, EMIs, card dues, SIPs and Goal contributions.</p>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 shrink-0 text-on-surface-variant" /> : <ChevronDown className="h-5 w-5 shrink-0 text-on-surface-variant" />}
      </button>
      {expanded && <div className="border-t border-outline-variant/20 p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ['Liquid cash now', projection.totals.openingLiquidCash],
            ['Expected income', projection.totals.expectedIncome],
            ['Known obligations', projection.totals.obligations],
            ['Planned savings', projection.totals.savings],
            ['Projected free cash', projection.totals.projectedFreeCash],
          ].map(([label, value], index) => <div key={String(label)} className={`${index === 4 ? 'col-span-2 lg:col-span-1 border-primary/25 bg-primary/5' : 'border-outline-variant/20 bg-surface-container'} min-w-0 rounded-2xl border p-3.5`}><span className="text-xs text-on-surface-variant">{label}</span><strong className="mt-1 block truncate font-numeric text-lg text-on-surface">{formatCurrency(Number(value))}</strong></div>)}
        </div>

        {projection.warnings.length > 0 && <div className="space-y-2">{projection.warnings.slice(0, 4).map(warning => <div key={warning} className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-on-surface"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span>{warning}</span></div>)}</div>}

        <div className="space-y-2">
          {projection.items.length === 0 ? <div className="rounded-2xl border border-dashed border-outline-variant/40 p-6 text-center text-sm text-on-surface-variant">No known scheduled money movements in this next cycle yet.</div> : projection.items.map(item => {
            const meta = kindMeta[item.kind];
            const Icon = meta.icon;
            return <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container px-3.5 py-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.classes}`}><Icon className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-on-surface">{item.title}</p>{item.status === 'NEEDS_CONFIRMATION' && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-500">Needs confirmation</span>}</div><p className="mt-0.5 text-xs text-on-surface-variant">{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {meta.label}</p></div>
              <span className={`shrink-0 font-numeric text-sm font-bold ${item.kind === 'INCOME' ? 'text-emerald-500' : item.kind === 'TRANSFER' ? 'text-on-surface-variant' : 'text-on-surface'}`}>{item.kind === 'INCOME' ? '+' : item.kind === 'TRANSFER' ? '' : '-'}{formatCurrency(item.amount)}</span>
            </div>;
          })}
        </div>
        {projection.totals.transfers > 0 && <p className="text-xs leading-relaxed text-on-surface-variant">Internal liquid-account transfers are shown in the timeline but do not reduce projected free cash. Transfers into investments or Goals are treated as planned savings.</p>}
      </div>}
    </section>
  );
}
''')

# Insert UpcomingMoney into Insights
p = Path('src/components/Insights.tsx')
text = p.read_text()
text = text.replace("import { AffordabilityPlanner } from './AffordabilityPlanner';", "import { AffordabilityPlanner } from './AffordabilityPlanner';\nimport { UpcomingMoney } from './UpcomingMoney';", 1)
text = text.replace('      <AffordabilityPlanner />', '      <UpcomingMoney />\n\n      <AffordabilityPlanner />', 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# Transaction UI Goal linking
# ---------------------------------------------------------------------------
p = Path('src/components/AddTransactionModal.tsx')
text = p.read_text()
text = text.replace('categories, events, recurringRules, createEvent, setManageCategoriesOpen', 'categories, events, recurringRules, savingsGoals, createEvent, setManageCategoriesOpen', 1)
text = text.replace("  const [groupId, setGroupId] = useState('');", "  const [groupId, setGroupId] = useState('');\n  const [goalId, setGoalId] = useState('');", 1)
text = text.replace("      setGroupId(events.find(event => event.id === editingTransaction.eventId)?.name || '');", "      setGroupId(events.find(event => event.id === editingTransaction.eventId)?.name || '');\n      setGoalId(editingTransaction.goalId || '');", 1)
text = text.replace("      setGroupId('');\n      setCategoryId(categories[0]?.id || '');", "      setGroupId('');\n      setGoalId('');\n      setCategoryId(categories[0]?.id || '');", 1)
text = text.replace('      is_verified: shouldRemainPending ? 0 : 1\n    };', '      is_verified: shouldRemainPending ? 0 : 1,\n      goalId: goalId || undefined\n    };', 1)
marker = '''</div>\n\n{editingTransaction ? null : ('''.replace('\\n','\n')
goal_ui = '''</div>

{type !== 'income' && savingsGoals.length > 0 && (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Goal contribution (optional)</label>
    <select aria-label="Goal contribution" value={goalId} onChange={event => setGoalId(event.target.value)} className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:border-primary/60">
      <option value="">No goal</option>
      {savingsGoals.filter(goal => goal.isActive).map(goal => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
    </select>
    <p className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">After confirmation, this transfer/expense advances an unlinked Goal automatically. Goals linked to an account use that account balance instead, so CoinBuddy never double-counts the contribution.</p>
  </div>
)}

{editingTransaction ? null : ('''
if marker not in text: raise SystemExit('AddTransaction goal UI marker not found')
text = text.replace(marker, goal_ui, 1)
p.write_text(text)

# Goals panel uses transaction-linked progress
p = Path('src/components/GoalsPanel.tsx')
text = p.read_text()
text = text.replace('    accounts,\n    formatCurrency,', '    accounts,\n    transactions,\n    formatCurrency,', 1)
text = text.replace('const current = getGoalCurrentAmount(goal, accounts);\n          const percent = getGoalProgressPercent(goal, accounts);\n          const required = getRequiredMonthlyContribution(goal, accounts);', 'const current = getGoalCurrentAmount(goal, accounts, transactions);\n          const percent = getGoalProgressPercent(goal, accounts, transactions);\n          const required = getRequiredMonthlyContribution(goal, accounts, transactions);', 1)
text = text.replace("{linked ? `Tracked from ${linked.name}` : 'Progress entered manually'}", "{linked ? `Tracked from ${linked.name}` : 'Manual progress + verified Goal-linked contributions'}", 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# Recurring payment status + warnings
# ---------------------------------------------------------------------------
p = Path('src/components/RecurringPayments.tsx')
text = p.read_text()
text = text.replace("import { useEffect, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';")
text = text.replace("CalendarClock, Pause, Play, SkipForward, Trash2, Pencil, Save, X, LockKeyhole", "CalendarClock, Pause, Play, SkipForward, Trash2, Pencil, Save, X, LockKeyhole, AlertTriangle")
text = text.replace('const { recurringRules, events, formatCurrency, updateRecurringRule, deleteRecurringRule, skipRecurringRule } = useAppContext();', 'const { recurringRules, events, accounts, transactions, creditCards, formatCurrency, updateRecurringRule, deleteRecurringRule, skipRecurringRule } = useAppContext();', 1)
text = text.replace("  const [busyId, setBusyId] = useState<string | null>(null);", "  const [busyId, setBusyId] = useState<string | null>(null);\n  const [filter, setFilter] = useState<'ALL' | 'UPCOMING' | 'CONFIRMATION' | 'ACTIVE' | 'PAUSED'>('ALL');", 1)
insert_before = '''  return (
    <section>'''
derived = '''  const accountMap = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
  const pendingByRule = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of transactions) if (transaction.is_verified === 0 && transaction.recurringRuleId) counts.set(transaction.recurringRuleId, (counts.get(transaction.recurringRuleId) ?? 0) + 1);
    return counts;
  }, [transactions]);
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcomingCutoff = new Date(); upcomingCutoff.setDate(upcomingCutoff.getDate() + 31);
  const upcomingCutoffKey = upcomingCutoff.toISOString().slice(0, 10);
  const activeCount = recurringRules.filter(rule => rule.isActive).length;
  const pausedCount = recurringRules.length - activeCount;
  const needsConfirmationCount = [...pendingByRule.values()].reduce((sum, value) => sum + value, 0);
  const upcomingCount = recurringRules.filter(rule => rule.isActive && rule.nextDueDate >= todayKey && rule.nextDueDate <= upcomingCutoffKey).length;
  const warningMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const rule of recurringRules) {
      const warnings: string[] = [];
      const sourceId = rule.fromAccountId ?? (rule.transactionType === 'EXPENSE' ? rule.account : undefined);
      const destinationId = rule.toAccountId ?? (rule.transactionType === 'INCOME' ? rule.account : undefined);
      const source = sourceId ? accountMap.get(sourceId) : undefined;
      const destination = destinationId ? accountMap.get(destinationId) : undefined;
      if ((rule.transactionType === 'EXPENSE' || rule.transactionType === 'TRANSFER') && !source) warnings.push('Funding account is missing.');
      else if (source?.is_archived === 1) warnings.push(`Funding account ${source.name} is archived.`);
      else if (source?.type === 'asset' && Math.abs(Number(rule.amount)) > Math.max(0, Number(source.balance) || 0)) warnings.push(`${source.name} currently has less than this next payment requires.`);
      if ((rule.transactionType === 'INCOME' || rule.transactionType === 'TRANSFER') && !destination) warnings.push('Destination account is missing.');
      else if (destination?.is_archived === 1) warnings.push(`Destination account ${destination.name} is archived.`);
      map.set(rule.id, warnings);
    }
    return map;
  }, [recurringRules, accountMap]);
  const cardWarnings = creditCards.filter(card => card.dueDate && card.dueAmount > 0 && card.dueDate >= todayKey && card.dueDate <= upcomingCutoffKey).map(card => `${card.name} has ${formatCurrency(card.dueAmount)} due on ${card.dueDate}.`);
  const visibleRules = recurringRules.filter(rule => {
    if (filter === 'ACTIVE') return rule.isActive;
    if (filter === 'PAUSED') return !rule.isActive;
    if (filter === 'CONFIRMATION') return (pendingByRule.get(rule.id) ?? 0) > 0;
    if (filter === 'UPCOMING') return rule.isActive && rule.nextDueDate >= todayKey && rule.nextDueDate <= upcomingCutoffKey;
    return true;
  });

  return (
    <section>'''
if insert_before not in text: raise SystemExit('recurring return marker not found')
text = text.replace(insert_before, derived, 1)
old_header = '''      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container">
        {recurringRules.length === 0 ? ('''
new_header = '''      <div className="mb-3 flex flex-wrap gap-2">
        {([['ALL', 'All', recurringRules.length], ['UPCOMING', 'Upcoming', upcomingCount], ['CONFIRMATION', 'Needs confirmation', needsConfirmationCount], ['ACTIVE', 'Active', activeCount], ['PAUSED', 'Paused', pausedCount]] as const).map(([value, label, count]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${filter === value ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/30 bg-surface-container text-on-surface-variant'}`}>{label} · {count}</button>)}
      </div>
      {cardWarnings.length > 0 && <div className="mb-3 space-y-2">{cardWarnings.map(warning => <div key={warning} className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-on-surface"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{warning}</div>)}</div>}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container">
        {recurringRules.length === 0 ? ('''
if old_header not in text: raise SystemExit('recurring list header not found')
text = text.replace(old_header, new_header, 1)
text = text.replace('{recurringRules.map(rule => {', '{visibleRules.map(rule => {', 1)
needle = '''                      {isManagedSip && <p className="mt-2 max-w-2xl text-xs leading-relaxed text-on-surface-variant">Managed by its Investment account. Edit the SIP amount, funding account, or date from Manage → Accounts → Investment.</p>}'''
replacement = '''                      {(pendingByRule.get(rule.id) ?? 0) > 0 && <p className="mt-2 text-xs font-semibold text-amber-500">{pendingByRule.get(rule.id)} occurrence{(pendingByRule.get(rule.id) ?? 0) === 1 ? '' : 's'} waiting for confirmation.</p>}
                      {(warningMap.get(rule.id)?.length ?? 0) > 0 && <div className="mt-2 space-y-1">{warningMap.get(rule.id)!.map(warning => <p key={warning} className="flex items-start gap-1.5 text-xs text-amber-500"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning}</p>)}</div>}
                      {isManagedSip && <p className="mt-2 max-w-2xl text-xs leading-relaxed text-on-surface-variant">Managed by its Investment account. Edit the SIP amount, funding account, or date from Manage → Accounts → Investment.</p>}'''
if needle not in text: raise SystemExit('recurring managed sip text not found')
text = text.replace(needle, replacement, 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# Affordability explanation source drill-down
# ---------------------------------------------------------------------------
p = Path('src/components/AffordabilityPlanner.tsx')
text = p.read_text()
text = text.replace("import { projectAffordabilityWithHistory, type AffordabilityPlannerResult } from '../domain/affordabilityPlanner';", "import { projectAffordabilityWithHistory, type AffordabilityPlannerResult } from '../domain/affordabilityPlanner';\nimport { buildUpcomingMoneyProjection } from '../domain/upcomingMoney';\nimport { isLiquidCashAccount } from '../domain/affordability';")
text = text.replace("  const [showBreakdown, setShowBreakdown] = useState(false);", "  const [showBreakdown, setShowBreakdown] = useState(false);\n  const [expandedBreakdownSource, setExpandedBreakdownSource] = useState<string | null>(null);", 1)
needle = '''  const copy = result ? statusCopy(result.projection.status) : null;
  const amount = Number(purchaseAmount) || 0;
  const safeDifference = result ? amount - result.projection.safePurchaseCapacity : 0;
  const additionalSavingsTarget = result ? Math.max(0, result.projection.plannedSavings - result.projection.scheduledSavings) : 0;'''
replacement = '''  const sourceProjection = useMemo(() => buildUpcomingMoneyProjection({ ...horizon, accounts, transactions, recurringRules, creditCards, savingsGoals }), [horizon, accounts, transactions, recurringRules, creditCards, savingsGoals]);
  const copy = result ? statusCopy(result.projection.status) : null;
  const amount = Number(purchaseAmount) || 0;
  const safeDifference = result ? amount - result.projection.safePurchaseCapacity : 0;
  const additionalSavingsTarget = result ? Math.max(0, result.projection.plannedSavings - result.projection.scheduledSavings) : 0;
  const breakdownRows = result ? [
    { key: 'cash', label: 'Liquid cash now', raw: result.projection.openingCash, sign: '+', sources: accounts.filter(account => account.type === 'asset' && account.is_archived !== 1 && isLiquidCashAccount(account)).map(account => `${account.name} · ${formatCurrency(account.balance)}`) },
    { key: 'income', label: 'Expected income', raw: result.projection.expectedIncome + result.projection.otherCashInflows, sign: '+', sources: sourceProjection.items.filter(item => item.kind === 'INCOME').map(item => `${item.date} · ${item.title} · ${formatCurrency(item.amount)}`) },
    { key: 'expenses', label: 'Known scheduled expenses', raw: Math.max(0, result.projection.expectedExpenses - result.projection.creditCardOutstandingReserve), sign: '-', sources: sourceProjection.items.filter(item => item.kind === 'OBLIGATION').map(item => `${item.date} · ${item.title} · ${formatCurrency(item.amount)}`) },
    { key: 'cards', label: 'Credit-card outstanding still to cover', raw: result.projection.creditCardOutstandingReserve, sign: '-', sources: creditCards.filter(card => card.balance > 0 || card.dueAmount > 0).map(card => `${card.name} · outstanding ${formatCurrency(card.balance)}${card.dueAmount > 0 ? ` · due ${formatCurrency(card.dueAmount)}` : ''}`) },
    { key: 'living', label: 'Additional normal living expenses (history)', raw: result.projection.normalLivingExpenseForecast, sign: '-', sources: [result.normalLivingSpending.estimateUsable ? `Median NORMAL spending from ${result.normalLivingSpending.observedCycleCount} completed cycle${result.normalLivingSpending.observedCycleCount === 1 ? '' : 's'} · ${formatCurrency(result.normalLivingSpending.medianNormalSpend)}` : 'No usable completed-cycle history yet.'] },
    { key: 'savings', label: 'Scheduled savings', raw: result.projection.scheduledSavings, sign: '-', sources: sourceProjection.items.filter(item => item.kind === 'SAVINGS').map(item => `${item.date} · ${item.title} · ${formatCurrency(item.amount)}`) },
    { key: 'target', label: 'Additional savings target to protect (preferences / goals)', raw: additionalSavingsTarget, sign: '-', sources: [`Safety preference · ${formatCurrency(affordabilitySettings.monthlySavingsTarget)}`, ...savingsGoals.filter(goal => goal.isActive && goal.monthlyContribution > 0).map(goal => `${goal.name} · ${formatCurrency(goal.monthlyContribution)}/month`)] },
    { key: 'buffer', label: 'Unexpected-spending buffer', raw: result.projection.contingencyBuffer, sign: '-', sources: [result.irregularSpending.contingencySource === 'FIXED' ? `Fixed safety preference · ${formatCurrency(result.irregularSpending.recommendedBuffer)}` : result.irregularSpending.contingencySource === 'HISTORICAL' ? `Historical irregular spending · ${result.irregularSpending.observedCycleCount} completed cycles · ${result.irregularSpending.confidence} confidence` : 'Automatic historical estimate is not available yet.'] },
    { key: 'reserve', label: 'Protected cash reserve', raw: result.projection.protectedCashReserve, sign: '-', sources: [`Safety preference · ${formatCurrency(affordabilitySettings.protectedCashReserve)}`, ...savingsGoals.filter(goal => goal.isActive && goal.protectLinkedBalance).map(goal => `${goal.name} linked reserve`)] },
  ] : [];'''
if needle not in text: raise SystemExit('affordability derived block not found')
text = text.replace(needle, replacement, 1)
old_map = '''              {[
                ['Liquid cash now', result.projection.openingCash, '+'],
                ['Expected income', result.projection.expectedIncome + result.projection.otherCashInflows, '+'],
                ['Known scheduled expenses', Math.max(0, result.projection.expectedExpenses - result.projection.creditCardOutstandingReserve), '-'],
                ['Credit-card outstanding still to cover', result.projection.creditCardOutstandingReserve, '-'],
                ['Additional normal living expenses (history)', result.projection.normalLivingExpenseForecast, '-'],
                ['Scheduled savings', result.projection.scheduledSavings, '-'],
                ['Additional savings target to protect (preferences / goals)', additionalSavingsTarget, '-'],
                ['Unexpected-spending buffer', result.projection.contingencyBuffer, '-'],
                ['Protected cash reserve', result.projection.protectedCashReserve, '-'],
              ].map(([label, raw, sign]) => <div key={String(label)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 border-b last:border-b-0 border-outline-variant/15 bg-surface-container"><span className="min-w-0 text-on-surface-variant leading-snug">{label}</span><span className="whitespace-nowrap font-numeric font-semibold tabular-nums text-on-surface">{sign}{formatCurrency(Number(raw))}</span></div>)}'''
new_map = '''              {breakdownRows.map(row => <div key={row.key} className="border-b last:border-b-0 border-outline-variant/15 bg-surface-container">
                <button type="button" onClick={() => setExpandedBreakdownSource(value => value === row.key ? null : row.key)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left"><span className="min-w-0 text-on-surface-variant leading-snug flex items-center gap-2">{row.label}{row.sources.length > 0 && (expandedBreakdownSource === row.key ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}</span><span className="whitespace-nowrap font-numeric font-semibold tabular-nums text-on-surface">{row.sign}{formatCurrency(Number(row.raw))}</span></button>
                {expandedBreakdownSource === row.key && <div className="border-t border-outline-variant/10 bg-surface-container-low px-4 py-3 space-y-1.5">{row.sources.length ? row.sources.map(source => <p key={source} className="text-xs leading-relaxed text-on-surface-variant">• {source}</p>) : <p className="text-xs text-on-surface-variant">No separate scheduled source is available for this line.</p>}</div>}
              </div>)}'''
if old_map not in text: raise SystemExit('affordability breakdown map not found')
text = text.replace(old_map, new_map, 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# Backup manager: cryptographic/provider verification + silent local no-download
# ---------------------------------------------------------------------------
p = Path('src/utils/backupManager.ts')
text = p.read_text()
text = text.replace('  completedAt?: string;\n  filename:', '  completedAt?: string;\n  verifiedAt?: string;\n  filename:', 1)
text = text.replace("    provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM'\n  ): Promise<void> {", "    provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM',\n    downloadLocal: boolean = true\n  ): Promise<void> {", 1)
text = text.replace("    if (provider === 'LOCAL') {\n      // Trigger browser file download", "    if (provider === 'LOCAL' && downloadLocal) {\n      // Trigger browser file download", 1)
old_sig = '''  static async executeManualBackup(
    password?: string,
    provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'LOCAL',
    ledgerData?: Record<string, unknown>
  ): Promise<BackupMetadata> {'''
new_sig = '''  static async executeManualBackup(
    password?: string,
    provider: 'LOCAL' | 'GOOGLE_DRIVE' | 'CUSTOM' = 'LOCAL',
    ledgerData?: Record<string, unknown>,
    options: { downloadLocal?: boolean } = {},
  ): Promise<BackupMetadata> {'''
if old_sig not in text: raise SystemExit('manual backup signature not found')
text = text.replace(old_sig, new_sig, 1)
text = text.replace('    const encryptedPayload = await encryptBackup(jsonStr, password);', "    const encryptedPayload = await encryptBackup(jsonStr, password);\n    const verificationPayload = await decryptBackup(encryptedPayload, password);\n    if (verificationPayload !== jsonStr) throw new Error('Encrypted backup verification failed before storage.');", 1)
text = text.replace('    await BackupStorageAdapter.uploadBackup(filename, encryptedPayload, provider);', "    await BackupStorageAdapter.uploadBackup(filename, encryptedPayload, provider, options.downloadLocal !== false);\n    const stored = await BackupStorageAdapter.listAvailableBackups(provider);\n    if (!stored.some((item: any) => item?.name === filename)) throw new Error('Backup storage verification failed: the new encrypted file could not be confirmed.');", 1)
text = text.replace('      completedAt: now.toISOString(),\n      filename,', '      completedAt: now.toISOString(),\n      verifiedAt: new Date().toISOString(),\n      filename,', 1)
text = text.replace('        ledgerData\n      );', "        ledgerData,\n        { downloadLocal: false },\n      );", 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# App-wide Backup Automation Service
# ---------------------------------------------------------------------------
write('src/components/BackupAutomationService.tsx', r'''import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { BackupManager, BackupStorageAdapter, DEFAULT_BACKUP_SETTINGS, getNextAutoBackupAt, type BackupSettings } from '../utils/backupManager';

function normalize(value: unknown): BackupSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_BACKUP_SETTINGS };
  const saved = value as BackupSettings;
  return {
    ...DEFAULT_BACKUP_SETTINGS,
    ...saved,
    storageProvider: saved.storageProvider === 'GOOGLE_DRIVE' ? 'GOOGLE_DRIVE' : 'LOCAL',
    isWifiOnly: false,
  };
}

export function BackupAutomationService() {
  const { exportLedgerData, getStoredSetting, setStoredSetting } = useAppContext();
  const [config, setConfig] = useState<BackupSettings | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => setConfig(normalize(await getStoredSetting('backupConfig'))), [getStoredSetting]);

  useEffect(() => {
    BackupStorageAdapter.configureHistoryStore({ get: () => getStoredSetting('backupHistory'), set: records => setStoredSetting('backupHistory', records) });
    void reload();
    const onConfigChanged = () => { void reload(); };
    window.addEventListener('coinbuddy_backup_config_changed', onConfigChanged);
    return () => {
      window.removeEventListener('coinbuddy_backup_config_changed', onConfigChanged);
      BackupStorageAdapter.configureHistoryStore(null);
    };
  }, [getStoredSetting, setStoredSetting, reload]);

  useEffect(() => {
    if (!config?.isAutoBackupEnabled || !config.hasPassword || !config.backupPassword) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const persist = async (next: BackupSettings) => {
      if (cancelled) return;
      setConfig(next);
      await setStoredSetting('backupConfig', next);
      window.dispatchEvent(new CustomEvent('coinbuddy_backup_status_changed', { detail: next.lastBackupMetadata }));
    };

    const run = async () => {
      if (cancelled || inFlight.current) return;
      const now = Date.now();
      const nextAt = getNextAutoBackupAt(config, now);
      if (now < nextAt) {
        timer = setTimeout(() => { void run(); }, Math.max(1000, nextAt - now));
        return;
      }
      inFlight.current = true;
      const attempted: BackupSettings = { ...config, lastAutoBackupAttemptAt: new Date(now).toISOString() };
      try {
        const metadata = await BackupManager.executeSilentBackup(attempted, exportLedgerData());
        await persist({ ...attempted, lastBackupMetadata: metadata ?? attempted.lastBackupMetadata });
      } catch (error) {
        await persist({ ...attempted, lastBackupMetadata: { ...(attempted.lastBackupMetadata ?? DEFAULT_BACKUP_SETTINGS.lastBackupMetadata!), syncStatus: 'FAILED', errorReason: error instanceof Error ? error.message : String(error) } });
      } finally {
        inFlight.current = false;
      }
    };

    timer = setTimeout(() => { void run(); }, Math.max(1000, getNextAutoBackupAt(config) - Date.now()));
    const onOnline = () => {
      if (config.lastBackupMetadata?.syncStatus === 'PENDING_NETWORK') {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void run(); }, 1000);
      }
    };
    window.addEventListener('online', onOnline);
    return () => { cancelled = true; if (timer) clearTimeout(timer); window.removeEventListener('online', onOnline); };
  }, [config, exportLedgerData, setStoredSetting]);

  return null;
}
''')

# Mount service in App
p = Path('src/App.tsx')
text = p.read_text()
# use a stable import anchor
first_import_anchor = "import { BackupWarningBanner } from './components/BackupWarningBanner';"
if first_import_anchor in text:
    text = text.replace(first_import_anchor, first_import_anchor + "\nimport { BackupAutomationService } from './components/BackupAutomationService';", 1)
else:
    # fallback adjacent common import
    text = text.replace("import { Dashboard } from './components/Dashboard';", "import { Dashboard } from './components/Dashboard';\nimport { BackupAutomationService } from './components/BackupAutomationService';", 1)
# mount just inside provider app layout before main UI
marker = '      <Header onLogout={handleLogout} showLogout={authConfigured} />'
if marker not in text: raise SystemExit('App header mount marker not found')
text = text.replace(marker, '      <BackupAutomationService />\n      ' + marker.strip(), 1)
p.write_text(text)

# BackupSecurity remove local scheduler/history owner, dispatch config change, restore integrity check, status display
p = Path('src/components/BackupSecurity.tsx')
text = p.read_text()
text = text.replace('  getBackupIntervalMs,\n  getNextAutoBackupAt,', '  getNextAutoBackupAt,', 1)
text = text.replace('const { accounts, transactions, categories, creditCards, currency, exportLedgerData, importLedgerData, getStoredSetting, setStoredSetting } = useAppContext();', 'const { accounts, transactions, categories, creditCards, currency, exportLedgerData, importLedgerData, verifyDataIntegrity, getStoredSetting, setStoredSetting } = useAppContext();', 1)
history_effect = '''  useEffect(() => {
    BackupStorageAdapter.configureHistoryStore({
      get: () => getStoredSetting('backupHistory'),
      set: records => setStoredSetting('backupHistory', records),
    });
    return () => BackupStorageAdapter.configureHistoryStore(null);
  }, [getStoredSetting, setStoredSetting]);

'''
if history_effect not in text: raise SystemExit('BackupSecurity history effect not found')
text = text.replace(history_effect, '', 1)
text = text.replace("  useEffect(() => {\n    if (settingsLoaded) void setStoredSetting('backupConfig', config);\n  }, [config, settingsLoaded, setStoredSetting]);", "  useEffect(() => {\n    if (!settingsLoaded) return;\n    void setStoredSetting('backupConfig', config).then(() => window.dispatchEvent(new Event('coinbuddy_backup_config_changed')));\n  }, [config, settingsLoaded, setStoredSetting]);", 1)
text = text.replace('  const autoBackupInFlight = useRef(false);\n', '', 1)
start = text.find('  // 3. Background Sync Engine.')
end = text.find('  // Reconnect Storage Provider Action Handler')
if start < 0 or end < 0 or end <= start: raise SystemExit('BackupSecurity scheduler region not found')
text = text[:start] + '  // Automatic scheduling is owned by BackupAutomationService at app level.\n\n' + text[end:]
# post-restore integrity audit
text = text.replace('        await importLedgerData(upgradedData);\n\n        // 4. Show success celebration', "        await importLedgerData(upgradedData);\n        const restoredIntegrity = await verifyDataIntegrity();\n        if (!restoredIntegrity.isHealthy) {\n          const critical = restoredIntegrity.issues.filter(issue => issue.severity === 'error').length;\n          setRestoreError(`Restore completed, but the integrity audit found ${critical} critical and ${restoredIntegrity.issues.length - critical} advisory issue(s). Review Settings → Verify Data Integrity.`);\n        }\n\n        // 4. Show success celebration", 1)
# Add next schedule/verified rows under Last Backup content
needle = '''              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5">'''
replacement = '''              </p>
              <div className="mt-3 grid gap-1.5 text-xs text-on-surface-variant sm:grid-cols-2">
                <p><strong className="text-on-surface">Destination:</strong> {config.storageProvider === 'GOOGLE_DRIVE' ? 'Google Drive' : 'Local encrypted storage'}</p>
                <p><strong className="text-on-surface">Next scheduled:</strong> {config.isAutoBackupEnabled && config.hasPassword ? new Date(getNextAutoBackupAt(config)).toLocaleString() : 'Not scheduled'}</p>
                <p><strong className="text-on-surface">Verified:</strong> {meta?.verifiedAt ? new Date(meta.verifiedAt).toLocaleString() : 'No verified backup yet'}</p>
                <p><strong className="text-on-surface">Automation:</strong> {config.isAutoBackupEnabled ? 'App-wide scheduler active' : 'Off'}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5">'''
if needle not in text: raise SystemExit('Backup status display marker not found')
text = text.replace(needle, replacement, 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# Context safe integrity repairs
# ---------------------------------------------------------------------------
p = Path('src/context/AppContext.tsx')
text = p.read_text()
text = text.replace('type DataIntegrityAuditResult }', 'type DataIntegrityAuditResult, type DataIntegrityIssue }', 1)
text = text.replace('  verifyDataIntegrity: () => Promise<DataIntegrityAuditResult>;\n', '  verifyDataIntegrity: () => Promise<DataIntegrityAuditResult>;\n  repairDataIntegrityIssues: (issues: DataIntegrityIssue[]) => Promise<DataIntegrityAuditResult>;\n', 1)
needle = '''  const persistAppSetting = async (key: string, value: unknown) => {'''
repair_fn = '''  const repairDataIntegrityIssues = async (issues: DataIntegrityIssue[]): Promise<DataIntegrityAuditResult> => {
    if (!dbDriver) throw new Error('Database is not ready yet.');
    const repairable = new Set(['CATEGORY_AFFORDABILITY', 'RECURRING_ARCHIVED_ACCOUNT', 'RECURRING_SOURCE', 'RECURRING_DESTINATION', 'RECURRING_SELF_TRANSFER', 'RECURRING_DATE', 'CREDIT_CARD_DUE', 'GOAL_ACCOUNT', 'GOAL_PROTECTED_ACCOUNT', 'GOAL_TRANSACTION_LINK', 'GOAL_RECURRING_LINK']);
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

    const goalIssueIds = new Set(selected.filter(issue => issue.code === 'GOAL_ACCOUNT' || issue.code === 'GOAL_PROTECTED_ACCOUNT').map(issue => issue.entityId).filter(Boolean));
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

  const persistAppSetting = async (key: string, value: unknown) => {'''
if needle not in text: raise SystemExit('AppContext integrity repair insertion marker not found')
text = text.replace(needle, repair_fn, 1)
text = text.replace('verifyDataIntegrity, getStoredSetting, setStoredSetting, toast, showToast', 'verifyDataIntegrity, repairDataIntegrityIssues, getStoredSetting, setStoredSetting, toast, showToast', 1)
p.write_text(text)

# Settings actionable integrity panel
p = Path('src/components/Settings.tsx')
text = p.read_text()
text = text.replace("import type { ComponentType, SVGProps } from 'react';", "import type { ComponentType, SVGProps } from 'react';\nimport type { DataIntegrityAuditResult } from '../db/sqliteSchema';")
text = text.replace('clearAllData, verifyDataIntegrity, lastUpdated,', 'clearAllData, verifyDataIntegrity, repairDataIntegrityIssues, lastUpdated,', 1)
text = text.replace("  const [backupInitialAction, setBackupInitialAction] = useState<'restore' | undefined>(undefined);", "  const [backupInitialAction, setBackupInitialAction] = useState<'restore' | undefined>(undefined);\n  const [integrityReport, setIntegrityReport] = useState<DataIntegrityAuditResult | null>(null);\n  const [repairingIntegrity, setRepairingIntegrity] = useState(false);", 1)
text = text.replace('      const report = await verifyDataIntegrity();\n      if (report.isHealthy)', '      const report = await verifyDataIntegrity();\n      setIntegrityReport(report);\n      if (report.isHealthy)', 1)
# insert handler after handleIntegrityCheck block by known next marker buildTimeFormatted
needle = '''  const buildTimeFormatted = typeof __BUILD_TIME__ !== 'undefined' '''
handler = '''  const handleRepairIntegrity = async () => {
    if (!integrityReport || repairingIntegrity) return;
    setRepairingIntegrity(true);
    try {
      const repaired = await repairDataIntegrityIssues(integrityReport.issues);
      setIntegrityReport(repaired);
      if (repaired.isHealthy) showAlert('Safe Repairs Complete', 'Repairable metadata issues were corrected and the full integrity audit now passes.');
      else showAlert('Safe Repairs Applied', `${repaired.issues.length} issue(s) remain. CoinBuddy never auto-repairs ledger balance, SQLite structure, or ambiguous SIP funding because those require your decision.`);
    } catch (error) {
      showAlert('Repair Failed', getErrorMessage(error, 'CoinBuddy could not complete the safe repairs.'));
    } finally { setRepairingIntegrity(false); }
  };

  const buildTimeFormatted = typeof __BUILD_TIME__ !== 'undefined' '''
if needle not in text: raise SystemExit('Settings build time marker not found')
text = text.replace(needle, handler, 1)
# integrity panel after DataCard integrity
needle = '''          <DataCard
            icon={ShieldCheck}
            label="Full Audit"
            title="Verify Data Integrity"
            desc="Audit database structure, balances, schedules, SIP links, cards, categories, Goals, and settings."
            onClick={() => { void handleIntegrityCheck(); }}
          />'''
panel = needle + '''
          {integrityReport && !integrityReport.isHealthy && <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-bold text-on-surface">Integrity actions</p><p className="mt-1 text-xs leading-relaxed text-on-surface-variant">Safe repair can normalize category metadata, pause broken recurring schedules, clear invalid card due metadata, unlink invalid Goal account references, and remove orphan Goal links. Ledger balances and ambiguous SIP funding are never guessed.</p></div><button type="button" disabled={repairingIntegrity} onClick={() => { void handleRepairIntegrity(); }} className="min-h-10 shrink-0 rounded-xl bg-primary px-4 text-xs font-bold text-on-primary disabled:opacity-50">{repairingIntegrity ? 'Repairing…' : 'Repair safe issues'}</button></div>
            <div className="mt-3 space-y-1.5">{integrityReport.issues.slice(0, 5).map(issue => <p key={`${issue.code}:${issue.entityId ?? issue.message}`} className="text-xs text-on-surface-variant">• {issue.message}</p>)}</div>
          </div>}'''
if needle not in text: raise SystemExit('Settings integrity DataCard not found')
text = text.replace(needle, panel, 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# BackupSecurity post restore already audits; update import interface async in context
# ---------------------------------------------------------------------------
p = Path('src/context/AppContext.tsx')
text = p.read_text().replace('  importLedgerData: (data: LedgerImportData) => void;', '  importLedgerData: (data: LedgerImportData) => Promise<void>;', 1)
p.write_text(text)

# ---------------------------------------------------------------------------
# E2E v3.3 targeted browser checks
# ---------------------------------------------------------------------------
write('e2e/v33-planning-reliability.spec.ts', r'''import { expect, test, type Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const desktop = page.getByTitle(name);
  const mobile = page.getByRole('button', { name, exact: true });
  if (await desktop.isVisible()) await desktop.click(); else await mobile.click();
}

async function prepare(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { localStorage.setItem('coinbuddy_onboarding_seen', 'true'); localStorage.setItem('hasCompletedButtonTour', 'true'); });
  await page.goto('/');
  await expect(page.getByText('Net Worth', { exact: true }).first()).toBeVisible();
  return errors;
}

test('v3.3 shows Upcoming Money and expandable affordability sources', async ({ page }) => {
  const errors = await prepare(page);
  await openTab(page, 'Insights');
  await expect(page.getByText('Upcoming Money', { exact: true })).toBeVisible();
  await expect(page.getByText('Projected free cash', { exact: true })).toBeVisible();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Check affordability' }).click();
  await page.getByRole('button', { name: /How did we calculate this/i }).click();
  await page.getByRole('button', { name: /Expected income/i }).click();
  await expect(page.getByText(/Salary|No separate scheduled source|Expected income/i).first()).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('v3.3 Goal-linked transaction advances unlinked Goal after confirmation', async ({ page }) => {
  const errors = await prepare(page);
  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await page.getByRole('button', { name: 'Goals', exact: true }).click();
  await page.getByRole('button', { name: 'Add goal' }).click();
  await page.getByLabel('Goal name').fill('V33 Goal');
  await page.getByLabel('Target amount').fill('10000');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByText('V33 Goal', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /add transaction/i }).first().click();
  await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
  await page.getByLabel('Transaction amount').fill('1000');
  await page.getByLabel('Goal contribution').selectOption({ label: 'V33 Goal' });
  await page.locator('label').filter({ has: page.locator('input[name="fromAccount"][value="acc_sbi_01"]') }).click();
  await page.locator('label').filter({ has: page.locator('input[name="toAccount"][value="acc_cash_01"]') }).click();
  await page.getByRole('button', { name: 'Save Transaction' }).click();

  await openTab(page, 'Manage');
  await page.getByRole('button', { name: 'Categories', exact: true }).first().click();
  await page.getByRole('button', { name: 'Goals', exact: true }).click();
  await expect(page.getByText('V33 Goal', { exact: true }).locator('..').locator('..')).toContainText(/1,000/);
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('v3.3 recurring status filters and backup reliability status are visible', async ({ page }) => {
  const errors = await prepare(page);
  await openTab(page, 'Settings');
  await expect(page.getByRole('button', { name: /Upcoming ·/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Needs confirmation ·/ })).toBeVisible();
  await page.getByRole('button', { name: /Backup & Security/i }).click();
  await expect(page.getByText('Next scheduled:', { exact: true })).toBeVisible();
  await expect(page.getByText('Destination:', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified:', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
''')

print('Applied CoinBuddy v3.3 Planning & Reliability implementation.')
