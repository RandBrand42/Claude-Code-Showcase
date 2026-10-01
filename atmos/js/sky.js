/* ATMOS - sky.js : the procedural sky (2D canvas). Everything is drawn from a handful of smoothed
 * parameters (sun altitude/position, cloud, rain, snow, storm, fog, heat, wind) so any change morphs. */
(function () {
  'use strict';
  const A = window.Atmos, U = A.util, Sky = (A.Sky = {});
  const { clamp, lerp, smooth, mix3, TAU } = U;
  const KF = [
    [-20, [5, 8, 22], [9, 14, 34], [18, 26, 54]], [-12, [8, 12, 34], [18, 26, 60], [40, 48, 88]],
    [-6, [16, 24, 62], [52, 54, 110], [150, 88, 120]], [-1, [38, 62, 128], [124, 100, 150], [244, 140, 100]],
    [4, [62, 92, 170], [214, 150, 140], [255, 160, 70]], [12, [50, 108, 192], [150, 172, 214], [255, 200, 130]],
    [30, [34, 106, 204], [88, 166, 234], [182, 218, 246]], [60, [24, 88, 188], [70, 152, 228], [160, 208, 244]],
  ];
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  function basePalette(alt) {
    if (alt <= KF[0][0]) return [KF[0][1], KF[0][2], KF[0][3]];
    for (let i = 1; i < KF.length; i++) if (alt <= KF[i][0]) {
      const a = KF[i - 1], b = KF[i], t = (alt - a[0]) / (b[0] - a[0]), e = t * t * (3 - 2 * t) * 0.4 + t * 0.6;
      return [mix3(a[1], b[1], e), mix3(a[2], b[2], e), mix3(a[3], b[3], e)];
    }
    const l = KF[KF.length - 1]; return [l[1], l[2], l[3]];
  }
  const sunColor = (alt) => alt < 4 ? mix3([255, 110, 60], [255, 170, 90], smooth(-3, 4, alt)) : alt < 14 ? mix3([255, 170, 90], [255, 222, 160], smooth(4, 14, alt)) : mix3([255, 222, 160], [255, 248, 235], smooth(14, 40, alt));
  // Sky colours for given sun altitude + weather. Also used by the city thumbnails.
  function palette(alt, w, morning) {
    let [top, mid, hor] = basePalette(alt);
    const day = smooth(-6, 8, alt), tw = smooth(-9, -1, alt) * smooth(14, 3, alt);
    if (morning) hor = mix3(hor, [255, 176, 172], 0.3 * tw);
    const dull = clamp(Math.pow(w.cloud, 1.35) * 0.8 + w.rain * 0.3 + w.snow * 0.3 + w.storm * 0.3, 0, 1);
    const grey = mix3([26, 32, 48], [116, 130, 148], day);
    top = mix3(top, grey.map((v) => v * 0.82), dull * 0.85);
    mid = mix3(mid, grey, dull * 0.85);
    hor = mix3(hor, grey.map((v) => v * 1.18), dull * 0.75 * (1 - tw * 0.5));
    const dark = 1 - 0.5 * w.storm - 0.15 * w.rain;
    top = top.map((v) => v * dark); mid = mid.map((v) => v * dark); hor = hor.map((v) => v * dark);
    const snowC = mix3([56, 64, 86], [178, 190, 204], day);
    const sn = w.snow * 0.8;
    mid = mix3(mid, snowC, sn); hor = mix3(hor, snowC.map((v) => v * 1.05), sn); top = mix3(top, snowC.map((v) => v * 0.85), sn);
    const haze = mix3([34, 42, 62], [200, 210, 220], day), f = w.fog * 0.88;
    top = mix3(top, haze.map((v) => v * 0.95), f); mid = mix3(mid, haze, f); hor = mix3(hor, mix3(haze, hor, 0.25), f);
    if (w.heat > 0) { hor = mix3(hor, [255, 205, 150], w.heat * 0.3 * day); top = mix3(top, [120, 170, 215], w.heat * 0.2 * day); }
    return { top, mid, hor, lum: lum(mid) * 0.7 + lum(top) * 0.3, tw, day };
  }
  Sky.palette = palette;
  const rgb = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`;
  Sky.css = (alt, w, morning) => { const p = palette(alt, w, morning); return `linear-gradient(180deg,${rgb(p.top)} 0%,${rgb(p.mid)} 55%,${rgb(p.hor)} 100%)`; };

  // ---------- state ----------
  const S = { alt: 30, sx: 0.5, sy: 0.4, mx: 0.5, my: 1.2, cloud: 0.2, rain: 0, snow: 0, storm: 0, fog: 0, heat: 0, wind: 10, windX: 10, phase: 0.5, illum: 1, morning: 0, par: 0 };
  const T = Object.assign({}, S, { moonPhase: 0.5 });
  const SM = ['alt', 'sx', 'sy', 'mx', 'my', 'cloud', 'rain', 'snow', 'storm', 'fog', 'heat', 'wind', 'windX', 'illum'];
  let cv, ctx, W = 0, H = 0, rs = 1, yH = 0, quality = 1, reduced = false, t = 0, frameEMA = 16, snapNext = true;
  let lastMoonKey = '', moonSprite = null, flash = 0, thunder = 0, thunderAt = -1, bolt = null, boltT = 0, nextStrike = 4, flashVar = -1;
  const info = Sky.info = { lum: 0.3, mid: [80, 150, 220], hor: [160, 210, 240], day: 1 };
  Sky.reduced = () => reduced;
  const R = U.rng(7);

  // ---------- skylines (pre-rendered masks, tinted per frame) ----------
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(2, w | 0); c.height = Math.max(2, h | 0); return c; };
  let sky = null, prevSky = null, skyFade = 1, wantType = 'hills', ridgeH = 0;
  function ridge(g, base, amp, freq, seed, w, rough) {
    g.beginPath(); g.moveTo(0, H); const step = 8;
    for (let x = 0; x <= w + step; x += step) { const n = U.fbm(seed, x * freq) - 0.5; const n2 = rough ? U.noise(seed + 3, x * freq * 9) - 0.5 : 0; g.lineTo(x, base - amp * (n * 2 + n2 * rough)); }
    g.lineTo(w + step, H); g.closePath(); g.fill();
  }
  function tri(g, x, y, w, h) { g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x, y - h); g.lineTo(x + w / 2, y); g.fill(); }
  function buildSkyline(type, seed) {
    const far = mk(W * rs, H * rs), near = mk(W * rs, H * rs), win = mk(W * rs, H * rs);
    const gf = far.getContext('2d'), gn = near.getContext('2d'), gw = win.getContext('2d');
    [gf, gn, gw].forEach((g) => g.scale(rs, rs));
    gf.fillStyle = gn.fillStyle = '#000';
    const r = U.rng(seed * 991 + 5), u = H / 900, lights = [];
    const bld = (g, x, w, h, base) => { g.fillRect(x, base - h, w, h + 400); for (let yy = base - h + 8 * u; yy < base - 6 * u; yy += 9 * u) for (let xx = x + 4 * u; xx < x + w - 5 * u; xx += 8 * u) if (r() < 0.22) lights.push([xx, yy, r()]); };
    const fill = (g) => { g.fillRect(0, yH, W, H); };
    if (type === 'hills') { ridge(gf, yH - 70 * u, 80 * u, 0.0042, seed, W, 0.25); ridge(gn, yH + 4, 34 * u, 0.008, seed + 5, W, 0.1); for (let i = 0; i < 26; i++) { const x = r() * W, s = (6 + r() * 7) * u; bld(gn, x, s * 1.6, s, yH + 12 * u - (U.fbm(seed + 5, x * 0.008) - 0.5) * 68 * u * 0.4); } }
    else if (type === 'towers') { ridge(gf, yH - 10 * u, 10 * u, 0.01, seed, W, 0); for (let x = -10; x < W; ) { const w = (26 + r() * 40) * u, h = (50 + r() * 190) * u; bld(r() < 0.5 ? gf : gn, x, w, h * (x > W * 0.3 && x < W * 0.7 ? 1.2 : 1), yH + 6); x += w + r() * 10 * u; } const cx = W * 0.62; for (let i = -1; i <= 1; i++) { gn.fillRect(cx + i * 46 * u - 9 * u, yH - 210 * u, 18 * u, 230 * u); } gn.fillRect(cx - 70 * u, yH - 222 * u, 140 * u, 10 * u); fill(gn); }
    else if (type === 'dunes') { gf.fillStyle = '#000'; ridge(gf, yH - 14 * u, 60 * u, 0.003, seed, W, 0); ridge(gn, yH + 14 * u, 40 * u, 0.0055, seed + 7, W, 0); const mx = W * 0.72; gn.fillRect(mx - 14 * u, yH - 150 * u, 28 * u, 160 * u); gn.fillRect(mx - 18 * u, yH - 162 * u, 36 * u, 14 * u); tri(gn, mx, yH - 162 * u, 14 * u, 30 * u); gn.fillRect(mx - 40 * u, yH - 50 * u, 80 * u, 60 * u); for (const px of [W * 0.2, W * 0.27, W * 0.9]) { gn.lineWidth = 4 * u; gn.strokeStyle = '#000'; gn.beginPath(); gn.moveTo(px, yH + 10); gn.quadraticCurveTo(px + 10 * u, yH - 60 * u, px + 4 * u, yH - 100 * u); gn.stroke(); for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.42; gn.beginPath(); gn.moveTo(px + 4 * u, yH - 100 * u); gn.quadraticCurveTo(px + 4 * u + Math.cos(a) * 30 * u, yH - 100 * u + Math.sin(a) * 30 * u - 12 * u, px + 4 * u + Math.cos(a) * 54 * u, yH - 100 * u + Math.sin(a) * 40 * u + 18 * u); gn.stroke(); } } fill(gn); }
    else if (type === 'pines') { ridge(gf, yH - 100 * u, 130 * u, 0.0035, seed, W, 0.55); ridge(gn, yH + 8, 20 * u, 0.01, seed + 9, W, 0); for (let x = -10; x < W; x += (9 + r() * 14) * u) { const h = (40 + r() * 80) * u; for (let k = 0; k < 3; k++) tri(gn, x, yH + 10 * u - k * h * 0.27, (h * 0.5) * (1 - k * 0.22), h * 0.5); } for (let x = W * 0.55; x < W * 0.8; ) { const w = (14 + r() * 20) * u; bld(gf, x, w, (30 + r() * 90) * u, yH - 4); x += w + 3 * u; } fill(gn); }
    else if (type === 'skyline') { for (let x = -10; x < W; ) { const w = (18 + r() * 34) * u, h = (30 + r() * 140) * u; bld(r() < 0.6 ? gf : gn, x, w, h, yH + 6); x += w + r() * 5 * u; } const tx = W * 0.68; gn.beginPath(); gn.moveTo(tx - 34 * u, yH + 6); gn.lineTo(tx - 4 * u, yH - 250 * u); gn.lineTo(tx + 4 * u, yH - 250 * u); gn.lineTo(tx + 34 * u, yH + 6); gn.closePath(); gn.fill(); gn.fillRect(tx - 1.5 * u, yH - 300 * u, 3 * u, 52 * u); gn.fillRect(tx - 20 * u, yH - 140 * u, 40 * u, 9 * u); fill(gn); }
    else if (type === 'harbour') { for (let x = -10; x < W; ) { const w = (16 + r() * 28) * u, h = (24 + r() * 80) * u; if (x < W * 0.45 || x > W * 0.78) bld(gf, x, w, h, yH - 2); x += w + r() * 4 * u; } const ox = W * 0.56; for (let i = 0; i < 4; i++) { gn.beginPath(); gn.moveTo(ox + i * 34 * u, yH + 2); gn.quadraticCurveTo(ox + i * 34 * u + 10 * u, yH - (92 - i * 14) * u, ox + i * 34 * u + 46 * u, yH + 2); gn.closePath(); gn.fill(); } gn.lineWidth = 7 * u; gn.strokeStyle = '#000'; gn.beginPath(); gn.moveTo(W * 0.78, yH + 2); gn.quadraticCurveTo(W * 0.9, yH - 120 * u, W * 1.02, yH + 2); gn.stroke(); gn.fillRect(0, yH + 4, W, H); }
    else if (type === 'peaks') { ridge(gf, yH - 60 * u, 190 * u, 0.0032, seed, W, 0.9); ridge(gn, yH + 6, 40 * u, 0.006, seed + 3, W, 0.2); for (let x = W * 0.05; x < W * 0.4; ) { const w = (14 + r() * 22) * u; bld(gn, x, w, (14 + r() * 60) * u, yH + 6); x += w + 2 * u; } fill(gn); }
    else { /* table */ gf.beginPath(); gf.moveTo(0, yH); gf.lineTo(0, yH - 70 * u); gf.lineTo(W * 0.18, yH - 150 * u); gf.lineTo(W * 0.26, yH - 175 * u); gf.lineTo(W * 0.62, yH - 180 * u); gf.lineTo(W * 0.72, yH - 150 * u); gf.lineTo(W * 0.86, yH - 90 * u); gf.lineTo(W, yH - 60 * u); gf.lineTo(W, yH); gf.fill(); ridge(gn, yH + 6, 22 * u, 0.01, seed, W, 0); for (let x = W * 0.3; x < W * 0.7; ) { const w = (10 + r() * 18) * u; bld(gn, x, w, (10 + r() * 46) * u, yH + 6); x += w + 2 * u; } fill(gn); }
    lights.slice(0, 500).forEach(([x, y, p]) => { gw.fillStyle = p < 0.6 ? 'rgba(255,214,140,.9)' : 'rgba(255,240,200,.75)'; gw.fillRect(x, y, 2.2 * u + 0.6, 3 * u + 0.6); });
    return { far, near, win, tintF: mk(W * rs, H * rs), tintN: mk(W * rs, H * rs), type };
  }

  // ---------- clouds ----------
  const LAYERS = [
    { top: 0.4, h: 0.3, scale: 0.55, speed: 4, par: 3, seed: 101 }, { top: 0.16, h: 0.36, scale: 0.95, speed: 9, par: 7, seed: 202 }, { top: -0.04, h: 0.38, scale: 1.6, speed: 17, par: 14, seed: 303 },
  ];
  let lc = [], clouds = [];
  function puff(g, x, y, r, pass) {
    const gr = g.createRadialGradient(x, y - r * 0.15, 0, x, y, r);
    if (pass === 0) { gr.addColorStop(0, 'rgba(118,132,158,.5)'); gr.addColorStop(1, 'rgba(118,132,158,0)'); }
    else { gr.addColorStop(0, 'rgba(255,255,255,.88)'); gr.addColorStop(0.55, 'rgba(240,244,251,.5)'); gr.addColorStop(1, 'rgba(236,241,250,0)'); }
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function cloudTile(L, dense, tw, th) {
    const c = mk(tw, th), g = c.getContext('2d'), r = U.rng(L.seed + (dense ? 7 : 0)), u = (H * rs * 0.5) / 450;
    const n = dense ? 20 : 11, puffs = [];
    for (let k = 0; k < n; k++) {
      const cw = (dense ? 300 + r() * 380 : 150 + r() * 280) * u * L.scale, cx = r() * tw, cy = th * (0.3 + 0.5 * r()), m = 7 + Math.floor(r() * 9);
      for (let i = 0; i < m; i++) { const px = cx + (r() - 0.5) * cw, pr = (cw * 0.12 + r() * cw * 0.17) * (1 - Math.abs(px - cx) / cw * 0.6); puffs.push([px, cy + (r() - 0.5) * cw * (dense ? 0.12 : 0.17) - (1 - Math.abs(px - cx) / cw) * cw * 0.06, pr]); }
    }
    for (let pass = 0; pass < 2; pass++) puffs.forEach(([x, y, pr]) => { const yy = y + (pass === 0 ? pr * 0.32 : -pr * 0.06); for (const dx of [0, -tw, tw]) if (x + dx + pr > 0 && x + dx - pr < tw) puff(g, x + dx, yy, pr, pass); });
    return c;
  }
  function buildClouds() {
    const hw = Math.ceil(W * rs * 0.5), hh = Math.ceil(H * rs * 0.5);
    lc = LAYERS.map(() => { const c = mk(hw, hh); return c; });
    clouds = LAYERS.map((L) => { const th = Math.ceil(hh * L.h); return { tile: [cloudTile(L, false, 1400, th), cloudTile(L, true, 1400, th)], off: R() * 1400, th }; });
  }

  // ---------- particles ----------
  const RN = 720, SN = 420;
  const rain = new Float32Array(RN * 5), snow = new Float32Array(SN * 4), ripples = [];
  function seedRain(i, full) { const z = R(); rain[i * 5] = R() * (W + 400) - 200; rain[i * 5 + 1] = full ? R() * H : -R() * 200; rain[i * 5 + 2] = z; rain[i * 5 + 3] = 0; rain[i * 5 + 4] = yH + (H - yH) * (0.04 + 0.96 * Math.pow(z, 1.3)) - 6; }
  function seedSnow(i, full) { snow[i * 4] = R() * W; snow[i * 4 + 1] = full ? R() * H : -10 - R() * 60; snow[i * 4 + 2] = R(); snow[i * 4 + 3] = R() * TAU; }
  let flake = null;
  function makeFlake() { flake = mk(32, 32); const g = flake.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }
  // ---------- stars / milky way ----------
  const stars = []; let mw = null;
  function buildStars() {
    const r = U.rng(4242); stars.length = 0;
    for (let i = 0; i < 1100; i++) stars.push([r(), Math.pow(r(), 0.8) * 0.78, r() < 0.06 ? 1.8 : r() < 0.3 ? 1.2 : 0.8, r() * TAU, 0.3 + r() * 0.7, r() < 0.12 ? (r() < 0.5 ? 1 : 2) : 0]);
    const g2 = U.rng(99); for (let i = 0; i < 650; i++) { const a = g2() * 2 - 1, n = (g2() + g2() + g2() - 1.5) * 0.09; stars.push([0.5 + a * 0.6 - n * 0.35, 0.4 + a * 0.3 + n, 0.7, g2() * TAU, 0.25 + g2() * 0.35, 0]); }
    const w = 720, h = 420; mw = mk(w, h); const g = mw.getContext('2d'); g.translate(w / 2, h / 2); g.rotate(-0.42);
    for (let i = 0; i < 70; i++) { const x = (g2() - 0.5) * w * 1.1, y = (g2() + g2() - 1) * 34, rr = 40 + g2() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(190,200,255,${0.05 + g2() * 0.05})`); gr.addColorStop(1, 'rgba(190,200,255,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    for (let i = 0; i < 26; i++) { const x = (g2() - 0.5) * w, y = (g2() - 0.5) * 30, gr = g.createRadialGradient(x, y, 0, x, y, 26); gr.addColorStop(0, 'rgba(8,10,28,.22)'); gr.addColorStop(1, 'rgba(8,10,28,0)'); g.fillStyle = gr; g.fillRect(x - 26, y - 26, 52, 52); }
  }
  // ---------- moon sprite with phase ----------
  function moonSpriteFor(R0, phase) {
    const key = R0.toFixed(0) + ':' + phase.toFixed(2); if (key === lastMoonKey) return;
    lastMoonKey = key; const sz = Math.ceil(R0 * 2 * rs) + 4, c = mk(sz, sz), g = c.getContext('2d'); const r = R0 * rs, cx = sz / 2;
    g.translate(cx, cx);
    g.fillStyle = 'rgba(40,48,78,.92)'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); // earthshine disc
    const k = Math.cos(TAU * phase), waxing = phase < 0.5;
    g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
    g.fillStyle = '#eef0e6'; g.beginPath();
    if (waxing) { g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); g.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0); }
    else { g.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, false); g.ellipse(0, 0, Math.abs(k) * r, r, 0, -Math.PI / 2, Math.PI / 2, k > 0); }
    g.fill();
    const cr = U.rng(5); g.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 16; i++) { const a = cr() * TAU, d = Math.sqrt(cr()) * r * 0.85, rr = (0.05 + cr() * 0.17) * r, gr = g.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, rr); gr.addColorStop(0, 'rgba(150,158,170,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); }
    g.restore(); moonSprite = c;
  }

  // ---------- lightning ----------
  function makeBolt(x0) {
    const path = [], branches = [];
    const build = (ax, ay, bx, by, d, depth, out) => { if (depth === 0) { out.push([bx, by]); return; } const mx = (ax + bx) / 2 + (R() - 0.5) * d, my = (ay + by) / 2 + (R() - 0.5) * d * 0.3; build(ax, ay, mx, my, d * 0.55, depth - 1, out); build(mx, my, bx, by, d * 0.55, depth - 1, out); };
    const x1 = x0 + (R() - 0.5) * W * 0.22, y1 = yH - R() * H * 0.04; path.push([x0, -10]); build(x0, -10, x1, y1, W * 0.12, 6, path);
    for (let i = 4; i < path.length - 4; i += 3 + Math.floor(R() * 5)) if (R() < 0.45) { const [bx, by] = path[i], dir = R() < 0.5 ? -1 : 1, b = [[bx, by]]; build(bx, by, bx + dir * (40 + R() * 160), by + 80 + R() * 200, 50, 4, b); branches.push(b); }
    return { path, branches, x: x0 };
  }
  Sky.strike = (x) => { bolt = makeBolt(x === undefined ? W * (0.15 + 0.7 * R()) : x); boltT = 0; thunderAt = 0.7 + R() * 1.4; thunder = 0; };
  const flashCurve = (s) => (s < 0.05 ? s / 0.05 : s < 0.11 ? 1 - (s - 0.05) / 0.06 * 0.65 : s < 0.19 ? 0.35 + (s - 0.11) / 0.08 * 0.6 : 0.95 * Math.exp(-(s - 0.19) * 7));

  // ---------- public API ----------
  Sky.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d'); reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    makeFlake(); buildStars();
    for (let i = 0; i < RN; i++) seedRain(i, true);
    for (let i = 0; i < SN; i++) seedSnow(i, true);
    Sky.resize(); addEventListener('resize', () => { clearTimeout(Sky._rt); Sky._rt = setTimeout(Sky.resize, 180); });
    addEventListener('pointermove', (e) => { T.par = (e.clientX / innerWidth - 0.5) * 2; });
  };
  Sky.resize = function () {
    W = innerWidth; H = innerHeight; const cap = Math.sqrt(3.2e6 / (W * H)); rs = Math.max(0.6, Math.min(devicePixelRatio || 1, 1.5, cap) * (quality < 0.6 ? 0.8 : 1));
    cv.width = Math.round(W * rs); cv.height = Math.round(H * rs); yH = H * (W < 700 ? 0.8 : 0.78); lastMoonKey = '';
    buildClouds(); sky = buildSkyline(wantType, Sky._seed || 1); prevSky = null; skyFade = 1;
  };
  Sky.setCity = function (type, seed) { if (sky && sky.type === type && Sky._seed === seed) return; Sky._seed = seed; wantType = type; if (!W) return; prevSky = sky; sky = buildSkyline(type, seed); skyFade = prevSky ? 0 : 1; };
  Sky.set = function (o, snap) { Object.assign(T, o); if (snap) snapNext = true; };

  function targetXY() {
    const th = T.theta, arc = (yH - H * 0.13) * (0.5 + 0.5 * clamp(T.maxAlt / 80, 0.3, 1));
    T.sx = lerp(0.1, 0.9, th) * W; T.sy = yH - Math.sin(Math.PI * th) * arc;
    const m = T.moonTheta; T.mx = lerp(0.12, 0.88, m) * W; T.my = yH - Math.sin(Math.PI * m) * (yH - H * 0.16) * 0.92;
  }

  Sky.frame = function (dt, now) {
    if (!ctx) return; t = now;
    frameEMA = lerp(frameEMA, dt * 1000, 0.05);
    if (frameEMA > 26 && quality > 0.35) quality -= dt * 0.25; else if (frameEMA < 15 && quality < 1) quality += dt * 0.08;
    targetXY();
    const k = snapNext ? 1 : 1 - Math.exp(-dt * 4.5); snapNext = false;
    SM.forEach((key) => { S[key] = lerp(S[key], T[key], key === 'sx' || key === 'sy' || key === 'mx' || key === 'my' ? Math.min(1, k * 1.6) : k); });
    S.phase = T.moonPhase; S.morning = T.theta < 0.5 ? 1 : 0; S.par = lerp(S.par, T.par, 1 - Math.exp(-dt * 3));
    if (skyFade < 1) skyFade = Math.min(1, skyFade + dt / 0.9);
    const rm = reduced ? 0.12 : 1;
    const w = { cloud: S.cloud, rain: S.rain, snow: S.snow, storm: S.storm, fog: S.fog, heat: S.heat };
    const pal = palette(S.alt, w, S.morning); Object.assign(info, { lum: pal.lum, mid: pal.mid, hor: pal.hor, day: pal.day });
    const day = pal.day, night = smooth(-4, -15, S.alt), tw = pal.tw;
    ctx.setTransform(rs, 0, 0, rs, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // sky gradient
    const gr = ctx.createLinearGradient(0, 0, 0, yH + 10); gr.addColorStop(0, rgb(pal.top)); gr.addColorStop(0.55, rgb(pal.mid)); gr.addColorStop(1, rgb(pal.hor));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const clearish = (1 - S.cloud * 0.92) * (1 - S.fog * 0.9) * (1 - S.storm * 0.5);
    // milky way + stars
    if (night > 0.02) {
      const a = night * clearish * (1 - S.illum * 0.6);
      ctx.save(); ctx.globalAlpha = a * 0.9; ctx.translate(W * 0.5, H * 0.34); ctx.rotate(t * 0.0004 * rm); const sc = Math.max(W / 560, 1.4); ctx.drawImage(mw, -360 * sc, -210 * sc, 720 * sc, 420 * sc); ctx.restore();
      ctx.fillStyle = '#fff';
      for (let i = 0; i < stars.length; i++) { const s = stars[i]; const tw2 = reduced ? 0.85 : 0.65 + 0.35 * Math.sin(t * (1 + s[4] * 2.5) + s[3]); ctx.globalAlpha = a * s[4] * tw2; if (s[5]) ctx.fillStyle = s[5] === 1 ? '#cfe0ff' : '#ffe2c4'; else ctx.fillStyle = '#fff'; ctx.fillRect(s[0] * W + S.par * 6 * s[4], s[1] * yH, s[2], s[2]); }
      ctx.globalAlpha = 1;
    }
    // horizon glow (twilight band) and sun
    ctx.globalCompositeOperation = 'lighter';
    const sc = sunColor(S.alt);
    if (tw > 0.02) { const gw = ctx.createRadialGradient(S.sx, yH, 0, S.sx, yH, W * 0.7); gw.addColorStop(0, rgb(sc, 0.5 * tw * (1 - S.cloud * 0.4))); gw.addColorStop(1, rgb(sc, 0)); ctx.save(); ctx.translate(0, yH); ctx.scale(1, 0.55); ctx.translate(0, -yH); ctx.fillStyle = gw; ctx.fillRect(0, yH - W, W, W * 1.3); ctx.restore(); }
    const sunR = clamp(Math.min(W, H) * 0.038, 20, 46), sunVis = clamp(1 - S.cloud * 0.6 - S.fog * 0.35 - S.storm * 0.4, 0.06, 1) * smooth(-4, 1, S.alt + (yH - S.sy) / 60);
    if (S.sy < yH + sunR * 2 && sunVis > 0.02) {
      let g2 = ctx.createRadialGradient(S.sx, S.sy, 0, S.sx, S.sy, sunR * 11); g2.addColorStop(0, rgb(sc, 0.5 * sunVis)); g2.addColorStop(0.25, rgb(sc, 0.14 * sunVis)); g2.addColorStop(1, rgb(sc, 0)); ctx.fillStyle = g2; ctx.fillRect(S.sx - sunR * 11, S.sy - sunR * 11, sunR * 22, sunR * 22);
      if (!reduced && tw > 0.05 && S.cloud > 0.08 && S.cloud < 0.92) { // god rays
        for (let i = 0; i < 9; i++) { const ang = -Math.PI / 2 + (i - 4) * 0.2 + Math.sin(t * 0.15 + i * 1.7) * 0.03, L = W * 0.9, hw = 0.035 + (i % 3) * 0.012; const x1 = S.sx + Math.cos(ang - hw) * L, y1 = S.sy + Math.sin(ang - hw) * L, x2 = S.sx + Math.cos(ang + hw) * L, y2 = S.sy + Math.sin(ang + hw) * L; const lg = ctx.createLinearGradient(S.sx, S.sy, S.sx + Math.cos(ang) * L, S.sy + Math.sin(ang) * L); lg.addColorStop(0, rgb(sc, 0.11 * tw * sunVis)); lg.addColorStop(1, rgb(sc, 0)); ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(S.sx, S.sy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.fill(); }
      }
      ctx.globalCompositeOperation = 'source-over';
      const g3 = ctx.createRadialGradient(S.sx, S.sy, sunR * 0.2, S.sx, S.sy, sunR); g3.addColorStop(0, 'rgba(255,255,250,' + sunVis + ')'); g3.addColorStop(0.8, rgb(sc, sunVis * 0.95)); g3.addColorStop(1, rgb(sc, 0)); ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(S.sx, S.sy, sunR * 1.06, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // moon
    const mR = clamp(Math.min(W, H) * 0.034, 18, 40), mAlpha = smooth(-2, -9, S.alt) * (1 - S.cloud * 0.8) * (1 - S.fog * 0.8) * smooth(-0.1, 0.3, T.moonTheta) * smooth(1.1, 0.7, T.moonTheta);
    if (mAlpha > 0.02 && S.my < yH + mR) {
      moonSpriteFor(mR, S.phase);
      const gm = ctx.createRadialGradient(S.mx, S.my, mR * 0.6, S.mx, S.my, mR * 7); gm.addColorStop(0, `rgba(190,205,255,${0.28 * mAlpha * (0.3 + S.illum * 0.7)})`); gm.addColorStop(1, 'rgba(190,205,255,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gm; ctx.fillRect(S.mx - mR * 7, S.my - mR * 7, mR * 14, mR * 14); ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = mAlpha; ctx.drawImage(moonSprite, S.mx - mR - 2 / rs, S.my - mR - 2 / rs, moonSprite.width / rs, moonSprite.height / rs); ctx.globalAlpha = 1;
    }
    // storm flash bookkeeping
    if (S.storm > 0.25 && !reduced) { nextStrike -= dt; if (nextStrike < 0 && !bolt) { Sky.strike(); nextStrike = (2.5 + R() * 6) / (0.4 + S.storm); } }
    let f = 0;
    if (bolt) { boltT += dt; f = flashCurve(boltT); if (boltT > 1.6) bolt = null; if (thunderAt > 0 && boltT > thunderAt) thunder = 1; }
    if (thunder > 0) thunder = Math.max(0, thunder - dt * 0.6);
    flash = f;
    // clouds
    const hw = lc[0].width, hh = lc[0].height, cs = S.cloud;
    const aS = Math.min(1, cs * 2.3) * (1 - smooth(0.5, 0.95, cs) * 0.65), aD = smooth(0.4, 0.92, cs);
    const nightTone = [22, 28, 50], moonTone = [110, 124, 168];
    const dayTone = mix3(sc, [255, 255, 255], smooth(2, 26, S.alt) * 0.75);
    let tint = mix3(mix3(nightTone, moonTone, S.illum * 0.3 * night), dayTone, day);
    tint = mix3(tint, [70, 78, 96], clamp(S.storm * 0.85 + S.rain * 0.3 + S.snow * 0.1, 0, 1) * (0.4 + 0.6 * day));
    let tintA = lerp(0.8, 0.34, day) + S.storm * 0.3 + S.rain * 0.14 - f * 0.6;
    tintA = clamp(tintA, 0.05, 0.92);
    const windPush = S.windX * 0.55 * rm;
    for (let li = 0; li < 3; li++) {
      const L = LAYERS[li], c = clouds[li], g = lc[li].getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, hw, hh);
      c.off += (L.speed * rm + windPush * (0.55 + li * 0.3)) * dt * 0.5 * rs * 2; const tw0 = c.tile[0].width; const ty = Math.round(L.top * hh), off = ((c.off % tw0) + tw0) % tw0 + S.par * L.par * rs * 0.5;
      const lay = clamp(0.9 - (S.fog > 0.3 ? S.fog * 0.3 : 0), 0, 1) * (li === 0 ? 0.85 : 1);
      for (let x = off - tw0; x < hw; x += tw0) { if (aS > 0.01) { g.globalAlpha = aS * lay; g.drawImage(c.tile[0], x, ty); } if (aD > 0.01) { g.globalAlpha = aD * lay; g.drawImage(c.tile[1], x, ty); } }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-atop'; g.fillStyle = rgb(tint, tintA * (li === 0 ? 0.85 : 1)); g.fillRect(0, 0, hw, hh);
      ctx.drawImage(lc[li], 0, 0, W, H);
    }
    if (f > 0.01) { ctx.fillStyle = `rgba(185,200,255,${0.4 * f})`; ctx.fillRect(0, 0, W, yH); }
    if (thunder > 0.01 && bolt) { const tg = ctx.createRadialGradient(bolt.x, H * 0.2, 0, bolt.x, H * 0.2, W * 0.6); const ta = 0.2 * Math.sin(Math.PI * (1 - thunder)); tg.addColorStop(0, `rgba(130,150,215,${ta})`); tg.addColorStop(1, 'rgba(130,150,215,0)'); ctx.fillStyle = tg; ctx.fillRect(0, 0, W, yH); }
    // horizon layers (tinted silhouettes), crossfading between cities
    const drawSky = (sk, alpha) => {
      const hc = pal.hor, farC = mix3(hc, [16, 24, 40], 0.5 + 0.25 * (1 - day)), nearC = mix3(hc, [6, 10, 20], 0.86);
      [[sk.far, sk.tintF, farC], [sk.near, sk.tintN, nearC]].forEach(([mask, tc, col], idx) => {
        const g = tc.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, tc.width, tc.height); g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = rgb(col); g.fillRect(0, 0, tc.width, tc.height);
        ctx.globalAlpha = alpha; const sh = S.heat * 2.6 * (reduced ? 0 : 1), px = S.par * (idx ? -10 : -5);
        if (sh > 0.1 && idx === 0) { const y0 = Math.floor((yH - H * 0.3) * rs), step = Math.max(2, Math.round(3 * rs)); for (let y = y0; y < tc.height; y += step) ctx.drawImage(tc, 0, y, tc.width, step, Math.sin(t * 2 + y * 0.05) * sh + px, y / rs, W, step / rs); }
        else ctx.drawImage(tc, 0, 0, tc.width, tc.height, px, 0, W, H);
        ctx.globalAlpha = 1;
      });
      const wa = smooth(-2, -9, S.alt) * alpha * (0.85 + 0.1 * Math.sin(t * 0.7)); if (wa > 0.02) { ctx.globalAlpha = wa * 0.95; ctx.drawImage(sk.win, 0, 0, sk.win.width, sk.win.height, S.par * -10, 0, W, H); ctx.globalAlpha = 1; }
    };
    if (prevSky && skyFade < 1) { drawSky(sky, 1); drawSky(prevSky, 1 - skyFade); } else drawSky(sky, 1);
    // wet ground sheen / snow cover
    if (S.rain > 0.05) { const wg = ctx.createLinearGradient(0, yH, 0, H); wg.addColorStop(0, rgb(pal.hor, 0.18 * S.rain)); wg.addColorStop(1, rgb(pal.hor, 0)); ctx.fillStyle = wg; ctx.fillRect(0, yH, W, H - yH); }
    if (S.snow > 0.2) { const wg = ctx.createLinearGradient(0, yH, 0, H); wg.addColorStop(0, `rgba(235,242,250,${0.5 * S.snow})`); wg.addColorStop(1, `rgba(225,235,248,${0.2 * S.snow})`); ctx.fillStyle = wg; ctx.fillRect(0, yH, W, H - yH); }
    // fog
    if (S.fog > 0.02) {
      const fc = mix3(mix3([30, 38, 58], [208, 216, 226], day), pal.hor, 0.2);
      ctx.fillStyle = rgb(fc, S.fog * 0.42); ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 4; i++) {
        const fy = yH - H * (0.22 - i * 0.07), hgt = H * (0.2 + i * 0.05), sp = (8 + i * 6) * (1 + S.wind / 25) * rm * Math.sign(S.windX || 1), ox = ((t * sp + i * 311) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2;
        for (const off of [0, -W * 1.4]) { const fg = ctx.createRadialGradient(ox + off + W * 0.5, fy, 0, ox + off + W * 0.5, fy, W * 0.7); fg.addColorStop(0, rgb(fc, S.fog * (0.42 - i * 0.05))); fg.addColorStop(1, rgb(fc, 0)); ctx.save(); ctx.translate(0, fy); ctx.scale(1, hgt / (W * 0.7)); ctx.translate(0, -fy); ctx.fillStyle = fg; ctx.fillRect(ox + off - W * 0.3, fy - W * 0.7, W * 1.6, W * 1.4); ctx.restore(); }
      }
    }
    // rain
    if (S.rain > 0.02) {
      const n = Math.floor(RN * clamp(S.rain * 1.15 + S.storm * 0.3, 0, 1) * quality * (reduced ? 0.35 : 1)), vx = S.windX * 7 * (reduced ? 0.3 : 1), sp = reduced ? 0.3 : 1;
      for (let i = 0; i < n; i++) { const o = i * 5, z = rain[o + 2], vy = (800 + 900 * z) * sp; rain[o] += vx * (0.4 + z) * dt; rain[o + 1] += vy * dt; if (rain[o + 1] > rain[o + 4]) { if (quality > 0.5 && ripples.length < 90 && R() < 0.55 && !reduced) ripples.push([rain[o], rain[o + 4], 0, z]); seedRain(i, false); rain[o + 1] = -R() * 120; if (vx > 0) rain[o] -= 0; }
        if (rain[o] > W + 220) rain[o] -= W + 440; if (rain[o] < -220) rain[o] += W + 440; }
      const buckets = [[0, 0.4, 0.2, 0.8], [0.4, 0.75, 0.3, 1.1], [0.75, 1.01, 0.46, 1.5]];
      ctx.lineCap = 'round';
      buckets.forEach(([a, b, al, lw]) => { ctx.strokeStyle = `rgba(${day > 0.3 ? '225,236,255' : '180,200,240'},${al * clamp(S.rain + 0.25, 0, 1)})`; ctx.lineWidth = lw; ctx.beginPath(); for (let i = 0; i < n; i++) { const o = i * 5, z = rain[o + 2]; if (z < a || z >= b) continue; const len = (8 + z * 20) * sp, sl = vx / (800 + 900 * z); ctx.moveTo(rain[o], rain[o + 1]); ctx.lineTo(rain[o] - sl * len * 1.3 * (0.4 + z), rain[o + 1] - len); } ctx.stroke(); });
      ctx.lineWidth = 1;
      for (let i = ripples.length - 1; i >= 0; i--) { const rp = ripples[i]; rp[2] += dt * 1.6; if (rp[2] >= 1) { ripples.splice(i, 1); continue; } ctx.strokeStyle = `rgba(215,230,255,${0.4 * (1 - rp[2]) * (0.4 + rp[3])})`; ctx.beginPath(); ctx.ellipse(rp[0], rp[1], 2 + rp[2] * 16 * (0.5 + rp[3]), (2 + rp[2] * 16 * (0.5 + rp[3])) * 0.28, 0, 0, TAU); ctx.stroke(); }
    } else ripples.length = 0;
    // snow
    if (S.snow > 0.02) {
      const n = Math.floor(SN * clamp(S.snow * 1.2, 0, 1) * quality * (reduced ? 0.4 : 1)), vx = S.windX * 3.2;
      for (let i = 0; i < n; i++) { const o = i * 4, z = snow[o + 2]; snow[o + 1] += (28 + 70 * z) * dt * (reduced ? 0.3 : 1); snow[o] += (vx * (0.3 + z) + Math.sin(t * (0.5 + z) + snow[o + 3]) * 16 * z) * dt; if (snow[o + 1] > yH + (H - yH) * z + 10) seedSnow(i, false); if (snow[o] > W + 20) snow[o] = -20; else if (snow[o] < -20) snow[o] = W + 20; const sz = 3 + z * 11; ctx.globalAlpha = (0.35 + 0.65 * z) * clamp(S.snow + 0.3, 0, 1); ctx.drawImage(flake, snow[o] - sz / 2, snow[o + 1] - sz / 2, sz, sz); }
      ctx.globalAlpha = 1;
    }
    // lightning bolt (drawn on top)
    if (bolt && f > 0.02) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const stroke = (pts, w0, col, a) => { ctx.lineWidth = w0; ctx.strokeStyle = col.replace('A', (a * f).toFixed(3)); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
      ctx.globalCompositeOperation = 'lighter';
      [[bolt.path, 1], ...bolt.branches.map((b) => [b, 0.5])].forEach(([p, s]) => { stroke(p, 14 * s, 'rgba(120,150,255,A)', 0.12); stroke(p, 6 * s, 'rgba(170,190,255,A)', 0.3); stroke(p, 2.2 * s, 'rgba(255,255,255,A)', 1); });
      ctx.globalCompositeOperation = 'source-over';
    }
    // expose flash to the UI (glass edges catch the light)
    const fv = Math.round(f * 20) / 20; if (fv !== flashVar) { flashVar = fv; document.documentElement.style.setProperty('--flash', fv); }
  };
  Sky.quality = () => quality;
})();
