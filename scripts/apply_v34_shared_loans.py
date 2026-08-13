from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label} anchor not found in {path}')
    p.write_text(text.replace(old, new, 1))

# Repository: fixed contributions must equal the real EMI and callers may join
# an outer account-creation transaction.
replace_once('src/db/sharedFinanceRepository.ts', '''export async function replaceLoanContributionRules(driver: SqlJsDatabaseDriver, accountId: string, rules: Array<Omit<LoanContributionRule, 'id' | 'accountId'> & { id?: string }>): Promise<void> {''', '''export async function replaceLoanContributionRules(driver: SqlJsDatabaseDriver, accountId: string, rules: Array<Omit<LoanContributionRule, 'id' | 'accountId'> & { id?: string }>, manageTransaction = true): Promise<void> {''', 'loan contribution transaction option')
replace_once('src/db/sharedFinanceRepository.ts', '''  if (percentRules.length) {
    const total = percentRules.reduce((sum, rule) => sum + Number(rule.value), 0);
    if (Math.abs(total - 100) > 0.01) throw new Error('Active percentage EMI contributions must add up to 100%.');
  }
  const ids = new Set(active.map(rule => rule.personId));''', '''  if (percentRules.length) {
    const total = percentRules.reduce((sum, rule) => sum + Number(rule.value), 0);
    if (Math.abs(total - 100) > 0.01) throw new Error('Active percentage EMI contributions must add up to 100%.');
  }
  if (fixedRules.length) {
    const accountRows = await driver.query(`SELECT monthly_emi FROM accounts WHERE id = ? AND type = 'LIABILITY'`, [accountId]);
    if (!accountRows[0]) throw new Error('Loan contribution rules require a liability account.');
    const emi = Math.max(0, Number(accountRows[0].monthly_emi ?? 0));
    const total = fixedRules.reduce((sum, rule) => sum + Number(rule.value), 0);
    if (Math.abs(total - emi) > 0.01) throw new Error('Active fixed EMI contributions must add up to the full loan payment.');
  }
  const ids = new Set(active.map(rule => rule.personId));''', 'fixed EMI validation')
replace_once('src/db/sharedFinanceRepository.ts', '''  await driver.execute('BEGIN TRANSACTION');
  try {
    await driver.execute(`DELETE FROM loan_contribution_rules WHERE account_id = ?`, [accountId]);''', '''  if (manageTransaction) await driver.execute('BEGIN TRANSACTION');
  try {
    await driver.execute(`DELETE FROM loan_contribution_rules WHERE account_id = ?`, [accountId]);''', 'conditional loan contribution begin')
replace_once('src/db/sharedFinanceRepository.ts', '''    await driver.execute('COMMIT');
  } catch (error) {
    await driver.execute('ROLLBACK');
    throw error;
  }
}''', '''    if (manageTransaction) await driver.execute('COMMIT');
  } catch (error) {
    if (manageTransaction) await driver.execute('ROLLBACK');
    throw error;
  }
}''', 'conditional loan contribution commit')

# AppContext: account saves can carry table-backed loan sharing configuration.
replace_once('src/context/AppContext.tsx', '''export type AccountUndoState = { account: Account; openingTx: Transaction | null };
type LedgerImportData''', '''export type AccountUndoState = { account: Account; openingTx: Transaction | null };
type LoanSharingSaveConfig = { isShared: boolean; personalResponsibilityPercent: number; contributions: Array<Omit<LoanContributionRule, 'id' | 'accountId'>> };
type LedgerImportData''', 'loan sharing save type')
replace_once('src/context/AppContext.tsx', '''  addAccount: (account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string }) => void;
  updateAccount: (id: string, account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string }) => void;''', '''  addAccount: (account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string; loanSharing?: LoanSharingSaveConfig }) => void;
  updateAccount: (id: string, account: Omit<Account, 'id'>, options?: { sipSourceAccountId?: string; loanSharing?: LoanSharingSaveConfig }) => void;''', 'context account sharing options')
replace_once('src/context/AppContext.tsx', '''  const addAccount = (account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string } = {}) => {''', '''  const addAccount = (account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string; loanSharing?: LoanSharingSaveConfig } = {}) => {''', 'addAccount sharing options')
replace_once('src/context/AppContext.tsx', '''          await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id, false);
          await syncInvestmentSipRecurringRule(dbDriver, newId, { ...newAccount, balance: initialBalance }, options.sipSourceAccountId);
          await dbDriver.execute('COMMIT');''', '''          await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id, false);
          await syncInvestmentSipRecurringRule(dbDriver, newId, { ...newAccount, balance: initialBalance }, options.sipSourceAccountId);
          if (account.type === 'liability' && options.loanSharing) {
            await setLoanSharingRuleRow(dbDriver, { accountId: newId, personalResponsibilityPercent: options.loanSharing.personalResponsibilityPercent, isShared: options.loanSharing.isShared });
            await replaceLoanContributionRules(dbDriver, newId, options.loanSharing.isShared ? options.loanSharing.contributions : [], false);
          }
          await dbDriver.execute('COMMIT');
          if (options.loanSharing) await refreshSharedFinance(dbDriver);''', 'atomic new loan sharing')
replace_once('src/context/AppContext.tsx', '''  const updateAccount = (id: string, account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string } = {}) => {''', '''  const updateAccount = (id: string, account: Omit<Account, 'id'>, options: { sipSourceAccountId?: string; loanSharing?: LoanSharingSaveConfig } = {}) => {''', 'updateAccount sharing options')
# Existing-account updates have two branches. Apply sharing after account metadata is valid.
replace_once('src/context/AppContext.tsx', '''          await updateOpeningBalance(dbDriver, id, account.balance);
          await syncInvestmentSipRecurringRule(dbDriver, id, { ...mergedAccount, balance: account.balance }, options.sipSourceAccountId);
        });''', '''          await updateOpeningBalance(dbDriver, id, account.balance);
          await syncInvestmentSipRecurringRule(dbDriver, id, { ...mergedAccount, balance: account.balance }, options.sipSourceAccountId);
          if (account.type === 'liability' && options.loanSharing) {
            await setLoanSharingRuleRow(dbDriver, { accountId: id, personalResponsibilityPercent: options.loanSharing.personalResponsibilityPercent, isShared: options.loanSharing.isShared });
            await replaceLoanContributionRules(dbDriver, id, options.loanSharing.isShared ? options.loanSharing.contributions : []);
            await refreshSharedFinance(dbDriver);
          }
        });''', 'update existing opening loan sharing')
replace_once('src/context/AppContext.tsx', '''          await updateAccountRow(dbDriver, mergedAccount);
          if (newOpeningTx) await insertTransactionRow(dbDriver, newOpeningTx);
          await syncInvestmentSipRecurringRule(dbDriver, id, { ...mergedAccount, balance: account.balance }, options.sipSourceAccountId);
        });''', '''          await updateAccountRow(dbDriver, mergedAccount);
          if (newOpeningTx) await insertTransactionRow(dbDriver, newOpeningTx);
          await syncInvestmentSipRecurringRule(dbDriver, id, { ...mergedAccount, balance: account.balance }, options.sipSourceAccountId);
          if (account.type === 'liability' && options.loanSharing) {
            await setLoanSharingRuleRow(dbDriver, { accountId: id, personalResponsibilityPercent: options.loanSharing.personalResponsibilityPercent, isShared: options.loanSharing.isShared });
            await replaceLoanContributionRules(dbDriver, id, options.loanSharing.isShared ? options.loanSharing.contributions : []);
            await refreshSharedFinance(dbDriver);
          }
        });''', 'update new opening loan sharing')

# Affordability: only automatic fallback EMI is reduced to the user's expected
# contribution. Explicit scheduled bank payments retain their full cash amount.
replace_once('src/domain/affordability.ts', '''  RecurringRule,
  Transaction,
} from '../types';''', '''  RecurringRule,
  Transaction,
  Person,
  LoanSharingRule,
  LoanContributionRule,
} from '../types';
import { getMyExpectedLoanContribution } from './loanSharing';''', 'affordability sharing imports')
replace_once('src/domain/affordability.ts', '''  creditCards?: CreditCardInfo[];
  settings: AffordabilityProjectionSettings;''', '''  creditCards?: CreditCardInfo[];
  people?: Person[];
  loanSharingRules?: LoanSharingRule[];
  loanContributionRules?: LoanContributionRule[];
  settings: AffordabilityProjectionSettings;''', 'affordability shared input')
replace_once('src/domain/affordability.ts', '''function projectLoanFallbacks(
  accounts: Account[],
  creditCardIds: Set<string>,
  asOfDate: string,
  endDate: string,
  accumulator: ProjectionAccumulator,
): void {''', '''function projectLoanFallbacks(
  accounts: Account[],
  creditCardIds: Set<string>,
  asOfDate: string,
  endDate: string,
  accumulator: ProjectionAccumulator,
  people: Person[] = [],
  loanSharingRules: LoanSharingRule[] = [],
  loanContributionRules: LoanContributionRule[] = [],
): void {''', 'loan fallback shared args')
replace_once('src/domain/affordability.ts', '''      const explicitPayment = liabilityPaymentForDate(accumulator, account.id, dueDate);
      const remainingEmi = Math.max(0, nonNegative(account.monthlyEMI) - explicitPayment);''', '''      const explicitPayment = liabilityPaymentForDate(accumulator, account.id, dueDate);
      const personalEmi = getMyExpectedLoanContribution(account, people, loanSharingRules, loanContributionRules);
      const remainingEmi = Math.max(0, personalEmi - explicitPayment);''', 'personal fallback EMI')
replace_once('src/domain/affordability.ts', '''  projectLoanFallbacks(accounts, creditCardIds, input.asOfDate, input.endDate, accumulator);''', '''  projectLoanFallbacks(accounts, creditCardIds, input.asOfDate, input.endDate, accumulator, input.people, input.loanSharingRules, input.loanContributionRules);''', 'call shared loan fallback')

# High-level affordability bridge forwards sharing context to both projections.
for label in ['baseline', 'final']:
    old = '''    creditCards: input.creditCards,
    purchaseAmount: input.purchaseAmount,'''
    new = '''    creditCards: input.creditCards,
    people: input.people,
    loanSharingRules: input.loanSharingRules,
    loanContributionRules: input.loanContributionRules,
    purchaseAmount: input.purchaseAmount,'''
    replace_once('src/domain/affordabilityPlanner.ts', old, new, f'{label} affordability sharing forward')

# UI sends current people/rules.
replace_once('src/components/AffordabilityPlanner.tsx', '''  const { accounts, transactions, recurringRules, categories, creditCards, affordabilitySettings, savingsGoals, monthCycleDay, formatCurrency } = useAppContext();''', '''  const { accounts, transactions, recurringRules, categories, creditCards, affordabilitySettings, savingsGoals, people, loanSharingRules, loanContributionRules, monthCycleDay, formatCurrency } = useAppContext();''', 'AffordabilityPlanner sharing context')
replace_once('src/components/AffordabilityPlanner.tsx', '''      creditCards,
      purchaseAmount: amount,''', '''      creditCards,
      people,
      loanSharingRules,
      loanContributionRules,
      purchaseAmount: amount,''', 'AffordabilityPlanner shared input')

# Loan editor UI ---------------------------------------------------------------
p = Path('src/components/AddAccountModal.tsx')
s = p.read_text()
s = s.replace('''    recurringRules,
    getCurrencySymbol''', '''    recurringRules,
    people,
    loanSharingRules,
    loanContributionRules,
    getCurrencySymbol''', 1)
s = s.replace('''  const [isEmiManualOverride, setIsEmiManualOverride] = useState(false);
  
  // Interest-Only Loan fields''', '''  const [isEmiManualOverride, setIsEmiManualOverride] = useState(false);
  const [isSharedLoan, setIsSharedLoan] = useState(false);
  const [personalResponsibilityPercent, setPersonalResponsibilityPercent] = useState('100');
  const [contributionMode, setContributionMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [contributionValues, setContributionValues] = useState<Record<string, string>>({});
  
  // Interest-Only Loan fields''', 1)
# Populate edit shared rules
s = s.replace('''        setGracePeriodDays(editingAccount.gracePeriodDays !== undefined ? editingAccount.gracePeriodDays.toString() : (editingAccount.gracePeriodDays !== undefined ? editingAccount.gracePeriodDays.toString() : '0'));
        setIsEmiManualOverride(false);''', '''        setGracePeriodDays(editingAccount.gracePeriodDays !== undefined ? editingAccount.gracePeriodDays.toString() : (editingAccount.gracePeriodDays !== undefined ? editingAccount.gracePeriodDays.toString() : '0'));
        const sharing = loanSharingRules.find(rule => rule.accountId === editingAccount.id && rule.isShared);
        const contributions = loanContributionRules.filter(rule => rule.accountId === editingAccount.id && rule.isActive);
        setIsSharedLoan(Boolean(sharing));
        setPersonalResponsibilityPercent(String(sharing?.personalResponsibilityPercent ?? 100));
        setContributionMode(contributions[0]?.mode ?? 'PERCENT');
        setContributionValues(Object.fromEntries(contributions.map(rule => [rule.personId, String(rule.value)])));
        setIsEmiManualOverride(false);''', 1)
s = s.replace('''      setGracePeriodDays('0');
      setIsEmiManualOverride(false);''', '''      setGracePeriodDays('0');
      setIsSharedLoan(false);
      setPersonalResponsibilityPercent('100');
      setContributionMode('PERCENT');
      setContributionValues({});
      setIsEmiManualOverride(false);''', 1)
# Include rule arrays in effect dependencies.
s = s.replace('''  }, [addAccountModalType, editingAccount, editingCreditCard, recurringRules]);''', '''  }, [addAccountModalType, editingAccount, editingCreditCard, recurringRules, loanSharingRules, loanContributionRules]);''', 1)
# Build + validate config before saving loan.
old_loan = '''        const loanData = {
          name,'''
new_loan = '''        const activePeople = people.filter(person => !person.isArchived);
        const sharingContributions = activePeople.map(person => ({
          personId: person.id,
          mode: contributionMode,
          value: Math.max(0, Number(contributionValues[person.id] || 0)),
          isActive: isSharedLoan,
        })).filter(rule => !isSharedLoan || rule.value > 0);
        const responsibilityPercent = Number(personalResponsibilityPercent);
        if (isSharedLoan) {
          if (activePeople.length < 2) { showError('Add at least one other person in Manage → Sharing before configuring a shared loan.'); return; }
          if (!Number.isFinite(responsibilityPercent) || responsibilityPercent < 0 || responsibilityPercent > 100) { showError('Your liability responsibility must be between 0% and 100%.'); return; }
          const contributionTotal = sharingContributions.reduce((sum, rule) => sum + rule.value, 0);
          if (contributionMode === 'PERCENT' && Math.abs(contributionTotal - 100) > 0.01) { showError('EMI contribution percentages must add up to 100%.'); return; }
          if (contributionMode === 'FIXED' && Math.abs(contributionTotal - Math.abs(Number(monthlyEMI) || 0)) > 0.01) { showError('Fixed EMI contributions must add up to the full loan payment.'); return; }
          if (!sharingContributions.some(rule => people.find(person => person.id === rule.personId)?.isSelf)) { showError('Set your own EMI contribution before saving the shared loan.'); return; }
        }
        const loanSharing = { isShared: isSharedLoan, personalResponsibilityPercent: isSharedLoan ? responsibilityPercent : 100, contributions: isSharedLoan ? sharingContributions : [] };
        const loanData = {
          name,'''
if old_loan not in s: raise SystemExit('loan data anchor not found')
s = s.replace(old_loan, new_loan, 1)
s = s.replace('''          addAccount(loanData);
        } else if (editingAccount) {''', '''          addAccount(loanData, { loanSharing });
        } else if (editingAccount) {''', 1)
s = s.replace('''            updateAccount(editingAccount.id, loanData);''', '''            updateAccount(editingAccount.id, loanData, { loanSharing });''', 1)
# Second addAccount in normal new-loan branch.
needle = '''        } else {
          addAccount(loanData);
        }
      } else {'''
if needle not in s: raise SystemExit('new loan add anchor not found')
s = s.replace(needle, '''        } else {
          addAccount(loanData, { loanSharing });
        }
      } else {''', 1)
# UI inserted before penalty terms.
ui_anchor = '''              {/* Financial Advocate Mode: Penalty Terms Section */}'''
ui = '''              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 space-y-3">
                <label className="flex items-start justify-between gap-4 cursor-pointer">
                  <span><span className="block text-sm font-bold text-on-surface">Shared / family loan</span><span className="mt-1 block text-xs text-on-surface-variant">Keep one real loan and split responsibility between family contributors.</span></span>
                  <input type="checkbox" checked={isSharedLoan} onChange={event => setIsSharedLoan(event.target.checked)} className="mt-1 h-5 w-5 accent-primary" />
                </label>
                {isSharedLoan && <div className="space-y-4 border-t border-outline-variant/20 pt-4">
                  <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Your liability responsibility (%)</span><input type="number" min="0" max="100" step="0.01" value={personalResponsibilityPercent} onChange={event => setPersonalResponsibilityPercent(event.target.value)} className="mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2.5 font-numeric text-on-surface" /><span className="mt-1 block text-[11px] text-on-surface-variant">Used for your personal net-worth exposure. It can differ from who pays the EMI this month.</span></label>
                  <div><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">EMI contribution</span><div className="flex rounded-lg border border-outline-variant/30 p-0.5">{(['PERCENT','FIXED'] as const).map(mode => <button key={mode} type="button" onClick={() => { setContributionMode(mode); setContributionValues({}); }} className={`rounded-md px-2 py-1 text-[10px] font-bold ${contributionMode === mode ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>{mode === 'PERCENT' ? '%' : getCurrencySymbol()}</button>)}</div></div>
                    <div className="space-y-2">{people.filter(person => !person.isArchived).map(person => <label key={person.id} className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-xl bg-surface-container p-3"><span className="text-sm font-semibold text-on-surface">{person.name}{person.isSelf ? ' (you)' : ''}</span><input type="number" min="0" step="0.01" value={contributionValues[person.id] || ''} onChange={event => setContributionValues(current => ({ ...current, [person.id]: event.target.value }))} placeholder={contributionMode === 'PERCENT' ? '0 %' : '0'} className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-2 py-2 text-right font-numeric text-on-surface" /></label>)}</div>
                  </div>
                </div>}
              </div>

              {/* Financial Advocate Mode: Penalty Terms Section */}'''
if ui_anchor not in s: raise SystemExit('shared loan UI anchor not found')
s = s.replace(ui_anchor, ui, 1)
p.write_text(s)

# Affordability test: shared loan fallback protects only this user's expected share.
p = Path('src/domain/affordability.test.ts')
s = p.read_text()
s = s.replace('''import type { Account, Category, CreditCardInfo, RecurringRule, Transaction } from '../types';''', '''import type { Account, Category, CreditCardInfo, LoanContributionRule, LoanSharingRule, Person, RecurringRule, Transaction } from '../types';''', 1)
anchor = '''  it('uses loan EMI metadata as a fallback obligation when no explicit payment covers it', () => {
    const loan = liability('loan', 100000, { monthlyEMI: 5000, nextEMIDate: '2026-09-05', paymentFrequency: 'MONTHLY' });
    const result = run({ accounts: [bank('bank', 40000), loan] });
    expect(result.expectedExpenses).toBe(5000);
  });
'''
insert = anchor + '''
  it('uses only the users configured share for an automatic shared-loan EMI fallback', () => {
    const loan = liability('loan', 100000, { monthlyEMI: 20000, nextEMIDate: '2026-09-05', paymentFrequency: 'MONTHLY' });
    const people: Person[] = [
      { id: 'me', name: 'Me', isSelf: true, isArchived: false },
      { id: 'brother', name: 'Brother', isSelf: false, isArchived: false },
    ];
    const loanSharingRules: LoanSharingRule[] = [{ accountId: 'loan', personalResponsibilityPercent: 50, isShared: true }];
    const loanContributionRules: LoanContributionRule[] = [
      { id: 'mine', accountId: 'loan', personId: 'me', mode: 'PERCENT', value: 60, isActive: true },
      { id: 'his', accountId: 'loan', personId: 'brother', mode: 'PERCENT', value: 40, isActive: true },
    ];
    const result = run({ accounts: [bank('bank', 40000), loan], people, loanSharingRules, loanContributionRules });
    expect(result.expectedExpenses).toBe(12000);
  });
'''
if anchor not in s: raise SystemExit('affordability loan test anchor not found')
s = s.replace(anchor, insert, 1)
p.write_text(s)
