/* FLUXFIELD - the hands-free "Conductor" (FF.createConductor).
 * Lissajous emitters bent by curl noise, a rhythmic pulse/ring layer, occasional bursts and a slowly drifting palette.
 * It yields to any pointer input smoothly and fades back in after ~8 s of idle. */
(function () {
  'use strict';
  const FF = (window.FF = window.FF || {});
  const { TAU, curlNoise, mulberry32 } = FF.util;

  const IDLE_SECONDS = 8;
  const MAX_EMITTERS = 4;

  FF.createConductor = function (api) {
    const rnd = mulberry32(0xf1a57);
    const emitters = [];
    for (let i = 0; i < MAX_EMITTERS; i++) {
      emitters.push({ fx: 0.55 + rnd() * 0.6, fy: 0.42 + rnd() * 0.7, px: rnd() * TAU, py: rnd() * TAU, fm: 0.2 + rnd() * 0.3, u: 0.5, v: 0.5, has: false });
    }
    const pulses = [];
    const col = [0, 0, 0], cn = [0, 0];
    let t = 0, weight = 1, idle = IDLE_SECONDS + 1, enabled = true, beat = 0.55, beatCount = 0, nextBurst = 11 + rnd() * 5;

    function update(dt) {
      const look = api.look();
      idle += dt;
      const want = enabled && idle > IDLE_SECONDS ? 1 : 0;
      // slow swell in, quick yield out
      weight += (want - weight) * (1 - Math.exp(-dt * (want > weight ? 0.8 : 4.5)));
      if (weight < 0.015) { for (const e of emitters) e.has = false; return; }

      const calm = api.reduced ? 0.5 : 1;
      t += dt * look.speed * calm;
      const a = api.aspect();
      const sym = api.symmetry() > 1;
      const force = api.force();
      const g = look.gain * api.energy() * weight;
      const frames = dt * 60;
      const radius = api.radius();
      const n = Math.min(look.emitters, MAX_EMITTERS);

      for (let i = 0; i < n; i++) {
        const e = emitters[i];
        let u = Math.sin(e.fx * t * 0.9 + e.px);
        let v = Math.sin(e.fy * t * 0.9 + e.py + 0.7 * Math.sin(e.fm * t));
        curlNoise(u * 1.4 + i * 7.3, v * 1.4, t * 0.35, cn);
        u += cn[0] * 0.25 * look.swirl;
        v += cn[1] * 0.25 * look.swirl;
        // with kaleidoscope on, stay inside the inscribed disc so every mirrored copy remains on screen
        const pu = sym ? 0.5 + (u * 0.42) / a : 0.5 + u * 0.46;
        const pv = sym ? 0.5 + v * 0.42 : 0.5 + v * 0.44;
        let vx = 0, vy = 0;
        if (e.has) {
          vx = ((pu - e.u) * a) / dt + cn[0] * 0.8 * look.swirl;
          vy = (pv - e.v) / dt + cn[1] * 0.8 * look.swirl;
          const sp = Math.hypot(vx, vy);
          if (sp > 2.2) { vx *= 2.2 / sp; vy *= 2.2 / sp; }
        }
        e.u = pu; e.v = pv; e.has = true;
        api.palette(t * 0.045 + i * 0.27, col);
        const amount = 0.17 * g * frames * (0.85 + 0.3 * Math.sin(t * 1.3 + i * 2.0));
        api.paint(pu, pv, vx * force, vy * force, col, radius * (0.95 + 0.25 * Math.sin(t * 0.9 + i)), amount, false);
      }

      // rhythm: a soft tick every beat, a big expanding ring every fourth
      beat += (dt * look.bpm * calm) / 60;
      while (beat >= 1) {
        beat -= 1; beatCount++;
        const big = beatCount % 4 === 0;
        pulses.push({
          age: 0, big, dur: big ? 2.2 : 1.1, rot: rnd() * TAU, hue: rnd(),
          x: sym ? 0.5 : big ? 0.2 + rnd() * 0.6 : emitters[0].u,
          y: sym ? 0.5 : big ? 0.25 + rnd() * 0.5 : emitters[0].v,
        });
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k];
        p.age += dt;
        const f = p.age / p.dur;
        if (f >= 1) { pulses.splice(k, 1); continue; }
        const pts = p.big ? 12 : 6;
        const ease = 1 - Math.pow(1 - f, 3);
        const ring = p.big ? 0.02 + 0.21 * ease : 0.01 + 0.07 * ease;
        const fall = (1 - f) * (1 - f);
        for (let j = 0; j < pts; j++) {
          const ang = p.rot + (j * TAU) / pts;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          api.palette(p.hue + (j / pts) * 0.5 + t * 0.045, col);
          api.paint(p.x + (ca * ring) / a, p.y + sa * ring, ca * (p.big ? 0.9 : 0.35) * fall * force, sa * (p.big ? 0.9 : 0.35) * fall * force,
            col, radius * 0.7, (p.big ? 0.11 : 0.07) * fall * g * frames, true);
        }
      }

      nextBurst -= dt;
      if (nextBurst <= 0) { nextBurst = 14 + rnd() * 10; api.burst(0.6); }
    }

    return {
      update,
      /** Called on any user input - the conductor yields and its idle timer restarts. */
      touch() { idle = 0; },
      get weight() { return weight; },
      get enabled() { return enabled; },
      set enabled(v) { enabled = !!v; if (enabled) idle = IDLE_SECONDS + 1; },
      get idleSeconds() { return idle; },
    };
  };
})();
