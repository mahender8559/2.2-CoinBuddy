import type {
  Person,
  SharedObligation,
  SharedPayment,
  SharedResponsibility,
  SharedSettlement,
} from '../types';

const EPSILON = 0.01;

function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(Math.max(0, n) * 100) / 100 : 0;
}

export function getSelfPerson(people: Person[]): Person | undefined {
  return people.find(person => person.isSelf && !person.isArchived);
}

export function getResponsibilityTotal(obligationId: string, responsibilities: SharedResponsibility[]): number {
  return money(responsibilities
    .filter(item => item.obligationId === obligationId)
    .reduce((sum, item) => sum + money(item.amount), 0));
}

export function validateResponsibilitySplit(
  obligation: Pick<SharedObligation, 'id' | 'totalAmount'>,
  responsibilities: SharedResponsibility[],
): string | null {
  const rows = responsibilities.filter(item => item.obligationId === obligation.id);
  if (rows.length === 0) return 'A shared obligation must have at least one responsibility allocation.';
  if (rows.some(row => money(row.amount) <= 0)) return 'Responsibility allocations must be greater than zero.';
  const personIds = new Set(rows.map(row => row.personId));
  if (personIds.size !== rows.length) return 'A person can appear only once in an obligation responsibility split.';
  const difference = Math.abs(getResponsibilityTotal(obligation.id, responsibilities) - money(obligation.totalAmount));
  return difference > EPSILON ? 'Responsibility allocations must add up to the full obligation amount.' : null;
}

export function getPersonResponsibility(
  obligationId: string,
  personId: string,
  responsibilities: SharedResponsibility[],
): number {
  return money(responsibilities
    .filter(item => item.obligationId === obligationId && item.personId === personId)
    .reduce((sum, item) => sum + money(item.amount), 0));
}

export function getPersonPayments(
  obligationId: string,
  personId: string,
  payments: SharedPayment[],
): number {
  return money(payments
    .filter(item => item.obligationId === obligationId && item.personId === personId)
    .reduce((sum, item) => sum + money(item.amount), 0));
}

export function getNetSettlementBetween(
  fromPersonId: string,
  toPersonId: string,
  settlements: SharedSettlement[],
): number {
  const forward = settlements
    .filter(item => item.fromPersonId === fromPersonId && item.toPersonId === toPersonId)
    .reduce((sum, item) => sum + money(item.amount), 0);
  const reverse = settlements
    .filter(item => item.fromPersonId === toPersonId && item.toPersonId === fromPersonId)
    .reduce((sum, item) => sum + money(item.amount), 0);
  return money(forward - reverse);
}

/** Positive means the person still owes money toward the obligation; negative means they fronted money for others. */
export function getPersonOutstanding(
  obligationId: string,
  personId: string,
  responsibilities: SharedResponsibility[],
  payments: SharedPayment[],
): number {
  return Math.round((
    getPersonResponsibility(obligationId, personId, responsibilities)
    - getPersonPayments(obligationId, personId, payments)
  ) * 100) / 100;
}

/**
 * Returns the economic cost that belongs to the CoinBuddy user, independent of
 * who physically paid. Recording or fronting a bill never makes the whole bill theirs.
 */
export function getMyEconomicCost(
  obligation: SharedObligation,
  people: Person[],
  responsibilities: SharedResponsibility[],
): number {
  const me = getSelfPerson(people);
  return me ? getPersonResponsibility(obligation.id, me.id, responsibilities) : 0;
}

/**
 * Returns cash that actually moved through tracked accounts for the obligation.
 * EXTERNAL payments deliberately do not affect the user's cash flow.
 */
export function getTrackedCashPaid(obligationId: string, payments: SharedPayment[]): number {
  return money(payments
    .filter(item => item.obligationId === obligationId && item.source === 'TRACKED')
    .reduce((sum, item) => sum + money(item.amount), 0));
}

export function isObligationFunded(obligation: SharedObligation, payments: SharedPayment[]): boolean {
  const funded = payments
    .filter(item => item.obligationId === obligation.id)
    .reduce((sum, item) => sum + money(item.amount), 0);
  return funded + EPSILON >= money(obligation.totalAmount);
}
