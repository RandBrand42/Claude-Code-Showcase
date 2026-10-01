/* RESONANCE - core.js
 * Global namespace, small utilities, tiny event bus and the parameter registry.
 * Every knob / switch on the panel is one entry in R.PARAMS; R.P holds the live values.
 */
(function () {
  'use strict';
  const R = (window.R = window.R || {});

  /* ---------- utilities ---------- */
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  // mulberry32: tiny deterministic PRNG (used for the reverb tail so the room is reproducible)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  R.util = { clamp, lerp, mtof, noteName, NOTE_NAMES, rng };

  /* ---------- event bus ---------- */
  const listeners = Object.create(null);
  R.on = (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn); return fn; };
  R.emit = (ev, a, b, c) => {
    const l = listeners[ev];
    if (l) for (let i = 0; i < l.length; i++) l[i](a, b, c);
  };

  /* ---------- musical tables ---------- */
  R.ROOTS = NOTE_NAMES.slice();
  R.SCALES = [
    { id: 'minor', name: 'MINOR', iv: [0, 2, 3, 5, 7, 8, 10] },
    { id: 'major', name: 'MAJOR', iv: [0, 2, 4, 5, 7, 9, 11] },
    { id: 'dorian', name: 'DORIAN', iv: [0, 2, 3, 5, 7, 9, 10] },
    { id: 'phrygian', name: 'PHRYGIAN', iv: [0, 1, 3, 5, 7, 8, 10] },
    { id: 'lydian', name: 'LYDIAN', iv: [0, 2, 4, 6, 7, 9, 11] },
    { id: 'mixolydian', name: 'MIXOLYDIAN', iv: [0, 2, 4, 5, 7, 9, 10] },
    { id: 'pentmin', name: 'PENT MINOR', iv: [0, 3, 5, 7, 10] },
    { id: 'pentmaj', name: 'PENT MAJOR', iv: [0, 2, 4, 7, 9] },
    { id: 'harmin', name: 'HARM MINOR', iv: [0, 2, 3, 5, 7, 8, 11] },
    { id: 'blues', name: 'BLUES', iv: [0, 3, 5, 6, 7, 10] },
    { id: 'wholetone', name: 'WHOLE TONE', iv: [0, 2, 4, 6, 8, 10] },
    { id: 'chromatic', name: 'CHROMATIC', iv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  ];
  // beats per cycle / per step for tempo-synced things
  R.DELAY_DIVS = [
    { l: '1/4', b: 1 }, { l: '1/8', b: 0.5 }, { l: '1/8.', b: 0.75 }, { l: '1/16', b: 0.25 },
    { l: '1/4.', b: 1.5 }, { l: '1/2', b: 2 }, { l: '1/8T', b: 1 / 3 }, { l: '1/16.', b: 0.375 },
  ];
  R.LFO_DIVS = [
    { l: '2 BAR', b: 8 }, { l: '1 BAR', b: 4 }, { l: '1/2', b: 2 }, { l: '1/4', b: 1 },
    { l: '1/8', b: 0.5 }, { l: '1/16', b: 0.25 }, { l: '1/4T', b: 2 / 3 }, { l: '1/8T', b: 1 / 3 },
  ];
  R.ARP_DIVS = [
    { l: '1/4', b: 1 }, { l: '1/8', b: 0.5 }, { l: '1/8T', b: 1 / 3 },
    { l: '1/16', b: 0.25 }, { l: '1/16T', b: 1 / 6 }, { l: '1/32', b: 0.125 },
  ];
  R.STEPS = [8, 16, 32, 12, 24];   // 12 / 24 are appended (not sorted) so saved patches keep their step-count index
  R.CHORDS = ['OFF', '5TH', 'TRIAD', '7TH', 'SUS2', 'SUS4', 'OCT'];
  R.CHAINS = [
    { n: 'OFF', seq: null }, { n: 'A B', seq: [0, 1] }, { n: 'A B C', seq: [0, 1, 2] },
    { n: 'A B C D', seq: [0, 1, 2, 3] }, { n: 'A A B A', seq: [0, 0, 1, 0] },
    { n: 'A A A B', seq: [0, 0, 0, 1] }, { n: 'A B A C', seq: [0, 1, 0, 2] },
  ];
  R.DRUMS = [
    { id: 'kick', name: 'KICK', short: 'KICK' },
    { id: 'snare', name: 'SNARE', short: 'SNARE' },
    { id: 'chat', name: 'CLOSED HAT', short: 'C.HAT' },
    { id: 'ohat', name: 'OPEN HAT', short: 'O.HAT' },
    { id: 'clap', name: 'CLAP', short: 'CLAP' },
    { id: 'tom', name: 'TOM / RIM', short: 'TOM' },
  ];

  /* ---------- parameter registry ---------- */
  const defs = [];
  const add = (type, id, name, min, max, def, o) => defs.push(Object.assign({ id, name, type, min, max, def, curve: 'lin' }, o));
  const F = (id, name, min, max, def, o) => add('f', id, name, min, max, def, o);
  const I = (id, name, min, max, def, o) => add('i', id, name, min, max, def, o);
  const E = (id, name, labels, def, o) => add('e', id, name, 0, labels.length - 1, def, Object.assign({ labels }, o));
  const B = (id, name, def, o) => add('b', id, name, 0, 1, def, o);

  const WAVES = ['SIN', 'TRI', 'SAW', 'SQR', 'PLS'];
  for (const n of [1, 2]) {
    E('o' + n + 'wave', 'WAVE', WAVES, 2);
    I('o' + n + 'oct', 'OCT', -2, 2, 0, { unit: 'oct' });
    I('o' + n + 'semi', 'SEMI', -12, 12, 0, { unit: 'semi' });
    F('o' + n + 'fine', 'FINE', -50, 50, 0, { unit: 'ct' });
    F('o' + n + 'level', 'LEVEL', 0, 1, n === 1 ? 0.8 : 0, { unit: 'pct' });
    F('o' + n + 'pw', 'PW', 0.05, 0.95, 0.5, { unit: 'pct' });
  }
  F('subLevel', 'SUB', 0, 1, 0, { unit: 'pct' });
  E('subWave', 'SUB WAVE', ['SIN', 'SQR'], 0);
  E('subOct', 'SUB OCT', ['-1', '-2'], 0);
  F('noise', 'NOISE', 0, 1, 0, { unit: 'pct' });
  I('uniVoices', 'VOICES', 1, 7, 1);
  F('uniDetune', 'DETUNE', 0, 100, 18, { unit: 'ct' });
  F('uniSpread', 'SPREAD', 0, 1, 0.7, { unit: 'pct' });
  F('glide', 'GLIDE', 0, 2, 0, { curve: 'sq', unit: 's' });

  E('fType', 'TYPE', ['LP24', 'LP12', 'HP', 'BP', 'NOTCH'], 0);
  F('fCut', 'CUTOFF', 20, 20000, 3200, { curve: 'exp', unit: 'hz' });
  F('fRes', 'RESO', 0, 1, 0.2, { unit: 'pct' });
  F('fDrive', 'DRIVE', 0, 1, 0, { unit: 'pct' });
  F('fKey', 'KEY TRK', 0, 1, 0.35, { unit: 'pct' });
  F('fEnv', 'ENV AMT', -1, 1, 0.3, { unit: 'bip' });
  for (const [p, name, d] of [['f', 'FILTER', [0.005, 0.4, 0.25, 0.4]], ['a', 'AMP', [0.005, 0.35, 0.7, 0.35]]]) {
    F(p + 'A', 'ATTACK', 0.001, 8, d[0], { curve: 'exp', unit: 's', group: name });
    F(p + 'D', 'DECAY', 0.005, 8, d[1], { curve: 'exp', unit: 's', group: name });
    F(p + 'S', 'SUSTAIN', 0, 1, d[2], { unit: 'pct', group: name });
    F(p + 'R', 'RELEASE', 0.005, 10, d[3], { curve: 'exp', unit: 's', group: name });
  }
  for (const n of [1, 2]) {
    E('l' + n + 'shape', 'SHAPE', ['SIN', 'TRI', 'SAW', 'SQR', 'S&H'], 0);
    F('l' + n + 'rate', 'RATE', 0.05, 30, n === 1 ? 5 : 0.4, { curve: 'exp', unit: 'hz' });
    F('l' + n + 'depth', 'DEPTH', 0, 1, 0, { unit: 'pct' });
    E('l' + n + 'dest', 'DEST', ['PITCH', 'CUT', 'AMP', 'PW'], n === 1 ? 0 : 1);
    B('l' + n + 'sync', 'SYNC', 0);
    E('l' + n + 'div', 'DIV', R.LFO_DIVS.map((d) => d.l), 3);
  }
  I('bendRange', 'BEND', 1, 12, 2, { unit: 'semi' });

  B('arpOn', 'ARP', 0);
  E('arpMode', 'MODE', ['UP', 'DOWN', 'U-D', 'RAND', 'CHORD'], 0);
  I('arpOct', 'OCTAVES', 1, 4, 2);
  E('arpRate', 'RATE', R.ARP_DIVS.map((d) => d.l), 3);
  F('arpGate', 'GATE', 0.1, 1, 0.6, { unit: 'pct' });
  B('hold', 'HOLD', 0);

  F('fxDrive', 'DRIVE', 0, 1, 0, { unit: 'pct' });
  F('fxDriveMix', 'MIX', 0, 1, 1, { unit: 'pct' });
  F('chRate', 'RATE', 0.1, 6, 0.7, { curve: 'exp', unit: 'hz' });
  F('chDepth', 'DEPTH', 0, 1, 0.5, { unit: 'pct' });
  F('chMix', 'MIX', 0, 1, 0, { unit: 'pct' });
  E('dlTime', 'TIME', R.DELAY_DIVS.map((d) => d.l), 2);
  F('dlFb', 'FEEDBACK', 0, 0.92, 0.4, { unit: 'pct' });
  F('dlTone', 'TONE', 400, 12000, 4800, { curve: 'exp', unit: 'hz' });
  F('dlMix', 'MIX', 0, 1, 0, { unit: 'pct' });
  F('rvDecay', 'DECAY', 0.3, 8, 2.4, { curve: 'exp', unit: 's' });
  F('rvSize', 'SIZE', 0, 1, 0.6, { unit: 'pct' });
  F('rvDamp', 'DAMP', 0, 1, 0.5, { unit: 'pct' });
  F('rvPre', 'PRE-DLY', 0, 120, 18, { unit: 'ms' });
  F('rvMix', 'MIX', 0, 1, 0.15, { unit: 'pct' });
  F('vol', 'MASTER', 0, 1, 0.8, { unit: 'pct' });
  F('comp', 'GLUE', 0, 1, 0.4, { unit: 'pct' });
  F('pump', 'PUMP', 0, 1, 0, { unit: 'pct' });
  F('trim', 'TRIM', -12, 18, 0, { unit: 'db' });   // loudness makeup before the glue compressor / limiter; used by styles, not shown on the panel

  F('drumLevel', 'DRUMS', 0, 1, 0.85, { unit: 'pct' });
  F('drumRev', 'REV SEND', 0, 1, 0.15, { unit: 'pct' });
  const drumLevels = { kick: 0.95, snare: 0.8, chat: 0.6, ohat: 0.55, clap: 0.75, tom: 0.75 };
  for (const d of R.DRUMS) {
    F(d.id + '_tune', 'TUNE', -12, 12, 0, { unit: 'st', group: d.name });
    F(d.id + '_decay', 'DECAY', 0.4, 2.5, 1, { curve: 'exp', unit: 'x', group: d.name });
    F(d.id + '_level', 'LEVEL', 0, 1.2, drumLevels[d.id], { unit: 'pct', group: d.name });
  }
  E('tomMode', 'MODE', ['TOM', 'RIM'], 0);

  I('bpm', 'TEMPO', 60, 200, 108, { unit: 'bpm' });
  F('swing', 'SWING', 0, 1, 0, { unit: 'pct' });
  E('scale', 'SCALE', R.SCALES.map((s) => s.name), 0);
  E('root', 'ROOT', R.ROOTS, 9);
  B('lock', 'SCALE LOCK', 1);
  I('seqOct', 'OCT', -2, 2, 0, { unit: 'oct' });
  E('chord', 'CHORD', R.CHORDS, 0);
  E('steps', 'STEPS', R.STEPS.map(String), 1);
  E('chain', 'CHAIN', R.CHAINS.map((c) => c.n), 0);

  R.PARAMS = defs;
  R.PDEF = Object.create(null);
  R.DEFAULTS = Object.create(null);
  R.P = Object.create(null);
  for (const d of defs) {
    d.bipolar = d.type === 'f' && d.min < 0 && d.max > 0;
    R.PDEF[d.id] = d;
    R.DEFAULTS[d.id] = d.def;
    R.P[d.id] = d.def;
  }

  /** Clamp / quantise a raw value to what the parameter allows. */
  R.coerce = (d, v) => {
    v = +v;
    if (!isFinite(v)) return d.def;
    if (d.type === 'b') return v ? 1 : 0;
    if (d.type === 'i' || d.type === 'e') return clamp(Math.round(v), d.min, d.max);
    return clamp(v, d.min, d.max);
  };
  /** value -> 0..1 knob position */
  R.toNorm = (d, v) => {
    if (d.max === d.min) return 0;
    if (d.curve === 'exp') return clamp(Math.log(v / d.min) / Math.log(d.max / d.min), 0, 1);
    if (d.curve === 'sq') return clamp(Math.sqrt(Math.max(0, (v - d.min) / (d.max - d.min))), 0, 1);
    return clamp((v - d.min) / (d.max - d.min), 0, 1);
  };
  /** 0..1 knob position -> value */
  R.fromNorm = (d, n) => {
    n = clamp(n, 0, 1);
    let v;
    if (d.curve === 'exp') v = d.min * Math.pow(d.max / d.min, n);
    else if (d.curve === 'sq') v = d.min + (d.max - d.min) * n * n;
    else v = d.min + (d.max - d.min) * n;
    return R.coerce(d, v);
  };

  const fixed = (v, n) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(n));
  /** Human readable value, used by tooltips and the LCD. */
  R.fmt = (d, v) => {
    if (d.type === 'e') return d.labels[v];
    if (d.type === 'b') return v ? 'ON' : 'OFF';
    switch (d.unit) {
      case 'hz': return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : fixed(v, v < 10 ? 2 : 1) + ' Hz';
      case 's': return v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s';
      case 'ms': return Math.round(v) + ' ms';
      case 'ct': return (v > 0 ? '+' : '') + Math.round(v) + ' ct';
      case 'st': return (v > 0 ? '+' : '') + v.toFixed(1) + ' st';
      case 'semi': return (v > 0 ? '+' : '') + v + ' st';
      case 'oct': return (v > 0 ? '+' : '') + v + ' oct';
      case 'pct': return Math.round(v * 100) + ' %';
      case 'bip': return (v > 0 ? '+' : '') + Math.round(v * 100) + ' %';
      case 'bpm': return v + ' BPM';
      case 'x': return v.toFixed(2) + 'x';
      case 'db': return (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
      default: return d.type === 'i' ? String(v) : v.toFixed(2);
    }
  };

  /** Set a parameter; every listener (engine, widgets) hears about it through the bus. */
  R.setParam = (id, v, opt) => {
    const d = R.PDEF[id];
    if (!d) return;
    v = R.coerce(d, v);
    if (R.P[id] === v && !(opt && opt.force)) return;
    R.P[id] = v;
    R.emit('param', id, v, opt);
  };
})();
