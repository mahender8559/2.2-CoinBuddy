import { describe, expect, it } from 'vitest';
import { calculateEmiSplit } from './emi';

describe('calculateEmiSplit', () => {
  it('splits a normal reducing-balance payment', () => {
    expect(calculateEmiSplit(100_000, 12, 10_000, 'REDUCING')).toEqual({ interestAmount: 1_000, principalAmount: 9_000 });
  });
  it('uses original principal for flat-rate interest', () => {
    expect(calculateEmiSplit(60_000, 12, 10_000, 'FLAT', false, 100_000)).toEqual({ interestAmount: 1_000, principalAmount: 9_000 });
  });
  it('respects payment frequency for flat-rate interest', () => {
    expect(calculateEmiSplit(80_000, 12, 20_000, 'FLAT', false, 100_000, 'QUARTERLY')).toEqual({ interestAmount: 3_000, principalAmount: 17_000 });
  });
  it('handles zero-interest loans without NaN or rounding noise', () => {
    expect(calculateEmiSplit(5_000, 0, 1_000)).toEqual({ interestAmount: 0, principalAmount: 1_000 });
  });
  it('supports an exact final payoff including current-period interest', () => {
    expect(calculateEmiSplit(5_000, 12, 5_050)).toEqual({ interestAmount: 50, principalAmount: 5_000 });
  });
  it('caps an overpayment at the current payoff amount', () => {
    expect(calculateEmiSplit(5_000, 12, 6_000)).toEqual({ interestAmount: 50, principalAmount: 5_000 });
  });
  it('keeps interest-only payments out of principal', () => {
    expect(calculateEmiSplit(5_000, 12, 200, 'INTEREST_ONLY')).toEqual({ interestAmount: 200, principalAmount: 0 });
  });
  it('keeps rounded principal plus interest equal to the applied payment', () => {
    const split = calculateEmiSplit(12_345.67, 8.75, 1_500);
    expect(Number((split.principalAmount + split.interestAmount).toFixed(2))).toBe(1_500);
  });
  it('treats a prepayment as pure principal and never exceeds the balance', () => {
    expect(calculateEmiSplit(3_500, 12, 5_000, 'REDUCING', true)).toEqual({ interestAmount: 0, principalAmount: 3_500 });
  });
});
