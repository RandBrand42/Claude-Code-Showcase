/* NEURON FORGE - UI kit
 * Hand-styled controls (slider, segmented, select, tooltip, toast, menu) plus the shared
 * amber/cyan colour machinery used by every canvas. Exposes NF.ui and NF.color.
 */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};

  /* ---------- colour: one diverging palette for weights, classes and heatmaps ---------- */
  const AMBER = [255, 178, 36], CYAN = [39, 214, 242], BASE = [9, 14, 28];
  const LUT_N = 256;
  const LUT = new Uint8ClampedArray(LUT_N * 4);
  (function build() {
    for (let i = 0; i < LUT_N; i++) {
      const v = i / (LUT_N - 1) * 2 - 1, a = Math.abs(v), hot = v >= 0 ? AMBER : CYAN;
      const t = Math.pow(a, 1.05) * 0.84, glow = Math.pow(a, 6) * 0.16;     // bright core where the model is most certain
      for (let c = 0; c < 3; c++) LUT[i * 4 + c] = BASE[c] + (hot[c] - BASE[c]) * t + (255 - hot[c]) * glow;
      LUT[i * 4 + 3] = 255;
    }
  })();
  NF.color = {
    AMBER, CYAN, LUT, LUT_N,
    /** v in [-1,1] -> LUT index */
    idx: v => { const i = Math.round((Math.max(-1, Math.min(1, v)) + 1) * 0.5 * (LUT_N - 1)); return i * 4; },
    css: (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`,
    sign: v => (v >= 0 ? AMBER : CYAN),
  };

  /* ---------- tiny DOM helper ---------- */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  }
  const helpChip = key => el('button', { class: 'help', type: 'button', 'data-help': key, 'aria-label': 'Help: ' + ((NF.HELP[key] || {}).title || key) }, '?');
  const uid = (() => { let n = 0; return p => p + (++n); })();

  /* ---------- slider ---------- */
  /**
   * o: { label, help, value, min, max, step, values?, fmt, onInput, cls }
   * With `values` (an array) the slider steps through it; the stored value is the array item.
   * With `toPos/fromPos` the slider maps a non-linear quantity (e.g. log learning rate).
   */
  function slider(o) {
    const id = uid('sl');
    const vals = o.values;
    const min = vals ? 0 : (o.min ?? 0), max = vals ? vals.length - 1 : (o.max ?? 100), step = vals ? 1 : (o.step ?? 1);
    const toPos = vals ? (v => vals.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(vals[b] - v) ? i : b), 0)) : (o.toPos || (v => v));
    const fromPos = vals ? (p => vals[p]) : (o.fromPos || (p => p));
    const fmt = o.fmt || (v => String(v));
    const input = el('input', { class: 'slider ' + (o.cls || ''), type: 'range', id, min, max, step });
    const out = el('output', { class: 'ctl__val', for: id });
    const paint = () => { input.style.setProperty('--p', ((input.value - min) / (max - min) * 100).toFixed(2) + '%'); };
    const set = v => { input.value = toPos(v); out.textContent = fmt(v); input.setAttribute('aria-valuetext', fmt(v)); paint(); };
    input.addEventListener('input', () => { const v = fromPos(+input.value); out.textContent = fmt(v); input.setAttribute('aria-valuetext', fmt(v)); paint(); o.onInput && o.onInput(v); });
    const head = el('div', { class: 'ctl__head' }, el('label', { class: 'ctl__label', for: id }, o.label), o.help ? helpChip(o.help) : null, out);
    const node = el('div', { class: 'ctl' }, head, input);
    set(o.value);
    return { el: node, set, input, get: () => fromPos(+input.value) };
  }

  /* ---------- segmented control (radio group) ---------- */
  function seg(o) {
    const node = el('div', { class: 'seg ' + (o.cls || ''), role: 'radiogroup', 'aria-label': o.label || '' });
    const btns = o.options.map(opt => {
      const b = el('button', { class: 'seg__btn', type: 'button', role: 'radio', 'aria-checked': 'false', title: opt.title || '' }, opt.label);
      b.addEventListener('click', () => { set(opt.value); o.onChange && o.onChange(opt.value); });
      b.addEventListener('keydown', e => {
        const i = btns.indexOf(b), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); const nb = btns[(i + d + btns.length) % btns.length]; nb.focus(); nb.click(); }
      });
      node.append(b); return b;
    });
    let cur;
    const set = v => { cur = v; btns.forEach((b, i) => { const on = o.options[i].value === v; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; }); };
    set(o.value);
    return { el: node, set, get: () => cur };
  }

  /** Labelled wrapper for a control: label + help chip above. */
  function field(label, help, control) {
    return el('div', { class: 'ctl' }, el('div', { class: 'ctl__head' }, el('span', { class: 'ctl__label' }, label), help ? helpChip(help) : null), control);
  }

  /* ---------- custom dropdown ---------- */
  function select(o) {
    const menu = el('ul', { class: 'select__menu', role: 'listbox', tabindex: '-1' });
    const btn = el('button', { class: 'select__btn', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': o.label || '' });
    const node = el('div', { class: 'select', 'data-open': 'false' }, btn);
    let cur = o.value, active = 0, open = false;
    const opts = o.options.map((opt, i) => {
      const li = el('li', { class: 'select__opt', role: 'option', id: uid('opt'), 'aria-selected': 'false' }, opt.glyph ? el('span', { html: opt.glyph }) : null, el('span', null, opt.label));
      li.addEventListener('click', () => { choose(opt.value); close(); btn.focus(); });
      li.addEventListener('mousemove', () => highlight(i));
      return li;
    });
    menu.append(...opts);
    const render = () => {
      const i = o.options.findIndex(x => x.value === cur), opt = o.options[Math.max(0, i)];
      btn.replaceChildren(...(opt.glyph ? [el('span', { html: opt.glyph })] : []), el('span', null, opt.label));
      opts.forEach((li, k) => li.setAttribute('aria-selected', k === i));
    };
    const highlight = i => { active = i; opts.forEach((li, k) => li.toggleAttribute('data-active', k === i)); btn.setAttribute('aria-activedescendant', opts[i].id); };
    const choose = v => { cur = v; render(); o.onChange && o.onChange(v); };
    const onDoc = e => { if (!node.contains(e.target)) close(); };
    function openMenu() { open = true; node.dataset.open = 'true'; btn.setAttribute('aria-expanded', 'true'); node.append(menu); highlight(Math.max(0, o.options.findIndex(x => x.value === cur))); setTimeout(() => document.addEventListener('pointerdown', onDoc), 0); }
    function close() { open = false; node.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); menu.remove(); document.removeEventListener('pointerdown', onDoc); }
    btn.addEventListener('click', () => (open ? close() : openMenu()));
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) openMenu(); else highlight((active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length); }
      else if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); choose(o.options[active].value); close(); }
      else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    render();
    return { el: node, set: v => { cur = v; render(); }, get: () => cur };
  }

  /* ---------- floating help tooltip ---------- */
  const tip = { node: null, for: null };
  function showTip(target) {
    const h = (NF.HELP || {})[target.dataset.help];
    if (!h) return;
    tip.node = tip.node || document.getElementById('tooltip');
    tip.for = target;
    tip.node.replaceChildren(el('b', null, h.title), el('span', null, h.short || h.body));
    tip.node.hidden = false;
    const r = target.getBoundingClientRect(), w = tip.node.offsetWidth, hh = tip.node.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.bottom + 8;
    x = Math.max(8, Math.min(innerWidth - w - 8, x));
    if (y + hh > innerHeight - 8) y = r.top - hh - 8;
    tip.node.style.left = x + 'px'; tip.node.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { if (tip.node) tip.node.hidden = true; tip.for = null; }
  document.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('.help[data-help]'); if (t && e.pointerType !== 'touch') showTip(t); });
  document.addEventListener('pointerout', e => { const t = e.target.closest && e.target.closest('.help[data-help]'); if (t) hideTip(); });
  document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('.help[data-help]'); if (t) showTip(t); });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('.help[data-help]'); if (t && tip.for !== t) showTip(t); else if (!t) hideTip(); });
  document.addEventListener('scroll', hideTip, true);

  /* ---------- toast ---------- */
  function toast(msg, o) {
    const host = document.getElementById('toasts'), t = el('div', { class: 'toast' + (o && o.win ? ' win' : ''), role: 'status' }, msg);
    host.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, (o && o.ms) || 2600);
  }

  /* ---------- popup menu anchored to a button ---------- */
  let openMenuState = null;
  function closeMenu() { if (!openMenuState) return; openMenuState.node.remove(); document.removeEventListener('pointerdown', openMenuState.onDoc, true); document.removeEventListener('keydown', openMenuState.onKey, true); openMenuState.anchor.setAttribute('aria-expanded', 'false'); openMenuState = null; }
  function menu(anchor, content) {
    const again = openMenuState && openMenuState.anchor === anchor;
    closeMenu();
    if (again) return null;
    const node = el('div', { class: 'menu', role: 'menu' }, content);
    document.body.append(node);
    const r = anchor.getBoundingClientRect();
    const w = node.offsetWidth, h = node.offsetHeight;
    node.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    node.style.top = Math.min(r.bottom + 8, Math.max(8, innerHeight - h - 8)) + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    const onDoc = e => { if (!node.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); anchor.focus(); } };
    document.addEventListener('pointerdown', onDoc, true); document.addEventListener('keydown', onKey, true);
    openMenuState = { node, anchor, onDoc, onKey };
    const first = node.querySelector('button, input, textarea'); if (first && first.tagName === 'BUTTON') first.focus({ preventScroll: true });
    return node;
  }

  /* small SVG glyph of an activation function for dropdown rows */
  function actGlyph(name) {
    const f = NF.ACT[name].f, N = 28, pts = [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= N; i++) { const z = -3 + 6 * i / N, y = f(z); pts.push(y); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const span = Math.max(1e-6, hi - lo);
    const d = pts.map((y, i) => `${i ? 'L' : 'M'}${(2 + i / N * 30).toFixed(1)} ${(16 - (y - lo) / span * 14).toFixed(1)}`).join('');
    return `<svg class="glyph" viewBox="0 0 34 18"><line x1="2" y1="${(16 - (0 - lo) / span * 14).toFixed(1)}" x2="32" y2="${(16 - (0 - lo) / span * 14).toFixed(1)}"/><path d="${d}"/></svg>`;
  }

  /** Canvas helper: size to its CSS box at devicePixelRatio; returns {ctx, w, h, dpr}. */
  function fitCanvas(cv) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1), w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }

  NF.ui = { el, slider, seg, select, field, helpChip, toast, menu, closeMenu, actGlyph, fitCanvas, uid };
  NF.reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
})(typeof globalThis !== 'undefined' ? globalThis : window);
