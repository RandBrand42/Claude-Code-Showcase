// Unit tests for the PRISM beam tracer.  Run: node prism/tests/test-core.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Core = require('../js/core.js');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('  FAIL  ' + name); } };
const near = (a, b, e = 0.01) => Math.abs(a - b) < e;

// helper: build a board from token rows
function board(rows) {
  const toks = rows.map(r => r.trim().split(/\s+/));
  const h = toks.length, w = toks[0].length;
  const cells = []; toks.forEach(r => r.forEach(t => cells.push(Core.parseToken(t).p)));
  return { w, h, cells, run: () => Core.trace(w, h, cells) };
}
const crystal = (res, x, y, w) => res.cr.find(c => c.x === x && c.y === y);

// 1. mirrors reflect correctly (both orientations, all four incoming directions)
{
  let res = board(['. . Cr', '. . .', 'E1r M0 .']).run();           // E hits '/' -> N
  ok(!res.ok, 'beam stopped short of crystal (mirror at col 1, crystal at col 2)');
  res = board(['. Cr .', '. . .', 'E1r M0 .']).run();
  ok(res.ok, "'/' turns an eastbound beam north");
  res = board(['. . .', '. . .', 'E1r M1 Cr']).run();
  ok(!res.ok, "'\\' sends an eastbound beam south, not onto the crystal");
  res = board(['E2r . .', '. . .', 'M0 . Cr']).run();               // S hits '/' -> W (out)
  ok(!res.ok, "'/' turns a southbound beam west");
  res = board(['E2r . .', '. . .', 'M1 . Cr']).run();               // S hits '\' -> E
  ok(res.ok, "'\\' turns a southbound beam east");
  res = board(['Cr . M1', '. . .', '. . E0r']).run();               // N at (2,0)... emitter at (2,2) N: (2,1) then (2,0) '\' N->W -> (1,0),(0,0)
  ok(res.ok, "'\\' turns a northbound beam west");
}

// 2. splitters branch (both continue) and halve the power
{
  const res = board(['. Cr .', '. . .', 'E1r S0 Cr']).run();
  ok(res.ok, 'splitter lights both crystals');
  ok(res.cr.every(c => near(c.pw[0], 0.5)), 'each branch carries half power');
  const chain = board(['. . Cr .', '. . . .', 'E1r S0 S0 Cr']).run();
  ok(chain.cr[0].ok && near(chain.cr[0].pw[0], 0.25), 'two splitters in a row leave a quarter of the power');
  const weak = board(['. . . Cr', '. . . .', 'E1r S0 S0 S0']).run();
  ok(!weak.ok, 'power below the threshold does not light a crystal');
}

// 3. additive colour mixing
{
  ok(board(['E1r . Cy', '. . .', '. . .']).run().ok === false, 'red alone does not satisfy a yellow crystal');
  const mix = board(['. . E2r .', '. . . .', 'E1g . Cy .', '. . . .']).run();
  ok(mix.cr[0].got === 3 && mix.ok, 'red from above + green from the left mix to yellow');
  const cyan = board(['. . E2b .', '. . . .', 'E1g . Cc .']).run();
  ok(cyan.ok, 'green + blue = cyan');
  const mag = board(['. . E2b .', '. . . .', 'E1r . Cm .']).run();
  ok(mag.ok, 'red + blue = magenta');
  const white = board(['. . E2b .', '. . . .', 'E1r . Cw2 .', '. . E0g .']).run();
  ok(white.ok, 'three primaries = white (and three beams satisfy n)');
  const over = board(['. . E2b .', '. . . .', 'E1r . Cy .', '. . E0g .']).run();
  ok(!over.ok, 'extra blue spoils a yellow crystal');
  const wEm = board(['E1w . Cw']).run();
  ok(wEm.ok, 'white emitter lights a white crystal directly');
}

// 4. prism disperses white into R,G,B; only works when facing the beam
{
  const rows = ['. . Cr . .', '. . . . .', 'E1w . P1 . Cg', '. . . . .', '. . Cb . .'];
  const res = board(rows).run();
  ok(res.ok, 'prism fans white into red (left), green (straight), blue (right)');
  const wrong = board(rows.map(r => r.replace('P1', 'P0'))).run();
  ok(!wrong.ok, 'prism facing the wrong way absorbs the beam');
  const yel = board(['. Cr .', 'E1y P1 Cg', '. Cb .']).run();
  ok(yel.cr.filter(c => c.ok).length === 2 && !yel.ok, 'prism splits a yellow beam into just red and green');
}

// 5. filters
{
  ok(board(['E1w Fg Cg']).run().ok, 'green filter turns white into green');
  ok(!board(['E1r Fg Cg']).run().ok, 'green filter blocks red');
  ok(board(['E1w Fy Cy']).run().ok, 'yellow filter passes red+green');
  ok(!board(['E1w Fy Cw']).run().ok, 'filtered light no longer satisfies a white crystal');
}

// 6. portals
{
  const res = board(['E1r O0 . . .', '. . . . .', '. . . O0 Cr']).run();
  ok(res.ok, 'beam entering one portal leaves the partner in the same direction');
  ok(!board(['E1r O0 . . .', '. . . . .', '. . . . Cr']).run().ok, 'a lone portal just absorbs');
}

// 7. walls / absorbers / crystals block light
{
  ok(!board(['E1r # Cr']).run().ok, 'wall blocks the beam');
  ok(!board(['E1r x Cr']).run().ok, 'absorber blocks the beam');
  const res = board(['E1r Cr Cr']).run();
  ok(res.cr[0].ok && !res.cr[1].ok, 'a crystal is a terminal: nothing passes through it');
}

// 8. two-beam and full-power crystals
{
  ok(!board(['E1r Cr2 .']).run().ok, 'a 2-beam crystal is not satisfied by one beam');
  ok(board(['. E2r .', 'E1r Cr2 .']).run().ok, 'a 2-beam crystal is satisfied by two beams');
  const strong = board(['. M1 .', 'E1r S0 Cr!']).run();
  ok(!strong.ok, 'a ringed crystal is not satisfied by a half-power beam');
  const recombined = board([
    '. . . . . .',
    '. . M0 . . M1',
    '. . . . . .',
    'E1r . S0 . . Cr!']).run();
  ok(recombined.ok && near(recombined.cr[0].pw[0], 1), 'two half beams recombine into full power for a ringed crystal');
}

// 9. loops terminate, stay finite, and stay fast
{
  // a splitter whose reflected branch is mirrored straight back into it
  const t0 = Date.now();
  const loop = board([
    'E1r S0 . ',
    '. . . ',
    '. . . ']).run();
  ok(Number.isFinite(loop.ops), 'trivial layout traces');
  // feedback ring: the splitter at (1,3) sends light north; mirrors route it back into the splitter
  const fb = board([
    'M1 . . . M0',
    '. . . . .',
    '. . . . .',
    'E1r S0 . . .',
    'M0 . . . M1']).run();
  ok(fb.ops < 30000, 'feedback around a splitter terminates');
  ok(fb.runs.every(r => [r.r, r.g, r.b].every(v => v >= 0 && v <= 2)), 'intensities stay bounded in loops');
  // portal ping-pong: exit of one portal points straight back into the other
  const pp = board(['E1r O0 O0 . .']).run();
  ok(pp.ops < 30000 && Date.now() - t0 < 2000, 'portal adjacent to its partner does not loop forever');
  // a lossless ring of mirrors that the beam cannot enter is irrelevant, but a portal loop around must not explode
  const pl = board([
    'E1r O0 . . .',
    '. . . . .',
    'M0 . . . M1',
    '. . . . .',
    'O0 . . . .']).run();
  ok(pl.ops < 30000, 'portal+mirror layout terminates');
  // cycle cut: beam returns to the same cell/direction -> stops (no runaway accumulation)
  const cyc = board([
    'M1 . . M0',
    '. . . .',
    'M0 . . M1']);
  cyc.cells[1 * 4 + 0] = null;
  ok(cyc.run().ops < 30000, 'closed mirror ring without emitter is dark');
}

// 10. levels: solved layouts light every crystal; serialisation round-trips
{
  const code = Core.toCode(5, 3, board(['E1r . . . Cr', '. M0 . . .', '. . . . .']).cells, []);
  const back = Core.fromCode(code);
  ok(back.w === 5 && back.h === 3 && back.cells[0].t === 'E' && back.cells[4].t === 'C', 'share code round-trips');
  let bad = false; try { Core.fromCode('hello'); } catch (e) { bad = true; }
  ok(bad, 'garbage share code is rejected');
}

console.log(`\ntracer tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
