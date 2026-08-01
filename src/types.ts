export type Tab = 'dashboard' | 'activity' | 'insights' | 'manage' | 'settings';

export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  balance: number;
  limit?: number;
  group?: string;
  originalPrincipal?: number;
  interestRate?: number;
  monthlyEMI?: number;
  nextEMIDate?: string;
  monthlyInterestRate?: number;
  nextInterestDueDate?: string;
  investmentMethod?: 'SIP' | 'Lump Sum';
  investedAmount?: number;
  monthlySIPAmount?: number;
  nextSIPDate?: string;
}

export type Category = {
  id: string;
  name: string;
  icon: string;
  budget?: number;
  tags?: string[];
  group?: 'Essential' | 'Leisure' | 'Savings';
};

export type Transaction = {
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  date: string;
  category: string;
  icon: string;
  type: 'income' | 'expense' | 'transfer';
  account?: string;
  isRecurring?: boolean;
  fromAccountId?: string;
  toAccountId?: string;
  isInterestOnly?: boolean;
  isOpeningBalance?: boolean;
};

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
