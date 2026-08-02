import { describe, it, expect } from 'vitest';
import {
  safeCompute,
  safeAdd,
  safeSubtract,
  safeDivide,
  isSafeMathError,
  getSafeNumericValue,
  SAFE_MATH_ERRORS,
} from '../utils/safeMath';

describe('Safe Math & Invariant Guard Utility Suite', () => {
  it('should return valid rounded numbers for standard mathematical operations', () => {
    const val = safeCompute(() => 100 / 3, 'ERR_CALC_NAN');
    expect(val).toBe(33.33);
  });

  it('should detect NaN and return ERR_CALC_NAN', () => {
    const val = safeCompute(() => NaN, SAFE_MATH_ERRORS.NAN);
    expect(val).toBe('ERR_CALC_NAN');
  });

  it('should detect Division by Zero or Infinity and return ERR_MATH_INFINITY', () => {
    const val = safeCompute(() => 1 / 0, SAFE_MATH_ERRORS.NAN);
    expect(val).toBe('ERR_MATH_INFINITY');
  });

  it('should catch thrown runtime calculation exceptions and return ERR_CALC_FAILED', () => {
    const val = safeCompute(() => {
      throw new Error('Unexpected calculation breakdown');
    }, SAFE_MATH_ERRORS.FAILED);
    expect(val).toBe('ERR_CALC_FAILED');
  });

  it('should validate min/max options and return ERR_BALANCE_DRIFT on invariant breach', () => {
    const val = safeCompute(() => -50, { min: 0, errorCode: 'ERR_BALANCE_DRIFT' });
    expect(val).toBe('ERR_BALANCE_DRIFT');
  });

  it('should correctly identify safe math error string patterns with isSafeMathError', () => {
    expect(isSafeMathError('ERR_CALC_NAN')).toBe(true);
    expect(isSafeMathError('ERR_BALANCE_DRIFT')).toBe(true);
    expect(isSafeMathError('ERR_MATH_INFINITY')).toBe(true);
    expect(isSafeMathError(100)).toBe(false);
    expect(isSafeMathError('$100.00')).toBe(false);
  });

  it('should sanitize numeric values safely with getSafeNumericValue', () => {
    expect(getSafeNumericValue(150.5)).toBe(150.5);
    expect(getSafeNumericValue('200')).toBe(200);
    expect(getSafeNumericValue('ERR_CALC_NAN', 0)).toBe(0);
    expect(getSafeNumericValue(NaN, 10)).toBe(10);
  });

  it('should compute safe arithmetic wrappers (safeAdd, safeSubtract, safeDivide)', () => {
    expect(safeAdd(10, 20)).toBe(30);
    expect(safeSubtract(50, 15)).toBe(35);
    expect(safeDivide(100, 4)).toBe(25);
    expect(safeDivide(100, 0)).toBe('ERR_MATH_INFINITY');
  });
});
