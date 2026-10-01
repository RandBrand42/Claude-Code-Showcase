/* FLUXFIELD - application shell: state, input, wells, main loop, adaptive quality, capture (FF.app).
 * Coordinates: u,v are UV (v up); velocities are in screen-height units per second. */
(function () {
  'use strict';
  const FF = window.FF;
  const { TAU, clamp, lerp, easeInOut, mulberry32 } = FF.util;
  const SC = FF.scenes;
  const I = SC.IDX;
  const $ = (s) => document.querySelector(s);

  const STORE_KEY = 'fluxfield.v1';
  const LEVELS = [1, 0.78, 0.6, 0.45, 0.33];           // resolution multipliers used by adaptive quality
  const QUALITY_LEVEL = { high: 0, balanced: 2, low: 3 };
  const LONG_PRESS_MS = 520;
  const MAX_WELLS = 6;
  const WELL_RADIUS = 0.055;
  const REC_MS = 10000;

  const canvas = $('#stage');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fluid = FF.createFluid(canvas);

  /* ------------------------------------------------------------------ fallback */
  if (!fluid.ok) {
    const why = { context: 'This browser did not give us a WebGL2 context.', float: 'This GPU cannot render to floating-point textures, which the fluid solver needs.', shader: 'The GPU driver rejected the simulation shaders.' };
    document.body.classList.remove('booting');
    document.body.classList.add('no-gl');
    $('#unsupportedMsg').textContent = why[fluid.reason] || why.context;
    $('#unsupported').hidden = false;
    canvas.style.display = 'none';
    return;
  }

  /* ------------------------------------------------------------------ state + persistence */
  const state = {
    scene: 0, paletteId: SC.SCENES[0].id, palette: SC.SCENES[0].palette.slice(), colorMode: 'time',
    symmetry: 1, mirror: true, conductor: true, energy: 1, quality: 'auto', iterations: 20, hud: false, paused: false,
  };

  function loadSaved() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      return s && s.v === 1 ? s : null;
    } catch (e) { return null; }
  }
  const saved = loadSaved();
  if (saved) {
    const ok = (k, test) => { if (k in saved && test(saved[k])) state[k] = saved[k]; };
    ok('scene', (v) => Number.isInteger(v) && v >= 0 && v < SC.SCENES.length);
    ok('paletteId', (v) => typeof v === 'string');
    ok('palette', (v) => Array.isArray(v) && v.length === 4 && v.every((h) => /^#[0-9a-f]{6}$/i.test(h)));
    ok('colorMode', (v) => ['time', 'velocity', 'position'].includes(v));
    ok('symmetry', (v) => [1, 2, 3, 4, 6, 8].includes(v));
    ok('mirror', (v) => typeof v === 'boolean');
    ok('conductor', (v) => typeof v === 'boolean');
    ok('energy', (v) => typeof v === 'number' && v >= 0.2 && v <= 1.6);
    ok('quality', (v) => ['auto', 'high', 'balanced', 'low'].includes(v));
    ok('iterations', (v) => Number.isInteger(v) && v >= 4 && v <= 40);
    ok('hud', (v) => typeof v === 'boolean');
  }

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const look = {};
      SC.SLIDERS.forEach((d) => { look[d.key] = +to[I[d.key]].toFixed(4); });
      try { localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign({ v: 1, look }, state, { paused: undefined }))); } catch (e) { /* storage unavailable */ }
    }, 400);
  }

  /* ------------------------------------------------------------------ look vector (scene crossfade) */
  let live = SC.vectorFor(SC.SCENES[state.scene]);
  if (saved && saved.scene === state.scene && saved.look) {
    SC.SLIDERS.forEach((d) => { const v = saved.look[d.key]; if (typeof v === 'number' && v >= d.min && v <= d.max) live[I[d.key]] = v; });
  }
  SC.setPalette(live, state.palette);
  const from = live.slice();
  let to = live.slice();
  let tween = 1, tweenDur = 1.6;
  const palLin = new Float32Array(12);

  function startTween(dur) { from.set(live); tween = 0; tweenDur = dur; }
  function tickTween(dt) {
    if (tween < 1) {
      tween = Math.min(1, tween + dt / tweenDur);
      const e = easeInOut(tween);
      for (let k = 0; k < live.length; k++) live[k] = from[k] + (to[k] - from[k]) * e;
      if (tween >= 1 || (frameNo % 3) === 0) ui.syncAll();
    }
    for (let k = 0; k < 12; k++) palLin[k] = Math.pow(live[I.pal0 + k], 2.2);
    if (tween < 1 || frameNo < 2) updateAccent();
  }
  function updateAccent() {
    let r = live[I.pal3], g = live[I.pal4], b = live[I.pal5];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (l < 0.5) { const m = (0.5 - l) * 1.1; r += (1 - r) * m; g += (1 - g) * m; b += (1 - b) * m; }
    ui.setAccent(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  }
  /** Cyclic, smoothstepped palette lookup in linear light. */
  function samplePalette(t, out) {
    t -= Math.floor(t);
    const x = t * 4, i = Math.floor(x) & 3, j = (i + 1) & 3;
    let f = x - Math.floor(x); f = f * f * (3 - 2 * f);
    for (let c = 0; c < 3; c++) out[c] = palLin[i * 3 + c] * (1 - f) + palLin[j * 3 + c] * f;
    return out;
  }

  /* ------------------------------------------------------------------ painting (with kaleidoscope) */
  const rnd = mulberry32(20260930);
  const col = [0, 0, 0];
  let aspect = 1, dyeGain = 1, clockT = 0, simTime = 0, frameNo = 0;   // dyeGain: tall phone canvases need less dye per splat
  const symTables = {};
  function symTable(n) {
    if (!symTables[n]) { symTables[n] = { c: [], s: [] }; for (let j = 0; j < n; j++) { symTables[n].c.push(Math.cos((TAU * j) / n)); symTables[n].s.push(Math.sin((TAU * j) / n)); } }
    return symTables[n];
  }
  /** Adds a splat and, when symmetry is on, its rotated (and optionally mirrored) copies around the centre. */
  function paint(u, v, vx, vy, rgb, radius, amount, noSym) {
    if (state.paused) return;
    amount *= dyeGain;
    const n = state.symmetry;
    if (noSym || n <= 1) { fluid.splat(u, v, radius, vx, vy, rgb[0] * amount, rgb[1] * amount, rgb[2] * amount); return; }
    const X = (u - 0.5) * aspect, Y = v - 0.5;
    const k = amount / Math.pow(state.mirror ? n * 2 : n, 0.3);         // tame the pile-up where copies overlap
    const T = symTable(n);
    for (let j = 0; j < n; j++) {
      const c = T.c[j], s = T.s[j];
      fluid.splat((c * X - s * Y) / aspect + 0.5, s * X + c * Y + 0.5, radius, c * vx - s * vy, s * vx + c * vy, rgb[0] * k, rgb[1] * k, rgb[2] * k);
      if (state.mirror) fluid.splat((c * X + s * Y) / aspect + 0.5, s * X - c * Y + 0.5, radius, c * vx + s * vy, s * vx - c * vy, rgb[0] * k, rgb[1] * k, rgb[2] * k);
    }
  }
  function burst(power) {
    const n = 5 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * TAU, sp = (0.9 + rnd() * 1.8) * power * live[I.force];
      samplePalette(rnd(), col);
      paint(0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7, Math.cos(ang) * sp, Math.sin(ang) * sp, col, live[I.radius] * (1.3 + rnd() * 0.9), 0.55 * power + 0.15, false);
    }
  }

  /* ------------------------------------------------------------------ conductor */
  const conductor = FF.createConductor({
    aspect: () => aspect, symmetry: () => state.symmetry, force: () => live[I.force], energy: () => state.energy, radius: () => live[I.radius],
    look: () => SC.SCENES[state.scene].conductor, palette: samplePalette, paint, burst, reduced,
  });
  conductor.enabled = state.conductor;

  /* ------------------------------------------------------------------ vortex wells */
  const wells = [];
  const wellsEl = $('#wells');
  let wellSeq = 0;
  // the individual `translate` property keeps positioning independent of the CSS entrance animation (which owns `transform`)
  function placeWellEl(w) { w.el.style.translate = `${w.u * innerWidth}px ${(1 - w.v) * innerHeight}px`; }
  function addWell(u, v) {
    if (wells.length >= MAX_WELLS) removeWell(wells[0]);
    const w = { u, v, dir: wellSeq++ % 2 ? -1 : 1, hue: rnd(), el: document.createElement('div') };
    samplePalette(w.hue, col);
    w.el.className = 'well' + (w.dir < 0 ? ' ccw' : '');
    w.el.style.setProperty('--wc', col.map((c) => Math.round(Math.pow(Math.min(c * 1.4, 1), 1 / 2.2) * 255)).join(' '));
    w.el.innerHTML = '<i></i>';
    wellsEl.appendChild(w.el);
    wells.push(w);
    placeWellEl(w);
    ui.toast(`Vortex well placed (${wells.length}/${MAX_WELLS})  -  click it to remove`);
  }
  function removeWell(w) { w.el.remove(); wells.splice(wells.indexOf(w), 1); }
  function wellAt(x, y) { return wells.find((w) => Math.hypot(w.u * innerWidth - x, (1 - w.v) * innerHeight - y) < 24) || null; }
  function driveWells(dt) {
    const frames = dt * 60, push = 0.6 + 0.4 * live[I.force];
    for (const w of wells) {
      fluid.swirl(w.u, w.v, WELL_RADIUS, w.dir * 0.02 * push * frames);
      for (let k = 0; k < 2; k++) {
        const ang = simTime * w.dir * 2.1 + k * Math.PI;
        samplePalette(w.hue + simTime * 0.03 + k * 0.5, col);
        const a = 0.09 * frames;
        fluid.dyeSplat(w.u + (Math.cos(ang) * WELL_RADIUS * 0.75) / aspect, w.v + Math.sin(ang) * WELL_RADIUS * 0.75, WELL_RADIUS * 0.28, col[0] * a, col[1] * a, col[2] * a);
      }
    }
  }

  /* ------------------------------------------------------------------ pointers (mouse, pen, multi-touch) */
  const pointers = new Map();
  function makePointer(e) {
    return { id: e.pointerId, type: e.pointerType, u: 0, v: 0, lu: 0, lv: 0, vx: 0, vy: 0, sx: 0, sy: 0, down: false, moved: false, consumed: false, well: null, timer: 0, first: true, hue: (pointers.size * 0.31 + rnd() * 0.2) % 1 };
  }
  function locate(p, e) {
    p.u = e.clientX / innerWidth; p.v = 1 - e.clientY / innerHeight;
    if (p.first) { p.lu = p.u; p.lv = p.v; p.first = false; }
  }
  function pointerColor(p, out) {
    if (state.colorMode === 'velocity') return samplePalette(Math.atan2(p.vy, p.vx) / TAU + 0.5 + simTime * 0.02, out);
    if (state.colorMode === 'position') {
      const dx = (p.u - 0.5) * aspect, dy = p.v - 0.5;
      return samplePalette(Math.atan2(dy, dx) / TAU + Math.hypot(dx, dy) * 0.9 + 0.5, out);
    }
    return samplePalette(simTime * 0.05 + p.hue, out);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (ui.helpOpen || (e.pointerType === 'mouse' && e.button === 1)) return;
    conductor.touch();
    ui.closeIfMobile();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    if (e.button === 2) {                                               // right-click: place / remove a well
      const w = wellAt(e.clientX, e.clientY);
      if (w) removeWell(w); else addWell(e.clientX / innerWidth, 1 - e.clientY / innerHeight);
      return;
    }
    const p = pointers.get(e.pointerId) || makePointer(e);
    pointers.set(e.pointerId, p);
    locate(p, e);
    p.lu = p.u; p.lv = p.v;
    Object.assign(p, { down: true, moved: false, consumed: false, sx: e.clientX, sy: e.clientY, vx: 0, vy: 0 });
    p.well = wellAt(e.clientX, e.clientY);
    if (p.well) return;
    if (e.pointerType !== 'mouse') {                                    // long-press places a well (touch / pen)
      clearTimeout(p.timer);
      p.timer = setTimeout(() => {
        if (p.down && !p.moved) { p.consumed = true; addWell(p.u, p.v); if (navigator.vibrate) navigator.vibrate(14); }
      }, LONG_PRESS_MS);
    }
    pointerColor(p, col);                                               // tap splash
    paint(p.u, p.v, 0, 0, col, live[I.radius] * 1.5, 0.3, false);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (ui.helpOpen) return;
    let p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'touch') return;
      p = makePointer(e); pointers.set(e.pointerId, p);
    }
    conductor.touch();
    locate(p, e);
    if (p.down && !p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) { p.moved = true; clearTimeout(p.timer); }
    if (p.down && p.well) { p.well.u = p.u; p.well.v = p.v; placeWellEl(p.well); }
    else if (e.pointerType === 'mouse' && !p.down) canvas.style.cursor = wellAt(e.clientX, e.clientY) ? 'grab' : '';
  });
  function release(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    clearTimeout(p.timer);
    if (p.well && !p.moved && e.type === 'pointerup') removeWell(p.well);   // click a well again to remove it
    p.down = false; p.well = null;
    if (e.pointerType !== 'mouse' || e.type === 'pointerleave') pointers.delete(e.pointerId);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (e) => { const p = pointers.get(e.pointerId); if (p && !p.down) release(e); });

  /** Converts pointer travel since the last frame into interpolated splats (smooth strokes at any speed). */
  function paintPointers(dt) {
    const radius0 = live[I.radius], force = live[I.force];
    for (const p of pointers.values()) {
      const dx = (p.u - p.lu) * aspect, dy = p.v - p.lv;
      const dist = Math.hypot(dx, dy);
      const active = !p.consumed && !p.well && (p.down || p.type !== 'touch');
      if (dist < 1e-5 || !active) { p.vx *= 0.8; p.vy *= 0.8; p.lu = p.u; p.lv = p.v; continue; }
      p.vx = lerp(p.vx, dx / dt, 0.55); p.vy = lerp(p.vy, dy / dt, 0.55);   // smoothed height-units / s
      const radius = radius0 * (p.down ? 1.35 : 1);
      const steps = Math.min(10, Math.max(1, Math.ceil(dist / (radius * 0.8))));
      const spacing = dist / steps;
      const amount = (p.down ? 1 : 0.7) * 0.15 * clamp(0.25 + (spacing / (radius * 0.8)) * 0.75, 0.25, 1);
      pointerColor(p, col);
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        paint(lerp(p.lu, p.u, f), lerp(p.lv, p.v, f), p.vx * force, p.vy * force, col, radius, amount, false);
      }
      p.lu = p.u; p.lv = p.v;
    }
  }

  /* ------------------------------------------------------------------ capture: PNG + WebM */
  let shotRequested = false, recorder = null, recTimer = 0, recStart = 0;
  const stamp = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function startRecording(ms) {
    if (recorder) { stopRecording(); return; }
    if (!canvas.captureStream || !window.MediaRecorder) { ui.toast('Recording is not supported in this browser'); return; }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { ui.toast('No WebM encoder available in this browser'); return; }
    try {
      const stream = canvas.captureStream(60);
      const chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 14e6 });
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'video/webm' });
        recorder = null; clearTimeout(recTimer);
        ui.setRecording(false); ui.setStatus(null);
        if (blob.size) { download(blob, `fluxfield-${stamp()}.webm`); ui.toast(`Saved ${(blob.size / 1048576).toFixed(1)} MB WebM`); }
        else ui.toast('The browser delivered no video frames - nothing was saved');
      };
      recorder.start(250);
      recStart = performance.now();
      recTimer = setTimeout(stopRecording, ms || REC_MS);
      ui.setRecording(true);
      ui.toast('Recording 10 s  -  press M to stop early');
    } catch (err) {
      recorder = null;
      ui.toast('Could not start recording');
    }
  }
  function stopRecording() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }

  /* ------------------------------------------------------------------ actions (used by UI + keyboard) */
  const actions = {
    scene(i) {
      const n = SC.SCENES.length;
      i = ((i % n) + n) % n;
      const s = SC.SCENES[i];
      state.scene = i; state.paletteId = s.id; state.palette = s.palette.slice();
      startTween(reduced ? 0.3 : 1.6);
      to = SC.vectorFor(s);
      ui.syncAll(); ui.showSceneName(i); save();
    },
    resetScene() { actions.scene(state.scene); ui.toast('Scene reset'); },
    param(key, v) { live[I[key]] = from[I[key]] = to[I[key]] = v; save(); },
    palette(id, colors) {
      state.paletteId = id; state.palette = colors.slice();
      startTween(0.7); SC.setPalette(to, colors);
      ui.syncAll(); save();
    },
    customColor(i, hex) {
      state.palette[i] = hex; state.paletteId = 'custom';
      startTween(0.35); SC.setPalette(to, state.palette);
      ui.syncAll(); save();
    },
    colorMode(m) { state.colorMode = m; ui.syncAll(); ui.toast({ time: 'Colour flows with time', velocity: 'Colour follows direction of motion', position: 'Colour follows position' }[m]); save(); },
    symmetry(n) {
      state.symmetry = n; ui.syncAll(); save();
      ui.toast(n === 1 ? 'Kaleidoscope off' : `Kaleidoscope ${n}-fold  -  ${state.mirror ? 'mirrored' : 'rotational'}`);
    },
    cycleSymmetry() { const order = [1, 2, 3, 4, 6, 8]; actions.symmetry(order[(order.indexOf(state.symmetry) + 1) % order.length]); },
    mirror(on) { state.mirror = on; ui.syncAll(); save(); if (state.symmetry > 1) ui.toast(on ? 'Mirrored kaleidoscope' : 'Rotational kaleidoscope'); },
    conductor(on) { state.conductor = on; conductor.enabled = on; ui.syncAll(); ui.toast(on ? 'Autopilot on' : 'Autopilot off'); save(); },
    energy(v) { state.energy = v; save(); },
    quality(q) {
      state.quality = q;
      setLevel(q === 'auto' ? (fluid.info.software ? 3 : 0) : QUALITY_LEVEL[q] || 0);
      lowStreak = 0; warm = 20;
      ui.syncAll(); save();
    },
    iterations(v) { state.iterations = v; save(); },
    clear() { fluid.clear(); ui.toast('Cleared'); },
    burst() { burst(1); },
    pause() { state.paused = !state.paused; ui.setPaused(state.paused); updateStatus(); if (state.paused) ui.toast('Paused'); },
    shot() { shotRequested = true; },
    rec() { startRecording(); },
    full() {
      try {
        const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(() => ui.toast('Fullscreen is unavailable here'));
      } catch (e) { ui.toast('Fullscreen is unavailable here'); }
    },
    hud() { state.hud = !state.hud; ui.setHud(hudText()); ui.syncAll(); save(); },
    hideUI() {
      const hide = !document.body.classList.contains('ui-hidden');
      document.body.classList.toggle('ui-hidden', hide);
      if (hide) ui.toast('Interface hidden  -  press H to bring it back', 2600);
    },
    clearWells() { while (wells.length) removeWell(wells[0]); ui.toast('Vortex wells removed'); },
  };
  function updateStatus() {
    if (recorder) ui.setStatus('rec', `REC  ${Math.max(0, Math.ceil(((REC_MS - (performance.now() - recStart)) / 1000)))}s`);
    else if (state.paused) ui.setStatus('paused', 'Paused');
    else ui.setStatus(null);
  }

  const ui = FF.createUI({ state, actions, getParam: (k) => live[I[k]] });

  /* ------------------------------------------------------------------ keyboard */
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type === 'text')) return;
    const k = e.key;
    if (k === 'Escape') {
      if (ui.helpOpen) ui.toggleHelp(false); else if (ui.isOpen()) ui.setOpen(false);
      return;
    }
    if ((k === ' ' || k === 'Enter') && tag === 'BUTTON') return;        // keep native button activation for keyboard users
    const lower = k.length === 1 ? k.toLowerCase() : k;
    const handled = {
      ' ': actions.pause, c: actions.clear, r: actions.burst, s: actions.shot, m: actions.rec, f: actions.full, h: actions.hideUI,
      k: actions.cycleSymmetry, p: actions.hud, a: () => actions.conductor(!state.conductor), w: actions.clearWells,
      d: () => (ui.isOpen() ? ui.setOpen(false) : ui.setOpen(true, true)), '?': () => ui.toggleHelp(),
    }[lower];
    if (handled) { e.preventDefault(); handled(); return; }
    if (/^[1-7]$/.test(k)) { e.preventDefault(); actions.scene(+k - 1); }
  });

  /* ------------------------------------------------------------------ sizing, quality, HUD */
  let level = 0, lowStreak = 0, cooldown = 0, warm = 40, fps = 60, msAvg = 16.7, acc = 0, accN = 0;
  function setLevel(l) { level = clamp(l, 0, LEVELS.length - 1); fluid.setScale(LEVELS[level]); }
  function perfTick(raw) {
    if (warm > 0) { warm--; return; }
    msAvg = lerp(msAvg, raw * 1000, 0.08);
    acc += raw; accN++;
    cooldown = Math.max(0, cooldown - raw);
    if (acc < 1) return;
    fps = accN / acc; acc = 0; accN = 0;
    if (state.quality === 'auto' && fps < 45 && level < LEVELS.length - 1) {
      if (++lowStreak >= 2 && cooldown <= 0) { setLevel(level + 1); lowStreak = 0; cooldown = 3; warm = 10; }
    } else lowStreak = 0;
  }
  function hudText() {
    const d = fluid.dims;
    return [`FLUXFIELD   ${fps.toFixed(0)} fps   ${msAvg.toFixed(1)} ms`,
      `sim ${d.sim.join('x')}   dye ${d.dye.join('x')}`,
      `scale ${LEVELS[level].toFixed(2)}${state.quality === 'auto' ? ' auto' : ''}   iter ${state.iterations}`,
      `wells ${wells.length}   fold ${state.symmetry}   conductor ${(conductor.weight * 100).toFixed(0)}%`,
      `${fluid.info.format}${fluid.info.manualFilter ? ' manual-bilerp' : ''}   ${fluid.info.renderer.slice(0, 44)}`].join('\n');
  }

  let resizeTimer = 0;
  function resize(immediate) {
    const dpr = Math.min(window.devicePixelRatio || 1, fluid.info.software ? 1 : 2);
    const w = Math.max(2, Math.round(innerWidth * dpr)), h = Math.max(2, Math.round(innerHeight * dpr));
    if (w === canvas.width && h === canvas.height && !immediate) return;
    canvas.width = w; canvas.height = h;
    aspect = w / h;
    dyeGain = clamp(aspect, 0.4, 1);
    fluid.resize(w, h);
    wells.forEach(placeWellEl);
  }
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });

  /* ------------------------------------------------------------------ main loop */
  const sp = { curl: 0, dissipation: 0, velDissipation: 0, pressure: 0.8, iterations: 20 };
  const rp = { bloom: 0, threshold: 0, rays: 0, exposure: 1, bg0: 0, bg1: 0, bg2: 0, lightX: 0.5, lightY: 0.5 };
  function syncParams() {
    sp.curl = live[I.curl];
    sp.dissipation = live[I.dissipation] + 1.4 * (1 - tween);        // scene changes wash the old palette out while the new one paints in
     sp.velDissipation = live[I.velDissipation];
    sp.pressure = live[I.pressure]; sp.iterations = state.iterations;
    rp.bloom = live[I.bloom]; rp.threshold = live[I.threshold]; rp.rays = live[I.rays]; rp.exposure = live[I.exposure];
    rp.bg0 = live[I.bg0]; rp.bg1 = live[I.bg1]; rp.bg2 = live[I.bg2];
    rp.lightX = 0.5 + 0.1 * Math.sin(clockT * 0.13); rp.lightY = 0.5 + 0.07 * Math.cos(clockT * 0.09);
  }

  let last = 0, t0 = 0, fade = 0, contextLost = false, hudTimer = 0, statusTimer = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (contextLost) return;
    if (!t0) t0 = now;
    const raw = last ? Math.max(0, (now - last) / 1000) : 1 / 60;
    last = now;
    const dt = Math.max(1e-3, Math.min(raw, 1 / 30));
    perfTick(raw);
    clockT += dt;
    tickTween(dt);

    if (!state.paused) {
      simTime += dt;
      conductor.update(dt);
      paintPointers(dt);
      driveWells(dt);
      syncParams();
      fluid.step(dt, sp);
    } else syncParams();

    const fadeT = reduced ? 0.4 : 2.6;
    fade = easeInOut(clamp((now - t0 - 150) / (fadeT * 1000), 0, 1));
    fluid.render(rp, clockT, fade);

    if (shotRequested) {
      shotRequested = false;
      canvas.toBlob((b) => { if (b) { download(b, `fluxfield-${stamp()}.png`); ui.toast(`Saved ${canvas.width} x ${canvas.height} PNG`); } }, 'image/png');
    }
    if (frameNo === 1) document.body.classList.remove('booting');
    frameNo++;

    if (now - hudTimer > 250) { hudTimer = now; if (state.hud) ui.setHud(hudText()); }
    if (recorder && now - statusTimer > 200) { statusTimer = now; updateStatus(); }
  }

  /** Runs the solver for a moment before the first paint so the fade-up starts on a fluid already in motion. */
  function prewarm() {
    const steps = fluid.info.software ? 14 : 70, t = performance.now();
    for (let i = 0; i < steps && performance.now() - t < 450; i++) {
      tickTween(1 / 60);
      simTime += 1 / 60; clockT += 1 / 60;
      conductor.update(1 / 60);
      syncParams();
      fluid.step(1 / 60, sp);
    }
  }

  document.addEventListener('visibilitychange', () => { last = 0; warm = 20; });
  document.addEventListener('fullscreenchange', () => ui.setFullscreen(!!document.fullscreenElement));
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true; ui.toast('Graphics context lost - waiting for the GPU'); });
  canvas.addEventListener('webglcontextrestored', () => window.location.reload());      // settings persist, so a reload is seamless

  /* ------------------------------------------------------------------ boot */
  if (window.matchMedia('(pointer: coarse)').matches) {
    const spans = document.querySelectorAll('.hint span');
    if (spans[0]) spans[0].textContent = 'touch to paint';
    if (spans[1]) spans[1].textContent = 'long-press for a vortex';
  }
  setLevel(state.quality === 'auto' ? (fluid.info.software ? 3 : 0) : QUALITY_LEVEL[state.quality] || 0);
  resize(true);
  ui.syncAll();
  ui.setHud(hudText());
  updateAccent();
  prewarm();
  requestAnimationFrame(frame);

  /** Test / automation hooks (also handy from the console). */
  FF.app = {
    state, fluid, conductor, wells, actions,
    paint, addWell, samplePalette,
    perf: () => ({ fps, msAvg, level, scale: LEVELS[level], frames: frameNo, dims: fluid.dims, info: fluid.info }),
    record: startRecording,
    /** Renders right now and summarises the actual framebuffer pixels (proves the canvas is neither black nor flat). */
    probe() { syncParams(); fluid.render(rp, clockT, 1); return fluid.readback(); },
  };
})();
