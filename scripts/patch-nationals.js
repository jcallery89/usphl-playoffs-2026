/**
 * Patch Premier Nationals data into bracket state.
 * Run: node scripts/patch-nationals.js
 */
import { kvGet, kvSet } from '../lib/cache.js';

const BRACKET_KEY = 'bracket-state';

async function main() {
  const state = await kvGet(BRACKET_KEY);
  if (!state) {
    console.error('No bracket state found in KV');
    process.exit(1);
  }

  state.Premier.Nationals = {
    format: 'pod_tournament',
    name: '2026 USPHL Premier Nationals',
    dates: 'March 25\u201329, 2026',
    location: 'Ice Vault, Wayne, NJ',
    formatInfo: 'Pod play round-robin leading to semifinals and championship. All games at Ice Vault, Wayne, NJ.',
    pods: {
      'Pool A': {
        teams: ['Vernal Oilers', 'Minnesota Squatch', 'West Chester Wolves', 'Hawkesbury Knights'],
      },
      'Pool B': {
        teams: ['Hampton Roads Whalers', 'Ontario Jr Reign', 'Coral Springs Jr. Cats', 'Fresno Monsters'],
      },
      'Pool C': {
        teams: ['Metro Jets', 'Northern Cyclones', 'Fort Wayne Spacemen', 'Toledo Cherokee'],
      },
    },
    days: [
      {
        date: 'Wednesday, March 25',
        label: 'Pod Play',
        games: [
          { time: '2:30 PM', rink: 'Rink 1', home: 'Fort Wayne Spacemen', away: 'Northern Cyclones', pod: 'Pool C' },
          { time: '2:45 PM', rink: 'Rink 2', home: 'Toledo Cherokee', away: 'Metro Jets', pod: 'Pool C' },
          { time: '3:00 PM', rink: 'Rink 3', home: 'Coral Springs Jr. Cats', away: 'Ontario Jr Reign', pod: 'Pool B' },
          { time: '5:30 PM', rink: 'Rink 1', home: 'Fresno Monsters', away: 'Hampton Roads Whalers', pod: 'Pool B' },
          { time: '5:45 PM', rink: 'Rink 2', home: 'West Chester Wolves', away: 'Minnesota Squatch', pod: 'Pool A' },
          { time: '6:00 PM', rink: 'Rink 3', home: 'Hawkesbury Knights', away: 'Vernal Oilers', pod: 'Pool A' },
        ],
      },
      {
        date: 'Thursday, March 26',
        label: 'Pod Play',
        games: [
          { time: '12:30 PM', rink: 'Rink 1', home: 'Coral Springs Jr. Cats', away: 'Hampton Roads Whalers', pod: 'Pool B' },
          { time: '12:45 PM', rink: 'Rink 2', home: 'Fresno Monsters', away: 'Ontario Jr Reign', pod: 'Pool B' },
          { time: '3:30 PM', rink: 'Rink 1', home: 'Hawkesbury Knights', away: 'Minnesota Squatch', pod: 'Pool A' },
          { time: '3:45 PM', rink: 'Rink 3', home: 'West Chester Wolves', away: 'Vernal Oilers', pod: 'Pool A' },
          { time: '3:45 PM', rink: 'Rink 2', home: 'Toledo Cherokee', away: 'Northern Cyclones', pod: 'Pool C' },
          { time: '6:45 PM', rink: 'Rink 2', home: 'Fort Wayne Spacemen', away: 'Metro Jets', pod: 'Pool C' },
        ],
      },
      {
        date: 'Friday, March 27',
        label: 'Final Day of Pod Play',
        games: [
          { time: '12:00 PM', rink: 'Rink 2', home: 'Minnesota Squatch', away: 'Vernal Oilers', pod: 'Pool A' },
          { time: '12:30 PM', rink: 'Rink 1', home: 'Hawkesbury Knights', away: 'West Chester Wolves', pod: 'Pool A' },
          { time: '12:45 PM', rink: 'Rink 3', home: 'Toledo Cherokee', away: 'Fort Wayne Spacemen', pod: 'Pool C' },
          { time: '3:00 PM', rink: 'Rink 2', home: 'Ontario Jr Reign', away: 'Hampton Roads Whalers', pod: 'Pool B' },
          { time: '3:45 PM', rink: 'Rink 3', home: 'Fresno Monsters', away: 'Coral Springs Jr. Cats', pod: 'Pool B' },
          { time: '6:00 PM', rink: 'Rink 2', home: 'Northern Cyclones', away: 'Metro Jets', pod: 'Pool C' },
        ],
      },
      {
        date: 'Saturday, March 28',
        label: 'Semifinals',
        games: [
          { time: '3:45 PM', rink: 'Rink 3', home: 'Pool B Winner', away: 'Pool C Winner', note: 'Semifinal #1' },
          { time: '4:00 PM', rink: 'Rink 2', home: 'Pool A Winner', away: 'Best 2nd Place', note: 'Semifinal #2' },
        ],
      },
      {
        date: 'Sunday, March 29',
        label: 'USPHL Premier National Championship',
        games: [
          { time: '12:45 PM', rink: 'Rink 3', home: 'Semifinal Winner', away: 'Semifinal Winner', note: 'USPHL Premier National Championship Game' },
        ],
      },
    ],
    champion: null,
  };

  state._lastUpdated = new Date().toISOString();
  state._updatedBy = 'nationals-patch';
  await kvSet(BRACKET_KEY, state);

  const totalGames = state.Premier.Nationals.days.reduce((sum, d) => sum + d.games.length, 0);
  console.log('Premier Nationals data patched successfully');
  console.log('Total games:', totalGames);
  console.log('Days:', state.Premier.Nationals.days.length);
  console.log('Pods:', Object.keys(state.Premier.Nationals.pods).length);
}

main().catch(console.error);
