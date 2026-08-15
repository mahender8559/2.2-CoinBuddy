import type { Account, CreditCardInfo, RecurringRule, SavingsGoal, Transaction } from '../types';
import { isLiquidCashAccount } from './affordability';
import { getGoalCurrentAmount, getRequiredMonthlyContribution } from './savingsGoals';
import { buildUpcomingMoneyProjection, type UpcomingMoneyItem } from './upcomingMoney';

export type ForecastHorizon = 7 | 30 | 90;

export interface CashFlowForecast {
  horizonDays: ForecastHorizon;
  openingLiquidCash: number;
  expectedIncome: number;
  expectedOutflow: number;
  closingLiquidCash: number;
  lowestBalance: number;
  shortageDate?: string;
  shortageAmount: number;
  items: UpcomingMoneyItem[];
}

export interface GoalFeasibilityForecast {
  goalId: string;
  name: string;
  currentAmount: number;
  remainingAmount: number;
  plannedMonthlyContribution: number;
  requiredMonthlyContribution: number;
  projectedCompletionDate?: string;
  feasibleByTarget: boolean;
}

export interface MoneyPosition {
  liquidCash: number;
  investedWealth: number;
  physicalWealth: number;
  committedNext30Days: number;
  availableToSpend: number;
}

export interface SmarterPlanningReport {
  forecasts: Record<ForecastHorizon, CashFlowForecast>;
  goals: GoalFeasibilityForecast[];
  moneyPosition: MoneyPosition;
  warnings: string[];
}

export interface SmarterPlanningInput {
  asOfDate: string;
  accounts: Account[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  creditCards: CreditCardInfo[];
  savingsGoals: SavingsGoal[];
}

export interface DebtPrepaymentResult {
  eligible: boolean;
  baselineMonths: number;
  acceleratedMonths: number;
  monthsSaved: number;
  baselineInterest: number;
  acceleratedInterest: number;
  interestSaved: number;
  warning?: string;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function cashEffect(item: UpcomingMoneyItem, liquidIds: Set<string>, accountMap: Map<string, Account>): number {
  if (item.kind === 'INCOME') return !item.toAccountId || liquidIds.has(item.toAccountId) ? item.amount : 0;
  if (item.kind === 'OBLIGATION' || item.kind === 'SAVINGS') return !item.fromAccountId || liquidIds.has(item.fromAccountId) ? -item.amount : 0;
  const fromLiquid = Boolean(item.fromAccountId && liquidIds.has(item.fromAccountId));
  const toLiquid = Boolean(item.toAccountId && liquidIds.has(item.toAccountId));
  if (fromLiquid === toLiquid) return 0;
  if (fromLiquid) return -item.amount;
  if (toLiquid && item.fromAccountId && accountMap.has(item.fromAccountId)) return item.amount;
  return 0;
}

function forecast(input: SmarterPlanningInput, horizonDays: ForecastHorizon): CashFlowForecast {
  const endDate = addDays(input.asOfDate, horizonDays);
  const projection = buildUpcomingMoneyProjection({ ...input, startDate: input.asOfDate, endDate });
  const liquidAccounts = input.accounts.filter(account => account.type === 'asset' && account.is_archived !== 1 && isLiquidCashAccount(account));
  const liquidIds = new Set(liquidAccounts.map(account => account.id));
  const accountMap = new Map(input.accounts.map(account => [account.id, account]));
  const openingLiquidCash = liquidAccounts.reduce((sum, account) => sum + Math.max(0, Number(account.balance) || 0), 0);
  let running = openingLiquidCash;
  let lowestBalance = openingLiquidCash;
  let shortageDate: string | undefined;
  let expectedIncome = 0;
  let expectedOutflow = 0;
  for (const item of projection.items) {
    const effect = cashEffect(item, liquidIds, accountMap);
    running += effect;
    if (effect > 0) expectedIncome += effect;
    if (effect < 0) expectedOutflow += Math.abs(effect);
    if (running < lowestBalance) lowestBalance = running;
    if (!shortageDate && running < 0) shortageDate = item.date;
  }
  return {
    horizonDays,
    openingLiquidCash,
    expectedIncome,
    expectedOutflow,
    closingLiquidCash: running,
    lowestBalance,
    shortageDate,
    shortageAmount: Math.max(0, -lowestBalance),
    items: projection.items,
  };
}

function projectedGoalDate(asOfDate: string, remaining: number, monthlyContribution: number): string | undefined {
  if (remaining <= 0) return asOfDate;
  if (monthlyContribution <= 0) return undefined;
  const months = Math.ceil(remaining / monthlyContribution);
  const date = new Date(`${asOfDate}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return dateKey(date);
}

export function buildSmarterPlanningReport(input: SmarterPlanningInput): SmarterPlanningReport {
  const forecasts = {
    7: forecast(input, 7),
    30: forecast(input, 30),
    90: forecast(input, 90),
  } as Record<ForecastHorizon, CashFlowForecast>;

  const goals = input.savingsGoals.filter(goal => goal.isActive).map(goal => {
    const currentAmount = getGoalCurrentAmount(goal, input.accounts, input.transactions);
    const remainingAmount = Math.max(0, goal.targetAmount - currentAmount);
    const requiredMonthlyContribution = getRequiredMonthlyContribution(goal, input.accounts, input.transactions, new Date(`${input.asOfDate}T12:00:00`));
    return {
      goalId: goal.id,
      name: goal.name,
      currentAmount,
      remainingAmount,
      plannedMonthlyContribution: Math.max(0, goal.monthlyContribution),
      requiredMonthlyContribution,
      projectedCompletionDate: projectedGoalDate(input.asOfDate, remainingAmount, goal.monthlyContribution),
      feasibleByTarget: !goal.targetDate || remainingAmount <= 0 || goal.monthlyContribution + 0.005 >= requiredMonthlyContribution,
    };
  });

  let liquidCash = 0;
  let investedWealth = 0;
  let physicalWealth = 0;
  for (const account of input.accounts) {
    if (account.type !== 'asset' || account.is_archived === 1) continue;
    const balance = Math.max(0, Number(account.balance) || 0);
    const group = String(account.group ?? '').toLowerCase();
    if (isLiquidCashAccount(account)) liquidCash += balance;
    else if (group.includes('investment')) investedWealth += balance;
    else physicalWealth += balance;
  }
  const committedNext30Days = forecasts[30].expectedOutflow;
  const availableToSpend = Math.max(0, forecasts[30].closingLiquidCash);
  const warnings = [7, 30, 90].flatMap(days => {
    const item = forecasts[days as ForecastHorizon];
    return item.shortageDate ? [`Cash shortage of ${item.shortageAmount.toFixed(2)} projected by ${item.shortageDate} within the next ${days} days.`] : [];
  });
  for (const goal of goals) if (!goal.feasibleByTarget) warnings.push(`${goal.name} needs a higher monthly contribution to reach its target date.`);

  return { forecasts, goals, moneyPosition: { liquidCash, investedWealth, physicalWealth, committedNext30Days, availableToSpend }, warnings: [...new Set(warnings)] };
}

export function simulatePurchaseAcrossHorizons(report: SmarterPlanningReport, purchaseAmount: number): Record<ForecastHorizon, { closingLiquidCash: number; shortageAmount: number }> {
  const amount = Math.max(0, Number(purchaseAmount) || 0);
  return Object.fromEntries(([7, 30, 90] as ForecastHorizon[]).map(days => {
    const projection = report.forecasts[days];
    return [days, { closingLiquidCash: projection.closingLiquidCash - amount, shortageAmount: Math.max(0, amount - projection.lowestBalance) }];
  })) as Record<ForecastHorizon, { closingLiquidCash: number; shortageAmount: number }>;
}

function amortize(principal: number, annualRate: number, monthlyPayment: number): { months: number; interest: number; repaid: boolean } {
  let balance = Math.max(0, principal);
  const rate = Math.max(0, annualRate) / 1200;
  let interest = 0;
  let months = 0;
  while (balance > 0.005 && months < 1200) {
    const interestPart = balance * rate;
    if (monthlyPayment <= interestPart + 0.005) return { months, interest, repaid: false };
    interest += interestPart;
    balance = Math.max(0, balance + interestPart - monthlyPayment);
    months += 1;
  }
  return { months, interest, repaid: balance <= 0.005 };
}

export function compareDebtPrepayment(account: Account, extraMonthlyPayment: number): DebtPrepaymentResult {
  const principal = Math.max(0, Number(account.balance) || 0);
  const rate = Math.max(0, Number(account.interestRate) || 0);
  const emi = Math.max(0, Number(account.monthlyEMI) || 0);
  if (account.type !== 'liability' || principal <= 0 || emi <= 0 || account.interestCalculationType === 'INTEREST_ONLY') {
    return { eligible: false, baselineMonths: 0, acceleratedMonths: 0, monthsSaved: 0, baselineInterest: 0, acceleratedInterest: 0, interestSaved: 0, warning: 'This comparison needs an active amortizing liability with a monthly EMI.' };
  }
  const baseline = amortize(principal, rate, emi);
  const accelerated = amortize(principal, rate, emi + Math.max(0, Number(extraMonthlyPayment) || 0));
  if (!baseline.repaid || !accelerated.repaid) return { eligible: false, baselineMonths: baseline.months, acceleratedMonths: accelerated.months, monthsSaved: 0, baselineInterest: baseline.interest, acceleratedInterest: accelerated.interest, interestSaved: 0, warning: 'The EMI is not high enough to amortize this balance at the current interest rate.' };
  return {
    eligible: true,
    baselineMonths: baseline.months,
    acceleratedMonths: accelerated.months,
    monthsSaved: Math.max(0, baseline.months - accelerated.months),
    baselineInterest: baseline.interest,
    acceleratedInterest: accelerated.interest,
    interestSaved: Math.max(0, baseline.interest - accelerated.interest),
  };
}
