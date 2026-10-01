/* NEURON FORGE - challenges with live scoring + confetti */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};
  const el = NF.ui.el;
  const pct = v => (v * 100).toFixed(1) + '%';

  /* condition builders -> (lab) => { ok, now, progress } */
  const is = (label, fn, now) => ({ label, test: lab => { const ok = !!fn(lab); return { ok, now: now ? now(lab) : '', progress: ok ? 1 : 0 }; } });
  const atLeast = (label, get, target, fmt) => ({ label, test: lab => { const v = get(lab); return { ok: v >= target, now: fmt(v), progress: Math.max(0, Math.min(1, v / target)) }; } });
  const atMost = (label, get, target, fmt) => ({ label, test: lab => { const v = get(lab); return { ok: v <= target, now: fmt(v), progress: v <= target ? 1 : Math.max(0, Math.min(1, target / v)) }; } });
  const above = (label, get, target, fmt) => ({ label, test: lab => { const v = get(lab); return { ok: v > target, now: fmt(v), progress: Math.max(0, Math.min(1, v / target)) }; } });
  const onlyXY = lab => lab.cfg.features.length === 2 && lab.cfg.features.includes('x1') && lab.cfg.features.includes('x2');

  NF.CHALLENGES = [
    { id: 'xor3', title: 'Three-neuron XOR',
      goal: 'Solve XOR with only 3 neurons in total (hidden plus the output) and nothing but x₁ and x₂ as inputs.',
      hint: 'You start with 5 neurons. Shrink the hidden layer to 2 with the − pill, then press Reset (R) so the smaller net starts fresh from the seed. Tanh often gets stuck with so few neurons; swish is forgiving. Still stuck? Roll a new seed (N).',
      setup: { dataset: 'xor', noise: 5, count: 300, features: ['x1', 'x2'], hidden: [4], act: 'swish', lr: 0.05, seed: 7 },
      conds: [is('Dataset: XOR', l => l.cfg.dataset === 'xor'), is('Inputs: x₁, x₂ only', onlyXY),
        atMost('Neurons in total ≤ 3', l => l.totalNeurons, 3, v => String(v)), atLeast('Test accuracy ≥ 95%', l => l.metrics.testAcc, 0.95, pct)] },
    { id: 'spiral', title: 'Conquer the spiral',
      goal: 'Reach 95% test accuracy on the two-arm spiral with at least 300 points.',
      hint: 'One small hidden layer will plateau near 70%. Add layers with the + pill and give each a good handful of neurons. Adam at 0.01 and a few hundred epochs is plenty.',
      setup: { dataset: 'spiral', noise: 2, count: 600, features: ['x1', 'x2'], hidden: [8, 6], act: 'tanh', lr: 0.01, speed: 2, seed: 7 },
      conds: [is('Dataset: Spiral', l => l.cfg.dataset === 'spiral'), atLeast('Points ≥ 300', l => l.cfg.count, 300, v => String(v)),
        atLeast('Test accuracy ≥ 95%', l => l.metrics.testAcc, 0.95, pct)] },
    { id: 'circle', title: 'Circle from raw coordinates',
      goal: 'Fit the circle to 97% test accuracy using only x₁ and x₂ (no squared features).',
      hint: 'A straight line cannot enclose a disc. Add a hidden layer so the network can build the curve itself; three or four neurons are enough.',
      setup: { dataset: 'circle', noise: 5, count: 300, features: ['x1', 'x2'], hidden: [], act: 'tanh', lr: 0.03, seed: 7 },
      conds: [is('Dataset: Circle', l => l.cfg.dataset === 'circle'), is('Inputs: x₁, x₂ only', onlyXY), atLeast('Test accuracy ≥ 97%', l => l.metrics.testAcc, 0.97, pct)] },
    { id: 'overfit', title: 'Overfit on purpose',
      goal: 'Memorise the noise: drive training loss below 0.01 while test loss stays above 0.30 (noise at least 15%).',
      hint: 'Small, noisy data plus a big network is the recipe. Load the setup and let it run a few hundred epochs, then watch the two loss curves part ways.',
      setup: { dataset: 'circle', noise: 35, count: 100, split: 50, features: ['x1', 'x2'], hidden: [12, 12, 12], act: 'tanh', lr: 0.03, batch: 8, speed: 2, seed: 7 },
      conds: [atLeast('Noise ≥ 15%', l => l.cfg.noise, 15, v => v + '%'), { label: 'Train loss < 0.01', test: l => { const v = l.metrics.trainLoss; return { ok: v < 0.01, now: v.toFixed(4), progress: v < 0.01 ? 1 : Math.max(0, Math.min(1, 0.01 / v)) }; } },
        above('Test loss > 0.30', l => l.metrics.testLoss, 0.3, v => v.toFixed(3))] },
    { id: 'moons', title: 'Minimalist moons',
      goal: 'Separate the two moons to 97% test accuracy with no more than 4 neurons in total.',
      hint: 'Six and four hidden neurons is luxury. Three hidden neurons in a single layer, plus the output, are enough for a clean crescent.',
      setup: { dataset: 'moons', noise: 8, count: 300, features: ['x1', 'x2'], hidden: [6, 4], act: 'tanh', lr: 0.03, seed: 7 },
      conds: [is('Dataset: Two Moons', l => l.cfg.dataset === 'moons'), atMost('Neurons in total ≤ 4', l => l.totalNeurons, 4, v => String(v)),
        atLeast('Test accuracy ≥ 97%', l => l.metrics.testAcc, 0.97, pct)] },
  ];

  class Challenges {
    constructor(lab, host, api) {
      this.lab = lab; this.host = host; this.api = api; this.active = null; this.streak = 0;
      try { this.solved = JSON.parse(localStorage.getItem('neuronforge.solved') || '{}'); } catch (e) { this.solved = {}; }
      this.cards = NF.CHALLENGES.map(c => this.buildCard(c));
      host.append(el('p', { class: 'mono-label', style: 'margin:0 0 10px;letter-spacing:.06em;text-transform:none;font-weight:500;line-height:1.5' }, 'Five puzzles. Load a setup, then bend the network to the goal. Scores update live.'), ...this.cards.map(c => c.node));
      this.update();
    }
    buildCard(c) {
      const conds = c.conds.map(d => ({ d, li: el('li', null, el('i'), el('span', null, d.label), el('em')) }));
      const prog = el('i'), hint = el('p', { hidden: true, style: 'margin:8px 0 0;color:var(--text-dim)' }, c.hint);
      const badge = el('span', { class: 'badge badge--ok', hidden: true });
      const start = el('button', { class: 'btn btn--sm', type: 'button', onclick: () => this.start(c.id) }, 'Load setup');
      const node = el('div', { class: 'card' },
        el('h3', null, c.title, badge), el('p', null, c.goal),
        el('ul', { class: 'conds' }, conds.map(x => x.li)), el('div', { class: 'progress' }, prog),
        el('div', { class: 'row', style: 'margin-top:10px' }, start, el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => { hint.hidden = !hint.hidden; } }, 'Hint')), hint);
      return { c, node, conds, prog, badge };
    }
    start(id) {
      const ch = NF.CHALLENGES.find(c => c.id === id);
      this.active = id; this.streak = 0;
      this.api.load(ch.setup);
      NF.ui.toast('Challenge loaded: ' + ch.title);
      this.update();
    }
    update() {
      const lab = this.lab;
      for (const card of this.cards) {
        let sum = 0, allOk = true;
        for (const x of card.conds) {
          const r = x.d.test(lab); sum += r.progress; allOk = allOk && r.ok;
          x.li.classList.toggle('ok', r.ok); x.li.lastChild.textContent = r.now;
        }
        card.prog.style.width = Math.round(sum / card.conds.length * 100) + '%';
        const isActive = this.active === card.c.id, done = this.solved[card.c.id] != null;
        card.node.classList.toggle('active', isActive); card.node.classList.toggle('solved', done);
        card.badge.hidden = !done; if (done) card.badge.textContent = 'Solved · epoch ' + this.solved[card.c.id];
        if (isActive && allOk && lab.epoch >= 5 && !lab.diverged) {
          if (++this.streak >= 3) this.win(card);
        } else if (isActive) this.streak = 0;
      }
    }
    win(card) {
      const id = card.c.id;
      this.active = null; this.streak = 0;
      this.solved[id] = this.lab.epoch;
      try { localStorage.setItem('neuronforge.solved', JSON.stringify(this.solved)); } catch (e) { /* storage unavailable */ }
      NF.ui.toast('Challenge solved: ' + card.c.title + ' (epoch ' + this.lab.epoch + ')', { win: true, ms: 4200 });
      this.api.celebrate(card.node);
      this.update();
    }
  }
  NF.Challenges = Challenges;

  /* ---------- confetti ---------- */
  NF.confetti = function (originEl) {
    if (NF.reducedMotion()) return;
    const cv = document.getElementById('confetti'), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const r = originEl ? originEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
    const ox = r.left + r.width / 2, oy = r.top + Math.min(r.height / 2, 60);
    const cols = ['#ffb224', '#ffd27a', '#27d6f2', '#96f0ff', '#ffffff', '#b79cff'];
    const ps = Array.from({ length: 170 }, () => {
      const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, v = 260 + Math.random() * 620;
      return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - .5) * 14, w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, c: cols[(Math.random() * cols.length) | 0], life: 2.4 + Math.random() * 1.2, t: 0 };
    });
    let last = performance.now();
    (function tick(now) {
      const dt = Math.min(.04, (now - last) / 1000); last = now;
      g.clearRect(0, 0, innerWidth, innerHeight);
      let alive = 0;
      for (const p of ps) {
        p.t += dt; if (p.t > p.life) continue; alive++;
        p.vy += 900 * dt; p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        g.save(); g.globalAlpha = Math.min(1, (p.life - p.t) / .6); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = p.c; g.shadowColor = p.c; g.shadowBlur = 8; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
      }
      if (alive) requestAnimationFrame(tick); else g.clearRect(0, 0, innerWidth, innerHeight);
    })(last);
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
