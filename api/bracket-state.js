import { kvGet, kvSet, getCached } from '../lib/cache.js';
import { getSchedule } from '../lib/timetoscore.js';
import { updateBracketWithGames } from '../lib/bracket-engine.js';

const BRACKET_KEY = 'bracket-state';

async function verifyAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return false;
  const session = await kvGet(`admin-token:${token}`);
  return session && session.expires > Date.now();
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  }
  if (req.method === 'POST') {
    return handlePost(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res) {
  try {
    let bracketState = await kvGet(BRACKET_KEY);

    if (!bracketState) {
      return res.status(200).json({ _empty: true, message: 'Bracket state not initialized. Run npm run init-bracket.' });
    }

    // Fetch latest games and update series records
    const [premierGames, eliteGames, ncdcGames] = await Promise.all([
      getCached('games:2', () => getSchedule('2'), 900),
      getCached('games:3', () => getSchedule('3'), 900),
      getCached('games:1', () => getSchedule('1'), 900),
    ]);

    const allGames = {
      Premier: premierGames || [],
      Elite: eliteGames || [],
      NCDC: ncdcGames || [],
    };

    // Update series records from live data (also auto-advances completed rounds)
    bracketState = updateBracketWithGames(bracketState, allGames);

    // If auto-advance happened, persist the updated state back to KV
    // so that future reads don't need to re-compute and admin sees it too
    if (bracketState._autoAdvanced) {
      delete bracketState._autoAdvanced;
      bracketState._updatedBy = 'auto-advance';
      kvSet(BRACKET_KEY, bracketState).catch(err =>
        console.error('Failed to persist auto-advanced state:', err)
      );
    } else {
      delete bracketState._autoAdvanced;
    }

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(bracketState);
  } catch (err) {
    console.error('Bracket state GET error:', err);
    return res.status(500).json({ error: 'Failed to load bracket state' });
  }
}

async function handlePost(req, res) {
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const update = req.body;

    if (!update || typeof update !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // If full state replacement
    if (update._version) {
      update._lastUpdated = new Date().toISOString();
      update._updatedBy = 'admin';
      await kvSet(BRACKET_KEY, update);
      return res.status(200).json({ ok: true, message: 'Bracket state updated' });
    }

    // Partial update: merge into existing state
    const current = await kvGet(BRACKET_KEY);
    if (!current) {
      return res.status(400).json({ error: 'No existing state to update. Initialize first.' });
    }

    // Deep merge the update
    const merged = deepMerge(current, update);
    merged._lastUpdated = new Date().toISOString();
    merged._updatedBy = 'admin';
    await kvSet(BRACKET_KEY, merged);

    return res.status(200).json({ ok: true, message: 'Bracket state updated' });
  } catch (err) {
    console.error('Bracket state POST error:', err);
    return res.status(500).json({ error: 'Failed to update bracket state' });
  }
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
