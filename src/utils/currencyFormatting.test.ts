import { describe, expect, it } from 'vitest';
import { formatCurrencyInput, getCurrencyFractionDigits, parseCurrencyInput } from './currencyFormatting';

describe('currency input formatting', () => {
  it('uses Indian grouping for INR', () => {
    expect(formatCurrencyInput('10000', 'INR', true)).toBe('10,000.00');
    expect(formatCurrencyInput('100000', 'INR', true)).toBe('1,00,000.00');
    expect(parseCurrencyInput('1,00,000.50', 'INR')).toBe('100000.50');
  });

  it('uses western grouping for USD and GBP', () => {
    expect(formatCurrencyInput('1000000.5', 'USD', true)).toBe('1,000,000.50');
    expect(formatCurrencyInput('1000000.5', 'GBP', true)).toBe('1,000,000.50');
  });

  it('uses locale separators for EUR', () => {
    expect(formatCurrencyInput('10000.5', 'EUR', true)).toBe('10.000,50');
    expect(parseCurrencyInput('10.000,50', 'EUR')).toBe('10000.50');
  });

  it('uses zero fraction digits for JPY', () => {
    expect(getCurrencyFractionDigits('JPY')).toBe(0);
    expect(formatCurrencyInput('10000.99', 'JPY', true)).toBe('10,000');
  });

  it('preserves a typed fractional part while focused', () => {
    expect(formatCurrencyInput('10000.5', 'INR', false)).toBe('10,000.5');
    expect(formatCurrencyInput('10000.', 'INR', false)).toBe('10,000.');
  });
});
