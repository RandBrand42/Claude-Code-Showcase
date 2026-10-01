/* PRISM - app: audio, canvas renderer, input, screens. Logic lives in core.js / levels.js. */
(function () {
  'use strict';
  const C = Prism.core, LV = Prism.levels;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;

  /* ------------------------------------------------------------ persistence */
  const save = { stars: {}, best: {}, mute: false, daily: {} };
  try { Object.assign(save, JSON.parse(localStorage.getItem('prism.v1') || '{}')); } catch (e) { /* storage unavailable */ }
  const persist = () => { try { localStorage.setItem('prism.v1', JSON.stringify(save)); } catch (e) { /* ignore */ } };

  /* ------------------------------------------------------------------ audio */
  let AC = null, master = null, humG = null, echo = null;
  function audio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return AC; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = save.mute ? 0 : 0.55; master.connect(AC.destination);
      echo = AC.createDelay(); echo.delayTime.value = 0.23;
      const fb = AC.createGain(), lp = AC.createBiquadFilter(); fb.gain.value = 0.32; lp.type = 'lowpass'; lp.frequency.value = 2400;
      echo.connect(lp); lp.connect(fb); fb.connect(echo); echo.connect(master);
      humG = AC.createGain(); humG.gain.value = 0; humG.connect(master);
      [[55, 'sine'], [82.6, 'triangle']].forEach(([f, t]) => { const o = AC.createOscillator(); o.type = t; o.frequency.value = f; o.connect(humG); o.start(); });
    } catch (e) { AC = null; }
    return AC;
  }
  function tone(f, d, type, v, slide, when) {
    if (!AC) return;
    const t = AC.currentTime + (when || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(master); g.connect(echo); o.start(t); o.stop(t + d + 0.05);
  }
  const PENT = [0, 2, 4, 7, 9];
  const sfx = {
    rotate: () => tone(330, 0.09, 'triangle', 0.12, 1.4), place: () => { tone(180, 0.14, 'sine', 0.25, 0.6); tone(540, 0.08, 'triangle', 0.08); },
    chime: n => { const f = 392 * Math.pow(2, (PENT[n % 5] + 12 * Math.floor(n / 5)) / 12); tone(f, 1.3, 'sine', 0.2); tone(f * 2, 0.8, 'sine', 0.05); },
    dim: () => tone(200, 0.25, 'sine', 0.1, 0.6), nope: () => tone(140, 0.12, 'square', 0.04),
    win: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 1.8, 'sine', 0.15, 0, i * 0.09)),
    hint: () => { tone(660, 0.2, 'sine', 0.12); tone(880, 0.3, 'sine', 0.1, 0, 0.1); },
  };
  const setHum = n => { if (AC && humG) humG.gain.setTargetAtTime(Math.min(0.12, 0.015 + 0.02 * n), AC.currentTime, 0.4); };
  function setMute(m) {
    save.mute = m; persist(); document.body.classList.toggle('muted', m); $('#sndState').textContent = m ? 'off' : 'on';
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, AC.currentTime, 0.05);
  }

  /* ---------------------------------------------------------------- drawing */
  const PRIM = [[255, 70, 90], [90, 255, 120], [90, 120, 255]];
  const maskRGB = m => {
    let r = 0, g = 0, b = 0;
    for (let p = 0; p < 3; p++) if (m & (1 << p)) { r += PRIM[p][0]; g += PRIM[p][1]; b += PRIM[p][2]; }
    const k = 255 / Math.max(r, g, b, 1); return [r * k, g * k, b * k];
  };
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  const mix = (c, k) => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];
  const PORTAL_COL = [[176, 107, 255], [63, 224, 255], [255, 179, 71], [255, 107, 157]];
  const NAMES = { M: 'Mirror', S: 'Splitter', P: 'Prism', F: 'Filter', E: 'Emitter', O: 'Portal', W: 'Wall', A: 'Absorber', C: 'Crystal' };

  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function hexPath(ctx, r, rot) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = rot + k * TAU / 6; ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }

  /* One function draws every piece, on the board and in the tray icons. o: {a alpha, g crystal glow 0..1, t time, tint [r,g,b] or null} */
  function drawPiece(ctx, p, cx, cy, s, ang, o) {
    o = o || {};
    ctx.save(); ctx.translate(cx, cy); ctx.globalAlpha = o.a == null ? 1 : o.a;
    const mov = C.isMovable(p);
    if (mov || p.t === 'F') {
      rrect(ctx, -s * 0.42, -s * 0.42, s * 0.84, s * 0.84, s * 0.14);
      ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fill();
      ctx.strokeStyle = p.src === 'inv' ? 'rgba(192,75,255,.55)' : mov ? 'rgba(192,75,255,.26)' : 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.stroke();
    }
    switch (p.t) {
      case 'M': case 'S': {
        ctx.rotate(ang); const L = s * 0.36;
        ctx.lineCap = 'round';
        if (p.t === 'M') {
          ctx.strokeStyle = 'rgba(140,190,255,.22)'; ctx.lineWidth = s * 0.17; ctx.beginPath(); ctx.moveTo(-L, L); ctx.lineTo(L, -L); ctx.stroke();
          ctx.strokeStyle = '#d6eaff'; ctx.lineWidth = s * 0.07; ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.02; ctx.beginPath(); ctx.moveTo(-L * .9 - 1, L * .9 - 1); ctx.lineTo(L * .9 - 1, -L * .9 - 1); ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(140,190,255,.3)'; ctx.lineWidth = s * 0.15; ctx.beginPath(); ctx.moveTo(-L, L); ctx.lineTo(L, -L); ctx.stroke();
          ctx.strokeStyle = '#eaf4ff'; ctx.lineWidth = s * 0.035; ctx.setLineDash([s * 0.09, s * 0.06]); ctx.stroke(); ctx.setLineDash([]);
        }
        if (p.fx) { ctx.fillStyle = 'rgba(255,255,255,.55)'; [[-L, L], [L, -L]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, s * 0.03, 0, TAU); ctx.fill(); }); }
        break;
      }
      case 'P': {
        ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.3); ctx.lineTo(-s * 0.3, s * 0.3); ctx.lineTo(s * 0.34, 0); ctx.closePath();
        const g = ctx.createLinearGradient(-s * 0.3, 0, s * 0.34, 0); g.addColorStop(0, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(190,150,255,.08)');
        ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
        [[-1, PRIM[0]], [0, PRIM[1]], [1, PRIM[2]]].forEach(([k, c]) => { ctx.strokeStyle = rgba(c, .75); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(s * 0.34, 0); ctx.lineTo(s * 0.46, k * s * 0.17); ctx.stroke(); });
        if (p.fx) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(-s * .22, 0, s * 0.03, 0, TAU); ctx.fill(); }
        break;
      }
      case 'F': {
        const c = maskRGB(p.c); rrect(ctx, -s * 0.27, -s * 0.27, s * 0.54, s * 0.54, s * 0.07);
        ctx.fillStyle = rgba(c, .3); ctx.fill(); ctx.strokeStyle = rgba(c, .95); ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 0.18, -s * 0.12); ctx.lineTo(-s * 0.06, -s * 0.2); ctx.stroke();
        break;
      }
      case 'O': {
        const c = PORTAL_COL[p.id % 4], t = o.t || 0;
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, TAU); ctx.fill();
        for (let k = 0; k < 3; k++) {
          ctx.strokeStyle = rgba(c, .9 - k * .22); ctx.lineWidth = 1.6; ctx.setLineDash([s * .12, s * .07]); ctx.lineDashOffset = -t * (20 + k * 12) * (k % 2 ? -1 : 1);
          ctx.beginPath(); ctx.arc(0, 0, s * (0.3 - k * 0.085), 0, TAU); ctx.stroke();
        }
        ctx.setLineDash([]); break;
      }
      case 'W': {
        rrect(ctx, -s * 0.43, -s * 0.43, s * 0.86, s * 0.86, s * 0.1);
        const g = ctx.createLinearGradient(0, -s * .4, 0, s * .4); g.addColorStop(0, '#22212c'); g.addColorStop(1, '#121119');
        ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(-s * .3, -s * .32); ctx.lineTo(s * .3, -s * .32); ctx.stroke(); break;
      }
      case 'A': {
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, s * 0.33, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,90,110,.45)'; ctx.lineWidth = 1.4; ctx.setLineDash([s * .1, s * .08]); ctx.lineDashOffset = -(o.t || 0) * 10; ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, TAU); ctx.stroke(); break;
      }
      case 'E': {
        const c = maskRGB(p.c);
        ctx.rotate(ang); ctx.fillStyle = '#15141c'; ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.4;
        rrect(ctx, 0, -s * 0.085, s * 0.44, s * 0.17, s * 0.04); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, s * 0.27, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = rgba(c, 1); ctx.shadowColor = rgba(c, .9); ctx.shadowBlur = s * 0.25; ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-s * .03, -s * .03, s * 0.035, 0, TAU); ctx.fill(); break;
      }
      case 'C': {
        const c = maskRGB(p.c), g = o.g || 0, tn = o.tint;
        hexPath(ctx, s * 0.33, Math.PI / 6);
        ctx.fillStyle = g > 0.02 ? rgba(mix(c, g * 0.35), 0.25 + 0.65 * g) : tn ? rgba(tn, .3) : rgba(c, .07);
        ctx.fill(); ctx.strokeStyle = rgba(g > 0.5 ? mix(c, .5) : c, .55 + .45 * g); ctx.lineWidth = 1.8; ctx.stroke();
        ctx.strokeStyle = rgba(c, .3 + .3 * g); ctx.lineWidth = 1;
        hexPath(ctx, s * 0.17, Math.PI / 6); ctx.stroke();
        for (let k = 0; k < 6; k += 1) { const a = Math.PI / 6 + k * TAU / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * .17, Math.sin(a) * s * .17); ctx.lineTo(Math.cos(a) * s * .33, Math.sin(a) * s * .33); ctx.stroke(); }
        if (p.pw) { ctx.setLineDash([s * .05, s * .05]); ctx.strokeStyle = rgba(c, .9); hexPath(ctx, s * 0.41, Math.PI / 6); ctx.stroke(); ctx.setLineDash([]); }
        for (let k = 0; k < (p.n || 1) && p.n > 1; k++) { ctx.fillStyle = rgba(c, .95); ctx.beginPath(); ctx.arc((k - (p.n - 1) / 2) * s * 0.11, s * 0.42, s * 0.03, 0, TAU); ctx.fill(); }
        break;
      }
    }
    ctx.restore();
  }
  const angleOf = p => p.t === 'P' ? (p.r - 1) * Math.PI / 2 : p.t === 'E' ? (p.d - 1) * Math.PI / 2 : (p.r || 0) * Math.PI / 2;

  function glowLine(ctx, x0, y0, x1, y1, c, w, a) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(c, .1 * a); ctx.lineWidth = w * 2.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = rgba(c, .28 * a); ctx.lineWidth = w; ctx.stroke();
    ctx.strokeStyle = rgba(mix(c, .55), .85 * a); ctx.lineWidth = w * 0.4; ctx.stroke();
    ctx.strokeStyle = rgba([255, 255, 255], .9 * a); ctx.lineWidth = w * 0.15; ctx.stroke();
  }

  /* ------------------------------------------------------------- game state */
  const V = { cv: $('#board'), W: 0, H: 0, dpr: 1, cs: 40, ox: 0, oy: 0, lay: document.createElement('canvas'), sm: document.createElement('canvas'), anim: new Map(), parts: [], glow: new Map(), t: 0, hover: null };
  V.ctx = V.cv.getContext('2d'); V.lctx = V.lay.getContext('2d'); V.sctx = V.sm.getContext('2d');
  const bg = { cv: $('#bgc'), ctx: $('#bgc').getContext('2d') };
  let G = null, res = null, screen = 'title', last = 0, rng = C.mulberry32(7), hintAt = 0, rnd = 0;

  function resize() {
    V.dpr = Math.min(window.devicePixelRatio || 1, 2);
    V.W = V.cv.clientWidth; V.H = V.cv.clientHeight;
    [[V.cv, 1], [V.lay, 1], [V.sm, 0.25]].forEach(([c, k]) => { c.width = Math.max(2, Math.round(V.W * V.dpr * k)); c.height = Math.max(2, Math.round(V.H * V.dpr * k)); });
    bg.cv.width = Math.round(innerWidth * Math.min(V.dpr, 1.5)); bg.cv.height = Math.round(innerHeight * Math.min(V.dpr, 1.5));
    layout(); if (screen === 'map') buildMap(); trayRender();
  }
  function layout() {
    if (!G) return;
    const pad = 12; V.cs = Math.floor(Math.max(24, Math.min((V.W - pad * 2) / G.w, (V.H - pad * 2 - 22) / G.h)));
    V.ox = Math.round((V.W - V.cs * G.w) / 2); V.oy = Math.round((V.H - 22 - V.cs * G.h) / 2);
  }
  const cellOf = (px, py) => { const x = Math.floor((px - V.ox) / V.cs), y = Math.floor((py - V.oy) / V.cs); return x >= 0 && y >= 0 && x < G.w && y < G.h ? { x, y } : null; };
  const center = (x, y) => [V.ox + (x + 0.5) * V.cs, V.oy + (y + 0.5) * V.cs];

  const snap = () => JSON.stringify({ c: G.cells, t: G.tray });
  function restore(s) { const o = JSON.parse(s); G.cells = o.c; G.tray = o.t; if (G.sel >= G.tray.length) G.sel = -1; }
  function retrace() { res = C.trace(G.w, G.h, G.cells); }

  function start(mode, lv, meta) {
    G = { mode, lv, meta: meta || {}, w: lv.w, h: lv.h, cells: lv.cells.map(C.clonePiece), tray: lv.tray.map(C.clonePiece), hist: [], fut: [], solved: false, sel: -1, cur: { x: 0, y: 0 }, hint: null, tool: null };
    G.init = snap(); V.parts.length = 0; V.glow.clear(); V.anim.clear(); V.hover = null;
    document.body.classList.toggle('sandbox', mode === 'sandbox');
    $('#gChap').textContent = meta && meta.chap || ''; $('#gName').textContent = lv.name || ''; $('#tip').textContent = lv.tip || '';
    go('game'); layout(); retrace(); syncHud(); trayRender();
    G.lit = new Set(res.cr.filter(c => c.ok).map(c => c.i)); setHum(G.lit.size);
    G.cells.forEach(p => p && p.t === 'C' && V.glow.set(p.uid, G.lit.has(G.cells.indexOf(p)) ? 1 : 0));
  }
  function syncHud() {
    $('#gMoves').textContent = G.hist.length; $('#gPar').textContent = G.mode === 'sandbox' ? 'sandbox' : 'par ' + G.lv.par;
    $('[data-act=undo]').disabled = !G.hist.length; $('[data-act=redo]').disabled = !G.fut.length;
  }
  function commit(fn) {
    const before = snap(); fn(); G.hist.push(before); G.fut = []; G.hint = null; after();
  }
  function after() {
    retrace(); syncHud(); trayRender();
    const now = new Set(res.cr.filter(c => c.ok).map(c => c.i));
    let n = G.lit.size;
    now.forEach(i => { if (!G.lit.has(i)) { sfx.chime(n++); burst(i); } });
    G.lit.forEach(i => { if (!now.has(i)) sfx.dim(); });
    G.lit = now; setHum(now.size);
    if (res.ok && !G.solved && G.mode !== 'sandbox') { G.solved = true; setTimeout(winScreen, RM ? 100 : 1100); }
    if (G.mode === 'sandbox' && res.ok && !G.toasted) { G.toasted = true; toast('Every crystal is awake'); } else if (!res.ok) G.toasted = false;
  }
  function burst(i) {
    const p = G.cells[i], c = maskRGB(p.c), [cx, cy] = center(i % G.w, (i / G.w) | 0);
    if (RM) return;
    for (let k = 0; k < 16; k++) { const a = rng() * TAU, v = 60 + rng() * 170; V.parts.push({ k: 'shard', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 0, m: 0.9 + rng() * 0.5, c: mix(c, .3), z: V.cs * (0.05 + rng() * 0.07), r: rng() * TAU, vr: (rng() - 0.5) * 12 }); }
    V.parts.push({ k: 'ring', x: cx, y: cy, l: 0, m: 0.8, c, z: V.cs });
  }

  /* ----------------------------------------------------------------- actions */
  function rotate(i, d) {
    const p = G.cells[i]; if (!p) return;
    if (G.mode === 'sandbox' && p.t === 'E') { commit(() => { p.d = (p.d + d + 4) & 3; }); sfx.rotate(); return; }
    if (!C.isRotatable(p)) { sfx.nope(); if (p.fx) toast('That piece is fixed'); return; }
    commit(() => { p.r = (p.r + d + 4) & 3; }); sfx.rotate();
  }
  function placeSel(i) {
    if (G.sel < 0 || G.cells[i] || G.lv.w == null) return;
    if (G.mode === 'sandbox') { sbxPlace(i); return; }
    const idx = G.sel; commit(() => { const p = G.tray.splice(idx, 1)[0]; G.cells[i] = p; }); G.sel = -1; sfx.place(); trayRender();
  }
  function remove(i) {
    const p = G.cells[i];
    if (!p) return;
    if (G.mode === 'sandbox') { commit(() => { G.cells[i] = null; }); fixPortals(); after(); sfx.dim(); return; }
    if (p.src !== 'inv') { sfx.nope(); return; }
    commit(() => { G.cells[i] = null; G.tray.push(p); }); sfx.place();
  }
  function moveTo(from, to) {
    if (G.cells[to] || from === to) return;
    commit(() => { G.cells[to] = G.cells[from]; G.cells[from] = null; }); sfx.place();
  }
  function undo() { if (!G || !G.hist.length || G.solved) return; G.fut.push(snap()); restore(G.hist.pop()); G.hint = null; after(); sfx.rotate(); }
  function redo() { if (!G || !G.fut.length || G.solved) return; G.hist.push(snap()); restore(G.fut.pop()); after(); sfx.rotate(); }
  function reset() { if (!G) return; restore(G.init); G.hist = []; G.fut = []; G.solved = false; G.hint = null; G.sel = -1; $('#win').classList.remove('on'); after(); closeOverlays(); }
  function hint() {
    if (!G || G.solved || G.mode === 'sandbox') return;
    const r = C.solve({ w: G.w, h: G.h, cells: G.cells, tray: G.tray }, { ms: 1500 });
    const act = r.solved && r.moves[0];
    if (!act) { toast('Try taking a placed piece back to the tray, then ask again'); return; }
    const x = act.cell % G.w, y = (act.cell / G.w) | 0;
    if (act.k === 'place') { const t = G.tray[act.slot]; G.hint = { x, y, piece: t, at: performance.now() }; toast('Place a ' + NAMES[t.t].toLowerCase() + ' here'); G.sel = act.slot; trayRender(); }
    else { G.hint = { x, y, at: performance.now() }; toast('Turn this ' + NAMES[act.t].toLowerCase()); }
    G.cur = { x, y }; sfx.hint();
  }

  /* --------------------------------------------------------------------- tray */
  const PALETTE = ['Er', 'Eg', 'Eb', 'Ew', 'M0', 'S0', 'P1', 'Fr', 'Fg', 'Fb', 'Fy', 'Fc', 'Fm', 'O0', '#', 'x', 'Cr', 'Cg', 'Cb', 'Cy', 'Cc', 'Cm', 'Cw', 'Cw2'];
  function tokenFix(t) { return t[0] === 'E' ? 'E1' + t[1] : t; }
  function trayRender() {
    const box = $('#tray'); box.innerHTML = '';
    if (!G) return;
    let items;
    if (G.mode === 'sandbox') items = PALETTE.map((t, i) => ({ p: C.parseToken(tokenFix(t)).p, i, erase: false })).concat([{ erase: true, i: -2 }]);
    else items = G.tray.map((p, i) => ({ p, i }));
    box.dataset.empty = G.mode === 'sandbox' ? '' : 'Tray empty';
    const seen = {};
    items.forEach(it => {
      const key = it.erase ? 'erase' : it.p.t + (it.p.c || '') + (it.p.id || '');
      if (G.mode !== 'sandbox') { if (seen[key]) { seen[key].n++; seen[key].el.querySelector('i').textContent = '×' + seen[key].n; return; } }
      const b = document.createElement('button'); b.className = 'slot'; b.setAttribute('aria-label', it.erase ? 'Eraser' : NAMES[it.p.t] + (it.p.c ? ' ' + C.LETTER[it.p.c] : ''));
      const cv = document.createElement('canvas'); cv.width = cv.height = 104; const x = cv.getContext('2d');
      if (it.erase) { x.strokeStyle = '#ff6b8a'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(28, 28); x.lineTo(76, 76); x.moveTo(76, 28); x.lineTo(28, 76); x.stroke(); }
      else drawPiece(x, it.p, 52, 52, 96, angleOf(it.p), { g: 0.6 });
      b.appendChild(cv); const badge = document.createElement('i'); b.appendChild(badge);
      if (G.mode === 'sandbox' ? G.tool === it.i : G.sel === it.i) b.classList.add('sel');
      if (G.hint && G.hint.piece && G.mode !== 'sandbox' && G.tray[G.sel] === it.p) b.classList.add('hint');
      b.dataset.idx = it.i; box.appendChild(b); if (!it.erase) seen[key] = { n: 1, el: b };
    });
  }
  const trayDown = { };
  $('#tray').addEventListener('pointerdown', e => {
    const b = e.target.closest('.slot'); if (!b || !G) return; audio();
    const idx = +b.dataset.idx; trayDown.idx = idx; trayDown.x = e.clientX; trayDown.y = e.clientY; trayDown.moved = false; trayDown.b = b;
    e.preventDefault();
  });
  window.addEventListener('pointermove', e => {
    if (trayDown.b && !trayDown.moved && Math.hypot(e.clientX - trayDown.x, e.clientY - trayDown.y) > 8 && G.mode !== 'sandbox') {
      trayDown.moved = true; const gh = trayDown.b.querySelector('canvas').cloneNode(true); gh.getContext('2d').drawImage(trayDown.b.querySelector('canvas'), 0, 0); gh.className = 'ghostp'; document.body.appendChild(gh); trayDown.ghost = gh; G.sel = trayDown.idx;
    }
    if (trayDown.ghost) { trayDown.ghost.style.left = e.clientX + 'px'; trayDown.ghost.style.top = e.clientY + 'px'; hoverAt(e); }
    if (drag) { drag.moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8; hoverAt(e); }
    else if (!trayDown.ghost && G && screen === 'game' && e.target === V.cv) hoverAt(e);
    if (paint && G.tool != null) { const c = cellAt(e); if (c && !G.cells[c.y * G.w + c.x]) sbxPlace(c.y * G.w + c.x, true); }
  });
  window.addEventListener('pointerup', e => {
    if (trayDown.b) {
      const c = trayDown.ghost ? cellAt(e) : null;
      if (trayDown.ghost) { trayDown.ghost.remove(); if (c && !G.cells[c.y * G.w + c.x]) placeSel(c.y * G.w + c.x); else G.sel = -1; }
      else if (G.mode === 'sandbox') { G.tool = G.tool === trayDown.idx ? null : trayDown.idx; G.sel = -1; }
      else G.sel = G.sel === trayDown.idx ? -1 : trayDown.idx;
      trayDown.b = null; trayDown.ghost = null; V.hover = null; trayRender();
    }
    if (drag) {
      const c = cellAt(e), d = drag; drag = null; V.hover = null;
      if (d.moved) { if (c && !G.cells[c.y * G.w + c.x]) moveTo(d.i, c.y * G.w + c.x); else if (!c) remove(d.i); }
      else if (d.btn !== 2) clickCell(d.i);
    }
    paint = false;
  });
  function cellAt(e) { const r = V.cv.getBoundingClientRect(); return cellOf(e.clientX - r.left, e.clientY - r.top); }
  function hoverAt(e) { const c = cellAt(e); V.hover = c; if (c) G.cur = c; }

  /* --------------------------------------------------------------- board input */
  let drag = null, paint = false;
  V.cv.addEventListener('contextmenu', e => e.preventDefault());
  V.cv.addEventListener('pointerdown', e => {
    audio(); if (!G || (G.solved && G.mode !== 'sandbox')) return;
    const c = cellAt(e); if (!c) return; const i = c.y * G.w + c.x; G.cur = c; V.cv.focus({ preventScroll: true });
    if (e.button === 2) { rotate(i, -1); return; }
    const p = G.cells[i];
    if (G.mode === 'sandbox' && G.tool != null) { sbxPlace(i); paint = true; return; }
    if (p && p.src === 'inv' || (G.mode === 'sandbox' && p)) { drag = { i, x: e.clientX, y: e.clientY, moved: false, btn: e.button }; V.cv.setPointerCapture(e.pointerId); return; }
    clickCell(i);
  });
  function clickCell(i) {
    const p = G.cells[i];
    if (!p) { if (G.sel >= 0) placeSel(i); return; }
    rotate(i, 1);
  }

  /* --------------------------------------------------------------- sandbox */
  function fixPortals() { let n = 0; G.cells.forEach(p => { if (p && p.t === 'O') p.id = Math.floor(n++ / 2) % 10; }); }
  function sbxPlace(i, quiet) {
    if (G.tool === -2) { if (G.cells[i]) remove(i); return; }
    const tpl = C.parseToken(tokenFix(PALETTE[G.tool])).p, cur = G.cells[i];
    if (cur && cur.t === 'E' && tpl.t === 'E') { rotate(i, 1); return; }
    if (cur && !quiet) { G.cells[i] = null; }
    commit(() => { tpl.src = 'sbx'; G.cells[i] = tpl; fixPortals(); }); sfx.place();
  }
  function exportCode() {
    $('#dKicker').textContent = 'Share code'; $('#dTitle').textContent = 'Export'; $('#dText').value = C.toCode(G.w, G.h, G.cells, []); $('#dText').readOnly = true;
    $('#dGo').textContent = 'Copy'; $('#dGo').dataset.mode = 'copy'; $('#dMsg').textContent = 'Paste this into Import on any copy of Prism.'; openOv('#dlg');
  }
  function importCode() {
    $('#dKicker').textContent = 'Share code'; $('#dTitle').textContent = 'Import'; $('#dText').value = ''; $('#dText').readOnly = false;
    $('#dGo').textContent = 'Load'; $('#dGo').dataset.mode = 'load'; $('#dMsg').textContent = 'Paste a code starting with PRISM1.'; openOv('#dlg'); $('#dText').focus();
  }
  function dlgGo() {
    if ($('#dGo').dataset.mode === 'copy') {
      $('#dText').select(); let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* fall through */ }
      try { navigator.clipboard.writeText($('#dText').value); ok = true; } catch (e) { /* ignore */ }
      $('#dMsg').textContent = ok ? 'Copied to the clipboard.' : 'Select the text and copy it manually.'; return;
    }
    try {
      const lv = C.fromCode($('#dText').value); lv.name = 'Shared level'; lv.tip = 'Loaded from a share code.';
      closeOverlays(); start('sandbox', lv, { chap: 'Sandbox' }); toast('Code loaded');
    } catch (e) { $('#dMsg').textContent = 'That is not a valid PRISM code.'; }
  }

  /* ------------------------------------------------------------------ keyboard */
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape') closeOverlays(); return; }
    const k = e.key.toLowerCase();
    if (k === 'm') { setMute(!save.mute); return; }
    if (k === '?' || (k === '/' && e.shiftKey)) { openOv('#help'); return; }
    if (k === 'escape') { if (document.querySelector('.overlay.on')) closeOverlays(); else if (screen === 'game') openOv('#pause'); return; }
    if (screen !== 'game' || !G || document.querySelector('.overlay.on')) return;
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
    if (G.solved && G.mode !== 'sandbox') return;
    const i = G.cur.y * G.w + G.cur.x, mv = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] }[k];
    if (mv) { e.preventDefault(); G.cur = { x: Math.max(0, Math.min(G.w - 1, G.cur.x + mv[0])), y: Math.max(0, Math.min(G.h - 1, G.cur.y + mv[1])) }; V.hover = null; return; }
    if (k === ' ' || k === 'enter') { if (document.activeElement && document.activeElement !== V.cv && document.activeElement.tagName === 'BUTTON') return; e.preventDefault(); if (G.cells[i]) rotate(i, 1); else if (G.mode === 'sandbox' && G.tool != null) sbxPlace(i); else if (G.sel >= 0) placeSel(i); else if (G.tray.length) { G.sel = 0; placeSel(i); } }
    else if (k === 'q') rotate(i, -1); else if (k === 'e') rotate(i, 1);
    else if (k === 'delete' || k === 'backspace' || k === 'x') remove(i);
    else if (k === 'h') hint(); else if (k === 'r') reset();
    else if (/^[1-9]$/.test(k) && G.mode !== 'sandbox') { G.sel = Math.min(+k - 1, G.tray.length - 1); trayRender(); }
  });

  /* ---------------------------------------------------------------- rendering */
  function drawGame(dt, t) {
    const ctx = V.ctx, lc = V.lctx, s = V.cs, W = V.W, H = V.H, d = V.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
    lc.setTransform(d, 0, 0, d, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, W, H);
    // board
    const bx = V.ox, by = V.oy, bw = s * G.w, bh = s * G.h;
    rrect(ctx, bx - 8, by - 8, bw + 16, bh + 16, 18);
    const bgG = ctx.createLinearGradient(0, by, 0, by + bh); bgG.addColorStop(0, '#0d0d13'); bgG.addColorStop(1, '#08080c');
    ctx.fillStyle = bgG; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.11)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.beginPath();
    for (let x = 1; x < G.w; x++) { ctx.moveTo(bx + x * s + .5, by); ctx.lineTo(bx + x * s + .5, by + bh); }
    for (let y = 1; y < G.h; y++) { ctx.moveTo(bx, by + y * s + .5); ctx.lineTo(bx + bw, by + y * s + .5); }
    ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.1)';
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (!G.cells[y * G.w + x]) { ctx.beginPath(); ctx.arc(bx + (x + .5) * s, by + (y + .5) * s, 1.3, 0, TAU); ctx.fill(); }
    const sheen = ctx.createLinearGradient(bx, by, bx + bw, by + bh); sheen.addColorStop(0, 'rgba(255,255,255,.05)'); sheen.addColorStop(.4, 'rgba(255,255,255,0)');
    rrect(ctx, bx - 8, by - 8, bw + 16, bh + 16, 18); ctx.fillStyle = sheen; ctx.fill();
    // beams (on the light layer, then bloomed)
    if (res) {
      let len = 0;
      for (const r of res.runs) {
        const c = [Math.min(255, r.r * PRIM[0][0] + r.g * PRIM[1][0] + r.b * PRIM[2][0]), Math.min(255, r.r * PRIM[0][1] + r.g * PRIM[1][1] + r.b * PRIM[2][1]), Math.min(255, r.r * PRIM[0][2] + r.g * PRIM[1][2] + r.b * PRIM[2][2])];
        const mxc = Math.max(c[0], c[1], c[2], 1), cc = [c[0] / mxc * 255, c[1] / mxc * 255, c[2] / mxc * 255];
        const inten = Math.min(1, Math.max(r.r, r.g, r.b)), x0 = bx + r.x0 * s, y0 = by + r.y0 * s, x1 = bx + r.x1 * s, y1 = by + r.y1 * s;
        lc.globalCompositeOperation = 'lighter'; glowLine(lc, x0, y0, x1, y1, cc, s * 0.2 * (0.55 + 0.45 * inten), 0.35 + 0.65 * inten);
        const L = Math.hypot(x1 - x0, y1 - y0); len += L;
        if (!RM) { // energy pulses travelling along the beam
          lc.setLineDash([s * 0.12, s * 0.88]); lc.lineDashOffset = -t * s * 1.6 + r.d * 7; lc.strokeStyle = 'rgba(255,255,255,.75)'; lc.lineWidth = s * 0.05; lc.lineCap = 'butt';
          lc.beginPath(); lc.moveTo(x0, y0); lc.lineTo(x1, y1); lc.stroke(); lc.setLineDash([]);
          if (V.parts.length < 380 && rng() < dt * L / s * 5) { const f = rng(); V.parts.push({ k: 'mote', x: x0 + (x1 - x0) * f + (rng() - .5) * s * .18, y: y0 + (y1 - y0) * f + (rng() - .5) * s * .18, vx: (rng() - .5) * 10, vy: (rng() - .5) * 10 - 4, l: 0, m: 0.7 + rng(), c: mix(cc, .4), z: 0.8 + rng() * 1.1 }); }
        }
      }
      for (const h of res.hits) {
        const [cx, cy] = center(h.x, h.y), mx = Math.max(h.col[0], h.col[1], h.col[2], .01);
        const col = [Math.min(255, h.col[0] * PRIM[0][0] + h.col[1] * PRIM[1][0] + h.col[2] * PRIM[2][0]), Math.min(255, h.col[0] * PRIM[0][1] + h.col[1] * PRIM[1][1] + h.col[2] * PRIM[2][1]), Math.min(255, h.col[0] * PRIM[0][2] + h.col[1] * PRIM[1][2] + h.col[2] * PRIM[2][2])];
        const g = lc.createRadialGradient(cx, cy, 0, cx, cy, s * 0.45); g.addColorStop(0, rgba(mix(col, .4), .55 * Math.min(1, mx))); g.addColorStop(1, rgba(col, 0));
        lc.globalCompositeOperation = 'lighter'; lc.fillStyle = g; lc.fillRect(cx - s, cy - s, s * 2, s * 2);
        if (!RM && V.parts.length < 380 && rng() < dt * 9) { const a = rng() * TAU, v = 50 + rng() * 90; V.parts.push({ k: 'spark', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 0, m: 0.3 + rng() * 0.25, c: mix(col, .5), z: 1.4 }); }
      }
    }
    // pieces
    const hv = G.hint;
    G.cells.forEach((p, i) => {
      if (!p) return;
      const x = i % G.w, y = (i / G.w) | 0, [cx, cy] = center(x, y);
      let a = V.anim.get(p.uid); const want = angleOf(p);
      if (!a) { a = { ang: want, pop: RM ? 1 : 0 }; V.anim.set(p.uid, a); }
      let df = ((want - a.ang + Math.PI * 3) % TAU) - Math.PI; a.ang = RM ? want : a.ang + df * Math.min(1, dt * 16);
      a.pop += (1 - a.pop) * Math.min(1, dt * 12);
      let o = { t, a: drag && drag.moved && drag.i === i ? 0.25 : 1 };
      if (p.t === 'C') {
        const ok = res.cr.find(c => c.i === i), tg = ok && ok.ok ? 1 : 0; let g = V.glow.get(p.uid) || 0; g += (tg - g) * Math.min(1, dt * (tg ? 7 : 4)); V.glow.set(p.uid, g);
        o.g = g * (0.88 + 0.12 * Math.sin(t * 3 + i)); o.tint = ok && ok.any && !ok.ok ? maskRGB(ok.got || 7).map(v => v * .8) : null;
        if (g > 0.03) { const c = maskRGB(p.c), gr = lc.createRadialGradient(cx, cy, 0, cx, cy, s * 0.9); gr.addColorStop(0, rgba(mix(c, .3), .75 * g)); gr.addColorStop(.35, rgba(c, .3 * g)); gr.addColorStop(1, rgba(c, 0)); lc.globalCompositeOperation = 'lighter'; lc.fillStyle = gr; lc.fillRect(cx - s, cy - s, s * 2, s * 2); }
      }
      const sc = 0.6 + 0.4 * Math.min(1.12, a.pop * (1 + Math.sin(a.pop * 3.14) * 0.15));
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      drawPiece(ctx, p, cx, cy, s, a.ang, o); ctx.restore();
    });
    // composite light: sharp layer + two blurred downscales (cheap bloom)
    V.sctx.setTransform(1, 0, 0, 1, 0, 0); V.sctx.clearRect(0, 0, V.sm.width, V.sm.height); V.sctx.imageSmoothingQuality = 'high';
    V.sctx.drawImage(V.lay, 0, 0, V.sm.width, V.sm.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(V.lay, 0, 0); ctx.globalAlpha = 0.9; ctx.drawImage(V.sm, 0, 0, V.cv.width, V.cv.height);
    ctx.globalAlpha = 0.5; ctx.drawImage(V.sm, -V.cv.width * .01, -V.cv.height * .01, V.cv.width * 1.02, V.cv.height * 1.02);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setTransform(d, 0, 0, d, 0, 0);
    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (let k = V.parts.length - 1; k >= 0; k--) {
      const q = V.parts[k]; q.l += dt; if (q.l > q.m) { V.parts.splice(k, 1); continue; }
      const f = 1 - q.l / q.m;
      if (q.k === 'ring') { ctx.strokeStyle = rgba(q.c, f * .8); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, q.z * (0.3 + (1 - f) * 1.3), 0, TAU); ctx.stroke(); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; if (q.k !== 'mote') { q.vx *= 0.97; q.vy *= 0.97; }
      if (q.k === 'shard') { q.r += q.vr * dt; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.fillStyle = rgba(q.c, f * .9); ctx.beginPath(); ctx.moveTo(0, -q.z); ctx.lineTo(q.z * .7, q.z * .6); ctx.lineTo(-q.z * .7, q.z * .6); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else { ctx.fillStyle = rgba(q.c, f * (q.k === 'mote' ? .65 : .95)); ctx.beginPath(); ctx.arc(q.x, q.y, q.z, 0, TAU); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    // cursor, hover preview, hint
    const cur = G.cur, [ccx, ccy] = center(cur.x, cur.y), h = s * 0.46;
    if (document.activeElement === V.cv || V.hover) {
      ctx.strokeStyle = 'rgba(224,139,255,.9)'; ctx.lineWidth = 2; const l = s * 0.16;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { ctx.beginPath(); ctx.moveTo(ccx + sx * h, ccy + sy * (h - l)); ctx.lineTo(ccx + sx * h, ccy + sy * h); ctx.lineTo(ccx + sx * (h - l), ccy + sy * h); ctx.stroke(); });
    }
    const pv = V.hover && !G.cells[V.hover.y * G.w + V.hover.x] ? (trayDown.ghost || G.sel >= 0 ? G.tray[G.sel] : G.mode === 'sandbox' && G.tool >= 0 && G.tool != null ? C.parseToken(tokenFix(PALETTE[G.tool])).p : null) : null;
    if (pv) { const [px, py] = center(V.hover.x, V.hover.y); drawPiece(ctx, pv, px, py, s, angleOf(pv), { a: 0.5, t }); }
    if (hv) {
      const [hx, hy] = center(hv.x, hv.y), k = (Math.sin(t * 5) + 1) / 2;
      if (hv.piece) drawPiece(ctx, hv.piece, hx, hy, s, angleOf(hv.piece), { a: 0.35 + 0.3 * k, t });
      ctx.strokeStyle = 'rgba(224,139,255,' + (0.5 + 0.5 * k) + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hx, hy, s * (0.46 + 0.08 * k), 0, TAU); ctx.stroke();
    }
  }

  /* title background: white light enters a prism and fans into R, G, B, forever */
  function drawTitle(t) {
    const c = bg.cv, x = bg.ctx, W = c.width, H = c.height, u = Math.min(W, H) / 900 * (W < H ? 1.6 : 1);
    x.globalCompositeOperation = 'source-over'; x.fillStyle = '#07070a'; x.fillRect(0, 0, W, H);
    const gr = x.createRadialGradient(W * .7, H * .5, 0, W * .7, H * .5, Math.max(W, H) * .7); gr.addColorStop(0, 'rgba(120,60,200,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    const px = W * (W < H ? .5 : .68), py = H * (W < H ? .72 : .5), sway = RM ? 0 : Math.sin(t * .5) * .05;
    x.globalCompositeOperation = 'lighter';
    glowLine(x, -20, py + 70 * u + Math.sin(t * .4) * 10 * u, px - 70 * u, py + 8 * u, [255, 255, 255], 16 * u, .9);
    [[-0.34, PRIM[0]], [-.06, PRIM[1]], [.26, PRIM[2]]].forEach(([a, col], k) => {
      const ang = a + sway * (k - 1) * 2 - .05, len = Math.max(W, H) * 1.3;
      glowLine(x, px + 55 * u, py, px + 55 * u + Math.cos(ang) * len, py + Math.sin(ang) * len, col, 14 * u, .75);
    });
    x.globalCompositeOperation = 'source-over';
    x.beginPath(); x.moveTo(px - 70 * u, py - 100 * u); x.lineTo(px - 70 * u, py + 100 * u); x.lineTo(px + 75 * u, py); x.closePath();
    const pg = x.createLinearGradient(px - 70 * u, 0, px + 75 * u, 0); pg.addColorStop(0, 'rgba(255,255,255,.22)'); pg.addColorStop(1, 'rgba(180,140,255,.06)'); x.fillStyle = pg; x.fill();
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2 * u + 1; x.lineJoin = 'round'; x.stroke();
    // a few drifting motes
    x.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 40; k++) { const fx = (Math.sin(k * 12.9 + t * .05 * (1 + k % 3)) * .5 + .5), fy = (Math.sin(k * 7.3 + t * .07) * .5 + .5); x.fillStyle = 'rgba(255,255,255,' + (0.1 + (k % 5) * .04) + ')'; x.fillRect(fx * W, fy * H, 2, 2); }
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts; if (document.hidden) return;
    if (screen === 'game' && G) drawGame(dt, ts / 1000);
    else if (screen === 'title' || screen === 'map') drawTitle(ts / 1000);
  }

  /* ------------------------------------------------------------------ screens */
  function go(name) {
    screen = name; $$('.screen').forEach(s => s.classList.toggle('on', s.id === name));
    bg.cv.style.opacity = name === 'game' ? 0 : name === 'map' ? 0.35 : 1;
    if (name === 'map') buildMap(); if (name === 'title') titleMeta();
    if (name !== 'game') { document.body.classList.remove('sandbox'); setHum(0); }
    closeOverlays(); if (name === 'game') requestAnimationFrame(() => { resize(); });
  }
  const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
  function titleMeta() {
    const done = Object.keys(save.stars).length; $('#mPlay').textContent = done ? done + ' / ' + LV.count + ' complete' : LV.count + ' levels';
    const key = C.dailyKey(new Date()), dd = save.daily[key];
    $('#mDaily').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (dd ? '  done' : '');
  }
  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 1.5l2.6 8.4 8.4 2.1-8.4 2.1L12 22.5l-2.6-8.4L1 12l8.4-2.1z"/></svg>';
  function buildMap() {
    const wide = innerWidth / innerHeight > 1.05, VW = wide ? 1200 : 520, VH = wide ? 520 : 1040;
    const OFF = [[-95, 35], [-45, -45], [15, 15], [70, -55], [115, 25], [45, 80]];
    const nodes = [];
    let svg = '<svg viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Levels"><defs><filter id="gl"><feGaussianBlur stdDeviation="3.2"/></filter></defs>';
    for (let c = 0; c < 4; c++) {
      const cx = wide ? 150 + c * 300 : 260, cy = wide ? 290 : 150 + c * 250, sx = wide ? 1 : 1.25;
      const ch = LV.CHAPTERS[c];
      svg += '<text class="chap" x="' + (cx - 120 * sx) + '" y="' + (cy - (wide ? 190 : 100)) + '">' + ch.roman + '. ' + ch.name + '</text><text class="chapb" x="' + (cx - 120 * sx) + '" y="' + (cy - (wide ? 168 : 78)) + '">' + ch.blurb + '</text>';
      for (let k = 0; k < 6; k++) nodes.push({ i: c * 6 + k, x: cx + OFF[k][0] * sx, y: cy + OFF[k][1] });
    }
    for (let i = 1; i < nodes.length; i++) { const a = nodes[i - 1], b = nodes[i], cross = i % 6 === 0; svg += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="rgba(255,255,255,' + (cross ? .07 : .2) + ')" stroke-width="1"' + (cross ? ' stroke-dasharray="3 6"' : '') + '/>'; }
    let nextSet = false;
    nodes.forEach(n => {
      const st = save.stars[n.i + 1] || 0, nx = !st && !nextSet; if (nx) nextSet = true;
      svg += '<g class="node' + (st ? ' done' : '') + (nx ? ' next' : '') + '" data-lv="' + n.i + '" tabindex="0" role="button" aria-label="Level ' + (n.i + 1) + ', ' + LV.LEVELS[n.i].def.name + (st ? ', ' + st + ' stars' : '') + '">';
      if (st) svg += '<circle cx="' + n.x + '" cy="' + n.y + '" r="15" fill="#c04bff" opacity=".55" filter="url(#gl)"/>';
      svg += '<circle class="ring" cx="' + n.x + '" cy="' + n.y + '" r="12" fill="none" stroke="#e08bff" opacity="0"/><circle class="c" cx="' + n.x + '" cy="' + n.y + '" r="14"/><text x="' + n.x + '" y="' + (n.y + 4) + '">' + (n.i + 1) + '</text>';
      for (let s = 0; s < 3; s++) svg += '<path d="M' + (n.x - 12 + s * 12) + ' ' + (n.y + 22) + 'l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="' + (s < st ? '#e08bff' : 'rgba(255,255,255,.14)') + '"/>';
      svg += '<text class="nm" x="' + n.x + '" y="' + (n.y - 22) + '">' + LV.LEVELS[n.i].def.name + '</text></g>';
    });
    $('#mapsvg').innerHTML = svg + '</svg>'; $('#starTotal').innerHTML = STAR + ' ' + totalStars() + ' / ' + LV.count * 3;
  }
  $('#mapsvg').addEventListener('click', e => { const n = e.target.closest('.node'); if (n) { audio(); playLevel(+n.dataset.lv); } });
  $('#mapsvg').addEventListener('keydown', e => { const n = e.target.closest('.node'); if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); audio(); playLevel(+n.dataset.lv); } });

  function playLevel(i) { start('level', LV.build(i), { i, chap: 'Chapter ' + LV.CHAPTERS[LV.LEVELS[i].chapter].roman + '  -  Level ' + (i + 1) }); }
  function playDaily() {
    const key = C.dailyKey(new Date()), lv = C.generate('prism-daily-' + key, C.DAILY_OPTS);
    lv.name = 'Daily puzzle'; lv.tip = 'Seeded by today\'s date: everyone gets the same board. Generated in reverse, so it is always solvable.';
    start('daily', lv, { key, chap: key });
  }
  function playEndless() {
    const lv = C.generate('endless-' + Math.floor(Math.random() * 1e9) + '-' + rnd, C.endlessOpts(rnd));
    lv.name = 'Endless  ' + (rnd + 1); lv.tip = 'A fresh generated puzzle every time. They get harder as you go.'; start('random', lv, { chap: 'Endless' });
  }
  function playSandbox() {
    const cells = new Array(9 * 7).fill(null);
    cells[3 * 9 + 0] = C.piece('E', { d: 1, c: 7 }); cells[3 * 9 + 2] = C.piece('P', { r: 1, fx: false, src: 'sbx' }); cells[1 * 9 + 2] = C.piece('C', { c: 1, n: 1, pw: false }); cells[3 * 9 + 5] = C.piece('C', { c: 2, n: 1, pw: false }); cells[5 * 9 + 2] = C.piece('C', { c: 4, n: 1, pw: false });
    start('sandbox', { name: 'Sandbox', tip: 'Pick a piece, click cells to place it. Drag to move. Export makes a share code.', w: 9, h: 7, cells, tray: [], par: 0 }, { chap: 'Free build' });
  }

  function winScreen() {
    if (!G || !G.solved) return;
    const m = G.hist.length, par = G.lv.par, st = LV.starsFor(m, par);
    sfx.win();
    if (G.mode === 'level') { const id = G.meta.i + 1; save.stars[id] = Math.max(save.stars[id] || 0, st); save.best[id] = Math.min(save.best[id] || 999, m); }
    if (G.mode === 'daily') save.daily[G.meta.key] = { moves: m, stars: st };
    persist();
    $('#wKicker').textContent = G.mode === 'level' ? G.meta.chap : G.mode === 'daily' ? 'Daily puzzle' : 'Endless';
    $('#wName').textContent = G.lv.name; $('#wSub').textContent = m + ' moves  -  par ' + par;
    $('#wStars').innerHTML = [0, 1, 2].map(k => STAR.replace('<svg', '<svg class="' + (k < st ? 'on' : '') + '" style="--d:' + (0.25 + k * 0.22) + 's"')).join('');
    $('#wNext').textContent = G.mode === 'level' && G.meta.i + 1 >= LV.count ? 'Finish' : 'Next';
    openOv('#win');
  }
  function next() {
    const sweep = $('#sweep'); sweep.classList.remove('go'); void sweep.offsetWidth; if (!RM) sweep.classList.add('go');
    setTimeout(() => {
      closeOverlays();
      if (G.mode === 'level') { G.meta.i + 1 < LV.count ? playLevel(G.meta.i + 1) : go('map'); }
      else if (G.mode === 'random') { rnd++; playEndless(); } else go('title');
    }, RM ? 0 : 420);
  }

  /* ------------------------------------------------------------------ overlays */
  function openOv(id) { $$('.overlay').forEach(o => o.classList.remove('on')); $(id).classList.add('on'); const b = $(id).querySelector('button'); if (b && id !== '#dlg') b.focus(); }
  function closeOverlays() { $$('.overlay').forEach(o => o.classList.remove('on')); if (screen === 'game') V.cv.focus({ preventScroll: true }); }
  let toastT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go],[data-act]'); if (!b) return; audio();
    if (b.dataset.go) {
      const g = b.dataset.go;
      if (g === 'daily') playDaily(); else if (g === 'endless') { rnd = 0; playEndless(); } else if (g === 'sandbox') playSandbox(); else go(g);
      return;
    }
    switch (b.dataset.act) {
      case 'mute': setMute(!save.mute); break; case 'undo': undo(); break; case 'redo': redo(); break; case 'hint': hint(); break;
      case 'reset': reset(); break; case 'back': go(G && G.mode === 'level' ? 'map' : 'title'); break; case 'pause': openOv('#pause'); break;
      case 'resume': closeOverlays(); break; case 'help': openOv('#help'); break; case 'closehelp': closeOverlays(); break;
      case 'next': next(); break; case 'replay': reset(); break; case 'export': exportCode(); break; case 'import': importCode(); break;
      case 'clear': commit(() => { G.cells.fill(null); }); break; case 'dgo': dlgGo(); break; case 'dclose': closeOverlays(); break;
    }
  });

  /* ------------------------------------------------------------------- boot */
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : AC.resume(); });
  document.body.classList.toggle('muted', save.mute); $('#sndState').textContent = save.mute ? 'off' : 'on';
  resize(); titleMeta(); requestAnimationFrame(frame);
  // test hooks (used by tests/ui-play.mjs)
  window.PrismDebug = { state: () => G, res: () => res, cellXY: (x, y) => { const r = V.cv.getBoundingClientRect(), c = center(x, y); return [r.left + c[0], r.top + c[1]]; }, play: playLevel, daily: playDaily, sandbox: playSandbox, save, screen: () => screen };
})();
