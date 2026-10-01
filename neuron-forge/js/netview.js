/* NEURON FORGE - network diagram
 * Edges + signal particles are painted on one canvas; neurons are DOM discs (each holding a tiny live
 * heatmap canvas) so they can animate, hover and take clicks cheaply. Layout tweens whenever the
 * architecture changes.
 */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};
  const { LUT, AMBER, CYAN } = NF.color;
  const el = NF.ui.el;
  const MAPRES = 24, CARDRES = 44, MAXP = 520;
  const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

  class NetView {
    constructor(lab, o) {
      this.lab = lab; this.host = o.host; this.edgeCv = o.edgeCanvas; this.nodesEl = o.nodesEl;
      this.nodes = new Map(); this.layers = []; this.edges = []; this.heads = [];
      this.hoverNode = null; this.hoverEdge = -1; this.probe = null; this.popEdge = null;
      this.pe = new Int32Array(MAXP); this.pt = new Float32Array(MAXP); this.ps = new Float32Array(MAXP); this.pg = new Int8Array(MAXP); this.pn = 0;
      this.img = new ImageData(MAPRES, MAPRES); this.p24 = new Float32Array(MAPRES * MAPRES);
      this.pCard = new Float32Array(CARDRES * CARDRES);
      this.edgeTip = el('div', { class: 'edge-tip', hidden: true }); this.host.append(this.edgeTip);
      this.card = el('div', { class: 'net-card', hidden: true }); this.host.append(this.card);
      this.dirty = true; this.sized = false;
      this.resize = () => { this.fit = NF.ui.fitCanvas(this.edgeCv); this.layout(); this.dirty = true; };
      new ResizeObserver(this.resize).observe(this.host);
      const hostPos = e => { const r = this.host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      this.host.addEventListener('pointermove', e => { if (!e.target.closest('.disc')) this.onMove(hostPos(e)); });
      this.host.addEventListener('pointerleave', () => this.setHoverEdge(-1));
      this.host.addEventListener('click', e => {
        if (e.target.closest('.disc, .colhead, .edge-pop, .net-card')) return;
        const p = hostPos(e), ei = this.pickEdge(p.x, p.y);
        if (ei >= 0) this.openEdge(ei, p); else this.closeEdge();
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeEdge(); });
      this.sync();
    }

    /* ---------- structure ---------- */
    nodeName(n) {
      if (n.kind === 'in') return 'Input · ' + n.label;
      if (n.kind === 'out') return 'Output neuron';
      return 'Hidden ' + (n.layer) + ' · neuron ' + (n.index + 1);
    }

    sync() {
      const lab = this.lab, feats = lab.cfg.features, hid = lab.cfg.hidden, net = lab.net;
      this.rec24 = lab.newRec(MAPRES); this.recCard = lab.newRec(CARDRES);
      this.featMaps = feats.map((_, i) => lab.featureMap(MAPRES, i));
      const want = [];
      feats.forEach((f, i) => want.push({ key: 'in:' + f, kind: 'in', layer: 0, index: i, label: NF.FEATURE_BY_ID[f].short }));
      hid.forEach((n, l) => { for (let j = 0; j < n; j++) want.push({ key: 'h' + l + ':' + j, kind: 'hid', layer: l + 1, index: j }); });
      want.push({ key: 'out:0', kind: 'out', layer: hid.length + 1, index: 0, label: 'ŷ' });
      const keep = new Set(want.map(w => w.key));
      for (const [k, n] of this.nodes) if (!keep.has(k)) {
        n.el.classList.add('gone'); const e = n.el; setTimeout(() => e.remove(), 320); this.nodes.delete(k);
        if (this.hoverNode === n) this.setHoverNode(null);
      }
      this.layers = [];
      for (const w of want) {
        let n = this.nodes.get(w.key);
        if (!n) n = this.makeNode(w); else Object.assign(n, w);
        (this.layers[w.layer] = this.layers[w.layer] || []).push(n);
      }
      // edges: one per weight, referencing the node objects
      this.edges = [];
      for (let l = 0; l < net.L; l++) for (let j = 0; j < net.sizes[l + 1]; j++) for (let i = 0; i < net.sizes[l]; i++)
        this.edges.push({ l, i, j, idx: net.wOff[l] + j * net.sizes[l] + i, a: this.layers[l][i], b: this.layers[l + 1][j], acc: Math.random() });
      this.geo = new Float32Array(this.edges.length * 8);
      this.act = net.sizes.map(s => new Float32Array(s));
      this.buildHeads();
      this.layout();
      this.updateMaps();
      this.dirty = true;
      this.closeEdge();
    }

    makeNode(w) {
      const cv = el('canvas', { width: MAPRES, height: MAPRES });
      const disc = el('div', { class: 'disc', role: 'img', 'aria-label': '' }, cv);
      const node = el('div', { class: 'node', 'data-kind': w.kind }, disc);
      const n = Object.assign({ el: node, disc, cv, ctx: cv.getContext('2d'), x: 0, y: 0, tx: 0, ty: 0, lx: NaN, ly: NaN, D: 30, fresh: true }, w);
      if (w.kind !== 'hid') { n.lab = el('span', { class: 'nlabel nlabel--' + w.kind }, w.label); node.append(n.lab); }
      disc.addEventListener('pointerenter', () => this.setHoverNode(n));
      disc.addEventListener('pointerleave', () => { if (this.hoverNode === n) this.setHoverNode(null); });
      this.nodesEl.append(node);
      this.nodes.set(w.key, n);
      return n;
    }

    buildHeads() {
      this.heads.forEach(h => h.el.remove()); this.heads = [];
      const lab = this.lab, hid = lab.cfg.hidden, lim = NF.LIMITS;
      this.layers.forEach((col, c) => {
        const last = c === this.layers.length - 1;
        const kids = [el('span', { class: 'mono-label' }, c === 0 ? 'Input' : last ? 'Output' : 'Hidden ' + c)];
        if (c > 0 && !last) {
          const l = c - 1, n = hid[l];
          const setN = v => { const h = hid.slice(); h[l] = v; lab.set({ hidden: h }); };
          const pill = el('div', { class: 'pill', role: 'group', 'aria-label': 'Hidden layer ' + c },
            el('button', { class: 'rm', type: 'button', title: 'Remove this layer', 'aria-label': 'Remove hidden layer ' + c, onclick: () => lab.set({ hidden: hid.filter((_, k) => k !== l) }) }, '×'),
            el('button', { type: 'button', title: 'Remove a neuron', 'aria-label': 'Remove a neuron from hidden layer ' + c, disabled: n <= 1, onclick: () => setN(n - 1) }, '−'),
            el('output', null, String(n)),
            el('button', { type: 'button', title: 'Add a neuron', 'aria-label': 'Add a neuron to hidden layer ' + c, disabled: n >= lim.maxNeurons, onclick: () => setN(n + 1) }, '+'));
          kids.push(pill);
        }
        const head = el('div', { class: 'colhead' }, kids);
        this.host.append(head);
        this.heads.push({ el: head });
      });
    }

    layout() {
      const W = this.host.clientWidth, H = this.host.clientHeight;
      if (!W || !H || !this.layers.length) return;
      const ncol = this.layers.length, top = 66, bottom = 20, avail = H - top - bottom;
      const maxN = Math.max(...this.layers.map(c => c.length));
      const D = Math.max(15, Math.min(46, Math.floor(avail / maxN) - 7));
      const mL = 52, mR = 44, snap = !this.sized || NF.reducedMotion();
      this.layers.forEach((col, c) => {
        const x = ncol === 1 ? W / 2 : mL + (W - mL - mR) * c / (ncol - 1);
        const step = Math.min(avail / col.length, D + 26);
        col.forEach((n, k) => {
          n.tx = x; n.ty = top + avail / 2 + (k - (col.length - 1) / 2) * step;
          n.D = n.kind === 'out' ? Math.min(60, Math.round(D * 1.25)) : D;
          n.disc.style.width = n.disc.style.height = n.D + 'px';
          if (n.lab) n.lab.style.left = (n.kind === 'in' ? -(n.D / 2 + 9) : n.D / 2 + 9) + 'px';
          if (n.fresh || snap) { n.x = n.tx; n.y = n.ty; n.fresh = false; }
        });
        const h = this.heads[c]; if (h) { h.el.style.left = x + 'px'; h.el.style.top = '10px'; }
      });
      this.sized = true;
      for (const n of this.nodes.values()) this.place(n);
    }
    place(n) { if (n.x !== n.lx || n.y !== n.ly) { n.el.style.transform = `translate(${n.x.toFixed(1)}px,${n.y.toFixed(1)}px)`; n.lx = n.x; n.ly = n.y; } }

    /* ---------- live maps inside neurons ---------- */
    updateMaps() {
      const lab = this.lab, net = lab.net, N = MAPRES * MAPRES, L = net.L, aInfo = NF.ACT[net.act];
      lab.probeGrid(MAPRES, this.p24, this.rec24);
      const d = this.img.data;
      const paint = (n, get, scale, center) => {
        for (let s = 0; s < N; s++) {
          const li = NF.color.idx((get(s) - center) / scale);
          d[s * 4] = LUT[li]; d[s * 4 + 1] = LUT[li + 1]; d[s * 4 + 2] = LUT[li + 2]; d[s * 4 + 3] = 255;
        }
        n.ctx.putImageData(this.img, 0, 0);
      };
      for (let i = 0; i < this.act[0].length; i++) { const m = this.featMaps[i]; let s = 0; for (let k = 0; k < N; k += 7) s += Math.abs(m[k]); this.act[0][i] = s / (N / 7); }
      for (const n of this.nodes.values()) {
        if (n.kind === 'in') { const m = this.featMaps[n.index]; paint(n, s => m[s], 1, 0); n.el.classList.remove('dead'); continue; }
        if (n.kind === 'out') { paint(n, s => this.p24[s], 0.5, 0.5); continue; }
        const a = this.rec24.a[n.layer - 1], o = n.index * N;
        let mx = 0, mn = Infinity, sum = 0;
        for (let s = 0; s < N; s++) { const v = a[o + s]; mx = Math.max(mx, Math.abs(v)); mn = Math.min(mn, v); sum += Math.abs(v); }
        this.act[n.layer][n.index] = sum / N;
        const sig = net.act === 'sigmoid', center = sig ? 0.5 : 0;
        const scale = aInfo.bounded ? (sig ? 0.5 : 1) : Math.max(mx, 0.3);
        n.flat = (mx - Math.max(0, mn) < 1e-3 && !sig) || (sig && mx - mn < 1e-3);
        n.el.classList.toggle('dead', n.flat && (net.act === 'relu' || net.act === 'leaky'));
        paint(n, s => a[o + s], scale, center);
      }
      this.act[net.L][0] = 1;
      if (this.hoverNode) this.updateCard();
      this.dirty = true;
    }

    /** Hover-point probe from the decision boundary: particles then follow that single input. */
    setProbe(pt) {
      if (!pt) { this.probe = null; return; }
      this.lab.predict(pt.x, pt.y);
      this.probe = this.lab.net.a.map(a => Float32Array.from(a));
    }

    /* ---------- hover card for a neuron ---------- */
    setHoverNode(n) {
      this.hoverNode = n;
      for (const m of this.nodes.values()) {
        const linked = !n || m === n || this.edges.some(e => (e.a === n && e.b === m) || (e.b === n && e.a === m));
        m.el.classList.toggle('dim', !linked); m.el.classList.toggle('hot', m === n);
      }
      if (!n) { this.card.hidden = true; this.dirty = true; return; }
      this.card.hidden = false;
      this.card.replaceChildren(
        el('h4', null, this.nodeName(n)),
        el('canvas', { width: CARDRES, height: CARDRES }),
        el('div', { class: 'kv bias' }), el('div', { class: 'kv rng' }), el('div', { class: 'kv fan' }),
        n.kind === 'hid' ? el('canvas', { class: 'aplot', width: 340, height: 92 }) : null);
      this.updateCard();
      const W = this.host.clientWidth, H = this.host.clientHeight, ch = this.card.offsetHeight, onLeft = n.tx > W * 0.55;
      this.card.style.top = Math.max(4, Math.min(H - ch - 4, n.ty - ch / 2)) + 'px';
      this.card.style.left = Math.max(6, onLeft ? n.tx - n.D / 2 - 186 : n.tx + n.D / 2 + 10) + 'px';
      this.dirty = true;
    }
    updateCard() {
      const n = this.hoverNode; if (!n || this.card.hidden) return;
      const lab = this.lab, net = lab.net, N = CARDRES * CARDRES, cv = this.card.querySelector('canvas');
      let get, lo = 0, hi = 0, scale = 1, center = 0;
      if (n.kind === 'in') { const m = lab.featureMap(CARDRES, n.index); get = s => m[s]; lo = -1; hi = 1; }
      else {
        lab.probeGrid(CARDRES, this.pCard, this.recCard);
        if (n.kind === 'out') { get = s => this.pCard[s]; scale = 0.5; center = 0.5; lo = 0; hi = 1; }
        else {
          const a = this.recCard.a[n.layer - 1], o = n.index * N; get = s => a[o + s];
          lo = Infinity; hi = -Infinity; for (let s = 0; s < N; s++) { lo = Math.min(lo, a[o + s]); hi = Math.max(hi, a[o + s]); }
          scale = NF.ACT[net.act].bounded ? (net.act === 'sigmoid' ? 0.5 : 1) : Math.max(Math.abs(lo), Math.abs(hi), 0.3); center = net.act === 'sigmoid' ? 0.5 : 0;
        }
      }
      const g = cv.getContext('2d'), img = g.createImageData(CARDRES, CARDRES), d = img.data;
      for (let s = 0; s < N; s++) { const li = NF.color.idx((get(s) - center) / scale); d[s * 4] = LUT[li]; d[s * 4 + 1] = LUT[li + 1]; d[s * 4 + 2] = LUT[li + 2]; d[s * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
      const f = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3);
      const set = (cls, k, v) => { const r = this.card.querySelector('.' + cls); r.replaceChildren(el('span', null, k), el('b', null, v)); };
      if (n.kind === 'in') {
        set('bias', 'signal', 'raw feature'); set('rng', 'range', '−1 … +1'); set('fan', 'feeds', net.sizes[1] + ' neurons');
      } else {
        const l = n.layer - 1, bias = net.P[net.bOff[l] + n.index];
        let inSum = 0; for (let i = 0; i < net.sizes[l]; i++) inSum += Math.abs(net.P[net.wOff[l] + n.index * net.sizes[l] + i]);
        set('bias', 'bias', f(bias)); set('rng', 'output range', lo.toFixed(2) + ' … ' + hi.toFixed(2)); set('fan', 'incoming Σ|w|', inSum.toFixed(2));
        this.card.querySelector('.bias b').style.color = bias >= 0 ? 'var(--amber-hot)' : 'var(--cyan-hot)';
        const ap = this.card.querySelector('.aplot');
        if (ap) { const z = this.recCard.z[l]; let zl = Infinity, zh = -Infinity; for (let s = 0; s < N; s++) { const v = z[n.index * N + s]; zl = Math.min(zl, v); zh = Math.max(zh, v); } NF.drawActivationCurve(ap, net.act, zl, zh); }
      }
    }

    /* ---------- edges: hit test, tooltip, scrubber ---------- */
    pickEdge(mx, my) {
      let best = -1, bd = 49; const g = this.geo;
      for (let i = 0; i < this.edges.length; i++) {
        const o = i * 8; let px = g[o], py = g[o + 1];
        const minx = Math.min(g[o], g[o + 6]) - 8, maxx = Math.max(g[o], g[o + 6]) + 8;
        if (mx < minx || mx > maxx) continue;
        for (let s = 1; s <= 10; s++) {
          const t = s / 10, u = 1 - t;
          const x = u * u * u * g[o] + 3 * u * u * t * g[o + 2] + 3 * u * t * t * g[o + 4] + t * t * t * g[o + 6];
          const y = u * u * u * g[o + 1] + 3 * u * u * t * g[o + 3] + 3 * u * t * t * g[o + 5] + t * t * t * g[o + 7];
          const vx = x - px, vy = y - py, L2 = vx * vx + vy * vy || 1;
          const k = Math.max(0, Math.min(1, ((mx - px) * vx + (my - py) * vy) / L2));
          const dx = px + vx * k - mx, dy = py + vy * k - my, dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = i; }
          px = x; py = y;
        }
      }
      return best;
    }
    onMove(p) {
      if (this.popEdge) return;
      const ei = this.pickEdge(p.x, p.y);
      this.setHoverEdge(ei);
      if (ei >= 0) {
        const e = this.edges[ei], w = this.lab.net.P[e.idx];
        this.edgeTip.hidden = false;
        this.edgeTip.textContent = `${this.nodeName(e.a)} → ${this.nodeName(e.b)}   w = ${(w >= 0 ? '+' : '−') + Math.abs(w).toFixed(3)}`;
        const tw = this.edgeTip.offsetWidth;
        this.edgeTip.style.left = Math.max(4, Math.min(this.host.clientWidth - tw - 4, p.x + 12)) + 'px'; this.edgeTip.style.top = Math.max(4, p.y - 30) + 'px';
      } else this.edgeTip.hidden = true;
    }
    setHoverEdge(ei) { if (ei === this.hoverEdge) return; this.hoverEdge = ei; this.host.style.cursor = ei >= 0 ? 'pointer' : ''; if (ei < 0) this.edgeTip.hidden = true; this.dirty = true; }

    openEdge(ei, p) {
      this.closeEdge();
      const e = this.edges[ei], lab = this.lab, w0 = lab.net.P[e.idx];
      this.popEdge = ei; this.edgeTip.hidden = true;
      const val = el('div', { class: 'wv num' });
      const fmt = v => { val.textContent = (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2); val.style.color = v >= 0 ? 'var(--amber-hot)' : 'var(--cyan-hot)'; };
      const sl = el('input', { class: 'slider slider--bipolar', type: 'range', min: -3, max: 3, step: 0.01, 'aria-label': 'Weight value' });
      const apply = v => { lab.setWeight(e.idx, v); fmt(v); };
      sl.value = Math.max(-3, Math.min(3, w0)); fmt(w0);
      sl.addEventListener('input', () => apply(+sl.value));
      const pop = el('div', { class: 'edge-pop', role: 'dialog', 'aria-label': 'Edit weight' },
        el('span', { class: 'mono-label' }, this.nodeName(e.a) + ' → ' + this.nodeName(e.b)), val, sl,
        el('div', { class: 'row' },
          el('button', { class: 'btn btn--sm', type: 'button', onclick: () => { sl.value = 0; apply(0); } }, 'Zero'),
          el('button', { class: 'btn btn--sm', type: 'button', onclick: () => { const v = -lab.net.P[e.idx]; sl.value = Math.max(-3, Math.min(3, v)); apply(v); } }, 'Flip'),
          el('button', { class: 'btn btn--sm btn--ghost', type: 'button', style: 'margin-left:auto', onclick: () => this.closeEdge() }, 'Done')),
        el('p', { class: 'mono-label', style: 'margin-top:9px;letter-spacing:.04em;text-transform:none;font-weight:500;line-height:1.4' }, 'Pause training to hold it still; otherwise the optimiser keeps adjusting.'));
      this.host.append(pop); this.pop = pop;
      pop.style.left = Math.max(6, Math.min(this.host.clientWidth - 236, p.x - 112)) + 'px';
      pop.style.top = Math.max(6, Math.min(this.host.clientHeight - pop.offsetHeight - 6, p.y + 14)) + 'px';
      this.dirty = true;
    }
    closeEdge() { if (this.pop) { this.pop.remove(); this.pop = null; } this.popEdge = null; this.dirty = true; }

    /* ---------- per-frame: tween nodes, draw edges + particles ---------- */
    frame(dt, flowing) {
      let moving = false;
      const k = 1 - Math.exp(-dt * 11), still = NF.reducedMotion();
      for (const n of this.nodes.values()) {
        const dx = n.tx - n.x, dy = n.ty - n.y;
        if (still || (Math.abs(dx) < .25 && Math.abs(dy) < .25)) { n.x = n.tx; n.y = n.ty; } else { n.x += dx * k; n.y += dy * k; moving = true; }
        this.place(n);
      }
      if (moving || this.dirty || this.pn > 0 || flowing) { this.draw(dt, flowing && !still); this.dirty = false; }
    }

    draw(dt, flowing) {
      if (!this.fit) return;
      const { ctx, w, h } = this.fit, net = this.lab.net, P = net.P, E = this.edges, g = this.geo;
      ctx.clearRect(0, 0, w, h);
      const hn = this.hoverNode, he = this.hoverEdge >= 0 ? this.hoverEdge : this.popEdge;
      const many = E.length > 260, thin = many ? 0.7 : 1;
      ctx.lineCap = 'round';
      for (let i = 0; i < E.length; i++) {
        const e = E[i], a = e.a, b = e.b, o = i * 8;
        const x0 = a.x + a.D / 2 + 2, y0 = a.y, x1 = b.x - b.D / 2 - 2, y1 = b.y, mx = (x0 + x1) / 2;
        g[o] = x0; g[o + 1] = y0; g[o + 2] = mx; g[o + 3] = y0; g[o + 4] = mx; g[o + 5] = y1; g[o + 6] = x1; g[o + 7] = y1;
      }
      const pass = (glow) => {
        for (let i = 0; i < E.length; i++) {
          const e = E[i], wv = P[e.idx], aw = Math.abs(wv), o = i * 8;
          const hi = hn ? (e.a === hn || e.b === hn) : he != null && he >= 0 ? i === he : null;
          const dim = hi === null ? 1 : hi ? 1 : (hn ? 0.06 : 0.2);
          let lw = (0.45 + 4.4 * (1 - Math.exp(-aw * 0.85))) * thin, al = (0.16 + 0.74 * (1 - Math.exp(-aw * 1.1))) * dim;
          if (hi) { lw *= 1.5; al = Math.min(1, al * 1.3); }
          if (glow && (many && !hi)) continue;
          const c = wv >= 0 ? AMBER : CYAN;
          ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${glow ? al * 0.16 : al})`;
          ctx.lineWidth = glow ? lw * 3.4 + 2 : lw;
          ctx.beginPath(); ctx.moveTo(g[o], g[o + 1]); ctx.bezierCurveTo(g[o + 2], g[o + 3], g[o + 4], g[o + 5], g[o + 6], g[o + 7]); ctx.stroke();
        }
      };
      ctx.globalCompositeOperation = 'lighter'; pass(true); ctx.globalCompositeOperation = 'source-over'; pass(false);
      this.particles(ctx, dt, flowing, P);
    }

    particles(ctx, dt, flowing, P) {
      const E = this.edges, g = this.geo, act = this.probe || this.act;
      const active = flowing || this.probe;
      if (active && dt > 0) {
        const share = 1 / (1 + E.length / 140);
        for (let i = 0; i < E.length && this.pn < MAXP; i++) {
          const e = E[i], s = P[e.idx] * (act[e.l][e.i] || 0), m = Math.min(1, Math.abs(s) * 0.9);
          e.acc += dt * (0.05 + 1.5 * m) * share * (this.probe ? 2.2 : 1);
          if (e.acc >= 1) { e.acc = 0; const k = this.pn++; this.pe[k] = i; this.pt[k] = 0; this.ps[k] = 0.5 + Math.random() * 0.4; this.pg[k] = s >= 0 ? 1 : -1; }
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < this.pn; k++) {
        this.pt[k] += this.ps[k] * dt;
        if (this.pt[k] >= 1 || this.pe[k] >= E.length) { this.pn--; this.pe[k] = this.pe[this.pn]; this.pt[k] = this.pt[this.pn]; this.ps[k] = this.ps[this.pn]; this.pg[k] = this.pg[this.pn]; k--; continue; }
        const o = this.pe[k] * 8, t = this.pt[k], u = 1 - t;
        const x = u * u * u * g[o] + 3 * u * u * t * g[o + 2] + 3 * u * t * t * g[o + 4] + t * t * t * g[o + 6];
        const y = u * u * u * g[o + 1] + 3 * u * u * t * g[o + 3] + 3 * u * t * t * g[o + 5] + t * t * t * g[o + 7];
        const c = this.pg[k] > 0 ? AMBER : CYAN, al = Math.sin(Math.PI * t);
        ctx.fillStyle = `rgba(${Math.min(255, c[0] + 60)},${Math.min(255, c[1] + 50)},${Math.min(255, c[2] + 30)},${0.9 * al})`;
        ctx.beginPath(); ctx.arc(x, y, 1.9, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  NF.NetView = NetView;
})(typeof globalThis !== 'undefined' ? globalThis : window);
