# CoinBuddy QA Audit — Bug & Deviation Report
Source: `2.2-CoinBuddy-main` vs `CoinBuddy_Developer_Rulebook_V2`

## 1. Privacy Mode (Rulebook §8)
- **Scoped, not global.** `balancesVisible` toggle exists only in `Dashboard.tsx` (local `useState`, persisted to `localStorage['coinbuddy_balances_visible']`). It is **not** in `AppContext`, **not** in `Header.tsx`.
- Rulebook requires a *persistent header* toggle masking figures *across the app*. Actual toggle only masks 3 Dashboard hero metrics (Net Worth, Total Assets, Total Liabilities). Amounts in Activity, Cards, Insights, ManageFinances, WalletSummaryModal remain fully visible regardless of toggle state — confirmed no other file references `balancesVisible`.
- **Verdict: Partial implementation, wrong scope/location.**

## 2. Credit Card Guardrails (Rulebook §3)
- `updateAccount()` (`AppContext.tsx` L984-989) correctly blocks lowering `limit` below `targetAccount.balance` — **but this function is never invoked for Credit Cards.**
- `AddAccountModal` routes CC edits to `updateCreditCard()` (L861-916) instead, which has **zero limit-vs-balance validation**. A user can set a credit limit below current outstanding debt with no error.
- Revolving strict ceiling on new **expenses** is correctly enforced (`addTransaction`, L616-620, L646-650). ✅
- `updateCreditCard()` force-sets `balance: 0` on the account/card record on every edit and only rewrites the amount of the OPENING_BALANCE tx — if the card already has non-opening ledger activity, editing it does not go through a proper `BALANCE_ADJUSTMENT`, risking desync from "balances are computed views" principle.

## 3. Balance Adjustment Math & Flow (Rulebook §2–3)
- `ReconcileWizard.tsx` `targetIsTo` direction logic correctly mirrors `SIGN_RULES` (asset: actual>cached → `to`; liability: actual<cached → `to`). ✅
- `ledgerRules.ts` `SIGN_RULES` table and `applyTransactionEffect()` correctly implement the full transaction matrix incl. self-transfer no-op guard and interest-only exclusion. ✅

## 4. Rollover Budgets (Rulebook §5)
- `getBudgetSummary()` correctly implements `Bk = L + max(0, Bk-1 − Ek-1)`, cycle-by-cycle carry accumulation. ✅ No deviation found.

## 5. Cash-Flow Chart Filtering (Rulebook §2)
- `isCashFlowTransaction()` correctly limits to INCOME/EXPENSE only; MARKET_ADJUSTMENT/BALANCE_ADJUSTMENT are excluded from Insights, Sankey, Runway, and Budget calcs everywhere it's used. ✅

## 6. Backup & Restore — Bugs / Redundancies (deep dive)
1. **Duplicate validation** — `validateLedgerImport(data)` runs twice per restore: once in `AppContext.importLedgerData()` (L1331) and again inside `importLedgerToDatabase()` (L669).
2. **Duplicate base64 helpers** — `bufferToBase64`/`base64ToBuffer` independently reimplemented in both `backupManager.ts` and `dbClient.ts`.
3. **Dead computation** — `upgradeBackupData()` calls `recomputeAllAccountBalances()` + `syncCreditCardsWithAccounts()` to bake balances into migrated JSON, but `importLedgerToDatabase()` never persists `account.balance` (balances are re-derived live from the ledger; state is stripped via `stripAccountBalances`/`stripCardBalances` post-import). Wasted work every restore.
4. **Hardcoded fallback magic numbers** — `BackupStorageAdapter.uploadBackup()` (`parsedMeta.accountCount || 4`, `... || 38`) and `BackupSecurity.handleUnlockBackup()` (`accounts.length || 4`, `transactions.length || 38`) fall back to leftover demo-data counts instead of `0`. Misrepresents metadata on parse failure or a genuinely empty backup.
5. **Google Drive retention is a no-op** — `uploadBackup()` returns early for `GOOGLE_DRIVE` (L427) *without* touching `readHistory`/`writeHistory`. `executeManualBackup()` still calls `pruneOldBackups(5, 'GOOGLE_DRIVE')` afterward, but that only prunes the local (irrelevant/empty) registry. **No `files.delete` call exists anywhere** — confirmed no delete endpoint under `api/google-drive/`. Old Drive backups accumulate forever, contradicting the stated "keeps top N, deletes older files from provider" retention policy.
6. **Legacy-payload trust** — `decryptBackup()` silently accepts any unencrypted JSON containing `accounts`/`transactions`/`categories` and returns it as-is, bypassing password enforcement — no UI warning surfaces this to the user.
7. **Two schema authorities** — `upgradeBackupData()` (backupManager) tolerantly migrates arbitrary legacy shapes, but `validateLedgerImport()` (dbClient) strictly requires `schemaVersion === 'coinbuddy-ledger-v3'` afterward. Both must be manually kept in sync; drift between them silently breaks restores.

## Summary Table

| Area | Status |
|---|---|
| Privacy Mode (global masking) | ❌ Wrong scope (Dashboard-only) |
| Credit limit edit guardrail | ❌ Missing on actual CC edit path |
| Credit ceiling on expense | ✅ Correct |
| Balance adjustment direction math | ✅ Correct |
| Rollover budget formula | ✅ Correct |
| Cash-flow chart exclusion | ✅ Correct |
| Backup/restore — validation redundancy | ⚠️ Duplicate work |
| Backup/restore — GDrive retention | ❌ Non-functional |
| Backup/restore — metadata fallback | ❌ Misleading defaults |
