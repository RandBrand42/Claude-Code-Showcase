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
    if (s && tag) tag.textContent = s.tag;
    const btn = $('#btnStyle');
    if (btn) { btn.classList.toggle('on', !!s); $('span', btn).textContent = s ? s.name.toUpperCase().slice(0, 9) : 'STYLE'; }
  }
  R.on('style', paintStyle);
  // the app resets the LCD tag to the patch tag on every load; put the style tag back afterwards
  R.on('loaded', () => setTimeout(paintStyle, 0));
  buildStyleTiles();
  $('#btnStyle').addEventListener('click', () => { paintStyle(); styleModal.open(); });

  R.studio = { styleModal, makeModal, modals };
})();
