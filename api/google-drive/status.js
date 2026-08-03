import { parseCookies } from '../_googleDrive.js';
export default function handler(req, res) {
  const cookies = parseCookies(req);
  console.log('Drive cookie diagnostics:', { cookieNames: Object.keys(cookies), hasDriveSession: Boolean(cookies.coinbuddy_drive_session) });
  res.status(200).json({ connected: Boolean(cookies.coinbuddy_drive_session) });
}
