#!/usr/bin/env node
/**
 * Build script: combines commitments-raw.json + player CSVs + team-mappings + college-mappings
 * into commitments-enriched.json and generates college-commitments.html
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const OUT_DIR = join(__dirname, '..');

// --- CSV Parser (handles quoted fields with embedded commas/JSON) ---
function parseCsvToRows(text) {
  const result = [];
  let fields = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      fields.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      fields.push(current);
      current = '';
      if (fields.length > 0) {
        result.push(fields);
        fields = [];
      }
    } else {
      current += ch;
    }
  }
  if (current || fields.length) {
    fields.push(current);
    result.push(fields);
  }
  return result;
}

function csvRows(text) {
  const allRows = parseCsvToRows(text);
  if (allRows.length === 0) return [];
  const headers = allRows[0].map(h => h.trim());
  const objects = [];
  for (let r = 1; r < allRows.length; r++) {
    const row = allRows[r];
    if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue;
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (row[i] || '').trim();
    }
    objects.push(obj);
  }
  return objects;
}

// --- Team name normalization & matching ---
const TEAM_ALIASES = {
  'Boston Jr. Bruins': 'Boston Junior Bruins',
  'Connecticut Jr. Rangers': 'Connecticut Junior Rangers',
  'P.A.L. Jr. Islanders': 'P.A.L. Junior Islanders',
  'Utica Jr. Comets': 'Utica Jr Comets',
  'NY Dynamo': 'New York Dynamo',
};

function normalizeTeamName(name) {
  if (TEAM_ALIASES[name]) return TEAM_ALIASES[name];
  return name.trim();
}

// --- Load data ---
console.log('Loading data sources...');

const commitments = JSON.parse(readFileSync(join(DATA_DIR, 'commitments-raw.json'), 'utf8'));
const collegeMappings = JSON.parse(readFileSync(join(DATA_DIR, 'college-mappings.json'), 'utf8'));
const teamMappings = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'team-mappings.json'), 'utf8'));

// Build flat team lookup from team-mappings.json
const teamLookup = {};
const ncdcTeams = teamMappings.NCDC || {};
for (const div of Object.values(ncdcTeams)) {
  for (const [name, info] of Object.entries(div)) {
    teamLookup[name] = info;
  }
}
console.log(`  Teams loaded: ${Object.keys(teamLookup).length}`);

// Load player CSVs
const skatersPath = process.env.SKATERS_CSV || 'C:/Users/Jamie/Desktop/New WJR Linechart - Skaters_NCDC.csv';
const goaliesPath = process.env.GOALIES_CSV || 'C:/Users/Jamie/Desktop/New WJR Linechart - Goalies_NCDC.csv';

const skatersCsv = readFileSync(skatersPath, 'utf8');
const goaliesCsv = readFileSync(goaliesPath, 'utf8');

// Build player lookup: key = "firstname_lastname" (lowercased), value = player info
const playerLookup = {};

function addPlayer(row) {
  const fname = (row.fname || '').trim();
  const lname = (row.lname || '').trim();
  if (!fname || !lname) return;

  const key = `${fname}_${lname}`.toLowerCase();
  const playerId = row.player_id;

  // Parse teams JSON to get team_id
  let teamId = null;
  let teamSmlogo = null;
  try {
    const teamsData = JSON.parse(row.teams || '[]');
    // Use the last team (most recent) that has active=1
    const activeTeam = teamsData.find(t => t.active === '1') || teamsData[teamsData.length - 1];
    if (activeTeam) {
      teamId = activeTeam.team_id;
      teamSmlogo = activeTeam.smlogo;
    }
  } catch (e) { /* ignore parse errors */ }

  const playerImage = row.player_image || null;

  // Store player, preferring entries with a team match
  if (!playerLookup[key] || (teamId && !playerLookup[key].teamId)) {
    playerLookup[key] = { playerId, fname, lname, teamId, teamSmlogo, playerImage };
  }
}

console.log('  Parsing skaters CSV...');
for (const row of csvRows(skatersCsv)) {
  addPlayer(row);
}

console.log('  Parsing goalies CSV...');
for (const row of csvRows(goaliesCsv)) {
  addPlayer(row);
}

console.log(`  Players loaded: ${Object.keys(playerLookup).length}`);

// --- Enrich commitments ---
console.log('\nEnriching commitments...');

let matchedPlayers = 0;
let matchedTeams = 0;
let matchedColleges = 0;

const enriched = commitments.map((c, i) => {
  const teamName = normalizeTeamName(c.team);
  const teamInfo = teamLookup[teamName];

  // Team match
  let team = { name: c.team, teamId: null, logoUrl: null, profileUrl: null };
  if (teamInfo) {
    team = {
      name: c.team,
      teamId: teamInfo.team_id,
      logoUrl: teamInfo.logo_url,
      profileUrl: teamInfo.profile_url
    };
    matchedTeams++;
  } else {
    console.log(`  [WARN] No team match for: "${c.team}" (normalized: "${teamName}")`);
  }

  // Player match
  const playerKey = `${c.firstName}_${c.lastName}`.toLowerCase();
  const playerInfo = playerLookup[playerKey];
  let player = { playerId: null, profileUrl: null, imageUrl: null };
  if (playerInfo) {
    const pTeamId = team.teamId || playerInfo.teamId;
    player = {
      playerId: playerInfo.playerId,
      profileUrl: pTeamId
        ? `https://usphl.com/ncdc/game-center/players/?playerId=${playerInfo.playerId}&team=${pTeamId}&season=65`
        : null,
      imageUrl: playerInfo.playerImage || null
    };
    // If team didn't match from mappings but player has logo, use it
    if (!team.logoUrl && playerInfo.teamSmlogo) {
      team.logoUrl = playerInfo.teamSmlogo;
    }
    matchedPlayers++;
  } else {
    console.log(`  [WARN] No player match for: "${c.firstName} ${c.lastName}" (key: "${playerKey}")`);
  }

  // College match
  const collegeInfo = collegeMappings[c.college];
  let college = { name: c.college, level: c.collegeLevel, logoUrl: null, website: null };
  if (collegeInfo) {
    college = {
      name: c.college,
      level: c.collegeLevel,
      logoUrl: collegeInfo.logoUrl,
      website: collegeInfo.website
    };
    matchedColleges++;
  } else {
    console.log(`  [WARN] No college mapping for: "${c.college}"`);
  }

  return {
    firstName: c.firstName,
    lastName: c.lastName,
    hometown: c.hometown,
    team,
    player,
    college,
    storyUrl: c.storyUrl || null
  };
});

// --- Output ---
const output = {
  generated: new Date().toISOString(),
  season: '2025-26',
  league: 'NCDC',
  count: enriched.length,
  commitments: enriched
};

writeFileSync(join(DATA_DIR, 'commitments-enriched.json'), JSON.stringify(output, null, 2));

// --- Generate HTML with embedded data ---
const htmlTemplate = readFileSync(join(OUT_DIR, 'college-commitments.html'), 'utf8');
const htmlWithData = htmlTemplate.replace(
  'COMMITMENTS_DATA_PLACEHOLDER',
  JSON.stringify(output)
);
writeFileSync(join(OUT_DIR, 'college-commitments-built.html'), htmlWithData);

console.log(`\n=== Build Complete ===`);
console.log(`Total commitments: ${enriched.length}`);
console.log(`Teams matched: ${matchedTeams}/${enriched.length}`);
console.log(`Players matched: ${matchedPlayers}/${enriched.length}`);
console.log(`Colleges matched: ${matchedColleges}/${enriched.length}`);
console.log(`Output: commitments/data/commitments-enriched.json`);
console.log(`HTML:   commitments/college-commitments-built.html`);
