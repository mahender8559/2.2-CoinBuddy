import { parseCookies, unsealSession } from '../../_googleDrive.js';

const SESSION_COOKIE = 'coinbuddy_auth_session';

export default function handler(req, res) {
  try {
    const encryptedSession = parseCookies(req)[SESSION_COOKIE];
    if (!encryptedSession) return res.status(200).json({ authenticated: false });

    const session = unsealSession(encryptedSession);
    if (!session.sub || !session.email || !session.expiresAt || session.expiresAt <= Date.now()) {
      return res.status(200).json({ authenticated: false });
    }

    return res.status(200).json({
      authenticated: true,
      user: { name: session.name, email: session.email, picture: session.picture },
    });
  } catch (error) {
    console.warn('Invalid Google sign-in session:', error instanceof Error ? error.message : 'unknown error');
    return res.status(200).json({ authenticated: false });
  }
}
