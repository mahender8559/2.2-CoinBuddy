import { Account, Transaction } from '../types';
import { buildPendingConfirmationSummary } from '../domain/automation';

export interface EmiNotification {
  id: string;
  type: 'UPCOMING_EMI' | 'MISSED_EMI' | 'PENDING_CONFIRMATION';
  accountId: string;
  accountName: string;
  title: string;
  body: string;
  dueDate: Date;
  dueDateFormatted: string;
  monthlyEmi: number;
  lateFeeFixedAmount: number;
  lateFeeInterestRate: number;
  gracePeriodDays: number;
  daysRemainingOrOverdue: number; // positive = days until due, negative = days overdue
  isPaid: boolean;
}

/**
  * Evaluates active loans against transactions to verify if the EMI has been paid for the current cycle.
  * Generates advisory and urgent advocate notifications for unpaid upcoming or overdue EMIs,
  * plus a reminder when scheduled transactions are waiting for explicit confirmation.
  */
export function calculateEmiReminders(
  accounts: Account[],
  transactions: Transaction[]
): EmiNotification[] {
  const notifications: EmiNotification[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Filter active loans (liabilities that are bank loans / loans / mortgages or have an EMI amount)
  const activeLoans = accounts.filter(acc => {
    if (acc.is_archived === 1 || acc.type !== 'liability') return false;
    const isLoanGroup = acc.group === 'Bank Loan' || acc.group === 'Loan' || acc.group === 'Mortgage' || acc.group === 'Personal Loan';
    const emi = acc.monthlyEMI ?? acc.monthlyEMI ?? 0;
    return (isLoanGroup || emi > 0) && acc.balance > 0;
  });

  for (const loan of activeLoans) {
    const emiAmount = loan.monthlyEMI ?? loan.monthlyEMI ?? 0;
    
    // Determine due date for current month
    const dateStr = loan.nextEMIDate || loan.loanStartDate || loan.loanStartDate || '';
    let dueDay = 5; // default fallback day
    if (dateStr) {
      const parts = dateStr.split('-');
      if (parts.length >= 3) {
        const parsedDay = parseInt(parts[2], 10);
        if (!isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
          dueDay = parsedDay;
        }
      }
    }

    // Construct due date for current calendar month
    const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);

    // Check if an EMI transaction has been recorded for this loan in the current month
    const isPaid = transactions.some(t => {
      if (t.is_verified === 0) return false;
      
      const txDate = new Date(t.date);
      const isSameMonth = txDate.getMonth() === today.getMonth() && txDate.getFullYear() === today.getFullYear();
      if (!isSameMonth) return false;

      // Check if transaction is associated with this loan account
      const isDirectAcc = t.fromAccountId === loan.id || t.toAccountId === loan.id || t.account === loan.id;
      const txTitleLower = (t.title || '').toLowerCase();
      const txSubLower = (t.subtitle || '').toLowerCase();
      const loanNameLower = loan.name.toLowerCase();

      const isNameMentioned = txTitleLower.includes(loanNameLower) || txSubLower.includes(loanNameLower);
      const isEmiMention = txTitleLower.includes('emi') || txSubLower.includes('emi');

      return (isDirectAcc || (isNameMentioned && isEmiMention)) && (t.type === 'expense' || t.type === 'transfer');
    });

    if (isPaid) continue;

    // Calculate day difference: positive = future days, negative = past days
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    const fixedPenalty = loan.lateFeeFixedAmount ?? loan.lateFeeFixedAmount ?? 500;
    const ratePenalty = loan.lateFeeInterestRate ?? loan.lateFeeInterestRate ?? 2.0;
    const graceDays = loan.gracePeriodDays ?? loan.gracePeriodDays ?? 0;

    const formattedDueDate = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const formattedEmi = emiAmount.toLocaleString('en-IN');
    const formattedFixed = fixedPenalty.toLocaleString('en-IN');

    // Scenario 1: Upcoming EMI (targetDate = today + 3 days)
    if (diffDays >= 0 && diffDays <= 3) {
      notifications.push({
        id: `notif_upcoming_${loan.id}_${today.getFullYear()}_${today.getMonth()}`,
        type: 'UPCOMING_EMI',
        accountId: loan.id,
        accountName: loan.name,
        title: `⚠️ Upcoming EMI: ${loan.name}`,
        body: `Friendly reminder: Your ₹${formattedEmi} EMI is due on ${formattedDueDate}. Paying on time saves you from a potential ₹${formattedFixed} penalty and protects your credit score!`,
        dueDate,
        dueDateFormatted: formattedDueDate,
        monthlyEmi: emiAmount,
        lateFeeFixedAmount: fixedPenalty,
        lateFeeInterestRate: ratePenalty,
        gracePeriodDays: graceDays,
        daysRemainingOrOverdue: diffDays,
        isPaid: false
      });
    } 
    // Scenario 2: Missed/Pending Verification EMI (dueDate < today)
    else if (diffDays < 0) {
      notifications.push({
        id: `notif_missed_${loan.id}_${today.getFullYear()}_${today.getMonth()}`,
        type: 'MISSED_EMI',
        accountId: loan.id,
        accountName: loan.name,
        title: `⚠️ Action Required: ${loan.name} EMI`,
        body: `It looks like your EMI wasn't logged. If this is unpaid, your bank may apply a penalty of ₹${formattedFixed} + ${ratePenalty}% interest. Tap to mark as paid or update your balance.`, 
        dueDate,
        dueDateFormatted: formattedDueDate,
        monthlyEmi: emiAmount,
        lateFeeFixedAmount: fixedPenalty,
        lateFeeInterestRate: ratePenalty,
        gracePeriodDays: graceDays,
        daysRemainingOrOverdue: diffDays,
        isPaid: false
      });
    }
  }

  const pending = buildPendingConfirmationSummary(transactions, todayKey);
  if (pending.actionableCount > 0) {
    const oldestKey = pending.oldestDueDate ?? todayKey;
    const oldestDate = new Date(`${oldestKey}T12:00:00`);
    const detail = [
      pending.overdueCount > 0 ? `${pending.overdueCount} overdue` : '',
      pending.dueTodayCount > 0 ? `${pending.dueTodayCount} due today` : '',
    ].filter(Boolean).join(' · ');
    notifications.push({
      id: `notif_pending_confirmations_${todayKey}`,
      type: 'PENDING_CONFIRMATION',
      accountId: 'scheduled-confirmations',
      accountName: 'Scheduled confirmations',
      title: `⏳ ${pending.actionableCount} scheduled ${pending.actionableCount === 1 ? 'entry needs' : 'entries need'} confirmation`,
      body: `${detail}. Open CoinBuddy to confirm, edit, or reject these scheduled entries. Pending entries do not affect balances.`,
      dueDate: oldestDate,
      dueDateFormatted: oldestDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      monthlyEmi: 0,
      lateFeeFixedAmount: 0,
      lateFeeInterestRate: 0,
      gracePeriodDays: 0,
      daysRemainingOrOverdue: Math.min(0, Math.round((oldestDate.getTime() - today.getTime()) / (1000 * 3600 * 24))),
      isPaid: false,
    });
  }

  return notifications;
}

/**
  * Sets up the daily 09:00 AM worker timer.
  * Executes the provided callback function at 09:00 AM every local calendar day.
  */
export function registerDailyCronWorker(onTrigger: () => void): () => void {
  function scheduleNextRun() {
    const now = new Date();
    const next9AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);

    // If it's already past 09:00 AM today, schedule for 09:00 AM tomorrow
    if (now.getTime() >= next9AM.getTime()) {
      next9AM.setDate(next9AM.getDate() + 1);
    }

    const delay = next9AM.getTime() - now.getTime();

    const timerId = setTimeout(() => {
      onTrigger();
      // Schedule subsequent runs every 24 hours
      intervalId = setInterval(onTrigger, 24 * 60 * 60 * 1000);
    }, delay);

    return timerId;
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const timerId = scheduleNextRun();

  // Return cleanup function
  return () => {
    clearTimeout(timerId);
    if (intervalId) clearInterval(intervalId);
  };
}

function stableNotificationTag(title: string, body: string): string {
  const value = `${title}\u0000${body}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `coinbuddy-${(hash >>> 0).toString(36)}`;
}

/**
  * Attempts to dispatch a Web Native Push Notification if permitted.
  */
export function triggerNativeNotification(title: string, body: string, tag = stableNotificationTag(title, body)) {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag
      });
    } catch (e) {
      console.warn('Native notification dispatch prevented:', e);
    }
  }
}