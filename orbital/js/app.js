/* ORBITAL - application shell: camera, time control, input, HUD wiring. */
(function () {
  'use strict';
  const O = window.Orbital, U = O.util, clamp = U.clamp, lerp = U.lerp;
  const $ = (s) => document.querySelector(s);
  const LADDER = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2000];
  const TYPE_NAMES = { planet: 'Planet', star: 'Star', gasgiant: 'Gas giant', blackhole: 'Black hole', comet: 'Comet' };
  const PALETTE = {
    planet: ['#6ea8e6', '#c78b6a', '#8fcfa0', '#d8c08a', '#b596e0', '#e08f8f'],
    gasgiant: ['#d9b28a', '#9ab8d8', '#d6c2a0', '#c58e86'],
  };
  const TRAIL_KEYS = { off: 0, short: 1, mid: 2, long: 3 };
  const root = document.documentElement;
  const MONO = getComputedStyle(root).getPropertyValue('--f-mono').trim() || 'monospace';

  const canvas = $('#stage');
  const R = O.Renderer.create(canvas);
  const sim = new O.Sim();

  const S = {
    presetIdx: 0, preset: O.presets[0], t: 0, paused: false, dir: 1, timeIdx: 4,
    tool: 'launch', type: 'planet', massLog: 0, counter: {},
    opts: { trails: 2, labels: true, bloom: true, rulers: true },
    selId: 0, hoverId: 0, followId: 0, rotId: 0,
    cam: { cx: 0, cy: 0, zoom: 100, zt: 100, ang: 0, zoomRef: 100, rotOn: false },
    view: { x: 0, y: 0 }, W: 0, H: 0, stageL: 22, stageR: 0, mobile: false, hudOff: false,
    flashes: [], fling: null, hist: [], future: [], snapAcc: 0, fade: 0, fly: null, fOff: null, angOff: 0, anchor: null,
    eff: 1, fps: 60, frameMs: 16, cursor: { x: 0, y: 0, in: false }, stepOnce: false, hudAcc: 0, scrubbing: false,
    dEh: [], dLh: [], beltAcc: 0, belt: null, mapAcc: 0,
  };
  const RS = { // render-state bag handed to the renderer every frame
    sim, cam: S.cam, view: S.view, opts: S.opts, preset: S.preset, mono: MONO, flashes: S.flashes,
    t: 0, dtReal: 0.016, selId: 0, hoverId: 0, followId: 0, fling: null, stageL: 22, fade: 0, cursor: S.cursor, screenPos: [],
  };

  /* ---------- persistence (all optional) ---------- */
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('orbital.v1') || '{}');
      if (typeof p.labels === 'boolean') S.opts.labels = p.labels;
      if (typeof p.bloom === 'boolean') S.opts.bloom = p.bloom;
      if (typeof p.rulers === 'boolean') S.opts.rulers = p.rulers;
      if (p.tool === 'pan' || p.tool === 'launch') S.tool = p.tool;
      if (TYPE_NAMES[p.type]) S.type = p.type;
    } catch (e) { /* storage unavailable */ }
  }
  function savePrefs() {
    try { localStorage.setItem('orbital.v1', JSON.stringify({ labels: S.opts.labels, bloom: S.opts.bloom, rulers: S.opts.rulers, tool: S.tool, type: S.type })); } catch (e) { /* ignore */ }
  }

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------- coordinate helpers ---------- */
  function s2w(sx, sy, cam) {
    cam = cam || S.cam;
    const u = (sx - S.view.x) / cam.zoom, w = -(sy - S.view.y) / cam.zoom, c = Math.cos(cam.ang), s = Math.sin(cam.ang);
    return [cam.cx + u * c - w * s, cam.cy + u * s + w * c];
  }
  function w2s(x, y) {
    const cam = S.cam, c = Math.cos(cam.ang), s = Math.sin(cam.ang), dx = x - cam.cx, dy = y - cam.cy;
    return [S.view.x + (dx * c + dy * s) * cam.zoom, S.view.y - (-dx * s + dy * c) * cam.zoom];
  }
  /** screen-space delta (px) -> world-space delta */
  function dS2W(dx, dy) {
    const c = Math.cos(S.cam.ang), s = Math.sin(S.cam.ang), u = dx / S.cam.zoom, w = -dy / S.cam.zoom;
    return [u * c - w * s, u * s + w * c];
  }
  const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

  /* ---------- layout ---------- */
  function layout() {
    S.W = window.innerWidth; S.H = window.innerHeight;
    R.resize(S.W, S.H, Math.min(2, window.devicePixelRatio || 1));
    S.mobile = S.W <= 900;
    const cs = getComputedStyle(root);
    const pl = parseFloat(cs.getPropertyValue('--panel-l')) || 272, pr = parseFloat(cs.getPropertyValue('--panel-r')) || 288;
    const ruler = S.mobile ? 18 : 22;
    S.stageL = S.mobile ? ruler : S.hudOff ? ruler : ruler + 12 + pl + 12;
    S.stageR = S.mobile || S.hudOff ? 0 : pr + 24;
    root.style.setProperty('--sl', (S.mobile ? 0 : S.hudOff ? ruler : S.stageL) + 'px');
    root.style.setProperty('--sr', S.stageR + 'px');
    sizeCanvas($('#minimap'), 140); sizeCanvas($('#driftplot'), 46); sizeCanvas($('#beltplot'), 70);
  }
  function sizeCanvas(c, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth || 240;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  }
  function updateView(snap) {
    const top = (S.mobile ? 18 : 22) + (S.mobile ? 46 : 0) + 6;
    const bottom = S.H - (S.hudOff ? 10 : S.mobile ? 150 : 84);
    const tx = (S.stageL + S.W - S.stageR) / 2, ty = (top + bottom) / 2 + (S.mobile ? 0 : 38);
    const k = snap ? 1 : 0.14;
    S.view.x += (tx - S.view.x) * k; S.view.y += (ty - S.view.y) * k;
  }
  function fitZoom(p) {
    const w = S.W - S.stageL - S.stageR, h = S.H - 22 - (S.mobile ? 210 : 180);
    return Math.max(1e-6, Math.min(w, h) / (2 * p.radius));
  }

  /* ---------- scenes ---------- */
  function idByName(name) {
    for (let i = 0; i < sim.n; i++) if (sim.meta[i].name === name) return sim.meta[i].id;
    return 0;
  }

  function loadScene(i, intro) {
    const p = O.presets[i];
    S.presetIdx = i; S.preset = RS.preset = p;
    O.loadPreset(sim, p);
    sim.merge = $('#tg-merge').checked;
    S.hist.length = 0; S.future.length = 0; S.flashes.length = 0; S.counter = {};
    S.selId = S.hoverId = S.followId = S.rotId = 0; S.dir = 1; S.paused = false; S.fOff = null; S.angOff = 0;
    S.timeIdx = LADDER.indexOf(p.mult) >= 0 ? LADDER.indexOf(p.mult) : 4;
    S.opts.trails = TRAIL_KEYS[p.trails] || 0;
    S.massLog = 0;
    S.dEh.length = 0; S.dLh.length = 0;
    const cam = S.cam, z = fitZoom(p);
    cam.zoomRef = z; cam.ang = 0; cam.rotOn = false;
    if (p.follow) { S.followId = idByName(p.follow); S.fOff = [0, 0]; }
    if (p.rot) { S.rotId = idByName(p.rot); }
    const fi = S.followId ? sim.indexOf(S.followId) : -1;
    const tx = fi >= 0 ? sim.x[fi] : 0, ty = fi >= 0 ? sim.y[fi] : 0;
    const from = intro ? { cx: tx + p.radius * 0.45, cy: ty - p.radius * 0.3, lz: Math.log(z * 0.12) } : { cx: cam.cx, cy: cam.cy, lz: Math.log(cam.zoom) };
    cam.cx = from.cx; cam.cy = from.cy; cam.zoom = cam.zt = Math.exp(from.lz);
    S.fly = { t0: S.t, dur: intro ? 7 : 1.8, cx0: from.cx, cy0: from.cy, cx1: tx, cy1: ty, lz0: from.lz, lz1: Math.log(z), ease: intro ? U.easeOutCubic : U.easeInOut };
    if (S.followId) S.fOff = [from.cx - tx, from.cy - ty];
    if (!intro) S.fade = 0.85;
    sim.trailD2 = 0; sim.clearTrails();
    S.hist.push(sim.snapshot());
    sim.drift();
    // UI
    document.querySelectorAll('#preset-list button').forEach((b, k) => b.classList.toggle('active', k === i));
    $('#cap-num').textContent = 'SCENE ' + String(i + 1).padStart(2, '0');
    $('#cap-title').textContent = p.name;
    $('#cap-text').textContent = p.caption;
    const u = p.units;
    $('#cap-units').textContent = [u.len, u.mass, u.tname].join(' · ');
    const cap = $('#caption'); cap.classList.remove('fade');
    clearTimeout(S.capTimer); S.capTimer = setTimeout(() => cap.classList.add('fade'), intro ? 13000 : 9000);
    $('#hint').hidden = !p.empty;
    $('#belt-box').hidden = !p.belt;
    syncUi();
    updateMassOut();
    if (!intro) toast(p.name);
  }

  function buildPresetList() {
    const ol = $('#preset-list');
    O.presets.forEach((p, i) => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.dataset.i = i;
      b.innerHTML = `<span class="n">${i === 9 ? '0' : i + 1}</span><span class="nm">${p.name}</span><span class="sb">${p.sub}</span>`;
      b.addEventListener('click', () => { loadScene(i); closeDrawers(); });
      li.appendChild(b); ol.appendChild(li);
    });
  }

  /* ---------- time control ---------- */
  const baseRate = () => S.preset.rate * LADDER[S.timeIdx];

  function setTimeIdx(i) {
    S.timeIdx = clamp(i, 0, LADDER.length - 1);
    syncUi();
  }
  function togglePause(force) {
    S.paused = force === undefined ? !S.paused : force;
    syncUi();
  }
  function toggleReverse() {
    S.dir = -S.dir;
    if (S.paused) S.paused = false;
    syncUi();
    toast(S.dir < 0 ? 'Time reversed' : 'Time forward');
  }

  function restoreSnap(s, keepTrails) {
    const trails = keepTrails ? sim.meta.map((m) => [m, m.th, m.tc, m.lx, m.ly]) : null;
    sim.restore(s);
    if (trails) for (const [m, th, tc, lx, ly] of trails) if (sim.meta.includes(m)) { m.th = th; m.tc = tc; m.lx = lx; m.ly = ly; }
  }

  function scrubTo(frac) {
    const all = S.hist.concat(S.future);
    if (all.length < 2) return;
    const t0 = all[0].t, t1 = all[all.length - 1].t, tt = lerp(t0, t1, frac);
    let k = 0;
    while (k < all.length - 1 && all[k + 1].t <= tt + 1e-12) k++;
    S.hist = all.slice(0, k + 1); S.future = all.slice(k + 1);
    restoreSnap(all[k], false);
    S.paused = true; syncUi();
  }

  /** advance physics by one display frame */
  function physics(dt) {
    const p = S.preset, base = baseRate();
    sim.rate = Math.max(base, p.rate * 0.05);
    sim.trailD2 = Math.pow(S.W / S.cam.zoom / 240, 2);
    sim.merge = $('#tg-merge').checked;
    if (S.dir > 0) emitTails(dt);
    const simDt = base * dt * S.dir;
    const budget = S.fps < 25 ? 7 : 12;
    const covered = sim.advance(simDt, budget);
    const effNow = Math.abs(covered) / Math.max(dt, 1e-4) / p.rate * S.dir;
    S.eff += (effNow - S.eff) * 0.15;
    // reversing: hand back exact snapshots as we cross them (this also undoes merges)
    if (S.dir < 0) {
      while (S.hist.length > 1 && S.hist[S.hist.length - 1].t >= sim.time) {
        const s = S.hist.pop(); S.future.unshift(s);
        if (S.hist.length && S.hist[S.hist.length - 1].t >= sim.time) continue;
        restoreSnap(s, true);
        break;
      }
      if (S.hist.length <= 1 && sim.time <= S.hist[0].t + 1e-12) { restoreSnap(S.hist[0], true); S.paused = true; S.dir = 1; syncUi(); toast('Start of recorded history'); }
    } else {
      S.snapAcc += dt;
      if (S.snapAcc >= 0.1) {
        S.snapAcc = 0; S.future.length = 0;
        const snap = sim.snapshot();
        S.hist.push(snap);
        const maxSnaps = clamp(Math.floor(40e6 / Math.max(1, snap.bytes)), 40, 320);
        if (S.hist.length > maxSnaps) S.hist.splice(0, S.hist.length - maxSnaps);
      }
    }
    for (const ev of sim.events) S.flashes.push({ x: ev.x, y: ev.y, size: ev.size, kind: ev.kind, t0: S.t });
    sim.events.length = 0;
    if (S.flashes.length > 24) S.flashes.splice(0, S.flashes.length - 24);
  }

  /** comets shed particles away from the nearest star */
  function emitTails(dt) {
    if (sim.pn > O.consts.CAP_P - 600) return;
    for (let i = 0; i < sim.n; i++) {
      if (sim.meta[i].type !== 'comet') continue;
      const s = sim.dominant(sim.x[i], sim.y[i], i);
      if (s < 0) continue;
      let dx = sim.x[i] - sim.x[s], dy = sim.y[i] - sim.y[s];
      const d = Math.hypot(dx, dy) || 1e-9; dx /= d; dy /= d;
      const vrel = Math.hypot(sim.vx[i] - sim.vx[s], sim.vy[i] - sim.vy[s]);
      const heat = clamp(Math.pow(S.preset.radius * 0.55 / d, 0.8), 0.25, 3);
      let n = 90 * dt * heat; const whole = Math.floor(n); n = whole + (sim.rng() < n - whole ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const spd = vrel * (0.10 + 0.22 * sim.rng()), side = (sim.rng() - 0.5) * vrel * 0.1;
        sim.addParticle(sim.x[i] + dx * sim.r[i], sim.y[i] + dy * sim.r[i],
          sim.vx[i] + dx * spd - dy * side, sim.vy[i] + dy * spd + dx * side, sim.rate * (1.2 + 1.0 * sim.rng()), 2);
      }
    }
  }

  /* ---------- camera ---------- */
  function updateCamera(dt) {
    const cam = S.cam;
    if (S.fly) {
      const f = S.fly, u = clamp((S.t - f.t0) / f.dur, 0, 1), e = f.ease(u);
      cam.zoom = cam.zt = Math.exp(lerp(f.lz0, f.lz1, e));
      if (!S.followId) { cam.cx = lerp(f.cx0, f.cx1, e); cam.cy = lerp(f.cy0, f.cy1, e); }
      if (u >= 1) S.fly = null;
    } else if (Math.abs(Math.log(cam.zt / cam.zoom)) > 1e-5) {
      const lz = Math.log(cam.zoom), nz = Math.exp(lz + (Math.log(cam.zt) - lz) * (1 - Math.exp(-dt * 14)));
      if (S.anchor && !S.followId) {
        cam.zoom = nz;
        const u = (S.anchor.sx - S.view.x) / nz, w = -(S.anchor.sy - S.view.y) / nz, c = Math.cos(cam.ang), s = Math.sin(cam.ang);
        cam.cx = S.anchor.wx - (u * c - w * s); cam.cy = S.anchor.wy - (u * s + w * c);
      } else cam.zoom = nz;
    }
    const fi = S.followId ? sim.indexOf(S.followId) : -1;
    if (S.followId && fi < 0) { S.followId = 0; S.rotId = 0; S.fOff = null; syncUi(); }
    if (fi >= 0) {
      if (!S.fOff) S.fOff = [cam.cx - sim.x[fi], cam.cy - sim.y[fi]];
      const k = Math.exp(-dt * 6);
      S.fOff[0] *= k; S.fOff[1] *= k;
      cam.cx = sim.x[fi] + S.fOff[0]; cam.cy = sim.y[fi] + S.fOff[1];
    }
    const ri = S.rotId && fi >= 0 ? sim.indexOf(S.rotId) : -1;
    if (ri >= 0) {
      const target = Math.atan2(sim.y[ri] - sim.y[fi], sim.x[ri] - sim.x[fi]);
      cam.ang = target + S.angOff; S.angOff = wrapPi(S.angOff) * Math.exp(-dt * 5); cam.rotOn = true;
    } else {
      if (S.rotId) { S.rotId = 0; syncUi(); }
      S.angOff *= Math.exp(-dt * 5); if (Math.abs(S.angOff) < 1e-4) S.angOff = 0;
      cam.ang = S.angOff; cam.rotOn = false;
    }
  }
  function cancelFly() { if (S.fly) { S.fly = null; S.cam.zt = S.cam.zoom; } }
  function zoomBy(f, sx, sy) {
    cancelFly();
    const z0 = S.preset ? fitZoom(S.preset) : 100;
    S.cam.zt = clamp(S.cam.zt * f, z0 * 0.004, z0 * 6000);
    if (sx !== undefined && !S.followId) { const w = s2w(sx, sy); S.anchor = { sx, sy, wx: w[0], wy: w[1] }; } else S.anchor = null;
  }
  function setFollow(id) {
    S.followId = id; S.fOff = id ? null : null;
    if (!id) { S.rotId = 0; }
    syncUi();
  }
  function toggleCorot() {
    const i = S.selId ? sim.indexOf(S.selId) : -1;
    if (S.rotId) { S.angOff = S.cam.ang; S.rotId = 0; syncUi(); return; }
    if (i < 0) { toast('Select a body first, then press O'); return; }
    const el = sim.elements(i);
    if (!el) { toast('Nothing to co-rotate about'); return; }
    S.followId = sim.meta[el.ref].id; S.fOff = null;
    const target = Math.atan2(sim.y[i] - sim.y[el.ref], sim.x[i] - sim.x[el.ref]);
    S.angOff = wrapPi(S.cam.ang - target); S.rotId = S.selId;
    syncUi(); toast('Co-rotating with ' + (sim.meta[i].name || TYPE_NAMES[sim.meta[i].type]));
  }

  /* ---------- spawning ---------- */
  function spawnSpec(type) {
    const sp = S.preset.spawn[type], f = Math.exp(S.massLog);
    const m = sp.m * f, r = type === 'blackhole' ? sp.r * f : sp.r * Math.cbrt(f);
    let color;
    if (type === 'star') { const c = U.starRGB(m / S.preset.massRef); color = '#' + c.map((v) => (v | 0).toString(16).padStart(2, '0')).join(''); }
    else if (type === 'blackhole') color = '#ffb46a';
    else if (type === 'comet') color = '#dff6ff';
    else { const pal = PALETTE[type]; color = pal[((S.counter[type] || 0)) % pal.length]; }
    return { m, r, color, type };
  }
  function addUserBody(type, x, y, vx, vy, spec) {
    spec = spec || spawnSpec(type);
    S.counter[type] = (S.counter[type] || 0) + 1;
    const vis = type === 'star' ? clamp(Math.pow(spec.m / S.preset.massRef, 0.25), 0.6, 2.2) : 1;
    const i = sim.addBody({
      x, y, vx, vy, m: spec.m, r: spec.r, type, color: spec.color, name: TYPE_NAMES[type] + ' ' + S.counter[type],
      bands: type === 'gasgiant', atmo: type === 'planet' && spec.color === PALETTE.planet[0] ? '#8fd0ff' : null, visual: vis,
    });
    if (i < 0) toast('Body limit reached (256)');
    return i;
  }
  function frameVelocity() {
    const fi = S.followId ? sim.indexOf(S.followId) : -1;
    return fi >= 0 ? [sim.vx[fi], sim.vy[fi]] : [0, 0];
  }
  function updateMassOut() {
    const sp = S.preset.spawn[S.type], f = Math.exp(S.massLog);
    $('#mass-out').textContent = U.fmt(sp.m * f, 3) + ' ' + S.preset.units.mass;
    const sl = $('#mass-slider'); sl.value = Math.round(S.massLog * 100); setFill(sl);
  }
  function setFill(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); }

  /* ---------- hit testing ---------- */
  function hitTest(x, y) {
    let best = -1, bd = 1e9;
    const sp = RS.screenPos;
    for (let i = 0; i < sim.n; i++) {
      const s = sp[i]; if (!s || sim.meta[i].hidden) continue;
      const d = Math.hypot(s[0] - x, s[1] - y), reach = Math.max(s[2] + 4, S.mobile ? 18 : 11);
      if (d <= reach && d - s[2] < bd) { bd = d - s[2]; best = i; }
    }
    return best;
  }

  /* ---------- pointer input ---------- */
  const ptrs = new Map();
  let gesture = null, pinch = null;

  function posOf(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true });
    cancelFly();
    const [x, y] = posOf(e);
    ptrs.set(e.pointerId, { x, y });
    if (ptrs.size === 2) { startPinch(); return; }
    if (ptrs.size > 2) return;
    const panning = e.button === 1 || e.button === 2 || e.shiftKey || S.tool === 'pan';
    gesture = { kind: panning ? 'pan' : 'press', x0: x, y0: y, lx: x, ly: y, hit: hitTest(x, y), pid: e.pointerId, t0: performance.now() };
    if (panning) { canvas.classList.add('panning'); }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = posOf(e);
    S.cursor.x = x; S.cursor.y = y; S.cursor.in = true;
    if (ptrs.has(e.pointerId)) ptrs.get(e.pointerId).x = x, ptrs.get(e.pointerId).y = y;
    if (ptrs.size === 2 && pinch) { updatePinch(); return; }
    if (!gesture || gesture.pid !== e.pointerId) {
      if (!ptrs.size) {
        const h = hitTest(x, y);
        S.hoverId = h >= 0 ? sim.meta[h].id : 0;
        canvas.classList.toggle('hover', h >= 0);
      }
      return;
    }
    if (gesture.kind === 'pan') {
      const dx = x - gesture.lx, dy = y - gesture.ly; gesture.lx = x; gesture.ly = y;
      if (S.followId) { S.followId = 0; S.rotId = 0; S.fOff = null; syncUi(); }
      const d = dS2W(dx, dy); S.cam.cx -= d[0]; S.cam.cy -= d[1];
    } else if (gesture.kind === 'press' && Math.hypot(x - gesture.x0, y - gesture.y0) > 7) {
      gesture.kind = 'fling';
      const w = s2w(gesture.x0, gesture.y0);
      S.fling = { active: true, x0: w[0], y0: w[1], sx: x, sy: y, type: S.type, colorIdx: S.counter[S.type] || 0 };
      S.hoverId = 0;
    }
    if (gesture.kind === 'fling' && S.fling) { S.fling.sx = x; S.fling.sy = y; }
  });

  function endPointer(e, cancelled) {
    const had = ptrs.delete(e.pointerId);
    if (!had) return;
    if (pinch && ptrs.size < 2) pinch = null;
    if (!gesture || gesture.pid !== e.pointerId) { if (!ptrs.size) gesture = null; return; }
    canvas.classList.remove('panning');
    const g = gesture; gesture = null;
    if (g.kind === 'fling' && S.fling) {
      if (!cancelled) launchFling();
      S.fling = null; RS.fling = null;
    } else if (g.kind === 'press' && !cancelled) {
      const [x, y] = posOf(e), h = hitTest(x, y);
      if (h >= 0) { S.selId = S.selId === sim.meta[h].id ? 0 : sim.meta[h].id; }
      else S.selId = 0;
      updateInspector(true);
    } else if (g.kind === 'pan' && !cancelled && Math.hypot(g.lx - g.x0, g.ly - g.y0) < 4 && S.tool === 'pan') {
      const h = hitTest(g.x0, g.y0);
      S.selId = h >= 0 ? sim.meta[h].id : 0; updateInspector(true);
    }
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('pointerleave', () => { S.cursor.in = false; if (!ptrs.size) { S.hoverId = 0; canvas.classList.remove('hover'); } });

  function startPinch() {
    const pts = [...ptrs.values()];
    if (S.fling) { S.fling = null; RS.fling = null; }
    gesture = null;
    pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2 };
  }
  function updatePinch() {
    const pts = [...ptrs.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    const w = s2w(pinch.mx, pinch.my);
    const z0 = fitZoom(S.preset);
    const cam = S.cam; cam.zoom = cam.zt = clamp(cam.zoom * d / pinch.d, z0 * 0.004, z0 * 6000);
    const u = (mx - S.view.x) / cam.zoom, v = -(my - S.view.y) / cam.zoom, c = Math.cos(cam.ang), s = Math.sin(cam.ang);
    cam.cx = w[0] - (u * c - v * s); cam.cy = w[1] - (u * s + v * c);
    if (S.followId) { S.followId = 0; S.rotId = 0; S.fOff = null; syncUi(); }
    pinch.d = d; pinch.mx = mx; pinch.my = my;
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); cancelFly();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (S.fling) { S.massLog = clamp(S.massLog - dy * 0.0016, -4.6, 4.6); updateMassOut(); return; }
    const [x, y] = posOf(e);
    zoomBy(Math.exp(-dy * 0.0013), x, y);
  }, { passive: false });

  canvas.addEventListener('dblclick', (e) => {
    const [x, y] = posOf(e), h = hitTest(x, y);
    if (h >= 0) { S.selId = sim.meta[h].id; setFollow(S.selId); updateInspector(true); toast('Following ' + (sim.meta[h].name || TYPE_NAMES[sim.meta[h].type])); return; }
    if (S.tool !== 'launch') return;
    const w = s2w(x, y), fv = frameVelocity();
    addUserBody(S.type, w[0], w[1], fv[0], fv[1]);
    $('#hint').hidden = true;
  });

  /** fling preview + velocity (recomputed every frame while a fling is active) */
  function updateFling() {
    const f = S.fling;
    if (!f) { RS.fling = null; return; }
    const spec = spawnSpec(f.type);
    const o = w2s(f.x0, f.y0), dx = f.sx - o[0], dy = f.sy - o[1], drag = Math.hypot(dx, dy);
    let vref = sim.vcirc(f.x0, f.y0);
    if (!(vref > 0)) vref = Math.sqrt(sim.G * S.preset.massRef / (S.preset.radius * 0.5));
    const sp = drag / 80 * vref, dv = dS2W(dx, dy), dl = Math.hypot(dv[0], dv[1]) || 1;
    const fv = frameVelocity();
    let x = f.x0, y = f.y0;
    // keep the launch point clear of any body it would instantly merge with
    for (let i = 0; i < sim.n; i++) {
      const ex = x - sim.x[i], ey = y - sim.y[i], rr = (sim.r[i] + spec.r) * 1.25, d = Math.hypot(ex, ey);
      if (d < rr) { const k = rr / (d || 1e-12); x = sim.x[i] + (d ? ex * k : rr); y = sim.y[i] + (d ? ey * k : 0); }
    }
    const nb = { x, y, vx: fv[0] + dv[0] / dl * sp, vy: fv[1] + dv[1] / dl * sp, m: spec.m, r: spec.r, s: Math.sqrt(sim.soft * sim.soft) };
    f.nb = nb; f.spec = spec;
    f.pred = drag > 7 ? O.predictPath(sim, nb, 1100) : null;
    const u = S.preset.units;
    RS.fling = {
      active: true, x0: x, y0: y, sx: f.sx, sy: f.sy, pred: f.pred, r: spec.r, rgb: U.hex(spec.color),
      label1: `${TYPE_NAMES[f.type].toUpperCase()}  ${U.fmt(spec.m, 3)} ${u.mass}`,
      label2: `v ${U.fmt(sp * u.vf, 3)} ${u.vel}  ·  ${(sp / vref).toFixed(2)} v_circ` + (f.pred ? `  ·  ${u.tfmt(f.pred.tEnd)} path` : ''),
    };
  }
  function launchFling() {
    const f = S.fling;
    if (!f || !f.nb) return;
    const hyp = RS.fling;
    if (hyp && Math.hypot(f.sx - w2s(f.x0, f.y0)[0], f.sy - w2s(f.x0, f.y0)[1]) < 8) return;
    addUserBody(f.type, f.nb.x, f.nb.y, f.nb.vx, f.nb.vy, f.spec);
    $('#hint').hidden = true;
    toast(TYPE_NAMES[f.type] + ' launched');
  }

  /* ---------- minimap ---------- */
  const mm = $('#minimap'), mmc = mm.getContext('2d');
  let mapHalf = 10;
  function mapGeom() {
    const w = mm.width, h = mm.height;
    return { w, h, sc: Math.min(w, h) / 2 / mapHalf, cx: w / 2, cy: h / 2 };
  }
  function drawMinimap() {
    const g = mapGeom(), dpr = mm.width / (mm.clientWidth || mm.width);
    const p = S.preset;
    mapHalf = Math.max(p.radius * 3.6, 1e-9);
    const halfView = 0.5 * Math.hypot(S.W - S.stageL - S.stageR, S.H) / S.cam.zoom;
    if (halfView * 1.25 > mapHalf) mapHalf = halfView * 1.25;
    g.sc = Math.min(g.w, g.h) / 2 / mapHalf;
    mmc.clearRect(0, 0, g.w, g.h);
    mmc.strokeStyle = 'rgba(120,190,235,0.12)'; mmc.lineWidth = 1;
    for (let k = 1; k <= 3; k++) { mmc.beginPath(); mmc.arc(g.cx, g.cy, g.sc * mapHalf * k / 3, 0, 6.2832); mmc.stroke(); }
    mmc.beginPath(); mmc.moveTo(0, g.cy); mmc.lineTo(g.w, g.cy); mmc.moveTo(g.cx, 0); mmc.lineTo(g.cx, g.h); mmc.stroke();
    // particles, decimated
    const stride = Math.max(1, Math.floor(sim.pn / 1800));
    mmc.fillStyle = 'rgba(150,200,255,0.5)';
    for (let q = 0; q < sim.pn; q += stride) {
      const x = g.cx + sim.px[q] * g.sc, y = g.cy - sim.py[q] * g.sc;
      if (x > 0 && y > 0 && x < g.w && y < g.h) mmc.fillRect(x, y, dpr, dpr);
    }
    for (let i = 0; i < sim.n; i++) {
      const x = g.cx + sim.x[i] * g.sc, y = g.cy - sim.y[i] * g.sc, mt = sim.meta[i];
      if (x < 0 || y < 0 || x > g.w || y > g.h) continue;
      const big = mt.type === 'star' ? 2.4 : mt.type === 'blackhole' ? 2.6 : 1.6;
      mmc.fillStyle = mt.type === 'blackhole' ? '#ffb04a' : mt.color;
      mmc.beginPath(); mmc.arc(x, y, big * dpr * (sim.n > 80 ? 0.6 : 1), 0, 6.2832); mmc.fill();
      if (mt.id === S.selId) { mmc.strokeStyle = '#5fe3ff'; mmc.lineWidth = dpr; mmc.beginPath(); mmc.arc(x, y, 5 * dpr, 0, 6.2832); mmc.stroke(); }
    }
    // viewport
    const L = S.stageL, Rr = S.W - S.stageR, T = 22, B = S.H - 80;
    const cs = [[L, T], [Rr, T], [Rr, B], [L, B]].map(([sx, sy]) => s2w(sx, sy));
    mmc.strokeStyle = 'rgba(255,176,74,0.95)'; mmc.lineWidth = 1.3 * dpr; mmc.beginPath();
    cs.forEach(([wx, wy], k) => { const x = g.cx + wx * g.sc, y = g.cy - wy * g.sc; if (k) mmc.lineTo(x, y); else mmc.moveTo(x, y); });
    mmc.closePath(); mmc.stroke();
    $('#map-scale').textContent = '±' + U.fmt(mapHalf, 2) + ' ' + p.units.len;
  }
  function mapPointer(e) {
    const r = mm.getBoundingClientRect(), g = mapGeom(), k = mm.width / r.width;
    const wx = ((e.clientX - r.left) * k - g.cx) / g.sc, wy = -((e.clientY - r.top) * k - g.cy) / g.sc;
    cancelFly(); S.followId = 0; S.rotId = 0; S.fOff = null; S.cam.cx = wx; S.cam.cy = wy; syncUi();
  }
  let mapDown = false;
  mm.addEventListener('pointerdown', (e) => { mapDown = true; mm.setPointerCapture(e.pointerId); mapPointer(e); });
  mm.addEventListener('pointermove', (e) => { if (mapDown) mapPointer(e); });
  mm.addEventListener('pointerup', () => { mapDown = false; });

  /* ---------- plots ---------- */
  function drawDrift() {
    const c = $('#driftplot'), g = c.getContext('2d'), w = c.width, h = c.height, dpr = w / (c.clientWidth || w);
    g.clearRect(0, 0, w, h);
    const y = (lv) => h - 4 * dpr - clamp((lv + 16) / 14, 0, 1) * (h - 8 * dpr);
    g.font = `${8 * dpr}px ${MONO}`; g.textBaseline = 'middle';
    for (const [lv, lab] of [[-4, '1e-4'], [-8, '1e-8'], [-12, '1e-12']]) {
      g.strokeStyle = 'rgba(120,190,235,0.14)'; g.lineWidth = 1; g.setLineDash([2 * dpr, 3 * dpr]);
      g.beginPath(); g.moveTo(0, y(lv)); g.lineTo(w, y(lv)); g.stroke();
      g.fillStyle = 'rgba(130,153,174,0.7)'; g.fillText(lab, 2 * dpr, y(lv) - 5 * dpr);
    }
    g.setLineDash([]);
    const line = (arr, col) => {
      if (arr.length < 2) return;
      g.strokeStyle = col; g.lineWidth = 1.4 * dpr; g.beginPath();
      arr.forEach((v, k) => { const px = w - (arr.length - 1 - k) * (w / 120); if (k) g.lineTo(px, y(v)); else g.moveTo(px, y(v)); });
      g.stroke();
    };
    line(S.dLh, 'rgba(255,176,74,0.9)'); line(S.dEh, 'rgba(95,227,255,0.95)');
  }
  function computeBelt() {
    const bins = new Array(32).fill(0);
    const GM = sim.G * sim.m[0];
    if (!sim.n) return;
    for (let q = 0; q < sim.pn; q++) {
      const x = sim.px[q] - sim.x[0], y = sim.py[q] - sim.y[0], r = Math.hypot(x, y);
      const v2 = (sim.pvx[q] - sim.vx[0]) ** 2 + (sim.pvy[q] - sim.vy[0]) ** 2;
      const a = 1 / (2 / r - v2 / GM);
      if (a >= 2 && a < 3.6) bins[Math.floor((a - 2) / 1.6 * 32)]++;
    }
    S.belt = bins;
  }
  function drawBelt() {
    const c = $('#beltplot'), g = c.getContext('2d'), w = c.width, h = c.height, dpr = w / (c.clientWidth || w);
    g.clearRect(0, 0, w, h);
    if (!S.belt) return;
    const mx = Math.max(10, ...S.belt), bw = w / 32;
    const grd = g.createLinearGradient(0, h, 0, 0); grd.addColorStop(0, 'rgba(95,227,255,0.25)'); grd.addColorStop(1, 'rgba(95,227,255,0.95)');
    g.fillStyle = grd;
    S.belt.forEach((v, k) => { const bh = v / mx * (h - 16 * dpr); g.fillRect(k * bw + 1, h - bh, bw - 2, bh); });
    g.font = `${8.5 * dpr}px ${MONO}`; g.textAlign = 'center';
    for (const [lab, p] of S.preset.guides.list) {
      const a = S.preset.guides.a * Math.pow(p, -2 / 3), x = (a - 2) / 1.6 * w;
      g.strokeStyle = 'rgba(255,176,74,0.7)'; g.setLineDash([2 * dpr, 2 * dpr]); g.beginPath(); g.moveTo(x, 12 * dpr); g.lineTo(x, h); g.stroke();
      g.fillStyle = 'rgba(255,190,110,0.95)'; g.fillText(lab, x, 8 * dpr);
    }
    g.setLineDash([]);
  }

  /* ---------- inspector + HUD ---------- */
  let inspId = -1;
  function updateInspector(force) {
    const i = S.selId ? sim.indexOf(S.selId) : -1;
    if (i < 0 && S.selId) S.selId = 0;
    const has = i >= 0;
    $('#insp-empty').hidden = has; $('#insp-body').hidden = !has; $('#insp-type').hidden = !has;
    if (!has) { inspId = -1; return; }
    const mt = sim.meta[i], u = S.preset.units;
    if (force || inspId !== mt.id) {
      inspId = mt.id;
      $('#insp-name').textContent = mt.name || TYPE_NAMES[mt.type];
      $('#insp-dot').style.color = mt.type === 'blackhole' ? '#ffb04a' : mt.color;
      $('#insp-type').textContent = TYPE_NAMES[mt.type];
    }
    $('#i-mass').textContent = U.fmt(sim.m[i], 3) + ' ' + u.mass;
    $('#i-speed').textContent = U.fmt(Math.hypot(sim.vx[i], sim.vy[i]) * u.vf, 3) + ' ' + u.vel;
    const el = sim.elements(i);
    if (el) {
      const rn = sim.meta[el.ref];
      $('#i-ref-k').textContent = 'DISTANCE TO ' + (rn.name || TYPE_NAMES[rn.type]).toUpperCase();
      $('#i-dist').textContent = U.fmt(el.r, 4) + ' ' + u.len;
      $('#i-a').textContent = el.bound ? U.fmt(el.a, 3) + ' ' + u.len : 'unbound';
      $('#i-e').textContent = U.fmt(el.e, 3);
      $('#i-T').textContent = el.bound ? u.tfmt(el.T) : '--';
      $('#i-pa').textContent = U.fmt(el.peri, 3) + ' / ' + (el.bound ? U.fmt(el.apo, 3) : 'inf');
      $('#i-ebar').style.width = Math.min(100, el.e * 100) + '%';
    } else {
      $('#i-ref-k').textContent = 'DISTANCE';
      ['#i-dist', '#i-a', '#i-e', '#i-T', '#i-pa'].forEach((s) => { $(s).textContent = '--'; });
      $('#i-ebar').style.width = '0%';
    }
    $('#b-follow').classList.toggle('on', S.followId === S.selId);
    $('#b-corot').classList.toggle('on', S.rotId === S.selId && !!S.rotId);
  }

  function updateHud(dt) {
    const p = S.preset, u = p.units;
    $('#r-time').textContent = u.tfmt(sim.time);
    const eff = S.eff, req = LADDER[S.timeIdx];
    const rEl = $('#r-rate');
    rEl.textContent = S.paused ? 'paused' : U.fmt(Math.abs(eff), 3) + '×' + (S.dir < 0 ? ' rev' : '');
    rEl.classList.toggle('warn', !S.paused && Math.abs(eff) < req * 0.8);
    $('#r-steps').textContent = sim.lastSteps;
    $('#r-h').textContent = U.fmt(sim.lastH, 3);
    $('#r-bodies').textContent = sim.n;
    $('#r-parts').textContent = sim.pn.toLocaleString('en-US');
    $('#r-fps').textContent = Math.round(S.fps);
    const d = sim.drift();
    $('#r-dE').textContent = U.fmtDrift(d.dE); $('#r-dL').textContent = U.fmtDrift(d.dL);
    if (!S.paused) {
      S.dEh.push(Math.log10(Math.max(1e-16, Math.abs(d.dE)))); S.dLh.push(Math.log10(Math.max(1e-16, Math.abs(d.dL))));
      if (S.dEh.length > 120) { S.dEh.shift(); S.dLh.shift(); }
    }
    drawDrift();
    if (p.belt) { computeBelt(); drawBelt(); }
    updateInspector(false);
    // transport readouts
    $('#speed-out').textContent = (req < 1 ? req : req) + '×';
    $('#speed-sub').textContent = U.fmt(baseRate(), 2) + ' ' + u.tname + '/s';
    if (!S.scrubbing) {
      const all = S.hist.concat(S.future), t0 = all.length ? all[0].t : sim.time;
      const tEnd = S.future.length ? S.future[S.future.length - 1].t : sim.time;
      const f = tEnd > t0 ? clamp((sim.time - t0) / (tEnd - t0), 0, 1) : 1;
      const sl = $('#scrub'); sl.value = Math.round(f * 1000); setFill(sl);
      $('#scrub-l').textContent = all.length > 1 ? '−' + u.tfmt(tEnd - t0) : 'RECORDING';
      const behind = S.future.length > 0;
      const r = $('#scrub-r'); r.textContent = behind ? '−' + u.tfmt(tEnd - sim.time) : 'LIVE'; r.classList.toggle('past', behind);
    }
    $('#st-zoom').textContent = 'ZOOM ' + U.fmt(S.cam.zoom / S.cam.zoomRef, 3) + '×';
    $('#st-tool').textContent = (S.tool === 'launch' ? 'LAUNCH ' + TYPE_NAMES[S.type].toUpperCase() : 'PAN');
    if (S.cursor.in) {
      const w = s2w(S.cursor.x, S.cursor.y);
      $('#st-cursor').textContent = `x ${U.fmt(w[0], 3)}  y ${U.fmt(w[1], 3)} ${u.len}`;
    }
  }

  /* ---------- UI wiring ---------- */
  function syncUi() {
    const play = $('#b-play');
    play.querySelector('use').setAttribute('href', S.paused ? '#i-play' : '#i-pause');
    play.setAttribute('aria-label', S.paused ? 'Play' : 'Pause');
    $('#b-rev').setAttribute('aria-pressed', S.dir < 0 ? 'true' : 'false');
    const sl = $('#speed-slider'); sl.value = S.timeIdx; setFill(sl);
    document.querySelectorAll('#tool-seg button').forEach((b) => b.setAttribute('aria-checked', b.dataset.tool === S.tool));
    document.querySelectorAll('#type-grid button').forEach((b) => b.setAttribute('aria-checked', b.dataset.type === S.type));
    document.querySelectorAll('#trail-seg button').forEach((b) => b.setAttribute('aria-checked', +b.dataset.trail === S.opts.trails));
    $('#tg-labels').checked = S.opts.labels; $('#tg-bloom').checked = S.opts.bloom; $('#tg-rulers').checked = S.opts.rulers;
    canvas.classList.toggle('pan', S.tool === 'pan');
    $('#b-follow').classList.toggle('on', !!S.followId && S.followId === S.selId);
    $('#b-corot').classList.toggle('on', !!S.rotId && S.rotId === S.selId);
  }

  function openDrawer(which) {
    closeDrawers();
    $('#' + which).classList.add('open'); $('#scrim').classList.add('show');
    $(which === 'left' ? '#btn-scenes' : '#btn-data').setAttribute('aria-expanded', 'true');
    setTimeout(() => { sizeCanvas($('#minimap'), 140); sizeCanvas($('#driftplot'), 46); sizeCanvas($('#beltplot'), 70); }, 380);
  }
  function closeDrawers() {
    $('#left').classList.remove('open'); $('#right').classList.remove('open'); $('#scrim').classList.remove('show');
    $('#btn-scenes').setAttribute('aria-expanded', 'false'); $('#btn-data').setAttribute('aria-expanded', 'false');
  }

  function cycleTrails() { S.opts.trails = (S.opts.trails + 1) % 4; syncUi(); toast('Trails: ' + ['off', 'short', 'medium', 'long'][S.opts.trails]); }
  function toggleHelp(force) {
    const h = $('#help'); h.hidden = force === undefined ? !h.hidden : !force;
    if (!h.hidden) $('#help-close').focus();
  }
  function setTool(t) { S.tool = t; syncUi(); savePrefs(); }
  function clearScene() {
    const keepT = sim.time;
    sim.n = 0; sim.pn = 0; sim.meta.length = 0; sim.time = keepT; sim.rebase(); sim.accValid = false;
    S.hist.length = 0; S.future.length = 0; S.selId = 0; S.followId = 0; S.rotId = 0; S.fOff = null; S.flashes.length = 0;
    S.hist.push(sim.snapshot());
    toast('Scene cleared. Press ' + (S.presetIdx === 9 ? '0' : S.presetIdx + 1) + ' to restore it.');
    updateInspector(true); syncUi();
  }
  function setHud(off) {
    S.hudOff = off; document.body.classList.toggle('hud-off', off); layout();
  }

  function wireUi() {
    $('#b-play').addEventListener('click', () => togglePause());
    $('#b-rev').addEventListener('click', toggleReverse);
    $('#b-slow').addEventListener('click', () => setTimeIdx(S.timeIdx - 1));
    $('#b-fast').addEventListener('click', () => setTimeIdx(S.timeIdx + 1));
    $('#speed-slider').addEventListener('input', (e) => setTimeIdx(+e.target.value));
    const scrub = $('#scrub');
    scrub.addEventListener('input', () => { S.scrubbing = true; setFill(scrub); scrubTo(scrub.value / 1000); });
    scrub.addEventListener('change', () => { S.scrubbing = false; });
    scrub.addEventListener('pointerup', () => { S.scrubbing = false; });
    document.querySelectorAll('#tool-seg button').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    document.querySelectorAll('#type-grid button').forEach((b) => b.addEventListener('click', () => { S.type = b.dataset.type; S.tool = 'launch'; syncUi(); updateMassOut(); savePrefs(); }));
    document.querySelectorAll('#trail-seg button').forEach((b) => b.addEventListener('click', () => { S.opts.trails = +b.dataset.trail; syncUi(); }));
    const ms = $('#mass-slider'); ms.min = -460; ms.max = 460;
    ms.addEventListener('input', () => { S.massLog = ms.value / 100; setFill(ms); updateMassOut(); });
    $('#tg-labels').addEventListener('change', (e) => { S.opts.labels = e.target.checked; savePrefs(); });
    $('#tg-bloom').addEventListener('change', (e) => { S.opts.bloom = e.target.checked; savePrefs(); });
    $('#tg-rulers').addEventListener('change', (e) => { S.opts.rulers = e.target.checked; savePrefs(); });
    $('#tg-merge').addEventListener('change', (e) => toast(e.target.checked ? 'Bodies merge on contact' : 'Bodies pass through each other'));
    $('#b-clear').addEventListener('click', clearScene);
    $('#b-follow').addEventListener('click', () => { if (S.selId) setFollow(S.followId === S.selId ? 0 : S.selId); });
    $('#b-corot').addEventListener('click', toggleCorot);
    $('#b-mtwo').addEventListener('click', () => scaleSelected(2));
    $('#b-mhalf').addEventListener('click', () => scaleSelected(0.5));
    $('#b-remove').addEventListener('click', () => { const i = sim.indexOf(S.selId); if (i >= 0) { sim.removeBody(i); S.selId = 0; updateInspector(true); toast('Body removed'); } });
    $('#btn-help').addEventListener('click', () => toggleHelp());
    $('#help-close').addEventListener('click', () => toggleHelp(false));
    $('#help').addEventListener('pointerdown', (e) => { if (e.target.id === 'help') toggleHelp(false); });
    $('#btn-hide').addEventListener('click', () => { setHud(true); toast('Interface hidden. Press H to bring it back'); });
    $('#btn-scenes').addEventListener('click', () => openDrawer('left'));
    $('#btn-data').addEventListener('click', () => openDrawer('right'));
    $('#scrim').addEventListener('click', closeDrawers);
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDrawers));
  }
  function scaleSelected(k) {
    const i = sim.indexOf(S.selId);
    if (i < 0) return;
    sim.m[i] *= k; sim.r[i] *= sim.meta[i].type === 'blackhole' ? k : Math.cbrt(k);
    sim.rebase(); sim.accValid = false; updateInspector(false);
  }

  /* ---------- keyboard ---------- */
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === ' ' && e.target.tagName === 'BUTTON') e.preventDefault();
    if (e.target.tagName === 'INPUT' && e.target.type === 'range' && (k.startsWith('Arrow') || k === 'Home' || k === 'End')) return;
    if (!$('#help').hidden) { if (k === 'Escape' || k === '?') toggleHelp(false); return; }
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (/^[0-9]$/.test(k)) { const i = k === '0' ? 9 : +k - 1; if (i < O.presets.length) loadScene(i); return; }
    switch (lower) {
      case ' ': e.preventDefault(); togglePause(); break;
      case 'r': toggleReverse(); break;
      case '[': setTimeIdx(S.timeIdx - 1); break;
      case ']': setTimeIdx(S.timeIdx + 1); break;
      case '.': if (S.paused) S.stepOnce = true; break;
      case 't': cycleTrails(); break;
      case 'l': S.opts.labels = !S.opts.labels; syncUi(); savePrefs(); break;
      case 'b': S.opts.bloom = !S.opts.bloom; syncUi(); savePrefs(); break;
      case 'u': S.opts.rulers = !S.opts.rulers; syncUi(); savePrefs(); break;
      case 'm': $('#tg-merge').checked = !$('#tg-merge').checked; $('#tg-merge').dispatchEvent(new Event('change')); break;
      case 'f': if (S.selId) setFollow(S.followId === S.selId ? 0 : S.selId); else if (S.followId) setFollow(0); else toast('Select a body, then press F to follow it'); break;
      case 'o': toggleCorot(); break;
      case 'c': clearScene(); break;
      case 'h': setHud(!S.hudOff); break;
      case 'v': setTool(S.tool === 'launch' ? 'pan' : 'launch'); break;
      case '?': case '/': toggleHelp(true); break;
      case '+': case '=': zoomBy(1.25); break;
      case '-': case '_': zoomBy(0.8); break;
      case 'escape':
        if (S.fling) { S.fling = null; RS.fling = null; gesture = null; }
        else if (S.selId) { S.selId = 0; updateInspector(true); }
        else if (S.followId) setFollow(0);
        else closeDrawers();
        break;
      case 'arrowleft': case 'arrowright': case 'arrowup': case 'arrowdown': {
        if (e.target.tagName === 'INPUT') break;
        const step = 60, dx = lower === 'arrowleft' ? -step : lower === 'arrowright' ? step : 0, dy = lower === 'arrowup' ? -step : lower === 'arrowdown' ? step : 0;
        const d = dS2W(dx, dy); S.followId = 0; S.cam.cx += d[0]; S.cam.cy += d[1]; e.preventDefault();
        break;
      }
      default:
    }
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ' && e.target.tagName === 'BUTTON') e.preventDefault(); });

  /* ---------- main loop ---------- */
  let last = performance.now(), fpsAcc = 0, fpsN = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dtReal = Math.min(0.05, Math.max(0.0005, (ts - last) / 1000)); last = ts;
    S.t += dtReal;
    fpsAcc += dtReal; fpsN++;
    if (fpsAcc > 0.5) { S.fps = fpsN / fpsAcc; S.frameMs = 1000 * fpsAcc / fpsN; fpsAcc = 0; fpsN = 0; }
    if (!S.paused || S.stepOnce) {
      if (S.stepOnce) { S.stepOnce = false; physics(1 / 60); } else physics(dtReal);
    }
    updateCamera(dtReal);
    updateView(false);
    updateFling();
    S.fade = Math.max(0, S.fade - dtReal * 2);
    RS.t = S.t; RS.dtReal = dtReal; RS.selId = S.selId; RS.hoverId = S.hoverId; RS.followId = S.followId; RS.stageL = S.stageL; RS.fade = S.fade;
    R.frame(RS);
    S.hudAcc += dtReal;
    if (S.hudAcc > 0.12) { S.hudAcc = 0; updateHud(dtReal); }
    S.mapAcc += dtReal;
    if (S.mapAcc > 0.07) { S.mapAcc = 0; drawMinimap(); }
  }

  /* ---------- boot ---------- */
  loadPrefs();
  buildPresetList();
  wireUi();
  layout();
  updateView(true);
  window.addEventListener('resize', () => { layout(); updateView(true); });
  loadScene(0, true);
  syncUi();
  requestAnimationFrame((ts) => { last = ts; requestAnimationFrame(frame); });
  setTimeout(() => $('#veil').classList.add('gone'), 120);
  // tiny hook for scripted verification (see README)
  window.__orbital = { sim, S, loadScene, LADDER, setTimeIdx, w2s, s2w, togglePause, toggleReverse, hitTest };
})();
