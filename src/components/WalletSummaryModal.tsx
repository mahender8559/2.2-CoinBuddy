import { useAppContext } from '../context/AppContext';
import { X, Wallet, ShieldCheck, Banknote, Building2, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

export function WalletSummaryModal() {
  const { isWalletModalOpen, setWalletModalOpen, formatCurrency, accounts } = useAppContext();
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (!isWalletModalOpen) return null;

  // Wallet Summary is intentionally liquid-only: investments and physical
  // assets belong in net worth, not in the cash/bank amount available today.
  const activeAssets = accounts.filter(a => !a.is_archived && a.type === 'asset');
  const accountKind = (value?: string) => (value ?? '').trim().toLowerCase();
  const cashAccounts = activeAssets.filter(a => {
    const kind = accountKind(a.group);
    return a.id === 'cash' || kind === 'cash' || kind === 'cash wallet' || kind === 'wallet';
  });
  const bankAccounts = activeAssets.filter(a => {
    const kind = accountKind(a.group);
    return kind === 'bank' || kind === 'bank account';
  });
  const liabilityAccounts = accounts.filter(a => !a.is_archived && a.type === 'liability');

  const cashBalance = Math.max(0, cashAccounts.reduce((acc, a) => acc + Math.max(0, a.balance), 0));
  const bankBalance = Math.max(0, bankAccounts.reduce((acc, a) => acc + Math.max(0, a.balance), 0));
  
  // Total debt calculation
  const totalDebt = liabilityAccounts.reduce((acc, a) => acc + a.balance, 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          data-testid="wallet-summary-sheet" role="dialog" aria-modal="true" aria-labelledby="wallet-summary-title" className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-outline-variant/35 bg-surface-container p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-6"
        >
          <div aria-hidden="true" className="mx-auto -mt-3 mb-3 h-1 w-10 shrink-0 rounded-full bg-outline-variant/55 sm:hidden" />
          <button 
            onClick={() => setWalletModalOpen(false)}
            aria-label="Close wallet summary"
            className="v35-focus-ring absolute right-4 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface sm:top-4"
          >
            <X className="w-5 h-5" />
          </button>
          
          {/* Title Header */}
          <div className="mb-5 flex shrink-0 items-center gap-3 pr-11">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h2 id="wallet-summary-title" className="text-lg font-semibold text-on-surface sm:text-xl">Wallet Summary</h2>
              <p className="text-xs text-on-surface-variant font-medium">Liquid cash, bank balances & total debt</p>
            </div>
          </div>
          
          {/* 3 Main Aesthetic Metric Cards */}
          <div className="space-y-3 mb-4 overflow-y-auto pr-1">
            {/* 1. Amount in Cash */}
            <div className="flex items-center justify-between rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-0.5">Amount in Cash</p>
                  <p className="text-2xl font-bold text-on-surface font-numeric">
                    <AnimatedNumber value={cashBalance} format={formatCurrency} />
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-400/80 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 hidden sm:inline-block">
                Liquid Cash
              </span>
            </div>

            {/* 2. Amount in Bank */}
            <div className="flex items-center justify-between rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-0.5">Amount in Bank</p>
                  <p className="text-2xl font-bold text-on-surface font-numeric">
                    <AnimatedNumber value={bankBalance} format={formatCurrency} />
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-blue-400/80 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 hidden sm:inline-block">
                Bank Accounts
              </span>
            </div>

            {/* 3. Total Debt */}
            <div className="flex items-center justify-between rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wider mb-0.5">Total Debt</p>
                  <p className="text-2xl font-bold text-on-surface font-numeric">
                    <AnimatedNumber value={totalDebt} format={formatCurrency} />
                  </p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                totalDebt === 0 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {totalDebt === 0 ? 'Debt Free 🎉' : 'Liabilities'}
              </span>
            </div>

            {/* Account Breakdown Toggle */}
            <div className="pt-2">
              <button 
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <span>View Detailed Account Breakdown</span>
                {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              <AnimatePresence>
                {showBreakdown && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 mt-2 pt-2 border-t border-outline-variant/10 text-xs overflow-hidden"
                  >
                    {/* Cash list */}
                    {cashAccounts.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Cash Accounts</p>
                        {cashAccounts.map(acc => (
                          <div key={acc.id} className="flex justify-between items-center py-1 px-2.5 rounded-lg bg-surface-container-low">
                            <span className="text-on-surface-variant">{acc.name}</span>
                            <span className="font-semibold text-on-surface font-numeric">{formatCurrency(Math.max(0, acc.balance))}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Bank list */}
                    {bankAccounts.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Bank Accounts</p>
                        {bankAccounts.map(acc => (
                          <div key={acc.id} className="flex justify-between items-center py-1 px-2.5 rounded-lg bg-surface-container-low">
                            <span className="text-on-surface-variant">{acc.name}</span>
                            <span className="font-semibold text-on-surface font-numeric">{formatCurrency(Math.max(0, acc.balance))}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Debt list */}
                    {liabilityAccounts.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Liabilities & Credit Cards</p>
                        {liabilityAccounts.map(acc => (
                          <div key={acc.id} className="flex justify-between items-center py-1 px-2.5 rounded-lg bg-surface-container-low">
                            <span className="text-on-surface-variant">{acc.name}</span>
                            <span className="font-semibold text-rose-400 font-numeric">{formatCurrency(acc.balance)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

