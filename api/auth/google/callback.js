import { appUrl, parseCookies, required, sealSession, setCookie } from '../../_googleDrive.js';

const STATE_COOKIE = 'coinbuddy_auth_state';
const SESSION_COOKIE = 'coinbuddy_auth_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export default async function handler(req, res) {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state || state !== parseCookies(req)[STATE_COOKIE]) {
      return res.status(400).json({ error: 'Google sign-in could not be verified. Please try again.' });
    }

    const redirectUri = `${appUrl(req)}/api/auth/google/callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: required('GOOGLE_CLIENT_ID'),
        client_secret: required('GOOGLE_CLIENT_SECRET'),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) {
      throw new Error(tokens.error_description || 'Google token exchange failed.');
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.sub || !profile.email) {
      throw new Error('Google did not return a usable account profile.');
    }

    const encryptedSession = sealSession({
      sub: profile.sub,
      email: profile.email,
      name: profile.name || profile.email,
      picture: profile.picture || '',
      expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
    });
    setCookie(res, SESSION_COOKIE, encryptedSession, SESSION_MAX_AGE);
    return res.redirect(`${appUrl(req)}/?auth=connected`);
  } catch (error) {
    console.error('Google sign-in failed:', error);
    return res.status(500).json({ error: 'Google sign-in failed. Please try again.' });
  }
}
