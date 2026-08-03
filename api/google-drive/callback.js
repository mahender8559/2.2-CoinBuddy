import { appUrl, finishAuthorization } from '../_googleDrive.js';
export default async function handler(req, res) { try { await finishAuthorization(req, res); res.redirect(`${appUrl(req)}/?drive=connected`); } catch (error) { res.redirect(`${appUrl(req)}/?drive=error`); } }
