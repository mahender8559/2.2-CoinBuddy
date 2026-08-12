export const CURRENCY_LOCALES: Record<string, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  INR: 'en-IN',
  JPY: 'ja-JP',
};

export function getCurrencyLocale(currency: string): string {
  return CURRENCY_LOCALES[currency] ?? 'en-US';
}

export function getCurrencyFractionDigits(currency: string): number {
  return new Intl.NumberFormat(getCurrencyLocale(currency), {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits;
}

export function getCurrencySeparators(currency: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(getCurrencyLocale(currency), {
    useGrouping: true,
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).formatToParts(1234567.8);
  return {
    group: parts.find(part => part.type === 'group')?.value ?? ',',
    decimal: parts.find(part => part.type === 'decimal')?.value ?? '.',
  };
}

function groupedInteger(integerDigits: string, currency: string): string {
  if (!integerDigits) return '';
  const safe = Number(integerDigits);
  if (!Number.isFinite(safe)) return integerDigits;
  return new Intl.NumberFormat(getCurrencyLocale(currency), {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(safe);
}

/**
 * Convert what the user sees in a locale-formatted money field back to a
 * canonical decimal string used by state and financial calculations.
 */
export function parseCurrencyInput(displayValue: string, currency: string): string {
  const raw = String(displayValue ?? '').trim();
  if (!raw) return '';

  const fractionDigits = getCurrencyFractionDigits(currency);
  const { group, decimal } = getCurrencySeparators(currency);
  let decimalIndex = fractionDigits > 0 ? raw.lastIndexOf(decimal) : -1;

  // Accept a dot as a decimal on comma-decimal locales when it is clearly a
  // typed fractional separator rather than an already-formatted group.
  if (decimalIndex < 0 && fractionDigits > 0 && decimal !== '.' && raw.includes('.')) {
    const index = raw.lastIndexOf('.');
    const trailingDigits = raw.slice(index + 1).replace(/\D/g, '');
    const occurrences = raw.split('.').length - 1;
    if (occurrences === 1 && trailingDigits.length > 0 && trailingDigits.length <= fractionDigits) {
      decimalIndex = index;
    }
  }

  // Likewise accept comma as a decimal on dot-decimal locales if the comma is
  // not already acting as the locale's grouping separator.
  if (decimalIndex < 0 && fractionDigits > 0 && decimal !== ',' && group !== ',' && raw.includes(',')) {
    const index = raw.lastIndexOf(',');
    const trailingDigits = raw.slice(index + 1).replace(/\D/g, '');
    if (raw.split(',').length === 2 && trailingDigits.length > 0 && trailingDigits.length <= fractionDigits) {
      decimalIndex = index;
    }
  }

  const integerPart = (decimalIndex >= 0 ? raw.slice(0, decimalIndex) : raw).replace(/\D/g, '');
  const integerDigits = integerPart.replace(/^0+(?=\d)/, '') || '0';
  if (fractionDigits === 0 || decimalIndex < 0) return integerDigits;

  const fractionalDigits = raw.slice(decimalIndex + 1).replace(/\D/g, '').slice(0, fractionDigits);
  return `${integerDigits}.${fractionalDigits}`;
}

/** Format a canonical decimal string for a money input without a currency symbol. */
export function formatCurrencyInput(
  canonicalValue: string | number,
  currency: string,
  padFraction = false,
): string {
  const canonical = String(canonicalValue ?? '').trim();
  if (!canonical) return '';

  const fractionDigits = getCurrencyFractionDigits(currency);
  const { decimal } = getCurrencySeparators(currency);
  const normalized = canonical.replace(/,/g, '');
  const [rawInteger = '0', rawFraction = ''] = normalized.split('.', 2);
  const integerDigits = rawInteger.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0';
  const integer = groupedInteger(integerDigits, currency);
  if (fractionDigits === 0) return integer;

  const fraction = rawFraction.replace(/\D/g, '').slice(0, fractionDigits);
  if (padFraction) return `${integer}${decimal}${fraction.padEnd(fractionDigits, '0')}`;
  if (canonical.includes('.')) return `${integer}${decimal}${fraction}`;
  return integer;
}
