import crypto from 'crypto';
import { kvGet, kvSet } from '../lib/cache.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Generate session token
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  try {
    await kvSet(`admin-token:${token}`, { expires });
  } catch (err) {
    console.error('Admin auth KV error:', err);
    return res.status(500).json({ error: 'Failed to create session' });
  }

  return res.status(200).json({ token, expires });
}
