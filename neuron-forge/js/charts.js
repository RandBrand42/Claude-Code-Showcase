/* NEURON FORGE - charts: loss curves, accuracy gauges, activation plot, weight histograms */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};
  const { AMBER, CYAN } = NF.color;
  const MONO = '9px Consolas, "Cascadia Mono", monospace';
  const TRAIN = '#e6eeff', TEST = '#b79cff';
  const css = (c, a) => NF.color.css(c, a);

  /* ---------- activation curve (shared by the hover card and the inspector) ---------- */
  NF.drawActivationCurve = function (cv, act, zl, zh) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, f = NF.ACT[act].f, Z = 4;
    g.clearRect(0, 0, W, H);
    const X = z => (z + Z) / (2 * Z) * W, Y = y => H - 6 - (Math.max(-1.3, Math.min(2.3, y)) + 1.3) / 3.6 * (H - 12);
    g.strokeStyle = 'rgba(170,190,255,.22)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.moveTo(X(0), 0); g.lineTo(X(0), H); g.stroke();
    const path = (a, b) => { g.beginPath(); for (let i = 0; i <= 80; i++) { const z = a + (b - a) * i / 80; i ? g.lineTo(X(z), Y(f(z))) : g.moveTo(X(z), Y(f(z))); } };
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(200,215,255,.4)'; path(-Z, Z); g.stroke();
    if (isFinite(zl) && isFinite(zh)) {
      const a = Math.max(-Z, zl), b = Math.min(Z, Math.max(zh, a + 0.05));
      g.strokeStyle = '#ffb224'; g.lineWidth = 4; g.shadowColor = 'rgba(255,178,36,.8)'; g.shadowBlur = 10; path(a, b); g.stroke(); g.shadowBlur = 0;
    }
  };

  /* ---------- loss chart ---------- */
  class LossChart {
    constructor(lab, cv) {
      this.lab = lab; this.cv = cv; this.log = true; this.hoverX = null; this.last = { train: NaN, test: NaN };
      new ResizeObserver(() => this.draw()).observe(cv);
      cv.addEventListener('pointermove', e => { this.hoverX = e.clientX - cv.getBoundingClientRect().left; this.draw(); });
      cv.addEventListener('pointerleave', () => { this.hoverX = null; this.draw(); });
    }
    draw() {
      const { ctx, w, h } = NF.ui.fitCanvas(this.cv), hist = this.lab.hist, n = hist.tl.length;
      ctx.clearRect(0, 0, w, h);
      const M = { l: 38, r: 44, t: 8, b: 18 }, pw = w - M.l - M.r, ph = h - M.t - M.b;
      ctx.font = MONO; ctx.textBaseline = 'middle';
      if (n < 2) {
        ctx.fillStyle = '#8391bd'; ctx.textAlign = 'center'; ctx.fillText('Press Play to start training', w / 2, h / 2);
        ctx.strokeStyle = 'rgba(150,180,255,.14)'; ctx.strokeRect(M.l + .5, M.t + .5, pw, ph); return;
      }
      const xmax = Math.max(n - 1, 20), cols = Math.min(n, Math.floor(pw / 1.5));
      // bin into columns (mean of finite values) so very long runs stay crisp and cheap
      const bin = arr => {
        const out = new Float32Array(cols);
        for (let c = 0; c < cols; c++) {
          const i0 = Math.floor(c * n / cols), i1 = Math.max(i0 + 1, Math.floor((c + 1) * n / cols));
          let s = 0, k = 0; for (let i = i0; i < i1; i++) { const v = arr[i]; if (isFinite(v)) { s += v; k++; } }
          out[c] = k ? s / k : NaN;
        }
        return out;
      };
      const tr = bin(hist.tl), te = bin(hist.te);
      let lo = Infinity, hi = 0;
      for (let c = 0; c < cols; c++) for (const v of [tr[c], te[c]]) if (isFinite(v)) { lo = Math.min(lo, Math.max(v, 1e-6)); hi = Math.max(hi, v); }
      if (!isFinite(lo)) return;
      let y0, y1;
      if (this.log) { y0 = Math.log10(lo) - 0.12; y1 = Math.log10(Math.max(hi, lo * 1.5)) + 0.12; if (y1 - y0 < 1) y0 = y1 - 1; }
      else { y0 = 0; y1 = hi * 1.08 || 1; }
      const Y = v => M.t + ph * (1 - ((this.log ? Math.log10(Math.max(v, 1e-6)) : v) - y0) / (y1 - y0));
        // grid + ticks
      ctx.lineWidth = 1; ctx.textAlign = 'right';
      const ticks = [];
      if (this.log) {
        const minor = y1 - y0 < 2.2;
        for (let d = Math.floor(y0); d <= Math.ceil(y1); d++) for (const m of minor ? [1, 2, 5] : [1]) { const v = m * Math.pow(10, d), lv = Math.log10(v); if (lv >= y0 && lv <= y1) ticks.push({ v, label: String(+v.toPrecision(1)) }); }
      } else { const step = NF.niceStep((y1 - y0) / 4); for (let v = 0; v <= y1; v += step) ticks.push({ v, label: v.toFixed(step < 0.1 ? 2 : 1) }); }
      for (const t of ticks) {
        const y = Math.round(Y(t.v)) + .5; if (y < M.t - 1 || y > M.t + ph + 1) continue;
        ctx.strokeStyle = 'rgba(170,190,255,.10)'; ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke();
        ctx.fillStyle = '#8391bd'; ctx.fillText(t.label, M.l - 5, y);
      }
      ctx.strokeStyle = 'rgba(170,190,255,.3)'; ctx.beginPath(); ctx.moveTo(M.l + .5, M.t); ctx.lineTo(M.l + .5, M.t + ph + .5); ctx.lineTo(M.l + pw, M.t + ph + .5); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillStyle = '#8391bd';
      const xs = NF.niceStep(xmax / 4);
      for (let e = 0; e <= xmax; e += xs) ctx.fillText(String(e), M.l + e / xmax * pw, h - 7);
      // series
      const ends = [];
      const series = [{ a: te, col: TEST, rgb: [183, 156, 255] }, { a: tr, col: TRAIN, rgb: [230, 238, 255] }];
      for (const s of series) {
        // faint raw trace
        ctx.beginPath(); let pen = false;
        for (let c = 0; c < cols; c++) { const v = s.a[c]; if (!isFinite(v)) { pen = false; continue; } const x = M.l + (c / Math.max(1, cols - 1)) * pw * ((n - 1) / xmax), y = Y(v); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }
        ctx.strokeStyle = css(s.rgb, 0.22); ctx.lineWidth = 1; ctx.stroke();
        // smoothed trail that brightens toward "now"
        const sm = new Float32Array(cols); let ema = NaN;
        for (let c = 0; c < cols; c++) { const v = s.a[c]; if (!isFinite(v)) { sm[c] = ema; continue; } ema = isFinite(ema) ? ema + (v - ema) * 0.22 : v; sm[c] = ema; }
        const xEnd = M.l + (cols - 1) / Math.max(1, cols - 1) * pw * ((n - 1) / xmax);
        const gr = ctx.createLinearGradient(M.l, 0, Math.max(M.l + 10, xEnd), 0);
        gr.addColorStop(0, css(s.rgb, 0.25)); gr.addColorStop(1, css(s.rgb, 1));
        ctx.beginPath(); pen = false; let lx = 0, ly = 0;
        for (let c = 0; c < cols; c++) { if (!isFinite(sm[c])) continue; const x = M.l + (c / Math.max(1, cols - 1)) * pw * ((n - 1) / xmax), y = Y(sm[c]); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; lx = x; ly = y; }
        ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.shadowColor = css(s.rgb, .7); ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0;
        if (s.col === TRAIN) { // soft area under the train curve
          ctx.lineTo(lx, M.t + ph); ctx.lineTo(M.l, M.t + ph); ctx.closePath();
          const fg = ctx.createLinearGradient(0, M.t, 0, M.t + ph); fg.addColorStop(0, css(s.rgb, .10)); fg.addColorStop(1, css(s.rgb, 0)); ctx.fillStyle = fg; ctx.fill();
        }
        // "now" dot; value callouts are laid out after both series are drawn
        const cur = s.col === TRAIN ? hist.tl[n - 1] : hist.te[n - 1];
        if (isFinite(cur)) {
          ctx.beginPath(); ctx.arc(lx, Y(cur), 3.2, 0, 7); ctx.fillStyle = s.col; ctx.fill();
          ctx.beginPath(); ctx.arc(lx, Y(cur), 6.5, 0, 7); ctx.strokeStyle = css(s.rgb, .35); ctx.lineWidth = 1; ctx.stroke();
          ends.push({ x: lx, y: Y(cur), v: cur, col: s.col });
        }
      }
      if (ends.length) { // value callouts at the line ends, pushed apart if they would overlap
        ends.sort((p, q) => p.y - q.y);
        if (ends.length > 1 && ends[1].y - ends[0].y < 12) { const mid = (ends[0].y + ends[1].y) / 2; ends[0].ly = mid - 6; ends[1].ly = mid + 6; }
        ctx.textAlign = 'left'; ctx.font = '600 9.5px Consolas, "Cascadia Mono", monospace';
        for (const e of ends) { ctx.fillStyle = e.col; ctx.fillText(fmtV(e.v), Math.min(e.x + 9, w - M.r + 4), e.ly != null ? e.ly : e.y); }
        ctx.font = MONO;
      }
      // hover readout
      if (this.hoverX != null && this.hoverX > M.l && this.hoverX < M.l + pw) {
        const ep = Math.round((this.hoverX - M.l) / pw * xmax);
        if (ep >= 0 && ep < n) {
          const x = M.l + ep / xmax * pw;
          ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + ph); ctx.stroke(); ctx.setLineDash([]);
          const txt = `epoch ${ep}  train ${hist.tl[ep].toFixed(4)}  test ${hist.te[ep].toFixed(4)}`;
          ctx.font = '10px Consolas, "Cascadia Mono", monospace'; const tw = ctx.measureText(txt).width + 12;
          const bx = Math.max(M.l, Math.min(M.l + pw - tw, x - tw / 2));
          ctx.fillStyle = 'rgba(8,12,24,.94)'; ctx.fillRect(bx, M.t + 2, tw, 18); ctx.strokeStyle = 'rgba(170,200,255,.4)'; ctx.strokeRect(bx + .5, M.t + 2.5, tw - 1, 17);
          ctx.fillStyle = '#e1e8ff'; ctx.textAlign = 'left'; ctx.fillText(txt, bx + 6, M.t + 11);
        }
      }
    }
  }
  const fmtV = v => (v < 0.001 && v > 0 ? v.toExponential(0) : v.toFixed(v < 0.1 ? 3 : 2));
  NF.niceStep = function (raw) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };

  /* ---------- accuracy ring gauge ---------- */
  class Gauge {
    constructor(host, label, color) {
      const C = 2 * Math.PI * 31;
      host.innerHTML = `<svg viewBox="0 0 78 78" aria-hidden="true"><circle class="trk" cx="39" cy="39" r="31"/><circle class="val" cx="39" cy="39" r="31" stroke="${color}" style="color:${color}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><b class="num">0%</b><span class="mono-label">${label}</span>`;
      this.C = C; this.val = host.querySelector('.val'); this.txt = host.querySelector('b'); this.host = host; this.shown = 0; this.target = 0;
      host.setAttribute('role', 'img');
    }
    set(v) { this.target = v; this.val.style.strokeDashoffset = this.C * (1 - v); this.host.setAttribute('aria-label', host_label(this.host) + ' ' + Math.round(v * 100) + ' percent'); }
    tick(dt) { // count-up toward the target (frame-rate independent)
      if (Math.abs(this.shown - this.target) < 0.0005) { this.shown = this.target; } else this.shown += (this.target - this.shown) * (1 - Math.exp(-(dt || 0.016) * 14));
      const t = Math.round(this.shown * 100) + '%'; if (this.txt.textContent !== t) this.txt.textContent = t;
    }
  }
  const host_label = h => h.querySelector('.mono-label').textContent;
  NF.Gauge = Gauge;

  /* ---------- activation plot with live pre-activation rug ---------- */
  NF.drawActivationPlot = function (cv, actName, zs) {
    const { ctx, w, h } = NF.ui.fitCanvas(cv), a = NF.ACT[actName], Z = 4;
    ctx.clearRect(0, 0, w, h);
    const M = { l: 22, r: 6, t: 6, b: 16 }, pw = w - M.l - M.r, ph = h - M.t - M.b;
    const X = z => M.l + (z + Z) / (2 * Z) * pw, Y = y => M.t + ph * (1 - (Math.max(-1.6, Math.min(2.6, y)) + 1.6) / 4.2);
    ctx.font = MONO; ctx.textBaseline = 'middle'; ctx.fillStyle = '#8391bd'; ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    for (let z = -Z; z <= Z; z += 2) { ctx.strokeStyle = z === 0 ? 'rgba(170,190,255,.35)' : 'rgba(170,190,255,.09)'; ctx.beginPath(); ctx.moveTo(Math.round(X(z)) + .5, M.t); ctx.lineTo(Math.round(X(z)) + .5, M.t + ph); ctx.stroke(); ctx.fillText(String(z), X(z), h - 6); }
    ctx.textAlign = 'right';
    for (const y of [-1, 0, 1, 2]) { ctx.strokeStyle = y === 0 ? 'rgba(170,190,255,.35)' : 'rgba(170,190,255,.09)'; ctx.beginPath(); ctx.moveTo(M.l, Math.round(Y(y)) + .5); ctx.lineTo(M.l + pw, Math.round(Y(y)) + .5); ctx.stroke(); ctx.fillText(String(y), M.l - 4, Y(y)); }
    // derivative (dashed cyan)
    ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(39,214,242,.85)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const z = -Z + 2 * Z * i / 120, y = a.d(z, a.f(z)); i ? ctx.lineTo(X(z), Y(y)) : ctx.moveTo(X(z), Y(y)); } ctx.stroke(); ctx.setLineDash([]);
    // function (solid amber)
    ctx.strokeStyle = '#ffb224'; ctx.lineWidth = 2.2; ctx.shadowColor = 'rgba(255,178,36,.7)'; ctx.shadowBlur = 8; ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const z = -Z + 2 * Z * i / 120, y = a.f(z); i ? ctx.lineTo(X(z), Y(y)) : ctx.moveTo(X(z), Y(y)); } ctx.stroke(); ctx.shadowBlur = 0;
    // live rug
    if (zs) { ctx.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (z < -Z || z > Z) continue; ctx.beginPath(); ctx.arc(X(z), Y(a.f(z)), 1.7, 0, 7); ctx.fill(); } }
  };

  /* ---------- weight histograms, one row per layer ---------- */
  NF.drawWeightHist = function (cv, net) {
    const rows = net.L, rowH = 30, totalH = rows * (rowH + 4) + 18;
    if (parseInt(cv.style.height, 10) !== totalH) cv.style.height = totalH + 'px';
    const { ctx, w, h } = NF.ui.fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    let mx = 0; for (let l = 0; l < rows; l++) for (let k = net.wOff[l]; k < net.bOff[l]; k++) mx = Math.max(mx, Math.abs(net.P[k]));
    const m = Math.max(1, Math.ceil(mx * 2) / 2), BINS = 25, x0 = 48, bw = (w - x0 - 4) / BINS;
    ctx.font = MONO; ctx.textBaseline = 'middle';
    for (let l = 0; l < rows; l++) {
      const y = l * (rowH + 4), counts = new Uint16Array(BINS), nW = net.bOff[l] - net.wOff[l];
      let peak = 1;
      for (let k = net.wOff[l]; k < net.bOff[l]; k++) { const b = Math.max(0, Math.min(BINS - 1, Math.floor((net.P[k] + m) / (2 * m) * BINS))); peak = Math.max(peak, ++counts[b]); }
      ctx.fillStyle = '#a2afd6'; ctx.textAlign = 'left'; ctx.fillText(l === rows - 1 ? 'out' : 'L' + (l + 1), 0, y + rowH / 2 - 6);
      ctx.fillStyle = '#8391bd'; ctx.fillText(net.sizes[l] + '→' + net.sizes[l + 1], 0, y + rowH / 2 + 6);
      for (let b = 0; b < BINS; b++) {
        const c = counts[b]; if (!c) continue;
        const bh = Math.max(2, c / peak * (rowH - 2)), pos = (b + 0.5) / BINS * 2 * m - m >= 0;
        const col = pos ? AMBER : CYAN;
        ctx.fillStyle = css(col, 0.85); ctx.shadowColor = css(col, .6); ctx.shadowBlur = 5;
        ctx.fillRect(x0 + b * bw + .5, y + rowH - bh, Math.max(1, bw - 1.5), bh);
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(170,190,255,.3)'; ctx.beginPath(); ctx.moveTo(x0, y + rowH + .5); ctx.lineTo(w - 4, y + rowH + .5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.moveTo(x0 + (w - x0 - 4) / 2, y); ctx.lineTo(x0 + (w - x0 - 4) / 2, y + rowH); ctx.stroke();
    }
    ctx.fillStyle = '#8391bd'; ctx.textAlign = 'left'; ctx.fillText('−' + m, x0, h - 6); ctx.textAlign = 'center'; ctx.fillText('0', x0 + (w - x0 - 4) / 2, h - 6); ctx.textAlign = 'right'; ctx.fillText('+' + m, w - 4, h - 6);
  };

  NF.LossChart = LossChart;
})(typeof globalThis !== 'undefined' ? globalThis : window);
