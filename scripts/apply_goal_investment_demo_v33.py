from pathlib import Path
import re


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'{label} anchor not found in {path}')
    p.write_text(s.replace(old, new, 1))


# Preserve long-lived demo account ids used by browser regression fixtures.
p = Path('DemoData.json')
s = p.read_text()
for old, new in {
    'acc_salary_bank': 'acc_sbi_01',
    'acc_cash': 'acc_cash_01',
    'acc_credit': 'acc_idfc_01',
    'acc_car_loan': 'acc_bike_loan',
}.items():
    s = s.replace(old, new)
p.write_text(s)

# Investment-linked Goals are valid for progress tracking. Their balance simply
# remains outside affordability liquid cash/reserve calculations.
replace_once(
    'src/db/sqliteSchema.ts',
    """      if (goal?.protectLinkedBalance && linked) {\n        const group = String(linked.subtype ?? '').trim().toLowerCase();\n        if (group === 'investment' || group === 'physical asset') addIssue('GOAL_PROTECTED_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} cannot protect a non-liquid ${String(linked.subtype)} balance as cash reserve.`, id);\n      }\n""",
    """      // Any active Asset may track Goal progress. Affordability independently\n      // decides whether that linked account is liquid enough to count as cash/reserve,\n      // so Investment and Physical Asset links are valid and need no integrity warning.\n""",
    'goal non-liquid integrity warning',
)

replace_once(
    'src/context/AppContext.tsx',
    """  seedDemoData,\n  insertAccountRow,""",
    """  seedDemoData,\n  loadDemoDataFromJson,\n  insertAccountRow,""",
    'demo loader import',
)
replace_once(
    'src/context/AppContext.tsx',
    """    const repairable = new Set(['CATEGORY_AFFORDABILITY', 'RECURRING_ARCHIVED_ACCOUNT', 'RECURRING_SOURCE', 'RECURRING_DESTINATION', 'RECURRING_SELF_TRANSFER', 'RECURRING_DATE', 'CREDIT_CARD_DUE', 'GOAL_ACCOUNT', 'GOAL_PROTECTED_ACCOUNT', 'GOAL_TRANSACTION_LINK', 'GOAL_RECURRING_LINK']);""",
    """    const repairable = new Set(['CATEGORY_AFFORDABILITY', 'RECURRING_ARCHIVED_ACCOUNT', 'RECURRING_SOURCE', 'RECURRING_DESTINATION', 'RECURRING_SELF_TRANSFER', 'RECURRING_DATE', 'CREDIT_CARD_DUE', 'GOAL_ACCOUNT', 'GOAL_TRANSACTION_LINK', 'GOAL_RECURRING_LINK']);""",
    'repairable goal protected code',
)
replace_once(
    'src/context/AppContext.tsx',
    """    const goalIssueIds = new Set(selected.filter(issue => issue.code === 'GOAL_ACCOUNT' || issue.code === 'GOAL_PROTECTED_ACCOUNT').map(issue => issue.entityId).filter(Boolean));""",
    """    const goalIssueIds = new Set(selected.filter(issue => issue.code === 'GOAL_ACCOUNT').map(issue => issue.entityId).filter(Boolean));""",
    'goal issue repair filter',
)
replace_once(
    'src/context/AppContext.tsx',
    """  const resetToDemoData = () => {\n    void deletePersistedDatabase().finally(() => window.location.reload());\n  };""",
    """  const resetToDemoData = () => {\n    if (!dbDriver) {\n      window.alert('The local ledger is still loading. Please try again in a moment.');\n      return;\n    }\n    void (async () => {\n      try {\n        await loadDemoDataFromJson(dbDriver);\n        await persistDatabase(dbDriver);\n        window.location.reload();\n      } catch (error) {\n        console.error('Unable to load CoinBuddy demo data:', error);\n        window.alert(`Demo data could not be loaded: ${error instanceof Error ? error.message : String(error)}`);\n      }\n    })();\n  };""",
    'reset demo implementation',
)

# Replace the legacy partial demo importer with the normal full ledger import path
# plus relative-date hydration so the showcase remains useful in future months.
p = Path('src/db/dbClient.ts')
s = p.read_text()
pattern = re.compile(r"export async function loadDemoDataFromJson\(driver: SqlJsDatabaseDriver\): Promise<void> \{.*?\n\}\n\nexport async function seedDemoData", re.S)
replacement = r"""function resolveDemoRelativeDate(offsetValue: unknown, dateOnly = false): string | undefined {
  if (offsetValue === undefined || offsetValue === null || offsetValue === '') return undefined;
  const offset = Number(offsetValue);
  if (!Number.isFinite(offset)) return undefined;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Math.trunc(offset));
  return dateOnly ? toLocalDateKey(date) : date.toISOString();
}

function hydrateDemoData(raw: any): any {
  const data = JSON.parse(JSON.stringify(raw ?? {}));
  data.accounts = (Array.isArray(data.accounts) ? data.accounts : []).map((account: any) => ({
    ...account,
    loanStartDate: resolveDemoRelativeDate(account.loanStartOffsetDays, true) ?? account.loanStartDate,
    nextEMIDate: resolveDemoRelativeDate(account.nextEMIOffsetDays, true) ?? account.nextEMIDate,
    nextSIPDate: resolveDemoRelativeDate(account.nextSIPOffsetDays, true) ?? account.nextSIPDate,
  }));
  data.events = (Array.isArray(data.events) ? data.events : []).map((event: any) => ({
    ...event,
    createdAt: resolveDemoRelativeDate(event.createdOffsetDays) ?? event.createdAt ?? new Date().toISOString(),
  }));
  data.transactions = (Array.isArray(data.transactions) ? data.transactions : []).map((tx: any) => ({
    ...tx,
    date: resolveDemoRelativeDate(tx.dateOffsetDays) ?? tx.date ?? new Date().toISOString(),
    dueDate: resolveDemoRelativeDate(tx.dueDateOffsetDays, true) ?? tx.dueDate,
  }));
  data.creditCards = (Array.isArray(data.creditCards) ? data.creditCards : []).map((card: any) => ({
    ...card,
    dueDate: resolveDemoRelativeDate(card.dueOffsetDays, true) ?? card.dueDate ?? '',
  }));
  data.recurringRules = (Array.isArray(data.recurringRules) ? data.recurringRules : []).map((rule: any) => ({
    ...rule,
    nextDueDate: resolveDemoRelativeDate(rule.nextDueOffsetDays, true) ?? rule.nextDueDate ?? toLocalDateKey(new Date()),
  }));
  data.savingsGoals = (Array.isArray(data.savingsGoals) ? data.savingsGoals : []).map((goal: any) => ({
    ...goal,
    targetDate: resolveDemoRelativeDate(goal.targetOffsetDays, true) ?? goal.targetDate,
    createdAt: resolveDemoRelativeDate(goal.createdOffsetDays) ?? goal.createdAt ?? new Date().toISOString(),
  }));
  data.loanRevisions = (Array.isArray(data.loanRevisions) ? data.loanRevisions : []).map((revision: any) => ({
    ...revision,
    effectiveDate: resolveDemoRelativeDate(revision.effectiveOffsetDays, true) ?? revision.effectiveDate ?? toLocalDateKey(new Date()),
  }));
  data.users_config = [{
    currency_code: data.currency ?? 'INR',
    month_cycle_day: Number(data.monthCycleDay ?? 25),
  }];
  return data;
}

export async function loadDemoDataFromJson(driver: SqlJsDatabaseDriver): Promise<void> {
  // Keep security/backup preferences intact. Demo data replaces the financial
  // ledger and planning examples, not the user's device protection choices.
  const existingSettings = await loadAppSettings(driver);
  const preservedKeys = ['passcode', 'biometric', 'backupConfig', 'backupHistory', 'theme', 'colorPalette'];
  const data = hydrateDemoData(demoData);
  await importLedgerToDatabase(driver, data, { skipValidation: true });
  if (data.profile && typeof data.profile === 'object') await upsertAppSetting(driver, 'profile', data.profile);
  await upsertAppSetting(driver, 'demoDatasetVersion', data.version ?? 'v3.3_showcase');
  for (const key of preservedKeys) {
    if (Object.prototype.hasOwnProperty.call(existingSettings, key)) await upsertAppSetting(driver, key, existingSettings[key]);
  }
}

export async function seedDemoData"""
next_s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit('loadDemoDataFromJson block anchor not found')
p.write_text(next_s)

# Goals UI: allow any asset for progress; only liquid links expose reserve protection.
replace_once(
    'src/components/GoalsPanel.tsx',
    """import { getGoalCurrentAmount, getGoalProgressPercent, getRequiredMonthlyContribution } from '../domain/savingsGoals';""",
    """import { getGoalCurrentAmount, getGoalProgressPercent, getRequiredMonthlyContribution } from '../domain/savingsGoals';\nimport { isLiquidCashAccount } from '../domain/affordability';""",
    'GoalsPanel affordability import',
)
replace_once(
    'src/components/GoalsPanel.tsx',
    """  const assetAccounts = accounts.filter(account => account.type === 'asset' && account.is_archived !== 1);""",
    """  const assetAccounts = accounts.filter(account => account.type === 'asset' && account.is_archived !== 1);\n  const selectedLinkedAccount = draft.linkedAccountId ? assetAccounts.find(account => account.id === draft.linkedAccountId) : undefined;\n  const selectedLinkedIsLiquid = selectedLinkedAccount ? isLiquidCashAccount(selectedLinkedAccount) : false;""",
    'GoalsPanel selected linked account',
)
replace_once(
    'src/components/GoalsPanel.tsx',
    """          const linked = goal.linkedAccountId ? accounts.find(account => account.id === goal.linkedAccountId) : undefined;""",
    """          const linked = goal.linkedAccountId ? accounts.find(account => account.id === goal.linkedAccountId) : undefined;\n          const linkedIsLiquid = linked ? isLiquidCashAccount(linked) : false;""",
    'GoalsPanel linked liquidity',
)
replace_once(
    'src/components/GoalsPanel.tsx',
    """              {goal.protectLinkedBalance && linked && <div className=\"mt-3 flex items-start gap-2 rounded-xl bg-primary/8 px-3 py-2 text-xs text-on-surface-variant\"><ShieldCheck className=\"mt-0.5 h-4 w-4 shrink-0 text-primary\" /><span>The current liquid balance of this linked account is protected as a cash reserve when applicable.</span></div>}""",
    """              {linked && !linkedIsLiquid && <div className=\"mt-3 flex items-start gap-2 rounded-xl bg-primary/8 px-3 py-2 text-xs text-on-surface-variant\"><ShieldCheck className=\"mt-0.5 h-4 w-4 shrink-0 text-primary\" /><span>{linked.name} tracks this Goal's progress, but as a {linked.group ?? 'non-liquid asset'} its balance stays excluded from affordability liquid cash and protected reserves.</span></div>}\n              {goal.protectLinkedBalance && linkedIsLiquid && linked && <div className=\"mt-3 flex items-start gap-2 rounded-xl bg-primary/8 px-3 py-2 text-xs text-on-surface-variant\"><ShieldCheck className=\"mt-0.5 h-4 w-4 shrink-0 text-primary\" /><span>The current liquid balance of this linked account is protected as a cash reserve in affordability.</span></div>}""",
    'GoalsPanel linked account note',
)
replace_once(
    'src/components/GoalsPanel.tsx',
    """              <label className=\"block\"><span className=\"text-sm font-semibold text-on-surface-variant\">Track progress from account</span><select value={draft.linkedAccountId ?? ''} onChange={event => setDraft(current => ({ ...current, linkedAccountId: event.target.value || undefined }))} className=\"mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none\"><option value=\"\">No linked account</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.group ?? 'Asset'})</option>)}</select></label>""",
    """              <label className=\"block\"><span className=\"text-sm font-semibold text-on-surface-variant\">Track progress from account</span><select value={draft.linkedAccountId ?? ''} onChange={event => { const linkedAccountId = event.target.value || undefined; const linkedAccount = linkedAccountId ? assetAccounts.find(account => account.id === linkedAccountId) : undefined; setDraft(current => ({ ...current, linkedAccountId, protectLinkedBalance: linkedAccount && isLiquidCashAccount(linkedAccount) ? current.protectLinkedBalance : false })); }} className=\"mt-1.5 w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-3 text-on-surface outline-none\"><option value=\"\">No linked account</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.group ?? 'Asset'})</option>)}</select>{selectedLinkedAccount && !selectedLinkedIsLiquid && <span className=\"mt-2 block text-xs leading-relaxed text-on-surface-variant\">Valid for Goal progress. This {selectedLinkedAccount.group ?? 'asset'} balance is intentionally excluded from Can I Afford It? liquid cash and protected reserve calculations.</span>}</label>""",
    'GoalsPanel account selector',
)
replace_once(
    'src/components/GoalsPanel.tsx',
    """              <label className=\"flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3\"><span><span className=\"block text-sm font-semibold text-on-surface\">Protect linked cash balance</span><span className=\"mt-0.5 block text-xs text-on-surface-variant\">Useful for an emergency fund. If the linked account is liquid, its current balance becomes a protected reserve in affordability.</span></span><input type=\"checkbox\" checked={draft.protectLinkedBalance} disabled={!draft.linkedAccountId} onChange={event => setDraft(current => ({ ...current, protectLinkedBalance: event.target.checked }))} className=\"mt-1 h-5 w-5 accent-primary\" /></label>""",
    """              <label className={`flex items-start justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container p-3 ${selectedLinkedIsLiquid ? 'cursor-pointer' : 'opacity-70'}`}><span><span className=\"block text-sm font-semibold text-on-surface\">Protect linked liquid cash balance</span><span className=\"mt-0.5 block text-xs text-on-surface-variant\">{selectedLinkedAccount && !selectedLinkedIsLiquid ? 'Not applicable to Investment or Physical Asset links. They can track Goal progress without becoming spendable cash.' : 'Useful for an emergency fund held in Bank, Savings, Cash or Wallet accounts. The balance becomes a protected affordability reserve.'}</span></span><input type=\"checkbox\" checked={draft.protectLinkedBalance} disabled={!draft.linkedAccountId || !selectedLinkedIsLiquid} onChange={event => setDraft(current => ({ ...current, protectLinkedBalance: event.target.checked }))} className=\"mt-1 h-5 w-5 accent-primary\" /></label>""",
    'GoalsPanel protect toggle',
)

# Small, guarded demo-data control in App Help.
replace_once(
    'src/components/Settings.tsx',
    """  const { theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, biometric, setBiometric, passcode, setPasscode, setManageCategoriesOpen, profile, setProfile, monthCycleDay, setMonthCycleDay, transactions, categories, accounts, clearAllData, verifyDataIntegrity, repairDataIntegrityIssues, lastUpdated, setOnboardingOpen, setButtonTourOpen, getStoredSetting } = useAppContext();""",
    """  const { theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, biometric, setBiometric, passcode, setPasscode, setManageCategoriesOpen, profile, setProfile, monthCycleDay, setMonthCycleDay, transactions, categories, accounts, clearAllData, resetToDemoData, verifyDataIntegrity, repairDataIntegrityIssues, lastUpdated, setOnboardingOpen, setButtonTourOpen, getStoredSetting } = useAppContext();""",
    'Settings demo context',
)
replace_once(
    'src/components/Settings.tsx',
    """        </div>\n      </section>\n\n      {/* Footer info */}""",
    """        </div>\n        <div className=\"mt-3 flex justify-center\">\n          <button type=\"button\" onClick={() => showConfirm('Load Demo Data', 'This replaces the current local CoinBuddy ledger on this device with a realistic v3.3 sample covering accounts, cards, loans, recurring schedules, pending confirmations, Events, Goals, SIPs, affordability and planning. Your passcode and backup/security preferences are preserved. Export or back up real financial data first.', () => resetToDemoData())} className=\"inline-flex min-h-8 items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary\" title=\"Replace this device's ledger with sample CoinBuddy data\">\n            <RefreshCw className=\"h-3.5 w-3.5\" /> Load demo data\n          </button>\n        </div>\n      </section>\n\n      {/* Footer info */}""",
    'Settings App Help demo button',
)

# Strengthen unit coverage for the exact emergency-fund use case.
replace_once(
    'src/domain/savingsGoals.test.ts',
    """  it('protects only linked liquid accounts as emergency reserve', () => {\n    const goals = [goal(), goal({ id: 'goal-2', linkedAccountId: 'invest' })];\n    expect(getProtectedGoalReserve(goals, [bank, investment])).toBe(60000);\n  });""",
    """  it('protects only linked liquid accounts as emergency reserve', () => {\n    const goals = [goal(), goal({ id: 'goal-2', linkedAccountId: 'invest' })];\n    expect(getProtectedGoalReserve(goals, [bank, investment])).toBe(60000);\n  });\n\n  it('allows an emergency Goal to track an Investment without making it affordability cash', () => {\n    const investmentGoal = goal({ linkedAccountId: 'invest', protectLinkedBalance: true });\n    expect(getGoalCurrentAmount(investmentGoal, [bank, investment])).toBe(120000);\n    expect(getProtectedGoalReserve([investmentGoal], [bank, investment])).toBe(0);\n  });""",
    'savings goal investment test',
)
