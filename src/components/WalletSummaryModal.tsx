import { ArrowDownLeft, ArrowUpRight, Plus, ShoppingBag, Wallet, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function WalletSummaryModal() {
  const {
    isWalletModalOpen,
    setWalletModalOpen,
    formatCurrency,
    accounts,
    transactions,
    setAddModalOpen,
    setEditingTransaction,
  } = useAppContext();

  if (!isWalletModalOpen) return null;

  const activeAssets = accounts.filter(account => account.is_archived !== 1 && account.type === 'asset');
  const accountKind = (value?: string) => (value ?? '').trim().toLowerCase();
  const cashAccounts = activeAssets.filter(account => {
    const kind = accountKind(account.group);
    return account.id === 'cash' || kind === 'cash' || kind === 'cash wallet' || kind === 'wallet';
  });
  const cashIds = new Set(cashAccounts.map(account => account.id));
  const cashBalance = Math.max(0, cashAccounts.reduce((sum, account) => sum + Math.max(0, account.balance), 0));

  const touchesCash = (transaction: typeof transactions[number]) => {
    if (cashIds.size === 0) return true;
    return Boolean(
      (transaction.account && cashIds.has(transaction.account)) ||
      (transaction.fromAccountId && cashIds.has(transaction.fromAccountId)) ||
      (transaction.toAccountId && cashIds.has(transaction.toAccountId)),
    );
  };

  const recentTransactions = transactions
    .filter(transaction => !transaction.isOpeningBalance && transaction.is_verified !== 0 && touchesCash(transaction))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthlyChange = transactions
    .filter(transaction => transaction.is_verified !== 0 && !transaction.isOpeningBalance && touchesCash(transaction) && new Date(transaction.date).getTime() >= monthStart)
    .reduce((sum, transaction) => {
      const amount = Math.abs(Number(transaction.amount) || 0);
      if (transaction.type === 'income') return sum + amount;
      if (transaction.type === 'expense') return sum - amount;
      if (transaction.toAccountId && cashIds.has(transaction.toAccountId)) return sum + amount;
      if (transaction.fromAccountId && cashIds.has(transaction.fromAccountId)) return sum - amount;
      return sum;
    }, 0);

  const openActivity = () => {
    setWalletModalOpen(false);
    window.history.pushState({ tab: 'activity' }, '', '?tab=activity');
    window.dispatchEvent(new PopStateEvent('popstate', { state: { tab: 'activity' } }));
  };

  const addMoney = () => {
    setWalletModalOpen(false);
    setEditingTransaction(null);
    setAddModalOpen(true);
  };

  return (
    <V35ModalFrame size="sm" testId="wallet-summary-sheet" labelledBy="wallet-summary-title" panelClassName="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="wallet-summary-title" className="text-lg font-semibold text-on-surface">Wallet Summary</h2>
          <p className="mt-1 text-xs text-on-surface-variant">Cash wallet balance and recent activity</p>
        </div>
        <button type="button" onClick={() => setWalletModalOpen(false)} aria-label="Close wallet summary" className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><X className="h-5 w-5" /></button>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl border border-outline-variant/25 bg-surface-container-low p-4">
        <div>
          <p className="text-xs font-medium text-on-surface-variant">Cash Wallet</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-on-surface">{formatCurrency(cashBalance)}</p>
          <p className={`mt-1 text-xs font-semibold ${monthlyChange >= 0 ? 'text-[var(--cb-green)]' : 'text-[var(--cb-red)]'}`}>{monthlyChange >= 0 ? '+' : '-'}{formatCurrency(Math.abs(monthlyChange))} (this month)</p>
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400"><Wallet className="h-6 w-6" /></span>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-on-surface">Recent Transactions</h3>
          <button type="button" onClick={openActivity} className="v35-focus-ring text-xs font-semibold text-primary">View all</button>
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border border-outline-variant/25 bg-surface-container-low">
          {recentTransactions.map((transaction, index) => {
            const incoming = transaction.type === 'income' || Boolean(transaction.toAccountId && cashIds.has(transaction.toAccountId));
            const outgoing = transaction.type === 'expense' || Boolean(transaction.fromAccountId && cashIds.has(transaction.fromAccountId));
            const signed = incoming && !outgoing ? 1 : outgoing && !incoming ? -1 : transaction.type === 'income' ? 1 : -1;
            const RowIcon = transaction.type === 'income' ? ArrowDownLeft : transaction.type === 'transfer' ? ArrowUpRight : ShoppingBag;
            return (
              <div key={transaction.id} className={`flex items-center gap-3 px-3 py-3 ${index < recentTransactions.length - 1 ? 'border-b border-outline-variant/20' : ''}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${signed > 0 ? 'bg-emerald-500/12 text-emerald-400' : 'bg-rose-500/12 text-rose-400'}`}><RowIcon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-on-surface">{transaction.title}</p><p className="mt-0.5 text-[10px] text-on-surface-variant">{new Date(transaction.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
                <span className={`shrink-0 text-xs font-semibold tabular-nums ${signed > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{signed > 0 ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}</span>
              </div>
            );
          })}
          {recentTransactions.length === 0 ? <div className="px-4 py-6 text-center text-xs text-on-surface-variant">No recent wallet transactions.</div> : null}
        </div>
      </div>

      <button type="button" onClick={addMoney} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add Money</button>
    </V35ModalFrame>
  );
}
