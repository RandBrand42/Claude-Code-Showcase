/* INFINITUM - interface: dock, popovers, sliders, shortcuts overlay. Pure DOM, no frameworks. */
(function () {
  'use strict';
  const INF = (window.INF = window.INF || {});

  const PATHS = {
    family: '<path d="M12 12c-2-3-3.6-4-5.2-4C4.700 8 3 9.800 3 12s1.700 4 3.800 4c1.600 0 3.200-1 5.200-4zm0 0c2 3 3.600 4 5.200 4 2.100 0 3.800-1.800 3.800-4s-1.700-4-3.800-4C15.600 8 14 9 12 12z"/>',
    palette: '<path d="M12 3.500a8.500 8.500 0 1 0 0 17c1.200 0 1.800-.8 1.800-1.700 0-1.300-1-1.500-1-2.600 0-.9.7-1.500 1.600-1.500H17a3.500 3.500 0 0 0 3.500-3.500C20.500 7 16.700 3.500 12 3.500z"/><circle cx="7.500" cy="11" r="1"/><circle cx="10" cy="7.300" r="1"/><circle cx="14.500" cy="7.300" r="1"/>',
    colour: '<path d="M12 4l8 4.500-8 4.500-8-4.500z"/><path d="M4 12.500l8 4.500 8-4.500"/><path d="M4 16.500l8 4.500 8-4.500"/>',
    quality: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1"/>',
    gallery: '<rect x="4" y="5" width="16" height="14" rx="1.500"/><path d="M4 16l4.500-4.500 3.500 3.500 2.500-2.500 5.500 5"/><circle cx="15.500" cy="9.500" r="1.200"/>',
    play: '<path d="M8 5.500v13l11-6.500z"/>', pause: '<path d="M8.500 5.500v13M15.500 5.500v13"/>',
    julia: '<circle cx="9" cy="12" r="5"/><circle cx="15.500" cy="12" r="3"/>',
    bookmark: '<path d="M7 4h10v16l-5-3.500L7 20z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
    export: '<path d="M12 4v11M7.500 10.500L12 15l4.500-4.500"/><path d="M5 19h14"/>',
    info: '<circle cx="12" cy="12" r="8.500"/><path d="M12 11v5.500M12 7.800v.2"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    help: '<circle cx="12" cy="12" r="8.500"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 .9-1 1.700M12 16.800v.2"/>',
    undo: '<path d="M8.500 6.500l-4 4 4 4"/><path d="M4.500 10.500H14a5 5 0 0 1 0 10h-3"/>', redo: '<path d="M15.500 6.500l4 4-4 4"/><path d="M19.500 10.500H10a5 5 0 0 0 0 10h3"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3.500"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>',
    mandelbrot: '<path d="M16 12c0-2.800-2.200-4.800-5-4.500-2.500.300-4.400 2.400-4.400 4.500s1.900 4.200 4.400 4.500c2.800.300 5-1.700 5-4.500z"/><circle cx="19.200" cy="12" r="1.800"/><circle cx="4.300" cy="12" r="1.300"/><circle cx="11" cy="6" r="1"/>',
    julia_g: '<path d="M12 12c0-1 1.500-1.300 2-.3.700 1.400-.6 3-2.300 3-2.400 0-3.800-2.500-3-4.800C9.600 7.300 12.300 6 15 7c3 1.200 4 5 2.200 8"/>',
    ship: '<path d="M4 15h16l-2.500 4h-11z"/><path d="M12 15V5l5 6-5 .5"/><path d="M12 8l-4 3.500h4"/>',
    tricorn: '<circle cx="12" cy="8.200" r="3.200"/><circle cx="8.300" cy="14.800" r="3.200"/><circle cx="15.700" cy="14.800" r="3.200"/>',
    multibrot: '<g><ellipse cx="12" cy="7" rx="2.200" ry="3.200"/><ellipse cx="12" cy="7" rx="2.200" ry="3.200" transform="rotate(90 12 12)"/><ellipse cx="12" cy="7" rx="2.200" ry="3.200" transform="rotate(180 12 12)"/><ellipse cx="12" cy="7" rx="2.200" ry="3.200" transform="rotate(270 12 12)"/></g>',
    newton: '<path d="M12 12V5M12 12l6.200 3.600M12 12l-6.200 3.600"/><circle cx="12" cy="4.800" r="1.700"/><circle cx="18.300" cy="15.700" r="1.700"/><circle cx="5.700" cy="15.700" r="1.700"/>',
  };
  const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[n]}</svg>`;
  INF.icon = svg;

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  }

  INF.UI = function UI(app) {
    const S = app.S, $ = (id) => document.getElementById(id);
    const dock = $('dock'), pop = $('pop');
    let openName = null;
    const btns = {};

    /* ---------------- building blocks ---------------- */
    function slider(label, min, max, step, get, set, fmt, cls) {
      const out = h('output');
      const inp = h('input', { type: 'range', min, max, step, 'aria-label': label });
      const paint = () => { inp.value = get(); inp.style.setProperty('--v', ((inp.value - min) / (max - min) * 100) + '%'); out.textContent = fmt ? fmt(+inp.value) : (+inp.value).toFixed(2); };
      inp.addEventListener('input', () => { set(+inp.value); paint(); });
      paint();
      const f = h('div', { class: 'field' }, h('span', null, label), inp, out); f.repaint = paint; f.input = inp; return f;
    }
    function segment(items, get, set, label) {
      const box = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
      const refresh = () => [...box.children].forEach((b, i) => b.setAttribute('aria-checked', String(items[i][0] === get())));
      items.forEach(([val, text]) => box.append(h('button', { role: 'radio', onclick: () => { set(val); refresh(); } }, text)));
      refresh(); return box;
    }
    function toggle(label, get, set) {
      const b = h('button', { role: 'switch', 'aria-label': label, 'aria-checked': String(!!get()), onclick: () => { set(!get()); b.setAttribute('aria-checked', String(!!get())); } });
      return h('div', { class: 'switch' }, h('span', null, label), b);
    }
    const head = (title, sub) => h('div', { class: 'pop-h' }, h('h3', null, title), h('small', null, sub || ''));

    /* ---------------- popovers ---------------- */
    const builders = {
      family() {
        const root = h('div', null, head('Fractal family', 'Enter the plane'));
        INF.FAMILIES.forEach((f) => root.append(h('button', { class: 'row', role: 'radio', 'aria-checked': String(S.family === f.id), onclick: () => { app.setFamily(f.id); render(); } },
          h('span', { class: 'g', html: svg(f.id === 'julia' ? 'julia_g' : f.id) }), h('span', { class: 't' }, h('b', null, f.name), h('span', null, f.formula)))));
        if (S.family === 'multibrot') root.append(h('div', { class: 'sec' }, h('label', null, 'Power'), slider('Exponent n', 2, 8, 1, () => S.power, (v) => { S.power = v; app.iterChanged(); }, (v) => String(v))));
        if (S.family === 'julia') {
          const j = S.julia;
          root.append(h('div', { class: 'sec' }, h('label', null, 'Julia parameter'),
            h('div', { class: 'lab', style: 'text-transform:none;letter-spacing:.02em;font:11.5px var(--mono);color:var(--text-mute)', id: 'jreadout' }, `c₀ = ${j.x.toFixed(4)} ${j.y < 0 ? '−' : '+'} ${Math.abs(j.y).toFixed(4)}i`),
            toggle('Julia orbit (loop c around a circle)', () => app.juliaOrbit.on, (v) => app.setJuliaOrbit(v)),
            slider('Orbit radius', 0.01, 0.4, 0.01, () => app.juliaOrbit.r, (v) => { app.juliaOrbit.r = v; }, (v) => v.toFixed(2)),
            h('p', { class: 'hint' }, 'Tip: start from the Mandelbrot set and press J to adopt the parameter under your cursor.')));
        }
        if (S.family === 'newton') {
          const sec = h('div', { class: 'sec' }, h('label', null, 'Polynomial p(z)'));
          const chips = h('div', { class: 'chips', role: 'radiogroup' });
          const cur = INF.describePoly(S.poly);
          INF.NEWTON_PRESETS.forEach((p) => chips.append(h('button', { class: 'chip', role: 'radio', 'aria-checked': String(INF.describePoly(INF.parsePoly(p.text)) === cur), onclick: () => { app.setPoly(INF.parsePoly(p.text)); render(); } }, p.label)));
          const inp = h('input', { class: 'txt', value: cur, spellcheck: 'false', 'aria-label': 'Custom polynomial', placeholder: 'e.g. z^5 - 3z + 2' });
          inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const c = INF.parsePoly(inp.value); inp.classList.toggle('bad', !c); if (c) { app.setPoly(c); render(); } } });
          sec.append(chips, h('div', { style: 'height:8px' }), inp, h('p', { class: 'hint' }, 'Real coefficients, degree 2 to 8. Press Enter to apply. Roots are found live (Durand–Kerner).'));
          root.append(sec);
        }
        return root;
      },
      palette() {
        const root = h('div', null, head('Cosine palettes', 'a + b·cos 2π(c·t + d)'));
        const bar = h('div', { class: 'bar' }); root.append(bar);
        const paintBar = () => { bar.style.background = INF.palGradient(S.pal); };
        paintBar();
        const sw = h('div', { class: 'swatches sec', role: 'radiogroup', 'aria-label': 'Preset palettes' });
        const refreshSw = () => [...sw.children].forEach((b, i) => b.setAttribute('aria-checked', String(S.palIndex === i)));
        INF.PALETTES.forEach((p, i) => sw.append(h('button', { class: 'swatch', role: 'radio', 'data-name': p.name, 'aria-label': p.name, style: `background:${INF.palGradient(p, '135deg', 10)}`, onclick: () => { app.setPalette(i); root.syncSliders(); paintBar(); refreshSw(); } })));
        refreshSw(); root.append(sw);
        const tri = h('div', { class: 'tri sec' }); const sl = [];
        [['Base', 'a', 0, 1, .01], ['Swing', 'b', 0, 1, .01], ['Rate', 'c', 0, 3, .01], ['Phase', 'd', 0, 1, .01]].forEach(([nm, key, lo, hi, st]) => {
          tri.append(h('span', null, nm));
          [0, 1, 2].forEach((ch) => {
            const inp = h('input', { type: 'range', min: lo, max: hi, step: st, 'aria-label': `${nm} ${'RGB'[ch]}` });
            const paint = () => { inp.value = S.pal[key][ch]; inp.style.setProperty('--v', ((inp.value - lo) / (hi - lo) * 100) + '%'); };
            inp.addEventListener('input', () => { S.pal[key][ch] = +inp.value; S.palIndex = -1; paint(); paintBar(); refreshSw(); app.colourChanged(); });
            paint(); sl.push(paint); tri.append(inp);
          });
        });
        root.syncSliders = () => sl.forEach((f) => f());
        root.append(tri);
        root.append(h('div', { class: 'sec' }, slider('Density', 0.3, 6, 0.05, () => S.density, (v) => { S.density = v; app.colourChanged(); }, (v) => v.toFixed(1)),
          slider('Phase', 0, 1, 0.005, () => S.phase % 1, (v) => { S.phase = v; app.colourChanged(); }, (v) => v.toFixed(2)),
          toggle('Animate palette cycling', () => S.cycle, (v) => { S.cycle = v; app.colourChanged(); }),
          slider('Cycle speed', 0.005, 0.3, 0.005, () => S.cycleSpeed, (v) => { S.cycleSpeed = v; }, (v) => v.toFixed(2))));
        root.append(h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { app.randomPalette(); root.syncSliders(); paintBar(); refreshSw(); } }, 'Compose a new palette'), h('button', { class: 'btn', onclick: () => app.nextPalette(1) && (root.syncSliders(), paintBar(), refreshSw()) }, 'Next (P)')));
        return root;
      },
      colour() {
        const root = h('div', null, head('Colouring', 'how the escape is painted'));
        root.append(h('div', { class: 'sec' }, h('label', null, 'Mode (M)'), segment([[0, 'Smooth'], [1, 'Orbit trap'], [2, 'Glow'], [3, 'Relief']], () => S.mode, (v) => { app.setMode(v); render(); }, 'Colouring mode')));
        if (S.mode === 1 || S.interior === 2) root.append(h('div', { class: 'sec' }, h('label', null, 'Trap shape'), segment([[1, 'Point'], [2, 'Line'], [3, 'Circle'], [4, 'Cross']], () => S.trapType, (v) => { S.trapType = v; app.iterChanged(); }, 'Orbit trap shape'),
          slider('Trap position', 0, 1, 0.01, () => S.trapParam, (v) => { S.trapParam = v; app.iterChanged(); })));
        root.append(h('div', { class: 'sec' }, h('label', null, 'Interior'), segment([[0, 'Black'], [1, 'Period'], [2, 'Trap']], () => S.interior, (v) => { S.interior = v; app.iterChanged(); render(); }, 'Interior colouring')));
        root.append(h('div', { class: 'sec' }, slider('Edge glow', 0, 1.5, 0.01, () => S.glow, (v) => { S.glow = v; app.colourChanged(); }),
          slider('Relief depth', 0.2, 4, 0.05, () => S.relief, (v) => { S.relief = v; app.colourChanged(); })));
        // movable light: drag the sun inside the disc (angle = azimuth, distance from centre = inclination)
        const dot = h('i'), pad = h('div', { class: 'pad', 'aria-label': 'Light direction', role: 'application' }, dot);
        const place = () => { const r = (1 - S.light.el / (Math.PI / 2)) * 40; dot.style.left = 48 + Math.cos(S.light.az) * r + 'px'; dot.style.top = 48 - Math.sin(S.light.az) * r + 'px'; };
        const drag = (e) => { const b = pad.getBoundingClientRect(); const x = e.clientX - b.left - 48, y = 48 - (e.clientY - b.top); S.light.az = Math.atan2(y, x); S.light.el = Math.max(0.12, (1 - Math.min(1, Math.hypot(x, y) / 40)) * Math.PI / 2); place(); app.colourChanged(); };
        pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); drag(e); pad.onpointermove = drag; });
        pad.addEventListener('pointerup', () => { pad.onpointermove = null; });
        place();
        root.append(h('div', { class: 'sec', style: 'display:flex;align-items:center;gap:16px' }, pad, h('div', null, h('div', { class: 'lab' }, 'Light'), h('p', { class: 'hint', style: 'margin:0' }, 'Drag the sun. Centre lights from above; the rim rakes across the surface. Used by Relief.'))));
        return root;
      },
      quality() {
        const root = h('div', null, head('Render quality', 'progressive'));
        root.append(h('div', { class: 'sec' }, h('label', null, 'Refinement samples'), segment([[1, 'Draft'], [8, 'Fine'], [24, 'Ultra'], [96, 'Max']], () => S.quality.samples, (v) => { S.quality.samples = v; app.qualityChanged(); }, 'Samples')));
        root.append(h('div', { class: 'sec' }, h('label', null, 'Pixel ratio'), segment([['1', 'Eco 1×'], ['auto', 'Auto'], ['2', 'Sharp 2×']], () => S.quality.pixelRatio, (v) => { S.quality.pixelRatio = v; app.resize(); }, 'Pixel ratio')));
        root.append(h('div', { class: 'sec' }, h('label', null, 'Frame rate (lower = cooler GPU)'), segment([[60, 'Smooth 60'], [30, 'Balanced 30'], [20, 'Eco 20']], () => S.quality.fpsCap, (v) => { S.quality.fpsCap = v; }, 'Frame rate cap')));
        root.append(h('div', { class: 'sec' }, toggle('Adaptive resolution while moving', () => S.quality.adaptive, (v) => { S.quality.adaptive = v; }),
          slider('Iteration depth', 0.4, 3, 0.05, () => S.quality.iterMul, (v) => { S.quality.iterMul = v; app.iterChanged(); }, (v) => v.toFixed(2) + '×')));
        const st = h('div', { class: 'stats', id: 'qstats' }); root.append(st); root.stats = st;
        return root;
      },
      gallery() {
        const root = h('div', null, head('The collection', app.tourOn ? 'tour in progress' : 'choose a plate'));
        INF.BOOKMARKS.forEach((b, i) => root.append(h('button', { class: 'row', onclick: () => { app.dive(b, i); closePop(); } },
          h('span', { class: 'g', html: svg(b.family === 'julia' ? 'julia_g' : b.family) }), h('span', { class: 't' }, h('b', null, b.title), h('span', null, `Plate ${roman(i + 1)} · ${INF.famById(b.family).name}`)))));
        if (app.user.length) root.append(h('div', { class: 'sec' }, h('label', null, 'Your bookmarks')));
        app.user.forEach((b, i) => root.append(h('button', { class: 'row', onclick: () => { app.goUser(b); closePop(); } },
          h('span', { class: 'g', html: svg(b.family === 'julia' ? 'julia_g' : b.family) }), h('span', { class: 't' }, h('b', null, b.title), h('span', null, `${INF.famById(b.family).name} · 10^${b.depth}`)),
          h('span', { class: 'x', role: 'button', 'aria-label': 'Delete bookmark', html: svg('close').replace('<svg', '<svg width="14" height="14" style="fill:none;stroke:currentColor;stroke-width:1.6"'), onclick: (e) => { e.stopPropagation(); app.deleteUser(i); render(); } }))));
        root.append(h('div', { class: 'btns' }, h('button', { class: 'btn gold', onclick: () => { app.toggleTour(); closePop(); } }, app.tourOn ? 'Stop the tour' : 'Begin the tour'), h('button', { class: 'btn', onclick: () => { app.saveBookmark(); render(); } }, 'Bookmark this view')));
        return root;
      },
      export() {
        const o = app.exportOpts;
        const root = h('div', null, head('Export PNG', 'tiled · up to 4096'));
        root.append(h('div', { class: 'sec' }, h('label', null, 'Long side'), segment([[2048, '2048'], [3072, '3072'], [4096, '4096']], () => o.size, (v) => { o.size = v; }, 'Export size')));
        root.append(h('div', { class: 'sec' }, h('label', null, 'Frame'), segment([['view', 'As on screen'], ['square', 'Square']], () => o.aspect, (v) => { o.aspect = v; }, 'Export aspect')));
        root.append(h('div', { class: 'sec' }, h('label', null, 'Anti-aliasing samples'), segment([[1, '1'], [4, '4'], [9, '9'], [16, '16']], () => o.samples, (v) => { o.samples = v; }, 'Export samples')));
        const prog = h('div', { class: 'progress' }, h('i')), msg = h('p', { class: 'hint' }, 'Rendered in 384 px tiles so the GPU never stalls. The file downloads when finished.');
        root.append(h('div', { class: 'btns' }, h('button', { class: 'btn gold', onclick: async (e) => { e.target.disabled = true; await app.exportPNG((p, text) => { prog.firstChild.style.width = (p * 100) + '%'; if (text) msg.textContent = text; }); e.target.disabled = false; } }, 'Render and save')), prog, msg);
        return root;
      },
    };
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
    const roman = (n) => ROMAN[n] || String(n);
    INF.roman = roman;

    function render() {
      if (!openName) return;
      const scroll = pop.scrollTop; pop.replaceChildren(builders[openName]()); pop.scrollTop = scroll;
      pop.firstChild && (pop.hidden = false);
    }
    function openPop(name) {
      if (openName === name) return closePop();
      openName = name; pop.hidden = false; pop.style.animation = 'none'; void pop.offsetWidth; pop.style.animation = ''; render(); syncButtons();
    }
    function closePop() { openName = null; pop.hidden = true; syncButtons(); }

    /* ---------------- dock ---------------- */
    function dockBtn(id, icon, tip, onclick, pressed) {
      const b = h('button', { class: 'ibtn', id: 'd-' + id, 'data-tip': tip, 'aria-label': tip.replace(/\s*\(.\)$/, ''), html: svg(icon), onclick });
      if (pressed) b.setAttribute('aria-pressed', 'false');
      btns[id] = b; dock.append(b); return b;
    }
    const sep = () => dock.append(h('span', { class: 'sep' }));
    dockBtn('family', 'family', 'Fractal family', () => openPop('family'));
    dockBtn('palette', 'palette', 'Palette (P next)', () => openPop('palette'));
    dockBtn('colour', 'colour', 'Colouring (M mode)', () => openPop('colour'));
    dockBtn('quality', 'quality', 'Render quality', () => openPop('quality'));
    sep();
    dockBtn('gallery', 'gallery', 'Gallery and dives', () => openPop('gallery'));
    dockBtn('tour', 'play', 'Tour (T)', () => app.toggleTour(), true);
    dockBtn('julia', 'julia', 'Julia companion (J)', () => app.toggleJuliaView(), true);
    sep();
    dockBtn('bookmark', 'bookmark', 'Bookmark (B)', () => app.saveBookmark());
    dockBtn('link', 'link', 'Copy link', () => app.share());
    dockBtn('export', 'export', 'Export PNG', () => openPop('export'));
    sep();
    dockBtn('info', 'info', 'Info (I)', () => app.toggleInfo(), true);
    dockBtn('full', 'full', 'Fullscreen (F)', () => app.toggleFullscreen());
    dockBtn('help', 'help', 'Shortcuts (?)', () => app.toggleHelp());
    [['btnUndo', 'undo', () => app.undo()], ['btnRedo', 'redo', () => app.redo()], ['btnHome', 'home', () => app.home()]].forEach(([id, ic, fn]) => { const b = $(id); b.innerHTML = svg(ic); b.onclick = fn; btns[id] = b; });

    function syncButtons() {
      ['family', 'palette', 'colour', 'quality', 'gallery', 'export'].forEach((k) => btns[k].classList.toggle('open', openName === k));
      btns.tour.setAttribute('aria-pressed', String(app.tourOn)); btns.tour.innerHTML = svg(app.tourOn ? 'pause' : 'play');
      btns.julia.setAttribute('aria-pressed', String(S.family === 'julia'));
      btns.info.setAttribute('aria-pressed', String(!$('info').hidden));
      btns.btnUndo.disabled = !app.canUndo(); btns.btnRedo.disabled = !app.canRedo();
    }

    /* ---------------- help overlay ---------------- */
    const KEYS = [['Pan', 'drag · W A S D · arrows'], ['Zoom', 'wheel · pinch · + −'], ['Zoom in at cursor', 'double-click'], ['Zoom out', 'right-click · Shift+dbl'], ['Rotate', 'Q · E'],
      ['Reset view', 'Home'], ['Undo / redo view', 'Alt+← · Alt+→'], ['Next palette', 'P'], ['Next colouring mode', 'M'], ['Julia view / back', 'J'], ['Tour (hands-free)', 'T'], ['Bookmark this view', 'B'],
      ['Fullscreen', 'F'], ['Hide interface', 'H'], ['Info panel', 'I'], ['This overlay', '?'], ['Close popover', 'Esc']];
    function buildHelp() {
      const g = h('div', { class: 'grid' }); KEYS.forEach(([a, b]) => g.append(h('div', { class: 'k' }, h('span', null, a), h('span', null, ...b.split(' · ').flatMap((t, i) => [i ? ' ' : null, h('kbd', null, t)])))));
      $('help').replaceChildren(h('h3', null, 'Shortcuts'), g, h('p', { class: 'hint' }, 'Click anywhere to dismiss.'));
    }
    buildHelp(); $('help').addEventListener('click', () => app.toggleHelp(false));

    document.addEventListener('pointerdown', (e) => { if (openName && !pop.contains(e.target) && !dock.contains(e.target)) closePop(); });

    return {
      openPop, closePop, render, sync: syncButtons, isOpen: () => openName, h,
      statsEl: () => (openName === 'quality' ? document.getElementById('qstats') : null),
      refreshIfOpen: (name) => { if (openName === name) render(); },
    };
  };
})();
