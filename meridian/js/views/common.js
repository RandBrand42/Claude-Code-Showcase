/* MERIDIAN - shared view helpers: cards, delta chips, chart-model builders, metric definitions. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D, S = M.S, A = M.A, h = U.h, st = S.st;
  const V = (M.V = {});
  M.views = {};

  V.card = function (o) {
    const body = h('div.cb' + (o.bodyCls ? '.' + o.bodyCls : ''));
    const head = h('header.ch', h('div.ct', h('h3', o.title), o.sub ? h('p', o.sub) : null), o.actions ? h('div.ca', o.actions) : null);
    const el = h('section.card.rv' + (o.cls ? '.' + o.cls : ''), head, body);
    return { el, body, head };
  };

  /** Delta chip. kind 'pct' shows a relative change; 'pts' an absolute change (value already in points). */
  V.delta = function (frac, o) {
    o = o || {};
    if (frac == null || !isFinite(frac)) return h('span.chip.flat', 'n/a');
    const flat = Math.abs(frac) < (o.kind === 'pts' ? 0.005 : 0.0005);
    const cls = flat ? 'flat' : (o.invert ? frac < 0 : frac > 0) ? 'pos' : 'neg';
    const txt = o.kind === 'pts' ? U.signed(frac, o.d == null ? 1 : o.d) + ' pt' : U.signedPct(frac, o.d == null ? 1 : o.d);
    return h('span.chip.' + cls, M.UI.ic(flat ? 'minus' : frac > 0 ? 'arrowUp' : 'arrowDown', 11), txt);
  };

  /** A totals bundle with the extra derived arrays (gross profit). */
  V.totals = function () {
    const t = D.totals(S.filters());
    if (!t.gp) { t.gp = new Float64Array(D.N); for (let i = 0; i < D.N; i++) t.gp[i] = t.rev[i] - t.cogs[i]; }
    return t;
  };

  /** Six headline metrics and how to read them out of a totals bundle. */
  V.METRICS = {
    rev: { label: 'Revenue', num: 'rev', fmt: U.moneyC, val: U.money, type: 'area', d: 'pct', kf: (k) => k.rev },
    ord: { label: 'Orders', num: 'ord', fmt: U.compact, val: (v) => U.int(v), type: 'area', d: 'pct', kf: (k) => k.ord },
    aov: { label: 'Avg. order value', short: 'AOV', num: 'rev', den: 'ord', fmt: (v) => '$' + Math.round(v), val: (v) => '$' + v.toFixed(2), type: 'line', zero: false, d: 'pct', kf: (k) => k.aov },
    conv: { label: 'Conversion', num: 'ord', den: 'ses', fmt: (v) => (v * 100).toFixed(1) + '%', val: (v) => (v * 100).toFixed(2) + '%', type: 'line', zero: false, d: 'pts', scale: 100, kf: (k) => k.conv },
    margin: { label: 'Gross margin', short: 'Margin', num: 'gp', den: 'rev', fmt: (v) => (v * 100).toFixed(0) + '%', val: (v) => (v * 100).toFixed(1) + '%', type: 'line', zero: false, d: 'pts', scale: 100, kf: (k) => k.margin },
    nps: { label: 'NPS', num: 'npsw', den: 'ord', fmt: (v) => String(Math.round(v)), val: (v) => v.toFixed(1), type: 'line', zero: false, d: 'pts', scale: 1, kf: (k) => k.nps },
  };

  /** Bucketed values of a metric from a totals bundle. */
  V.metricBuckets = function (m, t, bk) {
    return m.den ? A.bucketRatio(t[m.num], t[m.den], bk) : A.bucketSum(t[m.num], bk);
  };

  /** Pad/truncate compare-period buckets to align with current ones. */
  V.align = (arr, n) => { const out = arr.slice(0, n); while (out.length < n) out.push(out.length ? out[out.length - 1] : 0); return out; };

  /** Event bands (promo windows) in bucket coordinates. */
  V.bands = function (bk) {
    const out = [];
    D.EVENTS.forEach((e) => {
      let a = -1, b = -1;
      bk.forEach((x, i) => { if (x.b >= e.i0 && x.a <= e.i1) { if (a < 0) a = i; b = i; } });
      if (a >= 0) out.push({ a, b, label: e.name });
    });
    return out;
  };

  /** Detected anomalies as chart markers. */
  V.marks = function (f, rg, bk) {
    const out = [];
    A.anomalies(f).forEach((an) => {
      if (an.kind !== 'anomaly' || an.d < rg.i0 || an.d > rg.i1) return;
      const i = bk.findIndex((x) => an.d >= x.a && an.d <= x.b);
      if (i < 0) return;
      out.push({ i, id: 'an' + an.d, sign: an.sign, title: 'Revenue ' + (an.sign > 0 ? 'spiked ' : 'fell ') + Math.abs(an.res * 100).toFixed(0) + '% ' + (an.sign > 0 ? 'above' : 'below') + ' expectation', sub: D.CATS[an.attr[0].idx].name + ' via ' + D.CHANS[an.attr[1].idx].name + ' in ' + D.REGIONS[an.attr[2].idx].key });
    });
    return out;
  };

  /** Jump to the Explorer centred on a date (used when an anomaly is clicked). */
  V.focusDate = function (d) {
    const i0 = Math.max(0, d - 21), i1 = Math.min(D.ASOF, d + 21);
    S.set({ view: 'explorer', range: S.customRange(i0, i1) }, { push: true });
  };

  V.empty = (icon, title, text) => h('div.empty', M.UI.ic(icon, 26), h('b', title), h('span', text));
})((window.M = window.M || {}));
