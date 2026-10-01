/* MERIDIAN - application chrome: nav, top bar, filter bar, popovers, date picker, command palette, help, drawer, toasts, shortcuts, CSV export. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D, S = M.S, h = U.h, st = S.st;
  const UI = (M.UI = {});
  UI.ic = (name, size) => h('span.ic', { html: M.icon(name, size) });
  const root = () => document.getElementById('overlay-root');

  /* ---------- floating tooltip (single instance, clamped to viewport) ---------- */
  const tipEl = h('div.gtip', { role: 'tooltip' });
  UI.tip = {
    show(html, x, y) {
      if (!tipEl.parentNode) document.body.appendChild(tipEl);
      tipEl.innerHTML = html; tipEl.classList.add('on');
      const w = tipEl.offsetWidth, hh = tipEl.offsetHeight, vw = innerWidth, vh = innerHeight;
      let left = x + 16, top = y + 16;
      if (left + w > vw - 8) left = x - w - 16;
      if (top + hh > vh - 8) top = y - hh - 16;
      tipEl.style.transform = 'translate(' + Math.round(Math.max(8, left)) + 'px,' + Math.round(Math.max(8, top)) + 'px)';
    },
    hide() { tipEl.classList.remove('on'); },
  };

  /* ---------- toasts ---------- */
  UI.toast = function (msg, opt) {
    opt = opt || {};
    let box = document.getElementById('toasts');
    if (!box) { box = h('div#toasts', { 'aria-live': 'polite' }); document.body.appendChild(box); }
    const t = h('div.toast' + (opt.tone ? '.' + opt.tone : ''), { role: 'status' }, UI.ic(opt.icon || 'info', 16), h('div.toast-b', h('b', opt.title || ''), h('span', msg)));
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    const kill = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 320); };
    setTimeout(kill, opt.ms || 3600);
    while (box.children.length > 4) box.firstChild.remove();
    return t;
  };

  /* ---------- popover manager ---------- */
  let pop = null;
  UI.closePopover = function () {
    if (!pop) return;
    const p = pop; pop = null;
    p.el.classList.remove('in');
    document.removeEventListener('pointerdown', p.onDown, true);
    setTimeout(() => p.el.remove(), 140);
    p.anchor.setAttribute('aria-expanded', 'false');
    if (p.onClose) p.onClose();
  };
  UI.popover = function (anchor, el, opt) {
    opt = opt || {};
    if (pop && pop.anchor === anchor) { UI.closePopover(); return null; }
    UI.closePopover();
    el.classList.add('pop');
    root().appendChild(el);
    const place = () => {
      const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
      let left = opt.align === 'end' ? r.right - w : r.left;
      left = U.clamp(left, 8, innerWidth - w - 8);
      let top = r.bottom + 8;
      if (top + hh > innerHeight - 8 && r.top - hh - 8 > 8) top = r.top - hh - 8;
      top = U.clamp(top, 8, Math.max(8, innerHeight - hh - 8));
      el.style.left = left + 'px'; el.style.top = top + 'px';
    };
    place();
    requestAnimationFrame(() => el.classList.add('in'));
    const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) UI.closePopover(); };
    document.addEventListener('pointerdown', onDown, true);
    anchor.setAttribute('aria-expanded', 'true');
    pop = { el, anchor, onDown, onClose: opt.onClose, place };
    return { place, close: UI.closePopover };
  };
  window.addEventListener('resize', () => { if (pop) pop.place(); });

  /* ---------- nav, top bar, filter bar ---------- */
  const PRESET_NAMES = { '7D': '7D', '30D': '30D', QTD: 'QTD', YTD: 'YTD', '12M': '12M' };

  UI.init = function () {
    const nav = document.getElementById('nav'), tab = document.getElementById('tabbar');
    S.VIEWS.forEach((v) => {
      const mk = (cls) => h('button' + cls, { 'data-view': v.key, title: v.name + '  (G then ' + v.g.toUpperCase() + ')', onclick: () => UI.go(v.key) }, UI.ic(v.icon, 19), h('span.nl', v.name), cls === '.nav-i' ? h('kbd.nk', v.g.toUpperCase()) : null);
      nav.appendChild(mk('.nav-i'));
      tab.appendChild(h('button.tab-i', { 'data-view': v.key, 'aria-label': v.name, onclick: () => UI.go(v.key) }, UI.ic(v.icon, 21), h('span', v.name.split(' ')[0] === 'Live' ? 'Live' : v.name.split(' ')[0])));
    });
    const foot = document.getElementById('navfoot');
    foot.append(
      h('button.ibtn#btn-theme', { 'aria-label': 'Toggle theme', title: 'Toggle theme (T)', onclick: () => S.toggleTheme() }),
      h('button.ibtn#btn-density', { 'aria-label': 'Toggle density', title: 'Toggle density (D)', onclick: () => S.toggleDensity() }, UI.ic('density', 18)),
      h('button.ibtn#btn-help', { 'aria-label': 'Keyboard shortcuts', title: 'Shortcuts (?)', onclick: () => UI.help.toggle() }, UI.ic('help', 18))
    );
    /* top bar */
    const top = document.getElementById('top');
    top.append(
      h('div.top-t', h('h1#vtitle'), h('p#vsub')),
      h('div.top-c',
        h('button.search#btn-palette', { 'aria-label': 'Open command palette', onclick: () => UI.palette.open() }, UI.ic('search', 16), h('span.search-t', 'Search or jump to…'), h('kbd', navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K')),
        h('div.seg#rangeseg', { role: 'group', 'aria-label': 'Date range' }, S.PRESETS.map((p) => h('button', { 'data-r': p, onclick: () => S.set({ range: p }) }, PRESET_NAMES[p]))),
        h('button.dbtn#btn-date', { 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: (e) => UI.datePicker(e.currentTarget) }, UI.ic('calendar', 16), h('span#datelabel'), UI.ic('chevDown', 14)),
        h('button.tog#btn-cmp', { role: 'switch', 'aria-checked': 'true', onclick: () => S.set({ cmp: !st.cmp }) }, h('span.tog-k', h('i')), h('span', 'Compare')),
        h('button.ibtn#btn-export', { 'aria-label': 'Export current view as CSV', title: 'Export CSV (E)', onclick: () => UI.exportCSV() }, UI.ic('download', 18))
      )
    );
    /* filter bar */
    const fb = document.getElementById('fbar');
    fb.append(
      h('span.fl', UI.ic('filter', 14), 'Filters'),
      ...['region', 'category', 'channel'].map((dim) => h('button.fchip#f-' + dim, { 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: (e) => UI.filterMenu(dim, e.currentTarget) }, h('span.fk', dim), h('span.fv'), UI.ic('chevDown', 13))),
      h('button.fclear#f-clear', { onclick: () => S.set({ f: { region: [], category: [], channel: [] } }) }, UI.ic('close', 12), 'Clear'),
      h('span.fmeta#fmeta')
    );
    UI.shortcuts();
    UI.syncChrome();
  };

  UI.go = function (key) { if (key !== st.view) S.set({ view: key }, { push: true }); };

  UI.syncChrome = function () {
    const v = S.VIEWS.find((x) => x.key === st.view);
    document.getElementById('vtitle').textContent = v.name;
    document.getElementById('vsub').textContent = v.sub;
    document.title = v.name + ' · Meridian · Aurelia & Co.';
    U.$$('[data-view]').forEach((b) => { const on = b.getAttribute('data-view') === st.view; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    U.$$('#rangeseg button').forEach((b) => { const on = b.getAttribute('data-r') === st.range; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    document.getElementById('datelabel').textContent = S.rangeLabel();
    document.getElementById('btn-date').classList.toggle('custom', !S.PRESETS.includes(st.range));
    const cmpBtn = document.getElementById('btn-cmp');
    cmpBtn.setAttribute('aria-checked', String(st.cmp)); cmpBtn.classList.toggle('on', st.cmp); cmpBtn.classList.toggle('blocked', S.cmpBlocked());
    cmpBtn.title = S.cmpBlocked() ? 'No comparison data before Aug 19, 2024' : 'Compare to previous period (C)';
    const dark = S.effectiveTheme() === 'dark';
    const tb = document.getElementById('btn-theme');
    tb.innerHTML = M.icon(dark ? 'sun' : 'moon', 18); tb.setAttribute('aria-pressed', String(dark));
    document.getElementById('btn-density').classList.toggle('on', st.density === 'compact');
    ['region', 'category', 'channel'].forEach((dim) => {
      const b = document.getElementById('f-' + dim), sel = st.f[dim];
      b.classList.toggle('on', sel.length > 0);
      b.querySelector('.fv').textContent = sel.length === 0 ? 'All' : sel.length <= 2 ? sel.map((i) => D.DIMS[dim][i].name).join(', ') : sel.length + ' selected';
    });
    document.getElementById('f-clear').hidden = S.filterCount() === 0;
    const c = S.cmp();
    document.getElementById('fmeta').textContent = c ? U.dstr(D.ms(c.i0), 'md') + ' – ' + U.dstr(D.ms(c.i1), 'md') + ' ' + c.label : st.cmp ? 'Comparison unavailable for this range' : 'Comparison off';
  };

  /* ---------- filter menu ---------- */
  UI.filterMenu = function (dim, anchor) {
    const list = h('div.menu-l');
    const titles = { region: 'Region', category: 'Category', channel: 'Channel' };
    const render = () => {
      U.clear(list);
      const rg = S.range(), f = { ...st.f, [dim]: [] };
      const bd = D.byDim(f, dim), tot = bd.m.reduce((a, m) => a + U.sum(m[0], rg.i0, rg.i1), 0) || 1;
      D.DIMS[dim].forEach((m, i) => {
        const on = st.f[dim].includes(i), j = bd.idx.indexOf(i), share = j >= 0 ? U.sum(bd.m[j][0], rg.i0, rg.i1) / tot : 0;
        list.appendChild(h('button.mi', { role: 'menuitemcheckbox', 'aria-checked': String(on), onclick: () => { const a = st.f[dim].slice(); const k = a.indexOf(i); if (k >= 0) a.splice(k, 1); else a.push(i); S.set({ f: { ...st.f, [dim]: a } }); render(); } },
          h('span.cb' + (on ? '.on' : ''), on ? UI.ic('check', 12) : null), h('i.dot', { style: { background: M.color(i) } }), h('span.mn', m.name), h('span.ms', Math.round(share * 100) + '%')));
      });
    };
    render();
    const el = h('div.menu', { role: 'menu', 'aria-label': titles[dim] }, h('div.menu-h', h('b', titles[dim]), h('button.lnk', { onclick: () => { S.set({ f: { ...st.f, [dim]: [] } }); render(); } }, 'Clear')), list);
    UI.popover(anchor, el);
  };

  /* ---------- date picker ---------- */
  UI.datePicker = function (anchor) {
    const rg = S.range();
    let a = rg.i0, b = rg.i1, hover = null, picking = false;
    const last = new Date(D.ms(D.ASOF));
    let vy = last.getUTCFullYear(), vm = last.getUTCMonth() - 1; // left month
    const narrow = innerWidth < 760;
    if (narrow) vm = last.getUTCMonth();
    const cal = h('div.cal'), foot = h('div.cal-f');
    const el = h('div.dp', { role: 'dialog', 'aria-label': 'Choose date range' },
      h('div.dp-presets', S.PRESETS.map((p) => h('button.pp' + (st.range === p ? '.on' : ''), { onclick: () => { S.set({ range: p }); UI.closePopover(); } }, { '7D': 'Last 7 days', '30D': 'Last 30 days', QTD: 'Quarter to date', YTD: 'Year to date', '12M': 'Last 12 months' }[p]))),
      h('div.dp-main', cal, foot));
    const monthEl = (y, m) => {
      const first = Date.UTC(y, m, 1), dow = (new Date(first).getUTCDay() + 6) % 7, days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const grid = h('div.cal-g', ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => h('span.cw', x)));
      for (let i = 0; i < dow; i++) grid.appendChild(h('span.cd.e'));
      for (let d = 1; d <= days; d++) {
        const di = D.dayOf(y, m + 1, d), off = di < 0 || di > D.ASOF;
        let lo = a, hi = picking ? (hover != null ? hover : a) : b;
        if (lo > hi) { const t = lo; lo = hi; hi = t; }
        const cls = ['cd']; if (!off && di >= lo && di <= hi) cls.push('in'); if (di === lo) cls.push('s'); if (di === hi) cls.push('e2'); if (di === D.ASOF) cls.push('today');
        grid.appendChild(h('button', { class: cls.join(' '), disabled: off, 'data-d': di, 'aria-label': U.dstr(D.ms(Math.max(0, di)), 'long'), 'aria-pressed': di >= lo && di <= hi ? 'true' : 'false',
          onclick: () => { if (!picking) { a = di; b = di; picking = true; hover = di; } else { b = di; if (b < a) { const t = a; a = b; b = t; } picking = false; hover = null; } render(); },
          onmouseenter: () => { if (picking) { hover = di; paintHover(); } } }, String(d)));
      }
      return h('div.cal-m', h('div.cal-mh', U.MONL[m] + ' ' + y), grid);
    };
    const paintHover = () => {
      let lo = a, hi = hover; if (lo > hi) { const t = lo; lo = hi; hi = t; }
      U.$$('.cd[data-d]', cal).forEach((n) => { const di = +n.getAttribute('data-d'); n.classList.toggle('in', di >= lo && di <= hi && !n.disabled); n.classList.toggle('s', di === lo); n.classList.toggle('e2', di === hi); });
    };
    const render = () => {
      U.clear(cal); U.clear(foot);
      const y2 = vm + 1 > 11 ? vy + 1 : vy, m2 = (vm + 1) % 12;
      const canPrev = D.dayOf(vy, vm + 1, 1) > 0, canNext = narrow ? D.dayOf(vy, vm + 2, 1) <= D.ASOF : D.dayOf(y2, m2 + 2, 1) <= D.ASOF;
      cal.append(
        h('button.cal-nav.l', { 'aria-label': 'Previous month', disabled: !canPrev, onclick: () => { vm--; if (vm < 0) { vm = 11; vy--; } render(); } }, UI.ic('chevLeft', 16)),
        h('button.cal-nav.r', { 'aria-label': 'Next month', disabled: !canNext, onclick: () => { vm++; if (vm > 11) { vm = 0; vy++; } render(); } }, UI.ic('chevRight', 16)),
        monthEl(vy, vm), narrow ? null : monthEl(y2, m2));
      const lo = Math.min(a, b), hi = Math.max(a, b);
      foot.append(h('span.cal-s', U.dstr(D.ms(lo), 'md') + ' – ' + U.dstr(D.ms(hi)) + '  ·  ' + (hi - lo + 1) + ' days'), h('span.sp'), h('button.btn', { onclick: () => UI.closePopover() }, 'Cancel'), h('button.btn.pri', { disabled: picking, onclick: () => { S.set({ range: S.customRange(lo, hi) }); UI.closePopover(); } }, 'Apply'));
      foot.append(h('span.cal-n', 'Data available ' + U.dstr(D.ms(0)) + ' – ' + U.dstr(D.ms(D.ASOF))));
    };
    render();
    UI.popover(anchor, el, { align: 'end' });
  };

  /* ---------- drawer (slide-over) ---------- */
  let drawer = null;
  UI.drawer = {
    open(title, sub, body, onClose) {
      UI.drawer.close(true);
      const scrim = h('div.scrim', { onclick: () => UI.drawer.close() });
      const closeBtn = h('button.ibtn', { 'aria-label': 'Close panel', onclick: () => UI.drawer.close() }, UI.ic('close', 18));
      const el = h('aside.drawer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('header.dr-h', h('div', h('p.micro', sub), h('h2', title)), closeBtn), h('div.dr-b', body));
      root().append(scrim, el);
      requestAnimationFrame(() => { scrim.classList.add('in'); el.classList.add('in'); closeBtn.focus(); });
      drawer = { el, scrim, onClose, prev: document.activeElement };
    },
    close(silent) {
      if (!drawer) return;
      const d = drawer; drawer = null;
      d.el.classList.remove('in'); d.scrim.classList.remove('in');
      setTimeout(() => { d.el.remove(); d.scrim.remove(); }, 320);
      if (!silent && d.onClose) d.onClose();
      if (d.prev && d.prev.focus) d.prev.focus();
    },
    isOpen: () => !!drawer,
  };

  /* ---------- overlays: palette + help ---------- */
  let overlay = null;
  function openModal(cls, el, onClose) {
    closeModal();
    const scrim = h('div.scrim.dim', { onclick: closeModal });
    const wrap = h('div.modal-w', { onclick: (e) => { if (e.target === wrap) closeModal(); } }, el);
    root().append(scrim, wrap);
    requestAnimationFrame(() => { scrim.classList.add('in'); wrap.classList.add('in'); });
    overlay = { scrim, wrap, onClose, prev: document.activeElement, cls };
  }
  function closeModal() {
    if (!overlay) return;
    const o = overlay; overlay = null;
    o.scrim.classList.remove('in'); o.wrap.classList.remove('in');
    setTimeout(() => { o.scrim.remove(); o.wrap.remove(); }, 200);
    if (o.prev && o.prev.focus) o.prev.focus();
    if (o.onClose) o.onClose();
  }

  UI.help = {
    toggle() { if (overlay && overlay.cls === 'help') closeModal(); else UI.help.open(); },
    open() {
      const rows = [
        ['Navigation', [['G then O', 'Overview'], ['G then R', 'Revenue Explorer'], ['G then G', 'Geography'], ['G then F', 'Funnel & Cohorts'], ['G then P', 'Products'], ['G then L', 'Live Orders']]],
        ['Global', [['Ctrl / ⌘ K', 'Command palette'], ['/', 'Focus search'], ['C', 'Toggle comparison'], ['T', 'Toggle theme'], ['D', 'Toggle density'], ['E', 'Export view as CSV'], ['?', 'This overlay'], ['Esc', 'Close anything']]],
        ['Charts', [['Drag', 'Brush to zoom (Revenue Explorer)'], ['Double-click', 'Reset zoom'], ['← →', 'Nudge minimap handles'], ['Hover', 'Crosshair and tooltip']]],
      ];
      const el = h('div.help', { role: 'dialog', 'aria-label': 'Keyboard shortcuts' }, h('header', h('h2', 'Keyboard shortcuts'), h('button.ibtn', { 'aria-label': 'Close', onclick: closeModal }, UI.ic('close', 18))),
        h('div.help-g', rows.map((g) => h('section', h('p.micro', g[0]), g[1].map((r) => h('div.hr', h('span', r[1]), h('span.keys', r[0].split(' ').map((k) => (k === 'then' || k === '/' ? h('em', k) : h('kbd', k))))))))));
      openModal('help', el);
      el.querySelector('button').focus();
    },
  };

  UI.palette = (function () {
    let input, list, items = [], active = 0;
    function commands(q) {
      const out = [];
      S.VIEWS.forEach((v) => out.push({ g: 'Navigate', label: 'Go to ' + v.name, icon: v.icon, hint: ['G', v.g.toUpperCase()], kw: v.key, run: () => UI.go(v.key) }));
      S.PRESETS.forEach((p) => out.push({ g: 'Date range', label: { '7D': 'Last 7 days', '30D': 'Last 30 days', QTD: 'Quarter to date', YTD: 'Year to date', '12M': 'Last 12 months' }[p], icon: 'calendar', kw: p + ' range period', run: () => S.set({ range: p }) }));
      out.push({ g: 'Toggle', label: (st.cmp ? 'Turn off' : 'Turn on') + ' comparison', icon: 'compare', hint: ['C'], kw: 'compare previous period', run: () => S.set({ cmp: !st.cmp }) });
      out.push({ g: 'Toggle', label: 'Switch to ' + (S.effectiveTheme() === 'dark' ? 'light' : 'dark') + ' theme', icon: S.effectiveTheme() === 'dark' ? 'sun' : 'moon', hint: ['T'], kw: 'theme dark light appearance', run: () => S.toggleTheme() });
      out.push({ g: 'Toggle', label: 'Switch to ' + (st.density === 'compact' ? 'comfortable' : 'compact') + ' density', icon: 'density', hint: ['D'], kw: 'density compact comfortable spacing', run: () => S.toggleDensity() });
      D.REGIONS.forEach((r, i) => out.push({ g: 'Filter', label: (st.f.region.includes(i) ? 'Remove region filter: ' : 'Filter region: ') + r.name, icon: 'geography', kw: 'region filter ' + r.key, run: () => { const a = st.f.region.slice(); const k = a.indexOf(i); if (k >= 0) a.splice(k, 1); else a.push(i); S.set({ f: { ...st.f, region: a } }); } }));
      if (S.filterCount()) out.push({ g: 'Filter', label: 'Clear all filters', icon: 'close', kw: 'reset clear filters', run: () => S.set({ f: { region: [], category: [], channel: [] } }) });
      out.push({ g: 'Data', label: 'Export current view as CSV', icon: 'download', hint: ['E'], kw: 'download csv export', run: () => UI.exportCSV() });
      out.push({ g: 'Help', label: 'Keyboard shortcuts', icon: 'help', hint: ['?'], kw: 'help shortcuts keys', run: () => setTimeout(UI.help.open, 60) });
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      let res = out.filter((c) => terms.every((t) => (c.label + ' ' + c.kw).toLowerCase().includes(t)));
      if (terms.length) D.SKUS.forEach((s) => { const hay = (s.name + ' ' + s.id + ' ' + D.CATS[s.cat].name).toLowerCase(); if (terms.every((t) => hay.includes(t))) res.push({ g: 'Jump to product', label: s.name, sub: s.id + ' · ' + D.CATS[s.cat].name, icon: 'box', run: () => { S.set({ view: 'products', v: { products: { sku: s.id } } }, { push: true }); } }); });
      if (!terms.length) res = res.filter((c) => c.g !== 'Filter' || c.label.startsWith('Clear'));
      return res.slice(0, 40);
    }
    function render() {
      items = commands(input.value);
      active = Math.min(active, Math.max(0, items.length - 1));
      U.clear(list);
      if (!items.length) { list.appendChild(h('div.pal-empty', 'No matches for “' + input.value + '”. Try a view, a range such as “12M”, or a product name.')); return; }
      let g = '';
      items.forEach((it, i) => {
        if (it.g !== g) { g = it.g; list.appendChild(h('div.pal-g', g)); }
        list.appendChild(h('button.pal-i' + (i === active ? '.on' : ''), { role: 'option', 'aria-selected': String(i === active), 'data-i': i, onmousemove: () => { if (active !== i) { active = i; mark(); } }, onclick: () => run(i) },
          UI.ic(it.icon, 17), h('span.pl', it.label, it.sub ? h('small', it.sub) : null), it.hint ? h('span.keys', it.hint.map((k) => h('kbd', k))) : null));
      });
    }
    function mark() { U.$$('.pal-i', list).forEach((n, i) => { n.classList.toggle('on', i === active); n.setAttribute('aria-selected', String(i === active)); if (i === active) n.scrollIntoView({ block: 'nearest' }); }); }
    function run(i) { const it = items[i]; if (!it) return; closeModal(); setTimeout(() => it.run(), 30); }
    return {
      open(q) {
        active = 0;
        input = h('input.pal-in', { type: 'text', placeholder: 'Type a command, view, range or product…', 'aria-label': 'Command palette', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', oninput: () => { active = 0; render(); },
          onkeydown: (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, items.length); mark(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % Math.max(1, items.length); mark(); }
            else if (e.key === 'Enter') { e.preventDefault(); run(active); }
          } });
        list = h('div.pal-l', { role: 'listbox' });
        const el = h('div.pal', { role: 'dialog', 'aria-label': 'Command palette' }, h('div.pal-s', UI.ic('search', 18), input, h('kbd', 'Esc')), list,
          h('footer.pal-f', h('span', h('kbd', '↑'), h('kbd', '↓'), ' navigate'), h('span', h('kbd', '↵'), ' select'), h('span.sp'), h('span', 'Meridian commands')));
        if (q) input.value = q;
        openModal('palette', el);
        render(); input.focus();
      },
      toggle() { if (overlay && overlay.cls === 'palette') closeModal(); else UI.palette.open(); },
    };
  })();

  /* ---------- CSV export ---------- */
  UI.csv = function () {
    const view = M.current;
    if (!view || !view.csv) return null;
    const rows = view.csv();
    const c = S.cmp();
    const stamp = S.rangeLabel().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    return { name: 'meridian-' + st.view + '-' + stamp + (c ? '-vs-prev' : '') + '.csv', text: U.toCSV(rows), rows: rows.length - 1 };
  };
  UI.exportCSV = function () {
    const out = UI.csv();
    if (!out) return;
    U.download(out.name, out.text);
    UI.toast(out.rows + ' rows · ' + out.name, { title: 'CSV exported', icon: 'download', tone: 'ok' });
  };

  /* ---------- keyboard ---------- */
  UI.shortcuts = function () {
    let gUntil = 0;
    const gi = h('div.gind', { 'aria-hidden': 'true' }, h('kbd', 'G'), ' then O R G F P L');
    document.body.appendChild(gi);
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); UI.palette.toggle(); return; }
      if (e.key === 'Escape') {
        if (overlay) { closeModal(); return; }
        if (pop) { UI.closePopover(); return; }
        if (drawer) { UI.drawer.close(); return; }
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); UI.help.toggle(); return; }
      if (e.key === '/') { e.preventDefault(); const s = document.querySelector('[data-search]'); if (s) s.focus(); else UI.palette.open(); return; }
      const k = e.key.toLowerCase();
      if (gUntil && Date.now() < gUntil) {
        gUntil = 0; gi.classList.remove('on');
        const v = S.VIEWS.find((x) => x.g === k);
        if (v) { e.preventDefault(); UI.go(v.key); }
        return;
      }
      if (k === 'g') { gUntil = Date.now() + 1400; gi.classList.add('on'); setTimeout(() => { if (Date.now() >= gUntil) gi.classList.remove('on'); }, 1450); return; }
      if (k === 't') S.toggleTheme(); else if (k === 'd') S.toggleDensity(); else if (k === 'c') S.set({ cmp: !st.cmp }); else if (k === 'e') UI.exportCSV();
    });
  };
})((window.M = window.M || {}));
