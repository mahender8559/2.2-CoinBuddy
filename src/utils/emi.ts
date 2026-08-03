import { safeCompute, SAFE_MATH_ERRORS } from './safeMath';
import { Account, Transaction } from '../types';

/**
 * Calculates or retrieves the original initial principal amount for a loan/liability account.
 */
export function getOriginalPrincipal(account: Account, transactions: Transaction[] = []): number {
  if (account.originalPrincipal && account.originalPrincipal > 0) {
    return account.originalPrincipal;
  }

  // Look for opening balance transaction
  const openingTx = transactions.find(
    t => (t.isOpeningBalance || t.transaction_type === 'OPENING_BALANCE') &&
         (t.account === account.id || t.fromAccountId === account.id || t.toAccountId === account.id)
  );
  if (openingTx && Math.abs(openingTx.amount) > 0) {
    return Math.abs(openingTx.amount);
  }

  const initialProp = Math.abs(Number((account as any).initialBalance ?? (account as any).openingBalance ?? 0));
  if (initialProp > 0) {
    return Math.max(initialProp, account.balance);
  }

  return account.balance;
}

/**
 * Calculates total interest paid on a loan/liability account across verified transactions.
 */
export function getTotalInterestPaid(account: Account, transactions: Transaction[] = []): number {
  return transactions
    .filter(t => 
      t.is_verified !== 0 &&
      (t.account === account.id || t.toAccountId === account.id || t.fromAccountId === account.id) &&
      t.isInterestOnly
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
}

/**
 * Utility to calculate Loan EMI Principal vs Interest splits.
 *
 * @param balance - Current balance / principal owed on the loan
 * @param annualRate - Annual interest rate (e.g. 8.5 for 8.5%)
 * @param emi - Total EMI amount
 * @returns { interestAmount: number, principalAmount: number }
 */
export function calculateEmiSplit(
  balance: number, 
  annualRate: number, 
  emi: number,
  interestType: 'REDUCING' | 'FLAT' | 'INTEREST_ONLY' = 'REDUCING',
  isPrepayment: boolean = false
) {
  const safeBalance = Math.max(0, Number(balance) || 0);
  const safeAnnualRate = Math.max(0, Number(annualRate) || 0);
  const safeEmi = Math.max(0, Number(emi) || 0);

  if (isPrepayment) {
    return {
      interestAmount: 0,
      principalAmount: Math.min(safeBalance, safeEmi)
    };
  }

  if (interestType === 'INTEREST_ONLY') {
    return {
      interestAmount: safeEmi,
      principalAmount: 0
    };
  }

  const interestRes = safeCompute(() => {
    const monthlyRate = safeAnnualRate / 12 / 100;
    return safeBalance * monthlyRate;
  }, SAFE_MATH_ERRORS.NAN);

  const interest = typeof interestRes === 'number' ? Math.round(interestRes * 100) / 100 : 0;

  const principalRes = safeCompute(() => {
    const rawPrincipal = safeEmi - interest;
    return Math.min(safeBalance, Math.max(0, rawPrincipal));
  }, SAFE_MATH_ERRORS.NAN);

  const principal = typeof principalRes === 'number' ? Math.round(principalRes * 100) / 100 : 0;

  return {
    interestAmount: interest,
    principalAmount: principal,
  };
}

/**
 * Calculates monthly or periodic EMI/interest amount based on principal, annual rate (%), tenure in months, calculation type, and frequency.
 */
export function calculateEmiAmount(
  principal: number,
  annualRate: number,
  months: number,
  type: 'REDUCING' | 'FLAT' | 'INTEREST_ONLY' = 'REDUCING',
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' = 'MONTHLY'
): number {
  const res = safeCompute(() => {
    const P = Math.max(0, Number(principal) || 0);
    const Rate = Math.max(0, Number(annualRate) || 0);
    const N = Math.max(0, Number(months) || 0);

    if (P <= 0) return 0;

    if (type === 'INTEREST_ONLY') {
      let periodicInterest = 0;
      if (frequency === 'QUARTERLY') {
        periodicInterest = P * (Rate / 400);
      } else if (frequency === 'ANNUALLY') {
        periodicInterest = P * (Rate / 100);
      } else {
        periodicInterest = P * (Rate / 1200);
      }
      return periodicInterest;
    }

    if (N <= 0) return 0;

    if (type === 'FLAT') {
      const totalInterest = P * (Rate / 100) * (N / 12);
      return (P + totalInterest) / N;
    } else {
      const r = Rate / 1200;
      if (r <= 0) {
        return P / N;
      }
      const pow = Math.pow(1 + r, N);
      return P * (r * pow) / (pow - 1);
    }
  }, SAFE_MATH_ERRORS.NAN);

  return typeof res === 'number' ? res : 0;
}


import { LoanRevision } from '../types';

export interface LoanScheduleRow {
  monthIndex: number;
  date: string;
  isoDate: string;
  emi: number;
  principalPortion: number;
  interestPortion: number;
  remainingBalance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
  activeRate: number;
  isRevised?: boolean;
}

export interface LoanScheduleResult {
  schedule: LoanScheduleRow[];
  totalPrincipal: number;
  totalInterest: number;
  totalAmount: number;
  monthlyEmi: number;
}

/**
 * Generates a full monthly amortization schedule for a loan, supporting floating rate revisions.
 *
 * @param principal - Loan principal amount
 * @param annualRate - Initial annual interest rate percentage
 * @param months - Loan tenure in months
 * @param type - 'REDUCING' | 'FLAT' | 'INTEREST_ONLY'
 * @param startDate - Optional start date string (e.g. '2026-08-01')
 * @param revisions - Optional array of floating rate revisions
 * @param frequency - 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
 */
export function generateLoanSchedule(
  principal: number,
  annualRate: number,
  months: number,
  type: 'REDUCING' | 'FLAT' | 'INTEREST_ONLY' = 'REDUCING',
  startDate?: string,
  revisions: LoanRevision[] = [],
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' = 'MONTHLY'
): LoanScheduleResult {
  const P = Math.max(0, Number(principal) || 0);
  const initialRate = Math.max(0, Number(annualRate) || 0);
  const N = Math.max(1, Math.round(Number(months) || 1));

  const start = startDate ? new Date(startDate) : new Date();
  if (isNaN(start.getTime())) {
    start.setTime(Date.now());
  }

  // Sort revisions by effectiveDate ascending
  const sortedRevisions = [...revisions].sort((a, b) => {
    const dA = new Date(a.effectiveDate).getTime() || 0;
    const dB = new Date(b.effectiveDate).getTime() || 0;
    return dA - dB;
  });

  const initialEmi = calculateEmiAmount(P, initialRate, N, type, frequency);
  const schedule: LoanScheduleRow[] = [];

  let remainingBalance = P;
  let cumInterest = 0;
  let cumPrincipal = 0;

  let activeRate = initialRate;
  let activeEmi = initialEmi;
  let activeTenure = N;
  let activeFreq = frequency;

  const maxSafetyMonths = 600; // 50 years cap
  let month = 1;

  if (type === 'INTEREST_ONLY') {
    while (month <= activeTenure && month <= maxSafetyMonths) {
      const monthDate = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
      const dateLabel = monthDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      const monthIso = monthDate.toISOString().slice(0, 10);

      // Check revision
      let currentRev: LoanRevision | null = null;
      for (const rev of sortedRevisions) {
        const revEffStr = rev.effectiveDate;
        if (revEffStr) {
          const revDate = new Date(revEffStr);
          if (monthDate.getFullYear() > revDate.getFullYear() || 
             (monthDate.getFullYear() === revDate.getFullYear() && monthDate.getMonth() >= revDate.getMonth())) {
            currentRev = rev;
          }
        }
      }

      let isRevisedThisMonth = false;
      if (currentRev) {
        const revRate = currentRev.newInterestRate ?? activeRate;
        const revEmi = currentRev.newEmi ?? activeEmi;
        const revTenure = currentRev.newTenureMonths ?? activeTenure;
        const revFreq = currentRev.paymentFrequency || activeFreq;

        if (revRate !== activeRate || revEmi !== activeEmi || revTenure !== activeTenure || revFreq !== activeFreq) {
          activeRate = revRate;
          activeFreq = revFreq;
          activeTenure = revTenure;
          activeEmi = revEmi || calculateEmiAmount(P, activeRate, activeTenure, 'INTEREST_ONLY', activeFreq);
          isRevisedThisMonth = true;
        }
      }

      const isPaymentMonth = 
        activeFreq === 'MONTHLY' ? true :
        activeFreq === 'QUARTERLY' ? (month % 3 === 0 || month === activeTenure) :
        (month % 12 === 0 || month === activeTenure);

      let iPortion = 0;
      if (isPaymentMonth) {
        const iRes = safeCompute(
          () => calculateEmiAmount(remainingBalance, activeRate, activeTenure, 'INTEREST_ONLY', activeFreq),
          SAFE_MATH_ERRORS.NAN
        );
        iPortion = typeof iRes === 'number' ? iRes : 0;
      }

      let pPortion = 0;
      let currentEmi = iPortion;

      // Single balloon payment equal to remaining balance at final Maturity Date
      if (month === activeTenure) {
        pPortion = remainingBalance;
        currentEmi = Math.round((pPortion + iPortion) * 100) / 100;
        remainingBalance = 0;
      }

      cumInterest = Math.round((cumInterest + iPortion) * 100) / 100;
      cumPrincipal = Math.round((cumPrincipal + pPortion) * 100) / 100;

      schedule.push({
        monthIndex: month,
        date: dateLabel,
        isoDate: monthIso,
        emi: currentEmi,
        principalPortion: pPortion,
        interestPortion: iPortion,
        remainingBalance,
        cumulativeInterest: cumInterest,
        cumulativePrincipal: cumPrincipal,
        activeRate,
        isRevised: isRevisedThisMonth || activeRate !== initialRate,
      });

      month++;
    }

    return {
      schedule,
      totalPrincipal: P,
      totalInterest: cumInterest,
      totalAmount: Math.round((P + cumInterest) * 100) / 100,
      monthlyEmi: initialEmi,
    };
  }

  while (remainingBalance > 0.01 && month <= maxSafetyMonths) {
    const monthDate = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
    const dateLabel = monthDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const monthIso = monthDate.toISOString().slice(0, 10);

    // Check if any revision becomes active on or before this monthDate
    let currentRev: LoanRevision | null = null;
    for (const rev of sortedRevisions) {
      const revEffStr = rev.effectiveDate;
      if (revEffStr) {
        const revDate = new Date(revEffStr);
        // Compare year and month or full timestamp
        if (monthDate.getFullYear() > revDate.getFullYear() || 
           (monthDate.getFullYear() === revDate.getFullYear() && monthDate.getMonth() >= revDate.getMonth())) {
          currentRev = rev;
        }
      }
    }

    let isRevisedThisMonth = false;
    if (currentRev) {
      const revRate = currentRev.newInterestRate ?? activeRate;
      const revEmi = currentRev.newEmi ?? activeEmi;
      const revTenure = currentRev.newTenureMonths ?? activeTenure;

      if (revRate !== activeRate || revEmi !== activeEmi || revTenure !== activeTenure) {
        activeRate = revRate;
        activeEmi = revEmi;
        activeTenure = revTenure;
        isRevisedThisMonth = true;
      }
    }

    let iPortion = 0;
    if (type === 'FLAT') {
      const totalInterest = P * (activeRate / 100) * (activeTenure / 12);
      iPortion = Math.round((totalInterest / activeTenure) * 100) / 100;
    } else {
      // REDUCING BALANCE
      const r = activeRate / 1200;
      iPortion = Math.round(remainingBalance * r * 100) / 100;
    }

    let rawP = activeEmi - iPortion;
    let pPortion = 0;
    let currentEmi = activeEmi;

    if (month >= activeTenure || rawP >= remainingBalance) {
      pPortion = remainingBalance;
      currentEmi = Math.round((pPortion + iPortion) * 100) / 100;
      remainingBalance = 0;
    } else {
      pPortion = Math.max(0, Math.round(rawP * 100) / 100);
      remainingBalance = Math.max(0, Math.round((remainingBalance - pPortion) * 100) / 100);
    }

    cumInterest = Math.round((cumInterest + iPortion) * 100) / 100;
    cumPrincipal = Math.round((cumPrincipal + pPortion) * 100) / 100;

    schedule.push({
      monthIndex: month,
      date: dateLabel,
      isoDate: monthIso,
      emi: currentEmi,
      principalPortion: pPortion,
      interestPortion: iPortion,
      remainingBalance,
      cumulativeInterest: cumInterest,
      cumulativePrincipal: cumPrincipal,
      activeRate,
      isRevised: isRevisedThisMonth || activeRate !== initialRate,
    });

    month++;
  }

  // Reconcile the final cent to the original principal. Rounding every row is
  // necessary for display, but may otherwise leave a long schedule adrift.
  const reconciliation = Math.round((P - cumPrincipal) * 100) / 100;
  if (schedule.length && Math.abs(reconciliation) >= 0.01) {
    const last = schedule[schedule.length - 1];
    last.principalPortion = Math.round((last.principalPortion + reconciliation) * 100) / 100;
    last.emi = Math.round((last.principalPortion + last.interestPortion) * 100) / 100;
    last.cumulativePrincipal = P;
    cumPrincipal = P;
  }
  const totalPrincipal = P;
  const totalInterest = cumInterest;
  const totalAmount = Math.round((totalPrincipal + totalInterest) * 100) / 100;

  return {
    schedule,
    totalPrincipal,
    totalInterest,
    totalAmount,
    monthlyEmi: initialEmi,
  };
}


