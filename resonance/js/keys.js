/* RESONANCE - keys.js
 * On-screen two-octave piano (mouse / touch / glissando, velocity from click height),
 * computer-keyboard mapping, and the spring-back pitch-bend + mod wheels.
 */
(function () {
  'use strict';
  const R = window.R, P = R.P, U = R.util, E = R.Engine;
  const $ = (s) => document.querySelector(s);
  const kb = $('#kb');
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const NKEYS = 25;
  let octave = 3;                       // C3 is the lowest on-screen key by default
  const base = () => 12 * (octave + 1);
  const keys = [];

  /* ---------- build keys ---------- */
  const whites = [];
  for (let i = 0; i < NKEYS; i++) if (WHITE.indexOf(i % 12) >= 0) whites.push(i);
  kb.style.setProperty('--bw', 'calc((100% - 12px) / ' + whites.length + ' * 0.62)');
  for (let i = 0; i < NKEYS; i++) {
    const isW = WHITE.indexOf(i % 12) >= 0;
    const k = document.createElement('div');
    k.className = 'key ' + (isW ? 'w' : 'b');
    k.dataset.off = i;
    if (isW) { const nm = document.createElement('span'); nm.className = 'nm'; k.appendChild(nm); }
    else k.style.left = 'calc((100% - 12px) * ' + (whites.filter((w) => w < i).length / whites.length) + ' + 6px)';
    keys[i] = k;
  }
  whites.forEach((i) => kb.appendChild(keys[i]));
  keys.forEach((k, i) => { if (WHITE.indexOf(i % 12) < 0) kb.appendChild(k); });

  function labels() {
    keys.forEach((k, i) => { const nm = k.firstChild; if (nm && i % 12 === 0) nm.textContent = 'C' + (octave + Math.floor(i / 12)); else if (nm) nm.textContent = ''; });
    $('#octRead').textContent = octave;
    $('#lcdOct').textContent = (octave - 3 > 0 ? '+' : '') + (octave - 3);
  }
  labels();
  function setOctave(o) {
    if (R.Play) R.Play.releaseAll();
    octave = U.clamp(o, 0, 6); labels(); R.ui.msg('KEYBOARD OCTAVE ' + octave);
  }
  $('#btnOctDown').addEventListener('click', () => setOctave(octave - 1));
  $('#btnOctUp').addEventListener('click', () => setOctave(octave + 1));
  $('#btnPanic').addEventListener('click', () => { R.Play.panic(); R.ui.toast('All notes released'); });

  /* ---------- pointer play with glissando ---------- */
  const held = new Map();     // pointerId -> midi
  function keyAt(x, y) { const e = document.elementFromPoint(x, y); return e && e.closest ? e.closest('.key') : null; }
  function press(pid, k, y) {
    const m = base() + +k.dataset.off;
    if (held.get(pid) === m) return;
    release(pid);
    const r = k.getBoundingClientRect(), vel = U.clamp(0.28 + 0.72 * ((y - r.top) / r.height), 0.2, 1);
    held.set(pid, m);
    R.Play.down(m, vel);
  }
  function release(pid) {
    if (!held.has(pid)) return;
    R.Play.up(held.get(pid)); held.delete(pid);
  }
  kb.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('.key'); if (!k) return;
    kb.setPointerCapture(e.pointerId); press(e.pointerId, k, e.clientY); e.preventDefault();
  });
  kb.addEventListener('pointermove', (e) => {
    if (!held.has(e.pointerId)) return;
    const k = keyAt(e.clientX, e.clientY); if (k && kb.contains(k)) press(e.pointerId, k, e.clientY);
  });
  const up = (e) => release(e.pointerId);
  kb.addEventListener('pointerup', up); kb.addEventListener('pointercancel', up); kb.addEventListener('lostpointercapture', up);

  /* ---------- lit keys: physical / latched / arp ---------- */
  function paintKeys() {
    keys.forEach((k, i) => k.classList.toggle('down', R.Play.isDown(base() + i)));
  }
  R.on('keyState', paintKeys);
  R.on('arpFlash', (m) => {
    const k = keys[m - base()]; if (!k) return;
    k.classList.add('arp'); setTimeout(() => k.classList.remove('arp'), 110);
  });

  /* ---------- computer keyboard ---------- */
  const MAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
  const down = new Map();
  const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'x') { if (!R.Engine.ctx) return; setOctave(octave + (k === 'x' ? 1 : -1)); return; }
    if (!(k in MAP) || !E.ctx || e.target.closest('.knob')) return;
    const m = base() + MAP[k];
    if (down.has(k)) return;
    down.set(k, m); R.Play.down(m, 0.82); e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (down.has(k)) { R.Play.up(down.get(k)); down.delete(k); }
  });
  window.addEventListener('blur', () => { down.clear(); if (R.Play) R.Play.releaseAll(); });

  /* ---------- wheels ---------- */
  function wheel(id, spring, apply) {
    const w = $(id); let val = 0, raf = 0;
    const paint = () => {
      const half = w.clientHeight / 2 - 12;
      w.style.setProperty('--wp', (-val * half).toFixed(1) + 'px');
      w.style.setProperty('--wy', (-val * 60).toFixed(1) + 'px');
      w.setAttribute('aria-valuenow', val.toFixed(2));
    };
    const set = (v) => { val = U.clamp(v, spring ? -1 : 0, 1); paint(); apply(val); };
    let start = null;
    w.addEventListener('pointerdown', (e) => { w.setPointerCapture(e.pointerId); cancelAnimationFrame(raf); start = { y: e.clientY, v: val }; e.preventDefault(); });
    w.addEventListener('pointermove', (e) => { if (!start) return; set(start.v + ((start.y - e.clientY) / (w.clientHeight / 2 - 10)) * (spring ? 1 : 0.5)); });
    const end = () => {
      if (!start) return; start = null;
      if (spring) { const f = () => { val *= 0.78; if (Math.abs(val) < 0.01) val = 0; paint(); apply(val); if (val) raf = requestAnimationFrame(f); }; f(); }
    };
    w.addEventListener('pointerup', end); w.addEventListener('pointercancel', end);
    w.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowUp' ? 0.1 : e.key === 'ArrowDown' ? -0.1 : 0;
      if (d) { set(val + d); e.preventDefault(); e.stopPropagation(); }
    });
    w.addEventListener('keyup', () => { if (spring && val) { val = 0; paint(); apply(0); } });
    paint();
  }
  wheel('#wheelBend', true, (v) => E.setBend(v));
  wheel('#wheelMod', false, (v) => E.setMod(v));
})();
