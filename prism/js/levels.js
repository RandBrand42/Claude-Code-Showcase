/* PRISM levels - 24 handcrafted puzzles in four chapters.
 *
 * Each level is authored as its SOLVED layout (so it is solvable by construction); buildLevel() then scrambles
 * the rotatable pieces and lifts loose pieces into the tray. tests/solve-all.mjs proves each one again with the
 * independent solver, starting from the scrambled state.
 *
 * Tokens (space separated, one row per line):
 *   .  empty        #  wall            x  absorber
 *   E<d><c>  emitter, d = 0 N / 1 E / 2 S / 3 W, colour r g b y c m w
 *   M<r> S<r> P<r>  mirror / splitter / prism, rotatable; lowercase (m s p) = fixed.  Suffix * = loose (tray), = = leave as solved
 *   F<c>  colour filter (suffix * = loose)      O<n>  portal (two with the same n form a pair)
 *   C<c>[n][!]  crystal of colour c needing n beams; ! = needs full power
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.Prism.levels = factory(root.Prism.core);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const CHAPTERS = [
    { name: 'Reflection', roman: 'I', blurb: 'Mirrors, walls, and the first rule of light.' },
    { name: 'Division', roman: 'II', blurb: 'Split the beam. Spend its power wisely.' },
    { name: 'Spectrum', roman: 'III', blurb: 'White light is three colours in a trench coat.' },
    { name: 'Convergence', roman: 'IV', blurb: 'Doors, detours and everything at once.' },
  ];

  const DEFS = [
    /* ---------------------------------------------------------------- I. Reflection */
    { name: 'First Light', tip: 'Click a mirror to turn it.', rows: [
      '. . . Cr .',
      '. . . . .',
      '. . . . .',
      '. . . . .',
      'E1r . . M0 .'] },
    { name: 'Two Turns', tip: 'Some beams need more than one bounce.', rows: [
      'E1r . . . M1',
      '. . . . .',
      '. # . . .',
      '. Cr . . M0',
      '. . . . .'] },
    { name: 'Loose Glass', tip: 'Drag a piece from the tray onto the board. On touch, tap it, then tap a cell.', rows: [
      '. . . . .',
      'Cr . . m1 .',
      '. . . . .',
      'E1r . . M0* .',
      '. . . . .'] },
    { name: 'Around the Wall', tip: 'Walls stop light. Mirrors send it round.', rows: [
      'E2r . . . . .',
      '. . # . Cr .',
      '. # # . . .',
      '. . # # . .',
      'M1* . . . M0* .',
      '. . . . . .'] },
    { name: 'Crossing Paths', tip: 'Beams pass through each other without harm.', rows: [
      '. . . . . Cr',
      'Cr . . M1 . .',
      'E1r . . . . M0',
      '. . . . . .',
      '. # . . # .',
      '. . . E0r . .'] },
    { name: 'Switchback', tip: 'Fixed pieces cannot be moved, only used.', rows: [
      'E1r . . . . M1',
      '. # . # . .',
      '. M0* . . . M0',
      '. . # . # .',
      '. m1 . . Cr .',
      '. . . . . .'] },

    /* ---------------------------------------------------------------- II. Division */
    { name: 'Split Decision', tip: 'A splitter sends half the light on and half aside.', rows: [
      '. . . . . .',
      '. . M0 . . Cr',
      '. # . . # .',
      'E1r . S0* . . Cr',
      '. . . . . .',
      '. . . . . .'] },
    { name: 'Halves', tip: 'Every split halves the power. Crystals need at least a fifth.', rows: [
      '. Cr . . . .',
      '. . . . . .',
      'E1r S0 . S1* . Cr',
      '. . . . . .',
      '. . . Cr . .',
      '. . . . . .'] },
    { name: 'Colour Swap', tip: 'Crystals wake only to their own colour. One mirror can serve two beams.', rows: [
      '. . Cg . .',
      '. . . . .',
      'E1g . M0 . Cb',
      '. . . . .',
      '. . E0b . .'] },
    { name: 'Both Barrels', tip: 'Two pips under a crystal: it needs two beams at once.', rows: [
      '. . . . . E2r',
      'E1r M1 . . . .',
      '. . . . # .',
      '. M1* . Cr2 . M0',
      '. . # . . .',
      '. . . . . .'] },
    { name: 'Event Horizon', tip: 'Absorbers swallow light. Route around them.', rows: [
      'E2r . . . . .',
      '. . x Cr . .',
      '. . . . . .',
      'M1* . . S0* . Cr',
      'x . . . x .',
      '. . . . . .'] },
    { name: 'Full Power', tip: 'A ringed crystal needs full power. Bring the two halves back together.', rows: [
      '. . . . . . .',
      '. . M0 . . M1 .',
      '. . . . . . .',
      'E1r . S0 . M1* . .',
      '. . . . . . .',
      '. . # . Cr! M0 .',
      '. . . . # . .'] },

    /* ---------------------------------------------------------------- III. Spectrum */
    { name: 'Rainbow', tip: 'A prism fans white light into red, green and blue. Face it into the beam.', rows: [
      '. . Cr . . .',
      '. . . . . .',
      'E1w . P1* . . Cg',
      '. . . . . .',
      '. # . . # .',
      '. . Cb . . .'] },
    { name: 'Additive', tip: 'Red plus green is yellow. Light that meets inside a crystal adds up.', rows: [
      'E1r . . M1 . .',
      '. . . . . .',
      '. # . . . .',
      '. . . Cy . M1*',
      '. . . . # .',
      '. . . . . E0g'] },
    { name: 'Through the Filter', tip: 'A filter passes only its own colour.', rows: [
      '. . Cb . . .',
      '. . Fb* . # .',
      'E1w . S0 . Fr* Cr',
      '. # . . . .',
      '. . . . . .',
      '. . . . . .'] },
    { name: 'Cyan Shift', tip: 'Green plus blue makes cyan. Fan the light out, then bring it home.', rows: [
      '. . Cr . . .',
      '. . . . . .',
      '. . . . . .',
      'E1w . P1 . M1 .',
      '. . . . . .',
      '. . M1* . Cc .'] },
    { name: 'Sunlight', tip: 'Red, green and blue together make white.', rows: [
      '. . . . . .',
      '. # M0 . M1* .',
      '. . . . . .',
      'E1w . P1 . Cw3 .',
      '. . . . . #',
      '. . M1 . M0 .'] },
    { name: 'Pure Yellow', tip: 'Filter white light down to the exact mixed colour each crystal wants.', rows: [
      'E1w . S1 Fy* . M1',
      '. . . . # .',
      '. . Fm* . . .',
      '. # . . . .',
      'Cm . M0 . . Cy',
      '. . . . . .'] },

    /* ---------------------------------------------------------------- IV. Convergence */
    { name: 'Wormhole', tip: 'Portals come in pairs. Light that enters one leaves through the other.', rows: [
      'E2r . . . . .',
      '. . # . . .',
      'M1* . O0 . # .',
      '. . . . . .',
      '. . . . O0 Cr',
      '. . . . . .'] },
    { name: 'Two Doors', tip: 'Two pairs, two destinations.', rows: [
      '. O0 . . . .',
      '. . . . . .',
      'E1r S0* . O1 Cr .',
      '. . # . . .',
      '. . . . O0 .',
      'O1 . . Cr . .'] },
    { name: 'Hall of Mirrors', tip: 'The long way round.', par: 4, rows: [
      'E1r . . . . . . M1',
      '. # . # . . . .',
      '. M0 . . . . . M0',
      'Cb . . . M1 . . .',
      '. M1* . . . . M1 .',
      '. . . # . . . .',
      '. . . Cr . . M0* .',
      '. . . . E0b . . .'] },
    { name: 'Prism Gate', tip: 'Everything so far, through a door.', rows: [
      '. . . . . . .',
      '. . . . # . .',
      '. # . . . . .',
      'E1w O0 . . M0 . Cr',
      '. . . . . . .',
      '. . . O0 P1* . Cg',
      '. . . . Cb . .'] },
    { name: 'Mixing Desk', tip: 'Three sources, three mixed colours.', rows: [
      '. . Cm . . . E3b',
      '. . . Cg . . .',
      '. . . . # . .',
      'E1r . S0 . . Cy .',
      '. . . . . . .',
      '. # . . . . .',
      'E1g . . S0* . M0 .'] },
    { name: 'Grand Prism', tip: 'Bring all the colours home.', rows: [
      '. . . Cg . . . .',
      '. . . . . . O0 .',
      '. . M0 . . M1 . .',
      '. # . . . . . .',
      'E1w . P1 S0 . Cw3 M0* .',
      '. . . . . . . .',
      '. . O0 . . . . .',
      '. x . . . # . .'] },
  ];

  function chapterOf(i) { return Math.floor(i / 6); }

  const LEVELS = DEFS.map((d, i) => ({ id: i + 1, chapter: chapterOf(i), def: d }));
  const build = i => Object.assign(Core.buildLevel(LEVELS[i].def), { id: i + 1, chapter: chapterOf(i), kind: 'level' });

  /* Star thresholds: 3 stars at par or better, 2 within three extra moves. */
  const starsFor = (moves, par) => moves <= par ? 3 : moves <= par + 3 ? 2 : 1;

  return { CHAPTERS, LEVELS, build, starsFor, count: LEVELS.length };
});
