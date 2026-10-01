/* RESONANCE - songs.js
 * A small library of public-domain melodies. The compositions are all old enough to be out of copyright
 * (composers' lifetimes and publication dates are listed); what is played is this app's own synthesis of
 * a plain one-voice transcription, not any recording and not any modern arrangement.
 *
 * Each song is written in a readable notation: NOTE+OCTAVE/LENGTH, where LENGTH is in sequencer steps
 * (one step = a sixteenth note: 1 sixteenth, 2 eighth, 4 quarter, 6 dotted quarter, 8 half, 12 dotted half),
 * "r/LENGTH" is a rest and "|" is only there for the reader.  Example: "G4/4 r/2 D5/2".
 * A song is an excerpt (up to 8 bars) laid across the four pattern slots so it loops. Where a tune has an
 * upbeat, it sits at the end of the last pattern so the loop is seamless.
 *
 * Each song records how its transcription was checked:  'score'  = compared note-for-note with a published
 * public-domain score by tests/verify.html;  'memory' = written from memory and NOT independently checked.
 */
(function () {
  'use strict';
  const R = window.R, U = R.util;

  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midiOf = (name) => {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) throw new Error('bad note name: ' + name);
    return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  };
  /** "G4/4 r/2 ..." -> [{ midi | null, d }] */
  function parse(text) {
    return text.replace(/\|/g, ' ').trim().split(/\s+/).map((tok) => {
      const m = /^(r|[A-G][#b]?-?\d)\/(\d+)$/.exec(tok);
      if (!m) throw new Error('bad token: ' + tok);
      return { midi: m[1] === 'r' ? null : midiOf(m[1]), d: +m[2] };
    });
  }

  /* =====================================================================================
   *  THE LIBRARY
   *  S = steps per pattern (16 = one 4/4 bar, 32 = two 4/4 bars, 24 = two 3/4 bars or four 3/8 bars)
   *  root = key's tonic pitch class (0 = C ... 11 = B), seqOct places the sequencer's octave,
   *  scale = index into R.SCALES, patch = id of a style whose sound the song starts with.
   * ===================================================================================== */
  const SONGS = [
    /* ---------------- classical ---------------- */
    { id: 'ode', title: 'Ode to Joy', composer: 'Ludwig van Beethoven', year: 1824, category: 'Classical', meter: '4/4', note: 'Opening 8 bars',
      bpm: 108, root: 7, scale: 1, seqOct: 1, S: 32, chain: 3, patch: 'piano', verified: 'score',
      text: 'B4/4 B4/4 C5/4 D5/4 | D5/4 C5/4 B4/4 A4/4 | G4/4 G4/4 A4/4 B4/4 | B4/6 A4/2 A4/8 | B4/4 B4/4 C5/4 D5/4 | D5/4 C5/4 B4/4 A4/4 | G4/4 G4/4 A4/4 B4/4 | A4/6 G4/2 G4/8' },

    { id: 'canon', title: 'Canon in D', composer: 'Johann Pachelbel', year: 1680, category: 'Classical', meter: '4/4', note: 'First violin line, 8 bars',
      bpm: 60, root: 2, scale: 1, seqOct: 1, S: 32, chain: 3, patch: 'strings', verified: 'score',
      text: 'F#5/4 E5/4 D5/4 C#5/4 | B4/4 A4/4 B4/4 C#5/4 | D5/4 C#5/4 B4/4 A4/4 | G4/4 F#4/4 G4/4 E4/4 | D4/2 F#4/2 A4/2 G4/2 F#4/2 D4/2 F#4/2 E4/2 | D4/2 B3/2 D4/2 A4/2 G4/2 B4/2 A4/2 G4/2 | F#4/2 D4/2 E4/2 C#5/2 D5/2 F#5/2 A5/2 A4/2 | B4/2 G4/2 A4/2 F#4/2 D4/2 D5/2 D5/3 C#5/1' },

    { id: 'elise', title: 'Für Elise', composer: 'Ludwig van Beethoven', year: 1810, category: 'Classical', meter: '3/8', note: 'Main theme, 8 bars',
      bpm: 70, root: 9, scale: 8, seqOct: 0, S: 24, chain: 1, patch: 'piano', verified: 'score', lock: 0,
      text: 'E5/1 D#5/1 E5/1 B4/1 D5/1 C5/1 | A4/2 r/1 C4/1 E4/1 A4/1 | B4/2 r/1 E4/1 G#4/1 B4/1 | C5/2 r/1 E4/1 E5/1 D#5/1 | E5/1 D#5/1 E5/1 B4/1 D5/1 C5/1 | A4/2 r/1 C4/1 E4/1 A4/1 | B4/2 r/1 E4/1 C5/1 B4/1 | A4/2 r/2 E5/1 D#5/1' },

    { id: 'kleine', title: 'Eine kleine Nachtmusik', composer: 'Wolfgang Amadeus Mozart', year: 1787, category: 'Classical', meter: '4/4', note: 'First theme, 4 bars',
      bpm: 140, root: 7, scale: 1, seqOct: 1, S: 16, chain: 3, patch: 'strings', verified: 'score',
      text: 'G5/4 r/2 D5/2 G5/4 r/2 D5/2 | G5/2 D5/2 G5/2 B5/2 D6/4 r/4 | C6/4 r/2 A5/2 C6/4 r/2 A5/2 | C6/2 A5/2 F#5/2 A5/2 D5/4 r/4' },

    { id: 'mountain', title: 'In the Hall of the Mountain King', composer: 'Edvard Grieg', year: 1875, category: 'Classical', meter: '4/4', note: 'The creeping theme, 8 bars',
      bpm: 120, root: 11, scale: 0, seqOct: 0, S: 32, chain: 3, patch: 'baroque', verified: 'score', lock: 0,
      text: 'B3/2 C#4/2 D4/2 E4/2 F#4/2 D4/2 F#4/4 | F4/2 C#4/2 F4/4 E4/2 C4/2 E4/4 | B3/2 C#4/2 D4/2 E4/2 F#4/2 D4/2 F#4/2 B4/2 | A4/2 F#4/2 D4/2 F#4/2 A4/4 r/4 | F#4/2 G#4/2 A#4/2 B4/2 C#5/2 A#4/2 C#5/4 | D5/2 A#4/2 D5/4 C#5/2 A#4/2 C#5/4 | F#4/2 G#4/2 A#4/2 B4/2 C#5/2 A#4/2 C#5/4 | D5/2 A#4/2 D5/4 C#5/4 r/4' },

    { id: 'gymnopedie', title: 'Gymnopédie No. 1', composer: 'Erik Satie', year: 1888, category: 'Classical', meter: '3/4', note: 'The melody, 4 bars',
      bpm: 66, root: 2, scale: 1, seqOct: 1, S: 24, chain: 1, patch: 'piano', verified: 'score',
      text: 'r/4 F#5/4 A5/4 | G5/4 F#5/4 C#5/4 | B4/4 C#5/4 D5/4 | A4/12' },

    { id: 'minuet', title: 'Minuet in G', composer: 'Christian Petzold', year: 1725, category: 'Classical', meter: '3/4', note: 'First strain, 8 bars',
      bpm: 120, root: 7, scale: 1, seqOct: 1, S: 24, chain: 3, patch: 'baroque', verified: 'memory',
      text: 'D5/4 G4/2 A4/2 B4/2 C5/2 | D5/4 G4/4 G4/4 | E5/4 C5/2 D5/2 E5/2 F#5/2 | G5/4 G4/4 G4/4 | C5/4 D5/2 C5/2 B4/2 A4/2 | B4/4 C5/2 B4/2 A4/2 G4/2 | F#4/4 G4/2 A4/2 B4/2 G4/2 | B4/4 A4/8' },

    /* ---------------- folk & traditional ---------------- */
    { id: 'auldlangsyne', title: 'Auld Lang Syne', composer: 'Traditional (words by Robert Burns)', year: 1788, category: 'Folk & traditional', meter: '4/4', note: 'First half of the tune, 8 bars',
      bpm: 88, root: 5, scale: 1, seqOct: 1, S: 32, chain: 3, patch: 'piano', verified: 'score',
      text: 'F4/6 F4/2 F4/4 A4/4 | G4/6 F4/2 G4/4 A4/4 | F4/6 F4/2 A4/4 C5/4 | D5/12 D5/4 | C5/6 A4/2 A4/4 F4/4 | G4/6 F4/2 G4/4 A4/4 | F4/6 D4/2 D4/4 C4/4 | F4/12 C4/4' },

    { id: 'grace', title: 'Amazing Grace', composer: 'John Newton, to the traditional tune New Britain', year: 1779, category: 'Folk & traditional', meter: '3/4', note: 'First and last lines',
      bpm: 66, root: 7, scale: 1, seqOct: 1, S: 24, chain: 3, patch: 'strings', verified: 'score',
      text: 'G4/8 B4/2 G4/2 | B4/8 A4/4 | G4/8 E4/4 | D4/8 D4/4 | G4/8 B4/2 G4/2 | B4/8 A4/4 | G4/12 | r/8 D4/4' },

    { id: 'scarborough', title: 'Scarborough Fair', composer: 'Traditional English ballad', year: 1891, category: 'Folk & traditional', meter: '3/4', note: 'First 8 bars (the commonly sung D-Dorian tune)',
      bpm: 76, root: 2, scale: 2, seqOct: 1, S: 24, chain: 3, patch: 'piano', verified: 'score',
      text: 'D4/8 D4/4 | A4/2 A4/6 A4/4 | E4/6 F4/2 E4/4 | D4/12 | r/4 A4/4 C5/4 | D5/8 C5/4 | A4/4 B4/4 G4/4 | A4/8 D5/4' },

    { id: 'greensleeves', title: 'Greensleeves', composer: 'Traditional English', year: 1580, category: 'Folk & traditional', meter: '3/4', note: 'First verse tune, 8 bars',
      bpm: 96, root: 9, scale: 8, seqOct: 0, S: 24, chain: 3, patch: 'baroque', verified: 'memory', lock: 0,
      text: 'C5/8 D5/4 | E5/6 F5/2 E5/4 | D5/8 B4/4 | G4/6 A4/2 B4/4 | C5/8 A4/4 | A4/6 G#4/2 A4/4 | B4/8 G#4/4 | E4/8 A4/4' },

    /* ---------------- seasonal ---------------- */
    { id: 'jingle', title: 'Jingle Bells', composer: 'James Lord Pierpont', year: 1857, category: 'Seasonal', meter: '4/4', note: 'The chorus, 8 bars',
      bpm: 120, root: 0, scale: 1, seqOct: 1, S: 32, chain: 3, patch: 'piano', verified: 'memory',
      text: 'E4/4 E4/4 E4/8 | E4/4 E4/4 E4/8 | E4/4 G4/4 C4/6 D4/2 | E4/16 | F4/4 F4/4 F4/6 F4/2 | F4/4 E4/4 E4/4 E4/2 E4/2 | E4/4 D4/4 D4/4 E4/4 | D4/8 G4/8' },
  ];
  const byId = Object.fromEntries(SONGS.map((s) => [s.id, s]));

  /* =====================================================================================
   *  COMPILE: notation -> events -> sequencer pattern strings
   * ===================================================================================== */
  function compile(song) {
    const events = parse(song.text);
    const total = events.reduce((n, e) => n + e.d, 0);
    const base = 48 + song.root + 12 * song.seqOct;       // sequencer's MIDI note for offset 0
    const barLen = song.meter === '3/4' ? 12 : song.meter === '3/8' ? 6 : 16;
    const toks = new Array(total).fill('.');
    let pos = 0;
    for (const e of events) {
      if (e.midi != null) {
        const gate = Math.max(0.5, e.d * (e.d >= 4 ? 0.92 : 0.85));
        toks[pos] = (e.midi - base) + 'g' + (+gate.toFixed(2)) + (pos % barLen === 0 ? 'v8' : 'v7');
      }
      pos += e.d;
    }
    const pats = [];
    for (let k = 0; k < 4; k++) pats.push(toks.slice(k * song.S, (k + 1) * song.S).join(' ') || '.');
    return { events, total, base, patterns: pats };
  }

  /** a full snapshot (patch + four patterns) for a song, ready for R.Presets.loadSnapshot */
  function buildSnapshot(song) {
    const c = compile(song), patch = R.Style.byId[song.patch || 'piano'];
    const params = Object.assign({}, R.DEFAULTS, patch.params, {
      trim: patch.trim || 0, bpm: song.bpm, swing: 0, chord: 0, scale: song.scale, root: song.root, seqOct: song.seqOct,
      steps: R.STEPS.indexOf(song.S), chain: song.chain, lock: song.lock != null ? song.lock : 0,
    });
    const pats = c.patterns.map((mel) => {
      const p = R.Seq.newPattern();
      R.Seq.parseMel(p, mel);
      return R.Seq.serializePat(p);
    });
    const mute = {}; R.TRACKS.forEach((t) => (mute[t] = 0));
    return { v: 1, name: song.title, params, song: { cur: 0, mute, pats } };
  }

  const Songs = { list: SONGS, byId, current: null, parse, compile, buildSnapshot, applying: false };
  Songs.load = function (id) {
    const song = byId[id];
    if (!song) return false;
    R.Presets.AB.reset();
    Songs.applying = true;
    try { R.Presets.loadSnapshot(buildSnapshot(song), song.title); } finally { Songs.applying = false; }
    Songs.current = id;
    R.emit('song', id);
    return true;
  };
  // loading a factory patch or a saved patch ends "song" mode
  R.on('loaded', () => { if (!Songs.applying && !(R.Style && R.Style.applying) && Songs.current) { Songs.current = null; R.emit('song', null); } });

  R.Songs = Songs;
})();
