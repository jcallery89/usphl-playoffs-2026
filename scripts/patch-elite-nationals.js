/**
 * Patch Elite Nationals data into bracket state.
 * Run: node scripts/patch-elite-nationals.js
 */
import { kvGet, kvSet } from '../lib/cache.js';

const BRACKET_KEY = 'bracket-state';

async function main() {
  const state = await kvGet(BRACKET_KEY);
  if (!state) {
    console.error('No bracket state found in KV');
    process.exit(1);
  }

  state.Elite.Nationals = {
    format: 'pod_tournament',
    name: '2026 USPHL Elite Nationals',
    dates: 'March 25\u201329, 2026',
    location: 'Ice Vault, Wayne, NJ',
    formatInfo: 'Round-robin pod play leading to semifinals and championship. All games at Ice Vault, Wayne, NJ.',
    wildCards: [
      { label: 'Elite Wild Card', teamName: 'Montreal Knights', teamId: '2291', division: 'New England' },
    ],
    days: [
      {
        date: 'Wednesday, March 25',
        label: 'Pod Play',
        games: [
          { time: '9:30 AM', rink: 'Rink 3', home: 'Elite Wild Card', away: 'Elite Seed #1' },
          { time: '11:30 AM', rink: 'Rink 1', home: 'Elite Seed #5', away: 'Elite Seed #4' },
          { time: '11:45 AM', rink: 'Rink 2', home: 'Elite Seed #3', away: 'Elite Seed #2' },
        ],
      },
      {
        date: 'Thursday, March 26',
        label: 'Pod Play',
        games: [
          { time: '9:30 AM', rink: 'Rink 1', home: 'Elite Seed #5', away: 'Elite Seed #3' },
          { time: '9:45 AM', rink: 'Rink 2', home: 'Elite Seed #4', away: 'Elite Seed #1' },
          { time: '1:15 PM', rink: 'Rink 3', home: 'Elite Wild Card', away: 'Elite Seed #2' },
        ],
      },
      {
        date: 'Friday, March 27',
        label: 'Final Day of Pod Play',
        games: [
          { time: '9:00 AM', rink: 'Rink 2', home: 'Elite Seed #4', away: 'Elite Seed #2' },
          { time: '9:30 AM', rink: 'Rink 1', home: 'Elite Wild Card', away: 'Elite Seed #5' },
          { time: '9:45 AM', rink: 'Rink 3', home: 'Elite Seed #3', away: 'Elite Seed #1' },
        ],
      },
      {
        date: 'Saturday, March 28',
        label: 'Semifinals',
        games: [
          { time: '12:45 PM', rink: 'Rink 3', home: 'Elite Seed #4', away: 'Elite Seed #1', note: 'Semifinal #1' },
          { time: '1:00 PM', rink: 'Rink 2', home: 'Elite Seed #3', away: 'Elite Seed #2', note: 'Semifinal #2' },
        ],
      },
      {
        date: 'Sunday, March 29',
        label: 'USPHL Elite National Championship',
        games: [
          { time: '11:30 AM', rink: 'Rink 2', home: 'Elite Seed #2', away: 'Elite Seed #1', note: 'USPHL Elite National Championship Game' },
        ],
      },
    ],
    champion: null,
  };

  state._lastUpdated = new Date().toISOString();
  state._updatedBy = 'elite-nationals-patch';
  await kvSet(BRACKET_KEY, state);

  const totalGames = state.Elite.Nationals.days.reduce((sum, d) => sum + d.games.length, 0);
  console.log('Elite Nationals data patched successfully');
  console.log('Total games:', totalGames);
  console.log('Days:', state.Elite.Nationals.days.length);
}

main().catch(console.error);
