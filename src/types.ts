export type Tab = 'dashboard' | 'activity' | 'insights' | 'manage' | 'settings';
import type { IconName } from './icons';

export interface LoanRevision {
  id: string;
  accountId: string;
  effectiveDate: string;
  newInterestRate: number;
  newEmi: number;
  newTenureMonths: number;
  paymentFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
}

export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  balance: number;
  limit?: number;
  overdraftLimit?: number;
  group?: string;
  is_archived?: number; // 0 for active, 1 for archived
  originalPrincipal?: number;
  interestRate?: number;
  monthlyEMI?: number;
  nextEMIDate?: string;
  interestCalculationType?: 'REDUCING' | 'FLAT' | 'INTEREST_ONLY';
  paymentFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  tenureMonths?: number;
  loanStartDate?: string;
  monthlyInterestRate?: number;
  nextInterestDueDate?: string;
  investmentMethod?: 'SIP' | 'Lump Sum';
  investedAmount?: number;
  monthlySIPAmount?: number;
  nextSIPDate?: string;
  revisions?: LoanRevision[];
  lateFeeFixedAmount?: number;
  lateFeeInterestRate?: number;
  gracePeriodDays?: number;
}

export type Category = {
  id: string;
  name: string;
  icon: IconName;
  budget?: number;
  isRollover?: boolean;
  tags?: string[];
  group?: 'Essential' | 'Leisure' | 'Savings';
  type?: 'expense' | 'income';
};

export type TransactionType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'OPENING_BALANCE'
  | 'MARKET_ADJUSTMENT'
  | 'BALANCE_ADJUSTMENT';

export type Transaction = {
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  date: string;
  category: string;
  icon: IconName;
  type: 'income' | 'expense' | 'transfer';
  account?: string;
  isRecurring?: boolean;
  fromAccountId?: string;
  toAccountId?: string;
  isInterestOnly?: boolean;
  isOpeningBalance?: boolean;
  recurringRuleId?: string;
  dueDate?: string;
  eventId?: string;
  transaction_type?: TransactionType;
  is_verified?: number;
  notes?: string;
};

export interface Event {
  id: string;
  name: string;
  createdAt: string;
}

export interface Widget {
  id: string;
  type: 'category' | 'asset' | 'liability';
  targetId: string;
}

export type CreditCardInfo = {
  id: string;
  name: string;
  balance: number;
  dueAmount: number;
  dueDate: string;
  billingCycleDay: number;
  limit: number;
};
