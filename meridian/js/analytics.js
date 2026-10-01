/* MERIDIAN - analytics layer: buckets, anomaly detection, auto-written insights, pacing, geography, funnel, cohorts. */
(function (M) {
  'use strict';
  const U = M.U, D = M.D, S = M.S;
  const A = (M.A = {});
  const N = D.N;
  const MEAS = D.M;

  /* ---------- time buckets ---------- */
  A.autoGran = (n) => (n <= 62 ? 'day' : n <= 400 ? 'week' : 'month');
  /** Split [i0,i1] into day/week/month buckets: [{a,b,label,long,t,major}] */
  A.buckets = function (i0, i1, gran) {
    const out = [];
    const key = (d) => {
      if (gran === 'day') return d;
      if (gran === 'week') return Math.floor(d / 7);
      const dt = new Date(D.ms(d)); return dt.getUTCFullYear() * 12 + dt.getUTCMonth();
    };
    let a = i0;
    for (let d = i0 + 1; d <= i1 + 1; d++) {
      if (d > i1 || key(d) !== key(a)) {
        const t = D.ms(a), dt = new Date(t);
        let label, long, major = false;
        if (gran === 'day') { label = U.dstr(t, 'md'); long = U.dstr(t, 'long'); major = dt.getUTCDate() === 1; }
        else if (gran === 'week') { label = U.dstr(t, 'md'); long = 'Week of ' + U.dstr(t, 'md') + (b(a, d - 1) === 7 ? '' : ' (partial)'); major = dt.getUTCDate() <= 7; }
        else { label = dt.getUTCMonth() === 0 || a === i0 ? U.MON[dt.getUTCMonth()] + " '" + String(dt.getUTCFullYear()).slice(2) : U.MON[dt.getUTCMonth()]; long = U.MONL[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear(); major = dt.getUTCMonth() === 0; }
        out.push({ a, b: d - 1, t, label, long, major });
        a = d;
      }
    }
    function b(x, y) { return y - x + 1; }
    return out;
  };
  A.bucketSum = (arr, bk) => bk.map((x) => { let s = 0; for (let i = x.a; i <= x.b; i++) s += arr[i]; return s; });
  /** Bucketed ratio series (num/den) e.g. AOV. */
  A.bucketRatio = (num, den, bk, scale = 1) => bk.map((x) => { let n = 0, d = 0; for (let i = x.a; i <= x.b; i++) { n += num[i]; d += den[i]; } return d ? (n / d) * scale : 0; });

  /* ---------- events ---------- */
  A.eventAt = (d) => D.EVENTS.find((e) => d >= e.i0 && d <= e.i1) || null;

  /* ---------- anomaly detection ---------- */
  /** Robust day-level detector: compare each day to the median of the same weekday +/-3 weeks, then scale by the MAD. */
  A.anomalies = function (f) {
    const key = 'an' + D.fkey(f);
    if (A._cache[key]) return A._cache[key];
    const rev = D.totals(f).rev;
    const exp = new Float64Array(N), res = new Float64Array(N);
    for (let d = 0; d < N; d++) {
      const nb = [];
      for (const k of [-21, -14, -7, 7, 14, 21]) { const j = d + k; if (j >= 0 && j < N) nb.push(rev[j]); }
      exp[d] = nb.length >= 3 ? U.median(nb) : rev[d];
      res[d] = exp[d] > 0 ? (rev[d] - exp[d]) / exp[d] : 0;
    }
    const med = U.median(Array.from(res));
    const mad = U.median(Array.from(res, (v) => Math.abs(v - med)));
    const sigma = Math.max(0.02, 1.4826 * mad);
    const cand = [];
    for (let d = 0; d < N; d++) { const z = (res[d] - med) / sigma; if (Math.abs(res[d]) > 0.11 && Math.abs(z) > 3.4) cand.push({ d, z, res: res[d] }); }
    cand.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const kept = [];
    for (const c of cand) if (!kept.some((k) => Math.abs(k.d - c.d) <= 3)) kept.push(c);
    kept.sort((a, b) => a.d - b.d);
    const dims = ['category', 'channel', 'region'].map((dim) => D.byDim(f, dim));
    const out = kept.map((c) => {
      const ev = A.eventAt(c.d);
      const attr = dims.map((bd, n) => {
        let tot = 0; const ex = bd.idx.map((_, j) => {
          const arr = bd.m[j][MEAS.REV], nb = [];
          for (const k of [-21, -14, -7, 7, 14, 21]) { const q = c.d + k; if (q >= 0 && q < N) nb.push(arr[q]); }
          const e = arr[c.d] - U.median(nb); tot += e; return e;
        });
        let best = 0; ex.forEach((e, j) => { if (Math.abs(e) > Math.abs(ex[best])) best = j; });
        return { dim: ['category', 'channel', 'region'][n], idx: bd.idx[best], delta: ex[best], share: tot ? U.clamp(ex[best] / tot, 0, 1) : 0 };
      });
      return { d: c.d, z: c.z, res: c.res, val: rev[c.d], exp: exp[c.d], sign: c.res >= 0 ? 1 : -1, kind: ev ? 'promo' : 'anomaly', event: ev, attr };
    });
    A._cache[key] = out;
    return out;
  };
  A._cache = {};

  /* ---------- pacing ---------- */
  const QS = (() => { const d = new Date(D.ms(D.ASOF)); return D.dayOf(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 1, 1); })();
  const QDAYS = 92;
  A.quarter = { start: QS, days: QDAYS, elapsed: D.ASOF - QS + 1, remain: QDAYS - (D.ASOF - QS + 1), label: 'Q' + (Math.floor(new Date(D.ms(D.ASOF)).getUTCMonth() / 3) + 1) + ' ' + new Date(D.ms(D.ASOF)).getUTCFullYear() };
  function runRate(rev) { return U.sum(rev, D.ASOF - 27, D.ASOF) / 28; }
  const company = (() => {
    const t = D.totals(D.emptyFilters());
    const qtd = U.sum(t.rev, QS, D.ASOF), proj = qtd + A.quarter.remain * runRate(t.rev);
    return { t12: U.sum(t.rev, N - 365, N - 1), target: Math.round(proj / 0.955 / 10000) * 10000 };
  })();
  A.pacing = function (f) {
    const t = D.totals(f);
    const qtd = U.sum(t.rev, QS, D.ASOF), rr = runRate(t.rev), q = A.quarter;
    const proj = qtd + q.remain * rr;
    const target = company.target * (U.sum(t.rev, N - 365, N - 1) / company.t12);
    const need = q.remain ? Math.max(0, (target - qtd) / q.remain) : 0;
    return { qtd, proj, target, pct: target ? proj / target : 0, qtdPct: target ? qtd / target : 0, rr, need, gap: proj - target, q };
  };

  /* ---------- insights ---------- */
  const fm = U.moneyC;
  const dimName = (dim, i) => D.DIMS[dim][i].name;
  const b = (s) => '<b>' + U.esc(s) + '</b>';
  A.insights = function (f, rg, cg) {
    const t = D.totals(f);
    const cur = D.kpis(t, rg.i0, rg.i1), prev = cg ? D.kpis(t, cg.i0, cg.i1) : null;
    const out = [];
    const dimDeltas = (dim) => {
      const bd = D.byDim(f, dim);
      return bd.idx.map((ix, j) => ({ ix, cur: U.sum(bd.m[j][0], rg.i0, rg.i1), prev: cg ? U.sum(bd.m[j][0], cg.i0, cg.i1) : 0, bd: bd.m[j] }));
    };
    const cats = dimDeltas('category'), regs = dimDeltas('region'), chs = dimDeltas('channel');

    /* 1. headline + driver */
    if (prev && prev.rev > 0) {
      const ch = cur.rev / prev.rev - 1, diff = cur.rev - prev.rev, up = diff >= 0;
      const sorted = cats.map((c) => ({ ...c, d: c.cur - c.prev })).sort((a, z) => (up ? z.d - a.d : a.d - z.d));
      const top = sorted[0], drag = sorted.slice().reverse()[0];
      const topR = regs.map((c) => ({ ...c, d: c.cur - c.prev })).sort((a, z) => (up ? z.d - a.d : a.d - z.d))[0];
      const topC = chs.map((c) => ({ ...c, d: c.cur - c.prev })).sort((a, z) => (up ? z.d - a.d : a.d - z.d))[0];
      let body = 'Net revenue reached ' + b(fm(cur.rev)) + ', ' + fm(Math.abs(diff)) + (up ? ' more' : ' less') + ' than ' + (cg.label.replace('vs ', '')) + '. ';
      if (Math.abs(top.d) > 0) body += b(dimName('category', top.ix)) + ' was the biggest ' + (up ? 'driver' : 'drag') + ' (' + (top.d >= 0 ? '+' : '−') + fm(Math.abs(top.d)) + ', ' + Math.round(Math.abs(top.d / diff) * 100) + '% of the change)';
      if (drag && drag.ix !== top.ix && (up ? drag.d < 0 : drag.d > 0)) body += ', while ' + b(dimName('category', drag.ix)) + ' ' + (up ? 'gave back ' : 'added ') + fm(Math.abs(drag.d));
      body += '. By region ' + b(dimName('region', topR.ix)) + ' moved most (' + (topR.d >= 0 ? '+' : '−') + fm(Math.abs(topR.d)) + '); by channel, ' + b(dimName('channel', topC.ix)) + '.';
      out.push({ id: 'headline', tone: up ? 'pos' : 'neg', icon: up ? 'trendUp' : 'trendDown', title: 'Revenue is ' + (up ? 'up ' : 'down ') + Math.abs(ch * 100).toFixed(1) + '% ' + cg.label, body });
    } else {
      const peak = (() => { let bi = rg.i0; for (let i = rg.i0; i <= rg.i1; i++) if (t.rev[i] > t.rev[bi]) bi = i; return bi; })();
      out.push({ id: 'headline', tone: 'info', icon: 'sparkle', title: 'Revenue totals ' + fm(cur.rev) + ' across ' + rg.n + ' days', body: 'That is ' + b(fm(cur.rev / rg.n)) + ' per day on average. The strongest day was ' + b(U.dstr(D.ms(peak), 'md')) + ' at ' + fm(t.rev[peak]) + '. Turn on comparison to see what changed.' });
    }

    /* 2. anomalies in range */
    const an = A.anomalies(f).filter((a) => a.d >= rg.i0 && a.d <= rg.i1).sort((a, z) => Math.abs(z.z) - Math.abs(a.z));
    an.filter((a) => a.kind === 'anomaly').slice(0, 2).forEach((a) => {
      const c = a.attr[0], h = a.attr[1], r = a.attr[2], up = a.sign > 0;
      const body = b(dimName('category', c.idx)) + ' accounts for ' + Math.round(c.share * 100) + '% of the ' + (up ? 'excess' : 'shortfall') + ' (' + (c.delta >= 0 ? '+' : '−') + fm(Math.abs(c.delta)) + '), concentrated in ' + b(dimName('channel', h.idx)) + ' and ' + b(dimName('region', r.idx)) + '. ' + (up ? 'Worth checking for a campaign, press or creator mention to repeat.' : 'Worth checking stock availability and fulfilment for this category.');
      out.push({ id: 'an' + a.d, tone: up ? 'pos' : 'neg', icon: up ? 'bolt' : 'alert', d: a.d, title: 'Revenue ' + (up ? 'spiked ' : 'fell ') + Math.abs(a.res * 100).toFixed(0) + '% ' + (up ? 'above' : 'below') + ' expectation on ' + U.dstr(D.ms(a.d), 'md'), body });
    });
    const pr = an.filter((a) => a.kind === 'promo')[0];
    if (pr) out.push({ id: 'an' + pr.d, tone: 'info', icon: 'tag', d: pr.d, title: pr.event.name + ' lifted revenue ' + Math.abs(pr.res * 100).toFixed(0) + '% over baseline', body: 'On ' + b(U.dstr(D.ms(pr.d), 'md')) + ' revenue hit ' + b(fm(pr.val)) + ' against an expected ' + fm(pr.exp) + '. Promo periods are annotated on the chart.' });

    /* 3. best / worst category */
    if (prev) {
      const g = cats.filter((c) => c.prev > 0).map((c) => ({ ix: c.ix, g: c.cur / c.prev - 1, cur: c.cur })).sort((a, z) => z.g - a.g);
      if (g.length > 1) {
        const hi = g[0], lo = g[g.length - 1];
        out.push({ id: 'cats', tone: lo.g < 0 ? 'warn' : 'info', icon: 'layers', title: dimName('category', hi.ix) + ' leads category growth', body: b(dimName('category', hi.ix)) + ' grew ' + b(U.signedPct(hi.g)) + ' to ' + fm(hi.cur) + '. ' + b(dimName('category', lo.ix)) + ' trails at ' + b(U.signedPct(lo.g)) + (lo.g < 0 ? ' and is the category to watch.' : ', still growing but slowest.') });
      }
    } else {
      const sorted = cats.slice().sort((a, z) => z.cur - a.cur);
      out.push({ id: 'cats', tone: 'info', icon: 'layers', title: dimName('category', sorted[0].ix) + ' is the largest category', body: b(dimName('category', sorted[0].ix)) + ' contributed ' + b(Math.round((sorted[0].cur / cur.rev) * 100) + '%') + ' of revenue (' + fm(sorted[0].cur) + '); ' + b(dimName('category', sorted[sorted.length - 1].ix)) + ' was the smallest.' });
    }

    /* 4. quarter pacing */
    const pc = A.pacing(f);
    const pct = pc.pct * 100;
    out.push({ id: 'pacing', tone: pct < 98 ? 'warn' : pct > 102 ? 'pos' : 'info', icon: 'target', title: pct < 98 ? pc.q.label + ' is pacing below target' : pc.q.label + ' is pacing to target', body: 'At the current run-rate of ' + b(fm(pc.rr) + '/day') + ', ' + pc.q.label + ' lands at ' + b(fm(pc.proj)) + ', ' + b(pct.toFixed(1) + '%') + ' of the ' + fm(pc.target) + ' target' + (pc.gap < 0 ? ' (' + fm(-pc.gap) + ' short). Closing the gap needs ' + b(fm(pc.need) + '/day') + ' over the remaining ' + pc.q.remain + ' days.' : '. You are ' + fm(pc.gap) + ' ahead.') });

    /* 5. margin decomposition (channel mix vs rate) */
    if (prev) {
      const dm = (cur.margin - prev.margin) * 100;
      let mix = 0, rate = 0;
      chs.forEach((c) => {
        const cc = c.bd, sc = U.sum(cc[0], rg.i0, rg.i1), sp = U.sum(cc[0], cg.i0, cg.i1);
        const mc = sc ? 1 - U.sum(cc[3], rg.i0, rg.i1) / sc : 0, mp = sp ? 1 - U.sum(cc[3], cg.i0, cg.i1) / sp : 0;
        mix += (sc / cur.rev - sp / prev.rev) * mp; rate += (sc / cur.rev) * (mc - mp);
      });
      out.push({ id: 'margin', tone: dm < -0.3 ? 'warn' : dm > 0.3 ? 'pos' : 'info', icon: 'info', title: 'Gross margin ' + (Math.abs(dm) < 0.05 ? 'is flat' : dm > 0 ? 'improved ' + dm.toFixed(1) + ' pts' : 'slipped ' + Math.abs(dm).toFixed(1) + ' pts'), body: 'Margin is ' + b((cur.margin * 100).toFixed(1) + '%') + '. Channel mix explains ' + b(U.signed(mix * 100, 1, ' pt')) + ' and pricing, promo depth and cost the remaining ' + b(U.signed(rate * 100, 1, ' pt')) + '. Conversion sits at ' + b(U.pct(cur.conv, 2)) + ' (' + U.signed((cur.conv - prev.conv) * 100, 2, ' pt') + ').' });
    }
    return out;
  };

  /* ---------- geography (US state tile grid of the North America region) ---------- */
  // code, name, population (M), wealth index, grid col, grid row, relative growth
  const ST = [
    ['AK', 'Alaska', 0.73, 0.9, 0, 0, 0], ['ME', 'Maine', 1.4, 0.95, 10, 0, 0], ['VT', 'Vermont', 0.65, 1.05, 9, 1, 0.01], ['NH', 'New Hampshire', 1.4, 1.15, 10, 1, 0],
    ['WA', 'Washington', 7.8, 1.25, 1, 2, 0.03], ['ID', 'Idaho', 2.0, 0.85, 2, 2, 0.07], ['MT', 'Montana', 1.1, 0.85, 3, 2, 0.04], ['ND', 'North Dakota', 0.8, 0.9, 4, 2, 0],
    ['MN', 'Minnesota', 5.7, 1.05, 5, 2, 0], ['IL', 'Illinois', 12.5, 1.0, 6, 2, -0.06], ['WI', 'Wisconsin', 5.9, 0.95, 7, 2, -0.01], ['MI', 'Michigan', 10.0, 0.9, 8, 2, -0.03],
    ['NY', 'New York', 19.6, 1.3, 9, 2, -0.05], ['RI', 'Rhode Island', 1.1, 1.1, 10, 2, 0], ['MA', 'Massachusetts', 7.0, 1.35, 11, 2, 0.01],
    ['OR', 'Oregon', 4.2, 1.05, 1, 3, 0.02], ['NV', 'Nevada', 3.2, 0.9, 2, 3, 0.05], ['WY', 'Wyoming', 0.58, 0.9, 3, 3, 0.02], ['SD', 'South Dakota', 0.9, 0.85, 4, 3, 0.01],
    ['IA', 'Iowa', 3.2, 0.9, 5, 3, -0.01], ['IN', 'Indiana', 6.9, 0.85, 6, 3, 0], ['OH', 'Ohio', 11.8, 0.9, 7, 3, -0.02], ['PA', 'Pennsylvania', 13.0, 1.0, 8, 3, -0.03],
    ['NJ', 'New Jersey', 9.3, 1.25, 9, 3, -0.01], ['CT', 'Connecticut', 3.6, 1.4, 10, 3, -0.02],
    ['CA', 'California', 39.0, 1.25, 1, 4, -0.04], ['UT', 'Utah', 3.4, 1.0, 2, 4, 0.1], ['CO', 'Colorado', 5.9, 1.2, 3, 4, 0.04], ['NE', 'Nebraska', 2.0, 0.9, 4, 4, 0.01],
    ['MO', 'Missouri', 6.2, 0.85, 5, 4, 0], ['KY', 'Kentucky', 4.5, 0.75, 6, 4, 0.01], ['WV', 'West Virginia', 1.8, 0.65, 7, 4, -0.02], ['VA', 'Virginia', 8.7, 1.15, 8, 4, 0.03],
    ['MD', 'Maryland', 6.2, 1.2, 9, 4, 0.01], ['DE', 'Delaware', 1.0, 1.05, 10, 4, 0.03],
    ['AZ', 'Arizona', 7.4, 1.0, 2, 5, 0.09], ['NM', 'New Mexico', 2.1, 0.75, 3, 5, 0.02], ['KS', 'Kansas', 2.9, 0.9, 4, 5, 0], ['AR', 'Arkansas', 3.1, 0.7, 5, 5, 0.02],
    ['TN', 'Tennessee', 7.1, 0.9, 6, 5, 0.08], ['NC', 'North Carolina', 10.8, 1.0, 7, 5, 0.07], ['SC', 'South Carolina', 5.4, 0.9, 8, 5, 0.07],
    ['OK', 'Oklahoma', 4.0, 0.8, 4, 6, 0.01], ['LA', 'Louisiana', 4.6, 0.75, 5, 6, -0.01], ['MS', 'Mississippi', 2.9, 0.6, 6, 6, 0], ['AL', 'Alabama', 5.1, 0.75, 7, 6, 0.02], ['GA', 'Georgia', 11.0, 1.0, 8, 6, 0.05],
    ['HI', 'Hawaii', 1.4, 1.15, 0, 7, 0.01], ['TX', 'Texas', 30.0, 1.0, 4, 7, 0.08], ['FL', 'Florida', 22.6, 1.0, 9, 7, 0.1],
  ];
  const SUNBELT = new Set(['TX', 'FL', 'AZ', 'CA', 'GA', 'NC', 'SC', 'NV', 'NM', 'HI', 'AL', 'LA']);
  const NORTH = new Set(['MA', 'NY', 'CT', 'VT', 'NH', 'ME', 'RI', 'MN', 'WI', 'MI', 'WA', 'OR']);
  const aff = U.rng(424242);
  const STATES = ST.map((s, i) => ({
    i, code: s[0], name: s[1], col: s[4], row: s[5], base: s[2] * s[3], g: s[6] + (aff() - 0.5) * 0.03,
    aff: D.CATS.map((c, k) => (0.78 + aff() * 0.44) * (c.key === 'outdoor' ? (SUNBELT.has(s[0]) ? 1.45 : 0.85) : 1) * (c.key === 'textiles' || c.key === 'lighting' ? (NORTH.has(s[0]) ? 1.2 : 0.95) : 1) * (c.key === 'furniture' && s[2] > 8 ? 1.12 : 1)),
  }));
  A.STATES = STATES;
  // W[k] = Float32Array(N*50): share of category-k North America revenue falling in each state on each day
  const W = D.CATS.map((_, k) => {
    const w = new Float32Array(N * STATES.length);
    for (let d = 0; d < N; d++) {
      let tot = 0;
      for (const s of STATES) { const v = s.base * s.aff[k] * Math.exp((s.g * (d - N / 2)) / 365); w[d * STATES.length + s.i] = v; tot += v; }
      for (let j = 0; j < STATES.length; j++) w[d * STATES.length + j] /= tot;
    }
    return w;
  });
  A.geo = function (f, rg, cg) {
    const enabled = !f.region.length || f.region.includes(0);
    const fN = { region: [0], category: f.category, channel: f.channel };
    const bd = D.byDim(fN, 'category'), n = STATES.length;
    const calc = (r) => {
      const rev = new Float64Array(n), byCat = STATES.map(() => new Float64Array(D.CATS.length));
      if (!r) return { rev, byCat };
      bd.idx.forEach((k, j) => {
        const arr = bd.m[j][0];
        for (let d = r.i0; d <= r.i1; d++) { const v = arr[d]; if (!v) continue; const o = d * n; for (let s = 0; s < n; s++) { const x = v * W[k][o + s]; rev[s] += x; byCat[s][k] += x; } }
      });
      return { rev, byCat };
    };
    const cur = calc(rg), prev = cg ? calc(cg) : null;
    const total = U.sum(cur.rev, 0, n - 1);
    const states = STATES.map((s) => {
      let top = 0; cur.byCat[s.i].forEach((v, k) => { if (v > cur.byCat[s.i][top]) top = k; });
      return { ...s, rev: cur.rev[s.i], prev: prev ? prev.rev[s.i] : null, growth: prev && prev.rev[s.i] > 0 ? cur.rev[s.i] / prev.rev[s.i] - 1 : null, share: total ? cur.rev[s.i] / total : 0, topCat: top };
    });
    return { enabled, states, total, prevTotal: prev ? U.sum(prev.rev, 0, n - 1) : null };
  };

  /* ---------- funnel ---------- */
  const DEV = { desktop: { vs: 0.47, cm: 1.32 }, mobile: { vs: 0.53, cm: 0.8 } };
  const SEG = {
    desktop: { name: 'Desktop web', atc: 0.145, co: 0.58, pay: 0.66 },
    mobile: { name: 'Mobile web', atc: 0.11, co: 0.5, pay: 0.55 },
    app: { name: 'Mobile app', atc: 0.17, co: 0.62, pay: 0.7 },
    market: { name: 'Marketplace', atc: 0.085, co: 0.66, pay: 0.72 },
  };
  A.FUNNEL_SEGS = [{ key: 'all', name: 'All digital' }, { key: 'desktop', name: 'Desktop web' }, { key: 'mobile', name: 'Mobile web' }, { key: 'app', name: 'Mobile app' }, { key: 'market', name: 'Marketplace' }];
  const STAGES = ['Visits', 'Product views', 'Added to cart', 'Reached checkout', 'Purchased'];
  A.FUNNEL_STAGES = STAGES;
  function segStages(seg, V, O) {
    const p = SEG[seg];
    let co = O / p.pay, cart = co / p.co, pv = cart / p.atc;
    pv = Math.min(pv, 0.95 * V); cart = Math.min(cart, 0.6 * pv); co = Math.min(co, 0.9 * cart);
    return [V, pv, cart, co, O];
  }
  A.funnel = function (f, seg, rg, cg) {
    const allowed = [0, 1, 2], chSel = f.channel.length ? f.channel.filter((c) => allowed.includes(c)) : allowed;
    if (!chSel.length) return { enabled: false };
    const fC = { region: f.region, category: f.category, channel: chSel };
    const bd = D.byDim(fC, 'channel');
    const calc = (r) => {
      if (!r) return null;
      const get = (ch) => { const j = bd.idx.indexOf(ch); return j < 0 ? { V: 0, O: 0 } : { V: U.sum(bd.m[j][MEAS.SES], r.i0, r.i1), O: U.sum(bd.m[j][MEAS.ORD], r.i0, r.i1) }; };
      const web = get(0), app = get(1), mk = get(2);
      const dsum = DEV.desktop.vs * DEV.desktop.cm + DEV.mobile.vs * DEV.mobile.cm;
      const parts = {
        desktop: { V: web.V * DEV.desktop.vs, O: (web.O * DEV.desktop.vs * DEV.desktop.cm) / dsum },
        mobile: { V: web.V * DEV.mobile.vs, O: (web.O * DEV.mobile.vs * DEV.mobile.cm) / dsum },
        app, market: mk,
      };
      const stages = {};
      for (const k in parts) stages[k] = parts[k].V > 0 ? segStages(k, parts[k].V, parts[k].O) : [0, 0, 0, 0, 0];
      stages.all = [0, 1, 2, 3, 4].map((i) => Object.keys(parts).reduce((a, k) => a + stages[k][i], 0));
      return stages[seg];
    };
    const cur = calc(rg), prev = calc(cg);
    const mk = (vals, pv) => vals.map((v, i) => ({ name: STAGES[i], value: v, ofVisits: vals[0] ? v / vals[0] : 0, step: i ? (vals[i - 1] ? v / vals[i - 1] : 0) : 1, prevStep: pv && i ? (pv[i - 1] ? pv[i] / pv[i - 1] : 0) : null, prevValue: pv ? pv[i] : null }));
    return { enabled: true, stages: mk(cur, prev), conv: cur[0] ? cur[4] / cur[0] : 0, prevConv: prev && prev[0] ? prev[4] / prev[0] : null, abandon: cur[2] ? 1 - cur[4] / cur[2] : 0 };
  };

  /* ---------- cohorts ---------- */
  const CH_RET = [1.0, 1.25, 0.7, 1.7, 0.9], CAT_RET = [1.15, 1.2, 0.9, 0.55, 1.0, 0.75];
  A.cohorts = function (f) {
    const tot = D.totals(f), chd = D.byDim(f, 'channel'), cad = D.byDim(f, 'category');
    const last = new Date(D.ms(D.ASOF)), endIdx = last.getUTCFullYear() * 12 + last.getUTCMonth();
    const rows = [];
    const nz = U.rng(31337);
    for (let n = 11; n >= 0; n--) {
      const mi = endIdx - n, y = Math.floor(mi / 12), mo = mi % 12;
      const a = Math.max(0, D.dayOf(y, mo + 1, 1)), z = Math.min(D.ASOF, D.dayOf(y, mo + 2, 1) - 1);
      const ord = U.sum(tot.ord, a, z);
      const wCh = chd.idx.map((_, j) => U.sum(chd.m[j][MEAS.ORD], a, z)), wCa = cad.idx.map((_, j) => U.sum(cad.m[j][MEAS.ORD], a, z));
      const sw = U.sum(wCh, 0, wCh.length - 1) || 1, sc = U.sum(wCa, 0, wCa.length - 1) || 1;
      const chM = wCh.reduce((s, w, j) => s + (w / sw) * CH_RET[chd.idx[j]], 0), caM = wCa.reduce((s, w, j) => s + (w / sc) * CAT_RET[cad.idx[j]], 0);
      const newShare = 0.58 - 0.004 * (11 - n);
      const size = Math.round(ord * newShare);
      const q = (0.94 + 0.012 * (11 - n)) * (mo === 10 ? 0.8 : mo === 11 ? 0.92 : 1);
      const r1 = 0.24 * q * chM * caM, floor = 0.075 * chM * caM;
      const vals = [1];
      for (let k = 1; k <= n; k++) {
        const cal = (mo + k) % 12, hol = cal === 10 || cal === 11 ? 1.22 : 1;
        vals.push(Math.min(0.95, (floor + (r1 - floor) * Math.exp(-(k - 1) / 3.4)) * hol * (1 + 0.05 * nz.norm())));
      }
      rows.push({ label: U.MON[mo] + " '" + String(y).slice(2), long: U.MONL[mo] + ' ' + y, size, vals });
    }
    const avg = [];
    for (let k = 0; k < 12; k++) {
      let s = 0, w = 0; rows.forEach((r) => { if (k < r.vals.length) { s += r.vals[k] * r.size; w += r.size; } });
      avg.push(w ? s / w : null);
    }
    return { rows, avg };
  };
})((window.M = window.M || {}));
