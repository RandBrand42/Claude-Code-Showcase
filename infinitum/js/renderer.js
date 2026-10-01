/* INFINITUM - WebGL2 renderer.
 * Pipeline per sample:  iterate -> data texture (RGBA32F)  ->  shade + running average -> accum (RGBA16F)  ->  display.
 * Keeping raw iteration data separate from colour lets palettes / lighting change without re-iterating. */
(function () {
  'use strict';
  const INF = (window.INF = window.INF || {});
  const G = () => INF.GLSL;

  INF.Renderer = function Renderer(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    const cbf = gl.getExtension('EXT_color_buffer_float');
    if (!cbf && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('Floating-point render targets are not supported on this GPU.');
    gl.getExtension('OES_texture_float_linear');
    const DATA = cbf ? { internal: gl.RGBA32F, type: gl.FLOAT } : { internal: gl.RGBA16F, type: gl.HALF_FLOAT };
    const self = this;
    this.gl = gl; this.canvas = canvas; this.floatData = !!cbf;
    gl.bindVertexArray(gl.createVertexArray());
    gl.disable(gl.DEPTH_TEST);

    /* ---- programs ---- */
    const programs = new Map();
    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const build = (key, frag, defines) => {
      let p = programs.get(key); if (p) return p;
      const defs = Object.entries(defines || {}).map(([k, v]) => `#define ${k} ${v}\n`).join('');
      const pr = gl.createProgram();
      gl.attachShader(pr, compile(gl.VERTEX_SHADER, G().vert));
      gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, G().HEAD + defs + frag));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(pr));
      p = { pr, loc: new Map() }; programs.set(key, p); return p;
    };
    const use = (p) => { gl.useProgram(p.pr); return p; };
    const L = (p, n) => { let l = p.loc.get(n); if (l === undefined) { l = gl.getUniformLocation(p.pr, n); p.loc.set(n, l); } return l; };
    const u1f = (p, n, v) => { const l = L(p, n); if (l) gl.uniform1f(l, v); };
    const u1i = (p, n, v) => { const l = L(p, n); if (l) gl.uniform1i(l, v); };
    const u2f = (p, n, a, b) => { const l = L(p, n); if (l) gl.uniform2f(l, a, b); };
    const u3f = (p, n, a) => { const l = L(p, n); if (l) gl.uniform3f(l, a[0], a[1], a[2]); };
    const u4f = (p, n, a, b, c, d) => { const l = L(p, n); if (l) gl.uniform4f(l, a, b, c, d); };
    const u2i = (p, n, a, b) => { const l = L(p, n); if (l) gl.uniform2i(l, a, b); };
    const iterProg = (kind, variant, deep) => build(`it${kind}${variant}${deep ? 1 : 0}`, G().iterate, { KIND: kind, VARIANT: variant, DEEP: deep ? 1 : 0 });
    const shadeProg = () => build('shade', G().shade);
    const dispProg = () => build('display', G().display);
    this.warm = (kind, variant, deep) => { iterProg(kind, variant, deep); };

    /* ---- render targets ---- */
    const makeTarget = (w, h, internal, type, filter) => {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo, w, h };
    };
    const free = (t) => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } };
    const T = {};
    this.alloc = (w, h) => {
      ['data0', 'dataJ', 'acc0', 'acc1', 'prev'].forEach((k) => free(T[k]));
      T.data0 = makeTarget(w, h, DATA.internal, DATA.type, gl.NEAREST);
      T.dataJ = makeTarget(w, h, DATA.internal, DATA.type, gl.NEAREST);
      T.acc0 = makeTarget(w, h, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
      T.acc1 = makeTarget(w, h, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
      T.prev = makeTarget(w, h, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
      self.cur = 0; self.size = [w, h];
    };
    const INS = 256;
    T.iData = makeTarget(INS, INS, DATA.internal, DATA.type, gl.NEAREST);
    T.iAcc = makeTarget(INS, INS, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
    const acc = (i) => (i ? T.acc1 : T.acc0);
    this.cur = 0;

    const bindTex = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); };
    const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* ---- iterate ---- */
    const splitD = (v) => { const hi = Math.fround(v); return [hi, Math.fround(v - hi)]; };
    const setIterUniforms = (p, J) => {
      const cx = splitD(J.cx), cy = splitD(J.cy), jx = splitD(J.jx || 0), jy = splitD(J.jy || 0);
      u4f(p, 'uCenter', cx[0], cx[1], cy[0], cy[1]);
      u4f(p, 'uJC', jx[0], jx[1], jy[0], jy[1]);
      u1f(p, 'uScale', J.scale);
      u2f(p, 'uRot', Math.cos(J.rot), Math.sin(J.rot));
      u1i(p, 'uMaxIter', J.maxIter); u1i(p, 'uPow', J.pow);
      u1f(p, 'uOne', 1.0); u1f(p, 'uSplit', 4097.0);
      u1i(p, 'uTrapType', J.trapType || 0);
      const t = J.trap || [0, 0, 0, 0]; u4f(p, 'uTrap', t[0], t[1], t[2], t[3]);
      if (J.kind === 2) {
        const coef = J.poly, n = coef.length - 1, a = new Float32Array(9), d = new Float32Array(8);
        coef.forEach((v, i) => { a[i] = v; }); for (let i = 0; i < n; i++) d[i] = (i + 1) * coef[i + 1];
        let l = L(p, 'uPoly'); if (l) gl.uniform1fv(l, a);
        l = L(p, 'uDPoly'); if (l) gl.uniform1fv(l, d);
        u1i(p, 'uDeg', n);
        const roots = new Float32Array(16); J.roots.slice(0, 8).forEach((r, i) => { roots[2 * i] = r[0]; roots[2 * i + 1] = r[1]; });
        l = L(p, 'uRoots'); if (l) gl.uniform2fv(l, roots);
        u1i(p, 'uNRoots', Math.min(8, J.roots.length));
      }
    };
    // Render one iteration sample into `t` over a w x h rect.
    const iterateInto = (t, w, h, J, full, origin, jitter) => {
      const p = use(iterProg(J.kind, J.variant, J.deep));
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, w, h);
      setIterUniforms(p, J);
      u2f(p, 'uFull', full[0], full[1]); u2f(p, 'uOrigin', origin[0], origin[1]); u2f(p, 'uJitter', jitter[0], jitter[1]);
      draw();
    };
    this.iterate = (slot, w, h, J, jitter) => iterateInto(T[slot], w, h, J, [w, h], [0, 0], jitter || [0, 0]);

    /* ---- shade + accumulate ---- */
    const setColourUniforms = (p, C) => {
      u1i(p, 'uFamily', C.family); u1i(p, 'uMode', C.mode); u1i(p, 'uInterior', C.interior);
      u3f(p, 'uPalA', C.pal.a); u3f(p, 'uPalB', C.pal.b); u3f(p, 'uPalC', C.pal.c); u3f(p, 'uPalD', C.pal.d);
      u1f(p, 'uPhase', C.phase); u1f(p, 'uDensity', C.density); u1f(p, 'uGlow', C.glow); u1f(p, 'uRelief', C.relief);
      u1f(p, 'uTrapK', C.trapK); u1f(p, 'uNRoots', C.nRoots); u3f(p, 'uLight', C.light);
    };
    const shadeInto = (dataT, dst, prevT, w, h, count, C) => {
      const p = use(shadeProg());
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, w, h);
      bindTex(0, dataT); bindTex(1, prevT); u1i(p, 'uData', 0); u1i(p, 'uPrev', 1);
      u2i(p, 'uRect', w, h); u1f(p, 'uCount', count); setColourUniforms(p, C);
      draw();
    };
    // Shade `slot` into the accumulator; count = samples already averaged in (0 replaces).
    this.shade = (slot, w, h, count, C) => {
      const src = acc(self.cur), dst = acc(1 - self.cur);
      shadeInto(T[slot], dst, src, w, h, count, C);
      self.cur = 1 - self.cur;
    };

    /* ---- present ---- */
    const displayInto = (texT, prevT, o) => {
      const p = use(dispProg());
      bindTex(0, texT); bindTex(1, prevT); u1i(p, 'uTex', 0); u1i(p, 'uPrev', 1);
      u2f(p, 'uPxToTex', o.pxToTex[0], o.pxToTex[1]); u2f(p, 'uPrevPxToTex', (o.prevPxToTex || [0, 0])[0], (o.prevPxToTex || [0, 0])[1]);
      u2f(p, 'uVpOrigin', o.vp[0], o.vp[1]); u2f(p, 'uVpSize', o.vp[2], o.vp[3]);
      u2f(p, 'uOrigin', o.origin[0], o.origin[1]); u2f(p, 'uFull', o.full[0], o.full[1]);
      u1f(p, 'uFade', o.fade); u1f(p, 'uVig', o.vig); u1f(p, 'uGain', o.gain); u1f(p, 'uMask', o.mask || 0);
      gl.viewport(o.vp[0], o.vp[1], o.vp[2], o.vp[3]); draw();
    };
    // Main view -> canvas. rect = the sub-rect of the accumulator that holds the latest render.
    this.present = (rect, fade, gain, vig) => {
      const W = canvas.width, H = canvas.height, [tw, th] = self.size;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.BLEND);
      displayInto(acc(self.cur), T.prev, {
        pxToTex: [rect[0] / (W * tw), rect[1] / (H * th)], prevPxToTex: [1 / W, 1 / H],
        vp: [0, 0, W, H], origin: [0, 0], full: [W, H], fade, vig: vig == null ? 0.32 : vig, gain,
      });
    };
    // Snapshot the current canvas image so the next family can cross-fade from it.
    this.capture = (rect, gain) => {
      const W = canvas.width, H = canvas.height, [tw, th] = self.size;
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.prev.fbo);
      displayInto(acc(self.cur), acc(self.cur), { pxToTex: [rect[0] / (W * tw), rect[1] / (H * th)], vp: [0, 0, W, H], origin: [0, 0], full: [W, H], fade: 1, vig: 0.32, gain });
    };
    // Julia inset: iterate + shade into the small target, then draw (circle-masked) into a canvas rect.
    this.renderInset = (J, C) => {
      iterateInto(T.iData, INS, INS, J, [INS, INS], [0, 0], [0, 0]);
      shadeInto(T.iData, T.iAcc, T.iData, INS, INS, 0, C);
    };
    this.presentInset = (x, y, size, gain) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      displayInto(T.iAcc, T.iAcc, { pxToTex: [1 / size, 1 / size], vp: [x, y, size, size], origin: [0, 0], full: [size, size], fade: 1, vig: 0, gain, mask: 1 });
      gl.disable(gl.BLEND);
    };

    /* ---- debugging / verification: read raw iteration data back ---- */
    this.readData = (J, w, h) => {
      self.iterate('data0', w, h, J, [0, 0]);
      const out = new Float32Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.data0.fbo);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, out);
      return out;
    };

    /* ---- tiled high-resolution export ---- */
    this.exportImage = async (o) => {
      const { W, H, J, C, samples, onProgress } = o, TILE = 384, PAD = 2, S = TILE + PAD * 2;
      const tData = makeTarget(S, S, DATA.internal, DATA.type, gl.NEAREST);
      const tA = makeTarget(S, S, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR), tB = makeTarget(S, S, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
      const tOut = makeTarget(S, S, gl.RGBA8, gl.UNSIGNED_BYTE, gl.NEAREST);
      const out = new Uint8ClampedArray(W * H * 4), buf = new Uint8Array(S * S * 4);
      const tilesX = Math.ceil(W / TILE), tilesY = Math.ceil(H / TILE), total = tilesX * tilesY * samples;
      let done = 0;
      try {
        for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
          const origin = [tx * TILE - PAD, ty * TILE - PAD];
          let cur = tA, other = tB;
          for (let s = 0; s < samples; s++) {
            const jit = s === 0 ? [0, 0] : [halton(s + 1, 2) - 0.5, halton(s + 1, 3) - 0.5];
            iterateInto(tData, S, S, J, [W, H], origin, jit);
            shadeInto(tData, other, cur, S, S, s, C); const t = cur; cur = other; other = t;
            done++; if (onProgress) onProgress(done / total);
            gl.finish(); await new Promise((r) => setTimeout(r, 0));
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, tOut.fbo);
          displayInto(cur, cur, { pxToTex: [1 / S, 1 / S], vp: [0, 0, S, S], origin, full: [W, H], fade: 1, vig: 0.32, gain: 1 });
          gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          for (let j = 0; j < TILE; j++) {
            const gy = ty * TILE + j; if (gy >= H) break;
            const row = H - 1 - gy;
            for (let i = 0; i < TILE; i++) {
              const gx = tx * TILE + i; if (gx >= W) break;
              const si = ((j + PAD) * S + (i + PAD)) * 4, di = (row * W + gx) * 4;
              out[di] = buf[si]; out[di + 1] = buf[si + 1]; out[di + 2] = buf[si + 2]; out[di + 3] = 255;
            }
          }
        }
      } finally { [tData, tA, tB, tOut].forEach(free); }
      return new ImageData(out, W, H);
    };
  };

  // Halton low-discrepancy sequence for jittered sub-pixel sampling.
  function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
  INF.halton = halton;
})();
