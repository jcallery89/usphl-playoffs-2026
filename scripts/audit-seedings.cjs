// Audit all Premier and Elite seedings from bracket state
const data = JSON.parse(require('fs').readFileSync('bracket-state-dump.json', 'utf8'));

['Elite', 'Premier'].forEach(league => {
  console.log('\n========== ' + league.toUpperCase() + ' ==========');
  const divisions = data[league] || {};
  Object.keys(divisions).sort().forEach(div => {
    const divData = divisions[div];
    const rounds = divData.rounds || [];
    if (rounds.length === 0) return;

    console.log('\n--- ' + div + ' ---');

    const r0 = rounds[0];
    const seeded = [];

    // Byes in round 0
    if (r0.byes) {
      r0.byes.forEach(b => {
        seeded.push({ seed: b.seed, name: b.teamName || b.name || '?' });
      });
    }

    // Matchups in round 0
    if (r0.matchups) {
      r0.matchups.forEach(m => {
        if (m.homeSeed) {
          seeded.push({ seed: m.homeSeed, name: m.homeTeamName || 'TBD' });
        } else if (m.home && m.home.seed) {
          seeded.push({ seed: m.home.seed, name: m.home.name || 'TBD' });
        }
        if (m.awaySeed) {
          seeded.push({ seed: m.awaySeed, name: m.awayTeamName || 'TBD' });
        } else if (m.away && m.away.seed) {
          seeded.push({ seed: m.away.seed, name: m.away.name || 'TBD' });
        }
      });
    }

    // Also check round 1 for seeds not in round 0 (e.g., byes that only appear in later rounds)
    if (rounds.length > 1) {
      const r1 = rounds[1];
      if (r1.matchups) {
        r1.matchups.forEach(m => {
          if (m.homeSeed) {
            const exists = seeded.find(s => s.seed === m.homeSeed);
            if (!exists) seeded.push({ seed: m.homeSeed, name: m.homeTeamName || 'TBD', fromR1: true });
          }
          if (m.awaySeed) {
            const exists = seeded.find(s => s.seed === m.awaySeed);
            if (!exists) seeded.push({ seed: m.awaySeed, name: m.awayTeamName || 'TBD', fromR1: true });
          }
        });
      }
    }

    seeded.sort((a, b) => a.seed - b.seed);
    seeded.forEach(s => {
      console.log('  #' + s.seed + ' ' + s.name + (s.fromR1 ? ' (from R1)' : ''));
    });
  });
});
