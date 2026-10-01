/* RESONANCE - studio.js
 * The three "make it your own" pickers that sit under the LCD: STYLE (restyle the song into another genre),
 * SONGS (a library of public-domain tunes) and THEME (panel skins). Each opens a modal built here, so the
 * page markup only needs the buttons. The styling engine itself lives in styles.js.
 */
(function () {
  'use strict';
  const R = window.R, P = R.P, ui = R.ui;
  const { $, el } = ui;

  /* ---------- tiny modal helper (same look and behaviour as the patch browser) ---------- */
  const modals = [];
  function makeModal(id, title, sub) {
    const root = el('div', 'modal', '');
    root.id = id; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', id + 'T');
    const card = el('div', 'modal-card wide studio', '<header><div><h2 id="' + id + 'T"></h2><p class="msub"></p></div><button class="btn sm" data-close type="button" aria-label="Close"><svg class="ico"><use href="#i-close"/></svg></button></header><div class="mbody"></div>');
    $('h2', card).textContent = title; $('.msub', card).textContent = sub || '';
    root.appendChild(card); document.body.appendChild(root);
    let last = null;
    const m = {
      root, body: $('.mbody', card),
      open() { last = document.activeElement; root.hidden = false; const f = root.querySelector('.tile.cur, .tile, button'); if (f) f.focus({ preventScroll: true }); },
      close() { root.hidden = true; if (last && last.focus) last.focus({ preventScroll: true }); },
    };
    root.addEventListener('pointerdown', (e) => { if (e.target === root) m.close(); });
    $('[data-close]', card).addEventListener('click', () => m.close());
    modals.push(m);
    return m;
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') modals.forEach((m) => { if (!m.root.hidden) m.close(); }); });

  /* =====================================================================================
   *  STYLE picker
   * ===================================================================================== */
  const styleModal = makeModal('modalStyle', 'Restyle this song', 'Same notes and key, a different genre. "Original" always brings the song back.');
  const styleTiles = new Map();

  /** a tiny 16-step picture of a style's groove: kick (amber), snare / clap (cyan), hats (white) */
  function grooveStrip(style) {
    const d = style.drums && style.drums.groove;
    const wrap = el('div', 'groove', '');
    if (!d) { wrap.classList.add('none'); wrap.textContent = style.drums === null ? 'no drums' : ''; return wrap; }
    const row = (cls, str) => {
      const r = el('div', 'grow ' + cls, '');
      (str ? str.replace(/[\s|]/g, '').match(/[xXo.\-][234]?\??/g) || [] : []).slice(0, 16).forEach((t) => r.appendChild(el('i', t[0] === '.' || t[0] === '-' ? '' : t[0] === 'o' ? 'g' : 'h', '')));
      return r;
    };
    wrap.append(row('k', d.kick), row('s', d.snare || d.clap || d.tom), row('h', d.chat || d.ohat));
    return wrap;
  }

  function buildStyleTiles() {
    const body = styleModal.body;
    body.textContent = '';
    const opts = el('label', 'optrow', '<input type="checkbox" id="optAutoTheme"> <span>Match the panel look to the style</span>');
    const cb = $('input', opts); cb.checked = R.Style.autoTheme;
    cb.addEventListener('change', () => { R.Style.autoTheme = cb.checked; });
    const grid = el('div', 'tilegrid', '');
    const all = [{ id: 'original', name: 'Original', tag: 'AS WRITTEN', desc: 'The song exactly as it was loaded, with its own sound and drums.', bpm: null, swing: null }].concat(R.Style.list);
    for (const s of all) {
      const b = el('button', 'tile', '<span class="tt"></span><span class="tn"></span><span class="td"></span><span class="tm"></span>');
      b.type = 'button'; b.dataset.id = s.id;
      $('.tt', b).textContent = s.tag; $('.tn', b).textContent = s.name; $('.td', b).textContent = s.desc;
      $('.tm', b).textContent = s.id === 'original' ? '' : (s.bpm ? s.bpm + ' BPM' : 'song tempo') + (s.swing ? '  -  swing ' + Math.round(s.swing * 100) + '%' : '');
      if (s.id !== 'original') b.appendChild(grooveStrip(s));
      b.addEventListener('click', () => {
        if (!R.app.powered) { ui.toast('Power on first'); return; }
        const was = R.Style.current;
        if (s.id === 'original' && was === 'original') { ui.toast('Already the original'); return; }
        R.Style.apply(s.id);
        ui.toast(s.id === 'original' ? 'Back to the original' : R.Style.base.name + ' as ' + s.name);
      });
      styleTiles.set(s.id, b); grid.appendChild(b);
    }
    body.append(grid, opts);
    paintStyle();
  }
  function paintStyle() {
    styleTiles.forEach((b, id) => { b.classList.toggle('cur', id === R.Style.current); b.setAttribute('aria-pressed', id === R.Style.current); });
    const s = R.Style.byId[R.Style.current];
    const tag = $('#lcdTag');
    if (tag) { if (s) tag.textContent = s.tag; else if (R.Songs && R.Songs.current) tag.textContent = R.Songs.byId[R.Songs.current].category.toUpperCase().slice(0, 12); }
    const btn = $('#btnStyle');
    if (btn) { btn.classList.toggle('on', !!s); $('span', btn).textContent = s ? s.tag.toUpperCase().slice(0, 10) : 'STYLE'; }
  }
  R.on('style', paintStyle);
  // the app resets the LCD tag to the patch tag on every load; put the style tag back afterwards
  R.on('loaded', () => setTimeout(paintStyle, 0));
  buildStyleTiles();
  $('#btnStyle').addEventListener('click', () => { paintStyle(); styleModal.open(); });

  /* =====================================================================================
   *  SONGS library
   * ===================================================================================== */
  const songModal = makeModal('modalSongs', 'Song library', 'Public-domain tunes played by the synthesizer. Load one, then press STYLE to hear it as another genre.');
  const songTiles = new Map();
  function buildSongs() {
    const body = songModal.body;
    body.textContent = '';
    for (const cat of ['Classical', 'Folk & traditional', 'Seasonal']) {
      const list = R.Songs.list.filter((s) => s.category === cat);
      if (!list.length) continue;
      const h = el('h3', '', ''); h.textContent = cat;
      const grid = el('div', 'tilegrid', '');
      for (const s of list) {
        const b = el('button', 'tile song', '<span class="tt"></span><span class="tn"></span><span class="td"></span><span class="tm"></span><span class="tb"></span>');
        b.type = 'button'; b.dataset.id = s.id;
        $('.tt', b).textContent = s.meter + '  -  ' + s.year;
        $('.tn', b).textContent = s.title;
        $('.td', b).textContent = s.composer;
        $('.tm', b).textContent = s.note + '  -  ' + s.bpm + ' BPM';
        const tb = $('.tb', b);
        if (s.verified === 'score') { tb.textContent = 'Checked against a published score'; tb.classList.add('ok'); tb.title = 'Every note and length was compared with a public-domain score by an automated test'; }
        else { tb.textContent = 'From memory - not independently checked'; tb.classList.add('mem'); tb.title = 'Written from memory; a musician should listen and correct any wrong note'; }
        b.addEventListener('click', () => {
          if (!R.app.powered) { ui.toast('Power on first'); return; }
          R.Songs.load(s.id);
          if (!R.Seq.playing) R.Seq.start();
          ui.toast(s.title + ' - press STYLE to restyle it');
        });
        songTiles.set(s.id, b); grid.appendChild(b);
      }
      body.append(h, grid);
    }
    body.appendChild(el('p', 'fineprint', 'The compositions are in the public domain. What you hear is this app’s own synthesis of a simple one-voice transcription: no recording and no modern arrangement is used. A tune is an excerpt (up to 8 bars) that loops.'));
    paintSongs();
  }
  function paintSongs() { songTiles.forEach((b, id) => { b.classList.toggle('cur', id === R.Songs.current); b.setAttribute('aria-pressed', id === R.Songs.current); }); }
  R.on('song', () => { paintSongs(); paintStyle(); });
  buildSongs();
  $('#btnSongs').addEventListener('click', () => { paintSongs(); songModal.open(); });

  /* =====================================================================================
   *  THEME picker
   * ===================================================================================== */
  const themeModal = makeModal('modalTheme', 'Panel look', 'Dress the instrument as a piano, a concert hall, a jazz club and more. Your choice is remembered on this device.');
  const themeTiles = new Map();
  function buildThemes() {
    const body = themeModal.body;
    body.textContent = '';
    const grid = el('div', 'tilegrid', '');
    for (const t of R.Theme.list) {
      const b = el('button', 'tile theme', '<span class="swatch"><i style="background:' + t.pv.chassis + '"></i><i style="background:' + t.pv.cheek + '"></i><i style="background:' + t.pv.lcd + '"></i><i style="background:' + t.pv.a + '"></i><i style="background:' + t.pv.b + '"></i></span><span class="tn"></span><span class="td"></span>');
      b.type = 'button'; $('.tn', b).textContent = t.name; $('.td', b).textContent = t.desc;
      b.addEventListener('click', () => {
        R.Theme.set(t.id);
        paintThemes();
        ui.toast('Look: ' + t.name);
      });
      themeTiles.set(t.id, b); grid.appendChild(b);
    }
    body.appendChild(grid);
    body.appendChild(el('p', 'fineprint', 'With "Match the panel look to the style" ticked in the STYLE picker, restyling a song also changes the look; pick one here to keep it.'));
    paintThemes();
  }
  function paintThemes() { themeTiles.forEach((b, id) => { b.classList.toggle('cur', id === R.Theme.current); b.setAttribute('aria-pressed', id === R.Theme.current); }); }
  R.on('theme', paintThemes);
  buildThemes();
  $('#btnTheme').addEventListener('click', () => { paintThemes(); themeModal.open(); });

  R.studio = { styleModal, songModal, themeModal, makeModal, modals };
})();
