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
      'Pod 1': {
        teams: ['Premier Seed #1', 'Premier Seed #6', 'Premier Seed #7', 'Premier Seed #10'],
      },
      'Pod 2': {
        teams: ['Premier Seed #2', 'Premier Seed #5', 'Premier Seed #8', 'Premier Wild Card #1'],
      },
      'Pod 3': {
        teams: ['Premier Seed #3', 'Premier Seed #4', 'Premier Seed #9', 'Premier Wild Card #2'],
      },
    },
    days: [
      {
        date: 'Wednesday, March 25',
        label: 'Pod Play',
        games: [
          { time: '2:30 PM', rink: 'Rink 1', home: 'Premier Seed #9', away: 'Premier Seed #4', pod: 'Pod 3' },
          { time: '2:45 PM', rink: 'Rink 2', home: 'Premier Wild Card #2', away: 'Premier Seed #3', pod: 'Pod 3' },
          { time: '3:00 PM', rink: 'Rink 3', home: 'Premier Seed #8', away: 'Premier Seed #5', pod: 'Pod 2' },
          { time: '5:30 PM', rink: 'Rink 1', home: 'Premier Wild Card #1', away: 'Premier Seed #2', pod: 'Pod 2' },
          { time: '5:45 PM', rink: 'Rink 2', home: 'Premier Seed #7', away: 'Premier Seed #6', pod: 'Pod 1' },
          { time: '6:00 PM', rink: 'Rink 3', home: 'Premier Seed #10', away: 'Premier Seed #1', pod: 'Pod 1' },
        ],
      },
      {
        date: 'Thursday, March 26',
        label: 'Pod Play',
        games: [
          { time: '12:30 PM', rink: 'Rink 1', home: 'Premier Seed #8', away: 'Premier Seed #2', pod: 'Pod 2' },
          { time: '12:45 PM', rink: 'Rink 2', home: 'Premier Wild Card #1', away: 'Premier Seed #5', pod: 'Pod 2' },
          { time: '3:30 PM', rink: 'Rink 1', home: 'Premier Seed #10', away: 'Premier Seed #6', pod: 'Pod 1' },
          { time: '3:45 PM', rink: 'Rink 3', home: 'Premier Seed #7', away: 'Premier Seed #1', pod: 'Pod 1' },
          { time: '3:45 PM', rink: 'Rink 2', home: 'Premier Wild Card #2', away: 'Premier Seed #4', pod: 'Pod 3' },
          { time: '6:45 PM', rink: 'Rink 2', home: 'Premier Seed #9', away: 'Premier Seed #3', pod: 'Pod 3' },
        ],
      },
      {
        date: 'Friday, March 27',
        label: 'Final Day of Pod Play',
        games: [
          { time: '12:00 PM', rink: 'Rink 2', home: 'Premier Seed #6', away: 'Premier Seed #1', pod: 'Pod 1' },
          { time: '12:30 PM', rink: 'Rink 1', home: 'Premier Seed #10', away: 'Premier Seed #7', pod: 'Pod 1' },
          { time: '12:45 PM', rink: 'Rink 3', home: 'Premier Wild Card #2', away: 'Premier Seed #9', pod: 'Pod 3' },
          { time: '3:00 PM', rink: 'Rink 2', home: 'Premier Seed #5', away: 'Premier Seed #2', pod: 'Pod 2' },
          { time: '3:45 PM', rink: 'Rink 3', home: 'Premier Wild Card #1', away: 'Premier Seed #8', pod: 'Pod 2' },
          { time: '6:00 PM', rink: 'Rink 2', home: 'Premier Seed #4', away: 'Premier Seed #3', pod: 'Pod 3' },
        ],
      },
      {
        date: 'Saturday, March 28',
        label: 'Semifinals',
        games: [
          { time: '3:45 PM', rink: 'Rink 3', home: 'Premier Seed #2', away: 'Premier Seed #3', note: 'Semifinal #1' },
          { time: '4:00 PM', rink: 'Rink 2', home: 'Premier Seed #1', away: 'Premier Seed #4', note: 'Semifinal #2' },
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
