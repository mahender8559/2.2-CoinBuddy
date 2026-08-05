export function validateEnvironment() {
  const missing: string[] = [];
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  if (!clientSecret || clientSecret.trim() === '') missing.push('GOOGLE_CLIENT_SECRET');
  if (!key || key.trim() === '') missing.push('GOOGLE_TOKEN_ENCRYPTION_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. See .env.example for details.`);
  }

  // Validate encryption key length (32 bytes) as base64 or 64 hex chars
  if (key) {
    const isHex = /^[a-f0-9]{64}$/i.test(key);
    try {
      const bytes = Buffer.from(key, isHex ? 'hex' : 'base64');
      if (bytes.length !== 32) {
        throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value or 64 hex characters.');
      }
    } catch (err) {
      throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value or 64 hex characters.');
    }
  }
}
