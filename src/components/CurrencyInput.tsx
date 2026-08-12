import { useState, type FocusEvent, type InputHTMLAttributes } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatCurrencyInput, getCurrencyFractionDigits, parseCurrencyInput } from '../utils/currencyFormatting';

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'>;

type CurrencyInputProps = NativeProps & {
  value: string | number;
  onValueChange: (canonicalValue: string) => void;
  padFractionOnBlur?: boolean;
};

/**
 * Locale-aware money input. Financial state remains a plain decimal string;
 * only the rendered value receives locale grouping, so calculations never
 * need to parse formatted currency text.
 */
export function CurrencyInput({
  value,
  onValueChange,
  padFractionOnBlur = true,
  onFocus,
  onBlur,
  ...props
}: CurrencyInputProps) {
  const { currency } = useAppContext();
  const [focused, setFocused] = useState(false);
  const canonical = value === null || value === undefined ? '' : String(value);
  const displayValue = canonical === ''
    ? ''
    : formatCurrencyInput(canonical, currency, padFractionOnBlur && !focused);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    onBlur?.(event);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode={getCurrencyFractionDigits(currency) > 0 ? 'decimal' : 'numeric'}
      value={displayValue}
      onChange={event => onValueChange(parseCurrencyInput(event.target.value, currency))}
      onFocus={handleFocus}
      onBlur={handleBlur}
      autoComplete="off"
    />
  );
}
