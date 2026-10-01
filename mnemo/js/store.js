/* Mnemo store: notes, link index, search, history, rename-with-link-update, import/export (incl. a hand-rolled ZIP writer). */
(function (M) {
  'use strict';
  const Md = M.md;
  const KEY = 'mnemo.v1.notes';
  const DAY = 864e5;

  const notes = new Map();
  const listeners = new Set();
  const parsedCache = new Map();
  let index = null, saveTimer = 0, warnedFull = false;

  const S = M.store = {
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(type, id) { index = type === 'meta' ? index : null; listeners.forEach(fn => fn(type, id)); },
    all() { return Array.from(notes.values()); },
    get: id => notes.get(id) || null,
    size: () => notes.size
  };

  /* ---------- persistence ---------- */
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ok = M.storage.set(KEY, { v: 1, notes: S.all() });
      if (!ok && !warnedFull) { warnedFull = true; M.toast('Browser storage is full or unavailable - export a JSON backup from the menu.', { ms: 7000 }); }
    }, 200);
  }
  S.flush = () => { clearTimeout(saveTimer); M.storage.set(KEY, { v: 1, notes: S.all() }); };

  S.load = function () {
    const saved = M.storage.get(KEY, null);
    if (saved && Array.isArray(saved.notes) && saved.notes.length) saved.notes.forEach(n => notes.set(n.id, normalize(n)));
    else S.reset(true);
  };
  S.reset = function (silent) {
    notes.clear(); parsedCache.clear();
    M.seedNotes().forEach(n => notes.set(n.id, n));
    persist(); if (!silent) S.emit('structure');
  };
  function normalize(n) {
    return { id: String(n.id), title: String(n.title || 'Untitled'), body: String(n.body || ''), created: +n.created || Date.now(), updated: +n.updated || Date.now(), pinned: !!n.pinned, h: Array.isArray(n.h) ? n.h.slice(-20) : [] };
  }

  /* ---------- derived index ---------- */
  function parsed(n) {
    let c = parsedCache.get(n.id);
    if (!c || c.body !== n.body) { c = { body: n.body, ext: Md.extract(n.body) }; parsedCache.set(n.id, c); }
    return c.ext;
  }
  function ix() {
    if (index) return index;
    const byTitle = new Map(), out = new Map(), back = new Map(), tags = new Map(), unresolved = new Map();
    notes.forEach(n => byTitle.set(n.title.toLowerCase(), n.id));
    const add = (m, k, v) => { let s = m.get(k); if (!s) m.set(k, s = new Set()); s.add(v); };
    notes.forEach(n => {
      const e = parsed(n), o = new Set();
      e.links.forEach(l => {
        const t = byTitle.get(l.target.toLowerCase());
        if (t && t !== n.id) { o.add(t); add(back, t, n.id); }
        else if (!t) add(unresolved, l.target.toLowerCase(), n.id);
      });
      out.set(n.id, o);
      e.tags.forEach(t => add(tags, t, n.id));
    });
    index = { byTitle, out, back, tags, unresolved };
    return index;
  }
  S.byTitle = t => { const id = ix().byTitle.get(String(t).trim().toLowerCase()); return id ? notes.get(id) : null; };
  S.resolve = t => S.byTitle(t);
  S.outgoing = id => Array.from(ix().out.get(id) || []);
  S.incoming = id => Array.from(ix().back.get(id) || []);
  S.unresolvedOf = id => { const n = notes.get(id); if (!n) return []; const seen = new Set(), res = []; parsed(n).links.forEach(l => { const k = l.target.toLowerCase(); if (!S.byTitle(l.target) && !seen.has(k)) { seen.add(k); res.push(l.target); } }); return res; };
  S.tags = id => parsed(notes.get(id)).tags;
  S.headings = id => parsed(notes.get(id)).headings;
  S.tagCounts = () => Array.from(ix().tags, ([t, s]) => ({ tag: t, count: s.size })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  S.notesWithTag = t => Array.from(ix().tags.get(t) || [], id => notes.get(id));
  S.graph = function () {
    const nodes = S.all().map(n => ({ id: n.id, title: n.title, tags: parsed(n).tags, created: n.created, pinned: n.pinned }));
    const edges = [], seen = new Set();
    ix().out.forEach((set, a) => set.forEach(b => { const k = a < b ? a + '|' + b : b + '|' + a; if (!seen.has(k)) { seen.add(k); edges.push([a, b]); } }));
    return { nodes, edges };
  };

  /* Contexts around each [[link]] to a note, for the backlinks panel. */
  S.backlinks = function (id) {
    const target = notes.get(id); if (!target) return [];
    const re = new RegExp('\\[\\[\\s*' + M.escRe(target.title) + '\\s*(?:[#|][^\\]]*)?\\]\\]', 'i');
    return S.incoming(id).map(src => {
      const n = notes.get(src), lines = n.body.split('\n'); let ctx = '', fence = false;
      for (const l of lines) { if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; } if (!fence && re.test(l)) { ctx = l; break; } }
      return { id: src, title: n.title, snippet: ctx };
    }).sort((a, b) => a.title.localeCompare(b.title));
  };
  S.unlinkedMentions = function (id) {
    const target = notes.get(id); if (!target || target.title.length < 3) return [];
    const re = new RegExp('(^|[^\\w\\[])(' + M.escRe(target.title) + ')(?![\\w\\]])', 'i'), linked = new Set(S.incoming(id)), res = [];
    notes.forEach(n => {
      if (n.id === id || linked.has(n.id)) return;
      let fence = false;
      for (const l of n.body.split('\n')) {
        if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
        if (!fence && re.test(l.replace(/`[^`]*`/g, ' ').replace(/\[\[[^\]]*\]\]/g, ' '))) { res.push({ id: n.id, title: n.title, snippet: l }); break; }
      }
    });
    return res.sort((a, b) => a.title.localeCompare(b.title));
  };
  S.linkMention = function (srcId, title) {
    const n = notes.get(srcId); if (!n) return;
    const re = new RegExp('(^|[^\\w\\[])(' + M.escRe(title) + ')(?![\\w\\]])', 'i');
    let done = false;
    const body = mapOutsideCode(n.body, seg => done ? seg : seg.replace(re, (m, pre, hit) => { done = true; return pre + '[[' + (hit === title ? title : title + '|' + hit) + ']]'; }));
    S.update(srcId, { body });
  };

  /* ---------- search ---------- */
  function strip(md) { return md.replace(/^#{1,6}\s+/, '').replace(/^>\s?(\[!\w+\]\s*)?/, '').replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s*)?/, '').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/[*_`~=]/g, ''); }
  function snippet(body, toks) {
    const lines = body.split('\n'); let best = null, bi = -1;
    for (const l of lines) {
      const low = l.toLowerCase(), hits = toks.filter(t => low.includes(t)).length;
      if (hits && (hits > bi)) { best = l; bi = hits; if (hits === toks.length) break; }
    }
    let text = strip(best || lines.find(l => l.trim() && !/^#/.test(l)) || '').trim();
    const low = text.toLowerCase(); let pos = 0;
    for (const t of toks) { const p = low.indexOf(t); if (p >= 0) { pos = p; break; } }
    const a = Math.max(0, pos - 60), b = Math.min(text.length, pos + 110);
    text = (a > 0 ? '…' : '') + text.slice(a, b) + (b < text.length ? '…' : '');
    let html = M.esc(text);
    toks.forEach(t => { html = html.replace(new RegExp('(' + M.escRe(M.esc(t)) + ')', 'gi'), '<mark>$1</mark>'); });
    return html;
  }
  S.search = function (q) {
    q = q.trim(); if (!q) return [];
    const res = [];
    if (q[0] === '#' && q.length > 1) {
      const tag = q.slice(1).toLowerCase();
      notes.forEach(n => { if (S.tags(n.id).some(t => t.startsWith(tag))) res.push({ id: n.id, score: n.updated, snippet: M.esc(strip(n.body.split('\n').find(l => l.trim() && !/^#/.test(l)) || '').slice(0, 130)) }); });
      return res.sort((a, b) => b.score - a.score);
    }
    const low = q.toLowerCase(), toks = low.split(/\s+/).filter(Boolean);
    notes.forEach(n => {
      const t = n.title.toLowerCase(), b = n.body.toLowerCase(), tg = S.tags(n.id);
      let score = 0;
      for (const k of toks) {
        let s = t === k ? 40 : t.startsWith(k) ? 26 : t.includes(k) ? 16 : 0;
        let c = 0, p = -1; while ((p = b.indexOf(k, p + 1)) !== -1 && c < 30) c++;
        s += Math.min(c, 12) * 2 + (c > 12 ? 2 : 0);
        if (tg.some(x => x.startsWith(k))) s += 8;
        if (!s) return;
        score += s;
      }
      if (toks.length > 1 && (b.includes(low) || t.includes(low))) score += 24;
      res.push({ id: n.id, score, snippet: snippet(n.body, toks) });
    });
    return res.sort((a, b) => b.score - a.score).slice(0, 60);
  };

  /* ---------- mutations ---------- */
  S.uniqueTitle = function (base) {
    let t = base, k = 2; while (S.byTitle(t)) t = base + ' ' + k++; return t;
  };
  S.create = function (opts) {
    opts = opts || {};
    const now = Date.now();
    const n = { id: M.uid(), title: S.uniqueTitle((opts.title || 'Untitled').trim() || 'Untitled'), body: opts.body == null ? '' : opts.body, created: now, updated: now, pinned: false, h: [] };
    notes.set(n.id, n); persist(); S.emit('structure', n.id);
    return n;
  };
  S.update = function (id, patch, quiet) {
    const n = notes.get(id); if (!n) return;
    const now = Date.now();
    if (patch.body != null && patch.body !== n.body) {
      const last = n.h[n.h.length - 1];
      if (!last || now - last.t > 120e3) { n.h.push({ t: now, b: n.body }); if (n.h.length > 20) n.h.shift(); }
      n.body = patch.body; n.updated = now;
    }
    if (patch.pinned != null) n.pinned = !!patch.pinned;
    persist(); if (!quiet) S.emit('change', id);
  };
  S.snapshot = function (id) {
    const n = notes.get(id); if (!n) return false;
    const last = n.h[n.h.length - 1];
    if (last && last.b === n.body) return false;
    n.h.push({ t: Date.now(), b: n.body }); if (n.h.length > 20) n.h.shift();
    persist(); S.emit('change', id); return true;
  };
  S.restoreVersion = function (id, i) {
    const n = notes.get(id); if (!n || !n.h[i]) return;
    const body = n.h[i].b; n.h.push({ t: Date.now(), b: n.body }); if (n.h.length > 20) n.h.shift();
    n.body = body; n.updated = Date.now(); persist(); S.emit('structure', id);
  };
  S.remove = function (id) {
    const n = notes.get(id); if (!n) return null;
    notes.delete(id); parsedCache.delete(id); persist(); S.emit('structure', id); return n;
  };
  S.reinsert = function (n) { notes.set(n.id, n); persist(); S.emit('structure', n.id); };
  /** Apply an edit that came from outside the app (a changed file in the synced folder). The old body is kept in the note's history. */
  S.applyExternal = function (id, p) {
    const n = notes.get(id); if (!n) return false;
    if (p.body != null && p.body !== n.body) { n.h.push({ t: Date.now(), b: n.body }); if (n.h.length > 20) n.h.shift(); n.body = p.body; }
    if (p.title && p.title !== n.title) { const clash = S.byTitle(p.title); n.title = clash && clash.id !== id ? S.uniqueTitle(p.title) : p.title; }
    if (p.pinned != null) n.pinned = !!p.pinned;
    n.updated = p.updated || Date.now();
    persist(); S.emit('structure', id); return true;
  };

  function mapOutsideCode(body, fn) {
    let fence = false;
    return body.split('\n').map(l => {
      if (/^ {0,3}(```|~~~)/.test(l)) { fence = !fence; return l; }
      if (fence) return l;
      return l.split(/(`+[^`]*`+)/).map((seg, i) => i % 2 ? seg : fn(seg)).join('');
    }).join('\n');
  }
  S.rename = function (id, title) {
    const n = notes.get(id); title = String(title).trim().replace(/\s+/g, ' ');
    if (!n || !title || title === n.title) return { changed: false };
    const clash = S.byTitle(title); if (clash && clash.id !== id) return { error: 'Another note is already called “' + clash.title + '”.' };
    const re = new RegExp('\\[\\[\\s*' + M.escRe(n.title) + '\\s*((?:#[^\\]|]*)?(?:\\|[^\\]]*)?)\\]\\]', 'gi');
    let links = 0, files = 0;
    notes.forEach(o => {
      let hit = 0;
      const body = mapOutsideCode(o.body, seg => seg.replace(re, (m, rest) => { hit++; return '[[' + title + rest + ']]'; }));
      if (hit) { o.h.push({ t: Date.now(), b: o.body }); if (o.h.length > 20) o.h.shift(); o.body = body; o.updated = Date.now(); links += hit; files++; }
    });
    n.title = title; n.updated = Date.now(); persist(); S.emit('structure', id);
    return { changed: true, links, files };
  };
  S.togglePin = id => { const n = notes.get(id); if (n) { n.pinned = !n.pinned; persist(); S.emit('meta', id); } return n && n.pinned; };

  S.daily = function () {
    const title = M.isoDate();
    let n = S.byTitle(title);
    if (!n) {
      const d = new Date(), days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const y = M.isoDate(Date.now() - DAY), tm = M.isoDate(Date.now() + DAY);
      n = S.create({ title, body: '# ' + days[d.getDay()] + '\n\n[[' + y + ']] · [[' + tm + ']]\n\n## Intentions\n\n- [ ] \n\n## Notes\n\n\n\n## Evening review\n\n> [!question] What went well, what did I avoid, what would I do differently?\n\n#daily\n' });
    }
    return n;
  };

  /* ---------- export / import ---------- */
  S.exportJSON = () => JSON.stringify({ app: 'mnemo', version: 1, exported: new Date().toISOString(), notes: S.all() }, null, 2);
  S.importJSON = function (text) {
    let data; try { data = JSON.parse(text); } catch (e) { return { error: 'That file is not valid JSON.' }; }
    const list = Array.isArray(data) ? data : data && data.notes;
    if (!Array.isArray(list)) return { error: 'No notes array found in that file.' };
    let added = 0, updated = 0, skipped = 0;
    list.forEach(raw => {
      if (!raw || typeof raw.title !== 'string' || typeof raw.body !== 'string') { skipped++; return; }
      const n = normalize(Object.assign({ id: M.uid() }, raw));
      const ex = notes.get(n.id) || S.byTitle(n.title);
      if (ex) { if (n.updated > ex.updated) { n.id = ex.id; notes.set(n.id, n); updated++; } else skipped++; }
      else { notes.set(n.id, n); added++; }
    });
    persist(); S.emit('structure');
    return { added, updated, skipped };
  };

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), chunks = [], central = [];
    const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    const dt = new Date(), dosT = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1), dosD = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
    let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const head = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, ...u16(dosT), ...u16(dosD), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0]);
      chunks.push(head, name, data); central.push({ name, crc, size: data.length, offset }); offset += head.length + name.length + data.length;
    });
    let cd = 0;
    central.forEach(c => {
      const h = new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, ...u16(dosT), ...u16(dosD), ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(c.offset)]);
      chunks.push(h, c.name); cd += h.length + c.name.length;
    });
    chunks.push(new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(central.length), ...u16(central.length), ...u32(cd), ...u32(offset), 0, 0]));
    return new Blob(chunks, { type: 'application/zip' });
  }
  S.exportZip = function () {
    const used = new Set();
    const files = S.all().map(n => {
      let base = n.title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled', name = base, k = 2;
      while (used.has(name.toLowerCase())) name = base + ' ' + k++;
      used.add(name.toLowerCase());
      const fm = '---\ntitle: ' + JSON.stringify(n.title) + '\ncreated: ' + new Date(n.created).toISOString() + '\nupdated: ' + new Date(n.updated).toISOString() + '\ntags: [' + S.tags(n.id).join(', ') + ']\n---\n\n';
      return { name: 'Mnemo notes/' + name + '.md', data: fm + n.body };
    });
    return zip(files);
  };
  S._zip = zip;

  /* ---------- seeding ---------- */
  M.seedNotes = function () {
    const rand = M.mulberry(20260930), now = Date.now();
    const out = [];
    M.SEED.split(/^@@ /m).slice(1).forEach((chunk, i) => {
      const nl = chunk.indexOf('\n'), head = chunk.slice(0, nl).split('|').map(s => s.trim());
      const body = chunk.slice(nl + 1).replace(/\s+$/, '') + '\n';
      const days = +head[1] || 10;
      const created = now - days * DAY + Math.floor(rand() * 0.7 * DAY);
      const updated = Math.min(now - 60e3, created + Math.floor(rand() * Math.min(days, 40) * 0.6 * DAY));
      const paras = body.split('\n\n');
      const h = i % 4 === 0 && paras.length > 3 ? [{ t: created + 3600e3, b: paras.slice(0, -1).join('\n\n') + '\n' }] : [];
      out.push({ id: 's' + (i + 1), title: head[0], body, created, updated, pinned: /pin/.test(head[2] || ''), h });
    });
    return out;
  };
})(window.Mnemo);
