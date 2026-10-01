/* MERIDIAN - Overview: KPI tiles, revenue chart with anomaly markers, pacing gauge, auto-written insights, category leaderboard. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D, S = M.S, A = M.A, V = M.V, UI = M.UI, h = U.h, st = S.st;
  const ORDER = ['rev', 'ord', 'aov', 'conv', 'margin', 'nps'];

  const view = {
    mount(host) {
      this.host = host;
      this.tiles = {};
      const kp = h('div.kpis');
      ORDER.forEach((key, i) => {
        const m = V.METRICS[key];
        const t = {
          el: h('button.kpi.rv', { 'data-kpi': key, 'aria-pressed': 'false', onclick: () => S.setV('overview', { metric: key }) }),
          val: h('div.kpi-v.num'), chip: h('span.kpi-c'), sub: h('span.kpi-s'), spark: h('div.kpi-sp'),
        };
        t.el.append(h('div.kpi-h', h('span.micro', m.short || m.label)), t.val, h('div.kpi-f', t.chip, t.sub), t.spark);
        t.sp = new M.Spark(t.spark, { color: M.color(0) });
        kp.appendChild(t.el); this.tiles[key] = t;
      });

      /* main chart */
      this.chartHost = h('div.chart');
      this.chartTitle = h('h3'); this.chartBig = h('div.big.num'); this.chartDelta = h('span');
      this.legend = h('div.legend');
      const chartCard = V.card({ title: 'Revenue', cls: 'c-chart', bodyCls: 'chart-b' });
      chartCard.head.replaceWith(h('header.ch.ch-big', h('div.ct', h('p.micro', { id: 'ov-metric' }), h('div.bigrow', this.chartBig, this.chartDelta)), this.legend));
      this.metricLabel = chartCard.el.querySelector('#ov-metric');
      chartCard.body.append(this.chartHost);
      this.chart = new M.TimeChart(this.chartHost, { height: 318, label: 'Revenue over time', onMark: (id, ev) => this.markEvent(id, ev) });

      /* gauge */
      const gaugeCard = V.card({ title: 'Quarter pacing', cls: 'c-gauge' });
      this.gsub = h('p'); gaugeCard.head.querySelector('.ct').appendChild(this.gsub);
      this.gaugeHost = h('div.gauge-w'); this.gpct = h('div.g-pct.num'); this.glbl = h('div.g-lbl');
      this.gaugeHost.append(h('div.g-c', this.gpct, this.glbl));
      this.gauge = new M.Gauge(this.gaugeHost);
      this.gstats = h('dl.g-stats');
      gaugeCard.body.append(this.gaugeHost, this.gstats);

      /* insights */
      const insCard = V.card({ title: 'Insights', sub: 'Written from your numbers, not guessed.', cls: 'c-ins', actions: h('span.tagline', UI.ic('sparkle', 13), 'Computed live') });
      this.ins = h('div.ins'); insCard.body.append(this.ins);

      /* category leaderboard */
      const catCard = V.card({ title: 'Category performance', sub: 'Share of revenue, change vs comparison', cls: 'c-cats' });
      this.cats = h('div.cats'); catCard.body.append(this.cats);

      host.append(kp, chartCard.el, gaugeCard.el, insCard.el, catCard.el);
      host.classList.add('g-overview');
    },

    markEvent(id, ev) {
      const row = this.ins.querySelector('[data-id="' + id + '"]');
      if (row) row.classList.toggle('hl', ev === 'enter');
      if (ev === 'click') { const d = +String(id).slice(2); if (d) V.focusDate(d); }
    },

    update(reason) {
      const f = S.filters(), rg = S.range(), cg = S.cmp(), t = V.totals();
      const cur = D.kpis(t, rg.i0, rg.i1), prev = cg ? D.kpis(t, cg.i0, cg.i1) : null;
      const metricKey = st.v.overview.metric, mm = V.METRICS[metricKey];

      /* KPI tiles */
      ORDER.forEach((key, idx) => {
        const m = V.METRICS[key], tile = this.tiles[key];
        const v = m.kf(cur), pv = prev ? m.kf(prev) : null;
        const fmtBig = { rev: U.moneyC, ord: (x) => (x >= 10000 ? U.compact(x) : U.int(x)), aov: (x) => '$' + Math.round(x), conv: (x) => (x * 100).toFixed(2) + '%', margin: (x) => (x * 100).toFixed(1) + '%', nps: (x) => String(Math.round(x)) }[key];
        U.countTo(tile.val, v, fmtBig, reason === 'enter' ? 1100 + idx * 90 : 650);
        U.clear(tile.chip);
        if (pv != null) {
          const isPts = m.d === 'pts';
          tile.chip.appendChild(V.delta(isPts ? (v - pv) * (m.scale || 1) : U.change(v, pv), { kind: isPts ? 'pts' : 'pct', d: key === 'conv' ? 2 : 1 }));
          tile.sub.textContent = 'vs ' + fmtBig(pv);
        } else { tile.sub.textContent = st.cmp ? 'no comparison data' : 'comparison off'; }
        const raw = []; for (let i = rg.i0; i <= rg.i1; i++) raw.push(m.den ? (t[m.den][i] ? t[m.num][i] / t[m.den][i] : 0) : t[m.num][i]);
        const w = raw.length >= 120 ? 7 : raw.length >= 20 ? 3 : 1; // trailing moving average keeps the tile sparklines readable
        const vals = raw.map((_, i) => { let a = 0, c = 0; for (let j = Math.max(0, i - w + 1); j <= i; j++) { a += raw[j]; c++; } return a / c; });
        tile.sp.set(vals, prev && v < pv ? 'var(--neg)' : M.color(0));
        tile.el.setAttribute('aria-pressed', String(key === metricKey)); tile.el.classList.toggle('sel', key === metricKey);
      });

      /* chart */
      const gran = A.autoGran(rg.n), bk = A.buckets(rg.i0, rg.i1, gran), cbk = cg ? A.buckets(cg.i0, cg.i1, gran) : null;
      const vals = V.metricBuckets(mm, t, bk), cmpV = cbk ? V.align(V.metricBuckets(mm, t, cbk), bk.length) : null;
      const additive = !mm.den;
      const model = {
        type: mm.type, kind: gran, labels: bk, cmpOn: !!cmpV, zeroBase: mm.zero === false ? false : 'auto', fmtY: mm.fmt, fmtVal: mm.val,
        cmpLabels: cbk ? V.align(cbk.map((x) => x.long), bk.length) : null,
        series: [{ key: metricKey, name: mm.label, color: M.color(0), vals, cmp: cmpV }],
        bands: V.bands(bk), marks: additive ? V.marks(f, rg, bk) : [],
      };
      this.chart.set(model, { animate: reason !== 'theme' });
      this.metricLabel.textContent = mm.label + ' · ' + S.rangeLabel() + ' · ' + { day: 'daily', week: 'weekly', month: 'monthly' }[gran];
      const big = mm.kf(cur);
      U.countTo(this.chartBig, big, { rev: U.money, ord: U.int, aov: (x) => '$' + x.toFixed(2), conv: (x) => (x * 100).toFixed(2) + '%', margin: (x) => (x * 100).toFixed(1) + '%', nps: (x) => x.toFixed(1) }[metricKey], 800);
      U.clear(this.chartDelta);
      if (prev) { const pv = mm.kf(prev), isPts = mm.d === 'pts'; this.chartDelta.append(V.delta(isPts ? (big - pv) * (mm.scale || 1) : U.change(big, pv), { kind: isPts ? 'pts' : 'pct', d: metricKey === 'conv' ? 2 : 1 })); }
      U.clear(this.legend);
      this.legend.append(h('span.lg', h('i.sw', { style: { background: M.color(0) } }), 'This period'), cg ? h('span.lg.dash', h('i.sw.dash'), 'Previous period') : '', additive ? h('span.lg', h('i.dia'), 'Anomaly') : '', h('span.lg', h('i.band'), 'Promotion'));

      /* pacing gauge */
      const pc = A.pacing(f);
      this.gsub.textContent = pc.q.label + ' · ' + pc.q.remain + ' days left' + (S.filterCount() ? ' · target scaled to selection' : '');
      U.countTo(this.gpct, pc.pct * 100, (x) => x.toFixed(1) + '%', 1200);
      this.glbl.textContent = pc.pct < 0.98 ? 'projected, behind target' : pc.pct > 1.02 ? 'projected, ahead of target' : 'projected, on target';
      this.glbl.className = 'g-lbl ' + (pc.pct < 0.98 ? 'neg' : pc.pct > 1.02 ? 'pos' : '');
      this.gauge.set(pc.qtdPct, pc.pct);
      U.clear(this.gstats);
      [['Quarter to date', U.moneyC(pc.qtd)], ['Target', U.moneyC(pc.target)], ['Run-rate / day', U.moneyC(pc.rr)], ['Needed / day', U.moneyC(pc.need)]].forEach((r) => this.gstats.append(h('div', h('dt', r[0]), h('dd.num', r[1]))));

      /* insights */
      const list = A.insights(f, rg, cg);
      U.clear(this.ins);
      list.forEach((it, i) => {
        const row = h('article.ins-i.' + it.tone + (it.d != null ? '.link' : ''), { 'data-id': it.id, style: { '--i': i }, tabindex: it.d != null ? 0 : null, role: it.d != null ? 'button' : null,
          onmouseenter: () => it.d != null && this.chart.highlight(it.id), onmouseleave: () => it.d != null && this.chart.highlight(null),
          onclick: () => it.d != null && V.focusDate(it.d), onkeydown: (e) => { if (it.d != null && e.key === 'Enter') V.focusDate(it.d); } },
        h('span.ins-ic', UI.ic(it.icon, 16)), h('div.ins-b', h('h4', it.title), h('p', { html: it.body }), it.d != null ? h('span.ins-go', 'Open in Explorer', UI.ic('arrowRight', 12)) : null));
        this.ins.appendChild(row);
      });

      /* category leaderboard */
      const bd = D.byDim(f, 'category');
      const rows = bd.idx.map((k, j) => ({ k, cur: U.sum(bd.m[j][0], rg.i0, rg.i1), prev: cg ? U.sum(bd.m[j][0], cg.i0, cg.i1) : null })).sort((a, b) => b.cur - a.cur);
      const total = rows.reduce((a, r) => a + r.cur, 0) || 1, mx = rows.length ? rows[0].cur : 1;
      U.clear(this.cats);
      rows.forEach((r, i) => {
        const on = st.f.category.length === 1 && st.f.category[0] === r.k;
        this.cats.appendChild(h('button.cat' + (on ? '.on' : ''), { style: { '--i': i }, title: on ? 'Clear category filter' : 'Filter to ' + D.CATS[r.k].name, onclick: () => S.set({ f: { ...st.f, category: on ? [] : [r.k] } }) },
          h('i.dot', { style: { background: M.color(r.k) } }), h('span.cn', D.CATS[r.k].name), h('span.cbar', h('i', { style: { width: (r.cur / mx) * 100 + '%', background: M.color(r.k) } })),
          h('span.cv.num', U.moneyC(r.cur)), h('span.cs.num', Math.round((r.cur / total) * 100) + '%'), V.delta(r.prev != null ? U.change(r.cur, r.prev) : null)));
      });
    },

    csv() {
      const rg = S.range(), cg = S.cmp(), t = V.totals();
      const rows = [['date', 'revenue', 'orders', 'aov', 'conversion', 'gross_margin', cg ? 'comparison_date' : null, cg ? 'comparison_revenue' : null].filter((x) => x)];
      for (let i = rg.i0; i <= rg.i1; i++) {
        const r = [D.isoOf(i), t.rev[i].toFixed(2), t.ord[i].toFixed(1), (t.rev[i] / t.ord[i]).toFixed(2), (t.ord[i] / t.ses[i]).toFixed(4), ((t.rev[i] - t.cogs[i]) / t.rev[i]).toFixed(4)];
        if (cg) { const j = cg.i0 + (i - rg.i0); r.push(D.isoOf(j), t.rev[j].toFixed(2)); }
        rows.push(r);
      }
      return rows;
    },
    destroy() { this.chart.destroy(); },
  };
  M.views.overview = view;
})((window.M = window.M || {}));
