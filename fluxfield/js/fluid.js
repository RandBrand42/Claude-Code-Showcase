/* FLUXFIELD - WebGL2 stable-fluids engine + bloom / sunrays / tone-mapped display (FF.createFluid).
 * Pipeline per step: splats -> curl -> vorticity -> divergence -> pressure (Jacobi) -> gradient subtract
 *                    -> advect velocity -> advect dye.   Render: prefilter -> (rays) -> bloom chain -> composite. */
(function () {
  'use strict';
  const FF = (window.FF = window.FF || {});
  const S = FF.shaders;

  const MAX_SPLATS = 48;          // must match the shader constant
  const SIM_BASE = 144;           // velocity grid, short side, at quality 1
  const DYE_BASE = 1024;          // dye grid, short side, at quality 1
  const BLOOM_BASE = 256;
  const RAYS_BASE = 192;
  const MAX_SPEED = 6;            // velocity speed limit, in screen-heights per second

  FF.createFluid = function (canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance',
    });
    if (!gl) return { ok: false, reason: 'context' };

    /* ---- capability probing ------------------------------------------ */
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    const hasLinearFloat = !!gl.getExtension('OES_texture_float_linear');

    function renderable(internal, format, type) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, type, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      return ok;
    }

    // Prefer half-float (always linearly filterable in WebGL2); fall back to 32-bit float (manual bilinear if needed).
    let fmt;
    const tries = [
      { type: gl.HALF_FLOAT, linear: true, name: 'half-float', f: [[gl.RGBA16F, gl.RGBA], [gl.RG16F, gl.RG], [gl.R16F, gl.RED]] },
      { type: gl.FLOAT, linear: hasLinearFloat, name: 'float32', f: [[gl.RGBA32F, gl.RGBA], [gl.RG32F, gl.RG], [gl.R32F, gl.RED]] },
    ];
    for (const t of tries) {
      if (!renderable(t.f[0][0], t.f[0][1], t.type)) continue;
      const pick = (i) => (renderable(t.f[i][0], t.f[i][1], t.type) ? { i: t.f[i][0], f: t.f[i][1], t: t.type } : null);
      const rgba = { i: t.f[0][0], f: t.f[0][1], t: t.type };
      const rg = pick(1) || rgba;
      fmt = { name: t.name, linear: t.linear, rgba, rg, r: pick(2) || rg };
      break;
    }
    if (!fmt) return { ok: false, reason: 'float' };
    const manual = !fmt.linear;                       // manual bilinear sampling in shaders
    const FILTER = manual ? gl.NEAREST : gl.LINEAR;

    let renderer = 'unknown';
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    } catch (e) { /* keep default */ }
    const software = /swiftshader|llvmpipe|software|basic render/i.test(renderer);

    /* ---- programs ----------------------------------------------------- */
    function shader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const vs = shader(gl.VERTEX_SHADER, S.vert);
    function program(body, defines) {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, S.frag(body, defines)));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
        u[name] = gl.getUniformLocation(p, name);
      }
      return { p, u, use() { gl.useProgram(p); return this; } };
    }

    const P = {};
    try {
      const m = manual ? '#define MANUAL\n' + S.bilerp + '\n' : '';
      P.scale = program(S.scale);
      P.splat = program(S.splat);
      P.curl = program(S.curl);
      P.vort = program(S.vorticity);
      P.div = program(S.divergence);
      P.press = program(S.pressure);
      P.grad = program(S.gradient);
      P.advect = program(S.advect, m);
      P.prefilter = program(S.prefilter);
      P.down = program(S.down);
      P.up = program(S.up);
      P.rays = program(S.rays);
      P.display = program(S.display, m);
    } catch (e) {
      console.warn('FLUXFIELD shader build failed:', e.message);
      return { ok: false, reason: 'shader' };
    }

    /* ---- framebuffers ------------------------------------------------- */
    function fbo(w, h, f, filter) {
      gl.activeTexture(gl.TEXTURE0);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, f.i, w, h, 0, f.f, f.t, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return {
        tex, fbo: fb, w, h, tx: 1 / w, ty: 1 / h,
        bind(unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); return unit; },
      };
    }
    const del = (f) => { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fbo); };
    function dbl(w, h, f, filter) {
      return {
        w, h, tx: 1 / w, ty: 1 / h, read: fbo(w, h, f, filter), write: fbo(w, h, f, filter),
        swap() { const t = this.read; this.read = this.write; this.write = t; },
      };
    }
    function blit(target) {
      if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.w, target.h); }
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const setTex = (pr, name, f, unit) => gl.uniform1i(pr.u[name], f.bind(unit));

    let scaleQ = 1;
    let vel = null, dye = null, pressure = null, divergence = null, curlTex = null, raysTex = null;
    let bloom = [];

    function gridSize(base, min) {
      const a = canvas.width / canvas.height;
      const s = Math.max(min, Math.round(base * scaleQ));
      const hi = Math.round(s * (a >= 1 ? a : 1 / a));
      return a >= 1 ? { w: hi, h: s } : { w: s, h: hi };
    }
    function resizeDbl(d, w, h, f, filter, velScale) {
      if (d.w === w && d.h === h) return;
      const nr = fbo(w, h, f, filter);
      const pr = P.scale.use();
      gl.uniform1f(pr.u.uScale, velScale);          // velocity is stored in texels/s, so rescale it with the grid
      setTex(pr, 'uTex', d.read, 0);
      blit(nr);
      del(d.read); del(d.write);
      d.read = nr; d.write = fbo(w, h, f, filter);
      d.w = w; d.h = h; d.tx = 1 / w; d.ty = 1 / h;
    }
    function buildBuffers() {
      const sr = gridSize(SIM_BASE, 48), dr = gridSize(DYE_BASE, 256);
      if (!vel) { vel = dbl(sr.w, sr.h, fmt.rg, FILTER); dye = dbl(dr.w, dr.h, fmt.rgba, FILTER); }
      else { resizeDbl(vel, sr.w, sr.h, fmt.rg, FILTER, sr.h / vel.h); resizeDbl(dye, dr.w, dr.h, fmt.rgba, FILTER, 1); }
      for (const f of [pressure && pressure.read, pressure && pressure.write, divergence, curlTex, raysTex]) if (f) del(f);
      pressure = dbl(sr.w, sr.h, fmt.r, gl.NEAREST);
      divergence = fbo(sr.w, sr.h, fmt.r, gl.NEAREST);
      curlTex = fbo(sr.w, sr.h, fmt.r, gl.NEAREST);
      const rr = gridSize(RAYS_BASE, 96);
      raysTex = fbo(rr.w, rr.h, fmt.rgba, FILTER);
      bloom.forEach(del); bloom = [];
      const br = gridSize(BLOOM_BASE, 96);
      let w = br.w, h = br.h;
      for (let i = 0; i < 8 && Math.min(w, h) >= 4; i++) { bloom.push(fbo(w, h, fmt.rgba, FILTER)); w >>= 1; h >>= 1; }
    }

    /* ---- splat queue --------------------------------------------------- */
    const sq = { n: 0, s0: new Float32Array(MAX_SPLATS * 4), sv: new Float32Array(MAX_SPLATS * 4), sc: new Float32Array(MAX_SPLATS * 4) };
    let aspect = 1;
    function queue(x, y, r, kind, a, b, c, d) {
      if (sq.n >= MAX_SPLATS) flush();
      const i = sq.n++ * 4;
      sq.s0[i] = x * aspect; sq.s0[i + 1] = y; sq.s0[i + 2] = r; sq.s0[i + 3] = kind;
      sq.sv[i] = a * vel.h; sq.sv[i + 1] = b * vel.h; sq.sv[i + 2] = 0; sq.sv[i + 3] = 0;   // height-units/s -> texels/s
      sq.sc[i] = c; sq.sc[i + 1] = d.g; sq.sc[i + 2] = d.b; sq.sc[i + 3] = 0;
    }
    const RGB = { g: 0, b: 0 };
    /** Push + dye. Position in UV (0..1), velocity in height-units/s, colour = linear RGB. */
    function splat(x, y, r, vx, vy, cr, cg, cb) { RGB.g = cg; RGB.b = cb; queue(x, y, r, 0, vx, vy, cr, RGB); }
    /** Tangential acceleration swirl (velocity only). */
    function swirl(x, y, r, strength) { RGB.g = 0; RGB.b = 0; queue(x, y, r, 1, strength, 0, 0, RGB); }
    /** Dye only (no momentum). */
    function dyeSplat(x, y, r, cr, cg, cb) { RGB.g = cg; RGB.b = cb; queue(x, y, r, 2, 0, 0, cr, RGB); }

    function flush() {
      if (!sq.n) return;
      gl.disable(gl.BLEND);
      const pr = P.splat.use();
      gl.uniform1f(pr.u.uAspect, aspect);
      gl.uniform1i(pr.u.uCount, sq.n);
      gl.uniform4fv(pr.u.uS0, sq.s0);
      gl.uniform1i(pr.u.uPass, 0);
      gl.uniform4fv(pr.u.uS1, sq.sv);
      setTex(pr, 'uTarget', vel.read, 0);
      blit(vel.write); vel.swap();
      gl.uniform1i(pr.u.uPass, 1);
      gl.uniform4fv(pr.u.uS1, sq.sc);
      setTex(pr, 'uTarget', dye.read, 0);
      blit(dye.write); dye.swap();
      sq.n = 0;
    }

    /* ---- solver ---------------------------------------------------------- */
    function step(dt, p) {
      gl.disable(gl.BLEND);
      flush();
      let pr = P.curl.use();
      gl.uniform2f(pr.u.uTexel, vel.tx, vel.ty);
      setTex(pr, 'uVel', vel.read, 0);
      blit(curlTex);

      pr = P.vort.use();
      gl.uniform2f(pr.u.uTexel, vel.tx, vel.ty);
      setTex(pr, 'uVel', vel.read, 0); setTex(pr, 'uCurl', curlTex, 1);
      gl.uniform1f(pr.u.uAmt, p.curl); gl.uniform1f(pr.u.uDt, dt); gl.uniform1f(pr.u.uMaxV, vel.h * MAX_SPEED);
      blit(vel.write); vel.swap();

      pr = P.div.use();
      gl.uniform2f(pr.u.uTexel, vel.tx, vel.ty);
      setTex(pr, 'uVel', vel.read, 0);
      blit(divergence);

      pr = P.scale.use();                                   // pressure decay = cheap warm start
      gl.uniform1f(pr.u.uScale, p.pressure);
      setTex(pr, 'uTex', pressure.read, 0);
      blit(pressure.write); pressure.swap();

      pr = P.press.use();
      gl.uniform2f(pr.u.uTexel, vel.tx, vel.ty);
      setTex(pr, 'uDiv', divergence, 1);
      for (let i = 0; i < p.iterations; i++) {
        setTex(pr, 'uPressure', pressure.read, 0);
        blit(pressure.write); pressure.swap();
      }

      pr = P.grad.use();
      gl.uniform2f(pr.u.uTexel, vel.tx, vel.ty);
      setTex(pr, 'uPressure', pressure.read, 0); setTex(pr, 'uVel', vel.read, 1);
      gl.uniform1f(pr.u.uMaxV, vel.h * MAX_SPEED);
      blit(vel.write); vel.swap();

      pr = P.advect.use();
      gl.uniform2f(pr.u.uVelTexel, vel.tx, vel.ty);
      gl.uniform1f(pr.u.uDt, dt);
      gl.uniform2f(pr.u.uSrcTexel, vel.tx, vel.ty);
      setTex(pr, 'uVel', vel.read, 0); setTex(pr, 'uSrc', vel.read, 1);
      gl.uniform1f(pr.u.uDiss, p.velDissipation);
      blit(vel.write); vel.swap();

      gl.uniform2f(pr.u.uSrcTexel, dye.tx, dye.ty);
      setTex(pr, 'uVel', vel.read, 0); setTex(pr, 'uSrc', dye.read, 1);
      gl.uniform1f(pr.u.uDiss, p.dissipation);
      blit(dye.write); dye.swap();
    }

    /* ---- render ---------------------------------------------------------- */
    function render(p, time, fade) {
      const wantBloom = p.bloom > 0.004, wantRays = p.rays > 0.004;
      if (wantBloom || wantRays) {
        const knee = 0.25;
        let pr = P.prefilter.use();
        gl.uniform3f(pr.u.uCurve, p.threshold - knee, knee * 2, 0.25 / knee);
        gl.uniform1f(pr.u.uThreshold, p.threshold);
        setTex(pr, 'uTex', dye.read, 0);
        blit(bloom[0]);

        if (wantRays) {
          pr = P.rays.use();
          gl.uniform2f(pr.u.uLight, p.lightX, p.lightY);
          gl.uniform1f(pr.u.uDecay, 0.955);
          setTex(pr, 'uTex', bloom[0], 0);
          blit(raysTex);
        }
        if (wantBloom) {
          pr = P.down.use();
          for (let i = 1; i < bloom.length; i++) {
            gl.uniform2f(pr.u.uTexel, bloom[i - 1].tx, bloom[i - 1].ty);
            setTex(pr, 'uTex', bloom[i - 1], 0);
            blit(bloom[i]);
          }
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE);
          pr = P.up.use();
          for (let i = bloom.length - 2; i >= 0; i--) {
            gl.uniform2f(pr.u.uTexel, bloom[i + 1].tx, bloom[i + 1].ty);
            setTex(pr, 'uTex', bloom[i + 1], 0);
            blit(bloom[i]);
          }
          gl.disable(gl.BLEND);
        }
      }
      const pr = P.display.use();
      setTex(pr, 'uDye', dye.read, 0); setTex(pr, 'uBloom', bloom[0], 1); setTex(pr, 'uRays', raysTex, 2);
      gl.uniform2f(pr.u.uDyeTexel, dye.tx, dye.ty);
      gl.uniform3f(pr.u.uBg, p.bg0, p.bg1, p.bg2);
      gl.uniform1f(pr.u.uBloomI, wantBloom ? p.bloom : 0);
      gl.uniform1f(pr.u.uRaysI, wantRays ? p.rays : 0);
      gl.uniform1f(pr.u.uExposure, p.exposure);
      gl.uniform1f(pr.u.uFade, fade);
      gl.uniform1f(pr.u.uTime, time);
      gl.uniform1f(pr.u.uAspect, aspect);
      gl.uniform1f(pr.u.uVig, 0.6);
      blit(null);
    }

    function clear() {
      for (const f of [vel.read, vel.write, dye.read, dye.write, pressure.read, pressure.write]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
        gl.viewport(0, 0, f.w, f.h);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      sq.n = 0;
    }

    /** Reads the default framebuffer (call right after render() in the same task) and summarises it. */
    function readback() {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let sum = 0, sum2 = 0, lit = 0, max = 0;
      const buckets = new Set();
      const n = w * h;
      for (let i = 0; i < buf.length; i += 4) {
        const l = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
        sum += l; sum2 += l * l;
        if (l > 24) lit++;
        if (l > max) max = l;
        buckets.add(((buf[i] >> 4) << 8) | ((buf[i + 1] >> 4) << 4) | (buf[i + 2] >> 4));
      }
      const mean = sum / n;
      return { width: w, height: h, meanLuma: +mean.toFixed(2), stdLuma: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(2),
        litFraction: +(lit / n).toFixed(4), maxLuma: +max.toFixed(1), colorBuckets: buckets.size };
    }

    /* ---- public surface -------------------------------------------------- */
    const api = {
      ok: true, gl, info: { renderer, software, format: fmt.name, manualFilter: manual },
      splat, swirl, dyeSplat, step, render, clear, readback,
      get scale() { return scaleQ; },
      get dims() { return { sim: [vel.w, vel.h], dye: [dye.w, dye.h] }; },
      get simHeight() { return vel.h; },
      resize(w, h) {
        aspect = w / h;
        buildBuffers();
      },
      setScale(s) { scaleQ = s; buildBuffers(); },
    };
    return api;
  };
})();
