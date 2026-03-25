import { readFileSync, writeFileSync, copyFileSync } from 'fs';

const state = JSON.parse(readFileSync('data/bracket-state-initial.json', 'utf8'));
const nat = state.Elite.Nationals;

// Build label -> team name mapping
const labelMap = {};

// Seeds: "Elite Seed #1" -> "Carolina Junior Hurricanes", etc.
for (const s of nat.nationalSeeds) {
  labelMap[`Elite Seed #${s.seed}`] = s.teamName;
}

// Wild cards: "Elite Wild Card" -> "Montreal Knights"
for (const wc of nat.wildCards) {
  labelMap[wc.label] = wc.teamName;
}

console.log('Label mapping:');
for (const [label, name] of Object.entries(labelMap)) {
  console.log(`  ${label} -> ${name}`);
}

// Replace all placeholders in the schedule
let replaced = 0;
for (const day of nat.days) {
  for (const game of day.games) {
    if (labelMap[game.home]) {
      console.log(`  ${day.date}: home "${game.home}" -> "${labelMap[game.home]}"`);
      game.home = labelMap[game.home];
      replaced++;
    }
    if (labelMap[game.away]) {
      console.log(`  ${day.date}: away "${game.away}" -> "${labelMap[game.away]}"`);
      game.away = labelMap[game.away];
      replaced++;
    }
  }
}

console.log(`\nReplaced ${replaced} placeholder labels with team names.`);

writeFileSync('data/bracket-state-initial.json', JSON.stringify(state, null, 2));
copyFileSync('data/bracket-state-initial.json', 'public/data/bracket-state-initial.json');
console.log('State saved to data/ and public/data/');
