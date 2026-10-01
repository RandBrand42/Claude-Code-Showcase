/* ATMOS - scene.js : weather "moods" and the extra scenery layers drawn by sky.js at four stages.
 *
 *   mood(w, city)   turns a weather sample (real or synthetic) into a few smooth 0..1 amounts plus a label for the hero badge:
 *                   perfect beach day, very high / extreme UV, smoky air, thunderstorm, strong wind, heat.
 *   stage('sun')    lens flare and UV glare around the sun
 *   stage('deck')   storm deck with flickering inner lightning, stratus for overcast days, smoke veil, rainbow, birds
 *   stage('ground') the beach: sea with glitter, waves and foam, sand, palm trees (coastal cities only)
 *   stage('fx')     smoke motes, blown leaves and dust, rain mist
 *
 * Everything is drawn from pre-built sprites and a few paths, and every layer is skipped when its amount is ~0, so a plain sky costs nothing extra.
 * Real data only: there is no pollen layer because the free forecast service has no pollen data outside Europe.
 */
(function () {
  'use strict';
  const A = window.Atmos, U = A.util, Sky = A.Sky, Scene = (A.Scene = {});
  const { clamp, lerp, smooth, mix3, TAU } = U;
  const rnd = U.rng(31337);

  /* ------------------------------------------------------------------ mood */
  Scene.mood = function (w, city) {
    const day = smooth(2, 12, w.alt), aqi = isFinite(w.aqi) ? w.aqi : 0;
    const calm = 1 - smooth(18, 34, w.wind);
    const dry = (1 - smooth(0.04, 0.15, w.rain)) * (1 - smooth(0.04, 0.15, w.snow)) * (1 - w.storm) * (1 - smooth(0.2, 0.5, w.fog));
    const sunny = 1 - smooth(0.25, 0.6, w.cloud);
    const warm = smooth(22, 26, w.temp) * smooth(37, 33, w.temp);
    const clean = 1 - smooth(80, 130, aqi);
    const nice = day * calm * dry * sunny * warm * clean;
    const beach = nice * (w.uv < 11 ? 1 : 0.55);
    const uvx = smooth(7, 10.5, w.uv) * (1 - 0.6 * w.cloud) * day;
    const haze = smooth(90, 165, aqi);
    const gale = smooth(30, 55, w.wind);
    const m = { beach, nice, uvx, haze, gale, label: '', tone: '' };
    if (w.storm > 0.3) { m.label = 'Thunderstorm overhead'; m.tone = 'bad'; }
    else if (w.uv >= 11 && day > 0.3) { m.label = 'Extreme UV ' + Math.round(w.uv); m.tone = 'bad'; }
    else if (aqi >= 151) { m.label = 'Unhealthy air · AQI ' + Math.round(aqi); m.tone = 'bad'; }
    else if (w.uv >= 8 && day > 0.3) { m.label = 'Very high UV ' + Math.round(w.uv); m.tone = 'warn'; }
    else if (aqi >= 101) { m.label = 'Smoky haze · AQI ' + Math.round(aqi); m.tone = 'warn'; }
    else if (w.wind >= 55) { m.label = 'Very windy'; m.tone = 'warn'; }
    else if (w.temp >= 38) { m.label = 'Extreme heat'; m.tone = 'bad'; }
    else if (beach > 0.55) { m.label = city && city.coast ? 'Perfect beach day' : 'Perfect day outside'; m.tone = 'good'; }
    return m;
  };

  /* ------------------------------------------------------------------ sprites (built once per size) */
  let built = '', deck = null, stratus = null, W = 0, H = 0;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(2, w | 0); c.height = Math.max(2, h | 0); return c; };
  function build(E) {
    const key = E.W + 'x' + E.H + '@' + E.rs.toFixed(2); if (key === built) return; built = key; W = E.W; H = E.H;
    const T = Sky.tools, hh = Math.ceil(E.H * E.rs * 0.5 * 0.5);
    // storm deck: dense cloud tile pre-darkened, two copies with different seeds drawn at different speeds
    deck = [0, 1].map((k) => { const c = T.cloudTile({ seed: 777 + k * 91, scale: 1.5 + k * 0.5 }, true, 1400, hh); const g = c.getContext('2d'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = k ? 'rgba(18,22,34,.82)' : 'rgba(30,36,52,.74)'; g.fillRect(0, 0, c.width, c.height); return c; });
    // stratus: long soft horizontal streaks
    const sw = 1600, sh = Math.ceil(E.H * E.rs * 0.5 * 0.42), s = mk(sw, sh), g = s.getContext('2d'), r = U.rng(5150);
    for (let i = 0; i < 90; i++) {
      const x = r() * sw, y = sh * (0.1 + 0.8 * r()), rx = 120 + r() * 380, ry = 8 + r() * 34, gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      const a = 0.05 + r() * 0.09; gr.addColorStop(0, `rgba(238,242,248,${a})`); gr.addColorStop(1, 'rgba(238,242,248,0)');
      for (const dx of [0, -sw, sw]) { g.save(); g.translate(x + dx, y); g.scale(1, ry / rx); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore(); }
    }
    stratus = s;
  }

  /* ------------------------------------------------------------------ small state */
  const gulls = Array.from({ length: 6 }, (_, i) => ({ x: rnd(), y: 0.2 + rnd() * 0.3, v: 0.012 + rnd() * 0.02, ph: rnd() * TAU, s: 0.7 + rnd() * 0.6 }));
  const motes = Array.from({ length: 110 }, () => ({ x: rnd(), y: rnd(), z: rnd(), ph: rnd() * TAU }));
  const leaves = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd(), z: rnd(), r: rnd() * TAU, k: rnd() }));
  let deckOff = [0, 0], flick = { t: 0, x: 0.5, y: 0.2, a: 0 }, nextFlick = 1;

  /* ------------------------------------------------------------------ stages */
  const stages = {};

  /* ---- sun: lens flare and UV glare ---- */
  stages.sun = function (E) {
    const { ctx, S, W, H, t } = E;
    const clear = clamp(1 - S.cloud * 1.6 - S.fog - S.storm, 0, 1) * smooth(2, 14, S.alt) * (1 - S.haze * 0.6);
    const sunR = E.sunR, x = S.sx, y = S.sy;
    if (S.uvx > 0.02 && clear > 0.05) {
      // white-hot glare: a huge soft bloom, a slow pulse, and a warm wash over the whole sky
      const a = S.uvx * clear, pulse = E.reduced ? 1 : 0.92 + 0.08 * Math.sin(t * 1.3);
      ctx.globalCompositeOperation = 'lighter';
      let g = ctx.createRadialGradient(x, y, 0, x, y, sunR * 22 * pulse); g.addColorStop(0, `rgba(255,250,235,${0.55 * a})`); g.addColorStop(0.3, `rgba(255,226,170,${0.2 * a})`); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, E.yH + 40);
      ctx.fillStyle = `rgba(255,214,150,${0.07 * a})`; ctx.fillRect(0, 0, W, E.yH);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (clear > 0.15 && S.alt > 4 && y < E.yH - 20) {
      // lens flare: ghosts along the line from the sun through the middle of the screen, plus a faint horizontal streak
      const cx = W / 2, cy = E.yH * 0.45, dx = cx - x, dy = cy - y, a = clear * (0.5 + 0.5 * S.uvx);
      ctx.globalCompositeOperation = 'lighter';
      const ghosts = [[0.35, 0.05, [150, 210, 255], 0.5], [0.6, 0.09, [255, 190, 120], 0.35], [0.95, 0.04, [180, 255, 200], 0.5], [1.3, 0.12, [255, 150, 190], 0.28], [1.7, 0.06, [160, 190, 255], 0.4]];
      for (const [p, r0, col, al] of ghosts) {
        const gx = x + dx * p, gy = y + dy * p, rr = r0 * Math.min(W, H) * 0.9;
        const g = ctx.createRadialGradient(gx, gy, rr * 0.55, gx, gy, rr); g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`); g.addColorStop(0.8, `rgba(${col[0]},${col[1]},${col[2]},${0.07 * al * a})`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        ctx.fillStyle = g; ctx.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
      }
      const sg = ctx.createLinearGradient(x - W * 0.35, y, x + W * 0.35, y); sg.addColorStop(0, 'rgba(255,240,210,0)'); sg.addColorStop(0.5, `rgba(255,240,210,${0.16 * a})`); sg.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = sg; ctx.fillRect(x - W * 0.35, y - 1.5, W * 0.7, 3);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  /* ---- deck: everything that lives among the clouds ---- */
  stages.deck = function (E) {
    const { ctx, S, W, H, t, dt } = E, rm = E.reduced ? 0.12 : 1;
    // stratus for overcast days: wide flat bands, slow, darker under rain
    const over = smooth(0.62, 0.95, S.cloud) * (1 - S.storm * 0.3) * (1 - S.snow * 0.2);
    if (over > 0.02 && stratus) {
      const sw = stratus.width, sh = stratus.height, scale = (W * 1.2) / sw, dh = sh * scale * 2;
      const off = (t * (6 + S.windX * 0.5) * rm) % sw;
      const tone = E.day > 0.4 ? 1 : 0.25;
      ctx.globalAlpha = over * 0.55 * tone;
      for (let k = 0; k < 2; k++) for (let x = -((off * (1 + k * 0.5)) % sw) * scale; x < W; x += sw * scale) ctx.drawImage(stratus, x, E.yH * (0.12 + 0.16 * k) - dh * 0.3, sw * scale, dh);
      ctx.globalAlpha = 1;
      // heavy, dull underside: darkens toward the top of the sky when it is thick and wet
      const dk = ctx.createLinearGradient(0, 0, 0, E.yH); dk.addColorStop(0, `rgba(20,26,40,${0.32 * over * (0.4 + S.rain)})`); dk.addColorStop(1, 'rgba(20,26,40,0)'); ctx.fillStyle = dk; ctx.fillRect(0, 0, W, E.yH);
    }
    // thunderstorm deck: a low, boiling, dark ceiling with its own inner flashes between the big bolts
    if (S.storm > 0.05 && deck) {
      const a = smooth(0.05, 0.6, S.storm), tw = deck[0].width, th = deck[0].height, scale = W / (tw * 0.9);
      for (let k = 0; k < 2; k++) {
        deckOff[k] = (deckOff[k] + (10 + 14 * k + S.windX * 0.8) * rm * dt * 0.6) % (tw * scale);
        ctx.globalAlpha = a * (k ? 0.95 : 0.8);
        const y = -th * scale * (0.28 - k * 0.1) + Math.sin(t * 0.35 + k) * 4 * rm;
        for (let x = -deckOff[k]; x < W; x += tw * scale) ctx.drawImage(deck[k], x, y, tw * scale, th * scale * 1.1);
      }
      ctx.globalAlpha = 1;
      if (!E.reduced) {                                     // inner flicker: a glow that lights the cloud from inside
        nextFlick -= dt;
        if (nextFlick < 0) { flick = { t: 0, x: 0.1 + rnd() * 0.8, y: 0.05 + rnd() * 0.22, a: 0.4 + rnd() * 0.6 }; nextFlick = (0.7 + rnd() * 2.6) / (0.3 + S.storm); }
        flick.t += dt;
        const f = flick.t < 0.35 ? Math.abs(Math.sin(flick.t * 26)) * Math.exp(-flick.t * 6) * flick.a : 0;
        if (f > 0.02) { ctx.globalCompositeOperation = 'lighter'; const fx = flick.x * W, fy = flick.y * E.yH, g = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.28); g.addColorStop(0, `rgba(170,185,255,${0.5 * f * a})`); g.addColorStop(1, 'rgba(170,185,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, E.yH); ctx.globalCompositeOperation = 'source-over'; }
      }
      // a greenish, bruised light low on the horizon under the deck
      const hg = ctx.createLinearGradient(0, E.yH * 0.6, 0, E.yH); hg.addColorStop(0, 'rgba(40,60,70,0)'); hg.addColorStop(1, `rgba(60,86,90,${0.28 * a * E.day})`); ctx.fillStyle = hg; ctx.fillRect(0, E.yH * 0.6, W, E.yH * 0.4);
    }
    // smoke veil
    if (S.haze > 0.03) {
      const h = S.haze, g = ctx.createLinearGradient(0, 0, 0, E.yH + 20);
      g.addColorStop(0, `rgba(120,98,80,${0.18 * h})`); g.addColorStop(0.7, `rgba(176,134,96,${0.32 * h})`); g.addColorStop(1, `rgba(206,150,104,${0.46 * h})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, E.yH + 20);
    }
    // rainbow: after rain, with the sun still out, opposite the sun
    const rb = smooth(0.05, 0.14, S.rain) * smooth(0.5, 0.2, S.rain) * (1 - smooth(0.55, 0.85, S.cloud)) * smooth(3, 10, S.alt) * smooth(48, 30, S.alt) * (1 - S.storm);
    if (rb > 0.03) {
      const cx = clamp(W - S.sx, W * 0.2, W * 0.55), cy = E.yH + H * 0.1, R0 = Math.min(W, H) * 0.55, band = R0 * 0.03;
      const cols = [[255, 70, 70], [255, 160, 60], [255, 230, 80], [90, 210, 110], [70, 150, 255], [140, 90, 230]];
      ctx.globalCompositeOperation = 'lighter';
      cols.forEach((c, i) => { ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.55 * rb})`; ctx.lineWidth = band * 1.1; ctx.beginPath(); ctx.arc(cx, cy, R0 - i * band, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); });
      ctx.globalCompositeOperation = 'source-over';
    }
    // gulls (sunny, not stormy), more of them at the beach
    const birds = clamp(Math.max(S.beach * 1.0, (1 - S.cloud) * E.day * 0.35) * (1 - S.rain * 3) * (1 - S.storm) * (1 - S.haze), 0, 1);
    if (birds > 0.05 && !E.reduced) {
      const n = Math.ceil(gulls.length * birds); ctx.fillStyle = ctx.strokeStyle = `rgba(${E.far[0] | 0},${E.far[1] | 0},${E.far[2] | 0},${0.7 * birds})`; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      const dir = S.windX < 0 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const b = gulls[i]; b.x += b.v * dt * dir * 0.5; if (b.x > 1.1) b.x = -0.1; if (b.x < -0.1) b.x = 1.1;
        const px = b.x * W, py = (b.y + Math.sin(t * 0.4 + b.ph) * 0.015) * E.yH, fl = Math.sin(t * 5.5 + b.ph) * 0.55, sz = 9 * b.s * (E.W < 700 ? 0.8 : 1);
        ctx.beginPath(); ctx.moveTo(px - sz, py - fl * sz * 0.8); ctx.quadraticCurveTo(px - sz * 0.4, py - sz * (0.35 + fl * 0.3), px, py); ctx.quadraticCurveTo(px + sz * 0.4, py - sz * (0.35 + fl * 0.3), px + sz, py - fl * sz * 0.8); ctx.stroke();
      }
    }
  };

  /* ---- ground: the beach ---- */
  function palm(ctx, x, y, h, lean, sway, col) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = col;
    const topX = lean * h, topY = -h;
    ctx.beginPath(); ctx.moveTo(-h * 0.022, 0); ctx.quadraticCurveTo(topX * 0.2 - h * 0.03, topY * 0.55, topX - h * 0.012, topY); ctx.lineTo(topX + h * 0.012, topY); ctx.quadraticCurveTo(topX * 0.2 + h * 0.03, topY * 0.55, h * 0.022, 0); ctx.fill();
    ctx.translate(topX, topY);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + sway * (i % 2 ? 1 : -1) * 0.5, L = h * (0.36 + 0.07 * ((i * 5) % 3)), dx = Math.cos(a) * L, dy = Math.sin(a) * L * 0.55 + L * 0.34;
      ctx.lineWidth = h * 0.016; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(dx * 0.55, dy * 0.2 - L * 0.28, dx, dy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx * 0.3, dy * 0.0 - L * 0.12); ctx.quadraticCurveTo(dx * 0.7, dy * 0.25 - L * 0.2, dx, dy); ctx.quadraticCurveTo(dx * 0.7, dy * 0.45 - L * 0.1, dx * 0.3, -L * 0.04); ctx.fill();
    }
    ctx.restore();
  }
  stages.ground = function (E) {
    const b = E.S.beach; if (b < 0.02) return;
    const { ctx, S, W, H, t, yH } = E, day = E.day;
    const top = yH - H * 0.075, shoreY = yH + H * 0.045, bottom = H, rm = E.reduced ? 0 : 1;
    ctx.save(); ctx.globalAlpha = smooth(0.02, 0.5, b);
    // sea: colour from the sky's own horizon so it always matches the light
    const deep = mix3([14, 54, 92], [10, 22, 44], 1 - day), shallow = mix3([60, 210, 205], [28, 52, 82], 1 - day), skyC = E.hor;
    const sea = ctx.createLinearGradient(0, top, 0, shoreY); sea.addColorStop(0, `rgb(${mix3(skyC, deep, 0.55).map((v) => v | 0)})`); sea.addColorStop(0.55, `rgb(${deep.map((v) => v | 0)})`); sea.addColorStop(1, `rgb(${shallow.map((v) => v | 0)})`);
    ctx.fillStyle = sea; ctx.fillRect(0, top, W, shoreY - top);
    // waves: rows of drifting sines, brighter near the shore
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 6; k++) {
      const p = (k + 1) / 7, y0 = lerp(top + 6, shoreY - 4, Math.pow(p, 1.45)), amp = 1 + k * 0.9, sp = (0.6 + k * 0.22) * (1 + S.wind / 40);
      ctx.strokeStyle = `rgba(255,255,255,${(0.12 + 0.07 * k) * day})`; ctx.beginPath();
      for (let x = 0; x <= W + 20; x += 18) { const y = y0 + Math.sin(x * 0.011 * (1 + k * 0.1) + t * sp * rm + k * 2.1) * amp + Math.sin(x * 0.027 - t * sp * 0.7 * rm) * amp * 0.4; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // sun glitter on the water, under the sun
    if (S.alt > 2 && E.clear > 0.1) {
      ctx.globalCompositeOperation = 'lighter';
      const n = E.quality > 0.6 ? 70 : 36;
      for (let i = 0; i < n; i++) {
        const q = (i * 0.6180339) % 1, y = lerp(top + 4, shoreY - 3, Math.pow(q, 1.3)), spread = lerp(8, W * 0.12, Math.pow(q, 1.2)), x = S.sx + (((i * 97) % 61) / 61 - 0.5) * 2 * spread + Math.sin(t * 0.8 + i) * 4 * rm;
        const tw = rm ? 0.35 + 0.65 * Math.max(0, Math.sin(t * (2 + (i % 5)) + i * 3.7)) : 0.7;
        ctx.fillStyle = `rgba(255,248,225,${0.55 * tw * E.clear * clamp((S.alt - 2) / 14, 0, 1)})`; ctx.fillRect(x, y, 2 + q * 7, 1.1 + q * 0.9);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // surf: foam creeping up and sliding back, twice, out of phase
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.22 * rm + k * 0.5) % 1, adv = Math.sin(ph * Math.PI), y0 = shoreY - 3 + adv * H * 0.012 + k * 4;
      ctx.fillStyle = `rgba(255,255,255,${(0.5 - k * 0.15) * (1 - ph * 0.5) * (0.35 + 0.65 * day)})`; ctx.beginPath(); ctx.moveTo(0, y0 + 6);
      for (let x = 0; x <= W + 20; x += 14) ctx.lineTo(x, y0 + Math.sin(x * 0.02 + t * rm + k) * 2.2 - Math.sin(x * 0.07 + k * 3) * 1.1);
      ctx.lineTo(W + 20, y0 + 8); ctx.closePath(); ctx.fill();
    }
    // sand, lit by the sun colour, with a wet darker strip where the water just was
    const lit = mix3([54, 58, 84], mix3([232, 208, 158], [250, 226, 176], 0.4), day), wet = lit.map((v) => v * 0.78);
    const sand = ctx.createLinearGradient(0, shoreY, 0, bottom); sand.addColorStop(0, `rgb(${wet.map((v) => v | 0)})`); sand.addColorStop(0.18, `rgb(${lit.map((v) => v | 0)})`); sand.addColorStop(1, `rgb(${lit.map((v) => (v * 0.82) | 0)})`);
    ctx.fillStyle = sand; ctx.fillRect(0, shoreY + 2, W, bottom - shoreY);
    // palms at the right edge (the text is on the left), gently swaying
    const sway = Math.sin(t * 1.1) * 0.06 * (1 + S.wind / 22) * rm, pc = `rgb(${mix3([8, 16, 14], [20, 36, 28], day).map((v) => v | 0)})`;
    const u = H / 900; const big = W >= 900; palm(ctx, W * (big ? 0.375 : 0.9), shoreY + 30 * u, 220 * u, big ? 0.16 : -0.2, sway, pc); palm(ctx, W * (big ? 0.345 : 0.96), shoreY + 42 * u, 150 * u, big ? 0.3 : -0.32, sway * 1.2, pc);
    ctx.restore();
  };

  /* ---- fx: particles in front of the scenery ---- */
  stages.fx = function (E) {
    const { ctx, S, W, H, t, dt } = E, rm = E.reduced ? 0.15 : 1;
    // smoke motes drifting in the haze
    if (S.haze > 0.1) {
      const n = Math.floor(motes.length * smooth(0.1, 0.9, S.haze) * E.quality);
      for (let i = 0; i < n; i++) {
        const m = motes[i]; m.x += (0.004 + m.z * 0.01 + S.windX * 0.0006) * dt * rm; m.y += Math.sin(t * 0.3 + m.ph) * 0.0003 * rm; if (m.x > 1.05) m.x = -0.05; if (m.x < -0.05) m.x = 1.05;
        ctx.fillStyle = `rgba(214,170,128,${(0.1 + 0.22 * m.z) * S.haze})`; const r = 0.8 + m.z * 2.4; ctx.beginPath(); ctx.arc(m.x * W, m.y * E.yH * 1.1, r, 0, TAU); ctx.fill();
      }
    }
    // blown leaves and dust in strong wind (dry only)
    const gale = E.mood ? E.mood.gale : 0, dry = (1 - smooth(0.05, 0.3, S.rain)) * (1 - smooth(0.05, 0.3, S.snow));
    if (gale > 0.05 && dry > 0.1) {
      const n = Math.floor(leaves.length * gale * dry * E.quality), dir = S.windX < 0 ? -1 : 1, spd = Math.abs(S.wind) * 0.016 + 0.1;
      for (let i = 0; i < n; i++) {
        const l = leaves[i]; l.x += dir * spd * (0.5 + l.z) * dt * rm; l.y += (Math.sin(t * 2 + l.r * 5) * 0.03 + 0.02 * l.k) * dt * rm; l.r += (2 + 5 * l.z) * dt * rm * dir;
        if (l.x > 1.1) { l.x = -0.1; l.y = 0.45 + rnd() * 0.5; } if (l.x < -0.1) { l.x = 1.1; l.y = 0.45 + rnd() * 0.5; } if (l.y > 1.02) l.y = 0.4;
        const px = l.x * W, py = l.y * H, sz = 2.2 + l.z * 4.5;
        ctx.save(); ctx.translate(px, py); ctx.rotate(l.r); ctx.fillStyle = l.k < 0.5 ? `rgba(150,120,60,${0.65 * gale})` : `rgba(100,130,60,${0.65 * gale})`; ctx.beginPath(); ctx.ellipse(0, 0, sz, sz * 0.45, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    // mist hugging the ground under heavy rain
    const mist = smooth(0.25, 0.8, S.rain);
    if (mist > 0.02) {
      for (let i = 0; i < 3; i++) { const ox = (((t * (12 + i * 9) * rm + i * 400) % (W * 1.3)) + W * 1.3) % (W * 1.3) - W * 0.15, g = ctx.createRadialGradient(ox, E.yH + 6, 0, ox, E.yH + 6, W * 0.42); g.addColorStop(0, `rgba(190,205,225,${0.14 * mist})`); g.addColorStop(1, 'rgba(190,205,225,0)'); ctx.fillStyle = g; ctx.fillRect(ox - W * 0.42, E.yH - H * 0.1, W * 0.84, H * 0.2); }
    }
  };

  Scene.stage = function (name, E) { build(E); const f = stages[name]; if (f) f(E); };
})();
