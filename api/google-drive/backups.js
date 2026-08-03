import { driveFetch } from '../_googleDrive.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    if (req.query.id) {
      const response = await driveFetch(req, res, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(req.query.id)}?alt=media`);
      res.status(200).type('application/json').send(await response.text());
      return;
    }
    const params = new URLSearchParams({ spaces: 'appDataFolder', q: "appProperties has { key='coinbuddyBackup' and value='true' }", orderBy: 'modifiedTime desc', pageSize: '20', fields: 'files(id,name,modifiedTime,size)' });
    const response = await driveFetch(req, res, `https://www.googleapis.com/drive/v3/files?${params}`);
    res.status(200).json(await response.json());
  } catch (error) { res.status(400).json({ error: error.message }); }
}
