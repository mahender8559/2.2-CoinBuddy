# CoinBuddy — Improvement Opportunities
Non-blocking suggestions found while auditing the codebase. Not rulebook violations — quality/scale/UX upgrades.

## UI / Frontend

| # | Location | Improvement |
|---|---|---|
| 1 | `BackupSecurity.tsx` L405, L487 | Native `alert()` used for restore errors — breaks the app's own modal/toast design language, unstyled, blocking, not dark-mode aware. Replace with the same toast/inline-error pattern used elsewhere (e.g. `ReconcileWizard`'s inline `error` state). |
| 2 | Privacy toggle (`Dashboard.tsx`) | Move `balancesVisible` state up into `AppContext` and mask `formatCurrency` output app-wide (Activity amounts, Cards, Insights charts, WalletSummaryModal) — currently only 3 Dashboard numbers respect it. (Also flagged as a rulebook deviation in the bug audit; listing here as the concrete fix.) |
| 3 | `Activity.tsx` search (`searchQuery`, L13/102/137) | No debounce on the search input — every keystroke re-filters the full transaction array synchronously in a `useMemo`. Fine at demo scale, will jank on large ledgers (thousands of tx). Add a `useDeferredValue`/debounce. |
| 4 | `Activity.tsx` list rendering | No windowing/virtualization for the transaction list — all rows mount at once. Add `react-window`/`react-virtual` once ledgers grow past a few hundred rows. |
| 5 | Accessibility | Only 6 of 27 components use `aria-label` at all. Icon-only buttons (privacy eye, undo toast close, bulk-select action bar icons) are the highest-value targets for screen-reader labels. |
| 6 | `Dashboard.tsx` L28-29 | `totalAssets`/`totalLiabilities` computed via `.filter().reduce()` inline on every render, unmemoized (contrast with `accounts` itself, which *is* correctly `useMemo`'d in `AppContext`). Wrap in `useMemo([accounts])`. |
| 7 | Reconcile / Debt wizard | `reconciliationTooLarge` warning (20% of credit limit) is a hardcoded magic number with no explanation in the UI — surface the threshold to the user ("differences over 20% of your limit need manual review") instead of just the generic warning text. |
| 8 | Restore flow (`BackupSecurity.tsx`) | Step 4 preview shows account/transaction counts that can silently fall back to stale demo-data numbers (4 / 38) if metadata parsing fails — see bug audit item 4. Even after fixing the fallback, consider showing a clear "could not read metadata" state instead of any guessed number. |
| 9 | Google Drive backup UX | Since pruning is a no-op for Drive (bug audit item 5), the Settings screen gives no indication that Drive storage will grow unbounded. Until the backend fix ships, surface actual Drive usage/file count in the UI so users aren't surprised. |

## Backend / Architecture

| # | Location | Improvement |
|---|---|---|
| 1 | `dbClient.ts` `importLedgerToDatabase` (L668-711) | Restore inserts categories/accounts/events/transactions/cards/widgets/revisions in separate `await`-per-row loops (one SQL statement per row). Batch with multi-row `INSERT` or wrap rows in a single prepared-statement loop without per-row microtask overhead — restoring a large backup does hundreds of sequential awaits today. |
| 2 | `backupManager.ts` + `dbClient.ts` | `bufferToBase64`/`base64ToBuffer` duplicated in both files — extract to one shared `src/utils/encoding.ts` (also flagged in bug audit as redundancy #2). |
| 3 | `importLedgerData()` (`AppContext.tsx`) → `importLedgerToDatabase()` (`dbClient.ts`) | `validateLedgerImport()` runs twice per restore (bug audit #1) — validate once at the entry point and pass a typed/validated payload down. |
| 4 | `upgradeBackupData()` (`backupManager.ts`) | Recomputes account balances and syncs credit cards during migration even though the DB-driver restore path discards `account.balance` entirely (bug audit #3). Skip the recompute when a `dbDriver` is present, or route it only through the no-DB fallback branch. |
| 5 | Google Drive integration (`api/google-drive/*.js`) | No `DELETE` endpoint exists at all. Add `api/google-drive/delete.js` (or extend `backup.js`) and wire `pruneOldBackups()` to call it for the `GOOGLE_DRIVE` branch — currently retention is silently local-only (bug audit #5). |
| 6 | `generateDueRecurringTransactions()` (`dbClient.ts` L617+) | Per-rule `while` loop issues an individual `SELECT` to check for an existing transaction before each `INSERT`, one query at a time. For rules with a long overdue backlog (e.g. reinstalling after months offline) this is O(n) sequential round-trips; consider a single existence-check query per rule up front. |
| 7 | `validateLedgerImport()` / `upgradeBackupData()` split brain | Two independently-maintained schema authorities (tolerant migrator vs strict `v3`-only validator) — bug audit #7. Consolidate into one versioned schema module so a new field only needs to be taught to one place. |
| 8 | `decryptBackup()` | Silently accepts unencrypted "legacy" JSON with no explicit migration flag or logging. Add a `legacy: true` marker returned alongside the decrypted string so callers (and future maintainers) can distinguish "successfully decrypted" from "wasn't encrypted at all" instead of inferring it from shape. |
| 9 | `BackupStorageAdapter.uploadBackup()` | Local-provider backups store the *entire* encrypted payload string a second time inside the `coinbuddy_saved_backups` history record (`content: encryptedContent`, L446) in addition to whatever the browser download already wrote. For large ledgers this doubles `localStorage` usage per backup and works against the 5-file retention policy's intent (retention caps file *count*, not the cumulative bytes already sitting in `localStorage`). Consider storing history metadata only, with content re-derived from the downloaded file on restore-by-upload. |
