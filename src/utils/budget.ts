import type { Category, Transaction } from '../types';
import type { PersonalExpenseRecord } from '../domain/personalSpending';
import { isCashFlowTransaction } from '../domain/ledgerRules';

type CycleDetails = { month: number; year: number; key: string };
type CycleResolver = (date: string) => CycleDetails;

export function categoryTag(category: Category): string {
  return `#${category.name.toLowerCase().replace(/\s+/g, '')}`;
}

export function getCategorySpend(
  category: Category,
  transactions: Transaction[],
  isInCycle: (date: string) => boolean,
  personalExpenseRecords?: PersonalExpenseRecord[],
): number {
  if (category.type === 'income') return 0;
  const tag = categoryTag(category);
  if (personalExpenseRecords) {
    return personalExpenseRecords
      .filter(record => isInCycle(record.date) && (record.category === tag || record.category === category.id))
      .reduce((total, record) => total + Math.abs(record.amount), 0);
  }
  return transactions.filter(transaction =>
    isInCycle(transaction.date) && !transaction.isOpeningBalance && transaction.is_verified !== 0 &&
    isCashFlowTransaction(transaction) && transaction.type === 'expense' &&
    (transaction.category === tag || transaction.category === category.id)
  ).reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
}

function cycleKeysBetween(first: CycleDetails, last: CycleDetails): string[] {
  const keys: string[] = [];
  let year = first.year;
  let month = first.month;
  while (year < last.year || (year === last.year && month <= last.month)) {
    keys.push(`${year}-${month}`);
    month += 1;
    if (month === 12) { month = 0; year += 1; }
  }
  return keys;
}

export function getBudgetSummary(
  categories: Category[],
  transactions: Transaction[],
  getCycleDetails: CycleResolver,
  personalExpenseRecords?: PersonalExpenseRecord[],
) {
  const budgetCategories = categories.filter(category => category.type !== 'income' && category.group !== 'Savings');
  const currentCycle = getCycleDetails(new Date().toISOString());
  const eligibleTransactions = transactions.filter(transaction =>
    !transaction.isOpeningBalance && transaction.is_verified !== 0 &&
    isCashFlowTransaction(transaction) && transaction.type === 'expense'
  );
  let budget = 0;
  let spent = 0;
  for (const category of budgetCategories) {
    const tag = categoryTag(category);
    const cycleSpend = new Map<string, number>();
    const categoryTransactions = eligibleTransactions.filter(transaction => transaction.category === tag || transaction.category === category.id);
    const categoryPersonalRecords = personalExpenseRecords?.filter(record => record.category === tag || record.category === category.id);
    const spendRecords = categoryPersonalRecords ?? categoryTransactions.map(transaction => ({ date: transaction.date, amount: Math.abs(transaction.amount) }));
    for (const record of spendRecords) {
      const key = getCycleDetails(record.date).key;
      cycleSpend.set(key, (cycleSpend.get(key) ?? 0) + Math.abs(record.amount));
    }
    const firstCycle = spendRecords.length
      ? spendRecords.reduce((first, record) => {
          const cycle = getCycleDetails(record.date);
          return cycle.year < first.year || (cycle.year === first.year && cycle.month < first.month) ? cycle : first;
        }, currentCycle)
      : currentCycle;
    const cycleKeys = cycleKeysBetween(firstCycle, currentCycle);
    const baseBudget = Math.max(0, Number(category.budget) || 0);
    let carry = 0;
    let currentBudget = baseBudget;
    for (const key of cycleKeys) {
      currentBudget = category.isRollover ? baseBudget + carry : baseBudget;
      const currentSpend = cycleSpend.get(key) ?? 0;
      carry = category.isRollover ? Math.max(0, currentBudget - currentSpend) : 0;
    }
    budget += currentBudget;
    spent += cycleSpend.get(currentCycle.key) ?? 0;
  }
  return { budget, spent, progress: budget > 0 ? spent / budget * 100 : 0 };
}
