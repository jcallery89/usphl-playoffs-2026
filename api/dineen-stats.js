import { kvGet } from '../lib/cache.js';

const DINEEN_STATS_KEY = 'dineen-game-stats';

export default async function handler(req, res) {
  try {
    const stats = (await kvGet(DINEEN_STATS_KEY)) || {};
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(stats);
  } catch (err) {
    console.error('Dineen stats error:', err);
    return res.status(500).json({ error: 'Failed to load Dineen stats' });
  }
}
