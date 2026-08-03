import { startAuthorization } from '../_googleDrive.js';

export default function handler(req, res) {
  try {
    // startAuthorization uses access_type=offline and prompt=consent so Google
    // returns a refresh token even after prior development authorization.
    startAuthorization(req, res);
  } catch (error) {
    console.error('Google Drive authorization start failed.', { message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start Google Drive authorization.' });
  }
}
