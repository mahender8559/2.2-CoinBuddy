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

export type AffordabilityClass = 'COMMITTED' | 'NORMAL' | 'FLEXIBLE' | 'IRREGULAR' | 'SAVINGS';

export type AffordabilityContingencyMode = 'AUTO' | 'FIXED';
export type AffordabilitySafetyLevel = 'FLEXIBLE' | 'BALANCED' | 'CONSERVATIVE';

export interface AffordabilitySettings {
  version: 1;
  /** Whether the user has explicitly reviewed the planner safety setup. */
  setupCompleted: boolean;
  /** Amount the user wants to protect as savings over a normal monthly financial cycle. */
  monthlySavingsTarget: number;
  /** Liquid cash floor that the affordability planner must not recommend spending through. */
  protectedCashReserve: number;
  contingencyMode: AffordabilityContingencyMode;
  /** Used only when contingencyMode is FIXED. */
  fixedContingencyAmount: number;
  /** Number of completed financial cycles considered by the automatic irregular-spending estimator. */
  historicalMonths: number;
  safetyLevel: AffordabilitySafetyLevel;
}

export type SavingsGoalType = 'EMERGENCY_FUND' | 'PURCHASE' | 'TRAVEL' | 'EDUCATION' | 'HOME' | 'OTHER';
export type SavingsGoalPriority = 'HIGH' | 'MEDIUM' | 'LOW';

/** A real planning goal, separate from transaction/category semantics. */
export interface SavingsGoal {
  id: string;
  name: string;
  type: SavingsGoalType;
  targetAmount: number;
  targetDate?: string;
  /** Explicit amount the user intends to contribute in a normal financial cycle. */
  monthlyContribution: number;
  /** Optional asset account whose current balance represents goal progress. */
  linkedAccountId?: string;
  /** Used only when no account is linked. */
  manualSavedAmount: number;
  /** When linked to liquid cash, protect that account balance in affordability. */
  protectLinkedBalance: boolean;
  priority: SavingsGoalPriority;
  isActive: boolean;
  createdAt: string;
}

export type Category = {
  id: string;
  name: string;
  icon: IconName;
  budget?: number;
  isRollover?: boolean;
  rolloverAccountId?: string;
  tags?: string[];
  /** @deprecated Legacy presentation grouping kept only for old backups/UI compatibility. */
  group?: 'Essential' | 'Leisure' | 'Savings';
  /** Financial behavior used by planning/projection features. */
  affordabilityClass?: AffordabilityClass;
  type?: 'expense' | 'income';
};

export type TransactionType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'OPENING_BALANCE'
  | 'MARKET_ADJUSTMENT'
  | 'BALANCE_ADJUSTMENT';

export type RecurrenceFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';

export interface RecurringRule {
  id: string;
  title: string;
  subtitle?: string;
  amount: number;
  transactionType: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  account?: string;
  fromAccountId?: string;
  toAccountId?: string;
  category?: string;
  icon?: IconName;
  notes?: string;
  isInterestOnly?: boolean;
  frequency: RecurrenceFrequency;
  nextDueDate: string;
  isActive: boolean;
  eventId?: string;
  goalId?: string;
  anchorDay?: number;
}

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
  recurrenceFrequency?: RecurrenceFrequency;
  fromAccountId?: string;
  toAccountId?: string;
  isInterestOnly?: boolean;
  isOpeningBalance?: boolean;
  recurringRuleId?: string;
  dueDate?: string;
  eventId?: string;
  goalId?: string;
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