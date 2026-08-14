import { ArrowLeft, ArrowRightLeft, CalendarDays, Edit2, Layers, ReceiptText, Share2, StickyNote, WalletCards, X } from 'lucide-react';
import type { Transaction } from '../types';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';
import { IconBadge, MoneyValue, StatusPill } from './ui/V35';

export function V35TransactionDetail({
  transaction,
  onClose,
  onEdit,
  onOpenSharing,
}: {
  transaction: Transaction;
  onClose: () => void;
  onEdit?: () => void;
  onOpenSharing?: (transactionId: string) => void;
}) {
  const { accounts, categories, events, sharedObligations, formatCurrency } = useAppContext();
  const category = categories.find(item => item.id === transaction.category || `#${item.name.toLowerCase().replace(/\s+/g, '')}` === transaction.category);
  const event = events.find(item => item.id === transaction.eventId);
  const from = accounts.find(account => account.id === (transaction.fromAccountId ?? transaction.account));
  const to = accounts.find(account => account.id === (transaction.toAccountId ?? (transaction.type === 'income' ? transaction.account : undefined)));
  const linkedShared = sharedObligations.find(obligation => obligation.transactionId === transaction.id && obligation.status !== 'CANCELLED');
  const Icon = icons[transaction.icon as keyof typeof icons] || ReceiptText;
  const isAdjustment = transaction.transaction_type === 'BALANCE_ADJUSTMENT' || transaction.transaction_type === 'MARKET_ADJUSTMENT';
  const canEdit = Boolean(onEdit && !transaction.isOpeningBalance && !isAdjustment);
  const canShare = Boolean(onOpenSharing && transaction.type === 'expense' && transaction.is_verified !== 0 && !transaction.isOpeningBalance && !isAdjustment);
  const amountTone = transaction.type === 'income' ? 'text-[var(--cb-green)]' : transaction.type === 'transfer' ? 'text-[var(--cb-purple)]' : 'text-[var(--cb-red)]';
  const amountPrefix = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';
  const date = new Date(transaction.date);
  const dateLabel = Number.isNaN(date.getTime()) ? transaction.date : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const timeLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const accountText = transaction.type === 'transfer'
    ? `${from?.name ?? 'Unknown account'} → ${to?.name ?? 'Unknown account'}`
    : transaction.type === 'income'
      ? to?.name ?? from?.name ?? 'Unknown account'
      : from?.name ?? to?.name ?? 'Unknown account';

  return (
    <div className="fixed inset-0 z-[230] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title" data-testid="transaction-detail" className="v35-surface max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl p-5 shadow-2xl md:max-w-lg md:rounded-2xl md:p-6" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="v35-focus-ring flex h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high md:hidden"><ArrowLeft className="h-4 w-4" /> Back</button>
          <h2 id="transaction-detail-title" className="hidden text-sm font-semibold text-on-surface-variant md:block">Transaction details</h2>
          <div className="flex items-center gap-1">
            {canEdit ? <button type="button" aria-label="Edit transaction" onClick={onEdit} className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-primary"><Edit2 className="h-4 w-4" /></button> : null}
            <button type="button" aria-label="Close transaction details" onClick={onClose} className="v35-focus-ring hidden h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high md:flex"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-center text-center">
          <IconBadge icon={Icon} size="lg" tone={transaction.type === 'income' ? 'green' : transaction.type === 'transfer' ? 'purple' : 'red'} />
          <h1 className="mt-3 text-lg font-semibold text-on-surface">{transaction.title}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{transaction.subtitle}</p>
          <MoneyValue className={`mt-4 text-3xl font-semibold ${amountTone}`}>{amountPrefix}{formatCurrency(Math.abs(transaction.amount))}</MoneyValue>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <StatusPill tone={transaction.is_verified === 0 ? 'warning' : 'neutral'}>{transaction.is_verified === 0 ? 'Needs confirmation' : transaction.type === 'income' ? 'Income' : transaction.type === 'transfer' ? 'Transfer' : 'Expense'}</StatusPill>
            {transaction.isRecurring ? <StatusPill>Recurring</StatusPill> : null}
            {linkedShared ? <StatusPill tone="positive">Shared</StatusPill> : null}
          </div>
        </div>

        <div className="mt-6 v35-surface overflow-hidden rounded-2xl border border-outline-variant/20">
          <DetailRow icon={WalletCards} label={transaction.type === 'transfer' ? 'Movement' : transaction.type === 'income' ? 'Paid into' : 'Paid from'} value={accountText} />
          <DetailRow icon={ReceiptText} label="Category" value={category?.name ?? transaction.category.replace(/^#/, '') || 'Uncategorized'} />
          <DetailRow icon={CalendarDays} label="Date" value={`${dateLabel}${timeLabel ? ` · ${timeLabel}` : ''}`} />
          {event ? <DetailRow icon={Layers} label="Event" value={event.name} /> : null}
          {transaction.notes ? <DetailRow icon={StickyNote} label="Notes" value={transaction.notes} /> : null}
          {transaction.transaction_type && transaction.transaction_type !== transaction.type.toUpperCase() ? <DetailRow icon={ArrowRightLeft} label="Ledger treatment" value={transaction.transaction_type.replaceAll('_', ' ').toLowerCase()} /> : null}
        </div>

        {canShare ? (
          <button type="button" onClick={() => onOpenSharing?.(transaction.id)} className="v35-focus-ring mt-5 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/7 px-4 text-left hover:bg-primary/12">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary"><Share2 className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-on-surface">{linkedShared ? 'View shared expense' : 'Split with friends'}</span><span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{linkedShared ? 'Open Sharing to review responsibility, payments and settlements.' : 'Open Sharing with this expense preselected. The original transaction stays unchanged.'}</span></span>
            <ArrowRightLeft className="h-4 w-4 shrink-0 text-primary" />
          </button>
        ) : null}

        {isAdjustment ? <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-on-surface-variant">This is a ledger adjustment rather than ordinary income or spending, so CoinBuddy keeps its accounting treatment intact.</div> : null}
      </section>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string }) {
  return <div className="flex min-h-[64px] items-start gap-3 border-b border-outline-variant/20 px-4 py-3 last:border-b-0"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-[11px] font-medium text-on-surface-variant">{label}</p><p className="mt-1 break-words text-sm font-medium capitalize text-on-surface">{value}</p></div></div>;
}
