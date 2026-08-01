import { ShieldCheck, Wallet } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export function Header() {
  const { setWalletModalOpen } = useAppContext();
  
  return (
    <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant/30 h-16 flex items-center justify-between px-4 md:px-10">
      <div className="flex items-center gap-2">
        <img src="/logo.png" alt="CoinBuddy Logo" className="w-8 h-8 rounded-lg object-cover" />
        <h1 className="text-xl font-semibold text-primary">CoinBuddy</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/50">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-on-surface-variant">Local Only</span>
        </div>
        <button 
          onClick={() => setWalletModalOpen(true)}
          className="p-2 rounded-full hover:bg-surface-container transition-colors"
          title="Wallet Summary"
        >
          <Wallet className="w-5 h-5 text-primary" />
        </button>
      </div>
    </header>
  );
}
