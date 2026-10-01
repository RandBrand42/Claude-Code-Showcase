/* MERIDIAN - synthetic dataset for the fictional brand "Aurelia & Co." and the aggregation engine.
 *
 * One fact table: day x SKU x region x channel (730 x 40 x 4 x 5 cells) with seven measures, built from a
 * multiplicative model (trend x annual seasonality x weekday x promos x stock/viral events x noise) driven by a
 * seeded PRNG so every run is identical. Every number the UI shows is an aggregation over this table, so parts
 * always sum to the whole.
 */
(function (M) {
  'use strict';
  const U = M.U;
  const D = (M.D = {});

  /* ---------- dimensions ---------- */
  D.REGIONS = [
    { key: 'NA', name: 'North America' }, { key: 'EMEA', name: 'EMEA' },
    { key: 'APAC', name: 'APAC' }, { key: 'LATAM', name: 'LATAM' },
  ];
  D.CATS = [
    { key: 'tabletop', name: 'Tabletop' }, { key: 'textiles', name: 'Textiles' }, { key: 'lighting', name: 'Lighting' },
    { key: 'furniture', name: 'Furniture' }, { key: 'decor', name: 'Decor & Art' }, { key: 'outdoor', name: 'Outdoor' },
  ];
  D.CHANS = [
    { key: 'web', name: 'Web' }, { key: 'app', name: 'Mobile App' }, { key: 'market', name: 'Marketplace' },
    { key: 'wholesale', name: 'Wholesale' }, { key: 'popup', name: 'Retail Pop-ups' },
  ];
  D.DIMS = { region: D.REGIONS, category: D.CATS, channel: D.CHANS };
  const R = 4, C = 5, K = 6;

  /* ---------- time ---------- */
  D.N = 730;
  D.START = Date.UTC(2024, 7, 19); // Mon 19 Aug 2024
  D.DAY = 86400000;
  D.ASOF = D.N - 1; // Tue 18 Aug 2026 - the last complete day in the warehouse
  const N = D.N;
  D.ms = (i) => D.START + i * D.DAY;
  D.dow = (i) => new Date(D.ms(i)).getUTCDay();
  D.dayOf = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - D.START) / D.DAY);
  D.dayIso = (s) => { const p = s.split('-').map(Number); return D.dayOf(p[0], p[1], p[2]); };
  D.isoOf = (i) => U.dstr(D.ms(i), 'iso');

  /* ---------- products (40 invented SKUs) ---------- */
  // [name, category, list price, revenue weight, launch day (optional)]
  const SKU_DEF = [
    ['Halden Stoneware Dinner Set', 0, 168, 3.2], ['Verra Stemless Wine Glasses', 0, 62, 1.5], ['Marlow Copper Saucepan', 0, 124, 2.0],
    ['Ostia Serving Platter', 0, 78, 1.6], ['Kiln Carbon-Steel Skillet', 0, 96, 2.1], ['Brae Oak Cutting Board', 0, 58, 1.4], ['Tamsin Dutch Oven 5.5qt', 0, 210, 2.2],
    ['Loom Merino Throw', 1, 148, 4.5], ['Sable Linen Duvet Set', 1, 286, 4.2], ['Nima Waffle Bath Towels', 1, 92, 2.6], ['Fjord Wool Area Rug', 1, 420, 3.0],
    ['Alder Percale Sheet Set', 1, 198, 3.0], ['Pell Quilted Cushion Cover', 1, 54, 1.3], ['Cove Linen Curtains', 1, 132, 1.4],
    ['Arc Brass Floor Lamp', 2, 340, 4.0], ['Lumen Opal Pendant', 2, 228, 3.3], ['Sol Ceramic Table Lamp', 2, 164, 2.8], ['Vesper Glass Sconce', 2, 138, 2.0],
    ['Taper Beeswax Candles', 2, 38, 1.4], ['Halo Rattan Shade', 2, 176, 2.2, 'launch:2025-02-10'], ['Ember Glass Lantern', 2, 84, 2.3],
    ['Ridge Walnut Side Table', 3, 380, 3.0], ['Atlas Modular Sofa', 3, 2480, 6.6], ['Copse Oak Dining Table', 3, 1640, 4.9], ['Wren Accent Chair', 3, 620, 3.4],
    ['Mesa Travertine Coffee Table', 3, 890, 3.4, 'launch:2025-10-06'], ['Nook Reading Stool', 3, 210, 1.0], ['Bryn Oak Bookcase', 3, 740, 1.7],
    ['Terra Stoneware Vase', 4, 88, 1.8], ['Quill Framed Botanical Print', 4, 120, 1.9], ['Drift Oak Wall Mirror', 4, 260, 2.0], ['Orbit Brass Wall Clock', 4, 145, 1.1],
    ['Sway Woven Basket Set', 4, 72, 1.2], ['Mono Linen Wall Hanging', 4, 110, 1.0],
    ['Terrace Teak Lounge Chair', 5, 540, 3.3], ['Fable Steel Fire Bowl', 5, 320, 2.4], ['Cedar Planter Trio', 5, 96, 1.4], ['Bask Canvas Parasol', 5, 280, 1.9],
    ['Hearth Outdoor Dining Set', 5, 1980, 3.6], ['Dune Woven Outdoor Rug', 5, 240, 2.4],
  ];
  const CAT_CODE = ['T', 'X', 'L', 'F', 'D', 'O'];
  const COST = [0.4, 0.37, 0.44, 0.55, 0.36, 0.48];
  const S = SKU_DEF.length;
  const rnd = U.rng(20260818);
  const catCount = [0, 0, 0, 0, 0, 0];
  D.SKUS = SKU_DEF.map((d, i) => {
    const k = d[1]; catCount[k]++;
    return {
      i, name: d[0], cat: k, price: d[2], w: d[3], cost: COST[k] + (rnd() - 0.5) * 0.06,
      id: 'AC-' + CAT_CODE[k] + String(100 + catCount[k] * 7 + k).padStart(3, '0'),
      launch: d[4] ? D.dayIso(d[4].slice(7)) : -1, since: 2019 + rnd.int(6),
    };
  });
  D.skuByName = (n) => D.SKUS.find((s) => s.name === n);
  const SKU_BY_CAT = [0, 1, 2, 3, 4, 5].map((k) => D.SKUS.filter((s) => s.cat === k).map((s) => s.i));

  /* ---------- promo / event calendar ---------- */
  const EVENT_DEF = [
    ['Black Friday', '2024-11-25', '2024-11-29', '2024-12-02', 1.45, 0.24, 'bf'],
    ['Spring Sale', '2025-03-14', '2025-03-20', '2025-03-23', 0.55, 0.15, 'sp'],
    ['Summer Refresh', '2025-07-09', '2025-07-11', '2025-07-13', 0.4, 0.12, 'su'],
    ['Black Friday', '2025-11-24', '2025-11-28', '2025-12-01', 1.45, 0.24, 'bf'],
    ['Spring Sale', '2026-03-13', '2026-03-19', '2026-03-22', 0.55, 0.15, 'sp'],
    ['Summer Refresh', '2026-07-08', '2026-07-10', '2026-07-12', 0.4, 0.12, 'su'],
  ];
  D.EVENTS = EVENT_DEF.map((e) => ({ name: e[0], i0: D.dayIso(e[1]), peak: D.dayIso(e[2]), i1: D.dayIso(e[3]), amp: e[4], disc: e[5], kind: e[6] }));
  // per-day promo profile (0..1 triangular), discount, and the amplitude
  const evP = new Float32Array(N), evAmp = new Float32Array(N), evDisc = new Float32Array(N), evKind = new Array(N).fill('');
  const bfLag = new Float32Array(N); // returns rise ~2 weeks after Black Friday
  D.EVENTS.forEach((e) => {
    for (let d = Math.max(0, e.i0); d <= Math.min(N - 1, e.i1); d++) {
      const span = d <= e.peak ? e.peak - e.i0 + 1 : e.i1 - e.peak + 1;
      const p = 1 - Math.abs(d - e.peak) / (span + 0.6);
      if (p > evP[d]) { evP[d] = p; evAmp[d] = e.amp; evDisc[d] = e.disc * Math.min(1, p * 1.4); evKind[d] = e.kind; }
      if (e.kind === 'bf' && d + 12 < N) bfLag[d + 12] = Math.max(bfLag[d + 12], p);
    }
  });
  // one-off operational events (the "story" of the dataset)
  D.VIRAL = { sku: D.skuByName('Loom Merino Throw').i, d0: D.dayIso('2026-01-13'), prof: [0.3, 1, 0.7, 0.4, 0.15] };
  D.STOCKOUT = { cat: 3, d0: D.dayIso('2026-03-27'), d1: D.dayIso('2026-04-01'), regions: [0, 1] };

  /* ---------- model parameters ---------- */
  const REG_SH = [0.44, 0.28, 0.2, 0.08];
  const CH_SH = [[0.34, 0.18, 0.2, 0.18, 0.1], [0.3, 0.15, 0.22, 0.23, 0.1], [0.26, 0.26, 0.3, 0.1, 0.08], [0.3, 0.12, 0.36, 0.14, 0.08]];
  const AFF_CH = [[1, 0.9, 1.2, 1.1, 1.2], [1.1, 1.3, 0.9, 0.9, 0.7], [1, 1, 0.9, 1.3, 1.1], [1, 0.7, 0.8, 1.3, 0.9], [1, 1.3, 1.2, 0.6, 1.4], [0.9, 0.9, 1.1, 1.4, 0.6]];
  const AFF_RG = [[1, 1, 1.05, 0.85], [1, 1.1, 0.9, 0.9], [0.9, 1.05, 1.35, 0.8], [1.1, 1.15, 0.7, 0.7], [0.95, 1, 1.1, 1.3], [1.1, 0.9, 0.8, 1.5]];
  const SEAS = [[0.3, 345], [0.22, 355], [0.2, 315], [0.1, 85], [0.26, 350], [0.55, 170]];
  const DOWF = [[1.2, 1.14, 1.03, 0.96, 0.92, 0.82, 0.93], [1.26, 1.05, 0.98, 0.94, 0.93, 0.86, 0.98], [1.1, 1.08, 1, 0.97, 0.95, 0.9, 1],
    [0.15, 1.45, 1.5, 1.4, 1.35, 1.1, 0.15], [1.5, 0.4, 0.4, 0.6, 1, 1.6, 1.9]];
  const G_CAT = [0.05, 0.1, 0.2, -0.04, 0.15, 0.26], G_REG = [0.07, 0.11, 0.3, 0.22], G_CH = [0.07, 0.3, 0.18, 0.06, 0.02];
  const CH_PRICE = [1, 0.98, 0.88, 0.62, 1.04], REG_PRICE = [1, 0.97, 0.94, 0.9];
  const AOV_CH = [245, 228, 162, 2450, 310], AOV_RG = [1, 1.02, 0.92, 0.85];
  const CONV_CH = [0.029, 0.046, 0.019, 0.28, 0.14], CONV_RG = [1, 0.95, 1.1, 0.8], CONV_K = [1.1, 1.1, 0.95, 0.55, 1.15, 0.85];
  const RR_CAT = [0.06, 0.09, 0.05, 0.11, 0.07, 0.08], RR_CH = [1.1, 1.05, 1.25, 0.3, 0.5];
  const NPS_RG = [54, 47, 41, 36], NPS_CH = [0, 2, -6, 7, 9], NPS_CAT = [1, 3, 0, -4, 2, 1];
  D.NPS_CH = NPS_CH;

  const A = (D.A = { rev: null, ord: null, units: null, cogs: null, ret: null, ses: null });
  const NPS = new Float32Array(N * R);
  const M_REV = 0, M_ORD = 1, M_UNITS = 2, M_COGS = 3, M_RET = 4, M_SES = 5, M_NPS = 6, NM = 7;
  D.M = { REV: M_REV, ORD: M_ORD, UNITS: M_UNITS, COGS: M_COGS, RET: M_RET, SES: M_SES, NPSW: M_NPS, COUNT: NM };

  function build() {
    const size = N * S * R * C;
    for (const k in A) A[k] = new Float32Array(size);
    const rng = U.rng(7041977);
    const dayR = new Float32Array(N * R), dayC = new Float32Array(N * C), cvC = new Float32Array(N * C), level = new Float32Array(N);
    let ar = 0;
    for (let d = 0; d < N; d++) {
      ar = 0.82 * ar + 0.18 * rng.norm() * 0.12; level[d] = 1 + ar;
      for (let r = 0; r < R; r++) dayR[d * R + r] = 1 + 0.05 * rng.norm();
      for (let c = 0; c < C; c++) { dayC[d * C + c] = 1 + 0.045 * rng.norm(); cvC[d * C + c] = 1 + 0.06 * rng.norm(); }
    }
    // growth / seasonality factor tables
    const gK = [], gR = [], gC = [], seas = [];
    const grow = (rate) => { const a = new Float32Array(N); for (let d = 0; d < N; d++) a[d] = Math.exp(0.5 * rate * (d - N / 2) / 365); return a; };
    G_CAT.forEach((g) => gK.push(grow(g))); G_REG.forEach((g) => gR.push(grow(g))); G_CH.forEach((g) => gC.push(grow(g)));
    for (let k = 0; k < K; k++) {
      const a = new Float32Array(N);
      for (let d = 0; d < N; d++) { const doy = (new Date(D.ms(d)) - Date.UTC(new Date(D.ms(d)).getUTCFullYear(), 0, 0)) / D.DAY; a[d] = 1 + SEAS[k][0] * Math.cos((2 * Math.PI * (doy - SEAS[k][1])) / 365); }
      seas.push(a);
    }
    const catBias = { bf: [0.3, 0.3, 0, -0.3, 0.2, -0.6], sp: [0, 0.3, 0, 0, 0.3, 0.8], su: [0, 0, 0.2, 0, 0.1, 0.5] };
    const skuU = D.SKUS.map((s) => (s.w / s.price) * 1000);
    const so = D.STOCKOUT, vi = D.VIRAL;

    let i = 0;
    for (let d = 0; d < N; d++) {
      const dow = D.dow(d), p = evP[d], amp = evAmp[d], kind = evKind[d], disc = evDisc[d];
      const trend = 1 + 0.1 * (d / N);
      for (let s = 0; s < S; s++) {
        const sk = D.SKUS[s], k = sk.cat, bias = kind ? catBias[kind][k] : 0;
        let lf = 1;
        if (sk.launch >= 0) lf = d < sk.launch ? 0 : Math.pow(Math.min(1, (d - sk.launch) / 30), 0.7);
        const viralF = s === vi.sku && d >= vi.d0 && d < vi.d0 + vi.prof.length ? 1 + 7 * vi.prof[d - vi.d0] : 1;
        const inSO = k === so.cat && d >= so.d0 && d <= so.d1 + 2;
        const soF = inSO ? (d <= so.d1 ? 0.1 : d === so.d1 + 1 ? 0.45 : 0.8) : 1;
        const baseS = skuU[s] * seas[k][d] * gK[k][d] * lf;
        const cost = sk.cost, price = sk.price;
        const priceIdx = U.clamp(Math.pow(price / 200, 0.35), 0.6, 1.9);
        for (let r = 0; r < R; r++) {
          const baseR = baseS * REG_SH[r] * AFF_RG[k][r] * gR[r][d] * dayR[d * R + r] * level[d] * (inSO && so.regions.indexOf(r) >= 0 ? soF : 1);
          for (let c = 0; c < C; c++, i++) {
            if (baseR === 0) continue;
            const digital = c < 3;
            const promo = digital ? 1 + amp * (1 + bias) * p : c === 4 ? 1 + 0.6 * amp * p : 1 + 0.08 * amp * p;
            const vF = digital ? viralF : 1;
            let u = baseR * CH_SH[r][c] * AFF_CH[k][c] * gC[c][d] * dayC[d * C + c] * DOWF[c][dow] * promo * vF * trend;
            u *= Math.max(0.3, 1 + 0.2 * rng.norm());
            const dsc = c === 3 ? 0 : disc;
            const gross = u * price * CH_PRICE[c] * REG_PRICE[r] * (1 - dsc);
            const rr = Math.min(0.4, RR_CAT[k] * RR_CH[c] * (1 + 0.6 * bfLag[d]) * Math.max(0.5, 1 + 0.15 * rng.norm()));
            const net = gross * (1 - rr);
            const aov = AOV_CH[c] * AOV_RG[r] * priceIdx * (1 + 0.05 * (d / N)) * (1 - 0.08 * p);
            const ord = net / aov;
            const conv = CONV_CH[c] * CONV_RG[r] * CONV_K[k] * (1 + 0.12 * (d / N)) * (1 + 0.35 * p) * cvC[d * C + c];
            A.units[i] = u; A.rev[i] = net; A.ret[i] = gross * rr;
            A.cogs[i] = u * cost * price * (1 - rr);
            A.ord[i] = ord; A.ses[i] = ord / conv;
          }
        }
      }
    }
    // calibrate the absolute scale: trailing-12-month revenue = $62.4M
    let t12 = 0;
    const perDay = S * R * C;
    for (let j = (N - 365) * perDay; j < size; j++) t12 += A.rev[j];
    const f = 62.4e6 / t12;
    for (const k in A) { const a = A[k]; for (let j = 0; j < size; j++) a[j] *= f; }
    // NPS by region/day
    let nz = [0, 0, 0, 0];
    for (let d = 0; d < N; d++) {
      for (let r = 0; r < R; r++) {
        nz[r] = 0.85 * nz[r] + 0.15 * rng.norm() * 9;
        let v = NPS_RG[r] + 5 * (d / N) + nz[r];
        if (so.regions.indexOf(r) >= 0 && d >= so.d0 && d <= so.d1 + 6) v -= 9 * Math.exp(-(d - so.d0) / 9);
        if (bfLag[d] > 0.3) v -= 3; // post-holiday delivery delays
        NPS[d * R + r] = v;
      }
    }
  }
  build();

  /* ---------- selection + cache helpers ---------- */
  D.emptyFilters = () => ({ region: [], category: [], channel: [] });
  const sel = (arr, n) => (arr && arr.length ? arr.slice().sort((a, b) => a - b) : Array.from({ length: n }, (_, i) => i));
  D.fkey = (f) => ['region', 'category', 'channel'].map((k) => (f[k] || []).slice().sort().join('.')).join('|');
  const cache = new Map();
  function memo(key, fn) {
    if (cache.has(key)) return cache.get(key);
    const v = fn();
    cache.set(key, v);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return v;
  }

  /** Daily totals for a filter selection: {rev, ord, units, cogs, ret, ses, npsw} each Float64Array(N). */
  D.totals = function (f) {
    return memo('T' + D.fkey(f), () => {
      const out = Array.from({ length: NM }, () => new Float64Array(N));
      const ks = sel(f.category, K), rs = sel(f.region, R), cs = sel(f.channel, C);
      for (let d = 0; d < N; d++) {
        let rev = 0, ord = 0, un = 0, cg = 0, rt = 0, ss = 0, nw = 0;
        for (const k of ks) for (const s of SKU_BY_CAT[k]) {
          const b = (d * S + s) * R;
          for (const r of rs) {
            const nps = NPS[d * R + r] + NPS_CAT[k];
            let i = (b + r) * C;
            for (const c of cs) {
              const j = i + c;
              rev += A.rev[j]; ord += A.ord[j]; un += A.units[j]; cg += A.cogs[j]; rt += A.ret[j]; ss += A.ses[j];
              nw += A.ord[j] * (nps + NPS_CH[c]);
            }
          }
        }
        out[0][d] = rev; out[1][d] = ord; out[2][d] = un; out[3][d] = cg; out[4][d] = rt; out[5][d] = ss; out[6][d] = nw;
      }
      return { rev: out[0], ord: out[1], units: out[2], cogs: out[3], ret: out[4], ses: out[5], npsw: out[6] };
    });
  };

  /** Per-member daily measures for one dimension: {idx:[...], m:[ [Float64Array(N) x NM] per member ]}. */
  D.byDim = function (f, dim) {
    return memo('B' + dim + D.fkey(f), () => {
      const ks = sel(f.category, K), rs = sel(f.region, R), cs = sel(f.channel, C);
      const members = dim === 'category' ? ks : dim === 'region' ? rs : cs;
      const pos = {}; members.forEach((m, n) => { pos[m] = n; });
      const m = members.map(() => Array.from({ length: NM }, () => new Float64Array(N)));
      for (let d = 0; d < N; d++) {
        for (const k of ks) for (const s of SKU_BY_CAT[k]) {
          const b = (d * S + s) * R;
          for (const r of rs) {
            const nps = NPS[d * R + r] + NPS_CAT[k];
            const i = (b + r) * C;
            for (const c of cs) {
              const j = i + c;
              const t = m[pos[dim === 'category' ? k : dim === 'region' ? r : c]];
              t[0][d] += A.rev[j]; t[1][d] += A.ord[j]; t[2][d] += A.units[j]; t[3][d] += A.cogs[j]; t[4][d] += A.ret[j]; t[5][d] += A.ses[j];
              t[6][d] += A.ord[j] * (nps + NPS_CH[c]);
            }
          }
        }
      }
      return { idx: members, m };
    });
  };

  /** Per-SKU daily matrices for a filter: {rev, units, cogs, ret, ord} as Float64Array(S*N). */
  D.skuDaily = function (f) {
    return memo('S' + D.fkey(f), () => {
      const out = { rev: new Float64Array(S * N), units: new Float64Array(S * N), cogs: new Float64Array(S * N), ret: new Float64Array(S * N), ord: new Float64Array(S * N) };
      const ks = sel(f.category, K), rs = sel(f.region, R), cs = sel(f.channel, C);
      for (const k of ks) for (const s of SKU_BY_CAT[k]) {
        for (let d = 0; d < N; d++) {
          const b = (d * S + s) * R;
          let rv = 0, un = 0, cg = 0, rt = 0, od = 0;
          for (const r of rs) { const i = (b + r) * C; for (const c of cs) { const j = i + c; rv += A.rev[j]; un += A.units[j]; cg += A.cogs[j]; rt += A.ret[j]; od += A.ord[j]; } }
          const o = s * N + d; out.rev[o] = rv; out.units[o] = un; out.cogs[o] = cg; out.ret[o] = rt; out.ord[o] = od;
        }
      }
      return out;
    });
  };

  /** Split of one SKU's revenue over a day range by region and channel (respecting filters). */
  D.skuSplit = function (s, f, i0, i1) {
    const rs = sel(f.region, R), cs = sel(f.channel, C);
    const reg = new Float64Array(R), chn = new Float64Array(C);
    for (let d = i0; d <= i1; d++) {
      const b = (d * S + s) * R;
      for (const r of rs) for (const c of cs) { const v = A.rev[(b + r) * C + c]; reg[r] += v; chn[c] += v; }
    }
    return { reg, chn };
  };

  /** Sum one measure over a range. */
  D.rangeSum = (arr, i0, i1) => { let s = 0; for (let i = i0; i <= i1; i++) s += arr[i]; return s; };

  /** KPI bundle for a range from totals. */
  D.kpis = function (t, i0, i1) {
    const sm = (a) => D.rangeSum(a, i0, i1);
    const rev = sm(t.rev), ord = sm(t.ord), cogs = sm(t.cogs), ses = sm(t.ses), nw = sm(t.npsw), ret = sm(t.ret), un = sm(t.units);
    return { rev, ord, units: un, aov: ord ? rev / ord : 0, conv: ses ? ord / ses : 0, margin: rev ? (rev - cogs) / rev : 0, nps: ord ? nw / ord : 0, ret, retRate: rev + ret ? ret / (rev + ret) : 0, gp: rev - cogs, ses };
  };

  /* stock: units on hand derived from trailing sales velocity and a per-SKU cover target */
  D.stock = (function () {
    const cover = U.rng(99);
    return D.SKUS.map((s) => {
      let u = 0;
      for (let d = N - 28; d < N; d++) for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) u += A.units[((d * S + s.i) * R + r) * C + c];
      const perDay = u / 28;
      let days = 18 + cover() * 55;
      if (s.name === 'Tamsin Dutch Oven 5.5qt') days = 9; else if (s.name === 'Atlas Modular Sofa') days = 14; else if (s.name === 'Ember Glass Lantern') days = 0; else if (s.name === 'Halo Rattan Shade') days = 6;
      return { onHand: Math.round(perDay * days), perDay, days: days };
    });
  })();
})((window.M = window.M || {}));
