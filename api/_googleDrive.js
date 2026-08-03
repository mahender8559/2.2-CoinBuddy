import crypto from 'node:crypto';

const COOKIE = 'coinbuddy_drive_session';
const STATE_COOKIE = 'coinbuddy_drive_state';
const scope = 'https://www.googleapis.com/auth/drive.appdata';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function appUrl(req) {
  return process.env.APP_URL || `https://${req.headers.host}`;
}

export function callbackUrl(req) {
  return `${appUrl(req)}/api/google-drive/callback`;
}

export function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split(/=(.*)/s)).filter(([k]) => k));
}

function key() {
  const value = required('GOOGLE_TOKEN_ENCRYPTION_KEY');
  const bytes = Buffer.from(value, /^[a-f0-9]{64}$/i.test(value) ? 'hex' : 'base64');
  if (bytes.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value or 64 hex characters.');
  return bytes;
}

function seal(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

function unseal(value) {
  const bytes = Buffer.from(value, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}

export function setCookie(res, name, value, maxAge = 600, path = '/') {
  res.setHeader('Set-Cookie', `${name}=${value}; Secure; HttpOnly; SameSite=None; Path=${path}; Max-Age=${maxAge}`);
}

export function startAuthorization(req, res) {
  const state = crypto.randomBytes(32).toString('base64url');
  setCookie(res, STATE_COOKIE, state);
  const params = new URLSearchParams({ client_id: required('GOOGLE_CLIENT_ID'), redirect_uri: callbackUrl(req), response_type: 'code', scope, access_type: 'offline', prompt: 'consent', state });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export async function finishAuthorization(req, res) {
  if (!req.query.state || req.query.state !== parseCookies(req)[STATE_COOKIE]) throw new Error('Google Drive connection could not be verified. Please try again.');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), redirect_uri: callbackUrl(req), grant_type: 'authorization_code' }) });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(tokens.error_description || 'Google token exchange failed.');
  // Never replace a working encrypted session with an empty OAuth response.
  if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Remove CoinBuddy access in Google Account permissions, then reconnect.');
  try {
    setCookie(res, COOKIE, seal({ refreshToken: tokens.refresh_token }), 60 * 60 * 24 * 30);
  } catch (err) {
    console.error('Encryption Failure:', err);
    throw new Error('Unable to encrypt the Google Drive session.');
  }
  return tokens;
}

export async function driveToken(req, res) {
  const session = parseCookies(req)[COOKIE];
  if (!session) throw new Error('Google Drive is not connected.');
  const { refreshToken } = unseal(session);
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const tokens = await response.json();
  if (!response.ok) throw new Error('Google Drive authorization expired. Reconnect Google Drive.');
  return tokens.access_token;
}

export async function driveFetch(req, res, url, init = {}) {
  const token = await driveToken(req, res);
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!response.ok) throw new Error((await response.text()) || 'Google Drive request failed.');
  return response;
}
