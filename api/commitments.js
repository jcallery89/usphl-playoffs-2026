/**
 * Public GET endpoint for college commitments.
 * Reads published data from Redis, enriches with team/college info, returns full data.
 */
import { kvGet } from '../lib/cache.js';
import { enrichCommitments } from '../lib/enrich-commitments.js';
import { readFileSync } from 'fs';
import { join } from 'path';

let teamMappingsCache = null;

function getTeamMappings() {
  if (!teamMappingsCache) {
    const filePath = join(process.cwd(), 'data', 'team-mappings.json');
    teamMappingsCache = JSON.parse(readFileSync(filePath, 'utf8'));
  }
  return teamMappingsCache;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read published data from Redis
    const published = await kvGet('commitments-published');
    if (!published || !published.commitments) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10');
      return res.status(200).json({
        generated: null,
        season: '2025-26',
        league: 'NCDC',
        count: 0,
        commitments: [],
      });
    }

    // Read college mappings from Redis
    const collegeMappingsData = await kvGet('college-mappings');
    const collegeMappings = collegeMappingsData ? (collegeMappingsData.colleges || collegeMappingsData) : {};

    // Read team mappings from filesystem (static)
    const teamMappings = getTeamMappings();

    // Enrich flat records
    const enriched = enrichCommitments(published.commitments, teamMappings, collegeMappings);

    const response = {
      generated: published._lastUpdated || new Date().toISOString(),
      season: published.season || '2025-26',
      league: published.league || 'NCDC',
      count: enriched.length,
      commitments: enriched,
    };

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(response);
  } catch (err) {
    console.error('Commitments GET error:', err);
    return res.status(500).json({ error: 'Failed to load commitments' });
  }
}
