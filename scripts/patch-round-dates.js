/**
 * Patch round dates into bracket state from schedule-info.json.
 * Adds a roundDate field to each round for display in the bracket view.
 * Run: node scripts/patch-round-dates.js
 */
import { kvGet, kvSet } from '../lib/cache.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BRACKET_KEY = 'bracket-state';

// Extract a short date string from scheduleInfo text
// e.g. "Tampa\nSat., Mar 14 — 10:00 AM..." => "Starting March 14"
// e.g. "Mar 24-26" => "March 24–26"
// e.g. "Mar 30 - Apr 7" => "March 30 – April 7"
function extractDate(scheduleInfo) {
  if (!scheduleInfo) return null;

  // Try "Mon, Mar 12" or "Thu., Mar 12" pattern (first date found)
  const dayMatch = scheduleInfo.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[.,]*\s*(Mar|Apr|May)\s*(\d{1,2})/);
  if (dayMatch) {
    const month = dayMatch[1] === 'Mar' ? 'March' : dayMatch[1] === 'Apr' ? 'April' : dayMatch[1];
    return `Starting ${month} ${dayMatch[2]}`;
  }

  // Try "Mar 24-26" or "Mar 30 - Apr 7" pattern
  const rangeMatch = scheduleInfo.match(/(Mar|Apr)\s*(\d{1,2})\s*[-–]\s*(?:(Mar|Apr)\s*)?(\d{1,2})/);
  if (rangeMatch) {
    const m1 = rangeMatch[1] === 'Mar' ? 'March' : 'April';
    const d1 = rangeMatch[2];
    const m2raw = rangeMatch[3];
    const d2 = rangeMatch[4];
    if (m2raw) {
      const m2 = m2raw === 'Mar' ? 'March' : 'April';
      return `${m1} ${d1} – ${m2} ${d2}`;
    }
    return `${m1} ${d1}–${d2}`;
  }

  return null;
}

async function main() {
  const state = await kvGet(BRACKET_KEY);
  if (!state) {
    console.error('No bracket state found in KV');
    process.exit(1);
  }

  const scheduleInfo = JSON.parse(
    readFileSync(join(__dirname, '..', 'data', 'schedule-info.json'), 'utf-8')
  );

  let updated = 0;

  for (const league of ['Premier', 'Elite', 'NCDC']) {
    const leagueSched = scheduleInfo[league] || {};
    const leagueState = state[league] || {};

    for (const [division, divSched] of Object.entries(leagueSched)) {
      const divState = leagueState[division];
      if (!divState || !divState.rounds) continue;

      const roundsSched = divSched.rounds || {};

      for (const round of divState.rounds) {
        const roundName = round.roundName;
        const schedData = roundsSched[roundName];

        if (schedData && schedData.scheduleInfo) {
          const dateStr = extractDate(schedData.scheduleInfo);
          if (dateStr) {
            round.roundDate = dateStr;
            updated++;
            console.log(`  ${league} > ${division} > ${roundName}: "${dateStr}"`);
          }
        }
      }
    }
  }

  // Also add general Premier/Elite round dates for divisions without specific schedule info
  // Based on typical USPHL 2025-26 playoff timing
  const generalDates = {
    Premier: {
      'Round 1': 'Starting March 7',
      'Round 2': 'Starting March 14',
      'Championship': 'Starting March 21',
      'Semifinals': 'Starting March 7',
    },
    Elite: {
      'Round 1': 'Starting March 7',
      'Round 2': 'Starting March 14',
      'Championship': 'Starting March 21',
      'Semifinals': 'Starting March 7',
    },
  };

  for (const league of ['Premier', 'Elite']) {
    const leagueState = state[league] || {};
    const dates = generalDates[league];

    for (const [division, divState] of Object.entries(leagueState)) {
      if (!divState.rounds) continue;
      if (division === 'Nationals') continue; // Nationals has its own schedule

      for (const round of divState.rounds) {
        if (round.roundDate) continue; // Already set from schedule-info
        const dateStr = dates[round.roundName];
        if (dateStr) {
          round.roundDate = dateStr;
          updated++;
          console.log(`  ${league} > ${division} > ${round.roundName}: "${dateStr}" (general)`);
        }
      }
    }
  }

  state._lastUpdated = new Date().toISOString();
  state._updatedBy = 'round-dates-patch';
  await kvSet(BRACKET_KEY, state);

  console.log(`\nRound dates patched: ${updated} rounds updated`);
}

main().catch(console.error);
