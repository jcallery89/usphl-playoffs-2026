/**
 * Fix Elite Atlantic bracket advancement.
 *
 * Problem: Connecticut vs Atlanta (r0-m0) has no API games (forfeit/default),
 * so it's stuck at not_started, blocking Round 2 auto-advancement.
 *
 * Fix:
 * 1. Mark r0-m0 as complete with Connecticut as winner
 * 2. Populate Round 2 with correct teams:
 *    - r1-m0: #1 Wilkes-Barre vs #4 Red Bank (lowest seed winner)
 *    - r1-m1: #2 Hershey vs #3 Connecticut (second lowest)
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
  if (!authRes.ok) { console.error('Auth failed:', authRes.status); process.exit(1); }
  const { token } = await authRes.json();

  // Fetch current state
  console.log('Fetching bracket state...');
  const getRes = await fetch(`${BASE_URL}/api/bracket-state`);
  const state = await getRes.json();

  const ea = state.Elite?.Atlantic;
  if (!ea) { console.error('Elite Atlantic not found'); process.exit(1); }

  // === Fix Round 1: Mark Connecticut vs Atlanta as complete ===
  const round0 = ea.rounds.find(r => r.roundIndex === 0);
  const r0m0 = round0.matchups.find(m => m.matchupId === 'r0-m0');

  console.log('\n--- BEFORE Round 1 r0-m0 ---');
  console.log(`  ${r0m0.homeTeamName} vs ${r0m0.awayTeamName} | ${r0m0.homeWins}-${r0m0.awayWins} | ${r0m0.status}`);

  // Connecticut (#3, team 1403) wins by default/forfeit
  r0m0.homeWins = 2;
  r0m0.awayWins = 0;
  r0m0.status = 'complete';
  r0m0.winnerId = '1403';
  r0m0.winnerSeed = 3;
  r0m0.winnerName = 'Connecticut Junior Rangers';
  r0m0.seriesSummary = 'Connecticut Junior Rangers wins (default)';
  r0m0.note = 'Atlanta Mad Hatters did not participate';

  console.log('\n--- AFTER Round 1 r0-m0 ---');
  console.log(`  ${r0m0.homeTeamName} vs ${r0m0.awayTeamName} | ${r0m0.homeWins}-${r0m0.awayWins} | ${r0m0.status} | Winner: ${r0m0.winnerName}`);

  // === Fix Round 2: Populate with correct teams ===
  const round1 = ea.rounds.find(r => r.roundIndex === 1);

  console.log('\n--- BEFORE Round 2 ---');
  round1.matchups.forEach(m => {
    console.log(`  ${m.matchupId}: ${m.homeTeamName} (${m.homeTeamId}) vs ${m.awayTeamName} (${m.awayTeamId})`);
  });

  // Round 1 winners sorted by seed: #3 Connecticut, #4 Red Bank
  // BYE teams: #1 Wilkes-Barre, #2 Hershey
  // Advancement: #1 vs lowest seed (#4 Red Bank), #2 vs second lowest (#3 Connecticut)

  const r1m0 = round1.matchups.find(m => m.matchupId === 'r1-m0');
  if (r1m0) {
    r1m0.homeSeed = 1;
    r1m0.homeTeamId = '1429';
    r1m0.homeTeamName = 'Wilkes-Barre Scranton Knights';
    r1m0.awaySeed = 4;
    r1m0.awayTeamId = '2288';
    r1m0.awayTeamName = 'Red Bank Generals';
    r1m0.status = 'not_started';
    r1m0.homeWins = 0;
    r1m0.awayWins = 0;
  }

  const r1m1 = round1.matchups.find(m => m.matchupId === 'r1-m1');
  if (r1m1) {
    r1m1.homeSeed = 2;
    r1m1.homeTeamId = '1410';
    r1m1.homeTeamName = 'Hershey Cubs';
    r1m1.awaySeed = 3;
    r1m1.awayTeamId = '1403';
    r1m1.awayTeamName = 'Connecticut Junior Rangers';
    r1m1.status = 'not_started';
    r1m1.homeWins = 0;
    r1m1.awayWins = 0;
  }

  console.log('\n--- AFTER Round 2 ---');
  round1.matchups.forEach(m => {
    console.log(`  ${m.matchupId}: #${m.homeSeed} ${m.homeTeamName} (${m.homeTeamId}) vs #${m.awaySeed} ${m.awayTeamName} (${m.awayTeamId})`);
  });

  // Save
  console.log('\nSaving...');
  state._lastUpdated = new Date().toISOString();
  state._updatedBy = 'fix-elite-atlantic-advancement';

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
  console.log('\nDone! Elite Atlantic Round 2 populated.');
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
