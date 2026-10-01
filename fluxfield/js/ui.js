/* FLUXFIELD - dock, overlays and transient UI (FF.createUI).
 * The UI is a thin view: it renders from `app.state` / `app.getParam` and calls `app.actions`. */
(function () {
  'use strict';
  const FF = (window.FF = window.FF || {});

  const $ = (sel, root) => (root || document).querySelector(sel);
  const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  const pad2 = (n) => String(n).padStart(2, '0');

  const SHORTCUTS = [
    ['Pause / resume', ['Space']], ['Clear canvas', ['C']],
    ['Random burst', ['R']], ['Save PNG', ['S']],
    ['Record 10 s WebM', ['M']], ['Fullscreen', ['F']],
    ['Cycle kaleidoscope', ['K']], ['Autopilot on / off', ['A']],
    ['Scenes', ['1', '-', '7']], ['Remove vortex wells', ['W']],
    ['Performance HUD', ['P']], ['Controls dock', ['D']],
    ['Hide / show interface', ['H']], ['This overlay', ['?']],
  ];

  FF.createUI = function (app) {
    const { state, actions } = app;
    const SC = FF.scenes;
    const dock = $('#dock'), handle = $('#handle'), edge = $('#edge');
    const toastEl = $('#toast'), nameEl = $('#sceneName'), statusEl = $('#status'), hudEl = $('#hud'), help = $('#help');
    const mobile = () => window.matchMedia('(max-width: 720px)').matches;
    const syncers = [];

    /* ---- generic builders ---- */
    function slider(mount, def, get, set) {
      const wrap = document.createElement('label');
      wrap.className = 'slider';
      wrap.innerHTML = `<span class="slider-head"><span class="slider-name">${def.label}</span><output class="slider-val"></output></span>` +
        `<input type="range" min="${def.min}" max="${def.max}" step="${def.step}" aria-label="${def.label}">`;
      const input = $('input', wrap), out = $('output', wrap);
      const paint = (v) => {
        input.style.setProperty('--p', ((v - def.min) / (def.max - def.min)) * 100 + '%');
        out.textContent = def.fmt(v);
        input.setAttribute('aria-valuetext', out.textContent);
      };
      input.addEventListener('input', () => { const v = parseFloat(input.value); paint(v); set(v); });
      mount.appendChild(wrap);
      syncers.push(() => { const v = get(); input.value = v; paint(v); });
    }

    function segmented(root, items, get, pick) {
      items.forEach((it) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = it.label; b.setAttribute('aria-pressed', 'false');
        if (it.aria) b.setAttribute('aria-label', it.aria);
        b.addEventListener('click', () => pick(it.v));
        root.appendChild(b);
      });
      const buttons = [...root.children];
      syncers.push(() => {
        const idx = Math.max(0, items.findIndex((x) => String(x.v) === String(get())));
        root.style.setProperty('--i', idx);
        buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === idx)));
      });
    }

    /* ---- action row ---- */
    const ACTIONS = [
      { id: 'clear', icon: 'i-clear', label: 'Clear', key: 'C', tip: 'Clear  C' },
      { id: 'burst', icon: 'i-burst', label: 'Random burst', key: 'R', tip: 'Burst  R' },
      { id: 'pause', icon: 'i-pause', label: 'Pause', key: 'Sp', tip: 'Pause  Space', toggle: true },
      { id: 'shot', icon: 'i-camera', label: 'Screenshot', key: 'S', tip: 'PNG  S' },
      { id: 'rec', icon: 'i-record', label: 'Record 10 seconds', key: 'M', tip: 'Record  M' },
      { id: 'full', icon: 'i-full', label: 'Fullscreen', key: 'F', tip: 'Full  F' },
    ];
    const actionBtn = {};
    const row = $('#actionRow');
    ACTIONS.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'icon-btn'; b.dataset.tip = a.tip; b.dataset.key = a.key; b.setAttribute('aria-label', a.label);
      if (a.toggle) b.setAttribute('aria-pressed', 'false');
      b.innerHTML = icon(a.icon);
      b.addEventListener('click', () => actions[a.id]());
      row.appendChild(b); actionBtn[a.id] = b;
    });
    const swapIcon = (btn, id) => btn.querySelector('use').setAttribute('href', '#' + id);

    /* ---- scenes + palettes ---- */
    const gradient = (cols) => `linear-gradient(90deg, ${cols.join(', ')})`;
    const sceneGrid = $('#sceneGrid');
    SC.SCENES.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'scene'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', `Scene ${i + 1}: ${s.name}`);
      b.innerHTML = `<span class="scene-top"><span class="scene-n">${pad2(i + 1)}</span><span class="scene-label">${s.name}</span></span><span class="scene-strip" style="background:${gradient(s.palette)}"></span>`;
      b.addEventListener('click', () => actions.scene(i));
      sceneGrid.appendChild(b);
    });
    syncers.push(() => [...sceneGrid.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === state.scene))));

    const palGrid = $('#palGrid');
    const allPalettes = SC.SCENES.map((s) => ({ id: s.id, name: s.name, colors: s.palette })).concat(SC.EXTRA_PALETTES);
    allPalettes.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pal'; b.title = p.name; b.setAttribute('aria-label', `Palette ${p.name}`); b.setAttribute('aria-pressed', 'false');
      b.style.background = gradient(p.colors);
      b.addEventListener('click', () => actions.palette(p.id, p.colors));
      palGrid.appendChild(b);
    });
    syncers.push(() => [...palGrid.children].forEach((b, i) => b.setAttribute('aria-pressed', String(allPalettes[i].id === state.paletteId))));

    const custom = $('#customPal');
    const swatches = [0, 1, 2, 3].map((i) => {
      const lab = document.createElement('label');
      lab.className = 'swatch';
      lab.innerHTML = `<input type="color" aria-label="Custom colour ${i + 1}">`;
      const inp = $('input', lab);
      inp.addEventListener('input', () => { lab.style.setProperty('--c', inp.value); actions.customColor(i, inp.value); });
      custom.appendChild(lab);
      return { lab, inp };
    });
    syncers.push(() => swatches.forEach((s, i) => { s.inp.value = state.palette[i]; s.lab.style.setProperty('--c', state.palette[i]); }));

    segmented($('#segColor'), [{ v: 'time', label: 'Time' }, { v: 'velocity', label: 'Velocity' }, { v: 'position', label: 'Position' }],
      () => state.colorMode, actions.colorMode);

    /* ---- sliders ---- */
    SC.SLIDERS.forEach((def) => slider($('#sliders'), def, () => app.getParam(def.key), (v) => actions.param(def.key, v)));
    $('#btnResetScene').addEventListener('click', () => actions.resetScene());

    /* ---- symmetry ---- */
    segmented($('#segSym'), [{ v: 1, label: 'Off' }, { v: 2, label: '2' }, { v: 3, label: '3' }, { v: 4, label: '4' }, { v: 6, label: '6' }, { v: 8, label: '8' }],
      () => state.symmetry, actions.symmetry);
    segmented($('#segMirror'), [{ v: 'rotate', label: 'Rotate' }, { v: 'mirror', label: 'Mirror' }],
      () => (state.mirror ? 'mirror' : 'rotate'), (v) => actions.mirror(v === 'mirror'));

    /* ---- conductor ---- */
    const sw = $('#swConductor');
    sw.addEventListener('click', () => actions.conductor(!state.conductor));
    syncers.push(() => sw.setAttribute('aria-checked', String(state.conductor)));
    slider($('#energySlider'), { key: 'energy', label: 'Energy', min: 0.2, max: 1.6, step: 0.05, fmt: (v) => v.toFixed(2) }, () => state.energy, actions.energy);

    /* ---- engine ---- */
    segmented($('#segQuality'), [{ v: 'auto', label: 'Auto' }, { v: 'high', label: 'High' }, { v: 'balanced', label: 'Med' }, { v: 'low', label: 'Low' }],
      () => state.quality, actions.quality);
    slider($('#iterSlider'), { key: 'iterations', label: 'Pressure iterations', min: 4, max: 40, step: 1, fmt: (v) => v.toFixed(0) }, () => state.iterations, actions.iterations);

    $('#btnHelp').addEventListener('click', () => toggleHelp(true));
    $('#btnHud').addEventListener('click', () => actions.hud());
    $('#btnHide').addEventListener('click', () => actions.hideUI());
    syncers.push(() => $('#btnHud').setAttribute('aria-pressed', String(state.hud)));

    /* ---- dock open / close ---- */
    let pinned = false, closeTimer = 0;
    function setOpen(v, pin) {
      clearTimeout(closeTimer);
      pinned = v && (pin === undefined ? pinned : pin);
      dock.classList.toggle('open', v);
      handle.setAttribute('aria-expanded', String(v));
      handle.setAttribute('aria-label', v ? 'Close controls' : 'Open controls');
    }
    const isOpen = () => dock.classList.contains('open');
    handle.addEventListener('click', () => (isOpen() ? setOpen(false) : setOpen(true, true)));
    $('#btnClose').addEventListener('click', () => { setOpen(false); handle.focus({ preventScroll: true }); });
    edge.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !isOpen()) setOpen(true, false); });
    dock.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    dock.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' || pinned || mobile()) return;
      closeTimer = setTimeout(() => setOpen(false), 650);
    });
    dock.addEventListener('focusin', (e) => { if (e.target !== handle && e.target.matches(':focus-visible')) setOpen(true, true); });
    // keyboard-initiated clicks have detail 0; after a real click drop focus so Space / letter shortcuts keep working
    dock.addEventListener('click', (e) => { if (e.detail > 0) { const b = e.target.closest('button'); if (b) b.blur(); } });

    /* ---- shortcuts overlay ---- */
    const keyList = $('#keyList');
    keyList.innerHTML = SHORTCUTS.map(([label, keys]) =>
      `<div class="key-row"><span>${label}</span><span>${keys.map((k) => (k === '-' ? '<i style="opacity:.5;font-style:normal">to</i>' : `<kbd>${k}</kbd>`)).join('')}</span></div>`).join('');
    let helpReturn = null;
    function toggleHelp(force) {
      const show = force === undefined ? help.hidden : force;
      if (show === !help.hidden) return;
      help.hidden = !show;
      if (show) { helpReturn = document.activeElement; $('#helpClose').focus({ preventScroll: true }); }
      else if (helpReturn && helpReturn.focus) helpReturn.focus({ preventScroll: true });
    }
    $('#helpClose').addEventListener('click', () => toggleHelp(false));
    help.addEventListener('pointerdown', (e) => { if (e.target === help) toggleHelp(false); });
    help.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); $('#helpClose').focus(); } });

    /* ---- transient feedback ---- */
    let toastTimer = 0;
    function toast(msg, ms) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2000);
    }
    function showSceneName(i) {
      nameEl.innerHTML = `<small>${pad2(i + 1)}</small><span>${SC.SCENES[i].name}</span>`;
      nameEl.classList.remove('show');
      void nameEl.offsetWidth;                                // restart the CSS animation
      nameEl.classList.add('show');
    }
    function setStatus(kind, text) {
      statusEl.hidden = !kind;
      statusEl.className = 'status' + (kind === 'rec' ? ' rec' : '');
      $('span', statusEl).textContent = text || '';
    }

    return {
      syncAll() { syncers.forEach((f) => f()); },
      toast, showSceneName, setStatus, toggleHelp,
      get helpOpen() { return !help.hidden; },
      setOpen, isOpen, pinned: () => pinned,
      closeIfMobile() { if (mobile() && isOpen()) setOpen(false); },
      setAccent(r, g, b) { document.documentElement.style.setProperty('--accent-rgb', `${r} ${g} ${b}`); },
      setPaused(p) {
        actionBtn.pause.setAttribute('aria-pressed', String(p));
        swapIcon(actionBtn.pause, p ? 'i-play' : 'i-pause');
        actionBtn.pause.setAttribute('aria-label', p ? 'Resume' : 'Pause');
      },
      setRecording(on) { actionBtn.rec.classList.toggle('rec-on', on); actionBtn.rec.setAttribute('aria-label', on ? 'Stop recording' : 'Record 10 seconds'); },
      setFullscreen(on) { swapIcon(actionBtn.full, on ? 'i-exitfull' : 'i-full'); },
      setHud(text) { hudEl.hidden = !state.hud; if (state.hud && text) hudEl.textContent = text; $('#btnHud').setAttribute('aria-pressed', String(state.hud)); },
    };
  };
})();
