/**
 * Fix all bracket advancement issues in KV state:
 *
 * 1. Elite Atlantic r0-m0: Set overrideWinner for Connecticut (no API games exist)
 * 2. Elite Florida Play-In: Mark Florida Eels as winner (1 Game format, 1-0)
 * 3. Premier Pacific: Add Divisional Championship round with Fresno vs Ontario Jr Reign
 */

const BASE_URL = 'https://usphl-playoffs-2026.vercel.app';

async function main() {
  // Authenticate
  console.log('Authenticating...');
  const authRes = await fetch(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'usphl2026' }),
  });
  if (!authRes.ok) { console.error('Auth failed'); process.exit(1); }
  const { token } = await authRes.json();

  // Fetch current state
  console.log('Fetching bracket state...');
  const getRes = await fetch(`${BASE_URL}/api/bracket-state`);
  const state = await getRes.json();

  let changes = 0;

  // ========================================================
  // FIX 1: Elite Atlantic - overrideWinner for Connecticut
  // ========================================================
  console.log('\n=== FIX 1: Elite Atlantic - Connecticut vs Atlanta override ===');
  const ea = state.Elite?.Atlantic;
  if (ea) {
    const r0 = ea.rounds.find(r => r.roundIndex === 0);
    const r0m0 = r0?.matchups.find(m => m.matchupId === 'r0-m0');
    if (r0m0) {
      console.log(`  Before: ${r0m0.homeTeamName} vs ${r0m0.awayTeamName} | ${r0m0.status} | override: ${r0m0.overrideWinner}`);
      r0m0.overrideWinner = 'home';  // Connecticut is home team
      r0m0.status = 'complete';
      r0m0.homeWins = 2;
      r0m0.awayWins = 0;
      r0m0.winnerId = r0m0.homeTeamId;
      r0m0.winnerSeed = r0m0.homeSeed;
      r0m0.winnerName = r0m0.homeTeamName;
      r0m0.seriesSummary = 'Connecticut Junior Rangers wins (default)';
      r0m0.note = 'Atlanta Mad Hatters did not participate';
      console.log(`  After: ${r0m0.status} | override: ${r0m0.overrideWinner} | winner: ${r0m0.winnerName}`);
      changes++;
    }
  }

  // ========================================================
  // FIX 2: Elite Florida - mark Play-In as complete
  // ========================================================
  console.log('\n=== FIX 2: Elite Florida - Play-In 1-Game completion ===');
  const ef = state.Elite?.Florida;
  if (ef) {
    const r0 = ef.rounds.find(r => r.roundIndex === 0);
    const r0m0 = r0?.matchups.find(m => m.matchupId === 'r0-m0');
    if (r0m0) {
      console.log(`  Before: ${r0m0.homeTeamName} vs ${r0m0.awayTeamName} | ${r0m0.homeWins}-${r0m0.awayWins} | ${r0m0.status}`);

      // Check if there's a 1-0 win (Florida Eels won the single game)
      if (r0m0.homeWins === 1 && r0m0.awayWins === 0) {
        r0m0.status = 'complete';
        r0m0.winnerId = r0m0.homeTeamId;
        r0m0.winnerSeed = r0m0.homeSeed;
        r0m0.winnerName = r0m0.homeTeamName;
        r0m0.seriesSummary = `${r0m0.homeTeamName} wins`;
        console.log(`  After: ${r0m0.status} | winner: ${r0m0.winnerName}`);

        // Now advance to Semifinals
        const r1 = ef.rounds.find(r => r.roundIndex === 1);
        if (r1) {
          // Play-In Winner goes to r1-m0 (vs #1 Tampa Bay Juniors)
          const r1m0 = r1.matchups.find(m => m.matchupId === 'r1-m0');
          if (r1m0 && !r1m0.awayTeamId) {
            r1m0.awaySeed = r0m0.winnerSeed;
            r1m0.awayTeamId = r0m0.winnerId;
            r1m0.awayTeamName = r0m0.winnerName;
            console.log(`  Advanced: ${r1m0.homeTeamName} vs ${r1m0.awayTeamName}`);
          }
        }
        changes++;
      } else if (r0m0.awayWins === 1 && r0m0.homeWins === 0) {
        r0m0.status = 'complete';
        r0m0.winnerId = r0m0.awayTeamId;
        r0m0.winnerSeed = r0m0.awaySeed;
        r0m0.winnerName = r0m0.awayTeamName;
        r0m0.seriesSummary = `${r0m0.awayTeamName} wins`;
        console.log(`  After: ${r0m0.status} | winner: ${r0m0.winnerName}`);

        const r1 = ef.rounds.find(r => r.roundIndex === 1);
        if (r1) {
          const r1m0 = r1.matchups.find(m => m.matchupId === 'r1-m0');
          if (r1m0 && !r1m0.awayTeamId) {
            r1m0.awaySeed = r0m0.winnerSeed;
            r1m0.awayTeamId = r0m0.winnerId;
            r1m0.awayTeamName = r0m0.winnerName;
            console.log(`  Advanced: ${r1m0.homeTeamName} vs ${r1m0.awayTeamName}`);
          }
        }
        changes++;
      } else {
        console.log('  No change needed (score is not 1-0 or 0-1)');
      }
    }
  }

  // ========================================================
  // FIX 3: Premier Pacific - Add Divisional Championship round
  // ========================================================
  console.log('\n=== FIX 3: Premier Pacific - Add Championship round ===');
  const pp = state.Premier?.Pacific;
  if (pp) {
    console.log(`  Current rounds: ${pp.rounds.map(r => r.roundName).join(', ')}`);

    const hasChampionship = pp.rounds.some(r => r.roundName.includes('Championship'));
    if (!hasChampionship) {
      // Get semifinal winners
      const semis = pp.rounds.find(r => r.roundIndex === 0);
      const winners = semis?.matchups
        .filter(m => m.status === 'complete' && m.winnerId)
        .map(m => ({
          seed: m.winnerSeed,
          teamId: m.winnerId,
          teamName: m.winnerName,
        }))
        .sort((a, b) => (a.seed || 99) - (b.seed || 99)) || [];

      console.log(`  Semifinal winners: ${winners.map(w => `#${w.seed} ${w.teamName}`).join(', ')}`);

      // Add championship round
      const champRound = {
        roundIndex: 1,
        roundName: 'Divisional Championship',
        format: 'Bo3',
        byes: [],
        matchups: [{
          matchupId: 'r1-m0',
          homeSeed: winners[0]?.seed || null,
          awaySeed: winners[1]?.seed || null,
          homeTeamId: winners[0]?.teamId || null,
          awayTeamId: winners[1]?.teamId || null,
          homeTeamName: winners[0]?.teamName || 'TBD',
          awayTeamName: winners[1]?.teamName || 'TBD',
          homeWins: 0,
          awayWins: 0,
          status: 'not_started',
          winnerId: null,
          winnerSeed: null,
          winnerName: null,
          games: [],
          overrideWinner: null,
          note: null,
        }],
      };

      pp.rounds.push(champRound);
      console.log(`  Added: ${champRound.matchups[0].homeTeamName} vs ${champRound.matchups[0].awayTeamName}`);
      console.log(`  Rounds now: ${pp.rounds.map(r => r.roundName).join(', ')}`);
      changes++;
    } else {
      console.log('  Championship round already exists');
    }
  }

  // Save
  if (changes > 0) {
    console.log(`\nSaving ${changes} fixes...`);
    state._lastUpdated = new Date().toISOString();
    state._updatedBy = 'fix-all-advancements';

    const saveRes = await fetch(`${BASE_URL}/api/bracket-state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(state),
    });

    if (!saveRes.ok) { console.error('Save failed:', saveRes.status, await saveRes.text()); process.exit(1); }
    const result = await saveRes.json();
    console.log('Save result:', result);
  } else {
    console.log('\nNo changes needed.');
  }

  console.log('\nDone!');
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
