const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

async function digest(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

/** Stored value format: sha256:salt:hash. The PIN itself is never persisted. */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return `sha256:${salt}:${await digest(`${salt}:${passcode}`)}`;
}

export async function verifyPasscode(passcode: string, stored: string | null): Promise<boolean> {
  if (!stored?.startsWith('sha256:')) return false;
  const [, salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  return (await digest(`${salt}:${passcode}`)) === expected;
}
