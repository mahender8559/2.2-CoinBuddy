/** Built-in restore fixture derived from the supplied CoinBuddy relational test data. */
export const COINBUDDY_TEST_DATA = {
  schemaVersion: 'coinbuddy-ledger-v3',
  users_config: [{ config_id: 'cfg-001', month_cycle_day: 1, currency_code: 'INR', privacy_mode: false }],
  currency: 'INR',
  accounts: [
    { id: 'acc-001', name: 'HDFC Bank', type: 'asset', balance: 0, group: 'Bank Account', overdraftLimit: 10000, is_archived: 0 },
    { id: 'acc-002', name: 'Bike Loan', type: 'liability', balance: 0, group: 'Loan', limit: 60000, originalPrincipal: 60000, is_archived: 0 },
  ],
  categories: [
    { id: 'cat-001', name: 'Salary', type: 'income', icon: 'Banknote', isRollover: false },
    { id: 'cat-002', name: 'Groceries', type: 'expense', icon: 'ShoppingBag', budget: 15000, isRollover: true },
  ],
  events: [{ id: 'evt-001', name: 'August Roadtrip', createdAt: '2026-08-04T10:00:00Z' }],
  transactions: [
    { id: 'tx-opening-bank', title: 'Opening Balance', subtitle: 'Starting HDFC balance', amount: 6000, date: '2026-07-31T12:00:00Z', category: '#opening', icon: 'Landmark', type: 'transfer', toAccountId: 'acc-001', transaction_type: 'OPENING_BALANCE', isOpeningBalance: true, is_verified: 1 },
    { id: 'tx-opening-loan', title: 'Opening Balance', subtitle: 'Starting Bike Loan debt', amount: 45000, date: '2026-07-31T12:00:00Z', category: '#opening', icon: 'Landmark', type: 'transfer', fromAccountId: 'acc-002', transaction_type: 'OPENING_BALANCE', isOpeningBalance: true, is_verified: 1 },
    { id: 'tx-001', title: 'Salary', subtitle: 'Test income', amount: 150000, date: '2026-08-01T09:00:00Z', category: 'cat-001', icon: 'Banknote', type: 'income', toAccountId: 'acc-001', transaction_type: 'INCOME', is_verified: 1 },
    { id: 'tx-002', title: 'Groceries', subtitle: 'Test expense', amount: 5000, date: '2026-08-02T14:30:00Z', category: 'cat-002', icon: 'ShoppingBag', type: 'expense', fromAccountId: 'acc-001', eventId: 'evt-001', transaction_type: 'EXPENSE', is_verified: 1 },
    { id: 'tx-003', title: 'Balance adjustment', subtitle: 'Test reconciliation', amount: 500, date: '2026-08-04T11:00:00Z', category: '#balance-adjustment', icon: 'Landmark', type: 'transfer', fromAccountId: 'acc-001', transaction_type: 'BALANCE_ADJUSTMENT', is_verified: 1 },
  ],
  creditCards: [], widgets: [], loanRevisions: [],
} as const;
