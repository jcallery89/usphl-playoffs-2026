import { getSchedule } from '../lib/timetoscore.js';

const games = await getSchedule(2); // Premier = league_id 2
console.log('Total Premier playoff games:', games.length);

// Show all games sorted by date
games.sort((a, b) => new Date(a.date_played || a.date || 0) - new Date(b.date_played || b.date || 0));

// Find Atlantic teams
const atlanticTeams = [
  'West Chester', 'Red Bank', 'Connecticut', 'P.A.L.', 'Wilkes-Barre', 'Mercer', 'Rockets', 'Hershey'
];

const atlanticGames = games.filter(g => {
  const home = (g.home_team || '').toLowerCase();
  const away = (g.away_team || '').toLowerCase();
  return atlanticTeams.some(t => home.includes(t.toLowerCase()) || away.includes(t.toLowerCase()));
});

console.log('\n=== ATLANTIC DIVISION GAMES ===');
atlanticGames.forEach(g => {
  const date = g.date_played || g.date || 'no date';
  const time = g.game_time || '';
  const status = g.status || g.game_status || '';
  const score = (g.home_score != null && g.away_score != null) ? `${g.home_score}-${g.away_score}` : 'no score';
  console.log(`${date} ${time} | ${g.home_team} vs ${g.away_team} | ${score} | ${status} | id:${g.game_id || g.id}`);
});
