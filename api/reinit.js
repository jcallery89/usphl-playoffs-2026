import fs from 'fs';
import path from 'path';
import { kvSet, kvGet } from '../lib/cache.js';
import { initializeBracketState } from '../lib/bracket-engine.js';

export default async function handler(req, res) {
  // Secret token check — prevents accidental/unauthorized resets
  const token = req.query.token || req.headers['x-reinit-token'];
  if (token !== process.env.REINIT_TOKEN) {
    return res.status(401).json({ error: 'Invalid or missing token' });
  }

  try {
    const bracketConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'bracket-config.json'), 'utf8'));
    const initialSeeds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'initial-seeds.json'), 'utf8'));
    const teamMappings = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'team-mappings.json'), 'utf8'));

    const state = initializeBracketState(bracketConfig, initialSeeds, teamMappings);
    await kvSet('bracket-state', state);

    return res.status(200).json({ ok: true, message: 'Bracket state re-initialized from config' });
  } catch (err) {
    console.error('Reinit error:', err);
    return res.status(500).json({ error: 'Failed to reinitialize bracket state' });
  }
}
