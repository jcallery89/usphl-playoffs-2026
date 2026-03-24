# USPHL Playoffs 2026 — Session Handoff

## Branch

`claude/fix-playoff-advancement-9w4xu`

## What Was Done This Session

### 1. Premier Nationals — Full Tournament Setup
- Added all 12 teams (10 division champions + 2 wild cards) with official seedings from George Kelly
- Configured 3 pools (A, B, C) with 4 teams each
- Added complete pod play schedule: 18 games across Wed Mar 25 – Fri Mar 27
- Added Semifinal and Championship placeholder matchups (Sat/Sun Mar 28–29)
- All games at Ice Vault, Wayne, NJ with rink and time assignments

### 2. Elite Nationals — Seedings & Placeholder Schedule
- Added 6 teams: Carolina #1, Northern Cyclones #2, Tampa Bay #3, WBS Knights #4, Fort Wayne #5, Montreal Knights (Wild Card)
- Schedule games use **placeholder labels** (e.g., "Elite Seed #1", "Elite Wild Card") — user requested keeping these until official matchup details are confirmed
- 15 round-robin games across 3 days + Semifinals + Championship

### 3. Nationals Seedings Display (New Feature)
- Added a visual grid showing all seeded teams with:
  - Seed number in red (#1, #2, ... or WC)
  - Team logo (32px)
  - Team name linked to USPHL profile
  - Division and pool assignment
- Works for both Premier (12 teams with pool labels) and Elite (6 teams)
- Renders between the format info banner and the pod groupings

### 4. Home Team Indicator
- Added `(H)` label next to the **second-listed team** (higher seed = home) in:
  - Schedule view (all pod play games)
  - Bracket view (semifinals and championship)
- Styled as subtle gray text so it doesn't overpower team names

### 5. Alberta Division Updates
- Updated scores for Alberta North pod (Hanna vs Three Hills, OLCN vs Hanna)
- Updated South pod forfeit result (SA Mustangs 1-0 DV Rockies)

### 6. Various Fixes
- Fixed broken JSON after NCDC key was accidentally removed
- Removed Elite `seeds` array that was causing premature team name resolution in placeholder games
- Ensured `bracket-config.json` and `bracket-state-initial.json` include full Nationals tournament structure

## Key Architecture Notes

### Nationals Data Flow
- **Config** (`data/bracket-config.json`): defines tournament format, pod structure, and schedule template
- **State** (`data/bracket-state-initial.json`): holds actual seedings (`nationalSeeds`), wild cards (`wildCards`), pod assignments (`pods`), game schedule (`days`), and champion
- **Rendering** (`public/index.html` → `renderNationalsBracket()`): reads state, resolves labels via `resolveNationalsLabel()`, displays seedings grid + pods + bracket

### How Team Resolution Works for Nationals
- `resolveNationalsLabel(nat, label)` checks `nat.wildCards[].label` and `nat.seeds[].label` to map placeholder strings → actual team names
- Elite games intentionally use labels like `"Elite Seed #1"` that do NOT match any seed/wildcard label, so they display as-is (placeholder behavior)
- Premier games use actual team names directly in the `home`/`away` fields (already resolved)

### Files Changed
| File | Purpose |
|------|---------|
| `data/bracket-config.json` | Tournament format definitions |
| `data/bracket-state-initial.json` | Live bracket state with seeds, games, results |
| `public/index.html` | Main app — rendering logic, CSS, all UI |
| `public/data/*` | Copies of data files served to the frontend |
| `scripts/patch-nationals.js` | Script to update Nationals data |

## Pending / Open Items

1. **Elite Nationals schedule labels** — Currently placeholders. Once the user confirms official game-by-game matchups, replace placeholder labels in `bracket-state-initial.json` `days[].games[].home/away` with actual team names (like Premier already has)
2. **Elite semifinal seeding** — Semifinals currently show `Elite Seed #4 vs Elite Seed #1` etc. The user needs to confirm whether these are the actual semifinal matchups or if they're determined by round-robin standings
3. **Nationals standings/results** — No game results have been entered yet for either Premier or Elite Nationals. The standings view (`renderNationalsStandings`) currently shows pool rosters only
4. **Premier Nationals champion** — `"champion": null` in state — update once tournament concludes
