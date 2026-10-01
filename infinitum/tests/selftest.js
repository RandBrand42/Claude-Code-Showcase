/* INFINITUM numerical self-test. Evaluated inside the page by tests/verify.mjs (uses the live WebGL renderer).
 * Compares GPU iteration data against a double-precision CPU reference, counts NaN/Inf, and measures
 * "blockiness" (distinct values across a row of pixels) for float32 vs double-single at extreme zoom. */
(async function (R) {
  'use strict';
  const B = 65536;
  // CPU mirror of the shader loop (no periodicity shortcut): returns smooth iteration or -1 when it never escapes.
  function cpu(kind, variant, pow, wx, wy, jx, jy, maxIter) {
    const px = wx, py = variant === 1 ? -wy : wy; // the Burning Ship flips the imaginary axis
    const cx = kind === 1 ? jx : px, cy = kind === 1 ? jy : py;
    let x = kind === 1 ? px : 0, y = kind === 1 ? py : 0;
    for (let i = 0; i < maxIter; i++) {
      if (variant === 1) { x = Math.abs(x); y = Math.abs(y); } else if (variant === 2) y = -y;
      let ax = x, ay = y;
      for (let k = 2; k < pow; k++) { const t = ax * x - ay * y; ay = ax * y + ay * x; ax = t; }
      const nx = ax * x - ay * y + cx, ny = ax * y + ay * x + cy; x = nx; y = ny;
      const r2 = x * x + y * y;
      if (r2 > B) return Math.max(i + 1 - Math.log(0.5 * Math.log(r2)) / Math.log(pow), 0);
    }
    return -1;
  }
  const N = 48;
  function job(over) { return Object.assign({ kind: 0, variant: 0, deep: false, pow: 2, maxIter: 400, cx: -0.5, cy: 0, scale: 3, rot: 0, jx: 0, jy: 0, trapType: 0 }, over); }
  function compare(name, J, tol) {
    const d = R.readData(J, N, N); let bad = 0, nan = 0, ok = 0, cmp = 0, sum = 0, inter = 0;
    for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) nan++;
    for (let j = 0; j < N; j += 3) for (let i = 0; i < N; i += 3) {
      const sx = (i + 0.5 - N / 2) / N * J.scale, sy = (j + 0.5 - N / 2) / N * J.scale;
      const wx = J.cx + sx, wy = J.cy + sy; // rot = 0 in tests
      const g = d[(j * N + i) * 4];
      const c = cpu(J.kind, J.variant, J.pow, wx, wy, J.jx, J.jy, J.maxIter);
      if (g < 0 || c < 0) { if ((g < 0) !== (c < 0)) inter++; continue; }
      if (c > 150) continue; cmp++;
      const e = Math.abs(g - c); sum += e; if (e < tol) ok++; else bad++;
    }
    return { name, compared: cmp, within: ok, bad, meanAbsErr: cmp ? +(sum / cmp).toExponential(2) : null, interiorDisagree: inter, nonFinite: nan };
  }
  const res = {};
  res.shallowFloat = compare('mandelbrot 3.0 float', job({}), 0.02);
  res.juliaFloat = compare('julia float', job({ kind: 1, cx: 0, cy: 0, jx: -0.4, jy: 0.6, scale: 3 }), 0.02);
  res.shipFloat = compare('ship float', job({ variant: 1, cx: -1.75, cy: 0.03, scale: 0.3 }), 0.02);
  res.tricornFloat = compare('tricorn float', job({ variant: 2, cx: -0.2, cy: 0, scale: 3 }), 0.02);
  res.multibrot4Float = compare('multibrot4 float', job({ pow: 4, cx: 0, cy: 0, scale: 3 }), 0.02);
  res.midDeep = compare('seahorse 1e-6 double-single', job({ deep: true, cx: -0.7436438870371587, cy: 0.131825904205312, scale: 1e-6, maxIter: 1200 }), 0.05);
  res.deep1e9 = compare('seahorse 1e-9 double-single', job({ deep: true, cx: -0.7436438870371587, cy: 0.131825904205312, scale: 1e-9, maxIter: 1800 }), 0.05);
  res.deep1e10 = compare('seahorse 1e-10 double-single', job({ deep: true, cx: -0.7436438870371587, cy: 0.131825904205312, scale: 1e-10, maxIter: 2200 }), 0.05);
  res.deepJulia = compare('julia 1e-8 double-single', job({ kind: 1, deep: true, cx: 0.3, cy: 0.1, jx: -0.7269, jy: 0.1889, scale: 1e-8, maxIter: 1500 }), 0.05);
  res.deepMulti = compare('multibrot3 1e-7 double-single', job({ pow: 3, deep: true, cx: -0.8, cy: 0.0, scale: 1e-7, maxIter: 1000 }), 0.05);
  // blockiness: distinct nu values along the middle row, float32 vs df at scale 1e-10 (row of 256 px).
  function distinct(deep) {
    const n = 256, d = R.readData(job({ deep, cx: -0.7436438870371587, cy: 0.131825904205312, scale: 1e-10, maxIter: 2200 }), n, n);
    const s = new Set(); let runs = 0, prev = null;
    for (let i = 0; i < n; i++) { const v = d[((n >> 1) * n + i) * 4]; s.add(v.toFixed(4)); if (v !== prev) runs++; prev = v; }
    return { distinctValues: s.size, valueChanges: runs };
  }
  res.blockiness1e10 = { float32: distinct(false), doubleSingle: distinct(true) };
  // NaN sweep across all kinds at a few views
  let nan = 0, total = 0;
  const sweep = [job({ cx: -0.75, cy: 0.1, scale: 1e-3, maxIter: 600 }), job({ deep: true, cx: -1.4011551890920506, cy: 0, scale: 1e-11, maxIter: 2500 }),
    job({ kind: 1, cx: 0, cy: 0, jx: 0.285, jy: 0.01, scale: 3 }), job({ variant: 1, cx: -1.7443, cy: -0.0174, scale: 0.02, maxIter: 800 }),
    job({ kind: 2, poly: [-1, 0, 0, 1], roots: [[1, 0], [-0.5, 0.8660254], [-0.5, -0.8660254]], cx: 0, cy: 0, scale: 1e-3, maxIter: 80 }),
    job({ kind: 2, poly: [2, -2, 0, 1], roots: [[-1.7693, 0], [0.8846, 0.5897], [0.8846, -0.5897]], cx: 0.5, cy: 0.2, scale: 3, maxIter: 80 })];
  for (const J of sweep) { const d = R.readData(J, 64, 64); total += d.length; for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) nan++; }
  res.nanSweep = { values: total, nonFinite: nan };
  return res;
});
