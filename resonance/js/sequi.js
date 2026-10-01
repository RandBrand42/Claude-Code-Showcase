/* RESONANCE - sequi.js
 * Sequencer UI: header controls, LED step grid with edit lanes, piano-roll pitch editor, Euclid popover.
 */
(function () {
  'use strict';
  const R = window.R, P = R.P, U = R.util, ui = R.ui, song = R.song;
  const { $, $$, el } = ui;
  const LANES = ['STEP', 'VEL', 'GATE', 'PROB', 'RATCH', 'SLIDE', 'ACCENT'];
  const view = { lane: 0, track: 'mel', play: -1, euc: { hits: 5, rot: 0 } };
  const NAMES = { mel: 'MELODY', kick: 'KICK', snare: 'SNARE', chat: 'C.HAT', ohat: 'O.HAT', clap: 'CLAP', tom: 'TOM/RIM' };
  const stepsN = () => R.STEPS[P.steps];
  const cur = () => song.pats[song.cur];
  const rowArr = (t) => (t === 'mel' ? cur().mel : cur().drums[t]);

  /* ---------- header ---------- */
  const head = $('#seqHead');
  head.innerHTML =
    '<div class="sh-group"><span class="silk">PATTERN</span><div class="seg" id="patSeg" role="radiogroup" aria-label="Pattern slot"></div></div>' +
    '<div class="sh-group"><div data-select="chain"></div></div>' +
    '<div class="sh-group"><span class="silk">STEPS</span><div data-seg="steps"></div></div>' +
    '<div class="sh-group"><div data-select="scale"></div></div><div class="sh-group"><div data-select="root"></div></div>' +
    '<div class="sh-group"><span class="silk">&nbsp;</span><div data-toggle="lock" data-label="SCALE LOCK"></div></div>' +
    '<div class="sh-group"><div data-select="chord"></div></div>' +
    '<div class="sh-group"><span class="silk">OCTAVE</span><div class="stepper"><button type="button" id="octM" aria-label="Melody octave down">&minus;</button><output id="octV">0</output><button type="button" id="octP" aria-label="Melody octave up">+</button></div></div>' +
    '<div class="sh-group"><span class="silk">EDIT LANE</span><div class="seg dense" id="laneSeg" role="radiogroup" aria-label="Edit lane"></div></div>' +
    '<div class="sh-group tools"><button class="btn sm" id="bRndM" type="button"><svg class="ico"><use href="#i-dice"/></svg><span>MELODY</span></button>' +
    '<button class="btn sm" id="bRndD" type="button"><svg class="ico"><use href="#i-dice"/></svg><span>DRUMS</span></button>' +
    '<button class="btn sm" id="bEuc" type="button" aria-haspopup="true"><svg class="ico"><use href="#i-euclid"/></svg><span>EUCLID</span></button>' +
    '<button class="btn sm" id="bCopy" type="button"><svg class="ico"><use href="#i-copy"/></svg><span>COPY</span></button>' +
    '<button class="btn sm" id="bClear" type="button"><svg class="ico"><use href="#i-trash"/></svg><span>CLEAR</span></button></div>';
  ui.hydrate(head);

  const patSeg = $('#patSeg');
  const patBtns = 'ABCD'.split('').map((l, i) => {
    const b = el('button', '', l); b.type = 'button'; b.setAttribute('role', 'radio'); b.title = 'Pattern ' + l + ' (key ' + (i + 1) + ')';
    b.addEventListener('click', () => R.Seq.select(i));
    patSeg.appendChild(b); return b;
  });
  const laneSeg = $('#laneSeg');
  const laneBtns = LANES.map((l, i) => {
    const b = el('button', '', l); b.type = 'button'; b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { view.lane = i; paintAll(); });
    laneSeg.appendChild(b); return b;
  });
  $('#octM').addEventListener('click', () => R.setParam('seqOct', P.seqOct - 1, { src: 'ui' }));
  $('#octP').addEventListener('click', () => R.setParam('seqOct', P.seqOct + 1, { src: 'ui' }));
  $('#bRndM').addEventListener('click', () => { R.Seq.randomMelody(); ui.toast('New scale-aware melody for pattern ' + 'ABCD'[song.cur]); });
  $('#bRndD').addEventListener('click', () => { R.Seq.randomDrums(); ui.toast('New drum pattern for ' + 'ABCD'[song.cur]); });
  $('#bCopy').addEventListener('click', () => { const to = (song.cur + 1) % 4; R.Seq.copyPattern(song.cur, to); ui.toast('Copied ' + 'ABCD'[song.cur] + ' to ' + 'ABCD'[to]); });
  $('#bClear').addEventListener('click', () => { R.Seq.clearPattern(song.cur); ui.toast('Cleared pattern ' + 'ABCD'[song.cur]); });

  /* Euclid popover */
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  $('#bEuc').addEventListener('click', (e) => {
    if (pop) return closePop();
    pop = el('div', 'pop');
    const row = (lab, key, max) => {
      const r = el('div', 'prow', '<span>' + lab + '</span><div class="stepper"><button type="button">&minus;</button><output></output><button type="button">+</button></div>');
      const out = $('output', r), bs = $$('button', r);
      const paint = () => { out.textContent = view.euc[key]; };
      bs[0].onclick = () => { view.euc[key] = Math.max(key === 'hits' ? 1 : 0, view.euc[key] - 1); paint(); };
      bs[1].onclick = () => { view.euc[key] = Math.min(key === 'hits' ? stepsN() : stepsN() - 1, view.euc[key] + 1); paint(); };
      paint(); return r;
    };
    pop.appendChild(el('h4', '', 'EUCLIDEAN RHYTHM'));
    const tn = el('div', 'prow', '<span>TRACK</span><b style="color:var(--amber)">' + NAMES[view.track] + '</b>');
    pop.append(tn, row('HITS', 'hits'), row('ROTATE', 'rot'));
    const ap = el('button', 'btn sm', 'APPLY'); ap.type = 'button';
    ap.onclick = () => { R.Seq.applyEuclid(view.track, view.euc.hits, view.euc.rot); ui.toast('Euclid ' + view.euc.hits + '/' + stepsN() + ' on ' + NAMES[view.track]); closePop(); };
    pop.appendChild(ap);
    const r = e.currentTarget.getBoundingClientRect();
    pop.style.left = Math.max(8, r.left + window.scrollX - 120) + 'px'; pop.style.top = (r.bottom + window.scrollY + 8) + 'px';
    document.body.appendChild(pop);
  });
  document.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && e.target.id !== 'bEuc' && !e.target.closest('#bEuc')) closePop(); });

  /* ---------- grid ---------- */
  const grid = $('#grid'), inner = $('#seqInner');
  let cells = {};    // track -> [cell]
  let heads = [];
  function buildGrid() {
    const n = stepsN();
    inner.style.setProperty('--n', n);
    grid.textContent = '';
    cells = {}; heads = [];
    const hr = el('div', 'gr head'); hr.appendChild(el('div'));
    for (let s = 0; s < n; s++) { const h = el('div', 'hn' + (s % 4 === 0 ? ' b' : ''), '<span>' + (s + 1) + '</span>'); heads.push(h); hr.appendChild(h); }
    grid.appendChild(hr);
    for (const t of R.TRACKS) {
      const r = el('div', 'gr'); r.dataset.t = t;
      const gl = el('div', 'gl');
      const nm = el('button', 'gname', NAMES[t]); nm.type = 'button'; nm.title = 'Select ' + NAMES[t] + ' (target of Euclid)';
      nm.addEventListener('click', () => { view.track = t; paintSel(); });
      const m = el('button', 'gm', 'M'); m.type = 'button'; m.title = 'Mute ' + NAMES[t]; m.setAttribute('aria-label', 'Mute ' + NAMES[t]);
      m.addEventListener('click', () => { song.mute[t] = song.mute[t] ? 0 : 1; m.setAttribute('aria-pressed', !!song.mute[t]); });
      m.setAttribute('aria-pressed', !!song.mute[t]);
      gl.append(nm, m); r.appendChild(gl);
      cells[t] = [];
      for (let s = 0; s < n; s++) {
        const c = el('button', 'cell' + (t === 'mel' ? '' : ' drum') + (Math.floor(s / 4) % 2 ? ' g' : ''));
        c.type = 'button'; c.dataset.t = t; c.dataset.s = s; c.tabIndex = t === 'mel' && s === 0 ? 0 : -1;
        c.setAttribute('aria-label', NAMES[t] + ' step ' + (s + 1));
        c.innerHTML = '<i class="bar"></i><span class="tag"></span>';
        cells[t].push(c); r.appendChild(c);
      }
      grid.appendChild(r);
    }
    paintAll();
  }
  function paintSel() { $$('.gr[data-t]', grid).forEach((r) => r.classList.toggle('sel', r.dataset.t === view.track)); }

  const gateMap = { to: (v) => +(0.05 + v * v * 3.95).toFixed(2), from: (g) => Math.sqrt(Math.max(0, (g - 0.05) / 3.95)) };
  function paintCell(t, s) {
    const c = cells[t] && cells[t][s]; if (!c) return;
    const d = rowArr(t)[s], lane = LANES[view.lane], mel = t === 'mel';
    const bar = c.firstChild, tag = c.lastChild;
    const na = !mel && (lane === 'GATE' || lane === 'SLIDE' || lane === 'ACCENT');
    c.classList.toggle('lane', lane !== 'STEP');
    c.classList.toggle('acc', lane === 'STEP' && mel && !!d.accent && !!d.on);
    c.classList.toggle('sld', lane === 'STEP' && mel && !!d.slide && !!d.on);
    c.style.opacity = na ? 0.25 : 1;
    let pressed = !!d.on, h = 0, txt = '';
    c.style.setProperty('--v', d.vel);
    switch (lane) {
      case 'STEP': txt = d.on && d.ratchet > 1 ? '×' + d.ratchet : d.on && d.prob < 1 ? Math.round(d.prob * 100) + '%' : ''; break;
      case 'VEL': h = d.vel; break;
      case 'GATE': h = mel ? gateMap.from(d.gate) : 0; break;
      case 'PROB': h = d.prob; txt = d.prob < 1 ? Math.round(d.prob * 100) : ''; break;
      case 'RATCH': h = d.ratchet / 4; txt = d.ratchet > 1 ? '×' + d.ratchet : ''; break;
      case 'SLIDE': pressed = mel && !!d.slide; h = pressed ? 1 : 0; break;
      case 'ACCENT': pressed = mel && !!d.accent; h = pressed ? 1 : 0; break;
    }
    c.setAttribute('aria-pressed', pressed);
    bar.style.height = lane === 'STEP' ? '0' : Math.round(h * 100) + '%';
    tag.textContent = txt;
  }
  function paintAll() {
    if (!cells.mel) return;
    const n = stepsN();
    for (const t of R.TRACKS) for (let s = 0; s < n; s++) paintCell(t, s);
    laneBtns.forEach((b, i) => b.setAttribute('aria-checked', i === view.lane));
    patBtns.forEach((b, i) => b.setAttribute('aria-checked', i === song.cur));
    $('#octV').textContent = (P.seqOct > 0 ? '+' : '') + P.seqOct;
    paintSel(); drawRoll();
    const hints = [
      '<b>STEP</b> click or drag to toggle steps. Draw pitches in the piano roll above. Mute with M, pick a track for Euclid by clicking its name.',
      '<b>VEL</b> drag vertically on a step to set its velocity.', '<b>GATE</b> drag to set note length (melody only).',
      '<b>PROB</b> chance that a step fires. Try 50% hats for living grooves.', '<b>RATCH</b> repeat a step 1-4 times.',
      '<b>SLIDE</b> tie a step into the previous note (303-style glide, melody only).', '<b>ACCENT</b> louder hit with a brighter filter snap (melody only).'];
    $('#seqHint').innerHTML = hints[view.lane];
  }

  /* pointer editing on the grid (toggle / paint / lane drag) */
  let drag = null;
  function applyCell(t, s, e, first) {
    const d = rowArr(t)[s], lane = LANES[view.lane], mel = t === 'mel';
    const c = cells[t][s], rect = c.getBoundingClientRect();
    const v = U.clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
    switch (lane) {
      case 'STEP': if (first) drag.val = d.on ? 0 : 1; d.on = drag.val; if (d.on && mel && first) audition(d); break;
      case 'VEL': d.vel = +(0.1 + v * 0.9).toFixed(2); break;
      case 'GATE': if (mel) d.gate = gateMap.to(v); break;
      case 'PROB': d.prob = Math.max(0.05, Math.round(v * 20) / 20); break;
      case 'RATCH': d.ratchet = 1 + Math.min(3, Math.floor(v * 4)); break;
      case 'SLIDE': if (mel) { if (first) drag.val = d.slide ? 0 : 1; d.slide = drag.val; } break;
      case 'ACCENT': if (mel) { if (first) drag.val = d.accent ? 0 : 1; d.accent = drag.val; } break;
    }
    paintCell(t, s); drawRoll();
  }
  grid.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.cell'); if (!c || e.button !== 0) return;
    grid.setPointerCapture(e.pointerId);
    drag = { t: c.dataset.t, val: 1, pid: e.pointerId, last: -1 };
    const s = +c.dataset.s; drag.last = s;
    applyCell(drag.t, s, e, true);
    c.focus({ preventScroll: true });
    e.preventDefault();
  });
  grid.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const x = document.elementFromPoint(e.clientX, e.clientY);
    const c = x && x.closest && x.closest('.cell');
    if (c && c.dataset.t === drag.t) { const s = +c.dataset.s; applyCell(drag.t, s, e, false); drag.last = s; }
  });
  const endDrag = () => { drag = null; };
  grid.addEventListener('pointerup', endDrag); grid.addEventListener('pointercancel', endDrag);
  grid.addEventListener('keydown', (e) => {
    const c = e.target.closest('.cell'); if (!c) return;
    const t = c.dataset.t, s = +c.dataset.s, ti = R.TRACKS.indexOf(t);
    let nt = t, ns = s;
    if (e.key === 'ArrowRight') ns = Math.min(stepsN() - 1, s + 1);
    else if (e.key === 'ArrowLeft') ns = Math.max(0, s - 1);
    else if (e.key === 'ArrowDown') nt = R.TRACKS[Math.min(R.TRACKS.length - 1, ti + 1)];
    else if (e.key === 'ArrowUp') nt = R.TRACKS[Math.max(0, ti - 1)];
    else if (e.key === 'Enter' || e.key === ' ') {
      const d = rowArr(t)[s], lane = LANES[view.lane];
      if (lane === 'STEP') d.on = d.on ? 0 : 1; else if (lane === 'SLIDE') d.slide = d.slide ? 0 : 1; else if (lane === 'ACCENT') d.accent = d.accent ? 0 : 1;
      else if (lane === 'RATCH') d.ratchet = (d.ratchet % 4) + 1; else if (lane === 'PROB') d.prob = d.prob <= 0.25 ? 1 : d.prob - 0.25;
      paintCell(t, s); drawRoll(); e.preventDefault(); e.stopPropagation(); return;
    } else return;
    e.preventDefault(); e.stopPropagation();
    c.tabIndex = -1;
    const nc = cells[nt][ns]; nc.tabIndex = 0; nc.focus();
  });

  /* ---------- piano roll ---------- */
  const cv = $('#cvRoll'), g = cv.getContext('2d');
  function rollRows() {
    const iv = R.SCALES[P.scale].iv, rows = [];
    if (P.lock) { for (let o = 0; o < 2; o++) for (const s of iv) rows.push(s + 12 * o); rows.push(24); }
    else for (let i = 0; i <= 24; i++) rows.push(i);
    return rows.sort((a, b) => b - a);
  }
  const rowOf = (rows, n) => { let b = 0, bd = 99; rows.forEach((r, i) => { const d = Math.abs(r - n); if (d < bd) { bd = d; b = i; } }); return b; };
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  let hover = null;
  function geom() {
    const dpr = cv.width / cv.clientWidth;
    const gut = parseFloat(getComputedStyle(inner).getPropertyValue('--gutter')) * dpr;
    const n = stepsN(), rows = rollRows();
    return { dpr, gut, n, rows, cw: (cv.width - gut) / n, rh: cv.height / rows.length };
  }
  function drawRoll() {
    const w = Math.round(cv.clientWidth * Math.min(2, window.devicePixelRatio || 1)), h = Math.round(cv.clientHeight * Math.min(2, window.devicePixelRatio || 1));
    if (!w || !h) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const { dpr, gut, n, rows, cw, rh } = geom();
    const iv = R.SCALES[P.scale].iv;
    g.clearRect(0, 0, w, h);
    rows.forEach((note, i) => {
      const inSc = iv.indexOf(note % 12) >= 0, root = note % 12 === 0;
      g.fillStyle = root ? 'rgba(255,178,62,0.10)' : inSc ? (i % 2 ? 'rgba(255,255,255,0.028)' : 'rgba(255,255,255,0.05)') : 'rgba(0,0,0,0.35)';
      g.fillRect(gut, i * rh, w - gut, rh);
      g.fillStyle = root ? '#ffb23e' : inSc ? '#8d939f' : '#4b505a';
      g.font = (10 * dpr) + 'px Cascadia Mono, Consolas, monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(U.noteName(R.Seq.midiOf(note)), gut - 10 * dpr, (i + 0.5) * rh);
      g.fillStyle = root ? 'rgba(255,178,62,.6)' : 'rgba(255,255,255,.08)'; g.fillRect(gut - 5 * dpr, i * rh + rh * 0.3, 3 * dpr, rh * 0.4);
    });
    for (let s = 0; s <= n; s++) { g.fillStyle = s % 4 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.055)'; g.fillRect(gut + s * cw, 0, dpr, h); }
    const mel = cur().mel;
    for (let s = 0; s < n; s++) {
      const m = mel[s]; if (!m.on) continue;
      const pitch = R.Seq.notePitch(m), r = rowOf(rows, pitch);
      const len = Math.max(0.35, Math.min(m.gate, n - s)), x = gut + s * cw + 2 * dpr, y = r * rh + 1.5 * dpr;
      const bw = Math.max(6 * dpr, cw * len - 4 * dpr), bh = rh - 3 * dpr;
      if (P.chord) for (const off of R.Seq.chordOffsets(pitch).slice(1)) {
        const rr2 = rowOf(rows, Math.min(24, pitch + off)); g.fillStyle = 'rgba(69,224,255,0.3)'; rr(x, rr2 * rh + 2.5 * dpr, bw, rh - 5 * dpr, 3 * dpr); g.fill();
      }
      const grd = g.createLinearGradient(0, y, 0, y + bh);
      grd.addColorStop(0, m.accent ? '#fff2cf' : '#ffd98e'); grd.addColorStop(1, '#ff9d2e');
      g.globalAlpha = 0.45 + 0.55 * m.vel * (m.prob < 1 ? 0.75 : 1);
      g.fillStyle = grd; rr(x, y, bw, bh, 3.5 * dpr); g.fill();
      g.globalAlpha = 1;
      if (m.slide && s > 0 && mel[s - 1].on) { g.fillStyle = 'rgba(255,217,142,.9)'; g.fillRect(x - 4 * dpr, y + bh * 0.3, 6 * dpr, bh * 0.4); }
      if (m.ratchet > 1) { g.fillStyle = 'rgba(40,20,0,.75)'; for (let k = 1; k < m.ratchet; k++) g.fillRect(x + (bw * k) / m.ratchet, y + 2 * dpr, dpr * 1.4, bh - 4 * dpr); }
    }
    if (view.play >= 0 && view.play < n) {
      g.fillStyle = 'rgba(255,255,255,0.09)'; g.fillRect(gut + view.play * cw, 0, cw, h);
      g.fillStyle = 'rgba(255,178,62,0.95)'; g.fillRect(gut + view.play * cw, 0, cw, 2 * dpr);
    }
    if (hover) { g.strokeStyle = 'rgba(69,224,255,0.7)'; g.lineWidth = dpr; g.strokeRect(gut + hover.s * cw + dpr, hover.r * rh + dpr, cw - 2 * dpr, rh - 2 * dpr); }
  }
  function hit(e) {
    const b = cv.getBoundingClientRect(), G = geom();
    const x = (e.clientX - b.left) * G.dpr, y = (e.clientY - b.top) * G.dpr;
    const s = Math.floor((x - G.gut) / G.cw), r = Math.floor(y / G.rh);
    if (s < 0 || s >= G.n || r < 0 || r >= G.rows.length) return null;
    return { s, r, note: G.rows[r] };
  }
  function audition(step) {
    const E = R.Engine; if (!E.ctx) return;
    const v = E.noteOn(R.Seq.midiOf(R.Seq.notePitch(step)), 0.8, E.ctx.currentTime, { src: 'aud', key: 'aud' });
    if (v) E.release(v, E.ctx.currentTime + 0.22);
  }
  let rdrag = null;
  cv.addEventListener('pointerdown', (e) => {
    const h = hit(e); if (!h || e.button !== 0) return;
    cv.setPointerCapture(e.pointerId);
    const m = cur().mel[h.s];
    const erase = m.on && R.Seq.notePitch(m) === h.note;
    rdrag = { erase, pid: e.pointerId, pitch: -1 };
    setRoll(h, rdrag);
    e.preventDefault();
  });
  function setRoll(h, d) {
    const m = cur().mel[h.s];
    if (d.erase) m.on = 0;
    else { m.on = 1; m.note = h.note; if (d.pitch !== h.note) { audition(m); d.pitch = h.note; } }
    paintCell('mel', h.s); drawRoll();
  }
  cv.addEventListener('pointermove', (e) => {
    const h = hit(e);
    hover = h ? { s: h.s, r: h.r } : null;
    if (rdrag && e.pointerId === rdrag.pid && h) setRoll(h, rdrag); else drawRoll();
  });
  cv.addEventListener('pointerup', () => { rdrag = null; });
  cv.addEventListener('pointerleave', () => { hover = null; if (!rdrag) drawRoll(); });
  new ResizeObserver(drawRoll).observe(cv);

  /* ---------- playhead + wiring ---------- */
  function setPlayhead(step) {
    const n = stepsN();
    if (view.play >= 0) { heads[view.play] && heads[view.play].classList.remove('now'); for (const t of R.TRACKS) cells[t][view.play] && cells[t][view.play].classList.remove('now'); }
    view.play = step;
    if (step >= 0 && step < n) { heads[step].classList.add('now'); for (const t of R.TRACKS) cells[t][step].classList.add('now'); }
    drawRoll();
  }
  R.on('patternEdit', paintAll);
  R.on('pattern', paintAll);
  R.on('loaded', () => { buildGrid(); });
  R.on('param', (id) => { if (id === 'steps') { view.play = -1; buildGrid(); } else if (id === 'scale' || id === 'root' || id === 'lock' || id === 'seqOct' || id === 'chord') paintAll(); });
  buildGrid();
  R.SeqUI = { setPlayhead, paintAll, redraw: drawRoll };
})();
