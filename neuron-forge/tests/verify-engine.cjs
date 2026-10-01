/* Verifies the ML engine under node:  node tests/verify-engine.cjs
 *  1. gradient check: analytic backprop vs centred finite differences (every activation x both losses, with L1+L2)
 *  2. headless training: XOR, circle, moons, spiral (deep) must reach >95% test accuracy
 *  3. reproducibility: the same seed gives bit-identical weights
 */
require('../js/engine.js'); require('../js/data.js'); require('../js/lab.js');
const NF = globalThis.NF;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) failures++; };

/* ---------- 1. gradient check ---------- */
function gradCheck(act, loss, sizes) {
  const rng = NF.makeRng(99);
  const net = new NF.Net(sizes, { act, loss, init: 'he' }, rng);
  // random (non-zero) biases so every parameter matters
  for (let l = 0; l < net.L; l++) for (let j = 0; j < sizes[l + 1]; j++) net.P[net.bOff[l] + j] = rng.gauss() * 0.3;
  const n = 12, nIn = sizes[0], F = new Float32Array(n * nIn), Y = new Uint8Array(n);
  for (let i = 0; i < F.length; i++) F[i] = rng.range(-1, 1);
  for (let i = 0; i < n; i++) Y[i] = rng.next() < 0.5 ? 0 : 1;
  const idx = Uint32Array.from({ length: n }, (_, i) => i), l1 = 0.01, l2 = 0.02;
  // Float32 params would swamp a finite difference, so work in float64 by swapping the buffers.
  const f64 = x => Float64Array.from(x);
  net.P = f64(net.P); net.G = new Float64Array(net.P.length);
  net.a = net.a.map(f64); net.z = net.z.map(f64); net.d = net.d.map(f64);
  net.batchGradient(F, Y, idx, 0, n, l1, l2);
  const analytic = Float64Array.from(net.G);
  const total = () => net.evaluate(F, Y, 0, n).loss + net.penalty(l1, l2);
  const eps = 1e-6;
  let worst = 0;
  for (let k = 0; k < net.P.length; k++) {
    const w = net.P[k];
    net.P[k] = w + eps; const up = total();
    net.P[k] = w - eps; const dn = total();
    net.P[k] = w;
    const num = (up - dn) / (2 * eps);
    const rel = Math.abs(num - analytic[k]) / Math.max(1e-8, Math.abs(num) + Math.abs(analytic[k]));
    // ReLU kinks can legitimately disagree when z is ~0; with random data this is vanishingly rare
    worst = Math.max(worst, rel);
  }
  return worst;
}
console.log('--- gradient check (max relative error over all parameters) ---');
for (const loss of ['mse', 'bce']) for (const act of NF.ACT_ORDER) {
  const err = gradCheck(act, loss, [5, 7, 4, 1]);
  ok(err < 1e-5, `${loss.padEnd(3)} / ${act.padEnd(7)} max rel err = ${err.toExponential(2)}`);
}

/* ---------- 2. headless training ---------- */
function train(label, cfg, maxEpochs, target) {
  const lab = new NF.Lab(cfg);
  const t0 = Date.now();
  let e = 0;
  while (e < maxEpochs) { lab.stepEpoch(); e++; if (lab.metrics.testAcc >= 0.985 && lab.metrics.trainAcc >= 0.985 && e >= 30) break; }
  const m = lab.metrics;
  ok(m.testAcc >= target, `${label}: test ${(m.testAcc * 100).toFixed(1)}%  train ${(m.trainAcc * 100).toFixed(1)}%  after ${lab.epoch} epochs (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return lab;
}
console.log('--- headless training ---');
train('XOR, 4 hidden (tanh)', { dataset: 'xor', noise: 5, hidden: [4], features: ['x1', 'x2'], lr: 0.03 }, 600, 0.95);
train('XOR, only 2 hidden neurons (swish, seed 7)', { dataset: 'xor', noise: 5, hidden: [2], features: ['x1', 'x2'], act: 'swish', lr: 0.05, seed: 7 }, 1500, 0.95);
const single = new NF.Lab({ dataset: 'xor', noise: 5, hidden: [], features: ['x1', 'x2'] });
for (let i = 0; i < 400; i++) single.stepEpoch();
ok(single.metrics.testAcc < 0.75, `XOR, single neuron (no hidden layer) stays stuck: ${(single.metrics.testAcc * 100).toFixed(1)}%`);
train('Circle, x1/x2 only, [4,3]', { dataset: 'circle', noise: 5, hidden: [4, 3], features: ['x1', 'x2'] }, 800, 0.95);
train('Circle, squared features, no hidden layer', { dataset: 'circle', noise: 3, hidden: [], features: ['x1sq', 'x2sq'], lr: 0.1 }, 600, 0.95);
train('Two moons [6,4]', { dataset: 'moons', noise: 8, hidden: [6, 4] }, 800, 0.95);
train('Ring & core [8,6]', { dataset: 'ring', noise: 4, hidden: [8, 6], features: ['x1', 'x2', 'x1sq', 'x2sq'] }, 1500, 0.95);
train('Gaussian clusters, single neuron', { dataset: 'gauss', noise: 0, hidden: [], features: ['x1', 'x2'], lr: 0.03 }, 300, 0.95);
train('Checkerboard with sin features [4]', { dataset: 'checker', noise: 3, hidden: [6, 4], features: ['x1', 'x2', 's1', 's2'] }, 1500, 0.9);
const sp = process.argv.includes('--fast') ? null : train('Spiral, 7 features, [8,8,6]', { dataset: 'spiral', noise: 3, count: 400, hidden: [8, 8, 6], features: ['x1', 'x2', 'x1sq', 'x2sq', 'x1x2', 's1', 's2'], lr: 0.01 }, 4000, 0.95);
train('Spiral, raw x1/x2 only, [12,12,8,6]', { dataset: 'spiral', noise: 2, count: 600, hidden: [12, 12, 8, 6], features: ['x1', 'x2'], lr: 0.01 }, 6000, 0.95);

/* ---------- 3. reproducibility ---------- */
console.log('--- reproducibility ---');
const a = new NF.Lab({ seed: 123 }), b = new NF.Lab({ seed: 123 });
for (let i = 0; i < 40; i++) { a.stepEpoch(); b.stepEpoch(); }
let identical = a.net.P.length === b.net.P.length;
for (let k = 0; identical && k < a.net.P.length; k++) if (a.net.P[k] !== b.net.P[k]) identical = false;
ok(identical, 'same seed -> bit-identical weights after 40 epochs');
a.reset(); for (let i = 0; i < 40; i++) a.stepEpoch();
let again = true; for (let k = 0; k < a.net.P.length; k++) if (a.net.P[k] !== b.net.P[k]) again = false;
ok(again, 'Reset (re-init from seed, keep data) replays the identical run');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
