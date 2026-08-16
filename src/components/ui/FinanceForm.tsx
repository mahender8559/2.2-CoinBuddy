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
  titleId,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeLabel: string;
  titleId?: string;
}) {
  return (
    <header className="cb-finance-header">
      <button type="button" aria-label={closeLabel} onClick={onClose} className="cb-finance-icon-button cb-finance-back">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 text-center">
        <h2 id={titleId} className="cb-finance-title">{title}</h2>
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
  icon,
  children,
  className = '',
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`cb-finance-field-group ${className}`}>
      <label htmlFor={htmlFor} className={financeLabelClass}>
        <span className="cb-finance-label-row">
          {icon ? <span className="cb-finance-label-icon" aria-hidden="true">{icon}</span> : null}
          <span>{label}</span>
        </span>
      </label>
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
  leadingIcon,
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  leadingIcon?: ReactNode;
}) {
  return (
    <div className={`relative ${leadingIcon ? 'cb-finance-control-with-icon' : ''}`}>
      {leadingIcon ? <span className="cb-finance-control-icon" aria-hidden="true">{leadingIcon}</span> : null}
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
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="cb-finance-section" open={defaultOpen}>
      <summary>
        <span className="cb-finance-section-title">
          {icon ? <span className="cb-finance-label-icon" aria-hidden="true">{icon}</span> : null}
          <span>{title}</span>
        </span>
        <ChevronDown className="h-4 w-4 transition-transform" />
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
  icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
  icon?: ReactNode;
}) {
  return (
    <div className="cb-finance-toggle-row">
      <div className="cb-finance-toggle-copy">
        {icon ? <span className="cb-finance-toggle-icon" aria-hidden="true">{icon}</span> : null}
        <div>
          <p className="cb-finance-toggle-title">{label}</p>
          {description ? <p className="cb-finance-toggle-description">{description}</p> : null}
        </div>
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
