from pathlib import Path


def edit(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f'anchor missing in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, count))

# Repository: fulfilled target = current reserve + already-consumed lender payments.
edit('src/db/loanPayoffRepository.ts', '''async function signedReserved(driver: SqlJsDatabaseDriver, whereSql: string, params: unknown[]): Promise<number> {
  const rows = await driver.query(`SELECT COALESCE(SUM(CASE WHEN movement_type = 'RESERVE' THEN amount ELSE -amount END), 0) AS reserved FROM loan_payoff_fund_movements WHERE ${whereSql}`, params as any[]);
  return Math.max(0, Math.round(Number(rows[0]?.reserved ?? 0) * 100) / 100);
}
''', '''async function signedReserved(driver: SqlJsDatabaseDriver, whereSql: string, params: unknown[]): Promise<number> {
  const rows = await driver.query(`SELECT COALESCE(SUM(CASE WHEN movement_type = 'RESERVE' THEN amount ELSE -amount END), 0) AS reserved FROM loan_payoff_fund_movements WHERE ${whereSql}`, params as any[]);
  return Math.max(0, Math.round(Number(rows[0]?.reserved ?? 0) * 100) / 100);
}

async function consumedAmount(driver: SqlJsDatabaseDriver, whereSql: string, params: unknown[]): Promise<number> {
  const rows = await driver.query(`SELECT COALESCE(SUM(amount), 0) AS consumed FROM loan_payoff_fund_movements WHERE movement_type = 'CONSUME' AND ${whereSql}`, params as any[]);
  return Math.max(0, Math.round(Number(rows[0]?.consumed ?? 0) * 100) / 100);
}

async function fundedAmount(driver: SqlJsDatabaseDriver, whereSql: string, params: unknown[]): Promise<number> {
  const reserved = await signedReserved(driver, whereSql, params);
  const consumed = await consumedAmount(driver, whereSql, params);
  return Math.round((reserved + consumed) * 100) / 100;
}

async function completePlanIfTargetPaid(driver: SqlJsDatabaseDriver, plan: LoanPayoffPlan): Promise<void> {
  const consumed = await consumedAmount(driver, `plan_id = ?`, [plan.id]);
  if (consumed + 0.009 >= plan.targetAmount) {
    await driver.execute(`UPDATE loan_payoff_plans SET status = 'COMPLETED' WHERE id = ? AND status = 'ACTIVE'`, [plan.id]);
  }
}
''')

edit('src/db/loanPayoffRepository.ts', "  if (!Number.isFinite(targetMs)) throw new Error('Target date is invalid.');", "  if (!Number.isFinite(targetMs)) throw new Error('Target date is invalid.');\n  const todayKey = new Date().toISOString().slice(0, 10);\n  if (input.targetDate < todayKey) throw new Error('Target date cannot be in the past.');")
edit('src/db/loanPayoffRepository.ts', "const liabilityRows = await driver.query(`SELECT id, name, type, cached_balance FROM account_balances_view WHERE id = ? AND is_archived = 0`, [input.liabilityAccountId]);", "const liabilityRows = await driver.query(`SELECT id, name, type, subtype, cached_balance FROM account_balances_view WHERE id = ? AND is_archived = 0`, [input.liabilityAccountId]);")
edit('src/db/loanPayoffRepository.ts', "  if (!liability || String(liability.type).toUpperCase() !== 'LIABILITY') throw new Error('Choose an active loan liability.');", "  if (!liability || String(liability.type).toUpperCase() !== 'LIABILITY') throw new Error('Choose an active loan liability.');\n  if (String(liability.subtype ?? '').trim().toLowerCase() === 'credit card') throw new Error('Loan payoff plans are for installment loans, not revolving credit cards.');")
edit('src/db/loanPayoffRepository.ts', '''    const reserved = await signedReserved(driver, `plan_id = ?`, [existing.id]);
    if (targetAmount + 0.009 < reserved) throw new Error(`Release reserved funds before lowering the target below ${reserved.toFixed(2)}.`);''', '''    const funded = await fundedAmount(driver, `plan_id = ?`, [existing.id]);
    if (targetAmount + 0.009 < funded) throw new Error(`The target cannot be lowered below ${funded.toFixed(2)}, which is already reserved or paid toward this plan.`);''')
edit('src/db/loanPayoffRepository.ts', '''  const personReserved = await signedReserved(driver, `plan_id = ? AND person_id = ?`, [plan.id, input.personId]);
  if (personReserved + amount > Number(responsibility[0].target_amount) + 0.009) throw new Error('This reserve would exceed the contributor target.');
  const planReserved = await signedReserved(driver, `plan_id = ?`, [plan.id]);
  if (planReserved + amount > plan.targetAmount + 0.009) throw new Error('This reserve would exceed the payoff target.');''', '''  const personFunded = await fundedAmount(driver, `plan_id = ? AND person_id = ?`, [plan.id, input.personId]);
  if (personFunded + amount > Number(responsibility[0].target_amount) + 0.009) throw new Error('This reserve would exceed the contributor target after including amounts already paid.');
  const planFunded = await fundedAmount(driver, `plan_id = ?`, [plan.id]);
  if (planFunded + amount > plan.targetAmount + 0.009) throw new Error('This reserve would exceed the remaining payoff target.');''')
edit('src/db/loanPayoffRepository.ts', '''  return Math.round(consumed * 100) / 100;
}

export async function consumeExternalReservedForLoanPayment''', '''  await completePlanIfTargetPaid(driver, plan);
  return Math.round(consumed * 100) / 100;
}

export async function consumeExternalReservedForLoanPayment''')
edit('src/db/loanPayoffRepository.ts', '''  await driver.execute(`INSERT INTO loan_payoff_fund_movements (id, plan_id, person_id, asset_account_id, holding_type, movement_type, amount, transaction_id, external_loan_contribution_id, created_at) VALUES (?, ?, ?, NULL, 'EXTERNAL', 'CONSUME', ?, NULL, ?, ?)`, [crypto.randomUUID(), plan.id, input.personId, consume, input.externalLoanContributionId ?? null, nowIso()]);
  return consume;''', '''  await driver.execute(`INSERT INTO loan_payoff_fund_movements (id, plan_id, person_id, asset_account_id, holding_type, movement_type, amount, transaction_id, external_loan_contribution_id, created_at) VALUES (?, ?, ?, NULL, 'EXTERNAL', 'CONSUME', ?, NULL, ?, ?)`, [crypto.randomUUID(), plan.id, input.personId, consume, input.externalLoanContributionId ?? null, nowIso()]);
  await completePlanIfTargetPaid(driver, plan);
  return consume;''')

# Planning adapters: protect remaining target over the months leading to the target date.
for path in ['src/components/AffordabilityPlanner.tsx', 'src/components/SmarterPlanningDashboard.tsx', 'src/components/UpcomingMoney.tsx']:
    text = Path(path).read_text()
    if "loanPayoffPlansToPlanningGoals" not in text:
        insert_after = "import { useAppContext } from '../context/AppContext';\n"
        if insert_after not in text:
            raise RuntimeError(f'context import anchor missing in {path}')
        text = text.replace(insert_after, insert_after + "import { loanPayoffPlansToPlanningGoals } from '../domain/loanPayoff';\n", 1)
        Path(path).write_text(text)

edit('src/components/AffordabilityPlanner.tsx', "sharedTemplateResponsibilities, monthCycleDay, formatCurrency, getSpendableBalance } = useAppContext();", "sharedTemplateResponsibilities, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements, monthCycleDay, formatCurrency, getSpendableBalance } = useAppContext();")
edit('src/components/AffordabilityPlanner.tsx', "  const planningAccounts = useMemo(() => accounts.map(account => account.type === 'asset' ? { ...account, balance: getSpendableBalance(account.id) } : account), [accounts, getSpendableBalance]);", "  const planningAccounts = useMemo(() => accounts.map(account => account.type === 'asset' ? { ...account, balance: getSpendableBalance(account.id) } : account), [accounts, getSpendableBalance]);\n  const planningGoals = useMemo(() => [...savingsGoals, ...loanPayoffPlansToPlanningGoals(loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements)], [savingsGoals, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements]);")
edit('src/components/AffordabilityPlanner.tsx', "      savingsGoals,\n      monthCycleDay,", "      savingsGoals: planningGoals,\n      monthCycleDay,")
edit('src/components/AffordabilityPlanner.tsx', "buildUpcomingMoneyProjection({ ...horizon, accounts: planningAccounts, transactions, recurringRules, creditCards, savingsGoals })", "buildUpcomingMoneyProjection({ ...horizon, accounts: planningAccounts, transactions, recurringRules, creditCards, savingsGoals: planningGoals })")
edit('src/components/AffordabilityPlanner.tsx', "[horizon, planningAccounts, transactions, recurringRules, creditCards, savingsGoals]", "[horizon, planningAccounts, transactions, recurringRules, creditCards, planningGoals]")

edit('src/components/SmarterPlanningDashboard.tsx', "const { accounts, transactions, recurringRules, creditCards, savingsGoals, formatCurrency, getSpendableBalance } = useAppContext();", "const { accounts, transactions, recurringRules, creditCards, savingsGoals, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements, formatCurrency, getSpendableBalance } = useAppContext();")
edit('src/components/SmarterPlanningDashboard.tsx', "  const liabilities = useMemo", "  const planningGoals = useMemo(() => [...savingsGoals, ...loanPayoffPlansToPlanningGoals(loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements)], [savingsGoals, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements]);\n  const liabilities = useMemo")
edit('src/components/SmarterPlanningDashboard.tsx', "savingsGoals })", "savingsGoals: planningGoals })")
edit('src/components/SmarterPlanningDashboard.tsx', "[planningAccounts, transactions, recurringRules, creditCards, savingsGoals]", "[planningAccounts, transactions, recurringRules, creditCards, planningGoals]")

edit('src/components/UpcomingMoney.tsx', "const { accounts, transactions, recurringRules, creditCards, savingsGoals, monthCycleDay, formatCurrency, getSpendableBalance } = useAppContext();", "const { accounts, transactions, recurringRules, creditCards, savingsGoals, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements, monthCycleDay, formatCurrency, getSpendableBalance } = useAppContext();")
edit('src/components/UpcomingMoney.tsx', "  const projection = useMemo", "  const planningGoals = useMemo(() => [...savingsGoals, ...loanPayoffPlansToPlanningGoals(loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements)], [savingsGoals, loanPayoffPlans, loanPayoffResponsibilities, loanPayoffFundMovements]);\n  const projection = useMemo")
edit('src/components/UpcomingMoney.tsx', "savingsGoals })", "savingsGoals: planningGoals })")
edit('src/components/UpcomingMoney.tsx', "[horizon, planningAccounts, transactions, recurringRules, creditCards, savingsGoals]", "[horizon, planningAccounts, transactions, recurringRules, creditCards, planningGoals]")

# UI distinguishes money ready now from money already paid toward the target.
edit('src/components/LoanPayoffPlanModal.tsx', '''<section className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-primary"><LockKeyhole className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Reserved funds</span></div><strong className="mt-2 block text-2xl font-numeric text-on-surface">{formatCurrency(summary.reserved)}</strong><p className="mt-1 text-xs text-on-surface-variant">of {formatCurrency(summary.target)} · {summary.progress.toFixed(0)}% ready</p></div>{summary.funded ?''', '''<section className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-primary"><LockKeyhole className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Payoff progress</span></div><strong className="mt-2 block text-2xl font-numeric text-on-surface">{formatCurrency(summary.fundedAmount)}</strong><p className="mt-1 text-xs text-on-surface-variant">of {formatCurrency(summary.target)} · {summary.progress.toFixed(0)}% funded</p><p className="mt-1 text-[10px] text-on-surface-variant">Ready now {formatCurrency(summary.reserved)} · already paid {formatCurrency(summary.consumed)}</p></div>{summary.funded ?''')

# Unit tests are updated but intentionally not run by CI.
edit('src/domain/loanPayoff.test.ts', "expect(getLoanPayoffFundingSummary(plan, responsibilities, movements)).toMatchObject({ reserved: 90000, remaining: 110000, progress: 45, funded: false });", "expect(getLoanPayoffFundingSummary(plan, responsibilities, movements)).toMatchObject({ reserved: 90000, consumed: 0, fundedAmount: 90000, remaining: 110000, progress: 45, funded: false });")
edit('src/domain/loanPayoff.test.ts', "  it('requires contributor targets", "  it('keeps consumed lender payments counted toward payoff progress', () => {\n    const paid = [...movements, { id: 'm4', planId: 'plan', personId: 'me', assetAccountId: 'hdfc', holdingType: 'TRACKED' as const, movementType: 'CONSUME' as const, amount: 50000, createdAt: '2026-09-02T00:00:00.000Z' }];\n    expect(getLoanPayoffFundingSummary(plan, [], paid)).toMatchObject({ reserved: 40000, consumed: 50000, fundedAmount: 90000, remaining: 110000, progress: 45 });\n  });\n\n  it('requires contributor targets")

print('Refined loan payoff progress and planning integration.')
