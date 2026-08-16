import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.GOOGLE_CLIENT_ID = 'coinbuddy-test-client';
process.env.GOOGLE_CLIENT_SECRET = 'coinbuddy-test-secret';
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = '11'.repeat(32);
process.env.APP_URL = 'https://coinbuddy.test';

const drive = await import('../api/_googleDrive.js');
const { default: statusHandler } = await import('../api/google-drive/status.js');

function makeRequest(cookie = '', query = {}, method = 'GET') {
  return {
    method,
    query,
    headers: {
      cookie,
      host: 'coinbuddy.test',
    },
  };
}

function makeResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: undefined,
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    get headers() {
      return headers;
    },
  };
}

function setCookies(res) {
  const value = res.getHeader('Set-Cookie');
  if (!value) return [];
  return Array.isArray(value) ? value : [String(value)];
}

// 1. Importing the production API module itself is part of this verification.
assert.equal(typeof drive.startAuthorization, 'function');
assert.equal(typeof drive.finishAuthorization, 'function');
assert.equal(typeof drive.driveToken, 'function');

// 2. A valid encrypted session must only report connected after Google accepts
// the stored refresh token and returns an access token.
const validSession = drive.sealSession({ refreshToken: 'refresh-valid' });
let refreshCalls = 0;
globalThis.fetch = async (url) => {
  assert.equal(String(url), 'https://oauth2.googleapis.com/token');
  refreshCalls += 1;
  return new Response(JSON.stringify({ access_token: 'access-valid' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

{
  const res = makeResponse();
  await statusHandler(makeRequest(`coinbuddy_drive_session=${validSession}`), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { connected: true });
  assert.equal(refreshCalls, 1);
  assert.equal(setCookies(res).length, 0);
}

// 3. A revoked refresh token must report disconnected and clear the stale
// encrypted session so the frontend starts a fresh OAuth handshake next time.
globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), {
  status: 400,
  headers: { 'Content-Type': 'application/json' },
});

{
  const res = makeResponse();
  await statusHandler(makeRequest(`coinbuddy_drive_session=${validSession}`), res);
  assert.deepEqual(res.body, { connected: false });
  assert.ok(setCookies(res).some(cookie => cookie.startsWith('coinbuddy_drive_session=') && cookie.includes('Max-Age=0')));
}

// 4. A corrupt encrypted cookie must never be treated as connected and must be
// cleared without making a Google token request.
let corruptFetchCalled = false;
globalThis.fetch = async () => {
  corruptFetchCalled = true;
  throw new Error('fetch should not be reached for a corrupt session');
};

{
  const res = makeResponse();
  await statusHandler(makeRequest('coinbuddy_drive_session=not-a-valid-session'), res);
  assert.deepEqual(res.body, { connected: false });
  assert.equal(corruptFetchCalled, false);
  assert.ok(setCookies(res).some(cookie => cookie.includes('Max-Age=0')));
}

// 5. The OAuth state cookie is single-use. A successful callback exchange must
// clear it and establish a long-lived encrypted Drive session.
globalThis.fetch = async (url) => {
  assert.equal(String(url), 'https://oauth2.googleapis.com/token');
  return new Response(JSON.stringify({ access_token: 'access-new', refresh_token: 'refresh-new' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

{
  const res = makeResponse();
  await drive.finishAuthorization(
    makeRequest('coinbuddy_drive_state=state-once', { state: 'state-once', code: 'auth-code' }),
    res,
  );
  const cookies = setCookies(res);
  assert.ok(cookies.some(cookie => cookie.startsWith('coinbuddy_drive_state=') && cookie.includes('Max-Age=0')));
  assert.ok(cookies.some(cookie => cookie.startsWith('coinbuddy_drive_session=') && cookie.includes(`Max-Age=${60 * 60 * 24 * 365}`)));
}

console.log('Google Drive auth verification passed.');
