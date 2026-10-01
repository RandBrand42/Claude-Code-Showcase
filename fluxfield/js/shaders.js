/* FLUXFIELD - GLSL ES 3.00 sources (global FF.shaders).
 * Units: velocity lives in sim-texels / second; dye is linear-light RGB (HDR in half floats). */
(function () {
  'use strict';
  const FF = (window.FF = window.FF || {});

  /* One oversized triangle generated from gl_VertexID - no vertex buffers needed.
   * Also emits the four neighbour UVs so stencil shaders avoid per-pixel offset maths. */
  const vert = `#version 300 es
precision highp float;
uniform vec2 uTexel;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  vL = p - vec2(uTexel.x, 0.0); vR = p + vec2(uTexel.x, 0.0);
  vT = p + vec2(0.0, uTexel.y); vB = p - vec2(0.0, uTexel.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const head = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;
  const io = `in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 o;
`;
  const frag = (body, defines) => head + (defines || '') + io + body;

  /* Manual bilinear filter: used only when float textures cannot be linearly filtered. */
  const bilerp = `
vec4 bilerp(sampler2D s, vec2 uv, vec2 ts) {
  vec2 st = uv / ts - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec4 a = texture(s, (i + vec2(0.5, 0.5)) * ts);
  vec4 b = texture(s, (i + vec2(1.5, 0.5)) * ts);
  vec4 c = texture(s, (i + vec2(0.5, 1.5)) * ts);
  vec4 d = texture(s, (i + vec2(1.5, 1.5)) * ts);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;

  const scale = `
uniform sampler2D uTex; uniform float uScale;
void main() { o = texture(uTex, vUv) * uScale; }`;

  /* Batched gaussian splats. Pass 0 writes velocity, pass 1 writes dye.
   * kind 0 = push + dye, kind 1 = swirl (velocity only), kind 2 = dye only. */
  const splat = `
#define MAX_SPLATS 48
uniform sampler2D uTarget; uniform float uAspect; uniform int uCount; uniform int uPass;
uniform vec4 uS0[MAX_SPLATS];   // x, y (aspect-corrected), radius, kind
uniform vec4 uS1[MAX_SPLATS];   // velocity.xy  or  colour.rgb
void main() {
  vec3 acc = vec3(0.0);
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  for (int i = 0; i < MAX_SPLATS; i++) {
    if (i >= uCount) break;
    vec4 a = uS0[i];
    vec2 d = p - a.xy;
    float w = exp(-dot(d, d) / (a.z * a.z));
    int kind = int(a.w + 0.5);
    if (uPass == 0) {
      if (kind == 0) acc.xy += uS1[i].xy * w;
      else if (kind == 1) acc.xy += uS1[i].x * (vec2(-d.y, d.x) / a.z) * w;   // Lamb-Oseen-ish vortex
    } else if (kind != 1) {
      acc += uS1[i].rgb * w;
    }
  }
  vec3 base = texture(uTarget, vUv).rgb + acc;
  if (uPass == 1) base = min(base, vec3(8.0));   // soft ceiling keeps long sessions from going pure white
  o = vec4(base, 1.0);
}`;

  const curl = `
uniform sampler2D uVel;
void main() {
  float L = texture(uVel, vL).y, R = texture(uVel, vR).y;
  float T = texture(uVel, vT).x, B = texture(uVel, vB).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

  /* Vorticity confinement: re-injects small-scale swirl that numerical diffusion eats. */
  const vorticity = `
uniform sampler2D uVel; uniform sampler2D uCurl; uniform float uAmt; uniform float uDt; uniform float uMaxV;
void main() {
  float L = texture(uCurl, vL).x, R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x, B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4;
  f *= uAmt * C;
  f.y *= -1.0;
  vec2 v = texture(uVel, vUv).xy + f * uDt;
  o = vec4(clamp(v, -uMaxV, uMaxV), 0.0, 1.0);      // speed limit keeps strong confinement from running away
}`;

  const divergence = `
uniform sampler2D uVel;
void main() {
  vec2 C = texture(uVel, vUv).xy;
  float L = texture(uVel, vL).x, R = texture(uVel, vR).x;
  float T = texture(uVel, vT).y, B = texture(uVel, vB).y;
  if (vL.x < 0.0) L = -C.x;     // solid walls reflect the normal component
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

  const pressure = `
uniform sampler2D uPressure; uniform sampler2D uDiv;
void main() {
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  float d = texture(uDiv, vUv).x;
  o = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
}`;

  /* Un-halved gradient: a slight over-projection that keeps the flow lively with few Jacobi iterations. */
  const gradient = `
uniform sampler2D uPressure; uniform sampler2D uVel; uniform float uMaxV;
bool bad(float x) { return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u; }   // NaN or Inf
void main() {
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  vec2 v = texture(uVel, vUv).xy - vec2(R - L, T - B);
  if (bad(v.x) || bad(v.y)) v = vec2(0.0);           // self-heal instead of poisoning the whole field
  o = vec4(clamp(v, -uMaxV, uMaxV), 0.0, 1.0);
}`;

  /* Semi-Lagrangian advection with exponential-ish dissipation. */
  const advect = `
uniform sampler2D uVel; uniform sampler2D uSrc;
bool bad(float x) { return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u; }
uniform vec2 uVelTexel; uniform vec2 uSrcTexel; uniform float uDt; uniform float uDiss;
void main() {
#ifdef MANUAL
  vec2 v = bilerp(uVel, vUv, uVelTexel).xy;
  vec2 coord = vUv - uDt * v * uVelTexel;
  vec4 r = bilerp(uSrc, coord, uSrcTexel);
#else
  vec2 v = texture(uVel, vUv).xy;
  vec2 coord = vUv - uDt * v * uVelTexel;
  vec4 r = texture(uSrc, coord);
#endif
  if (bad(r.x) || bad(r.y) || bad(r.z)) r = vec4(0.0);
  o = r / (1.0 + uDiss * uDt);
}`;

  /* ---- post ---------------------------------------------------------- */
  const prefilter = `
uniform sampler2D uTex; uniform vec3 uCurve; uniform float uThreshold;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - uCurve.x, 0.0, uCurve.y);
  rq = uCurve.z * rq * rq;                              // soft knee
  c *= max(rq, br - uThreshold) / max(br, 1e-4);
  o = vec4(c, 1.0);
}`;

  /* Dual-filter (Kawase) down / up sampling. uTexel is the texel size of the *source* level. */
  const down = `
uniform sampler2D uTex; uniform vec2 uTexel;
void main() {
  vec3 s = texture(uTex, vUv).rgb * 4.0;
  s += texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  s += texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  s += texture(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  o = vec4(s / 8.0, 1.0);
}`;
  const up = `
uniform sampler2D uTex; uniform vec2 uTexel;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 s = texture(uTex, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
  s += texture(uTex, vUv + vec2(-h.x,  h.y)).rgb * 2.0;
  s += texture(uTex, vUv + vec2(0.0,  h.y * 2.0)).rgb;
  s += texture(uTex, vUv + vec2( h.x,  h.y)).rgb * 2.0;
  s += texture(uTex, vUv + vec2( h.x * 2.0, 0.0)).rgb;
  s += texture(uTex, vUv + vec2( h.x, -h.y)).rgb * 2.0;
  s += texture(uTex, vUv + vec2(0.0, -h.y * 2.0)).rgb;
  s += texture(uTex, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  o = vec4(s / 12.0, 1.0);
}`;

  /* Radial "god ray" march toward a light point; bright dye is the occluder-free emitter. */
  const rays = `
uniform sampler2D uTex; uniform vec2 uLight; uniform float uDecay;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  const int N = 28;
  vec2 delta = (uLight - vUv) / float(N) * 0.95;
  vec2 uv = vUv + delta * hash12(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < N; i++) {
    acc += texture(uTex, uv).rgb * w;
    uv += delta;
    w *= uDecay;
  }
  o = vec4(acc / float(N), 1.0);
}`;

  /* Final composite: dye + bloom + rays over a tinted void, filmic (ACES fit), vignette, sRGB, dither. */
  const display = `
uniform sampler2D uDye; uniform sampler2D uBloom; uniform sampler2D uRays;
uniform vec2 uDyeTexel; uniform vec3 uBg;
uniform float uBloomI; uniform float uRaysI; uniform float uExposure; uniform float uFade;
uniform float uTime; uniform float uAspect; uniform float uVig;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
#ifdef MANUAL
  vec3 c = bilerp(uDye, vUv, uDyeTexel).rgb;
#else
  vec3 c = texture(uDye, vUv).rgb;
#endif
  c += texture(uBloom, vUv).rgb * uBloomI;
  c += texture(uRays, vUv).rgb * uRaysI;
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  c += uBg * (0.12 + 0.75 * exp(-dot(q, q) * 2.4));       // a whisper of tinted void, slightly lifted toward the centre
  c = aces(c * uExposure * uFade);
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1.14);   // win back the chroma ACES sheds in the highlights
  c *= 1.0 - uVig * smoothstep(0.38, 1.22, length(q));     // soft vignette
  c = pow(c, vec3(0.4545));
  float n = hash12(gl_FragCoord.xy + 17.0 * fract(uTime)) + hash12(gl_FragCoord.yx * 1.37 + 91.0 * fract(uTime * 0.73)) - 1.0;
  c += n / 255.0;                                          // triangular dither kills banding in the dark gradients
  o = vec4(c, 1.0);
}`;

  FF.shaders = { vert, frag, bilerp, scale, splat, curl, vorticity, divergence, pressure, gradient, advect, prefilter, down, up, rays, display };
})();
