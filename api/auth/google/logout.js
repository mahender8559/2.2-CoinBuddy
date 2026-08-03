import { setCookie } from '../../_googleDrive.js';

const SESSION_COOKIE = 'coinbuddy_auth_session';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  setCookie(res, SESSION_COOKIE, '', 0);
  return res.status(200).json({ ok: true });
}
