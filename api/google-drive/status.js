import { parseCookies } from '../_googleDrive.js';
export default function handler(req, res) { res.status(200).json({ connected: Boolean(parseCookies(req).coinbuddy_drive_session) }); }
