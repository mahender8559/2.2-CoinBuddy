# CoinBuddy — Play Store Deploy-Readiness Punch List
Consolidates all three prior reports into one prioritized fix list. Resolve P0 + P1 before submission.

---

## P0 — BLOCKERS (do not ship without fixing)

| # | Issue | File | Why it blocks launch |
|---|---|---|---|
| 1 | **Biometric vault unlock fails open.** Both unlock paths (`biometric && !passcode` and `biometric && passcode`, `App.tsx` L240-327) call `navigator.credentials.create()` (a *registration* ceremony, not authentication) instead of `.get()` against a previously enrolled credential — so it never actually verifies identity. Worse, the `catch` block unlocks the vault (`setUnlocked(true)`) for **any error except `NotAllowedError`**, and unlocks immediately if `window.PublicKeyCredential` is undefined. On many Android WebView/TWA configurations WebAuthn platform authenticators are unavailable or throw `NotSupportedError`/`SecurityError` — meaning the "biometric lock" on a finance vault can silently open with **no authentication at all**. | `src/App.tsx` | Security — this is the app's actual access-control gate for financial data. |
| 2 | **`assetlinks.json` still has placeholder values** — `package_name: "com.yourdomain.monthlytracker"` and `sha256_cert_fingerprints: ["YOUR_SHA256_FINGERPRINT_FROM_GOOGLE_PLAY_CONSOLE"]`. Must be replaced with the real TWA package ID and the signing certificate's SHA-256 fingerprint from Play Console before submission, or Digital Asset Links verification fails and the TWA falls back to showing a browser URL bar (fails Play's TWA quality bar / can cause outright rejection). | `public/.well-known/assetlinks.json` | Required for TWA/Play Store packaging. |
| 3 | Credit Card limit can be edited **below outstanding balance** with no validation (`updateCreditCard()` has no guard; the existing guard in `updateAccount()` is unreachable for CCs). | `src/context/AppContext.tsx` L861-916 | Direct violation of a stated financial invariant — silently produces an "over-limit" account state that the rest of the app doesn't expect. |
| 4 | Google Drive backup retention is a complete no-op — no delete endpoint exists, `pruneOldBackups()` silently operates on an empty/irrelevant local registry for the Drive branch. Backups accumulate in the user's Drive `appDataFolder` forever. | `src/utils/backupManager.ts`, `api/google-drive/*.js` | Users on limited Drive storage will eventually hit quota with no warning or control — bad first-week support burden. |
| 5 | Privacy Mode toggle only masks 3 numbers on the Dashboard; everywhere else (Activity amounts, Cards, Insights) stays visible while the toggle claims "hidden." | `src/components/Dashboard.tsx` | Misleading privacy control on a finance app — a shoulder-surfing user thinks their data is hidden when it isn't. |
| 6 | `GOOGLE_CLIENT_SECRET` and `GOOGLE_TOKEN_ENCRYPTION_KEY` are blank in `.env.example` with no startup validation that they're set in production. | `.env.example`, `api/_googleDrive.js` | Confirm these are populated as real secrets in the Vercel production environment (not committed) before launch; a missing encryption key for stored OAuth tokens would be a real vulnerability, not just a broken feature. |

---

## P1 — HIGH PRIORITY (fix before or very shortly after launch)

| # | Issue | File |
|---|---|---|
| 7 | `validateLedgerImport()` runs twice per restore (redundant, and a future divergence risk). | `AppContext.tsx` L1331, `dbClient.ts` L669 |
| 8 | Duplicate `bufferToBase64`/`base64ToBuffer` implementations. | `backupManager.ts`, `dbClient.ts` |
| 9 | `upgradeBackupData()` does wasted balance recomputation that the DB-driver restore path discards. | `backupManager.ts` |
| 10 | Metadata fallback defaults to stale demo numbers (`\|\| 4`, `\|\| 38`) instead of `0`/unknown state, on both the backup-write and restore-preview paths. | `backupManager.ts` L443-444, `BackupSecurity.tsx` L441-442 |
| 11 | Native `alert()` used for restore errors — inconsistent, unstyled, blocks the JS thread on mobile WebViews. | `BackupSecurity.tsx` L405, L487 |
| 12 | `decryptBackup()` silently accepts unencrypted "legacy" payloads with no user-facing warning. | `backupManager.ts` |
| 13 | Restore import (`importLedgerToDatabase`) does hundreds of sequential per-row `await`s with no batching — will be visibly slow restoring a large backup on a low/mid-range Android device. | `dbClient.ts` L668-711 |
| 14 | Two independently-maintained schema authorities (tolerant `upgradeBackupData` migrator vs strict `v3`-only `validateLedgerImport`) that must be kept in sync by hand. | `backupManager.ts`, `dbClient.ts` |

---

## P2 — RECOMMENDED, NOT BLOCKING

- Debounce Activity search input; virtualize the transaction list for large ledgers.
- Memoize `totalAssets`/`totalLiabilities` in `Dashboard.tsx`.
- Expand `aria-label` coverage (currently 6/27 components).
- Local backup history duplicates the full encrypted payload string in `localStorage` on top of the downloaded file — doubles storage per backup.
- Batch existence-check queries in `generateDueRecurringTransactions()` instead of one query per overdue occurrence.
- Surface the 20%-of-limit reconciliation threshold to the user instead of a generic warning.

---

## RECOMMENDED TESTS BEFORE SUBMISSION

**1. Security-focused (new — not in the earlier Playwright blueprint)**
- WebAuthn unlock: assert `.get()` (not `.create()`) is used, assert a thrown `NotSupportedError`/`SecurityError`/`AbortError` **keeps the vault locked**, assert no `PublicKeyCredential` support also **keeps it locked with a fallback to passcode**, not `setUnlocked(true)`.
- Passcode brute-force: verify there's no rate limit/lockout on repeated wrong-passcode attempts (`verifyPasscode`) — add one if missing.
- Confirm `GOOGLE_TOKEN_ENCRYPTION_KEY` / `GOOGLE_CLIENT_SECRET` are present in the deployed environment and OAuth tokens are actually encrypted at rest (`api/_googleDrive.js`).
- Attempt to decrypt a backup with a tampered ciphertext/IV — confirm AES-GCM auth-tag failure surfaces the generic "Invalid Password" error and never partially hydrates.

**2. Device / Play Store packaging (manual QA, not automatable in Playwright)**
- Verify Digital Asset Links: install the signed APK/AAB from Play Console internal testing track and confirm the TWA opens with **no URL bar** (validates `assetlinks.json` fingerprint match).
- Android back-button behavior at every screen depth (modals, wizards, onboarding) — TWAs must map hardware back to in-app navigation correctly or Play will flag it in review.
- Cold start + "Add to Home Screen" install flow on a real low-end Android device; measure Time-to-Interactive (SQLite/WASM init cost).
- Offline launch test: force airplane mode, relaunch app, confirm full functionality (per the offline-first architecture claim) with no unhandled network-error UI.
- Rotate/backgrounding: send app to background mid-transaction-entry and mid-restore; confirm no data loss or corrupted DB state on resume.
- Complete Play Console's **Data Safety form** against what's actually collected/stored (Google Drive OAuth token, locally stored financial ledger, no analytics/ads per this codebase) — must match code behavior exactly or risk suspension.

**3. Performance / scale (extend existing Vitest suite)**
- Load a synthetic ledger of 5,000+ transactions across 20+ accounts; benchmark `recomputeAllAccountBalances()` and Activity search filter time — this is the "computed balance, never stored" architecture's main scaling risk.
- Benchmark PBKDF2 (100,000 iterations) key derivation time on a low-end Android CPU via the WebView — both for backup encryption and passcode hashing; ensure the UI shows a spinner rather than appearing frozen.
- Restore-time benchmark for a 5,000-transaction backup given the sequential-insert pattern flagged in P1 #13.

**4. Regression coverage gaps (unit/vitest level)**
- Add a test asserting `updateCreditCard()` rejects `limit < balance` once fixed (P0 #3) — currently no test exists for this path (`dbClient.accountCreation.test.ts` covers creation, not the CC-specific edit function).
- Add a test for Google Drive prune actually issuing delete calls once the endpoint exists (P0 #4).
- Add a snapshot/property test (the repo already has `fast-check` as a dependency, currently unused for this) fuzzing `applyTransactionEffect()` across random transaction sequences to catch any future drift in `SIGN_RULES`.

**5. Full functional pass**
- Run the Playwright blueprint delivered earlier (`02_Playwright_Test_Blueprint.yaml`) end-to-end against a release build, not just dev — confirm DG-05 and UX-01 (both currently expected-fail) now pass once P0 items are fixed.
