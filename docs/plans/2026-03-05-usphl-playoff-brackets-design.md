# USPHL Playoff Brackets - Design Document

**Date:** 2026-03-05
**Status:** Approved

## Goal

Build a single-page HTML application that displays playoff brackets and schedules for all three USPHL junior hockey leagues: NCDC, Premier, and Elite. Data sourced from coworker's Excel standings files (as of Feb 18) and official playoff format documents.

## Data Sources

- `Standings 2-18.xlsx` -- Team standings across NCDC (5 divisions), Premier (10+2 divisions), Elite (6 divisions)
- `NCDC Playoffs 3-5.xlsx` -- NCDC playoff schedule template with dates, rinks, some team assignments
- User-provided playoff format descriptions for Premier (10 divisions) and Elite (5 divisions)

## Leagues & Divisions

### NCDC (Dineen Cup Playoffs)
Three conferences, five divisions:

| Conference | Division | Teams | Qualify | Format |
|---|---|---|---|---|
| Atlantic | Atlantic | 7 | Top 5 | Play-In (Bo3) -> Semis (Bo5) -> Final (Bo5) |
| New England | Central | 6 | Top 4 | Div Semis (Bo5) -> Div Finals (Bo5) -> Conf RR -> Conf Final (Bo3) |
| New England | East | 6 | Top 4 | (same as Central, feeds into NE Conference round) |
| New England | North | 6+ | Top 4 | (same as Central, feeds into NE Conference round) |
| Mountain | Mountain | 7 | Top 4 | Semis (Bo5) -> Final (Bo5) |

**Dineen Cup Championship** (Apr 22-28): 4-team modified double-elimination
- Atlantic champ, Mountain champ, New England champ, + Idaho Falls (automatic host bid)

### Premier (10 divisions, excluding Alberta/CT RoughRiders)

| Division | Format Summary |
|---|---|
| Atlantic | 8 teams: R1 (1v8,2v7,3v6,4v5) -> R2 (1v4,2v3) -> Championship. Bo3, #1 hosts all |
| Florida | 5 teams: Play-In 4v5 -> Semis (1v4,2v3) -> Championship. Bo3, Tampa host |
| Great Lakes | 6 teams: R1 3v6,4v5 (seeds 1-2 bye) -> R2 -> R3 Championship. Bo3 |
| Midwest | 5 teams: R1 4v5 (seeds 1-2-3 bye) -> R2 (2v3, 1vW) -> R3 Championship. Bo3 |
| New England | 7 teams: R1 2v7,3v6,4v5 (#1 bye) -> R2 re-seed 1v4,2v3 -> Championship. Bo3 |
| North | 7 teams: R1 2v7,3v6,4v5 (#1 bye) -> R2 re-seed 1v4,2v3 -> Championship. Bo3 |
| Northwest | 4 teams (2 pods): PNW 1v2, MTN 1v2 -> Divisional Finals. Bo3, KRACH seeding |
| Pacific | 4 teams: R1 1v4, 2v3. Bo3, higher seed hosts |
| Southeast | 5 teams: Play-In 4v5 -> Semis (1v4,2v3) -> Championship. Bo3, Pineville host |
| St. Lawrence | 8 teams: R1 (1v8,2v7,3v6,4v5) -> R2 re-seed (1v4,2v3) -> Finals. Bo3 |

### Elite (5 divisions)

| Division | Format Summary |
|---|---|
| Atlantic | 6 teams: R1 3v6,4v5 (#1-2 bye) -> R2 (1v4,2v3) -> Championship. Bo3 |
| Florida | 5 teams: Play-In 4v5 -> Semis (1v4,2v3) -> Championship. Bo3, Tampa host |
| Midwest | 5 teams: R1 4v5 (seeds 1-2-3 bye) -> R2 (2v3,1vW) -> R3 Championship. Bo3 |
| New England | 5 teams: Play-In 4v5 (single game) -> R1 (2v3, 1vW) -> Final. Bo3 |
| Southeast | 5 teams: Play-In 4v5 -> Semis (1v4,2v3) -> Championship. Bo3, Pineville host |

## Data Architecture

Single `LEAGUE_DATA` JavaScript object at top of file containing all standings and playoff structures. Designed for easy extraction to `data.json` when migrating to Approach 3.

```
LEAGUE_DATA = {
  ncdc: {
    conferences: {
      "Atlantic": { teams: [...], playoffFormat: { qualifyCount, rounds, schedule } },
      "New England": {
        divisions: { "Central": {...}, "East": {...}, "North": {...} },
        conferenceRounds: { roundRobin: {...}, conferenceFinal: {...} }
      },
      "Mountain": { teams: [...], playoffFormat: {...} }
    },
    dineenCup: { schedule: [...] }
  },
  premier: { divisions: { "Atlantic": {...}, "Florida": {...}, ... } },
  elite: { divisions: { "Atlantic": {...}, "Florida": {...}, ... } }
}
```

Each team object: `{ seed, name, gp, pts, row, l, t, otw, otl, sow, sol, pctg }`
Seeds determined by PTS% ranking within division.

## Visual Layout

### Structure
- **Header**: "2025-26 USPHL Playoffs"
- **League tabs**: NCDC | Premier | Elite
- **Division pills**: Horizontal selector within each league tab
- **Standings table**: Seed, Team, GP, PTS, ROW, L, PTS% -- qualifying teams highlighted, eliminated dimmed
- **Bracket diagram**: CSS-rendered connected boxes showing progression through rounds
- **Schedule table**: Round, Game #, Date, Home, Away, Rink, "If Necessary" flag

### Special Cases
- NCDC New England: 3 division brackets + Conference Round Robin + Conference Final
- NCDC Dineen Cup: Own section, 4-team modified double-elimination
- Premier Northwest: Two pods feeding into divisional finals
- Elite New England: Play-in is single game (not Bo3)

### Styling
- Dark background, light text (scoreboard aesthetic)
- Monochrome with accent color for qualifying vs eliminated teams
- Printable and responsive

## File Structure

### Current (Approach 1)
```
USPHL Playoffs/
  usphl-playoffs-2026.html    <-- single self-contained file
  docs/plans/                 <-- this design doc
```

### Future (Approach 3 migration)
```
USPHL Playoffs/
  index.html                  <-- rendering logic + CSS (unchanged)
  data.json                   <-- extracted LEAGUE_DATA object
```

Migration: extract `LEAGUE_DATA` to JSON, add `fetch()` call. 5-minute change.

## Excluded

- Western/Alberta Premier teams (Calgary Bandits, Three Hills Titans, etc.)
- Connecticut RoughRiders
- U18 divisions from Elite (unless requested later)
- Real-time score updates (static snapshot)
