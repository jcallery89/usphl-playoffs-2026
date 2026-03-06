# USPHL Playoff Brackets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-page HTML app displaying playoff brackets, standings, and schedules for NCDC, Premier, and Elite USPHL leagues.

**Architecture:** Single self-contained HTML file. All standings data lives in a `LEAGUE_DATA` JS object at the top (designed for future extraction to JSON). Rendering logic builds standings tables, CSS bracket diagrams, and schedule tables from this data. Tab-based navigation between leagues, pill-based division selection within each league.

**Tech Stack:** Vanilla HTML/CSS/JS, no dependencies. CSS Grid/Flexbox for bracket layout. No build tools.

**Source Data Files:**
- `C:\Users\jcall\OneDrive\Desktop\Standings 2-18.xlsx` (team standings)
- `C:\Users\jcall\OneDrive\Desktop\NCDC Playoffs 3-5.xlsx` (NCDC playoff schedule/rinks)

---

## Task 1: HTML Shell + CSS Foundation

**Files:**
- Create: `C:\Users\jcall\Documents\CLAUDE PROJECTS\USPHL Playoffs\usphl-playoffs-2026.html`

**Step 1: Create the HTML file with shell structure**

Build the complete HTML document with:
- Document head with title "2025-26 USPHL Playoffs"
- Header bar with title
- League tab buttons: NCDC | Premier | Elite
- Division pill container (populated dynamically)
- Content areas: standings-container, bracket-container, schedule-container
- Empty `<script>` block for LEAGUE_DATA (placeholder)
- Empty `<script>` block for rendering logic (placeholder)

**Step 2: Add CSS styles**

All styles in a single `<style>` block:
- Dark background (#1a1a2e or similar dark navy), light text
- Tab buttons styled as toggleable pills with active state
- Division pills: horizontal scrollable row, smaller than tabs
- Standings table: striped rows, qualifying teams get subtle green-tinted background, eliminated teams get dimmed opacity
- Bracket containers: CSS grid layout for matchup boxes
- Matchup box: bordered card with team names, series info, connecting lines via CSS borders/pseudo-elements
- Schedule table: compact, alternating rows
- "If Necessary" games styled with italic/dimmed text
- Print media query: white background, black text, hide tabs
- Responsive: stack bracket columns on narrow screens

**Step 3: Add tab switching and division pill logic**

JavaScript to:
- Switch active league tab (show/hide content)
- Populate division pills based on selected league
- Switch active division within a league
- Wire up click handlers

**Step 4: Verify in browser**

Open file in browser. Verify:
- Dark theme renders
- Three tabs switch properly
- Division pills appear (placeholder data is fine)
- Layout is clean and readable

---

## Task 2: Premier Standings Data

**Files:**
- Modify: `usphl-playoffs-2026.html` (LEAGUE_DATA script block)

**Step 1: Add Premier division data to LEAGUE_DATA**

Transcribe all 10 Premier divisions from the Excel data. Each division needs:
- `teams` array sorted by PTS% (seed order), each team object: `{ seed, name, gp, pts, row, l, t, otw, otl, sow, sol, pctg }`
- `qualifyCount` (number of teams that make playoffs)
- `playoffFormat` object defining rounds and matchups

**Divisions and their teams (from Excel, sorted by PTS%):**

**Atlantic** (8 qualify):
1. West Chester Wolves (.841), 2. Red Bank Generals (.795), 3. Connecticut Junior Rangers (.744), 4. P.A.L. Jr Islanders (.705), 5. Wilkes-Barre Scranton Knights (.602), 6. Mercer Chiefs (.581), 7. Rockets Hockey Club (.384), 8. Hershey Cubs (.330)
Eliminated: Jersey Hitmen (.205), New Jersey Renegades (.140)

**Florida** (5 qualify):
1. Coral Springs Jr. Cats (.674), 2. Florida Eels (.614), 3. Tampa Bay Juniors (.593), 4. Florida Junior Blades (.318), 5. Typhoon Hockey Club (.273)
Eliminated: Bold City Battalion (.000)

**Great Lakes** (6 qualify):
1. Toledo Cherokee (.852), 2. Metro Jets (.830), 3. Red River Spartans (.795), 4. Columbus Mavericks (.727), 5. Battle Creek Kernels (.352), 6. Fresh Coast Freeze (.307)
Eliminated: Cincinnati Cyclones (.273), Bearcat Hockey Club (.140)

**Midwest** (5 qualify):
1. Fort Wayne Spacemen (.750), 2. Chicago T-Rex (.477), 3. MJDP (.466), 4. Chicago Cougars (.432), 5. Chicago Crush (.239)

**New England** (7 qualify):
1. Northern Cyclones (.864), 2. Islanders Hockey Club (.761), 3. South Shore Kings (.682), 4. Utica Jr Comets (.602), 5. Boston Jr. Rangers (.557), 6. Worcester Railers JHC (.557), 7. Springfield Pics (.250)
Eliminated: Thunder Hockey Club (.040)

**North** (7 qualify):
1. Minnesota Squatch (.884), 2. Wisconsin Rapids Riverkings (.756), 3. Northwest Express (.733), 4. Minnesota Blue Ox (.640), 5. Steele County Blades (.453), 6. Minnesota Mullets (.267), 7. Hudson Havoc (.128)
Eliminated: Minnesota Outlaws (.067)

**Northwest** (4 qualify, 2 pods):
PNW Pod: 1. Seattle Totems (.807), 2. Bremerton Sockeyes (.500)
MTN Pod: 1. Vernal Oilers (.955), 2. McCall Smokejumpers (.554)
Eliminated: Iron County Yeti (.398), Colorado Fighting Elk (.011), Rogue Valley Royals (.102)

**Pacific** (4 qualify):
1. Fresno Monsters (.815), 2. Henderson Force (.804), 3. Ontario Jr Reign (.783), 4. Ventura Vikings (.598)
Eliminated: Long Beach Bombers (.380), San Diego Sabers (.304), Lake Tahoe Lakers (.207)

**Southeast** (5 qualify):
1. Hampton Roads Whalers (.821), 2. Potomac Patriots (.761), 3. Charlotte Rush (.568), 4. Charleston Colonials (.466), 5. Carolina Junior Hurricanes (.369)

**St. Lawrence** (8 qualify):
1. Hawkesbury Knights (.773), 2. Montreal Black Vees (.686), 3. Somang Hockey (.648), 4. St-Lazare Avalanche (.580), 5. Universel College Gatineau (.568), 6. Universel Sherbrooke (.443), 7. New York Dynamo (.432), 8. Kingston Wranglers (.198)
Eliminated: Ottawa Valley Centennials (.148)

**Step 2: Add playoff format definitions for each Premier division**

Each division's `playoffFormat` object contains:
- `seriesFormat`: "Bo3" for all Premier
- `rounds`: array of round objects, each with `name`, `matchups` (array of `[home_seed, away_seed]`), `byes` (array of seeds with byes)
- Special notes for hosting (e.g., Florida at Tampa, Southeast at Pineville)

Use the exact format structures from the design doc.

**Step 3: Verify data loads without JS errors**

Open browser console, confirm `LEAGUE_DATA.premier` object has 10 divisions with correct team counts.

---

## Task 3: Elite Standings Data

**Files:**
- Modify: `usphl-playoffs-2026.html` (LEAGUE_DATA script block)

**Step 1: Add Elite division data to LEAGUE_DATA**

5 divisions from the Excel:

**Atlantic** (6 qualify):
1. Wilkes-Barre Scranton Knights (.727), 2. Hershey Cubs (.593), 3. Connecticut Junior Rangers (.464), 4. Red Bank Generals (.443), 5. P.A.L. Jr Islanders (.419), 6. Atlanta Mad Hatters (.291)
Note: Elmira Impact (27 GP, .648) appears to have a partial season -- include with note

**Florida** (5 qualify):
1. Tampa Bay Juniors (.810), 2. Coral Springs Jr. Cats (.655), 3. Florida Junior Blades (.558), 4. Florida Eels (.488), 5. Typhoon Hockey Club (.163)
Eliminated: Bold City Battalion (.000)

**Midwest** (5 qualify):
1. Chicago Crush (.909), 2. Fort Wayne Spacemen (.659), 3. Metro Jets Elite (.648), 4. Chicago T-Rex (.244), 5. Chicago Cougars (.114)

**New England** (5 qualify):
From the "Junior New England" section with 44-game teams:
1. Northern Cyclones (.875), 2. Montreal Knights (.845), 3. Islanders Hockey Club (.477), 4. South Shore Kings (.318), 5. Springfield Pics (.302)
Note: New England Wolves has partial season data

**Southeast** (5 qualify):
1. Carolina Junior Hurricanes (.881), 2. Hampton Roads Whalers (.845), 3. Charlotte Rush (.545), 4. Potomac Patriots (.375), 5. Charleston Colonials (.250)

**Step 2: Add playoff format definitions for each Elite division**

Same structure as Premier but with Elite-specific formats (e.g., Elite NE has single-game play-in instead of Bo3).

**Step 3: Verify data loads without JS errors**

---

## Task 4: NCDC Standings Data

**Files:**
- Modify: `usphl-playoffs-2026.html` (LEAGUE_DATA script block)

**Step 1: Add NCDC conference/division data to LEAGUE_DATA**

NCDC uses a conference > division hierarchy:

**Atlantic Conference** (top 5 qualify):
1. P.A.L. Junior Islanders (.728), 2. Jersey Hitmen (.667), 3. Rockets Hockey Club (.628), 4. Mercer Chiefs (.554), 5. Connecticut Junior Rangers (.489)
Eliminated: Wilkes-Barre Scranton Knights (.479), West Chester Wolves (.448)

**New England Conference - Central Division** (top 4 qualify):
1. Utica Jr Comets (.830), 2. Boston Jr. Rangers (.713), 3. Boston Junior Bruins (.600), 4. Worcester Railers JHC (.628)
Eliminated: Springfield Pics (.404), New York Dynamo (.396)
Note: Seeds 2-4 need to be sorted correctly by PTS% -- Rangers (.713), Railers (.628), Bruins (.600)

**New England Conference - East Division** (top 4 qualify):
1. South Shore Kings (.865), 2. Islanders Hockey Club (.750), 3. Northern Cyclones (.646), 4. TBD (Thunder .426, Boston Dogs .385, Universel Academy .330 -- fighting for last spot)
Eliminated: Bottom 2 of Thunder/Dogs/UA

**New England Conference - North Division** (top 4 qualify):
1. Lewiston MAINEiacs (.765), 2. Universel Quebec (.491), 3. Woodstock NB Slammers (.481), 4. TBD (CT Chiefs .396, Northern Maine .353, St. Stephen County Moose .255 -- fighting for last spot)
Eliminated: Bottom 2 of Chiefs/Pioneers/Moose

**Mountain Conference** (top 4 qualify):
1. Ogden Mustangs (.783), 2. Idaho Falls Spud Kings (.773), 3. TBD among Grand Junction (.604), Utah (.587), Pueblo (.489)
4. TBD
Eliminated: Rock Springs Miners (.359), Casper Warbirds (.163)

**Step 2: Add NCDC playoff format definitions**

- Atlantic: Play-In (Bo3, #4 hosts #5) -> Semis (Bo5, 1vPI winner, 2v3) -> Final (Bo5)
- NE divisions: Div Semis (Bo5, 1v4, 2v3) -> Div Finals (Bo5)
- NE Conference: Round Robin (3 div winners, hosted by #1 seed) -> Conference Final (Bo3, top 2 from RR)
- Mountain: Semis (Bo5, 1v4, 2v3) -> Final (Bo5)

**Step 3: Add NCDC playoff schedule data**

From `NCDC Playoffs 3-5.xlsx`, include the full game-by-game schedule with dates and rinks where known:
- Atlantic Play-In: Mar 24-26
- NE Division Semis: Mar 21-28
- Atlantic/NE Division Finals: Mar 30 - Apr 6/7
- NE Conference Round Robin: Apr 9-11
- NE Conference Final: Apr 14-16
- Mountain Semis: Mar 31 - Apr 7
- Mountain Final: Apr 10-18

**Step 4: Add Dineen Cup data**

4-team modified double-elimination schedule (Apr 22-28) with game descriptions.

**Step 5: Verify data loads without JS errors**

---

## Task 5: Standings Table Renderer

**Files:**
- Modify: `usphl-playoffs-2026.html` (rendering script block)

**Step 1: Write renderStandings function**

`renderStandings(teams, qualifyCount)` builds an HTML table:
- Columns: Seed, Team, GP, PTS, ROW, L, PTS%
- Rows for each team, sorted by seed
- Teams with seed <= qualifyCount get `.qualified` CSS class (green-tinted background)
- Teams with seed > qualifyCount get `.eliminated` CSS class (dimmed)
- PTS% displayed as 3-decimal (e.g., ".728")

**Step 2: Wire up to division selection**

When a division pill is clicked:
- Look up the division data from LEAGUE_DATA
- Call renderStandings with the correct teams and qualifyCount
- Insert into standings-container

**Step 3: Handle NCDC's conference structure**

For NCDC, division pills should be: "Atlantic", "NE Central", "NE East", "NE North", "Mountain", "Dineen Cup"
When "NE Central/East/North" selected, show that division's standings.

**Step 4: Verify in browser**

Click through all tabs and divisions, verify standings tables render correctly with proper highlighting.

---

## Task 6: Bracket Diagram Renderer

**Files:**
- Modify: `usphl-playoffs-2026.html` (rendering script block + CSS)

**Step 1: Add bracket CSS**

CSS for bracket visualization:
- `.bracket` container uses CSS grid
- `.round` column for each round
- `.matchup` card: bordered box with two team slots, series format label, round name
- `.connector` lines: CSS borders/pseudo-elements connecting matchup winners to next round
- `.bye` indicator for teams with first-round byes
- Responsive: horizontal scroll on narrow screens

**Step 2: Write renderBracket function**

`renderBracket(playoffFormat, teams)` builds the bracket HTML:
- For each round in the playoff format:
  - Create a column
  - For each matchup, create a matchup card with:
    - Home team name (looked up by seed from teams array) or "TBD"
    - Away team name or "TBD"
    - Series format (Bo3/Bo5)
    - Round name and date range
- For byes, show the team advancing directly to next round
- Connect matchups to their next-round destinations with lines

**Step 3: Handle special bracket shapes**

Different division formats create different bracket shapes:
- **8-team bracket** (Premier Atlantic, St. Lawrence): 3 rounds, 4-2-1 matchups
- **7-team bracket** (Premier NE, North): 3 rounds with #1 bye, 3-2-1 matchups
- **6-team bracket** (Premier Great Lakes, Elite Atlantic): 3 rounds with #1-2 bye
- **5-team bracket** (Florida, Southeast, Midwest): Play-in + 2 rounds
- **4-team bracket** (Pacific, Mountain): 2 rounds, 2-1 matchups
- **2-pod bracket** (Northwest): 2 pod matchups feeding into final

Each format should render cleanly with appropriate spacing.

**Step 4: Wire up to division selection**

When division changes, render the bracket alongside the standings table.

**Step 5: Verify all bracket shapes render**

Click through every division across all 3 leagues, verify bracket diagrams look correct.

---

## Task 7: Schedule Table Renderer

**Files:**
- Modify: `usphl-playoffs-2026.html` (rendering script block)

**Step 1: Write renderSchedule function**

`renderSchedule(schedule)` builds a schedule table:
- Columns: Round, Game, Date, Time, Home, Away, Rink
- "If Necessary" games styled with `.if-necessary` class (italic, slightly dimmed)
- Group rows by round with subtle separators

**Step 2: Populate NCDC schedules from Excel data**

The NCDC Playoffs Excel has detailed game-by-game schedules with dates and some rink assignments. Include all of this in the schedule data and render it.

**Step 3: Add placeholder schedules for Premier and Elite**

For Premier and Elite, schedule data is less detailed. Show the round structure with date ranges where provided (Florida/Southeast have specific dates and times). Other divisions show "Dates TBD" or the general date ranges.

**Step 4: Wire up to division selection**

Schedule table appears below the bracket diagram.

**Step 5: Verify schedules render**

Check NCDC schedules show full detail, Premier/Elite show available info.

---

## Task 8: NCDC Special Cases

**Files:**
- Modify: `usphl-playoffs-2026.html` (rendering script block + CSS)

**Step 1: New England Conference combined view**

When "NE Conference" is selected (or after viewing a NE division), show:
- All 3 division brackets side by side (or stacked)
- Below them: Conference Round Robin schedule (Apr 9-11)
- Below that: Conference Final bracket (Bo3, Apr 14-16)
- Label: "3 Division Winners → Round Robin → Conference Final"

**Step 2: Dineen Cup view**

When "Dineen Cup" is selected, show:
- 4-team modified double-elimination diagram
- Teams: Atlantic Champ, Mountain Champ, NE Champ, Idaho Falls (Host)
- Game-by-game schedule with dates and times (Apr 22-28)
- Show the record-based progression (0-1 vs 0-1, 1-0 vs 1-0, etc.)

**Step 3: Verify special views render**

---

## Task 9: Polish and Final Verification

**Files:**
- Modify: `usphl-playoffs-2026.html`

**Step 1: Typography and spacing cleanup**

- Consistent font sizes across tables and brackets
- Proper spacing between sections
- Team names don't overflow their containers

**Step 2: Print styles**

- White background, dark text
- Hide tab navigation (print all divisions or selected)
- Page breaks between divisions

**Step 3: Default view**

- Page loads with NCDC tab active, Atlantic division selected
- First meaningful content visible immediately

**Step 4: Full walkthrough**

Open in browser and click through every single division in every league:
- NCDC: Atlantic, NE Central, NE East, NE North, NE Conference, Mountain, Dineen Cup
- Premier: All 10 divisions
- Elite: All 5 divisions

Verify: standings correct, brackets match format, schedules present, no JS errors in console.

---

## Notes

- **TBD teams**: Where playoff spots aren't clinched yet (per coworker's email), show the team name with a "(clinch pending)" or similar note, or show the current projected seed
- **Approach 3 migration**: The LEAGUE_DATA object at the top of the file is the only thing that moves to `data.json`. All rendering code stays in the HTML. To migrate: cut LEAGUE_DATA, save as JSON, replace with `fetch('data.json').then(...)`.
- **Data updates**: When standings change, only the team arrays in LEAGUE_DATA need updating (new PTS, PTS%, seed reordering). The playoff format objects don't change.
