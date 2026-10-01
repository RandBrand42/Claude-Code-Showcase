/* ORBITAL - N-body engine.
 *
 * Smart split: "massive" bodies (<= 256) interact pairwise (O(N^2), Plummer-softened); thousands of light
 * "test particles" feel the massive bodies only (O(P*M)). Both are advanced with the same kick-drift-kick
 * velocity-Verlet step, which is symplectic and time-symmetric: with a fixed step, running it with -h
 * retraces the trajectory to round-off. Close encounters shrink the step (chunked adaptive substepping).
 * Pure JS, no DOM: loads in node for the numerical tests.
 */
(function (root) {
  'use strict';
  const O = root.Orbital = root.Orbital || {};

  const CAP_B = 256;        // max massive bodies
  const CAP_P = 24000;      // max test particles
  const TRAIL_LEN = 1800;   // ring-buffer points kept per body trail
  const KILL = 0xFFFF;      // particle flagged dead for a non-absorption reason
  const RANK = { comet: 0, planet: 1, gasgiant: 2, star: 3, blackhole: 4 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  class Sim {
    constructor() {
      const B = () => new Float64Array(CAP_B);
      const P = () => new Float64Array(CAP_P);
      this.x = B(); this.y = B(); this.vx = B(); this.vy = B(); this.ax = B(); this.ay = B();
      this.m = B(); this.r = B(); this.s2 = B();
      this.meta = [];
      this.px = P(); this.py = P(); this.pvx = P(); this.pvy = P(); this.pax = P(); this.pay = P();
      this.plife = new Float32Array(CAP_P);
      this.pkind = new Uint8Array(CAP_P);     // 0 regular, 1 debris, 2 comet tail
      this.pdead = new Uint16Array(CAP_P);    // 0 alive, j+1 absorbed by body j, KILL otherwise
      this.G = 1; this.soft = 1e-3; this.eta = 0.015; this.hMax = 0.01; this.hMinDiv = 4000;
      this.merge = true; this.bound = 1e9; this.rate = 1; this.trailD2 = 0;
      this.rng = Math.random;
      this.dir = 1;
      this.events = [];
      this.nextId = 1;
      this.clear();
    }

    clear() {
      this.n = 0; this.pn = 0; this.time = 0; this.meta.length = 0; this.events.length = 0;
      this.accValid = false; this.overlap = false; this.E0 = null; this.L0 = null;
      this.lastSteps = 0; this.lastH = 0;
    }

    /* ---------- population ---------- */

    addBody(o) {
      if (this.n >= CAP_B) return -1;
      const i = this.n++;
      this.x[i] = o.x; this.y[i] = o.y; this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0;
      this.m[i] = o.m; this.r[i] = o.r;
      const s = o.s === undefined ? this.soft : o.s;
      this.s2[i] = s * s; this.ax[i] = 0; this.ay[i] = 0;
      this.meta[i] = {
        id: this.nextId++, name: o.name || '', type: o.type || 'planet', color: o.color || '#9bb8d8',
        label: o.label !== false && !!o.name, glow: 0, flash: 0, bands: !!o.bands, atmo: o.atmo || null,
        visual: o.visual || 1, hidden: !!o.hidden, born: this.time,
        trail: new Float32Array(TRAIL_LEN * 2), th: 0, tc: 0, lx: NaN, ly: NaN,
      };
      this.accValid = false; this.rebase();
      return i;
    }

    removeBody(i) {
      const l = this.n - 1;
      if (i !== l) {
        for (const k of ['x', 'y', 'vx', 'vy', 'ax', 'ay', 'm', 'r', 's2']) this[k][i] = this[k][l];
        this.meta[i] = this.meta[l];
      }
      this.meta.length = l; this.n = l;
      this.accValid = false; this.rebase();
    }

    indexOf(id) {
      for (let i = 0; i < this.n; i++) if (this.meta[i].id === id) return i;
      return -1;
    }

    addParticle(x, y, vx, vy, life, kind) {
      if (this.pn >= CAP_P) return -1;
      const p = this.pn++;
      this.px[p] = x; this.py[p] = y; this.pvx[p] = vx; this.pvy[p] = vy;
      this.plife[p] = life === undefined ? Infinity : life; this.pkind[p] = kind || 0; this.pdead[p] = 0;
      this.pax[p] = 0; this.pay[p] = 0;
      this.accValid = false;
      return p;
    }

    /* ---------- forces ---------- */

    computeAcc() {
      const n = this.n, G = this.G, x = this.x, y = this.y, m = this.m, s2 = this.s2, r = this.r;
      const ax = this.ax, ay = this.ay;
      for (let i = 0; i < n; i++) { ax[i] = 0; ay[i] = 0; }
      let overlap = false;
      for (let i = 0; i < n; i++) {
        const xi = x[i], yi = y[i], mi = m[i], si = s2[i], ri = r[i];
        for (let j = i + 1; j < n; j++) {
          const dx = x[j] - xi, dy = y[j] - yi;
          const r2 = dx * dx + dy * dy;
          const d2 = r2 + si + s2[j];
          const inv = 1 / (d2 * Math.sqrt(d2));
          const fi = G * m[j] * inv, fj = G * mi * inv;
          ax[i] += fi * dx; ay[i] += fi * dy; ax[j] -= fj * dx; ay[j] -= fj * dy;
          const rr = ri + r[j];
          if (r2 < rr * rr) overlap = true;
        }
      }
      this.overlap = overlap;
      // test particles feel the massive bodies only
      const pn = this.pn, px = this.px, py = this.py, pax = this.pax, pay = this.pay, pdead = this.pdead;
      for (let p = 0; p < pn; p++) {
        const xp = px[p], yp = py[p];
        let fx = 0, fy = 0;
        for (let j = 0; j < n; j++) {
          const dx = x[j] - xp, dy = y[j] - yp;
          const r2 = dx * dx + dy * dy;
          const d2 = r2 + s2[j];
          const f = G * m[j] / (d2 * Math.sqrt(d2));
          fx += f * dx; fy += f * dy;
          const rj = r[j];
          if (r2 < rj * rj && pdead[p] === 0) pdead[p] = j + 1;
        }
        pax[p] = fx; pay[p] = fy;
      }
      this.accValid = true;
    }

    /* ---------- integrator ---------- */

    /** One kick-drift-kick velocity-Verlet step of size h (h may be negative: time reversal). */
    step(h) {
      if (!this.accValid) this.computeAcc();
      const half = 0.5 * h, n = this.n, pn = this.pn;
      const x = this.x, y = this.y, vx = this.vx, vy = this.vy, ax = this.ax, ay = this.ay;
      for (let i = 0; i < n; i++) {
        vx[i] += ax[i] * half; vy[i] += ay[i] * half;
        x[i] += vx[i] * h; y[i] += vy[i] * h;
      }
      const px = this.px, py = this.py, pvx = this.pvx, pvy = this.pvy, pax = this.pax, pay = this.pay;
      for (let p = 0; p < pn; p++) {
        pvx[p] += pax[p] * half; pvy[p] += pay[p] * half;
        px[p] += pvx[p] * h; py[p] += pvy[p] * h;
      }
      this.computeAcc();
      for (let i = 0; i < n; i++) { vx[i] += ax[i] * half; vy[i] += ay[i] * half; }
      for (let p = 0; p < pn; p++) { pvx[p] += pax[p] * half; pvy[p] += pay[p] * half; }
      this.time += h;
      if (this.overlap && this.merge && this.dir > 0) this.resolveMerges();
    }

    /** Largest safe step: eta * shortest pairwise dynamical or crossing time, clamped to [hMax/hMinDiv, hMax]. */
    stepLimit() {
      const n = this.n, G = this.G;
      let tau = Infinity;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i];
          const d2 = dx * dx + dy * dy + this.s2[i] + this.s2[j];
          const rr = Math.sqrt(d2);
          const t1 = Math.sqrt(d2 * rr / (G * (this.m[i] + this.m[j])));
          const dvx = this.vx[j] - this.vx[i], dvy = this.vy[j] - this.vy[i];
          const t2 = rr / (Math.sqrt(dvx * dvx + dvy * dvy) + 1e-30);
          if (t1 < tau) tau = t1;
          if (t2 < tau) tau = t2;
        }
      }
      return Math.max(this.hMax / this.hMinDiv, Math.min(this.hMax, this.eta * tau));
    }

    /**
     * Advance by simDt (signed) using chunks of equal steps, re-choosing the step every 8 steps.
     * Stops early if the wall-clock budget (ms) runs out; returns the sim time actually covered.
     */
    advance(simDt, budgetMs, fixedH) {
      const sign = simDt < 0 ? -1 : 1;
      let remaining = Math.abs(simDt), covered = 0, steps = 0;
      this.dir = sign;
      const t0 = now();
      while (remaining > 1e-12 * Math.max(1, Math.abs(this.time))) {
        const hl = fixedH || this.stepLimit();
        const nChunk = Math.ceil(remaining / hl - 1e-9);
        const h = remaining / nChunk;
        const k = Math.min(8, nChunk);
        for (let s = 0; s < k; s++) this.step(sign * h);
        steps += k; remaining -= k * h; covered += k * h; this.lastH = h;
        this.sampleTrails();
        if (budgetMs && now() - t0 > budgetMs) break;
      }
      this.lastSteps = steps;
      this.cull(covered);
      return sign * covered;
    }

    /* ---------- collisions ---------- */

    resolveMerges() {
      let guard = 0;
      while (guard++ < 32) {
        let hit = null;
        for (let i = 0; i < this.n && !hit; i++) {
          for (let j = i + 1; j < this.n; j++) {
            const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i], rr = this.r[i] + this.r[j];
            if (dx * dx + dy * dy < rr * rr) { hit = [i, j]; break; }
          }
        }
        if (!hit) break;
        this.mergePair(hit[0], hit[1]);
      }
      this.accValid = false;
    }

    mergePair(a, b) {
      let i = a, j = b;
      if (this.m[j] > this.m[i]) { i = b; j = a; }
      const mi = this.m[i], mj = this.m[j], M = mi + mj;
      const vx = (mi * this.vx[i] + mj * this.vx[j]) / M, vy = (mi * this.vy[i] + mj * this.vy[j]) / M;
      const x = (mi * this.x[i] + mj * this.x[j]) / M, y = (mi * this.y[i] + mj * this.y[j]) / M;
      const mti = this.meta[i], mtj = this.meta[j];
      const vrel = Math.hypot(this.vx[i] - this.vx[j], this.vy[i] - this.vy[j]);
      const bh = mti.type === 'blackhole' || mtj.type === 'blackhole';
      let rNew;
      if (mti.type === 'blackhole') rNew = this.r[i] * M / mi;
      else if (mtj.type === 'blackhole') rNew = this.r[j] * M / mj;
      else rNew = Math.cbrt(this.r[i] ** 3 + this.r[j] ** 3);
      if (!bh) {
        const vesc = Math.sqrt(2 * this.G * M / rNew);
        const nD = Math.min(56, 14 + Math.floor(44 * Math.sqrt(mj / mi)));
        for (let k = 0; k < nD; k++) {
          const ang = this.rng() * 6.2831853, sp = (0.35 + 0.9 * this.rng()) * (0.55 * vrel + 0.45 * vesc);
          const off = rNew * (1.08 + 0.5 * this.rng());
          this.addParticle(x + Math.cos(ang) * off, y + Math.sin(ang) * off, vx + Math.cos(ang) * sp, vy + Math.sin(ang) * sp,
            this.rate * (2.2 + 2.2 * this.rng()), 1);
        }
      }
      this.events.push({ kind: bh ? 'absorb' : 'merge', x, y, size: rNew, time: this.time, id: mti.id });
      const jWins = RANK[mtj.type] > RANK[mti.type];
      const src = jWins ? mtj : mti;
      mti.type = src.type; mti.color = src.color; mti.bands = src.bands; mti.atmo = src.atmo; mti.visual = Math.max(mti.visual, mtj.visual);
      if (!mti.name || jWins) mti.name = src.name;
      mti.flash = 1; mti.glow = Math.min(3, mti.glow + (bh ? 1.2 : 0.4));
      this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.m[i] = M; this.r[i] = rNew;
      this.s2[i] = Math.max(this.s2[i], this.s2[j]);
      this.removeBody(j);
    }

    /** Remove dead / absorbed / expired / escaped particles and age the short-lived ones. */
    cull(dt) {
      for (let p = this.pn - 1; p >= 0; p--) {
        let dead = this.pdead[p];
        const life = this.plife[p];
        if (life !== Infinity) {
          this.plife[p] = life - dt;
          if (life - dt <= 0) dead = dead || KILL;
        }
        if (!dead && !(Math.abs(this.px[p]) + Math.abs(this.py[p]) < this.bound)) dead = KILL;
        if (!dead) continue;
        if (dead !== KILL && dead <= this.n) {
          const mt = this.meta[dead - 1];
          mt.glow = Math.min(3, mt.glow + (mt.type === 'blackhole' ? 0.03 : 0.004));
        }
        const l = --this.pn;
        if (p !== l) {
          this.px[p] = this.px[l]; this.py[p] = this.py[l]; this.pvx[p] = this.pvx[l]; this.pvy[p] = this.pvy[l];
          this.pax[p] = this.pax[l]; this.pay[p] = this.pay[l]; this.plife[p] = this.plife[l];
          this.pkind[p] = this.pkind[l]; this.pdead[p] = this.pdead[l];
        }
        this.pdead[l] = 0;
      }
    }

    sampleTrails() {
      const d2 = this.trailD2;
      for (let i = 0; i < this.n; i++) {
        const mt = this.meta[i];
        const dx = this.x[i] - mt.lx, dy = this.y[i] - mt.ly;
        if (dx * dx + dy * dy < d2) continue;          // NaN (first sample) falls through
        mt.trail[mt.th * 2] = this.x[i]; mt.trail[mt.th * 2 + 1] = this.y[i];
        mt.th = (mt.th + 1) % TRAIL_LEN; if (mt.tc < TRAIL_LEN) mt.tc++;
        mt.lx = this.x[i]; mt.ly = this.y[i];
      }
    }

    clearTrails() { for (const mt of this.meta) { mt.th = 0; mt.tc = 0; mt.lx = NaN; mt.ly = NaN; } }

    /* ---------- diagnostics ---------- */

    energy() {
      let K = 0, U = 0;
      for (let i = 0; i < this.n; i++) {
        K += 0.5 * this.m[i] * (this.vx[i] ** 2 + this.vy[i] ** 2);
        for (let j = i + 1; j < this.n; j++) {
          const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i];
          U -= this.G * this.m[i] * this.m[j] / Math.sqrt(dx * dx + dy * dy + this.s2[i] + this.s2[j]);
        }
      }
      return K + U;
    }

    angMom() {
      let L = 0;
      for (let i = 0; i < this.n; i++) L += this.m[i] * (this.x[i] * this.vy[i] - this.y[i] * this.vx[i]);
      return L;
    }

    /** Reset the drift baselines (after discrete events such as merges, additions, removals). */
    rebase() { this.E0 = null; this.L0 = null; }

    /** Returns {dE, dL}: relative drift of total energy / angular momentum since the last baseline. */
    drift() {
      const E = this.energy(), L = this.angMom();
      if (this.E0 === null) { this.E0 = E; this.L0 = L; }
      const dE = this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0;
      const dL = Math.abs(this.L0) > 1e-14 ? (L - this.L0) / Math.abs(this.L0) : L - this.L0;
      return { dE, dL, E, L };
    }

    /* ---------- queries ---------- */

    /** Body exerting the strongest pull at (x,y), ignoring index skip. -1 if none. */
    dominant(x, y, skip) {
      let best = -1, bf = 0;
      for (let i = 0; i < this.n; i++) {
        if (i === skip) continue;
        const dx = this.x[i] - x, dy = this.y[i] - y;
        const f = this.m[i] / (dx * dx + dy * dy + this.s2[i] + 1e-30);
        if (f > bf) { bf = f; best = i; }
      }
      return best;
    }

    /** Circular speed at (x,y) around the local dominant attractor (plus bodies bound close to it). */
    vcirc(x, y) {
      const d = this.dominant(x, y, -1);
      if (d < 0) return 0;
      const dx = x - this.x[d], dy = y - this.y[d];
      const r2 = dx * dx + dy * dy;
      let M = this.m[d];
      for (let i = 0; i < this.n; i++) {
        if (i === d) continue;
        const ex = this.x[i] - this.x[d], ey = this.y[i] - this.y[d];
        if (ex * ex + ey * ey < 0.25 * r2) M += this.m[i];
      }
      return Math.sqrt(this.G * M * r2 / Math.pow(r2 + this.s2[d], 1.5));
    }

    /** Osculating elements of body i about its dominant attractor. */
    elements(i) {
      const a = this.dominant(this.x[i], this.y[i], i);
      if (a < 0) return null;
      const rx = this.x[i] - this.x[a], ry = this.y[i] - this.y[a];
      const vx = this.vx[i] - this.vx[a], vy = this.vy[i] - this.vy[a];
      const mu = this.G * (this.m[a] + this.m[i]);
      const r = Math.hypot(rx, ry), v2 = vx * vx + vy * vy, rv = rx * vx + ry * vy;
      const en = v2 / 2 - mu / r, h = rx * vy - ry * vx;
      const ex = ((v2 - mu / r) * rx - rv * vx) / mu, ey = ((v2 - mu / r) * ry - rv * vy) / mu;
      const e = Math.hypot(ex, ey), bound = en < 0;
      const sma = bound ? -mu / (2 * en) : Infinity;
      const p = h * h / mu;
      return { ref: a, r, v: Math.sqrt(v2), a: sma, e, T: bound ? 2 * Math.PI * Math.sqrt(sma ** 3 / mu) : Infinity,
        omega: Math.atan2(ey, ex), p, peri: p / (1 + e), apo: bound ? p / (1 - e) : Infinity, dirn: h < 0 ? -1 : 1, bound, mu };
    }

    /* ---------- history ---------- */

    snapshot() {
      const n = this.n, pn = this.pn;
      const s = {
        t: this.time, n, pn, E0: this.E0, L0: this.L0,
        x: this.x.slice(0, n), y: this.y.slice(0, n), vx: this.vx.slice(0, n), vy: this.vy.slice(0, n),
        m: this.m.slice(0, n), r: this.r.slice(0, n), s2: this.s2.slice(0, n),
        meta: this.meta.slice(), mst: this.meta.map((q) => [q.type, q.name, q.color, q.bands, q.atmo, q.visual]),
        px: this.px.slice(0, pn), py: this.py.slice(0, pn), pvx: this.pvx.slice(0, pn), pvy: this.pvy.slice(0, pn),
        plife: this.plife.slice(0, pn), pkind: this.pkind.slice(0, pn),
      };
      s.bytes = (n * 7 + pn * 4) * 8 + pn * 5;
      return s;
    }

    restore(s) {
      this.n = s.n; this.pn = s.pn; this.time = s.t; this.E0 = s.E0; this.L0 = s.L0;
      this.x.set(s.x); this.y.set(s.y); this.vx.set(s.vx); this.vy.set(s.vy);
      this.m.set(s.m); this.r.set(s.r); this.s2.set(s.s2);
      this.meta = s.meta.slice();
      this.meta.forEach((q, k) => { const t = s.mst[k]; q.type = t[0]; q.name = t[1]; q.color = t[2]; q.bands = t[3]; q.atmo = t[4]; q.visual = t[5]; });
      this.px.set(s.px); this.py.set(s.py); this.pvx.set(s.pvx); this.pvy.set(s.pvy);
      this.plife.set(s.plife); this.pkind.set(s.pkind);
      this.pdead.fill(0, 0, s.pn);
      this.clearTrails();
      this.accValid = false; this.events.length = 0;
    }
  }

  /**
   * Predict the path of a hypothetical new body (nb: x,y,vx,vy,m,r,s) against a copy of the current heavy bodies.
   * The new body's own gravity is included. Returns {pts: Float32Array xy pairs, count, impact, tEnd}.
   */
  let predSim = null;
  function predictPath(sim, nb, maxSteps) {
    if (!predSim) predSim = new Sim();
    const q = predSim;
    q.clear(); q.G = sim.G; q.merge = false; q.eta = 0.03; q.hMax = sim.hMax * 4; q.hMinDiv = 6000; q.dir = 1; q.trailD2 = Infinity;
    // copy up to 40 heaviest bodies
    const order = [];
    for (let i = 0; i < sim.n; i++) order.push(i);
    order.sort((a, b) => sim.m[b] - sim.m[a]);
    const use = order.slice(0, 40);
    for (const i of use) {
      q.x[q.n] = sim.x[i]; q.y[q.n] = sim.y[i]; q.vx[q.n] = sim.vx[i]; q.vy[q.n] = sim.vy[i];
      q.m[q.n] = sim.m[i]; q.r[q.n] = sim.r[i]; q.s2[q.n] = sim.s2[i]; q.n++;
    }
    const k = q.n++;
    q.x[k] = nb.x; q.y[k] = nb.y; q.vx[k] = nb.vx; q.vy[k] = nb.vy; q.m[k] = nb.m; q.r[k] = nb.r; q.s2[k] = nb.s * nb.s;
    for (let i = 0; i < q.n; i++) if (!q.meta[i]) q.meta[i] = { lx: NaN, ly: NaN, trail: new Float32Array(2), th: 0, tc: 0 };
    q.accValid = false;
    const dom = q.dominant(nb.x, nb.y, k);
    const cap = 360, pts = new Float32Array(cap * 2);
    let count = 0, angle = 0, impact = null, t = 0;
    let lastA = dom >= 0 ? Math.atan2(nb.y - q.y[dom], nb.x - q.x[dom]) : 0;
    const every = Math.max(1, Math.floor(maxSteps / cap));
    for (let s = 0; s < maxSteps; s++) {
      if (s % 4 === 0) q.h = q.stepLimit();
      q.step(q.h); t += q.h;
      if (s % every === 0 && count < cap) { pts[count * 2] = q.x[k]; pts[count * 2 + 1] = q.y[k]; count++; }
      for (let i = 0; i < k; i++) {
        const dx = q.x[i] - q.x[k], dy = q.y[i] - q.y[k], rr = q.r[i] + q.r[k];
        if (dx * dx + dy * dy < rr * rr) { impact = { x: q.x[k], y: q.y[k] }; break; }
      }
      if (impact) break;
      if (dom >= 0) {
        const a = Math.atan2(q.y[k] - q.y[dom], q.x[k] - q.x[dom]);
        let da = a - lastA; if (da > Math.PI) da -= 6.2831853; if (da < -Math.PI) da += 6.2831853;
        angle += Math.abs(da); lastA = a;
        if (angle > 2.35 * Math.PI) break;
      }
    }
    if (count < cap) { pts[count * 2] = q.x[k]; pts[count * 2 + 1] = q.y[k]; count++; }
    return { pts, count, impact, tEnd: t };
  }

  O.Sim = Sim;
  O.predictPath = predictPath;
  O.consts = { CAP_B, CAP_P, TRAIL_LEN, RANK };
})(typeof window !== 'undefined' ? window : globalThis);
