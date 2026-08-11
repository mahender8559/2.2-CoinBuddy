from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# AppContext: recurring entries must start unconfirmed and due generation must
# never silently approve them. Repair the single-occurrence legacy bug once.
# -----------------------------------------------------------------------------
path = Path('src/context/AppContext.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '  generateDueRecurringTransactions,\n  SqlJsDatabaseDriver,',
    '  generateDueRecurringTransactions,\n  repairLegacyRecurringConfirmationState,\n  SqlJsDatabaseDriver,',
    'AppContext recurring repair import',
)
text = replace_once(
    text,
    "  useEffect(() => {\n    if (!dbDriver || !dbReady) return;\n    void persistDbAction(() => generateDueRecurringTransactions(dbDriver, autoRecur));\n  }, [dbDriver, dbReady, autoRecur]);",
    "  useEffect(() => {\n    if (!dbDriver || !dbReady) return;\n    void persistDbAction(async () => {\n      const migrationKey = 'coinbuddy_recurring_confirmation_v1';\n      if (localStorage.getItem(migrationKey) !== 'true') {\n        await repairLegacyRecurringConfirmationState(dbDriver);\n        localStorage.setItem(migrationKey, 'true');\n      }\n      if (autoRecur) {\n        await generateDueRecurringTransactions(dbDriver, false);\n      }\n    });\n  }, [dbDriver, dbReady, autoRecur]);",
    'AppContext due recurring effect',
)
text = replace_once(
    text,
    "            isRecurring: true,\n            is_verified: 1,",
    "            isRecurring: true,\n            is_verified: 0,",
    'AppContext initial recurring confirmation state',
)
text = replace_once(
    text,
    '          await generateDueRecurringTransactions(dbDriver, autoRecur);',
    '          await generateDueRecurringTransactions(dbDriver, false);',
    'AppContext backfill generation confirmation state',
)
path.write_text(text, encoding='utf-8')


# -----------------------------------------------------------------------------
# DB recurring generator: generated occurrences always require confirmation.
# Also repair the legacy first-occurrence bug when a rule has exactly one
# generated occurrence, which safely targets newly created affected schedules.
# -----------------------------------------------------------------------------
path = Path('src/db/dbClient.ts')
text = path.read_text(encoding='utf-8')
anchor = "function localNoonIso(date: string): string {\n  return new Date(`${date}T12:00:00`).toISOString();\n}\n\n"
repair_fn = """/**
 * One-time compatibility repair for recurring rules created by the previous
 * implementation, which marked their first generated occurrence as verified
 * before the user had confirmed it. Restrict the repair to active rules with
 * exactly one generated occurrence so established recurring history is not
 * reopened for confirmation.
 */
export async function repairLegacyRecurringConfirmationState(
  driver: SqlJsDatabaseDriver,
  today = new Date(),
): Promise<number> {
  const todayKey = toLocalDateKey(today);
  const rows = await driver.query(
    `SELECT t.id
       FROM transactions t
       JOIN recurring_rules r ON r.id = t.recurring_rule_id AND r.is_active = 1
       JOIN (
         SELECT recurring_rule_id
           FROM transactions
          WHERE recurring_rule_id IS NOT NULL
          GROUP BY recurring_rule_id
         HAVING COUNT(*) = 1
       ) single_rule ON single_rule.recurring_rule_id = t.recurring_rule_id
      WHERE t.is_recurring = 1
        AND t.is_verified = 1
        AND t.due_date IS NOT NULL
        AND t.due_date <= ?`,
    [todayKey],
  );
  if (!rows.length) return 0;
  const ids = rows.map(row => String(row.id));
  const placeholders = ids.map(() => '?').join(',');
  await driver.execute(`UPDATE transactions SET is_verified = 0 WHERE id IN (${placeholders})`, ids);
  return ids.length;
}

"""
if repair_fn not in text:
    text = replace_once(text, anchor, anchor + repair_fn, 'dbClient repair function anchor')
text = replace_once(
    text,
    'export async function generateDueRecurringTransactions(driver: SqlJsDatabaseDriver, autoApprove: boolean, today = new Date()): Promise<number> {',
    'export async function generateDueRecurringTransactions(driver: SqlJsDatabaseDriver, _legacyAutoApprove: boolean, today = new Date()): Promise<number> {',
    'dbClient recurring generator signature',
)
count = text.count('is_verified: autoApprove ? 1 : 0')
if count != 2:
    raise RuntimeError(f'dbClient recurring verification expressions: expected 2, found {count}')
text = text.replace('is_verified: autoApprove ? 1 : 0', 'is_verified: 0')
path.write_text(text, encoding='utf-8')


# -----------------------------------------------------------------------------
# Dashboard wording + actions.
# -----------------------------------------------------------------------------
path = Path('src/components/Dashboard.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(text, 'Pending Verifications', 'Needs confirmation', 'Dashboard section title')
text = replace_once(text, 'Click to verify / complete payment', 'Review this recurring transaction', 'Dashboard row title')
text = replace_once(
    text,
    '<CheckCircle2 className="w-3.5 h-3.5" /> Tick & Process',
    '<CheckCircle2 className="w-3.5 h-3.5" /> Review',
    'Dashboard review button',
)
text = replace_once(text, 'No pending items.', 'Nothing needs confirmation.', 'Dashboard empty confirmation state')
text = replace_once(
    text,
    '<h3 className="text-lg font-bold text-on-surface">Is this payment done?</h3>\n                <p className="text-xs text-on-surface-variant">Please confirm if this transaction has been completed.</p>',
    "<h3 className=\"text-lg font-bold text-on-surface\">{pendingConfirmTx.type === 'income' ? 'Did you receive this income?' : pendingConfirmTx.type === 'expense' ? 'Did you make this payment?' : 'Did this transfer happen?'}</h3>\n                <p className=\"text-xs text-on-surface-variant\">Confirm only after it actually happened. Until then, it does not affect your balances.</p>",
    'Dashboard confirmation question',
)
modal_marker = '      {/* Pending Confirmation Modal */}'
idx = text.index(modal_marker)
prefix, modal = text[:idx], text[idx:]
modal = replace_once(modal, '>\n                Cancel\n              </button>', '>\n                Not yet\n              </button>', 'Dashboard not-yet button')
modal = replace_once(modal, '>\n                Reject\n              </button>', '>\n                Skip this occurrence\n              </button>', 'Dashboard skip button')
modal = replace_once(
    modal,
    '>\n                Approve\n              </button>',
    ">\n                {pendingConfirmTx.type === 'income' ? 'Received ✓' : pendingConfirmTx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}\n              </button>",
    'Dashboard confirmation primary action',
)
text = prefix + modal
path.write_text(text, encoding='utf-8')


# -----------------------------------------------------------------------------
# Activity wording + actions.
# -----------------------------------------------------------------------------
path = Path('src/components/Activity.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(text, 'Pending approvals', 'Needs confirmation', 'Activity confirmation title')
text = replace_once(
    text,
    'Pending recurring entries do not affect balances until approved.',
    'Recurring entries stay out of balances until you confirm they happened.',
    'Activity confirmation description',
)
text = replace_once(text, 'Approval date for ${tx.title}', 'Confirmation date for ${tx.title}', 'Activity confirmation date label')
text = replace_once(
    text,
    '>Approve</button>',
    ">{tx.type === 'income' ? 'Received ✓' : tx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}</button>",
    'Activity confirmation primary action',
)
text = replace_once(text, '>Reject</button>', '>Skip</button>', 'Activity skip action')
path.write_text(text, encoding='utf-8')


# -----------------------------------------------------------------------------
# Settings: auto-recurring means automatic creation, never silent approval.
# -----------------------------------------------------------------------------
path = Path('src/components/Settings.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(text, 'title="Auto-recurring payments"', 'title="Auto-create recurring entries"', 'Settings recurring title')
text = replace_once(
    text,
    'desc="Automatically approve due scheduled entries; turn off to require confirmation"',
    'desc="Create due scheduled entries automatically; they still need confirmation before balances change"',
    'Settings recurring description',
)
path.write_text(text, encoding='utf-8')


# -----------------------------------------------------------------------------
# Tests: due entries must remain unverified even when legacy autoApprove=true,
# and the one-time repair must catch the affected first occurrence.
# -----------------------------------------------------------------------------
test_path = Path('src/__tests__/recurringConfirmation.test.ts')
test_path.write_text("""import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { CREATE_TABLES_SQL, SQLITE_PRAGMA_SETUP } from '../db/sqliteSchema';
import {
  createRecurringRule,
  generateDueRecurringTransactions,
  insertTransactionRow,
  repairLegacyRecurringConfirmationState,
  type SqlJsDatabaseDriver,
} from '../db/dbClient';

async function createTestDriver(): Promise<SqlJsDatabaseDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(SQLITE_PRAGMA_SETUP);
  db.exec(CREATE_TABLES_SQL);
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

async function seedAccount(driver: SqlJsDatabaseDriver) {
  await driver.execute(`INSERT INTO accounts (id, name, type) VALUES ('bank-1', 'Bank', 'ASSET')`);
}

describe('recurring confirmation behavior', () => {
  it('creates due recurring entries as unconfirmed even when legacy auto-approve is true', async () => {
    const driver = await createTestDriver();
    await seedAccount(driver);
    await createRecurringRule(driver, {
      title: 'Rent',
      subtitle: 'Monthly rent',
      amount: 20000,
      date: '2026-08-11T12:00:00.000Z',
      category: '#rent',
      icon: 'Home',
      type: 'expense',
      account: 'bank-1',
      fromAccountId: 'bank-1',
      transaction_type: 'EXPENSE',
      is_verified: 1,
      isRecurring: true,
      recurrenceFrequency: 'MONTHLY',
    }, { id: 'rule-1', nextDueDate: '2026-08-11' });

    await generateDueRecurringTransactions(driver, true, new Date('2026-08-11T12:00:00'));
    const rows = await driver.query(`SELECT is_verified, due_date FROM transactions WHERE recurring_rule_id = 'rule-1'`);
    expect(rows).toEqual([{ is_verified: 0, due_date: '2026-08-11' }]);
  });

  it('repairs the legacy auto-verified first occurrence without reopening established history', async () => {
    const driver = await createTestDriver();
    await seedAccount(driver);
    await createRecurringRule(driver, {
      title: 'Rent', amount: 20000, date: '2026-07-13T12:00:00.000Z', category: '#rent', icon: 'Home',
      type: 'expense', account: 'bank-1', fromAccountId: 'bank-1', transaction_type: 'EXPENSE',
      is_verified: 1, isRecurring: true, recurrenceFrequency: 'MONTHLY',
    }, { id: 'rule-legacy', nextDueDate: '2026-08-13' });
    await insertTransactionRow(driver, {
      id: 'legacy-tx', title: 'Rent', amount: 20000, date: '2026-07-13T12:00:00.000Z', category: '#rent', icon: 'Home',
      type: 'expense', account: 'bank-1', fromAccountId: 'bank-1', transaction_type: 'EXPENSE',
      is_verified: 1, isRecurring: true, recurrenceFrequency: 'MONTHLY', recurringRuleId: 'rule-legacy', dueDate: '2026-07-13',
    });

    expect(await repairLegacyRecurringConfirmationState(driver, new Date('2026-08-11T12:00:00'))).toBe(1);
    expect(await driver.query(`SELECT is_verified FROM transactions WHERE id = 'legacy-tx'`)).toEqual([{ is_verified: 0 }]);

    await insertTransactionRow(driver, {
      id: 'history-tx', title: 'Rent', amount: 20000, date: '2026-06-13T12:00:00.000Z', category: '#rent', icon: 'Home',
      type: 'expense', account: 'bank-1', fromAccountId: 'bank-1', transaction_type: 'EXPENSE',
      is_verified: 1, isRecurring: true, recurrenceFrequency: 'MONTHLY', recurringRuleId: 'rule-legacy', dueDate: '2026-06-13',
    });
    expect(await repairLegacyRecurringConfirmationState(driver, new Date('2026-08-11T12:00:00'))).toBe(0);
  });
});
""", encoding='utf-8')

print('Needs-confirmation recurring fix applied.')
