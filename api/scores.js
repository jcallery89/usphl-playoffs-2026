import { kvGet, kvSet, getCached } from '../lib/cache.js';
import { getGameCenter } from '../lib/timetoscore.js';

const NCDC_LEAGUE_ID = '1';
const BRACKET_KEY = 'bracket-state';
const SCORES_KEY = 'game-scores';

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
      if (division === 'Dineen Cup') continue;

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
    let updated = 0;

    for (const { game } of gamesToFetch) {
      try {
        const gc = await getCached(
          `gc:${game.game_id}`,
          () => getGameCenter(NCDC_LEAGUE_ID, game.game_id),
          3600
        );

        const status = (gc?.game_info?.status || '').toUpperCase();
        if (status !== 'FINAL' && !status.startsWith('FINAL')) continue;

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

        const winnerId = homeScore > awayScore
          ? String(game.home_id)
          : String(game.away_id);

        // Update game in bracket state
        game.home_score = homeScore;
        game.away_score = awayScore;
        game.result_string = resultString;
        game.winner_id = winnerId;
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
    }

    return res.status(200).json({ ok: true, updated, total: gamesToFetch.length });
  } catch (err) {
    console.error('Update scores error:', err);
    return res.status(500).json({ error: 'Failed to update scores' });
  }
}
