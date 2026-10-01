/* RESONANCE - seq.js
 * Pattern data model, the look-ahead step sequencer ("a tale of two clocks": a setTimeout loop
 * schedules events slightly ahead on the sample-accurate AudioContext clock), the arpeggiator,
 * live-play/latch logic, and the musical helpers (scale snapping, chord stacks, Euclid, randomise).
 */
(function () {
  'use strict';
  const R = window.R, P = R.P, U = R.util, E = R.Engine;
  const MAXSTEPS = 32;
  const DR = R.DRUMS.map((d) => d.id);
  const TRACKS = ['mel'].concat(DR);

  /* ---------- data model ---------- */
  const newMel = () => ({ on: 0, note: 0, vel: 0.8, gate: 0.6, slide: 0, accent: 0, prob: 1, ratchet: 1 });
  const newDrum = () => ({ on: 0, vel: 0.8, prob: 1, ratchet: 1 });
  function newPattern() {
    const p = { mel: [], drums: {} };
    for (let i = 0; i < MAXSTEPS; i++) p.mel.push(newMel());
    for (const id of DR) { p.drums[id] = []; for (let i = 0; i < MAXSTEPS; i++) p.drums[id].push(newDrum()); }
    return p;
  }
  const song = { pats: [0, 1, 2, 3].map(newPattern), cur: 0, mute: {} };
  TRACKS.forEach((t) => (song.mute[t] = 0));
  R.song = song;
  R.TRACKS = TRACKS;

  const steps = () => R.STEPS[P.steps];
  const stepDur = () => 60 / P.bpm / 4;
  const r2 = (x) => Math.round(x * 100) / 100;

  /* ---------- scale helpers ---------- */
  const scaleIV = () => R.SCALES[P.scale].iv;
  /** Nearest in-scale note to semitone offset n (ties resolve downward). */
  function snap(n) {
    const oct = Math.floor(n / 12), pc = n - oct * 12;
    let best = 0, bd = 99;
    for (const s of scaleIV().concat([12])) {
      const d = Math.abs(s - pc);
      if (d < bd) { bd = d; best = s; }
    }
    return oct * 12 + best;
  }
  const notePitch = (step) => (P.lock ? snap(step.note) : step.note);
  const midiOf = (n) => 48 + P.root + 12 * P.seqOct + n;

  /** Semitone offsets stacked above a step note for the chord option, chosen to stay in the current scale. */
  function chordOffsets(n) {
    if (!P.chord) return [0];
    const iv = scaleIV(), rel = ((n % 12) + 12) % 12;
    const has = (d) => iv.indexOf((rel + d) % 12) >= 0;
    const pick = (list) => { for (const d of list) if (has(d)) return d; return list[0]; };
    const third = pick([3, 4]), fifth = pick([7, 6, 8]);
    switch (P.chord) {
      case 1: return [0, fifth];
      case 2: return [0, third, fifth];
      case 3: return [0, third, fifth, pick([10, 11, 9])];
      case 4: return [0, pick([2, 1, 3]), fifth];
      case 5: return [0, pick([5, 4, 6]), fifth];
      default: return [0, 12];
    }
  }

  /* ---------- sequencer transport ---------- */
  const Seq = { playing: false, patIdx: 0, stepIdx: 0, nextTime: 0, t0: 0, chainPos: 0, queued: null, tied: null, nextRoll: null };

  function upcomingPattern() {
    const ch = R.CHAINS[P.chain].seq;
    if (Seq.queued != null) return Seq.queued;
    if (ch) return ch[(Seq.chainPos + 1) % ch.length];
    return Seq.patIdx;
  }
  function nextPattern() {
    const ch = R.CHAINS[P.chain].seq;
    const prev = Seq.patIdx;
    if (Seq.queued != null) {
      Seq.patIdx = Seq.queued; Seq.queued = null;
      if (ch) Seq.chainPos = Math.max(0, ch.indexOf(Seq.patIdx));
    } else if (ch) {
      Seq.chainPos = (Seq.chainPos + 1) % ch.length;
      Seq.patIdx = ch[Seq.chainPos];
    }
    return prev !== Seq.patIdx;
  }
  function peek(pi, si) {
    return si + 1 < steps() ? { pat: pi, step: si + 1 } : { pat: upcomingPattern(), step: 0 };
  }

  Seq.start = function (t) {
    const ctx = E.ctx;
    if (!ctx || Seq.playing) return;
    const ch = R.CHAINS[P.chain].seq;
    Seq.chainPos = 0;
    Seq.patIdx = ch ? ch[0] : song.cur;
    song.cur = Seq.patIdx;
    Seq.stepIdx = 0;
    Seq.nextTime = Seq.t0 = t != null ? t : ctx.currentTime + 0.06;
    Seq.queued = null; Seq.tied = null; Seq.nextRoll = null;
    Seq.playing = true;
    R.emit('transport', true);
    R.emit('pattern', song.cur);
  };
  Seq.stop = function () {
    if (!Seq.playing) return;
    Seq.playing = false;
    const ctx = E.ctx;
    if (Seq.tied) { Seq.tied.tied = false; E.release(Seq.tied, ctx.currentTime); Seq.tied = null; }
    E.cancelFuture('seq');
    R.emit('transport', false);
  };
  Seq.toggle = () => (Seq.playing ? Seq.stop() : Seq.start());
  /** Select pattern 0-3. While playing it is queued to begin at the next bar line. */
  Seq.select = function (i) {
    song.cur = i;
    if (Seq.playing) Seq.queued = i;
    R.emit('pattern', i);
  };

  Seq.advanceTo = function (horizon) {
    if (!Seq.playing) return;
    let guard = 0;
    while (Seq.nextTime < horizon && guard++ < 512) {
      scheduleStep(Seq.patIdx, Seq.stepIdx, Seq.nextTime);
      Seq.stepIdx++;
      Seq.nextTime += stepDur();
      if (Seq.stepIdx >= steps()) {
        Seq.stepIdx = 0;
        if (nextPattern()) { song.cur = Seq.patIdx; R.emit('patternAt', Seq.nextTime, Seq.patIdx); }
      }
    }
  };

  function scheduleStep(pi, si, tBase) {
    const dur = stepDur();
    const t = tBase + (si % 2 === 1 ? P.swing * 0.5 * dur : 0);
    const pat = song.pats[pi];
    R.emit('step', t, pi, si);

    for (const id of DR) {
      const s = pat.drums[id][si];
      if (!s.on || song.mute[id] || Math.random() > s.prob) continue;
      const n = s.ratchet;
      for (let k = 0; k < n; k++) E.drum(id, t + (k * dur) / n, s.vel * (k ? 0.75 : 1));
    }
    scheduleMelody(pat.mel[si], pi, si, t, dur);
  }

  function scheduleMelody(m, pi, si, t, dur) {
    // The probability roll for a step is drawn one step early so a slide/tie into it can be decided in advance.
    const rollOf = (p, s, prob) => {
      const r = Seq.nextRoll && Seq.nextRoll.pat === p && Seq.nextRoll.step === s ? Seq.nextRoll.r : Math.random();
      return r < prob;
    };
    const plays = m.on && !song.mute.mel && rollOf(pi, si, m.prob);
    const nx = peek(pi, si), nm = song.pats[nx.pat].mel[nx.step];
    Seq.nextRoll = { pat: nx.pat, step: nx.step, r: Math.random() };
    const tieIn = Seq.tied;
    const dropTie = () => { if (Seq.tied) { Seq.tied.tied = false; E.release(Seq.tied, t); Seq.tied = null; } };

    if (!plays) { dropTie(); return; }
    const pitch = notePitch(m), midi = midiOf(pitch);
    const vel = m.accent ? Math.min(1, m.vel * 1.1 + 0.2) : m.vel;
    const single = !P.chord && m.ratchet < 2;
    const gate = Math.max(0.03, m.gate * dur);

    // hold the note through to the next step when that step is a playing slide (decided now, no guessing later)
    const nextSlides = single && nm.on && nm.slide && nm.ratchet < 2 && !song.mute.mel && Seq.nextRoll.r < nm.prob;

    let voice = null;
    if (tieIn && m.slide && single) {
      voice = tieIn;
      E.slide(voice, midi, t, Math.min(0.09, dur * 0.7));
    } else {
      dropTie();
      const offs = chordOffsets(pitch);
      const n = single ? 1 : Math.max(1, m.ratchet);
      for (let k = 0; k < n; k++) {
        const tk = t + (k * dur) / n, g = n > 1 ? (gate / n) * 0.85 : gate;
        for (const off of offs) {
          const v = E.noteOn(midi + off, vel * (k ? 0.82 : 1), tk, { src: 'seq', key: 'seq', accent: !!m.accent });
          if (!v) continue;
          if (single) voice = v; else E.release(v, tk + g);
        }
      }
    }
    if (single && voice) {
      if (nextSlides) { voice.tied = true; Seq.tied = voice; }
      else { voice.tied = false; Seq.tied = null; E.release(voice, t + gate); }
    }
  }

  /* ---------- pattern tools ---------- */
  const cur = () => song.pats[song.cur];

  function euclid(hits, len, rot) {
    const out = new Array(len).fill(0);
    if (hits <= 0) return out;
    for (let i = 0; i < len; i++) if ((i * hits) % len < hits) out[(i + rot) % len] = 1;
    return out;
  }
  function applyEuclid(track, hits, rot) {
    const pat = cur(), len = steps(), bits = euclid(Math.min(hits, len), len, rot);
    const arr = track === 'mel' ? pat.mel : pat.drums[track];
    for (let i = 0; i < MAXSTEPS; i++) {
      if (i >= len) continue;
      arr[i].on = bits[i];
      if (track === 'mel' && bits[i] && arr[i].note === 0 && i % 4 === 2) arr[i].note = scaleIV()[Math.min(4, scaleIV().length - 1)];
    }
    R.emit('patternEdit');
  }

  function clearPattern(i) { song.pats[i] = newPattern(); R.emit('patternEdit'); }
  function copyPattern(from, to) {
    song.pats[to] = JSON.parse(JSON.stringify(song.pats[from]));
    R.emit('patternEdit');
  }

  const pickW = (r, list) => { let x = r * list.reduce((a, b) => a + b[1], 0); for (const [v, w] of list) { if ((x -= w) < 0) return v; } return list[0][0]; };

  /** Scale-aware melody: a short motif built by weighted random walk, repeated with variation and a cadence. */
  function randomMelody() {
    const pat = cur(), len = steps(), iv = scaleIV();
    const tones = [];
    for (let o = 0; o < 3; o++) for (const s of iv) if (s + 12 * o <= 24) tones.push(s + 12 * o);
    const ol = iv.length, rnd = Math.random;
    const motifLen = rnd() < 0.5 ? 4 : 8, density = 0.5 + rnd() * 0.35;
    let idx = [0, 0, 2, Math.min(4, ol - 1)][Math.floor(rnd() * 4)] + (rnd() < 0.4 ? ol : 0);
    const motif = [];
    for (let i = 0; i < motifLen; i++) {
      const strong = i % 4 === 0, semi = i % 2 === 0;
      if (i === 0 || rnd() < (strong ? 0.92 : semi ? density : density * 0.6)) {
        const pull = idx > ol * 1.6 ? -1 : idx < 1 ? 1 : 0;
        idx += pickW(rnd(), [[0, 14], [1, 26], [-1, 26], [2, 12], [-2, 10], [3, 5], [-3, 4], [ol, 2], [-ol, 1]]) + pull;
        idx = U.clamp(idx, 0, tones.length - 1);
        motif.push(idx);
      } else motif.push(-1);
    }
    for (let s = 0; s < MAXSTEPS; s++) Object.assign(pat.mel[s], newMel());
    for (let s = 0; s < len; s++) {
      let k = motif[s % motifLen];
      if (s >= len - 4 && rnd() < 0.5 && k >= 0) k = U.clamp(k + (rnd() < 0.5 ? -1 : 1), 0, tones.length - 1);
      if (k < 0) continue;
      const m = pat.mel[s], prev = pat.mel[s - 1];
      m.on = 1; m.note = tones[k];
      m.vel = r2(0.62 + rnd() * 0.33);
      m.gate = [0.3, 0.5, 0.75, 0.95][Math.floor(rnd() * 4)];
      m.accent = s % 4 === 0 && rnd() < 0.35 ? 1 : 0;
      m.slide = prev && prev.on && rnd() < 0.14 ? 1 : 0;
      m.ratchet = s % 2 === 1 && rnd() < 0.08 ? 2 : 1;
    }
    pat.mel[0].on = 1; pat.mel[0].note = 0;
    R.emit('patternEdit');
  }

  function randomDrums() {
    const pat = cur(), len = steps(), rnd = Math.random;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const tile = (s) => { let o = s.replace(/[\s|]/g, ''); while (o.length < len) o += o; return o.slice(0, len); };
    const sets = {
      kick: ['X...x...x...x...', 'X..x..x...x.x...', 'X.....x.x..x..x.', 'X...x..x..x.x...', 'X.x...x.X...x..x'],
      snare: ['....X.......X...', '....X.......X..o', '....X..o....X...', '....X.o.....X..x'],
      chat: ['..x...x...x...x.', 'x.x.x.x.x.x.x.x.', 'xoxoxoxoxoxoxoxo', 'x.ox.ox.ox.ox.o.', 'xxoxxxoxxxoxxxox'],
      ohat: ['......x.......x.', '..............x.', '....o.....o...x.', '................'],
      clap: ['....x.......x...', '................', '....o.......x...'],
      tom: ['................', '..............xx', '............x.x.', '.............o.x'],
    };
    for (const id of DR) {
      const str = tile(pick(sets[id]));
      parseDrum(pat, id, str);
    }
    R.emit('patternEdit');
  }

  /* ---------- compact pattern notation (used by presets) ---------- */
  function parseMel(pat, str) {
    const toks = str.trim().split(/\s+/);
    for (let i = 0; i < MAXSTEPS; i++) Object.assign(pat.mel[i], newMel());
    toks.forEach((tk, i) => {
      if (i >= MAXSTEPS || tk === '.') return;
      const m = /^(-?\d+)(.*)$/.exec(tk);
      if (!m) return;
      const s = pat.mel[i];
      s.on = 1; s.note = +m[1];
      const re = /([aslLq])|r(\d)|p(\d+)|v(\d)|g(\d+(?:\.\d+)?)/g;
      let x;
      while ((x = re.exec(m[2]))) {
        if (x[1] === 'a') s.accent = 1;
        else if (x[1] === 's') s.slide = 1;
        else if (x[1] === 'l') s.gate = 0.95;
        else if (x[1] === 'L') s.gate = 1.6;
        else if (x[1] === 'q') s.gate = 0.28;
        else if (x[2]) s.ratchet = +x[2];
        else if (x[3]) s.prob = +x[3] / 100;
        else if (x[4]) s.vel = +x[4] / 9;
        else if (x[5]) s.gate = Math.min(8, +x[5]);
      }
    });
  }
  function parseDrum(pat, id, str) {
    const arr = pat.drums[id];
    for (let i = 0; i < MAXSTEPS; i++) Object.assign(arr[i], newDrum());
    const toks = str.replace(/[\s|]/g, '').match(/[xXo.\-][234]?\??/g) || [];
    toks.forEach((tk, i) => {
      if (i >= MAXSTEPS) return;
      const c = tk[0];
      if (c === '.' || c === '-') return;
      const s = arr[i];
      s.on = 1;
      s.vel = c === 'X' ? 1 : c === 'o' ? 0.42 : 0.78;
      const r = /[234]/.exec(tk);
      if (r) s.ratchet = +r[0];
      if (tk.endsWith('?')) s.prob = 0.5;
    });
  }

  /* ---------- (de)serialisation of all four patterns ---------- */
  function serializePat(p) {
    return {
      m: p.mel.map((s) => [s.on, s.note, r2(s.vel), r2(s.gate), s.slide, s.accent, r2(s.prob), s.ratchet]),
      d: DR.map((id) => p.drums[id].map((s) => [s.on, r2(s.vel), r2(s.prob), s.ratchet])),
    };
  }
  function serialize() {
    return { cur: song.cur, mute: Object.assign({}, song.mute), pats: song.pats.map(serializePat) };
  }
  function deserialize(o) {
    if (!o || !Array.isArray(o.pats)) return;
    o.pats.slice(0, 4).forEach((sp, pi) => {
      const p = newPattern();
      (sp.m || []).slice(0, MAXSTEPS).forEach((a, i) => {
        const s = p.mel[i];
        s.on = a[0] | 0; s.note = a[1] | 0; s.vel = +a[2]; s.gate = +a[3]; s.slide = a[4] | 0; s.accent = a[5] | 0; s.prob = +a[6]; s.ratchet = a[7] | 0 || 1;
      });
      (sp.d || []).forEach((arr, di) => {
        if (!DR[di]) return;
        arr.slice(0, MAXSTEPS).forEach((a, i) => {
          const s = p.drums[DR[di]][i];
          s.on = a[0] | 0; s.vel = +a[1]; s.prob = +a[2]; s.ratchet = a[3] | 0 || 1;
        });
      });
      song.pats[pi] = p;
    });
    song.cur = U.clamp(o.cur | 0, 0, 3);
    TRACKS.forEach((t) => (song.mute[t] = o.mute && o.mute[t] ? 1 : 0));
  }

  R.Seq = {
    get playing() { return Seq.playing; },
    get t0() { return Seq.t0; },
    get state() { return Seq; },
    start: Seq.start, stop: Seq.stop, toggle: Seq.toggle, select: Seq.select, advanceTo: Seq.advanceTo,
    snap, notePitch, midiOf, chordOffsets, euclid, applyEuclid, clearPattern, copyPattern,
    randomMelody, randomDrums, parseMel, parseDrum, newPattern, serialize, serializePat, deserialize,
    stepDur, steps,
  };

  /* =====================================================================
   * Arpeggiator - shares the transport tempo and, when the sequencer runs, its grid
   * ===================================================================== */
  const Arp = { held: [], pos: 0, active: false, next: 0 };

  Arp.add = (midi, vel) => { if (!Arp.held.some((h) => h.midi === midi)) Arp.held.push({ midi, vel }); };
  Arp.remove = (midi) => { Arp.held = Arp.held.filter((h) => h.midi !== midi); };
  Arp.clear = () => { Arp.held = []; Arp.active = false; };

  function arpList() {
    const base = Arp.held.map((h) => h.midi).sort((a, b) => a - b), out = [];
    for (let o = 0; o < P.arpOct; o++) for (const m of base) out.push(m + 12 * o);
    return out;
  }
  Arp.pump = function (horizon) {
    const ctx = E.ctx;
    if (!ctx || !P.arpOn || !Arp.held.length) { Arp.active = false; return; }
    const dur = (R.ARP_DIVS[P.arpRate].b * 60) / P.bpm;
    if (!Arp.active) {
      Arp.active = true; Arp.pos = 0;
      const n = ctx.currentTime + 0.005;
      Arp.next = Seq.playing ? Seq.t0 + Math.max(0, Math.ceil((n - Seq.t0) / dur - 1e-6)) * dur : n;
    }
    let guard = 0;
    while (Arp.next < horizon && guard++ < 64) { fire(Arp.next, dur); Arp.next += dur; }
  };
  function fire(t, dur) {
    const list = arpList(), L = list.length;
    if (!L) return;
    const vel = Arp.held.reduce((a, h) => a + h.vel, 0) / Arp.held.length * (Arp.pos % 4 === 0 ? 1 : 0.85);
    let notes;
    switch (P.arpMode) {
      case 0: notes = [list[Arp.pos % L]]; break;
      case 1: notes = [list[L - 1 - (Arp.pos % L)]]; break;
      case 2: { const cyc = L > 1 ? 2 * L - 2 : 1, i = Arp.pos % cyc; notes = [list[i < L ? i : cyc - i]]; break; }
      case 3: notes = [list[Math.floor(Math.random() * L)]]; break;
      default: notes = Arp.held.map((h) => h.midi + 12 * (Arp.pos % P.arpOct)); break;
    }
    Arp.pos++;
    for (const m of notes) {
      const v = E.noteOn(m, vel, t, { src: 'arp', key: 'arp' });
      if (v) E.release(v, t + dur * P.arpGate);
      R.emit('arpNote', t, m, dur * P.arpGate);
    }
  }
  R.Arp = Arp;

  /* =====================================================================
   * Live play: on-screen keys, computer keyboard, latch
   * ===================================================================== */
  const Play = { physical: new Set(), latched: new Set() };

  Play.down = function (midi, vel) {
    if (!E.ctx) return;
    if (P.hold && Play.physical.size === 0 && Play.latched.size) Play.clearLatched();
    Play.physical.add(midi);
    if (P.hold) Play.latched.add(midi);
    sound(midi, vel);
    R.emit('keyState');
  };
  Play.up = function (midi) {
    Play.physical.delete(midi);
    if (!(P.hold && Play.latched.has(midi))) silence(midi);
    R.emit('keyState');
  };
  function sound(midi, vel) {
    if (P.arpOn) Arp.add(midi, vel);
    else E.noteOn(midi, vel, E.ctx.currentTime, { src: 'kbd', key: midi });
  }
  function silence(midi) {
    Arp.remove(midi);
    E.releaseKey(midi, E.ctx.currentTime, 'kbd');
  }
  Play.clearLatched = function () {
    for (const m of Array.from(Play.latched)) if (!Play.physical.has(m)) silence(m);
    Play.latched.clear();
    R.emit('keyState');
  };
  Play.isDown = (m) => Play.physical.has(m) || Play.latched.has(m);
  Play.releaseAll = function () {
    for (const m of new Set([...Play.physical, ...Play.latched])) silence(m);
    Play.physical.clear(); Play.latched.clear();
    Arp.clear();
    R.emit('keyState');
  };
  Play.panic = function () {
    Play.releaseAll();
    E.panic();
  };
  // Switching hold / arp while notes are down re-routes them rather than leaving them stuck.
  R.on('param', (id) => {
    if (!E.ctx) return;
    if (id === 'hold' && !P.hold) Play.clearLatched();
    if (id === 'arpOn') {
      const down = new Set([...Play.physical, ...Play.latched]);
      const t = E.ctx.currentTime;
      if (P.arpOn) { for (const m of down) { E.releaseKey(m, t, 'kbd'); Arp.add(m, 0.8); } }
      else { const held = Arp.held.map((h) => h.midi); Arp.clear(); E.releaseSrc('arp', t); for (const m of held) if (down.has(m)) E.noteOn(m, 0.8, t, { src: 'kbd', key: m }); }
    }
  });
  R.Play = Play;

  /* =====================================================================
   * Clock: the setTimeout half of the two-clock pattern
   * ===================================================================== */
  const Clock = { timer: 0, running: false };
  function tick() {
    const ctx = E.ctx;
    if (!ctx || !Clock.running) return;
    const hidden = document.hidden;
    const horizon = ctx.currentTime + (hidden ? 1.5 : 0.14);
    Seq.advanceTo(horizon);
    Arp.pump(horizon);
    E.sweep();
    Clock.timer = setTimeout(tick, hidden ? 250 : 25);
  }
  Clock.start = () => { if (!Clock.running) { Clock.running = true; tick(); } };
  Clock.stop = () => { Clock.running = false; clearTimeout(Clock.timer); };
  R.Clock = Clock;
})();
