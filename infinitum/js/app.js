/* INFINITUM - application: camera, input, progressive render loop, dives, tour, intro, sharing, export. */
(function () {
  'use strict';
  const INF = window.INF, $ = (id) => document.getElementById(id);
  const S = INF.defaultState();
  const app = (INF.app = { S, user: INF.store.get('bookmarks', []), tourOn: false, juliaOrbit: { on: false, r: 0.06, c0: null, t: 0 }, exportOpts: { size: 2048, aspect: 'view', samples: 4 } });
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HOME = INF.HOME_SCALE, LN_HOME = Math.log(HOME), IDLE_MS = 170;
  const canvas = $('gl'), body = document.body;
  const TOUR_ORDER = [0, 2, 4, 7, 8, 6, 9, 1, 10, 12, 11, 5, 3, 13];

  let R;
  try { R = new INF.Renderer(canvas); } catch (e) { $('noGL').hidden = false; $('noGLmsg').textContent = e.message + ' INFINITUM needs WebGL 2 with float render targets.'; body.classList.remove('booting'); return; }
  app.R = R;

  /* ------------------------------------------------------------------ geometry */
  let cssW = 1, cssH = 1, ratio = 1;
  function resize() {
    const r = canvas.getBoundingClientRect(); cssW = Math.max(200, r.width); cssH = Math.max(200, r.height);
    const q = S.quality.pixelRatio; ratio = q === '1' ? 1 : q === '2' ? 2 : Math.min(window.devicePixelRatio || 1, 2);
    if (cssW * cssH * ratio * ratio > 8.4e6) ratio = Math.sqrt(8.4e6 / (cssW * cssH));
    const w = Math.round(cssW * ratio), h = Math.round(cssH * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; R.alloc(w, h); RS.iterSig = ''; RS.insetDirty = true; }
    layoutInset();
  }
  app.resize = resize;
  const famInfo = () => {
    const f = INF.famById(S.family);
    if (S.family === 'julia') return { kind: 1, variant: S.julia.variant, pow: S.julia.pow };
    if (S.family === 'multibrot') return { kind: 0, variant: 0, pow: S.power };
    return { kind: f.kind, variant: f.variant, pow: 2 };
  };
  const toWorld = (px, py, v = S.view) => {
    const s = Math.exp(v.ls), ox = (px - cssW / 2) / cssH * s, oy = -(py - cssH / 2) / cssH * s, c = Math.cos(v.rot), sn = Math.sin(v.rot);
    return { x: v.cx + c * ox - sn * oy, y: v.cy + sn * ox + c * oy };
  };
  const minLs = () => Math.log(Math.max(1e-14, INF.precision(S, cssH).minScale));
  const maxLs = Math.log(HOME * 2);
  // Zoom about a screen point, keeping the world point under it fixed.
  function zoomTo(newLs, px, py) {
    newLs = Math.max(minLs(), Math.min(maxLs, newLs));
    const p = toWorld(px, py), v = S.view, s2 = Math.exp(newLs);
    const ox = (px - cssW / 2) / cssH, oy = -(py - cssH / 2) / cssH, c = Math.cos(v.rot), sn = Math.sin(v.rot);
    v.cx = p.x - (c * ox - sn * oy) * s2; v.cy = p.y - (sn * ox + c * oy) * s2; v.ls = newLs;
  }
  function panBy(dxPx, dyPx) {
    const v = S.view, s = Math.exp(v.ls), c = Math.cos(v.rot), sn = Math.sin(v.rot), ox = -dxPx / cssH * s, oy = dyPx / cssH * s;
    v.cx += c * ox - sn * oy; v.cy += sn * ox + c * oy;
  }
  const homeView = (id) => { const f = INF.famById(id); return { cx: f.home.cx, cy: f.home.cy, ls: LN_HOME, rot: 0 }; };

  /* -------------------------------------------------------------- render jobs */
  let rootCache = { key: '', roots: [] };
  const rootsFor = () => { const k = S.poly.join(','); if (rootCache.key !== k) rootCache = { key: k, roots: INF.polyRoots(S.poly) }; return rootCache.roots; };
  function trapGeometry() {
    const p = S.trapParam;
    if (S.trapType === 1) return [p * 1.6 - 0.8, 0.25, 0, 0];
    if (S.trapType === 2) { const a = p * Math.PI; return [-Math.sin(a), Math.cos(a), 0.12, 0]; }
    if (S.trapType === 3) return [0, 0, 0.3 + 1.2 * p, 0];
    return [p * 0.8 - 0.4, 0.05, 0, 0];
  }
  function makeJob(hpx) {
    const fi = famInfo(), v = S.view, pr = INF.precision(S, hpx || cssH);
    const J = { kind: fi.kind, variant: fi.variant, deep: pr.deep, pow: fi.pow, maxIter: INF.iterCount(S), cx: v.cx, cy: v.cy, scale: Math.exp(v.ls), rot: v.rot, jx: S.julia.x, jy: S.julia.y, trapType: (S.mode === 1 || S.interior === 2) ? S.trapType : 0, trap: trapGeometry() };
    if (fi.kind === 2) { J.poly = S.poly; J.roots = rootsFor(); }
    return J;
  }
  function makeColour() {
    const { az, el } = S.light;
    return { family: S.family === 'newton' ? 1 : 0, mode: S.mode, interior: S.interior, pal: S.pal, phase: S.phase, density: S.density, glow: S.glow, relief: S.relief, trapK: 3, nRoots: S.family === 'newton' ? rootsFor().length : 1,
      light: [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)] };
  }
  const iterSigOf = () => { const v = S.view, j = S.julia; return [S.family, v.cx, v.cy, v.ls, v.rot, S.power, j.x, j.y, j.variant, j.pow, S.poly.join(','), (S.mode === 1 || S.interior === 2) ? S.trapType + ':' + S.trapParam : 0, S.quality.iterMul, canvas.width, canvas.height].join('|'); };
  const colSigOf = () => { const p = S.pal; return [S.mode, S.interior, p.a, p.b, p.c, p.d, S.phase, S.density, S.glow, S.relief, S.light.az, S.light.el, S.trapParam].join('|'); };
  app.iterChanged = () => { RS.iterSig = ''; };
  app.colourChanged = () => { RS.colSig = ''; };
  app.qualityChanged = () => { RS.aa = Math.min(RS.aa, S.quality.samples); };

  /* ---------------------------------------------------------- progressive loop */
  const RS = { iterSig: '', colSig: '', moving: false, lastMove: 0, aa: 0, rect: [1, 1], full: false, scaleMove: 0.6, ema: 16, fade: 1, insetDirty: true, insetC: { x: -0.5, y: 0 }, insetLocked: false, insetPos: null, busy: false, fps: 60, lastHash: 0, dataOk: false, refining: false };
  let last = performance.now(), frames = 0, fpsT = last;

  function crossfade() { if (!RS.dataOk) return; R.capture(RS.rect, 1); RS.fade = 0; }
  function renderFrame(now, dt) {
    const sig = iterSigOf(); const W = canvas.width, H = canvas.height;
    const iterChanged = sig !== RS.iterSig; if (iterChanged) { RS.iterSig = sig; RS.lastMove = now; RS.moving = true; RS.aa = 0; RS.full = false; }
    const colSig = colSigOf(), colourDirty = colSig !== RS.colSig; RS.colSig = colSig;
    const idle = now - RS.lastMove > IDLE_MS, maxS = S.quality.samples;
    let dirty = false, C = null;
    const col = () => C || (C = makeColour());
    if (iterChanged) {
      if (S.quality.adaptive) {
        if (RS.ema > 30) RS.scaleMove = Math.max(0.22, RS.scaleMove * 0.88); else if (RS.ema < 18) RS.scaleMove = Math.min(1, RS.scaleMove * 1.05);
      } else RS.scaleMove = 1;
      const s = RS.scaleMove, w = Math.max(32, Math.floor(W * s)), h = Math.max(32, Math.floor(H * s));
      R.iterate('data0', w, h, makeJob(), [0, 0]); R.shade('data0', w, h, 0, col());
      RS.rect = [w, h]; RS.full = w >= W; RS.aa = 1; RS.dataOk = true; dirty = true;
    } else if (colourDirty && RS.dataOk) {
      R.shade('data0', RS.rect[0], RS.rect[1], 0, col()); RS.aa = 1; dirty = true; RS.insetDirty = true;
    } else if (idle && RS.dataOk && !RS.full) {
      R.iterate('data0', W, H, makeJob(), [0, 0]); R.shade('data0', W, H, 0, col());
      RS.rect = [W, H]; RS.full = true; RS.aa = 1; RS.moving = false; dirty = true;
    } else if (idle && RS.dataOk && RS.aa < maxS) {
      const k = RS.aa;
      R.iterate('dataJ', W, H, makeJob(), [INF.halton(k + 1, 2) - 0.5, INF.halton(k + 1, 3) - 0.5]); R.shade('dataJ', W, H, k, col());
      RS.aa = k + 1; dirty = true;
    }
    if (RS.fade < 1) { RS.fade = Math.min(1, RS.fade + dt / 0.9); dirty = true; }
    if (RS.insetDirty && insetVisible()) { R.renderInset(insetJob(), insetColour()); RS.insetDirty = false; dirty = true; }
    if (dirty) { const f = RS.fade; R.present(RS.rect, f * f * (3 - 2 * f), 1, 0.32); if (insetVisible() && RS.insetPos) R.presentInset(RS.insetPos[0], RS.insetPos[1], RS.insetPos[2], 1); }
    const refining = idle && RS.dataOk && (RS.aa < maxS || !RS.full) && maxS > 1;
    if (refining !== RS.refining || refining) { RS.refining = refining; const el = $('refine'); el.hidden = !refining || app.exporting; if (refining) el.lastChild.textContent = `Refining ${Math.min(RS.aa, maxS)} / ${maxS}`; }
    return iterChanged;
  }

  /* ------------------------------------------------------------ Julia companion */
  const JULIA_OK = () => ['mandelbrot', 'multibrot', 'ship', 'tricorn'].includes(S.family);
  const insetVisible = () => JULIA_OK() && !body.classList.contains('booting') && !$('julia').hidden;
  function insetJob() {
    const fi = famInfo(), c = RS.insetC;
    return { kind: 1, variant: fi.variant, deep: false, pow: fi.pow, maxIter: 170, cx: 0, cy: 0, scale: 3.3, rot: 0, jx: c.x, jy: c.y, trapType: 0, trap: [0, 0, 0, 0] };
  }
  const insetColour = () => Object.assign(makeColour(), { family: 0, glow: Math.min(S.glow, 0.5), mode: S.mode === 1 ? 0 : S.mode });
  function layoutInset() {
    const ring = document.querySelector('#julia .ring'); if (!ring || $('julia').hidden) return;
    const b = ring.getBoundingClientRect(), k = canvas.width / cssW, size = Math.round(b.width * k - 2);
    RS.insetPos = [Math.round((b.left + 1) * k), Math.round(canvas.height - (b.bottom - 1) * k), size]; RS.insetDirty = true;
  }
  function setInsetFromPointer(px, py) {
    if (RS.insetLocked || !JULIA_OK()) return;
    const w = toWorld(px, py), fi = famInfo(); RS.insetC = { x: w.x, y: fi.variant === 1 ? -w.y : w.y }; RS.insetDirty = true;
    $('juliaCap').innerHTML = `Julia set for <b>c = ${w.x.toFixed(5)} ${RS.insetC.y < 0 ? '−' : '+'} ${Math.abs(RS.insetC.y).toFixed(5)}i</b>`;
  }
  function syncJuliaChrome() {
    const show = JULIA_OK(); $('julia').hidden = !show; $('julia').classList.toggle('locked', RS.insetLocked);
    if (show) { layoutInset(); const c = RS.insetC; $('juliaCap').innerHTML = `${RS.insetLocked ? 'Locked' : 'Julia companion'} <b>c = ${c.x.toFixed(5)} ${c.y < 0 ? '−' : '+'} ${Math.abs(c.y).toFixed(5)}i</b>`; }
  }
  $('juliaBtn').addEventListener('click', () => { RS.insetLocked = !RS.insetLocked; syncJuliaChrome(); toast(RS.insetLocked ? 'Julia parameter locked - press J to enter it' : 'Julia companion follows the cursor'); });
  app.toggleJuliaView = function () {
    if (S.family === 'julia') {
      const back = S.julia.base || 'mandelbrot'; crossfade(); S.family = back; const pv = app.prevView || homeView(back);
      S.view = { cx: pv.cx, cy: pv.cy, ls: pv.ls, rot: pv.rot }; app.setJuliaOrbit(false);
    } else if (JULIA_OK()) {
      const fi = famInfo(); app.prevView = Object.assign({}, S.view); crossfade();
      S.julia = { x: RS.insetC.x, y: RS.insetC.y, variant: fi.variant, pow: fi.pow, base: S.family }; S.family = 'julia';
      S.view = { cx: 0, cy: 0, ls: Math.log(7), rot: 0 };
      flyTo({ cx: 0, cy: 0, ls: LN_HOME, rot: 0 }, 2.4);
    } else { toast('Julia companions belong to the Mandelbrot-type families'); return; }
    afterFamilyChange(); toast(S.family === 'julia' ? 'Entered the Julia set' : 'Back in parameter space');
  };
  app.setJuliaOrbit = (on) => { const o = app.juliaOrbit; o.on = on; if (on) { o.c0 = { x: S.julia.x, y: S.julia.y }; o.t = 0; if (S.family !== 'julia') toast('Julia orbit runs inside a Julia view - press J first'); } ui.refreshIfOpen('family'); };

  /* ---------------------------------------------------------------- families */
  app.setFamily = function (id) {
    if (id === S.family) return; crossfade();
    if (id === 'julia') { const fi = famInfo(); S.julia.variant = JULIA_OK() ? fi.variant : S.julia.variant; S.julia.pow = JULIA_OK() ? fi.pow : S.julia.pow; S.julia.base = JULIA_OK() ? S.family : 'mandelbrot'; }
    S.family = id; S.view = homeView(id); afterFamilyChange(); cancelMotion();
  };
  app.setPoly = (coef) => { S.poly = coef; ui.refreshIfOpen('family'); };
  function afterFamilyChange() { $('famName').textContent = INF.famById(S.family).name + (S.family === 'multibrot' ? ` (n = ${S.power})` : ''); syncJuliaChrome(); ui.sync(); ui.refreshIfOpen('family'); if (!RS.titled) freeLabel(); }
  app.setMode = (m) => { S.mode = m; app.colourChanged(); };

  /* ---------------------------------------------------------------- palettes */
  app.setPalette = (i) => { S.palIndex = i; S.pal = INF.clonePal(INF.PALETTES[i]); app.colourChanged(); };
  app.nextPalette = (d) => { const n = INF.PALETTES.length; app.setPalette(((S.palIndex < 0 ? 0 : S.palIndex) + d + n) % n); toast(INF.PALETTES[S.palIndex].name); return true; };
  app.randomPalette = () => {
    const r = Math.random, rnd = (a, b) => a + (b - a) * r();
    S.palIndex = -1; S.pal = { a: [rnd(.25, .6), rnd(.25, .6), rnd(.25, .6)], b: [rnd(.25, .55), rnd(.25, .55), rnd(.25, .55)], c: [rnd(.6, 2), rnd(.6, 2), rnd(.6, 2)].map((v) => Math.round(v * 4) / 4), d: [r(), r(), r()] };
    app.colourChanged();
  };

  /* ------------------------------------------------------------- label + readouts */
  let labelTimer = 0;
  function setLabel(plate, title, caption) {
    const el = $('label'); $('lblPlate').textContent = plate; $('lblTitle').innerHTML = `<em></em>`; $('lblTitle').firstChild.textContent = title; $('lblCaption').textContent = caption || '';
    el.classList.toggle('has-caption', !!caption); el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
  }
  function freeLabel() {
    RS.titled = false; const f = INF.famById(S.family);
    setLabel(S.family === 'julia' ? 'Free study · Julia set' : 'Free study', f.name + (S.family === 'newton' ? ' basins' : ' set'), '');
  }
  function plateLabel(bm, idx) { RS.titled = true; setLabel(`Plate ${INF.roman(idx + 1)} · ${INF.famById(bm.family).name}`, bm.title, bm.caption); }
  function fmtCoord(v) { return (v < 0 ? '−' : '+') + Math.abs(v).toFixed(14); }
  let coordsT = 0;
  function updateReadouts(now) {
    if (now - coordsT < 160) return; coordsT = now;
    const v = S.view, d = INF.depthOf(S), pr = INF.precision(S, cssH), it = INF.iterCount(S);
    $('coords').textContent = `re ${fmtCoord(v.cx)}\nim ${fmtCoord(v.cy)}\n10^${d.toFixed(2)} · ${it.toLocaleString('en-US')} it · ${pr.deep ? 'df64' : 'f32'}`;
    const DMAX = 14, frac = Math.max(0, Math.min(1, d / DMAX));
    $('depthMarker').style.top = (frac * 100) + '%'; $('depthVal').textContent = '10^' + d.toFixed(1);
    const limD = Math.log10(HOME / Math.max(1e-14, pr.minScale)); $('depthLimit').style.height = Math.max(0, (1 - Math.min(1, limD / DMAX)) * 100) + '%';
    const w = $('warn');
    if (pr.ulps < 1.6) { w.hidden = false; w.textContent = 'Precision limit reached — the zoom is held here rather than show noise.'; }
    else if (pr.ulps < 8) { w.hidden = false; w.textContent = 'Nearing the limit of double-single precision: detail will begin to block.'; }
    else w.hidden = true;
    if (!$('info').hidden) updateInfo();
    const st = ui.statsEl(); if (st) st.textContent = statsText();
    if (S.family === 'julia' && $('jreadout')) $('jreadout').textContent = `c₀ = ${S.julia.x.toFixed(4)} ${S.julia.y < 0 ? '−' : '+'} ${Math.abs(S.julia.y).toFixed(4)}i`;
  }
  function statsText() { const pr = INF.precision(S, cssH); return `${RS.fps.toFixed(0)} fps · ${canvas.width}×${canvas.height} px (${Math.round(RS.scaleMove * 100)}% moving)\nmax iterations ${INF.iterCount(S).toLocaleString('en-US')} · path ${pr.path}\npixel = ${pr.ulps.toFixed(1)} ulp · samples ${Math.min(RS.aa, S.quality.samples)}/${S.quality.samples}`; }
  function updateInfo() {
    const v = S.view, pr = INF.precision(S, cssH), f = INF.famById(S.family);
    $('info').innerHTML = `<b>${f.name}</b>  ${f.formula}\ncentre   ${v.cx.toPrecision(17)}\n         ${v.cy.toPrecision(17)}\nscale    ${Math.exp(v.ls).toExponential(4)}  (${(1 / Math.exp(v.ls) * HOME).toExponential(2)}×)\nrotation ${(v.rot * 180 / Math.PI).toFixed(1)}°\n` + statsText() + `\nprecision limit ${pr.minScale.toExponential(1)} (${Math.log10(HOME / pr.minScale).toFixed(1)} decades)` + (S.family === 'newton' ? `\np(z) = ${INF.describePoly(S.poly)}` : '');
  }
  app.toggleInfo = (on) => { const el = $('info'); el.hidden = on == null ? !el.hidden : !on; if (!el.hidden) updateInfo(); ui.sync(); };
  function copyText(t, msg) {
    const done = () => toast(msg);
    if (navigator.clipboard && window.isSecureContext !== false) navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done)); else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy is blocked in this browser context'); } ta.remove(); }
  $('coords').addEventListener('click', () => { const v = S.view; copyText(`${INF.famById(S.family).name}  re=${v.cx.toPrecision(17)}  im=${v.cy.toPrecision(17)}  scale=${Math.exp(v.ls).toExponential(6)}`, 'Coordinates copied'); });
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
  app.toast = toast;

  /* ------------------------------------------------------------ dives + tour */
  let motion = null; // {segs, i, t, dur, total, palFrom, palTo, onEnd}
  const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);
  // Exponential zoom path: the centre converges on the target so it stays put on screen while the scale falls.
  function expView(a, b, u) {
    const ls = a.ls + (b.ls - a.ls) * u, s = Math.exp(ls), sa = Math.exp(a.ls), sb = Math.exp(b.ls);
    const w = Math.abs(sa - sb) < 1e-12 * sa ? u : (s - sb) / (sa - sb);
    return { cx: b.cx + (a.cx - b.cx) * w, cy: b.cy + (a.cy - b.cy) * w, ls, rot: a.rot + (b.rot - a.rot) * ease(u) };
  }
  const segDur = (a, b, dist) => Math.max(1.6, Math.min(8.5, 1.5 + 1.3 * Math.abs(b.ls - a.ls) / Math.LN10 + (dist > 0 ? 0.8 : 0)));
  function cancelMotion() { motion = null; }
  function flyTo(view, dur) { cancelMotion(); motion = { segs: [{ a: Object.assign({}, S.view), b: view, dur }], i: 0, t: 0, total: dur, done: 0, onEnd: null }; }
  function sameTarget(t) {
    if (S.family !== t.family) return false;
    if (t.family === 'multibrot' && S.power !== t.power) return false;
    if (t.family === 'newton' && S.poly.join() !== (t.poly || [-1, 0, 0, 1]).join()) return false;
    if (t.family === 'julia' && (Math.abs(S.julia.x - t.julia.x) > 1e-9 || Math.abs(S.julia.y - t.julia.y) > 1e-9)) return false;
    return true;
  }
  app.dive = function (bm, idx) {
    if (idx == null) idx = INF.BOOKMARKS.indexOf(bm);
    cancelMotion(); $('label').classList.remove('has-caption');
    const v = S.view, from = { cx: v.cx, cy: v.cy, ls: v.ls, rot: v.rot };
    const to = { cx: bm.cx, cy: bm.cy, ls: Math.log(bm.scale), rot: bm.rot || 0 };
    const segs = [];
    if (REDUCED) { segs.push({ apply: true, to }); }
    else if (sameTarget(bm)) {
      const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy), smin = Math.min(Math.exp(from.ls), Math.exp(to.ls));
      if (dist > 2.5 * smin) {
        const mid = { cx: (from.cx + to.cx) / 2, cy: (from.cy + to.cy) / 2, ls: Math.log(Math.min(HOME * 1.2, Math.max(dist * 1.6, Math.exp(Math.max(from.ls, to.ls)) * 0.6))), rot: (from.rot + to.rot) / 2 };
        segs.push({ a: from, b: mid }, { a: mid, b: to });
      } else segs.push({ a: from, b: to });
    } else {
      if (from.ls < LN_HOME - 0.7) segs.push({ a: from, b: { cx: from.cx, cy: from.cy, ls: LN_HOME, rot: 0 } });
      segs.push({ swap: bm }, { a: Object.assign(homeView(bm.family), bm.family === 'newton' || bm.family === 'julia' ? { ls: Math.log(Math.max(3.2, bm.scale)) } : {}), b: to });
    }
    segs.forEach((s) => { if (s.a) s.dur = segDur(s.a, s.b, 0); });
    const total = segs.reduce((t, s) => t + (s.dur || 0), 0) || 0.01;
    motion = { segs, i: 0, t: 0, total, done: 0, palFrom: INF.clonePal(S.pal), palTo: INF.clonePal(INF.PALETTES[bm.pal]), palIndex: bm.pal, bm, idx, onEnd: () => { S.palIndex = bm.pal; S.pal = INF.clonePal(INF.PALETTES[bm.pal]); app.colourChanged(); plateLabel(bm, idx); RS.arrived = performance.now(); } };
    RS.titled = true;
  };
  function applySwap(bm) {
    crossfade(); S.family = bm.family; if (bm.power) S.power = bm.power; if (bm.poly) S.poly = bm.poly.slice();
    if (bm.julia) S.julia = { x: bm.julia.x, y: bm.julia.y, variant: 0, pow: 2, base: 'mandelbrot' };
    S.view = homeView(bm.family); afterFamilyChange();
  }
  function stepMotion(dt) {
    if (!motion) return;
    const m = motion;
    if (m.palTo) { const u = ease(Math.min(1, m.done / m.total)); S.pal = INF.lerpPal(m.palFrom, m.palTo, u); S.palIndex = -1; S.phase += dt * 0.025; app.colourChanged(); }
    const seg = m.segs[m.i];
    if (!seg) { const cb = m.onEnd; motion = null; if (cb) cb(); return; }
    if (seg.apply) { S.view = Object.assign({}, seg.to); m.i++; return; }
    if (seg.swap) { applySwap(seg.swap); m.i++; return; }
    m.t += dt; m.done += dt; const u = Math.min(1, m.t / seg.dur);
    S.view = expView(seg.a, seg.b, ease(u));
    if (u >= 1) { m.i++; m.t = 0; }
  }
  app.toggleTour = function (on) {
    app.tourOn = on == null ? !app.tourOn : on;
    if (app.tourOn) { RS.tourIdx = (RS.tourIdx == null ? -1 : RS.tourIdx); RS.arrived = 0; tourAdvance(); toast('Tour begun — touch anything to take the wheel'); }
    else { cancelMotion(); toast('Tour ended'); }
    ui.sync();
  };
  function tourAdvance() { RS.tourIdx = (RS.tourIdx + 1) % TOUR_ORDER.length; const i = TOUR_ORDER[RS.tourIdx]; app.dive(INF.BOOKMARKS[i], i); RS.arrived = 0; }
  function stepTour(now) {
    if (!app.tourOn || motion) return;
    if (!RS.arrived) RS.arrived = now;
    if (now - RS.arrived > 9500 + Math.min(4000, S.quality.samples * 60)) tourAdvance();
  }
  function userTookOver() {
    if (app.tourOn) { app.tourOn = false; ui.sync(); }
    if (motion) cancelMotion();
    RS.lastInput = performance.now(); if (RS.titled) freeLabel();
    if (!pendingHist) pendingHist = true;
  }

  /* ---------------------------------------------------------------- history */
  const hist = []; let hidx = -1, pendingHist = false, histT = 0;
  const snap = () => ({ family: S.family, view: Object.assign({}, S.view), power: S.power, poly: S.poly.slice(), julia: Object.assign({}, S.julia) });
  function commitHistory(now) {
    if (!pendingHist || now - RS.lastMove < 700) return; pendingHist = false;
    const s = snap(), p = hist[hidx];
    if (p && p.family === s.family && Math.abs(p.view.ls - s.view.ls) < 1e-3 && Math.abs(p.view.cx - s.view.cx) < Math.exp(s.view.ls) * 1e-3 && Math.abs(p.view.cy - s.view.cy) < Math.exp(s.view.ls) * 1e-3) return;
    hist.length = hidx + 1; hist.push(s); if (hist.length > 100) hist.shift(); hidx = hist.length - 1; ui.sync();
  }
  function restore(s) { if (s.family !== S.family) { crossfade(); S.family = s.family; } S.view = Object.assign({}, s.view); S.power = s.power; S.poly = s.poly.slice(); S.julia = Object.assign({}, s.julia); cancelMotion(); afterFamilyChange(); ui.sync(); }
  app.canUndo = () => hidx > 0; app.canRedo = () => hidx < hist.length - 1;
  app.undo = () => { if (app.canUndo()) { restore(hist[--hidx]); } };
  app.redo = () => { if (app.canRedo()) { restore(hist[++hidx]); } };
  app.home = () => { userTookOver(); const hv = homeView(S.family); flyTo(hv, REDUCED ? 0.01 : 1.6); pendingHist = true; };

  /* ---------------------------------------------------------- bookmarks + share */
  app.saveBookmark = function () {
    const v = S.view, f = INF.famById(S.family), b = { title: `${f.name} · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, family: S.family, cx: v.cx, cy: v.cy, scale: Math.exp(v.ls), rot: v.rot, pal: Math.max(0, S.palIndex), power: S.power, poly: S.poly.slice(), julia: Object.assign({}, S.julia), depth: INF.depthOf(S).toFixed(1), caption: 'A view you kept.' };
    app.user.push(b); INF.store.set('bookmarks', app.user.slice(-40)); toast('Bookmarked'); ui.refreshIfOpen('gallery');
  };
  app.goUser = (b) => app.dive(Object.assign({}, b, { julia: b.julia, poly: b.poly }), -1);
  app.deleteUser = (i) => { app.user.splice(i, 1); INF.store.set('bookmarks', app.user); };
  const hashUrl = () => location.href.split('#')[0] + '#' + INF.encodeHash(S);
  function writeHash() { try { history.replaceState(null, '', '#' + INF.encodeHash(S)); } catch (e) { /* file:// contexts may refuse */ } }
  app.share = () => { writeHash(); copyText(hashUrl(), 'Link copied — it carries this exact view'); };

  /* --------------------------------------------------------------------- export */
  app.exportPNG = async function (progress) {
    const o = app.exportOpts, aspect = o.aspect === 'square' ? 1 : cssW / cssH;
    const W = aspect >= 1 ? o.size : Math.round(o.size * aspect), H = aspect >= 1 ? Math.round(o.size / aspect) : o.size;
    const J = makeJob(H), t0 = performance.now(); app.exporting = true; RS.busy = true; $('refine').hidden = true;
    try {
      progress(0, `Rendering ${W}×${H} · ${o.samples} samples …`);
      const img = await R.exportImage({ W, H, J, C: makeColour(), samples: o.samples, onProgress: (p) => progress(p) });
      const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(img, 0, 0);
      app.lastExport = { W, H, canvas: c };
      await new Promise((res) => c.toBlob((blob) => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `infinitum-${S.family}-10e${INF.depthOf(S).toFixed(1)}-${W}x${H}.png`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); res();
      }, 'image/png'));
      progress(1, `Saved ${W}×${H} in ${((performance.now() - t0) / 1000).toFixed(1)} s.`); toast('PNG exported');
    } catch (e) { progress(0, 'Export failed: ' + e.message); } finally { app.exporting = false; RS.busy = false; RS.iterSig = ''; }
  };

  /* --------------------------------------------------------------- misc toggles */
  app.toggleFullscreen = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { toast('Fullscreen is unavailable here'); } };
  app.toggleHelp = (on) => { const el = $('help'); el.hidden = on == null ? !el.hidden : !on; ui.closePop(); };
  app.exporting = false;

  /* ---------------------------------------------------------------------- input */
  const ptrs = new Map(); let drag = null, vel = { x: 0, y: 0 }, zoomT = null, downT = 0, keys = new Set();
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true }); userTookOver(); ui.closePop();
    if (e.button === 2) return;
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; vel = { x: 0, y: 0 }; canvas.classList.add('dragging'); }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
    downT = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (e.pointerType === 'mouse' && !ptrs.size) setInsetFromPointer(px, py);
    if (!ptrs.has(e.pointerId)) return; const p = ptrs.get(e.pointerId); p.x = e.clientX; p.y = e.clientY;
    if (drag && drag.pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      panBy(mx - drag.mx, my - drag.my); zoomTo(S.view.ls + Math.log(drag.d / Math.max(d, 1)), mx - rect.left, my - rect.top); zoomT = null;
      drag.d = d; drag.mx = mx; drag.my = my; return;
    }
    if (drag && !drag.pinch) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      panBy(dx, dy); const now = performance.now(), dtm = Math.max(1, now - drag.t); drag.t = now;
      vel.x = vel.x * 0.6 + (dx / dtm * 1000) * 0.4; vel.y = vel.y * 0.6 + (dy / dtm * 1000) * 0.4;
    }
  });
  const endPtr = (e) => {
    if (!ptrs.has(e.pointerId)) return; const wasTap = drag && !drag.pinch && drag.moved < 6 && e.pointerType !== 'mouse' && performance.now() - downT < 350;
    ptrs.delete(e.pointerId); canvas.classList.remove('dragging');
    if (ptrs.size === 1) { const p = [...ptrs.values()][0]; drag = { x: p.x, y: p.y, t: performance.now(), moved: 99 }; vel = { x: 0, y: 0 }; } else if (!ptrs.size) {
      drag = null; if (performance.now() - (lastMoveEvt || 0) > 90) vel = { x: 0, y: 0 };
      if (wasTap && JULIA_OK()) { const r = canvas.getBoundingClientRect(); RS.insetLocked = false; setInsetFromPointer(e.clientX - r.left, e.clientY - r.top); }
    }
  };
  let lastMoveEvt = 0; canvas.addEventListener('pointermove', () => { lastMoveEvt = performance.now(); });
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); userTookOver(); const r = canvas.getBoundingClientRect();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; const cur = zoomT ? zoomT.target : S.view.ls;
    zoomT = { target: Math.max(minLs(), Math.min(maxLs, cur + dy * 0.0014)), px: e.clientX - r.left, py: e.clientY - r.top };
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    userTookOver(); const r = canvas.getBoundingClientRect(); const cur = zoomT ? zoomT.target : S.view.ls;
    zoomT = { target: Math.max(minLs(), Math.min(maxLs, cur + (e.shiftKey ? Math.log(4) : -Math.log(4)))), px: e.clientX - r.left, py: e.clientY - r.top };
  });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); userTookOver(); const r = canvas.getBoundingClientRect(); zoomT = { target: Math.min(maxLs, (zoomT ? zoomT.target : S.view.ls) + Math.log(4)), px: e.clientX - r.left, py: e.clientY - r.top }; });
  canvas.addEventListener('pointerleave', () => { /* keep last companion parameter */ });

  const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.type !== 'range';
  document.addEventListener('keydown', (e) => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey) return; const k = e.key;
    if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); k === 'ArrowLeft' ? app.undo() : app.redo(); return; }
    if (k === 'Escape') { ui.closePop(); app.toggleHelp(false); return; }
    const low = k.length === 1 ? k.toLowerCase() : k; let handled = true;
    if ('wasdqe+-=_'.includes(low) && low.length === 1 || k.startsWith('Arrow')) { keys.add(low); userTookOver(); e.preventDefault(); return; }
    switch (low) {
      case 'f': app.toggleFullscreen(); break; case 'h': $('app').classList.toggle('ui-hidden'); break;
      case 'p': app.nextPalette(e.shiftKey ? -1 : 1); ui.refreshIfOpen('palette'); break;
      case 'm': app.setMode((S.mode + 1) % 4); toast(['Smooth', 'Orbit trap', 'Glow', 'Relief'][S.mode]); ui.refreshIfOpen('colour'); break;
      case 'i': app.toggleInfo(); break; case 't': app.toggleTour(); break; case 'b': app.saveBookmark(); break; case 'j': app.toggleJuliaView(); break;
      case '?': case '/': app.toggleHelp(); break; case 'Home': userTookOver(); app.home(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });
  document.addEventListener('keyup', (e) => { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); });
  window.addEventListener('blur', () => keys.clear());

  function stepInput(dt) {
    if (zoomT) {
      const d = zoomT.target - S.view.ls, k = 1 - Math.exp(-dt * 9);
      if (Math.abs(d) < 1e-4) { zoomTo(zoomT.target, zoomT.px, zoomT.py); zoomT = null; } else zoomTo(S.view.ls + d * k, zoomT.px, zoomT.py);
    }
    if (!drag && (Math.abs(vel.x) > 6 || Math.abs(vel.y) > 6)) { panBy(vel.x * dt, vel.y * dt); const f = Math.exp(-dt * 4.2); vel.x *= f; vel.y *= f; } else if (!drag) vel = { x: 0, y: 0 };
    if (keys.size) {
      const sp = cssH * 0.55 * dt; let dx = 0, dy = 0;
      if (keys.has('a') || keys.has('ArrowLeft')) dx += sp; if (keys.has('d') || keys.has('ArrowRight')) dx -= sp; if (keys.has('w') || keys.has('ArrowUp')) dy += sp; if (keys.has('s') || keys.has('ArrowDown')) dy -= sp;
      if (dx || dy) panBy(dx, dy);
      if (keys.has('+') || keys.has('=')) zoomTo(S.view.ls - dt * 1.5, cssW / 2, cssH / 2); if (keys.has('-') || keys.has('_')) zoomTo(S.view.ls + dt * 1.5, cssW / 2, cssH / 2);
      if (keys.has('q')) S.view.rot -= dt * 0.8; if (keys.has('e')) S.view.rot += dt * 0.8;
    }
  }

  /* ---------------------------------------------------------------- main loop */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (RS.busy) return;
    frames++; if (now - fpsT > 700) { RS.fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
    RS.ema = RS.ema * 0.85 + dt * 1000 * 0.15;
    stepInput(dt); stepMotion(dt); stepTour(now);
    if (S.cycle) { S.phase += dt * S.cycleSpeed; if (S.phase > 1000) S.phase %= 1; }
    const o = app.juliaOrbit; if (o.on && S.family === 'julia') { o.t += dt; const w = o.t * 0.55; S.julia.x = o.c0.x + o.r * (Math.cos(w) - 1); S.julia.y = o.c0.y + o.r * Math.sin(w); }
    renderFrame(now, dt); updateReadouts(now); commitHistory(now);
    if (!RS.moving || now - RS.lastMove > 500) { if (now - RS.lastHash > 900 && now - RS.lastMove > 500 && RS.hashSig !== RS.iterSig) { RS.hashSig = RS.iterSig; RS.lastHash = now; writeHash(); } }
    attract(now);
  }
  function attract(now) {
    if (!RS.attractArmed || app.tourOn || motion || REDUCED) return;
    if (now - (RS.lastInput || RS.introEnd || now) > 16000 && !ui.isOpen()) { RS.attractArmed = false; RS.tourIdx = 0; app.toggleTour(true); }
  }

  /* ----------------------------------------------------------------- boot */
  const ui = INF.UI(app);
  function boot() {
    const fromHash = INF.decodeHash(location.hash, S);
    $('famName').textContent = INF.famById(S.family).name; RS.insetC = { x: -0.5, y: 0 }; resize();
    window.addEventListener('resize', () => { clearTimeout(boot.rt); boot.rt = setTimeout(resize, 120); });
    new ResizeObserver(() => { clearTimeout(boot.rt); boot.rt = setTimeout(resize, 120); }).observe(canvas);
    document.addEventListener('visibilitychange', () => { last = performance.now(); });
    hist.push(snap()); hidx = 0; syncJuliaChrome(); ui.sync();
    buildTicks();
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
    // warm the heavier shader variants while the intro plays
    setTimeout(() => { try { const fi = famInfo(); R.warm(fi.kind, fi.variant, true); R.warm(1, 0, false); } catch (e) { /* compiled lazily on demand */ } }, 1500);
    const intro = $('intro');
    if (fromHash) { freeLabel(); body.classList.remove('booting'); intro.classList.add('off'); RS.attractArmed = false; RS.lastInput = performance.now(); return; }
    // Orchestrated opening: black -> title card -> slow dive into Seahorse Valley -> chrome arrives -> attract mode.
    S.view = homeView('mandelbrot'); setLabel('Plate I · Mandelbrot', 'Seahorse Valley', '');
    const bm = INF.BOOKMARKS[0]; const tl = (ms, fn) => setTimeout(fn, REDUCED ? ms / 4 : ms);
    tl(250, () => { intro.classList.add('show'); app.dive(bm, 0); if (REDUCED) RS.introDone = true; });
    tl(1700, () => intro.classList.add('reveal'));
    tl(4600, () => { intro.classList.remove('show'); intro.classList.add('fade'); });
    tl(5000, () => body.classList.remove('booting'));
    tl(6700, () => { intro.classList.add('off'); RS.introEnd = performance.now(); RS.attractArmed = true; });
  }
  function buildTicks() {
    const box = $('depthTicks');
    for (let d = 0; d <= 14; d++) { const t = document.createElement('div'); t.className = 'tick' + (d % 2 === 0 ? ' major' : ''); t.style.top = (d / 14 * 100) + '%'; if (d % 2 === 0) { const l = document.createElement('span'); l.textContent = '10^' + d; t.append(l); } box.append(t); }
  }
  // debugging / verification hooks (used by tests/verify.mjs)
  app.debug = { makeJob, makeColour, RS, syncJuliaChrome, insetJob, get cssH() { return cssH; }, toWorld };
  boot();
})();
