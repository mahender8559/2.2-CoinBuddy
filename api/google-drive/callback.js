import { appUrl, finishAuthorization } from '../_googleDrive.js';

export default async function handler(req, res) {
  try {
    const tokens = await finishAuthorization(req, res);
    console.log('Tokens received:', Object.keys(tokens));
    res.redirect(`${appUrl(req)}/?tab=settings&drive=connected`);
  } catch (error) {
    const params = new URLSearchParams({ tab: 'settings', drive: 'error', drive_error: error instanceof Error ? error.message : 'Google Drive connection failed.' });
    res.redirect(`${appUrl(req)}/?${params}`);
  }
}
