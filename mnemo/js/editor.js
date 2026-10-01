/* Mnemo editor: a plain <textarea> with a syntax-highlighted <pre> painted underneath (identical metrics, transparent text on top).
 * Adds auto-pairs, list continuation, indentation, [[ autocomplete, slash menu, formatting shortcuts. */
(function (M) {
  'use strict';
  const Md = M.md, $ = M.$;
  const ZW = String.fromCharCode(0x200b);
  const E = M.editor = { noteId: null, onChange() {}, onCursor() {} };
  let ta, hl, scroller, pop, popState = null, typewriter = false;

  E.init = function () {
    ta = $('#ed-ta'); hl = $('#ed-hl'); scroller = $('#ed-scroll'); pop = $('#ed-pop');
    ta.addEventListener('input', onInput);
    ta.addEventListener('keydown', onKey);
    ta.addEventListener('keyup', e => { if (/^(Arrow|Home|End|Page)/.test(e.key)) { cursor(); if (popState && !insidePop()) closePop(); } });
    ta.addEventListener('mouseup', () => { cursor(); closePop(); });
    ta.addEventListener('blur', () => setTimeout(closePop, 140));
    ta.addEventListener('paste', onPaste);
    document.addEventListener('selectionchange', () => { if (document.activeElement === ta) { cursor(); if (typewriter) intoView(true); } });
    scroller.addEventListener('scroll', () => { if (popState) closePop(); }, { passive: true });
  };
  const paint = () => { hl.innerHTML = Md.highlightSource(ta.value) + ZW; };
  E.open = function (note) {
    E.noteId = note.id; ta.value = note.body; paint(); scroller.scrollTop = 0; closePop();
    ta.setSelectionRange(0, 0); cursor();
  };
  E.value = () => ta.value;
  E.setValue = function (v) { const s = ta.selectionStart, e = ta.selectionEnd; ta.value = v; paint(); ta.setSelectionRange(s, e); };
  E.focus = () => { ta.focus({ preventScroll: true }); };
  E.setTypewriter = on => { typewriter = on; if (on) intoView(true); };
  E.goToLine = function (line) {
    const lines = ta.value.split('\n'); let pos = 0;
    for (let i = 0; i < Math.min(line, lines.length); i++) pos += lines[i].length + 1;
    ta.focus({ preventScroll: true }); ta.setSelectionRange(pos, pos); intoView(true);
  };
  E.insert = text => put(ta.selectionStart, ta.selectionEnd, text);
  E.pending = () => !!popState;

  /* ---------- text ops (execCommand keeps the native undo stack intact) ---------- */
  function put(start, end, text, selS, selE) {
    ta.focus({ preventScroll: true }); ta.setSelectionRange(start, end);
    const before = ta.value;
    let ok = false;
    try { ok = text === '' ? document.execCommand('delete') : document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok || (ta.value === before && (text !== '' || start !== end))) { ta.setRangeText(text, start, end, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    if (selS != null) ta.setSelectionRange(selS, selE == null ? selS : selE);
  }
  function cursor() {
    const v = ta.value, p = ta.selectionStart, before = v.slice(0, p), line = before.split('\n').length, col = p - (before.lastIndexOf('\n') + 1) + 1;
    E.onCursor(line, col);
  }
  function onInput(e) {
    paint(); E.onChange(ta.value); cursor();
    if (!e || !e.inputType || /^(insert|delete)/.test(e.inputType)) triggers();
    intoView(typewriter);
  }

  /* ---------- caret geometry (walk the painted pre's text nodes) ---------- */
  function caretRect(pos) {
    const walker = document.createTreeWalker(hl, NodeFilter.SHOW_TEXT);
    let node, acc = 0, last = null;
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length; last = node;
      if (acc + len > pos || (acc + len === pos && !node.nodeValue.endsWith('\n'))) return rectAt(node, pos - acc);
      acc += len;
    }
    return last ? rectAt(last, last.nodeValue.length) : hl.getBoundingClientRect();
  }
  function rectAt(node, off) {
    const r = document.createRange(); r.setStart(node, off); r.setEnd(node, off);
    let rect = r.getClientRects()[0];
    if (!rect || (!rect.height && !rect.width)) { if (off > 0) { r.setStart(node, off - 1); rect = r.getClientRects()[0]; if (rect) return { left: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height }; } rect = node.parentElement.getBoundingClientRect(); }
    return rect;
  }
  function intoView(center) {
    const r = caretRect(ta.selectionEnd); if (!r) return;
    const box = scroller.getBoundingClientRect(), pad = 64;
    if (center) scroller.scrollTo({ top: scroller.scrollTop + (r.top - box.top) - box.height * 0.42, behavior: 'smooth' });
    else if (r.bottom > box.bottom - pad) scroller.scrollTop += r.bottom - box.bottom + pad;
    else if (r.top < box.top + pad) scroller.scrollTop -= box.top + pad - r.top;
  }

  /* ---------- autocomplete + slash menu ---------- */
  const today = () => M.isoDate();
  const SLASH = [
    { k: 'Heading 1', s: 'h1 title', tpl: '# $|', icon: 'hash' }, { k: 'Heading 2', s: 'h2 section', tpl: '## $|', icon: 'hash' }, { k: 'Heading 3', s: 'h3', tpl: '### $|', icon: 'hash' },
    { k: 'Task list', s: 'todo checkbox', tpl: '- [ ] $|', icon: 'check' }, { k: 'Bullet list', s: 'ul', tpl: '- $|', icon: 'outline' }, { k: 'Numbered list', s: 'ol', tpl: '1. $|', icon: 'outline' },
    { k: 'Quote', s: 'blockquote', tpl: '> $|', icon: 'note' }, { k: 'Table', s: 'grid', tpl: '| $|Column | Column | Column |\n| --- | --- | --- |\n|  |  |  |\n', icon: 'columns' },
    { k: 'Callout: note', s: 'info', tpl: '> [!note] $|Title\n> ', icon: 'note' }, { k: 'Callout: idea', s: 'lightbulb', tpl: '> [!idea] $|Title\n> ', icon: 'idea' }, { k: 'Callout: warning', s: 'caution', tpl: '> [!warning] $|Title\n> ', icon: 'warning' },
    { k: 'Code block', s: 'fence snippet', tpl: '~~~js\n$|\n~~~\n', icon: 'edit' }, { k: 'Divider', s: 'hr rule', tpl: '---\n$|', icon: 'outline' },
    { k: 'Today’s date', s: 'date', tpl: () => today() + '$|', icon: 'calendar' }, { k: 'Time', s: 'clock now', tpl: () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '$|'; }, icon: 'clock' },
    { k: 'Link to note', s: 'wikilink', tpl: '[[$|', icon: 'link' }, { k: 'Footnote', s: 'reference', special: 'footnote', icon: 'hash' }
  ];
  const inFence = before => (before.match(/^ {0,3}(```|~~~)/gm) || []).length % 2 === 1;
  function triggers() {
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) return closePop();
    const before = ta.value.slice(0, pos);
    let m = /\[\[([^\[\]\n|]*)$/.exec(before);
    if (m) return openPop('wiki', pos - m[1].length, m[1]);
    m = /(^|\s)\/([\w-]*)$/.exec(before);
    if (m && !inFence(before)) return openPop('slash', pos - m[2].length - 1, m[2]);
    closePop();
  }
  function items(kind, q) {
    if (kind === 'slash') {
      const ql = q.toLowerCase();
      return SLASH.map(c => ({ c, f: M.fuzzy(ql, c.k.toLowerCase() + ' ' + c.s) })).filter(x => x.f).sort((a, b) => b.f.score - a.f.score).slice(0, 8)
        .map(x => ({ label: x.c.k, icon: x.c.icon, cmd: x.c }));
    }
    const all = M.store.all().filter(n => n.id !== E.noteId);
    let res;
    if (!q.trim()) res = all.sort((a, b) => b.updated - a.updated).slice(0, 7).map(n => ({ n, idx: [] }));
    else res = all.map(n => ({ n, f: M.fuzzy(q.trim(), n.title) })).filter(x => x.f).sort((a, b) => b.f.score - a.f.score).slice(0, 7).map(x => ({ n: x.n, idx: x.f.idx }));
    const out = res.map(x => ({ label: x.n.title, html: M.markIdx(x.n.title, x.idx), sub: M.md.plain(x.n.body.replace(/^#.*$/m, '').trim().split('\n')[0] || '').slice(0, 70), icon: 'file', title: x.n.title }));
    if (q.trim() && !all.some(n => n.title.toLowerCase() === q.trim().toLowerCase())) out.push({ label: q.trim(), html: 'Create “' + M.esc(q.trim()) + '”', icon: 'plus', title: q.trim(), create: true });
    return out;
  }
  function openPop(kind, start, q) {
    const list = items(kind, q);
    if (!list.length) return closePop();
    popState = { kind, start, q, list, sel: popState && popState.kind === kind ? Math.min(popState.sel, list.length - 1) : 0 };
    renderPop();
  }
  function renderPop() {
    const p = popState;
    pop.innerHTML = '<div class="pop-head">' + (p.kind === 'wiki' ? 'Link to a note' : 'Insert') + '</div><ul role="listbox">' + p.list.map((it, i) =>
      '<li role="option" data-i="' + i + '" aria-selected="' + (i === p.sel) + '" class="' + (it.create ? 'create' : '') + '">' + M.icon(it.icon) + '<span class="pop-l">' + (it.html || M.esc(it.label)) + '</span>' + (it.sub ? '<span class="pop-s">' + M.esc(it.sub) + '</span>' : '') + '</li>').join('') + '</ul>';
    pop.hidden = false;
    const r = caretRect(p.start), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = Math.min(r.left, window.innerWidth - pw - 12), y = r.bottom + 6;
    if (y + ph > window.innerHeight - 10) y = Math.max(10, r.top - ph - 6);
    pop.style.left = Math.max(10, x) + 'px'; pop.style.top = y + 'px';
    const cur = pop.querySelector('[aria-selected="true"]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }
  function closePop() { if (popState) { popState = null; pop.hidden = true; } }
  const insidePop = () => { const p = ta.selectionStart; return popState && p >= popState.start && /^[^\n\[\]|]*$/.test(ta.value.slice(popState.start, p)); };
  function popKey(e) {
    const p = popState;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { p.sel = (p.sel + (e.key === 'ArrowDown' ? 1 : p.list.length - 1)) % p.list.length; renderPop(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { accept(p.sel); return true; }
    if (e.key === 'Escape') { closePop(); e.stopPropagation(); return true; }
    return false;
  }
  function accept(i) {
    const p = popState, it = p.list[i]; if (!it) return;
    const pos = ta.selectionStart; closePop();
    if (p.kind === 'wiki') {
      const tail = ta.value.slice(pos, pos + 2) === ']]' ? 2 : 0;
      const text = '[[' + it.title + ']]';
      put(p.start - 2, pos + tail, text, p.start - 2 + text.length);
    } else if (it.cmd.special === 'footnote') {
      const v = ta.value, nums = (v.match(/\[\^(\d+)\]/g) || []).map(s => parseInt(s.slice(2), 10)), n = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
      put(v.length, v.length, (v.endsWith('\n\n') ? '' : v.endsWith('\n') ? '\n' : '\n\n') + '[^' + n + ']: ');
      put(p.start, pos, '[^' + n + ']'); const end = ta.value.length; ta.setSelectionRange(end, end); intoView(true);
    } else {
      let tpl = typeof it.cmd.tpl === 'function' ? it.cmd.tpl() : it.cmd.tpl; const caret = tpl.indexOf('$|'); tpl = tpl.replace('$|', '');
      put(p.start, pos, tpl, p.start + (caret < 0 ? tpl.length : caret));
    }
  }
  document.addEventListener('mousedown', e => {
    const li = e.target.closest && e.target.closest('#ed-pop li');
    if (li && popState) { e.preventDefault(); accept(+li.dataset.i); }
  });

  /* ---------- keyboard ---------- */
  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', '`': '`' }, CLOSERS = new Set([')', ']', '}', '"', '`']), WRAP = new Set(['*', '_', '~', '=']);
  function onKey(e) {
    if (popState && popKey(e)) { e.preventDefault(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); wrap('**'); }
      else if (k === 'i') { e.preventDefault(); wrap('*'); }
      else if (k === 'k' && ta.selectionStart !== ta.selectionEnd) { e.preventDefault(); makeLink(); }
      return;
    }
    if (e.altKey || e.isComposing) return;
    if (e.key === 'Enter') { if (onEnter(e)) e.preventDefault(); }
    else if (e.key === 'Tab') { e.preventDefault(); indent(e.shiftKey); }
    else if (e.key === 'Backspace') { if (pairDelete()) e.preventDefault(); }
    else if (e.key.length === 1 && typePair(e.key)) e.preventDefault();
  }
  function typePair(c) {
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd, next = v[en] || '', prev = v[s - 1] || '', sel = s !== en;
    if (sel && (PAIRS[c] || WRAP.has(c))) { const close = PAIRS[c] || c; put(s, en, c + v.slice(s, en) + close, s + 1, en + 1); return true; }
    if (!sel && CLOSERS.has(c) && next === c) { ta.setSelectionRange(s + 1, s + 1); return true; }
    if (!sel && PAIRS[c]) {
      if ((c === '"' || c === '`') && (/\w/.test(prev) || /\w/.test(next) || prev === c)) return false;
      if (c !== '[' && /\w/.test(next)) return false;
      put(s, en, c + PAIRS[c], s + 1); return true;
    }
    return false;
  }
  function pairDelete() {
    const s = ta.selectionStart, v = ta.value;
    if (s !== ta.selectionEnd || s === 0) return false;
    if (PAIRS[v[s - 1]] && PAIRS[v[s - 1]] === v[s]) { put(s - 1, s + 1, '', s - 1); return true; }
    return false;
  }
  function wrap(mk) {
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd, L = mk.length;
    if (s === en) { put(s, en, mk + mk, s + L); return; }
    const sel = v.slice(s, en);
    if (v.slice(s - L, s) === mk && v.slice(en, en + L) === mk) { put(s - L, en + L, sel, s - L, en - L); return; }
    if (sel.length >= 2 * L && sel.startsWith(mk) && sel.endsWith(mk)) { put(s, en, sel.slice(L, -L), s, en - 2 * L); return; }
    put(s, en, mk + sel + mk, s + L, en + L);
  }
  function makeLink() {
    const s = ta.selectionStart, en = ta.selectionEnd, sel = ta.value.slice(s, en);
    put(s, en, '[' + sel + '](url)', s + sel.length + 3, s + sel.length + 6);
  }
  function onEnter(e) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) return false;
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd, ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', s); if (le < 0) le = v.length;
    const line = v.slice(ls, le), lm = /^(\s*)((?:[-*+]|\d+[.)])\s+)(\[[ xX]\]\s+)?/.exec(line), qm = /^(\s*(?:>\s?)+)/.exec(line);
    if (lm) {
      if (s - ls < lm[0].length) return false;
      if (!line.slice(lm[0].length).trim()) { put(ls, le, lm[1].length >= 2 ? lm[1].slice(2) + lm[2].trim() + ' ' : '', null); ta.setSelectionRange(ls + (lm[1].length >= 2 ? lm[1].length - 2 + lm[2].trim().length + 1 : 0), ls + (lm[1].length >= 2 ? lm[1].length - 2 + lm[2].trim().length + 1 : 0)); return true; }
      let marker = lm[2]; const num = /^(\d+)([.)])(\s+)/.exec(marker); if (num) marker = (+num[1] + 1) + num[2] + num[3];
      put(s, en, '\n' + lm[1] + marker + (lm[3] ? '[ ] ' : '')); return true;
    }
    if (qm) {
      if (!line.slice(qm[0].length).trim()) { put(ls, le, '', ls); return true; }
      put(s, en, '\n' + qm[1].replace(/\s*$/, ' ')); return true;
    }
    const ind = /^[ ]+/.exec(line);
    if (ind && line.trim() && s - ls >= ind[0].length) { put(s, en, '\n' + ind[0]); return true; }
    return false;
  }
  function indent(back) {
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd, multi = v.slice(s, en).includes('\n');
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le0 = v.indexOf('\n', en > s && v[en - 1] === '\n' ? en - 1 : en); const le = le0 < 0 ? v.length : le0;
    const isList = /^\s*([-*+]|\d+[.)])\s/.test(v.slice(ls, le));
    if (!multi && !isList && !back) { put(s, en, '  '); return; }
    let first = 0, total = 0;
    const out = v.slice(ls, le).split('\n').map((l, i) => {
      if (back) { const n = (/^ {1,2}/.exec(l) || [''])[0].length; if (i === 0) first = -n; total -= n; return l.slice(n); }
      if (i === 0) first = 2; total += 2; return '  ' + l;
    });
    put(ls, le, out.join('\n'), Math.max(ls, s + first), en + total);
  }
  function onPaste(e) {
    const f = Array.from((e.clipboardData && e.clipboardData.files) || []).find(x => /^image\/(png|jpe?g|gif|webp)$/.test(x.type));
    if (!f) return;
    e.preventDefault();
    if (f.size > 400e3) { M.toast('That image is over 400 KB - embed a smaller one.'); return; }
    const r = new FileReader();
    r.onload = () => put(ta.selectionStart, ta.selectionEnd, '![' + (f.name.replace(/\.\w+$/, '').replace(/[\[\]]/g, '') || 'image') + '](' + r.result + ')\n');
    r.readAsDataURL(f);
  }
})(window.Mnemo);
