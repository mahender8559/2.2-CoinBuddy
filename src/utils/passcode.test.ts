import { describe, expect, it } from 'vitest';
import { isPasscodeHash } from './passcode';

describe('persisted passcode format detection', () => {
  it('recognizes the current PBKDF2 format without re-hashing it', () => {
    expect(isPasscodeHash('pbkdf2-sha256:001122:aabbcc')).toBe(true);
  });

  it('continues to recognize the legacy SHA-256 format', () => {
    expect(isPasscodeHash('sha256:legacy-salt:legacy-hash')).toBe(true);
  });

  it('treats plaintext and empty values as migration inputs, not hashes', () => {
    expect(isPasscodeHash('1234')).toBe(false);
    expect(isPasscodeHash('')).toBe(false);
    expect(isPasscodeHash(null)).toBe(false);
  });
});
