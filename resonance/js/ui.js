/* RESONANCE - ui.js
 * Widget toolkit: SVG rotary knobs (drag / wheel / keys / double-click reset / touch, ARIA sliders),
 * segmented buttons, switches, selects and the live ADSR displays. Panel markup declares widgets with
 * data-knob / data-seg / data-toggle / data-select / data-env attributes and hydrate() builds them.
 */
(function () {
  'use strict';
  const R = window.R, P = R.P, U = R.util;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* ---------- readable parameter names (tooltips, LCD, ARIA) ---------- */
  const FULL = {
    vol: 'MASTER VOLUME', comp: 'GLUE COMPRESSOR', pump: 'KICK PUMP', fCut: 'CUTOFF', fRes: 'RESONANCE', fDrive: 'FILTER DRIVE',
    fKey: 'KEY TRACKING', fEnv: 'FILTER ENV AMOUNT', noise: 'NOISE LEVEL', subLevel: 'SUB LEVEL', uniVoices: 'UNISON VOICES',
    uniDetune: 'UNISON DETUNE', uniSpread: 'STEREO SPREAD', glide: 'GLIDE TIME', bpm: 'TEMPO', swing: 'SWING', arpOct: 'ARP OCTAVES',
    arpGate: 'ARP GATE', arpRate: 'ARP RATE', arpMode: 'ARP MODE', arpOn: 'ARPEGGIATOR', hold: 'HOLD / LATCH', bendRange: 'BEND RANGE',
    fxDrive: 'DRIVE AMOUNT', fxDriveMix: 'DRIVE MIX', chRate: 'CHORUS RATE', chDepth: 'CHORUS DEPTH', chMix: 'CHORUS MIX',
    dlTime: 'DELAY TIME', dlFb: 'DELAY FEEDBACK', dlTone: 'DELAY TONE', dlMix: 'DELAY MIX', rvSize: 'ROOM SIZE', rvDecay: 'REVERB DECAY',
    rvDamp: 'REVERB DAMPING', rvPre: 'PRE-DELAY', rvMix: 'REVERB MIX', drumLevel: 'DRUM LEVEL', drumRev: 'DRUM REVERB SEND',
    fType: 'FILTER TYPE', subWave: 'SUB WAVE', subOct: 'SUB OCTAVE', tomMode: 'TOM / RIM', scale: 'SCALE', root: 'ROOT NOTE',
    lock: 'SCALE LOCK', seqOct: 'MELODY OCTAVE', chord: 'CHORD STACK', steps: 'PATTERN LENGTH', chain: 'PATTERN CHAIN',
  };
  function fullName(d) {
    if (FULL[d.id]) return FULL[d.id];
    let m = /^o(\d)/.exec(d.id);
    if (m) return 'OSC ' + m[1] + ' ' + d.name;
    m = /^l(\d)/.exec(d.id);
    if (m) return 'LFO ' + m[1] + ' ' + d.name;
    if (d.group) return d.group + ' ' + d.name;
    return d.name;
  }

  /* ---------- LCD message line + toast ---------- */
  let msgTimer = 0;
  const lcdMsg = $('#lcdMsg');
  const HINT = 'MOVE ANY CONTROL TO READ ITS VALUE';
  function msg(text) {
    if (!lcdMsg || R.ui.locked) return;
    lcdMsg.textContent = text;
    lcdMsg.classList.remove('flash'); void lcdMsg.offsetWidth; lcdMsg.classList.add('flash');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { if (!R.ui.locked) lcdMsg.textContent = HINT; }, 3800);
  }
  let toastTimer = 0;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- tooltip ---------- */
  const tip = $('#tip');
  function showTip(target, d, v) {
    tip.innerHTML = '<b>' + fullName(d) + '</b>' + R.fmt(d, v);
    const r = target.getBoundingClientRect();
    tip.style.left = Math.round(U.clamp(r.left + r.width / 2, 70, window.innerWidth - 70)) + 'px';
    tip.style.top = Math.round(Math.max(28, r.top - 4)) + 'px';
    tip.classList.add('show');
  }
  const hideTip = () => tip.classList.remove('show');

  /* ---------- widget registry: param id -> repaint callbacks ---------- */
  const paints = Object.create(null);
  const onParam = (id, fn) => { (paints[id] || (paints[id] = [])).push(fn); fn(); };
  R.on('param', (id, v, opt) => {
    const l = paints[id];
    if (l) for (const fn of l) fn();
    if (opt && opt.src === 'ui') {
      const d = R.PDEF[id];
      msg(fullName(d) + '  ' + R.fmt(d, v));
    }
  });

  /* ---------- knob ---------- */
  const A0 = -135, SWEEP = 270;
  function pt(r, deg) {
    const a = (deg * Math.PI) / 180;
    return [32 + r * Math.sin(a), 32 - r * Math.cos(a)];
  }
  function arc(r, a0, a1) {
    if (Math.abs(a1 - a0) < 0.6) return '';
    const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1);
    return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (Math.abs(a1 - a0) > 180 ? 1 : 0) + ' ' + (a1 > a0 ? 1 : 0) + ' ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  }

  function buildKnob(host) {
    const id = host.dataset.knob, d = R.PDEF[id];
    if (!d) { console.error('unknown knob param', id); return; }
    const k = el('div', 'knob');
    k.setAttribute('role', 'slider');
    k.tabIndex = 0;
    k.dataset.id = id;
    if (host.dataset.size) k.dataset.size = host.dataset.size;
    if (host.hasAttribute('data-hi')) k.dataset.hi = '';
    k.setAttribute('aria-label', fullName(d));
    k.setAttribute('aria-valuemin', d.min);
    k.setAttribute('aria-valuemax', d.max);
    k.innerHTML =
      '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      '<path class="trk" d="' + arc(27, A0, A0 + SWEEP) + '"/>' +
      '<path class="halo"/><path class="val"/>' +
      '<g class="cap"><circle cx="32" cy="32" r="21.5" fill="url(#g-rim)"/><circle cx="32" cy="32" r="20" fill="url(#g-cap)"/>' +
      '<circle class="knurl" cx="32" cy="32" r="20.4"/><circle cx="32" cy="32" r="14.5" fill="url(#g-face)" stroke="rgba(0,0,0,.65)" stroke-width="1"/>' +
      '<circle cx="32" cy="32" r="14.5" fill="none" stroke="rgba(255,255,255,.1)" stroke-width=".8" transform="translate(0 .6)"/>' +
      '<g class="rot"><line class="ptr" x1="32" y1="19" x2="32" y2="10.5"/></g></g></svg>' +
      '<span class="klabel">' + (host.dataset.label || d.name) + '</span><span class="kval"></span>';
    host.replaceWith(k);

    const rot = $('.rot', k), val = $('.val', k), halo = $('.halo', k), kval = $('.kval', k);
    const paint = () => {
      const v = P[id], n = R.toNorm(d, v), a = A0 + SWEEP * n;
      rot.setAttribute('transform', 'rotate(' + a.toFixed(1) + ' 32 32)');
      const p = arc(27, d.bipolar ? 0 : A0, a);
      val.setAttribute('d', p); halo.setAttribute('d', p);
      k.setAttribute('aria-valuenow', v);
      const t = R.fmt(d, v);
      k.setAttribute('aria-valuetext', t);
      kval.textContent = t;
    };
    onParam(id, paint);

    const set = (n) => R.setParam(id, R.fromNorm(d, n), { src: 'ui' });
    let drag = null;
    k.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      k.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, n: R.toNorm(d, P[id]), id: e.pointerId };
      k.classList.add('active');
      showTip(k, d, P[id]);
      e.preventDefault();
      k.focus({ preventScroll: true });
    });
    k.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const sens = e.shiftKey ? 1 / 900 : 1 / 170;
      set(drag.n + (drag.y - e.clientY) * sens);
      showTip(k, d, P[id]);
    });
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      k.classList.remove('active');
      hideTip();
    };
    k.addEventListener('pointerup', end);
    k.addEventListener('pointercancel', end);
    k.addEventListener('lostpointercapture', end);
    k.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const step = d.type === 'f' ? (e.shiftKey ? 0.004 : 0.025) : 1 / Math.max(1, d.max - d.min);
      set(R.toNorm(d, P[id]) + dir * step);
      showTip(k, d, P[id]);
      clearTimeout(k._tt); k._tt = setTimeout(hideTip, 700);
    }, { passive: false });
    k.addEventListener('keydown', (e) => {
      const fl = d.type === 'f';
      const small = fl ? (e.shiftKey ? 0.002 : 0.01) : 1 / Math.max(1, d.max - d.min);
      let n = R.toNorm(d, P[id]), handled = true;
      switch (e.key) {
        case 'ArrowUp': case 'ArrowRight': n += small; break;
        case 'ArrowDown': case 'ArrowLeft': n -= small; break;
        case 'PageUp': n += fl ? 0.1 : small * 3; break;
        case 'PageDown': n -= fl ? 0.1 : small * 3; break;
        case 'Home': n = 0; break;
        case 'End': n = 1; break;
        case 'Enter': case ' ': R.setParam(id, d.def, { src: 'ui' }); break;
        default: handled = false;
      }
      if (!handled) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key !== 'Enter' && e.key !== ' ') set(n);
      showTip(k, d, P[id]);
      clearTimeout(k._tt); k._tt = setTimeout(hideTip, 900);
    });
    k.addEventListener('blur', hideTip);
    k.addEventListener('dblclick', () => R.setParam(id, d.def, { src: 'ui' }));
    k.title = 'Drag, scroll or use arrow keys. Double-click to reset.';
    return k;
  }

  /* ---------- segmented ---------- */
  function buildSeg(host) {
    const id = host.dataset.seg, d = R.PDEF[id];
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', fullName(d));
    const icons = host.dataset.icons;
    if (icons) seg.classList.add('iconic');
    else if (d.labels.length > 4) seg.classList.add('dense');
    if (host.dataset.label) seg.appendChild(el('span', 'silk', host.dataset.label));
    const btns = d.labels.map((lab, i) => {
      const b = el('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      if (icons) {
        const sym = icons === 'wave' ? 'w-' + i : i === 4 ? 'w-sh' : 'w-' + i;
        b.innerHTML = '<svg class="wv" viewBox="0 0 28 16" aria-hidden="true"><use href="#' + sym + '"/></svg><span class="sr-only">' + lab + '</span>';
      } else b.textContent = lab;
      b.title = fullName(d) + ': ' + lab;
      b.addEventListener('click', () => R.setParam(id, i, { src: 'ui' }));
      seg.appendChild(b);
      return b;
    });
    seg.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      e.preventDefault(); e.stopPropagation();
      const n = (P[id] + dir + d.labels.length) % d.labels.length;
      R.setParam(id, n, { src: 'ui' });
      btns[n].focus();
    });
    host.replaceWith(seg);
    onParam(id, () => btns.forEach((b, i) => { b.setAttribute('aria-checked', i === P[id]); b.tabIndex = i === P[id] ? 0 : -1; }));
    return seg;
  }

  /* ---------- toggle ---------- */
  function buildToggle(host) {
    const id = host.dataset.toggle, d = R.PDEF[id];
    const b = el('button', 'tgl', '<i></i><span class="silk">' + (host.dataset.label || d.name) + '</span>');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', fullName(d));
    b.addEventListener('click', () => R.setParam(id, P[id] ? 0 : 1, { src: 'ui' }));
    host.replaceWith(b);
    onParam(id, () => b.setAttribute('aria-checked', !!P[id]));
    return b;
  }

  /* ---------- select ---------- */
  function buildSelect(host) {
    const id = host.dataset.select, d = R.PDEF[id];
    const w = el('label', 'sel', '<span>' + (host.dataset.label || d.name) + '</span>');
    const s = el('select');
    s.setAttribute('aria-label', fullName(d));
    d.labels.forEach((lab, i) => s.appendChild(new Option(lab, i)));
    s.addEventListener('change', () => R.setParam(id, +s.value, { src: 'ui' }));
    s.addEventListener('keydown', (e) => e.stopPropagation());
    w.appendChild(s);
    host.replaceWith(w);
    onParam(id, () => { s.value = P[id]; });
    return w;
  }

  /* ---------- ADSR display ---------- */
  function buildEnv(host) {
    const p = host.dataset.env;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'envdisp');
    svg.setAttribute('viewBox', '0 0 200 60');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', (p === 'f' ? 'Filter' : 'Amp') + ' envelope shape');
    svg.innerHTML = '<path class="fill"/><path class="line" vector-effect="non-scaling-stroke"/>';
    host.replaceWith(svg);
    const fill = $('.fill', svg), line = $('.line', svg);
    const f = (t) => Math.pow(t / 8, 0.42);
    const draw = () => {
      const a = P[p + 'A'], d = P[p + 'D'], s = P[p + 'S'], r = P[p + 'R'];
      const x0 = 4, yb = 54, yp = 8, ys = yb - s * (yb - yp);
      const wA = 6 + 40 * f(a), wD = 6 + 44 * f(d), wS = 24, wR = 6 + 44 * f(r);
      const pts = [[x0, yb], [x0 + wA, yp]];
      for (let i = 1; i <= 12; i++) { const u = i / 12; pts.push([x0 + wA + wD * u, ys + (yp - ys) * Math.exp(-4 * u)]); }
      const xs = x0 + wA + wD + wS;
      pts.push([xs, ys]);
      for (let i = 1; i <= 12; i++) { const u = i / 12; pts.push([xs + wR * u, yb - (yb - ys) * (1 - Math.exp(-4 * u))]); }
      const path = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
      line.setAttribute('d', path);
      fill.setAttribute('d', path + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + yb + 'L' + x0 + ' ' + yb + 'Z');
    };
    ['A', 'D', 'S', 'R'].forEach((s) => onParam(p + s, draw));
  }

  /* ---------- drum strips ---------- */
  function buildDrumStrips() {
    const host = $('#drumStrips');
    if (!host) return;
    for (const dr of R.DRUMS) {
      const s = el('div', 'dstrip');
      s.dataset.drum = dr.id;
      s.innerHTML = '<h3><i class="hit"></i>' + dr.short + '</h3>' +
        '<div data-knob="' + dr.id + '_tune"></div><div data-knob="' + dr.id + '_decay"></div><div data-knob="' + dr.id + '_level" data-hi></div>' +
        (dr.id === 'tom' ? '<div data-seg="tomMode"></div>' : '') +
        '<button class="dtest" type="button" aria-label="Audition ' + dr.name + '">TEST</button>';
      host.appendChild(s);
    }
  }

  function hydrate(root) {
    $$('[data-knob]', root).forEach(buildKnob);
    $$('[data-seg]', root).forEach(buildSeg);
    $$('[data-toggle]', root).forEach(buildToggle);
    $$('[data-select]', root).forEach(buildSelect);
    $$('[data-env]', root).forEach(buildEnv);
    // LFO rate knobs dim while tempo-synced; the division menu dims otherwise
    [1, 2].forEach((n) => onParam('l' + n + 'sync', () => {
      const knob = $('.knob[data-id="l' + n + 'rate"]'), sel = $('select[aria-label="LFO ' + n + ' DIV"]');
      if (knob) knob.style.opacity = P['l' + n + 'sync'] ? 0.4 : 1;
      if (sel) sel.closest('.sel').style.opacity = P['l' + n + 'sync'] ? 1 : 0.4;
    }));
  }

  R.ui = { $, $$, el, hydrate, buildDrumStrips, msg, toast, fullName, showTip, hideTip, onParam, locked: false, HINT };
})();
