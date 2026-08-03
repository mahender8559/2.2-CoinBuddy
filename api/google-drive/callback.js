import { appUrl, finishAuthorization } from '../_googleDrive.js';

export default async function handler(req, res) {
  try {
    const tokens = await finishAuthorization(req, res);
    console.log('Tokens received:', Object.keys(tokens));
    res.redirect(`${appUrl(req)}/?tab=settings&drive=connected`);
  } catch (error) {
    console.error('CRYPTO_FAIL:', error);
    res.status(500).json({
      error: 'Google Drive authorization failed.',
      detail: error instanceof Error ? error.message : 'Unknown OAuth or encryption error.',
    });
  }
}
