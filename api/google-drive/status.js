import { driveToken, setCookie } from '../_googleDrive.js';

const SESSION_COOKIE = 'coinbuddy_drive_session';

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    // A cookie alone does not prove the Google authorization is still usable.
    // Refresh an access token so the UI only reports connected for a valid,
    // decryptable session whose refresh token Google still accepts.
    await driveToken(req, res);
    return res.status(200).json({ connected: true });
  } catch (error) {
    // Remove stale/corrupt sessions so the next authenticate() call starts a
    // fresh OAuth handshake instead of repeatedly trusting a dead cookie.
    setCookie(res, SESSION_COOKIE, '', 0);
    return res.status(200).json({ connected: false });
  }
}
