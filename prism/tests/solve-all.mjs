// Proves every level (and 200 generated daily seeds) solvable. Run: node prism/tests/solve-all.mjs [--skip-daily]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const Levels = require('../js/levels.js');

let failures = 0;
const pad = (s, n) => String(s).padEnd(n);
console.log('LEVEL                     size  tray  par  solver          nodes    ms  authored-solution');
console.log('-------------------------------------------------------------------------------------------');
let totalMs = 0;
for (let i = 0; i < Levels.count; i++) {
  const lv = Levels.build(i);
  const authored = Core.trace(lv.w, lv.h, lv.solved).ok;
  const initial = Core.trace(lv.w, lv.h, lv.cells).ok;
  const r = Core.solve(lv);
  totalMs += r.ms;
  const verdict = r.solved ? (r.optimal ? `optimal ${r.moves.length}` : `found ${r.moves.length}`) : 'UNSOLVED';
  const bad = !authored || initial || !r.solved;
  if (bad) failures++;
  const note = r.solved && r.optimal && r.moves.length < lv.par ? `  (solver beats authored par ${lv.par})` : '';
  console.log(`${pad(String(i + 1).padStart(2, '0') + ' ' + lv.name, 25)} ${pad(lv.w + 'x' + lv.h, 5)} ${pad(lv.tray.length, 5)} ${pad(lv.par, 4)} ${pad(verdict, 15)} ${pad(r.nodes, 8)} ${pad(r.ms, 5)} ${authored ? 'ok' : 'BROKEN'}${initial ? '  ALREADY SOLVED AT START' : ''}${note}`);
}
console.log(`\nlevels: ${Levels.count - failures}/${Levels.count} proven solvable (${totalMs} ms of search)`);

if (!process.argv.includes('--skip-daily')) {
  let ok = 0, slow = 0, maxMs = 0, sumMoves = 0, sumPar = 0, bfs = 0, dfs = 0;
  const t0 = Date.now(), base = new Date(2026, 0, 1), bad = [];
  for (let i = 0; i < 200; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const key = Core.dailyKey(d);
    const lv = Core.generate('prism-daily-' + key, Core.DAILY_OPTS);
    const r = Core.solve(lv, { ms: 4000 });
    if (r.solved) { ok++; sumMoves += r.moves.length; sumPar += lv.par; r.optimal ? bfs++ : dfs++; } else bad.push(key);
    maxMs = Math.max(maxMs, r.ms); if (r.ms > 1500) slow++;
  }
  console.log(`daily seeds: ${ok}/200 generated and solved (${bfs} move-optimal BFS, ${dfs} DFS), avg solver length ${(sumMoves / ok).toFixed(1)} vs avg par ${(sumPar / ok).toFixed(1)}, slowest ${maxMs} ms, ${slow} over 1.5 s, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (bad.length) { console.log('  unsolved:', bad.join(', ')); failures += bad.length; }
  // endless mode sanity: a spread of difficulties
  let eok = 0; for (let n = 0; n < 12; n++) { const lv = Core.generate('endless-' + n, Core.endlessOpts(n)); if (Core.solve(lv, { ms: 4000 }).solved) eok++; }
  console.log(`endless seeds: ${eok}/12 solved across the difficulty ramp`);
  if (eok < 12) failures++;
}
process.exit(failures ? 1 : 0);
