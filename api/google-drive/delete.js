import { driveFetch } from '../_googleDrive.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed.' });
  const fileId = req.query.id;
  if (typeof fileId !== 'string' || !fileId) return res.status(400).json({ error: 'A backup file id is required.' });

  try {
    await driveFetch(req, res, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    return res.status(200).json({ deleted: true, id: fileId });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Google Drive backup deletion failed.' });
  }
}
