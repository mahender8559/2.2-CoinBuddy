import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

type V35ModalFrameProps = {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  testId?: string;
  panelClassName?: string;
  labelledBy?: string;
};

const sizeClass: Record<NonNullable<V35ModalFrameProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
};

const LOCKED_FORM_TEST_IDS = new Set([
  'transaction-form-sheet',
  'account-form-sheet',
  'pay-modal',
  'reconcile-sheet',
  'wallet-summary-sheet',
  'loan-rate-sheet',
  'budget-form-sheet',
  'person-form-sheet',
  'person-edit-sheet',
]);

export function V35ModalFrame({
  children,
  size = 'md',
  testId,
  panelClassName = '',
  labelledBy,
}: V35ModalFrameProps) {
  const usesLockedFormSystem = Boolean(testId && LOCKED_FORM_TEST_IDS.has(testId));

  return createPortal(
    <div className="v35-modal-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        data-testid={testId}
        data-v35-form-system={usesLockedFormSystem ? 'locked' : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`v35-modal-frame ${usesLockedFormSystem ? 'v35-form-sheet' : ''} relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-outline-variant/35 bg-surface-container shadow-2xl sm:rounded-[28px] ${sizeClass[size]} ${panelClassName}`}
      >
        <div aria-hidden="true" className="v35-sheet-handle mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-outline-variant/55 sm:hidden" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
