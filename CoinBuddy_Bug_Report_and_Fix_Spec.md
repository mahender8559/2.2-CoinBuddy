# CoinBuddy — Bug Report & Fix Specification
**Audience:** An AI coding agent (e.g. Claude Code) that will implement these fixes directly in the repo.
**Source reviewed:** `2.2-CoinBuddy-main` (React + TypeScript + Vite + sql.js/SQLite, local-first PWA)
**Spec reviewed against:** `1. Core accounting model.txt` (14-section rulebook)
**Goal of this document:** Make the app (a) correct against the ledger-first accounting rules in the spec, (b) fully table/SQL-driven with a single source of truth instead of parallel JS re-implementations, and (c) reliably usable **offline** as a PWA.

Fix items are ordered by severity. Each item lists: the rule it violates, the exact file/function, why it's broken, and the required fix. Do not reorder logic without re-running `src/__tests__/*` and adding new tests for each fix (a `vitest` suite already exists — extend it, don't replace it).

---

## 0. Architecture-level finding (read this first)

The single biggest structural problem is that **the accounting rules are implemented three separate times, in three different languages/paradigms, and they already disagree with each other**:

1. `src/db/sqliteSchema.ts` → `account_balances_view` (SQL, authoritative for what gets read from disk)
2. `src/db/sqliteSchema.ts` → `auditDatabaseIntegrity()` (JS re-implementation of the same math, used only for a manual audit)
3. `src/utils/balanceManager.ts` → `recomputeAccountBalance()` (JS re-implementation, used for **all** in-memory/UI balance display and validation)
4. `src/context/AppContext.tsx` → `validateAndCalculateBalance()` (a **fourth** re-implementation, used only for opening-balance-edit limit checks)

The user's core ask ("app should follow the table-driven [rules], no JS [re-implementation]") means: **collapse these four implementations into one.** The SQL view (`account_balances_view`) should be the single source of truth for balances. All JS code should either (a) read balances from the SQL view result and never recompute them independently, or (b) if an in-memory (no-DB) code path is truly required for UI responsiveness, share one exported pure function that both the SQL-backed path and the in-memory path call — not four parallel hand-written copies of "if income and asset then +amount" logic.

**Required refactor:**
- Create a single module, e.g. `src/domain/ledgerRules.ts`, exporting one pure function `applyTransactionEffect(tx, accountType) -> delta` that encodes the sign rules from spec §3/§6 exactly once.
- `balanceManager.ts`, `sqliteSchema.ts`'s `auditDatabaseIntegrity`, and `AppContext.tsx`'s `validateAndCalculateBalance` must all call this one function instead of re-deriving the CASE/if-else logic themselves.
- Prefer making the SQL view (`account_balances_view`) generate its CASE expression from the same rule table if possible (e.g. keep the CASE in SQL, but add a mandatory unit test — see §8 — that runs the same fixture transactions through both the SQL view and the JS function and asserts identical output on every CI run, so they can never silently drift again).

Every bug below is, in effect, a symptom of this fragmentation.

---

## 1. 🔴 CRITICAL — Every transfer / credit-card payment / liability payment silently fails to persist

**Files:** `src/context/AppContext.tsx` (`transferFunds`, line ~1142), `src/db/dbClient.ts` (`insertTransactionRow`), `src/db/sqliteSchema.ts` (`CREATE_TABLES_SQL`, `transactions.amount CHECK(amount > 0)`)

**What happens:**
```ts
const transferFunds = (amount: number, fromId: string, toId: string) => {
  ...
  addTransaction({
    ...
    amount: -amount,   // <-- NEGATIVE amount is stored on the transaction object
    ...
    type: 'transfer',
    ...
  });
};
```
`payCreditCard()` and `payLiability()` both call `transferFunds()`, so this affects **every transfer, every credit-card payment, and the principal portion of every loan/EMI payment.**

The transaction is optimistically added to React state with `amount: -X`, so the UI appears to work. But the `transactions` table has:
```sql
amount REAL NOT NULL CHECK(amount > 0)
```
`insertTransactionRow()` in `dbClient.ts` inserts `tx.amount` verbatim (no `Math.abs`), so the SQLite `INSERT` **throws a CHECK constraint violation** every single time. That error is caught here:
```ts
const persistDbAction = async (action) => {
  try {
    await action();
    persistDatabase(dbDriver);
    await refreshStateFromDatabase(dbDriver);
  } catch (error) {
    console.error('SQLite persistence failed:', error);   // <-- swallowed, no user-facing error
  }
};
```
So the write is silently dropped. Nothing is written to `localStorage`'s serialized DB blob. On the next reload (or the next time any *other* successful action triggers `refreshStateFromDatabase`), the transfer/payment **disappears with no warning**, and the account balances silently revert — this is exactly the "ghost balance" failure mode spec §2 explicitly says the app must prevent.

**Fix:**
1. Never store a signed amount on a transaction. Direction is already fully expressed by `transaction_type` + `from_account_id`/`to_account_id`. Change `transferFunds` to pass `amount: Math.abs(amount)`.
2. As a defense-in-depth measure, make `insertTransactionRow`/`updateTransactionRow` in `dbClient.ts` always store `Math.abs(tx.amount)` and throw a clear, typed error *before* hitting the DB if `amount <= 0`, rather than relying on the SQL CHECK constraint to catch it.
3. **Stop swallowing persistence errors.** `persistDbAction` must re-throw (or return a `{success:false, error}` result) so callers like `addTransaction`/`updateTransaction` can surface a real error to the UI (a toast/snackbar), instead of leaving the UI in a state that contradicts what's on disk. A financial ledger must never fail silently.
4. Add a regression test: create an asset + liability account, call `payLiability`, assert the resulting row in the `transactions` table (not just React state) has `amount > 0`, and assert `persistDatabase`/`refreshStateFromDatabase` reflect the payment after a simulated reload.

---

## 2. 🔴 CRITICAL — Balances can silently be wrong/clamped instead of raising the "ghost balance" it's supposed to prevent

**File:** `src/utils/balanceManager.ts`, `recomputeAccountBalance()`
```ts
if (account.type === 'asset') {
  computed = Math.max(0, computed);
}
return computed;
```
Any asset account balance that computes to a negative number (due to a bad import, a race condition, the bug in §1, floating point drift, etc.) is **silently floored to 0** rather than surfaced. Per spec §2 ("This prevents 'ghost balances' where the UI shows a value that has no real transaction behind it"), a display value that doesn't match `SUM(ledger)` is precisely the ghost-balance scenario the whole architecture exists to prevent — and this line manufactures one on purpose, with no warning to the user or logging anywhere.

**Fix:**
- Remove the clamp. If a computed asset balance is negative, that is a real data-integrity problem and must be:
  - Surfaced via the existing `auditDatabaseIntegrity()` mechanism (already built for this — wire it up, see §7), and/or
  - Shown in the UI with a visible warning badge (there is already a `SafeValueBadge.tsx` component for exactly this pattern — use it here) instead of silently hidden.
- Only *prevent* negative balances via **upfront validation** at write time (already partially done in `validateTransaction`), never via *silent clamping* at read time.

---

## 3. 🔴 Two parallel/duplicated balance and validation engines disagree with each other (root cause of §1/§2/§4-class bugs)

Already covered architecturally in §0. Concretely:
- `balanceManager.recomputeAccountBalance()` uses `tx.type` (`'income'|'expense'|'transfer'`) and various fallback fields (`tx.account`, `tx.fromAccountId`, `tx.toAccountId`).
- `AppContext.validateAndCalculateBalance()` re-implements the *exact same* sign logic independently, with subtly different fallbacks (e.g. it defaults an unset account id to `'cash'` — `sourceId = tx.fromAccountId || tx.account || 'cash'` — a magic string that does not correspond to any real account id anywhere in the schema).
- `sqliteSchema.auditDatabaseIntegrity()` re-implements it a third time in terms of `transaction_type` (`'INCOME'|'EXPENSE'|'TRANSFER'|'OPENING_BALANCE'`) and DB column names.

**Fix:** Consolidate per §0. As an immediate tactical fix, remove the `|| 'cash'` fallback in `AppContext.tsx` (it's dead/misleading — no account with id `'cash'` is guaranteed to exist) and route both `balanceManager` and `AppContext`'s validators through one shared function.

---

## 4. 🟠 Opening balance validation logic contradicts the "table-driven" requirement and duplicates rule §5/§6 math

**File:** `src/context/AppContext.tsx`, `validateAndCalculateBalance()`

This function re-derives the "lowest historical cumulative balance" walk (spec §5, "Prevent invalid initial balance changes") entirely in JS over the in-memory `transactions` array, while `updateOpeningBalance()` in `sqliteSchema.ts` **separately** re-derives a much simpler version of the same check directly against SQL (`cached_balance + delta < 0`) — but only for asset accounts, and using the *current* cached balance rather than walking the full historical low-water-mark like the JS version does. These two checks can produce different verdicts for the same edit (e.g., an account whose balance dipped low mid-history and later recovered will be blocked by the JS check but allowed by the SQL check, or vice versa depending on which code path executes).

**Fix:**
- Pick **one** implementation of the "minimum allowed opening balance" rule (the full historical low-water-mark walk is the correct one — it's the only one that actually satisfies spec §5's intent) and delete the other.
- `updateOpeningBalance()` in `sqliteSchema.ts` must run the same low-water-mark SQL query (a window function `SUM(...) OVER (ORDER BY date)` works well in SQLite) rather than a single `cached_balance + delta` check, so the DB-level function alone is trustworthy without needing the JS-side pre-check to catch what it misses.
- Also apply the missing liability-side rules from spec §6 (`max allowed starting debt` against `credit_limit`) inside `updateOpeningBalance()` in SQL — right now that constraint only exists in the JS `validateAndCalculateBalance`, so any code path that calls `updateOpeningBalance()` directly (bypassing the JS validator) can create a debt opening balance that violates the account's own credit limit.

---

## 5. 🟠 Recurring transaction generator is a heuristic, not a rule — violates spec §7/§8 and can silently skip or duplicate charges

**File:** `src/context/AppContext.tsx`, the `useEffect` around line 467–553.

Problems, in order of severity:

1. **Duplicate-detection is a fuzzy content match, not an identity relationship.** A generated instance is considered "already exists" if any transaction in the whole ledger matches `title === template.title && amount === template.amount && month/year match` — with **no link back to the template's id**. Consequence: if a user manually logs an ordinary (non-recurring) transaction that happens to share a title and amount with a recurring template in the same month (e.g. both are "Netflix" for ₹499), the generator thinks the recurring occurrence for that month already happened and **never creates it** — a silent missed bill, not merely a cosmetic issue.
2. **No persisted "next due date" per template.** The generator re-derives "is this due" from `templateDate.getDate()` combined with "days until <= 5" windows recomputed from `new Date()` on every render, rather than storing and advancing an explicit `next_due_date` per recurring rule (which is what the spec's data model implies with `is_recurring`). If the app isn't opened for more than ~20 days around a due date, occurrences can be skipped entirely (the window logic only looks ±5 days / ±15 days around "now," it does not walk forward through every month that was missed while the app was closed).
3. **The recurring template row itself is a live, editable "phantom" transaction sitting in the ledger** (`isRecurring: true`) rather than a separate recurring-rule record. This conflates "the ledger" with "the schedule of future rules," which is exactly what the spec's table design (`transactions.is_recurring` describing *instances*, not templates) does not intend, and it's why the dedup logic above has to awkwardly exclude `t.id !== template.id`.
4. Auto-approval logic (`isVerified = (autoRecur && days <= 0) ? 1 : 0`) is reasonable in spirit but is derived from "days until due < 0" computed from wall-clock time at render time — combined with issue #2, a recurring bill that's overdue by more than the lookback window will never be generated at all, verified or not.

**Fix:**
- Add a first-class `recurring_rules` table (id, template fields, `next_due_date`, `frequency`, `account`, `category_id`, `is_active`) instead of storing recurring "templates" as rows in `transactions`.
- On each app load (and optionally on a daily timer while the app is open), walk forward from each rule's `next_due_date`: for every due date ≤ today, insert one concrete transaction instance (pending if `autoRecur` is off or the date is in the future within the reminder window, verified if `autoRecur` is on and due date has passed), and advance `next_due_date` by one period. Repeat until `next_due_date > today`, so re-opening the app after a long absence backfills every missed occurrence instead of silently dropping them.
- Link each generated transaction to its rule via a `recurring_rule_id` foreign key so de-duplication is a simple `WHERE recurring_rule_id = ? AND due_date = ?` check instead of a fuzzy title/amount match.
- For loan/EMI recurring rules specifically, the generated instance's principal/interest split must be recomputed at generation time from the account's *current* balance and rate (via `calculateEmiSplit`/`generateLoanSchedule`, spec §9) — not cloned verbatim from a stale template amount, since the interest portion changes every month as the balance amortizes.

---

## 6. 🟠 Two separate persistence stores for the same conceptual state (settings duplicated between `localStorage` and SQLite)

**File:** `src/context/AppContext.tsx`

User preferences (`theme`, `colorPalette`, `currency`, `autoRecur`, `biometric`, `passcode`, `monthCycleDay`, `profile`) are written to **both**:
- `localStorage.setItem('monthly-tracker-state', JSON.stringify(state))` (line ~438), and
- the SQLite `app_settings` table via `upsertAppSetting` (lines ~440–450, immediately after)

...on every single change, and are read back from **both** on load (`loadInitialState()` reads `monthly-tracker-state` synchronously at `useState` init time, then a separate `useEffect` re-reads the same key again at mount, then `loadAppSettings(driver)` reads the SQLite copy and overwrites state a third time once the DB initializes). This is not the transactional ledger data (accounts/transactions are SQLite-only, which is correct), but it's still two sources of truth for settings that can disagree — e.g. if a user clears site data partially, or if browser storage eviction removes one but not the other, settings can revert unpredictably, and the triple-read-on-load sequence makes the effective settings value a function of *timing*, not of a single authoritative source.

**Fix:** Pick SQLite `app_settings` as the single source of truth for all persisted settings (it's already wired up and is the "table-driven" store the user is asking for). Delete the `localStorage.getItem('monthly-tracker-state')` read/write paths entirely, or reduce `localStorage` to a *pure cache* that is only ever written from the SQLite values (never read back independently at a different point in the load sequence).

---

## 7. 🟠 The built-in integrity auditor (`auditDatabaseIntegrity`) exists but is never called anywhere

**File:** `src/db/sqliteSchema.ts`, `auditDatabaseIntegrity()`

This function does real, useful work — it compares the view's `cached_balance` against a from-scratch ledger replay and reports mismatches plus whether net worth is trustworthy. `grep` shows it is **not imported or called by any component, context, or settings screen.** Given the number of ways balances can drift (see §1–§4), this is exactly the safety net the app needs surfaced to the user, and it's already built.

**Fix:** Call `auditDatabaseIntegrity()`:
- On every app load, right after `refreshStateFromDatabase()`.
- On demand from a "Verify Data Integrity" button in Settings/BackupSecurity.
- If `mismatches.length > 0` or `isNetWorthAccurate === false`, show a persistent, dismissible warning banner (there's already a `BackupWarningBanner.tsx` pattern to model this on) rather than staying silent.

---

## 8. 🟡 No test coverage ties the SQL view, the JS balance engine, and the audit function together

**Files:** `src/__tests__/balanceManager.test.ts`, `src/db/sqliteSchema.test.ts`

Existing tests check each engine in isolation. Given §0/§3, add a **cross-engine consistency test**: generate a randomized (or fixed fixture) set of accounts + transactions (mix of income/expense/transfer/opening-balance, assets and liabilities, some with credit limits), then assert:
```
recomputeAccountBalance(account, txs)  ===  SQL account_balances_view.cached_balance  ===  auditDatabaseIntegrity() expectedBalance
```
for every account, for every fixture. This test should run in CI and must fail loudly the moment any one of the three implementations is edited without the others — which is the actual mechanism that prevents this whole class of bug from recurring.

---

## 9. 🟡 Offline / PWA reliability gaps

**Files:** `vite.config.ts` (VitePWA config), `package.json`

1. **The sql.js WASM binary is not precached.** `workbox.globPatterns: ['**/*.{js,css,html,ico,png,svg,json}']` does not include `wasm`. The entire app is built on `sql.js`, which loads a `.wasm` binary at runtime (`initSqlJs({ locateFile: (file) => file })` in `dbClient.ts`). Since the service worker's precache manifest never lists the `.wasm` file, there is no guarantee it's available when the user opens the app fully offline after the initial cache — the core "local-first" promise of the app depends on an asset the PWA config doesn't actually guarantee is cached.
   - **Fix:** add `wasm` to `globPatterns` (`'**/*.{js,css,html,ico,png,svg,json,wasm}'`) and verify via DevTools → Application → Cache Storage that `sql-wasm.wasm` (or whatever the sql.js output filename is) appears in the precache list after a production build.
2. **`localStorage` as the sole database persistence layer does not scale and is fragile.** `persistDatabase()` base64-encodes the *entire* SQLite database and writes it to a single `localStorage` key on every mutation (see `dbClient.ts`). Two consequences:
   - `localStorage` has a hard ~5–10MB quota (browser-dependent). Base64 inflates binary size by ~33%. A multi-year ledger with thousands of transactions plus the export/import history can realistically approach this ceiling, at which point `persistDatabase()`'s `localStorage.setItem` throws `QuotaExceededError` — which is currently caught and only `console.warn`'d, meaning **the user keeps using the app believing it's saving, while every subsequent change silently fails to persist.**
   - Every mutation triggers a full synchronous re-serialization of the whole DB on the main thread — this gets slower as the ledger grows and will visibly jank the UI over years of use.
   - **Fix:** Migrate persistence to `IndexedDB` (much larger quota, asynchronous, and well-supported offline) — either via `sql.js`'s ability to export/import binary snapshots into an IndexedDB-backed wrapper, or by moving to `wa-sqlite`/`absurd-sql`/OPFS-backed SQLite, which is the standard "real SQLite, actually offline, no artificial size ceiling" pattern for this exact use case. At minimum, surface `QuotaExceededError` to the user as a visible, blocking warning instead of a console log.
3. **Remove the unused `@google/genai` dependency** (and `express`/`dotenv`/`server.js` build artifacts referenced in `package.json`'s `clean` script) if there is no server-dependent or cloud-AI feature actually wired into `src/` (confirmed: no `fetch`, no `GoogleGenerativeAI` usage found anywhere under `src/`). Shipping an AI SDK dependency in a "your data never leaves your device" local-first finance app is a red flag for auditors/users even if unused today, and it bloats the offline bundle unnecessarily.

---

## 10. 🟡 Security: passcode is stored and compared in plaintext

**File:** `src/context/AppContext.tsx`, `src/components/Settings.tsx`

`passcode` is a plain string, stored verbatim in both `localStorage` and the SQLite `app_settings` table (`persistAppSetting('passcode', passcode)`), with no hashing/salting. Anyone with local access to the browser profile (or a shared/synced backup of `localStorage`) can read the 4-digit PIN directly from storage.

**Fix:** At minimum, hash the passcode (e.g. SHA-256 with a per-install random salt stored alongside it) before persisting, and compare hashes on unlock rather than storing/comparing the raw PIN. This is a local device PIN, not a full auth system, so full bcrypt/Argon2 is likely overkill, but plaintext storage of a lock-screen PIN in a financial app is not acceptable even for a "gate," and it's a trivial fix.

---

## 11. 🟡 Credit-card / liability payment classification (spec §10) is right in spirit but the interest transaction bypasses the shared validator

**File:** `src/context/AppContext.tsx`, `payLiability()`

Payments are correctly split: the principal portion goes through `transferFunds()` (an asset→liability transfer, not an "expense" — correctly matching spec §10's intent that a card payment shouldn't inflate expense reports), and the interest portion is logged as a real `expense` category `#interest` with `isInterestOnly: true`. This part is conceptually correct. However:
- The interest-only `addTransaction()` call bypasses `transferFunds()`'s (fixed, per §1) `Math.abs` handling — double check after fixing §1 that this code path was never affected by the negative-amount bug (a quick read suggests it wasn't, since it doesn't go through `transferFunds`, but add it to the regression test suite in §1 regardless, since it's the same call graph for "pay a liability").
- `calculateEmiSplit` is invoked with `liabilityAcc.balance` — after the §1 fix, confirm this always reflects the *persisted* (not stale in-memory pre-refresh) balance, since a rapid double-submit of the pay-liability modal before `refreshStateFromDatabase()` resolves could split two payments against the same stale starting balance.

---

## Summary checklist for the implementing agent

- [ ] §1 — Fix `transferFunds` to send positive `amount`; stop swallowing DB write errors in `persistDbAction`; surface failures to the UI.
- [ ] §2 — Remove the `Math.max(0, computed)` clamp on asset balances in `balanceManager.ts`; replace with visible integrity warnings.
- [ ] §0/§3 — Consolidate the four parallel balance/validation implementations into one shared rule module.
- [ ] §4 — Make `updateOpeningBalance()` in SQL perform the full historical low-water-mark check (and the liability credit-limit ceiling check), and delete the redundant JS-only version once SQL is authoritative.
- [ ] §5 — Replace the heuristic recurring-transaction `useEffect` with a `recurring_rules` table + explicit `next_due_date` advancement, linked to generated instances by id (not by title/amount matching).
- [ ] §6 — Make SQLite `app_settings` the single source of truth for preferences; stop dual-writing/reading `localStorage['monthly-tracker-state']`.
- [ ] §7 — Wire `auditDatabaseIntegrity()` into app load + a manual "Verify Data" settings action, with a visible warning banner on mismatch.
- [ ] §8 — Add a cross-engine consistency test (SQL view vs. JS recompute vs. audit function) as a CI guardrail.
- [ ] §9 — Add `wasm` to the PWA precache glob; migrate persistence off `localStorage` to IndexedDB/OPFS-backed storage with quota-exceeded handling surfaced to the user; drop unused `@google/genai`/server dependencies.
- [ ] §10 — Hash+salt the passcode before persisting; compare hashes, not plaintext.
- [ ] §11 — Extend regression tests to cover `payLiability`'s interest-only leg and rapid double-submit protection.

Each item above should become its own PR/commit with an accompanying test, so regressions in one area are easy to bisect.
