/**
 * Scan ALL divisions across Premier, Elite, NCDC for:
 * 1. Completed rounds that haven't advanced winners to the next round
 * 2. Play-in games where a single game was played but series not marked complete
 * 3. Any round where all matchups are done but next round has TBD/null teams
 */

const BASE_URL = 'https://usphl-playoffs-2026.vercel.app';

const res = await fetch(`${BASE_URL}/api/bracket-state`);
const state = await res.json();

const issues = [];

for (const league of ['Premier', 'Elite', 'NCDC']) {
  const leagueState = state[league] || {};

  for (const [division, divState] of Object.entries(leagueState)) {
    if (division === 'Dineen Cup' || division === 'NE Conference') continue;
    if (!divState.rounds) continue;

    for (let ri = 0; ri < divState.rounds.length; ri++) {
      const round = divState.rounds[ri];
      const nextRound = divState.rounds[ri + 1];

      // Check each matchup status
      for (const m of round.matchups) {
        const hasTeams = m.homeTeamId && m.awayTeamId;
        const isComplete = m.status === 'complete' && m.winnerId;
        const hasGames = m.games && m.games.length > 0;
        const totalWins = (m.homeWins || 0) + (m.awayWins || 0);

        // Flag: has games played but not marked complete
        if (hasGames && totalWins > 0 && !isComplete) {
          issues.push({
            league, division,
            round: round.roundName,
            matchup: m.matchupId,
            issue: `Has ${m.homeWins}-${m.awayWins} wins but status=${m.status}`,
            detail: `${m.homeTeamName} vs ${m.awayTeamName}`,
            format: round.format
          });
        }

        // Flag: no teams assigned yet (TBD)
        if (!hasTeams && ri > 0) {
          // Check if previous round is all complete
          const prevRound = divState.rounds[ri - 1];
          const prevAllComplete = prevRound.matchups.length > 0 &&
            prevRound.matchups.every(pm => pm.status === 'complete' && pm.winnerId);
          if (prevAllComplete) {
            issues.push({
              league, division,
              round: round.roundName,
              matchup: m.matchupId,
              issue: 'Previous round complete but this matchup has no teams',
              detail: `${m.homeTeamName} vs ${m.awayTeamName}`,
              format: round.format
            });
          }
        }
      }

      // Check: all matchups complete but next round has empty slots
      if (nextRound) {
        const allComplete = round.matchups.length > 0 &&
          round.matchups.every(m => m.status === 'complete' && m.winnerId);
        const nextHasEmpty = nextRound.matchups.some(m => !m.homeTeamId || !m.awayTeamId);

        if (allComplete && nextHasEmpty) {
          issues.push({
            league, division,
            round: round.roundName,
            matchup: 'ALL',
            issue: `Round complete but next round (${nextRound.roundName}) has empty slots`,
            detail: `Winners: ${round.matchups.map(m => m.winnerName).join(', ')}`,
            format: round.format
          });
        }
      }
    }

    // Print full state summary for each division
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${league} > ${division}`);
    console.log(`${'='.repeat(60)}`);
    for (const round of divState.rounds) {
      console.log(`\n  ${round.roundName} (${round.format}):`);
      if (round.byes?.length) {
        round.byes.forEach(b => console.log(`    BYE: #${b.seed} ${b.teamName}`));
      }
      for (const m of round.matchups) {
        const winner = m.winnerName ? ` → ${m.winnerName}` : '';
        const teams = `#${m.homeSeed || '?'} ${m.homeTeamName} vs #${m.awaySeed || '?'} ${m.awayTeamName}`;
        console.log(`    ${m.matchupId}: ${teams} | ${m.homeWins}-${m.awayWins} | ${m.status}${winner}`);
      }
    }
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`ISSUES FOUND: ${issues.length}`);
console.log(`${'='.repeat(60)}`);
for (const issue of issues) {
  console.log(`\n  [${issue.league} > ${issue.division}] ${issue.round} / ${issue.matchup}`);
  console.log(`    Issue: ${issue.issue}`);
  console.log(`    Detail: ${issue.detail}`);
  console.log(`    Format: ${issue.format}`);
}
