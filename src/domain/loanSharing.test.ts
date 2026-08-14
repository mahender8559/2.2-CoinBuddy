import { describe, expect, it } from 'vitest';
import type { Account, LoanContributionRule, LoanSharingRule, Person } from '../types';
import { getMyExpectedLoanContribution, getPersonalLiabilityExposure } from './loanSharing';

const loan: Account = {
  id: 'home-loan', name: 'Home Loan', type: 'liability', group: 'Bank Loan',
  balance: 600000, monthlyEMI: 20000,
};
const people: Person[] = [
  { id: 'me', name: 'Me', relationship: 'Self', isSelf: true, isArchived: false },
  { id: 'brother', name: 'Brother', relationship: 'Brother', isSelf: false, isArchived: false },
];
const sharing: LoanSharingRule[] = [{ accountId: loan.id, personalResponsibilityPercent: 50, isShared: true }];

describe('shared loan responsibility', () => {
  it('keeps full loan balance separate from personal liability exposure', () => {
    expect(getPersonalLiabilityExposure(loan, sharing)).toBe(300000);
    expect(loan.balance).toBe(600000);
  });

  it('uses the users percentage EMI contribution for affordability', () => {
    const rules: LoanContributionRule[] = [
      { id: 'c1', accountId: loan.id, personId: 'me', mode: 'PERCENT', value: 60, isActive: true },
      { id: 'c2', accountId: loan.id, personId: 'brother', mode: 'PERCENT', value: 40, isActive: true },
    ];
    expect(getMyExpectedLoanContribution(loan, people, sharing, rules)).toBe(12000);
  });

  it('supports fixed contribution amounts', () => {
    const rules: LoanContributionRule[] = [
      { id: 'c1', accountId: loan.id, personId: 'me', mode: 'FIXED', value: 12000, isActive: true },
      { id: 'c2', accountId: loan.id, personId: 'brother', mode: 'FIXED', value: 8000, isActive: true },
    ];
    expect(getMyExpectedLoanContribution(loan, people, sharing, rules)).toBe(12000);
  });

  it('falls back to the full EMI when a shared configuration is incomplete', () => {
    expect(getMyExpectedLoanContribution(loan, people, sharing, [])).toBe(20000);
    expect(getMyExpectedLoanContribution(loan, people, [], [])).toBe(20000);
  });
});
