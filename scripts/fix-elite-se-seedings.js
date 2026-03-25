/**
 * Fix Elite Southeast bracket seedings.
 *
 * The correct standings have Hampton Roads Whalers as #1 seed (75 pts)
 * and Carolina Junior Hurricanes as #2 seed (74 pts). The initial bracket
 * state had them swapped. This script corrects that.
 *
 * Run:  node scripts/fix-elite-se-seedings.js
 */

const BASE_URL = 'https://usphl-playoffs-2026.vercel.app';

// Team data
const HAMPTON_ROADS = {
  teamName: 'Hampton Roads Whalers',
  teamId: '1409',
  logoUrl: 'https://d3bll69iq5agq8.cloudfront.net/usphl/logos/7ade2d6a9813b0035f4ae430dbfd5eae0b5bf37e1028d022fab6bb71f6803187.png',
  logoFile: 'Hampton_Roads_Whalers.png',
  profileUrl: 'https://usphl.com/elite/game-center/teams/?team=1409&season=65&level_id=1',
};

const CAROLINA = {
  teamName: 'Carolina Junior Hurricanes',
  teamId: '1399',
  logoUrl: 'https://d3bll69iq5agq8.cloudfront.net/usphl/logos/9d31d6116c98698859154c86f49ca59a36146d93a0a50df17234aa7a7cefc5f1.png',
  logoFile: 'Carolina_Junior_Hurricanes.png',
  profileUrl: 'https://usphl.com/elite/game-center/teams/?team=1399&season=65&level_id=1',
};

async function main() {
  // Step 1: Authenticate
  console.log('Authenticating...');
  const authRes = await fetch(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'usphl2026' }),
  });
  if (!authRes.ok) {
    console.error('Auth failed:', authRes.status, await authRes.text());
    process.exit(1);
  }
  const { token } = await authRes.json();
  console.log('Authenticated successfully.');

  // Step 2: Fetch current bracket state
  console.log('Fetching bracket state...');
  const getRes = await fetch(`${BASE_URL}/api/bracket-state`);
  if (!getRes.ok) {
    console.error('Failed to fetch bracket state:', getRes.status, await getRes.text());
    process.exit(1);
  }
  const state = await getRes.json();
  console.log('Bracket state fetched.');

  // Step 3: Locate Elite > Southeast
  const se = state.Elite?.Southeast;
  if (!se) {
    console.error('Elite > Southeast not found in bracket state');
    process.exit(1);
  }

  // Verify current (incorrect) state before modifying
  const round0 = se.rounds.find(r => r.roundIndex === 0);
  const round1 = se.rounds.find(r => r.roundIndex === 1);

  if (!round0 || !round1) {
    console.error('Could not find round 0 or round 1 in Southeast');
    process.exit(1);
  }

  console.log('\n--- BEFORE ---');
  console.log('Round 0 byes:');
  round0.byes.forEach(b => console.log(`  Seed ${b.seed}: ${b.teamName} (${b.teamId})`));
  console.log('Round 1 matchups:');
  round1.matchups.forEach(m =>
    console.log(`  ${m.matchupId}: ${m.homeTeamName} (seed ${m.homeSeed}) vs ${m.awayTeamName} (seed ${m.awaySeed})`)
  );

  // Step 4: Fix Round 0 byes — swap seed 1 and seed 2
  round0.byes[0] = { seed: 1, ...HAMPTON_ROADS };
  round0.byes[1] = { seed: 2, ...CAROLINA };
  // Seed 3 (Charlotte Rush) stays the same

  // Step 5: Fix Round 1 matchups
  // r1-m0: #1 Hampton Roads vs Play-In Winner
  const r1m0 = round1.matchups.find(m => m.matchupId === 'r1-m0');
  if (r1m0) {
    r1m0.homeSeed = 1;
    r1m0.homeTeamId = HAMPTON_ROADS.teamId;
    r1m0.homeTeamName = HAMPTON_ROADS.teamName;
    // away stays as Play-In Winner (awaySeed null, awayTeamId null)
  }

  // r1-m1: #2 Carolina vs #3 Charlotte Rush
  const r1m1 = round1.matchups.find(m => m.matchupId === 'r1-m1');
  if (r1m1) {
    r1m1.homeSeed = 2;
    r1m1.homeTeamId = CAROLINA.teamId;
    r1m1.homeTeamName = CAROLINA.teamName;
    // away stays as Charlotte Rush (seed 3) — unchanged
  }

  console.log('\n--- AFTER ---');
  console.log('Round 0 byes:');
  round0.byes.forEach(b => console.log(`  Seed ${b.seed}: ${b.teamName} (${b.teamId})`));
  console.log('Round 1 matchups:');
  round1.matchups.forEach(m =>
    console.log(`  ${m.matchupId}: ${m.homeTeamName} (seed ${m.homeSeed}) vs ${m.awayTeamName} (seed ${m.awaySeed})`)
  );

  // Step 6: Save back via POST (full state replacement — state has _version)
  console.log('\nSaving updated bracket state...');
  state._lastUpdated = new Date().toISOString();
  state._updatedBy = 'fix-elite-se-seedings';

  const saveRes = await fetch(`${BASE_URL}/api/bracket-state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(state),
  });

  if (!saveRes.ok) {
    console.error('Failed to save:', saveRes.status, await saveRes.text());
    process.exit(1);
  }

  const result = await saveRes.json();
  console.log('Save result:', result);
  console.log('\nDone! Elite Southeast seedings fixed.');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
