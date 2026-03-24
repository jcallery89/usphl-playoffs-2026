import { getStandings } from '../lib/timetoscore.js';
import { getCached } from '../lib/cache.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const leagueId = req.query.league_id;
  if (!leagueId || !['1', '2', '3'].includes(leagueId)) {
    return res.status(400).json({ error: 'league_id must be 1, 2, or 3' });
  }

  try {
    const standings = await getCached(
      `standings:${leagueId}`,
      () => getStandings(leagueId),
      900
    );

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(standings);
  } catch (err) {
    console.error('Standings API error:', err);
    return res.status(500).json({ error: 'Failed to fetch standings' });
  }
}
