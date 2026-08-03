import { startAuthorization } from '../_googleDrive.js';
export default function handler(req, res) { try { startAuthorization(req, res); } catch (error) { res.status(500).json({ error: error.message }); } }
