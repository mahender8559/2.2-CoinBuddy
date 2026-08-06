export type CycleDetails = {
  month: number;
  year: number;
  key: string;
};

export type CycleRange = {
  start: Date;
  end: Date;
};

const normalizeCycleDay = (monthCycleDay: number) =>
  Math.min(31, Math.max(1, Math.trunc(Number(monthCycleDay) || 1)));

const clampDayToMonth = (year: number, month: number, day: number) =>
  Math.min(day, new Date(year, month + 1, 0).getDate());

export function shiftCycle(year: number, month: number, offset: number): { year: number; month: number } {
  const shifted = new Date(year, month + offset, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() };
}

export function getCycleDetailsForDay(dateString: string, monthCycleDay: number): CycleDetails {
  const txDate = new Date(dateString);
  let year = txDate.getFullYear();
  let month = txDate.getMonth();
  const configuredDay = normalizeCycleDay(monthCycleDay);
  const effectiveDay = clampDayToMonth(year, month, configuredDay);

  if (configuredDay > 1 && txDate.getDate() >= effectiveDay) {
    const nextCycle = shiftCycle(year, month, 1);
    year = nextCycle.year;
    month = nextCycle.month;
  }

  return { month, year, key: `${year}-${month}` };
}

export function getCycleRange(year: number, month: number, monthCycleDay: number): CycleRange {
  const configuredDay = normalizeCycleDay(monthCycleDay);

  if (configuredDay === 1) {
    return {
      start: new Date(year, month, 1, 0, 0, 0, 0),
      end: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }

  const previousCycle = shiftCycle(year, month, -1);
  const startDay = clampDayToMonth(previousCycle.year, previousCycle.month, configuredDay);
  const nextCycleStartDay = clampDayToMonth(year, month, configuredDay);
  const start = new Date(previousCycle.year, previousCycle.month, startDay, 0, 0, 0, 0);
  const nextCycleStart = new Date(year, month, nextCycleStartDay, 0, 0, 0, 0);

  return { start, end: new Date(nextCycleStart.getTime() - 1) };
}
