/* MERIDIAN - Live Orders: simulated real-time feed (an order every 1-3 s), orders-per-minute ticker, revenue today, big-order toasts. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D, S = M.S, V = M.V, UI = M.UI, h = U.h, st = S.st;
  const FIRST = ['Ines', 'Marcus', 'Yuki', 'Amara', 'Tobias', 'Lucia', 'Oskar', 'Priya', 'Mateo', 'Freya', 'Kenji', 'Noor', 'Elias', 'Sofia', 'Dmitri', 'Hana', 'Rafael', 'Wren', 'Anselm', 'Leila', 'Callum', 'Mei', 'Jonas', 'Thea', 'Arjun', 'Isla', 'Felix', 'Zara', 'Hugo', 'Nadia'];
  const LAST = 'ABCDEFGHJKLMNPRSTVWZ'.split('');
  const HOUR_W = [0.3, 0.2, 0.15, 0.15, 0.2, 0.3, 0.5, 0.8, 1.1, 1.3, 1.4, 1.4, 1.3, 1.3, 1.3, 1.3, 1.4, 1.5, 1.7, 1.9, 1.9, 1.6, 1.1, 0.6];
  const HOUR_TOT = HOUR_W.reduce((a, b) => a + b, 0);
  const cdf = (sec) => { const hr = sec / 3600; let a = 0; for (let i = 0; i < 24; i++) { if (hr >= i + 1) a += HOUR_W[i]; else if (hr > i) a += HOUR_W[i] * (hr - i); } return a / HOUR_TOT; };
  const BIG = 2500;
  const clock = (s) => { const x = Math.floor(s); return String(Math.floor(x / 3600) % 24).padStart(2, '0') + ':' + String(Math.floor(x / 60) % 60).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };

  /** Streaming area chart for orders per minute (last 3 minutes, one point per second). */
  class Ticker {
    constructor(host) {
      this.host = host; this.vals = [];
      this.svg = h('svg.tk-svg', { 'aria-label': 'Orders per minute, last three minutes', role: 'img' });
      this.dot = h('i.tk-dot');
      host.append(this.svg, this.dot);
      this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(host);
    }
    push(v) { this.vals.push(v); if (this.vals.length > 180) this.vals.shift(); this.draw(); }
    draw() {
      const W = this.host.clientWidth, H = 150, v = this.vals;
      if (!W || v.length < 2) return;
      const m = { l: 34, r: 10, t: 10, b: 22 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
      const tk = U.niceTicks(Math.max(0, Math.min(...v) - 6), Math.max(...v) + 4, 4);
      const off = 179 - (v.length - 1);
      const X = (i) => m.l + ((i + off) / 179) * iw, Y = (x) => m.t + ih * (1 - (x - tk.min) / (tk.max - tk.min));
      const px = v.map((_, i) => X(i)), py = v.map(Y);
      const ln = U.monotone(px, py);
      let g = '';
      tk.ticks.forEach((t) => { g += '<line class="gl" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/><text x="' + (m.l - 8) + '" y="' + (Y(t) + 3.5).toFixed(1) + '" text-anchor="end">' + t + '</text>'; });
      [['-3m', 0], ['-2m', 60], ['-1m', 120], ['now', 179]].forEach((l) => { g += '<text x="' + (m.l + (l[1] / 179) * iw).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="' + (l[1] === 0 ? 'start' : l[1] === 179 ? 'end' : 'middle') + '">' + l[0] + '</text>'; });
      this.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); this.svg.setAttribute('width', W); this.svg.setAttribute('height', H);
      this.svg.innerHTML = '<defs><linearGradient id="tkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--c3);stop-opacity:.32"/><stop offset="1" style="stop-color:var(--c3);stop-opacity:0"/></linearGradient></defs><g class="tc-grid">' + g + '</g><path d="' + ln + 'L' + px[px.length - 1].toFixed(1) + ',' + (m.t + ih) + 'L' + px[0].toFixed(1) + ',' + (m.t + ih) + 'Z" fill="url(#tkg)"/><path class="tk-l" d="' + ln + '"/>';
      this.dot.style.left = px[px.length - 1] + 'px'; this.dot.style.top = py[py.length - 1] + 'px';
    }
    destroy() { this.ro.disconnect(); }
  }

  const view = {
    mount(host) {
      this.host = host;
      host.classList.add('g-live');
      this.rng = U.rng(1618033);
      this.feed = []; this.n = 0; this.paused = false; this.bigDone = false; this.session = { rev: 0, orders: 0, ch: new Float64Array(5), sku: new Float64Array(D.SKUS.length) };
      this.simSec = 13 * 3600 + 5 * 60 + 12; this.stamps = [];

      this.revEl = h('div.lv-rev.num'); this.revDelta = h('span.lv-plus');
      this.ordEl = h('b.num'); this.aovEl = h('b.num'); this.opmEl = h('b.num'); this.clockEl = h('span.lv-clock.num');
      this.pauseBtn = h('button.pbtn', { onclick: () => this.setPaused(!this.paused) });
      const hero = V.card({ title: 'Revenue today', cls: 'lv-hero', actions: [h('span.livepill', h('i.livedot'), 'Live'), this.clockEl, this.pauseBtn] });
      this.tickerHost = h('div.ticker');
      hero.body.append(h('div.lv-top', h('div', this.revEl, this.revDelta), h('div.lv-stats', h('div', h('span.micro', 'Orders today'), this.ordEl), h('div', h('span.micro', 'AOV today'), this.aovEl), h('div', h('span.micro', 'Orders / min'), this.opmEl))), h('p.micro.tk-h', 'Orders per minute, rolling'), this.tickerHost);
      this.ticker = new Ticker(this.tickerHost);

      const mix = V.card({ title: 'Channel mix today', sub: 'Baseline plus everything landing now', cls: 'lv-mix' });
      this.mixEl = h('div.lv-mixl'); mix.body.append(this.mixEl);
      const top = V.card({ title: 'Top products today', cls: 'lv-top5' });
      this.topEl = h('ol.lv-topl'); top.body.append(this.topEl);

      const feedCard = V.card({ title: 'Order feed', sub: 'New orders, newest first', cls: 'lv-feed', bodyCls: 'feed-b' });
      this.list = h('ul.feed', { 'aria-live': 'off', 'aria-label': 'Live orders' });
      this.paused_note = h('div.feed-p', UI.ic('pause', 14), 'Feed paused');
      feedCard.body.append(this.paused_note, this.list);
      host.append(hero.el, feedCard.el, mix.el, top.el);
      this.setPaused(false, true);
    },

    /** Re-derive baselines + allowed dimension sets from the current filters. */
    update() {
      const f = S.filters(), t = V.totals(), last = D.ASOF;
      const days = 7, a = last - days + 1;
      const avgRev = U.sum(t.rev, a, last) / days, avgOrd = U.sum(t.ord, a, last) / days;
      const frac = cdf(this.simSec);
      this.base = { rev: avgRev * frac * 1.04, ord: avgOrd * frac * 1.04, day: avgRev * 1.04 };
      this.allowed = { ch: f.channel.length ? f.channel : [0, 1, 2, 3, 4], rg: f.region.length ? f.region : [0, 1, 2, 3], ct: f.category.length ? f.category : [0, 1, 2, 3, 4, 5] };
      const bd = D.byDim(f, 'channel');
      this.chBase = new Float64Array(5); bd.idx.forEach((ix, j) => { this.chBase[ix] = U.sum(bd.m[j][0], a, last) / days * frac * 1.04; });
      const sd = D.skuDaily(f); this.skuBase = D.SKUS.map((s) => { let x = 0; for (let d = a; d <= last; d++) x += sd.rev[s.i * D.N + d]; return (x / days) * frac * 1.04; });
      this.chW = this.allowed.ch.map((c) => [0.36, 0.22, 0.24, 0.05, 0.13][c]);
      this.skuPool = D.SKUS.filter((s) => this.allowed.ct.includes(s.cat));
      this.skuW = this.skuPool.map((s) => s.w);
      if (!this.ticker.vals.length) this.seedHistory();
      this.renderStats(true);
      if (!this.feed.length) { for (let i = 0; i < 9; i++) this.makeOrder(true); this.renderFeedAll(); }
    },

    seedHistory() {
      // warm the ticker with three minutes of plausible arrivals so the chart is alive on first paint
      const stamps = []; let t = this.simSec - 180;
      while (t < this.simSec) { t += 1 + this.rng() * 2; stamps.push(t); }
      this.stamps = stamps.slice();
      for (let s = 0; s < 180; s++) { const now = this.simSec - 179 + s; this.ticker.vals.push(this.stamps.filter((x) => x > now - 60 && x <= now).length); }
      this.ticker.draw();
    },

    pickW(arr, w) { let tot = 0; w.forEach((x) => { tot += x; }); let r = this.rng() * tot; for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; },

    makeOrder(silent) {
      const r = this.rng, ch = this.pickW(this.allowed.ch, this.chW), reg = this.allowed.rg[Math.floor(r() * this.allowed.rg.length)];
      const nLines = ch === 3 ? 1 + Math.floor(r() * 3) : r() < 0.78 ? 1 : 2;
      const lines = []; let amount = 0;
      if (!silent) this.liveN = (this.liveN || 0) + 1;
      const forceBig = !this.bigDone && this.liveN === 4 && !silent;
      for (let i = 0; i < nLines; i++) {
        const sku = forceBig && i === 0 ? D.SKUS.find((s) => s.name === 'Atlas Modular Sofa') : this.pickW(this.skuPool, this.skuW);
        const qty = ch === 3 ? 4 + Math.floor(r() * 18) : forceBig ? 1 : r() < 0.78 ? 1 : 2;
        const price = sku.price * [1, 0.98, 0.88, 0.62, 1.04][ch];
        lines.push({ sku, qty }); amount += price * qty * (forceBig ? 1.08 : 1);
        this.session.sku[sku.i] += price * qty;
      }
      if (forceBig) this.bigDone = true;
      const id = 'AC-' + (204810 + this.n++);
      const fn = FIRST[Math.floor(r() * FIRST.length)], ln = LAST[Math.floor(r() * LAST.length)];
      const o = { id, t: this.simSec, name: fn + ' ' + ln + '.', init: fn[0] + ln, ch, reg, lines, amount: Math.round(amount), real: Date.now() };
      this.session.rev += o.amount; this.session.orders++; this.session.ch[ch] += o.amount;
      this.feed.unshift(o); if (this.feed.length > 60) this.feed.pop();
      return o;
    },

    rowEl(o, fresh) {
      const first = o.lines[0].sku, more = o.lines.length - 1;
      const col = M.color(U.hash(o.init) % 6);
      return h('li.fr' + (fresh ? '.new' : '') + (o.amount >= BIG ? '.big' : ''), { 'data-id': o.id },
        h('span.av', { style: { '--av': col } }, o.init),
        h('div.fr-m', h('b', o.name), h('span', (o.lines[0].qty > 1 ? o.lines[0].qty + '× ' : '') + first.name + (more ? ' +' + more + ' more' : ''))),
        h('div.fr-t', h('span.ctag', h('i.dot', { style: { background: M.color(o.ch) } }), D.CHANS[o.ch].name), h('span.rcode', D.REGIONS[o.reg].key)),
        h('div.fr-a', h('b.num', U.money(o.amount)), h('span.fr-age.num', { 'data-t': o.t }, fresh ? 'just now' : this.age(o.t))));
    },
    age(t) { const s = Math.max(0, Math.round(this.simSec - t)); return s < 4 ? 'just now' : s < 60 ? s + 's ago' : Math.floor(s / 60) + 'm ago'; },
    renderFeedAll() { U.clear(this.list); this.feed.slice(0, 40).forEach((o) => this.list.appendChild(this.rowEl(o, false))); },

    tickOrder() {
      if (this.paused) return;
      if (!this.allowed) { this.timer = setTimeout(() => this.tickOrder(), 300); return; }
      const o = this.makeOrder(false);
      const row = this.rowEl(o, true);
      setTimeout(() => row.classList.remove('new'), 1500);
      this.list.insertBefore(row, this.list.firstChild);
      while (this.list.children.length > 40) this.list.lastChild.remove();
      this.stamps.push(this.simSec);
      this.renderStats(false, o);
      if (o.amount >= BIG) UI.toast(U.money(o.amount) + ' · ' + D.CHANS[o.ch].name + ' · ' + D.REGIONS[o.reg].key + ' · ' + o.lines[0].sku.name + (o.lines.length > 1 ? ' +' + (o.lines.length - 1) : ''), { title: 'Big order from ' + o.name, icon: 'bolt', tone: 'big', ms: 5200 });
      this.timer = setTimeout(() => this.tickOrder(), 1000 + this.rng() * 2000);
    },

    renderStats(instant, order) {
      const rev = this.base.rev + this.session.rev, ord = this.base.ord + this.session.orders;
      U.countTo(this.revEl, rev, U.money, instant ? 0 : 520);
      if (order) { this.revDelta.textContent = '+' + U.money(order.amount); this.revDelta.classList.remove('pop'); void this.revDelta.offsetWidth; this.revDelta.classList.add('pop'); }
      this.ordEl.textContent = U.int(ord); this.aovEl.textContent = U.money(ord ? rev / ord : 0);
      const opm = this.stamps.filter((x) => x > this.simSec - 60).length;
      this.opmEl.textContent = String(opm);
      /* channel mix */
      const tot = rev || 1, chv = this.allowed.ch.map((c) => ({ c, v: this.chBase[c] + this.session.ch[c] })).sort((a, b) => b.v - a.v);
      U.clear(this.mixEl);
      chv.forEach((x) => this.mixEl.append(h('div.mx', h('span', h('i.dot', { style: { background: M.color(x.c) } }), D.CHANS[x.c].name), h('span.sbar', h('i', { style: { width: (x.v / chv[0].v) * 100 + '%', background: M.color(x.c) } })), h('b.num', U.moneyC(x.v)), h('em.num', Math.round((x.v / tot) * 100) + '%'))));
      /* top products */
      const tp = this.skuPool.map((s) => ({ s, v: this.skuBase[s.i] + this.session.sku[s.i] })).sort((a, b) => b.v - a.v).slice(0, 5);
      U.clear(this.topEl);
      tp.forEach((x, i) => this.topEl.append(h('li', h('span.rk.num', String(i + 1)), h('span.tn', h('i.dot', { style: { background: M.color(x.s.cat) } }), x.s.name), h('b.num', U.moneyC(x.v)))));
    },

    setPaused(p, silent) {
      this.paused = p;
      clearTimeout(this.timer); clearInterval(this.clk);
      this.host.classList.toggle('paused', p);
      U.clear(this.pauseBtn); this.pauseBtn.append(UI.ic(p ? 'play' : 'pause', 14), p ? 'Resume' : 'Pause'); this.pauseBtn.setAttribute('aria-pressed', String(p));
      this.clockEl.textContent = 'Today · ' + clock(this.simSec);
      if (p) return;
      this.clk = setInterval(() => {
        this.simSec += 1;
        this.clockEl.textContent = 'Today · ' + clock(this.simSec);
        this.stamps = this.stamps.filter((x) => x > this.simSec - 200);
        this.ticker.push(this.stamps.filter((x) => x > this.simSec - 60).length);
        this.opmEl.textContent = String(this.stamps.filter((x) => x > this.simSec - 60).length);
        U.$$('.fr-age', this.list).slice(0, 14).forEach((n) => { n.textContent = this.age(+n.getAttribute('data-t')); });
      }, 1000);
      this.timer = setTimeout(() => this.tickOrder(), silent ? 900 : 600);
    },

    visibility(on) { if (!on) { if (!this.paused) { this.auto = true; this.setPaused(true); } } else if (this.auto) { this.auto = false; this.setPaused(false); } },

    csv() {
      const rows = [['sim_time', 'order_id', 'customer', 'channel', 'region', 'lines', 'amount']];
      this.feed.forEach((o) => rows.push([clock(o.t), o.id, o.name, D.CHANS[o.ch].name, D.REGIONS[o.reg].key, o.lines.map((l) => l.qty + 'x ' + l.sku.name).join('; '), o.amount]));
      return rows;
    },
    destroy() { clearTimeout(this.timer); clearInterval(this.clk); this.ticker.destroy(); },
  };
  M.views.live = view;
})((window.M = window.M || {}));
