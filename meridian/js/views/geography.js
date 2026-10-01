/* MERIDIAN - Geography: US tile-grid cartogram (North America region) + global region breakdown. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D, S = M.S, A = M.A, V = M.V, UI = M.UI, h = U.h, st = S.st;

  const view = {
    mount(host) {
      this.host = host;
      host.classList.add('g-geo');
      this.tiles = {};
      const seg = h('div.seg.sm', { role: 'group', 'aria-label': 'Map metric' }, [['rev', 'Revenue'], ['growth', 'Growth']].map((o) => h('button', { 'data-v': o[0], onclick: () => S.setV('geography', { metric: o[0] }) }, o[1])));
      this.seg = seg;
      const mapCard = V.card({ title: 'Demand by state', sub: 'North America region, one tile per state', cls: 'geo-map', actions: seg });
      this.grid = h('div.tgrid', { role: 'list', 'aria-label': 'US states' });
      A.STATES.forEach((s) => {
        const t = h('button.tile', { role: 'listitem', 'data-s': s.code, style: { gridColumn: s.col + 1, gridRow: s.row + 1, '--d': s.col + s.row }, 'aria-label': s.name,
          onmouseenter: (e) => this.hover(s.code, e), onmousemove: (e) => this.hover(s.code, e), onmouseleave: () => this.leave(s.code), onfocus: (e) => this.hover(s.code, e), onblur: () => this.leave(s.code) },
        h('b', s.code), h('span.tv.num'));
        this.tiles[s.code] = t; this.grid.appendChild(t);
      });
      this.legend = h('div.tlegend');
      this.notice = h('div.geo-note');
      mapCard.body.append(this.grid, this.legend, this.notice);

      const listCard = V.card({ title: 'Ranking', sub: 'All 50 states', cls: 'geo-list' });
      this.list = h('ol.rank');
      listCard.body.append(this.list);

      const regCard = V.card({ title: 'Global regions', sub: 'Share of revenue, growth and category mix', cls: 'geo-reg' });
      this.regs = h('div.regions');
      regCard.body.append(this.regs);
      host.append(mapCard.el, listCard.el, regCard.el);
    },

    hover(code, e) {
      const s = this.data.states.find((x) => x.code === code);
      if (!s || !this.data.enabled) return;
      this.grid.classList.add('hov');
      U.$$('.tile.on', this.grid).forEach((n) => n.classList.remove('on')); this.tiles[code].classList.add('on');
      const rows = U.$$('.rank li', this.host || document); rows.forEach((r) => r.classList.toggle('on', r.getAttribute('data-s') === code));
      const rank = this.ranked.findIndex((x) => x.code === code) + 1;
      const g = s.growth;
      const x = e && e.clientX != null && e.type !== 'focus' ? e.clientX : this.tiles[code].getBoundingClientRect().right, y = e && e.clientY != null && e.type !== 'focus' ? e.clientY : this.tiles[code].getBoundingClientRect().top;
      UI.tip.show('<div class="tt-h">' + U.esc(s.name) + ' · #' + rank + ' of 50</div><div class="tt-r"><span class="tt-n">Revenue</span><b>' + U.money(s.rev) + '</b></div><div class="tt-r"><span class="tt-n">Share of NA</span><b>' + U.pct(s.share) + '</b></div>' +
        (g != null ? '<div class="tt-r"><span class="tt-n">vs comparison</span><b class="' + (g >= 0 ? 'pos' : 'neg') + '">' + U.signedPct(g) + '</b></div>' : '') +
        '<div class="tt-r"><i style="background:' + M.color(s.topCat) + '"></i><span class="tt-n">Top category</span><b>' + D.CATS[s.topCat].name + '</b></div>', x, y);
    },
    leave(code) {
      UI.tip.hide(); this.grid.classList.remove('hov');
      if (this.tiles[code]) this.tiles[code].classList.remove('on');
      U.$$('.rank li.on', this.host || document).forEach((r) => r.classList.remove('on'));
    },

    update() {
      const f = S.filters(), rg = S.range(), cg = S.cmp(), metric = st.v.geography.metric;
      U.$$('button', this.seg).forEach((b) => { const on = b.getAttribute('data-v') === metric; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      const data = (this.data = A.geo(f, rg, cg));
      const useGrowth = metric === 'growth' && cg;
      this.grid.classList.toggle('off', !data.enabled);
      this.notice.textContent = !data.enabled ? 'North America is filtered out, so the state map has nothing to show. Clear the Region filter to see it.' : metric === 'growth' && !cg ? 'Turn on Compare to colour states by growth. Showing revenue instead.' : '';
      const vals = data.states.map((s) => (useGrowth ? s.growth : s.rev));
      const mx = Math.max(...data.states.map((s) => s.rev), 1);
      const gmax = Math.max(0.02, ...data.states.map((s) => Math.abs(s.growth || 0)));
      data.states.forEach((s) => {
        const t = this.tiles[s.code];
        let bg, fg;
        if (!data.enabled) { bg = 'var(--surface-3)'; fg = 'var(--ink-4)'; }
        else if (useGrowth) {
          const g = s.growth || 0, k = Math.min(1, Math.abs(g) / gmax), col = g >= 0 ? 'var(--pos)' : 'var(--neg)';
          bg = 'color-mix(in srgb, ' + col + ' ' + Math.round(14 + k * 62) + '%, var(--surface-2))'; fg = k > 0.62 ? '#fff' : 'var(--ink)';
        } else {
          const k = Math.sqrt(s.rev / mx);
          bg = 'color-mix(in srgb, var(--heat1) ' + Math.round(10 + k * 82) + '%, var(--heat0))'; fg = k > 0.52 ? 'var(--accent-ink)' : 'var(--ink)';
        }
        t.style.background = bg; t.style.color = fg;
        const tv = t.querySelector('.tv');
        if (!data.enabled) tv.textContent = '–';
        else if (useGrowth) tv.textContent = s.growth == null ? '–' : U.signedPct(s.growth, 0);
        else U.countTo(tv, s.rev, U.moneyC, 900);
      });
      /* legend */
      U.clear(this.legend);
      if (useGrowth) this.legend.append(h('span', U.signedPct(-gmax, 0)), h('i.ramp.div'), h('span', U.signedPct(gmax, 0)), h('em', 'growth vs comparison'));
      else this.legend.append(h('span', '$0'), h('i.ramp'), h('span', U.moneyC(mx)), h('em', 'revenue in range'));

      /* ranking */
      const ranked = (this.ranked = data.states.slice().sort((a, b) => (useGrowth ? (b.growth || -9) - (a.growth || -9) : b.rev - a.rev)));
      const top = Math.max(...ranked.map((s) => (useGrowth ? Math.abs(s.growth || 0) : s.rev)), 1e-9);
      U.clear(this.list);
      ranked.forEach((s, i) => {
        this.list.appendChild(h('li', { 'data-s': s.code, onmouseenter: () => { this.grid.classList.add('hov'); this.tiles[s.code].classList.add('on'); }, onmouseleave: () => { this.grid.classList.remove('hov'); this.tiles[s.code].classList.remove('on'); } },
          h('span.rk.num', String(i + 1)), h('b.sc', s.code), h('span.sn', s.name),
          h('span.sbar', h('i', { style: { width: ((useGrowth ? Math.abs(s.growth || 0) : s.rev) / top) * 100 + '%', background: useGrowth && (s.growth || 0) < 0 ? 'var(--neg)' : 'var(--c1)' } })),
          h('span.sv.num', U.moneyC(s.rev)), V.delta(s.growth)));
      });

      /* global regions */
      const tot = D.byDim(f, 'region');
      const all = tot.m.reduce((a, m) => a + U.sum(m[0], rg.i0, rg.i1), 0) || 1;
      U.clear(this.regs);
      D.REGIONS.forEach((r, ri) => {
        const j = tot.idx.indexOf(ri), on = j >= 0;
        const cur = on ? U.sum(tot.m[j][0], rg.i0, rg.i1) : 0, prev = on && cg ? U.sum(tot.m[j][0], cg.i0, cg.i1) : null;
        const share = cur / all;
        const cats = D.byDim({ ...f, region: [ri] }, 'category'), cs = cats.m.map((m) => U.sum(m[0], rg.i0, rg.i1)), ct = cs.reduce((a, b) => a + b, 0) || 1;
        const chn = D.byDim({ ...f, region: [ri] }, 'channel'), chs = chn.m.map((m) => U.sum(m[0], rg.i0, rg.i1));
        const topCh = chs.indexOf(Math.max(...chs));
        const C = 2 * Math.PI * 30;
        const ring = h('svg.ring', { viewBox: '0 0 76 76', 'aria-hidden': 'true', html: '<circle cx="38" cy="38" r="30" class="rt"/><circle cx="38" cy="38" r="30" class="rp" style="stroke:' + M.color(ri) + ';stroke-dasharray:0 ' + C.toFixed(1) + '" data-d="' + (share * C).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 38 38)"/>' });
        const card = h('article.reg' + (on ? '' : '.off'), { style: { '--i': ri } },
          h('div.reg-h', ring, h('div.reg-c', h('b.num', on ? Math.round(share * 100) + '%' : '–')), h('div.reg-t', h('p.micro', r.key), h('h4', r.name))),
          h('div.reg-v.num', on ? U.moneyC(cur) : 'Filtered out'), h('div.reg-d', on ? V.delta(prev != null ? U.change(cur, prev) : null) : null, on && chs.length ? h('span.rsub', 'Top channel ' + D.CHANS[chn.idx[topCh]].name) : null),
          on ? h('div.mix', { role: 'img', 'aria-label': 'Category mix' }, cats.idx.map((k, q) => h('i', { style: { width: (cs[q] / ct) * 100 + '%', background: M.color(k) }, title: D.CATS[k].name + ' ' + Math.round((cs[q] / ct) * 100) + '%' }))) : null,
          on ? h('div.mixl', cats.idx.slice().sort((a, b) => cs[cats.idx.indexOf(b)] - cs[cats.idx.indexOf(a)]).slice(0, 3).map((k) => h('span', h('i.dot', { style: { background: M.color(k) } }), D.CATS[k].name + ' ' + Math.round((cs[cats.idx.indexOf(k)] / ct) * 100) + '%'))) : null);
        this.regs.appendChild(card);
        requestAnimationFrame(() => requestAnimationFrame(() => { const p = card.querySelector('.rp'); if (p) p.style.strokeDasharray = p.getAttribute('data-d'); }));
      });
    },

    csv() {
      const rows = [['state_code', 'state', 'revenue', 'comparison_revenue', 'growth', 'share_of_na', 'top_category']];
      this.data.states.slice().sort((a, b) => b.rev - a.rev).forEach((s) => rows.push([s.code, s.name, s.rev.toFixed(2), s.prev == null ? '' : s.prev.toFixed(2), s.growth == null ? '' : s.growth.toFixed(4), s.share.toFixed(4), D.CATS[s.topCat].name]));
      return rows;
    },
    destroy() { UI.tip.hide(); },
  };
  M.views.geography = view;
})((window.M = window.M || {}));
