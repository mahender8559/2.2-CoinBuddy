import React from 'react';

interface SafeValueBadgeProps {
  errorCode: string;
  className?: string;
}

/**
 * Renders a clean fallback badge when a financial invariant or calculation error is detected
 */
export function SafeValueBadge({ errorCode, className = '' }: SafeValueBadgeProps) {
  const code = errorCode.startsWith('ERR_') ? errorCode : `ERR_${errorCode}`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold tracking-wide bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 shadow-2xs font-mono ${className}`}
      title={`Financial Math Invariant Notice: ${code}`}
    >
      <span className="text-amber-500 font-bold select-none">⚠️</span>
      <span>[{code}]</span>
    </span>
  );
}
