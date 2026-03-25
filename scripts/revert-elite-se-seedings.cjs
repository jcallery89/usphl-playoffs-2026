// Revert Elite Southeast seedings back to Carolina #1, Hampton Roads #2
// The USPHL playoff hub uses PTS% for seeding, not raw points.
const https = require('https');

const BASE_URL = 'https://usphl-playoffs-2026.vercel.app';

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse failed: ' + res.statusCode)); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  console.log('Authenticating...');
  const auth = await fetchJSON(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'usphl2026' }),
  });
  if (!auth.token) { console.error('Auth failed'); process.exit(1); }

  console.log('Fetching bracket state...');
  const state = await fetchJSON(`${BASE_URL}/api/bracket-state`);
  const se = state.Elite.Southeast;

  console.log('BEFORE:');
  se.rounds[0].byes.forEach(b => console.log('  #' + b.seed + ' ' + b.teamName));

  // Swap back: Carolina = #1, Hampton Roads = #2
  const carolina = se.rounds[0].byes.find(b => b.teamName.includes('Carolina'));
  const hampton = se.rounds[0].byes.find(b => b.teamName.includes('Hampton'));

  if (carolina) carolina.seed = 1;
  if (hampton) hampton.seed = 2;
  // Re-sort byes by seed
  se.rounds[0].byes.sort((a, b) => a.seed - b.seed);

  // Fix Round 1 matchups
  const r1m0 = se.rounds[1].matchups.find(m => m.matchupId === 'r1-m0');
  if (r1m0) {
    r1m0.homeSeed = 1;
    r1m0.homeTeamId = carolina.teamId;
    r1m0.homeTeamName = carolina.teamName;
  }
  const r1m1 = se.rounds[1].matchups.find(m => m.matchupId === 'r1-m1');
  if (r1m1) {
    r1m1.homeSeed = 2;
    r1m1.homeTeamId = hampton.teamId;
    r1m1.homeTeamName = hampton.teamName;
  }

  console.log('AFTER:');
  se.rounds[0].byes.forEach(b => console.log('  #' + b.seed + ' ' + b.teamName));
  se.rounds[1].matchups.forEach(m => console.log('  ' + m.homeTeamName + ' (seed ' + m.homeSeed + ') vs ' + m.awayTeamName));

  console.log('Saving...');
  state._lastUpdated = new Date().toISOString();
  state._updatedBy = 'revert-se-seedings';
  const result = await fetchJSON(`${BASE_URL}/api/bracket-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
    body: JSON.stringify(state),
  });
  console.log('Result:', result);
}

main().catch(err => { console.error(err); process.exit(1); });
