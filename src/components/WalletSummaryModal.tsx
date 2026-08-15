import { useMemo } from 'react';
import { ArrowLeft, ArrowRightLeft, Plus, ShoppingBag, Wallet, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { AnimatedNumber } from './AnimatedNumber';

export function WalletSummaryModal() {
  const {
    isWalletModalOpen,
    setWalletModalOpen,
    setAddModalOpen,
    formatCurrency,
    accounts,
    transactions,
  } = useAppContext();

  const activeAssets = useMemo(() => accounts.filter(a => !a.is_archived && a.type === 'asset'), [accounts]);
  const cashAccounts = useMemo(() => activeAssets.filter(a => {
    const kind = (a.group ?? '').trim().toLowerCase();
    return a.id === 'cash' || kind === 'cash' || kind === 'cash wallet' || kind === 'wallet';
  }), [activeAssets]);

  const cashIds = useMemo(() => new Set(cashAccounts.map(account => account.id)), [cashAccounts]);
  const cashBalance = Math.max(0, cashAccounts.reduce((sum, account) => sum + Math.max(0, account.balance), 0));

  const currentMonthChange = useMemo(() => {
    const now = new Date();
    return transactions.reduce((sum, transaction) => {
      const transactionDate = new Date(transaction.date);
      if (transactionDate.getFullYear() !== now.getFullYear() || transactionDate.getMonth() !== now.getMonth()) return sum;

      const amount = Math.abs(transaction.amount);
      if (transaction.toAccountId && cashIds.has(transaction.toAccountId) && (!transaction.fromAccountId || !cashIds.has(transaction.fromAccountId))) return sum + amount;
      if (transaction.fromAccountId && cashIds.has(transaction.fromAccountId) && (!transaction.toAccountId || !cashIds.has(transaction.toAccountId))) return sum - amount;
      if (transaction.account && cashIds.has(transaction.account)) return sum + (transaction.type === 'income' ? amount : -amount);
      return sum;
    }, 0);
  }, [cashIds, transactions]);

  const recentTransactions = useMemo(() => [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4), [transactions]);

  if (!isWalletModalOpen) return null;

  const close = () => setWalletModalOpen(false);
  const openAddMoney = () => {
    setWalletModalOpen(false);
    setAddModalOpen(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        data-testid="wallet-summary-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-summary-title"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[18px] border border-[#33465f] bg-[linear-gradient(180deg,#0b1726,#081321)] shadow-[0_28px_72px_rgba(0,0,0,.52)] sm:max-w-[390px] sm:rounded-[18px]"
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#8d9bad]/75 sm:hidden" />

        <div className="grid h-[54px] shrink-0 grid-cols-[40px_1fr_40px] items-center border-b border-[#21334a]/70 px-2.5">
          <button type="button" aria-label="Back from wallet summary" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 id="wallet-summary-title" className="text-center text-[14px] font-semibold text-white">Wallet Summary</h2>
          <button type="button" aria-label="Close wallet summary" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
          <div className="rounded-[10px] border border-[#21334a] bg-[#101d2d] p-3.5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10.5px] font-medium text-[#cbd4e0]">Cash Wallet</p>
                <p className="mt-1 font-numeric text-[20px] font-semibold tracking-tight text-white">
                  <AnimatedNumber value={cashBalance} format={formatCurrency} />
                </p>
                <p className={`mt-1 text-[10.5px] font-semibold ${currentMonthChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {currentMonthChange >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(currentMonthChange))} (this month)
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-emerald-500/20 bg-emerald-500/20 text-emerald-300">
                <Wallet className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="mt-3.5 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-[#e8edf4]">Recent Transactions</h3>
            <span className="text-[10.5px] font-medium text-blue-400">View all</span>
          </div>

          <div className="mt-2 overflow-hidden rounded-[9px] border border-[#21334a] bg-[#0f1b2b]">
            {recentTransactions.length > 0 ? recentTransactions.map((transaction, index) => {
              const isPositive = transaction.amount > 0 || transaction.type === 'income';
              const isTransfer = transaction.type === 'transfer';
              return (
                <div key={transaction.id} className={`flex items-center gap-2.5 px-2.5 py-2 ${index > 0 ? 'border-t border-[#21334a]/70' : ''}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border ${isPositive ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-300' : isTransfer ? 'border-blue-500/20 bg-blue-500/15 text-blue-300' : 'border-red-500/20 bg-red-500/15 text-red-300'}`}>
                    {isTransfer ? <ArrowRightLeft className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10.5px] font-medium text-[#e9eef5]">{transaction.title}</p>
                    <p className="mt-0.5 text-[9.5px] text-[#7f8fa4]">{new Date(transaction.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span className={`shrink-0 font-numeric text-[10.5px] font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
                  </span>
                </div>
              );
            }) : (
              <div className="px-3 py-6 text-center text-[10.5px] text-[#7f8fa4]">No recent transactions</div>
            )}
          </div>

          <button type="button" onClick={openAddMoney} className="v35-focus-ring mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-gradient-to-b from-[#1677ff] to-[#0d60ee] text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(13,96,238,.22)] hover:from-[#2582ff] hover:to-[#176bf5]">
            <Plus className="h-4 w-4" /> Add Money
          </button>
        </div>
      </div>
    </div>
  );
}
