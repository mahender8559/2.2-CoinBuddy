import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, CreditCard } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { calculateCreditCardDueReminders } from '../domain/creditCardStatements';

export function CreditCardDueBanner() {
  const { creditCards, setPayCardModalState, formatCurrency } = useAppContext();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dayTick, setDayTick] = useState(0);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
    const timer = window.setTimeout(() => setDayTick(value => value + 1), Math.max(1000, nextMidnight.getTime() - now.getTime()));
    return () => window.clearTimeout(timer);
  }, [dayTick]);

  const reminders = useMemo(() => calculateCreditCardDueReminders(creditCards), [creditCards, dayTick]);
  const visible = reminders.filter(reminder => !dismissedIds.has(reminder.id));

  if (visible.length === 0) return null;

  return (
    <div className="mb-4 space-y-3 animate-fade-in" data-testid="credit-card-due-reminders">
      {visible.map(reminder => {
        const overdue = reminder.type === 'MISSED_CARD_DUE';
        return (
          <div
            key={reminder.id}
            className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${overdue ? 'border-rose-500/30 bg-rose-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}
          >
            <div className="pointer-events-none absolute -bottom-5 -right-5 opacity-5">
              <CreditCard className="h-28 w-28" />
            </div>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 shrink-0 rounded-xl p-2.5 ${overdue ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                {overdue ? <AlertTriangle className="h-5 w-5" /> : <CalendarCheck className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1 pr-2">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold tracking-tight text-on-surface">{reminder.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${overdue ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {overdue ? `${Math.abs(reminder.daysRemainingOrOverdue)} days overdue` : reminder.daysRemainingOrOverdue === 0 ? 'Due today' : `${reminder.daysRemainingOrOverdue} days away`}
                  </span>
                </div>
                <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">{reminder.body}</p>
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant/10 bg-surface-container/60 p-2.5 text-[11px] font-medium text-on-surface-variant/80">
                  <div>Statement due: <span className="font-numeric font-bold text-on-surface">{formatCurrency(reminder.amount)}</span></div>
                  <span className="text-outline-variant">•</span>
                  <div>Due date: <span className="font-bold text-on-surface">{reminder.dueDateFormatted}</span></div>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setPayCardModalState({ isOpen: true, cardId: reminder.cardId })}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-transform active:scale-95 ${overdue ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-600 hover:bg-amber-500'}`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Pay / Confirm Payment
                    <ArrowRight className="ml-0.5 h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedIds(previous => new Set(previous).add(reminder.id))}
                    className="rounded-xl px-2.5 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    Snooze
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
