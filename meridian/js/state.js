/* MERIDIAN - application state, date-range maths, URL-hash sync, theme + density persistence. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D;
  const S = (M.S = {});

  S.VIEWS = [
    { key: 'overview', name: 'Overview', icon: 'overview', g: 'o', sub: 'The state of the business, read for you.' },
    { key: 'explorer', name: 'Revenue Explorer', icon: 'explorer', g: 'r', sub: 'Slice, compare and zoom any revenue series.' },
    { key: 'geography', name: 'Geography', icon: 'geography', g: 'g', sub: 'Where demand is landing, state by state.' },
    { key: 'funnel', name: 'Funnel & Cohorts', icon: 'funnel', g: 'f', sub: 'From first visit to repeat customer.' },
    { key: 'products', name: 'Products', icon: 'products', g: 'p', sub: 'Forty SKUs, ranked, searchable, inspectable.' },
    { key: 'live', name: 'Live Orders', icon: 'live', g: 'l', sub: 'Orders as they land.' },
  ];
  S.PRESETS = ['7D', '30D', 'QTD', 'YTD', '12M'];

  const DEFAULT_V = {
    overview: { metric: 'rev' },
    explorer: { type: 'area', by: 'category', gran: 'day', metric: 'rev', hide: '' },
    geography: { metric: 'rev' },
    funnel: { seg: 'all' },
    products: { q: '', cat: '', sort: 'rev:desc', page: '0', sku: '', cols: '' },
    live: {},
  };
  S.DEFAULT_V = DEFAULT_V;

  const st = (S.st = {
    view: 'overview',
    range: '30D',
    cmp: true,
    f: { region: [], category: [], channel: [] },
    v: JSON.parse(JSON.stringify(DEFAULT_V)),
    theme: U.store.get('theme', 'system'),
    density: U.store.get('density', 'comfortable'),
  });

  /* ---------- date ranges ---------- */
  const quarterStart = (i) => { const d = new Date(D.ms(i)); return D.dayOf(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 1, 1); };
  S.rangeOf = function (r) {
    const last = D.ASOF;
    if (r === '7D') return { i0: last - 6, i1: last };
    if (r === '30D') return { i0: last - 29, i1: last };
    if (r === '12M') return { i0: last - 364, i1: last };
    if (r === 'QTD') return { i0: quarterStart(last), i1: last };
    if (r === 'YTD') { const y = new Date(D.ms(last)).getUTCFullYear(); return { i0: D.dayOf(y, 1, 1), i1: last }; }
    const m = /^(\d{4}-\d\d-\d\d)_(\d{4}-\d\d-\d\d)$/.exec(r || '');
    if (m) { const a = U.clamp(D.dayIso(m[1]), 0, last), b = U.clamp(D.dayIso(m[2]), 0, last); return { i0: Math.min(a, b), i1: Math.max(a, b) }; }
    return S.rangeOf('30D');
  };
  S.range = () => { const r = S.rangeOf(st.range); r.n = r.i1 - r.i0 + 1; return r; };
  S.customRange = (i0, i1) => D.isoOf(i0) + '_' + D.isoOf(i1);
  S.rangeLabel = function () {
    const r = S.range();
    return r.i0 === r.i1 ? U.dstr(D.ms(r.i0)) : U.dstr(D.ms(r.i0), 'md') + ' – ' + U.dstr(D.ms(r.i1));
  };
  /** Comparison window (or null when off / outside the data). */
  S.cmp = function () {
    if (!st.cmp) return null;
    const r = S.range();
    let c, label = 'vs previous period';
    if (st.range === 'QTD') { const pq = quarterStart(r.i0 - 1); c = { i0: pq, i1: pq + r.n - 1 }; label = 'vs same point last quarter'; }
    else if (st.range === 'YTD') { c = { i0: r.i0 - 365, i1: r.i1 - 365 }; label = 'vs same point last year'; }
    else {
      c = { i0: r.i0 - r.n, i1: r.i0 - 1 };
      label = st.range === '12M' ? 'vs prior 12 months' : st.range === '7D' ? 'vs prior 7 days' : st.range === '30D' ? 'vs prior 30 days' : 'vs prior ' + r.n + ' days';
    }
    if (c.i0 < 0) return null;
    c.n = c.i1 - c.i0 + 1; c.label = label;
    return c;
  };
  S.cmpBlocked = () => st.cmp && !S.cmp();
  S.filters = () => st.f;
  S.filterCount = () => st.f.region.length + st.f.category.length + st.f.channel.length;

  /* ---------- change events ---------- */
  const subs = [];
  S.on = (fn) => { subs.push(fn); };
  const emit = (keys) => subs.forEach((fn) => fn(keys));

  S.set = function (patch, opt) {
    opt = opt || {};
    const changed = [];
    for (const k in patch) {
      if (k === 'v') continue;
      if (JSON.stringify(st[k]) !== JSON.stringify(patch[k])) { st[k] = patch[k]; changed.push(k); }
    }
    if (patch.v) for (const vk in patch.v) {
      const cur = st.v[vk], nxt = Object.assign({}, cur, patch.v[vk]);
      if (JSON.stringify(cur) !== JSON.stringify(nxt)) { st.v[vk] = nxt; changed.push('v:' + vk); }
    }
    if (!changed.length && !opt.force) return;
    if (changed.includes('theme')) U.store.set('theme', st.theme);
    if (changed.includes('density')) U.store.set('density', st.density);
    if (!opt.noHash) writeHash(changed.includes('view') || opt.push);
    emit(changed);
  };
  S.setV = (view, patch, opt) => S.set({ v: { [view]: patch } }, opt);
  S.getV = (view) => st.v[view || st.view];

  /* ---------- URL hash ---------- */
  const CODE = (dim) => D.DIMS[dim].map((m) => m.key);
  function encodeList(dim) { const keys = CODE(dim); return st.f[dim].map((i) => keys[i]).join(','); }
  function decodeList(dim, s) { const keys = CODE(dim); return (s || '').split(',').map((k) => keys.indexOf(k)).filter((i) => i >= 0); }

  S.hash = function () {
    const p = [];
    if (st.range !== '30D') p.push(['r', st.range]);
    if (!st.cmp) p.push(['cmp', '0']);
    ['region', 'category', 'channel'].forEach((dim) => { if (st.f[dim].length) p.push([{ region: 'reg', category: 'cat', channel: 'ch' }[dim], encodeList(dim)]); });
    const v = st.v[st.view], def = DEFAULT_V[st.view];
    for (const k in def) if (String(v[k]) !== String(def[k])) p.push([k, v[k]]);
    return '#/' + st.view + (p.length ? '?' + p.map((kv) => kv[0] + '=' + encodeURIComponent(kv[1]).replace(/%2C/g, ',').replace(/%3A/g, ':')).join('&') : '');
  };
  function writeHash(push) {
    const h = S.hash();
    if (location.hash === h) return;
    try { history[push ? 'pushState' : 'replaceState'](null, '', h); } catch (e) { location.hash = h; }
  }
  S.readHash = function () {
    const m = /^#\/([a-z]+)(?:\?(.*))?$/.exec(location.hash || '');
    const view = m && S.VIEWS.some((v) => v.key === m[1]) ? m[1] : 'overview';
    const q = {};
    if (m && m[2]) m[2].split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    const patch = {
      view,
      range: q.r && (S.PRESETS.includes(q.r) || /^\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d$/.test(q.r)) ? q.r : '30D',
      cmp: q.cmp !== '0',
      f: { region: decodeList('region', q.reg), category: decodeList('category', q.cat), channel: decodeList('channel', q.ch) },
    };
    const v = {};
    const def = DEFAULT_V[view];
    v[view] = {};
    for (const k in def) v[view][k] = q[k] != null ? q[k] : def[k];
    patch.v = v;
    return patch;
  };
  S.applyHash = function (first) {
    const p = S.readHash();
    S.set(p, { noHash: true, force: !!first });
  };
  window.addEventListener('popstate', () => S.applyHash());
  window.addEventListener('hashchange', () => S.applyHash());

  /* ---------- theme ---------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  S.effectiveTheme = () => (st.theme === 'system' ? (mq.matches ? 'dark' : 'light') : st.theme);
  S.applyTheme = function () {
    document.documentElement.setAttribute('data-theme', S.effectiveTheme());
    document.documentElement.setAttribute('data-density', st.density);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', S.effectiveTheme() === 'dark' ? '#0c0e13' : '#f5f2ec');
  };
  mq.addEventListener('change', () => { if (st.theme === 'system') { S.applyTheme(); emit(['theme']); } });
  S.toggleTheme = () => S.set({ theme: S.effectiveTheme() === 'dark' ? 'light' : 'dark' });
  S.toggleDensity = () => S.set({ density: st.density === 'compact' ? 'comfortable' : 'compact' });
})((window.M = window.M || {}));
