import { useMemo, useState } from 'react';
import { Bot, CalendarClock, CheckCircle2, CreditCard, Landmark, PiggyBank, ShieldCheck } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { isLiquidCashAccount } from '../domain/affordability';
import { buildAutomationCandidates, buildManagedRecurringTransaction, type ManagedAutomationCandidate } from '../domain/automation';

function candidateIcon(kind: ManagedAutomationCandidate['kind']) {
  if (kind === 'CREDIT_CARD_STATEMENT') return CreditCard;
  if (kind === 'GOAL_CONTRIBUTION') return PiggyBank;
  return Landmark;
}

function candidateLabel(kind: ManagedAutomationCandidate['kind']): string {
  if (kind === 'CREDIT_CARD_STATEMENT') return 'Card statement';
  if (kind === 'GOAL_CONTRIBUTION') return 'Goal contribution';
  return 'Loan EMI';
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AutomationCenter() {
  const { accounts, creditCards, savingsGoals, recurringRules, addTransaction, formatCurrency } = useAppContext();
  const [fundingByKey, setFundingByKey] = useState<Record<string, string>>({});
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const fundingAccounts = useMemo(() => accounts.filter(account => account.is_archived !== 1 && isLiquidCashAccount(account)), [accounts]);
  const candidates = useMemo(() => buildAutomationCandidates({ accounts, creditCards, savingsGoals, recurringRules }), [accounts, creditCards, savingsGoals, recurringRules]);

  const createSchedule = async (candidate: ManagedAutomationCandidate) => {
    const sourceAccountId = fundingByKey[candidate.key];
    if (!sourceAccountId) {
      setMessage({ tone: 'error', text: 'Choose the account that will fund this schedule.' });
      return;
    }
    setCreatingKey(candidate.key);
    setMessage(null);
    try {
      const template = buildManagedRecurringTransaction(candidate, sourceAccountId, accounts);
      const result = await addTransaction(template);
      if (!result.success) throw new Error(result.error || 'The managed schedule could not be saved.');
      setMessage({ tone: 'success', text: `${candidate.title} is scheduled. Due occurrences will wait for your confirmation before changing balances.` });
      setFundingByKey(previous => ({ ...previous, [candidate.key]: '' }));
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'The managed schedule could not be created.' });
    } finally {
      setCreatingKey(null);
    }
  };

  return (
    <section data-testid="automation-center" aria-labelledby="automation-center-title">
      <div className="mb-2 px-1">
        <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /><h2 id="automation-center-title" className="text-sm font-semibold text-on-surface">Automation Center</h2></div>
        <p className="mt-0.5 text-xs text-on-surface-variant">Create confirmation-first schedules from the financial data you already maintain.</p>
      </div>

      <div className="v35-surface overflow-hidden rounded-2xl">
        <div className="flex items-start gap-3 border-b border-outline-variant/20 p-4 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-on-surface">You stay in control</p>
            <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">Automation creates pending occurrences only. No loan payment, card payment, or Goal contribution changes a balance until you confirm it.</p>
          </div>
        </div>

        {message ? <div role="status" className={`mx-4 mt-4 rounded-xl border px-3 py-2.5 text-xs sm:mx-5 ${message.tone === 'success' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-error/25 bg-error/10 text-error'}`}>{message.text}</div> : null}

        {candidates.length === 0 ? (
          <div className="flex items-start gap-3 p-4 sm:px-5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div><p className="text-sm font-semibold text-on-surface">Automation is up to date</p><p className="mt-1 text-xs leading-5 text-on-surface-variant">No eligible unscheduled EMI, card statement, or Goal contribution is waiting for setup. Existing manual schedules are respected and never duplicated.</p></div>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/20">
            {candidates.map(candidate => {
              const Icon = candidateIcon(candidate.kind);
              const selectedFunding = fundingByKey[candidate.key] ?? '';
              return (
                <article key={candidate.key} data-testid={`automation-candidate-${candidate.key}`} className="p-4 sm:px-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-primary"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 truncate text-sm font-semibold text-on-surface">{candidate.title}</p><span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{candidateLabel(candidate.kind)}</span></div>
                      <p className="mt-1 text-xs leading-5 text-on-surface-variant">{candidate.description}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant"><span className="font-numeric font-semibold text-on-surface">{formatCurrency(candidate.amount)}</span><span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{formatDate(candidate.nextDueDate)} · {candidate.frequency.toLowerCase()}</span></div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select
                      data-testid={`automation-funding-${candidate.key}`}
                      aria-label={`Funding account for ${candidate.title}`}
                      value={selectedFunding}
                      onChange={event => setFundingByKey(previous => ({ ...previous, [candidate.key]: event.target.value }))}
                      className="v35-focus-ring min-h-11 w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 text-sm text-on-surface"
                    >
                      <option value="">Choose funding account</option>
                      {fundingAccounts.filter(account => account.id !== candidate.destinationAccountId).map(account => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance)}</option>)}
                    </select>
                    <button
                      type="button"
                      data-testid={`automation-create-${candidate.key}`}
                      disabled={!selectedFunding || creatingKey === candidate.key}
                      onClick={() => { void createSchedule(candidate); }}
                      className="v35-focus-ring min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {creatingKey === candidate.key ? 'Creating…' : 'Create schedule'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {fundingAccounts.length === 0 && candidates.length > 0 ? <div className="border-t border-outline-variant/20 px-4 py-3 text-xs leading-5 text-[var(--cb-amber)] sm:px-5">Add an active cash or bank account before creating managed payment schedules.</div> : null}
      </div>
    </section>
  );
}
