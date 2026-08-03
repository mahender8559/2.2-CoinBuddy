import { driveFetch, parseCookies } from '../_googleDrive.js';
export const config = { api: { bodyParser: false } };

async function readRawBody(req, maxBytes = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Backup is larger than the 4 MB upload limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const session = parseCookies(req).coinbuddy_drive_session;
    if (!session) {
      console.error('Google Drive backup rejected: missing Drive session cookie.');
      return res.status(401).json({ error: 'Google Drive is not connected. Reconnect and try again.' });
    }
    const filename = decodeURIComponent(req.headers['x-coinbuddy-filename'] || '');
    const body = await readRawBody(req);
    if (!filename || !body.length) {
      console.error('Google Drive backup rejected: missing filename or empty upload body.', { hasFilename: Boolean(filename), bytes: body.length });
      return res.status(400).json({ error: 'Encrypted backup payload is empty or invalid.' });
    }
    const content = body.toString('utf8');
    try { JSON.parse(content); } catch {
      console.error('Google Drive backup rejected: encrypted payload is not valid JSON.');
      return res.status(400).json({ error: 'Encrypted backup payload is malformed.' });
    }
    const metadata = new Blob([JSON.stringify({ name: filename, parents: ['appDataFolder'], mimeType: 'application/json', appProperties: { coinbuddyBackup: 'true' } })], { type: 'application/json' });
    const form = new FormData(); form.append('metadata', metadata); form.append('file', new Blob([content], { type: 'application/json' }), filename);
    const response = await driveFetch(req, res, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size', { method: 'POST', body: form });
    res.status(200).json(await response.json());
  } catch (error) {
    console.error('Google Drive backup failed.', { message: error instanceof Error ? error.message : String(error) });
    res.status(400).json({ error: error instanceof Error ? error.message : 'Google Drive backup failed.' });
  }
}
