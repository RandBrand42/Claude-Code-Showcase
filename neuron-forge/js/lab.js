/* NEURON FORGE - lab
 * The single source of truth for one experiment: configuration, dataset, network, training loop
 * and metric history. Views subscribe to events ('data', 'arch', 'epoch', 'reset', 'weights',
 * 'config', 'diverged') and never mutate the model directly.
 */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};

  NF.DEFAULTS = {
    seed: 7, regen: 0,
    dataset: 'moons', noise: 8, split: 70, count: 300,
    features: ['x1', 'x2'], hidden: [6, 4],
    act: 'tanh', loss: 'bce', opt: 'adam', lr: 0.03, l1: 0, l2: 0, batch: 16, init: 'xavier',
    speed: 0.25,
  };
  NF.LIMITS = { maxLayers: 6, maxNeurons: 12 };

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  class Lab {
    constructor(cfg) {
      this.cfg = Object.assign({}, NF.DEFAULTS, cfg || {});
      this.cfg.features = this.cfg.features.slice();
      this.cfg.hidden = this.cfg.hidden.slice();
      this.handlers = {};
      this.gridCache = {};
      this.initCount = 0;
      this.rebuildData();
      this.resetNet(true);
    }

    on(evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); return this; }
    emit(evt, payload) { for (const fn of this.handlers[evt] || []) fn(payload, this); }

    /* ---------- derived ---------- */
    get sizes() { return [this.cfg.features.length, ...this.cfg.hidden, 1]; }
    get nTrain() { return Math.max(2, Math.min(this.data.n - 2, Math.round(this.data.n * this.cfg.split / 100))); }
    get totalNeurons() { return this.cfg.hidden.reduce((a, b) => a + b, 0) + 1; }

    /* ---------- data ---------- */
    rebuildData() {
      const c = this.cfg;
      this.data = NF.makeDataset(c.dataset, c.count, c.noise, c.seed, c.regen);
      this.rebuildFeatures();
    }
    rebuildFeatures() {
      const d = this.data;
      this.F = NF.buildFeatures(d.X1, d.X2, d.n, this.cfg.features);
      this.pred = new Float32Array(d.n);
      this.idx = new Uint32Array(this.nTrain);
      for (let i = 0; i < this.idx.length; i++) this.idx[i] = i;
    }

    /* ---------- network lifecycle ---------- */
    netOpts() { const c = this.cfg; return { act: c.act, loss: c.loss, init: c.init }; }

    /** Fresh weights from the seed (reproducible). clearHistory wipes curves and the epoch counter. */
    resetNet(clearHistory) {
      const c = this.cfg;
      this.net = new NF.Net(this.sizes, this.netOpts(), NF.makeRng(NF.mixSeed(c.seed, 1)));
      this.rng = NF.makeRng(NF.mixSeed(c.seed, 2));
      this.diverged = false;
      if (clearHistory) { this.epoch = 0; this.hist = { tl: [], te: [], ta: [], tea: [] }; }
      this.rebuildFeatures();
      this.evaluate(clearHistory);
    }

    /** Re-shape the network, keeping every weight whose endpoints still exist. */
    morph(oldFeat) {
      const old = this.net, c = this.cfg, sizes = this.sizes;
      const net = new NF.Net(sizes, this.netOpts(), NF.makeRng(NF.mixSeed(c.seed, 3, ++this.initCount)));
      for (let l = 0; l < net.L; l++) {
        const nin = sizes[l], nout = sizes[l + 1], oin = old.sizes[l], oout = old.sizes[l + 1];
        for (let j = 0; j < nout; j++) {
          if (j < oout) net.P[net.bOff[l] + j] = old.P[old.bOff[l] + j];
          for (let i = 0; i < nin; i++) {
            const io = l === 0 ? oldFeat.indexOf(c.features[i]) : (i < oin ? i : -1);
            const k = net.wOff[l] + j * nin + i;
            if (j < oout && io >= 0) net.P[k] = old.P[old.wOff[l] + j * oin + io];
            else if (io < 0 && j < oout) net.P[k] *= 0.15;   // brand-new source unit: start quiet so the function barely moves
          }
        }
      }
      this.net = net;
      this.rebuildFeatures();
      this.evaluate(false);
    }

    /**
     * Apply a partial config and do the minimum re-work: re-split, regenerate data, morph or reset.
     * Returns a list of what changed (for views).
     */
    set(patch) {
      const c = this.cfg, before = {};
      for (const k of Object.keys(patch)) if (!same(c[k], patch[k])) { before[k] = c[k]; c[k] = Array.isArray(patch[k]) ? patch[k].slice() : patch[k]; }
      const ks = Object.keys(before);
      if (!ks.length) return ks;
      const has = k => k in before;
      const dataChanged = has('dataset') || has('noise') || has('count') || has('seed') || has('regen');
      const hardReset = has('seed') || has('dataset') || has('loss') || has('init');
      if (dataChanged) this.rebuildData();
      const archChanged = has('features') || has('hidden');
      if (hardReset) { this.resetNet(true); this.emit('reset'); }
      else if (archChanged) {
        if (this.cfg.hidden.length !== (before.hidden || this.cfg.hidden).length) { this.resetNet(true); this.emit('reset'); }
        else this.morph(before.features || this.cfg.features);
      } else {
        if (has('act')) this.net.act = c.act;
        if (has('opt')) this.net.resetOptimizer();
        if (dataChanged || has('split')) this.rebuildFeatures();
        this.evaluate(false);
      }
      if (archChanged) this.emit('arch');
      if (dataChanged || has('split')) this.emit('data');
      this.emit('config', ks);
      this.emit('epoch');
      return ks;
    }

    reset() { this.resetNet(true); this.emit('reset'); this.emit('epoch'); this.emit('config', []); }
    newSeed() { return this.set({ seed: 1 + Math.floor(Math.random() * 9998) }); }

    /* ---------- training ---------- */
    get hyper() { const c = this.cfg; return { opt: c.opt, lr: c.lr, l1: c.l1, l2: c.l2 }; }

    stepEpoch() {
      const net = this.net, n = this.nTrain, idx = this.idx, F = this.F, Y = this.data.y;
      const B = this.cfg.batch <= 0 || this.cfg.batch >= n ? n : this.cfg.batch, h = this.hyper;
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.rng.next() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      for (let from = 0; from < n; from += B) net.trainBatch(F, Y, idx, from, Math.min(n, from + B), h);
      this.epoch++;
      this.evaluate(true);
    }

    /** Run up to `epochs` epochs or until the time budget is used. Returns epochs done. */
    run(epochs, budgetMs) {
      const t0 = performance.now();
      let done = 0;
      while (done < epochs && !this.diverged) {
        this.stepEpoch(); done++;
        if (performance.now() - t0 > budgetMs) break;
      }
      this.emit('epoch');
      if (this.diverged) this.emit('diverged');
      return done;
    }

    evaluate(record) {
      const d = this.data, nt = this.nTrain;
      const tr = this.net.evaluate(this.F, d.y, 0, nt, this.pred);
      const te = this.net.evaluate(this.F, d.y, nt, d.n, this.pred);
      this.metrics = { trainLoss: tr.loss, testLoss: te.loss, trainAcc: tr.acc, testAcc: te.acc };
      if (!isFinite(tr.loss)) this.diverged = true;
      if (record) {
        const h = this.hist;
        h.tl.push(tr.loss); h.te.push(te.loss); h.ta.push(tr.acc); h.tea.push(te.acc);
      }
    }

    /* ---------- inspection helpers for the views ---------- */
    /** Cached feature grid for res x res world positions (row 0 = top = +LIM). */
    gridFeatures(res) {
      const key = res + '|' + this.cfg.features.join(',');
      let g = this.gridCache[key];
      if (!g) {
        const n = res * res, X1 = new Float32Array(n), X2 = new Float32Array(n), L = NF.LIM;
        for (let gy = 0; gy < res; gy++) for (let gx = 0; gx < res; gx++) {
          X1[gy * res + gx] = -L + (gx + 0.5) / res * 2 * L;
          X2[gy * res + gx] = L - (gy + 0.5) / res * 2 * L;
        }
        if (Object.keys(this.gridCache).length > 12) this.gridCache = {};
        g = this.gridCache[key] = NF.buildFeatures(X1, X2, n, this.cfg.features);
      }
      return g;
    }
    /** Evaluate the network on a res x res grid. rec (optional) collects per-neuron maps. */
    probeGrid(res, outP, rec) { this.net.forwardMany(this.gridFeatures(res), res * res, outP, rec); }
    newRec(res) {
      const n = res * res, net = this.net;
      return { a: net.sizes.slice(1).map(s => new Float32Array(s * n)), z: net.sizes.slice(1).map(s => new Float32Array(s * n)) };
    }
    /** Raw feature map for input neurons (value of feature i over the grid). */
    featureMap(res, i) {
      const F = this.gridFeatures(res), k = this.cfg.features.length, out = new Float32Array(res * res);
      for (let s = 0; s < out.length; s++) out[s] = F[s * k + i];
      return out;
    }
    /** Forward a single world point; leaves per-neuron activations in net.a / net.z. */
    predict(x1, x2) {
      const f = this.cfg.features, v = new Float32Array(f.length);
      for (let i = 0; i < f.length; i++) v[i] = NF.FEATURE_BY_ID[f[i]].f(x1, x2);
      const y = this.net.forward(v, 0);
      return { p: this.net.toProb(y), feats: v };
    }
    setWeight(k, value) { this.net.P[k] = value; this.evaluate(false); this.emit('weights'); this.emit('epoch'); }
  }
  NF.Lab = Lab;

  /** Validate an untrusted (imported / URL) config: keep only known keys with clamped, typed values. */
  NF.sanitizeConfig = function (raw) {
    const D = NF.DEFAULTS, out = {};
    if (!raw || typeof raw !== 'object') return out;
    const num = (k, lo, hi, round) => { const v = raw[k]; if (typeof v === 'number' && isFinite(v)) out[k] = Math.max(lo, Math.min(hi, round ? Math.round(v) : v)); };
    const pick = (k, list) => { if (list.includes(raw[k])) out[k] = raw[k]; };
    num('seed', 1, 999999999, true); num('regen', 0, 9999, true); pick('dataset', NF.DATASET_IDS);
    num('noise', 0, 50, true); num('split', 10, 90, true); num('count', 40, 1000, true);
    if (Array.isArray(raw.features)) {
      const ids = NF.FEATURES.map(f => f.id).filter(id => raw.features.includes(id));
      if (ids.length) out.features = ids;
    }
    if (Array.isArray(raw.hidden)) out.hidden = raw.hidden.slice(0, NF.LIMITS.maxLayers).map(n => Math.max(1, Math.min(NF.LIMITS.maxNeurons, Math.round(+n) || 1)));
    pick('act', NF.ACT_ORDER); pick('loss', ['mse', 'bce']); pick('opt', ['sgd', 'momentum', 'adam']); pick('init', ['xavier', 'he']);
    num('lr', 0.0001, 10); num('l1', 0, 1); num('l2', 0, 1); num('batch', 0, 1000, true); num('speed', 0.1, 50);
    return out;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
