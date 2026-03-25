const res = await fetch('https://usphl-playoffs-2026.vercel.app/api/bracket-state');
const state = await res.json();
const nw = state.Premier?.Northwest;
if (!nw) { console.log('No Premier Northwest found'); process.exit(0); }
for (const round of nw.rounds) {
  console.log('\n=== ' + round.roundName + ' (format: ' + round.format + ') ===');
  for (const m of round.matchups) {
    const winner = m.winnerName ? ' → ' + m.winnerName : '';
    console.log('  ' + m.matchupId + ': #' + m.homeSeed + ' ' + m.homeTeamName + ' (' + m.homeTeamId + ') vs #' + m.awaySeed + ' ' + m.awayTeamName + ' (' + m.awayTeamId + ') | ' + m.homeWins + '-' + m.awayWins + ' | ' + m.status + winner);
  }
}
