import { readFileSync } from 'fs';
import { kvGet, kvSet, getCached } from '../lib/cache.js';
import { getSchedule } from '../lib/timetoscore.js';
import { updateBracketWithGames, syncFormatsFromConfig, initializeBracketState, BRACKET_STATE_VERSION } from '../lib/bracket-engine.js';

const bracketConfig = JSON.parse(
  readFileSync(new URL('../data/bracket-config.json', import.meta.url), 'utf8')
);
const initialSeeds = JSON.parse(
  readFileSync(new URL('../data/initial-seeds.json', import.meta.url), 'utf8')
);
const teamMappings = JSON.parse(
  readFileSync(new URL('../data/team-mappings.json', import.meta.url), 'utf8')
);

const BRACKET_KEY = 'bracket-state';
const SCORES_KEY = 'game-scores';

async function enrichWithScores(games) {
  const scoresMap = await kvGet(SCORES_KEY);
  if (!scoresMap || typeof scoresMap !== 'object') return games;
  return games.map(g => {
    const scores = scoresMap[String(g.game_id)];
    if (scores && !g.home_goals) {
      return { ...g, home_goals: scores.home_goals, away_goals: scores.away_goals };
    }
    return g;
  });
}

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

    // Auto-reinitialize if bracket state version is outdated (e.g. after bug fixes)
    if (!bracketState._version || bracketState._version < BRACKET_STATE_VERSION) {
      console.log(`Bracket state version ${bracketState._version || 0} < ${BRACKET_STATE_VERSION}, reinitializing...`);
      bracketState = initializeBracketState(bracketConfig, initialSeeds, teamMappings);
      await kvSet(BRACKET_KEY, bracketState);
    }

    // Fetch latest games and update series records
    const [premierGames, eliteGames, ncdcGames] = await Promise.all([
      getCached('games:2', () => getSchedule('2'), 900),
      getCached('games:3', () => getSchedule('3'), 900),
      getCached('games:1', () => getSchedule('1'), 900),
    ]);

    // Enrich NCDC games with cached GameCenter scores
    const enrichedNcdc = await enrichWithScores(ncdcGames || []);

    const allGames = {
      Premier: premierGames || [],
      Elite: eliteGames || [],
      NCDC: enrichedNcdc,
      _teamMappings: teamMappings,
    };

    // Sync round formats from config to fix stale format overrides in state
    syncFormatsFromConfig(bracketState, bracketConfig);

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

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
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
