import { describe, expect, it } from 'vitest';
import type { Account, LoanPayoffFundMovement, LoanPayoffPlan, LoanPayoffResponsibility } from '../types';
import {
  getLoanPayoffFundingSummary,
  getLoanPayoffTrackedReservedForAccount,
  getSpendableAccountBalance,
  getTrackedReservedForAccount,
  validateLoanPayoffResponsibilitySplit,
} from './loanPayoff';

const plan: LoanPayoffPlan = { id: 'plan', liabilityAccountId: 'loan', targetAmount: 200000, targetDate: '2026-10-31', payoffType: 'PARTIAL', status: 'ACTIVE', createdAt: '2026-08-31T00:00:00.000Z' };
const movements: LoanPayoffFundMovement[] = [
  { id: 'm1', planId: 'plan', personId: 'me', assetAccountId: 'hdfc', holdingType: 'TRACKED', movementType: 'RESERVE', amount: 70000, createdAt: '2026-08-31T00:00:00.000Z' },
  { id: 'm2', planId: 'plan', personId: 'brother', holdingType: 'EXTERNAL', movementType: 'RESERVE', amount: 30000, createdAt: '2026-08-31T00:00:00.000Z' },
  { id: 'm3', planId: 'plan', personId: 'me', assetAccountId: 'hdfc', holdingType: 'TRACKED', movementType: 'RELEASE', amount: 10000, createdAt: '2026-09-01T00:00:00.000Z' },
];

describe('loan payoff reserved funds', () => {
  it('derives tracked reserve and spendable cash without changing the real balance', () => {
    const account: Account = { id: 'hdfc', name: 'HDFC', type: 'asset', balance: 120000 };
    expect(getLoanPayoffTrackedReservedForAccount('plan', 'hdfc', movements)).toBe(60000);
    expect(getTrackedReservedForAccount([plan], movements, 'hdfc')).toBe(60000);
    expect(getSpendableAccountBalance(account, 60000)).toBe(60000);
  });

  it('derives plan progress from append-only movements', () => {
    const responsibilities: LoanPayoffResponsibility[] = [
      { id: 'r1', planId: 'plan', personId: 'me', targetAmount: 120000 },
      { id: 'r2', planId: 'plan', personId: 'brother', targetAmount: 80000 },
    ];
    expect(getLoanPayoffFundingSummary(plan, responsibilities, movements)).toMatchObject({ reserved: 90000, consumed: 0, fundedAmount: 90000, remaining: 110000, progress: 45, funded: false });
  });

  it('keeps consumed lender payments counted toward payoff progress', () => {
    const paid = [...movements, { id: 'm4', planId: 'plan', personId: 'me', assetAccountId: 'hdfc', holdingType: 'TRACKED' as const, movementType: 'CONSUME' as const, amount: 50000, createdAt: '2026-09-02T00:00:00.000Z' }];
    expect(getLoanPayoffFundingSummary(plan, [], paid)).toMatchObject({ reserved: 40000, consumed: 50000, fundedAmount: 90000, remaining: 110000, progress: 45 });
  });

  it('requires contributor targets to exactly match the payoff target', () => {
    expect(validateLoanPayoffResponsibilitySplit(200000, [{ targetAmount: 120000 }, { targetAmount: 80000 }])).toBeNull();
    expect(validateLoanPayoffResponsibilitySplit(200000, [{ targetAmount: 120000 }, { targetAmount: 70000 }])).toContain('must total exactly');
  });
});
