/* MERIDIAN - Products: searchable, multi-sort, paginated table with sparklines + margin bars; slide-over product drawer. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D, S = M.S, A = M.A, V = M.V, UI = M.UI, h = U.h, st = S.st;
  const PAGE = 10;
  const COLS = [
    { key: 'name', label: 'Product', always: true, dir: 'asc', get: (r) => r.s.name },
    { key: 'cat', label: 'Category', dir: 'asc', get: (r) => D.CATS[r.s.cat].name },
    { key: 'rev', label: 'Revenue', num: true, dir: 'desc', get: (r) => r.rev },
    { key: 'delta', label: 'vs comparison', num: true, dir: 'desc', get: (r) => (r.delta == null ? -9 : r.delta) },
    { key: 'units', label: 'Units', num: true, dir: 'desc', get: (r) => r.units },
    { key: 'margin', label: 'Margin', num: true, dir: 'desc', get: (r) => r.margin },
    { key: 'ret', label: 'Returns', num: true, dir: 'asc', get: (r) => r.retRate },
    { key: 'stock', label: 'Stock cover', num: true, dir: 'asc', get: (r) => r.cover },
    { key: 'trend', label: 'Trend', nosort: true },
  ];

  const parseSort = (s) => (s || '').split(',').filter(Boolean).map((x) => x.split(':')).filter((x) => COLS.some((c) => c.key === x[0] && !c.nosort));
  const stockState = (r) => (r.onHand <= 0 ? 'out' : r.cover < 14 ? 'low' : 'ok');

  const view = {
    mount(host) {
      this.host = host;
      host.classList.add('g-products');
      this.q = h('input.sin', { type: 'search', placeholder: 'Search 40 products by name, SKU or category', 'aria-label': 'Search products', 'data-search': '', autocomplete: 'off', oninput: U.debounce((e) => S.setV('products', { q: e.target.value.trim(), page: '0' }), 120) });
      this.chips = h('div.pchips', { role: 'group', 'aria-label': 'Category' });
      this.count = h('span.pcount');
      this.colBtn = h('button.tbtn', { 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: (e) => this.colMenu(e.currentTarget) }, UI.ic('columns', 16), 'Columns');
      const tools = h('div.ptools', h('label.search-in', UI.ic('search', 16), this.q), this.chips, h('span.sp'), this.count, this.colBtn);
      this.thead = h('thead'); this.tbody = h('tbody'); this.pager = h('div.pager');
      const card = V.card({ title: 'Product performance', sub: 'Click a row for detail. Shift+click a header to sort by several columns.', cls: 'p-card', bodyCls: 'p-b' });
      card.body.append(tools, h('div.tw.ptw', h('table.tbl.pt', this.thead, this.tbody)), this.pager);
      host.append(card.el);
      this.drawerSku = null;
    },

    cols() { const hide = new Set((st.v.products.cols || '').split(',').filter(Boolean)); return COLS.filter((c) => c.always || !hide.has(c.key)); },

    colMenu(anchor) {
      const render = () => {
        const hide = new Set((st.v.products.cols || '').split(',').filter(Boolean));
        U.clear(list);
        COLS.forEach((c) => {
          const on = c.always || !hide.has(c.key);
          list.appendChild(h('button.mi', { role: 'menuitemcheckbox', 'aria-checked': String(on), disabled: c.always ? '' : null, onclick: () => { if (c.always) return; if (on) hide.add(c.key); else hide.delete(c.key); S.setV('products', { cols: Array.from(hide).join(',') }); render(); } },
            h('span.cb' + (on ? '.on' : ''), on ? UI.ic('check', 12) : null), h('span.mn', c.label), c.always ? h('span.ms', 'Always on') : null));
        });
      };
      const list = h('div.menu-l');
      render();
      UI.popover(anchor, h('div.menu', { role: 'menu', 'aria-label': 'Columns' }, h('div.menu-h', h('b', 'Columns'), h('button.lnk', { onclick: () => { S.setV('products', { cols: '' }); render(); } }, 'Reset')), list), { align: 'end' });
    },

    /** Compute all product rows for the current filters/range. */
    rows() {
      const f = S.filters(), rg = S.range(), cg = S.cmp(), sd = D.skuDaily(f);
      const N = D.N;
      return D.SKUS.map((s) => {
        const o = s.i * N;
        const sum = (a, lo, hi) => { let x = 0; for (let d = lo; d <= hi; d++) x += a[o + d]; return x; };
        const rev = sum(sd.rev, rg.i0, rg.i1), cogs = sum(sd.cogs, rg.i0, rg.i1), ret = sum(sd.ret, rg.i0, rg.i1), units = sum(sd.units, rg.i0, rg.i1);
        const prev = cg ? sum(sd.rev, cg.i0, cg.i1) : null;
        const stock = D.stock[s.i];
        return { s, rev, units, cogs, ret, margin: rev ? (rev - cogs) / rev : 0, retRate: rev + ret ? ret / (rev + ret) : 0, prev, delta: prev ? rev / prev - 1 : null, cover: stock.days, onHand: stock.onHand, perDay: stock.perDay, o, sd };
      });
    },

    update() {
      const vs = st.v.products;
      if (document.activeElement !== this.q && this.q.value !== vs.q) this.q.value = vs.q;
      const cats = new Set((vs.cat || '').split(',').filter(Boolean));
      U.clear(this.chips);
      this.chips.append(h('button.pchip' + (cats.size ? '' : '.on'), { onclick: () => S.setV('products', { cat: '', page: '0' }) }, 'All'),
        ...D.CATS.map((c, i) => h('button.pchip' + (cats.has(c.key) ? '.on' : ''), { 'aria-pressed': String(cats.has(c.key)), onclick: () => { const n = new Set(cats); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); S.setV('products', { cat: Array.from(n).join(','), page: '0' }); } }, h('i.dot', { style: { background: M.color(i) } }), c.name)));

      let rows = this.rows();
      this.allRows = rows;
      const term = (vs.q || '').toLowerCase();
      if (term) rows = rows.filter((r) => (r.s.name + ' ' + r.s.id + ' ' + D.CATS[r.s.cat].name).toLowerCase().includes(term));
      if (cats.size) rows = rows.filter((r) => cats.has(D.CATS[r.s.cat].key));
      const sort = parseSort(vs.sort);
      rows.sort((a, b) => {
        for (const [k, d] of sort) { const c = COLS.find((x) => x.key === k), x = c.get(a), y = c.get(b); const cmp = typeof x === 'string' ? x.localeCompare(y) : x - y; if (cmp) return d === 'desc' ? -cmp : cmp; }
        return a.s.i - b.s.i;
      });
      this.view = rows;
      const pages = Math.max(1, Math.ceil(rows.length / PAGE)), page = U.clamp(+vs.page || 0, 0, pages - 1);
      const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
      this.count.textContent = rows.length === D.SKUS.length ? '40 products' : rows.length + ' of 40 products';

      /* header */
      const cols = this.cols();
      U.clear(this.thead);
      this.thead.appendChild(h('tr', cols.map((c) => {
        const idx = sort.findIndex((x) => x[0] === c.key), dir = idx >= 0 ? sort[idx][1] : null;
        return h('th' + (c.num ? '.r' : '') + (c.key === 'trend' ? '.tr' : ''), { 'aria-sort': dir ? (dir === 'asc' ? 'ascending' : 'descending') : 'none', 'data-col': c.key },
          c.nosort ? c.label : h('button.sh' + (dir ? '.on' : ''), { title: 'Sort by ' + c.label + ' (Shift+click adds a secondary sort)', onclick: (e) => this.sortBy(c, e.shiftKey) }, c.label, UI.ic(dir ? (dir === 'asc' ? 'sortAsc' : 'sortDesc') : 'sortBoth', 13), idx >= 0 && sort.length > 1 ? h('sup', String(idx + 1)) : null));
      })));

      /* body */
      U.clear(this.tbody);
      if (!slice.length) this.tbody.appendChild(h('tr.none', h('td', { colspan: cols.length }, V.empty('search', 'No products match', 'Try a different search term or clear the category chips.'))));
      const weeks = Math.min(26, Math.max(6, Math.ceil(S.range().n / 7)));
      slice.forEach((r, i) => {
        const cells = {
          name: h('td.pn', h('div.pname', h('i.dot', { style: { background: M.color(r.s.cat) } }), h('div', h('b', r.s.name), h('small', r.s.id)))),
          cat: h('td', h('span.ctag', D.CATS[r.s.cat].name)),
          rev: h('td.r.num', h('b', U.money(r.rev))),
          delta: h('td.r', V.delta(r.delta)),
          units: h('td.r.num', U.int(r.units)),
          margin: h('td.r', h('div.mg', h('span.mbar', h('i', { style: { width: U.clamp(r.margin / 0.75, 0, 1) * 100 + '%' } })), h('span.num', U.pct(r.margin, 1)))),
          ret: h('td.r.num' + (r.retRate > 0.095 ? '.hi' : ''), U.pct(r.retRate, 1)),
          stock: h('td.r', r.onHand <= 0 ? h('span.chip.neg', 'Out of stock') : r.cover < 14 ? h('span.chip.warn', 'Low · ' + Math.round(r.cover) + 'd') : h('span.num', Math.round(r.cover) + 'd')),
          trend: h('td.tr', h('div.ptrend')),
        };
        const tr = h('tr.pr', { tabindex: 0, 'data-sku': r.s.id, style: { '--i': i }, onclick: () => S.setV('products', { sku: r.s.id }), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.setV('products', { sku: r.s.id }); } } }, cols.map((c) => cells[c.key]));
        this.tbody.appendChild(tr);
        const sp = tr.querySelector('.ptrend');
        if (sp) {
          const arr = []; const rg = S.range(), n = rg.n;
          for (let w = 0; w < weeks; w++) { const a = rg.i0 + Math.floor((w * n) / weeks), b = rg.i0 + Math.floor(((w + 1) * n) / weeks) - 1; let x = 0; for (let d = a; d <= b; d++) x += r.sd.rev[r.o + d]; arr.push(x); }
          new M.Spark(sp, { w: 96, h: 28, color: r.delta != null && r.delta < 0 ? 'var(--neg)' : M.color(r.s.cat), fill: false }).set(arr);
        }
      });

      /* pager */
      U.clear(this.pager);
      const from = rows.length ? page * PAGE + 1 : 0, to = Math.min(rows.length, page * PAGE + PAGE);
      const go = (p) => S.setV('products', { page: String(U.clamp(p, 0, pages - 1)) });
      this.pager.append(h('span.pinfo', 'Showing ' + from + '–' + to + ' of ' + rows.length), h('span.sp'),
        h('button.pg', { 'aria-label': 'Previous page', disabled: page === 0, onclick: () => go(page - 1) }, UI.ic('chevLeft', 15)),
        ...Array.from({ length: pages }, (_, p) => h('button.pg.n' + (p === page ? '.on' : ''), { 'aria-label': 'Page ' + (p + 1), 'aria-current': p === page ? 'page' : null, onclick: () => go(p) }, String(p + 1))),
        h('button.pg', { 'aria-label': 'Next page', disabled: page >= pages - 1, onclick: () => go(page + 1) }, UI.ic('chevRight', 15)));
      this.syncDrawer();
    },

    sortBy(col, shift) {
      const cur = parseSort(st.v.products.sort);
      let next;
      const i = cur.findIndex((x) => x[0] === col.key);
      if (shift) {
        next = cur.slice();
        if (i < 0) next.push([col.key, col.dir]);
        else if (next[i][1] === col.dir) next[i] = [col.key, col.dir === 'asc' ? 'desc' : 'asc'];
        else next.splice(i, 1);
        if (!next.length) next = [['rev', 'desc']];
      } else if (cur.length === 1 && i === 0) next = [[col.key, cur[0][1] === 'asc' ? 'desc' : 'asc']];
      else next = [[col.key, col.dir]];
      S.setV('products', { sort: next.map((x) => x.join(':')).join(','), page: '0' });
    },

    /* ---------- drawer ---------- */
    syncDrawer() {
      const id = st.v.products.sku;
      if (!id) { if (this.drawerSku) { this.drawerSku = null; UI.drawer.close(true); if (this.dchart) { this.dchart.destroy(); this.dchart = null; } } return; }
      const r = this.allRows.find((x) => x.s.id === id);
      if (!r) return;
      if (this.drawerSku !== id || !UI.drawer.isOpen()) { this.drawerSku = id; this.openDrawer(r); }
      else this.fillDrawer(r);
    },
    openDrawer(r) {
      this.dref = {};
      const body = h('div.pd');
      const R = this.dref;
      R.stats = h('div.pd-stats'); R.chartHost = h('div.chart'); R.stock = h('div.pd-stock'); R.split = h('div.pd-split'); R.facts = h('dl.pd-facts');
      body.append(R.stats, h('section', h('p.micro', 'Revenue over time'), R.chartHost), h('section', h('p.micro', 'Inventory'), R.stock), R.split, h('section', h('p.micro', 'Details'), R.facts));
      UI.drawer.open(r.s.name, r.s.id + ' · ' + D.CATS[r.s.cat].name, body, () => { this.drawerSku = null; if (this.dchart) { this.dchart.destroy(); this.dchart = null; } S.setV('products', { sku: '' }); });
      this.dchart = new M.TimeChart(R.chartHost, { height: 200, m: { t: 14, r: 10, b: 24, l: 46 }, label: 'Product revenue over time' });
      this.fillDrawer(r);
    },
    fillDrawer(r) {
      const R = this.dref, rg = S.range(), cg = S.cmp(), N = D.N;
      U.clear(R.stats);
      [['Revenue', U.money(r.rev), V.delta(r.delta)], ['Units sold', U.int(r.units), null], ['Gross margin', U.pct(r.margin, 1), null], ['Return rate', U.pct(r.retRate, 1), null]].forEach((x) => R.stats.append(h('div', h('span.micro', x[0]), h('b.num', x[1]), x[2])));
      const gran = A.autoGran(rg.n), bk = A.buckets(rg.i0, rg.i1, gran), cbk = cg ? A.buckets(cg.i0, cg.i1, gran) : null;
      const daily = Array.from({ length: N }, (_, d) => r.sd.rev[r.o + d]);
      this.dchart.set({ type: 'area', kind: gran, labels: bk, cmpOn: !!cbk, zeroBase: 'auto', fmtY: U.moneyC, fmtVal: U.money, cmpLabels: cbk ? V.align(cbk.map((x) => x.long), bk.length) : null,
        series: [{ key: r.s.id, name: r.s.name, color: M.color(r.s.cat), vals: A.bucketSum(daily, bk), cmp: cbk ? V.align(A.bucketSum(daily, cbk), bk.length) : null }], bands: V.bands(bk), marks: [] });
      const state = stockState(r);
      U.clear(R.stock);
      R.stock.append(
        h('div.stk-top', h('div', h('b.num', U.int(r.onHand)), h('span', 'units on hand')), h('div', h('b.num', r.perDay.toFixed(1)), h('span', 'sold per day (28d)')), h('div', h('b.num', r.onHand <= 0 ? '0' : Math.round(r.cover) + 'd'), h('span', 'days of cover'))),
        h('div.stk-bar', h('i.' + state, { style: { width: Math.min(100, (r.cover / 90) * 100) + '%' } }), h('em', { style: { left: (14 / 90) * 100 + '%' } }, 'reorder')),
        h('p.stk-msg.' + state, UI.ic(state === 'ok' ? 'check' : 'alert', 14), state === 'out' ? 'Out of stock. Sales are being lost until the next inbound lands.' : state === 'low' ? 'Below the 14-day reorder threshold. Expedite a purchase order.' : 'Healthy cover for the current sales velocity.'));
      const sp = D.skuSplit(r.s.i, S.filters(), rg.i0, rg.i1);
      const bars = (title, dim, arr) => {
        const tot = U.sum(arr, 0, arr.length - 1) || 1, mx = Math.max(...arr, 1e-9);
        return h('section', h('p.micro', title), arr.map((v, i) => (v > 0 || !S.filters()[dim].length ? h('div.sp-r', h('span', D.DIMS[dim][i].name), h('span.sbar', h('i', { style: { width: (v / mx) * 100 + '%', background: M.color(i) } })), h('b.num', Math.round((v / tot) * 100) + '%')) : null)));
      };
      U.clear(R.split);
      R.split.append(bars('By region', 'region', Array.from(sp.reg)), bars('By channel', 'channel', Array.from(sp.chn)));
      U.clear(R.facts);
      [['List price', U.money(r.s.price)], ['Unit cost (est.)', U.money(r.s.price * r.s.cost)], ['In range since', r.s.launch >= 0 ? U.dstr(D.ms(r.s.launch), 'my') : r.s.since + ' (core range)'], ['Revenue rank', '#' + (this.allRows.slice().sort((a, b) => b.rev - a.rev).findIndex((x) => x.s.id === r.s.id) + 1) + ' of 40']].forEach((x) => R.facts.append(h('div', h('dt', x[0]), h('dd.num', x[1]))));
    },

    csv() {
      const cols = this.cols().filter((c) => !c.nosort);
      const rows = [cols.map((c) => c.label).concat(['SKU'])];
      const fmt = { name: (r) => r.s.name, cat: (r) => D.CATS[r.s.cat].name, rev: (r) => r.rev.toFixed(2), delta: (r) => (r.delta == null ? '' : (r.delta * 100).toFixed(2) + '%'), units: (r) => Math.round(r.units), margin: (r) => (r.margin * 100).toFixed(1) + '%', ret: (r) => (r.retRate * 100).toFixed(1) + '%', stock: (r) => Math.round(r.cover) + ' days' };
      this.view.forEach((r) => rows.push(cols.map((c) => fmt[c.key](r)).concat([r.s.id])));
      return rows;
    },
    destroy() { UI.drawer.close(true); if (this.dchart) this.dchart.destroy(); this.dchart = null; },
  };
  M.views.products = view;
})((window.M = window.M || {}));
