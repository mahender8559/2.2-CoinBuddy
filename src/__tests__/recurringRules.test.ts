import { describe, expect, it } from 'vitest';
import { advanceRecurringDate, shouldCreateInitialOccurrence } from '../domain/recurring';

describe('recurring schedule dates', () => {
  it('keeps a month-end anchor without drifting', () => {
    const feb = advanceRecurringDate('2027-01-31', 'MONTHLY', 31);
    expect(feb).toBe('2027-02-28');
    expect(advanceRecurringDate(feb, 'MONTHLY', 31)).toBe('2027-03-31');
  });

  it('handles leap-year annual schedules using the original anchor day', () => {
    const next = advanceRecurringDate('2024-02-29', 'ANNUALLY', 29);
    expect(next).toBe('2025-02-28');
    expect(advanceRecurringDate('2027-02-28', 'ANNUALLY', 29)).toBe('2028-02-29');
  });

  it('creates the initial ledger entry only when the start date is due', () => {
    const today = new Date('2026-08-11T12:00:00');
    expect(shouldCreateInitialOccurrence('2026-08-11', today)).toBe(true);
    expect(shouldCreateInitialOccurrence('2026-08-10', today)).toBe(true);
    expect(shouldCreateInitialOccurrence('2026-08-12', today)).toBe(false);
  });
});
