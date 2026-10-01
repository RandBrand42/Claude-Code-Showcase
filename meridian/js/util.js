/* MERIDIAN - utilities: DOM helper, formatting, PRNG, easing, tweening, scales, monotone-cubic paths. */
(function (M) {
  'use strict';
  const U = (M.U = {});
  const SVGNS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'rect', 'line', 'text', 'defs', 'linearGradient', 'stop', 'clipPath', 'polyline', 'polygon', 'ellipse', 'tspan']);

  const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
  U.reduced = () => rmq.matches;

  /* ---------- DOM ---------- */
  U.$ = (s, r) => (r || document).querySelector(s);
  U.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /** Hyperscript: h('div.class#id', {props}, ...children). Handles SVG tags, on* listeners, style objects. */
  U.h = function h(sel, props, ...kids) {
    const m = /^([a-zA-Z][\w-]*)((?:[.#][\w-]+)*)$/.exec(sel);
    const tag = m ? m[1] : sel;
    const el = SVG_TAGS.has(tag) ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
    if (m && m[2]) {
      const cls = [];
      m[2].replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') cls.push(v); else el.id = v; });
      if (cls.length) el.setAttribute('class', cls.join(' '));
    }
    if (props && (typeof props !== 'object' || props.nodeType || Array.isArray(props) || typeof props === 'string')) { kids.unshift(props); props = null; }
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.setAttribute('class', (el.getAttribute('class') ? el.getAttribute('class') + ' ' : '') + v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  };

  U.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- math ---------- */
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.sum = (a, i0 = 0, i1 = a.length - 1) => { let s = 0; for (let i = i0; i <= i1; i++) s += a[i]; return s; };
  U.median = (a) => { const b = a.slice().sort((x, y) => x - y); const n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; };
  U.hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /** Deterministic PRNG (mulberry32). */
  U.rng = function (seed) {
    let a = seed >>> 0;
    const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.norm = () => (f() + f() + f() - 1.5) * 2; // ~N(0, 1) (Irwin-Hall, cheap)
    return f;
  };

  /** Linear resample of an array to n points. */
  U.resample = function (arr, n) {
    const m = arr.length;
    if (m === n) return arr;
    const out = new Array(n);
    if (m === 0) return out.fill(0);
    if (m === 1 || n === 1) return out.fill(arr[0]);
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * (m - 1);
      const a = Math.floor(u), b = Math.min(m - 1, a + 1);
      out[i] = arr[a] + (arr[b] - arr[a]) * (u - a);
    }
    return out;
  };

  /* ---------- easing + tweening ---------- */
  U.ease = {
    out: (t) => 1 - Math.pow(1 - t, 3),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    spring: (t) => 1 - Math.cos(t * 4.5 * Math.PI) * Math.exp(-t * 6),
  };

  /** rAF tween. Returns an object with cancel(). Snaps instantly under prefers-reduced-motion. */
  U.tween = function (dur, easing, onUpdate, onDone) {
    let raf = 0, cancelled = false;
    const ease = easing || U.ease.out;
    if (U.reduced() || dur <= 0) { onUpdate(1, 1); onDone && onDone(); return { cancel() {} }; }
    const t0 = performance.now();
    const step = (now) => {
      if (cancelled) return;
      const p = Math.min(1, (now - t0) / dur);
      onUpdate(ease(p), p);
      if (p < 1) raf = requestAnimationFrame(step); else onDone && onDone();
    };
    raf = requestAnimationFrame(step);
    return { cancel() { cancelled = true; cancelAnimationFrame(raf); } };
  };

  /** Animated number: tweens el's displayed value to `to` using formatter. */
  U.countTo = function (el, to, fmt, dur = 900, from) {
    if (el._ct) el._ct.cancel();
    const start = from != null ? from : el._val != null ? el._val : 0;
    el._val = to;
    if (!isFinite(to)) { el.textContent = fmt(to); return; }
    el._ct = U.tween(dur, U.ease.outExpo, (e) => { el.textContent = fmt(start + (to - start) * e); });
  };

  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.raf = (fn) => { let q = false; return (...a) => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(...a); }); }; };

  /* ---------- formatting ---------- */
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  U.int = (v) => nf0.format(Math.round(v));
  U.money = (v) => (v < 0 ? '-$' : '$') + nf0.format(Math.abs(Math.round(v)));
  U.compact = (v) => {
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e7) return s + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e5) return s + Math.round(a / 1e3) + 'K';
    if (a >= 1e3) return s + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return s + Math.round(a);
  };
  U.moneyC = (v) => (v < 0 ? '-$' : '$') + U.compact(Math.abs(v));
  U.pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
  U.num1 = (v) => v.toFixed(1);
  /** Fractional change, null when undefined. */
  U.change = (cur, prev) => (prev > 0 ? cur / prev - 1 : null);
  U.signedPct = (f, d = 1) => (f == null ? '-' : (f >= 0 ? '+' : '−') + Math.abs(f * 100).toFixed(d) + '%');
  U.signed = (v, d = 1, unit = '') => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + unit;

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  U.MON = MON; U.MONL = MONL; U.DOW = DOW;
  U.dstr = (ms, style) => {
    const d = new Date(ms);
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
    if (style === 'iso') return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
    if (style === 'long') return DOW[d.getUTCDay()] + ', ' + MON[m] + ' ' + dd + ', ' + y;
    if (style === 'md') return MON[m] + ' ' + dd;
    if (style === 'my') return MON[m] + ' ' + y;
    if (style === 'mys') return MON[m] + " '" + String(y).slice(2);
    return MON[m] + ' ' + dd + ', ' + y;
  };

  /* ---------- scales ---------- */
  function niceNum(x, round) {
    const e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e);
    let n;
    if (round) n = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10; else n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return n * Math.pow(10, e);
  }
  /** "Nice" axis ticks covering [lo, hi]. Returns {min,max,step,ticks}. */
  U.niceTicks = function (lo, hi, count = 5) {
    if (!(hi > lo)) hi = lo + 1;
    const step = niceNum(niceNum(hi - lo, false) / (count - 1), true);
    const min = Math.floor(lo / step + 1e-9) * step, max = Math.ceil(hi / step - 1e-9) * step;
    const ticks = [];
    for (let v = min; v <= max + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
    return { min, max, step, ticks };
  };

  /* ---------- monotone cubic (Fritsch-Carlson) ---------- */
  function slopes(x, y) {
    const n = x.length, d = new Array(n - 1), m = new Array(n);
    for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i] || 1e-9);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return m;
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  /** Monotone-cubic path through (x[i], y[i]). `move` false continues an existing subpath with L. */
  U.monotone = function (x, y, move = true) {
    const n = x.length;
    if (n === 0) return '';
    let d = (move ? 'M' : 'L') + r2(x[0]) + ',' + r2(y[0]);
    if (n === 1) return d;
    if (n === 2) return d + 'L' + r2(x[1]) + ',' + r2(y[1]);
    const m = slopes(x, y);
    for (let i = 0; i < n - 1; i++) {
      const dx = (x[i + 1] - x[i]) / 3;
      d += 'C' + r2(x[i] + dx) + ',' + r2(y[i] + m[i] * dx) + ' ' + r2(x[i + 1] - dx) + ',' + r2(y[i + 1] - m[i + 1] * dx) + ' ' + r2(x[i + 1]) + ',' + r2(y[i + 1]);
    }
    return d;
  };
  /** Closed area between two boundaries (top left->right, bottom right->left). */
  U.monotoneArea = function (x, yTop, yBot) {
    const n = x.length;
    if (!n) return '';
    const xr = x.slice().reverse(), yb = yBot.slice().reverse();
    return U.monotone(x, yTop, true) + U.monotone(xr, yb, false) + 'Z';
  };

  /* ---------- misc ---------- */
  U.download = function (name, text, type = 'text/csv') {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  U.toCSV = (rows) => rows.map((r) => r.map(U.csvCell).join(',')).join('\r\n');

  U.store = {
    get(k, d) { try { const v = localStorage.getItem('meridian.' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('meridian.' + k, v); } catch (e) { /* storage unavailable */ } },
  };
})((window.M = window.M || {}));
