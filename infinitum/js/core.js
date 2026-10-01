/* INFINITUM - shared data + pure helpers: families, palettes, bookmarks, state, URL hash, Newton polynomials. */
(function () {
  'use strict';
  const INF = (window.INF = window.INF || {});
  const TAU = Math.PI * 2;
  const HOME_SCALE = 3.2; // imaginary-axis extent of a "home" view

  INF.HOME_SCALE = HOME_SCALE;
  INF.FAMILIES = [
    { id: 'mandelbrot', name: 'Mandelbrot', formula: 'z² + c', kind: 0, variant: 0, home: { cx: -0.55, cy: 0 } },
    { id: 'julia', name: 'Julia', formula: 'z² + c₀', kind: 1, variant: 0, home: { cx: 0, cy: 0 } },
    { id: 'ship', name: 'Burning Ship', formula: '(|x|+i|y|)² + c', kind: 0, variant: 1, home: { cx: -0.6, cy: -0.45 } },
    { id: 'tricorn', name: 'Tricorn', formula: 'conj(z)² + c', kind: 0, variant: 2, home: { cx: -0.2, cy: 0 } },
    { id: 'multibrot', name: 'Multibrot', formula: 'zⁿ + c', kind: 0, variant: 0, home: { cx: 0, cy: 0 } },
    { id: 'newton', name: 'Newton', formula: 'z − p(z)/p′(z)', kind: 2, variant: 0, home: { cx: 0, cy: 0 } },
  ];
  INF.famById = (id) => INF.FAMILIES.find((f) => f.id === id) || INF.FAMILIES[0];

  /* ------------------------------------------------------------- palettes (IQ cosine form) */
  const P = (name, a, b, c, d) => ({ name, a, b, c, d });
  INF.PALETTES = [
    P('Spectrum', [.5, .5, .5], [.5, .5, .5], [1, 1, 1], [0, .33, .67]),
    P('Ember', [.5, .5, .5], [.5, .5, .5], [1, 1, 1], [0, .10, .20]),
    P('Dusk', [.5, .5, .5], [.5, .5, .5], [1, 1, 1], [.30, .20, .20]),
    P('Verdigris', [.5, .5, .5], [.5, .5, .5], [1, 1, .5], [.80, .90, .30]),
    P('Sunstroke', [.5, .5, .5], [.5, .5, .5], [1, .7, .4], [0, .15, .20]),
    P('Orchid', [.5, .5, .5], [.5, .5, .5], [2, 1, 0], [.5, .20, .25]),
    P('Copper', [.8, .5, .4], [.2, .4, .2], [2, 1, 1], [0, .25, .25]),
    P('Ink & Gold', [.5, .4, .2], [.5, .4, .2], [1, 1, 1], [0, 0, 0]),
    P('Glacier', [.42, .58, .70], [.40, .38, .30], [1, 1, 1], [.60, .50, .42]),
    P('Neon Noir', [.5, .3, .6], [.5, .42, .4], [1, 1, 1], [0, .25, .5]),
    P('Biolume', [.10, .30, .36], [.16, .42, .46], [1, 1, 1], [.30, .45, .50]),
    P('Sandstone', [.6, .5, .4], [.32, .26, .2], [1, 1, 1], [0, .05, .10]),
    P('Oxblood', [.36, .10, .12], [.36, .16, .16], [1, 1, 1], [0, .10, .20]),
    P('Silverpoint', [.5, .5, .52], [.5, .5, .5], [1, 1, 1], [0, 0, .02]),
  ];
  const clone = (p) => ({ a: p.a.slice(), b: p.b.slice(), c: p.c.slice(), d: p.d.slice() });
  INF.clonePal = clone;
  INF.palColor = (p, t) => [0, 1, 2].map((i) => Math.max(0, Math.min(1, p.a[i] + p.b[i] * Math.cos(TAU * (p.c[i] * t + p.d[i])))));
  INF.palGradient = (p, dir = '90deg', stops = 28) => {
    const parts = [];
    for (let i = 0; i < stops; i++) { const c = INF.palColor(p, i / (stops - 1) * 1.6).map((v) => Math.round(v * 255)); parts.push(`rgb(${c}) ${(i / (stops - 1) * 100).toFixed(1)}%`); }
    return `linear-gradient(${dir}, ${parts.join(',')})`;
  };
  INF.lerpPal = (p, q, u) => {
    const o = clone(p);
    for (const k of ['a', 'b', 'c', 'd']) for (let i = 0; i < 3; i++) o[k][i] = p[k][i] + (q[k][i] - p[k][i]) * u;
    return o;
  };

  /* ------------------------------------------------------------------ Newton polynomials */
  // Polynomial as real coefficients [a0..an]; roots via Durand-Kerner (complex, double precision).
  INF.NEWTON_PRESETS = [
    { label: 'z³ − 1', text: 'z^3 - 1' },
    { label: 'z³ − 2z + 2', text: 'z^3 - 2z + 2' },
    { label: 'z⁸ + 15z⁴ − 16', text: 'z^8 + 15z^4 - 16' },
    { label: 'z⁵ − z − 1', text: 'z^5 - z - 1' },
  ];
  INF.parsePoly = (text) => {
    const s = String(text).toLowerCase().replace(/\s+/g, '').replace(/−/g, '-');
    if (!s || !/^[0-9z^+\-*.]+$/.test(s)) return null;
    const coef = new Array(9).fill(0);
    const re = /([+-]?)(\d*\.?\d*)\*?(z)?(?:\^(\d+))?/g;
    let m, used = 0;
    while ((m = re.exec(s)) && m[0] !== '') {
      used += m[0].length;
      const hasZ = !!m[3];
      if (m[2] === '' && !hasZ) return null;
      const mag = m[2] === '' ? 1 : parseFloat(m[2]);
      const pw = hasZ ? (m[4] ? parseInt(m[4], 10) : 1) : 0;
      if (!isFinite(mag) || pw > 8) return null;
      coef[pw] += (m[1] === '-' ? -1 : 1) * mag;
    }
    if (used !== s.length) return null;
    let deg = 8; while (deg > 0 && coef[deg] === 0) deg--;
    if (deg < 2) return null;
    return coef.slice(0, deg + 1);
  };
  INF.polyRoots = (coef) => {
    const n = coef.length - 1, lead = coef[n];
    const a = coef.map((v) => v / lead);
    let rs = []; for (let i = 0; i < n; i++) { const ang = TAU * i / n + 0.4; rs.push([0.9 * Math.cos(ang), 0.9 * Math.sin(ang)]); }
    const ev = (z) => { let x = 1, y = 0; for (let k = n - 1; k >= 0; k--) { const nx = x * z[0] - y * z[1] + a[k]; y = x * z[1] + y * z[0]; x = nx; } return [x, y]; };
    for (let it = 0; it < 200; it++) {
      let delta = 0;
      for (let i = 0; i < n; i++) {
        let [dx, dy] = ev(rs[i]);
        let qx = 1, qy = 0;
        for (let j = 0; j < n; j++) if (j !== i) { const rx = rs[i][0] - rs[j][0], ry = rs[i][1] - rs[j][1]; const nx = qx * rx - qy * ry; qy = qx * ry + qy * rx; qx = nx; }
        const den = qx * qx + qy * qy || 1e-30;
        const sx = (dx * qx + dy * qy) / den, sy = (dy * qx - dx * qy) / den;
        rs[i] = [rs[i][0] - sx, rs[i][1] - sy]; delta = Math.max(delta, Math.hypot(sx, sy));
      }
      if (delta < 1e-13) break;
    }
    return rs;
  };
  INF.describePoly = (coef) => {
    let out = '';
    for (let k = coef.length - 1; k >= 0; k--) {
      const v = coef[k]; if (!v) continue;
      const mag = Math.abs(v), t = k === 0 ? String(mag) : (mag === 1 ? '' : mag) + 'z' + (k > 1 ? '^' + k : '');
      out += out ? (v < 0 ? ' - ' : ' + ') + t : (v < 0 ? '-' : '') + t;
    }
    return out || '0';
  };

  /* ------------------------------------------------------------------------------ state */
  INF.defaultState = () => ({
    family: 'mandelbrot',
    view: { cx: -0.55, cy: 0, ls: Math.log(HOME_SCALE), rot: 0 },
    power: 3,
    poly: [-1, 0, 0, 1],
    julia: { x: -0.7269, y: 0.1889, variant: 0, pow: 2, base: 'mandelbrot' },
    palIndex: 7,
    pal: clone(INF.PALETTES[7]),
    phase: 0, density: 2.0, cycle: false, cycleSpeed: 0.05,
    mode: 0, interior: 0, trapType: 1, trapParam: 0.5, glow: 0.35, relief: 1.6, light: { az: 2.2, el: 0.75 },
    quality: { samples: 24, adaptive: true, iterMul: 1, pixelRatio: 'auto' },
  });

  INF.BOOKMARKS = [
    { id: 'seahorse', title: 'Seahorse Valley', family: 'mandelbrot', cx: -0.7436438870371587, cy: 0.1318259042053120, scale: 3.0e-4, rot: 0.0, pal: 7,
      caption: 'Between two great bulbs the coastline curls into tails, and every tail ends in a smaller sea.' },
    { id: 'elephant', title: 'Elephant Valley', family: 'mandelbrot', cx: 0.2798, cy: 0.0084, scale: 0.02, rot: 0.15, pal: 11,
      caption: 'A herd of trunks raised toward the cusp, each one carrying the whole set on its back.' },
    { id: 'spiral', title: 'Double Spiral', family: 'mandelbrot', cx: -0.0452407411, cy: 0.9868162207, scale: 4.0e-4, rot: -0.3, pal: 9,
      caption: 'Two arms wind toward a point that never arrives; the closer you look, the more they agree to keep turning.' },
    { id: 'minibrot', title: 'Mini-brot', family: 'mandelbrot', cx: -1.7548776662466927, cy: 0, scale: 0.012, rot: 0, pal: 8,
      caption: 'A self-portrait, small enough to hold, found exactly where it had no reason to be.' },
    { id: 'galaxy', title: 'Spiral Galaxy', family: 'julia', cx: 0, cy: 0, scale: 3.4, rot: 0.4, pal: 10, julia: { x: -0.4, y: 0.6 },
      caption: 'Not stars but iterations: a million small decisions, all leaning the same way.' },
    { id: 'lightning', title: 'Lightning', family: 'mandelbrot', cx: -1.9408, cy: 0, scale: 0.05, rot: 0, pal: 13,
      caption: 'The thinnest filaments of the set, stretched along the axis like a storm caught between two frames.' },
    { id: 'feigenbaum', title: 'Feigenbaum Point', family: 'mandelbrot', cx: -1.4011551890920506, cy: 0, scale: 0.03, rot: 0, pal: 12,
      caption: 'Where the period doubles, and doubles, and doubles — and order tips over the edge into chaos.' },
    { id: 'armada', title: 'The Armada', family: 'ship', cx: -1.7443359, cy: -0.017451, scale: 0.05, rot: 0, pal: 1,
      caption: 'Burned hulls in formation; every mast is the wreck of a larger ship.' },
    { id: 'knot', title: 'Newton’s Knot', family: 'newton', cx: 0, cy: 0, scale: 0.35, rot: 0, pal: 6, poly: [-1, 0, 0, 1],
      caption: 'Three roots, three territories, one border that refuses to be straight.' },
    { id: 'rabbit', title: 'Douady’s Rabbit', family: 'julia', cx: 0, cy: 0, scale: 3.0, rot: 0, pal: 10, julia: { x: -0.123, y: 0.745 },
      caption: 'One rabbit’s ears, repeated inside every ear, all the way down.' },
    { id: 'tricorn', title: 'Tricorn Lace', family: 'tricorn', cx: -0.05, cy: 0.63, scale: 0.35, rot: 0, pal: 3,
      caption: 'Conjugate the orbit and the bulbs grow three-fold: a hat, a crest, a doily.' },
    { id: 'garden', title: 'Multibrot Garden', family: 'multibrot', power: 4, cx: 0, cy: 0, scale: 2.6, rot: 0.2, pal: 2,
      caption: 'Raise the power and the set grows petals — n − 1 bulbs in patient rotation.' },
    { id: 'octagon', title: 'Octagon Garden', family: 'newton', cx: 0, cy: 0, scale: 2.6, rot: 0, pal: 9, poly: [-16, 0, 0, 0, 15, 0, 0, 0, 1],
      caption: 'Eight roots fence the plane, and each fence post is wound round with its neighbours.' },
    { id: 'abyss', title: 'The Abyss', family: 'mandelbrot', cx: -0.7436438870371587, cy: 0.1318259042053120, scale: 6.0e-10, rot: 0.6, pal: 10, deep: true,
      caption: 'At one part in ten billion the boundary still has something to say.' },
  ];

  /* ------------------------------------------------------------------------- derived values */
  INF.scaleOf = (s) => Math.exp(s.view.ls);
  INF.depthOf = (s) => Math.log10(HOME_SCALE / Math.exp(s.view.ls));
  INF.iterCount = (s) => {
    const d = Math.max(0, INF.depthOf(s)), m = s.quality.iterMul;
    if (s.family === 'newton') return Math.round(Math.min(160, 60 + 6 * d) * Math.min(m, 1.5));
    return Math.round(Math.max(64, Math.min(9000, (170 + 105 * d) * m)));
  };
  // Double-single carries ~46 usable bits; the float32 path ~22. Both limit how small a pixel can be vs the coordinate magnitude.
  INF.DEEP_SCALE = 6e-3;
  INF.precision = (s, hpx) => {
    const v = s.view, sc = Math.exp(v.ls), mag = Math.max(Math.abs(v.cx), Math.abs(v.cy), sc * 0.5, 0.02);
    const deep = INF.famById(s.family).kind !== 2 && sc < INF.DEEP_SCALE;
    const ulp = mag * (INF.famById(s.family).kind === 2 ? 1.2e-7 : 4.5e-14);
    const pitch = sc / Math.max(hpx, 200);
    return { deep, ulps: pitch / ulp, minScale: ulp * Math.max(hpx, 200) * 1.5, path: INF.famById(s.family).kind === 2 ? 'float32' : (deep ? 'double-single' : 'float32') };
  };

  /* ---------------------------------------------------------------- persistence + hash */
  INF.store = {
    get(k, d) { try { const v = localStorage.getItem('infinitum:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('infinitum:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const f17 = (v) => Number(v).toPrecision(17).replace(/\.?0+(e|$)/, '$1');
  INF.encodeHash = (s) => {
    const v = s.view, q = [];
    q.push('f=' + s.family, 'x=' + f17(v.cx), 'y=' + f17(v.cy), 's=' + Math.exp(v.ls).toPrecision(8), 'r=' + v.rot.toFixed(4));
    q.push('m=' + s.mode, 'i=' + s.interior, 't=' + s.trapType, 'tp=' + s.trapParam.toFixed(2), 'g=' + s.glow.toFixed(2), 'rl=' + s.relief.toFixed(2));
    q.push('ph=' + s.phase.toFixed(3), 'd=' + s.density.toFixed(2), 'w=' + s.power);
    q.push('pi=' + s.palIndex);
    if (s.palIndex < 0) q.push('pc=' + ['a', 'b', 'c', 'd'].map((k) => s.pal[k].map((n) => n.toFixed(3)).join(',')).join(';'));
    q.push('jx=' + f17(s.julia.x), 'jy=' + f17(s.julia.y), 'jv=' + s.julia.variant, 'jp=' + s.julia.pow);
    if (s.family === 'newton') q.push('np=' + s.poly.join(','));
    return q.join('&');
  };
  INF.decodeHash = (str, s) => {
    const h = String(str).replace(/^#/, ''); if (!h) return false;
    const q = {}; h.split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    const num = (k, d) => { const v = parseFloat(q[k]); return isFinite(v) ? v : d; };
    if (!q.f || !INF.FAMILIES.some((f) => f.id === q.f)) return false;
    s.family = q.f;
    s.view.cx = num('x', s.view.cx); s.view.cy = num('y', s.view.cy);
    s.view.ls = Math.log(Math.min(HOME_SCALE * 2, Math.max(1e-13, num('s', HOME_SCALE)))); s.view.rot = num('r', 0);
    s.mode = Math.max(0, Math.min(3, num('m', s.mode) | 0)); s.interior = Math.max(0, Math.min(2, num('i', 0) | 0));
    s.trapType = Math.max(1, Math.min(4, num('t', 1) | 0)); s.trapParam = num('tp', 0.5); s.glow = num('g', s.glow); s.relief = num('rl', s.relief);
    s.phase = num('ph', 0); s.density = num('d', s.density); s.power = Math.max(2, Math.min(8, num('w', s.power) | 0));
    const pi = num('pi', 1) | 0;
    if (pi >= 0 && pi < INF.PALETTES.length) { s.palIndex = pi; s.pal = clone(INF.PALETTES[pi]); }
    else if (q.pc) {
      const parts = q.pc.split(';').map((p) => p.split(',').map(Number));
      if (parts.length === 4 && parts.every((p) => p.length === 3 && p.every(isFinite))) { s.palIndex = -1; s.pal = { a: parts[0], b: parts[1], c: parts[2], d: parts[3] }; }
    }
    s.julia.x = num('jx', s.julia.x); s.julia.y = num('jy', s.julia.y); s.julia.variant = num('jv', 0) | 0; s.julia.pow = Math.max(2, Math.min(8, num('jp', 2) | 0));
    if (q.np) { const c = q.np.split(',').map(Number); if (c.length >= 3 && c.length <= 9 && c.every(isFinite)) s.poly = c; }
    return true;
  };
})();
