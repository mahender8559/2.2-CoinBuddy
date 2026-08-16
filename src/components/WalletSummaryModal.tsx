import { useMemo, type ComponentType } from 'react';
import {
  ArrowLeft,
  Banknote,
  Building2,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Scale,
  TrendingUp,
  Wallet,
  WalletCards,
  X,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { Account } from '../types';
import { AnimatedNumber } from './AnimatedNumber';

type LucideIcon = ComponentType<{ className?: string }>;

function getAccountIcon(account: Account): LucideIcon {
  const group = String(account.group ?? '').trim().toLowerCase();

  if (account.type === 'liability') {
    if (group.includes('credit card') || group === 'card' || group.includes('card')) return CreditCard;
    return CircleDollarSign;
  }

  if (group.includes('cash')) return Banknote;
  if (group.includes('wallet')) return WalletCards;
  if (group.includes('investment') || group.includes('mutual') || group.includes('stock')) return TrendingUp;
  if (group.includes('bank') || group.includes('saving') || group.includes('current') || group.includes('checking')) return Landmark;
  return Building2;
}

function accountKindLabel(account: Account) {
  if (account.group?.trim()) return account.group;
  return account.type === 'liability' ? 'Liability' : 'Asset account';
}

export function WalletSummaryModal() {
  const {
    isWalletModalOpen,
    setWalletModalOpen,
    formatCurrency,
    accounts,
  } = useAppContext();

  const activeAccounts = useMemo(
    () => accounts.filter(account => !account.is_archived),
    [accounts],
  );

  const assets = useMemo(
    () => activeAccounts
      .filter(account => account.type === 'asset')
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name)),
    [activeAccounts],
  );

  const liabilities = useMemo(
    () => activeAccounts
      .filter(account => account.type === 'liability')
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name)),
    [activeAccounts],
  );

  const totalAssets = useMemo(
    () => assets.reduce((sum, account) => sum + account.balance, 0),
    [assets],
  );

  const totalLiabilities = useMemo(
    () => liabilities.reduce((sum, account) => sum + Math.abs(account.balance), 0),
    [liabilities],
  );

  const netPosition = totalAssets - totalLiabilities;

  if (!isWalletModalOpen) return null;

  const close = () => setWalletModalOpen(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm sm:p-6">
      <div
        data-testid="wallet-summary-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-summary-title"
        className="relative flex max-h-[82dvh] w-full max-w-[400px] flex-col overflow-hidden rounded-[22px] border border-[#33465f] bg-[linear-gradient(180deg,#0b1726,#081321)] shadow-[0_28px_72px_rgba(0,0,0,.56)]"
      >
        <div className="grid h-[60px] shrink-0 grid-cols-[40px_1fr_40px] items-center border-b border-[#21334a]/70 px-2.5">
          <button type="button" aria-label="Back from wallet summary" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 text-center">
            <h2 id="wallet-summary-title" className="text-[15px] font-semibold text-white">Wallet Summary</h2>
            <p className="mt-0.5 text-[9.5px] text-[#7f90a5]">Quick peek of your assets and liabilities</p>
          </div>
          <button type="button" aria-label="Close wallet summary" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="grid grid-cols-2 gap-2.5" aria-label="Wallet totals">
            <div className="rounded-[14px] border border-emerald-500/20 bg-[linear-gradient(180deg,rgba(16,185,129,.10),rgba(16,185,129,.035))] p-3">
              <div className="flex items-center gap-2 text-emerald-300">
                <span className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-emerald-500/20 bg-emerald-500/10">
                  <Wallet className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-semibold text-[#cbd8d3]">Total Assets</span>
              </div>
              <p className="mt-2 font-numeric text-[18px] font-semibold tracking-[-0.025em] text-white">
                <AnimatedNumber value={totalAssets} format={formatCurrency} />
              </p>
              <p className="mt-1 text-[9px] text-[#6f9286]">{assets.length} active {assets.length === 1 ? 'account' : 'accounts'}</p>
            </div>

            <div className="rounded-[14px] border border-red-500/20 bg-[linear-gradient(180deg,rgba(239,68,68,.10),rgba(239,68,68,.035))] p-3">
              <div className="flex items-center gap-2 text-red-300">
                <span className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-red-500/20 bg-red-500/10">
                  <CreditCard className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-semibold text-[#dccdce]">Total Liabilities</span>
              </div>
              <p className="mt-2 font-numeric text-[18px] font-semibold tracking-[-0.025em] text-white">
                <AnimatedNumber value={totalLiabilities} format={formatCurrency} />
              </p>
              <p className="mt-1 text-[9px] text-[#9a777c]">{liabilities.length} active {liabilities.length === 1 ? 'account' : 'accounts'}</p>
            </div>
          </section>

          <section className="mt-2.5 flex items-center gap-3 rounded-[13px] border border-[#273b54] bg-[#0d1929] px-3 py-2.5" aria-label="Net position">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${netPosition >= 0 ? 'border-blue-400/20 bg-blue-500/12 text-blue-300' : 'border-red-400/20 bg-red-500/12 text-red-300'}`}>
              <Scale className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-[#b9c6d6]">Net Position</p>
              <p className="mt-0.5 text-[8.75px] text-[#71839a]">Assets − liabilities</p>
            </div>
            <p className={`shrink-0 font-numeric text-[15px] font-semibold ${netPosition >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netPosition >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netPosition))}
            </p>
          </section>

          <div className="mt-4">
            <h3 className="text-[11px] font-semibold text-[#edf2f8]">Account breakdown</h3>
            <p className="mt-0.5 text-[9px] text-[#71839a]">Tap a section to see individual accounts</p>
          </div>

          <div className="mt-2.5 space-y-2">
            <details className="group overflow-hidden rounded-[13px] border border-[#22364d] bg-[#0d1929]" data-wallet-breakdown="assets">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                  <Wallet className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold text-[#e8eef6]">Assets</p>
                  <p className="mt-0.5 text-[8.75px] text-[#708399]">{assets.length} {assets.length === 1 ? 'account' : 'accounts'}</p>
                </div>
                <p className="shrink-0 font-numeric text-[10.5px] font-semibold text-white">{formatCurrency(totalAssets)}</p>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#73869e] transition-transform group-open:rotate-180" />
              </summary>

              <div className="border-t border-[#21334a]/75">
                {assets.length > 0 ? assets.map((account, index) => {
                  const AccountIcon = getAccountIcon(account);
                  return (
                    <div key={account.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${index > 0 ? 'border-t border-[#1d2f44]/80' : ''}`} data-wallet-account={account.id}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#122238] text-[#83a9dd]">
                        <AccountIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10.5px] font-medium text-[#e7edf5]">{account.name}</p>
                        <p className="mt-0.5 truncate text-[8.75px] text-[#71849b]">{accountKindLabel(account)}</p>
                      </div>
                      <p className="shrink-0 font-numeric text-[10.5px] font-semibold text-emerald-300">{formatCurrency(account.balance)}</p>
                    </div>
                  );
                }) : (
                  <p className="px-3 py-4 text-center text-[9.5px] text-[#71849b]">No active asset accounts</p>
                )}
              </div>
            </details>

            <details className="group overflow-hidden rounded-[13px] border border-[#22364d] bg-[#0d1929]" data-wallet-breakdown="liabilities">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-red-500/20 bg-red-500/10 text-red-300">
                  <CreditCard className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold text-[#e8eef6]">Liabilities</p>
                  <p className="mt-0.5 text-[8.75px] text-[#708399]">{liabilities.length} {liabilities.length === 1 ? 'account' : 'accounts'}</p>
                </div>
                <p className="shrink-0 font-numeric text-[10.5px] font-semibold text-white">{formatCurrency(totalLiabilities)}</p>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#73869e] transition-transform group-open:rotate-180" />
              </summary>

              <div className="border-t border-[#21334a]/75">
                {liabilities.length > 0 ? liabilities.map((account, index) => {
                  const AccountIcon = getAccountIcon(account);
                  return (
                    <div key={account.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${index > 0 ? 'border-t border-[#1d2f44]/80' : ''}`} data-wallet-account={account.id}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#251a24] text-[#ed8992]">
                        <AccountIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10.5px] font-medium text-[#e7edf5]">{account.name}</p>
                        <p className="mt-0.5 truncate text-[8.75px] text-[#71849b]">{accountKindLabel(account)}</p>
                      </div>
                      <p className="shrink-0 font-numeric text-[10.5px] font-semibold text-red-300">{formatCurrency(Math.abs(account.balance))}</p>
                    </div>
                  );
                }) : (
                  <p className="px-3 py-4 text-center text-[9.5px] text-[#71849b]">No active liabilities</p>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
