import { useAppContext } from '../context/AppContext';
import { X, Wallet, ShieldCheck, Banknote, Building2, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

export function WalletSummaryModal() {
  const { isWalletModalOpen, setWalletModalOpen, formatCurrency, accounts, creditCards } = useAppContext();
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (!isWalletModalOpen) return null;

  // Classify accounts
  const cashAccounts = accounts.filter(a => !a.is_archived && a.type === 'asset' && (a.id === 'cash' || a.name.toLowerCase().includes('cash') || a.group?.toLowerCase().includes('cash')));
  const bankAccounts = accounts.filter(a => !a.is_archived && a.type === 'asset' && !(a.id === 'cash' || a.name.toLowerCase().includes('cash') || a.group?.toLowerCase().includes('cash')));
  const liabilityAccounts = accounts.filter(a => !a.is_archived && a.type === 'liability');

  const cashBalance = Math.max(0, cashAccounts.reduce((acc, a) => acc + Math.max(0, a.balance), 0));
  const bankBalance = Math.max(0, bankAccounts.reduce((acc, a) => acc + Math.max(0, a.balance), 0));
  
  // Total debt calculation
  const totalDebt = liabilityAccounts.reduce((acc, a) => acc + a.balance, 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-surface-container rounded-3xl w-full max-w-lg p-6 border border-outline-variant/30 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header background glow */}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          
          <button 
            onClick={() => setWalletModalOpen(false)}
            className="absolute right-4 top-4 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
          
          {/* Title Header */}
          <div className="flex items-center gap-3 mb-6 shrink-0">
            <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">Wallet Summary</h2>
              <p className="text-xs text-on-surface-variant font-medium">Liquid cash, bank balances & total debt</p>
            </div>
          </div>
          
          {/* 3 Main Aesthetic Metric Cards */}
          <div className="space-y-3 mb-4 overflow-y-auto pr-1">
            {/* 1. Amount in Cash */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 flex items-center justify-between shadow-sm">
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
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 flex items-center justify-between shadow-sm">
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
            <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/20 flex items-center justify-between shadow-sm">
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

          <div className="flex items-center justify-center gap-2 pt-3 border-t border-outline-variant/10 opacity-60 text-xs shrink-0">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Local Secure Vault</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

