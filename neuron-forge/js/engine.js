/* NEURON FORGE - engine
 * Seeded RNG, activation functions and a from-scratch dense MLP with manual backprop and
 * SGD / Momentum / Adam. No DOM access, so the same file runs in the browser and under node
 * (tests/verify-engine.cjs loads it to gradient-check the maths).
 *
 * Memory layout: every weight and bias lives in ONE Float32Array (net.P). Layer l owns
 *   W[l][j*in + i]  (row = output neuron j)   at net.wOff[l]
 *   b[l][j]                                    at net.bOff[l]
 * The gradient (G), momentum/Adam first moment (M) and second moment (V) share that layout.
 */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};

  /* ---------- seeded PRNG (mulberry32) + Box-Muller gaussian ---------- */
  NF.makeRng = function makeRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    let spare = null;
    const next = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u = 0; while (u === 0) u = next();
      const v = next(), r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    };
    return {
      next, gauss,
      range: (a, b) => a + (b - a) * next(),
      int: n => Math.floor(next() * n),
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
        return arr;
      },
    };
  };

  /* ---------- activations: f(z), derivative d(z, a) where a = f(z) ---------- */
  const sig = z => 1 / (1 + Math.exp(-z));
  NF.ACT = {
    tanh:    { label: 'tanh',       f: Math.tanh,                    d: (z, a) => 1 - a * a,        bounded: true },
    relu:    { label: 'ReLU',       f: z => (z > 0 ? z : 0),         d: z => (z > 0 ? 1 : 0),       bounded: false },
    leaky:   { label: 'Leaky ReLU', f: z => (z > 0 ? z : 0.01 * z),  d: z => (z > 0 ? 1 : 0.01),    bounded: false },
    sigmoid: { label: 'sigmoid',    f: sig,                          d: (z, a) => a * (1 - a),      bounded: true, center: 0.5 },
    swish:   { label: 'swish',      f: z => z * sig(z),              d: z => { const s = sig(z); return s + z * s * (1 - s); }, bounded: false },
    linear:  { label: 'linear',     f: z => z,                       d: () => 1,                     bounded: false },
  };
  NF.ACT_ORDER = ['tanh', 'relu', 'leaky', 'sigmoid', 'swish', 'linear'];

  /* ---------- the network ---------- */
  class Net {
    /** sizes = [nIn, h1, ..., hk, 1];  o = { act, loss: 'mse'|'bce', init: 'xavier'|'he' } */
    constructor(sizes, o, rng) {
      this.sizes = sizes.slice();
      this.act = o.act; this.loss = o.loss; this.initKind = o.init;
      this.L = sizes.length - 1;
      this.wOff = []; this.bOff = [];
      let n = 0;
      for (let l = 0; l < this.L; l++) {
        this.wOff.push(n); n += sizes[l] * sizes[l + 1];
        this.bOff.push(n); n += sizes[l + 1];
      }
      this.nParams = n;
      this.P = new Float32Array(n); this.G = new Float32Array(n);
      this.M = new Float32Array(n); this.V = new Float32Array(n);
      this.t = 0;
      this.a = sizes.map(s => new Float32Array(s));            // a[l]  = input of layer l (a[L] = output)
      this.z = sizes.slice(1).map(s => new Float32Array(s));   // z[l]  = pre-activation of layer l
      this.d = sizes.slice(1).map(s => new Float32Array(s));   // d[l]  = dLoss/dz of layer l
      this.init(rng);
    }

    /** (Re)initialise weights from Xavier/He normal; biases to zero; optimizer state cleared. */
    init(rng) {
      const P = this.P;
      for (let l = 0; l < this.L; l++) {
        const nin = this.sizes[l], nout = this.sizes[l + 1];
        const std = this.initKind === 'he' ? Math.sqrt(2 / nin) : Math.sqrt(2 / (nin + nout));
        for (let k = 0; k < nin * nout; k++) P[this.wOff[l] + k] = rng.gauss() * std;
        for (let j = 0; j < nout; j++) P[this.bOff[l] + j] = 0;
      }
      this.resetOptimizer();
    }
    resetOptimizer() { this.M.fill(0); this.V.fill(0); this.t = 0; }

    outAct(z) { return this.loss === 'mse' ? Math.tanh(z) : 1 / (1 + Math.exp(-z)); }
    /** Map the raw network output to P(class +1) in [0,1]. */
    toProb(y) { return this.loss === 'mse' ? (y + 1) * 0.5 : y; }
    /** Training target for a 0/1 label. */
    target(y01) { return this.loss === 'mse' ? 2 * y01 - 1 : y01; }

    /** Forward one sample: features at F[off .. off+nIn). Returns the raw output. */
    forward(F, off) {
      const P = this.P, sizes = this.sizes, act = NF.ACT[this.act].f;
      const a0 = this.a[0];
      for (let i = 0; i < sizes[0]; i++) a0[i] = F[off + i];
      for (let l = 0; l < this.L; l++) {
        const nin = sizes[l], nout = sizes[l + 1], al = this.a[l], zl = this.z[l], an = this.a[l + 1];
        const wo = this.wOff[l], bo = this.bOff[l], last = l === this.L - 1;
        for (let j = 0; j < nout; j++) {
          let s = P[bo + j];
          const row = wo + j * nin;
          for (let i = 0; i < nin; i++) s += P[row + i] * al[i];
          zl[j] = s;
          an[j] = last ? this.outAct(s) : act(s);
        }
      }
      return this.a[this.L][0];
    }

    /** Accumulate dLoss/dParams for the sample last passed through forward(). */
    backward(t) {
      const L = this.L, sizes = this.sizes, P = this.P, G = this.G, dAct = NF.ACT[this.act].d;
      const y = this.a[L][0];
      // dLoss/dz at the output: mse(tanh) -> (y-t)(1-y^2);  bce(sigmoid) -> y-t
      this.d[L - 1][0] = this.loss === 'mse' ? (y - t) * (1 - y * y) : (y - t);
      for (let l = L - 1; l >= 0; l--) {
        const nin = sizes[l], nout = sizes[l + 1], al = this.a[l], dl = this.d[l];
        const wo = this.wOff[l], bo = this.bOff[l];
        for (let j = 0; j < nout; j++) {
          const dj = dl[j];
          G[bo + j] += dj;
          const row = wo + j * nin;
          for (let i = 0; i < nin; i++) G[row + i] += dj * al[i];
        }
        if (l > 0) {
          const dp = this.d[l - 1], zp = this.z[l - 1];
          for (let i = 0; i < nin; i++) {
            let s = 0;
            for (let j = 0; j < nout; j++) s += P[wo + j * nin + i] * dl[j];
            dp[i] = s * dAct(zp[i], al[i]);
          }
        }
      }
    }

    /** Per-sample loss for the sample last passed through forward(). */
    sampleLoss(t) {
      const L = this.L;
      if (this.loss === 'mse') { const e = this.a[L][0] - t; return 0.5 * e * e; }
      const z = this.z[L - 1][0];                       // stable softplus form of binary cross-entropy
      return Math.max(z, 0) - z * t + Math.log1p(Math.exp(-Math.abs(z)));
    }

    /** Mean loss / accuracy over samples idx[from..to) of (F, Y01). Loss excludes regularisation. */
    evaluate(F, Y01, from, to, pred) {
      const nIn = this.sizes[0];
      let loss = 0, hit = 0;
      for (let s = from; s < to; s++) {
        const y = this.forward(F, s * nIn);
        const t = Y01[s];
        loss += this.sampleLoss(this.target(t));
        const p = this.toProb(y);
        if (pred) pred[s] = p;
        if ((p >= 0.5) === (t === 1)) hit++;
      }
      const n = Math.max(1, to - from);
      return { loss: loss / n, acc: hit / n };
    }

    /** Regularisation penalty (weights only): l1*sum|w| + l2/2*sum w^2. */
    penalty(l1, l2) {
      let s = 0;
      for (let l = 0; l < this.L; l++) for (let k = this.wOff[l]; k < this.bOff[l]; k++) { const w = this.P[k]; s += l1 * Math.abs(w) + 0.5 * l2 * w * w; }
      return s;
    }

    /** Average gradient over a minibatch (incl. regularisation) into this.G. */
    batchGradient(F, Y01, idx, from, to, l1, l2) {
      const nIn = this.sizes[0], G = this.G;
      G.fill(0);
      for (let k = from; k < to; k++) { const s = idx[k]; this.forward(F, s * nIn); this.backward(this.target(Y01[s])); }
      const inv = 1 / (to - from);
      for (let k = 0; k < G.length; k++) G[k] *= inv;
      if (l1 || l2) {
        for (let l = 0; l < this.L; l++) for (let k = this.wOff[l]; k < this.bOff[l]; k++) {
          const w = this.P[k];
          G[k] += l2 * w + (l1 ? l1 * (w > 0 ? 1 : w < 0 ? -1 : 0) : 0);
        }
      }
    }

    /** One optimiser step on a minibatch. h = { opt, lr, l1, l2 } */
    trainBatch(F, Y01, idx, from, to, h) {
      this.batchGradient(F, Y01, idx, from, to, h.l1, h.l2);
      const P = this.P, G = this.G, M = this.M, V = this.V, n = P.length, lr = h.lr;
      if (h.opt === 'sgd') {
        for (let k = 0; k < n; k++) P[k] -= lr * G[k];
      } else if (h.opt === 'momentum') {
        for (let k = 0; k < n; k++) { M[k] = 0.9 * M[k] + G[k]; P[k] -= lr * M[k]; }
      } else {                                             // Adam
        const b1 = 0.9, b2 = 0.999, eps = 1e-8;
        const t = ++this.t, c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
        for (let k = 0; k < n; k++) {
          const g = G[k];
          M[k] = b1 * M[k] + (1 - b1) * g;
          V[k] = b2 * V[k] + (1 - b2) * g * g;
          P[k] -= lr * (M[k] / c1) / (Math.sqrt(V[k] / c2) + eps);
        }
      }
    }

    /**
     * Forward many feature vectors (F: n*nIn). Writes P(class+1) to outP and, if rec is given,
     * records per-neuron activations (rec.a[l] layout neuron-major: [j*n + s]) and pre-activations (rec.z[l]).
     */
    forwardMany(F, n, outP, rec) {
      const nIn = this.sizes[0];
      for (let s = 0; s < n; s++) {
        const y = this.forward(F, s * nIn);
        outP[s] = this.toProb(y);
        if (rec) for (let l = 0; l < this.L; l++) {
          const nout = this.sizes[l + 1];
          for (let j = 0; j < nout; j++) { rec.a[l][j * n + s] = this.a[l + 1][j]; rec.z[l][j * n + s] = this.z[l][j]; }
        }
      }
    }
  }
  NF.Net = Net;
})(typeof globalThis !== 'undefined' ? globalThis : window);
