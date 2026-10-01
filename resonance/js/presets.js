/* RESONANCE - presets.js
 * Factory patches (each one ships with matching demo patterns), plus state snapshots, user-patch storage
 * (localStorage, always inside try/catch), JSON import/export and A/B compare.
 *
 * Melody notation: one token per step, "." = rest, otherwise <semitones above root><modifiers>
 *   a accent  s slide  l long  q short  r2..r4 ratchet  p60 probability  v6 velocity  g3 gate in steps
 * Drum notation: x normal, X accent, o ghost, "." rest; a trailing 2-4 ratchets the hit, "?" makes it 50% likely.
 */
(function () {
  'use strict';
  const R = window.R, P = R.P;

  const rep = (s, n) => s.repeat(n);
  /** Build a melody string from chord tones and a shape string of tone indexes ('.' = rest). */
  const arp = (tones, shape, acc) =>
    shape.replace(/\s/g, '').split('').map((c, i) => (c === '.' ? '.' : tones[+c] + ((acc || []).indexOf(i) >= 0 ? 'a' : ''))).join(' ');

  /* ---------- Aurora (the demo loop) : A minor, i - VI - III - VII ---------- */
  const SH = '0.12.13.0.123.21', SH2 = '0.12.13.0.123.23';
  const AURORA_DRUMS = (n) => ({
    kick: rep('X...x...x...x...', 1), chat: rep('xo.o', 4), ohat: rep('..x.', 4),
    clap: n === 0 ? '................' : '....x.......x...',
    snare: n === 3 ? '............o.x3x' : '................',
    tom: n === 3 ? '..........o.....' : '................',
  });

  const DEFS = [
    {
      name: 'Aurora', tag: 'DEMO LOOP', desc: 'Glassy arpeggio pluck, 4-bar loop in A minor',
      params: {
        bpm: 108, swing: 0.1, scale: 0, root: 9, seqOct: 0, chain: 3,
        o1wave: 2, o1level: 0.62, o2wave: 2, o2level: 0.5, o2fine: 7, o2oct: 0,
        subLevel: 0.26, uniVoices: 3, uniDetune: 13, uniSpread: 0.8,
        fType: 0, fCut: 1500, fRes: 0.2, fEnv: 0.46, fKey: 0.45, fA: 0.004, fD: 0.5, fS: 0.14, fR: 0.5,
        aA: 0.005, aD: 0.8, aS: 0.45, aR: 0.55,
        chMix: 0.35, chRate: 0.5, chDepth: 0.55,
        dlTime: 2, dlFb: 0.44, dlTone: 4200, dlMix: 0.3,
        rvDecay: 3.4, rvSize: 0.7, rvDamp: 0.45, rvPre: 22, rvMix: 0.32,
        comp: 0.4, pump: 0.3, drumLevel: 0.7, drumRev: 0.16,
        kick_level: 0.85, chat_level: 0.4, ohat_level: 0.3, clap_level: 0.55, snare_level: 0.6,
      },
      pats: [
        { mel: arp([0, 7, 12, 15], SH, [0, 6, 12]), ...AURORA_DRUMS(0) },
        { mel: arp([8, 12, 15, 20], SH, [0, 6, 12]), ...AURORA_DRUMS(1) },
        { mel: arp([3, 10, 15, 19], SH, [0, 6, 12]), ...AURORA_DRUMS(2) },
        { mel: arp([10, 14, 17, 22], SH2, [0, 6, 12]).replace(/ 22$/, ' 22r2'), ...AURORA_DRUMS(3) },
      ],
    },
    {
      name: 'Glass Pad', tag: 'AMBIENT', desc: 'Wide lydian pad with slow filter drift',
      params: {
        bpm: 68, swing: 0, scale: 4, root: 5, seqOct: 0, chord: 2, chain: 3,
        o1wave: 2, o1level: 0.5, o2wave: 1, o2oct: 1, o2level: 0.45, o2fine: 6,
        uniVoices: 4, uniDetune: 22, uniSpread: 0.9,
        fType: 0, fCut: 1300, fRes: 0.12, fEnv: 0.28, fKey: 0.5, fA: 1.4, fD: 2.0, fS: 0.6, fR: 2.5,
        aA: 1.1, aD: 1.5, aS: 0.85, aR: 3.2,
        l1shape: 0, l1rate: 0.17, l1depth: 0.2, l1dest: 1, l2shape: 1, l2rate: 0.33, l2depth: 0.05, l2dest: 0,
        chMix: 0.5, chRate: 0.35, chDepth: 0.7,
        dlTime: 0, dlFb: 0.5, dlTone: 3000, dlMix: 0.24,
        rvDecay: 6.5, rvSize: 0.9, rvDamp: 0.55, rvPre: 40, rvMix: 0.5,
        comp: 0.3, drumLevel: 0.4, drumRev: 0.4, vol: 0.78,
      },
      pats: [
        { mel: '0g15 . . . . . . . . . . . . . . .', chat: 'o...o...o...o...', kick: 'X...............' },
        { mel: '2g15 . . . . . . . . . . . . . . .', chat: 'o...o...o...o...', kick: 'X.......x.......', tom: '............o...' },
        { mel: '7g15 . . . . . . . . . . . . . . .', chat: 'o...o...o...o...', kick: 'X...............' },
        { mel: '9g15 . . . . . . . . . . . . . . .', chat: 'o.o.o.o.o.o.o.o.', kick: 'X.......x.......', tom: '..............o.' },
      ],
    },
    {
      name: 'Sub Pressure', tag: 'BASS', desc: 'Pumping techno sub with off-beat stabs',
      params: {
        bpm: 126, swing: 0.06, scale: 0, root: 4, seqOct: -1, chain: 4,
        o1wave: 2, o1level: 0.72, o2wave: 3, o2level: 0.32, o2fine: 6, subLevel: 0.7, subWave: 0,
        fType: 0, fCut: 340, fRes: 0.3, fDrive: 0.3, fEnv: 0.58, fKey: 0.3, fA: 0.002, fD: 0.22, fS: 0.1, fR: 0.2,
        aA: 0.003, aD: 0.3, aS: 0.8, aR: 0.14, glide: 0.05,
        fxDrive: 0.22, fxDriveMix: 0.5,
        dlTime: 1, dlFb: 0.3, dlTone: 2500, dlMix: 0.1, rvDecay: 1.1, rvSize: 0.4, rvMix: 0.08,
        comp: 0.55, pump: 0.6, drumLevel: 0.85, tomMode: 1, tom_level: 0.45, tom_tune: 3,
      },
      pats: [
        { mel: '. . 0a 0 . . 0 . . . 0 0 . . 3a 0', kick: 'X...x...x...x...', clap: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.', tom: 'o..x..o...x..o..' },
        { mel: '. . 0a 0 . . 0 . . . 7 7 . . 5a 3', kick: 'X...x...x...x...', clap: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.', tom: 'o..x..o...x..o.x' },
        { mel: '. . 0a 0 . . 0 . . 3 . 3 . . 7a 5', kick: 'X...x...x...x.x.', clap: '....x.......x..x', chat: 'xoxoxoxoxoxoxoxo', ohat: '..x...x...x...x.', tom: 'o..x..o...x..o..' },
        { mel: '. . 0a 0 . . 0 . . . 10 10 . . 7a 5', kick: 'X...x...x...x...', clap: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.', tom: 'o..x..o...x..o..' },
      ],
    },
    {
      name: 'Pluck Theory', tag: 'PLUCK', desc: 'Pulse pluck with moving width, dorian groove',
      params: {
        bpm: 112, swing: 0.16, scale: 2, root: 2, seqOct: 0,
        o1wave: 4, o1pw: 0.32, o1level: 0.7, o2wave: 2, o2oct: 1, o2level: 0.3, o2fine: 5, uniVoices: 2, uniDetune: 10,
        fType: 0, fCut: 800, fRes: 0.25, fEnv: 0.66, fKey: 0.5, fA: 0.001, fD: 0.26, fS: 0, fR: 0.25,
        aA: 0.002, aD: 0.4, aS: 0, aR: 0.3,
        l1shape: 1, l1rate: 0.35, l1depth: 0.3, l1dest: 3,
        chMix: 0.22, dlTime: 1, dlFb: 0.42, dlTone: 5200, dlMix: 0.3,
        rvDecay: 2.2, rvSize: 0.6, rvMix: 0.22, comp: 0.4, pump: 0.12, drumLevel: 0.65,
        chat_level: 0.4, kick_level: 0.8, snare_level: 0.5, tomMode: 1, tom_level: 0.5,
      },
      pats: [
        { mel: '0 . 7 . 10 . 7 . 5 . 3 5 7 . . .', kick: 'X.......x.x.....', snare: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', tom: '..x.......x..x..' },
        { mel: '12 . 10 . 7 . 10 . 9 . 7 5 3 . 5 .', kick: 'X.......x.x...x.', snare: '....x.......x..o', chat: 'x.x.x.xox.x.x.xo', tom: '..x.......x..x..' },
        { mel: '0 . 7 . 10 . 7 . 5 . 3 5 7 . . .', kick: 'X.......x.x.....', snare: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', tom: '..x.......x..x..' },
        { mel: '3 . 5 . 7 . 10 . 12 . 10 . 7 5 3 .', kick: 'X.......x.x...x.', snare: '....x.......x.x2', chat: 'x.x.x.xox.x.x.xo', tom: '..x.......x..x..' },
      ],
    },
    {
      name: 'Neon Arp', tag: 'SYNTHWAVE', desc: 'PWM arpeggio with dotted-eighth echoes',
      params: {
        bpm: 118, swing: 0, scale: 0, root: 0, seqOct: 0, chain: 3,
        o1wave: 4, o1pw: 0.42, o1level: 0.6, o2wave: 2, o2fine: 9, o2level: 0.5, uniVoices: 3, uniDetune: 14,
        fType: 0, fCut: 2400, fRes: 0.3, fEnv: 0.36, fKey: 0.5, fA: 0.003, fD: 0.3, fS: 0.35, fR: 0.3,
        aA: 0.004, aD: 0.32, aS: 0.5, aR: 0.32,
        l2shape: 1, l2rate: 0.6, l2depth: 0.38, l2dest: 3,
        chMix: 0.4, chRate: 0.6, dlTime: 2, dlFb: 0.48, dlTone: 6000, dlMix: 0.38,
        rvDecay: 1.9, rvSize: 0.5, rvMix: 0.2, comp: 0.45, pump: 0.25, drumLevel: 0.75, chat_level: 0.45,
        kick_level: 0.85, snare_level: 0.62, clap_level: 0.5,
      },
      pats: [
        { mel: arp([0, 7, 12, 15], '0123 2101 0123 2123', [0, 8]), kick: 'X...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' },
        { mel: arp([8, 12, 15, 20], '0123 2101 0123 2123', [0, 8]), kick: 'X...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' },
        { mel: arp([3, 10, 15, 19], '0123 2101 0123 2123', [0, 8]), kick: 'X...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' },
        { mel: arp([10, 14, 17, 22], '0123 2101 0123 3212', [0, 8]), kick: 'X...x...x...x.x.', snare: '....x.......x.x3', clap: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' },
      ],
    },
    {
      name: 'Tape Strings', tag: 'STRINGS', desc: 'Warm detuned ensemble with tape saturation',
      params: {
        bpm: 84, swing: 0.2, scale: 1, root: 7, seqOct: 0, chord: 2, chain: 3,
        o1wave: 2, o1level: 0.55, o2wave: 2, o2level: 0.5, o2fine: 11, uniVoices: 4, uniDetune: 17, uniSpread: 0.85,
        fType: 1, fCut: 2100, fRes: 0.05, fEnv: 0.14, fKey: 0.6, fA: 0.5, fD: 1.0, fS: 0.7, fR: 1.0,
        aA: 0.5, aD: 1.2, aS: 0.85, aR: 1.1,
        l1shape: 0, l1rate: 5.2, l1depth: 0.07, l1dest: 0,
        fxDrive: 0.2, fxDriveMix: 0.5, chMix: 0.62, chRate: 0.55, chDepth: 0.65,
        dlTime: 2, dlFb: 0.35, dlMix: 0.1, rvDecay: 3.2, rvSize: 0.75, rvMix: 0.32,
        comp: 0.4, drumLevel: 0.5, tomMode: 1, tom_level: 0.6, chat_level: 0.3, kick_level: 0.7,
      },
      pats: [
        { mel: '0g7 . . . . . . . 5g7 . . . . . . .', kick: 'X.......x.......', tom: '....x.......x...', chat: 'o.o.o.o.o.o.o.o.' },
        { mel: '7g7 . . . . . . . 9g7 . . . . . . .', kick: 'X.......x......x', tom: '....x.......x...', chat: 'o.o.o.o.o.o.o.o.' },
        { mel: '0g7 . . . . . . . 5g7 . . . . . . .', kick: 'X.......x.......', tom: '....x.......x...', chat: 'o.o.o.o.o.o.o.o.' },
        { mel: '7g7 . . . . . . . 9g3 . . . 7g3 . . .', kick: 'X.......x......x', tom: '....x.......x..o', chat: 'o.o.o.o.o.o.o.o.' },
      ],
    },
    {
      name: 'Acid Line', tag: 'ACID', desc: 'Resonant saw, accents and slides',
      params: {
        bpm: 124, swing: 0.08, scale: 0, root: 9, seqOct: -1,
        o1wave: 2, o1level: 0.85, o2level: 0,
        fType: 0, fCut: 470, fRes: 0.74, fDrive: 0.4, fEnv: 0.62, fKey: 0.35, fA: 0.002, fD: 0.22, fS: 0, fR: 0.15,
        aA: 0.002, aD: 0.25, aS: 0.7, aR: 0.09, glide: 0,
        fxDrive: 0.3, fxDriveMix: 0.6, dlTime: 2, dlFb: 0.36, dlMix: 0.2, dlTone: 3800,
        rvDecay: 0.9, rvSize: 0.35, rvMix: 0.1, comp: 0.5, pump: 0.15, drumLevel: 0.8,
        chat_level: 0.42, ohat_level: 0.38, snare_level: 0.5,
      },
      pats: [
        { mel: '0a 0 12 0 . 0 10s 12 . 0a 0 7 . 12s 10 0', kick: 'X...x...x...x...', clap: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.' },
        { mel: '0a 0 12 0 . 0 10s 12 7a . 0 0s 3 . 7s 5a', kick: 'X...x...x...x...', clap: '....x.......x...', chat: 'xoxoxoxoxoxoxoxo', ohat: '..x...x...x...x.' },
        { mel: '0a . 0 12a . 0s 7 . 0a 0 10s 12 . 0 .', kick: 'X...x...x...x.x.', clap: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.' },
        { mel: '0a 0 0 12 . 3s 5 7s 10a . 7 5s 3 . 0 0', kick: 'X...x...x...x...', clap: '....x.......x..2', chat: 'xoxoxoxoxoxoxoxo', ohat: '..x...x...x...x.' },
      ],
    },
    {
      name: 'Velvet Keys', tag: 'KEYS', desc: 'Tremolo electric piano, lazy swing, seventh chords',
      params: {
        bpm: 90, swing: 0.3, scale: 1, root: 0, seqOct: 0, chord: 3,
        o1wave: 0, o1level: 0.7, o2wave: 1, o2oct: 1, o2level: 0.28, o2fine: 4, uniVoices: 1,
        fType: 1, fCut: 3400, fRes: 0.05, fEnv: 0.22, fKey: 0.6, fA: 0.002, fD: 0.5, fS: 0.2, fR: 0.4,
        aA: 0.002, aD: 1.5, aS: 0.22, aR: 0.55,
        l1shape: 0, l1rate: 4.6, l1depth: 0.22, l1dest: 2,
        fxDrive: 0.14, fxDriveMix: 0.4, chMix: 0.5, chRate: 0.45, chDepth: 0.5,
        dlTime: 2, dlFb: 0.3, dlMix: 0.1, rvDecay: 1.6, rvSize: 0.5, rvMix: 0.22,
        comp: 0.35, drumLevel: 0.6, kick_level: 0.75, snare_level: 0.5, chat_level: 0.35, vol: 0.76,
      },
      pats: [
        { mel: '0q . . 0q . . 0q . . . 0q . . 0q . .', kick: 'X.....x..x......', snare: '....x.......x...', chat: 'x.xox.xox.xox.xo' },
        { mel: '9q . . 9q . . 9q . . . 9q . . 9q . .', kick: 'X.....x..x......', snare: '....x.......x...', chat: 'x.xox.xox.xox.xo' },
        { mel: '2q . . 2q . . 2q . . . 2q . . 2q . .', kick: 'X.....x..x.....x', snare: '....x.......x...', chat: 'x.xox.xox.xox.xo' },
        { mel: '7q . . 7q . . 7q . . . 7q . . 7q . 7q', kick: 'X.....x..x......', snare: '....x.......x..x', chat: 'x.xox.xox.xox.xo' },
      ],
    },
    {
      name: 'Hollow Bell', tag: 'MALLET', desc: 'Glassy sine bells drowned in reverb',
      params: {
        bpm: 100, swing: 0, scale: 7, root: 2, seqOct: 1,
        o1wave: 0, o1level: 0.8, o2wave: 0, o2oct: 1, o2semi: 7, o2level: 0.3, o2fine: 3, noise: 0.03,
        fType: 1, fCut: 4800, fRes: 0.05, fEnv: 0.1, fKey: 0.7, fD: 0.6, fS: 0.3,
        aA: 0.001, aD: 2.4, aS: 0, aR: 1.6,
        chMix: 0.25, dlTime: 2, dlFb: 0.5, dlTone: 4500, dlMix: 0.35,
        rvDecay: 5.0, rvSize: 0.85, rvDamp: 0.4, rvPre: 30, rvMix: 0.5,
        comp: 0.3, drumLevel: 0.45, drumRev: 0.35, chat_level: 0.3, kick_level: 0.7, vol: 0.76,
      },
      pats: [
        { mel: '0 . . 7 . . 4 . 9 . . . 7 . 2 .', kick: 'X.......X.......', chat: 'o...o...o...o...' },
        { mel: '12 . . 9 . . 7 . 4 . . . 2 . 4 .', kick: 'X.......X.......', chat: 'o...o...o...o..o' },
        { mel: '0 . 4 . 7 . . . 9 . 7 . 4 . . 2', kick: 'X.......X.....x.', chat: 'o...o...o...o...' },
        { mel: '16 . 14 . 12 . . 9 . 7 . . 4 . 2 0', kick: 'X.......X.......', chat: 'o.o.o.o.o.o.o.o.' },
      ],
    },
    {
      name: 'Wobble Engine', tag: 'BASS', desc: 'Half-time tempo-synced wobble bass',
      params: {
        bpm: 140, swing: 0, scale: 0, root: 5, seqOct: -1,
        o1wave: 2, o1level: 0.72, o2wave: 3, o2oct: -1, o2level: 0.5, o2fine: 4, subLevel: 0.45, uniVoices: 2, uniDetune: 9,
        fType: 0, fCut: 380, fRes: 0.46, fDrive: 0.3, fEnv: 0, fKey: 0.2, fA: 0.002, fD: 0.3, fS: 1, fR: 0.2,
        aA: 0.004, aD: 0.3, aS: 1, aR: 0.12,
        l1shape: 1, l1sync: 1, l1div: 4, l1depth: 0.78, l1dest: 1,
        fxDrive: 0.32, fxDriveMix: 0.6, dlTime: 0, dlFb: 0.3, dlMix: 0.08, rvDecay: 1.2, rvSize: 0.4, rvMix: 0.08,
        comp: 0.6, pump: 0.35, drumLevel: 0.85, snare_tune: -2, snare_decay: 1.3, snare_level: 0.7, clap_level: 0.6,
        chat_level: 0.3, kick_level: 0.9,
      },
      pats: [
        { mel: '0g7 . . . . . . . 0g3 . . . 5g3 . . .', kick: 'X.......x.x.....', snare: '........X.......', clap: '........x.......', chat: 'x.x.x.x.x.x.x.x.' },
        { mel: '0g5 . . . . . 3g2 . 0g3 . . . 7g3 . . .', kick: 'X.......x.x...x.', snare: '........X.......', clap: '........x.......', chat: 'x.xox.xox.xox.xo' },
        { mel: '0g7 . . . . . . . 0g3 . . . 5g3 . . .', kick: 'X.......x.x.....', snare: '........X.......', clap: '........x.......', chat: 'x.x.x.x.x.x.x.x.' },
        { mel: '8g7 . . . . . . . 7g3 . . . 3g3 . 0g1 .', kick: 'X.......x.x...x.', snare: '........X.......x', clap: '........x.......', chat: 'x.xox.xox.xox.xo' },
      ],
    },
    {
      name: 'Sunrise Lead', tag: 'LEAD', desc: 'Gliding PWM lead with gentle vibrato',
      params: {
        bpm: 120, swing: 0.05, scale: 7, root: 9, seqOct: 0,
        o1wave: 4, o1pw: 0.46, o1level: 0.6, o2wave: 2, o2fine: 7, o2level: 0.4, uniVoices: 2, uniDetune: 9,
        glide: 0.11, fType: 1, fCut: 3600, fRes: 0.2, fEnv: 0.3, fKey: 0.6, fA: 0.004, fD: 0.3, fS: 0.5, fR: 0.3,
        aA: 0.01, aD: 0.3, aS: 0.8, aR: 0.3,
        l1shape: 0, l1rate: 5.4, l1depth: 0.08, l1dest: 0, l2shape: 1, l2rate: 0.5, l2depth: 0.3, l2dest: 3,
        chMix: 0.3, dlTime: 2, dlFb: 0.42, dlTone: 5000, dlMix: 0.3, rvDecay: 2.4, rvSize: 0.6, rvMix: 0.26,
        comp: 0.4, pump: 0.2, drumLevel: 0.7, chat_level: 0.4, kick_level: 0.8, snare_level: 0.5, clap_level: 0.5,
      },
      pats: [
        { mel: '0 . 4 . 7 . 9s 7 . 4 . 2 . 4 . .', kick: 'X...x...x...x...', clap: '....x.......x...', chat: '..x...x...x...x.' },
        { mel: '9 . 12 . 14 . 12s 9 . 7 . 9 . 4 . .', kick: 'X...x...x...x...', clap: '....x.......x...', chat: '..x...x...x...x.' },
        { mel: '0 . 4 . 7 . 9s 7 . 4 . 2 . 4 . .', kick: 'X...x...x...x...', clap: '....x.......x...', chat: '..x...x...x...x.' },
        { mel: '14 . 12 . 9 . 7s 9 . 12 . 14s 16 . 12l .', kick: 'X...x...x...x.x.', clap: '....x.......x..2', chat: '..x...x...x...x.' },
      ],
    },
    {
      name: 'Kalimba Rain', tag: 'GENERATIVE', desc: 'Probabilistic thumb-piano in pentatonic',
      params: {
        bpm: 96, swing: 0.12, scale: 7, root: 7, seqOct: 0,
        o1wave: 1, o1level: 0.8, o2wave: 0, o2oct: 2, o2level: 0.22, noise: 0.03, uniVoices: 1,
        fType: 1, fCut: 2800, fRes: 0.08, fEnv: 0.25, fKey: 0.7, fD: 0.3, fS: 0,
        aA: 0.001, aD: 0.55, aS: 0, aR: 0.4,
        chMix: 0.2, dlTime: 2, dlFb: 0.5, dlTone: 4500, dlMix: 0.4, rvDecay: 3.0, rvSize: 0.7, rvMix: 0.35,
        comp: 0.3, drumLevel: 0.5, tomMode: 1, tom_level: 0.5, chat_level: 0.3, kick_level: 0.6, vol: 0.78,
      },
      pats: [
        { mel: '0 . 7p70 . 4 . 9 . 7p60 . 12 . 9p70 . 4r2p60 .', kick: 'X.......x.......', tom: '....x?.....x?...', chat: 'o.o.o.o.o.o.o.o.' },
        { mel: '12 . 9p70 . 7 . 4p70 . 9 . 7 . 4p60 . 2 .', kick: 'X.......x.....x?', tom: '....x?.....x?...', chat: 'o.o.o.o.o.o.o.o.' },
        { mel: '4 . 7 . 9p70 . 12 . 9 . 7p70 . 4r2 . 2p60 .', kick: 'X.......x.......', tom: '....x?..x?..x?..', chat: 'o.o.o.o.o.o.o.o.' },
        { mel: '0 . 2p70 . 4 . 7 . 9 . 12 . 16 . 14p80 .', kick: 'X.......x.......', tom: '....x?..x?..x?x?', chat: 'o.o.o.o.o.o.o.o.' },
      ],
    },
    {
      name: 'Init Saw', tag: 'INIT', desc: 'Clean starting point: one saw, no effects',
      params: { bpm: 110, scale: 0, root: 9, o1wave: 2, o1level: 0.8, fCut: 6000, fEnv: 0.2, rvMix: 0.1 },
      pats: [
        { mel: '0 . . . 3 . . . 7 . . . 5 . . .', kick: 'X...x...x...x...', snare: '....x.......x...', chat: 'x.x.x.x.x.x.x.x.' },
      ],
    },
  ];

  /* ---------- building snapshots from definitions ---------- */
  function buildSnapshot(def) {
    const params = Object.assign({}, R.DEFAULTS, def.params);
    const pats = [];
    for (let i = 0; i < 4; i++) {
      const src = def.pats[i] || def.pats[i % def.pats.length] || {};
      const pat = R.Seq.newPattern();
      if (src.mel) R.Seq.parseMel(pat, src.mel);
      for (const d of R.DRUMS) if (src[d.id]) R.Seq.parseDrum(pat, d.id, src[d.id]);
      pats.push(R.Seq.serializePat(pat));
    }
    const mute = {};
    R.TRACKS.forEach((t) => (mute[t] = 0));
    return { v: 1, name: def.name, params, song: { cur: 0, mute, pats } };
  }

  const factory = DEFS.map((d) => ({ name: d.name, tag: d.tag, desc: d.desc, snap: buildSnapshot(d) }));

  function snapshot(name) {
    const params = {};
    for (const d of R.PARAMS) params[d.id] = P[d.id];
    return { v: 1, name: name || R.Presets.current, params, song: R.Seq.serialize() };
  }
  function loadSnapshot(s, name) {
    if (!s || !s.params) return false;
    for (const d of R.PARAMS) R.setParam(d.id, s.params[d.id] !== undefined ? s.params[d.id] : d.def);
    R.Seq.deserialize(s.song);
    R.Presets.current = name || s.name || 'Untitled';
    R.emit('loaded', R.Presets.current);
    R.emit('pattern', R.song.cur);
    R.emit('patternEdit');
    return true;
  }

  /* ---------- user patches in localStorage ---------- */
  const KEY = 'resonance.v1.patches';
  const Store = {
    all() {
      try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
    },
    write(obj) {
      try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; } catch (e) { return false; }
    },
    save(name) {
      const all = Store.all();
      all[name] = snapshot(name);
      R.Presets.current = name;
      return Store.write(all);
    },
    remove(name) {
      const all = Store.all();
      delete all[name];
      return Store.write(all);
    },
    names() { return Object.keys(Store.all()); },
  };

  /* ---------- A/B compare ---------- */
  const AB = { slots: [null, null], active: 0 };
  AB.toggle = () => {
    AB.slots[AB.active] = snapshot();
    AB.active ^= 1;
    if (!AB.slots[AB.active]) AB.slots[AB.active] = JSON.parse(JSON.stringify(AB.slots[AB.active ^ 1]));
    loadSnapshot(AB.slots[AB.active], AB.slots[AB.active].name);
    R.emit('ab', AB.active);
  };
  AB.copyToOther = () => {
    AB.slots[AB.active ^ 1] = snapshot();
    R.emit('ab', AB.active);
  };
  AB.reset = () => { AB.slots = [null, null]; AB.active = 0; R.emit('ab', 0); };

  /* ---------- JSON export / import ---------- */
  function exportJSON() {
    return JSON.stringify(snapshot(), null, 1);
  }
  function importJSON(text) {
    const s = JSON.parse(text);
    if (!s || typeof s !== 'object' || !s.params || !s.song) throw new Error('Not a RESONANCE patch file');
    return loadSnapshot(s, s.name);
  }

  R.Presets = {
    factory, current: factory[0].name, index: 0, Store, AB, snapshot, loadSnapshot, exportJSON, importJSON,
    loadFactory(i) {
      i = (i + factory.length) % factory.length;
      R.Presets.index = i;
      AB.reset();
      loadSnapshot(JSON.parse(JSON.stringify(factory[i].snap)), factory[i].name);
    },
  };
})();
