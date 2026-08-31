export type Tab = 'dashboard' | 'activity' | 'insights' | 'manage' | 'scheduled' | 'settings';
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
  /** Asset accounts whose current balances together represent goal progress. */
  linkedAccountIds?: string[];
  /** @deprecated Legacy single-account field retained for old backups and migrations. */
  linkedAccountId?: string;
  /** Used only when no account is linked. */
  manualSavedAmount: number;
  /** When linked to liquid cash, protect all linked liquid account balances in affordability. */
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

export interface Person {
  id: string;
  name: string;
  relationship?: string;
  isSelf: boolean;
  isArchived: boolean;
}

export type SharedObligationKind = 'EXPENSE' | 'LOAN_PAYMENT';
export type SharedSettlementMode = 'TRACK' | 'IGNORE';
export type SharedObligationStatus = 'OPEN' | 'SETTLED' | 'CANCELLED';

/** Household/family obligation. This is not itself a cash movement. */
export interface SharedObligation {
  id: string;
  title: string;
  kind: SharedObligationKind;
  totalAmount: number;
  categoryId?: string;
  dueDate?: string;
  templateId?: string;
  transactionId?: string;
  liabilityAccountId?: string;
  recurringRuleId?: string;
  settlementMode: SharedSettlementMode;
  status: SharedObligationStatus;
  createdAt: string;
}

/** Economic responsibility for an obligation, independent of who paid. */
export interface SharedResponsibility {
  id: string;
  obligationId: string;
  personId: string;
  amount: number;
}

/** Funding of an obligation. EXTERNAL never changes a tracked CoinBuddy account. */
export interface SharedPayment {
  id: string;
  obligationId: string;
  personId: string;
  transactionId?: string;
  amount: number;
  source: 'TRACKED' | 'EXTERNAL';
  paidAt: string;
}

/** Reimbursement/settlement between people; separate from income/expense semantics. */
export interface SharedSettlement {
  id: string;
  obligationId?: string;
  fromPersonId: string;
  toPersonId: string;
  transactionId?: string;
  amount: number;
  settledAt: string;
}

/** One real liability can have a different personal exposure and EMI contribution share. */
export interface LoanSharingRule {
  accountId: string;
  personalResponsibilityPercent: number;
  isShared: boolean;
}

export interface LoanContributionRule {
  id: string;
  accountId: string;
  personId: string;
  mode: 'PERCENT' | 'FIXED';
  value: number;
  isActive: boolean;
}

/** Recurring household obligation definition. Generated obligations are immutable occurrences. */
export interface SharedObligationTemplate {
  id: string;
  title: string;
  totalAmount: number;
  categoryId?: string;
  frequency: RecurrenceFrequency;
  nextDueDate: string;
  isActive: boolean;
  settlementMode: SharedSettlementMode;
  createdAt: string;
}

export interface SharedTemplateResponsibility {
  id: string;
  templateId: string;
  personId: string;
  amount: number;
}

/** A payment made directly to a lender by somebody outside the tracked ledger. */
export interface ExternalLoanContribution {
  id: string;
  accountId: string;
  personId: string;
  adjustmentTransactionId?: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  paidAt: string;
}

export type LoanPayoffType = 'PARTIAL' | 'FULL';
export type LoanPayoffPlanStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type LoanPayoffHoldingType = 'TRACKED' | 'EXTERNAL';
export type LoanPayoffMovementType = 'RESERVE' | 'RELEASE' | 'CONSUME';

/** A dated lump-sum repayment objective against one real liability. */
export interface LoanPayoffPlan {
  id: string;
  liabilityAccountId: string;
  targetAmount: number;
  targetDate: string;
  payoffType: LoanPayoffType;
  status: LoanPayoffPlanStatus;
  createdAt: string;
}

/** Who intends to fund the payoff plan; independent of legal ownership and EMI split. */
export interface LoanPayoffResponsibility {
  id: string;
  planId: string;
  personId: string;
  targetAmount: number;
}

/** Append-only reserve ledger. RESERVE adds; RELEASE/CONSUME subtract. */
export interface LoanPayoffFundMovement {
  id: string;
  planId: string;
  personId: string;
  assetAccountId?: string;
  holdingType: LoanPayoffHoldingType;
  movementType: LoanPayoffMovementType;
  amount: number;
  transactionId?: string;
  externalLoanContributionId?: string;
  createdAt: string;
}

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