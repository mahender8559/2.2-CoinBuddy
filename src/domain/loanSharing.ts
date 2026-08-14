import type { Account, LoanContributionRule, LoanSharingRule, Person } from '../types';
import { getSelfPerson } from './sharedFinances';

function nonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function getPersonalLiabilityExposure(
  account: Account,
  sharingRules: LoanSharingRule[],
): number {
  const balance = nonNegative(account.balance);
  const sharing = sharingRules.find(rule => rule.accountId === account.id && rule.isShared);
  if (!sharing) return balance;
  const percent = Math.max(0, Math.min(100, Number(sharing.personalResponsibilityPercent) || 0));
  return Math.round(balance * percent) / 100;
}

/**
 * The affordability obligation for this user. This never changes the full EMI
 * used by the loan/amortization engine.
 *
 * If a shared loan is configured incompletely, we deliberately fall back to the
 * full EMI rather than under-reserving cash.
 */
export function getMyExpectedLoanContribution(
  account: Account,
  people: Person[],
  sharingRules: LoanSharingRule[],
  contributionRules: LoanContributionRule[],
): number {
  const fullPayment = nonNegative(account.monthlyEMI);
  const sharing = sharingRules.find(rule => rule.accountId === account.id && rule.isShared);
  if (!sharing) return fullPayment;

  const me = getSelfPerson(people);
  if (!me) return fullPayment;
  const active = contributionRules.filter(rule => rule.accountId === account.id && rule.isActive);
  if (!active.length) return fullPayment;
  const mine = active.find(rule => rule.personId === me.id);
  if (!mine) return fullPayment;

  if (mine.mode === 'PERCENT') {
    const percentage = Math.max(0, Math.min(100, Number(mine.value) || 0));
    return Math.round(fullPayment * percentage) / 100;
  }
  return Math.min(fullPayment, Math.round(nonNegative(mine.value) * 100) / 100);
}

export function describeLoanContribution(
  account: Account,
  people: Person[],
  contributionRules: LoanContributionRule[],
): Array<{ personId: string; name: string; amount: number }> {
  const fullPayment = nonNegative(account.monthlyEMI);
  return contributionRules
    .filter(rule => rule.accountId === account.id && rule.isActive)
    .map(rule => {
      const person = people.find(item => item.id === rule.personId);
      const amount = rule.mode === 'PERCENT'
        ? Math.round(fullPayment * Math.max(0, Number(rule.value) || 0)) / 100
        : Math.round(nonNegative(rule.value) * 100) / 100;
      return { personId: rule.personId, name: person?.name ?? 'Unknown person', amount };
    });
}
