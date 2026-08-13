import { describe, expect, it } from 'vitest';
import type { Person, SharedObligation, SharedResponsibility, Transaction } from '../types';
import { buildPersonalExpenseRecords } from './personalSpending';

const people: Person[] = [
  { id: 'me', name: 'Me', relationship: 'Self', isSelf: true, isArchived: false },
  { id: 'brother', name: 'Brother', relationship: 'Brother', isSelf: false, isArchived: false },
];

const expense = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'rent-tx', title: 'Rent', subtitle: '', amount: 30000, date: '2026-08-05T12:00:00.000Z',
  category: '#rent', icon: 'Home', type: 'expense', transaction_type: 'EXPENSE', is_verified: 1,
  ...overrides,
});

const sharedRent: SharedObligation = {
  id: 'rent-obligation', title: 'Family Rent', kind: 'EXPENSE', totalAmount: 30000,
  categoryId: 'cat-rent', dueDate: '2026-08-05', transactionId: 'rent-tx', settlementMode: 'TRACK',
  status: 'OPEN', createdAt: '2026-08-01T12:00:00.000Z',
};
const responsibilities: SharedResponsibility[] = [
  { id: 'r1', obligationId: sharedRent.id, personId: 'me', amount: 15000 },
  { id: 'r2', obligationId: sharedRent.id, personId: 'brother', amount: 15000 },
];

describe('personal spending resolver', () => {
  it('keeps full tracked cash while attributing only the users shared responsibility', () => {
    const [record] = buildPersonalExpenseRecords([expense()], people, [sharedRent], responsibilities);
    expect(record.amount).toBe(15000);
    expect(record.cashAmount).toBe(30000);
    expect(record.category).toBe('cat-rent');
  });

  it('counts an external-only obligation as personal spending without inventing cash', () => {
    const externalOnly = { ...sharedRent, id: 'external-rent', transactionId: undefined };
    const split = responsibilities.map(row => ({ ...row, id: `${row.id}-x`, obligationId: externalOnly.id }));
    const [record] = buildPersonalExpenseRecords([], people, [externalOnly], split);
    expect(record.amount).toBe(15000);
    expect(record.cashAmount).toBe(0);
    expect(record.date).toBe('2026-08-05');
  });

  it('does not double count the linked transaction and shared obligation', () => {
    const records = buildPersonalExpenseRecords([expense()], people, [sharedRent], responsibilities);
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(`obligation:${sharedRent.id}`);
  });

  it('keeps unshared expenses at their full economic amount', () => {
    const [record] = buildPersonalExpenseRecords([expense({ id: 'food', title: 'Dinner', amount: 1800, category: '#dining' })], people, [], []);
    expect(record.amount).toBe(1800);
    expect(record.cashAmount).toBe(1800);
  });

  it('excludes a shared expense when the user has no responsibility share', () => {
    const otherOnly = responsibilities.filter(row => row.personId === 'brother').map(row => ({ ...row, amount: 30000 }));
    expect(buildPersonalExpenseRecords([expense()], people, [sharedRent], otherOnly)).toEqual([]);
  });
});
