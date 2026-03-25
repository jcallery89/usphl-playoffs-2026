const res = await fetch('https://usphl-playoffs-2026.vercel.app/api/bracket-state');
const state = await res.json();
const pa = state.Premier?.Atlantic;
if (!pa) { console.log('No Premier Atlantic found'); process.exit(0); }
console.log(JSON.stringify(pa.rounds, null, 2));
