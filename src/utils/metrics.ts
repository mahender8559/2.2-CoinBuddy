import type { Account, Category, Transaction } from '../types';
import { isCashFlowTransaction } from '../domain/ledgerRules';

export function projectDebtPayoff(balance: number, monthlyPayment: number, annualRate = 0, extraPayment = 0) {
  let remaining = Math.max(0, balance);
  const payment = Math.max(0, monthlyPayment + extraPayment);
  const monthlyRate = Math.max(0, annualRate) / 1200;
  let months = 0;
  let interest = 0;
  while (remaining > 0.01 && payment > 0 && months < 1200) {
    const monthlyInterest = remaining * monthlyRate;
    if (payment <= monthlyInterest && remaining > 0) return null;
    interest += monthlyInterest;
    remaining = Math.max(0, remaining + monthlyInterest - payment);
    months += 1;
  }
  if (remaining > 0.01) return null;
  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + months);
  return { months, interest, payoffDate };
}

export function calculateFinancialRunway(accounts: Account[], categories: Category[], transactions: Transaction[], getCycleDetails: (date: string) => { key: string; month: number; year: number }) {
  const liquidAssets = accounts.filter(account => !account.is_archived && account.type === 'asset' && ['CASH', 'BANK', 'BANK ACCOUNT'].includes(account.group?.toUpperCase() ?? '')).reduce((sum, account) => sum + Math.max(0, account.balance), 0);
  const current = getCycleDetails(new Date().toISOString());
  const keys = Array.from({ length: 3 }, (_, index) => {
    let month = current.month - index;
    let year = current.year;
    if (month < 0) { month += 12; year -= 1; }
    return `${year}-${month}`;
  });
  const essentialCategoryIds = new Set(categories.filter(category => category.group === 'Essential').flatMap(category => [category.id, `#${category.name.toLowerCase().replace(/\s+/g, '')}`]));
  const trailingExpense = transactions.filter(transaction => !transaction.isOpeningBalance && transaction.is_verified !== 0 && isCashFlowTransaction(transaction) && transaction.type === 'expense' && essentialCategoryIds.has(transaction.category) && keys.includes(getCycleDetails(transaction.date).key)).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const monthlyEssentialSpend = trailingExpense / 3;
  return { liquidAssets, monthlyEssentialSpend, months: monthlyEssentialSpend > 0 ? liquidAssets / monthlyEssentialSpend : null };
}
