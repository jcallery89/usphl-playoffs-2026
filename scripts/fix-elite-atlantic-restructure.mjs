/**
 * Restructure Elite Atlantic bracket:
 * - Remove Atlanta Mad Hatters (folded before postseason)
 * - Give Connecticut Junior Rangers a BYE
 * - Round 1: only Red Bank vs PAL Jr Islanders
 * - Round 2: Wilkes-Barre vs Red Bank, Hershey vs Connecticut
 */

const BASE_URL = 'https://usphl-playoffs-2026.vercel.app';

async function main() {
  // Authenticate
  console.log('Authenticating...');
  const authRes = await fetch(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'usphl2026' })
  });
  if (!authRes.ok) { console.error('Auth failed'); process.exit(1); }
  const { token } = await authRes.json();
  console.log('Authenticated ✓');

  // Get current state
  const stateRes = await fetch(`${BASE_URL}/api/bracket-state?_cb=${Date.now()}`);
  const state = await stateRes.json();
  const eliteAtl = state.Elite.Atlantic;

  console.log('\n=== BEFORE ===');
  eliteAtl.rounds.forEach((r, i) => {
    console.log(`Round ${i}: ${r.roundName} (${r.matchups.length} matchups)`);
    r.matchups.forEach((m, j) => {
      console.log(`  m${j}: ${m.homeTeamName} vs ${m.awayTeamName} | ${m.homeWins}-${m.awayWins} | ${m.status}`);
    });
  });

  // Round 0 (Round 1): Remove Connecticut vs Atlanta, keep only Red Bank vs PAL
  const redBankMatchup = eliteAtl.rounds[0].matchups.find(
    m => m.homeTeamName === 'Red Bank Generals'
  );
  if (!redBankMatchup) {
    console.error('Could not find Red Bank matchup!');
    process.exit(1);
  }
  redBankMatchup.matchupId = 'r0-m0';
  eliteAtl.rounds[0].matchups = [redBankMatchup];

  // Round 1 (Round 2): Populate matchups
  // #1 Wilkes-Barre vs #4 Red Bank (lowest remaining)
  // #2 Hershey vs #3 Connecticut
  eliteAtl.rounds[1].matchups = [
    {
      matchupId: 'r1-m0',
      homeTeamName: 'Wilkes-Barre Scranton Knights',
      awayTeamName: 'Red Bank Generals',
      homeTeamId: 1429,
      awayTeamId: 2288,
      homeSeed: 1,
      awaySeed: 4,
      homeWins: 0,
      awayWins: 0,
      status: 'scheduled',
      seriesSummary: '',
      games: []
    },
    {
      matchupId: 'r1-m1',
      homeTeamName: 'Hershey Cubs',
      awayTeamName: 'Connecticut Junior Rangers',
      homeTeamId: 1410,
      awayTeamId: 1403,
      homeSeed: 2,
      awaySeed: 3,
      homeWins: 0,
      awayWins: 0,
      status: 'scheduled',
      seriesSummary: '',
      games: []
    }
  ];

  // Round 2 (Divisional Championship) stays as TBD
  // Already correct

  console.log('\n=== AFTER ===');
  eliteAtl.rounds.forEach((r, i) => {
    console.log(`Round ${i}: ${r.roundName} (${r.matchups.length} matchups)`);
    r.matchups.forEach((m, j) => {
      console.log(`  m${j}: #${m.homeSeed || '?'} ${m.homeTeamName} vs #${m.awaySeed || '?'} ${m.awayTeamName} | ${m.homeWins}-${m.awayWins} | ${m.status}`);
    });
  });

  // Save
  state._lastUpdated = new Date().toISOString();
  const saveRes = await fetch(`${BASE_URL}/api/bracket-state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(state)
  });

  if (saveRes.ok) {
    console.log('\n✅ KV state updated successfully');
  } else {
    console.error('Save failed:', saveRes.status, await saveRes.text());
  }
}

main().catch(console.error);
