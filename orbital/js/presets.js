/* ORBITAL - the ten scenes. Every body, mass and orbit here is synthetic or textbook-approximate; bodies outside the
 * Solar System carry invented names. Each preset fixes its own unit system so G and the readouts stay meaningful. */
(function (root) {
  'use strict';
  const O = root.Orbital = root.Orbital || {};
  const U = O.util;
  const TAU = Math.PI * 2;
  const G_AU = 4 * Math.PI * Math.PI;           // AU^3 / (Msun yr^2)

  /** State of a body on a Kepler orbit about a primary (2D). nu = true anomaly, w = orientation, dirn = +1/-1 sense. */
  function kepler(mu, a, e, nu, w, dirn) {
    const p = a * (1 - e * e), r = p / (1 + e * Math.cos(nu));
    const vr = Math.sqrt(mu / p) * e * Math.sin(nu), vt = Math.sqrt(mu / p) * (1 + e * Math.cos(nu));
    const c = Math.cos(nu), s = Math.sin(nu);
    let x = r * c, y = r * s, vx = vr * c - vt * s, vy = vr * s + vt * c;
    const cw = Math.cos(w), sw = Math.sin(w);
    const rot = (u, v) => [u * cw - v * sw, u * sw + v * cw];
    [x, y] = rot(x, y); [vx, vy] = rot(vx, vy);
    if (dirn < 0) { y = -y; vy = -vy; }
    return { x, y, vx, vy };
  }

  /** Move the whole system (bodies + particles) to the barycentre frame with zero net momentum. */
  function zeroMomentum(sim) {
    let M = 0, cx = 0, cy = 0, px = 0, py = 0;
    for (let i = 0; i < sim.n; i++) {
      M += sim.m[i]; cx += sim.m[i] * sim.x[i]; cy += sim.m[i] * sim.y[i]; px += sim.m[i] * sim.vx[i]; py += sim.m[i] * sim.vy[i];
    }
    if (!M) return;
    cx /= M; cy /= M; px /= M; py /= M;
    for (let i = 0; i < sim.n; i++) { sim.x[i] -= cx; sim.y[i] -= cy; sim.vx[i] -= px; sim.vy[i] -= py; }
    for (let p = 0; p < sim.pn; p++) { sim.px[p] -= cx; sim.py[p] -= cy; sim.pvx[p] -= px; sim.pvy[p] -= py; }
  }

  /** Belt / ring of test particles on near-circular orbits about body index c. */
  function addRing(sim, rng, c, n, a0, a1, o = {}) {
    const mu = sim.G * sim.m[c], ecc = o.ecc === undefined ? 0.015 : o.ecc;
    for (let k = 0; k < n; k++) {
      const a = a0 + (a1 - a0) * rng(), e = Math.abs(rng.normal()) * ecc;
      const st = kepler(mu, a, e, rng() * TAU, rng() * TAU, 1);
      sim.addParticle(sim.x[c] + st.x, sim.y[c] + st.y, sim.vx[c] + st.vx, sim.vy[c] + st.vy);
    }
  }

  /** Exponential stellar disc with two seeded spiral arms; rotation follows the softened core potential. */
  function addDisc(sim, rng, o) {
    for (let k = 0; k < o.n; k++) {
      let r;
      do { r = -o.scale * (Math.log(rng()) + Math.log(rng())); } while (r < o.rin || r > o.rout);
      const arm = k & 1;
      let th = rng() < 0.3 ? rng() * TAU : arm * Math.PI + Math.log(r / o.rin) * 2.3 + rng.normal() * 0.42;
      th += o.rot || 0;
      const vc = Math.sqrt(o.M * r * r / Math.pow(r * r + o.s * o.s, 1.5));
      const c = Math.cos(th), s = Math.sin(th), sg = 0.035 * vc;
      const vt = vc * (1 + rng.normal() * 0.02) * o.dirn, vrad = rng.normal() * sg;
      sim.addParticle(o.x + r * c, o.y + r * s, o.vx - vt * s + vrad * c, o.vy + vt * c + vrad * s);
    }
  }

  const ladderSolar = [[1000, 'kyr'], [1, 'yr'], [1 / 365.25, 'd']];
  const tfmt = (scale, ladder) => (t) => U.fmtLadder(t * scale, ladder);

  const SOLAR_UNITS = { len: 'AU', mass: 'Msun', vel: 'km/s', vf: 4.74047, tfmt: tfmt(1, ladderSolar), tname: 'yr' };
  const SOLAR_SPAWN = {
    planet: { m: 3.0e-6, r: 0.011 }, star: { m: 1, r: 0.035 }, gasgiant: { m: 9.5e-4, r: 0.022 },
    blackhole: { m: 2, r: 0.022 }, comet: { m: 1e-10, r: 0.005 },
  };

  const presets = [];

  /* 1 ------------------------------------------------------------------ */
  presets.push({
    key: 'solar', name: 'Inner Solar System', sub: '6 bodies · asteroid swarm',
    caption: 'Mercury to Jupiter on textbook orbits. Masses, distances and eccentricities are real; sizes are exaggerated so you can see them.',
    units: SOLAR_UNITS, G: G_AU, soft: 1e-4, hMax: 0.01, eta: 0.015, rate: 0.16, mult: 1, radius: 2.3,
    trails: 'mid', spawn: SOLAR_SPAWN, massRef: 1, bound: 400, seed: 11,
    build(sim, rng) {
      const sun = sim.addBody({ name: 'Sun', type: 'star', m: 1, r: 0.035, x: 0, y: 0, vx: 0, vy: 0, color: '#ffe9c4' });
      const planets = [
        ['Mercury', 1.66e-7, 0.387, 0.2056, 1.35, '#b9b1a6', 0.0050, null],
        ['Venus', 2.45e-6, 0.723, 0.0068, 2.29, '#ecd9a6', 0.0085, '#ffe6b0'],
        ['Earth', 3.0e-6, 1.0, 0.0167, 1.80, '#4c8fe0', 0.0090, '#8fd0ff'],
        ['Mars', 3.23e-7, 1.524, 0.0934, 5.86, '#c2643c', 0.0065, '#ffb08a'],
      ];
      planets.forEach(([name, m, a, e, w, col, r, atmo], k) => {
        const st = kepler(G_AU * (1 + m), a, e, rng() * TAU, w, 1);
        sim.addBody({ name, type: 'planet', m, r, color: col, atmo, x: st.x, y: st.y, vx: st.vx, vy: st.vy });
      });
      const st = kepler(G_AU * (1 + 9.55e-4), 5.203, 0.0489, 0.9, 0.25, 1);
      sim.addBody({ name: 'Jupiter', type: 'gasgiant', m: 9.55e-4, r: 0.02, color: '#d9b28a', bands: true, x: st.x, y: st.y, vx: st.vx, vy: st.vy });
      addRing(sim, rng, sun, 1100, 2.1, 3.25, { ecc: 0.05 });
      zeroMomentum(sim);
    },
  });

  /* 2 ------------------------------------------------------------------ */
  presets.push({
    key: 'eight', name: 'Figure-Eight', sub: '3 bodies · choreography',
    caption: 'Three equal masses chase one another along a single figure-eight curve. Found numerically in 1993, proved to exist in 2000. Nudge one and watch it unravel.',
    units: { len: 'u', mass: 'm', vel: 'u/t', vf: 1, tfmt: (t) => U.fmt(t, 4) + ' t', tname: 't' },
    G: 1, soft: 0, hMax: 0.01, eta: 0.012, rate: 0.85, mult: 1, radius: 1.45, trails: 'long',
    spawn: { planet: { m: 0.05, r: 0.018 }, star: { m: 1, r: 0.04 }, gasgiant: { m: 0.2, r: 0.03 }, blackhole: { m: 1.5, r: 0.03 }, comet: { m: 1e-7, r: 0.008 } },
    massRef: 1, bound: 200, seed: 3,
    build(sim) {
      // Chenciner-Montgomery / Simo initial conditions, G = m = 1, period 6.32591398
      const p1 = [-0.97000436, 0.24308753], v3 = [-0.93240737, -0.86473146];
      const cols = ['#ffd38a', '#8fd8ff', '#ff9ab8'];
      sim.addBody({ name: 'Alpha', type: 'star', m: 1, r: 0.04, x: p1[0], y: p1[1], vx: -v3[0] / 2, vy: -v3[1] / 2, color: cols[0] });
      sim.addBody({ name: 'Beta', type: 'star', m: 1, r: 0.04, x: -p1[0], y: -p1[1], vx: -v3[0] / 2, vy: -v3[1] / 2, color: cols[1] });
      sim.addBody({ name: 'Gamma', type: 'star', m: 1, r: 0.04, x: 0, y: 0, vx: v3[0], vy: v3[1], color: cols[2] });
    },
  });

  /* 3 ------------------------------------------------------------------ */
  presets.push({
    key: 'trojans', name: 'Lagrange Trojans', sub: 'rotating frame · tadpole orbits',
    caption: 'Two swarms ride 60 degrees ahead of and behind a giant planet. Viewed in Jupiter\'s rotating frame you can see them librate in tadpole loops.',
    units: SOLAR_UNITS, G: G_AU, soft: 1e-4, hMax: 0.03, eta: 0.015, rate: 0.9, mult: 25, radius: 7.4,
    trails: 'off', spawn: SOLAR_SPAWN, massRef: 1, bound: 400, seed: 5, follow: 'Sun', rot: 'Jupiter', guides: [],
    build(sim, rng) {
      const sun = sim.addBody({ name: 'Sun', type: 'star', m: 1, r: 0.08, x: 0, y: 0, color: '#ffe9c4' });
      const mj = 9.55e-4, a = 5.2;
      const st = kepler(G_AU * (1 + mj), a, 0.0, 0, 0, 1);
      const jup = sim.addBody({ name: 'Jupiter', type: 'gasgiant', m: mj, r: 0.06, color: '#d9b28a', bands: true, x: st.x, y: st.y, vx: st.vx, vy: st.vy });
      const mu = G_AU * (1 + mj);
      for (const sgn of [1, -1]) {
        for (let k = 0; k < 330; k++) {
          const ang = sgn * Math.PI / 3 + rng.normal() * 0.17, rad = a + rng.normal() * 0.11;
          const s = kepler(mu, rad, 0.012, ang, 0, 1);
          // kepler() places the body at its true anomaly; add the tiny eccentric kick so tadpoles librate
          sim.addParticle(s.x, s.y, s.vx, s.vy);
        }
      }
      // a few named trojans to click on
      [['Patroclus-like', 1], ['Hektor-like', 1], ['Anchises-like', -1]].forEach(([name, sg], k) => {
        const s = kepler(mu, a + 0.04 * k, 0.01, sg * (Math.PI / 3 + 0.12 * k), 0, 1);
        sim.addBody({ name, type: 'planet', m: 1e-11, r: 0.03, color: '#9fd6ff', x: s.x, y: s.y, vx: s.vx, vy: s.vy });
      });
      zeroMomentum(sim);
      void sun; void jup;
    },
  });

  /* 4 ------------------------------------------------------------------ */
  presets.push({
    key: 'binary', name: 'Binary + Circumbinary', sub: '2 suns · 3 worlds · debris disc',
    caption: 'Two stars waltz every 47 days while planets orbit the pair. Stay outside roughly three times the binary separation and the orbits survive.',
    units: SOLAR_UNITS, G: G_AU, soft: 1e-4, hMax: 0.004, eta: 0.015, rate: 0.14, mult: 1, radius: 2.0,
    trails: 'mid', spawn: SOLAR_SPAWN, massRef: 1, bound: 300, seed: 21,
    build(sim, rng) {
      const m1 = 1.0, m2 = 0.6, sep = 0.3, M = m1 + m2;
      const v = Math.sqrt(G_AU * M / sep);
      sim.addBody({ name: 'Veyra A', type: 'star', m: m1, r: 0.03, x: -sep * m2 / M, y: 0, vx: 0, vy: -v * m2 / M, color: '#ffe3b0' });
      sim.addBody({ name: 'Veyra B', type: 'star', m: m2, r: 0.024, x: sep * m1 / M, y: 0, vx: 0, vy: v * m1 / M, color: '#ffab70' });
      [['Veyra b', 1.4e-5, 1.15, 2.1, '#6ea8e6', 0.008], ['Veyra c', 9e-4, 1.7, 4.4, '#d6b48a', 0.016], ['Veyra d', 4e-5, 0.92, 0.6, '#c78b6a', 0.008]].forEach(([name, m, a, nu, col, r]) => {
        const s = kepler(G_AU * (M + m), a, 0.02, nu, 0, 1);
        sim.addBody({ name, type: m > 3e-4 ? 'gasgiant' : 'planet', m, r, color: col, bands: m > 3e-4, x: s.x, y: s.y, vx: s.vx, vy: s.vy });
      });
      const s0 = { m: M };
      const mu = G_AU * s0.m;
      for (let k = 0; k < 1500; k++) {
        const a = 1.95 + rng() * 1.6, s = kepler(mu, a, Math.abs(rng.normal()) * 0.03, rng() * TAU, 0, 1);
        sim.addParticle(s.x, s.y, s.vx, s.vy);
      }
      zeroMomentum(sim);
    },
  });

  /* 5 ------------------------------------------------------------------ */
  presets.push({
    key: 'belt', name: 'Asteroid Belt & Jupiter', sub: '5,000 particles · Kirkwood gaps',
    caption: 'Jupiter, boosted 5x so it works in minutes rather than millennia, carves resonant gaps into a smooth belt. Raise the speed and watch the 3:1 and 5:2 gaps open.',
    units: SOLAR_UNITS, G: G_AU, soft: 1e-4, hMax: 0.04, eta: 0.02, rate: 5, mult: 25, radius: 4.2,
    trails: 'off', spawn: SOLAR_SPAWN, massRef: 1, bound: 500, seed: 9, belt: true,
    guides: { a: 5.2, list: [['3:1', 3], ['5:2', 2.5], ['7:3', 7 / 3], ['2:1', 2]] },
    build(sim, rng) {
      const sun = sim.addBody({ name: 'Sun', type: 'star', m: 1, r: 0.06, x: 0, y: 0, color: '#ffe9c4' });
      const mj = 9.55e-4 * 5;
      const s = kepler(G_AU * (1 + mj), 5.2, 0.07, 0.4, 0.3, 1);
      sim.addBody({ name: 'Jupiter (x5)', type: 'gasgiant', m: mj, r: 0.05, color: '#d9b28a', bands: true, x: s.x, y: s.y, vx: s.vx, vy: s.vy });
      addRing(sim, rng, sun, 5000, 2.0, 3.6, { ecc: 0.012 });
      zeroMomentum(sim);
    },
  });

  /* 6 ------------------------------------------------------------------ */
  const GAL = {
    len: 'kpc', mass: '10^11 Msun', vel: 'km/s', vf: 655.8,
    tfmt: tfmt(1.49, [[1000, 'Gyr'], [1, 'Myr']]), tname: 'Myr',
  };
  const GAL_SPAWN = {
    planet: { m: 0.0015, r: 0.25 }, star: { m: 0.02, r: 0.4 }, gasgiant: { m: 0.005, r: 0.3 },
    blackhole: { m: 0.12, r: 0.35 }, comet: { m: 1e-6, r: 0.15 },
  };
  presets.push({
    key: 'spiral', name: 'Spiral Galaxy', sub: '8,000 stars · differential rotation',
    caption: 'A rotating disc of 8,000 light particles orbiting a massive core. Inner stars lap outer ones, winding the seeded arms; drifting dark clumps keep stirring it.',
    units: GAL, G: 1, soft: 0.15, hMax: 0.3, eta: 0.03, rate: 6, mult: 2, radius: 15, trails: 'off',
    spawn: GAL_SPAWN, massRef: 0.02, bound: 2000, seed: 17,
    build(sim, rng) {
      sim.addBody({ name: 'Galactic core', type: 'star', m: 1, r: 0.6, s: 2.4, x: 0, y: 0, color: '#ffe2b8', label: false, visual: 2.4 });
      for (let k = 0; k < 6; k++) {
        const r = 3.2 + k * 1.2 + rng() * 0.6, th = rng() * TAU, vc = Math.sqrt(r * r / Math.pow(r * r + 2.4 * 2.4, 1.5));
        sim.addBody({ name: 'Clump ' + (k + 1), type: 'star', m: 0.003, r: 0.2, s: 0.5, x: r * Math.cos(th), y: r * Math.sin(th),
          vx: -vc * Math.sin(th), vy: vc * Math.cos(th), color: '#9fc4ff', label: false, visual: 0.6 });
      }
      addDisc(sim, rng, { x: 0, y: 0, vx: 0, vy: 0, M: 1, s: 2.4, n: 8000, rin: 0.9, rout: 12.5, scale: 3.4, dirn: 1 });
      zeroMomentum(sim);
    },
  });

  /* 7 ------------------------------------------------------------------ */
  presets.push({
    key: 'collision', name: 'Galaxy Collision', sub: '2 discs · tidal tails',
    caption: 'Two spinning discs fall together on a near-parabolic orbit. Their tidal tails and bridges are built entirely by gravity acting on the cores.',
    units: GAL, G: 1, soft: 0.15, hMax: 0.3, eta: 0.03, rate: 8, mult: 2, radius: 27, trails: 'off',
    spawn: GAL_SPAWN, massRef: 0.02, bound: 4000, seed: 29,
    build(sim, rng) {
      const M1 = 1, M2 = 0.7, mu = M1 + M2, D = 34, rp = 7.5, al = Math.PI * 0.82;
      const v2 = 2 * mu / D, L = Math.sqrt(2 * mu * rp), vt = L / D, vr = -Math.sqrt(v2 - vt * vt);
      const ux = Math.cos(al), uy = Math.sin(al), tx = -uy, ty = ux;
      const Rx = ux * D, Ry = uy * D, Vx = ux * vr + tx * vt, Vy = uy * vr + ty * vt;
      const f1 = M2 / mu, f2 = M1 / mu;
      const a = { x: -f1 * Rx, y: -f1 * Ry, vx: -f1 * Vx, vy: -f1 * Vy }, b = { x: f2 * Rx, y: f2 * Ry, vx: f2 * Vx, vy: f2 * Vy };
      sim.addBody({ name: 'Nimbus core', type: 'star', m: M1, r: 0.6, s: 2.2, ...a, color: '#ffe2b8', label: false, visual: 2.3 });
      sim.addBody({ name: 'Harrow core', type: 'star', m: M2, r: 0.55, s: 1.9, ...b, color: '#bcd6ff', label: false, visual: 2.0 });
      addDisc(sim, rng, { ...a, M: M1, s: 2.2, n: 4200, rin: 0.9, rout: 11, scale: 3.0, dirn: 1 });
      addDisc(sim, rng, { ...b, M: M2, s: 1.9, n: 3800, rin: 0.9, rout: 9.5, scale: 2.7, dirn: 1, rot: 1.2 });
    },
  });

  /* 8 ------------------------------------------------------------------ */
  presets.push({
    key: 'gauntlet', name: 'Slingshot Gauntlet', sub: 'probe stream · 3 giants',
    caption: 'A ribbon of 600 probes threads past three gas giants. Each one is flung somewhere different depending on which giant it meets. Spot the gravity assists.',
    units: SOLAR_UNITS, G: G_AU, soft: 1e-3, hMax: 0.01, eta: 0.015, rate: 0.4, mult: 1, radius: 11, trails: 'short',
    spawn: SOLAR_SPAWN, massRef: 1, bound: 500, seed: 37,
    build(sim, rng) {
      const sun = sim.addBody({ name: 'Tharsis', type: 'star', m: 1.2, r: 0.08, x: 0, y: 0, color: '#ffe9c4' });
      const g = [['Tharsis I', 0.004, 3.6, 0.3, '#c9a07a'], ['Tharsis II', 0.0028, 6.3, 2.6, '#9ab8d8'], ['Tharsis III', 0.005, 9.2, 4.5, '#d6c2a0']];
      for (const [name, m, a, nu, col] of g) {
        const s = kepler(G_AU * (1.2 + m), a, 0.0, nu, 0, 1);
        sim.addBody({ name, type: 'gasgiant', m, r: 0.07, color: col, bands: true, x: s.x, y: s.y, vx: s.vx, vy: s.vy });
      }
      const N = 600;
      for (let k = 0; k < N; k++) {
        const u = k / N, b = 1.0 + 7.5 * u + 0.6 * Math.sin(u * 40);
        sim.addParticle(-19 - 0.045 * k, -b * 0.85 + 0.0, 6.3, 0.35 * Math.cos(u * 9));
      }
      zeroMomentum(sim);
      void sun;
    },
  });

  /* 9 ------------------------------------------------------------------ */
  presets.push({
    key: 'cluster', name: 'Random Star Cluster', sub: '150 stars · full N-body',
    caption: 'One hundred fifty stars in a Plummer sphere, every pair interacting. Watch binaries form, stars get ejected, and the odd collision merge.',
    units: { len: 'pc', mass: 'Msun', vel: 'km/s', vf: 1, tfmt: tfmt(0.978, [[1000, 'Gyr'], [1, 'Myr']]), tname: 'Myr' },
    G: 0.0043009, soft: 0.004, hMax: 0.02, eta: 0.015, rate: 0.7, mult: 2, radius: 4.2, trails: 'short',
    spawn: { planet: { m: 0.1, r: 0.03 }, star: { m: 1, r: 0.04 }, gasgiant: { m: 0.4, r: 0.035 }, blackhole: { m: 30, r: 0.06 }, comet: { m: 0.001, r: 0.02 } },
    massRef: 1, bound: 500, seed: 41,
    build(sim, rng) {
      const N = 150, a = 1.6;
      const masses = [];
      for (let k = 0; k < N; k++) masses.push(Math.min(9, 0.25 * Math.pow(1 - rng() * 0.985, -0.75)));   // heavy-tailed IMF-ish
      const Mtot = masses.reduce((s, v) => s + v, 0);
      for (let k = 0; k < N; k++) {
        const X = rng() * 0.97 + 0.01, r = a / Math.sqrt(Math.pow(X, -2 / 3) - 1), th = rng() * TAU;
        // Aarseth rejection sampling for speed
        let q, g;
        do { q = rng(); g = rng() * 0.1; } while (g > q * q * Math.pow(1 - q * q, 3.5));
        const ve = Math.sqrt(2 * sim.G * Mtot) * Math.pow(r * r + a * a, -0.25), v = q * ve, ph = rng() * TAU;
        const m = masses[k], col = U.starRGB(m);
        sim.addBody({ name: '', type: 'star', m, r: 0.012 * Math.cbrt(m) + 0.006, x: r * Math.cos(th), y: r * Math.sin(th),
          vx: v * Math.cos(ph), vy: v * Math.sin(ph), color: '#' + col.map((c) => (c | 0).toString(16).padStart(2, '0')).join(''), label: false, visual: 0.8 });
      }
      for (let k = 0; k < 1400; k++) {
        const X = rng() * 0.97 + 0.01, r = 1.15 * a / Math.sqrt(Math.pow(X, -2 / 3) - 1), th = rng() * TAU;
        const vc = Math.sqrt(sim.G * Mtot * r * r / Math.pow(r * r + a * a, 1.5)) * 0.9, ph = th + Math.PI / 2 + rng.normal() * 0.6;
        sim.addParticle(r * Math.cos(th), r * Math.sin(th), vc * Math.cos(ph), vc * Math.sin(ph));
      }
      zeroMomentum(sim);
    },
  });

  /* 10 ----------------------------------------------------------------- */
  presets.push({
    key: 'sandbox', name: 'Empty Sandbox', sub: 'nothing yet · your rules',
    caption: 'A blank sheet in solar units. Click to drop a star, then drag to fling planets around it. Mouse wheel while dragging sets the mass.',
    units: SOLAR_UNITS, G: G_AU, soft: 1e-4, hMax: 0.01, eta: 0.015, rate: 0.2, mult: 1, radius: 3, trails: 'mid',
    spawn: SOLAR_SPAWN, massRef: 1, bound: 500, seed: 1, empty: true,
    build() { /* intentionally empty */ },
  });

  /** Reset a Sim and populate it from preset p (deterministic: the preset seeds its own PRNG). */
  function loadPreset(sim, p) {
    sim.clear();
    sim.G = p.G; sim.soft = p.soft; sim.eta = p.eta; sim.hMax = p.hMax; sim.bound = p.bound; sim.rate = p.rate;
    sim.merge = true;
    const rng = U.makeRng(p.seed);
    sim.rng = U.makeRng(p.seed + 1000);
    p.build(sim, rng);
    sim.accValid = false;
    sim.rebase();
    return sim;
  }

  O.presets = presets;
  O.kepler = kepler;
  O.loadPreset = loadPreset;
})(typeof window !== 'undefined' ? window : globalThis);
