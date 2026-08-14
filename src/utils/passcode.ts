const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

async function digest(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

async function derivePbkdf2(passcode: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(passcode), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210000 }, key, 256);
  return toHex(new Uint8Array(bits));
}


/** True when a persisted value is already a supported one-way passcode hash. */
export function isPasscodeHash(stored: string | null): boolean {
  return stored?.startsWith('pbkdf2-sha256:') === true || stored?.startsWith('sha256:') === true;
}

/** Stored value format: pbkdf2-sha256:salt:hash. The PIN itself is never persisted. */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256:${toHex(salt)}:${await derivePbkdf2(passcode, salt)}`;
}

export async function verifyPasscode(passcode: string, stored: string | null): Promise<boolean> {
  if (stored?.startsWith('pbkdf2-sha256:')) {
    const [, saltHex, expected] = stored.split(':');
    if (!saltHex || !expected) return false;
    const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map(value => parseInt(value, 16)) ?? []);
    return (await derivePbkdf2(passcode, salt)) === expected;
  }
  if (!stored?.startsWith('sha256:')) return false;
  const [, salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  return (await digest(`${salt}:${passcode}`)) === expected;
}
