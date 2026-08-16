import { useMemo, type ComponentType } from 'react';
import {
  ArrowLeft,
  Banknote,
  Building2,
  CreditCard,
  Landmark,
  PieChart,
  TrendingUp,
  Wallet,
  WalletCards,
  X,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { Account } from '../types';
import { AnimatedNumber } from './AnimatedNumber';

type LucideIcon = ComponentType<{ className?: string }>;

type WalletGroup = {
  key: 'cash' | 'bank' | 'investment' | 'other';
  label: string;
  description: string;
  Icon: LucideIcon;
  accounts: Account[];
  total: number;
};

function getWalletGroup(account: Account): WalletGroup['key'] {
  const group = String(account.group ?? '').trim().toLowerCase();

  if (
    account.id === 'cash'
    || group === 'cash'
    || group === 'cash wallet'
    || group === 'wallet'
    || group.includes('cash')
    || group.includes('wallet')
  ) return 'cash';

  if (group.includes('investment') || group.includes('mutual') || group.includes('stock')) return 'investment';

  if (
    group.includes('bank')
    || group.includes('saving')
    || group.includes('current')
    || group.includes('checking')
  ) return 'bank';

  return 'other';
}

function getAccountIcon(account: Account): LucideIcon {
  const group = String(account.group ?? '').trim().toLowerCase();
  if (group.includes('cash')) return Banknote;
  if (group.includes('wallet')) return WalletCards;
  if (group.includes('investment') || group.includes('mutual') || group.includes('stock')) return TrendingUp;
  if (group.includes('bank') || group.includes('saving') || group.includes('current') || group.includes('checking')) return Landmark;
  if (group.includes('card')) return CreditCard;
  return Building2;
}

export function WalletSummaryModal() {
  const {
    isWalletModalOpen,
    setWalletModalOpen,
    formatCurrency,
    accounts,
  } = useAppContext();

  const activeAssets = useMemo(
    () => accounts.filter(account => !account.is_archived && account.type === 'asset'),
    [accounts],
  );

  const groups = useMemo<WalletGroup[]>(() => {
    const definitions: Array<Omit<WalletGroup, 'accounts' | 'total'>> = [
      { key: 'cash', label: 'Cash & Wallets', description: 'Money immediately on hand', Icon: Wallet },
      { key: 'bank', label: 'Bank Accounts', description: 'Balances held with banks', Icon: Landmark },
      { key: 'investment', label: 'Investments', description: 'Money currently invested', Icon: TrendingUp },
      { key: 'other', label: 'Other Assets', description: 'Other tracked asset balances', Icon: Building2 },
    ];

    return definitions
      .map(definition => {
        const groupAccounts = activeAssets
          .filter(account => getWalletGroup(account) === definition.key)
          .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
        return {
          ...definition,
          accounts: groupAccounts,
          total: groupAccounts.reduce((sum, account) => sum + account.balance, 0),
        };
      })
      .filter(group => group.accounts.length > 0);
  }, [activeAssets]);

  const totalAssets = useMemo(
    () => activeAssets.reduce((sum, account) => sum + account.balance, 0),
    [activeAssets],
  );

  const investmentTotal = useMemo(
    () => groups.find(group => group.key === 'investment')?.total ?? 0,
    [groups],
  );

  const spendableNow = useMemo(
    () => groups
      .filter(group => group.key === 'cash' || group.key === 'bank')
      .reduce((sum, group) => sum + group.total, 0),
    [groups],
  );

  const positiveAssetBase = Math.max(
    0,
    activeAssets.reduce((sum, account) => sum + Math.max(0, account.balance), 0),
  );

  if (!isWalletModalOpen) return null;

  const close = () => setWalletModalOpen(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        data-testid="wallet-summary-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-summary-title"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] border border-[#33465f] bg-[linear-gradient(180deg,#0b1726,#081321)] shadow-[0_28px_72px_rgba(0,0,0,.52)] sm:max-w-[520px] sm:rounded-[22px]"
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#8d9bad]/75 sm:hidden" />

        <div className="grid h-[58px] shrink-0 grid-cols-[40px_1fr_40px] items-center border-b border-[#21334a]/70 px-2.5">
          <button type="button" aria-label="Back from wallet summary" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 text-center">
            <h2 id="wallet-summary-title" className="text-[14px] font-semibold text-white">Wallet Summary</h2>
            <p className="mt-0.5 text-[9.5px] text-[#7f90a5]">Where your money is currently held</p>
          </div>
          <button type="button" aria-label="Close wallet summary" onClick={close} className="v35-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#b9c5d5] hover:bg-[#111d2d]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-[16px] border border-[#28405d] bg-[radial-gradient(circle_at_top_right,rgba(45,125,255,.13),transparent_46%),#0f1d2f] p-4" aria-label="Asset totals">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8fa2ba]">Total assets</p>
                <p className="mt-1.5 font-numeric text-[28px] font-semibold tracking-[-0.035em] text-white">
                  <AnimatedNumber value={totalAssets} format={formatCurrency} />
                </p>
                <p className="mt-1 text-[10px] leading-4 text-[#8394aa]">Active asset accounts only. Loans and credit-card balances are excluded.</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-blue-400/20 bg-blue-500/15 text-blue-300">
                <PieChart className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-[11px] border border-[#263a53] bg-[#0b1727]/80 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[#87a6cf]">
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="text-[9.5px] font-semibold">Spendable now</span>
                </div>
                <p className="mt-1.5 font-numeric text-[14px] font-semibold text-[#eef5ff]">{formatCurrency(spendableNow)}</p>
              </div>
              <div className="rounded-[11px] border border-[#263a53] bg-[#0b1727]/80 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[#91c7ad]">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="text-[9.5px] font-semibold">Investments</span>
                </div>
                <p className="mt-1.5 font-numeric text-[14px] font-semibold text-[#eef5ff]">{formatCurrency(investmentTotal)}</p>
              </div>
            </div>
          </section>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-[11.5px] font-semibold text-[#edf2f8]">Account breakdown</h3>
              <p className="mt-0.5 text-[9.5px] text-[#71839a]">{activeAssets.length} active asset {activeAssets.length === 1 ? 'account' : 'accounts'}</p>
            </div>
            <span className="text-[9.5px] font-medium text-[#788ba3]">Grouped by type</span>
          </div>

          <div className="mt-2.5 space-y-3">
            {groups.length > 0 ? groups.map(group => {
              const GroupIcon = group.Icon;
              const groupShare = positiveAssetBase > 0 ? Math.max(0, group.total) / positiveAssetBase * 100 : 0;

              return (
                <section key={group.key} className="overflow-hidden rounded-[13px] border border-[#22364d] bg-[#0d1929]" data-wallet-group={group.key}>
                  <div className="border-b border-[#21334a]/75 px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[#31506f] bg-[#12243a] text-[#8fb9f4]">
                        <GroupIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-[10.5px] font-semibold text-[#e8eef6]">{group.label}</p>
                          <p className="shrink-0 font-numeric text-[10.5px] font-semibold text-white">{formatCurrency(group.total)}</p>
                        </div>
                        <p className="mt-0.5 truncate text-[9px] text-[#71849b]">{group.description}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#17263a]" aria-label={`${group.label} share of assets`}>
                      <div className="h-full rounded-full bg-[#3b82f6]" style={{ width: `${Math.min(100, groupShare)}%` }} />
                    </div>
                  </div>

                  <div>
                    {group.accounts.map((account, index) => {
                      const AccountIcon = getAccountIcon(account);
                      const accountShare = positiveAssetBase > 0 ? Math.max(0, account.balance) / positiveAssetBase * 100 : 0;

                      return (
                        <div key={account.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${index > 0 ? 'border-t border-[#1d2f44]/80' : ''}`} data-wallet-account={account.id}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#122238] text-[#83a9dd]">
                            <AccountIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-[10.5px] font-medium text-[#e7edf5]">{account.name}</p>
                              <p className={`shrink-0 font-numeric text-[10.5px] font-semibold ${account.balance < 0 ? 'text-red-300' : 'text-[#f5f8fc]'}`}>{formatCurrency(account.balance)}</p>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <p className="min-w-0 flex-1 truncate text-[9px] text-[#71849b]">{account.group || 'Asset account'}</p>
                              <span className="shrink-0 text-[8.5px] font-medium text-[#60748d]">{accountShare.toFixed(accountShare >= 10 ? 0 : 1)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            }) : (
              <div className="rounded-[13px] border border-dashed border-[#30445e] bg-[#0d1929] px-4 py-8 text-center">
                <Wallet className="mx-auto h-6 w-6 text-[#60758f]" />
                <p className="mt-2 text-[10.5px] font-medium text-[#a5b2c2]">No active asset accounts yet</p>
                <p className="mt-1 text-[9.5px] text-[#687b92]">Create an asset account to see where your money is held.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
