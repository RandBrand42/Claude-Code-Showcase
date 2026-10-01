/* RESONANCE - app.js
 * Boot sequence, transport, LCD, patch browser, shortcuts, tap tempo, tabs and the UI-side event queue
 * that keeps the playhead locked to the audio clock.
 */
(function () {
  'use strict';
  const R = window.R, P = R.P, U = R.util, E = R.Engine, ui = R.ui;
  const { $, $$, el } = ui;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let powered = false;

  /* first state: Aurora is loaded before power-on so the panel already shows it behind the splash */
  ui.buildDrumStrips();
  ui.hydrate(document);
  R.Presets.loadFactory(0);

  /* ---------- LCD ---------- */
  function lcdStatic() {
    $('#lcdBpm').textContent = P.bpm;
    $('#lcdKey').textContent = R.ROOTS[P.root] + ' ' + R.SCALES[P.scale].name.replace('PENT ', 'P.').replace('HARM ', 'H.').replace('MIXOLYDIAN', 'MIXO').slice(0, 7);
    $('#lcdPat').textContent = 'ABCD'[R.song.cur];
  }
  function lcdPatch() {
    const f = R.Presets.factory.find((p) => p.name === R.Presets.current);
    $('#lcdPatch').textContent = R.Presets.current.toUpperCase();
    $('#lcdTag').textContent = f ? f.tag : 'USER';
  }
  R.on('param', (id) => { if (id === 'bpm' || id === 'scale' || id === 'root') lcdStatic(); });
  R.on('pattern', lcdStatic);
  R.on('loaded', () => { lcdStatic(); lcdPatch(); highlightPatch(); });
  R.on('ab', (i) => { $('#lcdAB').textContent = 'AB'[i]; });
  lcdStatic(); lcdPatch();

  /* ---------- transport ---------- */
  const btnPlay = $('#btnPlay'), btnRec = $('#btnRec');
  function paintPlay() {
    const on = R.Seq.playing;
    btnPlay.setAttribute('aria-pressed', on);
    btnPlay.querySelector('span').textContent = on ? 'STOP' : 'PLAY';
    btnPlay.querySelector('use').setAttribute('href', on ? '#i-stop' : '#i-play');
  }
  R.on('transport', (on) => {
    paintPlay();
    if (!on) { uiq.length = 0; R.SeqUI.setPlayhead(-1); $('#lcdStep').textContent = '--'; }
  });
  function togglePlay() { if (!powered) return; R.Seq.toggle(); }
  btnPlay.addEventListener('click', togglePlay);

  function startDemo() {
    R.Presets.loadFactory(0);
    if (!R.Seq.playing) R.Seq.start();
    ui.toast('Aurora: A minor loop, four patterns chained');
  }
  $('#btnDemo').addEventListener('click', () => { if (powered) startDemo(); });

  /* recording */
  function toggleRec() {
    if (!powered) return;
    if (R.Rec.active) {
      const r = R.Rec.stop();
      ui.locked = false;
      $('#lcdMsg').classList.remove('rec');
      if (r) ui.toast('Saved ' + r.name + '  (' + r.secs.toFixed(1) + ' s, ' + (r.bytes / 1048576).toFixed(1) + ' MB)');
    } else if (R.Rec.start()) {
      ui.locked = true;
      $('#lcdMsg').classList.add('rec');
    }
  }
  R.on('rec', (on) => btnRec.setAttribute('aria-pressed', on));
  btnRec.addEventListener('click', toggleRec);

  /* tap tempo */
  let taps = [];
  $('#btnTap').addEventListener('click', () => {
    const t = performance.now();
    if (taps.length && t - taps[taps.length - 1] > 2000) taps = [];
    taps.push(t);
    taps = taps.slice(-5);
    if (taps.length >= 2) {
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      R.setParam('bpm', Math.round(60000 / avg), { src: 'ui' });
    } else ui.msg('TAP AGAIN TO SET TEMPO');
  });

  /* ---------- UI event queue (audio-time -> screen-time) ---------- */
  const uiq = [];
  R.on('step', (t, pi, si) => uiq.push({ t, si, pi, k: 's' }));
  R.on('patternAt', (t) => uiq.push({ t, k: 'p' }));
  R.on('arpNote', (t, m, d) => uiq.push({ t, m, k: 'a' }));
  const lastVox = { n: -1, t: 0 };
  R.Visuals.onFrame((t) => {
    if (!powered) return;
    const now = E.ctx.currentTime;
    let step = null;
    while (uiq.length && uiq[0].t <= now) {
      const ev = uiq.shift();
      if (ev.k === 's') step = ev;
      else if (ev.k === 'p') { R.SeqUI.paintAll(); lcdStatic(); }
      else R.emit('arpFlash', ev.m);
    }
    if (step) {
      R.SeqUI.setPlayhead(step.si);
      $('#lcdStep').textContent = String(step.si + 1).padStart(2, '0');
      const pat = R.song.pats[step.pi];
      for (const d of R.DRUMS) if (pat.drums[d.id][step.si].on && !R.song.mute[d.id]) flash(d.id);
    }
    if (t - lastVox.t > 0.2) {
      lastVox.t = t;
      const n = E.activeVoices();
      if (n !== lastVox.n) { lastVox.n = n; $('#lcdVox').textContent = n; }
      if (R.Rec.active) { const s = Math.floor(R.Rec.elapsed()); $('#lcdMsg').textContent = 'REC ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '  -  press REC again to save WAV'; }
    }
  });
  function flash(id) {
    const h = $('.dstrip[data-drum="' + id + '"] .hit'); if (!h) return;
    h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 90);
  }
  $$('.dtest').forEach((b) => b.addEventListener('click', () => {
    if (!powered) return;
    const id = b.closest('.dstrip').dataset.drum;
    E.drum(id, E.ctx.currentTime, 0.9); flash(id);
  }));

  /* ---------- patches ---------- */
  function go(delta) {
    if (!powered) return;
    R.Presets.loadFactory(R.Presets.index + delta);
    ui.msg('PATCH ' + R.Presets.current.toUpperCase());
  }
  $('#btnPrev').addEventListener('click', () => go(-1));
  $('#btnNext').addEventListener('click', () => go(1));
  $('#btnAB').addEventListener('click', () => { if (powered) R.Presets.AB.toggle(); });

  const modalP = $('#modalPatches'), modalK = $('#modalKeys');
  let lastFocus = null;
  function openModal(m) { lastFocus = document.activeElement; m.hidden = false; const f = m.querySelector('button, input'); if (f) f.focus(); }
  function closeModal(m) { m.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  [modalP, modalK].forEach((m) => {
    m.addEventListener('pointerdown', (e) => { if (e.target === m) closeModal(m); });
    $('[data-close]', m).addEventListener('click', () => closeModal(m));
  });

  function highlightPatch() {
    $$('.pbtn', modalP).forEach((b) => b.classList.toggle('cur', b.dataset.name === R.Presets.current));
  }
  function renderPatches() {
    const fac = $('#plistFactory'); fac.textContent = '';
    R.Presets.factory.forEach((p, i) => {
      const li = el('li'), b = el('button', 'pbtn', '<span class="pn"></span><span class="pt"></span><span class="pd"></span>');
      b.type = 'button'; b.dataset.name = p.name;
      b.children[0].textContent = p.name; b.children[1].textContent = p.tag; b.children[2].textContent = p.desc;
      b.addEventListener('click', () => { R.Presets.loadFactory(i); highlightPatch(); });
      li.appendChild(b); fac.appendChild(li);
    });
    const usr = $('#plistUser'); usr.textContent = '';
    const names = R.Presets.Store.names();
    $('#plistEmpty').hidden = names.length > 0;
    names.forEach((n) => {
      const all = R.Presets.Store.all();
      const li = el('li'), b = el('button', 'pbtn', '<span class="pn"></span><span class="pt">USER</span>'), x = el('button', 'pdel', '<svg><use href="#i-trash"/></svg>');
      b.type = 'button'; x.type = 'button'; b.dataset.name = n; x.setAttribute('aria-label', 'Delete ' + n);
      b.children[0].textContent = n;
      b.addEventListener('click', () => { R.Presets.AB.reset(); R.Presets.loadSnapshot(all[n], n); highlightPatch(); });
      x.addEventListener('click', () => { R.Presets.Store.remove(n); renderPatches(); });
      li.append(b, x); usr.appendChild(li);
    });
    highlightPatch();
  }
  $('#btnBrowse').addEventListener('click', () => { renderPatches(); openModal(modalP); });
  $('#saveForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#saveName'), name = inp.value.trim();
    if (!name) return inp.focus();
    if (R.Presets.Store.save(name)) { ui.toast('Saved "' + name + '" to this browser'); inp.value = ''; lcdPatch(); renderPatches(); }
    else ui.toast('Storage is unavailable here. Use Export instead.');
  });
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([R.Presets.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = R.Presets.current.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.resonance.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    ui.toast('Patch exported as JSON');
  });
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { R.Presets.importJSON(t); ui.toast('Imported ' + R.Presets.current); })
      .catch((err) => ui.toast('Import failed: ' + err.message));
    e.target.value = '';
  });

  /* ---------- shortcuts overlay ---------- */
  const SHORT = [
    ['Play / stop', 'Space'], ['Record WAV', 'Shift + Space'], ['Pattern A - D', '1 2 3 4'], ['Tempo -1 / +1', '[  ]'], ['Tempo -5 / +5', 'Shift + [  ]'],
    ['Play notes', 'A W S E D F T G Y H U J K O L P ;'], ['Octave down / up', 'Z  X'], ['This help', '?'], ['Close overlays', 'Esc'],
    ['Knob: nudge', 'Arrow keys'], ['Knob: fine', 'Shift + drag / arrows'], ['Knob: reset', 'Double-click / Enter'], ['Step grid', 'Arrows + Enter'],
  ];
  $('#keysGrid').innerHTML = SHORT.map((s) => '<div class="krow"><span>' + s[0] + '</span><kbd>' + s[1] + '</kbd></div>').join('');
  $('#btnHelp').addEventListener('click', () => openModal(modalK));

  window.addEventListener('keydown', (e) => {
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (e.key === 'Escape') { [modalP, modalK].forEach((m) => { if (!m.hidden) closeModal(m); }); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || !powered) return;
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.shiftKey) toggleRec(); else togglePlay();
    } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) { openModal(modalK); }
    else if (/^[1-4]$/.test(e.key)) R.Seq.select(+e.key - 1);
    else if (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}') {
      const d = (e.key === '[' || e.key === '{' ? -1 : 1) * (e.shiftKey ? 5 : 1);
      R.setParam('bpm', P.bpm + d, { src: 'ui' });
    }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space' && powered) e.preventDefault(); });

  /* ---------- tabs ---------- */
  const tabs = $$('#tabs button'), panes = $$('.pane');
  const phone = window.matchMedia('(max-width: 700px)');
  function showTab(name, scroll) {
    tabs.forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name));
    panes.forEach((p) => p.classList.toggle('active', p.dataset.pane === name));
    const p = panes.find((x) => x.dataset.pane === name);
    if (scroll && phone.matches && p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => R.SeqUI.redraw(), 0);
  }
  tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab, true)));
  showTab('sound');

  /* ---------- power on ---------- */
  const splash = $('#splash');
  const BOOT = ['OSCILLATORS', 'FILTER CORE', 'DRUM VOICES', 'ROOM IMPULSE RESPONSE', 'SEQUENCER CLOCK'];
  async function powerOn(demo) {
    if (powered) return;
    powered = true;
    splash.classList.add('booting');
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    E.init(ctx);
    try { await ctx.resume(); } catch (e) { /* the page may already be running */ }
    R.Visuals.attach(E.nodes);
    R.Clock.start();
    const log = $('#bootLog');
    for (const line of BOOT) {
      log.appendChild(el('li', '', line + ' ........ <b>OK</b>'));
      await sleep(170);
    }
    await sleep(260);
    splash.classList.add('gone');
    document.body.classList.remove('is-off');
    ui.msg('POWER ON - ' + ctx.sampleRate + ' HZ');
    if (demo) { await sleep(450); startDemo(); }
  }
  $('#btnPower').addEventListener('click', () => powerOn(false));
  $('#btnPowerDemo').addEventListener('click', () => powerOn(true));
  $('#btnPower').focus({ preventScroll: true });

  R.Visuals.start();
  window.addEventListener('beforeunload', () => { R.Clock.stop(); });
  R.app = { powerOn, startDemo, get powered() { return powered; } };
})();
