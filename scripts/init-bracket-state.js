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

// Try to push to Upstash if configured (accept both env var naming conventions)
const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (kvUrl && kvToken) {
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url: kvUrl, token: kvToken });
  await redis.set('bracket-state', state);
  console.log('Pushed bracket state to Upstash Redis');
} else {
  console.log('\nNo Upstash credentials found. Upload data/bracket-state-initial.json manually,');
  console.log('or set KV_REST_API_URL/KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN) env vars.');
}
