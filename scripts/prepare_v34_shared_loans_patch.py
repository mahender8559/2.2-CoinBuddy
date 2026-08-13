from pathlib import Path

p = Path('src/context/AppContext.tsx')
s = p.read_text()
old = """      if (dbDriver) {
        persistDbAction(async () => {
          await updateAccountRow(dbDriver, { ...account, id, balance: 0 });
          if (newOpeningTx) {
            await insertTransactionRow(dbDriver, newOpeningTx);
          }
          await syncInvestmentSipRecurringRule(dbDriver, id, { ...account, id }, options.sipSourceAccountId);
        });
      }
"""
new = """      const mergedAccount = { ...account, id, balance: 0 };
      if (dbDriver) {
        persistDbAction(async () => {
          await updateAccountRow(dbDriver, mergedAccount);
          if (newOpeningTx) await insertTransactionRow(dbDriver, newOpeningTx);
          await syncInvestmentSipRecurringRule(dbDriver, id, { ...mergedAccount, balance: account.balance }, options.sipSourceAccountId);
        });
      }
"""
if old not in s:
    raise SystemExit('secondary account update anchor not found')
p.write_text(s.replace(old, new, 1))

p = Path('src/domain/affordability.ts')
s = p.read_text()
old = """  projectLoanFallbacks(
    accounts,
    creditCardIds,
    input.asOfDate,
    input.endDate,
    accumulator,
  );"""
new = """  projectLoanFallbacks(accounts, creditCardIds, input.asOfDate, input.endDate, accumulator);"""
if old not in s:
    raise SystemExit('affordability fallback call anchor not found')
p.write_text(s.replace(old, new, 1))
