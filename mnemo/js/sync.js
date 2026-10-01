/* Mnemo folder sync.
 *
 * Mirrors the notebook to a folder of plain Markdown files (one file per note, YAML front matter, [[wiki links]] untouched) and reads changes
 * made to those files from outside, so the same folder can live in OneDrive and be read or edited by other tools.
 *
 *   - Chrome / Edge: the File System Access API. The user picks a folder once (the browser asks permission); the handle is remembered in
 *     IndexedDB and permission is re-requested with one click per browser session.
 *   - Any browser (incl. Firefox): "Export Markdown bundle (.zip)" and "Import Markdown files" - no folder access needed.
 *
 * Safety rules, deliberately conservative:
 *   - It never deletes a file. Deleting or renaming a note in Mnemo leaves the old file in the folder.
 *   - Only .md / .markdown / .txt files are read; files starting with "_" are ignored (the generated index starts with "_").
 *   - Text read from files is untrusted: it only ever becomes note text, which Mnemo renders with its own escaping.
 *   - Newer wins. When both sides changed, the newer one is kept and the other body is saved in the note's history.
 *
 * The pure helpers (fileName, toFile, parseFile) have no DOM dependency and are unit-tested under node (tests/test-sync.mjs).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Mnemo = root.Mnemo || {}; root.Mnemo.syncCore = api; if (root.document) root.Mnemo.syncInit = api.init; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ------------------------------------------------------------------ pure helpers */
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  const EXTS = ['.md', '.markdown', '.txt'];

  /** A file name that is legal on Windows, macOS and Linux and survives OneDrive. */
  function safeName(title) {
    let s = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^[.\s-]+|[.\s]+$/g, '');
    if (!s) s = 'Untitled';
    if (RESERVED.test(s)) s = s + '_';
    if (s.length > 120) s = s.slice(0, 120).trim();
    return s;
  }
  /** Unique, case-insensitive file names for a list of {id,title}. Stable for a given set of notes. */
  function assignNames(notes, ext) {
    const used = new Map(), out = new Map();
    const sorted = notes.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (const n of sorted) {
      const base = safeName(n.title);
      let name = base, k = 2;
      while (used.has(name.toLowerCase())) name = base + ' ' + k++;
      used.set(name.toLowerCase(), n.id);
      out.set(n.id, name + ext);
    }
    return out;
  }
  const q = s => JSON.stringify(String(s));
  const iso = t => new Date(t).toISOString();

  /** The text of a note file. tags are written for readers (and other tools) but are always re-derived from the body on import. */
  function toFile(n, tags) {
    const fm = ['---', 'mnemo-id: ' + q(n.id), 'title: ' + q(n.title), 'created: ' + iso(n.created), 'updated: ' + iso(n.updated), 'pinned: ' + (n.pinned ? 'true' : 'false'), 'tags: [' + (tags || []).join(', ') + ']', '---', ''];
    return fm.join('\n') + '\n' + n.body.replace(/^\n+/, '');
  }
  function unq(v) {
    v = v.trim();
    if (v[0] === '"') { try { return JSON.parse(v); } catch (e) { return v.replace(/^"|"$/g, ''); } }
    if (v[0] === "'") return v.replace(/^'|'$/g, '').replace(/''/g, "'");
    return v;
  }
  /** Parse a note file. Files without front matter (written by hand or by another tool) are fine: the title then comes from the file name. */
  function parseFile(text, fileName) {
    text = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const out = { id: null, title: null, created: null, updated: null, pinned: null, body: text };
    const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
    if (m) {
      out.body = text.slice(m[0].length).replace(/^\n/, '');
      for (const line of m[1].split('\n')) {
        const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line); if (!kv) continue;
        const k = kv[1].toLowerCase(), v = kv[2];
        if (k === 'mnemo-id' || k === 'id') out.id = String(unq(v)).slice(0, 80);
        else if (k === 'title') out.title = String(unq(v)).slice(0, 300);
        else if (k === 'created' || k === 'updated') { const t = Date.parse(unq(v)); if (isFinite(t)) out[k] = t; }
        else if (k === 'pinned') out.pinned = /^true$/i.test(v.trim());
      }
    }
    if (!out.title) out.title = String(fileName || 'Untitled').replace(/\.(md|markdown|txt)$/i, '').trim() || 'Untitled';
    if (out.id && !/^[\w.-]{1,80}$/.test(out.id)) out.id = null;   // never trust an odd id from outside
    out.body = out.body.replace(/\s+$/, '') + '\n';
    return out;
  }
  const isNoteFile = name => EXTS.some(e => name.toLowerCase().endsWith(e)) && name[0] !== '_' && name[0] !== '.';

  function indexFile(notes, tagsOf, ext) {
    const names = assignNames(notes, ext);
    const rows = notes.slice().sort((a, b) => b.updated - a.updated).map(n => '- [[' + n.title + ']] - ' + iso(n.updated).slice(0, 10) + (tagsOf(n.id).length ? ' - ' + tagsOf(n.id).map(t => '#' + t).join(' ') : '') + '  (' + names.get(n.id) + ')');
    return '# Mnemo notebook index\n\nGenerated by Mnemo. Do not edit: it is rewritten on every sync and ignored when notes are read back.\n\n' +
      'Each note is one file in this folder. A note starts with a small front-matter block (`mnemo-id`, `title`, `created`, `updated`, `pinned`, `tags`), followed by Markdown. ' +
      'Links between notes are written `[[Note title]]`. Edits made to these files are picked up the next time Mnemo syncs; the file with the newer `updated` time wins.\n\n' +
      '## Notes (' + notes.length + ')\n\n' + rows.join('\n') + '\n';
  }

  /* ------------------------------------------------------------------ browser engine */
  function init(M) {
    const S = M.store;
    const CFG_KEY = 'mnemo.v1.sync';
    const cfg = Object.assign({ on: false, name: '', ext: '.md', auto: true, files: {}, wrote: {}, nameOf: {}, retired: {}, last: 0 }, M.storage.get(CFG_KEY, {}));
    const saveCfg = () => M.storage.set(CFG_KEY, cfg);
    const supported = typeof window.showDirectoryPicker === 'function';
    const Y = { supported, cfg, handle: null, state: supported ? (cfg.on ? 'locked' : 'off') : 'unsupported', busy: false, listeners: new Set() };
    const emit = () => Y.listeners.forEach(f => f(Y));

    /* the folder handle lives in IndexedDB (handles are structured-cloneable) */
    const idb = {
      open: () => new Promise((res, rej) => { const r = indexedDB.open('mnemo-sync', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
      async get() { try { const db = await idb.open(); return await new Promise((res, rej) => { const t = db.transaction('h').objectStore('h').get('dir'); t.onsuccess = () => res(t.result || null); t.onerror = () => rej(t.error); }); } catch (e) { return null; } },
      async set(h) { try { const db = await idb.open(); await new Promise((res, rej) => { const t = db.transaction('h', 'readwrite'); t.objectStore('h').put(h, 'dir'); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { /* ignore */ } },
      async del() { try { const db = await idb.open(); await new Promise((res) => { const t = db.transaction('h', 'readwrite'); t.objectStore('h').delete('dir'); t.oncomplete = res; t.onerror = res; }); } catch (e) { /* ignore */ } }
    };

    async function permitted(ask) {
      if (!Y.handle) return false;
      try {
        const o = { mode: 'readwrite' };
        if (await Y.handle.queryPermission(o) === 'granted') return true;
        return ask ? (await Y.handle.requestPermission(o)) === 'granted' : false;
      } catch (e) { return false; }
    }

    /* ---- reading changes from the folder ---- */
    function noteFromFile(f, name, mtime, known) {
      const n = f.id ? S.get(f.id) : null;
      const byTitle = S.byTitle(f.title);
      const target = n || (byTitle && !f.id ? byTitle : null);
      if (!target) {
        const t = Math.min(mtime, Date.now());
        const created = f.created || t, updated = f.updated || t;
        const fresh = { id: f.id && !S.get(f.id) ? f.id : M.uid(), title: S.uniqueTitle(f.title), body: f.body, created, updated, pinned: !!f.pinned, h: [] };
        S.reinsert(fresh);
        return 'added';
      }
      if (target.body === f.body && (!f.title || f.title === target.title)) return 'same';
      const fileTime = known ? Math.max(f.updated || 0, mtime) : (f.updated || mtime);
      if (fileTime <= target.updated + 1000) return 'older';     // the app's copy is the newer one
      const editing = M.ui && M.ui.state && M.ui.state.activeId === target.id && document.activeElement && /ed-ta/.test(document.activeElement.className);
      if (editing) return 'busy';
      S.applyExternal(target.id, { body: f.body, title: f.title, pinned: f.pinned, updated: Math.min(fileTime, Date.now()) });
      return 'updated';
    }

    async function readFolder() {
      const r = { added: 0, updated: 0, same: 0, older: 0, busy: 0, skipped: 0 };
      const seen = new Set();
      for await (const [name, h] of Y.handle.entries()) {
        if (h.kind !== 'file' || !isNoteFile(name) || cfg.retired[name]) continue;
        seen.add(name);
        let file; try { file = await h.getFile(); } catch (e) { r.skipped++; continue; }
        const prev = cfg.files[name];
        if (prev && prev === file.lastModified) { r.same++; continue; }
        if (file.size > 2e6) { r.skipped++; continue; }
        const f = parseFile(await file.text(), name);
        const res = noteFromFile(f, name, file.lastModified, prev != null);
        r[res]++;
        if (res !== 'busy') cfg.files[name] = file.lastModified;
      }
      return r;
    }

    /* ---- writing changes to the folder ---- */
    async function writeFolder() {
      const all = S.all(), names = assignNames(all, cfg.ext);
      let wrote = 0;
      for (const n of all) {
        const name = names.get(n.id), key = n.id + '|' + name;
        const prevName = cfg.nameOf[n.id];
        if (prevName && prevName !== name) cfg.retired[prevName] = n.id;
        if (cfg.retired[name] === n.id) delete cfg.retired[name];
        cfg.nameOf[n.id] = name;
        if (cfg.wrote[key] === n.updated + ':' + (n.pinned ? 1 : 0) + ':' + n.title) continue;
        const fh = await Y.handle.getFileHandle(name, { create: true });
        const w = await fh.createWritable(); await w.write(toFile(n, S.tags(n.id))); await w.close();
        cfg.wrote[key] = n.updated + ':' + (n.pinned ? 1 : 0) + ':' + n.title;
        cfg.files[name] = (await fh.getFile()).lastModified;
        wrote++;
      }
      // the generated index, only when something changed
      const idxKey = '_index|' + all.length + ':' + all.reduce((a, n) => Math.max(a, n.updated), 0) + ':' + all.map(n => n.title).join('').length;
      if (cfg.wrote._index !== idxKey) {
        const fh = await Y.handle.getFileHandle('_Mnemo index.md', { create: true });
        const w = await fh.createWritable(); await w.write(indexFile(all, id => S.tags(id), cfg.ext)); await w.close();
        cfg.wrote._index = idxKey;
      }
      return wrote;
    }

    async function syncNow(quiet) {
      if (Y.busy || !Y.handle) return null;
      if (!(await permitted(false))) { Y.state = 'locked'; emit(); return null; }
      Y.busy = true; Y.state = 'syncing'; emit();
      try {
        const read = await readFolder();
        const wrote = await writeFolder();
        if (!Y.handle) return null;
        cfg.last = Date.now(); saveCfg();
        Y.state = 'ok'; Y.lastResult = { read, wrote };
        if (!quiet || read.added || read.updated) M.toast('Folder sync: ' + read.added + ' new and ' + read.updated + ' changed from the folder, ' + wrote + ' written.');
        return Y.lastResult;
      } catch (e) {
        if (!Y.handle) return null;
        Y.state = 'error'; Y.error = String(e && e.message || e);
        M.toast('Folder sync stopped: ' + Y.error, { ms: 7000 });
        return null;
      } finally { Y.busy = false; if (Y.handle) emit(); }
    }

    /* ---- connect / reconnect / disconnect ---- */
    async function connect() {
      if (!supported) return;
      let h; try { h = await window.showDirectoryPicker({ id: 'mnemo-notes', mode: 'readwrite', startIn: 'documents' }); } catch (e) { return; }   // cancelled
      await adopt(h);
    }
    async function adopt(h) {
      Y.handle = h; cfg.on = true; cfg.name = h.name || 'folder'; cfg.files = {}; cfg.wrote = {}; cfg.nameOf = {}; cfg.retired = {}; saveCfg(); await idb.set(h);
      Y.state = 'syncing'; emit();
      await syncNow(false);
      startTimers();
    }
    async function reconnect() {
      if (!Y.handle) { Y.handle = await idb.get(); }
      if (!Y.handle) { cfg.on = false; saveCfg(); Y.state = 'off'; emit(); return; }
      if (await permitted(true)) { await syncNow(false); startTimers(); } else { Y.state = 'locked'; emit(); }
    }
    async function disconnect() {
      stopTimers(); Y.handle = null; cfg.on = false; cfg.files = {}; cfg.wrote = {}; cfg.nameOf = {}; cfg.retired = {}; saveCfg(); await idb.del();
      Y.state = supported ? 'off' : 'unsupported'; emit();
      M.toast('Folder sync turned off. Files already in the folder were left alone.');
    }
    function setExt(e) { if (!EXTS.includes(e)) return; cfg.ext = e; cfg.wrote = {}; saveCfg(); emit(); if (Y.handle) syncNow(true); }
    function setAuto(on) { cfg.auto = !!on; saveCfg(); emit(); if (on) startTimers(); else stopTimers(); }

    /* ---- timers: push soon after an edit, look for outside edits every so often ---- */
    let pushT = 0, pollT = 0;
    function startTimers() {
      stopTimers(); if (!cfg.auto) return;
      pollT = setInterval(() => { if (!document.hidden && Y.handle && !Y.busy) syncNow(true); }, 20000);
    }
    function stopTimers() { clearTimeout(pushT); clearInterval(pollT); pushT = pollT = 0; }
    S.on((type) => {
      if (!Y.handle || !cfg.auto || Y.busy || (type !== 'change' && type !== 'structure')) return;
      clearTimeout(pushT); pushT = setTimeout(() => syncNow(true), 3000);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Y.handle && cfg.auto) syncNow(true); });

    /* ---- import loose Markdown files (works in every browser) ---- */
    async function importFiles(fileList) {
      const r = { added: 0, updated: 0, same: 0, older: 0, busy: 0, skipped: 0 };
      for (const file of Array.from(fileList)) {
        if (!isNoteFile(file.name) || file.size > 2e6) { r.skipped++; continue; }
        const res = noteFromFile(parseFile(await file.text(), file.name), file.name, file.lastModified, true);
        r[res]++;
      }
      M.toast('Imported ' + r.added + ' new, ' + r.updated + ' updated, ' + (r.same + r.older + r.busy) + ' unchanged or older, ' + r.skipped + ' skipped.');
      return r;
    }

    Object.assign(Y, { connect, reconnect, disconnect, syncNow, setExt, setAuto, importFiles, onChange: f => { Y.listeners.add(f); return () => Y.listeners.delete(f); },
      /* test hook: use any FileSystemDirectoryHandle (e.g. the origin-private file system) in place of the picker */
      _adopt: adopt });

    (async () => { if (cfg.on && supported) { Y.handle = await idb.get(); if (Y.handle && await permitted(false)) { await syncNow(true); startTimers(); } else { Y.state = Y.handle ? 'locked' : 'off'; if (!Y.handle) { cfg.on = false; saveCfg(); } emit(); } } else emit(); })();
    return Y;
  }

  return { safeName, assignNames, toFile, parseFile, isNoteFile, indexFile, init };
});
