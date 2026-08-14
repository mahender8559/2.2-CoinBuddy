import { describe, expect, it } from 'vitest';
import type { Person, SharedObligation, SharedPayment, SharedResponsibility, SharedSettlement } from '../types';
import {
  getMyEconomicCost,
  getNetSettlementBetween,
  getPersonOutstanding,
  getTrackedCashPaid,
  isObligationFunded,
  validateResponsibilitySplit,
} from './sharedFinances';

const people: Person[] = [
  { id: 'me', name: 'Me', relationship: 'Self', isSelf: true, isArchived: false },
  { id: 'brother', name: 'Brother', relationship: 'Brother', isSelf: false, isArchived: false },
];

const obligation: SharedObligation = {
  id: 'rent-aug',
  title: 'August Rent',
  kind: 'EXPENSE',
  totalAmount: 30000,
  settlementMode: 'TRACK',
  status: 'OPEN',
  createdAt: '2026-08-01T12:00:00.000Z',
};

const responsibilities: SharedResponsibility[] = [
  { id: 'r1', obligationId: obligation.id, personId: 'me', amount: 15000 },
  { id: 'r2', obligationId: obligation.id, personId: 'brother', amount: 15000 },
];

describe('shared finances', () => {
  it('keeps household cost separate from the users economic cost', () => {
    expect(validateResponsibilitySplit(obligation, responsibilities)).toBeNull();
    expect(getMyEconomicCost(obligation, people, responsibilities)).toBe(15000);
  });

  it('rejects responsibility splits that do not equal the obligation total', () => {
    expect(validateResponsibilitySplit(obligation, [
      { ...responsibilities[0], amount: 10000 },
      responsibilities[1],
    ])).toMatch(/full obligation/i);
  });

  it('treats external family payments as funding without touching tracked cash', () => {
    const payments: SharedPayment[] = [
      { id: 'p1', obligationId: obligation.id, personId: 'me', amount: 15000, source: 'TRACKED', paidAt: '2026-08-02T12:00:00.000Z' },
      { id: 'p2', obligationId: obligation.id, personId: 'brother', amount: 15000, source: 'EXTERNAL', paidAt: '2026-08-02T12:00:00.000Z' },
    ];
    expect(getTrackedCashPaid(obligation.id, payments)).toBe(15000);
    expect(isObligationFunded(obligation, payments)).toBe(true);
    expect(getPersonOutstanding(obligation.id, 'me', responsibilities, payments)).toBe(0);
    expect(getPersonOutstanding(obligation.id, 'brother', responsibilities, payments)).toBe(0);
  });

  it('shows when the user fronted another persons share', () => {
    const payments: SharedPayment[] = [
      { id: 'p1', obligationId: obligation.id, personId: 'me', amount: 30000, source: 'TRACKED', paidAt: '2026-08-02T12:00:00.000Z' },
    ];
    expect(getTrackedCashPaid(obligation.id, payments)).toBe(30000);
    expect(getPersonOutstanding(obligation.id, 'me', responsibilities, payments)).toBe(-15000);
    expect(getPersonOutstanding(obligation.id, 'brother', responsibilities, payments)).toBe(15000);
  });

  it('nets settlements in either direction without calling them income', () => {
    const settlements: SharedSettlement[] = [
      { id: 's1', obligationId: obligation.id, fromPersonId: 'brother', toPersonId: 'me', amount: 15000, settledAt: '2026-08-05T12:00:00.000Z' },
      { id: 's2', fromPersonId: 'me', toPersonId: 'brother', amount: 2000, settledAt: '2026-08-06T12:00:00.000Z' },
    ];
    expect(getNetSettlementBetween('brother', 'me', settlements)).toBe(13000);
    expect(getNetSettlementBetween('me', 'brother', settlements)).toBe(0);
  });
});
