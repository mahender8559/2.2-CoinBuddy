import type { AffordabilitySettings, SavingsGoal } from '../types';
import type { AffordabilityInput, AffordabilityResult } from './affordability';
import { projectAffordability } from './affordability';
import { estimateIrregularSpending, type IrregularSpendingEstimate } from './irregularSpending';
import { estimateNormalLivingSpending, type NormalLivingSpendingEstimate } from './normalLivingSpending';
import { getActiveGoalMonthlyContribution, getProtectedGoalReserve } from './savingsGoals';

export interface AffordabilityPlannerInput extends Omit<AffordabilityInput, 'settings'> {
  affordabilitySettings: AffordabilitySettings;
  monthCycleDay: number;
  savingsGoals?: SavingsGoal[];
}

export interface AffordabilityPlannerResult {
  projection: AffordabilityResult;
  irregularSpending: IrregularSpendingEstimate;
  normalLivingSpending: NormalLivingSpendingEstimate;
  goalSummary: {
    activeGoalCount: number;
    monthlyContributionTarget: number;
    protectedReserve: number;
  };
  planningWarnings: string[];
}

/** High-level bridge used by the affordability UI. */
export function projectAffordabilityWithHistory(input: AffordabilityPlannerInput): AffordabilityPlannerResult {
  const irregularSpending = estimateIrregularSpending({
    asOfDate: input.asOfDate,
    monthCycleDay: input.monthCycleDay,
    transactions: input.transactions,
    categories: input.categories,
    settings: input.affordabilitySettings,
  });

  const normalLivingSpending = estimateNormalLivingSpending({
    asOfDate: input.asOfDate,
    monthCycleDay: input.monthCycleDay,
    transactions: input.transactions,
    categories: input.categories,
    historicalMonths: input.affordabilitySettings.historicalMonths,
  });

  const savingsGoals = input.savingsGoals ?? [];
  const activeGoalCount = savingsGoals.filter(goal => goal.isActive).length;
  const monthlyContributionTarget = getActiveGoalMonthlyContribution(savingsGoals);
  const protectedReserve = getProtectedGoalReserve(savingsGoals, input.accounts);
  const effectiveSavingsTarget = Math.max(input.affordabilitySettings.monthlySavingsTarget, monthlyContributionTarget);
  const effectiveProtectedReserve = Math.max(input.affordabilitySettings.protectedCashReserve, protectedReserve);

  const baseSettings = {
    plannedSavingsTarget: effectiveSavingsTarget,
    contingencyBuffer: irregularSpending.recommendedBuffer,
    protectedCashReserve: effectiveProtectedReserve,
    normalLivingExpenseForecast: 0,
  };

  // First calculate known/scheduled NORMAL spending. The historical normal-living
  // estimate represents the whole expected normal-spend envelope, so only the
  // portion not already scheduled is added. This prevents rent/grocery-like
  // recurring entries from being counted twice when they also appear in history.
  const baselineProjection = projectAffordability({
    asOfDate: input.asOfDate,
    endDate: input.endDate,
    accounts: input.accounts,
    transactions: input.transactions,
    recurringRules: input.recurringRules,
    categories: input.categories,
    creditCards: input.creditCards,
    purchaseAmount: input.purchaseAmount,
    settings: baseSettings,
  });

  const additionalNormalLivingExpense = normalLivingSpending.estimateUsable
    ? Math.max(0, normalLivingSpending.medianNormalSpend - baselineProjection.expensesByClass.NORMAL)
    : 0;

  const projection = projectAffordability({
    asOfDate: input.asOfDate,
    endDate: input.endDate,
    accounts: input.accounts,
    transactions: input.transactions,
    recurringRules: input.recurringRules,
    categories: input.categories,
    creditCards: input.creditCards,
    purchaseAmount: input.purchaseAmount,
    settings: {
      ...baseSettings,
      normalLivingExpenseForecast: additionalNormalLivingExpense,
    },
  });

  const planningWarnings: string[] = [];
  if (irregularSpending.contingencySource === 'UNAVAILABLE') {
    planningWarnings.push('Unexpected-spending protection is not included because automatic history is unavailable. Set a fixed contingency amount or build more usable history.');
  }
  if (irregularSpending.confidence === 'LOW' && irregularSpending.contingencySource === 'HISTORICAL') {
    planningWarnings.push('Unexpected-spending protection is based on limited history and may change materially as more cycles are recorded.');
  } else if (irregularSpending.confidence === 'MEDIUM' && irregularSpending.contingencySource === 'HISTORICAL') {
    planningWarnings.push('Unexpected-spending protection is based on a moderate amount of history and will become more stable with additional cycles.');
  }
  if (!normalLivingSpending.estimateUsable) {
    planningWarnings.push('Normal living expenses are not estimated yet because CoinBuddy has no completed financial cycle with usable activity. Known scheduled expenses are still protected.');
  } else if (normalLivingSpending.confidence === 'LOW') {
    planningWarnings.push('Normal living-expense protection is based on limited completed-cycle history and may change materially as more cycles are recorded.');
  } else if (normalLivingSpending.confidence === 'MEDIUM') {
    planningWarnings.push('Normal living-expense protection is based on a moderate amount of history and will become more stable with additional cycles.');
  }
  if (!input.affordabilitySettings.setupCompleted) {
    planningWarnings.push('Affordability safety preferences have not been reviewed yet.');
  }

  return {
    projection,
    irregularSpending,
    normalLivingSpending,
    goalSummary: { activeGoalCount, monthlyContributionTarget, protectedReserve },
    planningWarnings,
  };
}
