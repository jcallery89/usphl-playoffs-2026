import { getSchedule } from '../lib/timetoscore.js';

const games = await getSchedule(3); // Elite = league_id 3
console.log('Total Elite playoff games:', games.length);

games.sort((a, b) => new Date(a.date_played || a.date || 0) - new Date(b.date_played || b.date || 0));

// Atlantic teams from initial-seeds
const atlanticTeams = [
  'Wilkes-Barre', 'Hershey', 'Connecticut', 'Atlanta', 'Mad Hatters',
  'Scranton', 'Knights', 'Rangers', 'Junior Rangers'
];

const atlanticGames = games.filter(g => {
  const home = (g.home_team || '').toLowerCase();
  const away = (g.away_team || '').toLowerCase();
  return atlanticTeams.some(t => home.includes(t.toLowerCase()) || away.includes(t.toLowerCase()));
});

console.log('\n=== ELITE ATLANTIC DIVISION GAMES ===');
atlanticGames.forEach(g => {
  const date = g.date_played || g.date || 'no date';
  const time = g.game_time || '';
  const status = g.status || g.game_status || '';
  const score = (g.home_score != null && g.away_score != null) ? `${g.home_score}-${g.away_score}` : 'no score';
  console.log(`${date} ${time} | ${g.home_team} vs ${g.away_team} | ${score} | ${status} | id:${g.game_id || g.id}`);
});
