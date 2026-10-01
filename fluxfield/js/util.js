/* FLUXFIELD - small math / colour / noise helpers (global namespace FF.util). */
(function () {
  'use strict';
  const FF = (window.FF = window.FF || {});
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /** Deterministic PRNG (mulberry32) so the conductor's choreography is reproducible. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- colour -------------------------------------------------------- */
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function rgbToHex(r, g, b) {
    const h = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }

  /* ---- 3D value noise + curl ----------------------------------------- */
  function hash3(x, y, z) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), xf), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), xf), yf),
      l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), xf), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), xf), yf),
      zf);
  }
  const fbm = (x, y, z) => vnoise(x, y, z) * 0.62 + vnoise(x * 2.03 + 11.7, y * 2.03 + 4.3, z * 2.03) * 0.28 + vnoise(x * 4.1 + 3.1, y * 4.1 + 9.2, z * 4.1) * 0.1;

  /** Divergence-free 2D vector from the noise potential (curl of a scalar field). */
  function curlNoise(x, y, z, out) {
    const e = 0.06;
    out[0] = ((fbm(x, y + e, z) - fbm(x, y - e, z)) / (2 * e)) * 0.4;
    out[1] = (-(fbm(x + e, y, z) - fbm(x - e, y, z)) / (2 * e)) * 0.4;
    return out;
  }

  FF.util = { TAU, clamp, lerp, smoothstep, easeInOut, mulberry32, hexToRgb, rgbToHex, curlNoise };
})();
