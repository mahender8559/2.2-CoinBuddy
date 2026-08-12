import type { AffordabilitySettings } from '../types';
import type { AffordabilityInput, AffordabilityResult } from './affordability';
import { projectAffordability } from './affordability';
import { estimateIrregularSpending, type IrregularSpendingEstimate } from './irregularSpending';

export interface AffordabilityPlannerInput extends Omit<AffordabilityInput, 'settings'> {
  affordabilitySettings: AffordabilitySettings;
  monthCycleDay: number;
}

export interface AffordabilityPlannerResult {
  projection: AffordabilityResult;
  irregularSpending: IrregularSpendingEstimate;
  planningWarnings: string[];
}

/** High-level Phase 5 bridge used by the future UI. */
export function projectAffordabilityWithHistory(input: AffordabilityPlannerInput): AffordabilityPlannerResult {
  const irregularSpending = estimateIrregularSpending({
    asOfDate: input.asOfDate,
    monthCycleDay: input.monthCycleDay,
    transactions: input.transactions,
    categories: input.categories,
    settings: input.affordabilitySettings,
  });

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
      plannedSavingsTarget: input.affordabilitySettings.monthlySavingsTarget,
      contingencyBuffer: irregularSpending.recommendedBuffer,
      protectedCashReserve: input.affordabilitySettings.protectedCashReserve,
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
  if (!input.affordabilitySettings.setupCompleted) {
    planningWarnings.push('Affordability safety preferences have not been reviewed yet.');
  }

  return { projection, irregularSpending, planningWarnings };
}
