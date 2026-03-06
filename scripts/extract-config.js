/**
 * Extracts bracket-config.json and initial-seeds.json from the existing
 * LEAGUE_DATA in usphl-playoffs-2026.html.
 *
 * Usage: node scripts/extract-config.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Read the HTML file and extract the LEAGUE_DATA JavaScript object
const html = fs.readFileSync(path.join(ROOT, 'usphl-playoffs-2026.html'), 'utf8');

// Extract the LEAGUE_DATA block
const match = html.match(/const LEAGUE_DATA = (\{[\s\S]*?\});/);
if (!match) {
  console.error('Could not find LEAGUE_DATA in HTML');
  process.exit(1);
}

// Evaluate it (safe here — it's our own code)
const LEAGUE_DATA = eval(`(${match[1]})`);

// ---- Build bracket-config.json ----
// Extracts playoffFormat for each division
const bracketConfig = {
  Premier: {},
  Elite: {},
  NCDC: {},
};

// Premier
for (const [div, data] of Object.entries(LEAGUE_DATA.premier)) {
  if (data.playoffFormat) {
    bracketConfig.Premier[div] = {
      qualifyCount: data.qualifyCount,
      playoffFormat: data.playoffFormat,
    };
  }
}

// Elite
for (const [div, data] of Object.entries(LEAGUE_DATA.elite)) {
  if (data.playoffFormat) {
    bracketConfig.Elite[div] = {
      qualifyCount: data.qualifyCount,
      playoffFormat: data.playoffFormat,
    };
  }
}

// NCDC
for (const [conf, confData] of Object.entries(LEAGUE_DATA.ncdc.conferences)) {
  if (conf === 'New England') {
    // NE has sub-divisions
    for (const [divName, divData] of Object.entries(confData.divisions)) {
      bracketConfig.NCDC[`NE ${divName}`] = {
        qualifyCount: divData.qualifyCount,
        playoffFormat: divData.playoffFormat,
      };
    }
    // Conference rounds
    bracketConfig.NCDC['NE Conference'] = {
      conferenceRounds: confData.conferenceRounds,
    };
  } else {
    bracketConfig.NCDC[conf] = {
      qualifyCount: confData.qualifyCount,
      playoffFormat: confData.playoffFormat,
    };
  }
}

// Dineen Cup
bracketConfig.NCDC['Dineen Cup'] = LEAGUE_DATA.ncdc.dineenCup;

fs.writeFileSync(
  path.join(ROOT, 'data', 'bracket-config.json'),
  JSON.stringify(bracketConfig, null, 2)
);
console.log('Wrote data/bracket-config.json');

// ---- Build initial-seeds.json ----
// Extracts seed → team name mappings for each division
const initialSeeds = {
  Premier: {},
  Elite: {},
  NCDC: {},
};

function extractSeeds(data) {
  const seeds = {};
  if (data.teams) {
    for (const team of data.teams) {
      seeds[team.seed] = {
        name: team.name,
        gp: team.gp,
        pts: team.pts,
        row: team.row,
        l: team.l,
        pctg: team.pctg,
      };
    }
  }
  if (data.pods) {
    for (const [podName, pod] of Object.entries(data.pods)) {
      for (const team of pod.teams) {
        seeds[`${podName}_${team.seed}`] = {
          name: team.name,
          pod: podName,
          gp: team.gp,
          pts: team.pts,
          row: team.row,
          l: team.l,
          pctg: team.pctg,
        };
      }
    }
  }
  // Eliminated teams
  if (data.eliminated) {
    for (const team of data.eliminated) {
      seeds[`elim_${team.seed}`] = {
        name: team.name,
        eliminated: true,
        gp: team.gp,
        pts: team.pts,
        row: team.row,
        l: team.l,
        pctg: team.pctg,
      };
    }
  }
  return seeds;
}

// Premier
for (const [div, data] of Object.entries(LEAGUE_DATA.premier)) {
  initialSeeds.Premier[div] = extractSeeds(data);
}

// Elite
for (const [div, data] of Object.entries(LEAGUE_DATA.elite)) {
  initialSeeds.Elite[div] = extractSeeds(data);
}

// NCDC
for (const [conf, confData] of Object.entries(LEAGUE_DATA.ncdc.conferences)) {
  if (conf === 'New England') {
    for (const [divName, divData] of Object.entries(confData.divisions)) {
      initialSeeds.NCDC[`NE ${divName}`] = extractSeeds(divData);
    }
  } else {
    initialSeeds.NCDC[conf] = extractSeeds(confData);
  }
}

fs.writeFileSync(
  path.join(ROOT, 'data', 'initial-seeds.json'),
  JSON.stringify(initialSeeds, null, 2)
);
console.log('Wrote data/initial-seeds.json');

// Summary
let totalDivisions = 0;
for (const league of Object.values(bracketConfig)) {
  totalDivisions += Object.keys(league).length;
}
console.log(`\nExtracted ${totalDivisions} division configs`);
