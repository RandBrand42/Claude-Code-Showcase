/* NEURON FORGE - Simple mode ("explain it like I'm 12").
 *
 * A self-contained layer on top of the normal app. Switching it on:
 *   - relabels the interface in plain words (a reversible dictionary translator, so switching off restores the exact original text),
 *   - hides the expert controls, leaving the handful a first-time learner needs,
 *   - adds a "Coach" that narrates, in plain sentences, what the network is doing right now,
 *   - swaps the tooltips, guided tour, experiments and challenges for kid-friendly versions, and replaces the technical Learn tab with a glossary.
 * Nothing here changes the normal mode: with the switch off, none of this code touches the page.
 */
(function (root) {
  'use strict';
  const NF = root.NF, U = NF.ui, el = U.el, app = root.NFApp;
  if (!app) return;
  const lab = app.lab, cfg = lab.cfg;
  const $ = s => document.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem('neuronforge.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('neuronforge.' + k, v); } catch (e) { /* storage unavailable */ } },
  };

  /* =====================================================================================
   *  1. WORDS
   * ===================================================================================== */

  /** Exact text (trimmed) -> plain-language text. */
  const DICT = {
    /* top bar */
    'neural network observatory': 'a pretend brain you can watch learn',
    'Play': 'Start', 'Step': 'One round', 'Reset': 'Start over', 'New seed': 'New puzzle',
    'Epoch': 'Rounds', 'Speed': 'How fast',
    'Recipes': 'Experiments', 'Tour': 'Guide',
    /* panel titles */
    'Data': 'The dots', 'Inputs': 'Clues', 'Training': 'Teaching', 'Decision boundary': 'The brain’s guess map',
    'Network': 'The little brain', 'Loss': 'Mistakes', 'Challenges': 'Missions', 'Learn': 'Words to know',
    /* controls */
    'Noise': 'Messiness', 'Train / test': 'Practice / quiz', 'Samples': 'How many dots', 'Learning rate': 'Step size',
    /* probe + map */
    'Probe': 'Point at the map', 'P(class +1)': 'Chance it’s orange',
    'Hover the plane to read the network’s prediction at any point and watch that single input flow through the diagram.': 'Point at the map to see what the brain guesses there, and watch that spot travel through the little brain.',
    'PNG snapshot': 'Take a picture', 'New data': 'Shuffle the dots',
    /* loss + scores */
    'train': 'practice', 'test': 'quiz', 'Train acc': 'Practice score', 'Test acc': 'Quiz score',
    /* network diagram */
    'layers': 'stages', 'Input': 'Clues in', 'Output': 'Answer', 'Output neuron': 'Answer neuron',
    'Remove this layer': 'Remove this stage', 'Remove a neuron': 'Take away a neuron', 'Add a neuron': 'Add a neuron',
    'Remove last hidden layer': 'Remove the last stage', 'Remove a hidden layer': 'Remove a stage', 'Add a hidden layer': 'Add a stage', 'Add a hidden layer to the network': 'Add a stage',
    'Hidden layers': 'Stages', 'hidden layers': 'stages',
    'bias': 'built-in lean', 'output range': 'its vote runs', 'incoming Σ|w|': 'how loudly it listens', 'feeds': 'tells', 'signal': 'sees', 'range': 'runs', 'raw feature': 'the clue itself',
    'Zero': 'Mute', 'Edit weight': 'Turn this dial',
    /* datasets */
    'Circle': 'Bullseye', 'Ring & Core': 'Donut', 'XOR': 'Checkers', 'Gaussian Clusters': 'Two clouds', 'Two Moons': 'Two moons', 'Spiral': 'Swirl', 'Checkerboard': 'Chessboard',
    'A disc of +1 surrounded by a ring of −1. Not separable by any straight line.': 'Orange dots in the middle, blue dots all around them. No single straight line can separate them.',
    'A core and an outer ring (+1) separated by a moat of −1: needs a band, not a blob.': 'Orange dots in the middle and on the outside edge, with a blue ring between. Tricky!',
    'Opposite quadrants share a class. The classic problem a single neuron cannot solve.': 'Opposite corners are the same color. One neuron alone can’t crack this one.',
    'Two overlapping blobs. Easy, and a good place to watch noise cap your accuracy.': 'Two fuzzy clouds that overlap a little. Easy, but messiness limits the score.',
    'Two interlocking crescents. A gentle curve is all it takes.': 'Two curved moons hooked together. One gentle curve does it.',
    'Two arms wound around each other. The boss level: depth and patience required.': 'Two swirly arms wound around each other. The boss level: needs a big brain and patience.',
    'A 4×4 chessboard. Periodic features turn it into a much smaller puzzle.': 'A chessboard of orange and blue squares. Wave clues make it much easier.',
    /* features */
    'x₁': 'Across', 'x₂': 'Height', 'x₁²': 'Side edges', 'x₂²': 'Top edges', 'x₁x₂': 'Corners', 'sin x₁': 'Side waves', 'sin x₂': 'Up waves',
    'x₁·x₂': 'Corners (across × height)', 'sin(2πx₁)': 'Side-to-side waves', 'sin(2πx₂)': 'Up-and-down waves',
    /* challenges tab */
    'Load setup': 'Load mission', 'Hint': 'Hint',
    'Five puzzles. Load a setup, then bend the network to the goal. Scores update live.': 'Five missions! Load one, then change the little brain until you win. Your progress updates live.',
    /* menus / dialogs */
    'Recipes · one-click experiments': 'Experiments · pick one and go', 'Shortcuts': 'Keyboard tricks',
    'Play / pause training': 'Start / pause', 'Step one epoch': 'Do one round', 'Reset weights (same seed, same data)': 'Start over (same puzzle)',
    'Choose dataset': 'Pick a puzzle', 'Close dialogs, menus and the tour': 'Close pop-ups and the guide',
    'Fresh sample drawn from the same distribution': 'Fresh dots drawn!', 'The network needs at least one input.': 'The brain needs at least one clue!',
    'Snapshot saved': 'Picture saved!', 'Configuration loaded': 'Experiment loaded!',
  };
  /** Pattern rules, applied in order to anything the dictionary did not match whole. */
  const RX = [
    [/^Hidden (\d+)$/, 'Stage $1'], [/Hidden (\d+) · neuron (\d+)/g, 'Stage $1 · neuron $2'], [/Hidden layer (\d+)/g, 'Stage $1'],
    [/Input · /g, 'Clue · '], [/\bOutput neuron\b/g, 'Answer neuron'],
    [/^CLASS \+1 · (\d+)%$/, 'ORANGE · $1% sure'], [/^CLASS −1 · (\d+)%$/, 'BLUE · $1% sure'],
    [/^x₁ (-?[\d.]+)$/, 'Across $1'], [/^x₂ (-?[\d.]+)$/, 'Height $1'],
    [/^Solved · epoch (\d+)$/, 'Done in $1 rounds!'], [/^Challenge loaded: /, 'Mission loaded: '], [/^Challenge solved: (.*) \(epoch (\d+)\)$/, 'Mission complete: $1!'],
    [/^Weights re-initialised from seed \d+$/, 'Fresh start! Same puzzle, new try.'], [/^Seed \d+: new data, new weights$/, 'A brand-new puzzle!'],
    [/^Training diverged.*$/, 'Whoa, the numbers blew up! The steps were too big. Slide Step size lower and press Start over.'],
    [/^Pause training to hold it still.*$/, 'Pause to hold it still, or the brain keeps turning the dial by itself.'],
    [/\bepochs?\b/gi, m => (m.toLowerCase() === 'epoch' ? 'round' : 'rounds')],
  ];
  const SKIP = 'script,style,canvas,textarea,input,select,[data-keep]';

  /** Plain-language version of a string, or null when there is nothing to change. */
  function plain(text) {
    const key = text.trim();
    if (!key) return null;
    if (Object.prototype.hasOwnProperty.call(DICT, key)) { const o = text.replace(key, DICT[key]); return o === text ? null : o; }
    let out = text;
    for (const [re, rep] of RX) out = out.replace(re, rep);
    return out === text ? null : out;
  }

  /* kid-friendly tooltips: same keys as NF.HELP, shorter and concrete */
  const HELP_S = {
    dataset: ['The dots', 'Every dot is a question. Orange dots are one team and blue dots are the other. The brain has to color the map so each dot sits on its own team’s color.'],
    noise: ['Messiness', 'Makes some dots wander onto the wrong team’s side. The messier it gets, the more mistakes even a perfect brain makes.'],
    split: ['Practice and quiz', 'Solid dots are for practicing. Ringed dots are a surprise quiz: the brain never studies them. The quiz score shows if it really learned.'],
    count: ['How many dots', 'With only a few dots, the brain can just memorize them. With lots of dots, it has to find the real pattern.'],
    features: ['Clues', 'The brain only knows what clues you give it, like how far left a dot is. Extra clues are shortcuts that make hard puzzles easier. Try turning some off!'],
    network: ['The little brain', 'Each circle is a neuron, a tiny voter. Lines are dials that say how much one neuron listens to another: orange means yes, blue means no, thicker means stronger. Use + and − to give it more or fewer neurons.'],
    boundary: ['The guess map', 'The colors show what the brain guesses everywhere. Orange parts are where it thinks “orange team”, blue parts “blue team”. A white center on a dot means the brain got that dot wrong.'],
    lr: ['Step size', 'How big each dial-turn is. Tiny steps are slow. Huge steps make the brain bounce around and mess up. Watch the Mistakes graph while you slide it!'],
    speed: ['How fast', 'How many rounds of practice happen each moment. Slow lets you watch every wiggle.'],
    losschart: ['Mistakes graph', 'Lower is better! The bright line is mistakes on the practice dots. The purple line is mistakes on the quiz dots. If practice keeps dropping but quiz goes up, the brain is memorizing.'],
    accuracy: ['Score', 'How many dots are on the correct color. Compare practice and quiz: a big gap means memorizing.'],
    epoch: ['Rounds practiced', 'One round means the brain looked at every practice dot once.'],
    hidden: ['Stages', 'A stage is a row of neurons. The first stage looks at the clues, and each next stage looks at the stage before it. More stages let the brain draw wigglier shapes.'],
  };

  /* kid-friendly experiments: keyed by recipe id */
  const RECIPES_S = {
    xor1: ['One neuron can’t do Checkers', 'With no stage in the middle the brain can only draw one straight line. Watch the score get stuck around 50–65.'],
    xor2: ['Two neurons to the rescue', 'Just two neurons in the middle bend the line into the Checkers shape.'],
    xor3: ['Cheat with a clue', 'Give it the “Corners” clue and Checkers becomes super easy.'],
    circle: ['The Bullseye shortcut', 'Give it the “edges” clues and one neuron can draw the circle.'],
    spiral: ['Crack the Swirl', 'Four stages of neurons. Give it a few hundred rounds and be patient.'],
    checker: ['Waves for the Chessboard', 'Wave clues turn the chessboard into a tiny puzzle.'],
    overfit: ['Memorize on purpose', 'Few, messy dots and a giant brain. Practice mistakes drop to zero while quiz mistakes climb.'],
    tame: ['Stop the memorizing', 'Same setup, plus a small penalty for big dials. Quiz mistakes stop climbing.'],
    lrhigh: ['Giant steps', 'Step size at the maximum: watch the Mistakes graph go wild.'],
    lrlow: ['Teeny steps', 'Steps this tiny barely move. Patience alone is not a strategy.'],
  };

  const TOUR_S = [
    { target: '.topbar', pad: 6, title: 'A pretend brain that is really learning',
      body: 'This is not a video. A real (tiny) brain is learning right now, inside your browser. Press Start to watch it practice. “Start over” lets it try the same puzzle again.' },
    { target: '#panel-data', title: 'The dots are the puzzle',
      body: 'Each dot is a question. Orange dots are one team and blue dots are the other. The brain’s job is to color the map so every dot sits on its own team’s color. Pick a different puzzle at the top.' },
    { target: '#panel-features', title: 'Clues are what it can see',
      body: '“Across” tells the brain how far sideways a dot is. “Height” tells it how high up it is. The other clues are clever shortcuts. Try turning them off and see if it still figures things out.' },
    { target: '#panel-net', title: 'The little brain',
      body: 'Each circle is a neuron, a tiny voter. It looks at the clues, does some math, and votes. Neurons are arranged in stages, and each stage’s votes go to the next. More stages and neurons let it draw wigglier lines. Use + and − to change them.' },
    { target: '#netview', title: 'Dials that get turned',
      body: 'Each line is a dial that says how much one neuron listens to another. Orange means “yes!”, blue means “no!”, and thicker means stronger. Learning is just turning thousands of dials a tiny bit, over and over, until there are fewer mistakes.' },
    { target: '#panel-loss', title: 'Mistakes and scores',
      body: 'This graph shows mistakes. Lower is better! The bright line is the practice dots and the purple line is the quiz dots, which the brain never studies. The quiz score tells you whether it truly learned.' },
    { target: '#panel-coach', title: 'Your Coach',
      body: 'The Coach explains in plain words what the brain is doing, and what to try next. If you ever get stuck, ask the Coach, or try an Experiment from the top bar.' },
  ];

  const GLOSSARY = [
    ['Neuron', 'A tiny voter. It looks at some numbers, does a little math, and votes somewhere between “blue” and “orange”.'],
    ['Stage', 'A row of neurons. Each stage looks at the votes of the stage before it. More stages let the brain draw wigglier shapes.'],
    ['Clue', 'A number the brain is allowed to look at, like how far left a dot is. Without clues, the brain is blind.'],
    ['Dial', 'How much one neuron listens to another. Learning means turning lots of dials, a little at a time.'],
    ['Round', 'One time through all the practice dots.'],
    ['Mistake score', 'A number for how wrong the brain is. Lower is better, and training tries to push it down.'],
    ['Practice and quiz', 'The brain studies the practice dots (solid). The quiz dots (ringed) are a surprise: it never learns from them, so they show whether it really understands.'],
    ['Memorizing', 'When the brain gets the practice dots perfect but flunks the quiz. Like memorizing answers instead of learning the lesson. Scientists call this “overfitting”.'],
    ['Step size', 'How big each dial-turn is. Too small is slow. Too big makes the brain bounce around and mess up.'],
    ['Messiness', 'Dots that wandered onto the other team’s side. Even a perfect brain makes a few mistakes when things are messy.'],
    ['Guess map', 'The colored background. Orange means “I think orange team”, blue means “I think blue team”, and the glowing line is where it changes its mind.'],
    ['The straight-line limit', 'One neuron alone can only draw a straight line. Stages of neurons let the brain bend that line into curves, circles and swirls.'],
  ];

  /* =====================================================================================
   *  2. TRANSLATOR (reversible)
   * ===================================================================================== */
  const T = {
    nodes: new Map(),     // text node -> { orig, now }
    attrs: new Map(),     // element -> Map(attr -> { orig, now })
    pending: new Set(), queued: false, mo: null,
    ok(n) { return n.parentElement && !n.parentElement.closest(SKIP); },
    text(n) {
      if (!this.ok(n)) return;
      const rec = this.nodes.get(n), raw = n.nodeValue;
      if (rec && rec.now === raw) return;              // already ours
      const out = plain(raw);
      if (out != null) { this.nodes.set(n, { orig: raw, now: out }); n.nodeValue = out; }
    },
    attr(e, a) {
      if (e.closest(SKIP) && e.tagName !== 'BUTTON') return;
      const v = e.getAttribute(a); if (!v) return;
      const m = this.attrs.get(e); const rec = m && m.get(a);
      if (rec && rec.now === v) return;
      const out = plain(v);
      if (out != null) { const mm = m || new Map(); mm.set(a, { orig: v, now: out }); this.attrs.set(e, mm); e.setAttribute(a, out); }
    },
    scan(rootEl) {
      const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) this.text(n);
      (rootEl.nodeType === 1 ? [rootEl, ...rootEl.querySelectorAll('[title],[aria-label]')] : []).forEach(e => { this.attr(e, 'title'); this.attr(e, 'aria-label'); });
    },
    flush() {
      this.queued = false;
      for (const x of this.pending) { if (x.nodeType === 3) this.text(x); else if (x.nodeType === 1) this.scan(x); }
      this.pending.clear();
    },
    start() {
      this.scan(document.body);
      this.mo = new MutationObserver(list => {
        for (const m of list) {
          if (m.type === 'characterData') this.pending.add(m.target);
          else if (m.type === 'attributes') this.attr(m.target, m.attributeName);
          else m.addedNodes.forEach(n => { if (n.nodeType === 3 || n.nodeType === 1) this.pending.add(n); });
        }
        if (!this.queued && this.pending.size) { this.queued = true; requestAnimationFrame(() => this.flush()); }
      });
      this.mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label'] });
    },
    stop() {
      if (this.mo) { this.mo.disconnect(); this.mo = null; }
      this.pending.clear();
      for (const [n, r] of this.nodes) if (n.isConnected && n.nodeValue === r.now) n.nodeValue = r.orig;
      for (const [e, m] of this.attrs) for (const [a, r] of m) if (e.isConnected && e.getAttribute(a) === r.now) e.setAttribute(a, r.orig);
      this.nodes.clear(); this.attrs.clear();
    },
  };

  /* =====================================================================================
   *  3. SWAPPABLE CONTENT (help, tour, experiments) - originals kept so we can restore them
   * ===================================================================================== */
  const saved = { help: {}, tour: null, recipes: {} };
  function swapContent() {
    for (const [k, [title, body]] of Object.entries(HELP_S)) {
      const h = NF.HELP[k]; if (!h) continue;
      saved.help[k] = { title: h.title, short: h.short, body: h.body };
      h.title = title; h.short = body; h.body = body;
    }
    saved.tour = NF.TOUR.slice(); NF.TOUR.splice(0, NF.TOUR.length, ...TOUR_S);
    for (const r of NF.RECIPES) { const s = RECIPES_S[r.id]; if (!s) continue; saved.recipes[r.id] = { name: r.name, note: r.note }; r.name = s[0]; r.note = s[1]; }
  }
  function restoreContent() {
    for (const [k, v] of Object.entries(saved.help)) Object.assign(NF.HELP[k], v);
    if (saved.tour) NF.TOUR.splice(0, NF.TOUR.length, ...saved.tour);
    for (const r of NF.RECIPES) if (saved.recipes[r.id]) Object.assign(r, saved.recipes[r.id]);
    saved.help = {}; saved.tour = null; saved.recipes = {};
  }

  /* =====================================================================================
   *  4. MISSIONS (kid versions of the challenges, run by the same scoring engine)
   * ===================================================================================== */
  const pct = v => (v * 100).toFixed(0) + ' / 100';
  const is = (label, fn) => ({ label, test: l => { const ok = !!fn(l); return { ok, now: '', progress: ok ? 1 : 0 }; } });
  const atLeast = (label, get, target, fmt) => ({ label, test: l => { const v = get(l); return { ok: v >= target, now: fmt(v), progress: Math.max(0, Math.min(1, v / target)) }; } });
  const atMost = (label, get, target, fmt) => ({ label, test: l => { const v = get(l); return { ok: v <= target, now: fmt(v), progress: v <= target ? 1 : Math.max(0, Math.min(1, target / v)) }; } });
  const above = (label, get, target, fmt) => ({ label, test: l => { const v = get(l); return { ok: v > target, now: fmt(v), progress: Math.max(0, Math.min(1, v / target)) }; } });
  const onlyXY = l => l.cfg.features.length === 2 && l.cfg.features.includes('x1') && l.cfg.features.includes('x2');
  const MISSIONS = [
    { id: 'k-checkers', title: 'Checkers with 3 neurons',
      goal: 'Teach the brain the Checkers puzzle with only 3 neurons in total (counting the final answer neuron), using just the two basic clues.',
      hint: 'You start with 5 neurons. Click the − next to Stage 1 until it has 2, then press Start over. Tiny brains get unlucky sometimes: press New puzzle and try again!',
      setup: { dataset: 'xor', noise: 5, count: 300, features: ['x1', 'x2'], hidden: [4], act: 'swish', lr: 0.05, seed: 7 },
      conds: [is('Puzzle: Checkers', l => l.cfg.dataset === 'xor'), is('Clues: Across and Height only', onlyXY),
        atMost('3 neurons or fewer', l => l.totalNeurons, 3, v => String(v)), atLeast('Quiz score at least 95', l => l.metrics.testAcc, 0.95, pct)] },
    { id: 'k-swirl', title: 'Conquer the Swirl',
      goal: 'Get a quiz score of 95 on the Swirl, using at least 300 dots.',
      hint: 'One small stage will get stuck around 70. Add stages with the + and give each a good handful of neurons. Then be patient: it takes a few hundred rounds.',
      setup: { dataset: 'spiral', noise: 2, count: 600, features: ['x1', 'x2'], hidden: [8, 6], act: 'tanh', lr: 0.01, speed: 2, seed: 7 },
      conds: [is('Puzzle: Swirl', l => l.cfg.dataset === 'spiral'), atLeast('At least 300 dots', l => l.cfg.count, 300, v => String(v)),
        atLeast('Quiz score at least 95', l => l.metrics.testAcc, 0.95, pct)] },
    { id: 'k-bullseye', title: 'Bullseye with basic clues',
      goal: 'Get a quiz score of 97 on the Bullseye using only Across and Height clues.',
      hint: 'A straight line can’t go around a circle. Add a stage with 3 or 4 neurons so the brain can bend its line.',
      setup: { dataset: 'circle', noise: 5, count: 300, features: ['x1', 'x2'], hidden: [], act: 'tanh', lr: 0.03, seed: 7 },
      conds: [is('Puzzle: Bullseye', l => l.cfg.dataset === 'circle'), is('Clues: Across and Height only', onlyXY), atLeast('Quiz score at least 97', l => l.metrics.testAcc, 0.97, pct)] },
    { id: 'k-memorize', title: 'Memorize on purpose',
      goal: 'Make the brain memorize: get its practice mistakes under 0.01 while its quiz mistakes stay above 0.30 (with messiness of at least 15%).',
      hint: 'Few, messy dots and a giant brain is the recipe. Load the setup and let it run for a few hundred rounds, then watch the two lines on the Mistakes graph split apart.',
      setup: { dataset: 'circle', noise: 35, count: 100, split: 50, features: ['x1', 'x2'], hidden: [12, 12, 12], act: 'tanh', lr: 0.03, batch: 8, speed: 2, seed: 7 },
      conds: [atLeast('Messiness at least 15%', l => l.cfg.noise, 15, v => v + '%'),
        { label: 'Practice mistakes under 0.01', test: l => { const v = l.metrics.trainLoss; return { ok: v < 0.01, now: v.toFixed(4), progress: v < 0.01 ? 1 : Math.max(0, Math.min(1, 0.01 / v)) }; } },
        above('Quiz mistakes over 0.30', l => l.metrics.testLoss, 0.3, v => v.toFixed(3))] },
    { id: 'k-moons', title: 'Tiny brain, two moons',
      goal: 'Separate the Two moons with a quiz score of 97 using no more than 4 neurons in total.',
      hint: 'Six and four neurons is a luxury. Three neurons in a single stage, plus the answer neuron, is enough for a clean curve.',
      setup: { dataset: 'moons', noise: 8, count: 300, features: ['x1', 'x2'], hidden: [6, 4], act: 'tanh', lr: 0.03, seed: 7 },
      conds: [is('Puzzle: Two moons', l => l.cfg.dataset === 'moons'), atMost('4 neurons or fewer', l => l.totalNeurons, 4, v => String(v)),
        atLeast('Quiz score at least 97', l => l.metrics.testAcc, 0.97, pct)] },
  ];

  const mergeSolved = obj => { try { return Object.assign(JSON.parse(localStorage.getItem('neuronforge.solved') || '{}'), obj); } catch (e) { return obj; } };
  class Missions extends NF.Challenges {
    constructor(l, host, api) {
      const keep = NF.CHALLENGES; NF.CHALLENGES = MISSIONS;
      try { super(l, host, api); } finally { NF.CHALLENGES = keep; }
    }
    start(id) {
      const ch = MISSIONS.find(c => c.id === id);
      this.active = id; this.streak = 0; this.api.load(ch.setup);
      U.toast('Mission loaded: ' + ch.title); this.update();
    }
    win(card) { this.solved = mergeSolved(this.solved); super.win(card); }
  }

  /* =====================================================================================
   *  5. COACH
   * ===================================================================================== */
  const FACE = '<svg viewBox="0 0 64 64" aria-hidden="true"><line x1="32" y1="6" x2="32" y2="14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="32" cy="5" r="3" fill="var(--amber)"/>' +
    '<rect x="9" y="14" width="46" height="40" rx="14" fill="rgba(255,178,36,.12)" stroke="currentColor" stroke-width="2.4"/>' +
    '<circle class="eye" cx="23" cy="31" r="4.4" fill="currentColor"/><circle class="eye" cx="41" cy="31" r="4.4" fill="currentColor"/>' +
    '<path class="mouth mouth--happy" d="M22 42q10 9 20 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path class="mouth mouth--flat" d="M23 44h18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path class="mouth mouth--sad" d="M22 47q10 -8 20 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

  const coach = { node: null, say: null, tip: null, chips: {}, hist: [], key: '', timer: 0 };
  function buildCoach() {
    if (coach.node) return;
    coach.say = el('p', { id: 'coach-say' });
    coach.tip = el('p', { class: 'coach__tip', id: 'coach-tip' });
    const chip = (k, label) => { const b = el('b', null, '0'); coach.chips[k] = b; return el('span', null, label + ' ', b); };
    coach.node = el('section', { class: 'panel coach', id: 'panel-coach', 'aria-label': 'Coach', 'data-keep': '' },
      el('div', { class: 'coach__row' }, el('div', { class: 'coach__face', 'data-mood': 'happy', html: FACE }),
        el('div', { class: 'coach__bubble', role: 'status', 'aria-live': 'polite' }, el('span', { class: 'coach__name' }, 'Coach'), coach.say)),
      el('div', { class: 'coach__chips' }, chip('rounds', 'Rounds'), chip('train', 'Practice score'), chip('test', 'Quiz score')), coach.tip);
    $('.col--right').prepend(coach.node);
    // a plain-words legend for the map (the technical one is hidden in this mode)
    const probe = $('.probe');
    coach.legend = el('div', { class: 'legend legend--simple', 'data-keep': '', 'aria-label': 'Legend' },
      el('div', null, el('span', { class: 'sw sw--pos' }), 'Orange dots: team Orange'), el('div', null, el('span', { class: 'sw sw--neg' }), 'Blue dots: team Blue'),
      el('div', null, el('span', { class: 'sw sw--train' }), 'Solid dot: practice  ', el('span', { class: 'sw sw--test' }), 'Ringed dot: quiz'),
      el('div', null, el('span', { class: 'sw sw--line' }), 'Glowing line: where the brain changes its mind'), el('div', null, el('span', { class: 'sw sw--err' }), 'White center: it got this dot wrong'));
    probe.insertBefore(coach.legend, $('.legend', probe).nextSibling);
  }

  /** One of: [moodKey, face, text, tip] chosen from what the network is doing. */
  function think() {
    const m = lab.metrics, e = lab.epoch, h = coach.hist, playing = app.isPlaying();
    const tr = m.trainAcc, te = m.testAcc;
    const last = h.slice(-6);
    const flat = last.length >= 6 && Math.max(...last.map(x => x.te)) - Math.min(...last.map(x => x.te)) < 0.015;
    const jumpy = h.length >= 6 && (() => { const l = h.slice(-6).map(x => x.trl); let flips = 0; for (let i = 2; i < l.length; i++) if ((l[i] - l[i - 1]) * (l[i - 1] - l[i - 2]) < 0 && Math.abs(l[i] - l[i - 1]) > 0.1 * Math.max(l[i - 1], 1e-6)) flips++; return flips >= 3; })();
    if (lab.diverged) return ['blown', 'sad', 'Oh no, the numbers blew up! The steps were so big that the brain lost control. Slide “Step size” lower, then press “Start over”.', 'Tip: smaller steps are slower but steadier.'];
    if (e < 2) return playing
      ? ['begin', 'happy', 'Here we go! Right now the brain is just guessing, so the map looks mixed up. Watch the colors change as it practices.', 'Tip: use + and − on the little brain to give it more neurons.']
      : ['hello', 'happy', 'Hi, I’m your Coach! The dots are two teams, orange and blue. The little brain has to color the map so every dot sits on its own team’s color. Press Start and watch it learn.', 'Tip: press “Guide” at the top for a quick tour.'];
    if (te >= 0.95) return ['solved', 'happy', 'You did it! The brain gets almost every dot right, even the quiz dots it has never practiced on.', 'Try another puzzle from “The dots”, or take on a Mission.'];
    if (e >= 80 && tr - te >= 0.12) return ['memorizing', 'sad', 'Careful! The practice score is much higher than the quiz score. The brain is memorizing the practice dots instead of learning the real pattern, like memorizing answers without understanding the lesson.', 'Try more dots or fewer neurons, and see if the quiz score catches up.'];
    if (jumpy && cfgHighStep()) return ['bouncy', 'sad', 'The mistakes are bouncing all over the place. The steps are probably too big, so the brain keeps overshooting.', 'Slide “Step size” lower.'];
    if (e >= 40 && flat && playing) return cfg.hidden.length === 0
      ? ['line', 'flat', 'With no stage in the middle, the brain can only draw one straight line, and this puzzle needs a bend. It is stuck!', 'Press the + next to “stages” to give it more brain power.']
      : ['stuck', 'flat', 'The score stopped growing. Maybe the brain needs more neurons, a different clue, or just a fresh start.', 'Try + on a stage, or press “New puzzle” for a new try.'];
    if (!playing) return ['paused', 'flat', 'Paused. Look at the map: the orange parts are where the brain thinks “orange team”, and the blue parts are where it thinks “blue team”.', 'Point at the map to see what it guesses at any spot.'];
    return ['learning', 'happy', 'It’s getting better! Each round, the brain turns its dials a tiny bit so it makes fewer mistakes.', 'Watch the Mistakes graph: the lines should slide downhill.'];
  }
  const cfgHighStep = () => cfg.lr >= 0.3;
  function tickCoach() {
    if (!coach.node || !document.body.classList.contains('simple')) return;
    const m = lab.metrics;
    coach.hist.push({ te: m.testAcc, trl: m.trainLoss }); if (coach.hist.length > 20) coach.hist.shift();
    coach.chips.rounds.textContent = lab.epoch.toLocaleString('en-US');
    coach.chips.train.textContent = Math.round(m.trainAcc * 100) + ' / 100';
    coach.chips.test.textContent = Math.round(m.testAcc * 100) + ' / 100';
    const [key, mood, text, tip] = think();
    if (key !== coach.key) {
      coach.key = key; coach.say.textContent = text; coach.tip.textContent = tip;
      coach.node.querySelector('.coach__face').dataset.mood = mood;
    }
    missions && missions.update();
  }

  /* =====================================================================================
   *  6. THE SWITCH
   * ===================================================================================== */
  const btn = el('button', { class: 'btn btn--simple', id: 'btn-simple', type: 'button', 'data-keep': '', 'aria-pressed': 'false', title: 'Explain everything in plain words (E)' },
    el('span', { html: '<svg><use href="#i-bulb"/></svg>' }).firstChild, el('span', null, 'Simple mode'));
  $('.top-actions').prepend(btn);

  let missions = null, on = false, missionTab = null, missionPanel = null;
  function buildMissions() {
    if (missions) return;
    missionPanel = el('div', { class: 'tabpanel', role: 'tabpanel', id: 'tp-missions', 'aria-labelledby': 'tab-missions', hidden: true });
    missionTab = el('button', { class: 'tab', role: 'tab', id: 'tab-missions', 'aria-selected': 'false', 'aria-controls': 'tp-missions', 'data-keep': '' }, 'Missions');
    $('#tab-challenges').after(missionTab); $('#tp-challenges').after(missionPanel);
    missions = new Missions(lab, missionPanel, { load: app.loadConfig, celebrate: node => NF.confetti(node) });
    missionTab.addEventListener('click', () => showTab('missions'));
    ['challenges', 'learn'].forEach(t => $('#tab-' + t).addEventListener('click', () => { missionTab.setAttribute('aria-selected', 'false'); missionPanel.hidden = true; }));
  }
  function showTab(t) {
    ['challenges', 'learn', 'missions'].forEach(o => { $('#tab-' + o).setAttribute('aria-selected', o === t); $('#tp-' + o).hidden = o !== t; });
  }
  function buildGlossary() {
    $('#tp-learn').replaceChildren(
      el('p', { style: 'color:var(--text-dim);font-size:13.5px;line-height:1.6;margin:0 0 12px' }, 'A neuron is a tiny voter. A brain is lots of voters passing votes along. Practicing means turning thousands of dials a tiny bit until the brain makes fewer mistakes. Tap a word to learn it.'),
      el('div', { class: 'btns' }, el('button', { class: 'btn btn--sm', type: 'button', onclick: () => app.tour.open(0) }, 'Take the guide')),
      ...GLOSSARY.map(([w, d]) => el('details', null, el('summary', null, w), el('p', null, d))));
  }
  function patchMainChallenges() {   // the two engines share one storage key; never let either overwrite the other's progress
    const c = app.challenges; if (c.__merge) return; c.__merge = true;
    const win = c.win; c.win = function (card) { this.solved = mergeSolved(this.solved); return win.call(this, card); };
  }

  function enable(first) {
    if (on) return; on = true;
    document.body.classList.add('simple'); btn.setAttribute('aria-pressed', 'true');
    swapContent(); buildCoach(); buildMissions(); patchMainChallenges(); buildGlossary();
    T.start(); showTab('missions');
    coach.key = ''; coach.hist = []; tickCoach(); coach.timer = setInterval(tickCoach, 1000);
    store.set('simple', '1');
    if (first !== true) U.toast('Simple mode on: everything is in plain words.');
    if (!store.get('simpletour') && first !== true) { store.set('simpletour', '1'); setTimeout(() => app.tour.open(0), 500); }
  }
  function disable() {
    if (!on) return; on = false;
    clearInterval(coach.timer);
    T.stop(); restoreContent();
    document.body.classList.remove('simple'); btn.setAttribute('aria-pressed', 'false');
    showTab('challenges'); app.renderLearn();
    store.set('simple', '0');
    U.toast('Back to the full version.');
  }
  const toggle = () => (on ? disable() : enable());
  btn.addEventListener('click', toggle);
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'e') return;
    const t = e.target, tag = t.tagName;
    if (tag === 'INPUT' && t.type !== 'range' || tag === 'TEXTAREA' || tag === 'SELECT' || app.tour.isOpen()) return;
    toggle();
  });

  NF.simple = { enable, disable, toggle, isOn: () => on, plain, think, DICT };
  app.simple = NF.simple;
  const wanted = store.get('simple') === '1' || /[?&#]simple\b/.test(location.search + location.hash);
  if (wanted) enable(true);
})(typeof globalThis !== 'undefined' ? globalThis : window);
