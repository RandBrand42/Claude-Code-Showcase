/* Mnemo UI: layout, sidebar, reader, context panel, palette, graph view, shortcuts. */
(function (M) {
  'use strict';
  const { $, $$, esc, icon } = M, Md = M.md, S = M.store, E = M.editor;
  const UI_KEY = 'mnemo.v1.ui';
  const DAY = 864e5;

  const st = M.state = Object.assign({ activeId: null, mode: 'split', view: 'notes', sbOpen: true, cxOpen: true, cxTab: 'links', focus: false, theme: null, dropcap: true, depth: 1, colorMode: 'cluster', labels: true, recent: [] }, M.storage.get(UI_KEY, {}));
  st.view = 'notes'; st.focus = false;
  const saveUi = M.debounce(() => M.storage.set(UI_KEY, { activeId: st.activeId, mode: st.mode, sbOpen: st.sbOpen, cxOpen: st.cxOpen, cxTab: st.cxTab, theme: st.theme, dropcap: st.dropcap, depth: st.depth, colorMode: st.colorMode, labels: st.labels, recent: st.recent }), 300);
  const narrow = window.matchMedia('(max-width: 820px)'), mid = window.matchMedia('(max-width: 1100px)');
  let drawerSb = false, drawerCx = false, dirty = false, els = {};
  const nav = { stack: [], pos: -1 };

  /* ---------- theme ---------- */
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  function effectiveTheme() { return st.theme || (systemDark.matches ? 'dark' : 'light'); }
  function applyTheme() {
    const t = effectiveTheme(); document.documentElement.dataset.theme = t;
    if (els.btnTheme) els.btnTheme.innerHTML = icon(t === 'dark' ? 'sun' : 'moon') + '<span class="sr-only">Switch theme</span>';
  }
  function toggleTheme() { st.theme = effectiveTheme() === 'dark' ? 'light' : 'dark'; applyTheme(); saveUi(); }
  systemDark.addEventListener('change', () => { if (!st.theme) applyTheme(); });

  /* ---------- layout ---------- */
  function applyLayout() {
    const a = els.app;
    a.classList.toggle('no-sb', !narrow.matches && !st.sbOpen);
    a.classList.toggle('no-cx', !mid.matches && !st.cxOpen);
    a.classList.toggle('sb-open', narrow.matches && drawerSb);
    a.classList.toggle('cx-open', mid.matches && drawerCx);
    a.classList.toggle('focus', st.focus);
    a.dataset.view = st.view;
    els.noteView.dataset.mode = effMode();
    $$('#mode-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
    els.paneEdit.inert = effMode() === 'read'; els.paneRead.inert = effMode() === 'edit';
    $$('#bottomnav button').forEach(b => b.setAttribute('aria-current', String((b.dataset.tab === 'notes' && drawerSb) || (b.dataset.tab === 'links' && drawerCx) || (b.dataset.tab === 'graph' && st.view === 'graph') || (b.dataset.tab === 'write' && st.view === 'notes' && !drawerSb && !drawerCx))));
    els.sbToggle.setAttribute('aria-expanded', String(narrow.matches ? drawerSb : st.sbOpen)); els.cxToggle.setAttribute('aria-expanded', String(mid.matches ? drawerCx : st.cxOpen));
    $$('#cx-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === st.cxTab)));
    $$('.cx-page').forEach(p => { p.hidden = p.dataset.page !== st.cxTab; });
    setTimeout(() => { M.big && M.big.resize(); M.mini && M.mini.resize(); }, 320);
  }
  const effMode = () => (narrow.matches && st.mode === 'split') ? 'edit' : st.mode;
  function setMode(m) { st.mode = m; applyLayout(); saveUi(); if (m !== 'edit') renderRead(); if (m !== 'read' && !narrow.matches) E.focus(); }
  function cycleMode() { const order = narrow.matches ? ['edit', 'read'] : ['edit', 'split', 'read']; setMode(order[(order.indexOf(effMode()) + 1) % order.length]); }
  function toggleSidebar() { if (narrow.matches) drawerSb = !drawerSb; else st.sbOpen = !st.sbOpen; if (drawerSb) drawerCx = false; applyLayout(); saveUi(); }
  function toggleContext() { if (mid.matches) drawerCx = !drawerCx; else st.cxOpen = !st.cxOpen; if (drawerCx) drawerSb = false; applyLayout(); saveUi(); }
  function closeDrawers() { drawerSb = drawerCx = false; applyLayout(); }
  function toggleFocus() { st.focus = !st.focus; if (st.focus && st.view !== 'notes') setView('notes'); E.setTypewriter(st.focus); applyLayout(); if (st.focus) { if (st.mode === 'read') st.mode = 'edit'; applyLayout(); E.focus(); M.toast('Focus mode - Esc to leave', { ms: 2200 }); } }
  [narrow, mid].forEach(q => q.addEventListener('change', () => { drawerSb = drawerCx = false; applyLayout(); }));

  /* ---------- notes: open / save ---------- */
  const fmtMeta = n => 'Created ' + M.fmtDate(n.created) + ' · Edited ' + M.ago(n.updated);
  function openNote(id, o) {
    o = o || {};
    const n = S.get(id); if (!n) return;
    saveNow();
    if (st.view !== 'notes') setView('notes', true);
    const changed = id !== st.activeId;
    st.activeId = id;
    st.recent = [id].concat(st.recent.filter(x => x !== id && S.get(x))).slice(0, 12);
    if (!o.nav && changed) { nav.stack = nav.stack.slice(0, nav.pos + 1); nav.stack.push(id); nav.pos = nav.stack.length - 1; }
    E.open(n); els.title.value = n.title;
    renderHeaderMeta(); renderRead(); renderContext(); renderSidebar(); syncGraphs();
    if (changed) { els.panes.classList.remove('enter'); void els.panes.offsetWidth; els.panes.classList.add('enter'); els.readScroll.scrollTop = 0; }
    if (narrow.matches) { drawerSb = false; drawerCx = false; }
    applyLayout(); saveUi(); updateNavButtons();
    if (o.focus) { if (st.mode === 'read') setMode('edit'); else E.focus(); }
    if (o.heading) setTimeout(() => scrollToHeadingText(o.heading), 60);
  }
  function saveNow() { if (!dirty) return; dirty = false; saveDebounced.cancel(); if (S.get(E.noteId)) S.update(E.noteId, { body: E.value() }); setSaved(); }
  const saveDebounced = M.debounce(saveNow, 450);
  let savedTimer = 0;
  function setSaving() { els.save.className = 'save-ind is-saving'; els.save.lastChild.textContent = 'Saving'; }
  function setSaved() { els.save.className = 'save-ind is-saved'; els.save.lastChild.textContent = 'Saved'; clearTimeout(savedTimer); savedTimer = setTimeout(() => { els.save.className = 'save-ind'; }, 2200); }
  const renderReadSoon = M.debounce(() => renderRead(), 110);
  function onEditorChange(v) { dirty = true; setSaving(); saveDebounced(); if (effMode() !== 'edit') renderReadSoon(); updateStats(v); }
  function updateStats(v) {
    const words = Md.wordCount(v);
    els.statusL.textContent = words.toLocaleString() + ' words · ' + Math.max(1, Math.round(words / 230)) + ' min read';
  }
  function renderHeaderMeta() {
    const n = S.get(st.activeId); if (!n) return;
    if (document.activeElement !== els.title) els.title.value = n.title;
    els.meta.textContent = fmtMeta(n);
    els.tags.innerHTML = S.tags(n.id).map(t => '<a class="tag" href="#" data-tag="' + esc(t) + '">#' + esc(t) + '</a>').join('');
    els.pinBtn.setAttribute('aria-pressed', String(n.pinned)); els.pinBtn.title = n.pinned ? 'Unpin note' : 'Pin note';
    updateStats(E.value());
  }
  function newNote(title, o) {
    saveNow();
    const n = S.create({ title: title || 'Untitled', body: (o && o.body) || '' });
    st.mode = st.mode === 'read' ? 'split' : st.mode;
    openNote(n.id, { focus: !title });
    if (!title) { els.title.focus(); els.title.select(); }
    return n;
  }
  function renameTo(val) {
    const n = S.get(st.activeId); if (!n) return;
    saveNow();
    const r = S.rename(n.id, val);
    if (r.error) { M.toast(r.error); els.title.value = n.title; }
    else if (r.changed && !r.links) M.toast('Renamed.', { ms: 2200 });
    else if (r.changed) M.toast('Renamed. Updated ' + r.links + ' link' + (r.links === 1 ? '' : 's') + ' in ' + r.files + ' note' + (r.files === 1 ? '' : 's') + '.');
    else els.title.value = n.title;
  }
  function deleteCurrent() {
    const n = S.get(st.activeId); if (!n) return;
    saveNow();
    const removed = S.remove(n.id);
    const next = st.recent.map(S.get).find(Boolean) || S.all()[0];
    if (next) openNote(next.id);
    M.toast('Deleted “' + removed.title + '”', { action: 'Undo', ms: 7000, onAction: () => { S.reinsert(removed); openNote(removed.id); } });
  }
  function openDaily() {
    const existed = !!S.byTitle(M.isoDate());
    const n = S.daily(); openNote(n.id, { focus: true });
    if (!existed) M.toast('Created today’s daily note');
  }
  function onStoreChange(type, id) {
    if (type === 'structure' && !S.get(st.activeId)) { const n = S.all()[0]; if (n) return openNote(n.id); }
    if ((type === 'change' || type === 'structure') && id === st.activeId) {
      const n = S.get(id);
      if (n && n.body !== E.value()) { E.setValue(n.body); renderRead(); }
      if (n && document.activeElement !== els.title) els.title.value = n.title;
    }
    refreshDerived();
  }
  const refreshDerived = M.raf(() => { renderHeaderMeta(); renderSidebar(); renderContext(); syncGraphs(); });

  /* ---------- sidebar ---------- */
  let analysis = null, gsig = '';
  function getAnalysis() {
    const g = S.graph(), sig = g.nodes.map(n => n.id + n.tags.join()).join('|') + '#' + g.edges.map(e => e.join('-')).join('|');
    if (sig !== gsig) { gsig = sig; analysis = M.Graph.analyze(g.nodes, g.edges); analysis.data = g; analysis.fresh = true; }
    return analysis;
  }
  function dotColor(id) {
    const a = getAnalysis(), c = a.clusters[a.cluster.get(id)];
    return c ? c.color : '#8d9bb5';
  }
  function noteItem(n, extra) {
    const back = S.incoming(n.id).length;
    return '<li><a class="nl" href="#" data-id="' + n.id + '"' + (n.id === st.activeId ? ' aria-current="page"' : '') + '><span class="nl-dot" style="--c:' + dotColor(n.id) + '"></span><span class="nl-t">' + esc(n.title) + '</span>' + (extra || '') + (back ? '<span class="nl-n" title="' + back + ' backlinks">' + back + '</span>' : '') + '</a></li>';
  }
  function renderSidebar() {
    const all = S.all().sort((a, b) => a.title.localeCompare(b.title));
    const pinned = all.filter(n => n.pinned);
    els.secPinned.hidden = !pinned.length;
    els.listPinned.innerHTML = pinned.map(n => noteItem(n)).join('');
    const recent = st.recent.map(S.get).filter(Boolean).slice(0, 6);
    els.listRecent.innerHTML = recent.map(n => noteItem(n, '<span class="nl-ago">' + M.ago(n.updated) + '</span>')).join('');
    els.listAll.innerHTML = all.map(n => noteItem(n)).join('');
    els.countAll.textContent = all.length;
    els.tagCloud.innerHTML = S.tagCounts().slice(0, 18).map(t => '<a class="tagchip" href="#" data-tag="' + esc(t.tag) + '"><span>#' + esc(t.tag) + '</span><b>' + t.count + '</b></a>').join('');
  }
  let searchQ = '';
  function runSearch(q) {
    searchQ = q.trim();
    els.sbLists.hidden = !!searchQ; els.results.hidden = !searchQ;
    if (!searchQ) return;
    const res = S.search(searchQ);
    els.results.innerHTML = '<div class="label res-head">' + res.length + ' result' + (res.length === 1 ? '' : 's') + '</div>' + (res.length ? res.map(r => {
      const n = S.get(r.id), title = searchQ[0] === '#' ? esc(n.title) : esc(n.title).replace(new RegExp('(' + searchQ.split(/\s+/).filter(Boolean).map(t => M.escRe(esc(t))).join('|') + ')', 'gi'), '<mark>$1</mark>');
      return '<a class="sr" href="#" data-id="' + n.id + '"><span class="sr-t"><span class="nl-dot" style="--c:' + dotColor(n.id) + '"></span>' + title + '</span><span class="sr-s">' + r.snippet + '</span></a>';
    }).join('') : '<div class="empty"><p>Nothing matches “' + esc(searchQ) + '”.</p><button class="btn" data-create="' + esc(searchQ) + '">Create this note</button></div>');
  }
  function searchFor(q) {
    if (narrow.matches) { drawerSb = true; drawerCx = false; } else if (!st.sbOpen) st.sbOpen = true;
    applyLayout(); els.search.value = q; runSearch(q); els.search.focus();
  }

  /* ---------- reader ---------- */
  function renderRead() {
    const src = E.value(), y = els.readScroll.scrollTop;
    els.read.innerHTML = Md.render(src, { resolve: S.resolve });
    els.read.classList.toggle('dropcap', st.dropcap);
    els.readScroll.scrollTop = y;
    if (!src.trim()) els.read.innerHTML = '<div class="empty big"><p>This note is empty.</p><p class="hint">Switch to Edit and start writing - type <kbd>[[</kbd> to link to another note.</p></div>';
  }
  function toggleTask(line, checked) {
    const lines = E.value().split('\n'); if (lines[line] == null) return;
    lines[line] = lines[line].replace(/\[( |x|X)\]/, checked ? '[x]' : '[ ]');
    const v = lines.join('\n'); E.setValue(v); onEditorChange(v); renderRead();
  }
  function scrollToHeadingText(h) {
    const want = Md.slug(h);
    const el = $$('#read-body h1,#read-body h2,#read-body h3,#read-body h4,#read-body h5,#read-body h6').find(x => x.id.replace(/^h-/, '').replace(/-\d+$/, '') === want);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function scrollToLine(line) {
    const m = effMode();
    if (m !== 'edit') {
      const el = $$('#read-body [data-line]').filter(x => +x.dataset.line <= line).pop();
      if (el) els.readScroll.scrollTo({ top: Math.max(0, el.offsetTop - 24), behavior: 'smooth' });
    }
    if (m !== 'read') E.goToLine(line);
  }
  function followLink(a) {
    if (a.dataset.id) { openNote(a.dataset.id, { heading: a.dataset.heading, focus: false }); return; }
    const t = a.dataset.target; if (!t) return;
    const n = S.create({ title: t, body: '' }); M.toast('Created “' + n.title + '”'); openNote(n.id, { focus: true });
  }
  function bindReader() {
    document.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (a && a.classList.contains('wikilink')) { e.preventDefault(); hideCard(); followLink(a); return; }
      if (a && a.classList.contains('tag')) { e.preventDefault(); searchFor('#' + a.dataset.tag); return; }
      if (a && a.dataset.fn) { e.preventDefault(); const li = $('#read-body li[data-fnid="' + a.dataset.fn + '"]'); if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash'); } return; }
      if (a && a.dataset.fnref) { e.preventDefault(); const r = $('#read-body a[data-fn="' + a.dataset.fnref + '"]'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (a && a.classList.contains('blocked')) { e.preventDefault(); M.toast('That link uses an unsafe scheme and was disabled.'); return; }
      if (a && els.read.contains(a) && a.getAttribute('href') === '#') { e.preventDefault(); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) { const code = cp.closest('.codeblock').querySelector('code').textContent; copyText(code).then(() => { cp.textContent = 'Copied'; setTimeout(() => { cp.textContent = 'Copy'; }, 1400); }); }
    });
    els.read.addEventListener('change', e => { const cb = e.target; if (cb.matches('input[type=checkbox][data-line]')) toggleTask(+cb.dataset.line, cb.checked); });
    // hover preview cards
    let timer = 0, hideT = 0;
    document.addEventListener('mouseover', e => {
      const a = e.target.closest && e.target.closest('a.wikilink');
      if (a) { clearTimeout(hideT); clearTimeout(timer); timer = setTimeout(() => showCard(a), 260); }
      else if (e.target.closest && e.target.closest('#hovercard')) clearTimeout(hideT);
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest && (e.target.closest('a.wikilink') || e.target.closest('#hovercard'))) { clearTimeout(timer); hideT = setTimeout(hideCard, 180); }
    });
    // reading progress + outline spy
    els.readScroll.addEventListener('scroll', M.raf(() => {
      const s = els.readScroll, p = s.scrollTop / Math.max(1, s.scrollHeight - s.clientHeight);
      els.progress.style.transform = 'scaleX(' + M.clamp(p, 0, 1) + ')';
      const hs = $$('#read-body h1,#read-body h2,#read-body h3,#read-body h4'); let cur = null;
      hs.forEach(h => { if (h.offsetTop - 90 <= s.scrollTop) cur = h.dataset.line; });
      $$('#cx-outline a').forEach(a => a.classList.toggle('on', a.dataset.line === cur));
    }), { passive: true });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
    return fallbackCopy(t);
  }
  function fallbackCopy(t) { const x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } x.remove(); return Promise.resolve(); }
  function showCard(a) {
    const card = els.card, n = a.dataset.id && S.get(a.dataset.id);
    if (!n) {
      card.innerHTML = '<div class="hc-t">' + esc(a.dataset.target || '') + '</div><p class="hc-empty">Not created yet. Click to start this note.</p>';
    } else {
      const body = n.body.replace(/^#\s.*\n+/, '').slice(0, 560);
      card.innerHTML = '<div class="hc-t">' + esc(n.title) + '</div><div class="hc-b read">' + Md.render(body, { resolve: S.resolve, idPrefix: 'hc' }) + '</div><div class="hc-f">' + S.incoming(n.id).length + ' backlinks · ' + M.ago(n.updated) + '</div>';
    }
    card.hidden = false;
    const r = a.getBoundingClientRect(), cw = card.offsetWidth, chh = card.offsetHeight;
    let x = M.clamp(r.left - 12, 10, window.innerWidth - cw - 10), y = r.bottom + 8;
    if (y + chh > window.innerHeight - 10) y = Math.max(10, r.top - chh - 8);
    card.style.left = x + 'px'; card.style.top = y + 'px'; card.classList.add('show');
  }
  function hideCard() { els.card.classList.remove('show'); els.card.hidden = true; }

  /* ---------- context panel: links, outline, history ---------- */
  function ctxSnippet(line, title) {
    let t = line.replace(/^[\s>#*+-]+/, '').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '\u0001$2\u0002').replace(/[*_`~=]/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    let i = t.indexOf('\u0001'); if (i < 0) i = t.toLowerCase().indexOf(title.toLowerCase()); i = Math.max(0, i);
    const a = Math.max(0, i - 55), b = Math.min(t.length, i + 100);
    t = (a ? '…' : '') + t.slice(a, b) + (b < t.length ? '…' : '');
    return esc(t).replace(/\u0001(.*?)\u0002/g, '<mark>$1</mark>').replace(/\u0001|\u0002/g, '');
  }
  function renderContext() {
    const n = S.get(st.activeId); if (!n) return;
    const back = S.backlinks(n.id), unl = S.unlinkedMentions(n.id), out = S.outgoing(n.id).map(S.get), unres = S.unresolvedOf(n.id);
    let h = '<section><h4 class="label">Linked mentions <span class="count">' + back.length + '</span></h4>';
    h += back.length ? back.map(b => '<a class="bl" href="#" data-id="' + b.id + '"><span class="bl-t"><span class="nl-dot" style="--c:' + dotColor(b.id) + '"></span>' + esc(b.title) + '</span><span class="bl-s">' + ctxSnippet(b.snippet, n.title) + '</span></a>').join('') : '<p class="empty-s">Nothing links here yet. From another note, type <kbd>[[</kbd> and pick this one.</p>';
    h += '</section><section><h4 class="label">Unlinked mentions <span class="count">' + unl.length + '</span></h4>';
    h += unl.length ? unl.map(b => '<div class="bl um"><a class="bl-t" href="#" data-id="' + b.id + '"><span class="nl-dot" style="--c:' + dotColor(b.id) + '"></span>' + esc(b.title) + '</a><span class="bl-s">' + ctxSnippet(b.snippet, n.title) + '</span><button class="btn sm" data-link-mention="' + b.id + '">' + icon('link') + 'Link it</button></div>').join('') : '<p class="empty-s">No plain-text mentions of “' + esc(n.title) + '” elsewhere.</p>';
    h += '</section><section><h4 class="label">Outgoing links <span class="count">' + (out.length + unres.length) + '</span></h4><div class="chips">' +
      out.map(o => '<a class="chip" href="#" data-id="' + o.id + '"><span class="nl-dot" style="--c:' + dotColor(o.id) + '"></span>' + esc(o.title) + '</a>').join('') +
      unres.map(u => '<a class="chip dashed" href="#" data-create="' + esc(u) + '" title="Not created yet - click to create">' + icon('plus') + esc(u) + '</a>').join('') + '</div></section>';
    $('#cx-links').innerHTML = h;
    $('#badge-links').textContent = back.length;
    // outline
    const hs = S.headings(n.id), minL = Math.min.apply(null, hs.map(x => x.level).concat([6]));
    $('#cx-outline').innerHTML = hs.length ? '<ul class="outline">' + hs.map(x => '<li style="--lv:' + (x.level - minL) + '"><a href="#" data-line="' + x.line + '">' + esc(x.text) + '</a></li>').join('') + '</ul>' : '<p class="empty-s">Headings appear here as an outline. Start a line with <kbd>#</kbd>.</p>';
    renderHistory(n);
  }
  function lineDiff(a, b) {
    const n = a.length, m = b.length;
    if (n * m > 2.5e6) return a.map(s => ({ t: '-', s })).concat(b.map(s => ({ t: '+', s })));
    const w = m + 1, L = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    const ops = []; let i = 0, j = 0;
    while (i < n && j < m) { if (a[i] === b[j]) { ops.push({ t: '=', s: a[i] }); i++; j++; } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) ops.push({ t: '-', s: a[i++] }); else ops.push({ t: '+', s: b[j++] }); }
    while (i < n) ops.push({ t: '-', s: a[i++] }); while (j < m) ops.push({ t: '+', s: b[j++] });
    return ops;
  }
  let openVer = -1;
  function renderHistory(n) {
    const cur = n.body.split('\n');
    let h = '<div class="hist-head"><p class="empty-s">Mnemo keeps the last 20 versions of each note.</p><button class="btn sm" data-snapshot>' + icon('check') + 'Save version</button></div>';
    if (!n.h.length) h += '<p class="empty-s">No earlier versions yet. Versions are captured when you start editing after a pause, or with Ctrl+S.</p>';
    h += '<ul class="versions">' + n.h.map((v, i) => i).reverse().map(i => {
      const v = n.h[i], ops = lineDiff(cur, v.b.split('\n')), add = ops.filter(o => o.t === '+').length, del = ops.filter(o => o.t === '-').length;
      let body = '';
      if (i === openVer) {
        const keep = ops.map((o, k) => o.t !== '=' || [ops[k - 1], ops[k + 1], ops[k - 2], ops[k + 2]].some(x => x && x.t !== '=')), rows = []; let skipped = 0;
        ops.forEach((o, k) => { if (!keep[k]) { skipped++; return; } if (skipped) { rows.push('<div class="df gap">··· ' + skipped + ' unchanged line' + (skipped > 1 ? 's' : '') + '</div>'); skipped = 0; } rows.push('<div class="df ' + (o.t === '+' ? 'add' : o.t === '-' ? 'del' : '') + '"><i>' + (o.t === '=' ? ' ' : o.t) + '</i>' + esc(o.s || ' ') + '</div>'); });
        if (skipped) rows.push('<div class="df gap">··· ' + skipped + ' unchanged line' + (skipped > 1 ? 's' : '') + '</div>');
        body = '<div class="diff" aria-label="Changes restoring would make">' + (add + del ? rows.join('') : '<div class="df gap">Identical to the current text</div>') + '</div><div class="diff-foot"><span>Restoring brings back <b class="g">' + add + '</b> and removes <b class="r">' + del + '</b> line' + (add + del === 1 ? '' : 's') + '.</span><button class="btn sm primary" data-restore="' + i + '">' + icon('restore') + 'Restore</button></div>';
      }
      return '<li class="' + (i === openVer ? 'open' : '') + '"><button class="ver" data-ver="' + i + '" aria-expanded="' + (i === openVer) + '">' + icon('clock') + '<span class="ver-t">' + M.ago(v.t) + '</span><span class="ver-d"><b class="g">+' + add + '</b> <b class="r">−' + del + '</b></span></button>' + body + '</li>';
    }).join('') + '</ul>';
    $('#cx-history').innerHTML = h;
    $('#badge-hist').textContent = n.h.length || '';
  }
  function bindContext() {
    $('#context').addEventListener('click', e => {
      const t = e.target.closest('[data-id],[data-create],[data-line],[data-link-mention],[data-ver],[data-restore],[data-snapshot]'); if (!t) return;
      e.preventDefault();
      if (t.dataset.id) openNote(t.dataset.id);
      else if (t.dataset.create) { const n = S.create({ title: t.dataset.create }); M.toast('Created “' + n.title + '”'); openNote(n.id, { focus: true }); }
      else if (t.dataset.line) scrollToLine(+t.dataset.line);
      else if (t.dataset.linkMention) { const n = S.get(st.activeId); saveNow(); S.linkMention(t.dataset.linkMention, n.title); M.toast('Linked in “' + S.get(t.dataset.linkMention).title + '”'); }
      else if (t.dataset.ver) { openVer = openVer === +t.dataset.ver ? -1 : +t.dataset.ver; renderHistory(S.get(st.activeId)); }
      else if (t.dataset.restore) { saveNow(); S.restoreVersion(st.activeId, +t.dataset.restore); openVer = -1; M.toast('Version restored. The previous text is saved in history.'); }
      else if (t.dataset.snapshot) { saveNow(); M.toast(S.snapshot(st.activeId) ? 'Version saved' : 'Already saved - no changes since the last version', { ms: 2200 }); }
    });
    $('#cx-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) { st.cxTab = b.dataset.tab; applyLayout(); saveUi(); } });
  }

  /* ---------- palette / switcher / commands ---------- */
  const pal = { open: false, sel: 0, items: [] };
  function cmds() {
    const n = S.get(st.activeId), dark = effectiveTheme() === 'dark';
    return [
      { label: 'New note', keys: 'Alt N', icon: 'plus', run: () => newNote() },
      { label: 'Open today’s daily note', keys: 'Ctrl D', icon: 'calendar', run: openDaily },
      { label: 'Open graph view', keys: 'Ctrl G', icon: 'graph', run: () => setView('graph') },
      { label: 'Play graph time-lapse', icon: 'play', run: () => { setView('graph'); setTimeout(() => startTimelapse(), 400); } },
      { label: 'Go to note…', keys: 'Ctrl O', icon: 'search', run: () => openPalette('switch') },
      { label: 'Search all notes', keys: 'Ctrl Shift F', icon: 'search', run: () => searchFor('') },
      { label: 'View: Edit', icon: 'edit', run: () => setMode('edit') }, { label: 'View: Split', icon: 'columns', run: () => setMode('split') }, { label: 'View: Read', icon: 'book', run: () => setMode('read') },
      { label: 'Cycle Edit / Split / Read', keys: 'Ctrl E', icon: 'columns', run: cycleMode },
      { label: st.focus ? 'Leave focus mode' : 'Enter focus mode (typewriter scrolling)', keys: 'Ctrl .', icon: 'focus', run: toggleFocus },
      { label: dark ? 'Switch to light theme' : 'Switch to dark theme', keys: 'Ctrl Shift L', icon: dark ? 'sun' : 'moon', run: toggleTheme },
      { label: st.dropcap ? 'Turn drop cap off' : 'Turn drop cap on', icon: 'book', run: () => { st.dropcap = !st.dropcap; els.read.classList.toggle('dropcap', st.dropcap); saveUi(); } },
      { label: 'Toggle sidebar', keys: 'Ctrl \\', icon: 'panel-left', run: toggleSidebar }, { label: 'Toggle context panel', keys: 'Alt \\', icon: 'panel-right', run: toggleContext },
      { label: n && n.pinned ? 'Unpin this note' : 'Pin this note', icon: 'pin', run: () => n && S.togglePin(n.id) },
      { label: 'Rename this note', icon: 'rename', run: () => { els.title.focus(); els.title.select(); } },
      { label: 'Delete this note', icon: 'trash', run: deleteCurrent },
      { label: 'Save a version now', keys: 'Ctrl S', icon: 'history', run: () => { saveNow(); M.toast(S.snapshot(st.activeId) ? 'Version saved' : 'No changes since the last version', { ms: 2200 }); } },
      { label: 'Back', keys: 'Alt ←', icon: 'back', run: () => navGo(-1) }, { label: 'Forward', keys: 'Alt →', icon: 'fwd', run: () => navGo(1) },
      { label: 'Export all notes as JSON', icon: 'download', run: exportJSON }, { label: 'Export as Markdown bundle (.zip)', icon: 'download', run: exportZip },
      { label: 'Import notes from JSON…', icon: 'upload', run: () => els.file.click() },
      { label: 'Keyboard shortcuts', keys: '?', icon: 'help', run: showHelp },
      { label: 'Reset demo notebook…', icon: 'restore', run: () => M.toast('Replace every note with the original demo set?', { action: 'Reset', ms: 8000, onAction: () => { S.reset(); st.recent = []; openNote(S.byTitle('Welcome to Mnemo').id); } }) }
    ];
  }
  function openPalette(kind, q) {
    pal.open = true; els.pal.hidden = false; requestAnimationFrame(() => els.pal.classList.add('show'));
    els.palInput.value = kind === 'cmd' ? '>' + (q || '') : (q || ''); pal.sel = 0; renderPalette(); els.palInput.focus();
  }
  function closePalette() { if (!pal.open) return; pal.open = false; els.pal.classList.remove('show'); setTimeout(() => { if (!pal.open) els.pal.hidden = true; }, 180); }
  function renderPalette() {
    const raw = els.palInput.value, isCmd = raw[0] === '>', q = (isCmd ? raw.slice(1) : raw).trim();
    let items = [];
    if (isCmd) {
      items = cmds().map(c => ({ c, f: M.fuzzy(q, c.label) })).filter(x => x.f).sort((a, b) => b.f.score - a.f.score).map(x => ({ type: 'cmd', html: M.markIdx(x.c.label, x.f.idx), icon: x.c.icon, keys: x.c.keys, run: x.c.run }));
    } else if (!q) {
      const seen = new Set(), rec = st.recent.map(S.get).filter(Boolean);
      items = rec.concat(S.all().sort((a, b) => b.updated - a.updated)).filter(n => !seen.has(n.id) && seen.add(n.id)).slice(0, 14).map(n => ({ type: 'note', id: n.id, html: esc(n.title), sub: n.id === st.activeId ? 'current' : M.ago(n.updated), color: dotColor(n.id) }));
    } else {
      const f = S.all().map(n => ({ n, f: M.fuzzy(q, n.title) })).filter(x => x.f).sort((a, b) => b.f.score - a.f.score);
      items = f.slice(0, 9).map(x => ({ type: 'note', id: x.n.id, html: M.markIdx(x.n.title, x.f.idx), sub: S.tags(x.n.id).slice(0, 2).map(t => '#' + t).join(' '), color: dotColor(x.n.id) }));
      if (items.length < 6) { const have = new Set(items.map(i => i.id)); S.search(q).filter(r => !have.has(r.id)).slice(0, 5).forEach(r => items.push({ type: 'note', id: r.id, html: esc(S.get(r.id).title), snippet: r.snippet, color: dotColor(r.id) })); }
      if (!S.byTitle(q)) items.push({ type: 'create', title: q, html: 'Create “' + esc(q) + '”', icon: 'plus' });
    }
    pal.items = items; pal.sel = Math.min(pal.sel, Math.max(0, items.length - 1));
    els.palList.innerHTML = items.length ? items.map((it, i) => '<li role="option" data-i="' + i + '" aria-selected="' + (i === pal.sel) + '">' +
      (it.type === 'note' ? '<span class="nl-dot" style="--c:' + it.color + '"></span>' : icon(it.icon)) + '<span class="pl-t">' + it.html + (it.snippet ? '<small>' + it.snippet + '</small>' : '') + '</span>' +
      (it.sub ? '<span class="pl-sub">' + esc(it.sub) + '</span>' : '') + (it.keys ? '<span class="pl-keys">' + it.keys.split(' ').map(k => '<kbd>' + esc(k) + '</kbd>').join('') + '</span>' : '') + '</li>').join('') : '<li class="pl-none">No matches</li>';
    els.palFoot.innerHTML = isCmd ? '<span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> run</span><span>Delete the <kbd>&gt;</kbd> to search notes</span>' : '<span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>&gt;</kbd> for commands</span>';
    const cur = els.palList.querySelector('[aria-selected="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function runPalette(i) {
    const it = pal.items[i]; if (!it) return;
    closePalette();
    if (it.type === 'note') openNote(it.id, { focus: false });
    else if (it.type === 'create') { const n = S.create({ title: it.title }); openNote(n.id, { focus: true }); }
    else setTimeout(it.run, 30);
  }
  function bindPalette() {
    els.palInput.addEventListener('input', () => { pal.sel = 0; renderPalette(); });
    els.palInput.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); pal.sel = (pal.sel + 1) % Math.max(1, pal.items.length); renderPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); pal.sel = (pal.sel + pal.items.length - 1) % Math.max(1, pal.items.length); renderPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPalette(pal.sel); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
    });
    els.palList.addEventListener('mousemove', e => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== pal.sel) { pal.sel = +li.dataset.i; $$('#pal-list li').forEach((x, k) => x.setAttribute('aria-selected', String(k === pal.sel))); } });
    els.palList.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) runPalette(+li.dataset.i); });
    els.pal.addEventListener('mousedown', e => { if (e.target === els.pal) closePalette(); });
  }

  /* ---------- help, menu, export ---------- */
  const SHORTCUTS = [
    ['Navigate', [['Quick switcher', 'Ctrl O'], ['Command palette', 'Ctrl K'], ['Command palette (alt)', 'Ctrl P'], ['Search all notes', 'Ctrl Shift F'], ['Daily note', 'Ctrl D'], ['New note', 'Alt N'], ['Back / forward', 'Alt ← →'], ['Graph view', 'Ctrl G']]],
    ['Write', [['Bold / italic', 'Ctrl B I'], ['Link the selection', 'Ctrl K'], ['Link to a note', '[['], ['Slash menu', '/'], ['Indent / outdent', 'Tab'], ['Save a version', 'Ctrl S']]],
    ['View', [['Edit / Split / Read', 'Ctrl E'], ['Focus mode', 'Ctrl .'], ['Sidebar', 'Ctrl \\'], ['Context panel', 'Alt \\'], ['Toggle theme', 'Ctrl Shift L'], ['This help', '?'], ['Close anything', 'Esc']]]
  ];
  function showHelp() {
    els.help.innerHTML = '<div class="help-card" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"><header><h2>Keyboard shortcuts</h2><button class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></header><div class="help-grid">' +
      SHORTCUTS.map(g => '<section><h3 class="label">' + g[0] + '</h3>' + g[1].map(r => '<div class="hk"><span>' + r[0] + '</span><span>' + r[1].split(' ').map(k => '<kbd>' + esc(k) + '</kbd>').join('') + '</span></div>').join('') + '</section>').join('') + '</div><footer>In the graph: drag to pan, scroll to zoom, drag a node to pull it, click to open. Double-click empty space to fit.</footer></div>';
    els.help.hidden = false; requestAnimationFrame(() => els.help.classList.add('show'));
  }
  function hideHelp() { els.help.classList.remove('show'); setTimeout(() => { els.help.hidden = true; }, 180); }
  const stamp = () => M.isoDate();
  function exportJSON() { S.flush(); M.download('mnemo-notes-' + stamp() + '.json', new Blob([S.exportJSON()], { type: 'application/json' })); M.toast('Exported ' + S.size() + ' notes as JSON'); }
  /* ---------- folder sync menu ---------- */
  function syncAct(a) {
    const Y = M.sync;
    if (a === 'sync-connect') { if (!Y.supported) return M.toast('Folder sync needs Chrome or Edge. In this browser, use Export Markdown bundle (.zip) and Import Markdown files.', { ms: 7000 }); if (Y.state === 'locked') Y.reconnect(); else Y.connect(); }
    else if (a === 'sync-now') Y.syncNow(false);
    else if (a === 'sync-ext') Y.setExt(Y.cfg.ext === '.md' ? '.txt' : '.md');
    else if (a === 'sync-off') Y.disconnect();
  }
  function paintSync(Y) {
    const s = $('#sync-status'), on = Y.state === 'ok' || Y.state === 'syncing' || Y.state === 'locked' || Y.state === 'error';
    const label = { off: 'Folder sync: off', unsupported: 'Folder sync needs Chrome or Edge', locked: 'Folder sync paused: choose Reconnect to allow access to "' + Y.cfg.name + '"', syncing: 'Syncing with "' + Y.cfg.name + '"...', ok: 'Synced with "' + Y.cfg.name + '"' + (Y.cfg.last ? ' at ' + new Date(Y.cfg.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''), error: 'Folder sync error: ' + (Y.error || 'unknown') }[Y.state] || '';
    s.textContent = label; s.className = 'mi-note ' + (Y.state === 'ok' ? 'ok' : Y.state === 'locked' || Y.state === 'error' ? 'warn' : '');
    const c = $('#sync-connect'); c.hidden = Y.state === 'ok' || Y.state === 'syncing'; c.lastElementChild.textContent = Y.state === 'locked' ? 'Reconnect folder' : 'Sync to a folder (OneDrive)\u2026';
    $('#sync-now').hidden = !(Y.state === 'ok' || Y.state === 'error'); $('#sync-ext').hidden = !on; $('#sync-off').hidden = !on; $('#sync-ext-val').textContent = Y.cfg.ext;
    const note = document.querySelector('.sb-foot-note'); if (note) note.textContent = Y.state === 'ok' ? 'Synced to a folder' : 'Stored on this device';
  }
  function exportZip() { M.download('mnemo-markdown-' + stamp() + '.zip', S.exportZip()); M.toast('Exported ' + S.size() + ' notes as a Markdown bundle'); }
  function toggleMenu(force) {
    const open = force != null ? force : els.menu.hidden;
    els.menu.hidden = !open; els.btnMenu.setAttribute('aria-expanded', String(open));
    if (open) { $('#menu-dropcap').setAttribute('aria-checked', String(st.dropcap)); }
  }

  /* ---------- graph view ---------- */
  let big = null, mini = null, tl = null, gTags = new Set();
  function syncGraphs() {
    if (!mini) return;
    const a = getAnalysis();
    if (a.fresh) { a.fresh = false; const g = a.data; mini.setData(g.nodes, g.edges, a); big.setData(g.nodes, g.edges, a); buildTagChips(); }
    mini.setActive(st.activeId); mini.setFilter({ center: st.activeId, depth: st.depth });
    big.setActive(st.activeId); if (!tl) big.setFilter({ center: st.activeId, depth: +els.gDepth.dataset.value || 0 });
    const n = S.get(st.activeId); $('#mini-title').textContent = n ? n.title : '';
    renderLegend();
  }
  function renderLegend() {
    const lg = big.legend(), s = big.stats();
    $('#g-legend').innerHTML = lg.map(l => '<li><i style="--c:' + l.color + '"></i><span>' + esc(l.label) + '</span><b>' + l.size + '</b></li>').join('');
    $('#g-stats').innerHTML = '<b>' + s.nodes + '</b> notes · <b>' + s.links + '</b> links · <b>' + s.clusters + '</b> clusters';
  }
  function buildTagChips() {
    $('#g-tags').innerHTML = S.tagCounts().slice(0, 12).map(t => '<button class="tagchip' + (gTags.has(t.tag) ? ' on' : '') + '" data-gtag="' + esc(t.tag) + '" aria-pressed="' + gTags.has(t.tag) + '"><span>#' + esc(t.tag) + '</span><b>' + t.count + '</b></button>').join('');
  }
  function setSeg(el, val) { el.dataset.value = val; $$('button', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(val)))); }
  function setView(v, silent) {
    if (st.view === v) return;
    if (v === 'graph') { saveNow(); stopTimelapse(true); }
    st.view = v; applyLayout();
    if (v === 'graph') { big.start(); big.setActive(st.activeId); big.setFilter({ center: st.activeId, depth: +els.gDepth.dataset.value || 0 }); big.fit(); drawerSb = drawerCx = false; applyLayout(); if (!narrow.matches) els.gSearch.focus({ preventScroll: true }); }
    else { big.stop(); stopTimelapse(true); if (!silent) { if (st.mode !== 'read') E.focus(); } }
  }
  function startTimelapse() {
    if (tl) return stopTimelapse();
    const order = big.list.slice().sort((a, b) => a.created - b.created), total = order.length, per = M.clamp(9500 / total, 120, 320), t0 = performance.now();
    big.list.forEach(n => { n.placed = false; });
    big.setFilter({ center: null, depth: 0, cutoff: order[0].created - 1, tags: null }); big.fit(); big.alphaTarget = 0.04;
    els.gPlay.innerHTML = icon('pause') + '<span>Stop</span>'; els.gPlay.setAttribute('aria-pressed', 'true'); els.gTl.hidden = false;
    let shown = 0;
    tl = { raf: 0 };
    const step = now => {
      const count = Math.min(total, Math.floor((now - t0) / per) + 1);
      if (count !== shown) {
        shown = count; big.setFilter({ cutoff: order[count - 1].created });
        els.gTl.innerHTML = '<b>' + M.fmtDate(order[count - 1].created) + '</b><span>' + count + ' of ' + total + ' notes</span><em>' + esc(order[count - 1].title) + '</em>';
      }
      if (count >= total && now - t0 > total * per + 1600) return stopTimelapse();
      tl.raf = requestAnimationFrame(step);
    };
    tl.raf = requestAnimationFrame(step);
  }
  function stopTimelapse(quiet) {
    if (!tl) return; cancelAnimationFrame(tl.raf); tl = null;
    big.alphaTarget = 0; big.setFilter({ cutoff: null, center: st.activeId, depth: +els.gDepth.dataset.value || 0 });
    els.gPlay.innerHTML = icon('play') + '<span>Time-lapse</span>'; els.gPlay.setAttribute('aria-pressed', 'false'); els.gTl.hidden = true; if (!quiet) big.fit();
  }
  function bindGraphView() {
    $('#g-back').onclick = () => setView('notes');
    els.gPlay.onclick = () => startTimelapse();
    $('#g-fit').onclick = () => big.fit();
    $('#g-shake').onclick = () => big.reheat(1);
    $('#g-orphans').onclick = e => { const on = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(on)); big.setFilter({ orphans: on }); };
    $('#g-labels').onclick = e => { const on = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(on)); big.showLabels = on; st.labels = on; big.dirty = true; saveUi(); };
    els.gDepth.onclick = e => { const b = e.target.closest('button'); if (!b) return; setSeg(els.gDepth, b.dataset.v); big.setFilter({ center: st.activeId, depth: +b.dataset.v }); };
    $('#g-color').onclick = e => { const b = e.target.closest('button'); if (!b) return; setSeg($('#g-color'), b.dataset.v); st.colorMode = b.dataset.v; big.setColorMode(b.dataset.v); renderLegend(); saveUi(); };
    $('#g-tags').onclick = e => { const b = e.target.closest('[data-gtag]'); if (!b) return; const t = b.dataset.gtag; gTags.has(t) ? gTags.delete(t) : gTags.add(t); b.classList.toggle('on'); b.setAttribute('aria-pressed', String(gTags.has(t))); big.setFilter({ tags: gTags.size ? new Set(gTags) : null }); };
    $('#g-panel-toggle').onclick = () => { const p = $('#g-panel'); p.classList.toggle('collapsed'); $('#g-panel-toggle').setAttribute('aria-expanded', String(!p.classList.contains('collapsed'))); };
    els.gSearch.addEventListener('input', () => {
      const q = els.gSearch.value.trim();
      if (!q) { big.setHighlight(null); return; }
      const set = new Set(S.all().filter(n => M.fuzzy(q, n.title) || S.tags(n.id).some(t => t.startsWith(q.replace(/^#/, '').toLowerCase())) || n.body.toLowerCase().includes(q.toLowerCase())).map(n => n.id));
      big.setHighlight(set);
    });
    els.gSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const q = els.gSearch.value.trim(); const best = S.search(q)[0]; if (best) big.focusNode(best.id); }
      if (e.key === 'Escape') { if (els.gSearch.value) { els.gSearch.value = ''; big.setHighlight(null); e.stopPropagation(); } }
    });
    setSeg(els.gDepth, 0); setSeg($('#g-color'), st.colorMode);
  }
  function onGraphHover(n, e) {
    const tip = els.gTip;
    if (!n || !e) { tip.hidden = true; return; }
    const note = S.get(n.id); if (!note) return;
    tip.innerHTML = '<b>' + esc(note.title) + '</b><span>' + n.deg + ' link' + (n.deg === 1 ? '' : 's') + (n.tags.length ? ' · ' + n.tags.slice(0, 3).map(t => '#' + t).join(' ') : '') + '</span>';
    tip.hidden = false;
    const r = els.graphView.getBoundingClientRect();
    tip.style.left = M.clamp(e.clientX - r.left + 16, 8, r.width - 240) + 'px'; tip.style.top = M.clamp(e.clientY - r.top + 18, 8, r.height - 70) + 'px';
  }

  /* ---------- navigation history ---------- */
  function navGo(d) { const p = nav.pos + d; if (p < 0 || p >= nav.stack.length) return; nav.pos = p; const id = nav.stack[p]; if (S.get(id)) openNote(id, { nav: true }); updateNavButtons(); }
  function updateNavButtons() { els.back.disabled = nav.pos <= 0; els.fwd.disabled = nav.pos >= nav.stack.length - 1; }

  /* ---------- scroll sync (split view) ---------- */
  let syncGoal = null, syncRaf = 0, syncLock = null;
  function bindScrollSync() {
    const onScroll = src => () => {
      if (effMode() !== 'split' || syncLock === src) return;
      const dst = src === els.edScroll ? els.readScroll : els.edScroll;
      const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
      syncGoal = { dst, top: ratio * (dst.scrollHeight - dst.clientHeight) };
      if (!syncRaf) syncRaf = requestAnimationFrame(stepSync);
    };
    els.edScroll.addEventListener('scroll', onScroll(els.edScroll), { passive: true });
    els.readScroll.addEventListener('scroll', onScroll(els.readScroll), { passive: true });
  }
  function stepSync() {
    const g = syncGoal, d = g.top - g.dst.scrollTop; syncLock = g.dst;
    if (Math.abs(d) < 0.8) { g.dst.scrollTop = g.top; syncRaf = 0; requestAnimationFrame(() => { syncLock = null; }); return; }
    g.dst.scrollTop += d * 0.3; syncRaf = requestAnimationFrame(stepSync);
  }

  /* ---------- global keys ---------- */
  function bindKeys() {
    document.addEventListener('keydown', e => {
      if (e.defaultPrevented) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey, typing = /^(input|textarea|select)$/i.test(e.target.tagName);
      if (mod && !e.altKey) {
        let handled = true;
        if (k === 'o') pal.open ? closePalette() : openPalette('switch');
        else if (k === 'k' || k === 'p') pal.open ? closePalette() : openPalette('cmd');
        else if (k === 'e') cycleMode();
        else if (k === 'd' && !e.shiftKey) openDaily();
        else if (k === 'g') setView(st.view === 'graph' ? 'notes' : 'graph');
        else if (k === 's') { saveNow(); M.toast(S.snapshot(st.activeId) ? 'Version saved' : 'Saved', { ms: 1800 }); }
        else if (k === '\\') toggleSidebar();
        else if (k === '.') toggleFocus();
        else if (k === 'f' && e.shiftKey) { searchFor(''); }
        else if (k === 'l' && e.shiftKey) toggleTheme();
        else if (k === '/') showHelp();
        else handled = false;
        if (handled) e.preventDefault();
        return;
      }
      if (e.altKey && !mod) {
        if (k === 'n') { e.preventDefault(); newNote(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); navGo(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); navGo(1); }
        else if (e.key === '\\') { e.preventDefault(); toggleContext(); }
        return;
      }
      if (e.key === 'Escape') {
        if (!els.help.hidden) return hideHelp();
        if (!els.menu.hidden) return toggleMenu(false);
        if (pal.open) return closePalette();
        if (!els.card.hidden) return hideCard();
        if (drawerSb || drawerCx) return closeDrawers();
        if (st.view === 'graph') return tl ? stopTimelapse() : setView('notes');
        if (st.focus) return toggleFocus();
        if (document.activeElement === els.search) { els.search.value = ''; runSearch(''); els.search.blur(); }
        return;
      }
      if (!typing && !mod && e.key === '?') { e.preventDefault(); showHelp(); }
    });
    document.addEventListener('mousedown', e => {
      if (!els.menu.hidden && !e.target.closest('#menu') && !e.target.closest('#btn-menu')) toggleMenu(false);
      if (!els.help.hidden && e.target === els.help) hideHelp();
    });
  }

  /* ---------- init ---------- */
  function init() {
    ['app', 'sidebar', 'search', 'title', 'panes', 'progress', 'menu', 'card', 'file', 'help'].forEach(id => { els[id] = $('#' + (id === 'card' ? 'hovercard' : id === 'progress' ? 'read-progress' : id)); });
    Object.assign(els, {
      noteView: $('#note-view'), paneEdit: $('#pane-edit'), paneRead: $('#pane-read'), edScroll: $('#ed-scroll'), readScroll: $('#read-scroll'), read: $('#read-body'), save: $('#save-ind'),
      meta: $('#note-meta'), tags: $('#note-tags'), pinBtn: $('#btn-pin'), statusL: $('#status-left'), statusR: $('#status-right'), sbToggle: $('#btn-sb'), cxToggle: $('#btn-cx'), back: $('#btn-back'), fwd: $('#btn-fwd'),
      secPinned: $('#sec-pinned'), listPinned: $('#list-pinned'), listRecent: $('#list-recent'), listAll: $('#list-all'), countAll: $('#count-all'), tagCloud: $('#tag-cloud'), sbLists: $('#sb-lists'), results: $('#search-results'),
      btnTheme: $('#btn-theme'), btnMenu: $('#btn-menu'), pal: $('#palette'), palInput: $('#pal-input'), palList: $('#pal-list'), palFoot: $('#pal-foot'),
      graphView: $('#graph-view'), gSearch: $('#g-search'), gDepth: $('#g-depth'), gPlay: $('#g-play'), gTl: $('#g-tl'), gTip: $('#g-tip')
    });
    M.hydrateIcons(document);
    S.load(); applyTheme(); S.on(onStoreChange); M.sync = M.syncCore.init(M); M.sync.onChange(paintSync);
    E.init(); E.onChange = onEditorChange;
    E.onCursor = (l, c) => { els.statusR.textContent = 'Ln ' + l + ', Col ' + c; };
    mini = M.mini = new M.Graph($('#mini-graph'), { mini: true, onOpen: id => openNote(id) });
    big = M.big = new M.Graph($('#big-graph'), { onOpen: id => { openNote(id); }, onHover: onGraphHover });
    big.showLabels = st.labels; big.colorMode = st.colorMode; $('#g-labels').setAttribute('aria-checked', String(st.labels));
    setSeg($('#depth-seg'), st.depth);
    bindReader(); bindContext(); bindPalette(); bindGraphView(); bindScrollSync(); bindKeys();

    // sidebar interactions
    $('#sidebar').addEventListener('click', e => {
      const a = e.target.closest('a[data-id]'); if (a) { e.preventDefault(); openNote(a.dataset.id, { focus: false }); return; }
      const t = e.target.closest('[data-tag]'); if (t) { e.preventDefault(); searchFor('#' + t.dataset.tag); return; }
      const c = e.target.closest('[data-create]'); if (c) { const n = S.create({ title: c.dataset.create }); els.search.value = ''; runSearch(''); openNote(n.id, { focus: true }); }
    });
    els.search.addEventListener('input', () => runSearch(els.search.value));
    els.search.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const r = S.search(els.search.value)[0]; if (r) openNote(r.id); else if (els.search.value.trim()) { const n = S.create({ title: els.search.value.trim() }); els.search.value = ''; runSearch(''); openNote(n.id, { focus: true }); } }
      if (e.key === 'ArrowDown') { const f = els.results.querySelector('a'); if (f) { e.preventDefault(); f.focus(); } }
    });
    els.results.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const l = $$('a.sr', els.results), i = l.indexOf(document.activeElement); const n = l[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) n.focus(); else if (e.key === 'ArrowUp') els.search.focus(); } });
    $('#depth-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.depth = +b.dataset.v; setSeg($('#depth-seg'), st.depth); syncGraphs(); saveUi(); });

    // buttons
    $('#btn-new').onclick = () => newNote(); $('#btn-daily').onclick = openDaily; $('#btn-graph').onclick = () => setView('graph'); $('#btn-expand').onclick = () => setView('graph');
    els.sbToggle.onclick = toggleSidebar; els.cxToggle.onclick = toggleContext; $('#btn-focus').onclick = toggleFocus; els.back.onclick = () => navGo(-1); els.fwd.onclick = () => navGo(1);
    els.btnTheme.onclick = toggleTheme; $('#btn-help').onclick = showHelp; els.btnMenu.onclick = () => toggleMenu();
    els.pinBtn.onclick = () => S.togglePin(st.activeId);
    $('#mode-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
    $('#scrim').onclick = closeDrawers;
    $('#bottomnav').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const t = b.dataset.tab;
      if (t === 'graph') { setView(st.view === 'graph' ? 'notes' : 'graph'); return; }
      if (st.view === 'graph') setView('notes', true);
      if (t === 'notes') { drawerSb = !drawerSb; drawerCx = false; } else if (t === 'links') { drawerCx = !drawerCx; drawerSb = false; } else { drawerSb = drawerCx = false; }
      applyLayout();
    });
    els.help.addEventListener('click', e => { if (e.target.closest('[data-close]')) hideHelp(); });
    els.menu.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; toggleMenu(false);
      if (a === 'json') exportJSON(); else if (a === 'zip') exportZip(); else if (a === 'import') els.file.click(); else if (a === 'mdimport') $('#mdfiles').click(); else if (a.indexOf('sync-') === 0) syncAct(a); else if (a === 'help') showHelp();
      else if (a === 'dropcap') { st.dropcap = !st.dropcap; els.read.classList.toggle('dropcap', st.dropcap); saveUi(); }
      else if (a === 'reset') cmds().find(c => /^Reset/.test(c.label)).run();
    });
    $('#mdfiles').addEventListener('change', e => { const l = e.target.files; if (l && l.length) M.sync.importFiles(l); e.target.value = ''; });
    els.file.addEventListener('change', () => {
      const f = els.file.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { const res = S.importJSON(String(r.result)); M.toast(res.error || 'Imported: ' + res.added + ' added, ' + res.updated + ' updated, ' + res.skipped + ' skipped.'); els.file.value = ''; };
      r.readAsText(f);
    });
    els.title.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); els.title.blur(); if (st.mode !== 'read') E.focus(); }
      if (e.key === 'Escape') { const n = S.get(st.activeId); if (n) els.title.value = n.title; els.title.blur(); }
    });
    els.title.addEventListener('change', () => renameTo(els.title.value));
    window.addEventListener('beforeunload', () => { saveNow(); S.flush(); M.storage.set(UI_KEY, st); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { saveNow(); S.flush(); } });

    const first = S.get(st.activeId) || S.byTitle('Welcome to Mnemo') || S.all()[0];
    syncGraphs(); mini.start();
    openNote(first.id);
    $('#g-orphans').setAttribute('aria-checked', 'true'); if (narrow.matches) $('#g-panel').classList.add('collapsed');
    document.body.classList.add('ready');
    applyLayout();
  }
  M.ui = { init, openNote, setView, setMode, search: searchFor, palette: openPalette, newNote, openDaily, state: st };
})(window.Mnemo);
