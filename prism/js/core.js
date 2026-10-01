/* PRISM core - pure game logic with no DOM access.
 * Loaded as a classic <script> in the browser (window.Prism.core) and via require() in the node tests.
 *
 * Model
 *   Board: w*h array of pieces (or null). Directions: 0=N 1=E 2=S 3=W.
 *   Light is traced per primary channel (R,G,B), because every element acts on channels independently.
 *   That makes the whole optical system linear, so additive mixing, splitting and recombination all
 *   fall out of one recursive propagation that accumulates intensity on a field.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Prism = root.Prism || {}; root.Prism.core = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const REF = [[1, 0, 3, 2], [3, 2, 1, 0]];               // reflection tables for '/' (0) and '\' (1)
  const MASK = { r: 1, g: 2, b: 4, y: 3, m: 5, c: 6, w: 7 };
  const LETTER = ['', 'r', 'g', 'y', 'b', 'm', 'c', 'w'];
  const EPS = 0.03;          // light dimmer than this is dropped
  const THR = 0.2;           // a primary counts as "present" at a crystal above this power
  const STRONG = 0.9;        // ringed crystals need (almost) full power
  const MAX_DEPTH = 300, MAX_OPS = 30000;

  let uidCounter = 1;
  const piece = (t, o) => Object.assign({ t, uid: uidCounter++ }, o);
  const clonePiece = p => (p ? Object.assign({}, p) : null);
  const cloneCells = cells => cells.map(clonePiece);
  const isMovable = p => !!p && (p.t === 'M' || p.t === 'S' || p.t === 'P') && !p.fx;
  const isRotatable = p => isMovable(p);

  /* ---------------------------------------------------------------- tokens */
  function parseToken(tok) {
    if (tok === '.') return { p: null };
    if (tok === '#') return { p: piece('W') };
    if (tok === 'x') return { p: piece('A') };
    let m;
    if ((m = /^E([0-3])([rgbycmw])$/.exec(tok))) return { p: piece('E', { d: +m[1], c: MASK[m[2]] }) };
    if ((m = /^([MSPmsp])([0-3])([*=])?$/.exec(tok))) {
      const up = m[1].toUpperCase();
      return { p: piece(up, { r: +m[2], fx: m[1] !== up }), loose: m[3] === '*', keep: m[3] === '=' };
    }
    if ((m = /^F([rgbycmw])(\*)?$/.exec(tok))) return { p: piece('F', { c: MASK[m[1]] }), loose: !!m[2] };
    if ((m = /^O(\d)$/.exec(tok))) return { p: piece('O', { id: +m[1] }) };
    if ((m = /^C([rgbycmw])([1-4])?(!)?$/.exec(tok))) return { p: piece('C', { c: MASK[m[1]], n: m[2] ? +m[2] : 1, pw: !!m[3] }) };
    throw new Error('bad token "' + tok + '"');
  }
  function tokenOf(p) {
    if (!p) return '.';
    switch (p.t) {
      case 'W': return '#';
      case 'A': return 'x';
      case 'E': return 'E' + p.d + LETTER[p.c];
      case 'M': case 'S': case 'P': return (p.fx ? p.t.toLowerCase() : p.t) + (p.r & 3);
      case 'F': return 'F' + LETTER[p.c];
      case 'O': return 'O' + p.id;
      case 'C': return 'C' + LETTER[p.c] + (p.n > 1 ? p.n : '') + (p.pw ? '!' : '');
    }
    return '.';
  }

  /* Deterministic scramble cost (clicks) to rotate a piece from rot `from` to rot `to`. */
  const rotCost = (p, from, to) => p.t === 'P' ? Math.min((to - from + 4) & 3, (from - to + 4) & 3) : ((from ^ to) & 1);

  /* Build a playable level from an authored *solved* layout.
   *   M0*  loose piece (goes to the tray)     M0=  movable but left in its solved orientation
   *   M0   movable, scrambled                 m0   fixed */
  function buildLevel(def, opt) {
    opt = opt || {};
    const rows = def.rows.map(r => r.trim().split(/\s+/));
    const h = rows.length, w = rows[0].length;
    rows.forEach((r, y) => { if (r.length !== w) throw new Error(def.name + ': row ' + y + ' has ' + r.length + ' tokens, expected ' + w); });
    const cells = new Array(w * h).fill(null), solved = new Array(w * h).fill(null), tray = [];
    let par = 0;
    rows.forEach((row, y) => row.forEach((tok, x) => {
      const { p, loose, keep } = parseToken(tok);
      if (!p) return;
      const i = y * w + x;
      solved[i] = clonePiece(p);
      if (loose) {
        const q = p.t === 'F' ? piece('F', { c: p.c, src: 'inv' }) : piece(p.t, { r: 0, fx: false, src: 'inv' });
        if (p.t === 'P') par += 1 + rotCost(p, 0, p.r);
        else if (p.t === 'F') par += 1;
        else par += 1 + (p.r & 1);
        tray.push(q);
        return;
      }
      if (isMovable(p)) {
        p.src = 'lvl';
        if (!keep && opt.scramble !== false) {
          if (p.t === 'P') { const dl = 1 + ((x + y) & 1); p.r = (p.r + dl) & 3; par += Math.min(dl, 4 - dl); }
          else { p.r ^= 1; par += 1; }
        }
      }
      cells[i] = p;
    }));
    return { name: def.name, tip: def.tip || '', w, h, cells, tray, par: def.par || par, solved };
  }

  function encodeLevel(w, h, cells, tray) {
    const rows = [];
    for (let y = 0; y < h; y++) rows.push(cells.slice(y * w, y * w + w).map(tokenOf).join(' '));
    return { rows, inv: (tray || []).map(tokenOf) };
  }

  /* ----------------------------------------------------------------- tracer */
  function trace(w, h, cells) {
    const N = w * h;
    const arr = new Float32Array(N * 12);        // light arriving in cell i travelling d, channel p: (i*4+d)*3+p
    const seg = new Float32Array(N * 12);        // light leaving cell i travelling d (what gets drawn)
    const onPath = new Uint8Array(N * 12);       // cycle guard: states on the current recursion stack
    const lit = new Uint8Array(N), first = new Int32Array(N), hit = new Float32Array(N), partner = new Int16Array(N).fill(-1);
    const portals = {};
    for (let i = 0; i < N; i++) if (cells[i] && cells[i].t === 'O') (portals[cells[i].id] = portals[cells[i].id] || []).push(i);
    for (const id in portals) if (portals[id].length === 2) { partner[portals[id][0]] = portals[id][1]; partner[portals[id][1]] = portals[id][0]; }
    let ops = 0, seq = 0;

    function emit(i, d, p, a, depth) {
      if (a < EPS || depth > MAX_DEPTH || ++ops > MAX_OPS) return;
      const k = (i * 4 + d) * 3 + p;
      if (onPath[k]) return;                     // light chasing its own tail: stop
      onPath[k] = 1;
      seg[k] += a;
      const x = (i % w) + DX[d], y = ((i / w) | 0) + DY[d];
      if (x >= 0 && y >= 0 && x < w && y < h) arrive(y * w + x, d, p, a, depth + 1);
      onPath[k] = 0;
    }
    function arrive(i, d, p, a, depth) {
      if (!lit[i]) { lit[i] = 1; first[i] = ++seq; }
      arr[(i * 4 + d) * 3 + p] += a;
      const c = cells[i];
      if (!c) { emit(i, d, p, a, depth); return; }
      switch (c.t) {
        case 'M': hit[i] += a; emit(i, REF[c.r & 1][d], p, a, depth); break;
        case 'S': hit[i] += a; emit(i, d, p, a * 0.5, depth); emit(i, REF[c.r & 1][d], p, a * 0.5, depth); break;
        case 'P':
          if (d === (c.r & 3)) { hit[i] += a; emit(i, p === 0 ? (d + 3) & 3 : p === 1 ? d : (d + 1) & 3, p, a, depth); }
          break;
        case 'F': if (c.c & (1 << p)) emit(i, d, p, a, depth); break;
        case 'O': if (partner[i] >= 0) { hit[i] += a; hit[partner[i]] += a; emit(partner[i], d, p, a, depth); } break;
        default: break;                          // walls, absorbers, emitters, crystals swallow light
      }
    }
    for (let i = 0; i < N; i++) {
      const c = cells[i];
      if (c && c.t === 'E') for (let p = 0; p < 3; p++) if (c.c & (1 << p)) emit(i, c.d, p, 1, 0);
    }

    // Merge collinear same-coloured segments into runs (drawn as one line, avoids beads at cell joints).
    const segCol = (i, d) => { const k = (i * 4 + d) * 3; return seg[k] + seg[k + 1] + seg[k + 2] > 0.002 ? [seg[k], seg[k + 1], seg[k + 2]] : null; };
    const same = (a, b) => Math.abs(a[0] - b[0]) < 0.02 && Math.abs(a[1] - b[1]) < 0.02 && Math.abs(a[2] - b[2]) < 0.02;
    const runs = [];
    for (let i = 0; i < N; i++) for (let d = 0; d < 4; d++) {
      const col = segCol(i, d); if (!col) continue;
      const x = i % w, y = (i / w) | 0, px = x - DX[d], py = y - DY[d];
      if (px >= 0 && py >= 0 && px < w && py < h) { const pc = segCol(py * w + px, d); if (pc && same(pc, col)) continue; }
      let cx = x, cy = y;
      for (;;) {
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
        const nc = segCol(ny * w + nx, d);
        if (!nc || !same(nc, col)) break;
        cx = nx; cy = ny;
      }
      const nx = cx + DX[d], ny = cy + DY[d];
      const out = nx < 0 || ny < 0 || nx >= w || ny >= h;
      const len = out || (cells[ny * w + nx] && cells[ny * w + nx].t === 'W') ? 0.5 : 1;
      runs.push({ x0: x + 0.5, y0: y + 0.5, x1: cx + 0.5 + DX[d] * len, y1: cy + 0.5 + DY[d] * len, d, r: col[0], g: col[1], b: col[2], out });
    }

    const cr = [], hits = [];
    for (let i = 0; i < N; i++) {
      if (hit[i] > 0.02) {
        const col = [0, 0, 0];
        for (let d = 0; d < 4; d++) for (let p = 0; p < 3; p++) col[p] += arr[(i * 4 + d) * 3 + p];
        hits.push({ i, x: i % w, y: (i / w) | 0, v: Math.min(1, hit[i]), col });
      }
      const c = cells[i];
      if (!c || c.t !== 'C') continue;
      const pw = [0, 0, 0]; let dirs = 0;
      for (let d = 0; d < 4; d++) {
        let s = 0;
        for (let p = 0; p < 3; p++) { const v = arr[(i * 4 + d) * 3 + p]; pw[p] += v; s += v; }
        if (s > 0.05) dirs++;
      }
      let got = 0;
      for (let p = 0; p < 3; p++) if (pw[p] >= THR) got |= 1 << p;
      let ok = got === c.c && dirs >= (c.n || 1);
      if (ok && c.pw) for (let p = 0; p < 3; p++) if ((c.c & (1 << p)) && pw[p] < STRONG) ok = false;
      cr.push({ i, x: i % w, y: (i / w) | 0, ok, got, pw, dirs, any: pw[0] + pw[1] + pw[2] > 0.02 });
    }
    return { runs, hits, cr, lit, first, ops, ok: cr.length > 0 && cr.every(c => c.ok) };
  }

  /* ----------------------------------------------------------------- solver */
  /* Any piece that matters in a solution is lit in the final configuration, so a causal (emitter-outwards)
   * ordering of decisions always exists. Both phases therefore only act on cells that light currently touches:
   *   1. BFS over single actions (rotate a lit piece / place a tray piece on a lit cell). Move-optimal when it
   *      finishes inside its node cap, which it does for small boards.
   *   2. "Locked" depth-first search: take the first lit, undecided piece, try every orientation, lock it, and
   *      recurse; when nothing lit is left undecided, place a tray piece on a lit empty cell. Each piece is
   *      decided once, so the tree is tiny compared with the BFS graph. Complete; not move-optimal. */
  function solve(state, opt) {
    opt = Object.assign({ bfsCap: 6000, bfsMs: 600, dfsCap: 1500000, ms: 8000 }, opt);
    const t0 = Date.now(), w = state.w, h = state.h, N = w * h;
    const base = state.cells.map(clonePiece);
    const mov = []; base.forEach((p, i) => { if (isMovable(p)) mov.push(i); });
    const slots = state.tray.map(clonePiece), ns = slots.length, nm = mov.length;
    const slotKey = slots.map(s => s.t + (s.c || ''));
    const nrot = t => (t === 'P' ? 3 : 1);
    const init = { rot: Uint8Array.from(mov.map(i => base[i].r & nrot(base[i].t))), pos: new Int16Array(ns).fill(-1), srot: new Uint8Array(ns) };

    const build = st => {
      const cells = base.slice();
      for (let k = 0; k < nm; k++) { const p = clonePiece(base[mov[k]]); p.r = st.rot[k]; cells[mov[k]] = p; }
      for (let s = 0; s < ns; s++) if (st.pos[s] >= 0) { const p = clonePiece(slots[s]); p.r = st.srot[s]; cells[st.pos[s]] = p; }
      return cells;
    };
    const groupsKey = st => {
      const groups = {};
      for (let s = 0; s < ns; s++) (groups[slotKey[s]] = groups[slotKey[s]] || []).push(st.pos[s] < 0 ? -1 : st.pos[s] * 4 + st.srot[s]);
      return Object.keys(groups).sort().map(g => groups[g].sort((a, b) => a - b).join('.')).join('|');
    };
    const key = st => st.rot.join('') + '/' + groupsKey(st);
    const cp = st => ({ rot: st.rot.slice(), pos: st.pos.slice(), srot: st.srot.slice() });
    const rotated = (t, r) => t === 'P' ? [(r + 1) & 3, (r + 3) & 3] : [r ^ 1];
    const timeUp = () => Date.now() - t0 > opt.ms;
    const done = (moves, optimal, nodes) => ({ solved: true, optimal, moves, nodes, ms: Date.now() - t0 });

    function expand(st, cells, res) {
      const out = [];
      for (let k = 0; k < nm; k++) {
        const i = mov[k]; if (!res.lit[i]) continue;
        for (const nr of rotated(base[i].t, st.rot[k])) { const c = cp(st); c.rot[k] = nr; out.push({ st: c, act: { k: 'rot', cell: i, from: st.rot[k], to: nr, t: base[i].t } }); }
      }
      const seen = {};
      for (let s = 0; s < ns; s++) {
        if (st.pos[s] >= 0) {
          if (slots[s].t === 'F' || !res.lit[st.pos[s]]) continue;
          for (const nr of rotated(slots[s].t, st.srot[s])) { const c = cp(st); c.srot[s] = nr; out.push({ st: c, act: { k: 'rot', cell: st.pos[s], from: st.srot[s], to: nr, t: slots[s].t, slot: s } }); }
        } else if (!seen[slotKey[s]]) {
          seen[slotKey[s]] = 1;
          for (let i = 0; i < N; i++) if (!cells[i] && res.lit[i]) { const c = cp(st); c.pos[s] = i; out.push({ st: c, act: { k: 'place', cell: i, slot: s, t: slots[s].t } }); }
        }
      }
      return out;
    }
    const pathOf = (nodes, qi) => { const a = []; for (let n = nodes[qi]; n && n.act; n = nodes[n.parent]) a.push(n.act); return a.reverse(); };

    // Phase 1: BFS
    const nodes = [{ st: init, parent: -1, act: null }], seen = new Set([key(init)]);
    for (let qi = 0; qi < nodes.length && nodes.length < opt.bfsCap; qi++) {
      if ((qi & 63) === 0 && Date.now() - t0 > opt.bfsMs) break;
      const cells = build(nodes[qi].st), res = trace(w, h, cells);
      if (res.ok) return done(pathOf(nodes, qi), true, nodes.length);
      for (const ch of expand(nodes[qi].st, cells, res)) { const k = key(ch.st); if (!seen.has(k)) { seen.add(k); nodes.push({ st: ch.st, parent: qi, act: ch.act }); } }
    }

    // Phase 2: locked DFS
    const cur = cp(init), decM = new Uint8Array(nm), decS = new Uint8Array(ns), acts = [], memo = new Set();
    let count = 0, abort = false;
    const variants = (t, orig) => t === 'P' ? [orig, (orig + 1) & 3, (orig + 3) & 3, (orig + 2) & 3] : [orig, orig ^ 1];
    function rec() {
      if (abort) return false;
      if (++count > opt.dfsCap || ((count & 1023) === 0 && timeUp())) { abort = true; return false; }
      const mk = key(cur) + '#' + decM.join('') + decS.join('');
      if (memo.has(mk)) return false;
      memo.add(mk);
      const cells = build(cur), res = trace(w, h, cells);
      if (res.ok) return true;
      // decide the lit, undecided piece that light reached first (upstream pieces before downstream ones)
      let bk = -1, bs = -1, best = 1e9;
      for (let k = 0; k < nm; k++) if (!decM[k] && res.lit[mov[k]] && res.first[mov[k]] < best) { best = res.first[mov[k]]; bk = k; bs = -1; }
      for (let s = 0; s < ns; s++) if (cur.pos[s] >= 0 && !decS[s] && slots[s].t !== 'F' && res.lit[cur.pos[s]] && res.first[cur.pos[s]] < best) { best = res.first[cur.pos[s]]; bs = s; bk = -1; }
      if (bk >= 0) {
        const orig = cur.rot[bk]; decM[bk] = 1;
        for (const o of variants(base[mov[bk]].t, orig)) {
          cur.rot[bk] = o; if (o !== orig) acts.push({ k: 'rot', cell: mov[bk], from: orig, to: o, t: base[mov[bk]].t });
          if (rec()) return true;
          if (o !== orig) acts.pop();
        }
        cur.rot[bk] = orig; decM[bk] = 0; return false;
      }
      if (bs >= 0) {
        const orig = cur.srot[bs]; decS[bs] = 1;
        for (const o of variants(slots[bs].t, orig)) {
          cur.srot[bs] = o; if (o !== orig) acts.push({ k: 'rot', cell: cur.pos[bs], from: orig, to: o, t: slots[bs].t, slot: bs });
          if (rec()) return true;
          if (o !== orig) acts.pop();
        }
        cur.srot[bs] = orig; decS[bs] = 0; return false;
      }
      const tried = {};
      for (let s = 0; s < ns; s++) if (cur.pos[s] < 0 && !tried[slotKey[s]]) {
        tried[slotKey[s]] = 1;
        for (let i = 0; i < N; i++) if (!cells[i] && res.lit[i]) {
          cur.pos[s] = i; if (slots[s].t === 'F') decS[s] = 1;
          acts.push({ k: 'place', cell: i, slot: s, t: slots[s].t });
          if (rec()) return true;
          acts.pop(); cur.pos[s] = -1; decS[s] = 0;
        }
      }
      return false;
    }
    if (rec()) return done(acts.slice(), false, count);
    return { solved: false, optimal: false, moves: [], nodes: count, ms: Date.now() - t0 };
  }

  /* -------------------------------------------------------------- generator */
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Build a SOLVED layout by growing beams outwards from emitters, then scramble it. Solvable by construction. */
  function tryGen(rng, o) {
    const w = o.w, h = o.h, N = w * h;
    const cells = new Array(N).fill(null), ax = new Uint8Array(N);
    const ri = n => Math.floor(rng() * n);
    const bit = d => (d & 1 ? 1 : 2);
    const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !cells[y * w + x];
    const pending = [];
    let splits = 0, pieces = 0, fail = false;

    function walk(x, y, cd, c, turns, pwr) {
      let steps = 0, guard = 0;
      const step = () => {
        const nx = x + DX[cd], ny = y + DY[cd];
        if (!free(nx, ny) || (ax[ny * w + nx] & bit(cd))) return false;
        x = nx; y = ny; ax[y * w + x] |= bit(cd); steps++; return true;
      };
      while (guard++ < 30) {
        let run = 1 + ri(4);
        while (run-- > 0 && step());
        while ((steps === 0 || ax[y * w + x] !== bit(cd))) if (!step()) return false;     // head must be a fresh cell
        const here = y * w + x;
        if (turns > 0 && (rng() < 0.9 || pieces < o.minPieces)) {
          const opts = rng() < 0.5 ? [(cd + 1) & 3, (cd + 3) & 3] : [(cd + 3) & 3, (cd + 1) & 3];
          let done = false;
          for (const nd of opts) {
            const nx = x + DX[nd], ny = y + DY[nd];
            if (!free(nx, ny) || (ax[ny * w + nx] & bit(nd))) continue;
            const sx = x + DX[cd], sy = y + DY[cd];
            const canSplit = splits < 2 && pwr >= 0.5 && rng() < o.split && free(sx, sy) && !(ax[sy * w + sx] & bit(cd));
            const r = REF[0][cd] === nd ? 0 : 1;
            if (canSplit) { cells[here] = piece('S', { r, fx: false, src: 'lvl' }); pending.push([x, y, cd, c, turns - 1, pwr * 0.5]); splits++; pwr *= 0.5; }
            else cells[here] = piece('M', { r, fx: false, src: 'lvl' });
            ax[here] = 3; pieces++; cd = nd; turns--; steps = 0; done = true; break;
          }
          if (done) continue;
        }
        cells[here] = piece('C', { c, n: 1, pw: false }); ax[here] = 3;
        return true;
      }
      return false;
    }
    const border = () => {
      for (let k = 0; k < 40; k++) {
        const side = ri(4), t = 1 + ri((side & 1 ? h : w) - 2);
        const x = side === 0 ? t : side === 2 ? t : side === 1 ? w - 1 : 0;
        const y = side === 0 ? 0 : side === 2 ? h - 1 : t;
        const d = side === 0 ? 2 : side === 1 ? 3 : side === 2 ? 0 : 1;   // face inwards
        if (free(x, y)) return { x, y, d };
      }
      return null;
    };
    let usedPrism = false;
    for (let b = 0; b < o.beams; b++) {
      const e = border(); if (!e) return null;
      const prism = !usedPrism && rng() < o.prism;
      if (prism) {
        const px = e.x + DX[e.d], py = e.y + DY[e.d];
        if (!free(px, py)) return null;
        usedPrism = true;
        cells[e.y * w + e.x] = piece('E', { d: e.d, c: 7 });
        cells[py * w + px] = piece('P', { r: e.d, fx: false, src: 'lvl' }); ax[py * w + px] = 3; ax[e.y * w + e.x] = 3;
        for (let ch = 0; ch < 3; ch++) pending.push([px, py, ch === 0 ? (e.d + 3) & 3 : ch === 1 ? e.d : (e.d + 1) & 3, 1 << ch, o.turns, 1]);
      } else {
        const c = [1, 2, 4][ri(3)];
        cells[e.y * w + e.x] = piece('E', { d: e.d, c }); ax[e.y * w + e.x] = 3;
        pending.push([e.x, e.y, e.d, c, o.turns, 1]);
      }
    }
    while (pending.length) { const a = pending.shift(); if (!walk.apply(null, a)) { fail = true; break; } }
    if (fail || pieces < o.minPieces) return null;
    for (let i = 0; i < N; i++) if (!cells[i] && !ax[i] && rng() < o.walls) cells[i] = piece(rng() < 0.2 ? 'A' : 'W');
    if (!trace(w, h, cells).ok) return null;

    // scramble: some mirrors go to the tray, the rest of the movables are knocked out of position
    const solved = cloneCells(cells), tray = [];
    const mirrors = []; cells.forEach((p, i) => { if (p && p.t === 'M') mirrors.push(i); });
    for (let i = mirrors.length - 1; i > 0; i--) { const j = ri(i + 1); [mirrors[i], mirrors[j]] = [mirrors[j], mirrors[i]]; }
    let par = 0;
    const nLoose = Math.min(o.loose, Math.max(0, mirrors.length - 1));
    for (let k = 0; k < nLoose; k++) { const p = cells[mirrors[k]]; par += 1 + (p.r & 1); cells[mirrors[k]] = null; tray.push(piece('M', { r: 0, fx: false, src: 'inv' })); }
    for (let i = 0; i < N; i++) {
      const p = cells[i]; if (!isMovable(p)) continue;
      if (p.t === 'P') { const dl = 1 + ri(2); p.r = (p.r + dl) & 3; par += Math.min(dl, 4 - dl); } else { p.r ^= 1; par += 1; }
    }
    if (trace(w, h, cells).ok) return null;
    return { w, h, cells, tray, par, solved };
  }

  function generate(seed, opt) {
    const o = Object.assign({ w: 7, h: 7, beams: 2, turns: 3, loose: 1, split: 0.25, prism: 0, walls: 0.08, minPieces: 3 }, opt);
    for (let attempt = 0; attempt < 400; attempt++) {
      const lv = tryGen(mulberry32(hash32(seed + '#' + attempt)), o);
      if (lv) { lv.seed = seed; lv.attempt = attempt; return lv; }
    }
    throw new Error('generator failed for ' + seed);
  }
  const DAILY_OPTS = { w: 7, h: 7, beams: 3, turns: 3, loose: 2, split: 0.3, prism: 0.25 };
  const dailyKey = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const endlessOpts = n => ({
    w: Math.min(8, 6 + Math.floor(n / 4)), h: Math.min(8, 6 + Math.floor(n / 4)), beams: n >= 5 ? 3 : 2, turns: 2 + Math.floor(n / 3) % 3,
    loose: n >= 6 ? 2 : 1, split: n >= 3 ? 0.3 : 0, prism: n >= 8 ? 0.3 : 0,
  });

  /* ---------------------------------------------------------- share codes */
  const b64 = s => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); };
  function toCode(w, h, cells, tray) {
    const e = encodeLevel(w, h, cells, tray);
    return 'PRISM1.' + b64(e.rows.join('/') + '|' + e.inv.join(','));
  }
  function fromCode(code) {
    code = String(code).trim();
    if (!code.startsWith('PRISM1.')) throw new Error('Not a PRISM code');
    const [grid, inv] = unb64(code.slice(7)).split('|');
    const rows = grid.split('/');
    const def = buildLevel({ name: 'Shared', rows }, { scramble: false });
    def.tray = (inv ? inv.split(',').filter(Boolean) : []).map(t => { const p = parseToken(t).p; p.src = 'inv'; return p; });
    return def;
  }

  return {
    DX, DY, REF, MASK, LETTER, THR, piece, clonePiece, cloneCells, isMovable, isRotatable, parseToken, tokenOf, buildLevel, encodeLevel,
    trace, solve, generate, hash32, mulberry32, DAILY_OPTS, dailyKey, endlessOpts, toCode, fromCode, rotCost,
  };
});
