import { readFileSync, writeFileSync, copyFileSync } from 'fs';

const state = JSON.parse(readFileSync('data/bracket-state-initial.json', 'utf8'));
const ab = state.Premier.Alberta;

// =============================================
// 1. NORTH POD - Update game 3 score + standings
// =============================================
const northRR = ab.roundRobin.North;

// Game 3: OLCN 8-5 Three Hills (game_id 23395, Mar 22)
northRR.games[2].home_score = 8;
northRR.games[2].away_score = 5;
northRR.games[2].game_status = 'final';

// North standings (all 3 games complete):
// OLCN: beat Hanna 11-6, beat Three Hills 8-5 => 2-0
// Hanna: beat Three Hills 10-4, lost to OLCN 6-11 => 1-1
// Three Hills: lost 4-10, lost 5-8 => 0-2
northRR.standings = [
  { name: 'OLCN Scouts', w: 2, l: 0, gf: 19, ga: 11, pts: 4 },
  { name: 'Hanna Havoc', w: 1, l: 1, gf: 16, ga: 15, pts: 2 },
  { name: 'Three Hills Titans', w: 0, l: 2, gf: 9, ga: 18, pts: 0 }
];

// =============================================
// 2. SOUTH POD - Add games 2,3 scores + standings
// =============================================
const southRR = ab.roundRobin.South;

// Game 1 (23400): DV vs SA - forfeit preserved as-is (SA 1-0 DV)

// Game 2 (23401): DV(home in state) vs Calgary(away in state)
// API: Calgary(home)=9, DV(away)=1
// State order: home=DV => DV=1, Calgary=9
southRR.games[1].home_score = 1;
southRR.games[1].away_score = 9;
southRR.games[1].game_status = 'final';

// Game 3 (23402): Calgary(home in state) vs SA(away in state)
// API: SA(home)=0, Calgary(away)=4
// State order: home=Calgary => Calgary=4, SA=0
southRR.games[2].home_score = 4;
southRR.games[2].away_score = 0;
southRR.games[2].game_status = 'final';

// South standings:
// Calgary: beat DV 9-1, beat SA 4-0 => 2-0
// SA: forfeit W over DV 1-0, lost to Calgary 0-4 => 1-1
// DV: forfeit L to SA 0-1, lost to Calgary 1-9 => 0-2
southRR.standings = [
  { name: 'Calgary Bandits', w: 2, l: 0, gf: 13, ga: 1, pts: 4 },
  { name: 'Southern Alberta Mustangs', w: 1, l: 1, gf: 1, ga: 4, pts: 2 },
  { name: 'Diamond Valley Rockies', w: 0, l: 2, gf: 1, ga: 10, pts: 0 }
];

// =============================================
// 3. FIX POD ELIMINATION - Wrong teams + add results
// =============================================

// r0-m0: North Elim - should be #3 Three Hills vs #2 Hanna (was incorrectly OLCN vs Hanna)
// API game 23571: Three Hills @ Hanna => Hanna 5-1
const elimN = ab.rounds[0].matchups[0];
elimN.homeSeed = 'N_2';
elimN.awaySeed = 'N_3';
elimN.homeTeamId = '2300';
elimN.awayTeamId = '2302';
elimN.homeTeamName = 'Hanna Havoc';
elimN.awayTeamName = 'Three Hills Titans';
elimN.homeWins = 1;
elimN.awayWins = 0;
elimN.status = 'completed';
elimN.winnerId = '2300';
elimN.winnerName = 'Hanna Havoc';
elimN.games = [{
  game_id: '23571', date: '2026-03-23', time: '5:00 PM',
  location: 'Hanna', home_team: 'Hanna Havoc', away_team: 'Three Hills Titans',
  home_score: 5, away_score: 1, game_status: 'final'
}];
elimN.note = 'Single elimination game';

// r0-m1: South Elim - #3 DV Rockies vs #2 SA Mustangs
// API game 23403: SA Mustangs @ DV Rockies => DV 6-3
const elimS = ab.rounds[0].matchups[1];
elimS.homeWins = 1;
elimS.awayWins = 0;
elimS.status = 'completed';
elimS.winnerId = '2299';
elimS.winnerName = 'Diamond Valley Rockies';
elimS.games = [{
  game_id: '23403', date: '2026-03-23', time: '7:45 PM',
  location: 'Max Bell Centre', home_team: 'Diamond Valley Rockies', away_team: 'Southern Alberta Mustangs',
  home_score: 6, away_score: 3, game_status: 'final'
}];
elimS.note = 'Single elimination game';

// =============================================
// 4. ADVANCE WINNERS INTO CROSSOVER
// =============================================

// Crossover r1-m0: South Elim Winner (DV Rockies) vs North #1 (OLCN)
const cross0 = ab.rounds[1].matchups[0];
cross0.homeTeamId = '2375';
cross0.awayTeamId = '2299';
cross0.homeTeamName = 'OLCN Scouts';
cross0.awayTeamName = 'Diamond Valley Rockies';
cross0.homeSeed = 'N_1';
cross0.awaySeed = 'S_elim';
cross0.games = [{
  game_id: '23404', date: '2026-03-26', time: '1:00 AM',
  location: 'TBD', home_team: 'OLCN Scouts', away_team: 'Diamond Valley Rockies',
  home_score: null, away_score: null, game_status: 'scheduled'
}];

// Crossover r1-m1: North Elim Winner (Hanna) vs South #1 (Calgary)
const cross1 = ab.rounds[1].matchups[1];
cross1.homeTeamId = '2331';
cross1.awayTeamId = '2300';
cross1.homeTeamName = 'Calgary Bandits';
cross1.awayTeamName = 'Hanna Havoc';
cross1.homeSeed = 'S_1';
cross1.awaySeed = 'N_elim';
cross1.games = [{
  game_id: '23397', date: '2026-03-26', time: '6:15 PM',
  location: 'TBD', home_team: 'Calgary Bandits', away_team: 'Hanna Havoc',
  home_score: null, away_score: null, game_status: 'scheduled'
}];

// =============================================
// SAVE
// =============================================
writeFileSync('data/bracket-state-initial.json', JSON.stringify(state, null, 2));
copyFileSync('data/bracket-state-initial.json', 'public/data/bracket-state-initial.json');

console.log('Alberta division fully updated:');
console.log('  North pod: all 3 games final, standings updated');
console.log('  South pod: games 2-3 scored, standings updated (forfeit preserved)');
console.log('  North Elim: Fixed teams (Three Hills vs Hanna), Hanna wins 5-1');
console.log('  South Elim: DV Rockies 6-3 SA Mustangs');
console.log('  Crossover 1: OLCN vs DV Rockies (Mar 26)');
console.log('  Crossover 2: Calgary vs Hanna (Mar 26)');
