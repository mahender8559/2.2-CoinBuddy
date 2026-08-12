import type { Account, RecurringRule } from '../types';

export const investmentSipRuleId = (accountId: string) => `investment-sip:${accountId}`;

export function isInvestmentSipAccount(account: Pick<Account, 'type' | 'group' | 'investmentMethod' | 'monthlySIPAmount' | 'nextSIPDate'>): boolean {
  return account.type === 'asset' &&
    String(account.group ?? '').trim().toLowerCase() === 'investment' &&
    account.investmentMethod === 'SIP' &&
    Number(account.monthlySIPAmount ?? 0) > 0 &&
    Boolean(account.nextSIPDate);
}

export function buildInvestmentSipRule(accountId: string, account: Account, sourceAccountId: string): RecurringRule {
  if (!isInvestmentSipAccount(account)) throw new Error('Investment account does not have an active SIP schedule.');
  if (!sourceAccountId) throw new Error('Choose the account that funds this SIP.');
  const nextDueDate = String(account.nextSIPDate);
  return {
    id: investmentSipRuleId(accountId),
    title: `SIP: ${account.name}`,
    subtitle: 'Investment contribution',
    amount: Math.abs(Number(account.monthlySIPAmount)),
    transactionType: 'TRANSFER',
    fromAccountId: sourceAccountId,
    toAccountId: accountId,
    category: '#investment',
    icon: 'Target',
    notes: `Managed by investment account ${accountId}`,
    frequency: 'MONTHLY',
    nextDueDate,
    isActive: true,
    anchorDay: Number(nextDueDate.slice(8, 10)),
  };
}

export function findInvestmentSipRule(accountId: string, recurringRules: RecurringRule[]): RecurringRule | undefined {
  return recurringRules.find(rule => rule.id === investmentSipRuleId(accountId)) ??
    recurringRules.find(rule => rule.toAccountId === accountId && rule.transactionType === 'TRANSFER' && rule.notes?.includes(`investment account ${accountId}`));
}
