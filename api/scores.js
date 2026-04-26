import { kvGet, kvSet } from '../lib/cache.js';
import { getGameCenter } from '../lib/timetoscore.js';

const NCDC_LEAGUE_ID = '1';
const BRACKET_KEY = 'bracket-state';
const SCORES_KEY = 'game-scores';
const DINEEN_STATS_KEY = 'dineen-game-stats';

function toiToSeconds(toi) {
  if (!toi) return 0;
  const [m, s] = String(toi).split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

function extractTeamGameStats(skaters, goalies) {
  const scorers = (skaters || [])
    .filter(p => parseInt(p.goals || 0) > 0 || parseInt(p.assists || 0) > 0)
    .map(p => ({
      name: p.name,
      jersey: p.jersey,
      position: 'F',
      goals: parseInt(p.goals || 0),
      assists: parseInt(p.assists || 0),
      points: parseInt(p.goals || 0) + parseInt(p.assists || 0),
      plusminus: parseInt(p.plusminus || 0),
      image: p.player_image || null,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goals !== a.goals) return b.goals - a.goals;
      return b.plusminus - a.plusminus;
    })
    .slice(0, 3);

  const goalie = (goalies || [])
    .map(g => ({ ...g, _toi: toiToSeconds(g.toi) }))
    .sort((a, b) => b._toi - a._toi)
    .slice(0, 1)
    .map(g => {
      const sa = parseInt(g.shots_against || 0);
      const ga = parseInt(g.goals_against || 0);
      const saves = parseInt(g.saves || 0) || (sa - ga);
      const svPct = sa > 0 ? (saves / sa).toFixed(3).replace(/^0/, '') : '.000';
      return {
        name: g.name,
        jersey: g.jersey,
        saves,
        shotsAgainst: sa,
        goalsAgainst: ga,
        savePct: svPct,
        toi: g.toi || '',
        image: g.player_image || null,
      };
    })[0] || null;

  return { scorers, goalie };
}

export default async function handler(req, res) {
  try {
    const bracketState = await kvGet(BRACKET_KEY);
    if (!bracketState) {
      return res.status(200).json({ ok: true, updated: 0, message: 'No bracket state in KV' });
    }

    const ncdcState = bracketState.NCDC || {};
    const gamesToFetch = [];

    // Walk NCDC divisions for games needing scores
    for (const [division, divState] of Object.entries(ncdcState)) {
      // Dineen Cup uses a flat schedule array
      if (division === 'Dineen Cup') {
        const dcGames = divState?.schedule || [];
        const existingStats = (await kvGet(DINEEN_STATS_KEY)) || {};
        for (const game of dcGames) {
          if (!game.game_id) continue;
          // Process if not yet final, OR if final but missing stats
          const needsScore = game.game_status !== 'final';
          const needsStats = !existingStats[String(game.game_id)];
          if (needsScore || needsStats) {
            gamesToFetch.push({ game, division, type: 'dineen' });
          }
        }
        continue;
      }

      // NE Conference round robin + conference final
      if (division === 'NE Conference') {
        const rrGames = divState?.roundRobin?.games || [];
        const cfGames = divState?.conferenceFinal?.games || [];
        for (const game of [...rrGames, ...cfGames]) {
          if (game.game_id && game.game_status !== 'final') {
            gamesToFetch.push({ game, division, type: 'ne_conf' });
          }
        }
        continue;
      }

      // Standard division rounds
      if (!divState.rounds) continue;
      for (const round of divState.rounds) {
        for (const matchup of round.matchups) {
          for (const game of matchup.games || []) {
            if (game.game_id && game.game_status !== 'final') {
              gamesToFetch.push({ game, division, type: 'series' });
            }
          }
        }
      }
    }

    if (gamesToFetch.length === 0) {
      return res.status(200).json({ ok: true, updated: 0, message: 'No games need score updates' });
    }

    // Fetch scores via GameCenter (cached 1hr per game)
    const scoresMap = (await kvGet(SCORES_KEY)) || {};
    const dineenStatsMap = (await kvGet(DINEEN_STATS_KEY)) || {};
    let updated = 0;

    for (const { game, type } of gamesToFetch) {
      try {
        // Try the cache first; if cached entry shows the game already final, trust it.
        // Otherwise fetch fresh (the game may have just finished).
        let gc = await kvGet(`gc:${game.game_id}`);
        let status = (gc?.game_info?.status || '').toUpperCase();
        if (!status.startsWith('FINAL')) {
          gc = await getGameCenter(NCDC_LEAGUE_ID, game.game_id);
          status = (gc?.game_info?.status || '').toUpperCase();
          // Cache only after the game is final (results don't change)
          if (status.startsWith('FINAL')) {
            await kvSet(`gc:${game.game_id}`, gc).catch(() => {});
          }
        }
        if (!status.startsWith('FINAL')) continue;

        const goals = gc?.live?.goal_summary;
        if (!goals) continue;

        const homeScore = goals.home_goals?.total ?? null;
        const awayScore = goals.away_goals?.total ?? null;
        if (homeScore == null || awayScore == null) continue;

        // Detect OT
        const periods = gc.live?.period_list || [];
        const otCount = periods.filter(p => typeof p === 'string' || p > 3).length;
        let resultString = 'Final';
        if (otCount === 1) resultString = 'Final/OT';
        else if (otCount === 2) resultString = 'Final/OT2';
        else if (otCount > 2) resultString = 'Final/OT' + otCount;

        // Use GameCenter team IDs/names if not already on the game
        const gcHomeId = gc?.game_info?.home_id ? String(gc.game_info.home_id) : null;
        const gcAwayId = gc?.game_info?.away_id ? String(gc.game_info.away_id) : null;
        const gcHomeName = gc?.game_info?.home_name || null;
        const gcAwayName = gc?.game_info?.away_name || null;
        const winnerId = homeScore > awayScore
          ? (game.home_id ? String(game.home_id) : gcHomeId)
          : (game.away_id ? String(game.away_id) : gcAwayId);
        const winnerName = homeScore > awayScore
          ? (game.home_team || gcHomeName)
          : (game.away_team || gcAwayName);

        // Update game in bracket state
        game.home_score = homeScore;
        game.away_score = awayScore;
        game.result_string = resultString;
        game.winner_id = winnerId;
        if (winnerName) game.winner = winnerName;
        game.game_status = 'final';

        // Store in scores map for schedule API enrichment
        scoresMap[String(game.game_id)] = {
          home_goals: homeScore,
          away_goals: awayScore,
          home_score: homeScore,
          away_score: awayScore,
          result_string: resultString,
          winner_id: winnerId,
        };

        // For Dineen Cup games, extract per-game scorers + goalie stats
        if (type === 'dineen') {
          dineenStatsMap[String(game.game_id)] = {
            home_team: gcHomeName,
            away_team: gcAwayName,
            home: extractTeamGameStats(gc.live?.home_skaters, gc.live?.home_goalies),
            away: extractTeamGameStats(gc.live?.away_skaters, gc.live?.away_goalies),
          };
        }

        updated++;
      } catch (err) {
        console.warn(`Failed to fetch score for game ${game.game_id}:`, err.message);
      }
    }

    if (updated > 0) {
      bracketState._lastUpdated = new Date().toISOString();
      bracketState._updatedBy = 'update-scores';
      await kvSet(BRACKET_KEY, bracketState);
      await kvSet(SCORES_KEY, scoresMap);
      await kvSet(DINEEN_STATS_KEY, dineenStatsMap);
    }

    return res.status(200).json({ ok: true, updated, total: gamesToFetch.length });
  } catch (err) {
    console.error('Update scores error:', err);
    return res.status(500).json({ error: 'Failed to update scores' });
  }
}
