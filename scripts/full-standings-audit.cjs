// Full audit: fetch real standings from TTS API, compare to bracket seedings
// Usage: node scripts/full-standings-audit.cjs

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const API_URL = 'https://api.usphl.timetoscore.com';
const USERNAME = 'leagueapps';
const SECRET = '7csjfsXdUYuLs1Nq2datfxIdrpOjgFln';
const SEASON_ID = '65';

function generateSignedUrl(endpoint, params) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyMd5 = crypto.createHash('md5').update('').digest('hex');

  const signedParams = { ...params, auth_key: USERNAME, auth_timestamp: timestamp, body_md5: bodyMd5 };
  const keys = Object.keys(signedParams).sort();
  const canonicalQS = keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(signedParams[k])}`).join('&');
  const stringToSign = `GET\n${endpoint}\n${canonicalQS}`;
  const sig = crypto.createHmac('sha256', SECRET).update(stringToSign).digest('hex');

  return `${API_URL}${endpoint}?${canonicalQS}&auth_signature=${encodeURIComponent(sig)}`;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse failed: ' + data.substring(0, 300))); }
      });
    }).on('error', reject);
  });
}

async function main() {
  // Fetch bracket state
  console.log('Fetching bracket state...');
  const bracketState = await fetchJSON('https://usphl-playoffs-2026.vercel.app/api/bracket-state');

  const leagueConfigs = [
    { name: 'Elite', leagueId: '3', levelId: '1' },   // Junior level
    { name: 'Premier', leagueId: '2', levelId: '1' },  // Junior level
  ];

  const allMismatches = [];

  for (const lc of leagueConfigs) {
    console.log(`\nFetching ${lc.name} standings...`);
    // stat_class=1 for regular season
    const url = generateSignedUrl('/get_standings', {
      league_id: lc.leagueId,
      season_id: SEASON_ID,
      level_id: lc.levelId,
    });

    let apiData;
    try {
      apiData = await fetchJSON(url);
    } catch(e) {
      console.log('ERROR: ' + e.message);
      continue;
    }

    const leagues = apiData.standings && apiData.standings.leagues;
    if (!leagues || leagues.length === 0) {
      console.log('No standings data returned');
      continue;
    }

    const league = leagues[0];
    const levels = league.levels || [];

    console.log(`\n${'='.repeat(65)}`);
    console.log(`  ${lc.name.toUpperCase()} — STANDINGS vs BRACKET SEEDINGS`);
    console.log(`${'='.repeat(65)}`);

    for (const level of levels) {
      const conferences = level.conferences || [];

      for (const conf of conferences) {
        const confName = (conf.name || conf.conf_name || 'Unknown').trim();
        const teams = conf.teams || [];

        // Sort by pts descending, then total_wins desc
        teams.sort((a, b) => {
          const ptsDiff = (b.pts || 0) - (a.pts || 0);
          if (ptsDiff !== 0) return ptsDiff;
          return (parseInt(b.total_wins) || 0) - (parseInt(a.total_wins) || 0);
        });

        // Find matching bracket division
        const bracketDiv = bracketState[lc.name] && bracketState[lc.name][confName];

        // Extract bracket seedings
        const bracketSeeds = [];
        if (bracketDiv && bracketDiv.rounds && bracketDiv.rounds.length > 0) {
          for (let ri = 0; ri < bracketDiv.rounds.length; ri++) {
            const r = bracketDiv.rounds[ri];
            if (r.byes) {
              r.byes.forEach(b => {
                if (!bracketSeeds.find(s => s.seed === b.seed)) {
                  bracketSeeds.push({ seed: b.seed, name: b.teamName || b.name || '?' });
                }
              });
            }
            if (r.matchups) {
              r.matchups.forEach(m => {
                const hSeed = m.homeSeed || (m.home && m.home.seed);
                const aSeed = m.awaySeed || (m.away && m.away.seed);
                const hName = m.homeTeamName || (m.home && m.home.name) || 'TBD';
                const aName = m.awayTeamName || (m.away && m.away.name) || 'TBD';

                if (hSeed && !bracketSeeds.find(s => s.seed === hSeed)) {
                  bracketSeeds.push({ seed: hSeed, name: hName });
                }
                if (aSeed && !bracketSeeds.find(s => s.seed === aSeed)) {
                  bracketSeeds.push({ seed: aSeed, name: aName });
                }
              });
            }
          }
        }

        bracketSeeds.sort((a, b) => a.seed - b.seed);
        const qualifyCount = (bracketDiv && bracketDiv.qualifyCount) || bracketSeeds.length;

        console.log(`\n--- ${confName} ---`);
        if (!bracketDiv || bracketSeeds.length === 0) {
          console.log('  ⚠️  No bracket data for this division');
          teams.slice(0, 5).forEach((t, i) => {
            console.log(`  API #${i+1}: ${t.team_name} (${t.pts} pts)`);
          });
          continue;
        }

        let divMismatches = [];
        const maxCheck = Math.min(qualifyCount, bracketSeeds.length);

        for (let i = 0; i < maxCheck; i++) {
          const apiTeam = teams[i];
          const bracketSeed = bracketSeeds.find(s => s.seed === (i + 1));

          if (!apiTeam || !bracketSeed) continue;

          const apiName = apiTeam.team_name;
          const bracketName = bracketSeed.name;

          // Normalize for comparison (handle slight name differences)
          const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
          const apiNorm = norm(apiName);
          const bracketNorm = norm(bracketName);

          // Fuzzy match: check if one contains a significant prefix of the other
          const match = apiNorm === bracketNorm ||
            apiNorm.includes(bracketNorm.substring(0, Math.min(12, bracketNorm.length))) ||
            bracketNorm.includes(apiNorm.substring(0, Math.min(12, apiNorm.length)));

          const status = match ? '✓' : '*** MISMATCH ***';
          if (!match) {
            divMismatches.push({ seed: i+1, api: apiName, bracket: bracketName, pts: apiTeam.pts });
          }

          console.log(`  #${i+1}: API=${apiName} (${apiTeam.pts}pts) | Bracket=${bracketName}  ${status}`);
        }

        if (divMismatches.length === 0) {
          console.log('  ✅ All seedings correct');
        } else {
          console.log(`  ❌ MISMATCHES at seeds: ${divMismatches.map(m => '#' + m.seed).join(', ')}`);
          allMismatches.push({ league: lc.name, division: confName, mismatches: divMismatches });
        }
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(65)}`);
  console.log('  SUMMARY');
  console.log(`${'='.repeat(65)}`);
  if (allMismatches.length === 0) {
    console.log('✅ All seedings match across all divisions!');
  } else {
    console.log(`❌ Found mismatches in ${allMismatches.length} division(s):\n`);
    allMismatches.forEach(m => {
      console.log(`  ${m.league} > ${m.division}:`);
      m.mismatches.forEach(mm => {
        console.log(`    Seed #${mm.seed}: Should be "${mm.api}" (${mm.pts}pts), bracket has "${mm.bracket}"`);
      });
    });
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
