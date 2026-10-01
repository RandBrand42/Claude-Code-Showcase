/* Mnemo markdown engine - written from scratch, zero dependencies.
 * Works in the browser (window.Mnemo.md) and in Node (module.exports) so it can be unit-tested.
 * Safety model: every character of user text goes through esc(); the only HTML emitted is what this file
 * constructs itself. URLs are allow-listed (http/https/mailto/relative); images must be data: URIs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Mnemo = root.Mnemo || {}; root.Mnemo.md = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);

  /* ---------- URL safety ---------- */
  // control chars, zero-width and line-separator characters are invisible to a reader but parsed by browsers
  const STRIP_CHARS = new RegExp('[' + [[0, 32], [127, 159], [8203, 8207], [8232, 8233], [65279, 65279]].map(r => String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1])).join('') + ']', 'g');
  function safeUrl(u) {
    const clean = String(u).replace(STRIP_CHARS, '');
    const m = /^([a-z][a-z0-9+.\-]*):/i.exec(clean);
    if (m && !/^(https?|mailto)$/i.test(m[1])) return null;
    if (/^\/\//.test(clean)) return null;
    return String(u).trim();
  }
  const safeImg = u => /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)(;[a-z0-9=\-]+)*,/i.test(String(u).trim()) ? String(u).trim() : null;

  /* ---------- syntax highlighting (code blocks) ---------- */
  const kw = w => '\\b(?:' + w.split(' ').join('|') + ')\\b';
  const STR = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/.source;
  const KW_JS = 'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super yield static null undefined true false void delete';
  const KW_PY = 'def class return if elif else for while in not and or is import from as with try except finally raise lambda yield pass break continue None True False self async await global';
  const LANGS = {
    js: [['c', /\/\/[^\n]*|\/\*[\s\S]*?\*\//.source], ['s', STR + '|' + /`(?:\\[\s\S]|[^`\\])*`/.source], ['k', kw(KW_JS)], ['n', /\b\d[\d_]*(?:\.\d+)?\b/.source], ['f', /\b[A-Za-z_$][\w$]*(?=\()/.source]],
    json: [['p', /"(?:\\.|[^"\\\n])*"(?=\s*:)/.source], ['s', /"(?:\\.|[^"\\\n])*"/.source], ['n', /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/.source], ['k', /\b(?:true|false|null)\b/.source]],
    py: [['c', /#[^\n]*/.source], ['s', /"""[\s\S]*?"""|'''[\s\S]*?'''/.source + '|' + STR], ['k', kw(KW_PY)], ['n', /\b\d[\d_]*(?:\.\d+)?\b/.source], ['f', /\b[A-Za-z_][\w]*(?=\()/.source]],
    css: [['c', /\/\*[\s\S]*?\*\//.source], ['s', STR], ['k', /@[\w-]+/.source], ['n', /#[0-9a-fA-F]{3,8}\b|-?\b\d*\.?\d+(?:px|rem|em|%|vh|vw|ms|s|deg|fr)?(?![\w-])/.source], ['p', /[a-zA-Z-]+(?=\s*:)/.source]]
  };
  const ALIAS = { js: 'js', javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', mjs: 'js', json: 'json', py: 'py', python: 'py', css: 'css', scss: 'css' };
  const compiled = {};

  function highlight(code, lang) {
    const key = ALIAS[String(lang || '').toLowerCase()];
    const rules = LANGS[key];
    if (!rules) return esc(code);
    const re = new RegExp((compiled[key] = compiled[key] || rules.map(r => '(' + r[1] + ')').join('|')), 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      let g = 1; while (m[g] === undefined) g++;
      out += esc(code.slice(last, m.index)) + '<span class="tok-' + rules[g - 1][0] + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  /* ---------- helpers ---------- */
  const slug = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
  const plain = s => String(s).replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_~`=]/g, '').trim();
  const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])(?:\s+(.*))?$/;
  const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;
  const HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
  const HEAD_RE = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
  const SEP_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
  const blank = l => /^\s*$/.test(l);
  const indentOf = l => l.match(/^ */)[0].length;

  const CALLOUT_ICON = {
    note: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.9v.2"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    warning: '<path d="M12 4l9 16H3zM12 10v4.5M12 17.3v.2"/>',
    tip: '<path d="M5 13l4 4L19 7"/>',
    quote: '<path d="M7 17c0-4 1-7 4-9M15 17c0-4 1-7 4-9"/>',
    question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 17v.2"/>'
  };
  const CALLOUT_ALIAS = { info: 'note', abstract: 'note', todo: 'note', example: 'idea', hint: 'tip', success: 'tip', check: 'tip', done: 'tip', caution: 'warning', danger: 'warning', error: 'warning', bug: 'warning', failure: 'warning', faq: 'question', help: 'question', cite: 'quote' };

  /* ---------- inline ---------- */
  function inline(src, ctx) {
    const st = [];
    const put = h => '\u0001' + (st.push(h) - 1) + '\u0002';
    let s = String(src);
    s = s.replace(/\\\n/g, () => put('<br>') + '\n').replace(/ {2,}\n/g, () => put('<br>') + '\n');
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|~<>^=$])/g, (_, c) => put(esc(c)));
    s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) => put('<code>' + esc(code.replace(/\n/g, ' ').replace(/^ (.*) $/, '$1')) + '</code>'));
    s = s.replace(/!\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+"([^"]*)")?\s*\)/g, (_, alt, url, title) => {
      const u = safeImg(url.replace(/^<|>$/g, ''));
      return put(u ? '<img src="' + esc(u) + '" alt="' + esc(alt) + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' loading="lazy">'
        : '<span class="img-blocked" title="Only embedded (data:) images are allowed">' + esc(alt || 'image') + '</span>');
    });
    s = s.replace(/\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/g, (_, target, alias) => {
      const parts = target.trim().split('#'), name = parts[0].trim(), heading = parts.slice(1).join('#');
      const label = (alias || target).trim();
      const hit = ctx.resolve && ctx.resolve(name);
      return put(hit
        ? '<a class="wikilink" href="#" data-id="' + esc(hit.id) + '" data-target="' + esc(name) + '"' + (heading ? ' data-heading="' + esc(heading) + '"' : '') + '>' + esc(label) + '</a>'
        : '<a class="wikilink unresolved" href="#" data-target="' + esc(name) + '" title="Not created yet - click to create">' + esc(label) + '</a>');
    });
    s = s.replace(/\[\^([^\]\s]+)\]/g, (m, id) => {
      if (!Object.prototype.hasOwnProperty.call(ctx.fn.defs, id)) return m;
      let k = ctx.fn.order.indexOf(id); if (k < 0) k = ctx.fn.order.push(id) - 1;
      return put('<sup class="fnref"><a href="#" data-fn="' + (k + 1) + '" id="' + ctx.uid + 'fnref-' + (k + 1) + '">' + (k + 1) + '</a></sup>');
    });
    // The open/close <a> tags are stashed separately so the link text still flows through emphasis + tag handling.
    s = s.replace(/\[([^\[\]]+)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+"([^"]*)")?\s*\)/g, (_, text, url, title) => {
      const u = safeUrl(url.replace(/^<|>$/g, ''));
      const t = title ? ' title="' + esc(title) + '"' : '';
      if (u === null) return put('<a href="#" class="blocked" title="Blocked unsafe link">') + text + put('</a>');
      const ext = /^(https?:|mailto:)/i.test(u);
      return put('<a href="' + esc(u) + '"' + t + (ext ? ' target="_blank" rel="noopener noreferrer" class="ext"' : '') + '>') + text + put('</a>');
    });
    s = s.replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/gi, (_, u) => put('<a class="ext" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>'));
    s = s.replace(/\bhttps?:\/\/[^\s<>"'`)\]]+[^\s<>"'`).,;:!?\]]/gi, u => put('<a class="ext" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>'));
    s = esc(s);
    s = s.replace(/(^|[\s(])#([A-Za-z](?:[\w\-\/]*\w)?)/g, (_, pre, tag) => pre + put('<a class="tag" href="#" data-tag="' + esc(tag.toLowerCase()) + '">#' + esc(tag) + '</a>'));
    s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
      .replace(/\*(?=[^\s*])([^*\n]*?[^\s*])\*/g, '<em>$1</em>')
      .replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
      .replace(/==(?=\S)([^=\n]+?)==/g, '<mark>$1</mark>');
    return s.replace(/\u0001(\d+)\u0002/g, (_, k) => st[k]);
  }

  /* ---------- blocks ---------- */
  function splitRow(s) {
    s = s.trim(); if (s[0] === '|') s = s.slice(1);
    if (s.endsWith('|') && s[s.length - 2] !== '\\') s = s.slice(0, -1);
    const cells = []; let cur = '', code = false;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (c === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
      if (c === '`') code = !code;
      if (c === '|' && !code) { cells.push(cur); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur);
    return cells;
  }
  const isTableStart = (L, i) => i + 1 < L.length && L[i].includes('|') && L[i + 1].includes('|') && SEP_RE.test(L[i + 1]) && L[i + 1].includes('-');
  function isBlockStart(l) {
    if (FENCE_OPEN.test(l) || HEAD_RE.test(l) || HR_RE.test(l) || /^ {0,3}>/.test(l)) return true;
    const m = LIST_RE.exec(l);
    return !!m && (/^[-*+]$/.test(m[2]) || /^1[.)]$/.test(m[2])) && m[3] !== undefined;
  }

  function codeBlock(code, lang) {
    const l = (lang || '').toLowerCase();
    return '<div class="codeblock"><div class="code-head"><span class="code-lang">' + esc(l || 'text') + '</span><button type="button" class="code-copy" data-copy>Copy</button></div><pre><code' + (l ? ' class="lang-' + esc(l) + '"' : '') + '>' + highlight(code, l) + '</code></pre></div>';
  }

  function list(L, N, i, ctx) {
    const n = L.length, first = LIST_RE.exec(L[i]), base = first[1].length, ordered = /\d/.test(first[2]);
    const start = ordered ? parseInt(first[2], 10) : 1;
    const items = []; let loose = false, cur = null;
    while (i < n) {
      const l = L[i];
      if (blank(l)) {
        let j = i + 1; while (j < n && blank(L[j])) j++;
        if (j >= n) { i = j; break; }
        const mj = LIST_RE.exec(L[j]), ind = indentOf(L[j]);
        if (cur && (ind > base || (mj && ind >= base && /\d/.test(mj[2]) === ordered))) { loose = true; cur.lines.push(''); cur.nums.push(N[i]); i = j; continue; }
        i = j; break;
      }
      const m = LIST_RE.exec(l), ind = indentOf(l);
      if (m && ind <= base + 1) {
        if (ind < base || /\d/.test(m[2]) !== ordered) break;
        cur = { lines: [m[3] || ''], nums: [N[i]], ci: ind + m[2].length + 1 }; items.push(cur); i++; continue;
      }
      if (cur && ind > base) { cur.lines.push(l.slice(Math.min(ind, cur.ci))); cur.nums.push(N[i]); i++; continue; }
      if (cur && !m && !isBlockStart(l)) { cur.lines.push(l.trim()); cur.nums.push(N[i]); i++; continue; }
      break;
    }
    const tag = ordered ? 'ol' : 'ul';
    let html = '<' + tag + (ordered && start !== 1 ? ' start="' + start + '"' : '') + '>';
    for (const it of items) {
      const tm = /^\[([ xX])\](?:\s+(.*))?$/.exec(it.lines[0]);
      let task = null;
      if (tm) { task = tm[1] !== ' '; it.lines[0] = tm[2] || ''; }
      const inner = blocks(it.lines, it.nums, ctx, !loose);
      html += task === null ? '<li>' + inner + '</li>'
        : '<li class="task' + (task ? ' done' : '') + '"><label class="cb"><input type="checkbox" data-line="' + it.nums[0] + '"' + (task ? ' checked' : '') + '><span class="cb-box"></span></label><div class="task-body">' + inner + '</div></li>';
    }
    return { html: html + '</' + tag + '>', next: i };
  }

  function blocks(L, N, ctx, tight) {
    let out = '', i = 0; const n = L.length;
    while (i < n) {
      const line = L[i];
      if (blank(line)) { i++; continue; }
      let m;
      if ((m = FENCE_OPEN.exec(line))) {
        const fence = m[2], ind = m[1].length, buf = []; i++;
        while (i < n) {
          const c = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(L[i]);
          if (c && c[1][0] === fence[0] && c[1].length >= fence.length) { i++; break; }
          buf.push(L[i].slice(Math.min(ind, indentOf(L[i])))); i++;
        }
        out += codeBlock(buf.join('\n'), m[3]); continue;
      }
      if ((m = HEAD_RE.exec(line))) {
        const lvl = m[1].length, text = m[2];
        let id = slug(plain(text)); const k = ctx.slugs[id] = (ctx.slugs[id] || 0) + 1; if (k > 1) id += '-' + k;
        ctx.headings.push({ level: lvl, text: plain(text), id: ctx.prefix + id, line: N[i] });
        out += '<h' + lvl + ' id="' + ctx.prefix + id + '" data-line="' + N[i] + '">' + inline(text, ctx) + '</h' + lvl + '>'; i++; continue;
      }
      if (HR_RE.test(line)) { out += '<hr>'; i++; continue; }
      if (/^ {0,3}>/.test(line)) {
        const bl = [], bn = [];
        while (i < n && /^ {0,3}>/.test(L[i])) { bl.push(L[i].replace(/^ {0,3}> ?/, '')); bn.push(N[i]); i++; }
        const cm = /^\[!([A-Za-z]+)\][+-]?\s*(.*)$/.exec(bl[0]);
        if (cm) {
          const raw = cm[1].toLowerCase(); let type = CALLOUT_ALIAS[raw] || raw; if (!CALLOUT_ICON[type]) type = 'note';
          const title = cm[2] || raw.charAt(0).toUpperCase() + raw.slice(1);
          const inner = blocks(bl.slice(1), bn.slice(1), ctx, false);
          out += '<div class="callout callout-' + type + '"><div class="callout-title"><svg viewBox="0 0 24 24" aria-hidden="true">' + CALLOUT_ICON[type] + '</svg><span>' + inline(title, ctx) + '</span></div>' + (inner ? '<div class="callout-body">' + inner + '</div>' : '') + '</div>';
        } else out += '<blockquote>' + blocks(bl, bn, ctx, false) + '</blockquote>';
        continue;
      }
      if (isTableStart(L, i)) {
        const head = splitRow(line), al = splitRow(L[i + 1]).map(c => { c = c.trim(); return c[0] === ':' && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'r' : ''; });
        i += 2;
        const rows = [];
        while (i < n && !blank(L[i]) && !isBlockStart(L[i])) { rows.push(splitRow(L[i])); i++; }
        const cell = (tag, c, k) => '<' + tag + (al[k] ? ' class="al-' + al[k] + '"' : '') + '>' + inline(String(c == null ? '' : c).trim(), ctx) + '</' + tag + '>';
        out += '<div class="table-wrap"><table><thead><tr>' + head.map((c, k) => cell('th', c, k)).join('') + '</tr></thead><tbody>' +
          rows.map(r => '<tr>' + head.map((_, k) => cell('td', r[k], k)).join('') + '</tr>').join('') + '</tbody></table></div>';
        continue;
      }
      if (LIST_RE.test(line) && !HR_RE.test(line)) { const r = list(L, N, i, ctx); out += r.html; i = r.next; continue; }
      // paragraph
      const buf = [], start = i;
      while (i < n && !blank(L[i]) && (buf.length === 0 || (!isBlockStart(L[i]) && !isTableStart(L, i)))) { buf.push(L[i].replace(/^\s+/, '')); i++; }
      const html = inline(buf.join('\n'), ctx);
      out += tight ? html : '<p data-line="' + N[start] + '">' + html + '</p>';
    }
    return out;
  }

  function render(src, opts) {
    opts = opts || {};
    const prefix = opts.idPrefix || '';
    const ctx = { resolve: opts.resolve || null, fn: { defs: {}, order: [] }, slugs: {}, prefix: 'h-' + prefix, uid: prefix, headings: [] };
    src = String(src == null ? '' : src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/[\u0001\u0002]/g, '');
    const lines = src.split('\n'), body = [], nums = [];
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], fm = /^ {0,3}(`{3,}|~{3,})/.exec(l);
      if (fence) { if (fm && fm[1][0] === fence[0] && fm[1].length >= fence.length && /^\s*$/.test(l.slice(fm[0].length))) fence = null; body.push(l); nums.push(i); continue; }
      if (fm) { fence = fm[1]; body.push(l); nums.push(i); continue; }
      const d = /^\[\^([^\]\s]+)\]:\s?(.*)$/.exec(l);
      if (d) { let text = d[2]; while (i + 1 < lines.length && /^ {2,}\S/.test(lines[i + 1])) text += ' ' + lines[++i].trim(); ctx.fn.defs[d[1]] = text; continue; }
      body.push(l); nums.push(i);
    }
    let html = blocks(body, nums, ctx, false);
    if (ctx.fn.order.length) {
      html += '<section class="footnotes"><ol>' + ctx.fn.order.map((id, k) =>
        '<li id="' + prefix + 'fn-' + (k + 1) + '" data-fnid="' + (k + 1) + '">' + inline(ctx.fn.defs[id], ctx) + ' <a href="#" class="fn-back" data-fnref="' + (k + 1) + '" aria-label="Back to text">&#8617;</a></li>').join('') + '</ol></section>';
    }
    if (opts.headings) opts.headings.push(...ctx.headings);
    return html;
  }

  /* ---------- structure extraction (links, tags, headings) - ignores code ---------- */
  function extract(src) {
    const links = [], tags = new Set(), headings = [];
    let fence = null;
    String(src).split('\n').forEach((l, i) => {
      const fm = /^ {0,3}(`{3,}|~{3,})/.exec(l);
      if (fence) { if (fm && fm[1][0] === fence[0] && fm[1].length >= fence.length && /^\s*$/.test(l.slice(fm[0].length))) fence = null; return; }
      if (fm) { fence = fm[1]; return; }
      let t = l.replace(/(`+)[^`]*?\1/g, ' ');
      const h = HEAD_RE.exec(t); if (h) headings.push({ level: h[1].length, text: plain(h[2]), line: i });
      let m; const wl = /\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/g;
      while ((m = wl.exec(t))) links.push({ target: m[1].split('#')[0].trim(), alias: m[2] || null });
      t = t.replace(wl, ' ').replace(/\]\([^)]*\)/g, ' ');
      const tg = /(^|[\s(])#([A-Za-z](?:[\w\-\/]*\w)?)/g;
      while ((m = tg.exec(t))) tags.add(m[2].toLowerCase());
    });
    return { links, tags: [...tags], headings };
  }

  const wordCount = src => { const m = String(src).replace(/```[\s\S]*?```/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu); return m ? m.length : 0; };

  /* ---------- editor source highlighting: output text is byte-identical to the input ---------- */
  const SRC_INLINE = /(`+)[^`\n]*?\1|\[\[[^\]\n]*\]\]|\[\^[^\]\s]+\]|\[[^\]\n]*\]\([^)\n]*\)|\*\*[^*\n]+\*\*|__[^_\n]+__|(?<![*\w])\*[^*\s][^*\n]*\*(?!\*)|~~[^~\n]+~~|==[^=\n]+==|(?<=^|[\s(])#[A-Za-z][\w\-\/]*/g;
  function srcClass(t) {
    if (t[0] === '`') return 's-ic';
    if (t.startsWith('[[')) return 's-wl';
    if (t.startsWith('[^')) return 's-fn';
    if (t[0] === '[') return 's-link';
    if (t.startsWith('**') || t.startsWith('__')) return 's-b';
    if (t[0] === '*') return 's-i';
    if (t.startsWith('~~')) return 's-del';
    if (t.startsWith('==')) return 's-hl';
    return 's-tag';
  }
  function srcInline(t) {
    let out = '', last = 0, m; SRC_INLINE.lastIndex = 0;
    while ((m = SRC_INLINE.exec(t))) {
      if (!m[0]) { SRC_INLINE.lastIndex++; continue; }
      out += esc(t.slice(last, m.index)) + '<span class="' + srcClass(m[0]) + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(t.slice(last));
  }
  function highlightSource(src) {
    const out = []; let fence = null;
    for (const l of String(src).split('\n')) {
      let m;
      if ((m = /^( {0,3})(`{3,}|~{3,})/.exec(l))) {
        if (!fence) { fence = m[2]; out.push('<span class="s-fence">' + esc(l) + '</span>'); continue; }
        if (m[2][0] === fence[0] && m[2].length >= fence.length && l.trim() === m[2]) { fence = null; out.push('<span class="s-fence">' + esc(l) + '</span>'); continue; }
      }
      if (fence) { out.push('<span class="s-code">' + esc(l) + '</span>'); continue; }
      if ((m = /^(#{1,6})(\s+)(.*)$/.exec(l))) { out.push('<span class="s-h s-h' + m[1].length + '"><span class="s-mk">' + m[1] + '</span>' + esc(m[2]) + srcInline(m[3]) + '</span>'); continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<span class="s-mk">' + esc(l) + '</span>'); continue; }
      if ((m = /^(\s*)((?:>\s?)+)(.*)$/.exec(l))) {
        const cal = /^(\[!\w+\][+-]?)(.*)$/.exec(m[3]);
        out.push(esc(m[1]) + '<span class="s-mk">' + esc(m[2]) + '</span><span class="s-quote">' + (cal ? '<span class="s-callout">' + esc(cal[1]) + '</span>' + srcInline(cal[2]) : srcInline(m[3])) + '</span>'); continue;
      }
      if ((m = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\])?(\s*)(.*)$/.exec(l))) {
        out.push(esc(m[1]) + '<span class="s-mk">' + esc(m[2]) + '</span>' + esc(m[3]) + (m[4] ? '<span class="s-task">' + m[4] + '</span>' : '') + esc(m[5]) + srcInline(m[6])); continue;
      }
      if (/^\s*\|.*\|\s*$/.test(l)) { out.push(l.split('|').map(srcInline).join('<span class="s-mk">|</span>')); continue; }
      if ((m = /^(\[\^[^\]\s]+\]:)(.*)$/.exec(l))) { out.push('<span class="s-fn">' + esc(m[1]) + '</span>' + srcInline(m[2])); continue; }
      out.push(srcInline(l));
    }
    return out.join('\n');
  }

  return { render, extract, highlightSource, highlight, inline, esc, safeUrl, safeImg, slug, plain, wordCount };
});
