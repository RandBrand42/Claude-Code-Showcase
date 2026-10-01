/* Mnemo core: namespace, DOM helpers, safe storage, fuzzy matching, icons, toasts. */
(function (M) {
  'use strict';

  M.$ = (s, r) => (r || document).querySelector(s);
  M.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  M.esc = M.md.esc;
  M.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  M.debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };
  M.raf = fn => { let q = false; return () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(); }); }; };
  M.uid = () => 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0');
  M.mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  M.escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* localStorage only ever inside try/catch; falls back to memory so the app still works when blocked. */
  const mem = {};
  M.storage = {
    get(k, d) { try { const v = localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) { /* blocked or corrupt */ } return k in mem ? JSON.parse(mem[k]) : d; },
    set(k, v) { const j = JSON.stringify(v); mem[k] = j; try { localStorage.setItem(k, j); return true; } catch (e) { return false; } },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* subsequence fuzzy match: returns {score, idx[]} or null */
  M.fuzzy = function (q, s) {
    q = q.toLowerCase(); const t = s.toLowerCase();
    if (!q) return { score: 0, idx: [] };
    const sub = t.indexOf(q);
    if (sub >= 0) { const idx = []; for (let i = 0; i < q.length; i++) idx.push(sub + i); return { score: 100 - Math.min(sub, 40) * 0.6 + (sub === 0 ? 40 : 0) + (q.length / t.length) * 30, idx }; }
    let qi = 0, score = 0, prev = -2; const idx = [];
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) { score += (prev === i - 1 ? 8 : 2) + (i === 0 || /[\s\-_/]/.test(t[i - 1]) ? 6 : 0); idx.push(i); prev = i; qi++; }
    }
    return qi === q.length ? { score: score - (t.length - q.length) * 0.05, idx } : null;
  };
  M.markIdx = (s, idx) => {
    if (!idx || !idx.length) return M.esc(s);
    const set = new Set(idx); let out = '', open = false;
    for (let i = 0; i < s.length; i++) {
      const on = set.has(i);
      if (on && !open) { out += '<b>'; open = true; } else if (!on && open) { out += '</b>'; open = false; }
      out += M.esc(s[i]);
    }
    return out + (open ? '</b>' : '');
  };

  const DAY = 864e5;
  M.ago = t => {
    const d = Date.now() - t;
    if (d < 45e3) return 'just now';
    if (d < 36e5) return Math.round(d / 6e4) + ' min ago';
    if (d < DAY) return Math.round(d / 36e5) + ' h ago';
    if (d < 7 * DAY) return Math.round(d / DAY) + ' d ago';
    return M.fmtDate(t);
  };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  M.fmtDate = t => { const d = new Date(t); return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
  M.isoDate = (t) => { const d = new Date(t == null ? Date.now() : t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---------- icons (hand-drawn 24px stroke set) ---------- */
  const I = {
    plus: '<path d="M12 5v14M5 12h14"/>', calendar: '<path d="M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4"/>',
    graph: '<circle cx="6" cy="7" r="2.3"/><circle cx="18" cy="6" r="2.3"/><circle cx="12.5" cy="17.5" r="2.3"/><path d="M7.8 8.6l3.4 7M16.6 8l-3.2 7.6M8.3 6.8h7.4"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
    'panel-left': '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M9.5 5v14"/>', 'panel-right': '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M14.5 5v14"/>',
    edit: '<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20zM13.5 7.5l3 3"/>', columns: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14"/>',
    book: '<path d="M4 5.5c3-1 5.5-.8 8 1 2.5-1.8 5-2 8-1V18c-3-1-5.5-.8-8 1-2.5-1.8-5-2-8-1zM12 6.5V19"/>',
    focus: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    hash: '<path d="M9.5 4L7.5 20M16.5 4l-2 16M4.5 9h15.5M4 15h15.5"/>', outline: '<path d="M4 6h16M8 12h12M12 18h8"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5M4 4v4.5h4.5M12 8v4.5l3 2"/>', pin: '<path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7"/>',
    trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/>', download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>', upload: '<path d="M12 15V4M7.5 8L12 3.5 16.5 8M5 20h14"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 17v.2"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'chev-r': '<path d="M9 6l6 6-6 6"/>', 'chev-d': '<path d="M6 9l6 6 6-6"/>', 'arrow-l': '<path d="M19 12H5M11 6l-6 6 6 6"/>', 'arrow-r': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>', pause: '<path d="M8 5v14M16 5v14"/>', fit: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    burst: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>', note: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.9v.2"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>', warning: '<path d="M12 4l9 16H3zM12 10v4.5M12 17.3v.2"/>',
    command: '<path d="M8 8V6a2 2 0 1 0-2 2zM8 8h8M16 8V6a2 2 0 1 1 2 2zM16 8v8M16 16h2a2 2 0 1 1-2 2zM16 16H8M8 16v2a2 2 0 1 1-2-2zM8 16V8"/>',
    copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 16V6a2 2 0 0 1 2-2h8"/>', file: '<path d="M7 3.5h7l4 4V20.5H7zM14 3.5v4h4"/>', filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    back: '<path d="M15 6l-6 6 6 6"/>', fwd: '<path d="M9 6l6 6-6 6"/>', rename: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>', star: '<path d="M12 4l2.2 5 5.3.5-4 3.6 1.2 5.3L12 15.6 7.3 18.4l1.2-5.3-4-3.6 5.3-.5z"/>',
    tag: '<path d="M4 4h8l8 8-8 8-8-8zM8.5 8.5v.1"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', restore: '<path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7M4 12h5"/>', eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'
  };
  M.icon = (name, cls) => '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[name] || '') + '</svg>';
  M.hydrateIcons = root => M.$$('[data-icon]', root).forEach(el => { if (!el.dataset.done) { el.insertAdjacentHTML('afterbegin', M.icon(el.dataset.icon)); el.dataset.done = '1'; } });

  /* ---------- toasts ---------- */
  M.toast = function (msg, opts) {
    opts = opts || {};
    const host = M.$('#toasts'); if (!host) return;
    const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status');
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = msg;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
    if (opts.action) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = opts.action;
      b.onclick = () => { opts.onAction && opts.onAction(); close(); }; el.appendChild(b);
    }
    host.appendChild(el);
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(close, opts.ms || 4200);
  };

  M.download = (name, blob) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
})(window.Mnemo = window.Mnemo || {});
