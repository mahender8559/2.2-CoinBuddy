import { ShieldCheck, Wallet, Undo2, Redo2, LogOut, Eye, EyeOff } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface HeaderProps {
  onLogout: () => void;
  showLogout?: boolean;
}

export function Header({ onLogout, showLogout = true }: HeaderProps) {
  const { setWalletModalOpen, canUndo, canRedo, handleUndo, handleRedo, balancesVisible, toggleBalancesVisible } = useAppContext();

  return (
    <header data-testid="app-header" className="fixed inset-x-0 top-0 z-50 hidden h-16 items-center justify-between md:flex border-b border-outline-variant/35 bg-background/88 px-4 backdrop-blur-xl md:px-6 xl:px-8">
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/logo.png" alt="CoinBuddy" className="h-9 w-9 rounded-xl object-cover ring-1 ring-primary/25" />
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold tracking-tight text-on-surface sm:text-xl">CoinBuddy</h1>
          <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary sm:inline">V3.5</span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <div className="mr-1 hidden items-center gap-2 rounded-xl border border-outline-variant/35 bg-surface-container-low px-3 py-2 lg:flex">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-on-surface-variant">Local Ledger</span>
        </div>

        <button onClick={handleUndo} disabled={!canUndo} aria-label="Undo" title="Undo" className={`v35-focus-ring hidden h-10 w-10 items-center justify-center rounded-xl transition-colors sm:flex ${canUndo ? 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface' : 'cursor-not-allowed text-on-surface-variant/25'}`}>
          <Undo2 className="h-5 w-5" />
        </button>
        <button onClick={handleRedo} disabled={!canRedo} aria-label="Redo" title="Redo" className={`v35-focus-ring hidden h-10 w-10 items-center justify-center rounded-xl transition-colors sm:flex ${canRedo ? 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface' : 'cursor-not-allowed text-on-surface-variant/25'}`}>
          <Redo2 className="h-5 w-5" />
        </button>
        <button onClick={toggleBalancesVisible} className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary" title={balancesVisible ? 'Hide balances' : 'Show balances'} aria-label={balancesVisible ? 'Hide balances' : 'Show balances'} data-testid="privacy-toggle">
          {balancesVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
        <button onClick={() => setWalletModalOpen(true)} className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary" title="Wallet Summary" aria-label="Wallet Summary">
          <Wallet className="h-5 w-5" />
        </button>
        {showLogout ? (
          <button onClick={onLogout} className="v35-focus-ring hidden h-10 items-center gap-2 rounded-xl px-3 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error md:flex" title="Sign out" aria-label="Sign out">
            <LogOut className="h-5 w-5" />
            <span className="hidden text-sm font-medium xl:inline">Sign out</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
