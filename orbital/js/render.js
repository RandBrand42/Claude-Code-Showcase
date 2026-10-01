/* ORBITAL - canvas renderer: procedural deep-space backdrop, glowing bodies, speed-coloured particle field,
 * luminous trails, cheap multi-scale bloom, predicted-path ghost, and the hairline measurement rulers. */
(function (root) {
  'use strict';
  const O = root.Orbital = root.Orbital || {};
  const U = O.util;
  const TAU = Math.PI * 2;
  const TRAIL_N = [0, 150, 650, 1800];
  const LUT = U.buildSpeedLut();

  /* ---------- backdrop: tileable nebula + three parallax star tiles ---------- */

  function periodicNoise(seed) {
    const rng = U.makeRng(seed), T = new Float32Array(256 * 256);
    for (let i = 0; i < T.length; i++) T[i] = rng();
    return (x, y, P) => {                        // value noise on a lattice that wraps every P cells
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = ix % P, b = (ix + 1) % P, c = iy % P, d = (iy + 1) % P;
      const v00 = T[(c & 255) * 256 + (a & 255)], v10 = T[(c & 255) * 256 + (b & 255)];
      const v01 = T[(d & 255) * 256 + (a & 255)], v11 = T[(d & 255) * 256 + (b & 255)];
      return (v00 + (v10 - v00) * sx) * (1 - sy) + (v01 + (v11 - v01) * sx) * sy;
    };
  }

  function buildNebula(seed) {
    const S = 320, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const cx = cv.getContext('2d'), img = cx.createImageData(S, S), noise = periodicNoise(seed);
    const fbm = (u, v, o) => {
      let sum = 0, amp = 0.5, P = 3, tot = 0;
      for (let k = 0; k < 5; k++) { sum += amp * noise((u + o) * P, (v + o * 0.7) * P, P); tot += amp; amp *= 0.5; P *= 2; }
      return sum / tot;
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const a = fbm(u, v, 0), b = fbm(u, v, 5.3), c = fbm(u, v, 11.7);
        const dens = Math.pow(U.clamp((a - 0.40) / 0.42, 0, 1), 1.7);
        const ridge = Math.pow(1 - Math.abs(2 * c - 1), 6) * 0.5 * dens;
        const t = U.clamp(b * 1.6 - 0.3, 0, 1);
        const o = (y * S + x) * 4;
        img.data[o] = 3 + dens * (16 + 40 * t) + ridge * 26;
        img.data[o + 1] = 5 + dens * (24 - 4 * t) + ridge * 56;
        img.data[o + 2] = 10 + dens * (52 + 14 * t) + ridge * 64;
        img.data[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  function buildStarTile(seed, count, rmin, rmax, bright) {
    const S = 1024, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const cx = cv.getContext('2d'), rng = U.makeRng(seed);
    cx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const x = rng() * S, y = rng() * S, r = rmin + (rmax - rmin) * Math.pow(rng(), 2.2);
      const tint = rng(), col = tint < 0.14 ? [255, 210, 160] : tint < 0.3 ? [170, 205, 255] : [235, 242, 255];
      const a = U.clamp((0.25 + rng() * 0.75) * bright, 0, 1);
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        const px = x + ox, py = y + oy;
        if (px < -8 || px > S + 8 || py < -8 || py > S + 8) continue;
        if (r > 1.1) {
          const g = cx.createRadialGradient(px, py, 0, px, py, r * 4);
          g.addColorStop(0, U.rgba(col, a)); g.addColorStop(0.25, U.rgba(col, a * 0.35)); g.addColorStop(1, U.rgba(col, 0));
          cx.fillStyle = g; cx.fillRect(px - r * 4, py - r * 4, r * 8, r * 8);
        }
        cx.fillStyle = U.rgba(col, a); cx.beginPath(); cx.arc(px, py, r * 0.6, 0, TAU); cx.fill();
      }
    }
    return cv;
  }

  /* ---------- renderer ---------- */

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    const mk = () => { const c = document.createElement('canvas'); return [c, c.getContext('2d')]; };
    const [pc, pctx] = mk();               // particle accumulation layer (low-res, additive)
    const bloomCv = [mk(), mk(), mk(), mk()];
    const nebula = buildNebula(7), nebulaPat = ctx.createPattern(nebula, 'repeat');
    const layers = [buildStarTile(31, 1100, 0.5, 0.9, 0.75), buildStarTile(47, 380, 0.7, 1.3, 0.9), buildStarTile(83, 90, 1.0, 2.0, 1)]
      .map((c) => ctx.createPattern(c, 'repeat'));
    const R = {
      W: 0, H: 0, dpr: 1, pw: 0, ph: 0, ps: 0.5, img: null, vMean: 1, lastCam: null, bdx: 0, bdy: 0, canvas,
    };

    R.resize = function (w, h, dpr) {
      R.W = w; R.H = h; R.dpr = dpr;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      R.allocParticles(R.ps);
      let bw = canvas.width, bh = canvas.height;
      for (const [c] of bloomCv) { bw = Math.max(8, Math.round(bw / 2)); bh = Math.max(8, Math.round(bh / 2)); c.width = bw; c.height = bh; }
    };

    R.allocParticles = function (ps) {
      R.ps = ps; R.pw = Math.max(8, Math.ceil(R.W * ps)); R.ph = Math.max(8, Math.ceil(R.H * ps));
      pc.width = R.pw; pc.height = R.ph; R.img = pctx.createImageData(R.pw, R.ph);
    };

    /* world -> screen (CSS px), honouring camera rotation */
    function tf(cam, view) {
      const c = Math.cos(cam.ang), s = Math.sin(cam.ang), z = cam.zoom;
      return (x, y, out) => {
        const dx = x - cam.cx, dy = y - cam.cy;
        out[0] = view.x + (dx * c + dy * s) * z; out[1] = view.y - (-dx * s + dy * c) * z;
      };
    }

    /* ---------- pieces ---------- */

    function drawBackdrop(cam, view, t) {
      ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, R.W, R.H);
      // parallax: accumulate screen-space camera motion, scaled per layer
      if (R.lastCam) {
        const c = Math.cos(cam.ang), s = Math.sin(cam.ang);
        const dx = cam.cx - R.lastCam.cx, dy = cam.cy - R.lastCam.cy;
        R.bdx -= (dx * c + dy * s) * cam.zoom; R.bdy += (-dx * s + dy * c) * cam.zoom;
        if (!isFinite(R.bdx) || Math.abs(R.bdx) > 1e7) R.bdx = 0;
        if (!isFinite(R.bdy) || Math.abs(R.bdy) > 1e7) R.bdy = 0;
      }
      R.lastCam = { cx: cam.cx, cy: cam.cy };
      const facs = [0.008, 0.018, 0.04, 0.085];
      const zr = Math.log(cam.zoom / cam.zoomRef);
      for (let k = 0; k < 4; k++) {
        const sc = Math.exp(zr * (0.03 + 0.03 * k)) * (k === 0 ? 3.2 : 1);
        ctx.save();
        ctx.translate(view.x, view.y); ctx.scale(sc, sc);
        ctx.translate(-view.x + R.bdx * facs[k] / sc, -view.y + R.bdy * facs[k] / sc);
        ctx.fillStyle = k === 0 ? nebulaPat : layers[k - 1];
        if (k === 0) ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 0.2);
        const ext = 2.2 / Math.min(sc, 1) + 1;
        ctx.fillRect(view.x - R.W * ext, view.y - R.H * ext, R.W * ext * 2, R.H * ext * 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function drawGuides(s, to) {
      const g = s.preset.guides;
      if (!g || !g.list || s.sim.n < 1) return;
      const c = [0, 0]; to(s.sim.x[0], s.sim.y[0], c);
      ctx.save();
      ctx.setLineDash([2, 5]); ctx.lineWidth = 1; ctx.font = '10px ' + s.mono; ctx.textAlign = 'left';
      for (const [label, p] of g.list) {
        const rad = g.a * Math.pow(p, -2 / 3) * s.cam.zoom;
        ctx.strokeStyle = 'rgba(255,176,74,0.32)';
        ctx.beginPath(); ctx.arc(c[0], c[1], rad, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,190,110,0.85)';
        ctx.fillText(label, c[0] + rad * Math.cos(-0.42) + 6, c[1] + rad * Math.sin(-0.42) - 4);
      }
      ctx.restore();
    }

    function drawTrails(s, to) {
      const N = TRAIL_N[s.opts.trails];
      if (!N || s.cam.ang !== 0 && s.cam.rotOn) return;
      const sim = s.sim, tmp = [0, 0];
      const many = sim.n > 60, len = many ? Math.min(N, 70) : N;
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < sim.n; i++) {
        const mt = sim.meta[i];
        if (mt.hidden || mt.tc < 3) continue;
        const k = Math.min(mt.tc, len), col = mt.rgb || (mt.rgb = U.hex(mt.color.length === 7 ? mt.color : '#9bb8d8'));
        const chunks = k > 240 ? 12 : k > 60 ? 7 : 4, per = Math.ceil(k / chunks);
        const big = mt.type === 'star' && !many;
        for (let c = 0; c < chunks; c++) {
          const from = c * per, to2 = Math.min(k, (c + 1) * per + 1);
          if (from >= to2 - 1) continue;
          const frac = (c + 1) / chunks;
          ctx.strokeStyle = U.rgba(col, Math.pow(frac, 1.8) * (many ? 0.45 : 0.7));
          ctx.lineWidth = (big ? 1.5 : 1.1) * (0.6 + 0.6 * frac);
          ctx.beginPath();
          for (let q = from; q < to2; q++) {
            const idx = ((mt.th - k + q) % 1800 + 1800) % 1800;
            to(mt.trail[idx * 2], mt.trail[idx * 2 + 1], tmp);
            if (q === from) ctx.moveTo(tmp[0], tmp[1]); else ctx.lineTo(tmp[0], tmp[1]);
          }
          if (c === chunks - 1) { to(sim.x[i], sim.y[i], tmp); ctx.lineTo(tmp[0], tmp[1]); }
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawParticles(s) {
      const sim = s.sim, pn = sim.pn;
      const ps = pn > 3500 ? 0.5 : pn > 700 ? 0.75 : 1;
      if (ps !== R.ps) R.allocParticles(ps);
      const d = R.img.data, w = R.pw, h = R.ph;
      d.fill(0);
      const cam = s.cam, view = s.view, z = cam.zoom * ps, c = Math.cos(cam.ang), sn = Math.sin(cam.ang);
      const ox = view.x * ps, oy = view.y * ps;
      const gain = pn > 6000 ? 0.34 : pn > 2500 ? 0.44 : pn > 900 ? 0.6 : 0.95;
      const px = sim.px, py = sim.py, pvx = sim.pvx, pvy = sim.pvy, plife = sim.plife, pkind = sim.pkind;
      const inv = 0.5 / R.vMean;
      let vsum = 0, cnt = 0;
      for (let p = 0; p < pn; p++) {
        const dx = px[p] - cam.cx, dy = py[p] - cam.cy;
        const X = ox + (dx * c + dy * sn) * z - 0.5, Y = oy - (-dx * sn + dy * c) * z - 0.5;
        if (X < 0 || Y < 0 || X >= w - 1 || Y >= h - 1) continue;
        const kind = pkind[p];
        let r, g, b, k = gain;
        if (kind === 0) {
          const v = Math.sqrt(pvx[p] * pvx[p] + pvy[p] * pvy[p]);
          vsum += v; cnt++;
          const li = Math.min(63, (v * inv * 63) | 0) * 3;
          r = LUT[li]; g = LUT[li + 1]; b = LUT[li + 2];
        } else {
          const lf = Math.min(1, plife[p] / (sim.rate * 2.2));
          k = 1.25 * lf * Math.max(gain, 0.6);
          if (kind === 1) { r = 255; g = 150 + 90 * lf; b = 70 + 60 * lf; } else { r = 150; g = 210; b = 255; k *= 0.7; }
        }
        const ix = X | 0, iy = Y | 0, fx = X - ix, fy = Y - iy;
        const o = (iy * w + ix) * 4, o2 = o + w * 4;
        const w00 = (1 - fx) * (1 - fy) * k, w10 = fx * (1 - fy) * k, w01 = (1 - fx) * fy * k, w11 = fx * fy * k;
        d[o] += r * w00; d[o + 1] += g * w00; d[o + 2] += b * w00;
        d[o + 4] += r * w10; d[o + 5] += g * w10; d[o + 6] += b * w10;
        d[o2] += r * w01; d[o2 + 1] += g * w01; d[o2 + 2] += b * w01;
        d[o2 + 4] += r * w11; d[o2 + 5] += g * w11; d[o2 + 6] += b * w11;
      }
      if (cnt) R.vMean += (Math.max(1e-9, vsum / cnt) - R.vMean) * 0.05;
      for (let i = 3; i < d.length; i += 4) d[i] = 255;
      pctx.putImageData(R.img, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(pc, 0, 0, R.W, R.H);
      ctx.globalCompositeOperation = 'source-over';
    }

    function glowDot(x, y, rad, col, a) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, U.rgba(col, a)); g.addColorStop(0.4, U.rgba(col, a * 0.3)); g.addColorStop(1, U.rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }

    function drawPlanet(x, y, rp, mt, lx, ly, t) {
      const col = mt.rgb;
      if (rp < 2.3) {
        ctx.globalCompositeOperation = 'lighter';
        glowDot(x, y, 7 + rp * 2, col, 0.55);
        ctx.fillStyle = U.rgba(U.mix(col, 1.25), 1); ctx.beginPath(); ctx.arc(x, y, Math.max(1.3, rp), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      if (mt.atmo) { ctx.globalCompositeOperation = 'lighter'; glowDot(x, y, rp * 1.7, U.hex(mt.atmo), 0.22); ctx.globalCompositeOperation = 'source-over'; }
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, rp, 0, TAU); ctx.clip();
      const g = ctx.createRadialGradient(x + lx * rp * 0.5, y + ly * rp * 0.5, rp * 0.05, x, y, rp * 1.25);
      g.addColorStop(0, U.rgba(U.mix(col, 1.5), 1)); g.addColorStop(0.45, U.rgba(col, 1)); g.addColorStop(1, U.rgba(U.mix(col, 0.25), 1));
      ctx.fillStyle = g; ctx.fillRect(x - rp, y - rp, rp * 2, rp * 2);
      if (mt.bands && rp > 4) {
        for (let b = -3; b <= 3; b++) {
          ctx.fillStyle = b % 2 ? 'rgba(110,70,40,0.26)' : 'rgba(255,235,200,0.14)';
          ctx.fillRect(x - rp, y + b * rp * 0.23 - rp * 0.07, rp * 2, rp * (0.1 + 0.03 * (b & 1)));
        }
      }
      const n = ctx.createLinearGradient(x + lx * rp, y + ly * rp, x - lx * rp, y - ly * rp);
      n.addColorStop(0, 'rgba(0,0,0,0)'); n.addColorStop(0.45, 'rgba(0,2,10,0.1)'); n.addColorStop(0.85, 'rgba(0,2,10,0.7)'); n.addColorStop(1, 'rgba(0,2,10,0.82)');
      ctx.fillStyle = n; ctx.fillRect(x - rp, y - rp, rp * 2, rp * 2);
      ctx.restore();
      // rim light on the star-facing limb
      const a0 = Math.atan2(ly, lx);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = mt.atmo ? U.rgba(U.hex(mt.atmo), 0.65) : 'rgba(255,240,220,0.45)';
      ctx.lineWidth = Math.max(1, rp * 0.1); ctx.beginPath(); ctx.arc(x, y, rp - ctx.lineWidth * 0.4, a0 - 1.05, a0 + 1.05); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawBlackHole(x, y, rp, mt, t) {
      const boost = 1 + Math.min(2, mt.glow) * 0.7, tilt = -0.32;
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(x, y, rp * 0.9, x, y, rp * 6);
      halo.addColorStop(0, U.rgba([255, 190, 110], 0.28 * boost)); halo.addColorStop(0.3, U.rgba([255, 140, 60], 0.1 * boost)); halo.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, rp * 6, 0, TAU); ctx.fill();
      const ring = (a0, a1) => {
        for (let k = 0; k < 4; k++) {
          const f = k / 3, rx = rp * (2.0 + 1.7 * f), ry = rp * (0.55 + 0.42 * f);
          ctx.strokeStyle = U.rgba([255, 255 - 95 * f, 235 - 170 * f], (0.72 - 0.44 * f) * Math.min(1.4, boost));
          ctx.lineWidth = Math.max(1, rp * (0.22 - 0.1 * f));
          ctx.beginPath(); ctx.ellipse(x, y, rx, ry, tilt, a0, a1); ctx.stroke();
        }
      };
      ring(Math.PI, TAU);                                           // far side of the disc
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, rp, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = U.rgba([255, 236, 205], 0.9); ctx.lineWidth = Math.max(1, rp * 0.13);   // photon ring
      ctx.beginPath(); ctx.arc(x, y, rp * 1.14, 0, TAU); ctx.stroke();
      ring(0, Math.PI);                                             // near side, in front of the hole
      ctx.strokeStyle = U.rgba([190, 220, 255], 0.2 + 0.05 * Math.sin(t * 1.6));                // lensed background ring
      ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, rp * 2.35, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawStar(x, y, rp, mt, glowBase, t, id) {
      const col = mt.rgb, vis = mt.visual;
      const gR = Math.max(rp * 2.2, glowBase * vis) * (1 + Math.min(1, mt.flash) * 0.5);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, gR);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(Math.min(0.3, rp / gR), U.rgba(col, 0.8));
      g.addColorStop(0.4, U.rgba(col, 0.2)); g.addColorStop(1, U.rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gR, 0, TAU); ctx.fill();
      if (gR > 16) {                                                  // lens-flare spikes
        const len = gR * 3.4 * (0.9 + 0.1 * Math.sin(t * 2.1 + id)), a = Math.min(0.75, 0.25 + gR / 90);
        for (let q = 0; q < 2; q++) {
          const lg = q ? ctx.createLinearGradient(x, y - len, x, y + len) : ctx.createLinearGradient(x - len, y, x + len, y);
          lg.addColorStop(0, U.rgba(col, 0)); lg.addColorStop(0.5, U.rgba([255, 255, 255], a)); lg.addColorStop(1, U.rgba(col, 0));
          ctx.fillStyle = lg;
          if (q) ctx.fillRect(x - 0.6, y - len, 1.2, len * 2); else ctx.fillRect(x - len, y - 0.6, len * 2, 1.2);
        }
        if (gR > 26) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
          const l2 = len * 0.45, dg = ctx.createLinearGradient(-l2, 0, l2, 0);
          dg.addColorStop(0, U.rgba(col, 0)); dg.addColorStop(0.5, U.rgba(col, a * 0.6)); dg.addColorStop(1, U.rgba(col, 0));
          ctx.fillStyle = dg; ctx.fillRect(-l2, -0.5, l2 * 2, 1); ctx.fillRect(-0.5, -l2, 1, l2 * 2);
          ctx.restore();
        }
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, Math.max(1.3, rp * 0.8), 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawComet(x, y, rp, mt) {
      ctx.globalCompositeOperation = 'lighter';
      glowDot(x, y, 11, [170, 225, 255], 0.55);
      ctx.fillStyle = '#eaf8ff'; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, rp), 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawBodies(s, to) {
      const sim = s.sim, cam = s.cam, z = cam.zoom, tmp = [0, 0], t = s.t;
      const stars = [];
      for (let i = 0; i < sim.n; i++) if (sim.meta[i].type === 'star' && !sim.meta[i].hidden) stars.push(i);
      const cs = Math.cos(cam.ang), sn = Math.sin(cam.ang);
      const late = [], screen = s.screenPos;
      screen.length = 0;
      for (let i = 0; i < sim.n; i++) {
        const mt = sim.meta[i];
        if (!mt.rgb) mt.rgb = U.hex(mt.color.length === 7 ? mt.color : '#9bb8d8');
        to(sim.x[i], sim.y[i], tmp);
        const x = tmp[0], y = tmp[1];
        const type = mt.type;
        const minPx = type === 'star' ? 2.4 : type === 'blackhole' ? 3.2 : 1.6;
        const rp = Math.max(minPx, sim.r[i] * z);
        screen[i] = [x, y, rp];
        if (mt.hidden) continue;
        if (x < -80 || y < -80 || x > R.W + 80 || y > R.H + 80) continue;
        if (mt.glow > 0) mt.glow = Math.max(0, mt.glow - s.dtReal * 0.35);
        if (mt.flash > 0) mt.flash = Math.max(0, mt.flash - s.dtReal * 1.6);
        if (type === 'star') late.push(i);
        else if (type === 'blackhole') drawBlackHole(x, y, rp, mt, t);
        else if (type === 'comet') drawComet(x, y, rp, mt);
        else {
          // light from the strongest nearby star, in screen space
          let lx = 0.6, ly = -0.6, best = 0;
          if (sim.n < 40) {
            for (const si of stars) {
              const dx = sim.x[si] - sim.x[i], dy = sim.y[si] - sim.y[i], d2 = dx * dx + dy * dy + 1e-30, f = sim.m[si] / d2;
              if (f > best) { best = f; const u = dx * cs + dy * sn, w = -dx * sn + dy * cs, n = Math.hypot(u, w) || 1; lx = u / n; ly = -w / n; }
            }
          }
          drawPlanet(x, y, rp, mt, lx, ly, t);
        }
      }
      const glowBase = 19;
      for (const i of late) {
        const sp = screen[i];
        drawStar(sp[0], sp[1], sp[2], sim.meta[i], glowBase, t, sim.meta[i].id);
      }
    }

    function drawFlashes(s, to) {
      const tmp = [0, 0];
      ctx.globalCompositeOperation = 'lighter';
      for (const f of s.flashes) {
        const age = (s.t - f.t0) / 1.1;
        if (age < 0 || age > 1) continue;
        to(f.x, f.y, tmp);
        const rp = Math.max(6, f.size * s.cam.zoom), a = 1 - age;
        const col = f.kind === 'absorb' ? [255, 170, 90] : [255, 230, 190];
        glowDot(tmp[0], tmp[1], rp * (2 + 5 * U.easeOutCubic(age)), col, 0.9 * a * a);
        ctx.strokeStyle = U.rgba(col, 0.7 * a); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(tmp[0], tmp[1], rp * (1 + 9 * U.easeOutCubic(age)), 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /** Osculating conic of the selected body around its dominant attractor, as a dashed ghost. */
    function drawConic(s, to, i) {
      const sim = s.sim, el = sim.elements(i);
      if (!el || !(el.e < 12)) return;
      const a = el.ref, tmp = [0, 0];
      const lim = el.e >= 1 ? Math.acos(-1 / el.e) * 0.96 : Math.PI;
      ctx.save();
      ctx.setLineDash([3, 6]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(95,227,255,0.38)';
      ctx.beginPath();
      let started = false;
      for (let k = 0; k <= 160; k++) {
        const nu = -lim + 2 * lim * k / 160, r = el.p / (1 + el.e * Math.cos(nu));
        if (r < 0 || r > 1e6) continue;
        const ang = el.omega + el.dirn * nu;
        to(sim.x[a] + r * Math.cos(ang), sim.y[a] + r * Math.sin(ang), tmp);
        if (!started) { ctx.moveTo(tmp[0], tmp[1]); started = true; } else ctx.lineTo(tmp[0], tmp[1]);
      }
      ctx.stroke();
      ctx.restore();
    }

    function drawOverlays(s, to) {
      const sim = s.sim, scr = s.screenPos;
      // selection reticle + conic
      const si = s.selId ? sim.indexOf(s.selId) : -1;
      if (si >= 0 && scr[si]) {
        drawConic(s, to, si);
        const [x, y, rp] = scr[si], r = Math.max(rp + 10, 17) + 1.5 * Math.sin(s.t * 3), L = 6;
        ctx.strokeStyle = 'rgba(95,227,255,0.95)'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          ctx.moveTo(x + sx * r, y + sy * (r - L)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - L), y + sy * r);
        }
        ctx.stroke();
        if (s.followId === s.selId) {
          ctx.font = '9px ' + s.mono; ctx.fillStyle = 'rgba(95,227,255,0.9)'; ctx.textAlign = 'center';
          ctx.fillText('TRACKING', x, y + r + 13);
        }
      }
      // hover ring
      const hi = s.hoverId ? sim.indexOf(s.hoverId) : -1;
      if (hi >= 0 && hi !== si && scr[hi]) {
        const [x, y, rp] = scr[hi];
        ctx.strokeStyle = 'rgba(255,176,74,0.85)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, Math.max(rp + 7, 12), 0, TAU); ctx.stroke();
      }
      // labels
      if (s.opts.labels) {
        ctx.font = '11px ' + s.mono; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0.6px';
        for (let i = 0; i < sim.n; i++) {
          const mt = sim.meta[i];
          if (!mt.label || mt.hidden || !scr[i]) continue;
          const [x, y, rp] = scr[i];
          if (x < -50 || y < 0 || x > R.W || y > R.H) continue;
          const off = rp + 12;
          ctx.strokeStyle = 'rgba(160,215,255,0.35)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + rp * 0.75 + 2, y - rp * 0.75 - 2); ctx.lineTo(x + off * 0.85, y - off * 0.85); ctx.lineTo(x + off * 0.85 + 10, y - off * 0.85); ctx.stroke();
          ctx.fillStyle = 'rgba(214,236,255,0.9)'; ctx.fillText(mt.name.toUpperCase(), x + off * 0.85 + 14, y - off * 0.85 + 4);
        }
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      }
    }

    function drawFling(s, to) {
      const f = s.fling;
      if (!f || !f.active) return;
      const a = [0, 0], b = [f.sx, f.sy];
      to(f.x0, f.y0, a);
      ctx.save();
      // predicted ghost path
      if (f.pred && f.pred.count > 1) {
        const p = f.pred, tmp = [0, 0];
        ctx.lineCap = 'round';
        const seg = 6, n = p.count;
        for (let c = 0; c * seg < n - 1; c++) {
          const i0 = c * seg, i1 = Math.min(n - 1, i0 + seg), fr = 1 - c * seg / n;
          ctx.strokeStyle = `rgba(255,190,110,${(0.15 + 0.7 * fr * fr).toFixed(3)})`;
          ctx.lineWidth = 1.6; ctx.setLineDash([5, 5]);
          ctx.beginPath();
          for (let i = i0; i <= i1; i++) { to(p.pts[i * 2], p.pts[i * 2 + 1], tmp); if (i === i0) ctx.moveTo(tmp[0], tmp[1]); else ctx.lineTo(tmp[0], tmp[1]); }
          ctx.stroke();
        }
        ctx.setLineDash([]);
        to(p.pts[(n - 1) * 2], p.pts[(n - 1) * 2 + 1], tmp);
        if (p.impact) {
          to(p.impact.x, p.impact.y, tmp);
          ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.beginPath();
          ctx.moveTo(tmp[0] - 6, tmp[1] - 6); ctx.lineTo(tmp[0] + 6, tmp[1] + 6); ctx.moveTo(tmp[0] + 6, tmp[1] - 6); ctx.lineTo(tmp[0] - 6, tmp[1] + 6); ctx.stroke();
          ctx.fillStyle = '#ff8a8a'; ctx.font = '10px ' + s.mono; ctx.textAlign = 'left'; ctx.fillText('IMPACT', tmp[0] + 10, tmp[1] - 8);
        } else {
          ctx.fillStyle = 'rgba(255,200,130,0.9)'; ctx.beginPath(); ctx.arc(tmp[0], tmp[1], 2.5, 0, TAU); ctx.fill();
        }
      }
      // velocity arrow
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const rr = Math.max(4, f.r * s.cam.zoom);
      ctx.globalCompositeOperation = 'lighter';
      glowDot(a[0], a[1], 16 + rr, [95, 227, 255], 0.5);
      if (L > 4) {
        const ux = dx / L, uy = dy / L, g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        g.addColorStop(0, 'rgba(95,227,255,0.15)'); g.addColorStop(1, 'rgba(180,245,255,1)');
        ctx.strokeStyle = g; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.fillStyle = 'rgba(200,250,255,1)'; ctx.beginPath();
        ctx.moveTo(b[0] + ux * 9, b[1] + uy * 9); ctx.lineTo(b[0] - uy * 5, b[1] + ux * 5); ctx.lineTo(b[0] + uy * 5, b[1] - ux * 5); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(95,227,255,0.95)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(a[0], a[1], rr + 5, 0, TAU); ctx.stroke();
      ctx.fillStyle = U.rgba(f.rgb, 1); ctx.beginPath(); ctx.arc(a[0], a[1], rr, 0, TAU); ctx.fill();
      ctx.font = '11px ' + s.mono; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(214,244,255,0.95)';
      ctx.fillText(f.label1, b[0] + 14, b[1] - 6); ctx.fillStyle = 'rgba(150,190,215,0.9)'; ctx.fillText(f.label2, b[0] + 14, b[1] + 9);
      ctx.restore();
    }

    function bloomPass(s) {
      if (!s.opts.bloom) return;
      const cvs = bloomCv;
      let src = canvas;
      for (let k = 0; k < 4; k++) {
        const [c, cx] = cvs[k];
        cx.globalCompositeOperation = 'copy';
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        if (k === 1) cx.filter = 'contrast(1.7) brightness(1.15)';
        cx.drawImage(src, 0, 0, c.width, c.height);
        cx.filter = 'none';
        src = c;
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const W = canvas.width, H = canvas.height;
      ctx.globalAlpha = 0.45; ctx.drawImage(cvs[1][0], 0, 0, W, H);
      ctx.globalAlpha = 0.5; ctx.drawImage(cvs[2][0], 0, 0, W, H);
      ctx.globalAlpha = 0.6; ctx.drawImage(cvs[3][0], 0, 0, W, H);
      ctx.restore();
    }

    function niceStep(pxTarget, zoom) {
      const raw = pxTarget / zoom, e = Math.floor(Math.log10(raw)), f = raw / Math.pow(10, e);
      return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * Math.pow(10, e);
    }

    function tickLabel(v, step) {
      if (Math.abs(v) < step * 1e-6) return '0';
      const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
      const a = Math.abs(v);
      const str = a >= 1e5 || (a < 1e-3) ? a.toExponential(0) : a.toFixed(Math.min(dec, 6));
      return (v < 0 ? '-' : '+') + str;
    }

    function drawRulers(s) {
      const T = 22, W = R.W, H = R.H, z = s.cam.zoom, vx = s.view.x, vy = s.view.y;
      ctx.save();
      ctx.fillStyle = 'rgba(4,8,15,0.62)'; ctx.fillRect(0, 0, W, T); ctx.fillRect(0, T, T, H - T);
      ctx.strokeStyle = 'rgba(95,227,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, T + 0.5); ctx.lineTo(W, T + 0.5); ctx.moveTo(T + 0.5, T); ctx.lineTo(T + 0.5, H); ctx.stroke();
      const step = niceStep(86, z), sub = step / 5;
      ctx.font = '9.5px ' + s.mono; ctx.textBaseline = 'middle';
      ctx.lineWidth = 1;
      // top ruler (x offset from the view centre)
      let k0 = Math.ceil((T - vx) / z / sub), k1 = Math.floor((W - vx) / z / sub);
      ctx.beginPath();
      for (let k = k0; k <= k1; k++) {
        const x = Math.round(vx + k * sub * z) + 0.5, major = k % 5 === 0;
        ctx.moveTo(x, T); ctx.lineTo(x, T - (major ? 10 : 4));
      }
      ctx.strokeStyle = 'rgba(160,200,230,0.55)'; ctx.stroke();
      ctx.fillStyle = 'rgba(175,210,235,0.85)'; ctx.textAlign = 'left';
      for (let k = k0; k <= k1; k++) if (k % 5 === 0) ctx.fillText(tickLabel(k * sub, step), Math.round(vx + k * sub * z) + 4, 8);
      // left ruler (y offset)
      k0 = Math.ceil((vy - H) / z / sub); k1 = Math.floor((vy - T) / z / sub);
      ctx.beginPath();
      for (let k = k0; k <= k1; k++) {
        const y = Math.round(vy - k * sub * z) + 0.5, major = k % 5 === 0;
        ctx.moveTo(T, y); ctx.lineTo(T - (major ? 10 : 4), y);
      }
      ctx.stroke();
      ctx.textAlign = 'center';
      for (let k = k0; k <= k1; k++) if (k % 5 === 0) {
        const y = Math.round(vy - k * sub * z);
        ctx.save(); ctx.translate(9, y - 4); ctx.rotate(-Math.PI / 2); ctx.fillText(tickLabel(k * sub, step), 0, 0); ctx.restore();
      }
      // corner unit tag
      ctx.fillStyle = 'rgba(255,176,74,0.95)'; ctx.textAlign = 'center'; ctx.font = 'bold 9px ' + s.mono;
      ctx.fillText(s.preset.units.len.toUpperCase(), T / 2, T / 2 + 0.5);
      // cursor markers
      if (s.cursor && s.cursor.in) {
        ctx.strokeStyle = 'rgba(255,176,74,0.95)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(s.cursor.x + 0.5, 0); ctx.lineTo(s.cursor.x + 0.5, T); ctx.moveTo(0, s.cursor.y + 0.5); ctx.lineTo(T, s.cursor.y + 0.5); ctx.stroke();
      }
      ctx.restore();
    }

    function drawScaleBar(s) {
      const z = s.cam.zoom, step = niceStep(110, z), px = step * z;
      const x0 = s.stageL + 24, y0 = R.H - (s.stageR ? 96 : 160);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,176,74,0.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0); ctx.lineTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 - 4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,200,130,0.95)'; ctx.font = '10px ' + s.mono; ctx.textAlign = 'left';
      ctx.fillText(O.util.fmt(step, 2).replace(/\.0+$/, '') + ' ' + s.preset.units.len, x0, y0 - 9);
      ctx.restore();
    }

    R.screenPos = [];

    R.frame = function (s) {
      s.screenPos = R.screenPos;
      ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      const to = tf(s.cam, s.view);
      drawBackdrop(s.cam, s.view, s.t);
      drawGuides(s, to);
      drawTrails(s, to);
      drawParticles(s);
      drawBodies(s, to);
      drawFlashes(s, to);
      drawFling(s, to);
      drawOverlays(s, to);
      bloomPass(s);
      ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      const vg = ctx.createRadialGradient(s.view.x, s.view.y, Math.min(R.W, R.H) * 0.35, s.view.x, s.view.y, Math.max(R.W, R.H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, R.W, R.H);
      if (s.opts.rulers) { drawRulers(s); drawScaleBar(s); }
      if (s.fade > 0) { ctx.fillStyle = `rgba(2,4,10,${s.fade})`; ctx.fillRect(0, 0, R.W, R.H); }
    };

    R.tf = tf;
    return R;
  }

  O.Renderer = { create };
})(typeof window !== 'undefined' ? window : globalThis);
