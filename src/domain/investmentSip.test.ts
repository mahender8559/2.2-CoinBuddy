import { describe, expect, it } from 'vitest';
import type { Account } from '../types';
import { buildInvestmentSipRule, investmentSipRuleId, isInvestmentSipAccount } from './investmentSip';

const account: Account = {
  id: 'invest', name: 'Index Fund', type: 'asset', group: 'Investment', balance: 0,
  investmentMethod: 'SIP', monthlySIPAmount: 10000, nextSIPDate: '2026-09-05',
};

describe('investment SIP recurring schedule', () => {
  it('maps SIP account metadata to a real recurring transfer', () => {
    const rule = buildInvestmentSipRule(account.id, account, 'bank');
    expect(rule.id).toBe(investmentSipRuleId('invest'));
    expect(rule.transactionType).toBe('TRANSFER');
    expect(rule.fromAccountId).toBe('bank');
    expect(rule.toAccountId).toBe('invest');
    expect(rule.amount).toBe(10000);
    expect(rule.nextDueDate).toBe('2026-09-05');
    expect(rule.frequency).toBe('MONTHLY');
  });

  it('does not consider lump-sum investments to be SIP schedules', () => {
    expect(isInvestmentSipAccount({ ...account, investmentMethod: 'Lump Sum' })).toBe(false);
  });
});
