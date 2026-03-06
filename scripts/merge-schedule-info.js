/**
 * Merge schedule-info.json into the existing bracket state in Redis.
 * This only adds/updates formatInfo and round-level scheduleInfo/scheduleNote
 * fields — it does NOT touch matchups, teams, scores, or any other state.
 *
 * Usage: node scripts/merge-schedule-info.js
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const scheduleInfo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'schedule-info.json'), 'utf8'));

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env vars.');
  process.exit(1);
}

const { Redis } = await import('@upstash/redis');
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Fetch current bracket state
const state = await redis.get('bracket-state');
if (!state) {
  console.error('No bracket-state found in Redis. Run init-bracket-state.js first.');
  process.exit(1);
}

let patchCount = 0;

// Merge schedule info into state
for (const [league, divisions] of Object.entries(scheduleInfo)) {
  for (const [division, info] of Object.entries(divisions)) {
    if (!state[league] || !state[league][division]) {
      console.warn(`Skipping ${league}/${division} — not found in bracket state`);
      continue;
    }

    const divState = state[league][division];

    // Set division-level format info
    if (info.formatInfo) {
      divState.formatInfo = info.formatInfo;
      patchCount++;
    }

    // Set round-level schedule info
    if (info.rounds && divState.rounds) {
      for (const [roundName, roundInfo] of Object.entries(info.rounds)) {
        const round = divState.rounds.find(r => r.roundName === roundName);
        if (round) {
          if (roundInfo.scheduleInfo) {
            round.scheduleInfo = roundInfo.scheduleInfo;
            patchCount++;
          }
          if (roundInfo.scheduleNote) {
            round.scheduleNote = roundInfo.scheduleNote;
            patchCount++;
          }
        } else {
          console.warn(`Round "${roundName}" not found in ${league}/${division} (available: ${divState.rounds.map(r => r.roundName).join(', ')})`);
        }
      }
    }
  }
}

// Save back
state._lastUpdated = new Date().toISOString();
state._updatedBy = 'schedule-merge';
await redis.set('bracket-state', state);

// Also update local file
const outPath = path.join(ROOT, 'data', 'bracket-state-initial.json');
fs.writeFileSync(outPath, JSON.stringify(state, null, 2));

console.log(`Merged ${patchCount} schedule fields into bracket state.`);
console.log('Pushed updated state to Redis and wrote to data/bracket-state-initial.json');
