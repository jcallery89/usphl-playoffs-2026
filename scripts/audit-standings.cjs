// Fetch teams from API and compare standings to bracket seedings
// Usage: node scripts/audit-standings.cjs

const https = require('https');
const fs = require('fs');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse failed: ' + data.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

async function main() {
  // Fetch bracket state
  console.log('Fetching bracket state...');
  const bracketState = await fetchJSON('https://usphl-playoffs-2026.vercel.app/api/bracket-state');

  // Fetch teams for Elite (league_id=3) and Premier (league_id=2)
  const leagues = [
    { name: 'Elite', id: '3' },
    { name: 'Premier', id: '2' },
  ];

  for (const league of leagues) {
    console.log('\nFetching ' + league.name + ' teams (league_id=' + league.id + ')...');
    let teams;
    try {
      teams = await fetchJSON('https://usphl-playoffs-2026.vercel.app/api/teams?league_id=' + league.id);
    } catch(e) {
      console.log('ERROR fetching teams: ' + e.message);
      continue;
    }

    if (!Array.isArray(teams)) {
      console.log('Teams response is not an array:', typeof teams, JSON.stringify(teams).substring(0, 200));
      continue;
    }

    // Group teams by division
    const divs = {};
    teams.forEach(t => {
      const div = t.division || 'Unknown';
      if (!divs[div]) divs[div] = [];
      divs[div].push(t);
    });

    console.log('\n========== ' + league.name.toUpperCase() + ' STANDINGS vs BRACKET SEEDINGS ==========');

    // For each division, compare API standings to bracket seedings
    const bracketDivisions = bracketState[league.name] || {};

    Object.keys(divs).sort().forEach(div => {
      // Sort by points desc, then wins desc as tiebreaker
      const sorted = divs[div].sort((a, b) => {
        const ptsDiff = (b.points || 0) - (a.points || 0);
        if (ptsDiff !== 0) return ptsDiff;
        return (b.wins || 0) - (a.wins || 0);
      });

      // Find matching bracket division
      const bracketDiv = bracketDivisions[div];
      if (!bracketDiv) {
        console.log('\n--- ' + div + ' --- (NO BRACKET DATA)');
        sorted.forEach((t, i) => {
          console.log('  API #' + (i + 1) + ': ' + t.team_name + ' (' + (t.points || 0) + ' pts)');
        });
        return;
      }

      // Extract bracket seedings
      const rounds = bracketDiv.rounds || [];
      const bracketSeeds = [];

      if (rounds.length > 0) {
        const r0 = rounds[0];
        if (r0.byes) {
          r0.byes.forEach(b => {
            bracketSeeds.push({ seed: b.seed, name: b.teamName || b.name || '?' });
          });
        }
        if (r0.matchups) {
          r0.matchups.forEach(m => {
            if (m.homeSeed) bracketSeeds.push({ seed: m.homeSeed, name: m.homeTeamName || 'TBD' });
            if (m.awaySeed) bracketSeeds.push({ seed: m.awaySeed, name: m.awayTeamName || 'TBD' });
            if (!m.homeSeed && m.home && m.home.seed) bracketSeeds.push({ seed: m.home.seed, name: m.home.name || 'TBD' });
            if (!m.awaySeed && m.away && m.away.seed) bracketSeeds.push({ seed: m.away.seed, name: m.away.name || 'TBD' });
          });
        }
        // Check round 1 too for byes
        if (rounds.length > 1) {
          const r1 = rounds[1];
          if (r1.matchups) {
            r1.matchups.forEach(m => {
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

      // Compare
      let hasMismatch = false;
      const qualifyCount = bracketDiv.qualifyCount || bracketSeeds.length;

      console.log('\n--- ' + div + ' ---');

      for (let i = 0; i < Math.max(sorted.length, bracketSeeds.length); i++) {
        const apiTeam = sorted[i];
        const bracketSeed = bracketSeeds.find(s => s.seed === (i + 1));

        if (i >= qualifyCount && !bracketSeed) continue; // Skip teams that don't qualify

        const apiName = apiTeam ? apiTeam.team_name : '(none)';
        const apiPts = apiTeam ? (apiTeam.points || 0) : 0;
        const bracketName = bracketSeed ? bracketSeed.name : '(none)';

        // Normalize names for comparison
        const normalize = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
        const match = bracketSeed && apiTeam && normalize(bracketName).includes(normalize(apiName).substring(0, 8));

        if (bracketSeed && apiTeam) {
          const mismatch = !match;
          if (mismatch) hasMismatch = true;
          console.log('  #' + (i + 1) + ': API=' + apiName + ' (' + apiPts + 'pts) | Bracket=' + bracketName + (mismatch ? '  *** MISMATCH ***' : '  ✓'));
        } else if (apiTeam && i < qualifyCount) {
          console.log('  #' + (i + 1) + ': API=' + apiName + ' (' + apiPts + 'pts) | Bracket=(missing)  *** MISSING ***');
        }
      }

      if (!hasMismatch) {
        console.log('  ✓ All seedings match');
      }
    });
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
