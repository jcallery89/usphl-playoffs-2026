// Read bracket state directly from Upstash Redis to check raw data
const https = require('https');

const KV_URL = 'https://big-seagull-59512.upstash.io';
const KV_TOKEN = 'Aeh4AAIncDI3MjEwYzhhYThiNDQ0ZjU2OTNkODgwZmM3YzcyZjhlYXAyNTk1MTI';

function fetchRedis(command) {
  return new Promise((resolve, reject) => {
    const url = `${KV_URL}/${command}`;
    const options = {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse failed: ' + data.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Reading bracket-state directly from KV...');
  const result = await fetchRedis('GET/bracket-state');

  if (!result.result) {
    console.log('No data found, raw response:', JSON.stringify(result).substring(0, 200));
    return;
  }

  let state = result.result;
  // If it's a string, parse it
  if (typeof state === 'string') {
    state = JSON.parse(state);
  }

  console.log('_updatedBy:', state._updatedBy);
  console.log('_lastUpdated:', state._lastUpdated);

  const se = state.Elite && state.Elite.Southeast;
  if (se) {
    console.log('\nElite Southeast Round 0 byes:');
    (se.rounds[0].byes || []).forEach(b => console.log('  #' + b.seed + ' ' + b.teamName + ' (id:' + b.teamId + ')'));
    console.log('Round 1 matchups:');
    (se.rounds[1].matchups || []).forEach(m =>
      console.log('  ' + m.homeTeamName + ' (seed ' + m.homeSeed + ') vs ' + m.awayTeamName + ' (seed ' + m.awaySeed + ')')
    );
  }
}

main().catch(err => console.error('Failed:', err));
