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
export const BRACKET_STATE_VERSION = 13;

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

  for (const day of nationalsState.days) {
    for (const game of day.games) {
      // Skip placeholder games (semifinals/championship with seed labels)
      if ((game.home || '').includes('Seed #') || (game.away || '').includes('Seed #')) continue;

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
          matchups: cr.roundRobin.matchups.map((m) => ({
            team1: m[0],
            team2: m[1],
            team1Score: null,
            team2Score: null,
            status: 'upcoming',
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
          matchup: {
            team1: cr.conferenceFinal.matchups?.[0]?.[0] || 'RR #1',
            team2: cr.conferenceFinal.matchups?.[0]?.[1] || 'RR #2',
            team1Score: null,
            team2Score: null,
            status: 'upcoming',
          },
        }
      : null,
  };
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
      if (division === 'Dineen Cup' || division === 'NE Conference') continue;

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
