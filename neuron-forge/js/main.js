/* NEURON FORGE - application controller: builds the UI, owns the animation loop, wires the lab to the views */
(function () {
  'use strict';
  const NF = window.NF, U = NF.ui, el = U.el;
  const $ = s => document.querySelector(s);

  /* ---------- persistence (all guarded: storage may be unavailable) ---------- */
  const store = {
    get(k) { try { return localStorage.getItem('neuronforge.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('neuronforge.' + k, v); } catch (e) { /* ignore */ } },
  };
  const b64 = {
    enc: s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))),
  };
  function readHash() {
    const m = /[#&]cfg=([^&]+)/.exec(location.hash);
    if (!m) return null;
    try { return JSON.parse(b64.dec(m[1])); } catch (e) { return null; }
  }
  function readSaved() { try { return JSON.parse(store.get('cfg')); } catch (e) { return null; } }

  const startCfg = NF.sanitizeConfig(readHash() || readSaved());
  const lab = new NF.Lab(startCfg);
  const cfg = lab.cfg;
  const reduced = NF.reducedMotion();
  let playing = false, acc = 0;

  /* ---------- helpers ---------- */
  const fmtLoss = v => (!isFinite(v) ? '—' : v < 0.001 && v > 0 ? v.toExponential(1) : v.toFixed(v < 10 ? 3 : 1));
  const archText = () => lab.sizes.join(' → ');
  const download = (name, blob) => { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* fall through */ }
    const ta = el('textarea', { style: 'position:fixed;opacity:0;left:-99px' }); ta.value = t; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove(); return ok;
  }
  const exportCfg = () => Object.assign({ app: 'neuron-forge', v: 1 }, JSON.parse(JSON.stringify(cfg)));
  const shareLink = () => location.href.split('#')[0] + '#cfg=' + b64.enc(JSON.stringify(exportCfg()));

  /** Replace the whole experiment with a configuration and start it from scratch. */
  function loadConfig(partial) {
    lab.set(Object.assign({}, NF.DEFAULTS, NF.sanitizeConfig(partial)));
    lab.reset();
    acc = 0;
    if (!playing && !reduced) setPlaying(true);
  }

  /* ---------- left column: data ---------- */
  const dsetBtns = NF.DATASETS.map((d, i) => {
    const cv = el('canvas', { 'aria-hidden': 'true' });
    NF.drawDatasetThumb(cv, d.id);
    const b = el('button', { class: 'dset', type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': d.name, title: d.name + '  [' + (i + 1) + ']', 'data-id': d.id, onclick: () => lab.set({ dataset: d.id }) }, cv, el('kbd', null, String(i + 1)));
    return b;
  });
  $('#dsets').append(...dsetBtns);

  const C = {};
  C.noise = U.slider({ label: 'Noise', help: 'noise', min: 0, max: 50, step: 1, value: cfg.noise, fmt: v => v + '%', onInput: v => lab.set({ noise: v }) });
  C.split = U.slider({ label: 'Train / test', help: 'split', min: 10, max: 90, step: 5, value: cfg.split, fmt: v => v + ' / ' + (100 - v), onInput: v => lab.set({ split: v }) });
  C.count = U.slider({ label: 'Samples', help: 'count', values: [60, 100, 150, 200, 300, 400, 500, 750, 1000], value: cfg.count, fmt: v => String(v), onInput: v => lab.set({ count: v }) });
  $('#data-ctl').append(C.noise.el, C.split.el, C.count.el);

  /* ---------- left column: features ---------- */
  const featBtns = NF.FEATURES.map(f => {
    const cv = el('canvas', { 'aria-hidden': 'true' });
    NF.drawFeatureThumb(cv, f.id);
    const b = el('button', { class: 'feat', type: 'button', role: 'checkbox', 'aria-checked': 'false', title: f.name, 'data-id': f.id }, cv, el('span', null, f.short));
    b.addEventListener('click', () => {
      const on = cfg.features.includes(f.id);
      if (on && cfg.features.length === 1) { U.toast('The network needs at least one input.'); return; }
      const next = NF.FEATURES.map(x => x.id).filter(id => (id === f.id ? !on : cfg.features.includes(id)));
      lab.set({ features: next });
    });
    return b;
  });
  $('#feats').append(...featBtns);

  /* ---------- left column: training ---------- */
  C.act = U.select({ label: 'Activation', value: cfg.act, options: NF.ACT_ORDER.map(k => ({ value: k, label: NF.ACT[k].label, glyph: U.actGlyph(k) })), onChange: v => lab.set({ act: v }) });
  C.loss = U.seg({ label: 'Loss', value: cfg.loss, options: [{ value: 'bce', label: 'Cross-entropy' }, { value: 'mse', label: 'Squared err.' }], onChange: v => lab.set({ loss: v }) });
  C.opt = U.seg({ label: 'Optimiser', value: cfg.opt, options: [{ value: 'sgd', label: 'SGD' }, { value: 'momentum', label: 'Momentum' }, { value: 'adam', label: 'Adam' }], onChange: v => lab.set({ opt: v }), cls: 'seg--tight' });
  C.lr = U.slider({ label: 'Learning rate', help: 'lr', min: 0, max: 100, step: 1, value: cfg.lr, toPos: v => (Math.log10(v) + 3.5) / 0.04, fromPos: p => +Math.pow(10, -3.5 + p * 0.04).toPrecision(2), fmt: v => (v >= 1 ? v.toFixed(2) : v.toPrecision(2)), onInput: v => lab.set({ lr: v }) });
  C.batch = U.slider({ label: 'Batch size', help: 'batch', values: [1, 2, 4, 8, 16, 32, 64, 0], value: cfg.batch, fmt: v => (v === 0 ? 'all' : String(v)), onInput: v => lab.set({ batch: v }) });
  const REG = [0, 0.0001, 0.0003, 0.001, 0.003, 0.01, 0.03, 0.1];
  C.l2 = U.slider({ label: 'L2 decay', help: 'l2', values: REG, value: cfg.l2, fmt: v => (v === 0 ? 'off' : String(v)), onInput: v => lab.set({ l2: v }), cls: 'slider--cyan' });
  C.l1 = U.slider({ label: 'L1 sparsity', help: 'l1', values: REG, value: cfg.l1, fmt: v => (v === 0 ? 'off' : String(v)), onInput: v => lab.set({ l1: v }), cls: 'slider--cyan' });
  C.init = U.seg({ label: 'Weight init', value: cfg.init, options: [{ value: 'xavier', label: 'Xavier' }, { value: 'he', label: 'He' }], onChange: v => lab.set({ init: v }) });
  $('#train-ctl').append(U.field('Activation', 'act', C.act.el), U.field('Loss', 'loss', C.loss.el), U.field('Optimiser', 'opt', C.opt.el),
    C.lr.el, C.batch.el, C.l2.el, C.l1.el, U.field('Weight init', 'init', C.init.el));

  /* ---------- top bar ---------- */
  const playBtn = $('#btn-play');
  function setPlaying(v) {
    playing = v;
    playBtn.replaceChildren(el('span', { html: `<svg><use href="#i-${v ? 'pause' : 'play'}"/></svg>` }).firstChild, el('span', null, v ? 'Pause' : 'Play'));
    playBtn.setAttribute('aria-label', (v ? 'Pause' : 'Play') + ' training (Space)');
    document.body.dataset.playing = v;
  }
  const speedSeg = U.seg({ label: 'Epochs per frame', value: cfg.speed, cls: 'seg--tight', options: [0.25, 1, 2, 5, 10, 25, 50].map(v => ({ value: v, label: v === 0.25 ? '¼' : String(v), title: v + ' epochs per frame' })), onChange: v => lab.set({ speed: v }) });
  $('#speed').append(speedSeg.el);
  const seedInput = $('#seed');
  function commitSeed() {
    const t = seedInput.value.trim(); if (!t) { seedInput.value = cfg.seed; return; }
    const n = /^\d+$/.test(t) ? Math.min(999999999, parseInt(t, 10)) : 1 + NF.mixSeed(...[...t].map(c => c.charCodeAt(0))) % 999999;
    lab.set({ seed: Math.max(1, n) }); seedInput.value = cfg.seed;
  }
  seedInput.addEventListener('change', commitSeed);
  seedInput.addEventListener('keydown', e => { if (e.key === 'Enter') { commitSeed(); seedInput.blur(); } e.stopPropagation(); });
  playBtn.addEventListener('click', () => setPlaying(!playing));
  $('#btn-step').addEventListener('click', () => { setPlaying(false); lab.run(1, 1000); });
  $('#btn-reset').addEventListener('click', () => { lab.reset(); acc = 0; U.toast('Weights re-initialised from seed ' + cfg.seed); });
  $('#btn-seed').addEventListener('click', () => { lab.newSeed(); U.toast('Seed ' + cfg.seed + ': new data, new weights'); });
  $('#btn-regen').addEventListener('click', () => { lab.set({ regen: cfg.regen + 1 }); U.toast('Fresh sample drawn from the same distribution'); });

  /* ---------- views ---------- */
  const boundary = new NF.BoundaryView(lab, $('#cv-boundary'), $('#plot'));
  const netview = new NF.NetView(lab, { host: $('#netview'), edgeCanvas: $('#cv-edges'), nodesEl: $('#nodes') });
  const lossChart = new NF.LossChart(lab, $('#cv-loss'));
  const gTrain = new NF.Gauge($('#g-train'), 'Train acc', '#e6eeff'), gTest = new NF.Gauge($('#g-test'), 'Test acc', '#b79cff');
  const scale = U.seg({ label: 'Loss scale', value: 'log', cls: 'seg--tight', options: [{ value: 'log', label: 'log' }, { value: 'lin', label: 'lin' }], onChange: v => { lossChart.log = v === 'log'; lossChart.draw(); } });
  $('#loss-scale').replaceWith(Object.assign(scale.el, { style: 'width:92px' }));

  const probeEl = $('#probe');
  function renderProbe(pt) {
    if (!pt) {
      probeEl.replaceChildren(el('span', { class: 'mono-label' }, 'Probe'), el('p', { style: 'margin-top:8px;font-family:var(--font-text);font-size:12px;color:var(--text-dim)' },
        'Hover the plane to read the network’s prediction at any point and watch that single input flow through the diagram.'));
      return;
    }
    const r = lab.predict(pt.x, pt.y), pos = r.p >= 0.5, col = pos ? 'var(--amber-hot)' : 'var(--cyan-hot)';
    const conf = Math.round(Math.max(r.p, 1 - r.p) * 100);
    probeEl.replaceChildren(el('span', { class: 'mono-label' }, 'P(class +1)'),
      el('div', { class: 'p', style: 'color:' + col + ';margin:6px 0 4px' }, r.p.toFixed(3)),
      el('div', { class: 'cls', style: 'color:' + col }, (pos ? 'CLASS +1' : 'CLASS −1') + ' · ' + conf + '%'),
      el('div', { class: 'row' }, el('span', null, 'x₁ ' + pt.x.toFixed(2)), el('span', null, 'x₂ ' + pt.y.toFixed(2))));
  }
  boundary.onHover = pt => { renderProbe(pt); netview.setProbe(pt); };
  renderProbe(null);

  /* inspector + learn */
  function renderLearn() {
    const host = $('#tp-learn');
    host.replaceChildren(
      el('p', { style: 'color:var(--text-dim);font-size:12.5px;line-height:1.55;margin:0 0 12px' }, 'A neuron multiplies each input by a weight, adds them up with a bias, and bends the total with an activation function. A network is neurons feeding neurons. Training nudges every weight a little in the direction that shrinks the loss (backpropagation) and repeats.'),
      el('div', { class: 'btns' },
        el('button', { class: 'btn btn--sm', type: 'button', onclick: () => tour.open(0) }, 'Replay the tour'),
        el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: openKeys }, 'Shortcuts')),
      ...NF.HELP_ORDER.map(k => { const h = NF.HELP[k]; return el('details', null, el('summary', null, h.title), el('p', null, h.body)); }));
  }
  renderLearn();

  /* ---------- challenges + recipes ---------- */
  const challenges = new NF.Challenges(lab, $('#tp-challenges'), { load: loadConfig, celebrate: node => { NF.confetti(node); } });
  $('#btn-recipes').addEventListener('click', e => {
    U.menu(e.currentTarget, [el('span', { class: 'mono-label' }, 'Recipes · one-click experiments'),
      ...NF.RECIPES.map(r => el('button', { class: 'menu__item', type: 'button', role: 'menuitem', onclick: () => { U.closeMenu(); loadConfig(r.cfg); U.toast(r.name); } }, el('b', null, r.name), el('span', null, r.note)))]);
  });

  /* ---------- share / export / import ---------- */
  function applyImport(text) {
    let obj = null;
    try { const m = /cfg=([A-Za-z0-9_-]+)/.exec(text); obj = JSON.parse(m ? b64.dec(m[1]) : text); } catch (e) { obj = null; }
    const clean = NF.sanitizeConfig(obj);
    if (!Object.keys(clean).length) { U.toast('That does not look like a Neuron Forge configuration.'); return; }
    U.closeMenu(); loadConfig(clean); U.toast('Configuration loaded');
  }
  function snapshot() {
    boundary.refresh();
    const m = lab.metrics, d = NF.DATASETS.find(x => x.id === cfg.dataset);
    const cv = boundary.snapshot({ head: (d.name + '  ·  ' + archText() + '  ·  ' + NF.ACT[cfg.act].label).toUpperCase(),
      line1: `epoch ${lab.epoch}   train ${(m.trainAcc * 100).toFixed(1)}%   test ${(m.testAcc * 100).toFixed(1)}%`, line2: `seed ${cfg.seed}   ${cfg.opt} lr ${cfg.lr}` });
    cv.toBlob(b => { if (b) { download('neuron-forge-' + cfg.dataset + '-epoch' + lab.epoch + '.png', b); U.toast('Snapshot saved'); } }, 'image/png');
  }
  $('#btn-snap').addEventListener('click', snapshot);
  $('#btn-share').addEventListener('click', e => {
    const linkInput = el('input', { type: 'text', readonly: true, value: shareLink(), 'aria-label': 'Share link' });
    const ta = el('textarea', { rows: 3, placeholder: 'Paste exported JSON or a share link here', 'aria-label': 'Import configuration' });
    U.menu(e.currentTarget, [el('span', { class: 'mono-label' }, 'Share this experiment'), linkInput,
      el('button', { class: 'menu__item', type: 'button', onclick: async () => { linkInput.value = shareLink(); linkInput.select(); U.toast((await copyText(linkInput.value)) ? 'Link copied to clipboard' : 'Press Ctrl+C to copy the selected link'); } }, el('b', null, 'Copy link'), el('span', null, 'Dataset, architecture and hyperparameters are packed into the URL hash.')),
      el('button', { class: 'menu__item', type: 'button', onclick: () => { download('neuron-forge-config.json', new Blob([JSON.stringify(exportCfg(), null, 2)], { type: 'application/json' })); U.toast('Configuration exported'); } }, el('b', null, 'Export JSON'), el('span', null, 'Save this configuration as a file.')),
      el('button', { class: 'menu__item', type: 'button', onclick: () => { U.closeMenu(); snapshot(); } }, el('b', null, 'PNG snapshot'), el('span', null, 'The decision boundary with a title strip, ready to post.')),
      el('hr'), el('span', { class: 'mono-label' }, 'Import'), ta,
      el('button', { class: 'menu__item', type: 'button', onclick: () => applyImport(ta.value) }, el('b', null, 'Load pasted text')),
      el('button', { class: 'menu__item', type: 'button', onclick: () => {
        const f = el('input', { type: 'file', accept: '.json,application/json' });
        f.addEventListener('change', () => { const file = f.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => applyImport(String(r.result)); r.readAsText(file); });
        f.click();
      } }, el('b', null, 'Choose a JSON file…'))]);
  });

  /* ---------- tour, tabs, shortcuts overlay ---------- */
  const tour = new NF.Tour(() => store.set('tour', '1'));
  $('#btn-tour').addEventListener('click', () => tour.open(0));
  const tabs = ['challenges', 'learn'];
  tabs.forEach(t => $('#tab-' + t).addEventListener('click', () => {
    tabs.forEach(o => { $('#tab-' + o).setAttribute('aria-selected', o === t); $('#tp-' + o).hidden = o !== t; });
  }));
  const keysModal = $('#modal-keys');
  function openKeys() {
    const rows = [['Space', 'Play / pause training'], ['S', 'Step one epoch'], ['R', 'Reset weights (same seed, same data)'], ['N', 'New seed'], ['1 – 7', 'Choose dataset'], ['?', 'This panel'], ['Esc', 'Close dialogs, menus and the tour']];
    keysModal.querySelector('.modal__card').replaceChildren(el('h2', null, 'Shortcuts'),
      el('div', { class: 'keys' }, rows.flatMap(([k, d]) => [el('kbd', null, k), el('span', null, d)])),
      el('div', { style: 'margin-top:18px;text-align:right' }, el('button', { class: 'btn btn--sm', type: 'button', id: 'keys-close' }, 'Close')));
    keysModal.hidden = false; keysModal.querySelector('#keys-close').focus();
    keysModal.querySelector('#keys-close').addEventListener('click', closeKeys);
  }
  function closeKeys() { keysModal.hidden = true; $('#btn-keys').focus(); }
  keysModal.addEventListener('pointerdown', e => { if (e.target === keysModal) closeKeys(); });
  $('#btn-keys').addEventListener('click', openKeys);

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || tour.isOpen()) return;
    if (e.key === 'Escape') { if (!keysModal.hidden) closeKeys(); return; }
    const t = e.target, tag = t.tagName;
    if (tag === 'INPUT' && t.type !== 'range' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!keysModal.hidden) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || e.code === 'Space') { if (tag === 'BUTTON' || tag === 'SUMMARY') return; e.preventDefault(); setPlaying(!playing); }
    else if (k === 's') { setPlaying(false); lab.run(1, 1000); }
    else if (k === 'r') { lab.reset(); acc = 0; U.toast('Weights re-initialised from seed ' + cfg.seed); }
    else if (k === 'n') { lab.newSeed(); U.toast('Seed ' + cfg.seed + ': new data, new weights'); }
    else if (k >= '1' && k <= '7') lab.set({ dataset: NF.DATASETS[+k - 1].id });
    else if (e.key === '?') openKeys();
  });

  /* ---------- UI <-> lab sync ---------- */
  const gaugeHosts = [];
  function syncUI() {
    dsetBtns.forEach(b => b.setAttribute('aria-checked', b.dataset.id === cfg.dataset));
    const d = NF.DATASETS.find(x => x.id === cfg.dataset);
    $('#dset-name').replaceChildren(el('b', null, d.name), el('span', null, d.blurb));
    C.noise.set(cfg.noise); C.split.set(cfg.split); C.count.set(cfg.count);
    featBtns.forEach(b => b.setAttribute('aria-checked', cfg.features.includes(b.dataset.id)));
    C.act.set(cfg.act); C.loss.set(cfg.loss); C.opt.set(cfg.opt); C.lr.set(cfg.lr); C.batch.set(cfg.batch); C.l2.set(cfg.l2); C.l1.set(cfg.l1); C.init.set(cfg.init);
    speedSeg.set(cfg.speed);
    if (document.activeElement !== seedInput) seedInput.value = cfg.seed;
    $('#arch-label').textContent = archText();
    $('#param-label').textContent = lab.net.nParams + ' parameters';
    $('#layer-count').textContent = cfg.hidden.length;
    $('#layer-minus').disabled = cfg.hidden.length <= 0; $('#layer-plus').disabled = cfg.hidden.length >= NF.LIMITS.maxLayers;
    $('#act-title').textContent = 'Activation · ' + NF.ACT[cfg.act].label;
    const n = lab.nTrain, B = cfg.batch <= 0 || cfg.batch >= n ? n : cfg.batch;
    $('#stats').replaceChildren(...[['train pts', n], ['test pts', lab.data.n - n], ['parameters', lab.net.nParams], ['neurons', lab.totalNeurons],
      ['updates / epoch', Math.ceil(n / B)], ['epochs / frame', cfg.speed]].map(([k, v]) => el('span', null, k + ' ', el('b', null, String(v)))));
  }
  $('#layer-minus').addEventListener('click', () => lab.set({ hidden: cfg.hidden.slice(0, -1) }));
  $('#layer-plus').addEventListener('click', () => lab.set({ hidden: cfg.hidden.concat([Math.max(2, cfg.hidden[cfg.hidden.length - 1] || 4)]) }));

  const dirty = { boundary: true, maps: true, metrics: true, hist: true };
  let persistTimer = 0;
  lab.on('arch', () => { netview.sync(); dirty.hist = true; });
  lab.on('data', () => { dirty.boundary = true; });
  lab.on('config', () => { syncUI(); clearTimeout(persistTimer); persistTimer = setTimeout(() => store.set('cfg', JSON.stringify(cfg)), 400); });
  lab.on('epoch', () => { dirty.boundary = dirty.maps = dirty.metrics = dirty.hist = true; });
  lab.on('weights', () => { dirty.boundary = dirty.maps = dirty.hist = true; });
  lab.on('reset', () => { dirty.all = true; });
  lab.on('diverged', () => { setPlaying(false); U.toast('Training diverged (the loss went to infinity). Lower the learning rate or press Reset.', { ms: 5200 }); });
  window.addEventListener('hashchange', () => { const h = readHash(); if (h) { loadConfig(NF.sanitizeConfig(h)); } });

  /* ---------- per-frame work ---------- */
  let last = performance.now(), tB = 0, tM = 0, tC = 0, tH = 0, tQ = 0, boundaryGap = 33;
  const epochEl = $('#epoch');
  function updateMetrics(now) {
    const m = lab.metrics, e = lab.epoch.toLocaleString('en-US');
    if (epochEl.textContent !== e) epochEl.textContent = e;
    $('#lv-train').textContent = fmtLoss(m.trainLoss); $('#lv-test').textContent = fmtLoss(m.testLoss);
    gTrain.set(m.trainAcc); gTest.set(m.testAcc);
    lossChart.draw();
    const net = lab.net, zs = [];
    for (let l = 0; l < net.L - 1; l++) { const z = netview.rec24.z[l]; for (let k = 0; k < z.length; k += 23) zs.push(z[k]); }
    NF.drawActivationPlot($('#cv-act'), cfg.act, zs);
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (playing && !document.hidden) {
      acc += cfg.speed; const n = Math.floor(acc);
      if (n > 0) { acc -= n; lab.run(n, 11); }
    }
    if (dirty.all) { dirty.boundary = dirty.maps = dirty.metrics = dirty.hist = true; dirty.all = false; }
    if (dirty.boundary && now - tB >= boundaryGap) { boundary.refresh(); boundary.draw(); dirty.boundary = false; tB = now; boundaryGap = Math.max(33, boundary.lastCost * 2.5); }
    if (dirty.maps && now - tM >= 90) { netview.updateMaps(); dirty.maps = false; tM = now; }
    if (dirty.metrics && now - tC >= 50) { updateMetrics(now); dirty.metrics = false; tC = now; }
    if (dirty.hist && now - tH >= 160) { NF.drawWeightHist($('#cv-hist'), lab.net); dirty.hist = false; tH = now; }
    if (now - tQ >= 250) { challenges.update(); tQ = now; }
    netview.frame(dt, playing);
    gTrain.tick(dt); gTest.tick(dt);
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  new ResizeObserver(() => { dirty.metrics = dirty.hist = true; }).observe($('#panel-loss'));

  /* ---------- go ---------- */
  syncUI();
  netview.sync();
  renderProbe(null);
  setPlaying(false);
  requestAnimationFrame(t => { last = t; frame(t); });
  if (!reduced) setPlaying(true);
  if (!store.get('tour')) setTimeout(() => { if (!document.hidden) tour.open(0); }, 1800);

  window.NFApp = { lab, boundary, netview, lossChart, challenges, tour, loadConfig, setPlaying, isPlaying: () => playing };
})();
