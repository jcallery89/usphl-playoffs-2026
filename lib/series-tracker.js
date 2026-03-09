/**
 * Series Tracker
 *
 * Given a list of completed playoff games and known bracket matchups,
 * computes series win/loss records and determines series completion.
 */

/**
 * Match games to a specific series (two known teams).
 * Returns games sorted by date where home or away matches either team.
 *
 * @param {Array} allGames - All playoff games from the API
 * @param {string} teamIdA - team_id of team A
 * @param {string} teamIdB - team_id of team B
 * @returns {Array} Matched games sorted by date
 */
export function findSeriesGames(allGames, teamIdA, teamIdB) {
  if (!teamIdA || !teamIdB) return [];

  return allGames
    .filter((g) => {
      const homeId = String(g.home_id);
      const awayId = String(g.away_id);
      return (
        (homeId === String(teamIdA) && awayId === String(teamIdB)) ||
        (homeId === String(teamIdB) && awayId === String(teamIdA))
      );
    })
    .sort((a, b) => {
      // Sort by date then time
      const da = a.date + (a.time || '');
      const db = b.date + (b.time || '');
      return da.localeCompare(db);
    });
}

/**
 * Compute series state from a list of games between two teams.
 *
 * @param {Array} games - Games between two teams (from findSeriesGames)
 * @param {string} teamIdA - team_id of the "home" seed (higher seed)
 * @param {string} teamIdB - team_id of the "away" seed (lower seed)
 * @param {number} winsNeeded - Wins to clinch (2 for Bo3, 3 for Bo5)
 * @returns {Object} Series state
 */
export function computeSeriesState(games, teamIdA, teamIdB, winsNeeded) {
  let winsA = 0;
  let winsB = 0;
  const gameResults = [];
  let seriesClinched = false;

  for (const game of games) {
    const isCompleted = game.game_status === 'CLOSED';

    if (isCompleted) {
      const homeScore = parseInt(game.home_goals, 10) || 0;
      const awayScore = parseInt(game.away_goals, 10) || 0;

      if (homeScore === awayScore) continue; // Safety check

      const homeId = String(game.home_id);
      let winnerId;

      if (homeScore > awayScore) {
        winnerId = homeId;
      } else {
        winnerId = String(game.away_id);
      }

      if (!seriesClinched) {
        if (winnerId === String(teamIdA)) {
          winsA++;
        } else if (winnerId === String(teamIdB)) {
          winsB++;
        }
      }

      gameResults.push({
        game_id: game.game_id,
        date: game.date,
        time: game.formatted_time || game.time,
        location: game.location || null,
        home_id: game.home_id,
        away_id: game.away_id,
        home_team: game.home_team,
        away_team: game.away_team,
        home_score: homeScore,
        away_score: awayScore,
        result_string: game.result_string || 'Final',
        winner_id: winnerId,
        game_status: 'final',
        if_necessary: seriesClinched,
      });

      if (winsA >= winsNeeded || winsB >= winsNeeded) {
        seriesClinched = true;
      }
    } else {
      // Upcoming/scheduled game
      gameResults.push({
        game_id: game.game_id,
        date: game.date,
        time: game.formatted_time || game.time,
        location: game.location || null,
        home_id: game.home_id,
        away_id: game.away_id,
        home_team: game.home_team,
        away_team: game.away_team,
        home_score: null,
        away_score: null,
        result_string: null,
        winner_id: null,
        game_status: 'scheduled',
        if_necessary: seriesClinched,
      });
    }
  }

  let status = 'not_started';
  let winnerId = null;

  if (winsA > 0 || winsB > 0) {
    if (winsA >= winsNeeded) {
      status = 'complete';
      winnerId = String(teamIdA);
    } else if (winsB >= winsNeeded) {
      status = 'complete';
      winnerId = String(teamIdB);
    } else {
      status = 'in_progress';
    }
  } else if (gameResults.length > 0) {
    // Has scheduled games but none completed yet
    status = 'scheduled';
  }

  return {
    winsA,
    winsB,
    games: gameResults,
    status,
    winnerId,
    winsNeeded,
  };
}

/**
 * Get winsNeeded from series format string.
 */
export function getWinsNeeded(format) {
  if (!format) return 2;
  const normalized = format.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.includes('bo5')) return 3;
  if (normalized.includes('bo7')) return 4;
  if (normalized.includes('singlegame') || normalized.includes('single') || normalized.includes('1game')) return 1;
  return 2; // Default Bo3
}

/**
 * Build a series summary string (e.g., "WCW leads 2-1" or "WCW wins 2-0")
 */
export function seriesSummary(teamNameA, teamNameB, winsA, winsB, status) {
  if (status === 'not_started') return 'Series not started';
  if (status === 'complete') {
    if (winsA > winsB) return `${teamNameA} wins ${winsA}-${winsB}`;
    return `${teamNameB} wins ${winsB}-${winsA}`;
  }
  // In progress
  if (winsA > winsB) return `${teamNameA} leads ${winsA}-${winsB}`;
  if (winsB > winsA) return `${teamNameB} leads ${winsB}-${winsA}`;
  return `Tied ${winsA}-${winsB}`;
}
