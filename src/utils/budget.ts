import type { Category, Transaction } from '../types';

export function categoryTag(category: Category): string {
  return `#${category.name.toLowerCase().replace(/\s+/g, '')}`;
}

export function getCategorySpend(category: Category, transactions: Transaction[], isInCycle: (date: string) => boolean): number {
  if (category.type === 'income') return 0;
  const tag = categoryTag(category);
  return transactions.filter(transaction =>
    isInCycle(transaction.date) && !transaction.isOpeningBalance && transaction.is_verified !== 0 &&
    transaction.type === 'expense' && (transaction.category === tag || transaction.category === category.id)
  ).reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
}

export function getBudgetSummary(categories: Category[], transactions: Transaction[], isInCycle: (date: string) => boolean) {
  const budget = categories.filter(category => category.type !== 'income' && category.group !== 'Savings').reduce((total, category) => total + (category.budget || 0), 0);
  const spent = categories.filter(category => category.type !== 'income' && category.group !== 'Savings').reduce((total, category) => total + getCategorySpend(category, transactions, isInCycle), 0);
  return { budget, spent, progress: budget > 0 ? spent / budget * 100 : 0 };
}
