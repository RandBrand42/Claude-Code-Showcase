/* RESONANCE - styles.js
 * "Restyle": turn the song that is loaded into another genre while keeping what makes it that song.
 *
 * What is preserved: the notes and their order, the key and scale, the A-D pattern structure and chain.
 * What changes: tempo and swing, the whole patch and effects chain, chord stacking, how long and how hard
 * the notes are played, and a drum arrangement written for the genre (a groove, a variation, a breakdown
 * and a fill, assigned to the four pattern slots by how busy each one was).
 *
 * A style is plain data (see STYLES). Styles are always derived from a saved copy of the song as it was
 * when you first picked a style, never from the previous style, so "Original" is an exact undo.
 *
 * Drum notation reuses the preset notation: x normal, X accent, o ghost, "." rest, trailing 2-4 ratchets,
 * "?" makes a hit 50% likely. Every lane is written for one 16-step bar and is cut to fit other lengths.
 */
(function () {
  'use strict';
  const R = window.R, P = R.P, U = R.util;
  const LANES = R.DRUMS.map((d) => d.id);

  /* ---------- helpers ---------- */
  const tokens = (s) => (s || '').replace(/[\s|]/g, '').match(/[xXo.\-][234]?\??/g) || [];
  const bar16 = (s) => { const t = tokens(s); while (t.length < 16) t.push('.'); return t.slice(0, 16); };
  /** deterministic 0..1 noise, so "humanising" a song is repeatable */
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263 + 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  /* parameters a restyle keeps from the song instead of from the style */
  const KEEP = ['scale', 'root', 'lock', 'steps', 'chain', 'vol', 'hold', 'arpOn', 'arpMode', 'arpOct', 'arpRate', 'arpGate', 'bendRange'];

  /* =====================================================================================
   *  THE STYLES
   *  bpm: null keeps the song's own tempo.   mel: how the existing notes are played.
   *  drums: null = no drum kit (orchestral / ambient).   theme: panel skin suggested with it.
   * ===================================================================================== */
  const STYLES = [
    { id: 'piano', name: 'Piano', tag: 'CLASSICAL', desc: 'Felt-hammer piano in a warm hall. Notes ring and breathe.', theme: 'piano',
      bpm: null, swing: 0, chord: 0, octave: 0, trim: 4, drums: null,
      mel: { vel: 1, gateScale: 1.15, gateMin: 0.5, gateMax: 8, slide: false, human: 0.06 },
      params: { o1wave: 1, o1level: 0.78, o2wave: 0, o2oct: 1, o2level: 0.22, o2fine: 3, fType: 1, fCut: 4200, fRes: 0.05, fEnv: 0.55, fKey: 0.85, fA: 0.002, fD: 0.7, fS: 0.1, fR: 0.5,
        aA: 0.002, aD: 1.5, aS: 0.12, aR: 0.55, rvDecay: 2.8, rvSize: 0.72, rvDamp: 0.6, rvPre: 14, rvMix: 0.28, comp: 0.25 } },

    { id: 'strings', name: 'Orchestral Strings', tag: 'ORCHESTRA', desc: 'A wide string section: slow bows, long phrases, a big hall.', theme: 'hall',
      bpm: null, swing: 0, chord: 0, octave: 0, trim: 8, drums: null,
      mel: { vel: 0.95, gateScale: 1.3, gateMin: 1.2, gateMax: 8, slide: true, human: 0.05 },
      params: { o1wave: 2, o1level: 0.5, o2wave: 2, o2level: 0.46, o2fine: 8, uniVoices: 4, uniDetune: 17, uniSpread: 0.9, fType: 0, fCut: 2300, fRes: 0.08, fEnv: 0.15, fKey: 0.6,
        fA: 0.3, fD: 0.8, fS: 0.8, fR: 0.9, aA: 0.22, aD: 0.6, aS: 0.88, aR: 1.1, chMix: 0.4, chRate: 0.4, chDepth: 0.6, rvDecay: 4.0, rvSize: 0.88, rvDamp: 0.5, rvPre: 26, rvMix: 0.38, comp: 0.3 } },

    { id: 'baroque', name: 'Harpsichord', tag: 'BAROQUE', desc: 'Plucked, bright and dry, like a Baroque salon.', theme: 'hall',
      bpm: null, swing: 0, chord: 0, octave: 0, trim: 8, drums: null,
      mel: { vel: 0.92, gateScale: 0.55, gateMin: 0.35, gateMax: 3, slide: false, human: 0.05 },
      params: { o1wave: 4, o1pw: 0.34, o1level: 0.68, o2wave: 2, o2oct: 1, o2level: 0.26, o2fine: -5, fType: 1, fCut: 6800, fRes: 0.1, fEnv: 0.45, fKey: 0.8,
        fA: 0.001, fD: 0.14, fS: 0, fR: 0.15, aA: 0.001, aD: 0.4, aS: 0, aR: 0.18, rvDecay: 1.7, rvSize: 0.5, rvDamp: 0.5, rvMix: 0.18, comp: 0.3 } },

    { id: 'jazz', name: 'Jazz Combo', tag: 'JAZZ', desc: 'Swung electric piano, seventh chords and a brushed ride groove.', theme: 'jazz',
      bpm: 128, swing: 0.62, chord: 3, octave: 0, trim: 1,
      mel: { vel: 0.9, gateScale: 0.8, gateMin: 0.4, gateMax: 4, slide: false, human: 0.09 },
      params: { o1wave: 1, o1level: 0.62, o2wave: 0, o2oct: 1, o2level: 0.26, o2fine: 4, uniVoices: 1, fType: 1, fCut: 3000, fRes: 0.08, fEnv: 0.3, fKey: 0.7, fA: 0.004, fD: 0.5, fS: 0.2, fR: 0.4,
        aA: 0.004, aD: 0.9, aS: 0.28, aR: 0.45, chMix: 0.45, chRate: 0.6, chDepth: 0.4, dlTime: 2, dlFb: 0.25, dlMix: 0.12, rvDecay: 2.2, rvSize: 0.6, rvMix: 0.22, comp: 0.35,
        drumLevel: 0.55, kick_level: 0.4, snare_level: 0.4, chat_level: 0.5, clap_level: 0, kick_decay: 0.7 },
      drums: { groove: { kick: 'x.......o.......', snare: '......o.......o.', chat: 'x...x.x.x...x.x.' }, groove2: { kick: 'x.....o.x.....o.', snare: '......o.....o.o.', chat: 'x...x.x.x...x.x.' },
        brk: ['chat'], fillTail: { snare: 'ooxx', tom: '..xx' } } },

    { id: 'blues', name: 'Blues Shuffle', tag: 'BLUES', desc: 'A slow shuffle with crunchy guitar and the blues scale.', theme: 'amp',
      bpm: 96, swing: 0.66, chord: 1, octave: 0, trim: -3, scale: 9,
      mel: { vel: 1, gateScale: 0.9, gateMin: 0.45, gateMax: 4, slide: true, human: 0.08 },
      params: { o1wave: 2, o1level: 0.62, o2wave: 4, o2pw: 0.4, o2level: 0.36, o2fine: 6, uniVoices: 2, uniDetune: 10, fType: 1, fCut: 2600, fRes: 0.24, fDrive: 0.3, fEnv: 0.3, fKey: 0.6,
        fA: 0.003, fD: 0.4, fS: 0.35, fR: 0.2, aA: 0.003, aD: 0.5, aS: 0.5, aR: 0.25, fxDrive: 0.4, fxDriveMix: 0.75, dlTime: 3, dlFb: 0.2, dlMix: 0.12, rvDecay: 1.5, rvSize: 0.45, rvMix: 0.16, comp: 0.4,
        drumLevel: 0.7, kick_level: 0.8, snare_level: 0.7, chat_level: 0.45 },
      drums: { groove: { kick: 'X.......x.......', snare: '....X.......X...', chat: 'x.x.x.x.x.x.x.x.' }, groove2: { kick: 'X.....x.X.......', snare: '....X.......X..o', chat: 'x.x.x.x.x.x.x.x.' },
        brk: ['chat', 'kick'], fillTail: { snare: 'xxxx', tom: 'x.x.' } } },

    { id: 'rock', name: 'Rock', tag: 'ROCK', desc: 'Driving drums, power chords and an overdriven lead.', theme: 'amp',
      bpm: 124, swing: 0, chord: 1, octave: 0, trim: -2,
      mel: { vel: 1.05, gateScale: 0.85, gateMin: 0.4, gateMax: 6, slide: false, human: 0.06 },
      params: { o1wave: 2, o1level: 0.62, o2wave: 2, o2level: 0.5, o2fine: 9, subLevel: 0.2, uniVoices: 3, uniDetune: 15, uniSpread: 0.7, fType: 0, fCut: 3800, fRes: 0.14, fDrive: 0.4, fEnv: 0.25, fKey: 0.6,
        fA: 0.003, fD: 0.3, fS: 0.6, fR: 0.2, aA: 0.003, aD: 0.3, aS: 0.75, aR: 0.2, fxDrive: 0.55, fxDriveMix: 0.85, dlMix: 0.1, rvDecay: 1.4, rvSize: 0.5, rvMix: 0.16, comp: 0.55, pump: 0.1,
        drumLevel: 0.85, kick_level: 0.95, snare_level: 0.85, chat_level: 0.5, ohat_level: 0.55, tom_level: 0.8, snare_decay: 1.2 },
      drums: { groove: { kick: 'X.......x.x.....', snare: '....X.......X...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' }, groove2: { kick: 'X.x.....x.x...x.', snare: '....X.......X...', chat: 'x.x.x.x.x.x.x.x.', ohat: 'X.............x.' },
        brk: ['chat', 'kick'], fillTail: { snare: 'x.xx', tom: 'xxxx', kick: 'x...' } } },

    { id: 'reggae', name: 'Reggae One-Drop', tag: 'REGGAE', desc: 'Laid-back one-drop beat, deep sub bass and dub echoes.', theme: 'jazz',
      bpm: 76, swing: 0.25, chord: 2, octave: 0, trim: 3,
      mel: { vel: 0.95, gateScale: 0.38, gateMin: 0.3, gateMax: 1.4, slide: false, human: 0.06 },
      params: { o1wave: 3, o1pw: 0.5, o1level: 0.5, o2wave: 2, o2oct: -1, o2level: 0.4, subLevel: 0.5, uniVoices: 1, fType: 1, fCut: 2000, fRes: 0.2, fEnv: 0.3, fKey: 0.5, fA: 0.002, fD: 0.15, fS: 0.2, fR: 0.12,
        aA: 0.002, aD: 0.14, aS: 0.2, aR: 0.12, chMix: 0.1, dlTime: 4, dlFb: 0.55, dlTone: 2400, dlMix: 0.36, rvDecay: 2.4, rvSize: 0.6, rvMix: 0.3, comp: 0.5,
        drumLevel: 0.75, tomMode: 1, tom_level: 0.85, kick_level: 0.9, chat_level: 0.4, ohat_level: 0.45 },
      drums: { groove: { kick: '........X.......', tom: '........x.......', chat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.' }, groove2: { kick: '........X.......', tom: '........x.....o.', chat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.' },
        brk: ['chat', 'ohat'], fillTail: { tom: 'xxxx', kick: 'x...' } } },

    { id: 'funk', name: 'Funk', tag: 'FUNK', desc: 'Tight, syncopated and punchy, with a clavinet-style bite.', theme: 'kit',
      bpm: 104, swing: 0.18, chord: 0, octave: 0, trim: 0,
      mel: { vel: 1.05, gateScale: 0.4, gateMin: 0.3, gateMax: 1.2, slide: false, human: 0.1 },
      params: { o1wave: 4, o1pw: 0.28, o1level: 0.62, o2wave: 2, o2oct: 1, o2level: 0.2, subLevel: 0.4, uniVoices: 1, fType: 1, fCut: 2300, fRes: 0.34, fEnv: 0.6, fKey: 0.7, fA: 0.001, fD: 0.12, fS: 0.1, fR: 0.1,
        aA: 0.001, aD: 0.18, aS: 0.1, aR: 0.1, fxDrive: 0.18, chMix: 0.12, rvDecay: 1.2, rvSize: 0.4, rvMix: 0.1, comp: 0.5, pump: 0.1,
        drumLevel: 0.8, kick_level: 0.9, snare_level: 0.8, chat_level: 0.5, ohat_level: 0.45 },
      drums: { groove: { kick: 'X..x...x..x.....', snare: '....X..o.o..X..o', chat: 'xoxxxoxxxoxxxoxx', ohat: '......x.......x.' }, groove2: { kick: 'X..x..x...x..x..', snare: '....X..o.o..X.oo', chat: 'xoxxxoxxxoxxxoxx', ohat: '......x.......x.' },
        brk: ['chat'], fillTail: { snare: 'xxxx', kick: 'x.x.' } } },

    { id: 'hiphop', name: 'Lo-fi Hip-Hop', tag: 'HIP-HOP', desc: 'Dusty boom-bap drums under tape-warped keys.', theme: 'kit',
      bpm: 86, swing: 0.34, chord: 0, octave: 0, trim: 0,
      mel: { vel: 0.85, gateScale: 0.95, gateMin: 0.5, gateMax: 5, slide: false, human: 0.12 },
      params: { o1wave: 1, o1level: 0.66, o2wave: 0, o2oct: 1, o2level: 0.22, o2fine: 11, subLevel: 0.3, uniVoices: 1, fType: 1, fCut: 1700, fRes: 0.1, fEnv: 0.2, fKey: 0.5, fA: 0.004, fD: 0.5, fS: 0.3, fR: 0.4,
        aA: 0.005, aD: 0.7, aS: 0.35, aR: 0.5, chMix: 0.55, chRate: 0.35, chDepth: 0.85, dlTime: 2, dlFb: 0.35, dlTone: 2200, dlMix: 0.18, rvDecay: 2.6, rvSize: 0.6, rvDamp: 0.8, rvMix: 0.24, comp: 0.5,
        drumLevel: 0.85, kick_level: 0.95, snare_level: 0.75, chat_level: 0.38, clap_level: 0.4, snare_decay: 1.1 },
      drums: { groove: { kick: 'X.....o.x.x.....', snare: '....X.......X...', chat: 'x.x.x.x.x.x.x.xx', clap: '....x.......x...' }, groove2: { kick: 'X.....o.x.x...o.', snare: '....X.......X..o', chat: 'x.xox.x.x.xox.x.', clap: '....x.......x...' },
        brk: ['chat'], fillTail: { snare: 'o.xx', kick: 'x...' } } },

    { id: 'trap', name: 'Trap', tag: 'TRAP', desc: 'Half-time snare, rolling hi-hats and a long 808 sub.', theme: 'synthwave',
      bpm: 140, swing: 0, chord: 0, octave: 0, trim: -3,
      mel: { vel: 0.95, gateScale: 0.7, gateMin: 0.4, gateMax: 4, slide: false, human: 0.05 },
      params: { o1wave: 1, o1level: 0.58, o2wave: 3, o2oct: 1, o2level: 0.18, subLevel: 0.9, subWave: 0, uniVoices: 1, fType: 1, fCut: 3000, fRes: 0.12, fEnv: 0.35, fKey: 0.6, fA: 0.001, fD: 0.15, fS: 0.05, fR: 0.2,
        aA: 0.001, aD: 0.4, aS: 0.05, aR: 0.3, dlTime: 2, dlFb: 0.4, dlMix: 0.22, rvDecay: 2.6, rvSize: 0.7, rvMix: 0.25, comp: 0.55, pump: 0.15,
        drumLevel: 0.9, kick_level: 1, kick_decay: 2.3, kick_tune: -3, snare_level: 0.8, clap_level: 0.6, chat_level: 0.38, ohat_level: 0.4 },
      drums: { groove: { kick: 'X.......x.x...x.', snare: '........X.......', clap: '........x.......', chat: 'x.x.x.x.x.x.x.x.' }, groove2: { kick: 'X.....x...x..x..', snare: '........X.......', clap: '........x.......', chat: 'x.x.x.xxx2x.x.x3' },
        brk: ['chat'], fillTail: { snare: 'xxx3', chat: 'x3x3' } } },

    { id: 'house', name: 'House', tag: 'HOUSE', desc: 'Four on the floor, off-beat hats and pumping supersaws.', theme: 'synthwave',
      bpm: 124, swing: 0.05, chord: 2, octave: 0, trim: -1,
      mel: { vel: 1, gateScale: 0.8, gateMin: 0.4, gateMax: 3, slide: false, human: 0.04 },
      params: { o1wave: 2, o1level: 0.56, o2wave: 2, o2level: 0.54, o2fine: 11, subLevel: 0.25, uniVoices: 5, uniDetune: 24, uniSpread: 0.9, fType: 0, fCut: 4300, fRes: 0.24, fEnv: 0.45, fKey: 0.5,
        fA: 0.004, fD: 0.28, fS: 0.4, fR: 0.2, aA: 0.004, aD: 0.25, aS: 0.55, aR: 0.18, chMix: 0.3, dlTime: 2, dlFb: 0.4, dlMix: 0.26, rvDecay: 2.2, rvSize: 0.6, rvMix: 0.22, comp: 0.55, pump: 0.65,
        drumLevel: 0.85, kick_level: 1, clap_level: 0.7, chat_level: 0.38, ohat_level: 0.5 },
      drums: { groove: { kick: 'X...X...X...X...', clap: '....x.......x...', chat: 'o.o.o.o.o.o.o.o.', ohat: '..x...x...x...x.' }, groove2: { kick: 'X...X...X...X...', clap: '....x.......x..x', chat: 'x.o.x.o.x.o.x.o.', ohat: '..x...x...x...x.' },
        brk: ['chat', 'ohat'], fillTail: { clap: 'xxxx', kick: '....' } } },

    { id: 'techno', name: 'Techno', tag: 'TECHNO', desc: 'Relentless kick, rolling off-beats and a squelchy acid line.', theme: 'synthwave',
      bpm: 132, swing: 0, chord: 0, octave: 0, trim: -1,
      mel: { vel: 1, gateScale: 0.55, gateMin: 0.3, gateMax: 2, slide: true, human: 0.03 },
      params: { o1wave: 2, o1level: 0.7, o2wave: 3, o2oct: -1, o2level: 0.28, subLevel: 0.15, uniVoices: 1, glide: 0.04, fType: 0, fCut: 750, fRes: 0.62, fDrive: 0.4, fEnv: 0.85, fKey: 0.3,
        fA: 0.001, fD: 0.2, fS: 0, fR: 0.12, aA: 0.001, aD: 0.2, aS: 0.6, aR: 0.1, dlTime: 2, dlFb: 0.45, dlTone: 3000, dlMix: 0.3, rvDecay: 1.8, rvSize: 0.55, rvMix: 0.16, comp: 0.6, pump: 0.5,
        drumLevel: 0.9, kick_level: 1, chat_level: 0.4, ohat_level: 0.5, tom_level: 0.6, tomMode: 1 },
      drums: { groove: { kick: 'X...X...X...X...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.', tom: '...x..x....x..x.' }, groove2: { kick: 'X...X...X...X...', chat: 'x.x.x.x.x.xxx.x.', ohat: '..x...x...x...x.', tom: '...x..x....x.xx.' },
        brk: ['chat', 'ohat'], fillTail: { tom: 'xxxx', chat: 'x3x3' } } },

    { id: 'synthwave', name: 'Synthwave', tag: '80s', desc: 'Neon pads, gated-reverb snare and a night-drive pulse.', theme: 'synthwave',
      bpm: 108, swing: 0, chord: 2, octave: 0, trim: -1,
      mel: { vel: 1, gateScale: 1.05, gateMin: 0.6, gateMax: 6, slide: true, human: 0.04 },
      params: { o1wave: 2, o1level: 0.55, o2wave: 2, o2level: 0.5, o2fine: 7, subLevel: 0.3, uniVoices: 4, uniDetune: 20, uniSpread: 0.9, fType: 1, fCut: 2800, fRes: 0.14, fEnv: 0.3, fKey: 0.5,
        fA: 0.01, fD: 0.5, fS: 0.5, fR: 0.5, aA: 0.02, aD: 0.4, aS: 0.8, aR: 0.6, chMix: 0.6, chRate: 0.3, chDepth: 0.8, dlTime: 2, dlFb: 0.4, dlMix: 0.3, rvDecay: 3.2, rvSize: 0.8, rvMix: 0.4, comp: 0.5, pump: 0.2,
        drumLevel: 0.85, drumRev: 0.4, kick_level: 0.9, snare_level: 0.85, snare_decay: 1.5, chat_level: 0.4, tom_level: 0.75 },
      drums: { groove: { kick: 'X.......X.x.....', snare: '....X.......X...', chat: '..x...x...x...x.', ohat: '................' }, groove2: { kick: 'X.....x.X.x.....', snare: '....X.......X...', chat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' },
        brk: ['chat'], fillTail: { tom: 'xxxx', snare: 'x.x.' } } },

    { id: 'ambient', name: 'Ambient', tag: 'AMBIENT', desc: 'Slow, vast and weightless. The tune dissolves into a pad.', theme: 'hall',
      bpm: 64, swing: 0, chord: 1, octave: 0, trim: 5, drums: null,
      mel: { vel: 0.75, gateScale: 2.2, gateMin: 2.5, gateMax: 8, slide: true, human: 0.08 },
      params: { o1wave: 2, o1level: 0.44, o2wave: 0, o2oct: 1, o2level: 0.4, o2fine: 6, uniVoices: 4, uniDetune: 22, uniSpread: 0.9, fType: 0, fCut: 1150, fRes: 0.1, fEnv: 0.2, fKey: 0.5,
        fA: 1.2, fD: 1.6, fS: 0.7, fR: 2.4, aA: 0.9, aD: 1.2, aS: 0.85, aR: 3.5, l2shape: 1, l2rate: 0.15, l2depth: 0.25, l2dest: 1, chMix: 0.55, chRate: 0.3, chDepth: 0.7, dlTime: 0, dlFb: 0.55, dlTone: 2800, dlMix: 0.3,
        rvDecay: 7, rvSize: 0.95, rvDamp: 0.55, rvPre: 40, rvMix: 0.6, comp: 0.3 } },
  ];

  const byId = Object.fromEntries(STYLES.map((s) => [s.id, s]));

  /* =====================================================================================
   *  THE TRANSFORM
   * ===================================================================================== */

  /** drum tokens for one bar: groove / groove2 / brk (breakdown) / fill */
  function drumBar(style, lane, variant, barLen) {
    const d = style.drums;
    let src = variant === 'groove' ? d.groove : (d.groove2 || d.groove);
    if (variant === 'brk' && !(d.brk || ['chat']).includes(lane)) src = null;
    let t = src && src[lane] ? bar16(src[lane]) : bar16('');
    t = t.slice(0, barLen);
    if (variant === 'fill' && d.fillTail && d.fillTail[lane]) {
      const tail = tokens(d.fillTail[lane]);
      t.splice(barLen - tail.length, tail.length, ...tail);
    }
    return t;
  }
  /** which variant plays in bar b of an n-bar pattern */
  function barVariant(variant, b, nBars) {
    if (variant === 'fill') return b === nBars - 1 ? 'fill' : 'groove2';
    if (variant === 'brk') return 'brk';
    if (variant === 'groove') return b === 0 ? 'groove' : 'groove2';
    return 'groove2';
  }

  /** Build the restyled snapshot from a saved song. Pure: it reads R.Seq helpers but changes no live state. */
  function transform(base, style) {
    const bp = base.params, S = R.STEPS[bp.steps];
    const params = Object.assign({}, R.DEFAULTS);
    for (const k of KEEP) if (bp[k] !== undefined) params[k] = bp[k];
    Object.assign(params, style.params);
    params.bpm = style.bpm != null ? style.bpm : bp.bpm;
    params.swing = style.swing != null ? style.swing : bp.swing;
    params.chord = style.chord;
    params.trim = style.trim || 0;
    params.seqOct = U.clamp((bp.seqOct | 0) + (style.octave | 0), -2, 2);
    if (style.scale != null) { params.scale = style.scale; params.lock = 1; }   // a new scale only bends the tune when scale lock is on

    const m = style.mel, srcPats = base.song.pats;
    const energy = srcPats.map((sp) => sp.m.slice(0, S).filter((a) => a[0]).length);
    const maxE = Math.max(1, ...energy);
    const barLen = S % 12 === 0 ? 12 : Math.min(16, S), nBars = Math.max(1, Math.round(S / barLen));

    const pats = srcPats.map((sp, pi) => {
      const pat = R.Seq.newPattern();
      sp.m.forEach((a, s) => {
        const t = pat.mel[s];
        if (!a[0]) return;
        const jitter = (hash(pi, s) - 0.5) * 2 * m.human;
        t.on = 1; t.note = a[1];
        t.vel = U.clamp(a[2] * m.vel * (1 + jitter), 0.15, 1);
        t.gate = U.clamp(a[3] * m.gateScale, m.gateMin, m.gateMax);
        t.slide = m.slide ? a[4] : 0; t.accent = a[5]; t.prob = a[6]; t.ratchet = a[7] || 1;
      });
      if (style.drums) {
        const variant = pi === 3 ? 'fill' : pi === 2 && energy[2] < 0.7 * maxE ? 'brk' : pi === 1 ? 'groove2' : 'groove';
        for (const lane of LANES) {
          let str = '';
          for (let b = 0; b < nBars; b++) str += drumBar(style, lane, barVariant(variant, b, nBars), barLen).join('');
          R.Seq.parseDrum(pat, lane, str);
        }
      }
      return R.Seq.serializePat(pat);
    });
    return { v: 1, name: base.name, params, song: { cur: base.song.cur, mute: Object.assign({}, base.song.mute), pats } };
  }

  /* =====================================================================================
   *  LIVE STATE: baseline, current style
   * ===================================================================================== */
  const Style = { list: STYLES, byId, transform, current: 'original', base: null, applying: false, autoTheme: true };

  /** Apply a style to the loaded song. "original" restores the saved song exactly. */
  Style.apply = function (id) {
    if (id === 'original') return Style.restore();
    const style = byId[id];
    if (!style) return false;
    if (Style.current === 'original' || !Style.base) Style.base = R.Presets.snapshot();
    const snap = transform(Style.base, style);
    Style.applying = true;
    try { R.Presets.loadSnapshot(snap, Style.base.name + ' - ' + style.name); } finally { Style.applying = false; }
    Style.current = id;
    R.emit('style', id);
    if (Style.autoTheme && style.theme && R.Theme) R.Theme.set(style.theme, true);
    return true;
  };
  Style.restore = function () {
    if (Style.current === 'original' || !Style.base) return false;
    const base = Style.base;
    Style.applying = true;
    try { R.Presets.loadSnapshot(JSON.parse(JSON.stringify(base)), base.name); } finally { Style.applying = false; }
    Style.current = 'original';
    R.emit('style', 'original');
    return true;
  };
  // loading any other patch or song starts a new baseline
  R.on('loaded', () => { if (!Style.applying) { Style.current = 'original'; Style.base = null; R.emit('style', 'original'); } });

  R.Style = Style;
})();
