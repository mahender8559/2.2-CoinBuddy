import type { SqlJsDatabaseDriver } from './dbClient';
import type {
  ExternalLoanContribution,
  LoanContributionRule,
  LoanSharingRule,
  Person,
  SharedObligation,
  SharedPayment,
  SharedResponsibility,
  SharedSettlement,
  SharedObligationTemplate,
  SharedTemplateResponsibility,
  RecurrenceFrequency,
} from '../types';
import { validateResponsibilitySplit } from '../domain/sharedFinances';
import { advanceRecurringDate, toLocalDateKey } from '../domain/recurring';
import { calculateEmiSplit } from '../utils/emi';

function isoNow(): string { return new Date().toISOString(); }
function positiveAmount(value: unknown, label = 'Amount'): number {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} must be greater than zero.`);
  return amount;
}

export interface SharedFinanceState {
  people: Person[];
  obligations: SharedObligation[];
  responsibilities: SharedResponsibility[];
  payments: SharedPayment[];
  settlements: SharedSettlement[];
  loanSharingRules: LoanSharingRule[];
  loanContributionRules: LoanContributionRule[];
  obligationTemplates: SharedObligationTemplate[];
  templateResponsibilities: SharedTemplateResponsibility[];
  externalLoanContributions: ExternalLoanContribution[];
}

function personFromRow(row: any): Person {
  return {
    id: String(row.id), name: String(row.name ?? ''), relationship: row.relationship ?? undefined,
    isSelf: Number(row.is_self) === 1, isArchived: Number(row.is_archived) === 1,
  };
}
function obligationFromRow(row: any): SharedObligation {
  return {
    id: String(row.id), title: String(row.title ?? ''), kind: row.kind,
    totalAmount: Number(row.total_amount), categoryId: row.category_id ?? undefined, dueDate: row.due_date ?? undefined,
    templateId: row.template_id ?? undefined, transactionId: row.transaction_id ?? undefined, liabilityAccountId: row.liability_account_id ?? undefined,
    recurringRuleId: row.recurring_rule_id ?? undefined, settlementMode: row.settlement_mode,
    status: row.status, createdAt: row.created_at,
  };
}
function responsibilityFromRow(row: any): SharedResponsibility {
  return { id: String(row.id), obligationId: String(row.obligation_id), personId: String(row.person_id), amount: Number(row.amount) };
}
function paymentFromRow(row: any): SharedPayment {
  return {
    id: String(row.id), obligationId: String(row.obligation_id), personId: String(row.person_id),
    transactionId: row.transaction_id ?? undefined, amount: Number(row.amount), source: row.source, paidAt: row.paid_at,
  };
}
function settlementFromRow(row: any): SharedSettlement {
  return {
    id: String(row.id), obligationId: row.obligation_id ?? undefined,
    fromPersonId: String(row.from_person_id), toPersonId: String(row.to_person_id),
    transactionId: row.transaction_id ?? undefined, amount: Number(row.amount), settledAt: row.settled_at,
  };
}

function templateFromRow(row: any): SharedObligationTemplate {
  return { id: String(row.id), title: String(row.title ?? ''), totalAmount: Number(row.total_amount), categoryId: row.category_id ?? undefined, frequency: row.frequency, nextDueDate: String(row.next_due_date), isActive: Number(row.is_active) === 1, settlementMode: row.settlement_mode, createdAt: String(row.created_at) };
}
function templateResponsibilityFromRow(row: any): SharedTemplateResponsibility {
  return { id: String(row.id), templateId: String(row.template_id), personId: String(row.person_id), amount: Number(row.amount) };
}
function externalLoanContributionFromRow(row: any): ExternalLoanContribution {
  return { id: String(row.id), accountId: String(row.account_id), personId: String(row.person_id), adjustmentTransactionId: row.adjustment_transaction_id ?? undefined, amount: Number(row.amount), principalAmount: Number(row.principal_amount), interestAmount: Number(row.interest_amount), paidAt: String(row.paid_at) };
}

export async function ensureSelfPerson(driver: SqlJsDatabaseDriver, displayName = 'Me'): Promise<Person> {
  const rows = await driver.query(`SELECT * FROM people WHERE is_self = 1 AND is_archived = 0 LIMIT 1`);
  if (rows[0]) return personFromRow(rows[0]);
  const person: Person = { id: crypto.randomUUID(), name: displayName.trim() || 'Me', relationship: 'Self', isSelf: true, isArchived: false };
  await driver.execute(
    `INSERT INTO people (id, name, relationship, is_self, is_archived, created_at) VALUES (?, ?, ?, 1, 0, ?)`,
    [person.id, person.name, person.relationship ?? null, isoNow()],
  );
  return person;
}

export async function loadSharedFinanceState(driver: SqlJsDatabaseDriver): Promise<SharedFinanceState> {
  const [people, obligations, responsibilities, payments, settlements, loanSharing, loanContributions, templates, templateResponsibilities, externalLoanContributions] = await Promise.all([
    driver.query(`SELECT * FROM people ORDER BY is_self DESC, is_archived ASC, name ASC`),
    driver.query(`SELECT * FROM shared_obligations ORDER BY created_at DESC, id DESC`),
    driver.query(`SELECT * FROM shared_responsibilities ORDER BY obligation_id, id`),
    driver.query(`SELECT * FROM shared_payments ORDER BY paid_at DESC, id DESC`),
    driver.query(`SELECT * FROM shared_settlements ORDER BY settled_at DESC, id DESC`),
    driver.query(`SELECT * FROM loan_sharing_rules ORDER BY account_id`),
    driver.query(`SELECT lcr.*, CASE WHEN p.is_archived = 1 THEN 0 ELSE lcr.is_active END AS effective_is_active FROM loan_contribution_rules lcr JOIN people p ON p.id = lcr.person_id ORDER BY lcr.account_id, lcr.id`),
    driver.query(`SELECT * FROM shared_obligation_templates ORDER BY is_active DESC, next_due_date, title`),
    driver.query(`SELECT * FROM shared_template_responsibilities ORDER BY template_id, id`),
    driver.query(`SELECT * FROM external_loan_contributions ORDER BY paid_at DESC, id DESC`),
  ]);
  return {
    people: people.map(personFromRow),
    obligations: obligations.map(obligationFromRow),
    responsibilities: responsibilities.map(responsibilityFromRow),
    payments: payments.map(paymentFromRow),
    settlements: settlements.map(settlementFromRow),
    loanSharingRules: loanSharing.map((row: any) => ({
      accountId: String(row.account_id), personalResponsibilityPercent: Number(row.personal_responsibility_percent), isShared: Number(row.is_shared) === 1,
    })),
    loanContributionRules: loanContributions.map((row: any) => ({
      id: String(row.id), accountId: String(row.account_id), personId: String(row.person_id),
      mode: row.mode, value: Number(row.value), isActive: Number(row.effective_is_active ?? row.is_active) === 1,
    })),
    obligationTemplates: templates.map(templateFromRow),
    templateResponsibilities: templateResponsibilities.map(templateResponsibilityFromRow),
    externalLoanContributions: externalLoanContributions.map(externalLoanContributionFromRow),
  };
}

export async function createPerson(driver: SqlJsDatabaseDriver, input: { name: string; relationship?: string }): Promise<Person> {
  const name = input.name.trim();
  if (!name) throw new Error('Person name is required.');
  const person: Person = { id: crypto.randomUUID(), name, relationship: input.relationship?.trim() || undefined, isSelf: false, isArchived: false };
  await driver.execute(
    `INSERT INTO people (id, name, relationship, is_self, is_archived, created_at) VALUES (?, ?, ?, 0, 0, ?)`,
    [person.id, person.name, person.relationship ?? null, isoNow()],
  );
  return person;
}

export async function archivePerson(driver: SqlJsDatabaseDriver, personId: string): Promise<void> {
  const rows = await driver.query(`SELECT name, is_self, is_archived FROM people WHERE id = ?`, [personId]);
  if (!rows[0]) throw new Error('Person not found.');
  if (Number(rows[0].is_self) === 1) throw new Error('The CoinBuddy owner cannot be archived.');
  if (Number(rows[0].is_archived) === 1) return;

  // A person cannot disappear while a future EMI still depends on them. Require
  // the user to explicitly set this contributor to zero and redistribute the
  // same payment among the remaining active people in the loan editor first.
  const blockingLoans = await driver.query(
    `SELECT lcr.mode, lcr.value, a.name AS loan_name, a.next_emi_date
       FROM loan_contribution_rules lcr
       JOIN accounts a ON a.id = lcr.account_id
      WHERE lcr.person_id = ?
        AND lcr.is_active = 1
        AND lcr.value > 0.009
        AND a.is_archived = 0
      ORDER BY a.name`,
    [personId],
  );
  if (blockingLoans.length) {
    const details = blockingLoans.map((row: any) => {
      const contribution = String(row.mode) === 'PERCENT'
        ? `${Number(row.value)}%`
        : Number(row.value).toFixed(2);
      const nextPayment = row.next_emi_date ? ` · next EMI ${String(row.next_emi_date)}` : '';
      return `${String(row.loan_name)}: ${contribution}${nextPayment}`;
    }).join('; ');
    throw new Error(
      `Before removing ${String(rows[0].name)}, redefine their next EMI contribution. Open Accounts → edit the affected shared loan, set ${String(rows[0].name)} to 0, and redistribute that contribution among the remaining people so the payment still totals 100% or the full EMI. ${details}`,
    );
  }

  const blockingPayoff = await driver.query(`SELECT p.target_amount, lp.target_date, a.name AS loan_name FROM loan_payoff_responsibilities p JOIN loan_payoff_plans lp ON lp.id = p.plan_id JOIN accounts a ON a.id = lp.liability_account_id WHERE p.person_id = ? AND lp.status = 'ACTIVE' AND p.target_amount > 0.009 LIMIT 1`, [personId]);
  if (blockingPayoff[0]) throw new Error(`Before removing ${String(rows[0].name)}, update or cancel their active payoff contribution for ${String(blockingPayoff[0].loan_name)} (target date ${String(blockingPayoff[0].target_date)}).`);

  // Zero-valued rules have already been explicitly reassigned. Mark them
  // inactive before archiving so future calculations and exports remain clean.
  await driver.execute(`UPDATE loan_contribution_rules SET is_active = 0 WHERE person_id = ? AND is_active = 1`, [personId]);
  await driver.execute(`UPDATE people SET is_archived = 1 WHERE id = ?`, [personId]);
}

export async function createSharedObligation(
  driver: SqlJsDatabaseDriver,
  input: Omit<SharedObligation, 'id' | 'createdAt' | 'status'> & { id?: string; createdAt?: string; status?: SharedObligation['status'] },
  allocations: Array<{ personId: string; amount: number }>,
  initialPayments: Array<Omit<SharedPayment, 'id' | 'obligationId'> & { id?: string }> = [],
  manageTransaction = true,
): Promise<SharedObligation> {
  const obligation: SharedObligation = {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    totalAmount: positiveAmount(input.totalAmount, 'Obligation total'),
    status: input.status ?? 'OPEN',
    createdAt: input.createdAt ?? isoNow(),
  };
  const responsibilities: SharedResponsibility[] = allocations.map(item => ({
    id: crypto.randomUUID(), obligationId: obligation.id, personId: item.personId,
    amount: positiveAmount(item.amount, 'Responsibility amount'),
  }));
  const splitError = validateResponsibilitySplit(obligation, responsibilities);
  if (splitError) throw new Error(splitError);

  if (manageTransaction) await driver.execute('BEGIN TRANSACTION');
  try {
    await driver.execute(
      `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, template_id, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [obligation.id, obligation.title.trim(), obligation.kind, obligation.totalAmount, obligation.categoryId ?? null, obligation.dueDate ?? null, obligation.templateId ?? null, obligation.transactionId ?? null, obligation.liabilityAccountId ?? null, obligation.recurringRuleId ?? null, obligation.settlementMode, obligation.status, obligation.createdAt],
    );
    for (const allocation of responsibilities) {
      await driver.execute(`INSERT INTO shared_responsibilities (id, obligation_id, person_id, amount) VALUES (?, ?, ?, ?)`, [allocation.id, allocation.obligationId, allocation.personId, allocation.amount]);
    }
    for (const payment of initialPayments) {
      if (payment.source === 'EXTERNAL' && payment.transactionId) throw new Error('External payments cannot reference a tracked transaction.');
      await driver.execute(
        `INSERT INTO shared_payments (id, obligation_id, person_id, transaction_id, amount, source, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [payment.id ?? crypto.randomUUID(), obligation.id, payment.personId, payment.transactionId ?? null, positiveAmount(payment.amount, 'Payment amount'), payment.source, payment.paidAt],
      );
    }
    if (manageTransaction) await driver.execute('COMMIT');
    return obligation;
  } catch (error) {
    if (manageTransaction) await driver.execute('ROLLBACK');
    throw error;
  }
}

export async function addSharedPayment(driver: SqlJsDatabaseDriver, payment: Omit<SharedPayment, 'id'> & { id?: string }): Promise<SharedPayment> {
  if (payment.source === 'EXTERNAL' && payment.transactionId) throw new Error('External payments cannot reference a tracked transaction.');
  const row: SharedPayment = { ...payment, id: payment.id ?? crypto.randomUUID(), amount: positiveAmount(payment.amount, 'Payment amount') };
  await driver.execute(
    `INSERT INTO shared_payments (id, obligation_id, person_id, transaction_id, amount, source, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.obligationId, row.personId, row.transactionId ?? null, row.amount, row.source, row.paidAt],
  );
  return row;
}

export async function addSharedSettlement(driver: SqlJsDatabaseDriver, settlement: Omit<SharedSettlement, 'id'> & { id?: string }): Promise<SharedSettlement> {
  if (settlement.fromPersonId === settlement.toPersonId) throw new Error('A settlement must be between two different people.');
  const row: SharedSettlement = { ...settlement, id: settlement.id ?? crypto.randomUUID(), amount: positiveAmount(settlement.amount, 'Settlement amount') };
  await driver.execute(
    `INSERT INTO shared_settlements (id, obligation_id, from_person_id, to_person_id, transaction_id, amount, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.obligationId ?? null, row.fromPersonId, row.toPersonId, row.transactionId ?? null, row.amount, row.settledAt],
  );
  return row;
}

export async function createSharedObligationTemplate(
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

export async function setSharedObligationTemplateActive(driver: SqlJsDatabaseDriver, templateId: string, isActive: boolean): Promise<void> {
  const rows = await driver.query(`SELECT id FROM shared_obligation_templates WHERE id = ?`, [templateId]);
  if (!rows[0]) throw new Error('Recurring shared obligation was not found.');
  await driver.execute(`UPDATE shared_obligation_templates SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, templateId]);
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
  if (input.obligationId) {
    const obligations = await driver.query(`SELECT id FROM shared_obligations WHERE id = ? AND status <> 'CANCELLED'`, [input.obligationId]);
    if (!obligations[0]) throw new Error('The selected shared obligation no longer exists.');
    const [responsibilities, payments, settlements] = await Promise.all([
      driver.query(`SELECT person_id, amount FROM shared_responsibilities WHERE obligation_id = ?`, [input.obligationId]),
      driver.query(`SELECT person_id, amount FROM shared_payments WHERE obligation_id = ?`, [input.obligationId]),
      driver.query(`SELECT from_person_id, to_person_id, amount FROM shared_settlements WHERE obligation_id = ?`, [input.obligationId]),
    ]);
    const claim = (personId: string) => {
      const paid = payments.filter((row: any) => String(row.person_id) === personId).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      const responsibility = responsibilities.filter((row: any) => String(row.person_id) === personId).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      const outgoing = settlements.filter((row: any) => String(row.from_person_id) === personId).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      const incoming = settlements.filter((row: any) => String(row.to_person_id) === personId).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      return Math.round((paid - responsibility + outgoing - incoming) * 100) / 100;
    };
    const payerOwes = Math.max(0, -claim(input.fromPersonId));
    const receiverClaim = Math.max(0, claim(input.toPersonId));
    const maximum = Math.min(payerOwes, receiverClaim);
    if (maximum <= 0.009) throw new Error('These two people do not currently have a settlement balance in that direction.');
    if (amount > maximum + 0.01) throw new Error(`Settlement cannot exceed the outstanding shared balance of ${maximum.toFixed(2)}.`);
  }
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

export async function setLoanSharingRule(driver: SqlJsDatabaseDriver, rule: LoanSharingRule): Promise<void> {
  const percentage = Number(rule.personalResponsibilityPercent);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new Error('Personal liability responsibility must be between 0% and 100%.');
  const accounts = await driver.query(`SELECT type FROM accounts WHERE id = ?`, [rule.accountId]);
  if (!accounts[0] || String(accounts[0].type).toUpperCase() !== 'LIABILITY') throw new Error('Loan sharing can only be configured for a liability account.');
  await driver.execute(
    `INSERT INTO loan_sharing_rules (account_id, personal_responsibility_percent, is_shared) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET personal_responsibility_percent = excluded.personal_responsibility_percent, is_shared = excluded.is_shared`,
    [rule.accountId, percentage, rule.isShared ? 1 : 0],
  );
}

export async function replaceLoanContributionRules(driver: SqlJsDatabaseDriver, accountId: string, rules: Array<Omit<LoanContributionRule, 'id' | 'accountId'> & { id?: string }>, manageTransaction = true): Promise<void> {
  const active = rules.filter(rule => rule.isActive);
  const percentRules = active.filter(rule => rule.mode === 'PERCENT');
  const fixedRules = active.filter(rule => rule.mode === 'FIXED');
  if (percentRules.length && fixedRules.length) throw new Error('Use either percentage or fixed contribution rules for a loan, not both at the same time.');
  if (percentRules.length) {
    const total = percentRules.reduce((sum, rule) => sum + Number(rule.value), 0);
    if (Math.abs(total - 100) > 0.01) throw new Error('Active percentage EMI contributions must add up to 100%.');
  }
  if (fixedRules.length) {
    const accountRows = await driver.query(`SELECT monthly_emi FROM accounts WHERE id = ? AND type = 'LIABILITY'`, [accountId]);
    if (!accountRows[0]) throw new Error('Loan contribution rules require a liability account.');
    const emi = Math.max(0, Number(accountRows[0].monthly_emi ?? 0));
    const total = fixedRules.reduce((sum, rule) => sum + Number(rule.value), 0);
    if (Math.abs(total - emi) > 0.01) throw new Error('Active fixed EMI contributions must add up to the full loan payment.');
  }
  const ids = new Set(active.map(rule => rule.personId));
  if (ids.size !== active.length) throw new Error('Each person can have only one active EMI contribution rule per loan.');
  if (manageTransaction) await driver.execute('BEGIN TRANSACTION');
  try {
    await driver.execute(`DELETE FROM loan_contribution_rules WHERE account_id = ?`, [accountId]);
    for (const rule of rules) {
      const value = Number(rule.value);
      if (!Number.isFinite(value) || value < 0) throw new Error('Loan contribution value cannot be negative.');
      await driver.execute(
        `INSERT INTO loan_contribution_rules (id, account_id, person_id, mode, value, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
        [rule.id ?? crypto.randomUUID(), accountId, rule.personId, rule.mode, value, rule.isActive ? 1 : 0],
      );
    }
    if (manageTransaction) await driver.execute('COMMIT');
  } catch (error) {
    if (manageTransaction) await driver.execute('ROLLBACK');
    throw error;
  }
}
