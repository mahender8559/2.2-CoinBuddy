export type Tab = 'dashboard' | 'activity' | 'insights' | 'manage' | 'settings';

export interface LoanRevision {
  id: string;
  accountId: string;
  account_id?: string;
  effectiveDate: string;
  effective_date?: string;
  newInterestRate: number;
  new_interest_rate?: number;
  newEmi: number;
  new_emi?: number;
  newTenureMonths: number;
  new_tenure_months?: number;
  paymentFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  payment_frequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
}

export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  balance: number;
  limit?: number;
  group?: string;
  is_archived?: number; // 0 for active, 1 for archived
  originalPrincipal?: number;
  interestRate?: number;
  monthlyEMI?: number;
  interest_rate?: number;
  monthly_emi?: number;
  nextEMIDate?: string;
  interestCalculationType?: 'REDUCING' | 'FLAT' | 'INTEREST_ONLY';
  interest_calculation_type?: 'REDUCING' | 'FLAT' | 'INTEREST_ONLY';
  paymentFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  payment_frequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  tenureMonths?: number;
  tenure_months?: number;
  loanStartDate?: string;
  loan_start_date?: string;
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
  late_fee_fixed_amount?: number;
  late_fee_interest_rate?: number;
  grace_period_days?: number;
}

export type Category = {
  id: string;
  name: string;
  icon: string;
  budget?: number;
  tags?: string[];
  group?: 'Essential' | 'Leisure' | 'Savings';
  type?: 'expense' | 'income';
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
  transaction_type?: string;
  is_verified?: number;
  notes?: string;
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
