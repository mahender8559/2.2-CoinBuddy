import { describe, expect, it } from 'vitest';
import type { Account, Category, Person, SharedObligation, SharedPayment, SharedResponsibility, SharedSettlement, SharedObligationTemplate, SharedTemplateResponsibility } from '../types';
import { getPersonNetClaim } from './sharedFinances';
import { projectAffordability } from './affordability';
import { personalExpenseRecordsToTransactions, type PersonalExpenseRecord } from './personalSpending';

const people: Person[] = [
  { id: 'me', name: 'Me', isSelf: true, isArchived: false },
  { id: 'brother', name: 'Brother', isSelf: false, isArchived: false },
];

describe('v3.4 final shared-finance rules', () => {
  it('reduces a fronted claim as reimbursements are settled without changing responsibility', () => {
    const obligation: SharedObligation = { id: 'rent', title: 'Rent', kind: 'EXPENSE', totalAmount: 22000, settlementMode: 'TRACK', status: 'OPEN', createdAt: '2026-08-01T00:00:00Z' };
    const responsibilities: SharedResponsibility[] = [
      { id: 'r1', obligationId: 'rent', personId: 'me', amount: 12000 },
      { id: 'r2', obligationId: 'rent', personId: 'brother', amount: 10000 },
    ];
    const payments: SharedPayment[] = [{ id: 'p1', obligationId: 'rent', personId: 'me', amount: 22000, source: 'TRACKED', paidAt: '2026-08-01T00:00:00Z' }];
    const settlements: SharedSettlement[] = [{ id: 's1', obligationId: 'rent', fromPersonId: 'brother', toPersonId: 'me', amount: 4000, settledAt: '2026-08-05T00:00:00Z' }];
    expect(getPersonNetClaim('rent', 'me', responsibilities, payments, settlements)).toBe(6000);
    expect(getPersonNetClaim('rent', 'brother', responsibilities, payments, settlements)).toBe(-6000);
  });

  it('protects only the users share of a recurring household obligation in affordability', () => {
    const bank: Account = { id: 'bank', name: 'Bank', type: 'asset', balance: 40000, group: 'Bank Account' };
    const category: Category = { id: 'utilities', name: 'Utilities', icon: 'Zap', type: 'expense', affordabilityClass: 'NORMAL' };
    const templates: SharedObligationTemplate[] = [{ id: 'template', title: 'Family Utilities', totalAmount: 4000, categoryId: 'utilities', frequency: 'MONTHLY', nextDueDate: '2026-09-05', isActive: true, settlementMode: 'TRACK', createdAt: '2026-08-01T00:00:00Z' }];
    const templateResponsibilities: SharedTemplateResponsibility[] = [
      { id: 'tr1', templateId: 'template', personId: 'me', amount: 2500 },
      { id: 'tr2', templateId: 'template', personId: 'brother', amount: 1500 },
    ];
    const result = projectAffordability({ asOfDate: '2026-08-13', endDate: '2026-09-30', accounts: [bank], transactions: [], recurringRules: [], categories: [category], creditCards: [], people, sharedObligationTemplates: templates, sharedTemplateResponsibilities: templateResponsibilities, settings: { plannedSavingsTarget: 0, contingencyBuffer: 0, protectedCashReserve: 0 }, purchaseAmount: 0 });
    expect(result.expectedExpenses).toBe(2500);
    expect(result.expensesByClass.NORMAL).toBe(2500);
  });

  it('converts economic spending history without leaking tracked cash amounts into estimators', () => {
    const records: PersonalExpenseRecord[] = [{ id: 'rent', source: 'SHARED_OBLIGATION', obligationId: 'rent', transactionId: 'cash-rent', title: 'Rent', category: 'rent', date: '2026-08-01T12:00:00Z', amount: 12000, cashAmount: 22000 }];
    const transactions = personalExpenseRecordsToTransactions(records);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(12000);
    expect(transactions[0].transaction_type).toBe('EXPENSE');
  });
});
