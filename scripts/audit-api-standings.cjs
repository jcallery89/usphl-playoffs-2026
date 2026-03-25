// Fetch real standings from TimeToScore API and compare to bracket seedings
// Usage: node scripts/audit-api-standings.cjs

const https = require('https');
const fs = require('fs');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse failed')); }
      });
    }).on('error', reject);
  });
}

// TTS API URLs (auth from user)
const AUTH_PARAMS = 'auth_key=leagueapps&auth_timestamp=1773079311&body_md5=d41d8cd98f00b204e9800998ecf8427e&auth_signature=6d93171ce40144a55dab1c75be7d055ae8c7795ea499775ccd649668f7e9dc7c';
const TTS_BASE = 'https://api.usphl.timetoscore.com/get_standings';

async function main() {
  // Fetch bracket state
  console.log('Fetching bracket state...');
  const bracketState = await fetchJSON('https://usphl-playoffs-2026.vercel.app/api/bracket-state');

  const leagueConfigs = [
    { name: 'Elite', leagueId: 3, levelId: 1 },
    { name: 'Premier', leagueId: 2, levelId: 1 },
  ];

  for (const lc of leagueConfigs) {
    const url = `${TTS_BASE}?${AUTH_PARAMS}&league_id=${lc.leagueId}&season_id=65&level_id=${lc.levelId}`;
    console.log(`\nFetching ${lc.name} standings (league_id=${lc.leagueId}, level_id=${lc.levelId})...`);

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

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${lc.name.toUpperCase()} — STANDINGS vs BRACKET SEEDINGS`);
    console.log(`${'='.repeat(60)}`);

    for (const level of levels) {
      const conferences = level.conferences || [];

      for (const conf of conferences) {
        const confName = conf.name || conf.conf_name || 'Unknown';
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
          const r0 = bracketDiv.rounds[0];
          if (r0.byes) {
            r0.byes.forEach(b => {
              bracketSeeds.push({ seed: b.seed, name: b.teamName || b.name || '?' });
            });
          }
          if (r0.matchups) {
            r0.matchups.forEach(m => {
              if (m.homeSeed) bracketSeeds.push({ seed: m.homeSeed, name: m.homeTeamName || 'TBD' });
              if (m.awaySeed) bracketSeeds.push({ seed: m.awaySeed, name: m.awayTeamName || 'TBD' });
              if (m.home && m.home.seed && !m.homeSeed) bracketSeeds.push({ seed: m.home.seed, name: m.home.name || 'TBD' });
              if (m.away && m.away.seed && !m.awaySeed) bracketSeeds.push({ seed: m.away.seed, name: m.away.name || 'TBD' });
            });
          }
          // Check further rounds for byes
          for (let ri = 1; ri < bracketDiv.rounds.length; ri++) {
            const r = bracketDiv.rounds[ri];
            if (r.matchups) {
              r.matchups.forEach(m => {
                if (m.homeSeed && !bracketSeeds.find(s => s.seed === m.homeSeed)) {
                  bracketSeeds.push({ seed: m.homeSeed, name: m.homeTeamName || 'TBD' });
                }
                if (m.awaySeed && !bracketSeeds.find(s => s.seed === m.awaySeed)) {
                  bracketSeeds.push({ seed: m.awaySeed, name: m.awayTeamName || 'TBD' });
                }
              });
            }
          }
        }

        bracketSeeds.sort((a, b) => a.seed - b.seed);
        const qualifyCount = (bracketDiv && bracketDiv.qualifyCount) || bracketSeeds.length;

        console.log(`\n--- ${confName} ---`);
        if (!bracketDiv) {
          console.log('  (No bracket data for this division)');
          teams.slice(0, 8).forEach((t, i) => {
            console.log(`  API #${i+1}: ${t.team_name} (${t.pts} pts, ${t.total_wins}W-${t.losses}L)`);
          });
          continue;
        }

        let mismatches = [];
        const maxCheck = Math.max(qualifyCount, bracketSeeds.length);

        for (let i = 0; i < maxCheck; i++) {
          const apiTeam = teams[i];
          const bracketSeed = bracketSeeds.find(s => s.seed === (i + 1));

          if (!apiTeam || !bracketSeed) continue;

          const apiName = apiTeam.team_name;
          const bracketName = bracketSeed.name;

          // Normalize for comparison
          const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
          const apiNorm = norm(apiName);
          const bracketNorm = norm(bracketName);

          const match = apiNorm === bracketNorm ||
            apiNorm.includes(bracketNorm.substring(0, 10)) ||
            bracketNorm.includes(apiNorm.substring(0, 10));

          const status = match ? '✓' : '*** MISMATCH ***';
          if (!match) mismatches.push(i + 1);

          console.log(`  #${i+1}: API=${apiName} (${apiTeam.pts}pts) | Bracket=${bracketName}  ${status}`);
        }

        if (mismatches.length === 0) {
          console.log('  ✅ All seedings correct');
        } else {
          console.log(`  ❌ MISMATCHES at seeds: ${mismatches.join(', ')}`);
        }
      }
    }
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
