import { getSchedule } from '../lib/timetoscore.js';

const games = await getSchedule(3); // Elite = league_id 3
console.log('Total Elite playoff games:', games.length);

games.sort((a, b) => new Date(a.date_played || a.date || 0) - new Date(b.date_played || b.date || 0));

// Show ALL games with team IDs
console.log('\n=== ALL ELITE PLAYOFF GAMES ===');
games.forEach(g => {
  const date = g.date_played || g.date || 'no date';
  const status = g.status || g.game_status || '';
  const homeId = g.home_id || g.home_team_id || '?';
  const awayId = g.away_id || g.away_team_id || '?';
  console.log(`${date} | ${g.home_team} (${homeId}) vs ${g.away_team} (${awayId}) | ${status} | id:${g.game_id || g.id}`);
});

// Also look for team 1403 (Connecticut) and 1396 (Atlanta)
console.log('\n=== Games involving Connecticut (1403) or Atlanta (1396) ===');
const filtered = games.filter(g => {
  const hid = String(g.home_id || g.home_team_id || '');
  const aid = String(g.away_id || g.away_team_id || '');
  return ['1403','1396'].includes(hid) || ['1403','1396'].includes(aid);
});
filtered.forEach(g => {
  const date = g.date_played || g.date || 'no date';
  const status = g.status || g.game_status || '';
  console.log(`${date} | ${g.home_team} (${g.home_id}) vs ${g.away_team} (${g.away_id}) | ${status}`);
});
if (!filtered.length) console.log('  (none found)');
