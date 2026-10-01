/* INFINITUM - GLSL sources (WebGL2 / GLSL ES 3.00).
 * Four programs: iterate (escape-time / Newton, float or double-single), shade (palette, lighting,
 * progressive accumulation), display (post + family cross-fade) and the fullscreen-triangle vertex shader. */
(function () {
  'use strict';
  const INF = (window.INF = window.INF || {});
  const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

  const vert = HEAD + `
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  /* ------------------------------------------------------------------ iterate */
  const iterate = `
// Injected: KIND 0 mandel-type | 1 julia-type | 2 newton,  VARIANT 0 std | 1 ship | 2 tricorn,  DEEP 0|1
uniform vec2 uFull;      // full frame size in px (aspect + scale reference)
uniform vec2 uOrigin;    // pixel origin of the rendered rect inside the full frame (export tiles)
uniform vec2 uJitter;    // sub-pixel jitter for progressive anti-aliasing
uniform vec4 uCenter;    // view centre: (x hi, x lo, y hi, y lo)
uniform vec4 uJC;        // Julia parameter: (x hi, x lo, y hi, y lo)
uniform float uScale;    // imaginary-axis extent of the full frame
uniform vec2 uRot;       // cos, sin of view rotation
uniform int uMaxIter;
uniform int uPow;
uniform float uOne;      // always 1.0 - opaque to the compiler; blocks algebraic folding of error-free transforms
uniform float uSplit;    // always 4097.0 (Veltkamp split constant), likewise opaque
uniform int uTrapType;   // 0 off, 1 point, 2 line, 3 circle, 4 cross
uniform vec4 uTrap;
uniform float uPoly[9];  // Newton polynomial coefficients a0..a8
uniform float uDPoly[8]; // derivative coefficients
uniform int uDeg;
uniform vec2 uRoots[8];
uniform int uNRoots;
out vec4 outData;        // (smooth iteration or -1 inside, trap distance, distance estimate in px, period / root index)

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

float trapDist(vec2 z) {
  if (uTrapType == 1) return length(z - uTrap.xy);
  if (uTrapType == 2) return abs(dot(z, uTrap.xy) - uTrap.z);
  if (uTrapType == 3) return abs(length(z - uTrap.xy) - uTrap.z);
  if (uTrapType == 4) return min(abs(z.x - uTrap.x), abs(z.y - uTrap.y));
  return 1e9;
}

#if DEEP == 1
// ---- double-single ("df64") arithmetic: a value is vec2(hi, lo), hi + lo with ~48 bits of mantissa
vec2 quickTwoSum(float a, float b) { float s = (a + b) * uOne; float e = b - ((s - a) * uOne); return vec2(s, e); }
vec2 twoSum(float a, float b) {
  float s = (a + b) * uOne; float bb = (s - a) * uOne;
  float e = (a - ((s - bb) * uOne)) + (b - bb);
  return vec2(s, e);
}
vec2 splitF(float a) { float t = a * uSplit; float hi = t - ((t - a) * uOne); return vec2(hi, a - hi); }
vec2 twoProd(float a, float b) {
  float p = (a * b) * uOne;
  vec2 as = splitF(a); vec2 bs = splitF(b);
  float e = ((as.x * bs.x - p) + as.x * bs.y + as.y * bs.x) + as.y * bs.y;
  return vec2(p, e);
}
vec2 dfAdd(vec2 a, vec2 b) {
  vec2 s = twoSum(a.x, b.x); vec2 t = twoSum(a.y, b.y);
  s.y += t.x; s = quickTwoSum(s.x, s.y); s.y += t.y; return quickTwoSum(s.x, s.y);
}
vec2 dfSub(vec2 a, vec2 b) { return dfAdd(a, -b); }
vec2 dfMul(vec2 a, vec2 b) { vec2 p = twoProd(a.x, b.x); p.y += a.x * b.y + a.y * b.x; return quickTwoSum(p.x, p.y); }
vec2 dfSqr(vec2 a) { vec2 p = twoProd(a.x, a.x); p.y += 2.0 * a.x * a.y; return quickTwoSum(p.x, p.y); }

vec4 runDeep(vec2 px, vec2 py, float pixel) {
  vec2 cx = KIND == 1 ? uJC.xy : px;
  vec2 cy = KIND == 1 ? uJC.zw : py;
  vec2 zx = KIND == 1 ? px : vec2(0.0);
  vec2 zy = KIND == 1 ? py : vec2(0.0);
  vec2 dz = vec2(KIND == 1 ? 1.0 : 0.0, 0.0);
  float trap = 1e9, fp = float(uPow), lnp = log(fp);
  vec2 zsx = zx, zsy = zy; int lam = 0, power = 1;
  float eps = clamp(0.1 * pixel, 2e-14, 3e-6), eps2 = eps * eps;
  for (int i = 0; i < uMaxIter; i++) {
#if VARIANT == 1
    if (zx.x < 0.0) zx = -zx;
    if (zy.x < 0.0) zy = -zy;
#elif VARIANT == 2
    zy = -zy;
#endif
    vec2 zf = vec2(zx.x, zy.x);
    vec2 zp1f = zf;
    for (int k = 2; k < uPow; k++) zp1f = cmul(zp1f, zf);
    dz = clamp(fp * cmul(zp1f, dz) + vec2(KIND == 1 ? 0.0 : 1.0, 0.0), -1e18, 1e18);
    vec2 nx, ny;
    if (uPow == 2) {
      nx = dfSub(dfSqr(zx), dfSqr(zy));
      ny = 2.0 * dfMul(zx, zy);
    } else {
      vec2 ax = zx, ay = zy;
      for (int k = 2; k < uPow; k++) {
        vec2 tx = dfSub(dfMul(ax, zx), dfMul(ay, zy));
        vec2 ty = dfAdd(dfMul(ax, zy), dfMul(ay, zx));
        ax = tx; ay = ty;
      }
      nx = dfSub(dfMul(ax, zx), dfMul(ay, zy));
      ny = dfAdd(dfMul(ax, zy), dfMul(ay, zx));
    }
    zx = dfAdd(nx, cx); zy = dfAdd(ny, cy);
    vec2 z = vec2(zx.x, zy.x);
    if (uTrapType > 0) trap = min(trap, trapDist(z));
    float r2 = dot(z, z);
    if (r2 > 65536.0) {
      float lz = 0.5 * log(r2);
      float nu = max(float(i + 1) - log(lz) / lnp, 0.0);
      float de = 0.5 * sqrt(r2) * lz / max(length(dz), 1e-30);
      return vec4(nu, min(trap, 1e4), min(de / pixel, 1e4), 0.0);
    }
    lam++;
    vec2 dd = z - vec2(zsx.x, zsy.x);
    if (dot(dd, dd) < 1e-11) {
      // coarse gate passed: confirm at sub-pixel tolerance (an orbit shadowing a repelling cycle must not count as periodic)
      vec2 ex = dfSub(zx, zsx), ey = dfSub(zy, zsy);
      if (ex.x * ex.x + ey.x * ey.x < eps2) return vec4(-1.0, min(trap, 1e4), 0.0, float(lam));
    }
    if (lam == power) { zsx = zx; zsy = zy; power *= 2; lam = 0; }
  }
  return vec4(-1.0, min(trap, 1e4), 0.0, 0.0);
}
#endif

vec4 runFloat(vec2 p, float pixel) {
  vec2 c = KIND == 1 ? uJC.xz : p;
  vec2 z = KIND == 1 ? p : vec2(0.0);
  vec2 dz = vec2(KIND == 1 ? 1.0 : 0.0, 0.0);
  float trap = 1e9, fp = float(uPow), lnp = log(fp);
  vec2 zs = z; int lam = 0, power = 1;
  float eps = clamp(0.1 * pixel, 6e-7, 3e-6), eps2 = eps * eps;   // periodicity tolerance stays below one pixel
  for (int i = 0; i < uMaxIter; i++) {
#if VARIANT == 1
    z = abs(z);
#elif VARIANT == 2
    z.y = -z.y;
#endif
    vec2 zp1 = z;
    for (int k = 2; k < uPow; k++) zp1 = cmul(zp1, z);
    dz = clamp(fp * cmul(zp1, dz) + vec2(KIND == 1 ? 0.0 : 1.0, 0.0), -1e18, 1e18);
    z = cmul(zp1, z) + c;
    if (uTrapType > 0) trap = min(trap, trapDist(z));
    float r2 = dot(z, z);
    if (r2 > 65536.0) {
      float lz = 0.5 * log(r2);
      float nu = max(float(i + 1) - log(lz) / lnp, 0.0);
      float de = 0.5 * sqrt(r2) * lz / max(length(dz), 1e-30);
      return vec4(nu, min(trap, 1e4), min(de / pixel, 1e4), 0.0);
    }
    lam++;
    vec2 dd = z - zs;
    if (dot(dd, dd) < eps2) return vec4(-1.0, min(trap, 1e4), 0.0, float(lam));
    if (lam == power) { zs = z; power *= 2; lam = 0; }
  }
  return vec4(-1.0, min(trap, 1e4), 0.0, 0.0);
}

vec4 runNewton(vec2 z) {
  float trap = 1e9;
  for (int i = 0; i < uMaxIter; i++) {
    vec2 p = vec2(uPoly[uDeg], 0.0);
    vec2 d = vec2(uDPoly[uDeg - 1], 0.0);
    for (int k = uDeg - 1; k >= 0; k--) p = cmul(p, z) + vec2(uPoly[k], 0.0);
    for (int k = uDeg - 2; k >= 0; k--) d = cmul(d, z) + vec2(uDPoly[k], 0.0);
    float dl = dot(d, d);
    if (dl < 1e-30) break;
    vec2 step = cmul(p, vec2(d.x, -d.y)) / dl;
    z -= step;
    if (uTrapType > 0) trap = min(trap, trapDist(z));
    float e2 = dot(step, step);
    if (e2 < 1e-12) {
      float best = 1e9; int bi = 0;
      for (int r = 0; r < 8; r++) {
        if (r >= uNRoots) break;
        vec2 q = z - uRoots[r]; float dd = dot(q, q);
        if (dd < best) { best = dd; bi = r; }
      }
      float nu = max(float(i + 1) - log2(log(max(sqrt(e2), 1e-30)) / log(1e-6)), 0.0);
      return vec4(nu, min(trap, 1e4), 0.0, float(bi + 1));
    }
    if (dot(z, z) > 1e12) break;
  }
  return vec4(-1.0, min(trap, 1e4), 0.0, 0.0);
}

void main() {
  vec2 px = gl_FragCoord.xy + uOrigin + uJitter;
  vec2 o = (px - 0.5 * uFull) / uFull.y * uScale;
  o = vec2(uRot.x * o.x - uRot.y * o.y, uRot.y * o.x + uRot.x * o.y);
  float pixel = uScale / uFull.y;
#if KIND == 2
  outData = runNewton(vec2(uCenter.x, uCenter.z) + o);
#else
  float sy = VARIANT == 1 ? -1.0 : 1.0;   // the Burning Ship is drawn upright: flip the imaginary axis
#if DEEP == 1
  vec2 pxd = dfAdd(uCenter.xy, vec2(o.x, 0.0));
  vec2 pyd = dfAdd(uCenter.zw * sy, vec2(o.y * sy, 0.0));
  outData = runDeep(pxd, pyd, pixel);
#else
  outData = runFloat(vec2(uCenter.x + o.x, sy * (uCenter.z + o.y)), pixel);
#endif
#endif
}`;

  /* -------------------------------------------------------------------- shade */
  const shade = `
uniform sampler2D uData;
uniform sampler2D uPrev;
uniform ivec2 uRect;
uniform float uCount;     // samples already accumulated in uPrev (0 = replace)
uniform int uFamily;      // 0 escape-time, 1 newton
uniform int uMode;        // 0 smooth, 1 orbit trap, 2 distance-estimate glow, 3 relief
uniform int uInterior;    // 0 black, 1 period, 2 trap
uniform vec3 uPalA, uPalB, uPalC, uPalD;
uniform float uPhase, uDensity, uGlow, uRelief, uTrapK, uNRoots;
uniform vec3 uLight;
out vec4 outColor;

vec3 pal(float t) { return uPalA + uPalB * cos(6.2831853 * (uPalC * t + uPalD)); }

float height(ivec2 q) {
  q = clamp(q, ivec2(0), uRect - 1);
  vec4 d = texelFetch(uData, q, 0);
  return d.r < 0.0 ? 0.0 : log2(1.0 + d.r);
}

vec3 interiorColor(vec4 d) {
  if (uInterior == 1 && d.a > 0.5) return pal(0.08 + d.a * 0.137 + uPhase) * 0.6 / (1.0 + 0.03 * d.a);
  if (uInterior == 2) { float tt = exp(-d.g * uTrapK); return pal(0.2 + 0.8 * tt + uPhase) * (0.08 + 0.85 * tt); }
  return vec3(0.010, 0.009, 0.013);
}

void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec4 d = texelFetch(uData, q, 0);
  float nu = d.r;
  vec3 col;
  if (nu < 0.0) {
    col = interiorColor(d);
  } else {
    vec3 base;
    if (uFamily == 1) {
      float hue = (d.a - 0.5) / max(uNRoots, 1.0);
      base = pal(hue * uDensity * 0.5 + uPhase) * (0.2 + 0.95 * exp(-nu * 0.085));
    } else {
      base = pal(sqrt(nu) * 0.11 * uDensity + uPhase);
    }
    float edge = uFamily == 1 ? 0.0 : exp(-d.b * 0.35);
    if (uMode == 1) {
      float tt = exp(-d.g * uTrapK);
      col = pal(0.15 + 0.85 * tt + uPhase) * (0.10 + 1.05 * tt) + base * 0.10;
    } else if (uMode == 2 && uFamily == 0) {
      col = base * 0.09 + pal(sqrt(nu) * 0.11 * uDensity + uPhase + 0.35) * edge * 1.8;
    } else if (uMode == 3) {
      float hx = (height(q + ivec2(1, 0)) - height(q - ivec2(1, 0))) * 0.5;
      float hy = (height(q + ivec2(0, 1)) - height(q - ivec2(0, 1))) * 0.5;
      vec3 N = normalize(vec3(-hx * uRelief, -hy * uRelief, 1.0));
      float diff = max(dot(N, uLight), 0.0);
      vec3 H = normalize(uLight + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(N, H), 0.0), 36.0);
      col = base * (0.18 + 0.95 * diff) + vec3(1.0, 0.94, 0.84) * spec * 0.45;
    } else {
      col = base;
    }
    if (uMode != 2) col += pal(sqrt(nu) * 0.11 * uDensity + uPhase + 0.5) * edge * uGlow;
  }
  col = max(col, 0.0);
  vec3 acc = uCount < 0.5 ? col : mix(texelFetch(uPrev, q, 0).rgb, col, 1.0 / (uCount + 1.0));
  outColor = vec4(acc, 1.0);
}`;

  /* ------------------------------------------------------------------ display */
  const display = `
uniform sampler2D uTex;
uniform sampler2D uPrev;
uniform vec2 uPxToTex;      // viewport px -> texture coordinate for uTex
uniform vec2 uPrevPxToTex;
uniform vec2 uVpOrigin, uVpSize;
uniform vec2 uOrigin, uFull;  // tile origin / full frame (vignette + dither continuity)
uniform float uFade;          // cross-fade between previous frame and current
uniform float uVig, uGain, uMask;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 lf = gl_FragCoord.xy - uVpOrigin;
  vec3 c = texture(uTex, lf * uPxToTex).rgb;
  if (uFade < 1.0) c = mix(texture(uPrev, lf * uPrevPxToTex).rgb, c, uFade);
  vec2 uv = (lf + uOrigin) / uFull;
  float r = length((uv - 0.5) * vec2(uFull.x / uFull.y, 1.0));
  c *= 1.0 - uVig * smoothstep(0.30, 1.15, r);
  c = c * uGain + (hash(gl_FragCoord.xy + uOrigin) - 0.5) / 255.0;
  float a = 1.0;
  if (uMask > 0.5) a = 1.0 - smoothstep(0.5 * uVpSize.x - 2.5, 0.5 * uVpSize.x - 0.8, length(lf - 0.5 * uVpSize));
  outColor = vec4(c, a);
}`;

  INF.GLSL = { HEAD, vert, iterate, shade, display };
})();
