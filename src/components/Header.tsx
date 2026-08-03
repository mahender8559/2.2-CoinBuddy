import { ShieldCheck, Wallet, Undo2, Redo2, LogOut } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface HeaderProps {
  onLogout: () => void;
}

export function Header({ onLogout }: HeaderProps) {
  const { setWalletModalOpen, canUndo, canRedo, handleUndo, handleRedo } = useAppContext();

  return (
    <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant/30 h-16 flex items-center justify-between px-4 md:px-10">
      <div className="flex items-center gap-2">
        <img src="/logo.png" alt="CoinBuddy Logo" className="w-8 h-8 rounded-lg object-cover" />
        <h1 className="text-xl font-semibold text-primary">CoinBuddy</h1>
        <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full border border-primary/20 ml-1">V2.1</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/50">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-on-surface-variant">Local Only</span>
        </div>
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className={`p-2 rounded-full transition-colors ${canUndo ? 'text-primary hover:bg-surface-container cursor-pointer' : 'text-on-surface-variant/30 cursor-not-allowed'}`}
          title="Undo"
        >
          <Undo2 className="w-5 h-5" />
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className={`p-2 rounded-full transition-colors ${canRedo ? 'text-primary hover:bg-surface-container cursor-pointer' : 'text-on-surface-variant/30 cursor-not-allowed'}`}
          title="Redo"
        >
          <Redo2 className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setWalletModalOpen(true)}
          className="p-2 rounded-full hover:bg-surface-container transition-colors"
          title="Wallet Summary"
        >
          <Wallet className="w-5 h-5 text-primary" />
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 rounded-full px-2 py-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
          <span className="hidden text-sm font-medium md:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
