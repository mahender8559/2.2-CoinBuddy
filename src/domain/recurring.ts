import type { RecurrenceFrequency } from '../types';

export function toLocalDateKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(dateKey: string): { year: number; monthIndex: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid recurring date: ${dateKey}`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const candidate = new Date(year, monthIndex, day, 12, 0, 0);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== monthIndex ||
    candidate.getDate() !== day
  ) {
    throw new Error(`Invalid recurring date: ${dateKey}`);
  }
  return { year, monthIndex, day };
}

function monthsForFrequency(frequency: RecurrenceFrequency): number {
  if (frequency === 'ANNUALLY') return 12;
  if (frequency === 'QUARTERLY') return 3;
  return 1;
}

/**
 * Advances a schedule while retaining the original day-of-month anchor.
 * Example: Jan 31 -> Feb 28 -> Mar 31, instead of drifting to Mar 28.
 */
export function advanceRecurringDate(
  dateKey: string,
  frequency: RecurrenceFrequency,
  anchorDay?: number,
): string {
  const { year, monthIndex, day } = parseDateKey(dateKey);
  const target = new Date(year, monthIndex + monthsForFrequency(frequency), 1, 12, 0, 0);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12, 0, 0).getDate();
  const requestedDay = Math.min(31, Math.max(1, Math.round(anchorDay ?? day)));
  const clampedDay = Math.min(requestedDay, lastDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function shouldCreateInitialOccurrence(startDateKey: string, today = new Date()): boolean {
  return startDateKey <= toLocalDateKey(today);
}
