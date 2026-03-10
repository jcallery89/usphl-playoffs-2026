/**
 * Shared enrichment logic for commitments.
 * Takes flat commitment records + team-mappings + college-mappings
 * and returns the fully enriched array the public HTML expects.
 */

// Team name aliases: commitments-raw uses abbreviations, team-mappings uses full names
const TEAM_ALIASES = {
  'Boston Jr. Bruins': 'Boston Junior Bruins',
  'Connecticut Jr. Rangers': 'Connecticut Junior Rangers',
  'P.A.L. Jr. Islanders': 'P.A.L. Junior Islanders',
  'Utica Jr. Comets': 'Utica Jr Comets',
  'NY Dynamo': 'New York Dynamo',
};

export function normalizeTeamName(name) {
  if (TEAM_ALIASES[name]) return TEAM_ALIASES[name];
  return (name || '').trim();
}

/**
 * Build a flat team lookup from the nested team-mappings.json structure.
 * Returns { "Team Name": { team_id, logo_url, profile_url, ... }, ... }
 */
export function buildTeamLookup(teamMappings) {
  const lookup = {};
  const ncdcTeams = teamMappings.NCDC || {};
  for (const div of Object.values(ncdcTeams)) {
    for (const [name, info] of Object.entries(div)) {
      lookup[name] = info;
    }
  }
  return lookup;
}

/**
 * Enrich flat commitment records into the full shape the public page expects.
 *
 * @param {Array} commitments - Flat records: { id, firstName, lastName, hometown, teamName, playerId, collegeName, collegeLevel, storyUrl }
 * @param {Object} teamMappings - Full team-mappings.json content
 * @param {Object} collegeMappings - { "College Name": { espnId, logoUrl, website }, ... }
 * @returns {Array} Enriched records matching the public page DATA.commitments shape
 */
export function enrichCommitments(commitments, teamMappings, collegeMappings) {
  const teamLookup = buildTeamLookup(teamMappings);

  return commitments.map(c => {
    // Team enrichment
    const normalizedName = normalizeTeamName(c.teamName);
    const teamInfo = teamLookup[normalizedName];
    const team = {
      name: c.teamName,
      teamId: teamInfo ? teamInfo.team_id : null,
      logoUrl: teamInfo ? teamInfo.logo_url : null,
      profileUrl: teamInfo ? teamInfo.profile_url : null,
    };

    // Player enrichment
    const player = {
      playerId: c.playerId || null,
      profileUrl: null,
      imageUrl: null,
    };
    if (c.playerId && team.teamId) {
      player.profileUrl = `https://usphl.com/ncdc/game-center/players/?playerId=${c.playerId}&team=${team.teamId}&season=65`;
    }

    // College enrichment
    const collegeInfo = collegeMappings[c.collegeName] || null;
    const college = {
      name: c.collegeName,
      level: c.collegeLevel,
      logoUrl: collegeInfo ? collegeInfo.logoUrl : null,
      website: collegeInfo ? collegeInfo.website : null,
    };

    return {
      firstName: c.firstName,
      lastName: c.lastName,
      hometown: c.hometown,
      team,
      player,
      college,
      storyUrl: c.storyUrl || null,
    };
  });
}

/**
 * Get list of all NCDC team names (sorted) from team-mappings.
 */
export function getTeamNames(teamMappings) {
  const lookup = buildTeamLookup(teamMappings);
  return Object.keys(lookup).sort();
}
