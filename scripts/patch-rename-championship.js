/**
 * Rename "Championship" rounds to "Divisional Championship" in the live bracket state.
 * Run: node scripts/patch-rename-championship.js
 */
import { kvGet, kvSet } from '../lib/cache.js';

const BRACKET_KEY = 'bracket-state';

async function main() {
  const state = await kvGet(BRACKET_KEY);
  if (!state) {
    console.error('No bracket state found in KV');
    process.exit(1);
  }

  let updated = 0;

  for (const league of ['Premier', 'Elite']) {
    const leagueState = state[league] || {};
    for (const [division, divState] of Object.entries(leagueState)) {
      if (!divState.rounds) continue;
      for (const round of divState.rounds) {
        if (round.roundName === 'Championship') {
          console.log(`  ${league} > ${division}: "Championship" → "Divisional Championship"`);
          round.roundName = 'Divisional Championship';
          updated++;
        }
      }
    }
  }

  if (updated === 0) {
    console.log('No Championship rounds found to rename.');
    return;
  }

  state._lastUpdated = new Date().toISOString();
  state._updatedBy = 'rename-championship-patch';
  await kvSet(BRACKET_KEY, state);
  console.log(`\nRenamed ${updated} rounds in live bracket state.`);
}

main().catch(console.error);
