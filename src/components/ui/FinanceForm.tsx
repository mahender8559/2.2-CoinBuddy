import type { ReactNode } from 'react';
import { ArrowLeft, ChevronDown, X } from 'lucide-react';
import { CurrencyInput } from '../CurrencyInput';

export const financeFieldClass = 'cb-finance-field';
export const financeLabelClass = 'cb-finance-label';

export function FinanceFormHeader({
  title,
  subtitle,
  onClose,
  closeLabel,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <header className="cb-finance-header">
      <button type="button" aria-label={closeLabel} onClick={onClose} className="cb-finance-icon-button cb-finance-back">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 text-center">
        <h2 className="cb-finance-title">{title}</h2>
        {subtitle ? <p className="cb-finance-subtitle">{subtitle}</p> : null}
      </div>
      <button type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose} className="cb-finance-icon-button">
        <X className="h-4 w-4" />
      </button>
    </header>
  );
}

export function AmountHero({
  id,
  label = 'Amount',
  symbol,
  value,
  onValueChange,
  tone = 'blue',
  ariaLabel,
}: {
  id: string;
  label?: string;
  symbol: string;
  value: string;
  onValueChange: (value: string) => void;
  tone?: 'red' | 'green' | 'blue' | 'purple';
  ariaLabel: string;
}) {
  return (
    <section className={`cb-amount-hero cb-amount-${tone}`}>
      <span className="cb-amount-label">{label}</span>
      <div className="cb-amount-input-wrap">
        <span className="cb-amount-symbol" aria-hidden="true">{symbol}</span>
        <CurrencyInput
          id={id}
          aria-label={ariaLabel}
          required
          value={value}
          onValueChange={onValueChange}
          placeholder="0.00"
          className="cb-amount-input font-numeric"
        />
      </div>
    </section>
  );
}

export function FinanceField({
  label,
  htmlFor,
  hint,
  children,
  className = '',
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`cb-finance-field-group ${className}`}>
      <label htmlFor={htmlFor} className={financeLabelClass}>{label}</label>
      {children}
      {hint ? <p className="cb-finance-hint">{hint}</p> : null}
    </div>
  );
}

export function FinanceSelect({
  id,
  ariaLabel,
  value,
  onChange,
  children,
  required,
  disabled,
  name,
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        aria-label={ariaLabel}
        value={value}
        onChange={event => onChange(event.target.value)}
        className={`${financeFieldClass} appearance-none pr-9`}
        required={required}
        disabled={disabled}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#728299]" />
    </div>
  );
}

export function FinanceSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="cb-finance-section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="cb-finance-section-body">{children}</div>
    </details>
  );
}

export function FinanceToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="cb-finance-toggle-row">
      <div>
        <p className="cb-finance-toggle-title">{label}</p>
        {description ? <p className="cb-finance-toggle-description">{description}</p> : null}
      </div>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`cb-finance-toggle ${checked ? 'is-on' : ''}`}
      >
        <span />
      </button>
    </div>
  );
}

export function FinanceSubmitButton({ children, disabled = false, tone = 'primary', testId }: { children: ReactNode; disabled?: boolean; tone?: 'primary' | 'danger' | 'success' | 'purple'; testId?: string }) {
  return <button data-testid={testId} type="submit" disabled={disabled} className={`cb-finance-submit cb-submit-${tone}`}>{children}</button>;
}
