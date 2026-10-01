/* MERIDIAN - Funnel & Cohorts: animated conversion funnel with drop-off callouts, segment switcher, retention heatmap. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D, S = M.S, A = M.A, V = M.V, UI = M.UI, h = U.h, st = S.st;
  const W = (p) => Math.pow(Math.max(0, p), 0.5) * 100; // square-root scale keeps late stages legible
  const DROP_COPY = ['leave before viewing a product', 'browse without adding to cart', 'abandon the cart before checkout', 'drop at payment'];

  const view = {
    mount(host) {
      this.host = host;
      host.classList.add('g-funnel');
      const seg = h('div.seg.sm.wrap', { role: 'group', 'aria-label': 'Segment' }, A.FUNNEL_SEGS.map((s) => h('button', { 'data-v': s.key, onclick: () => S.setV('funnel', { seg: s.key }) }, s.name)));
      this.seg = seg;
      const fc = V.card({ title: 'Conversion funnel', sub: 'Web, app and marketplace sessions, visit to purchase', cls: 'fn-card', actions: seg });
      this.rows = h('div.frows');
      this.note = h('p.hint.fn-note', UI.ic('info', 13), 'Bar width uses a square-root scale so the late stages stay visible; percentages are exact.');
      fc.body.append(this.rows, this.note);
      this.shapes = []; this.widths = null;
      for (let i = 0; i < 5; i++) {
        const poly = h('polygon');
        const svg = h('svg.fshape', { viewBox: '0 0 100 64', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, poly);
        const l = h('div.fl-l'), r = h('div.fl-r');
        const row = h('div.frow', { style: { '--i': i } }, l, svg, r);
        this.shapes.push({ poly, l, r, row, svg });
        this.rows.appendChild(row);
        if (i < 4) { const d = h('div.fdrop'); this.shapes[i].drop = d; this.rows.appendChild(d); }
      }
      const sum = V.card({ title: 'Headline', sub: 'Selected segment', cls: 'fn-sum' });
      this.sumBody = h('div.fsum');
      this.segTbl = h('div.segs');
      sum.body.append(this.sumBody, h('p.micro.segh', 'Conversion by segment'), this.segTbl);

      const cc = V.card({ title: 'Retention by first-purchase cohort', sub: 'Share of each monthly cohort that bought again, by months since first purchase', cls: 'co-card' });
      this.heat = h('div.heat', { role: 'table', 'aria-label': 'Cohort retention' });
      cc.body.append(h('div.heat-w', this.heat));
      host.append(fc.el, sum.el, cc.el);
    },

    update() {
      const f = S.filters(), rg = S.range(), cg = S.cmp(), seg = st.v.funnel.seg;
      U.$$('button', this.seg).forEach((b) => { const on = b.getAttribute('data-v') === seg; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      const fn = (this.fn = A.funnel(f, seg, rg, cg));
      this.rows.classList.toggle('off', !fn.enabled);
      if (!fn.enabled) {
        this.sumBody.replaceChildren(V.empty('funnel', 'No digital channels selected', 'The funnel needs Web, Mobile App or Marketplace traffic. Adjust the Channel filter.'));
        this.segTbl.replaceChildren();
        this.renderCohorts();
        return;
      }
      const target = fn.stages.map((s) => W(s.ofVisits));
      const from = this.widths || [0, 0, 0, 0, 0];
      if (this.anim) this.anim.cancel();
      const drawWidths = (w) => {
        this.shapes.forEach((sh, i) => {
          const a = w[i], b = i < 4 ? w[i + 1] : w[i] * 0.78;
          sh.poly.setAttribute('points', (50 - a / 2) + ',0 ' + (50 + a / 2) + ',0 ' + (50 + b / 2) + ',64 ' + (50 - b / 2) + ',64');
          sh.poly.setAttribute('class', 'fs' + i);
        });
      };
      this.anim = U.tween(900, U.ease.outQuart, (e) => { this.widths = target.map((t, i) => from[i] + (t - from[i]) * e); drawWidths(this.widths); });

      fn.stages.forEach((s, i) => {
        const sh = this.shapes[i];
        U.clear(sh.l); U.clear(sh.r);
        sh.l.append(h('span.micro', s.name), h('b.num', U.int(s.value)));
        sh.r.append(h('b.num', i === 0 ? '100%' : U.pct(s.ofVisits, s.ofVisits < 0.1 ? 2 : 1)), h('span', i === 0 ? 'of visits' : i === 4 ? 'conversion rate' : 'of visits'));
        if (sh.drop) {
          const n = fn.stages[i + 1], drop = 1 - n.step, leak = i > 0 && drop === Math.max(...fn.stages.slice(2).map((q) => 1 - q.step));
          U.clear(sh.drop);
          const dstep = n.prevStep != null ? (n.step - n.prevStep) * 100 : null;
          sh.drop.className = 'fdrop' + (leak ? ' leak' : '');
          sh.drop.append(h('span.dchip', UI.ic('arrowDown', 11), U.pct(drop, 1)), h('span.dtxt', h('b', U.pct(drop, 0)), ' ' + DROP_COPY[i]), dstep != null ? h('span.dcmp', V.delta(dstep, { kind: 'pts', d: 1, invert: false }), h('i', 'step rate vs comparison')) : '', leak ? h('span.leak-b', 'Biggest leak') : '');
        }
      });

      /* headline */
      const conv = fn.conv, pc = fn.prevConv;
      U.clear(this.sumBody);
      this.sumBody.append(
        h('div.fs-main', h('p.micro', 'Conversion rate'), h('div.bigrow', h('div.big.num', { id: 'fn-conv' }), pc != null ? V.delta((conv - pc) * 100, { kind: 'pts', d: 2 }) : null)),
        h('div.fs-g', [['Cart abandonment', U.pct(fn.abandon, 1)], ['Checkout to purchase', U.pct(fn.stages[4].step, 1)], ['Visits', U.compact(fn.stages[0].value)], ['Orders', U.int(fn.stages[4].value)]].map((r) => h('div', h('dt', r[0]), h('dd.num', r[1])))));
      U.countTo(this.sumBody.querySelector('#fn-conv'), conv * 100, (x) => x.toFixed(2) + '%', 900);

      /* segment comparison bars */
      const all = A.FUNNEL_SEGS.slice(1).map((s) => ({ s, fn: A.funnel(f, s.key, rg, cg) })).filter((x) => x.fn.enabled && x.fn.stages[0].value > 0);
      const mx = Math.max(...all.map((x) => x.fn.conv), 1e-9);
      U.clear(this.segTbl);
      all.forEach((x) => this.segTbl.append(h('button.segr' + (x.s.key === seg ? '.on' : ''), { onclick: () => S.setV('funnel', { seg: x.s.key }) }, h('span', x.s.name), h('span.sbar', h('i', { style: { width: (x.fn.conv / mx) * 100 + '%' } })), h('b.num', U.pct(x.fn.conv, 2)))));
      this.renderCohorts();
    },

    renderCohorts() {
      const co = (this.co = A.cohorts(S.filters()));
      U.clear(this.heat);
      const head = h('div.hrow.hh', h('span.hc', 'Cohort'), h('span.hs', 'Customers'));
      for (let k = 0; k < 12; k++) head.appendChild(h('span.hm', 'M' + k));
      this.heat.appendChild(head);
      const cellColor = (v, k) => {
        if (k === 0) return ['color-mix(in srgb, var(--heat1) 20%, var(--heat0))', 'var(--ink)'];
        const t = Math.min(1, v / 0.3);
        return ['color-mix(in srgb, var(--heat1) ' + Math.round(8 + t * 84) + '%, var(--heat0))', t > 0.5 ? 'var(--accent-ink)' : 'var(--ink)'];
      };
      co.rows.forEach((r, ri) => {
        const row = h('div.hrow', { role: 'row', style: { '--i': ri } }, h('span.hc', r.label), h('span.hs.num', U.int(r.size)));
        for (let k = 0; k < 12; k++) {
          if (k < r.vals.length) {
            const [bg, fg] = cellColor(r.vals[k], k);
            row.appendChild(h('span.hm.cell.num', { role: 'cell', tabindex: '-1', style: { background: bg, color: fg }, onmouseenter: (e) => this.cellTip(r, k, e), onmousemove: (e) => this.cellTip(r, k, e), onmouseleave: () => UI.tip.hide() }, k === 0 ? '100%' : Math.round(r.vals[k] * 100) + '%'));
          } else row.appendChild(h('span.hm.void'));
        }
        this.heat.appendChild(row);
      });
      const avg = h('div.hrow.ha', h('span.hc', 'Average'), h('span.hs'));
      co.avg.forEach((v, k) => avg.appendChild(h('span.hm.num', v == null ? '' : k === 0 ? '100%' : Math.round(v * 100) + '%')));
      this.heat.appendChild(avg);
    },
    cellTip(r, k, e) {
      const v = r.vals[k];
      UI.tip.show('<div class="tt-h">' + U.esc(r.long) + ' cohort</div><div class="tt-r"><span class="tt-n">Months since first purchase</span><b>M' + k + '</b></div><div class="tt-r"><span class="tt-n">Retained</span><b>' + (v * 100).toFixed(1) + '%</b></div><div class="tt-r"><span class="tt-n">Customers</span><b>' + U.int(v * r.size) + ' of ' + U.int(r.size) + '</b></div>', e.clientX, e.clientY);
    },

    csv() {
      const rows = [['cohort', 'customers'].concat(Array.from({ length: 12 }, (_, k) => 'M' + k))];
      this.co.rows.forEach((r) => rows.push([r.long, r.size].concat(Array.from({ length: 12 }, (_, k) => (k < r.vals.length ? (r.vals[k] * 100).toFixed(1) + '%' : '')))));
      rows.push([]); rows.push(['funnel_stage', 'value', 'pct_of_visits']);
      if (this.fn && this.fn.enabled) this.fn.stages.forEach((s) => rows.push([s.name, Math.round(s.value), (s.ofVisits * 100).toFixed(2) + '%']));
      return rows;
    },
    destroy() { if (this.anim) this.anim.cancel(); UI.tip.hide(); },
  };
  M.views.funnel = view;
})((window.M = window.M || {}));
