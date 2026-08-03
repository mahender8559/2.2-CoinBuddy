import { driveFetch } from '../_googleDrive.js';
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { filename, content } = req.body || {};
    if (!filename || typeof content !== 'string') throw new Error('Backup content is required.');
    const metadata = new Blob([JSON.stringify({ name: filename, parents: ['appDataFolder'], mimeType: 'application/json', appProperties: { coinbuddyBackup: 'true' } })], { type: 'application/json' });
    const form = new FormData(); form.append('metadata', metadata); form.append('file', new Blob([content], { type: 'application/json' }), filename);
    const response = await driveFetch(req, res, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size', { method: 'POST', body: form });
    res.status(200).json(await response.json());
  } catch (error) { res.status(400).json({ error: error.message }); }
}
