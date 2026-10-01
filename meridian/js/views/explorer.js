/* MERIDIAN - Revenue Explorer: line/area/stacked/bars, group-by, granularity, compare overlay, brush-to-zoom with minimap. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D, S = M.S, A = M.A, V = M.V, UI = M.UI, h = U.h, st = S.st;

  const METRICS = {
    rev: { label: 'Revenue', arr: (t) => t.rev, dim: (m) => m[0], fmt: U.moneyC, val: U.money },
    ord: { label: 'Orders', arr: (t) => t.ord, dim: (m) => m[1], fmt: U.compact, val: U.int },
    units: { label: 'Units', arr: (t) => t.units, dim: (m) => m[2], fmt: U.compact, val: U.int },
    gp: { label: 'Gross profit', arr: (t) => t.gp, dim: (m) => m._gp || (m._gp = m[0].map((v, i) => v - m[3][i])), fmt: U.moneyC, val: U.money },
  };
  const TYPES = [['line', 'Line'], ['area', 'Area'], ['stack', 'Stacked area'], ['bar', 'Bars']];
  const BYS = [['total', 'Total'], ['category', 'Category'], ['region', 'Region'], ['channel', 'Channel']];
  const GRANS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

  function segment(opts, onPick, icons) {
    const el = h('div.seg.sm', { role: 'group' });
    opts.forEach((o) => el.appendChild(h('button', { 'data-v': o[0], title: o[1], 'aria-label': o[1], onclick: () => onPick(o[0]) }, icons ? UI.ic(o[0] === 'bar' ? 'bars' : o[0], 16) : o[1])));
    el.set = (v) => U.$$('button', el).forEach((b) => { const on = b.getAttribute('data-v') === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    return el;
  }

  const view = {
    mount(host) {
      host.classList.add('g-explorer');
      this.zoom = null;
      const set = (k) => (v) => S.setV('explorer', { [k]: v });
      this.sMetric = segment(Object.keys(METRICS).map((k) => [k, METRICS[k].label]), set('metric'));
      this.sType = segment(TYPES, set('type'), true);
      this.sBy = segment(BYS, set('by'));
      this.sGran = segment(GRANS, set('gran'));
      this.big = h('div.big.num'); this.bigDelta = h('span'); this.bigSub = h('span.bsub');
      this.resetBtn = h('button.zreset', { onclick: () => this.setZoom(null, true) }, UI.ic('close', 12), 'Reset zoom');
      this.legend = h('div.lchips');
      this.chartHost = h('div.chart'); this.mmHost = h('div.mmw');
      const ctl = h('div.ex-ctl', h('div.ctl-g', h('span.micro', 'Metric'), this.sMetric), h('div.ctl-g', h('span.micro', 'Chart'), this.sType), h('div.ctl-g', h('span.micro', 'Group by'), this.sBy), h('div.ctl-g', h('span.micro', 'Granularity'), this.sGran));
      const main = V.card({ title: 'Explorer', cls: 'ex-main', bodyCls: 'ex-b' });
      main.head.replaceWith(h('header.ex-top', ctl));
      main.body.append(h('div.ex-fig', h('div.ex-big', h('p.micro#ex-lbl'), h('div.bigrow', this.big, this.bigDelta)), h('div.ex-fig-r', this.bigSub, this.resetBtn)), this.legend, this.chartHost, this.mmHost, h('p.hint', UI.ic('info', 13), 'Drag across the chart or the strip below to zoom. Double-click to reset. Dashed lines are the comparison period.'));
      this.lbl = main.el.querySelector('#ex-lbl');
      this.chart = new M.TimeChart(this.chartHost, { height: 384, brush: true, label: 'Revenue explorer chart', onBrush: (a, b) => this.chartBrush(a, b), onMark: (id, ev) => { if (ev === 'click') V.focusDate(+String(id).slice(2)); } });
      this.mm = new M.Minimap(this.mmHost, { onChange: (a, b, fin) => this.mmChange(a, b, fin) });
      const tbl = V.card({ title: 'Breakdown', sub: 'Every series in the chart, reconciled to the total', cls: 'ex-tbl', bodyCls: 'tbl-b' });
      this.tbody = h('tbody'); this.tfoot = h('tfoot'); this.tsub = tbl.head.querySelector('p');
      tbl.body.append(h('div.tw', h('table.tbl.bd', h('thead', h('tr', h('th', 'Series'), h('th.r', 'Total'), h('th.share', 'Share'), h('th.r', 'vs comparison'), h('th.r.tr', 'Trend'))), this.tbody, this.tfoot)));
      host.append(main.el, tbl.el);
    },

    hidden() { return new Set((st.v.explorer.hide || '').split(',').filter(Boolean)); },
    setZoom(z, animate) { this.zoom = z; this.render(animate !== false); },
    chartBrush(a, b) {
      if (a == null) return this.setZoom(null);
      const off = this.zoom ? this.zoom[0] : 0;
      this.setZoom([off + a, off + b]);
    },
    mmChange(a, b, fin) {
      this.zoom = a == null ? null : [a, b];
      this.render(fin ? true : false, true);
    },

    update() {
      const vs = st.v.explorer, f = S.filters(), rg = S.range(), cg = S.cmp();
      const key = [rg.i0, rg.i1, vs.by, vs.gran, vs.metric, D.fkey(f), !!cg].join('|');
      if (key !== this.zkey) { this.zkey = key; this.zoom = null; }
      const met = METRICS[vs.metric];
      let sers;
      const t = V.totals();
      if (vs.by === 'total') sers = [{ key: 'total', name: met.label, color: M.color(0), arr: met.arr(t) }];
      else {
        const bd = D.byDim(f, vs.by);
        sers = bd.idx.map((ix, j) => ({ key: D.DIMS[vs.by][ix].key, name: D.DIMS[vs.by][ix].name, color: M.color(ix), arr: met.dim(bd.m[j]) }));
      }
      const bk = A.buckets(rg.i0, rg.i1, vs.gran), cbk = cg ? A.buckets(cg.i0, cg.i1, vs.gran) : null;
      sers.forEach((s) => { s.vals = A.bucketSum(s.arr, bk); s.cmp = cbk ? V.align(A.bucketSum(s.arr, cbk), bk.length) : null; s.total = U.sum(s.arr, rg.i0, rg.i1); });
      this.full = { bk, cbk, sers, rg, cg, met, t, f };
      this.sMetric.set(vs.metric); this.sType.set(vs.type); this.sBy.set(vs.by); this.sGran.set(vs.gran);
      this.render(true, false);
    },

    /** Re-render chart, legend, figure and table for the current zoom window. */
    render(animate, fromMinimap) {
      const F = this.full; if (!F) return;
      const vs = st.v.explorer, hid = this.hidden(), n = F.bk.length;
      const z = this.zoom && this.zoom[1] - this.zoom[0] >= 1 ? [U.clamp(this.zoom[0], 0, n - 1), U.clamp(this.zoom[1], 0, n - 1)] : null;
      const a = z ? z[0] : 0, b = z ? z[1] : n - 1;
      const bk = F.bk.slice(a, b + 1), cbk = F.cbk ? F.cbk.slice(a, b + 1) : null;
      const series = F.sers.map((s) => ({ key: s.key, name: s.name, color: s.color, vals: s.vals.slice(a, b + 1), cmp: s.cmp ? s.cmp.slice(a, b + 1) : null, vis: !hid.has(s.key) }));
      const dayA = bk[0].a, dayB = bk[bk.length - 1].b;
      const model = {
        type: vs.type, kind: vs.gran, labels: bk, cmpOn: !!F.cbk, zeroBase: true, fmtY: F.met.fmt, fmtVal: F.met.val,
        cmpLabels: cbk ? cbk.map((x) => x.long) : null, series, bands: V.bands(bk),
        marks: vs.metric === 'rev' || vs.metric === 'ord' ? V.marks(F.f, { i0: dayA, i1: dayB }, bk) : [],
      };
      this.chart.set(model, { animate });
      if (!fromMinimap) {
        this.mm.set(F.bk.map((_, i) => F.sers.reduce((acc, s) => acc + (hid.has(s.key) ? 0 : s.vals[i]), 0)), 'var(--ink-3)');
        this.mm.setBrush(z ? z[0] : null, z ? z[1] : null);
      }

      /* headline figure + legend */
      const vis = F.sers.filter((s) => !hid.has(s.key));
      const sum = (arr, lo, hi) => { let x = 0; for (let i = lo; i <= hi; i++) x += arr[i]; return x; };
      const cur = vis.reduce((acc, s) => acc + sum(s.arr, dayA, dayB), 0);
      const cmpRg = F.cg ? { i0: F.cg.i0 + (dayA - F.rg.i0), i1: F.cg.i0 + (dayB - F.rg.i0) } : null;
      const prev = cmpRg ? vis.reduce((acc, s) => acc + sum(s.arr, cmpRg.i0, cmpRg.i1), 0) : null;
      this.lbl.textContent = F.met.label + (vs.by === 'total' ? '' : ' by ' + vs.by) + ' · ' + (z ? 'zoomed ' : '') + U.dstr(D.ms(dayA), 'md') + ' – ' + U.dstr(D.ms(dayB));
      U.countTo(this.big, cur, F.met.val, 550);
      U.clear(this.bigDelta);
      if (prev != null) this.bigDelta.appendChild(V.delta(U.change(cur, prev)));
      this.bigSub.textContent = prev != null ? 'vs ' + F.met.val(prev) + ' · ' + (dayB - dayA + 1) + ' days' : (dayB - dayA + 1) + ' days';
      this.resetBtn.hidden = !z;
      U.clear(this.legend);
      if (vs.by !== 'total') F.sers.forEach((s) => this.legend.appendChild(h('button.lchip' + (hid.has(s.key) ? '.off' : ''), { 'aria-pressed': String(!hid.has(s.key)), title: (hid.has(s.key) ? 'Show ' : 'Hide ') + s.name, onclick: () => this.toggle(s.key) }, h('i', { style: { background: s.color } }), s.name)));

      /* breakdown table for the visible window */
      U.clear(this.tbody); U.clear(this.tfoot);
      this.tsub.textContent = 'Every series in the chart, reconciled to the total · ' + U.dstr(D.ms(dayA), 'md') + ' – ' + U.dstr(D.ms(dayB));
      const nDays = dayB - dayA + 1, nPts = Math.min(40, nDays);
      const trend = (arr) => Array.from({ length: nPts }, (_, i) => sum(arr, dayA + Math.floor((i * nDays) / nPts), dayA + Math.floor(((i + 1) * nDays) / nPts) - 1));
      const rows = F.sers.map((s) => ({ s, cur: sum(s.arr, dayA, dayB), prev: cmpRg ? sum(s.arr, cmpRg.i0, cmpRg.i1) : null })).sort((x, y) => y.cur - x.cur);
      const all = rows.reduce((q, r) => q + r.cur, 0);
      rows.forEach((r) => {
        const off = hid.has(r.s.key);
        const sp = h('div.tsp');
        this.tbody.appendChild(h('tr' + (off ? '.off' : ''), { onclick: () => vs.by !== 'total' && this.toggle(r.s.key), class: vs.by !== 'total' ? 'clk' : null },
          h('td', h('span.nm', h('i.dot', { style: { background: r.s.color } }), r.s.name)), h('td.r.num', F.met.val(r.cur)),
          h('td.share', h('span.sbar', h('i', { style: { width: (all ? (r.cur / all) * 100 : 0) + '%', background: r.s.color } })), h('em.num', Math.round((all ? r.cur / all : 0) * 100) + '%')),
          h('td.r', V.delta(r.prev != null ? U.change(r.cur, r.prev) : null)), h('td.r.tr', sp)));
        new M.Spark(sp, { color: r.s.color, w: 90, h: 26, fill: false }).set(trend(r.s.arr));
      });
      if (rows.length > 1) {
        const pv = rows.reduce((q, r) => q + (r.prev || 0), 0);
        this.tfoot.appendChild(h('tr', h('td', h('b', 'Total')), h('td.r.num', h('b', F.met.val(all))), h('td.share', h('em.num', '100%')), h('td.r', V.delta(cmpRg ? U.change(all, pv) : null)), h('td')));
      }
    },

    toggle(key) {
      const hid = this.hidden();
      if (hid.has(key)) hid.delete(key); else { if (hid.size >= this.full.sers.length - 1) return; hid.add(key); }
      S.setV('explorer', { hide: Array.from(hid).join(',') });
    },

    csv() {
      const F = this.full;
      const head = ['period_start', 'period_end'].concat(F.sers.map((s) => s.name), ['total']);
      if (F.cbk) head.push('comparison_total');
      const rows = [head];
      F.bk.forEach((b, i) => {
        const r = [D.isoOf(b.a), D.isoOf(b.b)];
        let tot = 0, ct = 0;
        F.sers.forEach((s) => { r.push(s.vals[i].toFixed(2)); tot += s.vals[i]; ct += s.cmp ? s.cmp[i] : 0; });
        r.push(tot.toFixed(2)); if (F.cbk) r.push(ct.toFixed(2));
        rows.push(r);
      });
      return rows;
    },
    destroy() { this.chart.destroy(); this.mm.destroy(); },
  };
  M.views.explorer = view;
})((window.M = window.M || {}));
