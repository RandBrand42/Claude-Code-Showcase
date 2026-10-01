// Numerical checks for the ORBITAL engine.   Run:  node orbital/tests/physics.test.mjs
import '../js/util.js';
import '../js/physics.js';
import '../js/presets.js';
const O = globalThis.Orbital;
let failed = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + detail); if (!ok) failed++; };
const preset = (key) => O.presets.find((p) => p.key === key);

/* 1. two-body circular orbit: energy drift over 200 orbits, using the production adaptive stepper */
{
  const s = new O.Sim(); s.G = 1; s.soft = 0; s.hMax = 0.5; s.eta = 0.015; s.merge = false;
  const m2 = 0.001, M = 1, a = 1, v = Math.sqrt((M + m2) / a);
  s.addBody({ x: -a * m2 / (M + m2), y: 0, vx: 0, vy: -v * m2 / (M + m2), m: M, r: 0.01 });
  s.addBody({ x: a * M / (M + m2), y: 0, vx: 0, vy: v * M / (M + m2), m: m2, r: 0.005 });
  s.rebase(); s.drift();
  const P = 2 * Math.PI / Math.sqrt(M + m2);
  let worstE = 0, worstL = 0;
  for (let k = 0; k < 200 * 20; k++) {
    s.advance(P / 20);
    const d = s.drift(); worstE = Math.max(worstE, Math.abs(d.dE)); worstL = Math.max(worstL, Math.abs(d.dL));
  }
  check('two-body circular, 200 orbits, adaptive step', worstE < 1e-4, `max |dE/E| = ${worstE.toExponential(2)} (limit 1e-4), max |dL/L| = ${worstL.toExponential(2)}, h = P/${(P / s.lastH).toFixed(0)}`);
}

/* 2. eccentric orbit (e = 0.9): adaptive vs fixed step, same number of force evaluations ballpark */
{
  const run = (fixed) => {
    const s = new O.Sim(); s.G = 1; s.soft = 0; s.hMax = 0.05; s.eta = 0.015; s.merge = false;
    const e = 0.9, a = 1, v = Math.sqrt((1 - e) / (1 + e) / a) * 1; // at apoapsis
    s.addBody({ x: 0, y: 0, vx: 0, vy: 0, m: 1, r: 0.001 });
    s.addBody({ x: a * (1 + e), y: 0, vx: 0, vy: Math.sqrt((1 - e) / (a * (1 + e))), m: 1e-6, r: 0.0005 });
    s.rebase(); s.drift(); void v;
    let steps = 0, worst = 0;
    for (let k = 0; k < 60; k++) {
      s.advance(2 * Math.PI / 6 * 0.5, 0, fixed); steps += s.lastSteps;
      worst = Math.max(worst, Math.abs(s.drift().dE));
    }
    return { steps, worst };
  };
  const ad = run(0), fx = run(0.002);
  check('eccentric e=0.9 orbit: adaptive beats fixed step', ad.worst < fx.worst, `adaptive ${ad.worst.toExponential(2)} (${ad.steps} steps) vs fixed h=0.002 ${fx.worst.toExponential(2)} (${fx.steps} steps)`);
}

/* 3. figure-eight: stable for > 10 periods (we run 20) and returns to its start every period */
{
  const s = O.loadPreset(new O.Sim(), preset('eight')); s.merge = false;
  const T = 6.32591398, start = [...s.x.slice(0, 3), ...s.y.slice(0, 3)];
  let worstReturn = 0, worstE = 0, minSep = 9, maxR = 0;
  s.drift();
  for (let period = 1; period <= 20; period++) {
    for (let k = 0; k < 40; k++) {
      s.advance(T / 40);
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) minSep = Math.min(minSep, Math.hypot(s.x[i] - s.x[j], s.y[i] - s.y[j]));
      for (let i = 0; i < 3; i++) maxR = Math.max(maxR, Math.hypot(s.x[i], s.y[i]));
    }
    // bodies permute along the curve; compare the set of positions to the start set (nearest match)
    let err = 0;
    for (let i = 0; i < 3; i++) { let b = 9; for (let j = 0; j < 3; j++) b = Math.min(b, Math.hypot(s.x[i] - start[j], s.y[i] - start[3 + j])); err = Math.max(err, b); }
    worstReturn = Math.max(worstReturn, err); worstE = Math.max(worstE, Math.abs(s.drift().dE));
  }
  check('figure-eight, 20 periods', worstReturn < 0.05 && maxR < 2 && minSep > 0.1, `max return error ${worstReturn.toExponential(2)}, max radius ${maxR.toFixed(3)}, min separation ${minSep.toFixed(3)}, max |dE/E| ${worstE.toExponential(2)}`);
}

/* 4. time reversal: fixed step forward N then backward N returns to the start state */
{
  const s = O.loadPreset(new O.Sim(), preset('solar')); s.merge = false;
  const h = 0.002, N = 4000;
  const x0 = s.x.slice(0, s.n), y0 = s.y.slice(0, s.n), p0x = s.px.slice(0, s.pn), p0y = s.py.slice(0, s.pn);
  s.computeAcc();
  for (let k = 0; k < N; k++) s.step(h);
  const fwd = Math.hypot(s.x[2] - x0[2], s.y[2] - y0[2]);
  for (let k = 0; k < N; k++) s.step(-h);
  let eb = 0, ep = 0;
  for (let i = 0; i < s.n; i++) eb = Math.max(eb, Math.hypot(s.x[i] - x0[i], s.y[i] - y0[i]));
  for (let p = 0; p < s.pn; p++) ep = Math.max(ep, Math.hypot(s.px[p] - p0x[p], s.py[p] - p0y[p]));
  check('rewind: solar system + 1100 particles, 4000 steps forward then back', eb < 1e-9 && ep < 1e-8, `Earth moved ${fwd.toFixed(3)} AU, then returned within bodies ${eb.toExponential(1)} AU, particles ${ep.toExponential(1)} AU (t = ${s.time.toExponential(1)})`);
}

/* 5. raw throughput: galaxy preset, 8k particles */
{
  const s = O.loadPreset(new O.Sim(), preset('spiral'));
  s.computeAcc();
  const t0 = performance.now(); let steps = 0;
  while (performance.now() - t0 < 1500) { s.step(0.3); steps++; }
  const dt = (performance.now() - t0) / 1000;
  const pairs = steps * s.pn * s.n;
  check('throughput, spiral galaxy', true, `${s.pn} particles x ${s.n} bodies: ${(steps / dt).toFixed(0)} steps/s (${(pairs / dt / 1e6).toFixed(0)} M particle-body interactions/s) in node`);
}

/* 6. merge conserves momentum and mass */
{
  const s = new O.Sim(); s.G = 1; s.soft = 0; s.hMax = 0.01;
  s.addBody({ x: -0.1, y: 0, vx: 0.3, vy: 0.05, m: 1, r: 0.06, type: 'planet' });
  s.addBody({ x: 0.1, y: 0, vx: -0.2, vy: 0, m: 0.5, r: 0.06, type: 'planet' });
  const px0 = 1 * 0.3 + 0.5 * -0.2, py0 = 0.05, m0 = 1.5;
  s.advance(1.0);
  const px = s.m[0] * s.vx[0], py = s.m[0] * s.vy[0];
  check('merge conserves momentum + mass', s.n === 1 && Math.abs(px - px0) < 1e-9 && Math.abs(py - py0) < 1e-9 && Math.abs(s.m[0] - m0) < 1e-12 && s.pn > 10, `bodies ${s.n}, |dp| ${Math.hypot(px - px0, py - py0).toExponential(1)}, debris particles ${s.pn}`);
}

process.exit(failed ? 1 : 0);
