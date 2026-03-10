/**
 * Authenticated admin endpoint for college commitments.
 * GET: returns draft + metadata
 * POST: handles add/update/delete/publish/update-college/delete-college actions
 */
import { kvGet, kvSet } from '../lib/cache.js';
import { getTeamNames } from '../lib/enrich-commitments.js';
import { readFileSync } from 'fs';
import { join } from 'path';

let teamMappingsCache = null;

function getTeamMappings() {
  if (!teamMappingsCache) {
    const filePath = join(process.cwd(), 'data', 'team-mappings.json');
    teamMappingsCache = JSON.parse(readFileSync(filePath, 'utf8'));
  }
  return teamMappingsCache;
}

async function verifyAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return false;
  const session = await kvGet(`admin-token:${token}`);
  return session && session.expires > Date.now();
}

function generateId(commitments) {
  let maxNum = 0;
  for (const c of commitments) {
    const match = (c.id || '').match(/^c_(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `c_${String(maxNum + 1).padStart(3, '0')}`;
}

function mhrLogoUrl(mhrId) {
  if (!mhrId) return null;
  return `https://ranktech-cdn.s3.us-east-2.amazonaws.com/myhockey_prod/logos/${mhrId}_a.png`;
}

export default async function handler(req, res) {
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res) {
  try {
    const [draft, published, collegeMappingsData] = await Promise.all([
      kvGet('commitments-draft'),
      kvGet('commitments-published'),
      kvGet('college-mappings'),
    ]);

    const teamMappings = getTeamMappings();
    const teamNames = getTeamNames(teamMappings);
    const collegeMappings = collegeMappingsData ? (collegeMappingsData.colleges || collegeMappingsData) : {};

    // Determine if draft differs from published
    const draftUpdated = draft ? draft._lastUpdated : null;
    const pubUpdated = published ? published._lastUpdated : null;
    const isDirty = draftUpdated !== pubUpdated;

    return res.status(200).json({
      draft: draft || { commitments: [], season: '2025-26', league: 'NCDC' },
      published: published ? {
        _lastUpdated: published._lastUpdated,
        count: (published.commitments || []).length,
      } : null,
      collegeMappings,
      teamNames,
      isDirty,
    });
  } catch (err) {
    console.error('Commitments admin GET error:', err);
    return res.status(500).json({ error: 'Failed to load admin data' });
  }
}

async function handlePost(req, res) {
  try {
    const { action } = req.body || {};

    switch (action) {
      case 'add': return handleAdd(req, res);
      case 'update': return handleUpdate(req, res);
      case 'delete': return handleDelete(req, res);
      case 'publish': return handlePublish(req, res);
      case 'update-college': return handleUpdateCollege(req, res);
      case 'delete-college': return handleDeleteCollege(req, res);
      case 'bulk-update-college-level': return handleBulkUpdateCollegeLevel(req, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('Commitments admin POST error:', err);
    return res.status(500).json({ error: 'Failed to process request' });
  }
}

async function getDraft() {
  const draft = await kvGet('commitments-draft');
  return draft || { season: '2025-26', league: 'NCDC', commitments: [] };
}

async function saveDraft(draft) {
  draft._lastUpdated = new Date().toISOString();
  draft._updatedBy = 'admin';
  await kvSet('commitments-draft', draft);
  return draft;
}

async function handleAdd(req, res) {
  const { commitment } = req.body;
  if (!commitment || !commitment.firstName || !commitment.lastName) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }

  const draft = await getDraft();
  const id = generateId(draft.commitments);

  draft.commitments.push({
    id,
    firstName: (commitment.firstName || '').trim(),
    lastName: (commitment.lastName || '').trim(),
    hometown: (commitment.hometown || '').trim(),
    teamName: (commitment.teamName || '').trim(),
    playerId: (commitment.playerId || '').trim() || null,
    collegeName: (commitment.collegeName || '').trim(),
    collegeLevel: (commitment.collegeLevel || '').trim(),
    storyUrl: (commitment.storyUrl || '').trim() || null,
  });

  const saved = await saveDraft(draft);
  return res.status(200).json({ ok: true, message: 'Commitment added', id, draft: saved });
}

async function handleUpdate(req, res) {
  const { id, fields } = req.body;
  if (!id || !fields) {
    return res.status(400).json({ error: 'id and fields are required' });
  }

  const draft = await getDraft();
  const idx = draft.commitments.findIndex(c => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: `Commitment ${id} not found` });
  }

  // Merge fields
  const allowed = ['firstName', 'lastName', 'hometown', 'teamName', 'playerId', 'collegeName', 'collegeLevel', 'storyUrl'];
  for (const key of allowed) {
    if (key in fields) {
      draft.commitments[idx][key] = typeof fields[key] === 'string' ? fields[key].trim() : fields[key];
    }
  }

  // Normalize nulls for optional fields
  if (draft.commitments[idx].playerId === '') draft.commitments[idx].playerId = null;
  if (draft.commitments[idx].storyUrl === '') draft.commitments[idx].storyUrl = null;

  const saved = await saveDraft(draft);
  return res.status(200).json({ ok: true, message: 'Commitment updated', draft: saved });
}

async function handleDelete(req, res) {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  const draft = await getDraft();
  const before = draft.commitments.length;
  draft.commitments = draft.commitments.filter(c => c.id !== id);

  if (draft.commitments.length === before) {
    return res.status(404).json({ error: `Commitment ${id} not found` });
  }

  const saved = await saveDraft(draft);
  return res.status(200).json({ ok: true, message: 'Commitment deleted', draft: saved });
}

async function handlePublish(req, res) {
  const draft = await getDraft();

  const published = {
    ...draft,
    _lastUpdated: new Date().toISOString(),
    _updatedBy: 'admin-publish',
  };

  await kvSet('commitments-published', published);

  // Update draft timestamp to match so isDirty becomes false
  draft._lastUpdated = published._lastUpdated;
  await kvSet('commitments-draft', draft);

  return res.status(200).json({
    ok: true,
    message: `Published ${draft.commitments.length} commitments`,
    publishedAt: published._lastUpdated,
  });
}

async function handleUpdateCollege(req, res) {
  const { collegeName, mhrId, website, level, state } = req.body;
  if (!collegeName) {
    return res.status(400).json({ error: 'collegeName is required' });
  }

  const data = (await kvGet('college-mappings')) || { colleges: {} };
  const colleges = data.colleges || data;

  colleges[collegeName.trim()] = {
    mhrId: (mhrId || '').trim() || null,
    logoUrl: mhrId ? mhrLogoUrl((mhrId || '').trim()) : null,
    website: (website || '').trim() || null,
    level: (level || '').trim() || null,
    state: (state || '').trim() || null,
  };

  await kvSet('college-mappings', { _lastUpdated: new Date().toISOString(), colleges });
  return res.status(200).json({ ok: true, message: `College "${collegeName}" updated`, colleges });
}

async function handleDeleteCollege(req, res) {
  const { collegeName } = req.body;
  if (!collegeName) {
    return res.status(400).json({ error: 'collegeName is required' });
  }

  const data = (await kvGet('college-mappings')) || { colleges: {} };
  const colleges = data.colleges || data;

  if (!(collegeName in colleges)) {
    return res.status(404).json({ error: `College "${collegeName}" not found` });
  }

  delete colleges[collegeName];
  await kvSet('college-mappings', { _lastUpdated: new Date().toISOString(), colleges });
  return res.status(200).json({ ok: true, message: `College "${collegeName}" deleted`, colleges });
}

async function handleBulkUpdateCollegeLevel(req, res) {
  const { collegeName, level } = req.body;
  if (!collegeName || !level) {
    return res.status(400).json({ error: 'collegeName and level are required' });
  }

  const draft = await getDraft();
  let updated = 0;
  for (const c of draft.commitments) {
    if (c.collegeName === collegeName && c.collegeLevel !== level) {
      c.collegeLevel = level;
      updated++;
    }
  }

  if (updated === 0) {
    return res.status(200).json({ ok: true, message: 'No commitments needed updating', updated: 0, draft });
  }

  const saved = await saveDraft(draft);
  return res.status(200).json({
    ok: true,
    message: `Updated ${updated} commitment(s) for "${collegeName}" to "${level}"`,
    updated,
    draft: saved,
  });
}
