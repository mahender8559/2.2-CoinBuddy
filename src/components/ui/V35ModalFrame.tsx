import { useEffect, useRef, type ReactNode } from 'react';
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
  'loan-rate-sheet',
]);

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function visibleFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(element => {
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

function isTopmostDialog(panel: HTMLElement): boolean {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
  return dialogs[dialogs.length - 1] === panel;
}

export function V35ModalFrame({
  children,
  size = 'md',
  testId,
  panelClassName = '',
  labelledBy,
}: V35ModalFrameProps) {
  const usesLockedFormSystem = Boolean(testId && LOCKED_FORM_TEST_IDS.has(testId));
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusInitial = window.requestAnimationFrame(() => {
      const focusable = visibleFocusableElements(panel);
      (focusable[0] ?? panel).focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostDialog(panel)) return;
      if (event.key === 'Escape') {
        const closeControl = panel.querySelector<HTMLElement>(
          '[data-modal-close], button[aria-label^="Back from"], button[aria-label^="Close"], button[aria-label="Cancel"]',
        );
        if (closeControl) {
          event.preventDefault();
          event.stopPropagation();
          closeControl.click();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = visibleFocusableElements(panel);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusInitial);
      document.removeEventListener('keydown', onKeyDown, true);
      if (previouslyFocused?.isConnected) window.requestAnimationFrame(() => previouslyFocused.focus({ preventScroll: true }));
    };
  }, []);

  return createPortal(
    <div className="v35-modal-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
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
