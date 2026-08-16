import { describe, expect, it } from 'vitest';
import type { Account, LoanRevision } from '../types';
import { applyLoanRevisionProjection } from '../domain/loanRevisionProjection';

const AS_OF = '2026-08-16';
const baseAccount: Account = {
  id: 'loan-1',
  name: 'Home loan',
  type: 'liability',
  group: 'Loan',
  balance: 0,
  interestRate: 8,
  monthlyEMI: 25000,
  tenureMonths: 120,
  paymentFrequency: 'MONTHLY',
};

const older: LoanRevision = {
  id: 'rev-1',
  accountId: 'loan-1',
  effectiveDate: '2026-01-01',
  newInterestRate: 8.5,
  newEmi: 26000,
  newTenureMonths: 116,
  paymentFrequency: 'MONTHLY',
};

const latest: LoanRevision = {
  id: 'rev-2',
  accountId: 'loan-1',
  effectiveDate: '2026-06-01',
  newInterestRate: 9.1,
  newEmi: 27500,
  newTenureMonths: 112,
  paymentFrequency: 'MONTHLY',
};

const future: LoanRevision = {
  id: 'rev-future',
  accountId: 'loan-1',
  effectiveDate: '2026-12-01',
  newInterestRate: 10.25,
  newEmi: 29000,
  newTenureMonths: 108,
  paymentFrequency: 'MONTHLY',
};

describe('applyLoanRevisionProjection', () => {
  it('restores the latest effective persisted loan terms and full revision history after reload', () => {
    const [projected] = applyLoanRevisionProjection([baseAccount], [older, latest], AS_OF);
    expect(projected.interestRate).toBe(9.1);
    expect(projected.monthlyEMI).toBe(27500);
    expect(projected.tenureMonths).toBe(112);
    expect(projected.revisions?.map(item => item.id)).toEqual(['rev-2', 'rev-1']);
  });

  it('keeps future revisions in history without applying their terms early', () => {
    const [projected] = applyLoanRevisionProjection([baseAccount], [older, latest, future], AS_OF);
    expect(projected.interestRate).toBe(9.1);
    expect(projected.monthlyEMI).toBe(27500);
    expect(projected.revisions?.map(item => item.id)).toEqual(['rev-future', 'rev-2', 'rev-1']);
  });

  it('falls back to the previous persisted revision when the latest effective revision is deleted', () => {
    const [projected] = applyLoanRevisionProjection([baseAccount], [older], AS_OF);
    expect(projected.interestRate).toBe(8.5);
    expect(projected.monthlyEMI).toBe(26000);
    expect(projected.tenureMonths).toBe(116);
  });

  it('keeps base account terms when only future revisions exist', () => {
    const [projected] = applyLoanRevisionProjection([baseAccount], [future], AS_OF);
    expect(projected.interestRate).toBe(8);
    expect(projected.monthlyEMI).toBe(25000);
    expect(projected.tenureMonths).toBe(120);
    expect(projected.revisions?.map(item => item.id)).toEqual(['rev-future']);
  });

  it('keeps base account terms when no persisted revisions exist', () => {
    const [projected] = applyLoanRevisionProjection([baseAccount], [], AS_OF);
    expect(projected).toEqual(baseAccount);
  });
});
