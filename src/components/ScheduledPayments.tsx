import { AlertTriangle, CalendarCheck2, CalendarClock, Repeat2 } from 'lucide-react';
import { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { RecurringPayments } from './RecurringPayments';
import {
  findLoanPaymentRule,
  getLoanPaymentSourceAccounts,
  getTrackedLoanScheduleAmount,
  isSchedulableLoanAccount,
} from '../domain/loanRecurring';

export function ScheduledPayments() {
  const { accounts, transactions, recurringRules, people, loanSharingRules, loanContributionRules } = useAppContext();
  const activeSchedules = recurringRules.filter(rule => rule.isActive).length;
  const pendingOccurrences = useMemo(() => new Set(transactions
    .filter(transaction => transaction.is_verified === 0 && transaction.isRecurring)
    .map(transaction => `${transaction.recurringRuleId ?? transaction.id}:${transaction.dueDate ?? transaction.date}`)).size, [transactions]);
  const paymentSources = useMemo(() => getLoanPaymentSourceAccounts(accounts), [accounts]);
  const loansNeedingSetup = useMemo(() => accounts
    .filter(isSchedulableLoanAccount)
    .filter(loan => getTrackedLoanScheduleAmount(loan, people, loanSharingRules, loanContributionRules) > 0)
    .filter(loan => !findLoanPaymentRule(loan.id, recurringRules)), [accounts, loanContributionRules, loanSharingRules, people, recurringRules]);

  return (
    <div data-testid="page-scheduled-payments" className="w-full space-y-5 pb-24 md:pb-0 animate-fade-in">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarClock className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Money automation</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">Scheduled Payments</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">EMIs, SIPs and recurring money live here. CoinBuddy prepares each due occurrence, but your balances change only after you confirm what actually happened.</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
        <div className="v35-surface rounded-2xl p-4">
          <div className="flex items-center gap-2 text-primary"><Repeat2 className="h-4 w-4" /><span className="text-xs font-semibold">Active schedules</span></div>
          <p className="mt-2 font-numeric text-2xl font-semibold text-on-surface">{activeSchedules}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">Repeating rules running</p>
        </div>
        <div className="v35-surface rounded-2xl p-4">
          <div className="flex items-center gap-2 text-[var(--cb-amber)]"><CalendarCheck2 className="h-4 w-4" /><span className="text-xs font-semibold">Waiting confirmation</span></div>
          <p className="mt-2 font-numeric text-2xl font-semibold text-on-surface">{pendingOccurrences}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">Due items not yet approved</p>
        </div>
      </div>

      {loansNeedingSetup.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--cb-amber)]/25 bg-[var(--cb-amber-soft)] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cb-amber)]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">{loansNeedingSetup.length} loan EMI schedule{loansNeedingSetup.length === 1 ? '' : 's'} need{loansNeedingSetup.length === 1 ? 's' : ''} a payment account</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{paymentSources.length === 0
              ? 'Add a Bank, Cash or Wallet account first so CoinBuddy knows where the EMI payment comes from.'
              : 'Choose the funding account in the one-time EMI setup prompt. CoinBuddy will then manage the recurring dates automatically.'}</p>
          </div>
        </div>
      ) : null}

      <RecurringPayments />
    </div>
  );
}
