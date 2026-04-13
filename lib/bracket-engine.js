/**
 * Bracket Engine
 *
 * Builds and updates bracket state by combining:
 * - Static bracket config (playoff formats, seed matchups)
 * - Initial seeds (team names, standings)
 * - Team mappings (name → team_id)
 * - Live game data (from API)
 */

import { findSeriesGames, computeSeriesState, getWinsNeeded, seriesSummary } from './series-tracker.js';

/**
 * Initialize a fresh bracket state from config and seeds.
 * This is called once at setup time or when resetting.
 *
 * @param {Object} bracketConfig - From data/bracket-config.json
 * @param {Object} initialSeeds - From data/initial-seeds.json
 * @param {Object} teamMappings - From data/team-mappings.json
 * @returns {Object} Initial bracket state
 */
export const BRACKET_STATE_VERSION = 25;

export function initializeBracketState(bracketConfig, initialSeeds, teamMappings) {
  const state = {
    _version: BRACKET_STATE_VERSION,
    _lastUpdated: new Date().toISOString(),
    _updatedBy: 'system',
    Premier: {},
    Elite: {},
    NCDC: {},
  };

  for (const league of ['Premier', 'Elite', 'NCDC']) {
    const leagueConfig = bracketConfig[league] || {};
    const leagueSeeds = initialSeeds[league] || {};
    const leagueMappings = teamMappings[league] || {};

    for (const [division, config] of Object.entries(leagueConfig)) {
      // Skip special NCDC entries (Dineen Cup, NE Conference)
      if (division === 'Dineen Cup') {
        state.NCDC['Dineen Cup'] = initDineenCup(config);
        continue;
      }
      if (division === 'NE Conference') {
        state.NCDC['NE Conference'] = initNEConference(config);
        continue;
      }
      if (division === 'Nationals') {
        state[league]['Nationals'] = initNationals(config);
        continue;
      }

      const divSeeds = leagueSeeds[division] || {};
      const divMappings = leagueMappings[division] || {};
      const format = config.playoffFormat;
      if (!format || !format.rounds) continue;

      // Collect BYE seeds per round so we can pre-populate them in the NEXT round only
      const byeSeedsByRound = {};
      for (let ri = 0; ri < format.rounds.length; ri++) {
        byeSeedsByRound[ri] = new Set(format.rounds[ri].byes || []);
      }

      state[league][division] = {
        qualifyCount: config.qualifyCount,
        seriesFormat: format.seriesFormat || 'Bo3',
        ...(config.format === 'alberta_pods' ? { formatInfo: 'Round Robin pods → #2 vs #3 elimination → Crossover vs #1 seeds → Best-of-3 Finals' } : {}),
        rounds: format.rounds.map((round, roundIdx) => {
          const roundFormat = extractRoundFormat(round, format);
          // BYE seeds from the PREVIOUS round advance into this round
          const prevRoundByes = roundIdx > 0 ? byeSeedsByRound[roundIdx - 1] : new Set();
          return {
            roundIndex: roundIdx,
            roundName: round.name,
            format: roundFormat,
            ...(round.gameIds ? { gameIds: round.gameIds } : {}),
            byes: (round.byes || []).map((seed) => {
              const teamInfo = resolveTeam(seed, divSeeds, divMappings);
              return { seed, ...teamInfo };
            }),
            matchups: round.matchups.map((matchup, matchupIdx) => {
              const [seedA, seedB] = matchup;
              // Resolve teams for Round 1, and for BYE teams from the previous round
              // (BYE teams advance exactly one round, so only pre-populate them there).
              // Also resolve pod-based string seeds (e.g. "PNW_1") that exist in divSeeds.
              const isFirstRound = roundIdx === 0;
              const isPodSeedA = typeof seedA === 'string' && divSeeds[seedA];
              const isPodSeedB = typeof seedB === 'string' && divSeeds[seedB];
              const canResolveA = (typeof seedA === 'number' && (isFirstRound || prevRoundByes.has(seedA))) || isPodSeedA;
              const canResolveB = (typeof seedB === 'number' && (isFirstRound || prevRoundByes.has(seedB))) || isPodSeedB;
              const teamA = canResolveA ? resolveTeam(seedA, divSeeds, divMappings) : null;
              const teamB = canResolveB ? resolveTeam(seedB, divSeeds, divMappings) : null;

              return {
                matchupId: `r${roundIdx}-m${matchupIdx}`,
                homeSeed: canResolveA ? seedA : null,
                awaySeed: canResolveB ? seedB : null,
                homeTeamId: teamA?.teamId || null,
                awayTeamId: teamB?.teamId || null,
                homeTeamName: teamA?.teamName || (typeof seedA === 'string' ? seedA : 'TBD'),
                awayTeamName: teamB?.teamName || (typeof seedB === 'string' ? seedB : 'TBD'),
                homeWins: 0,
                awayWins: 0,
                status: 'not_started',
                winnerId: null,
                winnerSeed: null,
                winnerName: null,
                games: [],
                overrideWinner: null,
                note: round.note || null,
              };
            }),
          };
        }),
      };

      // Alberta pod divisions: copy roundRobin data from config to state
      if (config.format === 'alberta_pods' && config.roundRobin) {
        state[league][division].roundRobin = JSON.parse(JSON.stringify(config.roundRobin));
      }
    }
  }

  return state;
}

function resolveTeam(seed, divSeeds, divMappings) {
  const seedData = divSeeds[seed];
  if (!seedData) return { teamName: `Seed #${seed}`, teamId: null };

  const mapping = divMappings[seedData.name];
  return {
    teamName: seedData.name,
    teamId: mapping?.team_id || null,
    logoUrl: mapping?.logo_url || null,
    logoFile: mapping?.logo_file || null,
    profileUrl: mapping?.profile_url || null,
  };
}

function extractRoundFormat(round, format) {
  // Check if round name contains format info
  const match = round.name.match(/\(Bo\d\)/);
  if (match) return match[0].replace(/[()]/g, '');
  // Check for play-in format override
  if (format.playInFormat && round.name.includes('Play-In')) return format.playInFormat;
  // Check for championship format override
  if (format.championshipFormat && round.name.includes('Championship')) return format.championshipFormat;
  return format.seriesFormat || 'Bo3';
}

function initDineenCup(config) {
  return {
    format: 'double_elimination',
    name: config.name,
    dates: config.dates,
    teams: (config.teams || []).map((entry) => ({
      slot: entry,
      teamId: null,
      teamName: entry,
    })),
    schedule: (config.schedule || []).map((g) => ({
      game: g.game,
      date: g.date,
      time: g.time,
      matchup: g.matchup,
      note: g.note || '',
      homeScore: null,
      awayScore: null,
      winnerId: null,
      status: 'upcoming',
    })),
    champion: null,
  };
}

function initNationals(config) {
  const result = {
    wildCards: (config.wildCards || []).map((wc) => ({
      label: wc.label,
      teamName: wc.teamName,
      teamId: wc.teamId || null,
      division: wc.division || null,
      pool: wc.pool || null,
    })),
  };
  // Pass through full tournament structure if present in config
  if (config.format) result.format = config.format;
  if (config.name) result.name = config.name;
  if (config.dates) result.dates = config.dates;
  if (config.location) result.location = config.location;
  if (config.formatInfo) result.formatInfo = config.formatInfo;
  if (config.nationalSeeds) result.nationalSeeds = config.nationalSeeds;
  if (config.seeds) result.seeds = config.seeds;
  if (config.pods) result.pods = config.pods;
  if (config.days) result.days = config.days;
  if (config.champion !== undefined) result.champion = config.champion;
  return result;
}

/**
 * Update Nationals tournament games with live API data.
 * Matches by team names + date since Nationals games don't have pre-assigned IDs.
 */
function updateNationalsWithGames(nationalsState, leagueGames) {
  if (!nationalsState.days || !leagueGames.length) return;

  // Build a seed-to-teamName map from nationalSeeds + wildCards
  const seedMap = {};
  for (const s of nationalsState.nationalSeeds || []) {
    seedMap[s.teamName] = s;
  }
  for (const wc of nationalsState.wildCards || []) {
    if (wc.teamName) seedMap[wc.teamName] = wc;
  }

  // Normalize team name for fuzzy matching
  function normalize(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Convert human date ("Wednesday, March 25") to ISO prefix ("2026-03-25")
  function parseHumanDate(dateStr) {
    if (!dateStr) return null;
    const months = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
                     july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
    const match = dateStr.match(/(\w+)\s+(\d+)/);
    if (!match) return null;
    const monthName = match[1].toLowerCase();
    const day = match[2].padStart(2, '0');
    const month = months[monthName];
    if (!month) return null;
    // Assume 2026 season
    return `2026-${month}-${day}`;
  }

  function namesMatch(a, b) {
    return a.includes(b) || b.includes(a);
  }

  // Find matching API game by team names (either direction) and optional date
  function findApiGame(homeName, awayName, dateStr) {
    const normHome = normalize(homeName);
    const normAway = normalize(awayName);
    const isoDate = parseHumanDate(dateStr);

    return leagueGames.find(g => {
      if (isoDate && g.date && g.date !== isoDate) return false;
      const gHome = normalize(g.home_team);
      const gAway = normalize(g.away_team);
      // Match either direction (home/away may be swapped)
      return (namesMatch(gHome, normHome) && namesMatch(gAway, normAway)) ||
             (namesMatch(gHome, normAway) && namesMatch(gAway, normHome));
    });
  }

  // Helper: check if a game has a placeholder label (not a real team name)
  function isPlaceholder(label) {
    if (!label) return true;
    return /Seed #|Pool [ABC] Winner|Best 2nd|Semifinal Winner|Winner/i.test(label);
  }

  for (const day of nationalsState.days) {
    for (const game of day.games) {
      // Skip games where both teams are placeholders (not yet resolved)
      if (isPlaceholder(game.home) && isPlaceholder(game.away)) continue;

      const apiGame = findApiGame(game.home, game.away, day.date);
      if (apiGame) {
        game.game_id = apiGame.game_id;
        game.status = apiGame.game_status === 'CLOSED' ? 'Final'
                    : apiGame.game_status === 'IN PROGRESS' ? 'Live'
                    : apiGame.game_status || 'Upcoming';

        if (apiGame.game_status === 'CLOSED' || apiGame.game_status === 'IN PROGRESS') {
          // Determine which API team is home vs away in our game
          const normGameHome = normalize(game.home);
          const normApiHome = normalize(apiGame.home_team);

          if (normApiHome.includes(normGameHome) || normGameHome.includes(normApiHome)) {
            game.home_score = parseInt(apiGame.home_goals) || 0;
            game.away_score = parseInt(apiGame.away_goals) || 0;
          } else {
            // Teams are swapped in API
            game.home_score = parseInt(apiGame.away_goals) || 0;
            game.away_score = parseInt(apiGame.home_goals) || 0;
          }
        }

        // Update location if API has it
        if (apiGame.location) game.location = apiGame.location;
      }
    }
  }

  // --- Resolve placeholder matchup names for semifinals/championship ---
  resolveNationalsPlaceholders(nationalsState);

  // --- Second pass: match newly-resolved games against API data ---
  // After placeholders are resolved (e.g. "Semifinal Winner" → actual team),
  // re-scan for API matches on games that were previously skipped.
  for (const day of nationalsState.days) {
    for (const game of day.games) {
      if (game.game_id || game.status === 'Final') continue; // already matched
      if (isPlaceholder(game.home) || isPlaceholder(game.away)) continue;

      const apiGame = findApiGame(game.home, game.away, day.date);
      if (apiGame) {
        game.game_id = apiGame.game_id;
        game.status = apiGame.game_status === 'CLOSED' ? 'Final'
                    : apiGame.game_status === 'IN PROGRESS' ? 'Live'
                    : apiGame.game_status || 'Upcoming';

        if (apiGame.game_status === 'CLOSED' || apiGame.game_status === 'IN PROGRESS') {
          const normGameHome = normalize(game.home);
          const normApiHome = normalize(apiGame.home_team);

          if (normApiHome.includes(normGameHome) || normGameHome.includes(normApiHome)) {
            game.home_score = parseInt(apiGame.home_goals) || 0;
            game.away_score = parseInt(apiGame.away_goals) || 0;
          } else {
            game.home_score = parseInt(apiGame.away_goals) || 0;
            game.away_score = parseInt(apiGame.home_goals) || 0;
          }
        }
        if (apiGame.location) game.location = apiGame.location;
      }
    }
  }

  // --- Detect champion from completed championship game ---
  detectChampion(nationalsState);
}

/**
 * After pool play scores are updated, compute standings and resolve
 * placeholder names (e.g. "Pool A Winner", "Elite Seed #1") to actual
 * team names in semifinal and championship games.
 */
function resolveNationalsPlaceholders(nationalsState) {
  const pods = nationalsState.pods || {};
  const hasPods = Object.keys(pods).length > 0;

  if (hasPods) {
    // --- Premier-style: pool play with pods ---
    resolvePoolPlayPlaceholders(nationalsState, pods);
  } else {
    // --- Elite-style: round-robin (no pods) ---
    resolveRoundRobinPlaceholders(nationalsState);
  }
}

/**
 * Scan the championship day for a completed final and set nationalsState.champion.
 */
function detectChampion(nationalsState) {
  if (!nationalsState.days) return;

  // Find the championship day (last day, or day with "Championship" in label)
  for (let i = nationalsState.days.length - 1; i >= 0; i--) {
    const day = nationalsState.days[i];
    if (!/championship/i.test(day.label || '')) continue;

    for (const game of day.games) {
      if (game.status === 'Final' && game.home_score != null && game.away_score != null) {
        const winnerName = game.home_score > game.away_score ? game.home : game.away;
        const loserName = game.home_score > game.away_score ? game.away : game.home;

        // Look up team ID from nationalSeeds or wildCards
        let winnerId = null;
        let loserId = null;
        for (const s of nationalsState.nationalSeeds || []) {
          if (s.teamName === winnerName) winnerId = s.teamId;
          if (s.teamName === loserName) loserId = s.teamId;
        }
        for (const wc of nationalsState.wildCards || []) {
          if (wc.teamName === winnerName) winnerId = wc.teamId;
          if (wc.teamName === loserName) loserId = wc.teamId;
        }

        nationalsState.champion = { teamName: winnerName, teamId: winnerId };
        nationalsState.finalist = { teamName: loserName, teamId: loserId };
        return;
      }
    }
  }
}

/**
 * Compute pool standings from completed games and resolve
 * "Pool X Winner", "Best 2nd Place", "Semifinal Winner" placeholders.
 */
function resolvePoolPlayPlaceholders(nationalsState, pods) {
  // Initialize standings per pool
  const poolStandings = {};
  for (const [poolName, poolData] of Object.entries(pods)) {
    poolStandings[poolName] = {};
    for (const team of poolData.teams) {
      poolStandings[poolName][team] = { w: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    }
  }

  // Identify pool play days (days with "pod" field on games)
  let allPoolGamesComplete = true;
  let poolGameCount = 0;

  for (const day of nationalsState.days || []) {
    for (const game of day.games) {
      if (!game.pod) continue;
      poolGameCount++;
      if (game.status !== 'Final') {
        allPoolGamesComplete = false;
        continue;
      }
      const pool = game.pod;
      const home = game.home;
      const away = game.away;
      const hs = game.home_score || 0;
      const as_ = game.away_score || 0;

      if (poolStandings[pool] && poolStandings[pool][home] && poolStandings[pool][away]) {
        poolStandings[pool][home].gf += hs;
        poolStandings[pool][home].ga += as_;
        poolStandings[pool][away].gf += as_;
        poolStandings[pool][away].ga += hs;
        if (hs > as_) {
          poolStandings[pool][home].w++;
          poolStandings[pool][home].pts += 2;
          poolStandings[pool][away].l++;
        } else {
          poolStandings[pool][away].w++;
          poolStandings[pool][away].pts += 2;
          poolStandings[pool][home].l++;
        }
      }
    }
  }

  // Don't resolve if pool play isn't complete
  if (!allPoolGamesComplete || poolGameCount === 0) return;

  // Sort each pool: pts desc, goal diff desc, goals for desc
  function sortTeams(standings) {
    return Object.entries(standings)
      .sort(([, a], [, b]) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        const diffA = a.gf - a.ga, diffB = b.gf - b.ga;
        if (diffB !== diffA) return diffB - diffA;
        return b.gf - a.gf;
      })
      .map(([name, stats]) => ({ name, ...stats }));
  }

  const poolWinners = {};
  const poolSeconds = {};
  for (const [poolName, standings] of Object.entries(poolStandings)) {
    const sorted = sortTeams(standings);
    if (sorted.length > 0) poolWinners[poolName] = sorted[0].name;
    if (sorted.length > 1) poolSeconds[poolName] = sorted[1];
  }

  // Find best 2nd place team across all pools
  const allSeconds = Object.entries(poolSeconds)
    .map(([pool, stats]) => ({ pool, ...stats }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const diffA = a.gf - a.ga, diffB = b.gf - b.ga;
      if (diffB !== diffA) return diffB - diffA;
      return b.gf - a.gf;
    });
  const best2nd = allSeconds.length > 0 ? allSeconds[0].name : null;

  // Store computed standings on the nationals state for the frontend
  nationalsState._poolStandings = {};
  for (const [poolName, standings] of Object.entries(poolStandings)) {
    nationalsState._poolStandings[poolName] = sortTeams(standings);
  }

  // Build resolution map for placeholder labels
  const resolutions = {};

  // Pool-based labels (legacy)
  for (const [poolName, winner] of Object.entries(poolWinners)) {
    resolutions[`${poolName} Winner`] = winner;
  }
  if (best2nd) resolutions['Best 2nd Place'] = best2nd;

  // Build original seed map for tiebreaking (lower original seed = higher priority)
  const originalSeedMap = {};
  for (const s of nationalsState.nationalSeeds || []) {
    originalSeedMap[s.teamName] = s.seed;
  }
  // Wild cards get a seed number after all national seeds
  const maxSeed = (nationalsState.nationalSeeds || []).length;
  for (const wc of nationalsState.wildCards || []) {
    if (wc.teamName && !originalSeedMap[wc.teamName]) {
      originalSeedMap[wc.teamName] = maxSeed + 1;
    }
  }

  // Seed-based labels: rank pool winners + best 2nd to determine overall seeds
  // Sort by: pts desc, then original tournament seed asc (tiebreaker).
  // USPHL uses original seeding to break ties between teams with equal records.
  const poolWinnerStats = Object.entries(poolWinners).map(([poolName, winnerName]) => {
    const stats = poolStandings[poolName][winnerName];
    return { name: winnerName, pool: poolName, origSeed: originalSeedMap[winnerName] || 99, ...stats };
  }).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    return a.origSeed - b.origSeed;
  });

  const semifinalSeeds = [...poolWinnerStats];
  if (best2nd) {
    const best2ndPool = allSeconds[0].pool;
    const best2ndStats = poolStandings[best2ndPool][best2nd];
    semifinalSeeds.push({ name: best2nd, pool: best2ndPool, origSeed: originalSeedMap[best2nd] || 99, ...best2ndStats });
  }

  // Assign seed numbers
  for (let i = 0; i < semifinalSeeds.length; i++) {
    const seedNum = i + 1;
    resolutions[`Premier Seed #${seedNum}`] = semifinalSeeds[i].name;
    resolutions[`Seed #${seedNum}`] = semifinalSeeds[i].name;
  }

  // Store the computed seeds for the frontend
  nationalsState._semifinalSeeds = semifinalSeeds.map((s, i) => ({
    seed: i + 1, name: s.name, pool: s.pool, w: s.w, l: s.l, gf: s.gf, ga: s.ga, pts: s.pts
  }));

  // First pass: resolve semifinal placeholders
  const semiFinalResults = {};
  for (const day of nationalsState.days || []) {
    for (const game of day.games) {
      if (resolutions[game.home]) game.home = resolutions[game.home];
      if (resolutions[game.away]) game.away = resolutions[game.away];

      // Track semifinal winners for championship resolution
      if (game.note && /semifinal/i.test(game.note) && game.status === 'Final') {
        const winner = (game.home_score || 0) > (game.away_score || 0) ? game.home : game.away;
        const sfNum = Object.keys(semiFinalResults).length + 1;
        semiFinalResults[`sf${sfNum}`] = winner;
      }
    }
  }

  // Second pass: resolve championship placeholders
  if (Object.keys(semiFinalResults).length >= 2) {
    const sfWinners = Object.values(semiFinalResults);
    for (const day of nationalsState.days || []) {
      for (const game of day.games) {
        if (game.home === 'Semifinal Winner' && sfWinners.length > 0) {
          game.home = sfWinners[0];
        }
        if (game.away === 'Semifinal Winner' && sfWinners.length > 1) {
          game.away = sfWinners[1];
        }
      }
    }
  }
}

/**
 * Compute round-robin standings and resolve "Elite Seed #N" placeholders
 * to actual team names based on RR results.
 */
function resolveRoundRobinPlaceholders(nationalsState) {
  // Collect all participating teams
  const allTeams = new Set();
  for (const s of nationalsState.nationalSeeds || []) {
    allTeams.add(s.teamName);
  }
  for (const wc of nationalsState.wildCards || []) {
    if (wc.teamName) allTeams.add(wc.teamName);
  }

  if (allTeams.size === 0) return;

  // Initialize standings
  const standings = {};
  for (const team of allTeams) {
    standings[team] = { w: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  }

  // Identify RR games: pool play days where both teams are in our set
  let allRRComplete = true;
  let rrGameCount = 0;

  for (const day of nationalsState.days || []) {
    // Only process days labeled as pod/pool play
    if (!/pod play/i.test(day.label || '')) continue;
    for (const game of day.games) {
      if (!standings[game.home] || !standings[game.away]) continue;
      rrGameCount++;
      if (game.status !== 'Final') {
        allRRComplete = false;
        continue;
      }
      const hs = game.home_score || 0;
      const as_ = game.away_score || 0;
      standings[game.home].gf += hs;
      standings[game.home].ga += as_;
      standings[game.away].gf += as_;
      standings[game.away].ga += hs;
      if (hs > as_) {
        standings[game.home].w++;
        standings[game.home].pts += 2;
        standings[game.away].l++;
      } else {
        standings[game.away].w++;
        standings[game.away].pts += 2;
        standings[game.home].l++;
      }
    }
  }

  if (!allRRComplete || rrGameCount === 0) return;

  // Sort: pts desc, goal diff desc, goals for desc
  const sorted = Object.entries(standings)
    .sort(([, a], [, b]) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const diffA = a.gf - a.ga, diffB = b.gf - b.ga;
      if (diffB !== diffA) return diffB - diffA;
      return b.gf - a.gf;
    })
    .map(([name, stats], idx) => ({ name, rank: idx + 1, ...stats }));

  // Store computed standings on the nationals state for the frontend
  nationalsState._rrStandings = sorted;

  // Build resolution map: "Elite Seed #1" → team name, etc.
  const resolutions = {};
  for (const entry of sorted) {
    // Match patterns like "Elite Seed #1", "Premier Seed #2"
    resolutions[`Elite Seed #${entry.rank}`] = entry.name;
    resolutions[`Premier Seed #${entry.rank}`] = entry.name;
    // Generic "Seed #N" pattern
    resolutions[`Seed #${entry.rank}`] = entry.name;
  }

  // First pass: resolve semifinal placeholders
  const semiFinalResults = {};
  for (const day of nationalsState.days || []) {
    for (const game of day.games) {
      if (resolutions[game.home]) game.home = resolutions[game.home];
      if (resolutions[game.away]) game.away = resolutions[game.away];

      // Track semifinal winners for championship resolution
      if (game.note && /semifinal/i.test(game.note) && game.status === 'Final') {
        const winner = (game.home_score || 0) > (game.away_score || 0) ? game.home : game.away;
        const sfNum = Object.keys(semiFinalResults).length + 1;
        semiFinalResults[`sf${sfNum}`] = winner;
      }
    }
  }

  // Second pass: resolve championship placeholders if both semis are done
  if (Object.keys(semiFinalResults).length >= 2) {
    const sfWinners = Object.values(semiFinalResults);
    for (const day of nationalsState.days || []) {
      for (const game of day.games) {
        for (const seedLabel of Object.keys(resolutions)) {
          if (game.home === seedLabel) game.home = resolutions[seedLabel];
          if (game.away === seedLabel) game.away = resolutions[seedLabel];
        }
        // Also handle generic "Semifinal Winner" labels
        if (game.home === 'Semifinal Winner' && sfWinners.length > 0) {
          game.home = sfWinners[0];
        }
        if (game.away === 'Semifinal Winner' && sfWinners.length > 1) {
          game.away = sfWinners[1];
        }
      }
    }
  }
}

function initNEConference(config) {
  const cr = config.conferenceRounds || {};
  return {
    roundRobin: cr.roundRobin
      ? {
          name: cr.roundRobin.name,
          dates: cr.roundRobin.dates,
          format: cr.roundRobin.format,
          note: cr.roundRobin.note || '',
          location: cr.roundRobin.location || '',
          games: (cr.roundRobin.games || []).map((g) => ({
            game_id: g.game_id,
            date: g.date,
            time: g.time,
            location: g.location,
            home_id: g.home_id,
            away_id: g.away_id,
            home_team: g.home_team,
            away_team: g.away_team,
            home_score: null,
            away_score: null,
            result_string: null,
            winner_id: null,
            game_status: 'scheduled',
          })),
          standings: [],
        }
      : null,
    conferenceFinal: cr.conferenceFinal
      ? {
          name: cr.conferenceFinal.name,
          dates: cr.conferenceFinal.dates,
          format: cr.conferenceFinal.format,
          note: cr.conferenceFinal.note || '',
          games: (cr.conferenceFinal.games || []).map((g) => ({
            game_id: g.game_id,
            date: g.date,
            time: g.time,
            location: g.location,
            home_id: g.home_id,
            away_id: g.away_id,
            home_team: g.home_team,
            away_team: g.away_team,
            home_score: g.home_score ?? null,
            away_score: g.away_score ?? null,
            result_string: g.result_string ?? null,
            winner_id: g.winner_id ?? null,
            game_status: g.game_status || 'scheduled',
            if_necessary: g.if_necessary || false,
          })),
        }
      : null,
  };
}

/**
 * Update NE Conference round robin games from live API data.
 */
function updateNEConferenceWithGames(neConf, leagueGames) {
  const gameMap = new Map();
  for (const g of leagueGames) {
    gameMap.set(String(g.game_id), g);
  }

  // Update round robin games
  const rrGames = neConf?.roundRobin?.games || [];
  // Update conference final games
  const cfGames = neConf?.conferenceFinal?.games || [];

  for (const game of [...rrGames, ...cfGames]) {
    if (game.game_status === 'final') continue;
    const live = gameMap.get(String(game.game_id));
    if (!live) continue;
    const status = (live.status || live.game_status || '').toUpperCase();
    if (status === 'CLOSED' || status === 'FINAL') {
      const homeGoals = parseInt(live.home_goals, 10);
      const awayGoals = parseInt(live.away_goals, 10);
      if (!isNaN(homeGoals) && !isNaN(awayGoals)) {
        game.home_score = homeGoals;
        game.away_score = awayGoals;
        game.game_status = 'final';
        game.winner_id = homeGoals > awayGoals ? game.home_id : game.away_id;
        game.result_string = live.result_string || 'Final';
      }
    }
  }
}

/**
 * Sync round formats from bracket config into bracket state.
 * This ensures that format overrides (playInFormat, championshipFormat)
 * are applied even if the state was initialized with an older config.
 *
 * @param {Object} bracketState - Current bracket state (mutated in place)
 * @param {Object} bracketConfig - From data/bracket-config.json
 */
export function syncFormatsFromConfig(bracketState, bracketConfig) {
  if (!bracketConfig) return;
  for (const league of ['Premier', 'Elite', 'NCDC']) {
    const leagueConfig = bracketConfig[league] || {};
    const leagueState = bracketState[league] || {};
    for (const [division, divState] of Object.entries(leagueState)) {
      if (!divState.rounds) continue;
      const config = leagueConfig[division];
      if (!config?.playoffFormat?.rounds) continue;
      for (const round of divState.rounds) {
        const configRound = config.playoffFormat.rounds[round.roundIndex];
        if (configRound) {
          round.format = extractRoundFormat(configRound, config.playoffFormat);
        }
      }
    }
  }
}

/**
 * Update bracket state with live game data.
 * Matches games to known matchups and computes series records.
 *
 * @param {Object} bracketState - Current bracket state
 * @param {Object} allGames - { Premier: [...], Elite: [...], NCDC: [...] }
 * @returns {Object} Updated bracket state (mutated in place)
 */
export function updateBracketWithGames(bracketState, allGames) {
  let advanced = false;

  for (const league of ['Premier', 'Elite', 'NCDC']) {
    const leagueGames = allGames[league] || [];
    const leagueState = bracketState[league] || {};

    for (const [division, divState] of Object.entries(leagueState)) {
      if (division === 'Dineen Cup') continue;
      if (division === 'NE Conference') {
        updateNEConferenceWithGames(divState, leagueGames);
        continue;
      }

      // Handle Nationals tournament (days/games structure)
      if (division === 'Nationals' && divState.days) {
        updateNationalsWithGames(divState, leagueGames);
        continue;
      }

      if (!divState.rounds) continue;

      // Collect round robin game IDs for Alberta-style divisions so we can
      // exclude them from elimination/crossover series matching
      const rrGameIds = new Set();
      if (divState.roundRobin) {
        for (const pod of Object.values(divState.roundRobin)) {
          for (const g of pod.games || []) {
            if (g.game_id) rrGameIds.add(String(g.game_id));
          }
        }
      }

      // First pass: update all series records from live game data
      for (const round of divState.rounds) {
        for (const matchup of round.matchups) {
          // Skip if no team IDs assigned yet
          if (!matchup.homeTeamId || !matchup.awayTeamId) continue;
          // Skip if admin has overridden
          if (matchup.overrideWinner) continue;

          const winsNeeded = getWinsNeeded(round.format);
          let seriesGames;

          // If round has specific gameIds configured, use those instead of team-based search
          const matchupIdx = round.matchups.indexOf(matchup);
          const configuredIds = round.gameIds?.[String(matchupIdx)];
          if (configuredIds && configuredIds.length > 0) {
            const idSet = new Set(configuredIds.map(String));
            seriesGames = leagueGames
              .filter(g => idSet.has(String(g.game_id)))
              .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
          } else {
            seriesGames = findSeriesGames(leagueGames, matchup.homeTeamId, matchup.awayTeamId);
            // For Alberta-style divisions, exclude round robin games from series matching
            if (rrGameIds.size > 0) {
              seriesGames = seriesGames.filter(g => !rrGameIds.has(String(g.game_id)));
            }
          }
          const series = computeSeriesState(seriesGames, matchup.homeTeamId, matchup.awayTeamId, winsNeeded);

          // Normalize game team names to match canonical bracket names.
          // The API may return abbreviated names (e.g. "Universel Gatineau"
          // instead of "Universel College Gatineau") which breaks schedule
          // rendering where games are matched to series by team name.
          for (const game of series.games) {
            if (String(game.home_id) === String(matchup.homeTeamId)) {
              game.home_team = matchup.homeTeamName;
              game.away_team = matchup.awayTeamName;
            } else {
              game.home_team = matchup.awayTeamName;
              game.away_team = matchup.homeTeamName;
            }
          }

          matchup.homeWins = series.winsA;
          matchup.awayWins = series.winsB;
          matchup.games = series.games;
          matchup.status = series.status;

          if (series.winnerId) {
            matchup.winnerId = series.winnerId;
            if (String(series.winnerId) === String(matchup.homeTeamId)) {
              matchup.winnerSeed = matchup.homeSeed;
              matchup.winnerName = matchup.homeTeamName;
            } else {
              matchup.winnerSeed = matchup.awaySeed;
              matchup.winnerName = matchup.awayTeamName;
            }
          }

          matchup.seriesSummary = seriesSummary(
            matchup.homeTeamName,
            matchup.awayTeamName,
            matchup.homeWins,
            matchup.awayWins,
            matchup.status
          );
        }
      }

      // Update round robin games for Alberta-style divisions
      if (divState.roundRobin) {
        for (const podName of Object.keys(divState.roundRobin)) {
          const pod = divState.roundRobin[podName];
          if (!pod.games) continue;
          for (const rrGame of pod.games) {
            if (!rrGame.game_id) continue;
            const apiGame = leagueGames.find(g => String(g.game_id) === String(rrGame.game_id));
            if (apiGame && apiGame.game_status === 'CLOSED') {
              const hg = parseInt(apiGame.home_goals, 10);
              const ag = parseInt(apiGame.away_goals, 10);
              if (!isNaN(hg) && !isNaN(ag)) {
                // API home/away may differ from state — match by team name or ID
                const apiHomeIsStateHome =
                  String(apiGame.home_id) === String(rrGame.home_id) ||
                  apiGame.home_team === rrGame.home ||
                  apiGame.home_team === rrGame.home_team;
                if (apiHomeIsStateHome) {
                  rrGame.home_score = hg;
                  rrGame.away_score = ag;
                } else {
                  rrGame.home_score = ag;
                  rrGame.away_score = hg;
                }
              }
              rrGame.game_status = 'final';
            }
          }
          // Recompute standings from game results
          const teamStats = {};
          pod.teams.forEach(t => { teamStats[t] = { w: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
          pod.games.forEach(g => {
            if (g.game_status === 'scheduled' || g.home_score === null || g.away_score === null) return;
            const h = g.home, a = g.away;
            if (!teamStats[h] || !teamStats[a]) return;
            teamStats[h].gf += g.home_score;
            teamStats[h].ga += g.away_score;
            teamStats[a].gf += g.away_score;
            teamStats[a].ga += g.home_score;
            if (g.home_score > g.away_score) {
              teamStats[h].w++; teamStats[h].pts += 2;
              teamStats[a].l++;
            } else {
              teamStats[a].w++; teamStats[a].pts += 2;
              teamStats[h].l++;
            }
          });
          pod.standings = Object.entries(teamStats)
            .map(([name, s]) => ({ name, ...s }))
            .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
        }
      }

      // Alberta-style: reseed elimination/crossover rounds from pod standings
      if (divState.roundRobin) {
        const divMappings = (allGames._teamMappings || {})[league]?.[division] || {};
        for (const [podName, pod] of Object.entries(divState.roundRobin)) {
          if (!pod.standings || pod.standings.length < 2) continue;
          // Check if all pod games are complete
          const allPodGamesComplete = pod.games && pod.games.every(g => g.game_status === 'final');
          if (!allPodGamesComplete) continue;

          const prefix = podName === 'North' ? 'N' : podName === 'South' ? 'S' : podName.charAt(0).toUpperCase();
          // Map standings position to seed label: #1, #2, #3
          const seedMap = {};
          pod.standings.forEach((team, idx) => {
            const seedLabel = `${prefix}_${idx + 1}`;
            const mapping = divMappings[team.name] || {};
            seedMap[seedLabel] = {
              teamName: team.name,
              teamId: mapping.team_id || null,
              logoUrl: mapping.logo_url || null,
              profileUrl: mapping.profile_url || null,
            };
          });

          // Update elimination round matchups that reference this pod's seeds
          for (const round of divState.rounds) {
            for (const matchup of round.matchups) {
              for (const side of ['home', 'away']) {
                const seedKey = side === 'home' ? matchup.homeSeed : matchup.awaySeed;
                if (seedKey && seedMap[seedKey]) {
                  const team = seedMap[seedKey];
                  if (side === 'home') {
                    matchup.homeTeamId = team.teamId;
                    matchup.homeTeamName = team.teamName;
                  } else {
                    matchup.awayTeamId = team.teamId;
                    matchup.awayTeamName = team.teamName;
                  }
                }
              }
            }
          }
        }
      }

      // Second pass: auto-advance completed rounds to the next round
      for (let ri = 0; ri < divState.rounds.length - 1; ri++) {
        const currentRound = divState.rounds[ri];
        const nextRound = divState.rounds[ri + 1];

        // Check if all matchups in this round are complete
        const allComplete = currentRound.matchups.length > 0 &&
          currentRound.matchups.every(m => m.status === 'complete' && m.winnerId);

        if (!allComplete) continue;

        // Check if next round already has teams assigned (don't overwrite)
        const nextRoundNeedsTeams = nextRound.matchups.some(
          m => !m.homeTeamId || !m.awayTeamId
        );

        if (!nextRoundNeedsTeams) continue;

        // Alberta-style crossover: specific pairing rules
        if (divState.roundRobin && currentRound.roundName === 'Pod Elimination') {
          advanceAlbertaCrossover(divState, ri);
        } else {
          advanceRound(divState, ri);
        }
        advanced = true;

        // After advancing, run series matching on the newly populated round
        // so games get picked up in the same request cycle
        for (const matchup of nextRound.matchups) {
          if (!matchup.homeTeamId || !matchup.awayTeamId) continue;
          if (matchup.overrideWinner) continue;

          const winsNeeded = getWinsNeeded(nextRound.format);
          const mIdx = nextRound.matchups.indexOf(matchup);
          const cfgIds = nextRound.gameIds?.[String(mIdx)];
          let seriesGames;
          if (cfgIds && cfgIds.length > 0) {
            const idSet = new Set(cfgIds.map(String));
            seriesGames = leagueGames
              .filter(g => idSet.has(String(g.game_id)))
              .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
          } else {
            seriesGames = findSeriesGames(leagueGames, matchup.homeTeamId, matchup.awayTeamId);
            if (rrGameIds.size > 0) {
              seriesGames = seriesGames.filter(g => !rrGameIds.has(String(g.game_id)));
            }
          }
          const series = computeSeriesState(seriesGames, matchup.homeTeamId, matchup.awayTeamId, winsNeeded);

          for (const game of series.games) {
            if (String(game.home_id) === String(matchup.homeTeamId)) {
              game.home_team = matchup.homeTeamName;
              game.away_team = matchup.awayTeamName;
            } else {
              game.home_team = matchup.awayTeamName;
              game.away_team = matchup.homeTeamName;
            }
          }

          matchup.homeWins = series.winsA;
          matchup.awayWins = series.winsB;
          matchup.games = series.games;
          matchup.status = series.status;

          if (series.winnerId) {
            matchup.winnerId = series.winnerId;
            if (String(series.winnerId) === String(matchup.homeTeamId)) {
              matchup.winnerSeed = matchup.homeSeed;
              matchup.winnerName = matchup.homeTeamName;
            } else {
              matchup.winnerSeed = matchup.awaySeed;
              matchup.winnerName = matchup.awayTeamName;
            }
          }

          matchup.seriesSummary = seriesSummary(
            matchup.homeTeamName, matchup.awayTeamName,
            matchup.homeWins, matchup.awayWins, matchup.status
          );
        }
      }
    }
  }

  bracketState._lastUpdated = new Date().toISOString();
  bracketState._autoAdvanced = advanced;
  return bracketState;
}

/**
 * Advance a completed round: populate next round matchups with winners.
 * Called by admin after confirming round results.
 *
 * @param {Object} divState - Division state object
 * @param {number} roundIndex - Index of the completed round
 * @param {Object} teamMappings - For looking up team metadata
 */
export function advanceRound(divState, roundIndex, teamMappings) {
  const currentRound = divState.rounds[roundIndex];
  const nextRound = divState.rounds[roundIndex + 1];
  if (!currentRound || !nextRound) return;

  // Collect winners from current round + byes
  const advancingTeams = [];

  for (const bye of currentRound.byes || []) {
    advancingTeams.push({
      seed: bye.seed,
      teamId: bye.teamId,
      teamName: bye.teamName,
    });
  }

  for (const matchup of currentRound.matchups) {
    if (matchup.winnerId) {
      advancingTeams.push({
        seed: matchup.winnerSeed,
        teamId: matchup.winnerId,
        teamName: matchup.winnerName,
      });
    }
  }

  // Sort by seed (lower seed = higher rank)
  advancingTeams.sort((a, b) => (a.seed || 99) - (b.seed || 99));

  // Populate next round matchups
  // Standard bracket: highest remaining vs lowest remaining, etc.
  for (let i = 0; i < nextRound.matchups.length; i++) {
    const matchup = nextRound.matchups[i];
    if (advancingTeams.length >= 2) {
      const home = advancingTeams.shift();
      const away = advancingTeams.pop();

      matchup.homeSeed = home.seed;
      matchup.homeTeamId = home.teamId;
      matchup.homeTeamName = home.teamName;
      matchup.awaySeed = away.seed;
      matchup.awayTeamId = away.teamId;
      matchup.awayTeamName = away.teamName;
    }
  }
}

/**
 * Alberta-specific crossover advance:
 * South Elim winner vs North #1, North Elim winner vs South #1
 */
function advanceAlbertaCrossover(divState, elimRoundIndex) {
  const elimRound = divState.rounds[elimRoundIndex];
  const crossoverRound = divState.rounds[elimRoundIndex + 1];
  if (!elimRound || !crossoverRound) return;

  // Identify North and South elimination winners
  let northElimWinner = null;
  let southElimWinner = null;
  for (const m of elimRound.matchups) {
    if (!m.winnerId) continue;
    const seed = m.homeSeed || m.awaySeed || '';
    if (String(seed).startsWith('N')) {
      northElimWinner = { teamId: m.winnerId, teamName: m.winnerName, seed: m.winnerSeed };
    } else if (String(seed).startsWith('S')) {
      southElimWinner = { teamId: m.winnerId, teamName: m.winnerName, seed: m.winnerSeed };
    }
  }

  if (!northElimWinner || !southElimWinner) return;

  // Crossover matchup 0: South Elim winner vs North #1
  // Crossover matchup 1: North Elim winner vs South #1
  for (const m of crossoverRound.matchups) {
    const awayLabel = m.awaySeed || m.awayTeamName || '';
    if (String(awayLabel).startsWith('N') || String(m.awayTeamName).includes('North')) {
      // This matchup has North #1 as away — home should be South Elim winner
      m.homeTeamId = southElimWinner.teamId;
      m.homeTeamName = southElimWinner.teamName;
      m.homeSeed = southElimWinner.seed;
    } else if (String(awayLabel).startsWith('S') || String(m.awayTeamName).includes('South')) {
      // This matchup has South #1 as away — home should be North Elim winner
      m.homeTeamId = northElimWinner.teamId;
      m.homeTeamName = northElimWinner.teamName;
      m.homeSeed = northElimWinner.seed;
    }
  }
}
