/* RESONANCE - engine.js
 * The whole sound engine, 100% Web Audio, nothing sampled:
 *   synth voices (2 osc + sub + noise + unison -> drive -> 2x biquad filter -> amp)
 *   global LFOs, FX chain (drive, ensemble chorus, ping-pong delay, procedural convolution reverb),
 *   six synthesized drum voices, and the master bus (glue compressor, limiter, soft-clip guard).
 * The engine works on any BaseAudioContext, so the same code is exercised by an OfflineAudioContext in tests.
 */
(function () {
  'use strict';
  const R = window.R, U = R.util, P = R.P;

  const MAX_VOICES = 8;
  const VOICE_GAIN = 0.3;
  const WAVE_TYPES = ['sine', 'triangle', 'sawtooth', 'square'];

  let ctx = null;
  let N = {};            // node bag: every persistent node of the graph
  let voices = [];       // live synth voices (including ones in their release tail)
  let lastFreq = 0;      // previous note frequency, for glide
  let noiseBuf = null;
  let lastOpen = null;   // last open hat, so a closed hat can choke it
  let rvTimer = 0;
  let modWheel = 0;

  /* ---------- shaping curves (built once) ---------- */
  function makeCurve(n, fn) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
    return c;
  }
  const VOICE_CURVE = makeCurve(2049, (x) => Math.tanh(2.2 * x) / Math.tanh(2.2));
  const KICK_CURVE = makeCurve(2049, (x) => Math.tanh(1.7 * x) / Math.tanh(1.7));
  const DRIVE_CURVE = makeCurve(4097, (x) => Math.tanh(3 * x) / Math.tanh(3));
  // Soft-clip guard: linear to 0.9, then a C1-continuous quadratic knee that tops out at 0.95 (-0.45 dBFS).
  const CLIP_K = 0.9;
  const CLIP_CURVE = makeCurve(4097, (x) => {
    const a = Math.abs(x);
    if (a <= CLIP_K) return x;
    const d = a - CLIP_K;
    return Math.sign(x) * (CLIP_K + d - (d * d) / (2 * (1 - CLIP_K)));
  });

  /* ---------- tiny node helpers ---------- */
  const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const biquad = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
  const shaper = (curve, os) => { const s = ctx.createWaveShaper(); s.curve = curve; s.oversample = os || '2x'; return s; };
  const now = () => ctx.currentTime;
  const tc = 0.015; // default smoothing time-constant for live parameter moves

  function osc(type, f, t, end) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(end);
    return o;
  }
  function noiseSrc(t, end) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(t, Math.random() * 1.8);
    s.stop(end);
    return s;
  }
  function cleanupOnEnd(src, nodes) {
    src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* already gone */ } } };
  }

  /* ---------- ADSR maths shared between automation and analysis ---------- */
  // The envelope is scheduled as: linear attack -> exponential (setTarget) decay to sustain -> exponential release.
  // envAt() evaluates the same curve analytically so a release can be scheduled at any time without reading params back.
  function mkEnv(t0, a, d, s, r) {
    a = Math.max(a, 0.0015); d = Math.max(d, 0.01); r = Math.max(r, 0.01);
    return { t0, a, d, s, r, tcD: d / 4, tcR: r / 5, relT: null };
  }
  function envAt(e, t) {
    if (t <= e.t0) return 0;
    const rel = e.relT != null && t >= e.relT;
    const tt = rel ? e.relT : t;
    const da = tt - e.t0;
    const lv = da < e.a ? da / e.a : e.s + (1 - e.s) * Math.exp(-(da - e.a) / e.tcD);
    return rel ? lv * Math.exp(-(t - e.relT) / e.tcR) : lv;
  }
  function startEnv(param, e) {
    param.setValueAtTime(0, e.t0);
    param.linearRampToValueAtTime(1, e.t0 + e.a);
    param.setTargetAtTime(e.s, e.t0 + e.a, e.tcD);
  }
  function releaseEnv(param, e, t) {
    const v = envAt(e, t);
    e.relT = t;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
    param.setTargetAtTime(0, t, e.tcR);
  }

  /* =====================================================================
   * Graph construction
   * ===================================================================== */
  function init(context) {
    ctx = context;
    voices = [];
    lastFreq = 0;
    lastOpen = null;
    N = {};
    const sr = ctx.sampleRate;

    // shared white-noise loop (2 s) - deterministic so renders are reproducible
    noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const nd = noiseBuf.getChannelData(0), nr = U.rng(4242);
    for (let i = 0; i < nd.length; i++) nd[i] = nr() * 2 - 1;

    buildMaster();
    buildSynthFx();
    buildDelay();
    buildReverbBus();
    buildLfos();
    buildDrumBus();
    applyAll(true);
    return N;
  }

  function buildMaster() {
    N.mix = gain(1);
    N.master = gain(0.8);
    N.dc = biquad('highpass', 24, 0.707);
    N.comp = ctx.createDynamicsCompressor();
    N.comp.knee.value = 14; N.comp.attack.value = 0.012; N.comp.release.value = 0.22;
    N.compTrim = gain(1);
    N.limiter = ctx.createDynamicsCompressor();
    N.limiter.threshold.value = -2; N.limiter.knee.value = 0; N.limiter.ratio.value = 20;
    N.limiter.attack.value = 0.002; N.limiter.release.value = 0.09;
    N.clip = shaper(CLIP_CURVE, '2x');
    N.out = gain(1);
    N.mix.connect(N.master).connect(N.dc).connect(N.comp).connect(N.compTrim)
      .connect(N.limiter).connect(N.clip).connect(N.out).connect(ctx.destination);

    // analysis taps (passive)
    N.anScope = ctx.createAnalyser(); N.anScope.fftSize = 2048; N.anScope.smoothingTimeConstant = 0;
    N.anSpec = ctx.createAnalyser(); N.anSpec.fftSize = 4096; N.anSpec.smoothingTimeConstant = 0.65;
    N.anSpec.minDecibels = -96; N.anSpec.maxDecibels = -14;
    const split = ctx.createChannelSplitter(2);
    N.anL = ctx.createAnalyser(); N.anR = ctx.createAnalyser();
    N.anL.fftSize = N.anR.fftSize = 1024; N.anL.smoothingTimeConstant = N.anR.smoothingTimeConstant = 0;
    N.out.connect(N.anScope); N.out.connect(N.anSpec); N.out.connect(split);
    split.connect(N.anL, 0); split.connect(N.anR, 1);
  }

  function buildSynthFx() {
    N.synthBus = gain(1);
    N.duck = gain(1);       // kick-triggered "pump" lives here
    N.trem = gain(1);       // LFO -> amp lands here
    N.synthBus.connect(N.duck).connect(N.trem);

    // saturation: parallel clean / tanh-shaped paths
    N.drvDry = gain(1); N.drvPre = gain(1); N.drvPost = gain(1); N.drvWet = gain(0);
    N.drvShp = shaper(DRIVE_CURVE, '4x');
    N.chIn = gain(1);
    N.trem.connect(N.drvDry).connect(N.chIn);
    N.trem.connect(N.drvPre).connect(N.drvShp).connect(N.drvPost).connect(N.drvWet).connect(N.chIn);

    // ensemble chorus: three modulated delay lines panned L / C / R
    N.synthOut = gain(1);
    N.chDry = gain(1); N.chWet = gain(0);
    N.chIn.connect(N.chDry).connect(N.synthOut);
    N.chWet.connect(N.synthOut);
    N.chLfo = [];
    [-0.85, 0, 0.85].forEach((pan, i) => {
      const dl = ctx.createDelay(0.05);
      dl.delayTime.value = 0.012 + i * 0.0045;
      const lfo = ctx.createOscillator(); lfo.type = 'sine';
      lfo.start(ctx.currentTime + i * 0.13);
      const depth = gain(0.002);
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      const bg = gain(0.62);
      lfo.connect(depth).connect(dl.delayTime);
      N.chIn.connect(dl).connect(bg).connect(p).connect(N.chWet);
      N.chLfo.push({ lfo, depth });
    });

    // synth -> master, plus the two send effects are wired in buildDelay / buildReverbBus
    N.synthOut.connect(N.mix);
  }

  function buildDelay() {
    N.dlSend = gain(0);
    N.dlIn = biquad('highpass', 150, 0.707);
    N.dlL = ctx.createDelay(4); N.dlR = ctx.createDelay(4);
    N.dlTL = biquad('lowpass', 4800, 0.6); N.dlTR = biquad('lowpass', 4800, 0.6);
    N.dlFbL = gain(0.4); N.dlFbR = gain(0.4);
    N.dlOut = gain(1);
    const pl = ctx.createStereoPanner(); pl.pan.value = -0.85;
    const pr = ctx.createStereoPanner(); pr.pan.value = 0.85;
    N.synthOut.connect(N.dlSend).connect(N.dlIn).connect(N.dlL);
    // ping-pong: L -> tone -> fb -> R -> tone -> fb -> L ; outputs tapped after the tone filters
    N.dlL.connect(N.dlTL); N.dlTL.connect(N.dlFbL).connect(N.dlR);
    N.dlR.connect(N.dlTR); N.dlTR.connect(N.dlFbR).connect(N.dlL);
    N.dlTL.connect(pl).connect(N.dlOut);
    N.dlTR.connect(pr).connect(N.dlOut);
    N.dlOut.connect(N.mix);
  }

  function buildReverbBus() {
    N.rvSend = gain(0.15);
    N.rvIn = gain(1);
    N.rvPre = ctx.createDelay(0.25);
    N.rvHp = biquad('highpass', 170, 0.6);
    N.rvOut = gain(1);
    N.synthOut.connect(N.rvSend).connect(N.rvIn);
    N.rvIn.connect(N.rvPre);
    N.rvHp.connect(N.rvOut).connect(N.mix);
    N.rvCur = null;
    buildReverb(true);
  }

  /** Procedural room: exponentially decaying, progressively darker stereo noise + a few early reflections. */
  function makeIR(decay, size, damp) {
    const sr = ctx.sampleRate;
    const len = Math.max(2048, Math.floor(sr * Math.min(9, decay * 1.05 + 0.15)));
    const buf = ctx.createBuffer(2, len, sr);
    const fHi = 15000 - damp * 8500, fLo = 6500 - damp * 5600;   // air absorption: brightness at t=0 and at t=decay
    const build = 0.004 + size * 0.03;                            // bigger rooms take longer to reach full density
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch), rnd = U.rng(9173 + ch * 7717);
      let lp = 0, lo = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.pow(10, (-3 * t) / decay) * (1 - Math.exp(-t / build));
        const fc = fHi * Math.pow(fLo / fHi, Math.min(1, t / (decay * 0.9)));
        lp += (1 - Math.exp((-2 * Math.PI * fc) / sr)) * (rnd() * 2 - 1 - lp);
        lo += 0.0208 * (lp - lo);                                  // one-pole low tracker; subtracting it high-passes the tail
        d[i] = (lp - lo) * env;
      }
      const taps = 6 + Math.round(size * 7);
      for (let k = 0; k < taps; k++) {
        const at = Math.floor((0.007 + rnd() * (0.028 + size * 0.075)) * sr);
        const amp = (rnd() < 0.5 ? -1 : 1) * 0.55 * (1 - k / (taps + 2));
        for (let j = 0; j < 40 && at + j < len; j++) d[at + j] += amp * (rnd() * 2 - 1) * Math.exp(-j / 9);
      }
    }
    return buf;
  }

  /** (Re)generate the impulse response and crossfade to it so twiddling the knobs never clicks. */
  function buildReverb(immediate) {
    clearTimeout(rvTimer);
    const run = () => {
      if (!ctx) return;
      const conv = ctx.createConvolver();
      conv.buffer = makeIR(P.rvDecay, P.rvSize, P.rvDamp);
      const g = gain(0);
      N.rvPre.connect(conv); conv.connect(g).connect(N.rvHp);
      const t = now();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.18);
      const old = N.rvCur;
      if (old) {
        old.g.gain.cancelScheduledValues(t);
        old.g.gain.setValueAtTime(old.g.gain.value, t);
        old.g.gain.linearRampToValueAtTime(0, t + 0.18);
        setTimeout(() => { try { old.conv.disconnect(); old.g.disconnect(); } catch (e) { /* ok */ } }, 500);
      }
      N.rvCur = { conv, g };
    };
    if (immediate) run(); else rvTimer = setTimeout(run, 160);
  }

  function buildLfos() {
    N.busPitch = gain(1); N.busCut = gain(1); N.busPW = gain(1);
    N.bend = ctx.createConstantSource(); N.bend.offset.value = 0; N.bend.start();
    N.bend.connect(N.busPitch);
    // sample & hold source: 8 random steps per loop
    const shBuf = ctx.createBuffer(1, 4096, ctx.sampleRate);
    const sd = shBuf.getChannelData(0), sr = U.rng(77);
    for (let s = 0; s < 8; s++) { const v = sr() * 2 - 1; for (let i = 0; i < 512; i++) sd[s * 512 + i] = v; }
    N.lfo = [0, 1].map(() => {
      const o = ctx.createOscillator(); o.frequency.value = 1; o.start();
      const sh = ctx.createBufferSource(); sh.buffer = shBuf; sh.loop = true; sh.start();
      const shape = gain(1);
      const routes = { pitch: gain(0), cut: gain(0), amp: gain(0), pw: gain(0) };
      shape.connect(routes.pitch).connect(N.busPitch);
      shape.connect(routes.cut).connect(N.busCut);
      shape.connect(routes.amp).connect(N.trem.gain);
      shape.connect(routes.pw).connect(N.busPW);
      return { o, sh, shape, routes, src: null };
    });
  }

  function buildDrumBus() {
    N.drumBus = gain(0.85);
    N.kickShp = shaper(KICK_CURVE, '2x');
    N.drumComp = ctx.createDynamicsCompressor();
    N.drumComp.threshold.value = -16; N.drumComp.knee.value = 8; N.drumComp.ratio.value = 3;
    N.drumComp.attack.value = 0.008; N.drumComp.release.value = 0.14;
    N.drumTrim = gain(0.72);
    N.drumRevSend = gain(0.15);
    N.kickShp.connect(N.drumBus);
    N.drumBus.connect(N.drumComp).connect(N.drumTrim).connect(N.mix);
    N.drumTrim.connect(N.drumRevSend).connect(N.rvIn);
  }

  /* =====================================================================
   * Live parameter application
   * ===================================================================== */
  function applyMaster() {
    const t = now();
    N.master.gain.setTargetAtTime(Math.pow(P.vol, 2) * 1.25 * Math.pow(10, P.trim / 20), t, 0.02);
    const a = P.comp, thr = -6 - a * 22, ratio = 1.3 + a * 4.2;
    N.comp.threshold.setTargetAtTime(thr, t, 0.05);
    N.comp.ratio.setTargetAtTime(ratio, t, 0.05);
    // Chrome's compressor applies automatic make-up gain (~0.6 of the full-scale gain reduction); hand most of it back.
    const makeupDb = 0.6 * -thr * (1 - 1 / ratio);
    N.compTrim.gain.setTargetAtTime(Math.pow(10, (-0.85 * makeupDb) / 20), t, 0.05);
  }
  function applyDrive() {
    const t = now(), a = P.fxDrive, wet = P.fxDriveMix * Math.min(1, a * 6);
    N.drvPre.gain.setTargetAtTime(1 + a * 12, t, 0.02);
    N.drvPost.gain.setTargetAtTime(1 / (1 + a * 2.6), t, 0.02);
    N.drvWet.gain.setTargetAtTime(wet, t, 0.02);
    N.drvDry.gain.setTargetAtTime(1 - wet, t, 0.02);
  }
  function applyChorus() {
    const t = now(), rates = [1, 1.13, 0.87];
    N.chLfo.forEach((c, i) => {
      c.lfo.frequency.setTargetAtTime(P.chRate * rates[i], t, 0.05);
      c.depth.gain.setTargetAtTime(0.0008 + P.chDepth * 0.0042, t, 0.05);
    });
    N.chWet.gain.setTargetAtTime(P.chMix, t, 0.03);
    N.chDry.gain.setTargetAtTime(1 - P.chMix * 0.45, t, 0.03);
  }
  function applyDelay() {
    const t = now(), T = U.clamp((R.DELAY_DIVS[P.dlTime].b * 60) / P.bpm, 0.02, 3.9);
    N.dlL.delayTime.setTargetAtTime(T, t, 0.04);
    N.dlR.delayTime.setTargetAtTime(T, t, 0.04);
    N.dlFbL.gain.setTargetAtTime(P.dlFb, t, 0.03);
    N.dlFbR.gain.setTargetAtTime(P.dlFb, t, 0.03);
    N.dlTL.frequency.setTargetAtTime(P.dlTone, t, 0.03);
    N.dlTR.frequency.setTargetAtTime(P.dlTone, t, 0.03);
    N.dlSend.gain.setTargetAtTime(P.dlMix, t, 0.03);
  }
  function applyReverbLevels() {
    const t = now();
    N.rvSend.gain.setTargetAtTime(P.rvMix, t, 0.03);
    N.rvPre.delayTime.setTargetAtTime(P.rvPre / 1000, t, 0.03);
  }
  function applyDrumBus() {
    const t = now();
    N.drumBus.gain.setTargetAtTime(P.drumLevel, t, 0.02);
    N.drumRevSend.gain.setTargetAtTime(P.drumRev * 0.8, t, 0.03);
  }
  function lfoRate(n) {
    return P['l' + n + 'sync'] ? P.bpm / 60 / R.LFO_DIVS[P['l' + n + 'div']].b : P['l' + n + 'rate'];
  }
  function applyLfos() {
    const t = now();
    let ampDepth = 0;
    [1, 2].forEach((n) => {
      const L = N.lfo[n - 1], shape = P['l' + n + 'shape'], rate = lfoRate(n), dest = P['l' + n + 'dest'];
      let d = P['l' + n + 'depth'];
      if (n === 1) d = Math.min(1, d + modWheel * (dest === 0 ? 0.3 : 0.6));   // mod wheel pushes LFO 1 deeper
      const want = shape === 4 ? L.sh : L.o;
      if (L.src !== want) {
        if (L.src) L.src.disconnect(L.shape);
        want.connect(L.shape);
        L.src = want;
      }
      if (shape < 4) L.o.type = WAVE_TYPES[shape];
      L.o.frequency.setTargetAtTime(rate, t, 0.03);
      L.sh.playbackRate.setTargetAtTime((rate * 4096) / ctx.sampleRate, t, 0.03);   // one 8-step loop per LFO cycle
      const units = [1200 * d * d, 4800 * d, 0.5 * d, 0.45 * d];
      ['pitch', 'cut', 'amp', 'pw'].forEach((k, i) => L.routes[k].gain.setTargetAtTime(i === dest ? units[i] : 0, t, 0.02));
      if (dest === 2) ampDepth += d;
    });
    N.trem.gain.setTargetAtTime(Math.max(0.2, 1 - 0.5 * ampDepth), t, 0.02);
  }

  function applyAll(immediate) {
    applyMaster(); applyDrive(); applyChorus(); applyDelay(); applyReverbLevels(); applyDrumBus(); applyLfos();
    if (!immediate) buildReverb(false);
  }

  const VOICE_IDS = new Set(['fType', 'fCut', 'fRes', 'fDrive', 'fKey', 'fEnv', 'o1level', 'o2level', 'subLevel', 'noise']);
  R.on('param', (id) => {
    if (!ctx) return;
    if (VOICE_IDS.has(id)) { for (const v of voices) refreshVoice(v); return; }
    if (id === 'vol' || id === 'comp' || id === 'trim') applyMaster();
    else if (id === 'pump') return;
    else if (id === 'fxDrive' || id === 'fxDriveMix') applyDrive();
    else if (id.startsWith('ch')) applyChorus();
    else if (id.startsWith('dl')) applyDelay();
    else if (id === 'rvMix' || id === 'rvPre') applyReverbLevels();
    else if (id === 'rvDecay' || id === 'rvSize' || id === 'rvDamp') buildReverb(false);
    else if (id === 'drumLevel' || id === 'drumRev') applyDrumBus();
    else if (id === 'bpm') { applyDelay(); applyLfos(); }
    else if (/^l[12]/.test(id)) applyLfos();
  });

  /* =====================================================================
   * Synth voices
   * ===================================================================== */
  function filterSetup(v, t, smooth) {
    const r = P.fRes, a = v.f1, b = v.f2;
    const setQ = (f, q) => (smooth ? f.Q.setTargetAtTime(q, t, tc) : (f.Q.value = q));
    switch (P.fType) {
      case 0: a.type = 'lowpass'; b.type = 'lowpass'; setQ(a, r * 13); setQ(b, r * 13); break;
      case 1: a.type = 'lowpass'; b.type = 'allpass'; setQ(a, r * 20); setQ(b, 0.7); break;
      case 2: a.type = 'highpass'; b.type = 'allpass'; setQ(a, r * 18); setQ(b, 0.7); break;
      case 3: a.type = 'bandpass'; b.type = 'allpass'; setQ(a, 0.6 + r * 14); setQ(b, 0.7); break;
      default: a.type = 'notch'; b.type = 'allpass'; setQ(a, 0.8 + r * 10); setQ(b, 0.7);
    }
    const hz = U.clamp(P.fCut * Math.pow(2, (P.fKey * (v.midi - 60)) / 12), 20, 20000);
    if (smooth) { a.frequency.setTargetAtTime(hz, t, tc); b.frequency.setTargetAtTime(hz, t, tc); }
    else { a.frequency.value = hz; b.frequency.value = hz; }
    v.resTrim = 1 / (1 + r * 1.1);
  }
  function voiceLevel(v) {
    return VOICE_GAIN * (0.2 + 0.8 * v.vel) * (v.accent ? 1.25 : 1) * v.resTrim;
  }
  const oscLevel = (n) => P['o' + n + 'level'] / Math.sqrt(P.uniVoices);

  function refreshVoice(v) {
    if (v.killed || v.dead) return;
    const t = now();
    filterSetup(v, t, true);
    v.out.gain.setTargetAtTime(voiceLevel(v), t, tc);
    v.fAmt.gain.setTargetAtTime(P.fEnv * 7200 * (v.accent ? 1.35 : 1), t, tc);
    const d = P.fDrive;
    v.dPre.gain.setTargetAtTime(0.8 + d * 6, t, tc);
    v.dWet.gain.setTargetAtTime(Math.min(1, d * 4), t, tc);
    v.dDry.gain.setTargetAtTime(1 - Math.min(1, d * 4) * 0.85, t, tc);
    if (v.g1) v.g1.gain.setTargetAtTime(oscLevel(1), t, tc);
    if (v.g2) v.g2.gain.setTargetAtTime(oscLevel(2), t, tc);
    if (v.gSub) v.gSub.gain.setTargetAtTime(P.subLevel * 0.85, t, tc);
    if (v.gNoise) v.gNoise.gain.setTargetAtTime(P.noise * 0.45, t, tc);
  }

  function buildVoice(midi, vel, t, o) {
    const c = ctx, p = P;
    const f0 = U.mtof(midi);
    const v = {
      midi, vel, key: o.key != null ? o.key : midi, src: o.src || 'kbd', accent: !!o.accent,
      t0: t, state: 'on', relT: null, stopT: 0, killed: false, dead: false,
      srcs: [], nodes: [], pwGains: [], oscList: [], resTrim: 1,
    };
    const keep = (n) => { v.nodes.push(n); return n; };
    const glide = p.glide;
    const fromF = glide > 0.002 && lastFreq > 0 && !o.noGlide ? lastFreq : f0;
    lastFreq = f0;
    const gl = Math.max(0.002, glide);

    const mix = keep(c.createGain());
    v.pitchMod = keep(c.createGain()); N.busPitch.connect(v.pitchMod);
    v.cutMod = keep(c.createGain()); N.busCut.connect(v.cutMod);

    const startSrc = (s, when) => { s.start(when); v.srcs.push(s); };
    const glideTo = (param, from, to) => {
      param.setValueAtTime(from, t);
      if (from !== to) param.exponentialRampToValueAtTime(to, t + gl);
    };

    [1, 2].forEach((n) => {
      if (p['o' + n + 'level'] < 0.001) return;
      const wave = p['o' + n + 'wave'];
      const ratio = Math.pow(2, p['o' + n + 'oct'] + p['o' + n + 'semi'] / 12);
      const uni = p.uniVoices, spread = p.uniDetune, width = p.uniSpread;
      const g = keep(c.createGain()); g.gain.value = oscLevel(n); g.connect(mix);
      v['g' + n] = g;
      for (let u = 0; u < uni; u++) {
        const pos = uni === 1 ? 0 : (u / (uni - 1)) * 2 - 1;
        const src = keep(c.createOscillator());
        let out = src;
        let pulse = null;
        if (wave === 4) {
          // PWM: saw minus a delayed copy of itself = pulse wave whose width is delay * frequency
          src.type = 'sawtooth';
          const dl = keep(c.createDelay(0.12)), inv = keep(c.createGain()), pg = keep(c.createGain());
          out = keep(c.createGain());
          inv.gain.value = -1; out.gain.value = 0.62;
          const pw = U.clamp(p['o' + n + 'pw'], 0.05, 0.95);
          dl.delayTime.value = pw / (f0 * ratio);
          pg.gain.value = 1 / (f0 * ratio);
          N.busPW.connect(pg); pg.connect(dl.delayTime);
          v.pwGains.push(pg);
          src.connect(out); src.connect(dl); dl.connect(inv); inv.connect(out);
          pulse = { dl, pg, pw };
        } else {
          src.type = WAVE_TYPES[wave];
        }
        glideTo(src.frequency, fromF * ratio, f0 * ratio);
        src.detune.value = p['o' + n + 'fine'] + pos * spread;
        v.pitchMod.connect(src.detune);
        if (uni > 1 && width > 0.01) {
          const pan = keep(c.createStereoPanner()); pan.pan.value = pos * width;
          out.connect(pan); pan.connect(g);
        } else out.connect(g);
        startSrc(src, u ? t + Math.random() * 0.004 : t);   // tiny random start offsets decorrelate unison phases
        v.oscList.push({ param: src.frequency, ratio, pulse });
      }
    });

    if (p.subLevel > 0.001) {
      const sub = keep(c.createOscillator());
      sub.type = p.subWave ? 'square' : 'sine';
      const ratio = Math.pow(2, p.subOct ? -2 : -1);
      glideTo(sub.frequency, fromF * ratio, f0 * ratio);
      v.pitchMod.connect(sub.detune);
      v.gSub = keep(c.createGain()); v.gSub.gain.value = p.subLevel * 0.85;
      sub.connect(v.gSub).connect(mix);
      startSrc(sub, t);
      v.oscList.push({ param: sub.frequency, ratio, pulse: null });
    }
    if (p.noise > 0.001) {
      const ns = keep(c.createBufferSource());
      ns.buffer = noiseBuf; ns.loop = true;
      v.gNoise = keep(c.createGain()); v.gNoise.gain.value = p.noise * 0.45;
      ns.connect(v.gNoise).connect(mix);
      ns.start(t, Math.random() * 1.8); v.srcs.push(ns);
    }

    // pre-filter saturation: clean + tanh in parallel
    v.dDry = keep(c.createGain()); v.dPre = keep(c.createGain()); v.dWet = keep(c.createGain());
    const shp = keep(c.createWaveShaper()); shp.curve = VOICE_CURVE; shp.oversample = '2x';
    mix.connect(v.dDry); mix.connect(v.dPre); v.dPre.connect(shp).connect(v.dWet);

    v.f1 = keep(c.createBiquadFilter()); v.f2 = keep(c.createBiquadFilter());
    v.dDry.connect(v.f1); v.dWet.connect(v.f1); v.f1.connect(v.f2);
    filterSetup(v, t, false);
    const d = p.fDrive;
    v.dPre.gain.value = 0.8 + d * 6;
    v.dWet.gain.value = Math.min(1, d * 4);
    v.dDry.gain.value = 1 - Math.min(1, d * 4) * 0.85;

    // filter envelope (+ accent boost) and LFO cutoff modulation both land on the filters' detune in cents
    v.fe = keep(c.createConstantSource()); v.fe.offset.value = 0;
    v.fAmt = keep(c.createGain()); v.fAmt.gain.value = p.fEnv * 7200 * (v.accent ? 1.35 : 1);
    v.fe.connect(v.fAmt); v.fAmt.connect(v.f1.detune); v.fAmt.connect(v.f2.detune);
    v.cutMod.connect(v.f1.detune); v.cutMod.connect(v.f2.detune);
    v.fEnv = mkEnv(t, p.fA * (v.accent ? 0.6 : 1), p.fD * (v.accent ? 0.7 : 1), p.fS, p.fR);
    startEnv(v.fe.offset, v.fEnv);
    v.fe.start(t); v.srcs.push(v.fe);

    v.amp = keep(c.createGain()); v.amp.gain.value = 0;
    v.out = keep(c.createGain()); v.out.gain.value = voiceLevel(v);
    v.f2.connect(v.amp).connect(v.out).connect(N.synthBus);
    v.aEnv = mkEnv(t, p.aA, p.aD, p.aS, p.aR);
    startEnv(v.amp.gain, v.aEnv);

    v.srcs[0].onended = () => dispose(v);
    return v;
  }

  function dispose(v) {
    if (v.dead) return;
    v.dead = true; v.state = 'dead';
    try { N.busPitch.disconnect(v.pitchMod); N.busCut.disconnect(v.cutMod); } catch (e) { /* ok */ }
    for (const g of v.pwGains) { try { N.busPW.disconnect(g); } catch (e) { /* ok */ } }
    for (const n of v.nodes) { try { n.disconnect(); } catch (e) { /* ok */ } }
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
  }

  function release(v, t) {
    if (!v || v.state !== 'on') return;
    t = Math.max(t, v.t0 + 0.004, now());
    v.state = 'rel'; v.relT = t;
    releaseEnv(v.amp.gain, v.aEnv, t);
    releaseEnv(v.fe.offset, v.fEnv, t);
    v.stopT = t + v.aEnv.r * 1.6 + 0.04;
    for (const s of v.srcs) s.stop(v.stopT);
  }

  /** Fast fade-out used for voice stealing, panic and cancelling notes that have not sounded yet. */
  function kill(v, t) {
    if (v.killed || v.dead) return;
    t = Math.max(t, now());
    v.killed = true; v.state = 'rel';
    if (t <= v.t0) { v.amp.gain.cancelScheduledValues(0); v.amp.gain.value = 0; }
    else {
      const val = envAt(v.aEnv, t);
      v.amp.gain.cancelScheduledValues(t);
      v.amp.gain.setValueAtTime(val, t);
      v.amp.gain.linearRampToValueAtTime(0, t + 0.012);
    }
    v.stopT = Math.max(t, v.t0) + 0.03;
    for (const s of v.srcs) s.stop(v.stopT);
  }

  function steal(t) {
    const live = voices.filter((v) => !v.killed && !v.tied);
    if (voices.filter((v) => !v.killed).length < MAX_VOICES || !live.length) return;
    let victim = null;
    for (const v of live) if (v.state === 'rel' && (!victim || v.relT < victim.relT)) victim = v;
    if (!victim) victim = live.reduce((a, b) => (b.t0 < a.t0 ? b : a));
    kill(victim, t);
  }

  function noteOn(midi, vel, t, o) {
    if (!ctx) return null;
    o = o || {};
    t = Math.max(t, now());
    steal(t);
    const v = buildVoice(midi, U.clamp(vel, 0.02, 1), t, o);
    voices.push(v);
    return v;
  }

  /** Legato: glide a held voice to a new pitch without retriggering its envelopes (303-style slide / tie). */
  function slide(v, midi, t, time) {
    if (!v || v.state !== 'on' || v.killed) return;
    t = Math.max(t, now());
    const fOld = U.mtof(v.midi), fNew = U.mtof(midi);
    for (const o of v.oscList) {
      o.param.cancelScheduledValues(t);
      o.param.setValueAtTime(fOld * o.ratio, t);
      o.param.exponentialRampToValueAtTime(fNew * o.ratio, t + time);
      if (o.pulse) {
        o.pulse.dl.delayTime.cancelScheduledValues(t);
        o.pulse.dl.delayTime.setValueAtTime(o.pulse.pw / (fOld * o.ratio), t);
        o.pulse.dl.delayTime.linearRampToValueAtTime(o.pulse.pw / (fNew * o.ratio), t + time);
      }
    }
    const k = P.fKey;
    if (k > 0) {
      const a = U.clamp(P.fCut * Math.pow(2, (k * (v.midi - 60)) / 12), 20, 20000);
      const b = U.clamp(P.fCut * Math.pow(2, (k * (midi - 60)) / 12), 20, 20000);
      for (const f of [v.f1, v.f2]) {
        f.frequency.cancelScheduledValues(t);
        f.frequency.setValueAtTime(a, t);
        f.frequency.exponentialRampToValueAtTime(b, t + time);
      }
    }
    v.midi = midi;
    lastFreq = fNew;
  }

  function releaseKey(key, t, src) {
    for (const v of voices) if (v.state === 'on' && v.key === key && (!src || v.src === src)) release(v, t);
  }
  function releaseSrc(src, t) {
    for (const v of voices) if (v.state === 'on' && v.src === src) release(v, t);
  }
  /** Stop every note that has not started sounding yet (used when the sequencer stops mid look-ahead). */
  function cancelFuture(src) {
    const t = now();
    for (const v of voices.slice()) if (v.src === src && v.t0 > t + 0.002 && !v.killed) kill(v, v.t0);
  }
  function panic() {
    const t = now();
    for (const v of voices.slice()) kill(v, t);
  }
  /** Safety net: dispose voices whose oscillators should be long gone (onended can be missed on suspended contexts). */
  function sweep() {
    const t = now();
    for (const v of voices.slice()) if (v.state === 'rel' && t > v.stopT + 0.3) dispose(v);
  }

  /* =====================================================================
   * Drum voices
   * ===================================================================== */
  function duck(t, vel) {
    const amt = P.pump;
    if (amt < 0.01) return;
    const g = N.duck.gain, lo = 1 - amt * 0.85 * (0.5 + 0.5 * vel);
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(lo, t + 0.01);
    g.setTargetAtTime(1, t + 0.012, 0.085);
  }

  function kick(t, vel, lvl, tune, dec) {
    const f0 = 49 * Math.pow(2, tune / 12), D = 0.42 * dec, end = t + D * 1.9 + 0.06;
    const o = osc('sine', f0 * 3.7, t, end);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.18, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.24);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * lvl * 0.95, t + 0.0025);
    g.gain.setTargetAtTime(0, t + 0.0025, D / 4.6);
    o.connect(g).connect(N.kickShp);
    const n = noiseSrc(t, t + 0.03), hp = biquad('highpass', 2200), cg = gain(0);
    cg.gain.setValueAtTime(vel * lvl * 0.2, t);
    cg.gain.setTargetAtTime(0, t, 0.0035);
    n.connect(hp).connect(cg).connect(N.drumBus);
    cleanupOnEnd(o, [o, g, n, hp, cg]);
    duck(t, vel);
  }

  function snare(t, vel, lvl, tune, dec) {
    const k = Math.pow(2, tune / 12), end = t + 0.65 * dec + 0.1, nodes = [];
    let last;
    [[190, 'triangle', 0.5, 0.055], [332, 'sine', 0.3, 0.04]].forEach(([f, type, amp, tau]) => {
      const o = osc(type, f * k * 1.35, t, end);
      o.frequency.exponentialRampToValueAtTime(f * k, t + 0.028);
      const g = gain(0);
      g.gain.setValueAtTime(vel * lvl * amp, t);
      g.gain.setTargetAtTime(0, t, tau * dec);
      o.connect(g).connect(N.drumBus);
      nodes.push(o, g); last = o;
    });
    const n = noiseSrc(t, end), hp = biquad('highpass', 1300 * Math.sqrt(k)), bp = biquad('peaking', 4200, 0.8);
    bp.gain.value = 5;
    const ng = gain(0);
    ng.gain.setValueAtTime(vel * lvl * 0.62, t);
    ng.gain.setTargetAtTime(0, t, 0.062 * dec);
    n.connect(hp).connect(bp).connect(ng).connect(N.drumBus);
    const s = noiseSrc(t, end), sh = biquad('highpass', 3200), sg = gain(0);
    sg.gain.setValueAtTime(vel * lvl * 0.45, t);
    sg.gain.setTargetAtTime(0, t, 0.008);
    s.connect(sh).connect(sg).connect(N.drumBus);
    nodes.push(n, hp, bp, ng, s, sh, sg);
    cleanupOnEnd(last, nodes);
  }

  function hat(t, vel, lvl, tune, dec, open) {
    const k = Math.pow(2, tune / 12), D = (open ? 0.3 : 0.05) * dec, end = t + D * 2.4 + 0.05;
    const sum = gain(0.17), bp = biquad('bandpass', 9800 * k, 0.9), hp = biquad('highpass', 7000);
    const env = gain(0), nodes = [sum, bp, hp, env];
    let last;
    [205.3, 304.4, 369.6, 522.7, 540, 800].forEach((f) => {
      const o = osc('square', f * k, t, end);
      o.connect(sum); nodes.push(o); last = o;
    });
    const n = noiseSrc(t, end), nh = biquad('highpass', 8500), ng = gain(0.22);
    n.connect(nh).connect(ng).connect(env);
    sum.connect(bp).connect(hp).connect(env);
    env.gain.setValueAtTime(vel * lvl * 1.2, t);
    env.gain.setTargetAtTime(0, t + 0.001, D / 4.2);
    env.connect(N.drumBus);
    nodes.push(n, nh, ng);
    cleanupOnEnd(last, nodes);
    if (open) lastOpen = { g: env, end };
    else if (lastOpen && lastOpen.end > t) lastOpen.g.gain.setTargetAtTime(0, t, 0.005);   // closed hat chokes the open hat
  }

  function clap(t, vel, lvl, tune, dec) {
    const k = Math.pow(2, tune / 12), tail = 0.05 * dec, end = t + 0.04 + tail * 7 + 0.05;
    const n = noiseSrc(t, end), bp = biquad('bandpass', 1250 * k, 1.2), hp = biquad('highpass', 550), g = gain(0);
    const pk = vel * lvl * 1.0;
    [0, 0.0105, 0.022].forEach((o) => {
      g.gain.setValueAtTime(0, t + o);
      g.gain.linearRampToValueAtTime(pk * 0.7, t + o + 0.0012);
      g.gain.setTargetAtTime(0, t + o + 0.0012, 0.0032);
    });
    g.gain.setValueAtTime(0, t + 0.034);
    g.gain.linearRampToValueAtTime(pk, t + 0.0355);
    g.gain.setTargetAtTime(0, t + 0.0355, tail);
    n.connect(bp).connect(hp).connect(g).connect(N.drumBus);
    cleanupOnEnd(n, [n, bp, hp, g]);
  }

  function tomRim(t, vel, lvl, tune, dec, rim) {
    const k = Math.pow(2, tune / 12), nodes = [];
    if (!rim) {
      const f = 138 * k, D = 0.3 * dec, end = t + D * 2 + 0.05;
      const o = osc('sine', f * 1.9, t, end), o2 = osc('triangle', f * 1.5, t, end);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
      o2.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.06);
      const g = gain(0), g2 = gain(0);
      g.gain.setValueAtTime(vel * lvl * 0.9, t); g.gain.setTargetAtTime(0, t, D / 4.2);
      g2.gain.setValueAtTime(vel * lvl * 0.22, t); g2.gain.setTargetAtTime(0, t, D / 7);
      o.connect(g).connect(N.drumBus); o2.connect(g2).connect(N.drumBus);
      const n = noiseSrc(t, t + 0.05), bp = biquad('bandpass', 1500, 1), ng = gain(0);
      ng.gain.setValueAtTime(vel * lvl * 0.16, t); ng.gain.setTargetAtTime(0, t, 0.006);
      n.connect(bp).connect(ng).connect(N.drumBus);
      nodes.push(o, o2, g, g2, n, bp, ng);
      cleanupOnEnd(o, nodes);
    } else {
      const D = 0.045 * dec, end = t + D * 6 + 0.05;
      const a = osc('triangle', 1720 * k, t, end), b = osc('square', 470 * k, t, end);
      const bp = biquad('bandpass', 2300 * k, 3.5), g = gain(0);
      g.gain.setValueAtTime(vel * lvl * 0.85, t); g.gain.setTargetAtTime(0, t, D / 3.2);
      a.connect(bp); b.connect(bp); bp.connect(g).connect(N.drumBus);
      const n = noiseSrc(t, t + 0.02), hp = biquad('highpass', 3000), ng = gain(0);
      ng.gain.setValueAtTime(vel * lvl * 0.25, t); ng.gain.setTargetAtTime(0, t, 0.003);
      n.connect(hp).connect(ng).connect(N.drumBus);
      nodes.push(a, b, bp, g, n, hp, ng);
      cleanupOnEnd(a, nodes);
    }
  }

  function drum(id, t, vel) {
    if (!ctx) return;
    t = Math.max(t, now());
    const lvl = P[id + '_level'], tune = P[id + '_tune'], dec = P[id + '_decay'];
    switch (id) {
      case 'kick': kick(t, vel, lvl, tune, dec); break;
      case 'snare': snare(t, vel, lvl, tune, dec); break;
      case 'chat': hat(t, vel, lvl, tune, dec, false); break;
      case 'ohat': hat(t, vel, lvl, tune, dec, true); break;
      case 'clap': clap(t, vel, lvl, tune, dec); break;
      case 'tom': tomRim(t, vel, lvl, tune, dec, P.tomMode === 1); break;
    }
  }

  /* ---------- wheels ---------- */
  function setBend(x) {   // x in -1..1
    if (ctx) N.bend.offset.setTargetAtTime(x * P.bendRange * 100, now(), 0.012);
  }
  function setMod(x) {
    modWheel = U.clamp(x, 0, 1);
    if (ctx) applyLfos();
  }

  R.Engine = {
    init, noteOn, release, slide, kill, releaseKey, releaseSrc, cancelFuture, panic, sweep, drum,
    setBend, setMod, applyAll,
    get ctx() { return ctx; },
    get nodes() { return N; },
    get voices() { return voices; },
    activeVoices: () => voices.filter((v) => !v.dead).length,
    MAX_VOICES,
  };
})();
