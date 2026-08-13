from pathlib import Path

p = Path('src/__tests__/backupManager.test.ts')
s = p.read_text()
old = "expect(upgraded.schemaVersion).toBe('coinbuddy-ledger-v3');"
new = "expect(upgraded.schemaVersion).toBe('coinbuddy-ledger-v4');"
if old not in s:
    raise SystemExit('backup schema expectation anchor not found')
p.write_text(s.replace(old, new, 1))
