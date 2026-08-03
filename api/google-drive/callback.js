import { appUrl, finishAuthorization } from '../_googleDrive.js';

export default async function handler(req, res) {
  try {
    await finishAuthorization(req, res);
    res.redirect(`${appUrl(req)}/?drive=connected`);
  } catch (error) {
    const params = new URLSearchParams({ drive: 'error', drive_error: error instanceof Error ? error.message : 'Google Drive connection failed.' });
    res.redirect(`${appUrl(req)}/?${params}`);
  }
}
