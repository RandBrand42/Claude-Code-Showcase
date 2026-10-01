/* Mnemo graph: force-directed layout (Barnes-Hut quadtree repulsion, link springs, gravity, cooling) + canvas renderer.
 * Used twice: a small "neighbourhood" panel in the sidebar and the full-screen night-sky view. */
(function (M) {
  'use strict';

  const PALETTE = ['#f2c879', '#7fb2ff', '#f08f9c', '#6fd3c4', '#b79bff', '#ffa47a', '#b4dd7a', '#e69be0', '#8ed6f0'];
  const OTHER = '#8d9bb5';
  const glowCache = new Map();
  const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (h, a) => { const c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  function glow(color) {
    let c = glowCache.get(color);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 96;
      const x = c.getContext('2d'), g = x.createRadialGradient(48, 48, 0, 48, 48, 48);
      g.addColorStop(0, rgba(color, 0.65)); g.addColorStop(0.35, rgba(color, 0.22)); g.addColorStop(1, rgba(color, 0));
      x.fillStyle = g; x.fillRect(0, 0, 96, 96); glowCache.set(color, c);
    }
    return c;
  }

  /* ---------- community detection: label propagation, best-of-N by modularity ---------- */
  function labelProp(ids, adj, rand) {
    const label = new Map(ids.map(id => [id, id])), order = ids.slice();
    for (let it = 0; it < 30; it++) {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      let changed = 0;
      for (const id of order) {
        const nb = adj.get(id); if (!nb || !nb.size) continue;
        const cnt = new Map();
        nb.forEach(o => { const l = label.get(o); cnt.set(l, (cnt.get(l) || 0) + 1); });
        let best = null, bc = -1;
        cnt.forEach((c, l) => { if (c > bc || (c === bc && l < best)) { best = l; bc = c; } });
        if (best !== label.get(id)) { label.set(id, best); changed++; }
      }
      if (!changed) break;
    }
    return label;
  }
  function modularity(label, edges) {
    const m = edges.length; if (!m) return 0;
    const inside = new Map(), deg = new Map();
    edges.forEach(([a, b]) => {
      const la = label.get(a), lb = label.get(b);
      deg.set(la, (deg.get(la) || 0) + 1); deg.set(lb, (deg.get(lb) || 0) + 1);
      if (la === lb) inside.set(la, (inside.get(la) || 0) + 1);
    });
    let q = 0; deg.forEach((d, l) => { q += (inside.get(l) || 0) / m - Math.pow(d / (2 * m), 2); });
    return q;
  }

  /* Returns {cluster: Map id->rank, clusters:[{rank,color,label,size}], tagColor: Map tag->color, modularity} */
  function analyze(nodes, edges) {
    const adj = new Map(nodes.map(n => [n.id, new Set()]));
    edges.forEach(([a, b]) => { if (adj.has(a) && adj.has(b)) { adj.get(a).add(b); adj.get(b).add(a); } });
    const ids = nodes.map(n => n.id).sort();
    let best = null, bq = -2;
    for (let s = 0; s < 14; s++) {
      const lab = labelProp(ids, adj, M.mulberry(1000 + s * 77)), q = modularity(lab, edges);
      if (q > bq + 1e-9) { bq = q; best = lab; }
    }
    const groups = new Map();
    nodes.forEach(n => { const l = best.get(n.id); (groups.get(l) || groups.set(l, []).get(l)).push(n); });
    const sorted = Array.from(groups.values()).sort((a, b) => b.length - a.length || (a[0].id < b[0].id ? -1 : 1));
    const cluster = new Map(), clusters = [], taken = new Set();
    sorted.forEach((g, rank) => {
      g.forEach(n => cluster.set(n.id, rank));
      const tc = new Map(); g.forEach(n => n.tags.forEach(t => tc.set(t, (tc.get(t) || 0) + 1)));
      const ranked = Array.from(tc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const pick = ranked.find(r => !taken.has(r[0])) || ranked[0];
      if (pick) taken.add(pick[0]);
      clusters.push({ rank, color: rank < PALETTE.length && g.length > 1 ? PALETTE[rank] : OTHER, label: g.length === 1 ? 'Unlinked' : pick ? '#' + pick[0] : 'Cluster ' + (rank + 1), size: g.length });
    });
    const tcount = new Map(); nodes.forEach(n => n.tags.forEach(t => tcount.set(t, (tcount.get(t) || 0) + 1)));
    const topTags = Array.from(tcount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, PALETTE.length);
    const tagColor = new Map(topTags.map((t, i) => [t[0], PALETTE[i]]));
    return { cluster, clusters, tagColor, tagList: topTags, modularity: bq };
  }

  /* ---------- Barnes-Hut quadtree in typed arrays ---------- */
  function Tree(cap) {
    this.cap = cap; this.n = 0;
    this.cx = new Float32Array(cap); this.cy = new Float32Array(cap); this.m = new Float32Array(cap);
    this.x0 = new Float32Array(cap); this.y0 = new Float32Array(cap); this.sz = new Float32Array(cap);
    this.ch = new Int32Array(cap * 4); this.body = new Int32Array(cap);
  }
  Tree.prototype.alloc = function (x0, y0, sz) {
    if (this.n >= this.cap) return -1;
    const c = this.n++;
    this.x0[c] = x0; this.y0[c] = y0; this.sz[c] = sz; this.m[c] = 0; this.cx[c] = 0; this.cy[c] = 0; this.body[c] = -1;
    this.ch[c * 4] = this.ch[c * 4 + 1] = this.ch[c * 4 + 2] = this.ch[c * 4 + 3] = -1;
    return c;
  };
  Tree.prototype.quad = function (c, x, y) { const h = this.sz[c] / 2; return (x >= this.x0[c] + h ? 1 : 0) + (y >= this.y0[c] + h ? 2 : 0); };
  Tree.prototype.child = function (c, q) {
    let k = this.ch[c * 4 + q];
    if (k < 0) { const h = this.sz[c] / 2; k = this.alloc(this.x0[c] + (q & 1) * h, this.y0[c] + (q >> 1) * h, h); this.ch[c * 4 + q] = k; }
    return k;
  };
  Tree.prototype.build = function (nodes, n) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i < n; i++) { const p = nodes[i]; if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y; }
    this.n = 0; if (!n) return;
    this.alloc(minx - 1, miny - 1, Math.max(maxx - minx, maxy - miny) + 2);
    for (let i = 0; i < n; i++) this.insert(nodes, i);
  };
  Tree.prototype.insert = function (nodes, i) {
    const nd = nodes[i]; let c = 0, depth = 0;
    for (;;) {
      if (this.m[c] === 0) { this.body[c] = i; this.m[c] = nd.mass; this.cx[c] = nd.x * nd.mass; this.cy[c] = nd.y * nd.mass; return; }
      const j = this.body[c];
      if (j >= 0) {
        const o = nodes[j];
        if (depth > 28 || (Math.abs(o.x - nd.x) < 1e-3 && Math.abs(o.y - nd.y) < 1e-3)) { this.m[c] += nd.mass; this.cx[c] += nd.x * nd.mass; this.cy[c] += nd.y * nd.mass; return; }
        this.body[c] = -1;
        const k = this.child(c, this.quad(c, o.x, o.y));
        if (k < 0) return;
        this.body[k] = j; this.m[k] = o.mass; this.cx[k] = o.x * o.mass; this.cy[k] = o.y * o.mass;
      }
      this.m[c] += nd.mass; this.cx[c] += nd.x * nd.mass; this.cy[c] += nd.y * nd.mass;
      c = this.child(c, this.quad(c, nd.x, nd.y)); depth++;
      if (c < 0) return;
    }
  };

  /* ---------- the graph ---------- */
  class Graph {
    constructor(canvas, opts) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.mini = !!(opts && opts.mini); this.onOpen = (opts && opts.onOpen) || (() => {}); this.onHover = (opts && opts.onHover) || (() => {});
      this.nodes = new Map(); this.list = []; this.vis = []; this.edges = []; this.adj = new Map();
      this.cam = { x: 0, y: 0, k: 1 }; this.goal = { x: 0, y: 0, k: 1 }; this.follow = true; this.autoFit = true; this.anchor = null;
      this.alpha = 1; this.alphaTarget = 0; this.tree = new Tree(4096); this.stack = new Int32Array(512);
      this.filter = { tags: null, orphans: true, depth: 0, center: null, cutoff: null }; this.colorMode = 'cluster'; this.showLabels = true;
      this.active = null; this.hover = null; this.highlight = null; this.analysis = null; this.dirty = true;
      this.w = 300; this.h = 200; this.dpr = 1; this.running = false; this.pointers = new Map(); this.momentum = { x: 0, y: 0 };
      this.params = { linkDist: this.mini ? 36 : 54, charge: this.mini ? -60 : -72, gravity: 0.045, decay: 0.58, theta: 0.85 };
      const rnd = M.mulberry(7); this.stars = Array.from({ length: this.mini ? 40 : 150 }, () => ({ x: rnd(), y: rnd(), z: 0.05 + rnd() * 0.3, r: 0.4 + rnd() * 1.1, p: rnd() * 6.28, s: 0.4 + rnd() * 1.6 }));
      this._bind();
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas.parentElement || canvas);
      this._onVis = () => { if (document.hidden) this._stopLoop(); else if (this.running) this._startLoop(); };
      document.addEventListener('visibilitychange', this._onVis);
      this.resize();
    }

    /* ----- data ----- */
    setData(nodes, edges, analysis) {
      this.analysis = analysis || this.analysis;
      const old = this.nodes, next = new Map(), rnd = M.mulberry(31);
      nodes.forEach((d, i) => {
        let n = old.get(d.id);
        if (!n) {
          const r = 16 * Math.sqrt(i + 1), a = i * 2.39996;
          n = { id: d.id, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, fx: null, fy: null, s: 0, al: 1, placed: false, pulse: rnd() * 6.28 };
        }
        n.title = d.title; n.tags = d.tags; n.created = d.created; n.pinned = d.pinned; n.deg = 0; n.mass = 1; n.vis = false;
        next.set(d.id, n);
      });
      this.nodes = next; this.list = Array.from(next.values());
      this.adj = new Map(this.list.map(n => [n.id, new Set()]));
      this.edges = [];
      edges.forEach(([a, b], i) => {
        const na = next.get(a), nb = next.get(b); if (!na || !nb) return;
        this.edges.push({ a: na, b: nb, ph: (i * 0.618) % 1 }); this.adj.get(a).add(b); this.adj.get(b).add(a); na.deg++; nb.deg++;
      });
      this.maxDeg = Math.max(1, ...this.list.map(n => n.deg));
      this.list.forEach(n => { n.mass = 1 + n.deg * 0.25; n.r = 3.2 + Math.sqrt(n.deg) * 2.1; });
      this._recolor(); this.applyFilter(); this.reheat(0.7);
      if (!old.size) { for (let i = 0; i < 70; i++) this._tick(); this._fitGoal(); Object.assign(this.cam, this.goal); this.list.forEach(n => { n.s = n.vis ? 1 : 0; }); }
    }
    _recolor() {
      const a = this.analysis; if (!a) return;
      const counts = new Map(); this.list.forEach(n => n.tags.forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
      this.list.forEach(n => {
        if (this.colorMode === 'tag') {
          let best = null; n.tags.forEach(t => { if (a.tagColor.has(t) && (!best || counts.get(t) > counts.get(best))) best = t; });
          n.color = best ? a.tagColor.get(best) : OTHER;
        } else n.color = (a.clusters[a.cluster.get(n.id)] || { color: OTHER }).color;
      });
    }
    setColorMode(m) { this.colorMode = m; this._recolor(); }
    legend() {
      const a = this.analysis; if (!a) return [];
      if (this.colorMode === 'tag') return a.tagList.map(t => ({ color: a.tagColor.get(t[0]), label: '#' + t[0], size: t[1] }));
      return a.clusters.filter(c => c.size > 1).slice(0, 9).map(c => ({ color: c.color, label: c.label, size: c.size }));
    }
    setFilter(f) {
      const sig = () => JSON.stringify([this.filter.center, this.filter.depth, this.filter.cutoff, this.filter.orphans, this.filter.tags && Array.from(this.filter.tags)]);
      const before = sig(); Object.assign(this.filter, f);
      if (sig() === before) return;
      this.applyFilter(); this.reheat(0.5);
    }
    applyFilter() {
      const f = this.filter, keep = new Set();
      let depthSet = null;
      if (f.center && f.depth > 0 && this.nodes.has(f.center)) {
        depthSet = new Set([f.center]); let frontier = [f.center];
        for (let d = 0; d < f.depth; d++) { const nx = []; frontier.forEach(id => this.adj.get(id).forEach(o => { if (!depthSet.has(o)) { depthSet.add(o); nx.push(o); } })); frontier = nx; }
      }
      this.list.forEach(n => {
        let ok = true;
        if (depthSet && !depthSet.has(n.id)) ok = false;
        if (f.cutoff != null && n.created > f.cutoff) ok = false;
        if (f.tags && f.tags.size && !n.tags.some(t => f.tags.has(t))) ok = false;
        if (ok) keep.add(n.id);
      });
      if (!f.orphans) this.list.forEach(n => { if (keep.has(n.id) && !Array.from(this.adj.get(n.id)).some(o => keep.has(o))) keep.delete(n.id); });
      this.list.forEach(n => {
        const was = n.vis; n.vis = keep.has(n.id);
        if (n.vis && !was && !n.placed) {
          const nb = Array.from(this.adj.get(n.id)).map(id => this.nodes.get(id)).find(o => o.vis && o.placed);
          if (nb) { n.x = nb.x + (Math.random() - 0.5) * 30; n.y = nb.y + (Math.random() - 0.5) * 30; }
          else if (f.cutoff != null) { n.x = (Math.random() - 0.5) * 40; n.y = (Math.random() - 0.5) * 40; }
        }
        if (n.vis) n.placed = true;
      });
      this.vis = this.list.filter(n => n.vis);
      this.vedges = this.edges.filter(e => e.a.vis && e.b.vis);
      this.vdeg = new Map(); this.vis.forEach(n => this.vdeg.set(n.id, 0));
      this.vedges.forEach(e => { this.vdeg.set(e.a.id, this.vdeg.get(e.a.id) + 1); this.vdeg.set(e.b.id, this.vdeg.get(e.b.id) + 1); });
      this.dirty = true;
    }
    setActive(id) { this.active = id && this.nodes.has(id) ? id : null; }
    setHighlight(set) { this.highlight = set; }
    reheat(a) { this.alpha = Math.max(this.alpha, a == null ? 0.6 : a); this._wake(); }
    fit() { this.autoFit = true; this.follow = true; this._wake(); }
    focusNode(id) { const n = this.nodes.get(id); if (!n) return; this.autoFit = false; this.follow = true; this.goal.x = n.x; this.goal.y = n.y; this.goal.k = Math.max(this.cam.k, 1.5); this._wake(); }
    stats() { return { nodes: this.list.length, links: this.edges.length, visible: this.vis.length, clusters: this.analysis ? this.analysis.clusters.filter(c => c.size > 1).length : 0, modularity: this.analysis ? this.analysis.modularity : 0 }; }

    /* ----- lifecycle ----- */
    resize() {
      const p = this.canvas.parentElement || this.canvas, r = p.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2); this.w = r.width; this.h = r.height;
      this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
      this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
      this.dirty = true; this._wake();
    }
    start() { this.running = true; this.resize(); if (!document.hidden) this._startLoop(); }
    stop() { this.running = false; this._stopLoop(); }
    _wake() { this.dirty = true; if (this.running && !this._raf && !document.hidden) this._startLoop(); }
    _startLoop() { if (this._raf) return; const step = t => { this._raf = requestAnimationFrame(step); this._frame(t); }; this._raf = requestAnimationFrame(step); }
    _stopLoop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }
    destroy() { this.stop(); this.ro.disconnect(); document.removeEventListener('visibilitychange', this._onVis); }

    /* ----- physics ----- */
    _tick() {
      const P = this.params, vis = this.vis, n = vis.length;
      this.alpha += (this.alphaTarget - this.alpha) * 0.0228;
      const a = this.alpha;
      for (let i = 0; i < n; i++) { const p = vis[i]; p.vx -= p.x * P.gravity * a; p.vy -= p.y * P.gravity * a; }
      const edges = this.vedges;
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i], A = e.a, B = e.b;
        let dx = B.x + B.vx - A.x - A.vx, dy = B.y + B.vy - A.y - A.vy, l = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const k = (l - P.linkDist) / l * a * 0.42; dx *= k; dy *= k;
        const da = this.vdeg.get(A.id), db = this.vdeg.get(B.id), bias = da / (da + db);
        B.vx -= dx * bias; B.vy -= dy * bias; A.vx += dx * (1 - bias); A.vy += dy * (1 - bias);
      }
      this.tree.build(vis, n);
      const t = this.tree, stack = this.stack, th2 = P.theta * P.theta, minD2 = 30;
      for (let i = 0; i < n; i++) {
        const p = vis[i]; let sp = 0; stack[sp++] = 0;
        while (sp) {
          const c = stack[--sp], m = t.m[c]; if (m === 0) continue;
          const dx = t.cx[c] / m - p.x, dy = t.cy[c] / m - p.y; let d2 = dx * dx + dy * dy;
          const b = t.body[c];
          if (b >= 0) {
            if (b === i) continue;
            if (d2 < minD2) d2 = minD2;
            const w = P.charge * m * a / d2; p.vx += dx * w; p.vy += dy * w;
          } else if (t.sz[c] * t.sz[c] / (d2 || 1e-6) < th2) {
            if (d2 < minD2) d2 = minD2;
            const w = P.charge * m * a / d2; p.vx += dx * w; p.vy += dy * w;
          } else for (let q = 0; q < 4; q++) { const k = t.ch[c * 4 + q]; if (k >= 0 && sp < 500) stack[sp++] = k; }
        }
      }
      for (let i = 0; i < n; i++) {
        const p = vis[i];
        if (p.fx != null) { p.x = p.fx; p.y = p.fy; p.vx = p.vy = 0; } else { p.vx *= P.decay; p.vy *= P.decay; p.x += p.vx; p.y += p.vy; }
      }
    }

    /* ----- camera ----- */
    _fitGoal() {
      const v = this.vis; if (!v.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      v.forEach(n => { if (n.x < x0) x0 = n.x; if (n.x > x1) x1 = n.x; if (n.y < y0) y0 = n.y; if (n.y > y1) y1 = n.y; });
      const padX = this.mini ? 26 : 120, padY = this.mini ? 24 : 110, bw = Math.max(x1 - x0, 60), bh = Math.max(y1 - y0, 60);
      this.goal.x = (x0 + x1) / 2; this.goal.y = (y0 + y1) / 2;
      this.goal.k = M.clamp(Math.min((this.w - padX * 2) / bw, (this.h - padY * 2) / bh), 0.2, this.mini ? 2.2 : 2.6);
    }
    toWorld(sx, sy) { return { x: (sx - this.w / 2) / this.cam.k + this.cam.x, y: (sy - this.h / 2) / this.cam.k + this.cam.y }; }

    /* ----- interaction ----- */
    _bind() {
      const c = this.canvas; c.style.touchAction = 'none';
      const pos = e => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      c.addEventListener('pointerdown', e => {
        c.setPointerCapture(e.pointerId); const p = pos(e); this.pointers.set(e.pointerId, p);
        if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.cam.k }; this.drag = null; this.pan = null; return; }
        const hit = this._hit(p.x, p.y);
        if (hit) { this.drag = { n: hit, sx: p.x, sy: p.y, t: performance.now(), moved: false }; this.alphaTarget = 0.22; this._wake(); }
        else { this.pan = { x: p.x, y: p.y, cx: this.cam.x, cy: this.cam.y, lx: p.x, ly: p.y, vx: 0, vy: 0 }; this.momentum.x = this.momentum.y = 0; }
        this.follow = false; this.autoFit = false; this.anchor = null;
      });
      c.addEventListener('pointermove', e => {
        const p = pos(e); if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
        if (this.pinch && this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          this._zoomTo(M.clamp(this.pinch.k * d / this.pinch.d, 0.15, 6), mid.x, mid.y, true); return;
        }
        if (this.drag) {
          const d = this.drag; if (Math.hypot(p.x - d.sx, p.y - d.sy) > 4) d.moved = true;
          if (d.moved) { const w = this.toWorld(p.x, p.y); d.n.fx = w.x; d.n.fy = w.y; }
        } else if (this.pan) {
          const s = this.pan; this.cam.x = s.cx - (p.x - s.x) / this.cam.k; this.cam.y = s.cy - (p.y - s.y) / this.cam.k;
          this.goal.x = this.cam.x; this.goal.y = this.cam.y; s.vx = (p.x - s.lx); s.vy = (p.y - s.ly); s.lx = p.x; s.ly = p.y; this._wake();
        } else if (e.pointerType !== 'touch') this._setHover(this._hit(p.x, p.y), e);
      });
      const up = e => {
        this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch = null;
        if (this.drag) {
          const d = this.drag; this.drag = null; d.n.fx = d.n.fy = null; this.alphaTarget = 0;
          if (!d.moved && performance.now() - d.t < 600) this.onOpen(d.n.id);
        } else if (this.pan) { this.momentum.x = this.pan.vx; this.momentum.y = this.pan.vy; this.pan = null; this._wake(); }
      };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('pointerleave', () => { if (!this.drag) this._setHover(null); });
      c.addEventListener('wheel', e => {
        if (this.mini && !e.ctrlKey) return;
        e.preventDefault(); const p = pos(e);
        this.follow = false; this.autoFit = false;
        this._zoomTo(M.clamp(this.goal.k * Math.exp(-e.deltaY * 0.0016), 0.15, 6), p.x, p.y, false);
      }, { passive: false });
      c.addEventListener('dblclick', e => { if (!this._hit(pos(e).x, pos(e).y)) this.fit(); });
    }
    _zoomTo(k, sx, sy, instant) {
      const w = this.toWorld(sx, sy); this.anchor = { sx, sy, wx: w.x, wy: w.y };
      this.goal.k = k; if (instant) this.cam.k = k; this._wake();
    }
    _setHover(n, e) {
      const id = n ? n.id : null;
      if (id === this.hover) return;
      this.hover = id; this.canvas.style.cursor = n ? 'pointer' : (this.mini ? 'default' : 'grab'); this.onHover(n, e); this._wake();
    }
    _hit(sx, sy) {
      let best = null, bd = 1e9; const k = this.cam.k, rs = Math.pow(k, 0.6);
      for (const n of this.vis) {
        const x = (n.x - this.cam.x) * k + this.w / 2, y = (n.y - this.cam.y) * k + this.h / 2, d = Math.hypot(x - sx, y - sy);
        if (d < n.r * rs + 7 && d < bd) { bd = d; best = n; }
      }
      return best;
    }

    /* ----- drawing ----- */
    _frame(time) {
      const moving = this.alpha > 0.002 || this.alphaTarget > 0;
      if (moving) { this._tick(); if (this.alpha > 0.25) this._tick(); }
      const cam = this.cam, goal = this.goal;
      if (this.autoFit && this.vis.length && (moving || this.dirty)) this._fitGoal();
      if (this.pan == null && (Math.abs(this.momentum.x) > 0.05 || Math.abs(this.momentum.y) > 0.05)) {
        cam.x -= this.momentum.x / cam.k; cam.y -= this.momentum.y / cam.k; goal.x = cam.x; goal.y = cam.y; this.momentum.x *= 0.93; this.momentum.y *= 0.93;
      }
      if (this.follow) { cam.x += (goal.x - cam.x) * 0.12; cam.y += (goal.y - cam.y) * 0.12; cam.k += (goal.k - cam.k) * 0.12; }
      else if (Math.abs(goal.k - cam.k) > 1e-4) {
        cam.k += (goal.k - cam.k) * 0.22;
        if (this.anchor) { const a = this.anchor; cam.x = a.wx - (a.sx - this.w / 2) / cam.k; cam.y = a.wy - (a.sy - this.h / 2) / cam.k; goal.x = cam.x; goal.y = cam.y; }
      }
      this._draw(time);
    }

    _draw(time) {
      const ctx = this.ctx, w = this.w, h = this.h, cam = this.cam, k = cam.k, rs = Math.pow(k, 0.6), hw = w / 2, hh = h / 2;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      // stars (parallax)
      for (const s of this.stars) {
        const x = ((s.x * w - cam.x * k * s.z) % w + w) % w, y = ((s.y * h - cam.y * k * s.z) % h + h) % h;
        ctx.fillStyle = 'rgba(214,224,255,' + (0.25 + 0.35 * Math.sin(time * 0.001 * s.s + s.p)) * (this.mini ? 0.6 : 1) + ')';
        ctx.fillRect(x, y, s.r, s.r);
      }
      const focusId = this.hover || (this.highlight ? null : this.active);
      const nbrs = focusId ? this.adj.get(focusId) : null;
      const search = this.highlight;
      // ease node opacity and appearance
      for (const n of this.list) {
        let target = 1;
        if (this.hover) target = (n.id === this.hover || (nbrs && nbrs.has(n.id))) ? 1 : 0.13;
        else if (search) target = search.has(n.id) ? 1 : 0.14;
        n.al += (target - n.al) * 0.18; n.s += ((n.vis ? 1 : 0) - n.s) * 0.14;
        if (Math.abs(target - n.al) > 0.004 || Math.abs((n.vis ? 1 : 0) - n.s) > 0.004) this.dirty = true;
      }
      const sx = n => (n.x - cam.x) * k + hw, sy = n => (n.y - cam.y) * k + hh;
      // edges
      ctx.lineCap = 'round';
      const lit = [];
      for (const e of this.edges) {
        const s = Math.min(e.a.s, e.b.s); if (s < 0.02) continue;
        const a = Math.min(e.a.al, e.b.al) * s;
        const hot = focusId && (e.a.id === focusId || e.b.id === focusId);
        if (hot) { lit.push(e); continue; }
        ctx.strokeStyle = 'rgba(150,172,230,' + (0.15 * a + (this.mini ? 0.03 : 0)) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx(e.a), sy(e.a)); ctx.lineTo(sx(e.b), sy(e.b)); ctx.stroke();
      }
      // glowing edges of the focused node, with travelling pulses
      for (const e of lit) {
        const x1 = sx(e.a), y1 = sy(e.a), x2 = sx(e.b), y2 = sy(e.b), s = Math.min(e.a.s, e.b.s);
        const g = ctx.createLinearGradient(x1, y1, x2, y2); g.addColorStop(0, rgba(e.a.color, 0.9 * s)); g.addColorStop(1, rgba(e.b.color, 0.9 * s));
        ctx.strokeStyle = 'rgba(255,255,255,' + 0.06 * s + ')'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.stroke();
        const out = e.a.id === focusId;
        for (let q = 0; q < 2; q++) {
          let t = ((time * 0.00042 + e.ph + q * 0.5) % 1); if (!out) t = 1 - t;
          const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t, fade = Math.sin(Math.PI * (out ? t : 1 - t));
          const col = out ? e.b.color : e.a.color;
          ctx.globalAlpha = fade * s; ctx.drawImage(glow(col), px - 9, py - 9, 18, 18); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 1.3, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      // nodes: dim first, then bright so highlighted ones sit on top
      const order = this.list.filter(n => n.s > 0.02).sort((a, b) => a.al - b.al);
      for (const n of order) {
        const x = sx(n), y = sy(n); if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue;
        const isA = n.id === this.active, r = n.r * rs * (0.4 + 0.6 * n.s) * (isA ? 1.25 : 1), al = n.al * n.s;
        ctx.globalAlpha = al * (isA ? 1 : 0.75); const gs = r * 5.2; ctx.drawImage(glow(n.color), x - gs / 2, y - gs / 2, gs, gs);
        ctx.globalAlpha = al; ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + 0.55 * al + ')'; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.38, 0, 6.283); ctx.fill();
        if (isA || n.id === this.hover || (search && search.has(n.id))) {
          const pr = r + 4 + (isA ? 2.5 * (0.5 + 0.5 * Math.sin(time * 0.003)) : 0);
          ctx.strokeStyle = 'rgba(255,255,255,' + (isA ? 0.85 : 0.6) * al + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, pr, 0, 6.283); ctx.stroke();
        }
        if (n.pinned && !this.mini) { ctx.strokeStyle = 'rgba(255,255,255,' + 0.4 * al + ')'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
      }
      ctx.globalAlpha = 1;
      if (this.showLabels) this._labels(sx, sy, rs, focusId, nbrs, search);
      this.dirty = false;
    }

    _labels(sx, sy, rs, focusId, nbrs, search) {
      const ctx = this.ctx, k = this.cam.k, placed = [], cand = [];
      for (const n of this.vis) {
        const imp = n.deg / this.maxDeg;
        const forced = n.id === this.active || n.id === this.hover || (nbrs && nbrs.has(n.id) && this.hover) || (search && search.has(n.id));
        let a = this.mini ? 0.9 : M.clamp((k * (0.55 + 1.3 * imp) - 0.95) / 0.5, 0, 1);
        if (forced) a = 1; else if (this.hover || (search && !search.has(n.id))) a *= 0.25;
        if (a > 0.02) cand.push({ n, a, forced, imp });
      }
      cand.sort((p, q) => (q.forced - p.forced) || (q.imp - p.imp));
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
      for (const c of cand) {
        const n = c.n, x = sx(n), y = sy(n) + n.r * rs + (this.mini ? 11 : 14), size = this.mini ? 10 : 11.5 + c.imp * 2;
        if (x < -80 || x > this.w + 80 || y < -10 || y > this.h + 20) continue;
        ctx.font = (c.forced ? '600 ' : '500 ') + size + 'px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif';
        const tw = ctx.measureText(n.title).width, box = [x - tw / 2 - 3, y - size, x + tw / 2 + 3, y + 4];
        if (!c.forced && placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
        placed.push(box);
        const al = c.a * n.s * (c.forced ? 1 : Math.max(n.al, 0.25));
        ctx.strokeStyle = 'rgba(5,8,20,' + 0.85 * al + ')'; ctx.lineWidth = 3.4; ctx.strokeText(n.title, x, y);
        ctx.fillStyle = 'rgba(' + (c.forced ? '255,250,235' : '218,226,246') + ',' + al + ')'; ctx.fillText(n.title, x, y);
      }
    }
  }

  Graph.analyze = analyze;
  Graph.PALETTE = PALETTE;
  M.Graph = Graph;
})(window.Mnemo);
