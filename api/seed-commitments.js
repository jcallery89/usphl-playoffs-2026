/**
 * One-time migration endpoint: seeds Redis from existing JSON files.
 * Protected by REINIT_TOKEN.
 *
 * POST /api/seed-commitments?token=<REINIT_TOKEN>
 */
import { kvSet } from '../lib/cache.js';
import { readFileSync } from 'fs';
import { join } from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Token verification — check REINIT_TOKEN or ADMIN_PASSWORD as fallback
  const token = req.query.token;
  const expected = process.env.REINIT_TOKEN || process.env.ADMIN_PASSWORD;
  if (!token || !expected || token !== expected) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  try {
    const baseDir = process.cwd();

    // Read enriched commitments
    const enrichedPath = join(baseDir, 'commitments', 'data', 'commitments-enriched.json');
    const enriched = JSON.parse(readFileSync(enrichedPath, 'utf8'));

    // Convert enriched records to flat format
    const flatCommitments = enriched.commitments.map((c, i) => ({
      id: `c_${String(i + 1).padStart(3, '0')}`,
      firstName: c.firstName,
      lastName: c.lastName,
      hometown: c.hometown,
      teamName: c.team.name,
      playerId: c.player.playerId || null,
      collegeName: c.college.name,
      collegeLevel: c.college.level,
      storyUrl: c.storyUrl || null,
    }));

    const now = new Date().toISOString();

    const draftData = {
      _lastUpdated: now,
      _updatedBy: 'seed',
      season: enriched.season || '2025-26',
      league: enriched.league || 'NCDC',
      commitments: flatCommitments,
    };

    // Write to both draft and published
    await kvSet('commitments-draft', draftData);
    await kvSet('commitments-published', { ...draftData, _updatedBy: 'seed-publish' });

    // Read and write college mappings
    const collegePath = join(baseDir, 'commitments', 'data', 'college-mappings.json');
    const collegeMappings = JSON.parse(readFileSync(collegePath, 'utf8'));

    await kvSet('college-mappings', {
      _lastUpdated: now,
      colleges: collegeMappings,
    });

    return res.status(200).json({
      ok: true,
      message: 'Seeded successfully',
      commitments: flatCommitments.length,
      colleges: Object.keys(collegeMappings).length,
    });
  } catch (err) {
    console.error('Seed commitments error:', err);
    return res.status(500).json({ error: err.message });
  }
}
