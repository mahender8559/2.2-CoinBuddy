from pathlib import Path
import json


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    p.write_text(s.replace(old, new, 1))


def insert_before(path: str, anchor: str, addition: str):
    replace_once(path, anchor, addition + anchor)


def insert_after(path: str, anchor: str, addition: str):
    replace_once(path, anchor, anchor + addition)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------
replace_once(
    'src/types.ts',
    "  dueDate?: string;\n  transactionId?: string;\n",
    "  dueDate?: string;\n  templateId?: string;\n  transactionId?: string;\n",
)
insert_after(
    'src/types.ts',
    "export interface LoanContributionRule {\n  id: string;\n  accountId: string;\n  personId: string;\n  mode: 'PERCENT' | 'FIXED';\n  value: number;\n  isActive: boolean;\n}\n",
    """

/** Recurring household obligation definition. Generated obligations are immutable occurrences. */
export interface SharedObligationTemplate {
  id: string;
  title: string;
  totalAmount: number;
  categoryId?: string;
  frequency: RecurrenceFrequency;
  nextDueDate: string;
  isActive: boolean;
  settlementMode: SharedSettlementMode;
  createdAt: string;
}

export interface SharedTemplateResponsibility {
  id: string;
  templateId: string;
  personId: string;
  amount: number;
}

/** A payment made directly to a lender by somebody outside the tracked ledger. */
export interface ExternalLoanContribution {
  id: string;
  accountId: string;
  personId: string;
  adjustmentTransactionId?: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  paidAt: string;
}
""",
)

# ---------------------------------------------------------------------------
# SQLite schema
# ---------------------------------------------------------------------------
insert_before(
    'src/db/sqliteSchema.ts',
    "-- A shared obligation describes the family/household economic bill. It does NOT\n",
    """-- Repeating household obligations are definitions, not ledger transactions.
CREATE TABLE IF NOT EXISTS shared_obligation_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  total_amount REAL NOT NULL CHECK(total_amount > 0),
  category_id TEXT,
  frequency TEXT NOT NULL CHECK(frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),
  next_due_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  settlement_mode TEXT NOT NULL DEFAULT 'TRACK' CHECK(settlement_mode IN ('TRACK', 'IGNORE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shared_template_responsibilities (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  FOREIGN KEY (template_id) REFERENCES shared_obligation_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT,
  UNIQUE(template_id, person_id)
);

""",
)
replace_once(
    'src/db/sqliteSchema.ts',
    "  due_date TEXT,\n  transaction_id TEXT,\n",
    "  due_date TEXT,\n  template_id TEXT,\n  transaction_id TEXT,\n",
)
replace_once(
    'src/db/sqliteSchema.ts',
    "  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,\n  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,\n",
    "  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,\n  FOREIGN KEY (template_id) REFERENCES shared_obligation_templates(id) ON DELETE SET NULL,\n  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,\n",
)
insert_after(
    'src/db/sqliteSchema.ts',
    "CREATE TABLE IF NOT EXISTS loan_contribution_rules (\n  id TEXT PRIMARY KEY,\n  account_id TEXT NOT NULL,\n  person_id TEXT NOT NULL,\n  mode TEXT NOT NULL CHECK(mode IN ('PERCENT', 'FIXED')),\n  value REAL NOT NULL CHECK(value >= 0),\n  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),\n  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,\n  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT,\n  UNIQUE(account_id, person_id)\n);\n",
    """

-- Direct lender payments by family members reduce the real liability without
-- inventing cash movement through one of the user's asset accounts.
CREATE TABLE IF NOT EXISTS external_loan_contributions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  adjustment_transaction_id TEXT,
  amount REAL NOT NULL CHECK(amount > 0),
  principal_amount REAL NOT NULL CHECK(principal_amount >= 0),
  interest_amount REAL NOT NULL CHECK(interest_amount >= 0),
  paid_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT,
  FOREIGN KEY (adjustment_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);
""",
)
insert_after(
    'src/db/sqliteSchema.ts',
    "  `UPDATE categories SET affordability_class = CASE LOWER(COALESCE(group_name, '')) WHEN 'savings' THEN 'SAVINGS' WHEN 'leisure' THEN 'FLEXIBLE' WHEN 'essential' THEN 'NORMAL' ELSE 'NORMAL' END WHERE affordability_class IS NULL OR affordability_class = '';`,\n",
    "  `ALTER TABLE shared_obligations ADD COLUMN template_id TEXT;`,\n  `CREATE UNIQUE INDEX IF NOT EXISTS one_shared_obligation_per_template_date ON shared_obligations(template_id, due_date) WHERE template_id IS NOT NULL;`,\n",
)

# Add v3.4 table integrity checks just before the final audit return.
insert_before(
    'src/db/sqliteSchema.ts',
    "  return {\n    mismatches,\n",
    """  // v3.4 shared-finance invariants. These checks intentionally derive totals
  // from normalized rows instead of trusting cached responsibility/settlement values.
  const sharedRows = await db.query(`
    SELECT o.id, o.title, o.total_amount,
      COALESCE((SELECT SUM(r.amount) FROM shared_responsibilities r WHERE r.obligation_id = o.id), 0) AS responsibility_total,
      COALESCE((SELECT SUM(p.amount) FROM shared_payments p WHERE p.obligation_id = o.id), 0) AS funded_total
    FROM shared_obligations o WHERE o.status <> 'CANCELLED'
  `);
  for (const row of sharedRows) {
    if (Math.abs(Number(row.total_amount) - Number(row.responsibility_total)) > 0.01) addIssue('SHARED_RESPONSIBILITY_TOTAL', 'error', `Shared obligation “${String(row.title ?? row.id)}” responsibility rows do not add up to its total.`, String(row.id));
    if (Number(row.funded_total) > Number(row.total_amount) + 0.01) addIssue('SHARED_OVERFUNDED', 'error', `Shared obligation “${String(row.title ?? row.id)}” has payments above its household total.`, String(row.id));
  }
  const templateRows = await db.query(`
    SELECT t.id, t.title, t.total_amount,
      COALESCE((SELECT SUM(r.amount) FROM shared_template_responsibilities r WHERE r.template_id = t.id), 0) AS responsibility_total
    FROM shared_obligation_templates t WHERE t.is_active = 1
  `);
  for (const row of templateRows) {
    if (Math.abs(Number(row.total_amount) - Number(row.responsibility_total)) > 0.01) addIssue('SHARED_TEMPLATE_TOTAL', 'error', `Recurring shared obligation “${String(row.title ?? row.id)}” responsibility rows do not add up to its total.`, String(row.id));
  }
  const loanRuleRows = await db.query(`SELECT account_id, personal_responsibility_percent FROM loan_sharing_rules WHERE is_shared = 1`);
  for (const row of loanRuleRows) {
    if (!accountMap.has(String(row.account_id))) addIssue('SHARED_LOAN_ACCOUNT', 'error', 'A shared-loan rule points to a missing account.', String(row.account_id));
    if (Number(row.personal_responsibility_percent) < 0 || Number(row.personal_responsibility_percent) > 100) addIssue('SHARED_LOAN_PERCENT', 'error', 'A shared-loan responsibility percentage is outside 0–100%.', String(row.account_id));
  }
  const externalLoanRows = await db.query(`
    SELECT e.id, e.account_id, e.principal_amount, e.interest_amount, e.amount, e.adjustment_transaction_id,
           t.transaction_type, t.to_account_id, t.amount AS adjustment_amount
      FROM external_loan_contributions e
      LEFT JOIN transactions t ON t.id = e.adjustment_transaction_id
  `);
  for (const row of externalLoanRows) {
    if (Math.abs(Number(row.amount) - Number(row.principal_amount) - Number(row.interest_amount)) > 0.01) addIssue('EXTERNAL_LOAN_SPLIT', 'error', 'An external loan contribution principal/interest split does not equal its payment total.', String(row.id));
    if (Number(row.principal_amount) > 0 && (!row.adjustment_transaction_id || row.transaction_type !== 'BALANCE_ADJUSTMENT' || String(row.to_account_id) !== String(row.account_id) || Math.abs(Number(row.adjustment_amount) - Number(row.principal_amount)) > 0.01)) addIssue('EXTERNAL_LOAN_ADJUSTMENT', 'error', 'An external loan contribution is not reconciled to its principal-only liability adjustment.', String(row.id));
  }

""",
)

# ---------------------------------------------------------------------------
# Shared-finance repository
# ---------------------------------------------------------------------------
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "  LoanContributionRule,\n  LoanSharingRule,\n",
    "  ExternalLoanContribution,\n  LoanContributionRule,\n  LoanSharingRule,\n",
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "  SharedSettlement,\n} from '../types';\nimport { validateResponsibilitySplit } from '../domain/sharedFinances';\n",
    "  SharedSettlement,\n  SharedObligationTemplate,\n  SharedTemplateResponsibility,\n  RecurrenceFrequency,\n} from '../types';\nimport { validateResponsibilitySplit } from '../domain/sharedFinances';\nimport { advanceRecurringDate, toLocalDateKey } from '../domain/recurring';\nimport { calculateEmiSplit } from '../utils/emi';\n",
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "  loanContributionRules: LoanContributionRule[];\n}\n",
    "  loanContributionRules: LoanContributionRule[];\n  obligationTemplates: SharedObligationTemplate[];\n  templateResponsibilities: SharedTemplateResponsibility[];\n  externalLoanContributions: ExternalLoanContribution[];\n}\n",
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "    totalAmount: Number(row.total_amount), categoryId: row.category_id ?? undefined, dueDate: row.due_date ?? undefined,\n    transactionId: row.transaction_id ?? undefined, liabilityAccountId: row.liability_account_id ?? undefined,\n",
    "    totalAmount: Number(row.total_amount), categoryId: row.category_id ?? undefined, dueDate: row.due_date ?? undefined,\n    templateId: row.template_id ?? undefined, transactionId: row.transaction_id ?? undefined, liabilityAccountId: row.liability_account_id ?? undefined,\n",
)
insert_after(
    'src/db/sharedFinanceRepository.ts',
    "function settlementFromRow(row: any): SharedSettlement {\n  return {\n    id: String(row.id), obligationId: row.obligation_id ?? undefined,\n    fromPersonId: String(row.from_person_id), toPersonId: String(row.to_person_id),\n    transactionId: row.transaction_id ?? undefined, amount: Number(row.amount), settledAt: row.settled_at,\n  };\n}\n",
    """
function templateFromRow(row: any): SharedObligationTemplate {
  return { id: String(row.id), title: String(row.title ?? ''), totalAmount: Number(row.total_amount), categoryId: row.category_id ?? undefined, frequency: row.frequency, nextDueDate: String(row.next_due_date), isActive: Number(row.is_active) === 1, settlementMode: row.settlement_mode, createdAt: String(row.created_at) };
}
function templateResponsibilityFromRow(row: any): SharedTemplateResponsibility {
  return { id: String(row.id), templateId: String(row.template_id), personId: String(row.person_id), amount: Number(row.amount) };
}
function externalLoanContributionFromRow(row: any): ExternalLoanContribution {
  return { id: String(row.id), accountId: String(row.account_id), personId: String(row.person_id), adjustmentTransactionId: row.adjustment_transaction_id ?? undefined, amount: Number(row.amount), principalAmount: Number(row.principal_amount), interestAmount: Number(row.interest_amount), paidAt: String(row.paid_at) };
}
""",
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "  const [people, obligations, responsibilities, payments, settlements, loanSharing, loanContributions] = await Promise.all([\n",
    "  const [people, obligations, responsibilities, payments, settlements, loanSharing, loanContributions, templates, templateResponsibilities, externalLoanContributions] = await Promise.all([\n",
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "    driver.query(`SELECT * FROM loan_contribution_rules ORDER BY account_id, id`),\n  ]);\n",
    "    driver.query(`SELECT * FROM loan_contribution_rules ORDER BY account_id, id`),\n    driver.query(`SELECT * FROM shared_obligation_templates ORDER BY is_active DESC, next_due_date, title`),\n    driver.query(`SELECT * FROM shared_template_responsibilities ORDER BY template_id, id`),\n    driver.query(`SELECT * FROM external_loan_contributions ORDER BY paid_at DESC, id DESC`),\n  ]);\n",
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "    loanContributionRules: loanContributions.map((row: any) => ({\n      id: String(row.id), accountId: String(row.account_id), personId: String(row.person_id),\n      mode: row.mode, value: Number(row.value), isActive: Number(row.is_active) === 1,\n    })),\n  };\n",
    "    loanContributionRules: loanContributions.map((row: any) => ({\n      id: String(row.id), accountId: String(row.account_id), personId: String(row.person_id),\n      mode: row.mode, value: Number(row.value), isActive: Number(row.is_active) === 1,\n    })),\n    obligationTemplates: templates.map(templateFromRow),\n    templateResponsibilities: templateResponsibilities.map(templateResponsibilityFromRow),\n    externalLoanContributions: externalLoanContributions.map(externalLoanContributionFromRow),\n  };\n",
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "  initialPayments: Array<Omit<SharedPayment, 'id' | 'obligationId'> & { id?: string }> = [],\n): Promise<SharedObligation> {\n",
    "  initialPayments: Array<Omit<SharedPayment, 'id' | 'obligationId'> & { id?: string }> = [],\n  manageTransaction = true,\n): Promise<SharedObligation> {\n",
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "  await driver.execute('BEGIN TRANSACTION');\n  try {\n    await driver.execute(\n      `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,\n      [obligation.id, obligation.title.trim(), obligation.kind, obligation.totalAmount, obligation.categoryId ?? null, obligation.dueDate ?? null, obligation.transactionId ?? null, obligation.liabilityAccountId ?? null, obligation.recurringRuleId ?? null, obligation.settlementMode, obligation.status, obligation.createdAt],\n    );\n",
    "  if (manageTransaction) await driver.execute('BEGIN TRANSACTION');\n  try {\n    await driver.execute(\n      `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, template_id, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,\n      [obligation.id, obligation.title.trim(), obligation.kind, obligation.totalAmount, obligation.categoryId ?? null, obligation.dueDate ?? null, obligation.templateId ?? null, obligation.transactionId ?? null, obligation.liabilityAccountId ?? null, obligation.recurringRuleId ?? null, obligation.settlementMode, obligation.status, obligation.createdAt],\n    );\n",
)
replace_once(
    'src/db/sharedFinanceRepository.ts',
    "    await driver.execute('COMMIT');\n    return obligation;\n  } catch (error) {\n    await driver.execute('ROLLBACK');\n    throw error;\n  }\n}\n\nexport async function addSharedPayment",
    "    if (manageTransaction) await driver.execute('COMMIT');\n    return obligation;\n  } catch (error) {\n    if (manageTransaction) await driver.execute('ROLLBACK');\n    throw error;\n  }\n}\n\nexport async function addSharedPayment",
)
insert_before(
    'src/db/sharedFinanceRepository.ts',
    "export async function setLoanSharingRule",
    r'''export async function createSharedObligationTemplate(
  driver: SqlJsDatabaseDriver,
  input: { title: string; totalAmount: number; categoryId?: string; frequency: RecurrenceFrequency; nextDueDate: string; settlementMode?: 'TRACK' | 'IGNORE'; id?: string; createdAt?: string },
  allocations: Array<{ personId: string; amount: number }>,
  manageTransaction = true,
): Promise<SharedObligationTemplate> {
  const template: SharedObligationTemplate = {
    id: input.id ?? crypto.randomUUID(), title: input.title.trim(), totalAmount: positiveAmount(input.totalAmount, 'Template total'),
    categoryId: input.categoryId, frequency: input.frequency, nextDueDate: input.nextDueDate, isActive: true,
    settlementMode: input.settlementMode ?? 'TRACK', createdAt: input.createdAt ?? isoNow(),
  };
  if (!template.title) throw new Error('Recurring shared obligation title is required.');
  const pseudoObligation: SharedObligation = { id: template.id, title: template.title, kind: 'EXPENSE', totalAmount: template.totalAmount, settlementMode: template.settlementMode, status: 'OPEN', createdAt: template.createdAt };
  const pseudoResponsibilities: SharedResponsibility[] = allocations.map(item => ({ id: crypto.randomUUID(), obligationId: template.id, personId: item.personId, amount: positiveAmount(item.amount, 'Template responsibility amount') }));
  const splitError = validateResponsibilitySplit(pseudoObligation, pseudoResponsibilities);
  if (splitError) throw new Error(splitError);
  if (manageTransaction) await driver.execute('BEGIN TRANSACTION');
  try {
    await driver.execute(`INSERT INTO shared_obligation_templates (id, title, total_amount, category_id, frequency, next_due_date, is_active, settlement_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`, [template.id, template.title, template.totalAmount, template.categoryId ?? null, template.frequency, template.nextDueDate, template.settlementMode, template.createdAt]);
    for (const row of pseudoResponsibilities) await driver.execute(`INSERT INTO shared_template_responsibilities (id, template_id, person_id, amount) VALUES (?, ?, ?, ?)`, [row.id, template.id, row.personId, row.amount]);
    if (manageTransaction) await driver.execute('COMMIT');
    return template;
  } catch (error) {
    if (manageTransaction) await driver.execute('ROLLBACK');
    throw error;
  }
}

export async function generateDueSharedObligations(driver: SqlJsDatabaseDriver, today = new Date()): Promise<number> {
  const todayKey = toLocalDateKey(today);
  const templates = await driver.query(`SELECT * FROM shared_obligation_templates WHERE is_active = 1 AND next_due_date <= ? ORDER BY next_due_date`, [todayKey]);
  let generated = 0;
  for (const template of templates) {
    const allocations = await driver.query(`SELECT person_id, amount FROM shared_template_responsibilities WHERE template_id = ? ORDER BY id`, [template.id]);
    let dueDate = String(template.next_due_date);
    let guard = 0;
    while (dueDate <= todayKey && guard++ < 240) {
      const obligationId = `shared-template:${String(template.id)}:${dueDate}`;
      const existing = await driver.query(`SELECT id FROM shared_obligations WHERE template_id = ? AND due_date = ? LIMIT 1`, [template.id, dueDate]);
      if (!existing[0]) {
        await createSharedObligation(driver, {
          id: obligationId, title: String(template.title), kind: 'EXPENSE', totalAmount: Number(template.total_amount), categoryId: template.category_id ?? undefined,
          dueDate, templateId: String(template.id), settlementMode: template.settlement_mode ?? 'TRACK', createdAt: `${dueDate}T12:00:00.000Z`,
        }, allocations.map((row: any) => ({ personId: String(row.person_id), amount: Number(row.amount) })), [], false);
        generated++;
      }
      dueDate = advanceRecurringDate(dueDate, template.frequency as RecurrenceFrequency);
    }
    await driver.execute(`UPDATE shared_obligation_templates SET next_due_date = ? WHERE id = ?`, [dueDate, template.id]);
  }
  return generated;
}

export async function addSharedSettlementWithBalanceAdjustment(
  driver: SqlJsDatabaseDriver,
  input: { obligationId?: string; fromPersonId: string; toPersonId: string; amount: number; settledAt: string; accountId?: string },
): Promise<SharedSettlement> {
  const amount = positiveAmount(input.amount, 'Settlement amount');
  if (input.fromPersonId === input.toPersonId) throw new Error('A settlement must be between two different people.');
  const selfRows = await driver.query(`SELECT id FROM people WHERE is_self = 1 AND is_archived = 0 LIMIT 1`);
  const selfId = selfRows[0] ? String(selfRows[0].id) : '';
  if (!selfId) throw new Error('CoinBuddy could not identify the primary user.');
  let transactionId: string | undefined;
  await driver.execute('BEGIN TRANSACTION');
  try {
    if (input.accountId) {
      const accountRows = await driver.query(`SELECT id, type, is_archived FROM accounts WHERE id = ?`, [input.accountId]);
      const account = accountRows[0];
      if (!account || String(account.type) !== 'ASSET' || Number(account.is_archived) === 1) throw new Error('Settlements can only move through an active asset account.');
      const incoming = input.toPersonId === selfId;
      const outgoing = input.fromPersonId === selfId;
      if (!incoming && !outgoing) throw new Error('A tracked settlement must involve you.');
      transactionId = crypto.randomUUID();
      const dateMs = new Date(input.settledAt).getTime();
      if (!Number.isFinite(dateMs)) throw new Error('Settlement date is invalid.');
      await driver.execute(`INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only) VALUES (?, 'BALANCE_ADJUSTMENT', ?, ?, ?, ?, '#settlement', 'ArrowRightLeft', ?, ?, ?, ?, 1, 0, 0, 0)`, [transactionId, incoming ? 'Shared reimbursement received' : 'Shared reimbursement paid', 'Shared-finance settlement · not income/expense', amount, dateMs, input.accountId, outgoing ? input.accountId : null, incoming ? input.accountId : null, 'Generated by Shared Finances settlement']);
    }
    const settlement: SharedSettlement = { id: crypto.randomUUID(), obligationId: input.obligationId, fromPersonId: input.fromPersonId, toPersonId: input.toPersonId, transactionId, amount, settledAt: input.settledAt };
    await driver.execute(`INSERT INTO shared_settlements (id, obligation_id, from_person_id, to_person_id, transaction_id, amount, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [settlement.id, settlement.obligationId ?? null, settlement.fromPersonId, settlement.toPersonId, settlement.transactionId ?? null, settlement.amount, settlement.settledAt]);
    await driver.execute('COMMIT');
    return settlement;
  } catch (error) {
    await driver.execute('ROLLBACK');
    throw error;
  }
}

export async function addExternalLoanContribution(
  driver: SqlJsDatabaseDriver,
  input: { accountId: string; personId: string; amount: number; paidAt: string },
): Promise<ExternalLoanContribution> {
  const amount = positiveAmount(input.amount, 'External loan contribution');
  const people = await driver.query(`SELECT id, is_self, is_archived FROM people WHERE id = ?`, [input.personId]);
  if (!people[0] || Number(people[0].is_archived) === 1) throw new Error('Contributor is missing or archived.');
  if (Number(people[0].is_self) === 1) throw new Error('Use the normal loan payment flow for your own tracked payment.');
  const accounts = await driver.query(`SELECT * FROM account_balances_view WHERE id = ? AND type = 'LIABILITY' AND is_archived = 0`, [input.accountId]);
  const account = accounts[0];
  if (!account) throw new Error('External contribution requires an active liability account.');
  const balance = Math.max(0, Number(account.cached_balance ?? 0));
  if (balance <= 0) throw new Error('This liability is already paid off.');
  const split = calculateEmiSplit(balance, Number(account.interest_rate ?? 0), amount, account.interest_calculation_type ?? 'REDUCING');
  const principalAmount = Math.min(balance, Math.max(0, Math.round(Number(split.principalAmount ?? 0) * 100) / 100));
  const interestAmount = Math.max(0, Math.round((amount - principalAmount) * 100) / 100);
  const paidAtMs = new Date(input.paidAt).getTime();
  if (!Number.isFinite(paidAtMs)) throw new Error('External contribution date is invalid.');
  let adjustmentTransactionId: string | undefined;
  await driver.execute('BEGIN TRANSACTION');
  try {
    if (principalAmount > 0) {
      adjustmentTransactionId = crypto.randomUUID();
      await driver.execute(`INSERT INTO transactions (id, transaction_type, title, subtitle, amount, date, category, icon, account, from_account_id, to_account_id, notes, is_verified, is_recurring, is_opening_balance, is_interest_only) VALUES (?, 'BALANCE_ADJUSTMENT', ?, ?, ?, ?, '#external-loan', 'Landmark', ?, NULL, ?, ?, 1, 0, 0, 0)`, [adjustmentTransactionId, 'External principal payment', 'Paid directly to lender by a shared contributor', principalAmount, paidAtMs, input.accountId, input.accountId, `External family contribution; total ${amount.toFixed(2)}, interest ${interestAmount.toFixed(2)}`]);
    }
    const row: ExternalLoanContribution = { id: crypto.randomUUID(), accountId: input.accountId, personId: input.personId, adjustmentTransactionId, amount, principalAmount, interestAmount, paidAt: input.paidAt };
    await driver.execute(`INSERT INTO external_loan_contributions (id, account_id, person_id, adjustment_transaction_id, amount, principal_amount, interest_amount, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [row.id, row.accountId, row.personId, row.adjustmentTransactionId ?? null, row.amount, row.principalAmount, row.interestAmount, row.paidAt]);
    await driver.execute('COMMIT');
    return row;
  } catch (error) {
    await driver.execute('ROLLBACK');
    throw error;
  }
}

''',
)

# ---------------------------------------------------------------------------
# Domain helpers
# ---------------------------------------------------------------------------
insert_before(
    'src/domain/sharedFinances.ts',
    "export function isObligationFunded",
    """/** Positive means the person should receive money; negative means they still owe. */
export function getPersonNetClaim(
  obligationId: string,
  personId: string,
  responsibilities: SharedResponsibility[],
  payments: SharedPayment[],
  settlements: SharedSettlement[],
): number {
  const base = getPersonPayments(obligationId, personId, payments) - getPersonResponsibility(obligationId, personId, responsibilities);
  const outgoing = settlements.filter(item => item.obligationId === obligationId && item.fromPersonId === personId).reduce((sum, item) => sum + money(item.amount), 0);
  const incoming = settlements.filter(item => item.obligationId === obligationId && item.toPersonId === personId).reduce((sum, item) => sum + money(item.amount), 0);
  return Math.round((base + outgoing - incoming) * 100) / 100;
}

""",
)
# sharedFinances import needs SharedSettlement (already imported in current file? ensure it is)
replace_once(
    'src/domain/sharedFinances.ts',
    "  SharedResponsibility,\n  SharedSettlement,\n",
    "  SharedResponsibility,\n  SharedSettlement,\n",
) if "  SharedResponsibility,\n  SharedSettlement,\n" in Path('src/domain/sharedFinances.ts').read_text() else None
insert_after(
    'src/domain/personalSpending.ts',
    "export function personalExpenseForTransaction(transactionId: string, records: PersonalExpenseRecord[]): number {\n  return records\n    .filter(record => record.transactionId === transactionId)\n    .reduce((sum, record) => sum + record.amount, 0);\n}\n",
    """

/** Adapter for historical estimators that still consume ledger-shaped expense rows. */
export function personalExpenseRecordsToTransactions(records: PersonalExpenseRecord[]): Transaction[] {
  return records.filter(record => record.amount > 0).map(record => ({
    id: `personal-history:${record.id}`,
    title: record.title,
    subtitle: 'Personal economic spending',
    amount: record.amount,
    date: record.date,
    category: record.category,
    icon: 'ShoppingBag',
    type: 'expense',
    transaction_type: 'EXPENSE',
    is_verified: 1,
  }));
}
""",
)

# ---------------------------------------------------------------------------
# Affordability: recurring household commitments + responsibility-aware history
# ---------------------------------------------------------------------------
replace_once(
    'src/domain/affordability.ts',
    "  LoanContributionRule,\n} from '../types';\n",
    "  LoanContributionRule,\n  SharedObligationTemplate,\n  SharedTemplateResponsibility,\n} from '../types';\n",
)
insert_after(
    'src/domain/affordability.ts',
    "import { getMyExpectedLoanContribution } from './loanSharing';\n",
    "import { getSelfPerson } from './sharedFinances';\n",
)
replace_once(
    'src/domain/affordability.ts',
    "  loanContributionRules?: LoanContributionRule[];\n  settings: AffordabilityProjectionSettings;\n",
    "  loanContributionRules?: LoanContributionRule[];\n  sharedObligationTemplates?: SharedObligationTemplate[];\n  sharedTemplateResponsibilities?: SharedTemplateResponsibility[];\n  settings: AffordabilityProjectionSettings;\n",
)
insert_before(
    'src/domain/affordability.ts',
    "function projectLoanFallbacks(\n",
    """function projectSharedTemplateCommitments(
  templates: SharedObligationTemplate[],
  responsibilities: SharedTemplateResponsibility[],
  people: Person[],
  categories: Category[],
  asOfDate: string,
  endDate: string,
  accumulator: ProjectionAccumulator,
): void {
  const me = getSelfPerson(people);
  if (!me) return;
  for (const template of templates) {
    if (!template.isActive) continue;
    const amount = responsibilities.filter(row => row.templateId === template.id && row.personId === me.id).reduce((sum, row) => sum + nonNegative(row.amount), 0);
    if (amount <= 0) continue;
    let dueDate = template.nextDueDate;
    let guard = 0;
    while (dueDate < asOfDate && guard++ < 240) dueDate = advanceRecurringDate(dueDate, template.frequency);
    while (dueDate <= endDate && guard++ < 240) {
      const classification = categoryClass(template.categoryId, categories);
      if (classification === 'SAVINGS') accumulator.scheduledSavings += amount;
      else {
        accumulator.expectedExpenses += amount;
        accumulator.expensesByClass[classification] += amount;
      }
      accumulator.occurrenceCount += 1;
      dueDate = advanceRecurringDate(dueDate, template.frequency);
    }
  }
}

""",
)
insert_before(
    'src/domain/affordability.ts',
    "  projectLoanFallbacks(accounts, creditCardIds, input.asOfDate, input.endDate, accumulator, input.people, input.loanSharingRules, input.loanContributionRules);\n",
    "  projectSharedTemplateCommitments(input.sharedObligationTemplates ?? [], input.sharedTemplateResponsibilities ?? [], input.people ?? [], input.categories, input.asOfDate, input.endDate, accumulator);\n\n",
)
replace_once(
    'src/domain/affordabilityPlanner.ts',
    "export interface AffordabilityPlannerInput extends Omit<AffordabilityInput, 'settings'> {\n  affordabilitySettings: AffordabilitySettings;\n",
    "export interface AffordabilityPlannerInput extends Omit<AffordabilityInput, 'settings'> {\n  affordabilitySettings: AffordabilitySettings;\n  historicalSpendingTransactions?: AffordabilityInput['transactions'];\n",
)
replace_once(
    'src/domain/affordabilityPlanner.ts',
    "  const irregularSpending = estimateIrregularSpending({\n    asOfDate: input.asOfDate,\n    monthCycleDay: input.monthCycleDay,\n    transactions: input.transactions,\n",
    "  const historicalSpendingTransactions = input.historicalSpendingTransactions ?? input.transactions;\n  const irregularSpending = estimateIrregularSpending({\n    asOfDate: input.asOfDate,\n    monthCycleDay: input.monthCycleDay,\n    transactions: historicalSpendingTransactions,\n",
)
replace_once(
    'src/domain/affordabilityPlanner.ts',
    "    transactions: input.transactions,\n    categories: input.categories,\n    historicalMonths: input.affordabilitySettings.historicalMonths,\n",
    "    transactions: historicalSpendingTransactions,\n    categories: input.categories,\n    historicalMonths: input.affordabilitySettings.historicalMonths,\n",
)

# ---------------------------------------------------------------------------
# Backup schema
# ---------------------------------------------------------------------------
replace_once(
    'src/utils/ledgerSchema.ts',
    "  for (const key of ['people', 'sharedObligations', 'sharedResponsibilities', 'sharedPayments', 'sharedSettlements', 'loanSharingRules', 'loanContributionRules']) {\n",
    "  for (const key of ['people', 'sharedObligations', 'sharedResponsibilities', 'sharedPayments', 'sharedSettlements', 'loanSharingRules', 'loanContributionRules', 'sharedObligationTemplates', 'sharedTemplateResponsibilities', 'externalLoanContributions']) {\n",
)
replace_once(
    'src/utils/ledgerSchema.ts',
    "      loanContributionRules: Array.isArray(data.loanContributionRules) ? data.loanContributionRules : [],\n      currency: data.currency || 'INR',\n",
    "      loanContributionRules: Array.isArray(data.loanContributionRules) ? data.loanContributionRules : [],\n      sharedObligationTemplates: Array.isArray(data.sharedObligationTemplates) ? data.sharedObligationTemplates : [],\n      sharedTemplateResponsibilities: Array.isArray(data.sharedTemplateResponsibilities) ? data.sharedTemplateResponsibilities : [],\n      externalLoanContributions: Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : [],\n      currency: data.currency || 'INR',\n",
)
replace_once(
    'src/utils/ledgerSchema.ts',
    "    people: [], sharedObligations: [], sharedResponsibilities: [], sharedPayments: [], sharedSettlements: [], loanSharingRules: [], loanContributionRules: [],\n",
    "    people: [], sharedObligations: [], sharedResponsibilities: [], sharedPayments: [], sharedSettlements: [], loanSharingRules: [], loanContributionRules: [], sharedObligationTemplates: [], sharedTemplateResponsibilities: [], externalLoanContributions: [],\n",
)

# ---------------------------------------------------------------------------
# dbClient backup/import/demo/clear
# ---------------------------------------------------------------------------
replace_once(
    'src/db/dbClient.ts',
    "import { Account, Category, CreditCardInfo, Event, LoanRevision, RecurrenceFrequency, RecurringRule, Transaction, Widget, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule } from '../types';\n",
    "import { Account, Category, CreditCardInfo, Event, LoanRevision, RecurrenceFrequency, RecurringRule, Transaction, Widget, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule, SharedObligationTemplate, SharedTemplateResponsibility, ExternalLoanContribution } from '../types';\n",
)
replace_once(
    'src/db/dbClient.ts',
    "  await driver.execute(`DELETE FROM shared_settlements; DELETE FROM shared_payments; DELETE FROM shared_responsibilities; DELETE FROM loan_contribution_rules; DELETE FROM loan_sharing_rules; DELETE FROM shared_obligations; DELETE FROM people; DELETE FROM transactions; DELETE FROM recurring_rules; DELETE FROM credit_cards; DELETE FROM widgets; DELETE FROM loan_revisions; DELETE FROM categories; DELETE FROM events; DELETE FROM accounts; DELETE FROM users_config; DELETE FROM app_settings;`);\n",
    "  await driver.execute(`DELETE FROM external_loan_contributions; DELETE FROM shared_settlements; DELETE FROM shared_payments; DELETE FROM shared_responsibilities; DELETE FROM shared_template_responsibilities; DELETE FROM loan_contribution_rules; DELETE FROM loan_sharing_rules; DELETE FROM shared_obligations; DELETE FROM shared_obligation_templates; DELETE FROM people; DELETE FROM transactions; DELETE FROM recurring_rules; DELETE FROM credit_cards; DELETE FROM widgets; DELETE FROM loan_revisions; DELETE FROM categories; DELETE FROM events; DELETE FROM accounts; DELETE FROM users_config; DELETE FROM app_settings;`);\n",
)
# Add new import arrays near existing loan contribution rows.
replace_once(
    'src/db/dbClient.ts',
    "    const loanContributionRules: LoanContributionRule[] = Array.isArray(data.loanContributionRules) ? data.loanContributionRules : [];\n    const userConfig = Array.isArray(data.users_config) ? data.users_config[0] : undefined;\n",
    "    const loanContributionRules: LoanContributionRule[] = Array.isArray(data.loanContributionRules) ? data.loanContributionRules : [];\n    const sharedObligationTemplates: SharedObligationTemplate[] = Array.isArray(data.sharedObligationTemplates) ? data.sharedObligationTemplates : [];\n    const sharedTemplateResponsibilities: SharedTemplateResponsibility[] = Array.isArray(data.sharedTemplateResponsibilities) ? data.sharedTemplateResponsibilities : [];\n    const externalLoanContributions: ExternalLoanContribution[] = Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : [];\n    const userConfig = Array.isArray(data.users_config) ? data.users_config[0] : undefined;\n",
)
replace_once(
    'src/db/dbClient.ts',
    "    executePreparedRows(driver, `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligations.map(item => [item.id, item.title, item.kind, Math.abs(Number(item.totalAmount)), item.categoryId ?? null, item.dueDate ?? null, item.transactionId ?? null, item.liabilityAccountId ?? null, item.recurringRuleId ?? null, item.settlementMode ?? 'TRACK', item.status ?? 'OPEN', item.createdAt ?? new Date().toISOString()]));\n",
    "    executePreparedRows(driver, `INSERT INTO shared_obligation_templates (id, title, total_amount, category_id, frequency, next_due_date, is_active, settlement_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligationTemplates.map(item => [item.id, item.title, Math.abs(Number(item.totalAmount)), item.categoryId ?? null, item.frequency, item.nextDueDate, item.isActive ? 1 : 0, item.settlementMode ?? 'TRACK', item.createdAt ?? new Date().toISOString()]));\n    executePreparedRows(driver, `INSERT INTO shared_template_responsibilities (id, template_id, person_id, amount) VALUES (?, ?, ?, ?);`, sharedTemplateResponsibilities.map(item => [item.id, item.templateId, item.personId, Math.abs(Number(item.amount))]));\n    executePreparedRows(driver, `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, template_id, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, sharedObligations.map(item => [item.id, item.title, item.kind, Math.abs(Number(item.totalAmount)), item.categoryId ?? null, item.dueDate ?? null, item.templateId ?? null, item.transactionId ?? null, item.liabilityAccountId ?? null, item.recurringRuleId ?? null, item.settlementMode ?? 'TRACK', item.status ?? 'OPEN', item.createdAt ?? new Date().toISOString()]));\n",
)
replace_once(
    'src/db/dbClient.ts',
    "    executePreparedRows(driver, `INSERT INTO loan_contribution_rules (id, account_id, person_id, mode, value, is_active) VALUES (?, ?, ?, ?, ?, ?);`, loanContributionRules.map(item => [item.id, item.accountId, item.personId, item.mode, Number(item.value), item.isActive ? 1 : 0]));\n\n    if (userConfig) {\n",
    "    executePreparedRows(driver, `INSERT INTO loan_contribution_rules (id, account_id, person_id, mode, value, is_active) VALUES (?, ?, ?, ?, ?, ?);`, loanContributionRules.map(item => [item.id, item.accountId, item.personId, item.mode, Number(item.value), item.isActive ? 1 : 0]));\n    executePreparedRows(driver, `INSERT INTO external_loan_contributions (id, account_id, person_id, adjustment_transaction_id, amount, principal_amount, interest_amount, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`, externalLoanContributions.map(item => [item.id, item.accountId, item.personId, item.adjustmentTransactionId ?? null, Number(item.amount), Number(item.principalAmount), Number(item.interestAmount), item.paidAt]));\n\n    if (userConfig) {\n",
)
# Demo hydration: append relative handling before return data.
replace_once(
    'src/db/dbClient.ts',
    "  return data;\n}\n\nexport async function loadDemoDataFromJson",
    "  data.sharedObligations = (Array.isArray(data.sharedObligations) ? data.sharedObligations : []).map((item: any) => ({ ...item, dueDate: resolveDemoRelativeDate(item.dueOffsetDays, true) ?? item.dueDate, createdAt: resolveDemoRelativeDate(item.createdOffsetDays, false) ?? item.createdAt }));\n  data.sharedPayments = (Array.isArray(data.sharedPayments) ? data.sharedPayments : []).map((item: any) => ({ ...item, paidAt: resolveDemoRelativeDate(item.paidOffsetDays, false) ?? item.paidAt }));\n  data.sharedSettlements = (Array.isArray(data.sharedSettlements) ? data.sharedSettlements : []).map((item: any) => ({ ...item, settledAt: resolveDemoRelativeDate(item.settledOffsetDays, false) ?? item.settledAt }));\n  data.sharedObligationTemplates = (Array.isArray(data.sharedObligationTemplates) ? data.sharedObligationTemplates : []).map((item: any) => ({ ...item, nextDueDate: resolveDemoRelativeDate(item.nextDueOffsetDays, true) ?? item.nextDueDate, createdAt: resolveDemoRelativeDate(item.createdOffsetDays, false) ?? item.createdAt }));\n  data.externalLoanContributions = (Array.isArray(data.externalLoanContributions) ? data.externalLoanContributions : []).map((item: any) => ({ ...item, paidAt: resolveDemoRelativeDate(item.paidOffsetDays, false) ?? item.paidAt }));\n  return data;\n}\n\nexport async function loadDemoDataFromJson",
)

# ---------------------------------------------------------------------------
# AppContext
# ---------------------------------------------------------------------------
replace_once(
    'src/context/AppContext.tsx',
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings, SavingsGoal, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule } from '../types';\n",
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings, SavingsGoal, Person, SharedObligation, SharedResponsibility, SharedPayment, SharedSettlement, LoanSharingRule, LoanContributionRule, SharedObligationTemplate, SharedTemplateResponsibility, ExternalLoanContribution, RecurrenceFrequency } from '../types';\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "  replaceLoanContributionRules,\n  type SharedFinanceState,\n",
    "  replaceLoanContributionRules,\n  createSharedObligationTemplate as createSharedObligationTemplateRow,\n  generateDueSharedObligations,\n  addSharedSettlementWithBalanceAdjustment,\n  addExternalLoanContribution,\n  type SharedFinanceState,\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "  loanContributionRules?: LoanContributionRule[];\n  currency?: string;\n",
    "  loanContributionRules?: LoanContributionRule[];\n  sharedObligationTemplates?: SharedObligationTemplate[];\n  sharedTemplateResponsibilities?: SharedTemplateResponsibility[];\n  externalLoanContributions?: ExternalLoanContribution[];\n  currency?: string;\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "  loanContributionRules: LoanContributionRule[];\n  personalExpenseRecords: PersonalExpenseRecord[];\n",
    "  loanContributionRules: LoanContributionRule[];\n  sharedObligationTemplates: SharedObligationTemplate[];\n  sharedTemplateResponsibilities: SharedTemplateResponsibility[];\n  externalLoanContributions: ExternalLoanContribution[];\n  personalExpenseRecords: PersonalExpenseRecord[];\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "  createSharedExpense: (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }> }) => Promise<boolean>;\n",
    "  createSharedExpense: (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }>; repeatFrequency?: RecurrenceFrequency }) => Promise<boolean>;\n",
)
insert_after(
    'src/context/AppContext.tsx',
    "  configureLoanSharing: (accountId: string, personalResponsibilityPercent: number, contributions: Array<Omit<LoanContributionRule, 'id' | 'accountId'>>) => Promise<boolean>;\n",
    "  settleSharedBalance: (input: { obligationId?: string; fromPersonId: string; toPersonId: string; amount: number; settledAt: string; accountId?: string }) => Promise<boolean>;\n  recordExternalLoanPayment: (input: { accountId: string; personId: string; amount: number; paidAt: string }) => Promise<boolean>;\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "  const EMPTY_SHARED_FINANCE: SharedFinanceState = { people: [], obligations: [], responsibilities: [], payments: [], settlements: [], loanSharingRules: [], loanContributionRules: [] };\n",
    "  const EMPTY_SHARED_FINANCE: SharedFinanceState = { people: [], obligations: [], responsibilities: [], payments: [], settlements: [], loanSharingRules: [], loanContributionRules: [], obligationTemplates: [], templateResponsibilities: [], externalLoanContributions: [] };\n",
)
insert_after(
    'src/context/AppContext.tsx',
    "  const loanContributionRules = sharedFinance.loanContributionRules;\n",
    "  const sharedObligationTemplates = sharedFinance.obligationTemplates;\n  const sharedTemplateResponsibilities = sharedFinance.templateResponsibilities;\n  const externalLoanContributions = sharedFinance.externalLoanContributions;\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "  const createSharedExpense = async (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }> }): Promise<boolean> => {\n",
    "  const createSharedExpense = async (input: { title: string; totalAmount: number; categoryId?: string; dueDate?: string; transactionId?: string; allocations: Array<{ personId: string; amount: number }>; trackedPaymentAmount?: number; externalPayments?: Array<{ personId: string; amount: number }>; repeatFrequency?: RecurrenceFrequency }): Promise<boolean> => {\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "    return persistSharedAction(() => createSharedObligationRow(dbDriver, {\n      title: input.title, kind: 'EXPENSE', totalAmount: input.totalAmount, categoryId: input.categoryId, dueDate: input.dueDate, transactionId: input.transactionId,\n      settlementMode: 'TRACK',\n    }, input.allocations, initialPayments));\n  };\n",
    "    return persistSharedAction(async () => {\n      await dbDriver.execute('BEGIN TRANSACTION');\n      try {\n        await createSharedObligationRow(dbDriver, { title: input.title, kind: 'EXPENSE', totalAmount: input.totalAmount, categoryId: input.categoryId, dueDate: input.dueDate, transactionId: input.transactionId, settlementMode: 'TRACK' }, input.allocations, initialPayments, false);\n        if (input.repeatFrequency) {\n          const baseDate = input.dueDate || toLocalDateKey(new Date());\n          await createSharedObligationTemplateRow(dbDriver, { title: input.title, totalAmount: input.totalAmount, categoryId: input.categoryId, frequency: input.repeatFrequency, nextDueDate: advanceRecurringDate(baseDate, input.repeatFrequency), settlementMode: 'TRACK' }, input.allocations, false);\n        }\n        await dbDriver.execute('COMMIT');\n      } catch (error) {\n        await dbDriver.execute('ROLLBACK');\n        throw error;\n      }\n    });\n  };\n",
)
insert_after(
    'src/context/AppContext.tsx',
    "  const configureLoanSharing = async (accountId: string, personalResponsibilityPercent: number, contributions: Array<Omit<LoanContributionRule, 'id' | 'accountId'>>): Promise<boolean> =>\n    persistSharedAction(async () => {\n      await setLoanSharingRuleRow(dbDriver!, { accountId, personalResponsibilityPercent, isShared: true });\n      await replaceLoanContributionRules(dbDriver!, accountId, contributions);\n    });\n",
    """

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
      await addExternalLoanContribution(dbDriver, input);
      await persistDatabase(dbDriver);
      await refreshStateFromDatabase(dbDriver);
      await refreshSharedFinance(dbDriver);
      return true;
    } catch (error) {
      console.error('External loan contribution failed:', error);
      window.alert(`External loan payment was not saved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
""",
)
replace_once(
    'src/context/AppContext.tsx',
    "        await ensureSelfPerson(driver, 'Me');\n        await refreshSharedFinance(driver);\n",
    "        await ensureSelfPerson(driver, 'Me');\n        await generateDueSharedObligations(driver);\n        await refreshSharedFinance(driver);\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "    loanContributionRules,\n    currency,\n",
    "    loanContributionRules,\n    sharedObligationTemplates,\n    sharedTemplateResponsibilities,\n    externalLoanContributions,\n    currency,\n",
)
replace_once(
    'src/context/AppContext.tsx',
    "      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, personalExpenseRecords, addSharedPerson, archiveSharedPerson, createSharedExpense, recordSharedPayment, recordSharedSettlement, configureLoanSharing,\n",
    "      people, sharedObligations, sharedResponsibilities, sharedPayments, sharedSettlements, loanSharingRules, loanContributionRules, sharedObligationTemplates, sharedTemplateResponsibilities, externalLoanContributions, personalExpenseRecords, addSharedPerson, archiveSharedPerson, createSharedExpense, recordSharedPayment, recordSharedSettlement, configureLoanSharing, settleSharedBalance, recordExternalLoanPayment,\n",
)

print('v3.4 finish core patch applied')
