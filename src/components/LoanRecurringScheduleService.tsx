import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Landmark, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  buildManagedLoanRecurringTransaction,
  buildManagedLoanRuleUpdate,
  findLoanPaymentRule,
  getLoanPaymentSourceAccounts,
  getTrackedLoanScheduleAmount,
  isManagedLoanPaymentRule,
  isSchedulableLoanAccount,
  parseManagedLoanSchedule,
  serializeManagedLoanSchedule,
} from '../domain/loanRecurring';

const creationInFlight = new Set<string>();
const syncInFlight = new Set<string>();

function formatDate(dateKey?: string): string {
  if (!dateKey) return 'Not set';
  const [year, month, day] = dateKey.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : dateKey;
}

export function LoanRecurringScheduleService() {
  const {
    accounts,
    recurringRules,
    addTransaction,
    updateRecurringRule,
    people,
    loanSharingRules,
    loanContributionRules,
    biometric,
    passcode,
    isUnlocked,
    showToast,
    formatCurrency,
  } = useAppContext();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [saving, setSaving] = useState(false);

  const locked = Boolean((biometric || passcode) && !isUnlocked);
  // Account metadata hydrates before shared-finance state during startup. Wait
  // for the canonical self person so a shared loan can never be mistaken for a
  // personal loan during that brief window and scheduled at the full EMI.
  const sharedFinanceReady = people.some(person => person.isSelf && !person.isArchived);
  const schedulerUnavailable = locked || !sharedFinanceReady;
  const paymentSources = useMemo(() => getLoanPaymentSourceAccounts(accounts), [accounts]);
  const loanSchedules = useMemo(() => accounts
    .filter(isSchedulableLoanAccount)
    .map(loan => ({
      loan,
      amount: getTrackedLoanScheduleAmount(loan, people, loanSharingRules, loanContributionRules),
      rule: findLoanPaymentRule(loan.id, recurringRules),
    })), [accounts, people, loanContributionRules, loanSharingRules, recurringRules]);

  // Once React has observed the newly created rule, clear the cross-render guard.
  useEffect(() => {
    for (const item of loanSchedules) if (item.rule) creationInFlight.delete(item.loan.id);
  }, [loanSchedules]);

  // Loan-owned schedules follow loan amount/frequency/date edits. A manually
  // created transfer to the same liability is left entirely under user control.
  useEffect(() => {
    if (schedulerUnavailable) return;
    const managed = loanSchedules.find(item => item.rule && isManagedLoanPaymentRule(item.rule, item.loan.id));
    if (!managed?.rule) return;
    const key = `sync:${managed.loan.id}`;
    if (syncInFlight.has(key)) return;

    const parsed = parseManagedLoanSchedule(managed.rule.notes);
    if (managed.amount <= 0) {
      if (!managed.rule.isActive && parsed?.amount === 0) return;
      syncInFlight.add(key);
      const configuredDate = String(managed.loan.nextEMIDate);
      const frequency = managed.loan.paymentFrequency ?? 'MONTHLY';
      void updateRecurringRule({
        ...managed.rule,
        isActive: false,
        notes: serializeManagedLoanSchedule({ accountId: managed.loan.id, amount: 0, frequency, configuredDate }),
      }).finally(() => syncInFlight.delete(key));
      return;
    }

    const update = buildManagedLoanRuleUpdate(managed.rule, managed.loan, managed.amount);
    if (!update) return;
    // A rule paused automatically because the user's shared-loan contribution
    // was zero is re-enabled when that tracked contribution becomes positive.
    if (parsed?.amount === 0) update.isActive = true;
    syncInFlight.add(key);
    void updateRecurringRule(update).finally(() => syncInFlight.delete(key));
  }, [loanSchedules, schedulerUnavailable, updateRecurringRule]);

  const missingSchedules = useMemo(() => loanSchedules.filter(item => item.amount > 0 && !item.rule), [loanSchedules]);

  const createSchedule = async (loanId: string, sourceAccountId: string) => {
    const item = missingSchedules.find(candidate => candidate.loan.id === loanId);
    if (!item || !sourceAccountId || creationInFlight.has(loanId)) return false;
    creationInFlight.add(loanId);
    const result = await addTransaction(buildManagedLoanRecurringTransaction(item.loan, sourceAccountId, item.amount));
    if (!result.success) {
      creationInFlight.delete(loanId);
      showToast(result.error || `Could not create the EMI schedule for ${item.loan.name}.`);
      return false;
    }
    showToast(`Scheduled EMI created for ${item.loan.name}`);
    return true;
  };

  // If there is only one sensible funding account, no extra setup is necessary.
  useEffect(() => {
    if (schedulerUnavailable || paymentSources.length !== 1) return;
    const item = missingSchedules.find(candidate => !creationInFlight.has(candidate.loan.id));
    if (!item) return;
    void createSchedule(item.loan.id, paymentSources[0].id);
  }, [schedulerUnavailable, missingSchedules, paymentSources]);

  const promptItem = !schedulerUnavailable && paymentSources.length > 1
    ? missingSchedules.find(item => !dismissed.has(item.loan.id) && !creationInFlight.has(item.loan.id))
    : undefined;

  useEffect(() => {
    if (!promptItem) {
      setSelectedSourceId('');
      return;
    }
    if (!paymentSources.some(account => account.id === selectedSourceId)) setSelectedSourceId(paymentSources[0]?.id ?? '');
  }, [paymentSources, promptItem, selectedSourceId]);

  if (!promptItem) return null;

  const frequencyLabel = promptItem.loan.paymentFrequency === 'QUARTERLY'
    ? 'Quarterly'
    : promptItem.loan.paymentFrequency === 'ANNUALLY'
      ? 'Annually'
      : 'Monthly';

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" data-testid="loan-recurring-source-setup">
      <div role="dialog" aria-modal="true" aria-labelledby="loan-recurring-title" className="v35-surface w-full rounded-t-3xl border border-outline-variant/30 p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarClock className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">One-time setup</p>
            <h2 id="loan-recurring-title" className="mt-1 text-lg font-semibold text-on-surface">Choose the account that pays this EMI</h2>
            <p className="mt-1 text-sm leading-5 text-on-surface-variant">CoinBuddy will create the recurring schedule and keep each due payment pending until you confirm it actually happened.</p>
          </div>
          <button type="button" aria-label="Set up later" onClick={() => setDismissed(previous => new Set(previous).add(promptItem.loan.id))} className="v35-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Landmark className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-on-surface">{promptItem.loan.name}</p><p className="mt-0.5 text-xs text-on-surface-variant">{frequencyLabel} · next payment {formatDate(promptItem.loan.nextEMIDate)}</p></div>
            <p className="font-numeric text-sm font-semibold text-on-surface">{formatCurrency(promptItem.amount)}</p>
          </div>
        </div>

        <label htmlFor="emi-source-account" className="mt-5 block text-xs font-semibold text-on-surface-variant">Pay EMI from</label>
        <select id="emi-source-account" value={selectedSourceId} onChange={event => setSelectedSourceId(event.target.value)} className="v35-focus-ring mt-2 min-h-12 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 text-sm text-on-surface">
          {paymentSources.map(account => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance)}</option>)}
        </select>

        <div className="mt-6 flex gap-2">
          <button type="button" disabled={saving} onClick={() => setDismissed(previous => new Set(previous).add(promptItem.loan.id))} className="v35-focus-ring min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50">Later</button>
          <button type="button" disabled={saving || !selectedSourceId} onClick={() => {
            setSaving(true);
            void createSchedule(promptItem.loan.id, selectedSourceId).finally(() => setSaving(false));
          }} className="v35-focus-ring min-h-11 flex-[1.4] rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-sm disabled:opacity-50">{saving ? 'Creating…' : 'Create EMI schedule'}</button>
        </div>
      </div>
    </div>
  );
}
