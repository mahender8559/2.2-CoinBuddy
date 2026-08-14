from pathlib import Path

# Add one shared format predicate so AppContext cannot accidentally re-hash the
# current PBKDF2 persisted value as if it were a legacy plaintext PIN.
passcode_path = Path('src/utils/passcode.ts')
passcode = passcode_path.read_text()
helper = """\n/** True when a persisted value is already a supported one-way passcode hash. */\nexport function isPasscodeHash(stored: string | null): boolean {\n  return stored?.startsWith('pbkdf2-sha256:') === true || stored?.startsWith('sha256:') === true;\n}\n"""
if 'export function isPasscodeHash' not in passcode:
    marker = "/** Stored value format: pbkdf2-sha256:salt:hash. The PIN itself is never persisted. */\n"
    if marker not in passcode:
        raise SystemExit('passcode helper insertion marker not found')
    passcode = passcode.replace(marker, helper + "\n" + marker, 1)
passcode_path.write_text(passcode)

# Use the predicate during DB hydration. Current PBKDF2 and legacy SHA-256
# hashes must be loaded verbatim; only truly legacy plaintext values are hashed.
context_path = Path('src/context/AppContext.tsx')
context = context_path.read_text()
context = context.replace(
    "import { hashPasscode, verifyPasscode as verifyPasscodeHash } from '../utils/passcode';",
    "import { hashPasscode, isPasscodeHash, verifyPasscode as verifyPasscodeHash } from '../utils/passcode';",
    1,
)
old = """          if (storedPasscode && !storedPasscode.startsWith('sha256:')) setPasscode(storedPasscode);\n          else setPasscodeHash(storedPasscode);"""
new = """          if (storedPasscode && !isPasscodeHash(storedPasscode)) setPasscode(storedPasscode);\n          else setPasscodeHash(storedPasscode);"""
if new not in context:
    if old not in context:
        raise SystemExit('AppContext stored-passcode marker not found')
    context = context.replace(old, new, 1)
context_path.write_text(context)

# Fast unit coverage for the regression. The expensive PBKDF2 algorithm is
# already exercised by the browser test; this specifically protects hydration.
Path('src/utils/passcode.test.ts').write_text("""import { describe, expect, it } from 'vitest';\nimport { isPasscodeHash } from './passcode';\n\ndescribe('persisted passcode format detection', () => {\n  it('recognizes the current PBKDF2 format without re-hashing it', () => {\n    expect(isPasscodeHash('pbkdf2-sha256:001122:aabbcc')).toBe(true);\n  });\n\n  it('continues to recognize the legacy SHA-256 format', () => {\n    expect(isPasscodeHash('sha256:legacy-salt:legacy-hash')).toBe(true);\n  });\n\n  it('treats plaintext and empty values as migration inputs, not hashes', () => {\n    expect(isPasscodeHash('1234')).toBe(false);\n    expect(isPasscodeHash('')).toBe(false);\n    expect(isPasscodeHash(null)).toBe(false);\n  });\n});\n""")

print('Fixed persisted PBKDF2 passcode hydration and added regression coverage')
