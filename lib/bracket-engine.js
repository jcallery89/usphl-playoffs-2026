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
export function initializeBracketState(bracketConfig, initialSeeds, teamMappings) {
  const state = {
    _version: 1,
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

      const divSeeds = leagueSeeds[division] || {};
      const divMappings = leagueMappings[division] || {};
      const format = config.playoffFormat;
      if (!format || !format.rounds) continue;

      state[league][division] = {
        qualifyCount: config.qualifyCount,
        seriesFormat: format.seriesFormat || 'Bo3',
        rounds: format.rounds.map((round, roundIdx) => {
          const roundFormat = extractRoundFormat(round, format);
          return {
            roundIndex: roundIdx,
            roundName: round.name,
            format: roundFormat,
            byes: (round.byes || []).map((seed) => {
              const teamInfo = resolveTeam(seed, divSeeds, divMappings);
              return { seed, ...teamInfo };
            }),
            matchups: round.matchups.map((matchup, matchupIdx) => {
              const [seedA, seedB] = matchup;
              // Only resolve seed numbers to actual teams for Round 1.
              // Later rounds are populated by advanceRound() once prior results are known.
              const isFirstRound = roundIdx === 0;
              const teamA = (isFirstRound && typeof seedA === 'number') ? resolveTeam(seedA, divSeeds, divMappings) : null;
              const teamB = (isFirstRound && typeof seedB === 'number') ? resolveTeam(seedB, divSeeds, divMappings) : null;

              return {
                matchupId: `r${roundIdx}-m${matchupIdx}`,
                homeSeed: isFirstRound && typeof seedA === 'number' ? seedA : null,
                awaySeed: isFirstRound && typeof seedB === 'number' ? seedB : null,
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
 * Update bracket state with live game data.
 * Matches games to known matchups and computes series records.
 *
 * @param {Object} bracketState - Current bracket state
 * @param {Object} allGames - { Premier: [...], Elite: [...], NCDC: [...] }
 * @returns {Object} Updated bracket state (mutated in place)
 */
export function updateBracketWithGames(bracketState, allGames) {
  for (const league of ['Premier', 'Elite', 'NCDC']) {
    const leagueGames = allGames[league] || [];
    const leagueState = bracketState[league] || {};

    for (const [division, divState] of Object.entries(leagueState)) {
      if (division === 'Dineen Cup' || division === 'NE Conference') continue;
      if (!divState.rounds) continue;

      for (const round of divState.rounds) {
        for (const matchup of round.matchups) {
          // Skip if no team IDs assigned yet
          if (!matchup.homeTeamId || !matchup.awayTeamId) continue;
          // Skip if admin has overridden
          if (matchup.overrideWinner) continue;

          const winsNeeded = getWinsNeeded(round.format);
          const seriesGames = findSeriesGames(leagueGames, matchup.homeTeamId, matchup.awayTeamId);
          const series = computeSeriesState(seriesGames, matchup.homeTeamId, matchup.awayTeamId, winsNeeded);

          matchup.homeWins = series.winsA;
          matchup.awayWins = series.winsB;
          matchup.games = series.games;
          matchup.status = series.status;

          if (series.winnerId) {
            matchup.winnerId = series.winnerId;
            if (series.winnerId === matchup.homeTeamId) {
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
    }
  }

  bracketState._lastUpdated = new Date().toISOString();
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
