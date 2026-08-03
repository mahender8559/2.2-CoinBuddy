import crypto from 'node:crypto';
import { appUrl, required, setCookie } from '../../_googleDrive.js';

const STATE_COOKIE = 'coinbuddy_auth_state';

export default function handler(req, res) {
  const state = crypto.randomBytes(32).toString('base64url');
  setCookie(res, STATE_COOKIE, state);

  const params = new URLSearchParams({
    client_id: required('GOOGLE_CLIENT_ID'),
    redirect_uri: `${appUrl(req)}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
