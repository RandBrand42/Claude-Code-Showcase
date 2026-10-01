/* NEURON FORGE - decision boundary view + small thumbnail painters */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};
  const { LUT, AMBER, CYAN } = NF.color;
  const LIM = NF.LIM, RES = 120;
  const PAD = { l: 26, r: 10, t: 10, b: 22 };

  /** Marching squares at `level` over a res x res field. Writes x1,y1,x2,y2 (grid units) to out; returns count. */
  function contour(p, res, level, out) {
    let n = 0;
    const seg = (x1, y1, x2, y2) => { out[n++] = x1; out[n++] = y1; out[n++] = x2; out[n++] = y2; };
    for (let y = 0; y < res - 1; y++) for (let x = 0; x < res - 1; x++) {
      const a = p[y * res + x], b = p[y * res + x + 1], c = p[(y + 1) * res + x + 1], d = p[(y + 1) * res + x];
      const idx = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
      if (idx === 0 || idx === 15 || n > out.length - 8) continue;
      const tx = x + (level - a) / (b - a), ry = y + (level - b) / (c - b), bx = x + (level - d) / (c - d), ly = y + (level - a) / (d - a);
      switch (idx) {
        case 1: case 14: seg(x, ly, tx, y); break;
        case 2: case 13: seg(tx, y, x + 1, ry); break;
        case 3: case 12: seg(x, ly, x + 1, ry); break;
        case 4: case 11: seg(x + 1, ry, bx, y + 1); break;
        case 5: seg(x, ly, tx, y); seg(x + 1, ry, bx, y + 1); break;
        case 6: case 9: seg(tx, y, bx, y + 1); break;
        case 7: case 8: seg(x, ly, bx, y + 1); break;
        case 10: seg(tx, y, x + 1, ry); seg(x, ly, bx, y + 1); break;
      }
    }
    return n;
  }

  class BoundaryView {
    constructor(lab, canvas, host) {
      this.lab = lab; this.cv = canvas; this.host = host;
      this.p = new Float32Array(RES * RES);
      this.heat = document.createElement('canvas'); this.heat.width = this.heat.height = RES;
      this.hctx = this.heat.getContext('2d'); this.img = this.hctx.createImageData(RES, RES);
      this.segs = new Float32Array(RES * RES * 4); this.nseg = 0;
      this.hover = null; this.sprites = {}; this.showErr = true;
      this.onHover = null; this.lastCost = 4;
      new ResizeObserver(() => { this.resize(); this.draw(); }).observe(host);
      const ptr = e => {
        const r = canvas.getBoundingClientRect(), g = this.geom(r.width, r.height);
        const wx = ((e.clientX - r.left - g.x) / g.size) * 2 * LIM - LIM, wy = LIM - ((e.clientY - r.top - g.y) / g.size) * 2 * LIM;
        this.hover = Math.abs(wx) <= LIM && Math.abs(wy) <= LIM ? { x: wx, y: wy } : null;
        this.onHover && this.onHover(this.hover);
        this.draw();
      };
      canvas.addEventListener('pointermove', ptr);
      canvas.addEventListener('pointerdown', ptr);
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.onHover && this.onHover(null); this.draw(); });
      this.resize();
    }

    resize() { this.fit = NF.ui.fitCanvas(this.cv); }
    geom(w, h) { const size = Math.min(w - PAD.l - PAD.r, h - PAD.t - PAD.b); return { x: PAD.l + (w - PAD.l - PAD.r - size) / 2, y: PAD.t, size }; }

    /** Re-evaluate the network on the grid and rebuild heat image + contour. */
    refresh() {
      const t0 = performance.now();
      this.lab.probeGrid(RES, this.p, null);
      const d = this.img.data, p = this.p;
      for (let i = 0; i < p.length; i++) {
        const li = NF.color.idx(p[i] * 2 - 1);
        d[i * 4] = LUT[li]; d[i * 4 + 1] = LUT[li + 1]; d[i * 4 + 2] = LUT[li + 2]; d[i * 4 + 3] = 255;
      }
      this.hctx.putImageData(this.img, 0, 0);
      this.nseg = contour(p, RES, 0.5, this.segs);
      this.lastCost = performance.now() - t0;
    }

    spriteSet(scale) {
      const key = scale.toFixed(2);
      if (this.sprites[key]) return this.sprites[key];
      const r = 4.4 * scale, S = Math.ceil(r * 6), set = {};
      const mk = (rgb, test) => {
        const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), m = S / 2;
        const gl = g.createRadialGradient(m, m, r * 0.5, m, m, r * 2.7);
        gl.addColorStop(0, NF.color.css(rgb, test ? 0.3 : 0.55)); gl.addColorStop(1, NF.color.css(rgb, 0));
        g.fillStyle = gl; g.fillRect(0, 0, S, S);
        g.beginPath(); g.arc(m, m, r + 1.3 * scale, 0, 7); g.fillStyle = '#04060c'; g.fill();          // dark keyline so dots pop off any heat colour
        g.beginPath(); g.arc(m, m, r, 0, 7);
        if (test) { g.fillStyle = '#0a0f1c'; g.fill(); g.lineWidth = 2 * scale; g.strokeStyle = NF.color.css(rgb, 1); g.stroke(); }
        else { g.fillStyle = NF.color.css(rgb.map(v => Math.min(255, v + 25)), 1); g.fill(); }
        return c;
      };
      set.train = [mk(CYAN, false), mk(AMBER, false)]; set.test = [mk(CYAN, true), mk(AMBER, true)]; set.S = S;
      return (this.sprites[key] = set);
    }

    draw() { if (!this.fit) return; const { ctx, w, h } = this.fit; this.paint(ctx, w, h, 1, this.hover); }

    /** Paint everything into ctx at w x h CSS px (scale = pixel density for sprites/linewidths). */
    paint(ctx, w, h, scale, hover) {
      const g = this.geom(w, h), { x: X, y: Y, size: S } = g, lab = this.lab, d = lab.data;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.heat, 0, 0, RES, RES, X, Y, S, S);                  // bilinear upscale of the 120x120 field
      // technical-drawing grid + ticks
      ctx.lineWidth = 1; ctx.font = `${9 * scale}px Consolas, "Cascadia Mono", monospace`; ctx.textBaseline = 'middle';
      for (let v = -LIM; v <= LIM; v += 2) {
        const sx = X + (v + LIM) / (2 * LIM) * S, sy = Y + (LIM - v) / (2 * LIM) * S, axis = v === 0;
        ctx.strokeStyle = axis ? 'rgba(200,215,255,.22)' : 'rgba(200,215,255,.07)';
        ctx.beginPath(); ctx.moveTo(sx, Y); ctx.lineTo(sx, Y + S); ctx.moveTo(X, sy); ctx.lineTo(X + S, sy); ctx.stroke();
        ctx.strokeStyle = 'rgba(170,190,255,.45)';
        ctx.beginPath(); ctx.moveTo(sx, Y + S); ctx.lineTo(sx, Y + S + 4); ctx.moveTo(X - 4, sy); ctx.lineTo(X, sy); ctx.stroke();
        ctx.fillStyle = 'rgba(150,165,205,.85)';
        ctx.textAlign = 'center'; ctx.fillText(String(v), sx, Y + S + 12);
        ctx.textAlign = 'right'; ctx.fillText(String(v), X - 6, sy);
      }
      ctx.strokeStyle = 'rgba(170,190,255,.5)'; ctx.strokeRect(X + .5, Y + .5, S - 1, S - 1);
      // luminous 0.5 contour
      if (this.nseg) {
        const sg = this.segs, k = S / RES;
        ctx.beginPath();
        for (let i = 0; i < this.nseg; i += 4) { ctx.moveTo(X + (sg[i] + .5) * k, Y + (sg[i + 1] + .5) * k); ctx.lineTo(X + (sg[i + 2] + .5) * k, Y + (sg[i + 3] + .5) * k); }
        ctx.lineCap = 'round';
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,200,110,.16)'; ctx.lineWidth = 9 * scale; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,225,170,.32)'; ctx.lineWidth = 4 * scale; ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,.96)'; ctx.lineWidth = 1.5 * scale; ctx.stroke();
      }
      // data points
      const sp = this.spriteSet(scale), half = sp.S / 2 / scale, n = d.n, nt = lab.nTrain;
      ctx.save(); ctx.beginPath(); ctx.rect(X - 6, Y - 6, S + 12, S + 12); ctx.clip();
      for (let i = 0; i < n; i++) {
        const sx = X + (d.X1[i] + LIM) / (2 * LIM) * S, sy = Y + (LIM - d.X2[i]) / (2 * LIM) * S;
        ctx.drawImage((i < nt ? sp.train : sp.test)[d.y[i]], sx - half, sy - half, half * 2, half * 2);
      }
      if (this.showErr) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < n; i++) {
          if ((lab.pred[i] >= 0.5) === (d.y[i] === 1)) continue;
          const sx = X + (d.X1[i] + LIM) / (2 * LIM) * S, sy = Y + (LIM - d.X2[i]) / (2 * LIM) * S;
          ctx.beginPath(); ctx.arc(sx, sy, 1.7 * scale, 0, 7); ctx.fill();
        }
      }
      ctx.restore();
      // hover crosshair
      if (hover) {
        const hx = X + (hover.x + LIM) / (2 * LIM) * S, hy = Y + (LIM - hover.y) / (2 * LIM) * S;
        ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(hx, Y); ctx.lineTo(hx, Y + S); ctx.moveTo(X, hy); ctx.lineTo(X + S, hy); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(hx, hy, 7 * scale, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.beginPath(); ctx.arc(hx, hy, 2 * scale, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }

    /** Shareable PNG: boundary plus a title strip. Returns a canvas. */
    snapshot(caption) {
      const W = 1200, H = 1320, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b1224'); bg.addColorStop(1, '#05070d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(60, 170);
      this.paint(ctx, 1080, 1080, 1.7, null);
      ctx.restore();
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.fillStyle = '#e1e8ff'; ctx.font = '300 54px "Segoe UI Variable Display","Segoe UI",sans-serif';
      ctx.fillText('N E U R O N   F O R G E', 60, 98);
      ctx.fillStyle = '#ffb224'; ctx.font = '600 22px Consolas,"Cascadia Mono",monospace';
      ctx.fillText(caption.head, 60, 140);
      ctx.fillStyle = '#a2afd6'; ctx.font = '500 24px Consolas,"Cascadia Mono",monospace';
      ctx.fillText(caption.line1, 60, 1290 - 16);
      ctx.textAlign = 'right'; ctx.fillStyle = '#8391bd'; ctx.font = '500 20px Consolas,"Cascadia Mono",monospace';
      ctx.fillText(caption.line2, W - 60, 1290 - 16);
      return cv;
    }
  }
  NF.BoundaryView = BoundaryView;

  /* ---------- thumbnails ---------- */
  NF.drawDatasetThumb = function (cv, kind) {
    const S = 64; cv.width = cv.height = S * 2;
    const g = cv.getContext('2d'); g.scale(2, 2);
    const d = NF.makeDataset(kind, 140, 4, 3, 0);
    g.fillStyle = '#060912'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < d.n; i++) {
      const x = (d.X1[i] + LIM) / (2 * LIM) * (S - 10) + 5, y = (LIM - d.X2[i]) / (2 * LIM) * (S - 10) + 5;
      g.beginPath(); g.arc(x, y, 1.9, 0, 7); g.fillStyle = d.y[i] ? '#ffb224' : '#27d6f2'; g.fill();
    }
  };
  NF.drawFeatureThumb = function (cv, id) {
    const R = 22, f = NF.FEATURE_BY_ID[id].f; cv.width = cv.height = R;
    const g = cv.getContext('2d'), img = g.createImageData(R, R);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const v = f(-LIM + (x + .5) / R * 2 * LIM, LIM - (y + .5) / R * 2 * LIM), li = NF.color.idx(v), o = (y * R + x) * 4;
      img.data[o] = LUT[li]; img.data[o + 1] = LUT[li + 1]; img.data[o + 2] = LUT[li + 2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
