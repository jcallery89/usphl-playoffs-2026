const res = await fetch('https://usphl-playoffs-2026.vercel.app/api/bracket-state');
const state = await res.json();
const ea = state.Elite?.Atlantic;
if (!ea) { console.log('No Elite Atlantic found'); process.exit(0); }
for (const round of ea.rounds) {
  console.log('\n=== ' + round.roundName + ' (format: ' + round.format + ') ===');
  if (round.byes?.length) {
    round.byes.forEach(b => console.log('  BYE: #' + b.seed + ' ' + b.teamName + ' (' + b.teamId + ')'));
  }
  for (const m of round.matchups) {
    console.log('  ' + m.matchupId + ': #' + m.homeSeed + ' ' + m.homeTeamName + ' (' + m.homeTeamId + ') vs #' + m.awaySeed + ' ' + m.awayTeamName + ' (' + m.awayTeamId + ') | ' + m.homeWins + '-' + m.awayWins + ' | ' + m.status + (m.winnerName ? ' | Winner: ' + m.winnerName : ''));
  }
}
