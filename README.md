# 2025-26 USPHL Playoff Brackets

A self-contained HTML app displaying playoff brackets, standings tables, and schedules for all three USPHL junior hockey leagues.

## Quick Start

Open `usphl-playoffs-2026.html` directly in any browser, or serve locally:

```bash
python -m http.server 8090
# then visit http://localhost:8090/usphl-playoffs-2026.html
```

## Leagues & Divisions

### NCDC (7 views)
- **Atlantic** - 5-team: Play-In (Bo3) + Semifinals (Bo5) + Final (Bo5)
- **NE Central / NE East / NE North** - 4 teams each: Division Semis (Bo5) + Division Final (Bo5)
- **NE Conference** (combined view) - 3 division brackets + Conference Round Robin + Conference Final (Bo3)
- **Mountain** - 4-team: Semifinals (Bo5) + Final (Bo5)
- **Dineen Cup** - 4-team modified double elimination (Atlantic champ, Mountain champ, NE champ, Idaho Falls host auto-bid)

### Premier (10 divisions)
| Division | Teams | Format |
|----------|-------|--------|
| Atlantic | 8 | Quarterfinals + Semis + Championship (all Bo3) |
| Florida | 5 | Play-In (4v5) + Semis + Championship (all Bo3) |
| Great Lakes | 6 | R1 (3v6, 4v5) + R2 (1v low, 2v high) + Championship (all Bo3) |
| Midwest | 8 | Quarterfinals + Semis + Championship (all Bo3) |
| New England | 8 | Quarterfinals + Semis + Championship (all Bo3) |
| North | 7 | Play-In (6v7) + Quarterfinals + Semis + Championship (all Bo3) |
| Northwest | 2 pods | Pod Rounds (Bo3) + Divisional Finals (Bo3) |
| Pacific | 4 | Semifinals + Championship (all Bo3) |
| Southeast | 5 | Play-In (4v5) + Semis + Championship (all Bo3) |
| St. Lawrence | 8 | Quarterfinals + Semis + Championship (all Bo3) |

### Elite (5 divisions)
| Division | Teams | Format |
|----------|-------|--------|
| Atlantic | 6 | R1 (3v6, 4v5, 1-2 bye) + R2 + Championship (all Bo3) |
| Florida | 5 | Play-In (4v5) + Semis + Championship (all Bo3) |
| Midwest | 5 | Play-In (4v5) + Semis + Championship (all Bo3) |
| New England | 5 | Play-In (single game, 4v5) + R1 + Championship (all Bo3) |
| Southeast | 5 | Play-In (4v5) + Semis + Championship (all Bo3) |

## Updating Standings

All team data lives in the `LEAGUE_DATA` JavaScript object at the top of the HTML file. To update:

1. Open `usphl-playoffs-2026.html` in a text editor
2. Find the `LEAGUE_DATA` object (starts around line 460)
3. Update team stats: `seed`, `pts`, `row`, `l`, `pctg`, etc.
4. Save and refresh the browser

### Data Structure

```javascript
// Premier & Elite: divisions are top-level keys
LEAGUE_DATA.premier["Atlantic"].teams[0]
// => { seed: 1, name: "West Chester Wolves", gp: 44, pts: 74, ... }

// NCDC: nested under conferences
LEAGUE_DATA.ncdc.conferences["Atlantic"].teams[0]
LEAGUE_DATA.ncdc.conferences["New England"].divisions["Central"].teams[0]

// Dineen Cup
LEAGUE_DATA.ncdc.dineenCup.schedule[0]
// => { game: 1, date: "Apr 24", time: "2:00 PM", ... }
```

## Future: JSON Migration

The `LEAGUE_DATA` object is designed to be easily extracted to a separate `data.json` file. When standings finalize, the app can be converted to fetch data from JSON instead of having it inline.

## Source Data

Standings sourced from USPHL Excel files (Feb 2026 snapshot). Playoff formats from official USPHL documentation and the NCDC Playoffs schedule.

## Exclusions

- Western/Alberta Premier teams excluded from brackets
- Connecticut RoughRiders excluded from brackets
