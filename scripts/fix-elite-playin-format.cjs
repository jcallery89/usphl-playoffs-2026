// Fix Elite Florida and Southeast play-in round format from Bo3 to 1 Game
const https = require('https');

const BASE_URL = 'https://usphl-playoffs-2026.vercel.app';

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    const req = mod.request(url, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse failed: ' + res.statusCode + ' ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  // Auth
  console.log('Authenticating...');
  const auth = await fetchJSON(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'usphl2026' }),
  });
  if (!auth.token) { console.error('Auth failed:', auth); process.exit(1); }
  console.log('Authenticated.');

  // Fetch state
  console.log('Fetching bracket state...');
  const state = await fetchJSON(`${BASE_URL}/api/bracket-state`);

  // Fix Florida and Southeast play-in rounds
  ['Florida', 'Southeast'].forEach(div => {
    const divState = state.Elite[div];
    if (!divState) { console.log('No data for Elite ' + div); return; }

    const r0 = divState.rounds[0];
    console.log(`\nElite ${div} Round 0: "${r0.roundName}" format: ${r0.format} -> 1 Game`);
    r0.format = '1 Game';
  });

  // Save
  console.log('\nSaving...');
  state._lastUpdated = new Date().toISOString();
  state._updatedBy = 'fix-playin-format';

  const saveResult = await fetchJSON(`${BASE_URL}/api/bracket-state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth.token}`,
    },
    body: JSON.stringify(state),
  });

  console.log('Save result:', saveResult);
  console.log('Done!');
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
