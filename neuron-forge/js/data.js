/* NEURON FORGE - synthetic datasets + input features
 * World coordinates live in [-6, 6]^2. Labels are 0/1 where 1 = "class +1" (amber). Everything
 * is generated from a seeded RNG, so a (seed, regen counter, dataset, noise, count) tuple
 * always reproduces the exact same cloud of points.
 */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};
  const TAU = Math.PI * 2, LIM = 6;

  /* ---------- input features (functions of the world coordinates) ---------- */
  NF.FEATURES = [
    { id: 'x1',   short: 'x₁',     name: 'x₁',          f: (a) => a / LIM },
    { id: 'x2',   short: 'x₂',     name: 'x₂',          f: (a, b) => b / LIM },
    { id: 'x1sq', short: 'x₁²', name: 'x₁²',  f: (a) => (a / LIM) * (a / LIM) },
    { id: 'x2sq', short: 'x₂²', name: 'x₂²',  f: (a, b) => (b / LIM) * (b / LIM) },
    { id: 'x1x2', short: 'x₁x₂', name: 'x₁·x₂', f: (a, b) => (a / LIM) * (b / LIM) },
    { id: 's1',   short: 'sin x₁', name: 'sin(2πx₁)', f: (a) => Math.sin(TAU * a / LIM) },
    { id: 's2',   short: 'sin x₂', name: 'sin(2πx₂)', f: (a, b) => Math.sin(TAU * b / LIM) },
  ];
  NF.FEATURE_BY_ID = Object.fromEntries(NF.FEATURES.map(f => [f.id, f]));
  NF.LIM = LIM;

  /** Feature matrix (n * nIn, row-major) for the given world coordinates. */
  NF.buildFeatures = function (X1, X2, n, featIds, out) {
    const fs = featIds.map(id => NF.FEATURE_BY_ID[id].f), k = fs.length;
    const F = out && out.length >= n * k ? out : new Float32Array(n * k);
    for (let s = 0; s < n; s++) for (let i = 0; i < k; i++) F[s * k + i] = fs[i](X1[s], X2[s]);
    return F;
  };

  /* ---------- datasets ---------- */
  const clamp = v => Math.max(-LIM + 0.05, Math.min(LIM - 0.05, v));
  const pol = (r, t) => [r * Math.cos(t), r * Math.sin(t)];

  // Each generator fills X1, X2, y for n points. `nz` is the noise level 0..1.
  const GEN = {
    circle(n, nz, R, X1, X2, y) {
      for (let i = 0; i < n; i++) {
        const c = i % 2, t = R.range(0, TAU);
        const r = c ? 2.7 * Math.sqrt(R.next()) : Math.sqrt(R.range(3.7 * 3.7, 5.7 * 5.7));
        const [a, b] = pol(r, t);
        X1[i] = a; X2[i] = b; y[i] = c;
      }
      jitter(n, nz * 2.4, R, X1, X2);
    },
    ring(n, nz, R, X1, X2, y) {
      for (let i = 0; i < n; i++) {
        const t = R.range(0, TAU), u = R.next();
        let r, c;
        if (u < 0.3) { r = 1.6 * Math.sqrt(R.next()); c = 1; }                       // core
        else if (u < 0.65) { r = R.range(2.7, 3.7); c = 0; }                          // moat
        else { r = R.range(4.5, 5.7); c = 1; }                                        // outer ring
        const [a, b] = pol(r, t);
        X1[i] = a; X2[i] = b; y[i] = c;
      }
      jitter(n, nz * 1.6, R, X1, X2);
    },
    xor(n, nz, R, X1, X2, y) {
      for (let i = 0; i < n; i++) {
        const sx = R.next() < 0.5 ? -1 : 1, sy = R.next() < 0.5 ? -1 : 1;
        X1[i] = sx * R.range(0.5, 5.6); X2[i] = sy * R.range(0.5, 5.6);
        y[i] = sx * sy > 0 ? 1 : 0;
      }
      jitter(n, nz * 2.4, R, X1, X2);
    },
    gauss(n, nz, R, X1, X2, y) {
      const sd = 1.15 + nz * 2.6;
      for (let i = 0; i < n; i++) {
        const c = i % 2, sgn = c ? 1 : -1;
        X1[i] = sgn * 2.3 + R.gauss() * sd; X2[i] = sgn * 1.9 + R.gauss() * sd; y[i] = c;
      }
    },
    moons(n, nz, R, X1, X2, y) {
      const S = 4;
      for (let i = 0; i < n; i++) {
        const c = i % 2, t = R.range(0, Math.PI);
        if (c) { X1[i] = S * Math.cos(t) - S * 0.5; X2[i] = S * Math.sin(t) - S * 0.22; }
        else { X1[i] = S * (1 - Math.cos(t)) - S * 0.5; X2[i] = S * (0.5 - Math.sin(t)) - S * 0.22; }
        y[i] = c;
      }
      jitter(n, nz * 2.2, R, X1, X2);
    },
    spiral(n, nz, R, X1, X2, y) {
      const half = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const arm = i % 2, k = Math.floor(i / 2) / half;
        const r = 0.35 + k * 5.2, t = 1.75 * k * TAU + arm * Math.PI;
        X1[i] = r * Math.sin(t); X2[i] = r * Math.cos(t); y[i] = arm;
      }
      jitter(n, nz * 2.4, R, X1, X2);
    },
    checker(n, nz, R, X1, X2, y) {
      for (let i = 0; i < n; i++) {
        const a = R.range(-LIM, LIM), b = R.range(-LIM, LIM);
        X1[i] = a; X2[i] = b;
        y[i] = (Math.floor((a + LIM) / 3) + Math.floor((b + LIM) / 3)) & 1;
      }
      jitter(n, nz * 1.4, R, X1, X2);
    },
  };
  function jitter(n, sd, R, X1, X2) { if (sd > 0) for (let i = 0; i < n; i++) { X1[i] += R.gauss() * sd; X2[i] += R.gauss() * sd; } }

  NF.DATASETS = [
    { id: 'circle',  name: 'Circle',            blurb: 'A disc of +1 surrounded by a ring of −1. Not separable by any straight line.' },
    { id: 'ring',    name: 'Ring & Core',       blurb: 'A core and an outer ring (+1) separated by a moat of −1: needs a band, not a blob.' },
    { id: 'xor',     name: 'XOR',               blurb: 'Opposite quadrants share a class. The classic problem a single neuron cannot solve.' },
    { id: 'gauss',   name: 'Gaussian Clusters', blurb: 'Two overlapping blobs. Easy, and a good place to watch noise cap your accuracy.' },
    { id: 'moons',   name: 'Two Moons',         blurb: 'Two interlocking crescents. A gentle curve is all it takes.' },
    { id: 'spiral',  name: 'Spiral',            blurb: 'Two arms wound around each other. The boss level: depth and patience required.' },
    { id: 'checker', name: 'Checkerboard',      blurb: 'A 4×4 chessboard. Periodic features turn it into a much smaller puzzle.' },
  ];
  NF.DATASET_IDS = NF.DATASETS.map(d => d.id);

  /** Deterministic 32-bit mix of a few numbers. */
  NF.mixSeed = (...nums) => { let h = 2166136261; for (const n of nums) { h ^= (n | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; } return h >>> 0; };

  /**
   * Generate a shuffled dataset. The first `nTrain` points form the training set; changing the
   * split later only moves that boundary, so the same points are re-used.
   */
  NF.makeDataset = function (kind, n, noisePct, seed, regen) {
    const R = NF.makeRng(NF.mixSeed(seed, regen, NF.DATASET_IDS.indexOf(kind) + 11, 4242));
    const X1 = new Float32Array(n), X2 = new Float32Array(n), y = new Uint8Array(n);
    GEN[kind](n, noisePct / 100, R, X1, X2, y);
    const order = R.shuffle(Array.from({ length: n }, (_, i) => i));
    const sX1 = new Float32Array(n), sX2 = new Float32Array(n), sy = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const o = order[i]; sX1[i] = clamp(X1[o]); sX2[i] = clamp(X2[o]); sy[i] = y[o]; }
    return { kind, n, X1: sX1, X2: sX2, y: sy };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
