import type { SqlJsDatabaseDriver } from './dbClient';
import type {
  LoanContributionRule,
  LoanSharingRule,
  Person,
  SharedObligation,
  SharedPayment,
  SharedResponsibility,
  SharedSettlement,
} from '../types';
import { validateResponsibilitySplit } from '../domain/sharedFinances';

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
    transactionId: row.transaction_id ?? undefined, liabilityAccountId: row.liability_account_id ?? undefined,
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
  const [people, obligations, responsibilities, payments, settlements, loanSharing, loanContributions] = await Promise.all([
    driver.query(`SELECT * FROM people ORDER BY is_self DESC, is_archived ASC, name ASC`),
    driver.query(`SELECT * FROM shared_obligations ORDER BY created_at DESC, id DESC`),
    driver.query(`SELECT * FROM shared_responsibilities ORDER BY obligation_id, id`),
    driver.query(`SELECT * FROM shared_payments ORDER BY paid_at DESC, id DESC`),
    driver.query(`SELECT * FROM shared_settlements ORDER BY settled_at DESC, id DESC`),
    driver.query(`SELECT * FROM loan_sharing_rules ORDER BY account_id`),
    driver.query(`SELECT * FROM loan_contribution_rules ORDER BY account_id, id`),
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
      mode: row.mode, value: Number(row.value), isActive: Number(row.is_active) === 1,
    })),
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
  const rows = await driver.query(`SELECT is_self FROM people WHERE id = ?`, [personId]);
  if (!rows[0]) throw new Error('Person not found.');
  if (Number(rows[0].is_self) === 1) throw new Error('The CoinBuddy owner cannot be archived.');
  await driver.execute(`UPDATE people SET is_archived = 1 WHERE id = ?`, [personId]);
}

export async function createSharedObligation(
  driver: SqlJsDatabaseDriver,
  input: Omit<SharedObligation, 'id' | 'createdAt' | 'status'> & { id?: string; createdAt?: string; status?: SharedObligation['status'] },
  allocations: Array<{ personId: string; amount: number }>,
  initialPayments: Array<Omit<SharedPayment, 'id' | 'obligationId'> & { id?: string }> = [],
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

  await driver.execute('BEGIN TRANSACTION');
  try {
    await driver.execute(
      `INSERT INTO shared_obligations (id, title, kind, total_amount, category_id, due_date, transaction_id, liability_account_id, recurring_rule_id, settlement_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [obligation.id, obligation.title.trim(), obligation.kind, obligation.totalAmount, obligation.categoryId ?? null, obligation.dueDate ?? null, obligation.transactionId ?? null, obligation.liabilityAccountId ?? null, obligation.recurringRuleId ?? null, obligation.settlementMode, obligation.status, obligation.createdAt],
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
    await driver.execute('COMMIT');
    return obligation;
  } catch (error) {
    await driver.execute('ROLLBACK');
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

export async function replaceLoanContributionRules(driver: SqlJsDatabaseDriver, accountId: string, rules: Array<Omit<LoanContributionRule, 'id' | 'accountId'> & { id?: string }>): Promise<void> {
  const active = rules.filter(rule => rule.isActive);
  const percentRules = active.filter(rule => rule.mode === 'PERCENT');
  const fixedRules = active.filter(rule => rule.mode === 'FIXED');
  if (percentRules.length && fixedRules.length) throw new Error('Use either percentage or fixed contribution rules for a loan, not both at the same time.');
  if (percentRules.length) {
    const total = percentRules.reduce((sum, rule) => sum + Number(rule.value), 0);
    if (Math.abs(total - 100) > 0.01) throw new Error('Active percentage EMI contributions must add up to 100%.');
  }
  const ids = new Set(active.map(rule => rule.personId));
  if (ids.size !== active.length) throw new Error('Each person can have only one active EMI contribution rule per loan.');
  await driver.execute('BEGIN TRANSACTION');
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
    await driver.execute('COMMIT');
  } catch (error) {
    await driver.execute('ROLLBACK');
    throw error;
  }
}
