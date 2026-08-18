import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { calculateEmiReminders, triggerNativeNotification, EmiNotification } from '../utils/emiReminders';
import { ShieldAlert, CheckCircle2, ArrowRight, AlertTriangle, CalendarCheck } from 'lucide-react';
import { CreditCardDueBanner } from './CreditCardDueBanner';

export function EmiAdvocateBanner() {
  const { accounts, transactions, setPayCardModalState } = useAppContext();
  const [notifications, setNotifications] = useState<EmiNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const activeNotifs = calculateEmiReminders(accounts, transactions);
    setNotifications(activeNotifs);

    // If native push notifications are granted, trigger push for missed/upcoming items
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      activeNotifs.forEach(notif => {
        const key = `push_sent_${notif.id}`;
        if (!localStorage.getItem(key)) {
          triggerNativeNotification(notif.title, notif.body);
          localStorage.setItem(key, 'true');
        }
      });
    }
  }, [accounts, transactions]);

  const visibleNotifs = notifications.filter(n => !dismissedIds.has(n.id));

  if (visibleNotifs.length === 0) return <CreditCardDueBanner />;

  return (
    <>
      <CreditCardDueBanner />
      <div className="space-y-3 mb-4 animate-fade-in">
        {visibleNotifs.map(notif => {
          const isMissed = notif.type === 'MISSED_EMI';

          return (
            <div 
              key={notif.id}
              className={`rounded-2xl p-4 border shadow-sm transition-all relative overflow-hidden ${
                isMissed 
                  ? 'bg-rose-500/10 border-rose-500/30 text-on-surface' 
                  : 'bg-amber-500/10 border-amber-500/30 text-on-surface'
              }`}
            >
              {/* Background accent icon */}
              <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                <ShieldAlert className="w-28 h-28" />
              </div>

              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                  isMissed ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {isMissed ? <AlertTriangle className="w-5 h-5" /> : <CalendarCheck className="w-5 h-5" />}
                </div>

                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-bold tracking-tight text-on-surface flex items-center gap-1.5">
                      {notif.title}
                    </h3>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isMissed ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {isMissed ? 'Overdue / Unverified' : `${notif.daysRemainingOrOverdue} Days Away`}
                    </span>
                  </div>

                  <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
                    {notif.body}
                  </p>

                  {/* Financial Advocate Penalty Specs */}
                  <div className="flex items-center gap-3 text-[11px] font-medium text-on-surface-variant/80 bg-surface-container/60 rounded-xl p-2.5 mb-3 border border-outline-variant/10 flex-wrap">
                    <div>
                      Fixed Late Fee: <span className="font-bold text-on-surface font-numeric">₹{notif.lateFeeFixedAmount}</span>
                    </div>
                    <span className="text-outline-variant">•</span>
                    <div>
                      Overdue Rate: <span className="font-bold text-on-surface font-numeric">{notif.lateFeeInterestRate}% / mo</span>
                    </div>
                    {notif.gracePeriodDays > 0 && (
                      <>
                        <span className="text-outline-variant">•</span>
                        <div>
                          Grace: <span className="font-bold text-on-surface font-numeric">{notif.gracePeriodDays} Days</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      onClick={() => setPayCardModalState({ isOpen: true, cardId: notif.accountId })}
                      className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl text-white shadow-sm transition-transform active:scale-95 ${
                        isMissed ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-600 hover:bg-amber-500'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark as Paid / Pay EMI
                      <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>

                    <button
                      onClick={() => setDismissedIds(prev => new Set(prev).add(notif.id))}
                      className="text-xs font-medium text-on-surface-variant hover:text-on-surface px-2.5 py-2 rounded-xl transition-colors"
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
    </>
  );
}
