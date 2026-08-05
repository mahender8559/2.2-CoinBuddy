# CoinBuddy — Complete Implementation Brief
**Fast-Track Fix Guide for P0 + P1 Issues + Selected P2 Improvements**

---

## 📋 Table of Contents
1. [P0 BLOCKERS (Do-Or-Die)](#p0-blockers)
2. [P1 HIGH-PRIORITY (Launch Window)](#p1-high-priority)
3. [P2 RECOMMENDED (Nice-To-Have Before Ship)](#p2-recommended)
4. [Testing Roadmap](#testing-roadmap)
5. [Implementation Order & Effort](#implementation-order)

---

## P0 BLOCKERS

### **P0-1: WebAuthn Unlock Fails Open** ⛔ CRITICAL SECURITY
**Status:** Biometric vault unlocks with no authentication on Android.  
**Root Cause:** Using `.create()` (registration) instead of `.get()` (authentication); catch block unlocks on any error except `NotAllowedError`.

**Files:** `src/App.tsx` L240–327

**Fix Checklist:**

```typescript
// ❌ CURRENT (App.tsx around L240-327):
const handleBiometricUnlock = async () => {
  try {
    const assertion = await navigator.credentials.create({  // ❌ WRONG
      publicKey: { ... }
    });
    setUnlocked(true);
  } catch (error) {
    if (error.name !== 'NotAllowedError') {
      setUnlocked(true);  // ❌ UNLOCKS ON ANY ERROR
    }
  }
};

// ✅ FIXED:
const handleBiometricUnlock = async () => {
  try {
    // Check if WebAuthn is supported
    if (!window.PublicKeyCredential) {
      // Fall back to passcode unlock, NOT automatic vault open
      setAuthMode('passcode');
      return;
    }

    // ✅ Use .get() for authentication (not .create())
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array(32),
        timeout: 60000,
        userVerification: 'preferred',
      },
    });

    if (assertion) {
      setUnlocked(true);
      setAuthMode(null);
    }
  } catch (error) {
    // ✅ Keep vault LOCKED on any error
    if (error.name === 'NotSupportedError' 
        || error.name === 'SecurityError' 
        || error.name === 'AbortError') {
      // WebAuthn unavailable; fall back to passcode
      setAuthMode('passcode');
      setUnlocked(false);  // ✅ EXPLICIT LOCK
    } else if (error.name === 'NotAllowedError') {
      // User canceled
      setUnlocked(false);  // ✅ EXPLICIT LOCK
    } else {
      // Unknown error: lock and notify user
      setUnlocked(false);  // ✅ EXPLICIT LOCK
      setError(`Authentication error: ${error.message}`);
    }
  }
};
```

**Implementation Steps:**
1. Open `src/App.tsx`, locate both unlock paths (passcode-only and biometric paths).
2. Replace `.create()` with `.get()` for the biometric path.
3. Add explicit `PublicKeyCredential` check; fall back to passcode if unavailable.
4. **CRITICAL:** Change catch block to **always** keep vault locked on error (except for UI fallback to passcode).
5. Add explicit `setUnlocked(false)` in all error branches.
6. Test on Android WebView; simulate `NotSupportedError` and `SecurityError`.

**Test Coverage (Playwright):**
```yaml
- WebAuthn unlock: assert .get() is called (not .create())
- Mock NotSupportedError → vault stays LOCKED, fallback to passcode
- Mock SecurityError → vault stays LOCKED
- Mock AbortError → vault stays LOCKED
- No PublicKeyCredential support → vault stays LOCKED, fallback active
```

**Effort:** 30 min | **Risk:** Medium (security-critical)

---

### **P0-2: assetlinks.json Placeholders** 📦 REQUIRED FOR PLAY STORE
**Status:** File has hardcoded demo values; TWA will show URL bar on install.  
**Root Cause:** Template values never replaced with actual signing cert fingerprint.

**File:** `public/.well-known/assetlinks.json`

**Fix Checklist:**

```json
// ❌ CURRENT:
{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.yourdomain.monthlytracker",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT_FROM_GOOGLE_PLAY_CONSOLE"]
  }
}

// ✅ FIXED (example with real values):
{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.coinbuddy.app",
    "sha256_cert_fingerprints": ["AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"]
  }
}
```

**How to Get Real Values:**
1. In **Play Console** → Your App → Settings → App Signing.
2. Copy **SHA-256 fingerprint** (remove colons for assetlinks, or keep them—Drive API accepts both).
3. Copy **package name** from Play Console App Bundle/APK details.

**Implementation Steps:**
1. Obtain real package name and SHA-256 fingerprint from Play Console.
2. Replace placeholders in `public/.well-known/assetlinks.json`.
3. Redeploy to production (this file serves from your app's public root).
4. Verify Digital Asset Links: https://digitalassetlinks.googleapis.com/v1/assetlinks:check?namespace=android_app&package_name=YOUR_PACKAGE&relation=delegate_permission/common.handle_all_urls

**Effort:** 10 min | **Risk:** Low (process, no code change)

---

### **P0-3: Credit Card Limit Below Balance** 💳 FINANCIAL INVARIANT
**Status:** `updateCreditCard()` has no validation; can set limit < balance.  
**Root Cause:** CC edits route to `updateCreditCard()`, not `updateAccount()` which has the guard.

**File:** `src/context/AppContext.tsx` L861–916 (in `updateCreditCard()`)

**Fix Checklist:**

```typescript
// ❌ CURRENT (around L861-916):
const updateCreditCard = async (
  cardId: string,
  updates: Partial<CreditCard>
) => {
  const card = accounts.find(a => a.id === cardId);
  const target = accounts.find(a => a.id === card.linkedAccountId);

  // NO VALIDATION FOR limit < balance
  await dbDriver.updateCard(cardId, {
    limit: updates.limit,
    ...updates,
  });
  
  setAccounts(prev => 
    prev.map(a => a.id === cardId ? { ...a, ...updates } : a)
  );
};

// ✅ FIXED:
const updateCreditCard = async (
  cardId: string,
  updates: Partial<CreditCard>
) => {
  const card = accounts.find(a => a.id === cardId);
  const target = accounts.find(a => a.id === card.linkedAccountId);
  
  // ✅ GUARD: Block limit below balance
  if (updates.limit !== undefined && updates.limit < target.balance) {
    throw new Error(
      `Credit limit cannot be lower than the current outstanding balance (${formatCurrency(target.balance)})`
    );
  }

  await dbDriver.updateCard(cardId, {
    limit: updates.limit,
    ...updates,
  });
  
  setAccounts(prev => 
    prev.map(a => a.id === cardId ? { ...a, ...updates } : a)
  );
};
```

**Implementation Steps:**
1. Open `src/context/AppContext.tsx`, find `updateCreditCard()` function.
2. Before DB update, add guard: if `updates.limit && updates.limit < account.balance`, throw error.
3. Use same error message as `updateAccount()` guard for consistency.
4. Catch this error in `AddAccountModal.tsx` when calling `updateCreditCard()`.
5. Display error in UI (use existing toast/inline-error pattern).

**Test Coverage (Vitest):**
```typescript
it('rejects limit < balance', async () => {
  const cc = { balance: 8000, limit: 10000, ... };
  expect(() => updateCreditCard(cc.id, { limit: 5000 }))
    .toThrow('cannot be lower than outstanding balance');
});
```

**Effort:** 15 min | **Risk:** Low (guard only)

---

### **P0-4: Google Drive Backup Retention No-Op** ☁️ STORAGE BLOAT
**Status:** `pruneOldBackups()` only prunes local registry; no delete API call exists.  
**Root Cause:** No DELETE endpoint in `api/google-drive/`; early return skips history write.

**Files:**  
- `api/google-drive/delete.js` (new)
- `src/utils/backupManager.ts` (modify `pruneOldBackups()`)
- `api/google-drive/backup.js` (extend or create handler)

**Fix Checklist:**

**Step 1: Create DELETE Endpoint**

```javascript
// ✅ NEW FILE: api/google-drive/delete.js
import { google } from 'googleapis';
import { authorizeGoogleDrive } from './_auth.js';  // Adjust import per your structure

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileId } = req.query;  // File ID from Drive

  try {
    const auth = await authorizeGoogleDrive();  // Use existing auth helper
    const drive = google.drive({ version: 'v3', auth });

    // Delete the file from Drive
    await drive.files.delete({ fileId });

    res.status(200).json({ deleted: true, fileId });
  } catch (error) {
    console.error('[Google Drive Delete]', error.message);
    res.status(500).json({ error: error.message });
  }
}
```

**Step 2: Update backupManager.ts**

```typescript
// ✅ MODIFIED: src/utils/backupManager.ts in pruneOldBackups()

const pruneOldBackups = async (maxRetain: number, provider: string) => {
  if (provider === 'LOCAL') {
    // Existing logic: local prune
    const history = JSON.parse(localStorage.getItem('coinbuddy_saved_backups') || '[]');
    if (history.length > maxRetain) {
      const toDelete = history.slice(0, history.length - maxRetain);
      toDelete.forEach(backup => {
        // Delete from browser download folder (user action) or localStorage
        localStorage.removeItem(`coinbuddy_backup_${backup.id}`);
      });
      localStorage.setItem(
        'coinbuddy_saved_backups',
        JSON.stringify(history.slice(-maxRetain))
      );
    }
  } else if (provider === 'GOOGLE_DRIVE') {
    // ✅ NEW: Actually delete from Drive
    try {
      const response = await fetch('/api/google-drive/backups');  // List endpoint
      const { files } = await response.json();

      if (files.length > maxRetain) {
        const toDelete = files.slice(0, files.length - maxRetain);
        
        for (const file of toDelete) {
          // ✅ Call new DELETE endpoint
          await fetch(`/api/google-drive/delete?fileId=${file.id}`, {
            method: 'DELETE',
          });
          
          // Remove from local history
          localStorage.removeItem(`coinbuddy_gdrive_${file.id}`);
        }
      }
    } catch (error) {
      console.error('[Prune Google Drive] Failed:', error);
      throw new Error(`Failed to prune Google Drive backups: ${error.message}`);
    }
  }
};
```

**Implementation Steps:**
1. Create `api/google-drive/delete.js` with DELETE handler (use existing auth pattern).
2. Update `pruneOldBackups()` in `backupManager.ts` to call DELETE for GOOGLE_DRIVE branch.
3. Test with real Google Drive API (need valid OAuth token).
4. Add error handling and logging.

**Test Coverage (E2E):**
```yaml
DI-08 (rewrite as expected-pass):
  - Mock 7 files in /api/google-drive/backups
  - Trigger backup #8 via GOOGLE_DRIVE provider
  - Assert DELETE call issued for oldest file
  - Assert file count = 5 afterward
```

**Effort:** 45 min | **Risk:** Medium (API integration)

---

### **P0-5: Privacy Mode Global Masking** 👁️ MISLEADING UX
**Status:** Toggle only masks 3 Dashboard numbers; rest of app ignores it.  
**Root Cause:** `balancesVisible` state scoped to Dashboard component, not AppContext.

**Files:**  
- `src/context/AppContext.tsx` (add state)
- `src/components/Header.tsx` (move toggle here)
- `src/utils/formatters.ts` (update `formatCurrency()`)
- All amount-displaying components

**Fix Checklist:**

**Step 1: Move State to AppContext**

```typescript
// ✅ MODIFIED: src/context/AppContext.tsx

export const CoinBuddyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [balancesVisible, setBalancesVisible] = useState(
    () => localStorage.getItem('coinbuddy_balances_visible') !== 'false'
  );

  useEffect(() => {
    localStorage.setItem('coinbuddy_balances_visible', String(balancesVisible));
  }, [balancesVisible]);

  const togglePrivacy = useCallback(() => {
    setBalancesVisible(prev => !prev);
  }, []);

  return (
    <AppContext.Provider value={{
      ...contextValue,
      balancesVisible,
      togglePrivacy,
    }}>
      {children}
    </AppContext.Provider>
  );
};
```

**Step 2: Update formatCurrency() Wrapper**

```typescript
// ✅ MODIFIED: src/utils/formatters.ts or new src/utils/maskingFormatters.ts

export const formatCurrencyMasked = (amount: number, visible: boolean): string => {
  if (!visible) {
    return '••••••';  // Standard mask
  }
  return formatCurrency(amount);
};

// Usage: import { formatCurrencyMasked } from '@/utils/formatters';
// Everywhere: replace formatCurrency(amount) with formatCurrencyMasked(amount, balancesVisible)
```

**Step 3: Move Toggle to Header**

```typescript
// ✅ MODIFIED: src/components/Header.tsx

import { useAppContext } from '@/context/AppContext';

export const Header: React.FC = () => {
  const { balancesVisible, togglePrivacy } = useAppContext();

  return (
    <header className="flex justify-between items-center p-4">
      <h1>CoinBuddy</h1>
      <button
        onClick={togglePrivacy}
        aria-label={balancesVisible ? 'Hide balances' : 'Show balances'}
        data-testid="privacy-toggle"
      >
        {balancesVisible ? '👁️' : '🚫'}
      </button>
    </header>
  );
};
```

**Step 4: Update All Amount Displays**

Find and replace in:
- `Dashboard.tsx` (Net Worth, Total Assets, Total Liabilities)
- `Activity.tsx` (transaction amounts)
- `Cards.tsx` (card balances)
- `Insights.tsx` (chart labels)
- `WalletSummaryModal.tsx`

```typescript
// Before:
<span>{formatCurrency(account.balance)}</span>

// After:
<span>{formatCurrencyMasked(account.balance, balancesVisible)}</span>
```

**Implementation Steps:**
1. Add `balancesVisible` and `togglePrivacy` to AppContext.
2. Persist to localStorage on change.
3. Move toggle button from Dashboard to Header.
4. Create `formatCurrencyMasked(amount, visible)` helper.
5. Search `formatCurrency` in all component files (use IDE find-replace).
6. Replace with `formatCurrencyMasked` + pass `balancesVisible` from context.
7. Remove Dashboard-local toggle state.

**Test Coverage (Playwright):**
```yaml
UX-01 (rewrite as expected-pass):
  - Locate [data-testid=privacy-toggle] in Header
  - Click toggle
  - Assert all '.font-numeric, [data-testid*=balance]' renders "••••••"
  - Navigate to Activity, Cards, Insights
  - Assert masking persists across routes
```

**Effort:** 90 min | **Risk:** Medium (widespread changes)

---

### **P0-6: Missing Environment Variable Validation** 🔑 PRODUCTION SECURITY
**Status:** `GOOGLE_CLIENT_SECRET` and `GOOGLE_TOKEN_ENCRYPTION_KEY` blank in `.env.example`; no startup check.  
**Root Cause:** No validation that secrets exist before app initializes.

**Files:**  
- `.env.example` (update documentation)
- `api/_googleDrive.js` or startup script

**Fix Checklist:**

**Step 1: Update .env.example**

```bash
# .env.example

# Required for Google Drive OAuth
# Get these from Google Cloud Console > Credentials
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here

# Required for encrypting stored OAuth tokens
# Generate: openssl rand -base64 32
GOOGLE_TOKEN_ENCRYPTION_KEY=your-encryption-key-here
```

**Step 2: Add Startup Validation**

```typescript
// ✅ NEW: src/utils/envValidation.ts (or add to existing startup script)

export const validateEnvironment = () => {
  const requiredEnvVars = [
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_TOKEN_ENCRYPTION_KEY',
  ];

  const missing = requiredEnvVars.filter(
    key => !process.env[key] || process.env[key]?.trim() === ''
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `See .env.example for instructions.`
    );
  }
};

// Call in app entry:
if (typeof window === 'undefined') {
  // Server-side only
  validateEnvironment();
}
```

**Step 3: Call on App Startup** (e.g., in main API handler or middleware)

```javascript
// api/_middleware.js or api/index.js
import { validateEnvironment } from '@/utils/envValidation';

export default function handler(req, res) {
  validateEnvironment();  // Throws if missing
  // ... rest of handler
}
```

**Implementation Steps:**
1. Update `.env.example` with real descriptions.
2. Create validation function; check for required vars on startup.
3. Throw clear error with instructions if any missing.
4. Confirm vars are set in Vercel production environment (Settings → Environment Variables).
5. Log (at startup, not on every request): "Environment validation passed" for smoke test.

**Test Coverage:**
```bash
# Manually test:
unset GOOGLE_TOKEN_ENCRYPTION_KEY
npm run dev  # Should fail with clear error
```

**Effort:** 20 min | **Risk:** Low (validation only, no logic change)

---

## P1 HIGH-PRIORITY

### **P1-7: Duplicate validateLedgerImport()** 🔄 REDUNDANT WORK
**Status:** Runs twice per restore (AppContext L1331 + dbClient L669).  
**Root Cause:** Validation called at entry + again inside DB import function.

**Files:** `src/context/AppContext.tsx`, `src/utils/dbClient.ts`

**Fix Checklist:**

```typescript
// ❌ CURRENT: src/context/AppContext.tsx L1331
const importLedgerData = async (data: any) => {
  validateLedgerImport(data);  // First call ❌
  const restored = await dbDriver.importLedgerToDatabase(data);
  // dbDriver calls validateLedgerImport() AGAIN ❌
};

// ✅ FIXED:
const importLedgerData = async (data: any) => {
  // Validate once at entry point
  validateLedgerImport(data);
  
  // Pass validated flag to DB driver
  const restored = await dbDriver.importLedgerToDatabase(data, { 
    skipValidation: true  // Skip internal validation
  });
};

// src/utils/dbClient.ts L669
export const importLedgerToDatabase = async (
  data: any, 
  options?: { skipValidation?: boolean }
) => {
  // Only validate if not already done upstream
  if (!options?.skipValidation) {
    validateLedgerImport(data);  // Fallback for direct calls
  }
  
  // ... rest of import logic
};
```

**Implementation Steps:**
1. In `AppContext.importLedgerData()`, validate once at entry.
2. Add `skipValidation` flag to `importLedgerToDatabase()` params.
3. In `dbClient`, only validate if flag is false (backward compat).
4. Update call site in AppContext to pass `{ skipValidation: true }`.

**Test Coverage (Playwright):**
```yaml
DI-10 (rewrite as expected-pass):
  - Spy on validateLedgerImport via page.exposeFunction
  - Trigger full restore
  - Assert call count == 1 (not 2)
```

**Effort:** 15 min | **Risk:** Low (refactor only)

---

### **P1-8: Duplicate bufferToBase64/base64ToBuffer** 📚 CODE DUPLICATION
**Status:** Implemented independently in `backupManager.ts` and `dbClient.ts`.  
**Root Cause:** No shared utility module.

**File:** Create `src/utils/encoding.ts`; update imports.

**Fix Checklist:**

```typescript
// ✅ NEW: src/utils/encoding.ts
export const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};
```

```typescript
// ✅ MODIFIED: src/utils/backupManager.ts
// Remove local implementations
// Add:
import { bufferToBase64, base64ToBuffer } from '@/utils/encoding';

// ✅ MODIFIED: src/utils/dbClient.ts
// Remove local implementations
// Add:
import { bufferToBase64, base64ToBuffer } from '@/utils/encoding';
```

**Implementation Steps:**
1. Create `src/utils/encoding.ts` with both functions.
2. In `backupManager.ts`, remove local implementations; import from encoding.
3. In `dbClient.ts`, remove local implementations; import from encoding.
4. Verify no other files duplicate these (grep if needed).

**Effort:** 10 min | **Risk:** Minimal (consolidation)

---

### **P1-9: upgradeBackupData() Wasted Computation** ⚡ DEAD CODE
**Status:** Recomputes balances and syncs cards, then restore path discards them.  
**Root Cause:** `importLedgerToDatabase()` strips balances post-import via `stripAccountBalances()`.

**File:** `src/utils/backupManager.ts`

**Fix Checklist:**

```typescript
// ❌ CURRENT: upgradeBackupData() in backupManager.ts
const upgradeBackupData = (data: any, dbDriver?: DbDriver) => {
  // ... migration logic ...
  
  // Wasted work if dbDriver is present:
  const recomputed = recomputeAllAccountBalances(data.transactions);
  data.accounts = data.accounts.map(acc => ({
    ...acc,
    balance: recomputed[acc.id],
  }));
  
  syncCreditCardsWithAccounts(data);  // Also wasted
  
  return data;
};

// ✅ FIXED:
const upgradeBackupData = (data: any, dbDriver?: DbDriver) => {
  // ... migration logic ...
  
  // Only recompute if NO database driver (fallback mode)
  if (!dbDriver) {
    // Fallback: restore to memory, so balances must be pre-computed
    const recomputed = recomputeAllAccountBalances(data.transactions);
    data.accounts = data.accounts.map(acc => ({
      ...acc,
      balance: recomputed[acc.id],
    }));
    
    syncCreditCardsWithAccounts(data);
  }
  // else: dbDriver path will re-derive balances from ledger, so skip.
  
  return data;
};
```

**Implementation Steps:**
1. In `upgradeBackupData()`, check if `dbDriver` is provided.
2. Wrap `recomputeAllAccountBalances()` and `syncCreditCardsWithAccounts()` in `if (!dbDriver)` block.
3. Ensure `importLedgerToDatabase()` is called with `dbDriver` (which it is).
4. Test restore path; measure restore time (should be slightly faster).

**Effort:** 10 min | **Risk:** Low (removal only)

---

### **P1-10: Metadata Fallback Demo Numbers** 🔢 MISLEADING DATA
**Status:** Falls back to `|| 4` and `|| 38` (demo data) instead of `0` or "unknown".  
**Root Cause:** Hardcoded defaults from template; never updated.

**Files:**  
- `src/utils/backupManager.ts` L443–444
- `src/components/BackupSecurity.tsx` L441–442

**Fix Checklist:**

```typescript
// ❌ CURRENT: backupManager.ts L443
const parsedMeta = {
  accountCount: data.accounts?.length || 4,  // ❌ Demo default
  transactionCount: data.transactions?.length || 38,  // ❌ Demo default
};

// ✅ FIXED:
const parsedMeta = {
  accountCount: data.accounts?.length ?? 0,  // ✅ Zero if missing
  transactionCount: data.transactions?.length ?? 0,  // ✅ Zero if missing
};

// In BackupSecurity.tsx preview step, if either is 0:
if (accountCount === 0 || transactionCount === 0) {
  return (
    <p className="text-amber-600">
      ⚠️ Could not read backup metadata. Proceed with caution.
    </p>
  );
}
```

**Implementation Steps:**
1. Replace `|| 4` and `|| 38` with `?? 0` (nullish coalescing, not OR).
2. In BackupSecurity preview, add check: if either is 0, show warning instead of guessed number.
3. Update UI to not show counts if both are 0; show "Metadata unavailable" instead.

**Effort:** 10 min | **Risk:** Low (fallback only)

---

### **P1-11: Native alert() for Restore Errors** 🚨 INCONSISTENT UX
**Status:** Uses browser `alert()` instead of in-app toast.  
**Root Cause:** Quick-and-dirty error handling; didn't follow pattern.

**File:** `src/components/BackupSecurity.tsx` L405, L487

**Fix Checklist:**

```typescript
// ❌ CURRENT: BackupSecurity.tsx L405, L487
const handleRestore = async () => {
  try {
    // ...
  } catch (error) {
    alert(`Restore failed: ${error.message}`);  // ❌ Native alert
  }
};

// ✅ FIXED: Use inline-error pattern like ReconcileWizard
const [restoreError, setRestoreError] = useState<string | null>(null);

const handleRestore = async () => {
  setRestoreError(null);
  try {
    // ...
  } catch (error) {
    setRestoreError(error.message);  // ✅ Set inline error
    // No alert() call
  }
};

// In JSX:
{restoreError && (
  <div className="p-3 bg-red-100 border-l-4 border-red-600 rounded">
    <p className="text-red-800 font-semibold">Restore failed</p>
    <p className="text-sm text-red-700 mt-1">{restoreError}</p>
  </div>
)}
```

**Implementation Steps:**
1. In `BackupSecurity.tsx`, add `restoreError` state.
2. Replace `alert(error.message)` with `setRestoreError(error.message)`.
3. Copy error display pattern from `ReconcileWizard.tsx` (or existing toast).
4. Test on dark mode; ensure styling is consistent.

**Effort:** 20 min | **Risk:** Low (UI only)

---

### **P1-12: Unencrypted Legacy Backup Silent Accept** 🔐 SECURITY
**Status:** `decryptBackup()` silently accepts plaintext JSON with no warning.  
**Root Cause:** No legacy flag; caller can't distinguish encrypted from unencrypted.

**File:** `src/utils/backupManager.ts` (modify `decryptBackup()`)

**Fix Checklist:**

```typescript
// ❌ CURRENT: decryptBackup()
export const decryptBackup = (
  encryptedContent: string, 
  password: string
): string => {
  try {
    // Attempt AES-256-GCM decryption...
  } catch {
    // If decryption fails, assume it's unencrypted legacy JSON
    return encryptedContent;  // ❌ Silent fallback
  }
};

// ✅ FIXED: Return flag to distinguish
export type DecryptResult = {
  payload: string;
  legacy: boolean;  // true if unencrypted, false if decrypted
};

export const decryptBackup = (
  encryptedContent: string, 
  password: string
): DecryptResult => {
  // First, try to detect if it looks like encrypted (has salt/iv/ciphertext keys)
  if (isLikelyEncrypted(encryptedContent)) {
    try {
      const decrypted = performAESDecryption(encryptedContent, password);
      return { payload: decrypted, legacy: false };
    } catch (error) {
      throw new Error(`Failed to decrypt: ${error.message}`);
    }
  } else {
    // Plaintext JSON detected
    console.warn('[Backup] Legacy unencrypted backup detected');
    return { payload: encryptedContent, legacy: true };
  }
};

const isLikelyEncrypted = (content: string): boolean => {
  try {
    const parsed = JSON.parse(content);
    // Encrypted backups have specific structure: { salt, iv, ciphertext, ... }
    return parsed.salt && parsed.iv && parsed.ciphertext;
  } catch {
    return false;
  }
};
```

```typescript
// ✅ MODIFIED: Call sites (e.g., BackupSecurity.tsx)
const { payload, legacy } = decryptBackup(fileContent, password);

if (legacy) {
  // Show warning to user
  setLegacyWarning(true);
}

const data = JSON.parse(payload);
```

**Implementation Steps:**
1. Modify `decryptBackup()` to return `{ payload, legacy }` object.
2. Add `isLikelyEncrypted()` helper to detect JSON structure.
3. Update all call sites to destructure and handle legacy flag.
4. If legacy, show warning: "This is an old unencrypted backup. Consider creating a new encrypted one."
5. Add test: legacy backup should return `legacy: true`.

**Effort:** 25 min | **Risk:** Low (opt-in flag)

---

### **P1-13: Sequential Restore Inserts (Batching)** 🐢 PERFORMANCE CRITICAL
**Status:** Hundreds of per-row SQL awaits during restore; O(n) sequential round-trips.  
**Root Cause:** Loop with per-row insert; no batching.

**File:** `src/utils/dbClient.ts` L668–711

**Fix Checklist:**

```typescript
// ❌ CURRENT: importLedgerToDatabase() in dbClient.ts L668-711
export const importLedgerToDatabase = async (data: any) => {
  // ...
  
  // Inserts one by one ❌
  for (const category of data.categories) {
    await db.run(
      'INSERT INTO categories (...) VALUES (...)',
      [category.id, category.name, ...]
    );
  }
  
  for (const account of data.accounts) {
    await db.run(
      'INSERT INTO accounts (...) VALUES (...)',
      [account.id, account.name, ...]
    );
  }
  
  for (const tx of data.transactions) {
    await db.run(
      'INSERT INTO transactions (...) VALUES (...)',
      [tx.id, tx.amount, ...]
    );
  }
};

// ✅ FIXED: Batch inserts
export const importLedgerToDatabase = async (data: any) => {
  // ...
  
  // Batch insert categories
  if (data.categories.length > 0) {
    const placeholders = data.categories
      .map(() => '(?, ?, ?)')  // 3 columns
      .join(',');
    const values = data.categories.flatMap(c => [c.id, c.name, c.type]);
    
    await db.run(
      `INSERT INTO categories (id, name, type) VALUES ${placeholders}`,
      values
    );
  }
  
  // Batch insert accounts
  if (data.accounts.length > 0) {
    const placeholders = data.accounts
      .map(() => '(?, ?, ?, ?)')  // id, name, type, limit
      .join(',');
    const values = data.accounts.flatMap(a => [a.id, a.name, a.type, a.limit]);
    
    await db.run(
      `INSERT INTO accounts (id, name, type, limit) VALUES ${placeholders}`,
      values
    );
  }
  
  // Batch insert transactions (if many: split into chunks of 500)
  const txChunkSize = 500;
  for (let i = 0; i < data.transactions.length; i += txChunkSize) {
    const chunk = data.transactions.slice(i, i + txChunkSize);
    const placeholders = chunk
      .map(() => '(?, ?, ?, ?, ?)')  // 5 columns
      .join(',');
    const values = chunk.flatMap(tx => [
      tx.id, tx.type, tx.amount, tx.fromAccountId, tx.toAccountId
    ]);
    
    await db.run(
      `INSERT INTO transactions (id, type, amount, from_account_id, to_account_id) VALUES ${placeholders}`,
      values
    );
  }
};
```

**Implementation Steps:**
1. Replace per-row loops with batch INSERT statements.
2. For small tables (categories, accounts): single INSERT with multiple rows.
3. For large tables (transactions): chunk into batches of 500–1000 to avoid SQL size limits.
4. Measure restore time on synthetic 5,000-tx backup (should be 5–10× faster).

**Test Coverage (Vitest):**
```typescript
it('imports large backup in < 2 seconds', async () => {
  const largeData = generateSyntheticLedger(5000);
  const start = Date.now();
  await importLedgerToDatabase(largeData);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(2000);
});
```

**Effort:** 45 min | **Risk:** Medium (must test thoroughly)

---

### **P1-14: Two Schema Authorities (Split Brain)** 🧠 MAINTENANCE BURDEN
**Status:** `upgradeBackupData()` (tolerant) and `validateLedgerImport()` (strict) must sync.  
**Root Cause:** Separate files; no single source of truth.

**Files:**  
- Create `src/utils/ledgerSchema.ts`
- Modify `src/utils/backupManager.ts`
- Modify `src/utils/dbClient.ts`

**Fix Checklist:**

```typescript
// ✅ NEW: src/utils/ledgerSchema.ts
export const LEDGER_SCHEMA_VERSION = 'coinbuddy-ledger-v3';

export const REQUIRED_BACKUP_KEYS = [
  'schemaVersion',
  'accounts',
  'transactions',
  'categories',
];

export const validateBackupSchema = (data: any): void => {
  // Single source of truth for validation
  if (data.schemaVersion !== LEDGER_SCHEMA_VERSION) {
    throw new Error(
      `Invalid schema version: ${data.schemaVersion}. Expected ${LEDGER_SCHEMA_VERSION}`
    );
  }
  
  for (const key of REQUIRED_BACKUP_KEYS) {
    if (!data[key]) {
      throw new Error(`Missing required key: ${key}`);
    }
  }
  
  // Add schema-specific validations here (accounts array, tx structure, etc.)
};

export const migrateBackupDataToLatest = (data: any): any => {
  // Single source of truth for migrations
  let current = { ...data };
  
  // Version migration chain
  if (!current.schemaVersion) {
    // v1 → v2
    current = migrateV1ToV2(current);
  }
  if (current.schemaVersion === 'v2') {
    // v2 → v3
    current = migrateV2ToV3(current);
  }
  
  current.schemaVersion = LEDGER_SCHEMA_VERSION;
  return current;
};
```

```typescript
// ✅ MODIFIED: src/utils/backupManager.ts
import {
  validateBackupSchema,
  migrateBackupDataToLatest,
} from '@/utils/ledgerSchema';

export const upgradeBackupData = (data: any): any => {
  // Delegate to single schema module
  const migrated = migrateBackupDataToLatest(data);
  return migrated;
};
```

```typescript
// ✅ MODIFIED: src/utils/dbClient.ts
import { validateBackupSchema } from '@/utils/ledgerSchema';

export const validateLedgerImport = (data: any): void => {
  // Delegate to single schema module
  validateBackupSchema(data);
};
```

**Implementation Steps:**
1. Create `src/utils/ledgerSchema.ts` with shared validation and migration logic.
2. Update `backupManager.ts` to call `migrateBackupDataToLatest()` from schema module.
3. Update `dbClient.ts` to call `validateBackupSchema()` from schema module.
4. Remove duplicate validation logic from both files.
5. Test: modify schema version in a backup, ensure migration chain works.

**Effort:** 40 min | **Risk:** Medium (consolidation; must test all migration paths)

---

## P2 RECOMMENDED

### **P2-Frontend-1: Replace alert() in BackupSecurity** (already in P1-11, but also listed)

### **P2-Frontend-2: Debounce Activity Search** ⏱️ PERFORMANCE
**File:** `src/components/Activity.tsx` L13, 102, 137

```typescript
// ✅ FIXED: Add debounce to search input
import { useCallback, useMemo, useRef } from 'react';
import { useDebounce } from '@/hooks/useDebounce';  // or use React 18 useDeferredValue

const Activity: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);  // 300ms delay

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Use debouncedQuery instead of searchQuery
      return (
        tx.category.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        tx.notes.toLowerCase().includes(debouncedQuery.toLowerCase())
      );
    });
  }, [transactions, debouncedQuery]);

  return (
    <>
      <input
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="Search..."
      />
      {filteredTransactions.map(tx => (...))}
    </>
  );
};
```

**Custom Hook (if not already available):**
```typescript
// src/hooks/useDebounce.ts
import { useEffect, useState } from 'react';

export const useDebounce = <T>(value: T, delay: number = 300): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};
```

**Effort:** 15 min | **Risk:** Low

---

### **P2-Frontend-3: Memoize totalAssets/totalLiabilities** 📊 PERF
**File:** `src/components/Dashboard.tsx` L28–29

```typescript
// ❌ CURRENT:
const totalAssets = accounts
  .filter(a => a.type === 'asset')
  .reduce((sum, a) => sum + a.balance, 0);

// ✅ FIXED:
import { useMemo } from 'react';

const totalAssets = useMemo(
  () => accounts
    .filter(a => a.type === 'asset')
    .reduce((sum, a) => sum + a.balance, 0),
  [accounts]
);

const totalLiabilities = useMemo(
  () => accounts
    .filter(a => a.type === 'liability')
    .reduce((sum, a) => sum + a.balance, 0),
  [accounts]
);
```

**Effort:** 5 min | **Risk:** Minimal

---

### **P2-Frontend-4: Add aria-labels** ♿ ACCESSIBILITY
**Targets:** Privacy toggle, undo toast close, bulk-select action bar icons

```typescript
// Example: Privacy toggle (already in P0-5, but here for P2 reference)
<button
  onClick={togglePrivacy}
  aria-label={balancesVisible ? 'Hide balances' : 'Show balances'}
  data-testid="privacy-toggle"
>
  {balancesVisible ? '👁️' : '🚫'}
</button>

// Undo toast close button
<button
  onClick={handleUndoClose}
  aria-label="Close undo notification"
>
  ✕
</button>
```

**Effort:** 20 min | **Risk:** Minimal

---

### **P2-Backend-1: Batch Recurring Transaction Queries** 📋 PERFORMANCE
**File:** `src/utils/dbClient.ts` L617+ (`generateDueRecurringTransactions()`)

```typescript
// ❌ CURRENT: One SELECT per rule per occurrence
for (const rule of recurringRules) {
  let current = rule.nextDueDate;
  while (current < today) {
    const exists = await db.get(
      'SELECT id FROM transactions WHERE recurring_rule_id = ? AND due_date = ?',
      [rule.id, current]
    );  // ❌ One query per iteration
    if (!exists) {
      await db.run(
        'INSERT INTO transactions (...) VALUES (...)',
        [...]
      );
    }
    current = addMonths(current, rule.frequencyMonths);
  }
}

// ✅ FIXED: Batch-check all due dates first
for (const rule of recurringRules) {
  // Collect all due dates for this rule
  const dueDates: Date[] = [];
  let current = rule.nextDueDate;
  while (current < today) {
    dueDates.push(current);
    current = addMonths(current, rule.frequencyMonths);
  }
  
  // Single query to check which already exist
  if (dueDates.length > 0) {
    const placeholders = dueDates.map(() => '?').join(',');
    const existing = await db.all(
      `SELECT due_date FROM transactions 
       WHERE recurring_rule_id = ? AND due_date IN (${placeholders})`,
      [rule.id, ...dueDates]
    );  // ✅ One query for all dates
    
    const existingSet = new Set(existing.map(e => e.due_date));
    
    // Insert only missing dates
    for (const dueDate of dueDates) {
      if (!existingSet.has(dueDate)) {
        await db.run(...);
      }
    }
  }
}
```

**Effort:** 30 min | **Risk:** Medium (must test edge cases)

---

## Testing Roadmap

### Phase 1: Unit Tests (Vitest)
- **P0-3:** Credit limit validation
- **P1-7:** No duplicate validation
- **P1-13:** Batch inserts
- **P2-1:** Memoization

### Phase 2: E2E Tests (Playwright)
- **P0-1:** WebAuthn fallback behavior
- **P0-4:** Drive file deletion
- **P0-5:** Privacy toggle global masking
- **DI-08, DI-09, DI-10:** Backup/restore scenarios
- **DG-05:** Credit card limit validation
- **UX-01:** Privacy mode app-wide

### Phase 3: Manual QA
- **P0-2:** assetlinks.json Digital Asset Links verification
- **P0-6:** Environment variable startup check
- **P1-11:** Toast error display on Android WebView
- Cold start + offline launch on real low-end device

---

## Implementation Order & Effort

| Priority | Issue | Effort | Blocker? | Suggested Order |
|----------|-------|--------|----------|-----------------|
| P0-1 | WebAuthn unlock | 30 min | YES | 1 |
| P0-3 | CC limit validation | 15 min | YES | 2 |
| P0-5 | Privacy global mask | 90 min | YES | 3 |
| P0-2 | assetlinks.json | 10 min | YES | 4 (last; purely config) |
| P0-6 | Env validation | 20 min | YES | 5 |
| P0-4 | Drive delete endpoint | 45 min | YES | 6 |
| P1-7 | Dedup validation | 15 min | NO | 7 |
| P1-8 | Extract encoding util | 10 min | NO | 8 |
| P1-9 | Skip wasted computation | 10 min | NO | 9 |
| P1-10 | Fix fallback defaults | 10 min | NO | 10 |
| P1-11 | Replace alert() | 20 min | NO | 11 |
| P1-12 | Legacy backup flag | 25 min | NO | 12 |
| P1-13 | Batch inserts | 45 min | NO | 13 |
| P1-14 | Consolidate schema | 40 min | NO | 14 |
| P2-2 | Search debounce | 15 min | NO | 15 |
| P2-3 | Memoize totals | 5 min | NO | 16 |
| P2-4 | aria-labels | 20 min | NO | 17 |
| P2-1B | Batch recurring queries | 30 min | NO | 18 |

**Total P0:** ~210 min (~3.5 hours)  
**Total P1:** ~180 min (~3 hours)  
**Total P2:** ~70 min (~1.2 hours)  
**Grand Total:** ~460 min (~7.7 hours)

---

## Quick-Start Checklist

- [ ] **Day 1 Morning:** P0-1, P0-3 (45 min)
- [ ] **Day 1 Afternoon:** P0-5 (90 min) + P0-6 (20 min)
- [ ] **Day 1 EOD:** P0-2, P0-4 (55 min)
- [ ] **Day 2 Morning:** P1-7 through P1-14 (165 min)
- [ ] **Day 2 Afternoon:** P2 issues (65 min)
- [ ] **Day 3:** Testing + bug fixes

**Estimated Ready for Play Store:** 3 days full-time dev + 1 day QA

---

**End of Brief**

Questions? Refer back to the original audit documents (`01_Bug_and_Deviation_Audit.md`, `04_Play_Store_Deploy_Readiness.md`) for deeper context.
