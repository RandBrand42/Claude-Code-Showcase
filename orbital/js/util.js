/* ORBITAL - shared helpers: seeded PRNG, number formatting, colour maths. */
(function (root) {
  'use strict';
  const O = root.Orbital = root.Orbital || {};

  /** mulberry32 with a few convenience methods bolted on. Deterministic for a given seed. */
  function makeRng(seed) {
    let a = seed | 0;
    const r = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.normal = () => {
      let u = 0;
      while (u === 0) u = r();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
    };
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    return r;
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /** Compact engineering-style number: 3 significant digits, exponent form outside 1e-3..1e5. */
  function fmt(v, d = 3) {
    if (!isFinite(v)) return v > 0 ? 'inf' : v < 0 ? '-inf' : '--';
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1e5 || a < 1e-3) {
      const e = Math.floor(Math.log10(a));
      return (v / Math.pow(10, e)).toFixed(d - 1) + 'e' + e;
    }
    return v.toFixed(Math.min(6, Math.max(0, d - 1 - Math.floor(Math.log10(a)))));
  }

  /** Signed drift readout such as +2.1e-6. */
  function fmtDrift(v) {
    if (!isFinite(v)) return '--';
    if (Math.abs(v) < 1e-13) return '0.0e+0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    const m = v / Math.pow(10, e);
    return (v < 0 ? '-' : '+') + Math.abs(m).toFixed(1) + 'e' + (e < 0 ? '-' : '+') + Math.abs(e);
  }

  /** Format a duration in sim units with a ladder of [factor, suffix] (largest first). */
  function fmtLadder(t, ladder) {
    const a = Math.abs(t);
    for (const [f, s] of ladder) if (a >= f || s === ladder[ladder.length - 1][1]) return fmt(t / f, 3) + ' ' + s;
    return '0';
  }

  /** Approximate stellar colour from relative mass (0.3 red dwarf ... 6+ blue giant) as [r,g,b]. */
  function starRGB(x) {
    const stops = [[0.25, 255, 140, 80], [0.6, 255, 190, 120], [1, 255, 236, 205], [2, 222, 235, 255], [5, 165, 200, 255]];
    if (x <= stops[0][0]) return stops[0].slice(1);
    for (let i = 1; i < stops.length; i++) {
      if (x <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        const t = (Math.log(x) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0]));
        return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
      }
    }
    return stops[stops.length - 1].slice(1);
  }

  /** Parse '#rrggbb' into [r,g,b]. */
  function hex(c) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (c, k) => [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];

  /** Speed LUT: slow = ember, mid = warm white, fast = cool blue. 64 entries of [r,g,b]. */
  function buildSpeedLut() {
    const stops = [[0, 150, 38, 20], [0.22, 255, 110, 38], [0.5, 255, 222, 175], [0.75, 165, 212, 255], [1, 96, 160, 255]];
    const lut = new Uint8Array(64 * 3);
    for (let i = 0; i < 64; i++) {
      const t = i / 63;
      let k = 1;
      while (k < stops.length - 1 && t > stops[k][0]) k++;
      const a = stops[k - 1], b = stops[k];
      const u = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
      lut[i * 3] = lerp(a[1], b[1], u); lut[i * 3 + 1] = lerp(a[2], b[2], u); lut[i * 3 + 2] = lerp(a[3], b[3], u);
    }
    return lut;
  }

  O.util = { makeRng, clamp, lerp, smooth, easeOutCubic, easeInOut, fmt, fmtDrift, fmtLadder, starRGB, hex, rgba, mix, buildSpeedLut };
})(typeof window !== 'undefined' ? window : globalThis);
