import crypto from 'crypto';

const API_URL = process.env.TTS_API_URL || 'https://api.usphl.timetoscore.com';
const USERNAME = process.env.TTS_USERNAME || 'leagueapps';
const SECRET = process.env.TTS_SECRET || '7csjfsXdUYuLs1Nq2datfxIdrpOjgFln';
const SEASON_ID = process.env.TTS_SEASON_ID || '65';
const STAT_CLASS = process.env.TTS_STAT_CLASS || '2';

function generateSignedUrl(endpoint, params) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyMd5 = crypto.createHash('md5').update('').digest('hex');

  const signedParams = {
    ...params,
    auth_key: USERNAME,
    auth_timestamp: timestamp,
    body_md5: bodyMd5,
  };

  const keys = Object.keys(signedParams).sort();
  const canonicalQS = keys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(signedParams[k])}`)
    .join('&');

  const stringToSign = `GET\n${endpoint}\n${canonicalQS}`;
  const sig = crypto.createHmac('sha256', SECRET).update(stringToSign).digest('hex');

  return `${API_URL}${endpoint}?${canonicalQS}&auth_signature=${encodeURIComponent(sig)}`;
}

async function callApi(endpoint, params = {}) {
  const url = generateSignedUrl(endpoint, params);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TTS API error: ${res.status} ${res.statusText} for ${endpoint}`);
  }
  return res.json();
}

/**
 * Get all teams for a league.
 * Returns array of { team_id, team_name, short_name, team_ab, smlogo, level_id }
 */
export async function getTeams(leagueId) {
  const data = await callApi('/get_teams', {
    league_id: String(leagueId),
    season_id: SEASON_ID,
    stat_class: STAT_CLASS,
  });
  return Array.isArray(data) ? data : data.teams || [];
}

/**
 * Get schedule for a league.
 * @param {string} leagueId
 * @param {string} [statClass] - Override stat_class (default from env, '1' for regular season, '2' for playoffs)
 */
export async function getSchedule(leagueId, statClass) {
  const data = await callApi('/get_schedule', {
    league_id: String(leagueId),
    season_id: SEASON_ID,
    stat_class: statClass || STAT_CLASS,
  });
  return Array.isArray(data) ? data : data.games || data.schedule || [];
}

/**
 * Get standings for a league.
 * Returns the full standings object from TTS.
 */
export async function getStandings(leagueId, levelId = '1') {
  const data = await callApi('/get_standings', {
    league_id: String(leagueId),
    season_id: SEASON_ID,
    level_id: String(levelId),
  });
  return data.standings || data;
}

/**
 * Get detailed game center data for a specific game.
 */
export async function getGameCenter(leagueId, gameId) {
  const data = await callApi('/get_game_center', {
    league_id: String(leagueId),
    season_id: SEASON_ID,
    game_id: String(gameId),
    widget: 'gamecenter',
  });
  return data.game_center || data;
}

export const LEAGUE_IDS = { NCDC: '1', Premier: '2', Elite: '3' };
