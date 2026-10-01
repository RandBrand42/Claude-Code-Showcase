/* MERIDIAN - hand-built SVG chart primitives: TimeChart (line/area/stack/bar with morphing), Minimap, Spark, Gauge. */
(function (M) {
  'use strict';
  const U = M.U, h = U.h;
  M.color = (i) => 'var(--c' + ((i % 8) + 1) + ')';

  /* ======================================================================================
   * TimeChart
   * model: { type:'line'|'area'|'stack'|'bar', labels:[{a,b,label,long,major,t}], series:[{key,name,color,vals,cmp?,vis?}],
   *          cmpOn:bool, cmpLabels:[..], marks:[{i,id,sign,title}], bands:[{a,b,label}], zeroBase, fmtY, fmtVal, kind }
   * Series values are tweened (resampled when the bucket count changes) so any change morphs rather than jumps.
   * ==================================================================================== */
  let uidN = 0;
  class TimeChart {
    constructor(host, opts) {
      this.host = host;
      this.o = Object.assign({ height: 300, m: { t: 18, r: 14, b: 26, l: 50 }, brush: false, onBrush: null, onMark: null, onHover: null }, opts);
      this.uid = 'tc' + ++uidN;
      host.classList.add('tc');
      const ns = (t, a) => h(t, a);
      this.svg = ns('svg', { class: 'tc-svg', height: this.o.height, role: 'img', 'aria-label': this.o.label || 'Chart' });
      this.gDefs = ns('defs'); this.gGrid = ns('g', { class: 'tc-grid' }); this.gBands = ns('g');
      this.gData = ns('g', { 'clip-path': 'url(#' + this.uid + '-clip)', class: 'tc-data' });
      this.gX = ns('g', { class: 'tc-x' }); this.gMarks = ns('g', { class: 'tc-marks' }); this.gCross = ns('g', { class: 'tc-cross' });
      this.sel = ns('rect', { class: 'tc-sel', y: this.o.m.t, height: 0, width: 0, rx: 4 });
      this.hit = ns('rect', { class: 'tc-hit', fill: 'transparent' });
      this.svg.append(this.gDefs, this.gBands, this.gGrid, this.gData, this.gX, this.gMarks, this.gCross, this.sel, this.hit);
      this.tip = h('div.tc-tip', { role: 'tooltip' });
      host.append(this.svg, this.tip);
      this.w = 0; this.cur = null; this.hover = -1; this.hl = null;
      this.ro = new ResizeObserver(() => { const w = host.clientWidth; if (w && w !== this.w) { this.w = w; this.draw(); } });
      this.ro.observe(host);
      this.bind();
    }

    destroy() { if (this.anim) this.anim.cancel(); this.ro.disconnect(); this.host.classList.remove('tc'); U.clear(this.host); }

    /* ---- model -> frame ---- */
    prep(md) {
      const n = md.labels.length;
      const ser = md.series.map((s) => ({ key: s.key, name: s.name, color: s.color, vals: Array.from(s.vals), cmp: s.cmp ? Array.from(s.cmp) : null, vis: s.vis === false || s.vis === 0 ? 0 : 1 }));
      const stack = md.type === 'stack' || md.type === 'bar';
      let hi = 0, lo = Infinity;
      for (let i = 0; i < n; i++) {
        let a = 0, c = 0;
        for (const s of ser) {
          if (!s.vis) continue;
          const v = s.vals[i], cv = md.cmpOn && s.cmp ? s.cmp[i] : null;
          if (stack) { a += v; if (cv != null) c += cv; } else { if (v > hi) hi = v; if (v < lo) lo = v; if (cv != null) { if (cv > hi) hi = cv; if (cv < lo) lo = cv; } }
        }
        if (stack) { if (a > hi) hi = a; if (c > hi) hi = c; }
      }
      // 'auto' keeps a zero baseline unless the data sits in a narrow band, in which case the axis is zoomed (and flagged)
      let zero = md.zeroBase !== false || stack;
      if (md.zeroBase === 'auto' && !stack && lo > 0.42 * hi) zero = false;
      let tk;
      if (zero) tk = U.niceTicks(0, (hi || 1) * 1.05, 5);
      else { const pad = (hi - lo) * 0.14 || 1; tk = U.niceTicks(Math.max(0, lo - pad), hi + pad, 5); }
      return { n, ser, yMin: tk.min, yMax: tk.max, ticks: tk.ticks, cmpA: md.cmpOn ? 1 : 0, broken: !zero && md.zeroBase === 'auto' };
    }

    set(md, opt) {
      opt = opt || {};
      const prevModel = this.model;
      this.model = md;
      const to = this.prep(md);
      this.to = to;
      if (this.anim) { this.anim.cancel(); this.anim = null; }
      this.w = this.host.clientWidth || this.w;
      this.hover = -1; this.gCross.innerHTML = ''; this.tip.classList.remove('on');
      const zeros = (n) => new Array(n).fill(to.yMin > 0 ? to.yMin : 0);
      let from;
      const prev = this.cur;
      if (!prev) {
        from = { n: to.n, yMin: to.yMin, yMax: to.yMax, cmpA: 0, ser: to.ser.map((s) => ({ ...s, vals: zeros(to.n), cmp: s.cmp ? zeros(to.n) : null, vis: 1 })) };
      } else {
        from = { n: to.n, yMin: prev.yMin, yMax: prev.yMax, cmpA: prev.cmpA, ser: [] };
        to.ser.forEach((s) => {
          const o = prev.ser.find((x) => x.key === s.key);
          from.ser.push(o ? { ...s, vals: U.resample(o.vals, to.n), cmp: s.cmp ? (o.cmp ? U.resample(o.cmp, to.n) : s.cmp.slice()) : null, vis: o.vis } : { ...s, vals: s.vals.slice(), cmp: s.cmp ? s.cmp.slice() : null, vis: 0 });
        });
        prev.ser.forEach((o) => {
          if (!to.ser.some((s) => s.key === o.key)) {
            const v = U.resample(o.vals, to.n), c = o.cmp ? U.resample(o.cmp, to.n) : null;
            from.ser.push({ ...o, vals: v, cmp: c, vis: o.vis });
            to.ser.push({ ...o, vals: v.slice(), cmp: c ? c.slice() : null, vis: 0, _gone: true });
          }
        });
      }
      const animate = opt.animate !== false && !U.reduced();
      if (prevModel && prevModel.type !== md.type && animate) {
        this.gData.style.transition = 'none'; this.gData.style.opacity = '0';
        void this.gData.getBoundingClientRect();
        this.gData.style.transition = 'opacity .45s ease'; this.gData.style.opacity = '1';
      }
      const lerp = U.lerp;
      const frameAt = (e) => ({
        n: to.n, yMin: lerp(from.yMin, to.yMin, e), yMax: lerp(from.yMax, to.yMax, e), cmpA: lerp(from.cmpA, to.cmpA, e),
        ser: to.ser.map((s, i) => {
          const f = from.ser[i];
          const vals = new Array(to.n), cmp = s.cmp ? new Array(to.n) : null;
          for (let j = 0; j < to.n; j++) { vals[j] = f.vals[j] + (s.vals[j] - f.vals[j]) * e; if (cmp) cmp[j] = (f.cmp ? f.cmp[j] : f.vals[j]) + (s.cmp[j] - (f.cmp ? f.cmp[j] : f.vals[j])) * e; }
          return { key: s.key, name: s.name, color: s.color, vals, cmp, vis: lerp(f.vis, s.vis, e) };
        }),
      });
      if (!animate) { this.cur = frameAt(1); this.cleanup(); this.draw(); return; }
      this.anim = U.tween(opt.dur || (prev ? 520 : 1100), prev ? U.ease.outQuart : U.ease.outExpo, (e) => { this.cur = frameAt(e); this.draw(); }, () => { this.anim = null; this.cleanup(); this.draw(); });
    }
    cleanup() { this.cur.ser = this.cur.ser.filter((s) => s.vis > 0.001 || this.to.ser.find((t) => t.key === s.key && !t._gone)); }

    highlight(id) { this.hl = id; this.gMarks.querySelectorAll('.tc-mark').forEach((g) => g.classList.toggle('is-hl', g.getAttribute('data-id') === String(id))); }

    /* ---- drawing ---- */
    geom() {
      const { t, r, b, l } = this.o.m, W = this.w, H = this.o.height;
      return { t, r, b, l, W, H, iw: Math.max(10, W - l - r), ih: H - t - b };
    }
    xTicks(g) {
      const md = this.model, n = md.labels.length, band = md.type === 'bar';
      const pos = (i) => (band ? g.l + ((i + 0.5) * g.iw) / n : g.l + (n > 1 ? (i * g.iw) / (n - 1) : g.iw / 2));
      let cand = [];
      if (md.kind === 'day' && n <= 14) cand = md.labels.map((_, i) => i);
      else if (md.kind === 'day' && n <= 62) md.labels.forEach((x, i) => { if (new Date(x.t).getUTCDay() === 1) cand.push(i); });
      else if (md.kind === 'day') md.labels.forEach((x, i) => { if (x.major) cand.push(i); });
      else cand = md.labels.map((_, i) => i);
      if (cand.length < 2 && n > 1) cand = [0, n - 1];
      // thin out so labels keep >= 58px apart
      const gap = cand.length > 1 ? Math.abs(pos(cand[1]) - pos(cand[0])) : g.iw;
      const step = Math.max(1, Math.ceil(58 / Math.max(1, gap)));
      const out = cand.filter((_, k) => k % step === 0);
      return out.map((i) => ({ i, x: pos(i), label: md.labels[i].label }));
    }
    draw() {
      const fr = this.cur, md = this.model;
      if (!fr || !md || !this.w) return;
      const g = this.geom(), n = fr.n, band = md.type === 'bar';
      const X = (i) => (band ? g.l + ((i + 0.5) * g.iw) / n : g.l + (n > 1 ? (i * g.iw) / (n - 1) : g.iw / 2));
      const span = fr.yMax - fr.yMin || 1;
      const Y = (v) => g.t + g.ih * (1 - (v - fr.yMin) / span);
      this.X = X; this.Y = Y;
      const xs = new Array(n); for (let i = 0; i < n; i++) xs[i] = X(i);
      const baseY = g.t + g.ih;
      this.svg.setAttribute('width', g.W); this.svg.setAttribute('viewBox', '0 0 ' + g.W + ' ' + g.H);
      this.hit.setAttribute('x', g.l); this.hit.setAttribute('y', g.t); this.hit.setAttribute('width', g.iw); this.hit.setAttribute('height', g.ih);

      /* defs: clip + gradients */
      let defs = '<clipPath id="' + this.uid + '-clip"><rect x="' + (g.l - 2) + '" y="' + (g.t - 4) + '" width="' + (g.iw + 4) + '" height="' + (g.ih + 6) + '"/></clipPath>';
      fr.ser.forEach((s, k) => { defs += '<linearGradient id="' + this.uid + '-g' + k + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + s.color + ';stop-opacity:' + (fr.ser.length > 1 ? 0.2 : 0.3) + '"/><stop offset="1" style="stop-color:' + s.color + ';stop-opacity:0.01"/></linearGradient>'; });
      this.gDefs.innerHTML = defs;

      /* grid + y labels (ticks come from the target frame so they slide into place) */
      let grid = '';
      for (const v of this.to.ticks) {
        const y = Y(v);
        if (y < g.t - 1 || y > baseY + 1) continue;
        grid += '<line class="' + (v === 0 ? 'base' : 'gl') + '" x1="' + g.l + '" x2="' + (g.l + g.iw) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text x="' + (g.l - 10) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + U.esc((md.fmtY || U.moneyC)(v)) + '</text>';
      }
      if (this.to.broken) grid += '<text class="brk" x="' + g.l + '" y="' + (g.t - 7) + '" text-anchor="start">Axis starts at ' + U.esc((md.fmtY || U.moneyC)(this.to.yMin)) + '</text>';
      this.gGrid.innerHTML = grid;
      let xa = '';
      for (const t of this.xTicks(g)) {
        const tx = U.clamp(t.x, g.l + 10, g.l + g.iw - 10);
        xa += '<line class="xt" x1="' + t.x.toFixed(1) + '" x2="' + t.x.toFixed(1) + '" y1="' + baseY + '" y2="' + (baseY + 4) + '"/><text x="' + tx.toFixed(1) + '" y="' + (baseY + 17) + '" text-anchor="middle">' + U.esc(t.label) + '</text>';
      }
      this.gX.innerHTML = xa;

      /* event bands */
      let bands = '';
      (md.bands || []).forEach((b) => {
        const x0 = band ? g.l + (b.a * g.iw) / n : X(b.a) - (n > 1 ? g.iw / (n - 1) / 2 : 0), x1 = band ? g.l + ((b.b + 1) * g.iw) / n : X(b.b) + (n > 1 ? g.iw / (n - 1) / 2 : 0);
        const xa2 = Math.max(g.l, x0), xb2 = Math.min(g.l + g.iw, x1);
        if (xb2 <= xa2) return;
        bands += '<rect class="band" x="' + xa2.toFixed(1) + '" y="' + g.t + '" width="' + (xb2 - xa2).toFixed(1) + '" height="' + g.ih + '"/>' + (xb2 - xa2 > 46 ? '<text class="band-l" x="' + (xa2 + 6).toFixed(1) + '" y="' + (g.t + 11) + '">' + U.esc(b.label.toUpperCase()) + '</text>' : '');
      });
      this.gBands.innerHTML = bands;

      /* data layers */
      const stack = md.type === 'stack' || md.type === 'bar';
      const base = new Array(n).fill(0);
      let data = '', over = '';
      const multi = fr.ser.filter((s) => s.vis > 0.01).length > 1;
      const cmpTot = new Array(n).fill(0); let anyCmp = false;
      fr.ser.forEach((s, k) => {
        const vis = s.vis; if (vis < 0.004) return;
        if (stack) {
          const top = new Array(n), bot = new Array(n);
          for (let i = 0; i < n; i++) { bot[i] = base[i]; base[i] += s.vals[i] * vis; top[i] = base[i]; if (s.cmp) { cmpTot[i] += s.cmp[i] * vis; anyCmp = true; } }
          if (md.type === 'stack') {
            data += '<path class="st" style="fill:' + s.color + '" d="' + U.monotoneArea(xs, top.map(Y), bot.map(Y)) + '"/>';
            over += '<path class="stl" style="stroke:' + s.color + '" d="' + U.monotone(xs, top.map(Y)) + '"/>';
          } else {
            const bw = Math.max(1, Math.min(56, (g.iw / n) * (n > 120 ? 0.9 : 0.68)));
            let r = '';
            for (let i = 0; i < n; i++) {
              const y0 = Y(top[i]), y1 = Y(bot[i]);
              if (y1 - y0 < 0.2) continue;
              r += '<rect x="' + (xs[i] - bw / 2).toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y1 - y0).toFixed(1) + '"' + (bw > 7 && !multi ? ' rx="2.5"' : '') + '/>';
            }
            data += '<g class="bars" style="fill:' + s.color + '">' + r + '</g>';
          }
        } else {
          const ys = s.vals.map(Y);
          const line = U.monotone(xs, ys);
          if (md.type === 'area') data += '<path class="ar" style="fill:url(#' + this.uid + '-g' + k + ');opacity:' + vis.toFixed(3) + '" d="' + line + 'L' + xs[n - 1].toFixed(1) + ',' + baseY + 'L' + xs[0].toFixed(1) + ',' + baseY + 'Z"/>';
          data += '<path class="ln' + (multi ? '' : ' one') + '" style="stroke:' + s.color + ';opacity:' + vis.toFixed(3) + '" d="' + line + '"/>';
          if (n <= 35 && !multi) for (let i = 0; i < n; i++) data += '<circle class="dot" style="stroke:' + s.color + '" cx="' + xs[i].toFixed(1) + '" cy="' + ys[i].toFixed(1) + '" r="2.6"/>';
          if (s.cmp && fr.cmpA > 0.01) over += '<path class="cm" style="stroke:' + s.color + ';opacity:' + (0.62 * fr.cmpA * vis).toFixed(3) + '" d="' + U.monotone(xs, s.cmp.map(Y)) + '"/>';
        }
      });
      if (stack && anyCmp && fr.cmpA > 0.01) over += '<path class="cm tot" style="opacity:' + (0.85 * fr.cmpA).toFixed(3) + '" d="' + U.monotone(xs, cmpTot.map(Y)) + '"/>';
      this.gData.innerHTML = data + over;

      /* anomaly markers */
      let mk = '';
      (md.marks || []).forEach((m) => {
        if (m.i < 0 || m.i >= n) return;
        const x = xs[m.i].toFixed(1), col = m.sign > 0 ? 'pos' : 'neg';
        mk += '<g class="tc-mark ' + col + (String(this.hl) === String(m.id) ? ' is-hl' : '') + '" data-id="' + m.id + '" data-i="' + m.i + '" tabindex="0" role="button" aria-label="' + U.esc(m.title) + '"><line x1="' + x + '" x2="' + x + '" y1="' + (g.t + 10) + '" y2="' + baseY + '"/><circle class="halo" cx="' + x + '" cy="' + (g.t + 5) + '" r="11"/><path class="dia" d="M' + x + ',' + (g.t - 1) + 'l6,6l-6,6l-6,-6z"/><circle class="hit" cx="' + x + '" cy="' + (g.t + 5) + '" r="14"/></g>';
      });
      this.gMarks.innerHTML = mk;
      if (this.hover >= 0 && !this.anim) this.showAt(this.hover, this.py);
    }

    /* ---- interaction ---- */
    idxAt(px) {
      const g = this.geom(), n = this.model.labels.length, band = this.model.type === 'bar';
      const i = band ? Math.floor(((px - g.l) / g.iw) * n) : Math.round(((px - g.l) / g.iw) * (n - 1));
      return U.clamp(i, 0, n - 1);
    }
    bind() {
      const loc = (e) => { const r = this.svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      let down = null, brushing = false;
      this.hit.addEventListener('pointermove', (e) => {
        if (!this.model) return;
        const p = loc(e), i = this.idxAt(p.x);
        if (down && this.o.brush) {
          if (Math.abs(p.x - down.x) > 6) brushing = true;
          if (brushing) {
            const g = this.geom(), x0 = Math.min(down.x, p.x), x1 = Math.max(down.x, p.x);
            this.sel.setAttribute('x', x0); this.sel.setAttribute('width', x1 - x0); this.sel.setAttribute('height', g.ih); this.sel.style.opacity = 1;
            this.hideTip(); return;
          }
        }
        this.hover = i; this.py = p.y;
        this.showAt(i, p.y);
      });
      this.hit.addEventListener('pointerleave', () => { if (!down) { this.hover = -1; this.hideTip(); } });
      this.hit.addEventListener('pointerdown', (e) => { if (!this.o.brush) return; down = loc(e); brushing = false; this.hit.setPointerCapture(e.pointerId); });
      const up = (e) => {
        if (!down) return;
        const p = loc(e), d0 = down; down = null;
        this.sel.style.opacity = 0; this.sel.setAttribute('width', 0);
        if (brushing) { brushing = false; const a = this.idxAt(Math.min(d0.x, p.x)), b = this.idxAt(Math.max(d0.x, p.x)); if (b - a >= 1 && this.o.onBrush) this.o.onBrush(a, b); }
      };
      this.hit.addEventListener('pointerup', up);
      this.hit.addEventListener('pointercancel', up);
      this.hit.addEventListener('dblclick', () => { if (this.o.brush && this.o.onBrush) this.o.onBrush(null); });
      const markEl = (e) => e.target.closest && e.target.closest('.tc-mark');
      this.gMarks.addEventListener('mouseover', (e) => { const m = markEl(e); if (m) { this.hover = -1; this.showMark(m); if (this.o.onMark) this.o.onMark(m.getAttribute('data-id'), 'enter'); } });
      this.gMarks.addEventListener('mouseout', (e) => { const m = markEl(e); if (m) { this.hideTip(); if (this.o.onMark) this.o.onMark(m.getAttribute('data-id'), 'leave'); } });
      this.gMarks.addEventListener('focusin', (e) => { const m = markEl(e); if (m) this.showMark(m); });
      this.gMarks.addEventListener('focusout', () => this.hideTip());
      this.gMarks.addEventListener('click', (e) => { const m = markEl(e); if (m && this.o.onMark) this.o.onMark(m.getAttribute('data-id'), 'click'); });
      this.gMarks.addEventListener('keydown', (e) => { const m = markEl(e); if (m && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (this.o.onMark) this.o.onMark(m.getAttribute('data-id'), 'click'); } });
    }
    hideTip() { this.tip.classList.remove('on'); this.gCross.innerHTML = ''; }
    place(x, y) {
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight, W = this.w, H = this.o.height;
      let left = x + 16; if (left + tw > W - 4) left = x - tw - 16; left = U.clamp(left, 4, Math.max(4, W - tw - 4));
      const top = U.clamp(y - th / 2, 4, Math.max(4, H - th - 4));
      this.tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    }
    showMark(m) {
      const md = this.model, id = m.getAttribute('data-id'), mk = (md.marks || []).find((x) => String(x.id) === id);
      if (!mk) return;
      this.tip.innerHTML = '<div class="tt-h">' + U.esc(md.labels[mk.i].long) + '</div><div class="tt-note ' + (mk.sign > 0 ? 'pos' : 'neg') + '">' + U.esc(mk.title) + '</div><div class="tt-sub">' + U.esc(mk.sub || '') + '</div>';
      this.tip.classList.add('on');
      this.place(this.X(mk.i), this.geom().t + 40);
    }
    showAt(i, py) {
      const md = this.model, to = this.to;
      if (!md || i < 0 || !this.X) return;
      const g = this.geom(), x = this.X(i), stack = md.type === 'stack' || md.type === 'bar';
      const fmt = md.fmtVal || U.money;
      const vis = to.ser.filter((s) => s.vis && !s._gone);
      let cross = '<line class="cx" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + g.t + '" y2="' + (g.t + g.ih) + '"/>';
      let acc = 0, rows = '', total = 0, cmpTotal = 0, hasCmp = false;
      vis.forEach((s) => {
        const v = s.vals[i];
        acc += v; total += v;
        const y = this.Y(stack ? acc : v);
        if (md.type !== 'bar') cross += '<circle class="cd" style="stroke:' + s.color + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4"/>';
        if (md.cmpOn && s.cmp) { cmpTotal += s.cmp[i]; hasCmp = true; }
      });
      if (md.type === 'bar') cross = '<rect class="cb" x="' + (x - g.iw / (2 * to.n)).toFixed(1) + '" y="' + g.t + '" width="' + (g.iw / to.n).toFixed(1) + '" height="' + g.ih + '"/>';
      const ordered = vis.slice();
      if (vis.length > 1) ordered.sort((a, b) => b.vals[i] - a.vals[i]);
      const single = vis.length === 1;
      ordered.forEach((s) => {
        const v = s.vals[i];
        const d = md.cmpOn && s.cmp && s.cmp[i] > 0 && !single ? v / s.cmp[i] - 1 : null;
        rows += '<div class="tt-r"><i style="background:' + s.color + '"></i><span class="tt-n">' + U.esc(s.name) + '</span><b>' + U.esc(fmt(v)) + '</b>' + (d != null ? '<em class="' + (d >= 0 ? 'pos' : 'neg') + '">' + U.signedPct(d, 0) + '</em>' : '') + '</div>';
      });
      let foot = '';
      if (!single && vis.length > 1) foot += '<div class="tt-r tot"><span class="tt-n">Total</span><b>' + U.esc(fmt(total)) + '</b></div>';
      if (hasCmp) {
        const d = cmpTotal > 0 ? total / cmpTotal - 1 : null;
        foot += '<div class="tt-r cmp"><span class="tt-n">' + U.esc((md.cmpLabels && md.cmpLabels[i]) || 'Previous') + '</span><b>' + U.esc(fmt(cmpTotal)) + '</b>' + (d != null ? '<em class="' + (d >= 0 ? 'pos' : 'neg') + '">' + U.signedPct(d, 1) + '</em>' : '') + '</div>';
      }
      this.tip.innerHTML = '<div class="tt-h">' + U.esc(md.labels[i].long) + '</div>' + rows + foot;
      this.gCross.innerHTML = cross;
      this.tip.classList.add('on');
      this.place(x, py == null ? g.t + g.ih / 2 : py);
      if (this.o.onHover) this.o.onHover(i);
    }
  }
  M.TimeChart = TimeChart;

  /* ======================================================================================
   * Minimap - overview strip with a draggable brush
   * ==================================================================================== */
  class Minimap {
    constructor(host, opts) {
      this.host = host; this.o = Object.assign({ height: 54, onChange: null }, opts);
      host.classList.add('mm');
      this.svg = h('svg', { class: 'mm-svg', height: this.o.height });
      this.path = h('path', { class: 'mm-area' }); this.line = h('path', { class: 'mm-line' });
      this.dimL = h('rect', { class: 'mm-dim' }); this.dimR = h('rect', { class: 'mm-dim' });
      this.win = h('rect', { class: 'mm-win', rx: 5 });
      this.hl = h('rect', { class: 'mm-h', rx: 2, width: 6, tabindex: 0, role: 'slider', 'aria-label': 'Zoom window start' });
      this.hr = h('rect', { class: 'mm-h', rx: 2, width: 6, tabindex: 0, role: 'slider', 'aria-label': 'Zoom window end' });
      this.svg.append(this.path, this.line, this.dimL, this.dimR, this.win, this.hl, this.hr);
      host.append(this.svg);
      this.vals = []; this.a = 0; this.b = 0; this.w = 0;
      this.ro = new ResizeObserver(() => { const w = host.clientWidth; if (w && w !== this.w) { this.w = w; this.draw(); } });
      this.ro.observe(host);
      this.bind();
    }
    set(vals, color) { this.vals = vals; this.color = color; const n = vals.length; if (this.b >= n || this.full) { this.a = 0; this.b = n - 1; this.full = true; } this.w = this.host.clientWidth || this.w; this.draw(); }
    setBrush(a, b) { if (a == null) { this.a = 0; this.b = Math.max(0, this.vals.length - 1); this.full = true; } else { this.a = a; this.b = b; this.full = false; } this.draw(); }
    xOf(i) { const n = this.vals.length; return 6 + (n > 1 ? (i / (n - 1)) * (this.w - 12) : 0); }
    iOf(x) { const n = this.vals.length; return U.clamp(Math.round(((x - 6) / (this.w - 12)) * (n - 1)), 0, n - 1); }
    draw() {
      const n = this.vals.length, H = this.o.height;
      if (!this.w || !n) return;
      this.svg.setAttribute('width', this.w); this.svg.setAttribute('viewBox', '0 0 ' + this.w + ' ' + H);
      const mx = Math.max(...this.vals, 1), xs = this.vals.map((_, i) => this.xOf(i)), ys = this.vals.map((v) => H - 6 - (v / mx) * (H - 14));
      const ln = U.monotone(xs, ys);
      this.path.setAttribute('d', ln + 'L' + xs[n - 1] + ',' + (H - 4) + 'L' + xs[0] + ',' + (H - 4) + 'Z'); this.line.setAttribute('d', ln);
      const x0 = this.xOf(this.a), x1 = this.xOf(this.b);
      this.dimL.setAttribute('x', 0); this.dimL.setAttribute('y', 0); this.dimL.setAttribute('width', Math.max(0, x0)); this.dimL.setAttribute('height', H);
      this.dimR.setAttribute('x', x1); this.dimR.setAttribute('y', 0); this.dimR.setAttribute('width', Math.max(0, this.w - x1)); this.dimR.setAttribute('height', H);
      this.win.setAttribute('x', x0); this.win.setAttribute('y', 1); this.win.setAttribute('width', Math.max(2, x1 - x0)); this.win.setAttribute('height', H - 2);
      this.hl.setAttribute('x', x0 - 3); this.hl.setAttribute('y', H / 2 - 12); this.hl.setAttribute('height', 24);
      this.hr.setAttribute('x', x1 - 3); this.hr.setAttribute('y', H / 2 - 12); this.hr.setAttribute('height', 24);
      this.host.classList.toggle('is-zoomed', !this.full);
    }
    emit(final) { this.full = this.a === 0 && this.b === this.vals.length - 1; this.draw(); if (this.o.onChange) this.o.onChange(this.full ? null : this.a, this.b, final); }
    bind() {
      const loc = (e) => e.clientX - this.svg.getBoundingClientRect().left;
      let mode = null, anchor = 0, a0 = 0, b0 = 0;
      const n = () => this.vals.length;
      this.svg.addEventListener('pointerdown', (e) => {
        const x = loc(e), t = e.target;
        if (t === this.hl) mode = 'l'; else if (t === this.hr) mode = 'r';
        else if (t === this.win && !this.full) { mode = 'pan'; anchor = this.iOf(x); a0 = this.a; b0 = this.b; }
        else { mode = 'new'; anchor = this.iOf(x); this.a = this.b = anchor; }
        this.svg.setPointerCapture(e.pointerId); e.preventDefault();
      });
      this.svg.addEventListener('pointermove', (e) => {
        if (!mode) return;
        const i = this.iOf(loc(e)), min = 2;
        if (mode === 'l') this.a = Math.min(i, this.b - min);
        else if (mode === 'r') this.b = Math.max(i, this.a + min);
        else if (mode === 'new') { this.a = Math.min(anchor, i); this.b = Math.max(anchor, i); }
        else { const d = i - anchor, w = b0 - a0; this.a = U.clamp(a0 + d, 0, n() - 1 - w); this.b = this.a + w; }
        this.emit(false);
      });
      const end = () => { if (!mode) return; if (this.b - this.a < 2) { this.a = 0; this.b = n() - 1; } mode = null; this.emit(true); };
      this.svg.addEventListener('pointerup', end); this.svg.addEventListener('pointercancel', end);
      this.svg.addEventListener('dblclick', () => { this.a = 0; this.b = n() - 1; this.emit(true); });
      [this.hl, this.hr].forEach((hd, k) => hd.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0; if (!d) return; e.preventDefault();
        if (this.full) { this.a = 0; this.b = n() - 1; }
        if (k === 0) this.a = U.clamp(this.a + d, 0, this.b - 2); else this.b = U.clamp(this.b + d, this.a + 2, n() - 1);
        this.emit(true);
      }));
    }
    destroy() { this.ro.disconnect(); U.clear(this.host); }
  }
  M.Minimap = Minimap;

  /* ======================================================================================
   * Spark - tiny tweened sparkline (viewBox-scaled so it needs no resize handling)
   * ==================================================================================== */
  let sparkN = 0;
  class Spark {
    constructor(host, opts) {
      this.o = Object.assign({ w: 120, h: 34, color: 'var(--accent)', fill: true }, opts);
      this.id = 'sp' + ++sparkN; this.host = host; this.vals = null;
      this.svg = h('svg', { class: 'spark', viewBox: '0 0 ' + this.o.w + ' ' + this.o.h, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      this.dot = h('i', { class: 'spark-dot' });
      host.classList.add('spark-host'); host.append(this.svg, this.dot);
    }
    static reduce(v, max) {
      if (v.length <= max) return v;
      const out = [], k = v.length / max;
      for (let i = 0; i < max; i++) { let s = 0, c = 0; for (let j = Math.floor(i * k); j < Math.floor((i + 1) * k); j++) { s += v[j]; c++; } out.push(c ? s / c : 0); }
      return out;
    }
    set(values, color) {
      const to = Spark.reduce(Array.from(values), 48);
      if (color) this.o.color = color;
      const from = this.vals ? U.resample(this.vals, to.length) : to.map(() => Math.min(...to));
      if (this.anim) this.anim.cancel();
      this.anim = U.tween(this.vals ? 500 : 1000, U.ease.outQuart, (e) => { this.vals = to.map((v, i) => from[i] + (v - from[i]) * e); this.draw(); });
    }
    draw() {
      const { w, h: hh } = this.o, v = this.vals, n = v.length;
      const lo = Math.min(...v), hi = Math.max(...v), rg = hi - lo || 1;
      const xs = v.map((_, i) => (n > 1 ? (i / (n - 1)) * w : w / 2)), ys = v.map((x) => hh - 4 - ((x - lo) / rg) * (hh - 9));
      const ln = U.monotone(xs, ys);
      this.svg.innerHTML = (this.o.fill ? '<defs><linearGradient id="' + this.id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + this.o.color + ';stop-opacity:.28"/><stop offset="1" style="stop-color:' + this.o.color + ';stop-opacity:0"/></linearGradient></defs><path d="' + ln + 'L' + w + ',' + hh + 'L0,' + hh + 'Z" fill="url(#' + this.id + ')"/>' : '') + '<path d="' + ln + '" fill="none" style="stroke:' + this.o.color + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
      this.dot.style.left = (xs[n - 1] / w) * 100 + '%'; this.dot.style.top = (ys[n - 1] / hh) * 100 + '%'; this.dot.style.background = this.o.color;
    }
  }
  M.Spark = Spark;

  /* ======================================================================================
   * Gauge - radial pacing gauge (240 degree sweep; target tick at 80% of the arc)
   * ==================================================================================== */
  class Gauge {
    constructor(host) {
      this.host = host;
      const cx = 120, cy = 118, r = 92, a0 = 150, sweep = 240, rad = (a) => (a * Math.PI) / 180;
      const pt = (a, rr) => [cx + rr * Math.cos(rad(a)), cy + rr * Math.sin(rad(a))];
      const s = pt(a0, r), e = pt(a0 + sweep, r);
      const d = 'M' + s[0].toFixed(2) + ',' + s[1].toFixed(2) + 'A' + r + ',' + r + ' 0 1 1 ' + e[0].toFixed(2) + ',' + e[1].toFixed(2);
      const tA = a0 + sweep * 0.8, t0 = pt(tA, r - 14), t1 = pt(tA, r + 11), tl = pt(tA, r - 31);
      let ticks = '';
      for (let i = 0; i <= 25; i++) { const a = a0 + (sweep * i) / 25, p0 = pt(a, r - 13), p1 = pt(a, r - (i % 5 === 0 ? 19 : 16)); ticks += '<line x1="' + p0[0].toFixed(1) + '" y1="' + p0[1].toFixed(1) + '" x2="' + p1[0].toFixed(1) + '" y2="' + p1[1].toFixed(1) + '"/>'; }
      this.svg = h('svg', { class: 'gauge', viewBox: '0 0 240 210', 'aria-hidden': 'true', html: '<path class="g-track" d="' + d + '" pathLength="100"/><g class="g-ticks">' + ticks + '</g><path class="g-proj" d="' + d + '" pathLength="100" style="stroke-dasharray:0 100"/><path class="g-act" d="' + d + '" pathLength="100" style="stroke-dasharray:0 100"/><line class="g-target" x1="' + t0[0].toFixed(1) + '" y1="' + t0[1].toFixed(1) + '" x2="' + t1[0].toFixed(1) + '" y2="' + t1[1].toFixed(1) + '"/><text class="g-tl" x="' + tl[0].toFixed(1) + '" y="' + (tl[1] + 3).toFixed(1) + '" text-anchor="middle">TARGET</text>' });
      this.proj = this.svg.querySelector('.g-proj'); this.act = this.svg.querySelector('.g-act');
      host.append(this.svg);
    }
    /** qtd and proj are fractions of target (1 = target). */
    set(qtd, proj) {
      const f = (v) => Math.min(100, Math.max(0, (v / 1.25) * 100)).toFixed(2);
      this.proj.style.strokeDasharray = f(proj) + ' 100'; this.act.style.strokeDasharray = f(qtd) + ' 100';
      this.proj.classList.toggle('warn', proj < 0.98); this.proj.classList.toggle('ok', proj >= 0.98);
    }
  }
  M.Gauge = Gauge;
})((window.M = window.M || {}));
