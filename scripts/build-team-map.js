/**
 * One-time script: Calls the TimeToScore API to get all teams for all leagues,
 * then fuzzy-matches them to the team names in our LEAGUE_DATA and logo files.
 * Outputs data/team-mappings.json.
 *
 * Usage: node scripts/build-team-map.js
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// API config
const API_URL = 'https://api.usphl.timetoscore.com';
const USERNAME = 'leagueapps';
const SECRET = '7csjfsXdUYuLs1Nq2datfxIdrpOjgFln';
const SEASON_ID = '65';

// League config
const LEAGUES = [
  { id: '1', name: 'NCDC', urlPrefix: 'ncdc' },
  { id: '2', name: 'Premier', urlPrefix: 'premier' },
  { id: '3', name: 'Elite', urlPrefix: 'elite' },
];

// ---- API helpers ----
function generateSignedUrl(endpoint, params) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyMd5 = crypto.createHash('md5').update('').digest('hex');
  const signedParams = { ...params, auth_key: USERNAME, auth_timestamp: timestamp, body_md5: bodyMd5 };
  const keys = Object.keys(signedParams).sort();
  const canonicalQS = keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(signedParams[k])}`).join('&');
  const stringToSign = `GET\n${endpoint}\n${canonicalQS}`;
  const sig = crypto.createHmac('sha256', SECRET).update(stringToSign).digest('hex');
  return `${API_URL}${endpoint}?${canonicalQS}&auth_signature=${encodeURIComponent(sig)}`;
}

async function fetchTeams(leagueId) {
  const url = generateSignedUrl('/get_teams', { league_id: leagueId, season_id: SEASON_ID, stat_class: '2' });
  const res = await fetch(url);
  const data = await res.json();
  return Array.isArray(data) ? data : data.teams || [];
}

// ---- Team names extracted from current LEAGUE_DATA ----
// This is the canonical list of team names we need to match
const HARDCODED_TEAMS = {
  Premier: {
    Atlantic: ["West Chester Wolves","Red Bank Generals","Connecticut Junior Rangers","P.A.L. Jr Islanders","Wilkes-Barre Scranton Knights","Mercer Chiefs","Rockets Hockey Club","Hershey Cubs","Jersey Hitmen","New Jersey Renegades"],
    Florida: ["Coral Springs Jr. Cats","Florida Eels","Tampa Bay Juniors","Florida Junior Blades","Typhoon Hockey Club","Bold City Battalion"],
    "Great Lakes": ["Toledo Cherokee","Metro Jets","Red River Spartans","Columbus Mavericks","Battle Creek Kernels","Fresh Coast Freeze","Cincinnati Cyclones","Bearcat Hockey Club"],
    Midwest: ["Fort Wayne Spacemen","Chicago T-Rex","MJDP","Chicago Cougars","Chicago Crush"],
    "New England": ["Northern Cyclones","Islanders Hockey Club","South Shore Kings","Utica Jr Comets","Boston Jr. Rangers","Worcester Railers JHC","Springfield Pics","Thunder Hockey Club"],
    North: ["Minnesota Squatch","Wisconsin Rapids Riverkings","Northwest Express","Minnesota Blue Ox","Steele County Blades","Minnesota Mullets","Hudson Havoc","Minnesota Outlaws"],
    Northwest: ["Seattle Totems","Bremerton Sockeyes","Vernal Oilers","McCall Smokejumpers","Iron County Yeti","Colorado Fighting Elk","Rogue Valley Royals"],
    Pacific: ["Fresno Monsters","Henderson Force","Ontario Jr Reign","Ventura Vikings","Long Beach Bombers","San Diego Sabers","Lake Tahoe Lakers"],
    Southeast: ["Hampton Roads Whalers","Potomac Patriots","Charlotte Rush","Charleston Colonials","Carolina Junior Hurricanes"],
    "St. Lawrence": ["Hawkesbury Knights","Montreal Black Vees","Somang Hockey","St-Lazare Avalanche","Universel College Gatineau","Universel Sherbrooke","New York Dynamo","Kingston Wranglers","Ottawa Valley Centennials"],
  },
  Elite: {
    Atlantic: ["Wilkes-Barre Scranton Knights","Hershey Cubs","Connecticut Junior Rangers","Red Bank Generals","P.A.L. Jr Islanders","Atlanta Mad Hatters"],
    Florida: ["Tampa Bay Juniors","Coral Springs Jr. Cats","Florida Junior Blades","Florida Eels","Typhoon Hockey Club","Bold City Battalion"],
    Midwest: ["Chicago Crush","Fort Wayne Spacemen","Metro Jets Elite","Chicago T-Rex","Chicago Cougars"],
    "New England": ["Northern Cyclones","Montreal Knights","Islanders Hockey Club","South Shore Kings","Springfield Pics"],
    Southeast: ["Carolina Junior Hurricanes","Hampton Roads Whalers","Charlotte Rush","Potomac Patriots","Charleston Colonials"],
  },
  NCDC: {
    Atlantic: ["P.A.L. Junior Islanders","Jersey Hitmen","Rockets Hockey Club","Mercer Chiefs","Connecticut Junior Rangers","Wilkes-Barre Scranton Knights","West Chester Wolves"],
    "NE Central": ["Utica Jr Comets","Boston Jr. Rangers","Worcester Railers JHC","Boston Junior Bruins","Springfield Pics","New York Dynamo"],
    "NE East": ["South Shore Kings","Islanders Hockey Club","Northern Cyclones","Thunder Hockey Club","Boston Dogs","Universel Academy"],
    "NE North": ["Lewiston MAINEiacs","Universel Quebec","Woodstock NB Slammers","CT Chiefs North","Northern Maine Pioneers","St. Stephen County Moose","New England Wolves"],
    Mountain: ["Ogden Mustangs","Idaho Falls Spud Kings","Grand Junction River Hawks","Utah Outliers","Pueblo Bulls","Rock Springs Miners","Casper Warbirds"],
  },
};

// ---- Logo file list ----
function getLogoFiles() {
  const logosDir = path.join(ROOT, 'public', 'logos');
  if (!fs.existsSync(logosDir)) return [];
  return fs.readdirSync(logosDir).filter(f => f.endsWith('.png'));
}

// ---- Fuzzy matching ----
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[.\-'']/g, '')
    .replace(/\bjr\b/g, 'junior')
    .replace(/\bjhc\b/g, '')
    .replace(/\bcollège\b/g, 'college')
    .replace(/\bcollege\b/g, 'college')
    .replace(/\bpal\b/g, 'pal')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 100;

  // Word overlap
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const common = [...wordsA].filter(w => wordsB.has(w) && w.length > 2);
  const unionSize = new Set([...wordsA, ...wordsB]).size;
  const wordScore = (common.length / unionSize) * 80;

  // Contains check
  if (na.includes(nb) || nb.includes(na)) return Math.max(wordScore, 85);

  return wordScore;
}

function findBestLogoMatch(teamName, logoFiles) {
  const teamNorm = normalize(teamName);
  let bestFile = null;
  let bestScore = 0;

  for (const file of logoFiles) {
    // Strip numbering prefix and extension
    const cleanName = file.replace(/^\d+_/, '').replace(/\.png$/, '').replace(/_/g, ' ');
    // Handle URL-encoded characters
    const decoded = cleanName.replace(/#U00e[0-9a-f]{2}/g, (m) => {
      const code = parseInt(m.replace('#U', '0x'), 16);
      return String.fromCharCode(code);
    });
    const score = similarity(teamName, decoded);
    if (score > bestScore) {
      bestScore = score;
      bestFile = file;
    }
  }

  return bestScore >= 50 ? bestFile : null;
}

function buildProfileUrl(league, teamId) {
  const prefix = league.urlPrefix;
  const base = `https://usphl.com/${prefix}/game-center/teams/?team=${teamId}&season=${SEASON_ID}`;
  if (prefix === 'elite') return base + '&level_id=1';
  return base;
}

// ---- Main ----
async function main() {
  console.log('Fetching teams from TimeToScore API...');
  const logoFiles = getLogoFiles();
  console.log(`Found ${logoFiles.length} logo files`);

  const result = {};
  const unmatched = [];

  for (const league of LEAGUES) {
    console.log(`\nProcessing ${league.name} (league_id=${league.id})...`);
    const apiTeams = await fetchTeams(league.id);
    console.log(`  API returned ${apiTeams.length} teams`);

    result[league.name] = {};

    // Build a lookup of all hardcoded teams for this league
    const hardcodedByLeague = HARDCODED_TEAMS[league.name] || {};

    for (const [division, teamNames] of Object.entries(hardcodedByLeague)) {
      result[league.name][division] = {};

      for (const teamName of teamNames) {
        // Find best API match
        let bestMatch = null;
        let bestScore = 0;

        for (const apiTeam of apiTeams) {
          const score = similarity(teamName, apiTeam.team_name);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = apiTeam;
          }
        }

        const logoFile = findBestLogoMatch(teamName, logoFiles);

        if (bestMatch && bestScore >= 50) {
          result[league.name][division][teamName] = {
            team_id: bestMatch.team_id,
            api_name: bestMatch.team_name,
            match_score: bestScore,
            logo_url: bestMatch.smlogo || null,
            logo_file: logoFile,
            profile_url: buildProfileUrl(league, bestMatch.team_id),
          };
          if (bestScore < 80) {
            console.log(`  ⚠ Weak match: "${teamName}" → "${bestMatch.team_name}" (score: ${bestScore})`);
          }
        } else {
          result[league.name][division][teamName] = {
            team_id: null,
            api_name: null,
            match_score: bestScore,
            logo_url: null,
            logo_file: logoFile,
            profile_url: null,
          };
          unmatched.push({ league: league.name, division, teamName, bestCandidate: bestMatch?.team_name, score: bestScore });
          console.log(`  ✗ No match: "${teamName}" (best: "${bestMatch?.team_name}" score: ${bestScore})`);
        }
      }
    }

    // Small delay between leagues
    await new Promise(r => setTimeout(r, 300));
  }

  // Write output
  const outPath = path.join(ROOT, 'data', 'team-mappings.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nWrote ${outPath}`);

  if (unmatched.length > 0) {
    console.log(`\n⚠ ${unmatched.length} unmatched teams:`);
    unmatched.forEach(u => console.log(`  ${u.league} / ${u.division}: "${u.teamName}" (best: "${u.bestCandidate}" @ ${u.score})`));
  } else {
    console.log('\n✓ All teams matched!');
  }
}

main().catch(console.error);
