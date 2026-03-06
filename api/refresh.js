import { invalidateCache } from '../lib/cache.js';

export default async function handler(req, res) {
  // Accept both POST (manual) and GET (Vercel cron)
  try {
    await invalidateCache();
    return res.status(200).json({ ok: true, message: 'Cache invalidated' });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Failed to invalidate cache' });
  }
}
