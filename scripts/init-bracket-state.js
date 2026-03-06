/**
 * Initialize bracket state in Vercel KV from config + seeds + team mappings.
 * This is run once at deployment time, or to reset the bracket.
 *
 * Usage: node scripts/init-bracket-state.js
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars,
 * OR outputs to data/bracket-state-initial.json for manual upload.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeBracketState } from '../lib/bracket-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const bracketConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bracket-config.json'), 'utf8'));
const initialSeeds = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'initial-seeds.json'), 'utf8'));
const teamMappings = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'team-mappings.json'), 'utf8'));

const state = initializeBracketState(bracketConfig, initialSeeds, teamMappings);

// Always write to file for reference/backup
const outPath = path.join(ROOT, 'data', 'bracket-state-initial.json');
fs.writeFileSync(outPath, JSON.stringify(state, null, 2));
console.log(`Wrote initial bracket state to ${outPath}`);

// Summary
let totalMatchups = 0;
let totalRounds = 0;
for (const league of ['Premier', 'Elite', 'NCDC']) {
  for (const [div, divState] of Object.entries(state[league] || {})) {
    if (divState.rounds) {
      totalRounds += divState.rounds.length;
      for (const round of divState.rounds) {
        totalMatchups += round.matchups.length;
      }
    }
  }
}
console.log(`\nInitialized: ${totalRounds} rounds, ${totalMatchups} matchups across all leagues`);

// Try to push to Upstash if configured
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  await redis.set('bracket-state', state);
  console.log('Pushed bracket state to Upstash Redis');
} else {
  console.log('\nNo Upstash credentials found. Upload data/bracket-state-initial.json manually,');
  console.log('or set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.');
}
