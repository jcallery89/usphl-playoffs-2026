/**
 * Patch Dineen Cup data in bracket state with corrected schedule info.
 * Run: node scripts/patch-dineen-cup.js
 */
import { kvGet, kvSet } from '../lib/cache.js';

const BRACKET_KEY = 'bracket-state';

async function main() {
  const state = await kvGet(BRACKET_KEY);
  if (!state) {
    console.error('No bracket state found in KV');
    process.exit(1);
  }

  const dc = state.NCDC?.['Dineen Cup'];
  if (!dc) {
    console.error('No Dineen Cup data found');
    process.exit(1);
  }

  // Update top-level info
  dc.name = 'Dineen Cup Championship';
  dc.dates = 'April 22–28, 2026';
  dc.location = 'Mountain America Center, Idaho Falls, ID';
  dc.timezone = 'MDT';
  dc.formatInfo = 'Double Elimination Format. All games played at Mountain America Center, Idaho Falls, ID. All times MDT.';
  dc.mountainNote = '* The Mountain Division representative in Game 1 will be either the Mountain Division Champion if the Spud Kings do not win the division championship, or the Mountain Division finalist if the host Spud Kings are the division champions.';

  // Updated schedule with corrected matchup labels and notes
  dc.schedule = [
    {
      game: 1,
      date: 'Apr 24',
      time: '2:00 PM',
      matchup: 'Atlantic Champion vs. Mountain*',
      note: '',
      homeScore: null,
      awayScore: null,
      winnerId: null,
      status: 'upcoming',
    },
    {
      game: 2,
      date: 'Apr 24',
      time: '7:00 PM',
      matchup: 'New England Champion vs. Idaho Falls Spud Kings',
      note: 'Host auto-bid',
      homeScore: null,
      awayScore: null,
      winnerId: null,
      status: 'upcoming',
    },
    {
      game: 3,
      date: 'Apr 25',
      time: '2:00 PM',
      matchup: '0-1 vs. 0-1',
      note: 'Elimination',
      homeScore: null,
      awayScore: null,
      winnerId: null,
      status: 'upcoming',
    },
    {
      game: 4,
      date: 'Apr 25',
      time: '7:00 PM',
      matchup: '1-0 vs. 1-0',
      note: 'Winner advances to Final',
      homeScore: null,
      awayScore: null,
      winnerId: null,
      status: 'upcoming',
    },
    {
      game: 5,
      date: 'Apr 26',
      time: '7:00 PM',
      matchup: '1-1 vs. 1-1',
      note: 'Elimination / Winner advances to Final',
      homeScore: null,
      awayScore: null,
      winnerId: null,
      status: 'upcoming',
    },
    {
      game: 6,
      date: 'Apr 27',
      time: '7:00 PM',
      matchup: '2-1 vs. 2-0',
      note: 'Final #1',
      homeScore: null,
      awayScore: null,
      winnerId: null,
      status: 'upcoming',
    },
    {
      game: 7,
      date: 'Apr 28',
      time: '7:00 PM',
      matchup: '3-1 vs. 2-1',
      note: 'Final #2, if necessary',
      homeScore: null,
      awayScore: null,
      winnerId: null,
      status: 'upcoming',
    },
  ];

  state._lastUpdated = new Date().toISOString();
  state._updatedBy = 'dineen-cup-patch';
  await kvSet(BRACKET_KEY, state);

  console.log('Dineen Cup data patched successfully');
  console.log('Schedule games:', dc.schedule.length);
  console.log('Location:', dc.location);
}

main().catch(console.error);
