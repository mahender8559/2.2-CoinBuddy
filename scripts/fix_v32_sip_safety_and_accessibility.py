from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Anchor missing in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))

# New Investment + SIP is one database transaction: never leave an account
# persisted without its managed recurring rule if rule creation fails.
replace_once(
    'src/context/AppContext.tsx',
    """    if (dbDriver) {\n      persistDbAction(async () => {\n        await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id);\n        await syncInvestmentSipRecurringRule(dbDriver, newId, { ...newAccount, balance: initialBalance }, options.sipSourceAccountId);\n      });\n    }\n""",
    """    if (dbDriver) {\n      persistDbAction(async () => {\n        await dbDriver.execute('BEGIN TRANSACTION');\n        try {\n          await insertAccountRow(dbDriver, newAccount, initialBalance, openingTx?.id, false);\n          await syncInvestmentSipRecurringRule(dbDriver, newId, { ...newAccount, balance: initialBalance }, options.sipSourceAccountId);\n          await dbDriver.execute('COMMIT');\n        } catch (error) {\n          await dbDriver.execute('ROLLBACK');\n          throw error;\n        }\n      });\n    }\n""",
)

# Remove the auto-guessed funding account. Source-of-funds is financially
# meaningful, so the user must explicitly choose it for new/legacy SIPs.
p = Path('src/components/AddAccountModal.tsx')
text = p.read_text()
auto = """  useEffect(() => {\n    if (group !== 'Investment' || investmentMethod !== 'SIP' || sipSourceAccountId) return;\n    const defaultSource = accounts.find(account => account.type === 'asset' && account.is_archived !== 1 && !['Investment', 'Physical Asset'].includes(String(account.group ?? '')));\n    if (defaultSource) setSipSourceAccountId(defaultSource.id);\n  }, [group, investmentMethod, sipSourceAccountId, accounts]);\n\n"""
if auto not in text:
    raise SystemExit('SIP default-source effect anchor missing')
text = text.replace(auto, '', 1)

# Explicit accessible names for investment inputs; their visual labels are
# siblings rather than wrapping labels in the existing account form.
text = text.replace("""<CurrencyInput\n                    required\n                    value={investedAmount}""", """<CurrencyInput\n                    aria-label=\"Total Invested Amount\"\n                    required\n                    value={investedAmount}""", 1)
# The first matching investment balance input sits immediately after investedAmount.
market_anchor = """<CurrencyInput\n                    required\n                    value={balance}\n                    onValueChange={setBalance}\n                    className=\"w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all\"\n                    placeholder=\"0.00\"\n                  />"""
market_replacement = market_anchor.replace('<CurrencyInput\n', '<CurrencyInput\n                    aria-label="Current Market Value"\n', 1)
if market_anchor not in text:
    raise SystemExit('Investment market-value input anchor missing')
text = text.replace(market_anchor, market_replacement, 1)
text = text.replace("""<CurrencyInput\n                      required\n                      value={monthlySIPAmount}""", """<CurrencyInput\n                      aria-label=\"Monthly SIP Amount\"\n                      required\n                      value={monthlySIPAmount}""", 1)
text = text.replace("""<input \n                      type=\"date\"\n                      required\n                      value={nextSIPDate}""", """<input \n                      aria-label=\"Next SIP Date\"\n                      type=\"date\"\n                      required\n                      value={nextSIPDate}""", 1)
p.write_text(text)

# Existing pre-v3.2 SIP metadata has no funding-account relationship. Surface
# that clearly rather than silently guessing a source.
p = Path('src/components/Cards.tsx')
text = p.read_text()
if "findInvestmentSipRule" not in text:
    text = text.replace("import { ReconcileWizard } from './ReconcileWizard';", "import { ReconcileWizard } from './ReconcileWizard';\nimport { findInvestmentSipRule } from '../domain/investmentSip';", 1)
text = text.replace("""    setEditingCreditCard \n  } = useAppContext();""", """    setEditingCreditCard,\n    recurringRules\n  } = useAppContext();""", 1)
text = text.replace("""            const isInvestment = account.group === 'Investment';\n            const profitLoss""", """            const isInvestment = account.group === 'Investment';\n            const hasConfiguredSip = Boolean(isInvestment && account.investmentMethod === 'SIP' && findInvestmentSipRule(account.id, recurringRules));\n            const needsSipLink = Boolean(isInvestment && account.investmentMethod === 'SIP' && Number(account.monthlySIPAmount ?? 0) > 0 && account.nextSIPDate && !hasConfiguredSip);\n            const profitLoss""", 1)
text = text.replace("""                    <p className=\"text-xs text-on-surface-variant\">{account.group || 'Asset account'}</p>\n                  </div>""", """                    <p className=\"text-xs text-on-surface-variant\">{account.group || 'Asset account'}</p>\n                    {needsSipLink && <p className=\"mt-1 text-[11px] font-semibold text-amber-500\">SIP schedule needs a funding account — edit this investment to link it.</p>}\n                  </div>""", 1)
p.write_text(text)

print('Hardened v3.2 SIP save safety, source selection, accessibility and legacy-account warning.')
