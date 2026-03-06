import { getTeams } from '../lib/timetoscore.js';
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
    const teams = await getCached(
      `teams:${leagueId}`,
      () => getTeams(leagueId),
      3600 // 1 hour TTL — teams don't change often
    );

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(teams);
  } catch (err) {
    console.error('Teams API error:', err);
    return res.status(500).json({ error: 'Failed to fetch teams' });
  }
}
