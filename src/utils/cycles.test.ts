import { describe, expect, it } from 'vitest';
import { getCycleDetailsForDay, getCycleRange } from './cycles';

describe('cycle date helpers', () => {
  it('moves dates on the configured day into the next cycle', () => {
    expect(getCycleDetailsForDay('2026-08-24T12:00:00', 25).key).toBe('2026-7');
    expect(getCycleDetailsForDay('2026-08-25T12:00:00', 25).key).toBe('2026-8');
  });

  it('returns the configured start and end dates for a cycle', () => {
    const range = getCycleRange(2026, 8, 25);
    expect([range.start.getFullYear(), range.start.getMonth(), range.start.getDate()]).toEqual([2026, 7, 25]);
    expect([range.end.getFullYear(), range.end.getMonth(), range.end.getDate()]).toEqual([2026, 8, 24]);
  });

  it('clamps a cycle day to shorter months', () => {
    const range = getCycleRange(2026, 2, 31);
    expect([range.start.getFullYear(), range.start.getMonth(), range.start.getDate()]).toEqual([2026, 1, 28]);
    expect([range.end.getFullYear(), range.end.getMonth(), range.end.getDate()]).toEqual([2026, 2, 30]);
  });

  it('uses calendar months when the cycle starts on day one', () => {
    const range = getCycleRange(2026, 7, 1);
    expect([range.start.getMonth(), range.start.getDate()]).toEqual([7, 1]);
    expect([range.end.getMonth(), range.end.getDate()]).toEqual([7, 31]);
  });
});
