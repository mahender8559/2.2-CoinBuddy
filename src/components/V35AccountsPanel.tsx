import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  Car,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Landmark,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { Account } from '../types';
import { AnimatedNumber } from './AnimatedNumber';
import { ReconcileWizard } from './ReconcileWizard';
import { SafeValueBadge } from './SafeValueBadge';
import { UpdateLoanRateModal } from './UpdateLoanRateModal';
import { getOriginalPrincipal, getTotalInterestPaid } from '../utils/emi';
import { isSafeMathError } from '../utils/safeMath';
import { findInvestmentSipRule } from '../domain/investmentSip';
import { IconBadge, MoneyValue, SectionHeader, StatusPill } from './ui/V35';

type AccountGroupKey = 'bank' | 'investment' | 'cash' | 'other' | 'loan' | 'card';

type AccountGroup = {
  key: AccountGroupKey;
  title: string;
  description: string;
  accounts: Account[];
  total: number;
  liability?: boolean;
};

const normalize = (value?: string) => (value ?? '').trim().toLowerCase();

const classifyAsset = (account: Account): AccountGroupKey => {
  const value = normalize(`${account.group} ${account.name}`);
  if (value.includes('invest') || value.includes('mutual') || value.includes('fund') || value.includes('broker')) return 'investment';
  if (value.includes('cash') || value.includes('wallet')) return 'cash';
  if (value.includes('physical') || value.includes('gold') || value.includes('property')) return 'other';
  return 'bank';
};

const classifyLiability = (account: Account, isCreditCard: boolean): AccountGroupKey => {
  if (isCreditCard || normalize(account.group).includes('credit card')) return 'card';
  return 'loan';
};

const dueMeta = (account: Account, dueDate?: string) => {
  const raw = dueDate || account.nextEMIDate || account.nextInterestDueDate;
  if (!raw) return null;
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  return {
    label: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    soon: days >= 0 && days <= 7,
  };
};

export function V35AccountsPanel() {
  const {
    accounts,
    creditCards,
    recurringRules,
    transactions,
    formatCurrency,
    deleteAccount,
    setAddAccountModalType,
    setEditingAccount,
    setEditingCreditCard,
    setPayCardModalState,
  } = useAppContext();

  const activeAccounts = accounts.filter(account => !account.is_archived);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [rateUpdateAccount, setRateUpdateAccount] = useState<Account | null>(null);
  const [adjustmentTarget, setAdjustmentTarget] = useState<{ account: Account; kind: 'BALANCE_ADJUSTMENT' | 'MARKET_ADJUSTMENT' } | null>(null);

  useEffect(() => {
    if (!deleteError) return;
    const timer = window.setTimeout(() => setDeleteError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [deleteError]);

  const groups = useMemo<AccountGroup[]>(() => {
    const assets = activeAccounts.filter(account => account.type === 'asset');
    const liabilities = activeAccounts.filter(account => account.type === 'liability');
    const pickAssets = (key: AccountGroupKey) => assets.filter(account => classifyAsset(account) === key);
    const pickLiabilities = (key: AccountGroupKey) => liabilities.filter(account => {
      const card = creditCards.some(item => item.id === account.id);
      return classifyLiability(account, card) === key;
    });
    const make = (key: AccountGroupKey, title: string, description: string, items: Account[], liability = false): AccountGroup => ({
      key,
      title,
      description,
      accounts: items,
      total: items.reduce((sum, account) => sum + Number(account.balance || 0), 0),
      liability,
    });

    return [
      make('bank', 'Bank accounts', 'Savings and everyday money', pickAssets('bank')),
      make('investment', 'Investments', 'Funds and market-linked assets', pickAssets('investment')),
      make('cash', 'Cash & wallets', 'Physical cash and wallet balances', pickAssets('cash')),
      make('other', 'Other assets', 'Physical and long-term assets', pickAssets('other')),
      make('loan', 'Loans', 'Outstanding lender balances', pickLiabilities('loan'), true),
      make('card', 'Credit cards', 'Current card balances and utilization', pickLiabilities('card'), true),
    ].filter(group => group.accounts.length > 0);
  }, [activeAccounts, creditCards]);

  const totalAssets = activeAccounts.filter(account => account.type === 'asset').reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const totalLiabilities = activeAccounts.filter(account => account.type === 'liability').reduce((sum, account) => sum + Number(account.balance || 0), 0);

  const openAdd = (type: 'asset' | 'liability') => {
    setEditingAccount(null);
    setEditingCreditCard(null);
    setAddAccountModalType(type);
    setAddOpen(false);
  };

  const editAccount = (account: Account) => {
    const card = creditCards.find(item => item.id === account.id);
    if (card) {
      setEditingCreditCard(card);
      setEditingAccount(null);
    } else {
      setEditingCreditCard(null);
      setEditingAccount(account);
    }
    setAddAccountModalType(account.type === 'liability' ? 'liability' : 'asset');
  };

  const confirmDelete = () => {
    if (!accountToDelete) return;
    try {
      deleteAccount(accountToDelete.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete account');
    }
    setAccountToDelete(null);
  };

  const iconFor = (group: AccountGroupKey) => {
    if (group === 'investment') return TrendingUp;
    if (group === 'cash') return Wallet;
    if (group === 'other') return Banknote;
    if (group === 'loan') return Car;
    if (group === 'card') return CreditCard;
    return Landmark;
  };

  const toneFor = (group: AccountGroupKey): 'blue' | 'green' | 'red' | 'purple' | 'amber' => {
    if (group === 'investment') return 'purple';
    if (group === 'cash') return 'amber';
    if (group === 'loan' || group === 'card') return 'red';
    return 'blue';
  };

  return (
    <section data-testid="page-accounts" className="w-full space-y-6 pb-24 md:pb-0 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">Your Accounts 👋</h1>
          <p className="mt-1 text-sm text-on-surface-variant">All of your real balances, grouped so the important numbers stay easy to scan.</p>
        </div>
        <div className="relative self-start sm:self-auto">
          <button data-tour-id="tour-add-account" type="button" onClick={() => setAddOpen(value => !value)} aria-expanded={addOpen} className="v35-focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-[0_0_24px_rgba(76,141,255,.18)]">
            <Plus className="h-4 w-4" /> Add account <ChevronDown className="h-4 w-4" />
          </button>
          {addOpen ? (
            <div className="v35-surface absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-xl p-1.5 shadow-2xl">
              <button onClick={() => openAdd('asset')} className="v35-focus-ring flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-on-surface hover:bg-surface-container-high"><Building2 className="h-4 w-4 text-primary" /> Asset / investment</button>
              <button onClick={() => openAdd('liability')} className="v35-focus-ring flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-on-surface hover:bg-surface-container-high"><CreditCard className="h-4 w-4 text-[var(--cb-red)]" /> Loan / credit card</button>
            </div>
          ) : null}
        </div>
      </div>

      {deleteError ? <div role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{deleteError}</div> : null}

      <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
        <div className="v35-surface rounded-2xl p-4">
          <div className="text-xs font-medium text-on-surface-variant">Total assets</div>
          <MoneyValue className="mt-1 block text-xl font-semibold text-[var(--cb-green)]">{formatCurrency(totalAssets)}</MoneyValue>
        </div>
        <div className="v35-surface rounded-2xl p-4">
          <div className="text-xs font-medium text-on-surface-variant">Total liabilities</div>
          <MoneyValue className="mt-1 block text-xl font-semibold text-[var(--cb-red)]">-{formatCurrency(totalLiabilities)}</MoneyValue>
        </div>
      </div>

      <div className="space-y-4">
        {groups.map(group => {
          const GroupIcon = iconFor(group.key);
          return (
            <div key={group.key} className="v35-surface overflow-hidden rounded-2xl" data-testid={`account-group-${group.key}`}>
              <div className="flex items-center gap-3 border-b border-outline-variant/25 px-4 py-4 sm:px-5">
                <IconBadge icon={GroupIcon} tone={toneFor(group.key)} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-on-surface">{group.title}</h2>
                  <p className="text-xs text-on-surface-variant">{group.accounts.length} {group.accounts.length === 1 ? 'account' : 'accounts'} · {group.description}</p>
                </div>
                <MoneyValue className={`text-base font-semibold ${group.liability ? 'text-[var(--cb-red)]' : 'text-on-surface'}`}>{group.liability ? '-' : ''}{formatCurrency(group.total)}</MoneyValue>
              </div>

              <div>
                {group.accounts.map((account, index) => {
                  const card = creditCards.find(item => item.id === account.id);
                  const expanded = expandedId === account.id;
                  const isInvestment = group.key === 'investment';
                  const isLoan = group.key === 'loan';
                  const investmentRule = isInvestment ? findInvestmentSipRule(account.id, recurringRules) : undefined;
                  const needsSipLink = Boolean(isInvestment && account.investmentMethod === 'SIP' && Number(account.monthlySIPAmount ?? 0) > 0 && account.nextSIPDate && !investmentRule);
                  const investmentGain = isInvestment && account.investedAmount ? account.balance - account.investedAmount : null;
                  const investmentPct = investmentGain !== null && account.investedAmount ? (investmentGain / account.investedAmount) * 100 : null;
                  const due = dueMeta(account, card?.dueDate);
                  const creditLimit = card?.limit || 0;
                  const utilization = group.key === 'card' && creditLimit > 0 ? Math.min(100, Math.max(0, (account.balance / creditLimit) * 100)) : 0;
                  const originalPrincipal = isLoan ? getOriginalPrincipal(account, transactions) : 0;
                  const principalPaid = isLoan && originalPrincipal > 0 ? Math.max(0, originalPrincipal - account.balance) : 0;
                  const payoffPct = isLoan && originalPrincipal > 0 ? Math.min(100, Math.max(0, principalPaid / originalPrincipal * 100)) : account.balance === 0 ? 100 : 0;
                  const interestPaid = isLoan ? getTotalInterestPaid(account, transactions) : 0;

                  return (
                    <div key={account.id} data-tour-id={group.key === 'bank' && index === 0 ? 'tour-account-interactions' : undefined} className="border-b border-outline-variant/20 last:border-b-0">
                      <button type="button" onClick={() => setExpandedId(expanded ? null : account.id)} aria-expanded={expanded} className="v35-focus-ring flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.018] sm:px-5">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${group.liability ? 'bg-[var(--cb-red-soft)] text-[var(--cb-red)]' : isInvestment ? 'bg-[var(--cb-purple-soft)] text-[var(--cb-purple)]' : 'bg-[var(--cb-blue-soft)] text-[var(--cb-blue)]'}`}>
                          {group.key === 'bank' ? <Building2 className="h-5 w-5" /> : group.key === 'investment' ? <TrendingUp className="h-5 w-5" /> : group.key === 'cash' ? <Wallet className="h-5 w-5" /> : group.key === 'card' ? <CreditCard className="h-5 w-5" /> : group.key === 'loan' ? <Car className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-on-surface">{account.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant">
                            <span>{account.group || (group.liability ? 'Liability' : 'Asset')}</span>
                            {due ? <span>· Due {due.label}</span> : null}
                            {needsSipLink ? <span className="text-[var(--cb-amber)]">· SIP needs funding account</span> : null}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className={`block text-base font-semibold font-numeric tabular-nums ${group.liability ? 'text-[var(--cb-red)]' : 'text-on-surface'}`}>
                            {isSafeMathError(account.balance) ? <SafeValueBadge errorCode={account.balance} /> : <>{group.liability ? '-' : ''}<AnimatedNumber value={account.balance} format={formatCurrency} /></>}
                          </span>
                          {due?.soon ? <StatusPill tone="warning">Due soon</StatusPill> : investmentGain !== null && investmentPct !== null ? <span className={`mt-1 block text-[11px] font-semibold ${investmentGain >= 0 ? 'text-[var(--cb-green)]' : 'text-[var(--cb-red)]'}`}>{investmentGain >= 0 ? '+' : ''}{investmentPct.toFixed(1)}%</span> : null}
                        </span>
                        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-on-surface-variant" /> : <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" />}
                      </button>

                      {expanded ? (
                        <div className="bg-black/10 px-4 pb-4 sm:px-5">
                          <div className="ml-0 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/40 p-3 sm:ml-[52px]">
                            {isInvestment && investmentGain !== null ? (
                              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                                <div><span className="text-on-surface-variant">Invested</span><MoneyValue className="mt-1 block font-semibold text-on-surface">{formatCurrency(account.investedAmount ?? 0)}</MoneyValue></div>
                                <div><span className="text-on-surface-variant">Market value</span><MoneyValue className="mt-1 block font-semibold text-on-surface">{formatCurrency(account.balance)}</MoneyValue></div>
                                <div><span className="text-on-surface-variant">Gain / loss</span><MoneyValue className={`mt-1 block font-semibold ${investmentGain >= 0 ? 'text-[var(--cb-green)]' : 'text-[var(--cb-red)]'}`}>{investmentGain >= 0 ? '+' : ''}{formatCurrency(investmentGain)}</MoneyValue></div>
                              </div>
                            ) : null}

                            {group.key === 'card' && creditLimit > 0 ? (
                              <div>
                                <div className="flex items-center justify-between gap-3 text-xs"><span className="text-on-surface-variant">Credit utilization</span><span className="font-semibold text-on-surface">{utilization.toFixed(0)}%</span></div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high"><div className={`h-full rounded-full ${utilization <= 30 ? 'bg-[var(--cb-green)]' : utilization <= 70 ? 'bg-[var(--cb-amber)]' : 'bg-[var(--cb-red)]'}`} style={{ width: `${utilization}%` }} /></div>
                                <p className="mt-1.5 text-[11px] text-on-surface-variant">{formatCurrency(account.balance)} of {formatCurrency(creditLimit)} limit used.</p>
                              </div>
                            ) : null}

                            {isLoan ? (
                              <div>
                                <div className="flex items-center justify-between gap-3 text-xs"><span className="text-on-surface-variant">Principal paid</span><span className="font-semibold text-on-surface">{payoffPct.toFixed(0)}%</span></div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high"><div className="h-full rounded-full bg-[var(--cb-green)]" style={{ width: `${payoffPct}%` }} /></div>
                                {interestPaid > 0 ? <p className="mt-1.5 text-[11px] text-on-surface-variant">Interest paid so far: <MoneyValue>{formatCurrency(interestPaid)}</MoneyValue></p> : null}
                              </div>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2 border-t border-outline-variant/20 pt-3">
                              <button onClick={() => setAdjustmentTarget({ account, kind: 'BALANCE_ADJUSTMENT' })} className="v35-focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary"><RefreshCw className="h-3.5 w-3.5" /> Reconcile</button>
                              {isInvestment ? <button onClick={() => setAdjustmentTarget({ account, kind: 'MARKET_ADJUSTMENT' })} className="v35-focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--cb-green-soft)] px-3 text-xs font-semibold text-[var(--cb-green)]"><TrendingUp className="h-3.5 w-3.5" /> Market value</button> : null}
                              {group.liability ? <button onClick={() => setPayCardModalState({ isOpen: true, cardId: card?.id ?? account.id })} className="v35-focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--cb-green-soft)] px-3 text-xs font-semibold text-[var(--cb-green)]"><Banknote className="h-3.5 w-3.5" /> Pay down</button> : null}
                              {isLoan ? <button onClick={() => setRateUpdateAccount(account)} className="v35-focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--cb-blue-soft)] px-3 text-xs font-semibold text-primary"><Percent className="h-3.5 w-3.5" /> Update rate</button> : null}
                              <button onClick={() => editAccount(account)} className="v35-focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                              <button onClick={() => setAccountToDelete(account)} className="v35-focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-on-surface-variant hover:bg-error/10 hover:text-error"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {activeAccounts.length === 0 ? (
        <div className="v35-surface rounded-2xl p-8 text-center">
          <IconBadge icon={Wallet} size="lg" />
          <h2 className="mt-4 text-lg font-semibold text-on-surface">No accounts yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-on-surface-variant">Add the accounts you actually use. CoinBuddy will keep assets and liabilities visually separate.</p>
        </div>
      ) : null}

      <UpdateLoanRateModal isOpen={Boolean(rateUpdateAccount)} onClose={() => setRateUpdateAccount(null)} account={rateUpdateAccount} />
      {adjustmentTarget ? <ReconcileWizard account={adjustmentTarget.account} kind={adjustmentTarget.kind} onClose={() => setAdjustmentTarget(null)} /> : null}

      {accountToDelete ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm md:items-center md:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className="v35-surface w-full rounded-t-3xl p-5 md:max-w-sm md:rounded-2xl md:p-6">
            <h2 id="delete-account-title" className="text-xl font-semibold text-on-surface">Delete account?</h2>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">Delete <strong className="text-on-surface">{accountToDelete.name}</strong>? Existing ledger history remains subject to CoinBuddy's current account deletion safeguards.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => setAccountToDelete(null)} className="v35-focus-ring min-h-11 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface">Cancel</button>
              <button onClick={confirmDelete} className="v35-focus-ring min-h-11 rounded-xl bg-error text-sm font-semibold text-white">Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
