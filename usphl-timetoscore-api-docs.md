# USPHL TimeToScore API Documentation

## Overview

This document outlines the API calls and authentication method used to interact with the USPHL TimeToScore platform for fetching hockey statistics data.

---

## Base Configuration

```javascript
const CONFIG = {
  apiUrl: 'https://api.usphl.timetoscore.com',
  leagueId: '1',      // NCDC
  seasonId: '65',     // Season 65 (2024-25)
  statClass: '1'
};
```

### League IDs
- `1` = NCDC
- `2` = Premier (verify)
- `3` = Elite (verify)

---

## Authentication

The API uses **HMAC-SHA256 signature authentication** (Pusher-style).

### Default Credentials
```
Username: leagueapps
Secret:   7csjfsXdUYuLs1Nq2datfxIdrpOjgFln
```

### Signature Generation Process

1. Generate a Unix timestamp (seconds)
2. Compute MD5 hash of empty string (for GET requests with no body)
3. Build signed parameters object:
   ```javascript
   const signedParams = {
     ...params,
     auth_key: username,
     auth_timestamp: timestamp,
     body_md5: md5HashOfEmptyString
   };
   ```
4. Sort parameter keys alphabetically
5. Build canonical query string: `key1=value1&key2=value2&...`
6. Create string to sign: `METHOD\nENDPOINT\nCANONICAL_QUERY_STRING`
7. Generate HMAC-SHA256 signature using the secret key
8. Append `auth_signature` to the request

### Example Signed Request
```
GET /get_teams?auth_key=leagueapps&auth_timestamp=1709847600&body_md5=d41d8cd98f00b204e9800998ecf8427e&league_id=1&season_id=65&stat_class=1&auth_signature=abc123...
```

---

## API Endpoints

### 1. Get Teams
Fetches all teams in a league/season.

```
GET /get_teams
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `league_id` | string | League identifier (e.g., "1" for NCDC) |
| `season_id` | string | Season identifier (e.g., "65") |
| `stat_class` | string | Stat class (typically "1") |

**Response Structure:**
```javascript
{
  teams: [
    {
      team_id: "494",
      team_name: "Boston Junior Bruins",
      short_name: "Jr. Bruins",
      team_ab: "BJB",
      smlogo: "https://...",
      level_id: "1"
    },
    // ...
  ]
}
// OR direct array of team objects
```

---

### 2. Get Team Roster
Fetches player roster for a specific team.

```
GET /get_roster
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `league_id` | string | League identifier |
| `season_id` | string | Season identifier |
| `stat_class` | string | Stat class |
| `team_id` | string | Team identifier |

**Response Structure:**
```javascript
{
  players: [
    {
      player_id: "12345",
      player_name: "John Smith",
      position: "F",
      jersey_number: "17",
      height: "5'11\"",
      weight: "175",
      dob: "2005-03-15",
      hometown: "Boston, MA"
    },
    // ...
  ]
}
```

---

### 3. Get Player Stats
Fetches detailed game-by-game statistics for a player.

```
GET /get_player_stats
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `league_id` | string | League identifier |
| `season_id` | string | Season identifier |
| `stat_class` | string | Stat class |
| `player_id` | string | Player identifier |
| `detail` | string | Set to "1" for game-by-game breakdown |

**Response Structure:**
```javascript
{
  detailed_player_stats: [
    {
      game_id: "19178",
      date: "2024-10-15",
      goals: 1,
      assists: 2,
      points: 3,
      plus_minus: 1,
      pim: 0,
      shots: 4,
      ppg: 0,
      ppa: 1,
      shg: 0,
      sha: 0,
      gwg: 0
    },
    // ...
  ],
  current_season_stats: { /* totals */ },
  team_player_stats: { /* additional context */ }
}
```

---

### 4. Get Skaters
Fetches skater statistics/roster with position data for a team.

```
GET /get_skaters
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `league_id` | string | League identifier |
| `season_id` | string | Season identifier |
| `stat_class` | string | Stat class |
| `team_id` | string | Team identifier |

**Response Notes:**
- Position is typically in the `plays` field, not `position`
- Values: "F" (Forward), "D" (Defense), "G" (Goalie)

---

### 5. Get Schedule
Fetches the full season schedule.

```
GET /get_schedule
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `league_id` | string | League identifier |
| `season_id` | string | Season identifier |
| `stat_class` | string | Stat class |

**Response Structure:**
```javascript
{
  games: [
    {
      game_id: "19178",
      date: "2024-10-15",
      home_team_name: "Boston Junior Bruins",
      away_team_name: "Springfield Pics",
      home_score: 4,
      away_score: 2
    },
    // ...
  ]
}
```

---

### 6. Get Game Center
Fetches detailed game data including box scores and player stats.

```
GET /get_game_center
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `league_id` | string | League identifier |
| `season_id` | string | Season identifier |
| `game_id` | string | Game identifier |
| `widget` | string | Set to "gamecenter" |

**Response Structure:**
```javascript
{
  game_center: {
    game_info: {
      home_team: { name: "...", id: "..." },
      away_team: { name: "...", id: "..." },
      home_score: 4,
      away_score: 2,
      status: "final"
    },
    live: {
      home_skaters: [ /* player stats */ ],
      away_skaters: [ /* player stats */ ],
      home_goalies: [ /* goalie stats */ ],
      away_goalies: [ /* goalie stats */ ]
    }
  }
}
```

**Goalie Stats Fields:**
| Field | Description |
|-------|-------------|
| `toi` | Time on ice (minutes or "MM:SS" format) |
| `sa` | Shots against |
| `sv` | Saves |
| `ga` | Goals against |
| `sv_pct` | Save percentage |
| `wlotl` | Win/Loss/OTL indicator (1=W, 2=L, 3=OTL) |
| `so` | Shutout |

---

## Known Quirks & Notes

1. **New England Wolves (Team ID 2380)**: This team may not appear in the `/get_teams` response and needs to be manually added.

2. **Position Field**: In `/get_skaters`, the position is in the `plays` field, not `position`.

3. **Nested Responses**: Game center data is often nested inside a `game_center` object, and live stats are inside a `live` object within that.

4. **Date Formats**: Dates are typically returned as `YYYY-MM-DD` strings.

5. **Response Variations**: The API may return data as either a direct array or wrapped in an object (e.g., `{ teams: [...] }` vs `[...]`). Always check for both.

---

## Rate Limiting

No explicit rate limits documented, but recommended delays:
- 250-400ms between player stat calls
- 350ms between game center calls
- 1000ms between team processing batches

---

## Example: Full Authentication Code (JavaScript/Google Apps Script)

```javascript
function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    let v = bytes[i];
    if (v < 0) v += 256;
    out += (v >>> 4).toString(16) + (v & 0x0f).toString(16);
  }
  return out;
}

function generateSignature(endpoint, params = {}) {
  const username = 'leagueapps';
  const secret = '7csjfsXdUYuLs1Nq2datfxIdrpOjgFln';
  const method = 'GET';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyMd5 = bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, ''));

  const signedParams = {
    ...params,
    auth_key: username,
    auth_timestamp: timestamp,
    body_md5: bodyMd5
  };

  const keys = Object.keys(signedParams).sort();
  const canonicalQS = keys.map(k => 
    `${encodeURIComponent(k)}=${encodeURIComponent(signedParams[k])}`
  ).join('&');
  
  const stringToSign = [method, endpoint, canonicalQS].join('\n');
  const sigBytes = Utilities.computeHmacSha256Signature(stringToSign, secret);
  const auth_signature = bytesToHex(sigBytes);

  return { ...signedParams, auth_signature };
}

function callAPI(endpoint, params = {}) {
  const apiUrl = 'https://api.usphl.timetoscore.com';
  const signed = generateSignature(endpoint, params);
  
  const keysNoSig = Object.keys(signed).filter(k => k !== 'auth_signature').sort();
  const canonicalQS = keysNoSig.map(k => 
    `${encodeURIComponent(k)}=${encodeURIComponent(signed[k])}`
  ).join('&');
  const url = `${apiUrl}${endpoint}?${canonicalQS}&auth_signature=${encodeURIComponent(signed.auth_signature)}`;

  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  return JSON.parse(res.getContentText());
}
```

---

## Contact / Source

This documentation was extracted from a Google Apps Script project for USPHL NCDC statistics tracking. The API is provided by TimeToScore for the USPHL.
