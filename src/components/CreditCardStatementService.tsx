import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { calculateCreditCardDueReminders, projectCreditCardStatement } from '../domain/creditCardStatements';
import { registerDailyCronWorker, triggerNativeNotification } from '../utils/emiReminders';

export function CreditCardStatementService() {
  const { accounts, transactions, creditCards, updateCreditCard } = useAppContext();
  const [dayTick, setDayTick] = useState(0);
  const [hasSynced, setHasSynced] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
    const timer = window.setTimeout(() => setDayTick(value => value + 1), Math.max(1000, nextMidnight.getTime() - now.getTime()));
    return () => window.clearTimeout(timer);
  }, [dayTick]);

  useEffect(() => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const now = new Date();
        for (const card of creditCards) {
          if (cancelled) return;
          const account = accounts.find(item => item.id === card.id && item.type === 'liability');
          if (!account) continue;
          const statement = projectCreditCardStatement(account, card, transactions, now);
          const dueChanged = Math.abs((Number(card.dueAmount) || 0) - statement.dueAmount) > 0.009;
          const dateChanged = card.dueDate !== statement.dueDate;
          if (!dueChanged && !dateChanged) continue;

          const result = await updateCreditCard(card.id, {
            ...card,
            balance: account.balance,
            dueAmount: statement.dueAmount,
            dueDate: statement.dueDate,
          });
          if (!result.success) console.error('Unable to sync credit-card statement:', result.error);
        }
      } catch (error) {
        console.error('Unable to sync credit-card statement:', error);
      } finally {
        syncingRef.current = false;
        if (!cancelled) setHasSynced(true);
      }
    })();

    return () => { cancelled = true; };
  }, [accounts, creditCards, transactions, updateCreditCard, dayTick]);

  useEffect(() => {
    if (!hasSynced) return;
    const runWorker = () => {
      const reminders = calculateCreditCardDueReminders(creditCards);
      if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
      for (const reminder of reminders) {
        const key = `push_sent_${reminder.id}`;
        if (localStorage.getItem(key)) continue;
        triggerNativeNotification(reminder.title, reminder.body);
        localStorage.setItem(key, 'true');
      }
    };

    runWorker();
    return registerDailyCronWorker(runWorker);
  }, [creditCards, hasSynced]);

  return null;
}
