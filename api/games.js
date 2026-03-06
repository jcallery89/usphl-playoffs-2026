import { getSchedule } from '../lib/timetoscore.js';
import { getCached } from '../lib/cache.js';

const VALID_LEAGUES = ['1', '2', '3'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const leagueId = req.query.league_id;
  if (!leagueId || !VALID_LEAGUES.includes(leagueId)) {
    return res.status(400).json({ error: 'league_id must be 1, 2, or 3' });
  }

  try {
    const games = await getCached(
      `games:${leagueId}`,
      () => getSchedule(leagueId),
      900 // 15 min TTL
    );

    // Add cache header for Vercel edge
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(games);
  } catch (err) {
    console.error('Games API error:', err);
    return res.status(500).json({ error: 'Failed to fetch games' });
  }
}
