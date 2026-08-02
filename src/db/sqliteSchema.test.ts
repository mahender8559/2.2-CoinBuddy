import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import initSqlJs from 'sql.js';
import { 
  CREATE_TABLES_SQL, 
  SQLITE_PRAGMA_SETUP, 
  insertTransaction, 
  updateOpeningBalance,
  deleteAccountInDB,
  auditDatabaseIntegrity
} from './sqliteSchema';

describe('Database Integrity Property-Based Tests', () => {
  it('should maintain accurate cached_balances across a sequence of random actions', async () => {
    const SQL = await initSqlJs();

    class MockDriver {
      db: any;
      constructor(db: any) {
        this.db = db;
      }
      async execute(sql: string, params?: any[]) {
        if (params && params.length > 0) { this.db.run(sql, params); } else { this.db.exec(sql); }
      }
      async query(sql: string, params?: any[]) {
        const stmt = this.db.prepare(sql);
        if (params) {
          stmt.bind(params);
        }
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
      }
    }

    // Define commands
    const AccountIdArb = fc.integer({ min: 1, max: 10 }).map(String);
    
    // Command Generators
    const CreateAccountArb = fc.record({
      type: fc.constant('CREATE_ACCOUNT'),
      id: AccountIdArb,
      accType: fc.constantFrom('ASSET', 'LIABILITY')
    });

    const InsertTxArb = fc.record({
      type: fc.constant('INSERT_TX'),
      id: fc.uuid(),
      txType: fc.constantFrom('INCOME', 'EXPENSE', 'TRANSFER', 'OPENING_BALANCE'),
      amount: fc.integer({ min: 1, max: 1000 }),
      from: AccountIdArb,
      to: AccountIdArb
    });

    const DeleteAccountArb = fc.record({
      type: fc.constant('DELETE_ACCOUNT'),
      id: AccountIdArb
    });

    const UpdateOpeningBalanceArb = fc.record({
      type: fc.constant('UPDATE_OPENING_BALANCE'),
      id: AccountIdArb,
      newAmount: fc.integer({ min: 0, max: 1000 })
    });

    const ActionArb = fc.oneof(CreateAccountArb, InsertTxArb, DeleteAccountArb, UpdateOpeningBalanceArb);

    await fc.assert(
      fc.asyncProperty(fc.array(ActionArb, { minLength: 50, maxLength: 100 }), async (actions) => {
        const db = new SQL.Database();
        const driver = new MockDriver(db);
        
        await driver.execute(SQLITE_PRAGMA_SETUP);
        await driver.execute(CREATE_TABLES_SQL);

        // Track active accounts manually to ensure we only do valid operations,
        // or just try/catch operations that fail validation.
        for (const action of actions) {
          try {
            if (action.type === 'CREATE_ACCOUNT') {
              // Ignore if already exists to keep it simple, or just use INSERT OR IGNORE
              await driver.execute(
                `INSERT OR IGNORE INTO accounts (id, name, type, cached_balance, is_archived) VALUES (?, ?, ?, 0, 0)`,
                [action.id, `Acc ${action.id}`, action.accType]
              );
            } else if (action.type === 'INSERT_TX') {
              // Only insert if accounts exist and are not archived
              const fromValid = (await driver.query(`SELECT id FROM accounts WHERE id = ? AND is_archived = 0`, [action.from])).length > 0;
              const toValid = (await driver.query(`SELECT id FROM accounts WHERE id = ? AND is_archived = 0`, [action.to])).length > 0;
              
              if (action.txType === 'INCOME' && toValid) {
                await insertTransaction(driver, {
                  transaction_type: 'INCOME',
                  amount: action.amount,
                  date: Date.now(),
                  to_account_id: action.to,
                  is_verified: 1
                });
              } else if (action.txType === 'EXPENSE' && fromValid) {
                await insertTransaction(driver, {
                  transaction_type: 'EXPENSE',
                  amount: action.amount,
                  date: Date.now(),
                  from_account_id: action.from,
                  is_verified: 1
                });
              } else if (action.txType === 'TRANSFER' && fromValid && toValid && action.from !== action.to) {
                await insertTransaction(driver, {
                  transaction_type: 'TRANSFER',
                  amount: action.amount,
                  date: Date.now(),
                  from_account_id: action.from,
                  to_account_id: action.to,
                  is_verified: 1
                });
              } else if (action.txType === 'OPENING_BALANCE') {
                // Determine if it should be an ASSET or LIABILITY opening balance
                if (toValid) {
                   const type = (await driver.query(`SELECT type FROM accounts WHERE id = ?`, [action.to]))[0].type;
                   if (type === 'ASSET') {
                     await insertTransaction(driver, {
                       transaction_type: 'OPENING_BALANCE',
                       amount: action.amount,
                       date: Date.now(),
                       to_account_id: action.to,
                       is_verified: 1
                     });
                   }
                }
                if (fromValid) {
                   const type = (await driver.query(`SELECT type FROM accounts WHERE id = ?`, [action.from]))[0].type;
                   if (type === 'LIABILITY') {
                     await insertTransaction(driver, {
                       transaction_type: 'OPENING_BALANCE',
                       amount: action.amount,
                       date: Date.now(),
                       from_account_id: action.from,
                       is_verified: 1
                     });
                   }
                }
              }
            } else if (action.type === 'DELETE_ACCOUNT') {
              const valid = (await driver.query(`SELECT id FROM accounts WHERE id = ?`, [action.id])).length > 0;
              if (valid) {
                await deleteAccountInDB(driver, action.id);
              }
            } else if (action.type === 'UPDATE_OPENING_BALANCE') {
              const valid = (await driver.query(`SELECT id FROM accounts WHERE id = ? AND is_archived = 0`, [action.id])).length > 0;
              if (valid) {
                 await updateOpeningBalance(driver, action.id, action.newAmount);
              }
            }
          } catch (err) {
            // It's normal for constraints or validations to fail in fuzz testing (like overdrafts)
            // Just ignore and proceed
          }
        }

        // Post-condition validation
        const integrityResult = await auditDatabaseIntegrity(driver);
        
        expect(integrityResult.mismatches).toEqual([]);
        
        // Also ensure no ASSET has a negative balance (assuming business logic strictly forbids it? Wait, insertTransaction doesn't prevent negative balances natively for Expenses/Transfers. The prompt says "no ASSET balance dropped below zero". Let's check if the prompt implies we MUST assert this.)
        // "and no ASSET balance dropped below zero." - Wait, if there's no constraint preventing it in insertTransaction, this assertion might fail. Let's see if the prompt meant to assert it anyway.
        const assetAccounts = await driver.query(`SELECT id, cached_balance FROM account_balances_view WHERE type = 'ASSET'`);
        for (const asset of assetAccounts) {
          // If the app is supposed to enforce it, maybe it's not enforced in sqliteSchema.ts yet.
          // Let's assert it and we can fix sqliteSchema.ts if it fails.
          // Actually, let's just assert it.
          expect(asset.cached_balance).toBeGreaterThanOrEqual(0);
        }

        db.close();
      }),
      { numRuns: 10 }
    );
  }, 10000);
});
