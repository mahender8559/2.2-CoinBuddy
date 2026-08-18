import { Redo2, Undo2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

/**
 * The v3.5 desktop header still exposes ledger history actions, but that header
 * is intentionally hidden on phones. Keep the same AppContext history stack
 * reachable on mobile without duplicating undo/redo state or persistence logic.
 */
export function MobileUndoRedoControls() {
  const { canUndo, canRedo, handleUndo, handleRedo, biometric, passcode, isUnlocked } = useAppContext();
  const locked = Boolean((biometric || passcode) && !isUnlocked);

  if (locked) return null;

  return (
    <div
      data-testid="mobile-undo-redo-controls"
      className="fixed right-3 z-40 flex items-center gap-1 rounded-2xl border border-outline-variant/40 bg-surface-container-low/95 p-1.5 shadow-lg backdrop-blur-xl md:hidden"
      style={{ bottom: 'calc(5.15rem + env(safe-area-inset-bottom))' }}
      aria-label="Change history"
    >
      <button
        type="button"
        onClick={handleUndo}
        disabled={!canUndo}
        aria-label="Undo last change"
        title="Undo"
        className={`v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
          canUndo
            ? 'text-on-surface hover:bg-surface-container-high hover:text-primary'
            : 'cursor-not-allowed text-on-surface-variant/25'
        }`}
      >
        <Undo2 className="h-[19px] w-[19px]" />
      </button>
      <div className="h-6 w-px bg-outline-variant/30" aria-hidden="true" />
      <button
        type="button"
        onClick={handleRedo}
        disabled={!canRedo}
        aria-label="Redo last undone change"
        title="Redo"
        className={`v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
          canRedo
            ? 'text-on-surface hover:bg-surface-container-high hover:text-primary'
            : 'cursor-not-allowed text-on-surface-variant/25'
        }`}
      >
        <Redo2 className="h-[19px] w-[19px]" />
      </button>
    </div>
  );
}
