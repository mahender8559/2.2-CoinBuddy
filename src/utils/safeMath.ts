/**
 * Global Safe Math & Invariant Guard Utility for CoinBuddy
 * Guarded calculation pipeline & runtime invariant checkers
 */

export interface SafeComputeOptions {
  errorCode?: string;
  min?: number;
  max?: number;
  allowNegative?: boolean;
}

/**
 * Standard Error Codes for Math & Invariant Failures
 */
export const SAFE_MATH_ERRORS = {
  NAN: 'ERR_CALC_NAN',
  INFINITY: 'ERR_MATH_INFINITY',
  DRIFT: 'ERR_BALANCE_DRIFT',
  FAILED: 'ERR_CALC_FAILED',
} as const;

/**
 * Checks if a value is a safe math error code string (e.g. starts with "ERR_")
 */
export function isSafeMathError(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('ERR_');
}

/**
 * Ensures a value is a finite numeric value, or returns fallback.
 */
export function getSafeNumericValue(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && !value.startsWith('ERR_')) {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && !Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * Guarded Calculation Wrapper (safeCompute):
 * Executes a numeric calculation function inside a safety sandbox.
 * Intercepts NaN, Infinity, thrown exceptions, and optional min/max invariant breaches.
 *
 * @param calculationFn - The formula or logic returning a numeric output
 * @param optionsOrCode - Standard error code string (e.g., 'ERR_CALC_NAN', 'ERR_BALANCE_DRIFT') or SafeComputeOptions
 * @returns Clean numeric output if finite and valid, or standardized error code string (ERR_*)
 */
export function safeCompute(
  calculationFn: () => number,
  optionsOrCode: string | SafeComputeOptions = SAFE_MATH_ERRORS.NAN
): number | string {
  const options: SafeComputeOptions =
    typeof optionsOrCode === 'string'
      ? { errorCode: optionsOrCode }
      : optionsOrCode;

  const defaultCode = options.errorCode || SAFE_MATH_ERRORS.NAN;

  try {
    const rawResult = calculationFn();

    if (typeof rawResult !== 'number' || Number.isNaN(rawResult)) {
      return defaultCode.startsWith('ERR_') ? defaultCode : SAFE_MATH_ERRORS.NAN;
    }

    if (!Number.isFinite(rawResult)) {
      return SAFE_MATH_ERRORS.INFINITY;
    }

    if (options.min !== undefined && rawResult < options.min) {
      return options.errorCode || SAFE_MATH_ERRORS.DRIFT;
    }

    if (options.max !== undefined && rawResult > options.max) {
      return options.errorCode || SAFE_MATH_ERRORS.DRIFT;
    }

    // Return sanitized rounded number to 2 decimal places
    return Math.round(rawResult * 100) / 100;
  } catch (_err) {
    return defaultCode.startsWith('ERR_') ? defaultCode : SAFE_MATH_ERRORS.FAILED;
  }
}

/**
 * Safe Math Addition with NaN / Infinity guards
 */
export function safeAdd(a: number, b: number, errorCode: string = SAFE_MATH_ERRORS.NAN): number | string {
  return safeCompute(() => (Number(a) || 0) + (Number(b) || 0), errorCode);
}

/**
 * Safe Math Subtraction with NaN / Infinity guards
 */
export function safeSubtract(a: number, b: number, errorCode: string = SAFE_MATH_ERRORS.NAN): number | string {
  return safeCompute(() => (Number(a) || 0) - (Number(b) || 0), errorCode);
}

/**
 * Safe Math Division with Zero-Division Guard
 */
export function safeDivide(numerator: number, denominator: number, errorCode: string = SAFE_MATH_ERRORS.INFINITY): number | string {
  return safeCompute(() => {
    const num = Number(numerator) || 0;
    const den = Number(denominator) || 0;
    if (den === 0) {
      throw new Error('Division by zero');
    }
    return num / den;
  }, errorCode);
}
