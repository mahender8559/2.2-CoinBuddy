from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one match, found {count}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# --- Types ---
replace_once(
    'src/types.ts',
    "export type AffordabilityClass = 'COMMITTED' | 'NORMAL' | 'FLEXIBLE' | 'IRREGULAR' | 'SAVINGS';\n",
    "export type AffordabilityClass = 'COMMITTED' | 'NORMAL' | 'FLEXIBLE' | 'IRREGULAR' | 'SAVINGS';\n\n"
    "export type AffordabilityContingencyMode = 'AUTO' | 'FIXED';\n"
    "export type AffordabilitySafetyLevel = 'FLEXIBLE' | 'BALANCED' | 'CONSERVATIVE';\n\n"
    "export interface AffordabilitySettings {\n"
    "  version: 1;\n"
    "  /** Whether the user has explicitly reviewed the planner safety setup. */\n"
    "  setupCompleted: boolean;\n"
    "  /** Amount the user wants to protect as savings over a normal monthly financial cycle. */\n"
    "  monthlySavingsTarget: number;\n"
    "  /** Liquid cash floor that the affordability planner must not recommend spending through. */\n"
    "  protectedCashReserve: number;\n"
    "  contingencyMode: AffordabilityContingencyMode;\n"
    "  /** Used only when contingencyMode is FIXED. */\n"
    "  fixedContingencyAmount: number;\n"
    "  /** Number of completed financial cycles considered by the automatic irregular-spending estimator. */\n"
    "  historicalMonths: number;\n"
    "  safetyLevel: AffordabilitySafetyLevel;\n"
    "}\n"
)

# --- Settings domain module ---
Path('src/domain/affordabilitySettings.ts').write_text("""import type { AffordabilitySafetyLevel, AffordabilitySettings } from '../types';

export const AFFORDABILITY_SETTINGS_KEY = 'affordabilitySettings';

export const DEFAULT_AFFORDABILITY_SETTINGS: AffordabilitySettings = {
  version: 1,
  setupCompleted: false,
  monthlySavingsTarget: 0,
  protectedCashReserve: 0,
  contingencyMode: 'AUTO',
  fixedContingencyAmount: 0,
  historicalMonths: 6,
  safetyLevel: 'BALANCED',
};

export const AFFORDABILITY_SAFETY_MULTIPLIERS: Record<AffordabilitySafetyLevel, number> = {
  FLEXIBLE: 1,
  BALANCED: 1.25,
  CONSERVATIVE: 1.5,
};

function nonNegative(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizeHistoricalMonths(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AFFORDABILITY_SETTINGS.historicalMonths;
  return Math.min(24, Math.max(1, Math.round(parsed)));
}

export function normalizeAffordabilitySettings(value: unknown): AffordabilitySettings {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<AffordabilitySettings>
    : {};
  const contingencyMode = String(input.contingencyMode ?? '').toUpperCase() === 'FIXED' ? 'FIXED' : 'AUTO';
  const rawSafety = String(input.safetyLevel ?? '').toUpperCase();
  const safetyLevel: AffordabilitySafetyLevel = rawSafety === 'FLEXIBLE' || rawSafety === 'CONSERVATIVE'
    ? rawSafety
    : 'BALANCED';

  return {
    version: 1,
    setupCompleted: input.setupCompleted === true,
    monthlySavingsTarget: nonNegative(input.monthlySavingsTarget),
    protectedCashReserve: nonNegative(input.protectedCashReserve),
    contingencyMode,
    fixedContingencyAmount: nonNegative(input.fixedContingencyAmount),
    historicalMonths: normalizeHistoricalMonths(input.historicalMonths),
    safetyLevel,
  };
}

/** Resolves the amount that Phase 2 should reserve for uncertainty.
 * Fixed mode respects the user's exact amount. Automatic mode applies the
 * selected safety posture to the historical estimate produced in Phase 5. */
export function resolveContingencyBuffer(settings: AffordabilitySettings, automaticEstimate: number): number {
  const normalized = normalizeAffordabilitySettings(settings);
  if (normalized.contingencyMode === 'FIXED') return normalized.fixedContingencyAmount;
  const estimate = nonNegative(automaticEstimate);
  return estimate * AFFORDABILITY_SAFETY_MULTIPLIERS[normalized.safetyLevel];
}
""", encoding='utf-8')

Path('src/domain/affordabilitySettings.test.ts').write_text("""import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AFFORDABILITY_SETTINGS,
  normalizeAffordabilitySettings,
  resolveContingencyBuffer,
} from './affordabilitySettings';

describe('affordability settings', () => {
  it('uses transparent safe defaults when setup has not been completed', () => {
    expect(normalizeAffordabilitySettings(undefined)).toEqual(DEFAULT_AFFORDABILITY_SETTINGS);
  });

  it('sanitizes malformed or unsafe persisted values', () => {
    expect(normalizeAffordabilitySettings({
      setupCompleted: 'yes',
      monthlySavingsTarget: -100,
      protectedCashReserve: Number.NaN,
      contingencyMode: 'something-else',
      fixedContingencyAmount: -5,
      historicalMonths: 200,
      safetyLevel: 'unknown',
    })).toEqual({
      version: 1,
      setupCompleted: false,
      monthlySavingsTarget: 0,
      protectedCashReserve: 0,
      contingencyMode: 'AUTO',
      fixedContingencyAmount: 0,
      historicalMonths: 24,
      safetyLevel: 'BALANCED',
    });
  });

  it('preserves valid user preferences and normalizes enum casing', () => {
    expect(normalizeAffordabilitySettings({
      setupCompleted: true,
      monthlySavingsTarget: 15000,
      protectedCashReserve: 30000,
      contingencyMode: 'fixed',
      fixedContingencyAmount: 8000,
      historicalMonths: 9.4,
      safetyLevel: 'conservative',
    })).toEqual({
      version: 1,
      setupCompleted: true,
      monthlySavingsTarget: 15000,
      protectedCashReserve: 30000,
      contingencyMode: 'FIXED',
      fixedContingencyAmount: 8000,
      historicalMonths: 9,
      safetyLevel: 'CONSERVATIVE',
    });
  });

  it('uses the exact fixed contingency and applies safety posture only to automatic estimates', () => {
    expect(resolveContingencyBuffer(normalizeAffordabilitySettings({ contingencyMode: 'FIXED', fixedContingencyAmount: 7000 }), 10000)).toBe(7000);
    expect(resolveContingencyBuffer(normalizeAffordabilitySettings({ safetyLevel: 'FLEXIBLE' }), 10000)).toBe(10000);
    expect(resolveContingencyBuffer(normalizeAffordabilitySettings({ safetyLevel: 'BALANCED' }), 10000)).toBe(12500);
    expect(resolveContingencyBuffer(normalizeAffordabilitySettings({ safetyLevel: 'CONSERVATIVE' }), 10000)).toBe(15000);
  });
});
""", encoding='utf-8')

# --- App context typed state + persistence + backup ---
replace_once(
    'src/context/AppContext.tsx',
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule } from '../types';",
    "import { Transaction, CreditCardInfo, Category, Account, Event, Widget, LoanRevision, RecurringRule, AffordabilitySettings } from '../types';"
)
replace_once(
    'src/context/AppContext.tsx',
    "import { ensureCategoryAffordabilityClass } from '../domain/categoryAffordability';\n",
    "import { ensureCategoryAffordabilityClass } from '../domain/categoryAffordability';\n"
    "import { AFFORDABILITY_SETTINGS_KEY, DEFAULT_AFFORDABILITY_SETTINGS, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "  recurringRules?: RecurringRule[];\n  currency?: string;\n",
    "  recurringRules?: RecurringRule[];\n  affordabilitySettings?: AffordabilitySettings;\n  currency?: string;\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "  recurringRules: RecurringRule[];\n  updateRecurringRule: (rule: RecurringRule) => Promise<boolean>;\n",
    "  recurringRules: RecurringRule[];\n  affordabilitySettings: AffordabilitySettings;\n  setAffordabilitySettings: (settings: AffordabilitySettings) => void;\n  updateRecurringRule: (rule: RecurringRule) => Promise<boolean>;\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "  const [loanRevisions, setLoanRevisions] = useState<LoanRevision[]>([]);\n  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);\n",
    "  const [loanRevisions, setLoanRevisions] = useState<LoanRevision[]>([]);\n"
    "  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);\n"
    "  const [affordabilitySettings, setAffordabilitySettingsState] = useState<AffordabilitySettings>(() => ({ ...DEFAULT_AFFORDABILITY_SETTINGS }));\n"
    "  const setAffordabilitySettings = useCallback((settings: AffordabilitySettings) => {\n"
    "    setAffordabilitySettingsState(normalizeAffordabilitySettings(settings));\n"
    "  }, []);\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "        if (settings.profile && typeof settings.profile === 'object') setProfile(settings.profile as typeof profile);\n        setDbReady(true);\n",
    "        if (settings.profile && typeof settings.profile === 'object') setProfile(settings.profile as typeof profile);\n"
    "        setAffordabilitySettingsState(normalizeAffordabilitySettings(settings[AFFORDABILITY_SETTINGS_KEY]));\n"
    "        setDbReady(true);\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "        persistAppSetting('profile', profile),\n      ]);\n",
    "        persistAppSetting('profile', profile),\n"
    "        persistAppSetting(AFFORDABILITY_SETTINGS_KEY, affordabilitySettings),\n"
    "      ]);\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "  }, [theme, colorPalette, currency, autoRecur, biometric, passcode, monthCycleDay, profile, dbReady, dbDriver]);\n",
    "  }, [theme, colorPalette, currency, autoRecur, biometric, passcode, monthCycleDay, profile, affordabilitySettings, dbReady, dbDriver]);\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "    setLoanRevisions([]);\n    setRecurringRules([]);\n    setIntegrityWarning(null);\n",
    "    setLoanRevisions([]);\n"
    "    setRecurringRules([]);\n"
    "    setAffordabilitySettingsState({ ...DEFAULT_AFFORDABILITY_SETTINGS });\n"
    "    setIntegrityWarning(null);\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "      setLoanRevisions(refreshed.loanRevisions);\n      setRecurringRules(refreshed.recurringRules);\n      const integrity = await auditDatabaseIntegrity(dbDriver);\n",
    "      setLoanRevisions(refreshed.loanRevisions);\n"
    "      setRecurringRules(refreshed.recurringRules);\n"
    "      const restoredAppSettings = await loadAppSettings(dbDriver);\n"
    "      setAffordabilitySettingsState(normalizeAffordabilitySettings(restoredAppSettings[AFFORDABILITY_SETTINGS_KEY]));\n"
    "      const integrity = await auditDatabaseIntegrity(dbDriver);\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "      if (data.recurringRules && Array.isArray(data.recurringRules)) setRecurringRules(data.recurringRules);\n    }\n\n    if (data.currency) setCurrency(data.currency);\n",
    "      if (data.recurringRules && Array.isArray(data.recurringRules)) setRecurringRules(data.recurringRules);\n"
    "      setAffordabilitySettingsState(normalizeAffordabilitySettings(data.affordabilitySettings));\n"
    "    }\n\n"
    "    if (data.currency) setCurrency(data.currency);\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "    recurringRules,\n    currency,\n  });\n",
    "    recurringRules,\n"
    "    affordabilitySettings,\n"
    "    currency,\n"
    "  });\n"
)
replace_once(
    'src/context/AppContext.tsx',
    "      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, recurringRules, updateRecurringRule, deleteRecurringRule, skipRecurringRule, \n",
    "      transactions, addTransaction, updateTransaction, deleteTransaction, approveTransaction, rejectTransaction, editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, recurringRules, affordabilitySettings, setAffordabilitySettings, updateRecurringRule, deleteRecurringRule, skipRecurringRule, \n"
)

# --- Database import/restore persistence ---
replace_once(
    'src/db/dbClient.ts',
    "import { normalizeAffordabilityClass } from '../domain/categoryAffordability';\n",
    "import { normalizeAffordabilityClass } from '../domain/categoryAffordability';\n"
    "import { AFFORDABILITY_SETTINGS_KEY, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';\n"
)
replace_once(
    'src/db/dbClient.ts',
    "    if (userConfig) {\n      await upsertUserConfig(driver, {\n        currency: userConfig.currency_code ?? data.currency ?? 'INR',\n        monthCycleDay: Number(userConfig.month_cycle_day ?? 25),\n      });\n    }\n    await driver.execute('COMMIT');\n",
    "    if (userConfig) {\n"
    "      await upsertUserConfig(driver, {\n"
    "        currency: userConfig.currency_code ?? data.currency ?? 'INR',\n"
    "        monthCycleDay: Number(userConfig.month_cycle_day ?? 25),\n"
    "      });\n"
    "    }\n"
    "    await upsertAppSetting(driver, AFFORDABILITY_SETTINGS_KEY, normalizeAffordabilitySettings(data.affordabilitySettings));\n"
    "    await driver.execute('COMMIT');\n"
)

# --- Backup schema/migration ---
replace_once(
    'src/utils/ledgerSchema.ts',
    "import { recomputeAllAccountBalances, syncCreditCardsWithAccounts } from './balanceManager';\n",
    "import { recomputeAllAccountBalances, syncCreditCardsWithAccounts } from './balanceManager';\n"
    "import { DEFAULT_AFFORDABILITY_SETTINGS, normalizeAffordabilitySettings } from '../domain/affordabilitySettings';\n"
)
replace_once(
    'src/utils/ledgerSchema.ts',
    "  if (ledger.recurringRules !== undefined && !Array.isArray(ledger.recurringRules)) return 'Backup field \\\"recurringRules\\\" must be an array when present.';\n",
    "  if (ledger.recurringRules !== undefined && !Array.isArray(ledger.recurringRules)) return 'Backup field \\\"recurringRules\\\" must be an array when present.';\n"
    "  if (ledger.affordabilitySettings !== undefined && (!ledger.affordabilitySettings || typeof ledger.affordabilitySettings !== 'object' || Array.isArray(ledger.affordabilitySettings))) return 'Backup field \\\"affordabilitySettings\\\" must be an object when present.';\n"
)
replace_once(
    'src/utils/ledgerSchema.ts',
    "      recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [],\n      currency: data.currency || 'INR',\n",
    "      recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [],\n"
    "      affordabilitySettings: normalizeAffordabilitySettings(data.affordabilitySettings),\n"
    "      currency: data.currency || 'INR',\n"
)
replace_once(
    'src/utils/ledgerSchema.ts',
    "    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [], recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [], currency: data.currency || '$', lastUpdated: new Date().toISOString(),\n",
    "    loanRevisions: Array.isArray(data.loanRevisions) ? data.loanRevisions : [], recurringRules: Array.isArray(data.recurringRules) ? data.recurringRules : [], affordabilitySettings: { ...DEFAULT_AFFORDABILITY_SETTINGS }, currency: data.currency || '$', lastUpdated: new Date().toISOString(),\n"
)

# --- Persistence/import regression tests ---
Path('src/__tests__/affordabilitySettingsPersistence.test.ts').write_text("""import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_MIGRATIONS, SQLITE_PRAGMA_SETUP } from '../db/sqliteSchema';
import {
  importLedgerToDatabase,
  loadAppSettings,
  type SqlJsDatabaseDriver,
} from '../db/dbClient';
import {
  AFFORDABILITY_SETTINGS_KEY,
  DEFAULT_AFFORDABILITY_SETTINGS,
} from '../domain/affordabilitySettings';
import { migrateBackupDataToLatest, validateLedgerSchema } from '../utils/ledgerSchema';

async function createDriver(): Promise<SqlJsDatabaseDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(SQLITE_PRAGMA_SETUP);
  db.exec(CREATE_TABLES_SQL);
  for (const migration of SQLITE_MIGRATIONS) {
    try { db.run(migration); } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
    }
  }
  return {
    rawDb: db,
    async execute(sql, params = []) { params.length ? db.run(sql, params) : db.exec(sql); },
    async query(sql, params = []) {
      const stmt = db.prepare(sql);
      if (params.length) stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
    exportToBase64: () => '',
  };
}

const baseBackup = () => ({
  schemaVersion: 'coinbuddy-ledger-v3',
  exportedAt: '2026-08-12T00:00:00.000Z',
  accounts: [],
  transactions: [],
  categories: [],
  events: [],
  creditCards: [],
  widgets: [],
  loanRevisions: [],
  recurringRules: [],
  currency: 'INR',
});

describe('affordability settings backup and SQLite persistence', () => {
  it('restores affordability preferences into app_settings during ledger import', async () => {
    const driver = await createDriver();
    const affordabilitySettings = {
      version: 1 as const,
      setupCompleted: true,
      monthlySavingsTarget: 18000,
      protectedCashReserve: 45000,
      contingencyMode: 'FIXED' as const,
      fixedContingencyAmount: 9000,
      historicalMonths: 8,
      safetyLevel: 'CONSERVATIVE' as const,
    };
    const backup = { ...baseBackup(), affordabilitySettings };
    expect(validateLedgerSchema(backup)).toBeNull();

    await importLedgerToDatabase(driver, backup);
    const settings = await loadAppSettings(driver);
    expect(settings[AFFORDABILITY_SETTINGS_KEY]).toEqual(affordabilitySettings);
  });

  it('gives older v3 backups safe affordability defaults instead of failing restore', async () => {
    const driver = await createDriver();
    const backup = baseBackup();
    expect(validateLedgerSchema(backup)).toBeNull();

    await importLedgerToDatabase(driver, backup);
    const settings = await loadAppSettings(driver);
    expect(settings[AFFORDABILITY_SETTINGS_KEY]).toEqual(DEFAULT_AFFORDABILITY_SETTINGS);
  });

  it('preserves affordability preferences through backup migration and normalizes malformed values', () => {
    const migrated = migrateBackupDataToLatest(JSON.stringify({
      ...baseBackup(),
      affordabilitySettings: {
        setupCompleted: true,
        monthlySavingsTarget: -10,
        protectedCashReserve: 25000,
        contingencyMode: 'fixed',
        fixedContingencyAmount: 6000,
        historicalMonths: 100,
        safetyLevel: 'flexible',
      },
    }));
    expect(migrated.affordabilitySettings).toEqual({
      version: 1,
      setupCompleted: true,
      monthlySavingsTarget: 0,
      protectedCashReserve: 25000,
      contingencyMode: 'FIXED',
      fixedContingencyAmount: 6000,
      historicalMonths: 24,
      safetyLevel: 'FLEXIBLE',
    });
  });

  it('rejects a malformed affordabilitySettings backup field', () => {
    expect(validateLedgerSchema({ ...baseBackup(), affordabilitySettings: 'not-an-object' })).toContain('affordabilitySettings');
  });
});
""", encoding='utf-8')

print('Affordability Phase 4 patch applied.')
