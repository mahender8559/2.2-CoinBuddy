import type { Account, CreditCardInfo, Transaction } from '../types';
import { applyTransactionEffect, calculateLedgerBalance } from './ledgerRules';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreditCardStatementProjection {
  closeDate: string;
  cutoffMs: number;
  dueDate: string;
  statementBalance: number;
  dueAmount: number;
}

export interface CreditCardDueReminder {
  id: string;
  type: 'UPCOMING_CARD_DUE' | 'MISSED_CARD_DUE';
  cardId: string;
  cardName: string;
  amount: number;
  dueDate: Date;
  dueDateFormatted: string;
  daysRemainingOrOverdue: number;
  title: string;
  body: string;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function clampDay(year: number, month: number, day: number): number {
  const normalized = Math.min(31, Math.max(1, Math.trunc(Number(day) || 1)));
  return Math.min(normalized, daysInMonth(year, month));
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function configuredDueDay(card: Pick<CreditCardInfo, 'dueDate'>): number {
  const day = Number.parseInt(String(card.dueDate || '').split('-')[2] || '', 10);
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1;
}

/**
 * The billing-cycle day stays open through 23:59:59.999 local time. The statement
 * becomes closed at 00:00 on the following local day.
 */
export function getLatestClosedCreditCardCycle(
  billingCycleDay: number,
  now = new Date(),
): { closeDate: string; cutoffMs: number } {
  const cycleDay = Math.min(31, Math.max(1, Math.trunc(Number(billingCycleDay) || 1)));
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentCloseDay = clampDay(currentYear, currentMonth, cycleDay);
  const currentCloseBoundary = new Date(currentYear, currentMonth, currentCloseDay + 1, 0, 0, 0, 0);

  let year = currentYear;
  let month = currentMonth;
  if (now.getTime() < currentCloseBoundary.getTime()) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }

  const closeDay = clampDay(year, month, cycleDay);
  const closeDate = new Date(year, month, closeDay, 0, 0, 0, 0);
  const nextDay = new Date(year, month, closeDay + 1, 0, 0, 0, 0);
  return { closeDate: toLocalDateKey(closeDate), cutoffMs: nextDay.getTime() - 1 };
}

/** The configured due date is treated as the card's recurring due-day anchor. */
export function getCreditCardStatementDueDate(closeDateKey: string, card: Pick<CreditCardInfo, 'dueDate'>): string {
  const [yearText, monthText, dayText] = closeDateKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const closeDay = Number(dayText);
  const dueDay = configuredDueDay(card);

  let dueYear = year;
  let dueMonth = month;
  let candidateDay = clampDay(dueYear, dueMonth, dueDay);
  let candidate = new Date(dueYear, dueMonth, candidateDay, 0, 0, 0, 0);
  const close = new Date(year, month, closeDay, 0, 0, 0, 0);

  if (candidate.getTime() <= close.getTime()) {
    dueMonth += 1;
    if (dueMonth > 11) {
      dueMonth = 0;
      dueYear += 1;
    }
    candidateDay = clampDay(dueYear, dueMonth, dueDay);
    candidate = new Date(dueYear, dueMonth, candidateDay, 0, 0, 0, 0);
  }

  return toLocalDateKey(candidate);
}

/**
 * Freezes the balance that existed at statement close, then subtracts only
 * liability-reducing ledger entries made after close. New card spending belongs
 * to the next statement and therefore does not increase the current due amount.
 */
export function projectCreditCardStatement(
  account: Account,
  card: CreditCardInfo,
  transactions: Transaction[],
  now = new Date(),
): CreditCardStatementProjection {
  const cycle = getLatestClosedCreditCardCycle(card.billingCycleDay, now);
  const nowMs = now.getTime();
  const throughClose = transactions.filter(transaction => {
    const timestamp = new Date(transaction.date).getTime();
    return Number.isFinite(timestamp) && timestamp <= cycle.cutoffMs;
  });
  const statementBalance = Math.max(0, roundMoney(calculateLedgerBalance(account, throughClose)));

  const reductionsAfterClose = transactions.reduce((sum, transaction) => {
    const timestamp = new Date(transaction.date).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= cycle.cutoffMs || timestamp > nowMs) return sum;
    const effect = applyTransactionEffect(transaction, account);
    return effect < 0 ? sum + Math.abs(effect) : sum;
  }, 0);

  return {
    closeDate: cycle.closeDate,
    cutoffMs: cycle.cutoffMs,
    dueDate: getCreditCardStatementDueDate(cycle.closeDate, card),
    statementBalance,
    dueAmount: Math.max(0, roundMoney(statementBalance - reductionsAfterClose)),
  };
}

export function calculateCreditCardDueReminders(
  cards: CreditCardInfo[],
  now = new Date(),
): CreditCardDueReminder[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const reminders: CreditCardDueReminder[] = [];

  for (const card of cards) {
    const amount = Math.max(0, Number(card.dueAmount) || 0);
    if (amount <= 0 || !card.dueDate) continue;
    const parts = card.dueDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some(value => !Number.isFinite(value))) continue;
    const dueDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
    if (!Number.isFinite(dueDate.getTime())) continue;

    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / DAY_MS);
    if (diffDays > 3) continue;
    const formatted = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const amountText = amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    const missed = diffDays < 0;
    reminders.push({
      id: `${missed ? 'card_missed' : 'card_upcoming'}_${card.id}_${card.dueDate}`,
      type: missed ? 'MISSED_CARD_DUE' : 'UPCOMING_CARD_DUE',
      cardId: card.id,
      cardName: card.name,
      amount,
      dueDate,
      dueDateFormatted: formatted,
      daysRemainingOrOverdue: diffDays,
      title: missed ? `Credit card payment overdue: ${card.name}` : `Credit card payment due: ${card.name}`,
      body: missed
        ? `Your ₹${amountText} statement payment was due on ${formatted}. Confirm or record the payment in CoinBuddy.`
        : `Your ₹${amountText} statement payment is due on ${formatted}. Pay or confirm it in CoinBuddy.`,
    });
  }

  return reminders;
}
