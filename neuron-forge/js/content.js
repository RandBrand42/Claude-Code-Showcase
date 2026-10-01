/* NEURON FORGE - words: help text, recipes and tour script.
 * `short` is the hover tooltip; `body` is the fuller explanation shown in the Learn tab.
 */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};

  NF.HELP = {
    dataset: {
      title: 'The data',
      short: 'Every dot is an example with two coordinates and a class: amber = +1, cyan = −1. The network must colour the whole plane so each dot lands in its own colour.',
      body: 'Every dot is one example: two coordinates and a class. Amber dots are class +1, cyan dots are class −1. The network’s whole job is to colour the plane so that each dot sits in a region of its own colour. Keys 1–7 switch datasets. Circle, Ring & Core, XOR, Spiral and Checkerboard cannot be solved with a single straight line, which is exactly why hidden layers exist.',
    },
    noise: {
      title: 'Noise',
      short: 'Random jitter added to every point. With more noise the classes overlap, so even a perfect model makes mistakes.',
      body: 'Random jitter added to every point. As noise rises the two classes overlap, so even a perfect model has to make some mistakes. A network that somehow gets every noisy point right has not found the pattern; it has memorised the noise. That is overfitting, and you can cause it on purpose here.',
    },
    split: {
      title: 'Train / test split',
      short: 'Solid dots are used for learning. Ringed dots are only ever used for grading. The gap between the two scores reveals overfitting.',
      body: 'Solid dots are the training set: the optimiser looks at them and adjusts weights. Ringed dots are the test set: the network never learns from them, they only grade it. If training accuracy is high but test accuracy is low, the network has memorised instead of understood. Move the slider to change how many points are held back.',
    },
    count: {
      title: 'Samples',
      short: 'How many points there are in total. Few points are easy to memorise; many points force the network to find the real pattern.',
      body: 'Total number of points. With few points a big network can memorise every one of them and look brilliant on training data while failing on the test set. With many points it must learn the real shape.',
    },
    features: {
      title: 'Input features',
      short: 'What the network is allowed to see. x₁ and x₂ are raw coordinates; squares, products and sines are ready-made hints. Each thumbnail shows the feature across the plane.',
      body: 'Inputs are what the network is allowed to see. x₁ and x₂ are the raw coordinates. The others are hints computed for it: x₁² and x₂² turn a circle into a straight-line problem, x₁·x₂ makes XOR trivial, and the sines help with anything periodic, like the checkerboard. Each thumbnail shows that feature painted over the plane. Turn all hints off and make the network work out the geometry on its own using hidden layers.',
    },
    network: {
      title: 'The network',
      short: 'Each column is a layer. Each circle is a neuron showing what it computes across the plane. Edges are weights: amber positive, cyan negative. Use ± to reshape the net. Hover a neuron, click an edge.',
      body: 'Each column is a layer; each circle is a neuron. The picture inside a neuron is what it computes over the whole plane, so you can see the shapes each one contributes. Edges are weights: amber excites, cyan inhibits, thicker means stronger. Drifting particles show signal flowing while it trains (hover the decision boundary to watch one point travel through). Use the ± pills to add or remove neurons and layers without losing what has already been learned. Hover a neuron for a close-up, click an edge to set its weight yourself.',
    },
    boundary: {
      title: 'Decision boundary',
      short: 'The network’s opinion at every location. Amber = confident +1, cyan = confident −1, dark = undecided. The glowing line is where output = 0.5. A white core marks a point it currently gets wrong.',
      body: 'The network’s opinion at every location of the plane. Amber means confident class +1, cyan means confident class −1, dark means undecided. The glowing line is where the output crosses 0.5, which is the decision boundary. Solid dots are training points, ringed dots are test points, and a white core marks a point the network currently gets wrong. Hover anywhere for the exact prediction.',
    },
    hidden: {
      title: 'Hidden layers',
      short: 'Hidden layers transform the inputs step by step. Each neuron adds one bend to the plane; the next layer combines bends into shapes.',
      body: 'Hidden layers transform the inputs step by step. One layer of neurons can draw several folds and combine them into a blob. The next layer combines blobs into more complex shapes. More neurons and layers means a more flexible model, but also slower training and an easier time overfitting. The solution to XOR needs just two hidden neurons; the spiral wants several layers.',
    },
    act: {
      title: 'Activation function',
      short: 'The bend. After a neuron sums its weighted inputs, the activation squashes or clips the total. Without it, stacked layers collapse into one straight line.',
      body: 'After a neuron adds up its weighted inputs, the activation function bends the total. Without it, any number of layers collapses into one big linear equation, which can only draw straight lines. tanh and sigmoid are smooth and bounded; ReLU is cheap and sparse but a neuron whose input is always negative goes dead (look for red stripes on neurons); Leaky ReLU leaves a small slope so dead neurons can recover; swish is smooth with a tiny dip; linear does nothing at all, so try it and watch the boundary refuse to curve.',
    },
    loss: {
      title: 'Loss function',
      short: 'Wrongness as a single number. Cross-entropy punishes confident mistakes hard and is the usual classification choice. Mean squared error measures plain distance.',
      body: 'Loss is how wrong the network is, as a single number that training tries to push down. Cross-entropy punishes confident mistakes very hard, which gives strong learning signals and is the standard for classification. Mean squared error measures plain distance to the target and is gentler. Changing it restarts the weights, because the output neuron changes meaning.',
    },
    opt: {
      title: 'Optimiser',
      short: 'How weights are nudged each step. SGD follows the slope. Momentum keeps rolling the way it has been heading. Adam also tunes the step size per weight and is usually the most forgiving.',
      body: 'How the gradient becomes a weight update. SGD steps straight down the slope. Momentum remembers its recent direction, rolling through small bumps and smoothing zig-zags. Adam also rescales the step for every weight individually, which makes it fast and forgiving, so it is the default. Try SGD with a small learning rate to feel the difference.',
    },
    lr: {
      title: 'Learning rate',
      short: 'Step size. Too small and learning crawls; too large and the loss zig-zags or explodes. Watch the loss curve while you slide it.',
      body: 'The size of each step. Too small and training crawls (or never gets out of a flat region). Too large and each step overshoots: the loss zig-zags, spikes or never settles. There is no universal best value; it depends on the optimiser. Adam likes 0.003–0.05, plain SGD often wants something larger. Crank it to the maximum on Adam to watch a run come apart.',
    },
    batch: {
      title: 'Batch size',
      short: 'How many examples are averaged per weight update. Small batches are noisy but update often; "all" uses the entire training set each time.',
      body: 'How many training points are averaged into each weight update. Small batches give noisy but frequent updates (the noise can even help escape bad spots). Large batches are smoother but make fewer updates per pass. The last notch, all, uses the entire training set for every update.',
    },
    l2: {
      title: 'L2 regularisation',
      short: 'Penalises large weights, nudging the network toward smoother, simpler boundaries. A first-line defence against overfitting.',
      body: 'Adds a penalty for large weights (their squared size). The network then prefers small weights, which means smoother, simpler boundaries. It is the standard first defence against overfitting: load the Overfit recipe, then raise L2 and watch the test loss stop climbing.',
    },
    l1: {
      title: 'L1 regularisation',
      short: 'Penalises the sum of absolute weights, pushing unimportant ones all the way to zero. Watch edges fade out of the diagram.',
      body: 'Adds a penalty on the absolute size of each weight. Unlike L2 it pushes unimportant weights all the way to exactly zero, so the network effectively prunes itself. Raise it and watch edges fade out of the diagram and the weight histogram spike at zero.',
    },
    init: {
      title: 'Weight initialisation',
      short: 'Where the weights start. Xavier keeps signal size steady through tanh and sigmoid; He is scaled for ReLU-family activations. Changing it restarts the run.',
      body: 'Where weights start before any learning. Weights that are too big or too small make signals explode or fade as they pass through layers, which can stall training before it begins. Xavier keeps the signal size steady for tanh and sigmoid; He is scaled up for ReLU-style activations. Changing it restarts the run.',
    },
    seed: {
      title: 'Seed',
      short: 'Every random choice (data, starting weights, shuffling) flows from this number. Same seed and settings replay the same run exactly. New seed rolls the dice.',
      body: 'Every random choice (the data cloud, starting weights, the shuffle order) flows from this number. The same seed with the same settings replays the same run, bit for bit, so you can share a configuration and a friend sees what you saw. Type a number or press New seed to roll the dice; some seeds get stuck in a bad spot, which is a lesson in itself.',
    },
    speed: {
      title: 'Speed',
      short: 'Epochs of training per animation frame. ¼ is slow enough to watch every wobble; 50 is for impatient spirals.',
      body: 'Epochs of training per animation frame (an epoch is one full pass over the training points). The slowest setting lets you watch every wobble of the boundary; the fastest is for long, hard problems like the spiral. Training always pauses while the tab is hidden.',
    },
    losschart: {
      title: 'Loss curves',
      short: 'Train loss is what the optimiser minimises; test loss is data it never sees. If train keeps falling while test turns upward, the network has started memorising: overfitting.',
      body: 'The bright line is train loss, which is what the optimiser is minimising. The violet line is test loss, measured on points the network never learns from. Early on both fall together. If train keeps falling while test turns upward, the network has started memorising and you are watching overfitting happen. Toggle log scale to see small late improvements, and hover the chart to read any epoch.',
    },
    accuracy: {
      title: 'Accuracy',
      short: 'The share of points on the correct side of the boundary. Compare train and test rings.',
      body: 'The share of points on the correct side of the boundary. Compare the train and test rings: a big gap means overfitting.',
    },
    actplot: {
      title: 'Activation plot',
      short: 'The chosen activation (solid) and its slope (dashed). Dots show where real neurons’ inputs currently land on the curve. Flat regions give almost no learning signal.',
      body: 'The chosen activation function (solid) and its derivative (dashed). Dots show where the actual pre-activation values of the neurons land on the curve right now. Where the curve is flat the derivative is near zero, and almost no learning signal gets through: this is the vanishing-gradient problem, and why saturated tanh neurons learn slowly.',
    },
    hist: {
      title: 'Weight histograms',
      short: 'Distribution of weights in each layer. Amber bars are positive, cyan negative. Healthy nets spread around zero; L1 makes a spike at zero.',
      body: 'The distribution of weights in each layer. Amber bars are positive weights, cyan are negative. Healthy networks spread around zero. Runaway weights (a long, flat tail) hint at instability; L1 regularisation creates a tall spike at zero.',
    },
    epoch: {
      title: 'Epoch',
      short: 'One full pass over every training example.',
      body: 'One full pass over every training example.',
    },
  };
  NF.HELP_ORDER = ['dataset', 'noise', 'split', 'count', 'features', 'network', 'hidden', 'act', 'loss', 'opt', 'lr', 'batch', 'l2', 'l1', 'init', 'seed', 'speed', 'boundary', 'losschart', 'accuracy', 'actplot', 'hist', 'epoch'];

  /* One-click configurations. Anything not listed keeps the default. */
  NF.RECIPES = [
    { id: 'xor1', name: 'A single neuron can’t do XOR', note: 'No hidden layer: one straight line. Watch accuracy stall near 50–65%.',
      cfg: { dataset: 'xor', noise: 5, count: 300, features: ['x1', 'x2'], hidden: [], act: 'tanh', lr: 0.03 } },
    { id: 'xor2', name: 'Two hidden neurons can', note: 'Just two neurons (swish is forgiving here) fold the plane into the XOR pattern.',
      cfg: { dataset: 'xor', noise: 5, count: 300, features: ['x1', 'x2'], hidden: [2], act: 'swish', lr: 0.05, seed: 7 } },
    { id: 'xor3', name: 'Cheat with a feature: x₁·x₂', note: 'Give the neuron the product of the coordinates and XOR becomes a straight line.',
      cfg: { dataset: 'xor', noise: 5, count: 300, features: ['x1x2'], hidden: [], act: 'tanh', lr: 0.05 } },
    { id: 'circle', name: 'Circle = a line in squared space', note: 'Feed it x₁² and x₂² and a single neuron draws the circle.',
      cfg: { dataset: 'circle', noise: 3, count: 300, features: ['x1sq', 'x2sq'], hidden: [], act: 'tanh', lr: 0.1 } },
    { id: 'spiral', name: 'Spiral, the deep way', note: 'Raw coordinates only, four hidden layers. Give it a few hundred epochs.',
      cfg: { dataset: 'spiral', noise: 2, count: 600, features: ['x1', 'x2'], hidden: [12, 12, 8, 6], act: 'tanh', opt: 'adam', lr: 0.01, speed: 1 } },
    { id: 'checker', name: 'Sine shortcut on the checkerboard', note: 'Periodic features turn a 16-tile board into a tiny puzzle.',
      cfg: { dataset: 'checker', noise: 3, count: 500, features: ['x1', 'x2', 's1', 's2'], hidden: [6, 4], lr: 0.03 } },
    { id: 'overfit', name: 'Overfit on purpose', note: 'Small, noisy data and a big network. Train loss hits zero while test loss climbs.',
      cfg: { dataset: 'circle', noise: 35, count: 100, split: 50, features: ['x1', 'x2'], hidden: [12, 12, 12], lr: 0.03, batch: 8, l2: 0, speed: 1 } },
    { id: 'tame', name: 'Tame it with L2', note: 'Same doomed setup, plus a little weight decay. Test loss stops climbing.',
      cfg: { dataset: 'circle', noise: 35, count: 100, split: 50, features: ['x1', 'x2'], hidden: [12, 12, 12], lr: 0.03, batch: 8, l2: 0.001, speed: 1 } },
    { id: 'lrhigh', name: 'Learning rate far too high', note: 'Adam at 1.0 on two moons: watch the loss curve thrash around.',
      cfg: { dataset: 'moons', noise: 8, count: 300, features: ['x1', 'x2'], hidden: [6, 4], opt: 'adam', lr: 1, speed: 1 } },
    { id: 'lrlow', name: 'Learning rate far too low', note: 'SGD at 0.0003 barely moves. Patience is not a strategy.',
      cfg: { dataset: 'moons', noise: 8, count: 300, features: ['x1', 'x2'], hidden: [6, 4], opt: 'sgd', lr: 0.0003, speed: 5 } },
  ];

  NF.TOUR = [
    { target: '.topbar', pad: 6, title: 'This network is learning right now',
      body: 'Nothing here is a recording. A real neural network, written from scratch, is training in your browser on the dots you see. Play, pause or step one epoch at a time, and press R to re-run the same experiment from the same seed.' },
    { target: '#panel-features', title: 'Inputs: what the network sees',
      body: 'The network only receives the numbers you switch on here. Raw coordinates are enough for easy problems; ready-made hints such as x₁² or a sine can turn hard problems into easy ones. Try turning them all off.' },
    { target: '#panel-net', title: 'Hidden layers: the machinery',
      body: 'Each column is a layer and each circle a neuron, with a live picture of what it computes across the plane. Use the ± pills to add neurons or layers. More is not always better, but fewer than you need can never work.' },
    { target: '#netview', title: 'Weights: the knobs that are learned',
      body: 'Every edge is a weight. Amber pushes a neuron up, cyan pushes it down, thicker means stronger. Training is nothing more than nudging these numbers. Click any edge to set a weight by hand and watch the map react.' },
    { target: '#train-ctl .select', title: 'Activation: the bend',
      body: 'Without a non-linear activation, a stack of layers is just one straight line in disguise. Try Linear and watch the boundary refuse to curve. Then try ReLU, where neurons can die and show up striped red.' },
    { target: '#panel-loss', title: 'Loss: one number for wrongness',
      body: 'Training pushes the loss downhill. The bright line is the data it learns from. The violet line is the test set it never touches. Both should fall together.' },
    { target: '#panel-loss', title: 'Overfitting: when they part ways',
      body: 'When train loss keeps falling but test loss turns around and climbs, the network is memorising noise. Load the “Overfit on purpose” recipe and watch it happen, then cure it with L2. The Challenges tab has more.' },
  ];
})(typeof globalThis !== 'undefined' ? globalThis : window);
