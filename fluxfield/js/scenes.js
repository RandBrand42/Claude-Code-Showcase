/* FLUXFIELD - scenes, palettes and the "look vector" (FF.scenes).
 * A look is a flat Float32Array so a scene change is just one vector lerp, including palette + background tone. */
(function () {
  'use strict';
  const FF = (window.FF = window.FF || {});

  /** Order of the look vector. pal0..pal11 are sRGB palette components (4 colours x rgb). */
  const KEYS = ['radius', 'force', 'curl', 'dissipation', 'velDissipation', 'bloom', 'threshold', 'rays', 'exposure', 'pressure', 'bg0', 'bg1', 'bg2'];
  for (let i = 0; i < 12; i++) KEYS.push('pal' + i);
  const IDX = {};
  KEYS.forEach((k, i) => (IDX[k] = i));

  /** Scenes. `conductor` tunes the hands-free choreography (tempo, drift speed, curl-noise amount, emitters, gain). */
  const SCENES = [
    { id: 'ink', name: 'Ink in Water', palette: ['#2b5cff', '#00c2ff', '#ff3d9a', '#eaf3ff'],
      radius: 0.012, force: 1.15, curl: 12, dissipation: 0.32, velDissipation: 0.35, bloom: 0.5, threshold: 0.5, rays: 0.12, exposure: 1.0, pressure: 0.8, bg: [0.002, 0.004, 0.012],
      conductor: { bpm: 46, speed: 0.75, swirl: 0.8, emitters: 3, gain: 1.0 } },
    { id: 'aurora', name: 'Aurora', palette: ['#19ffa0', '#00d9c8', '#6d5bff', '#ff5fd2'],
      radius: 0.016, force: 1.0, curl: 26, dissipation: 0.55, velDissipation: 0.3, bloom: 0.75, threshold: 0.4, rays: 0.3, exposure: 1.05, pressure: 0.8, bg: [0.001, 0.008, 0.008],
      conductor: { bpm: 54, speed: 0.9, swirl: 1.1, emitters: 3, gain: 1.05 } },
    { id: 'ember', name: 'Ember', palette: ['#ff3b00', '#ff9500', '#ffd36a', '#c2104a'],
      radius: 0.012, force: 1.4, curl: 40, dissipation: 1.2, velDissipation: 0.2, bloom: 0.9, threshold: 0.35, rays: 0.18, exposure: 1.0, pressure: 0.8, bg: [0.012, 0.003, 0.001],
      conductor: { bpm: 72, speed: 1.15, swirl: 1.0, emitters: 4, gain: 1.15 } },
    { id: 'bio', name: 'Bioluminescence', palette: ['#00ffd5', '#0a84ff', '#7cff6b', '#b84dff'],
      radius: 0.011, force: 0.9, curl: 34, dissipation: 0.55, velDissipation: 0.25, bloom: 1.0, threshold: 0.3, rays: 0.1, exposure: 1.1, pressure: 0.8, bg: [0.0, 0.006, 0.011],
      conductor: { bpm: 40, speed: 0.7, swirl: 1.3, emitters: 4, gain: 0.95 } },
    { id: 'nebula', name: 'Nebula Nursery', palette: ['#ff4fa3', '#7b4dff', '#ffb066', '#2ee6ff'],
      radius: 0.02, force: 1.0, curl: 18, dissipation: 0.22, velDissipation: 0.3, bloom: 0.85, threshold: 0.4, rays: 0.55, exposure: 1.0, pressure: 0.8, bg: [0.009, 0.002, 0.013],
      conductor: { bpm: 38, speed: 0.6, swirl: 0.9, emitters: 3, gain: 1.1 } },
    { id: 'silk', name: 'Silk', palette: ['#ffffff', '#c6d0e0', '#8e9ab0', '#f0e6d6'],
      radius: 0.014, force: 1.1, curl: 6, dissipation: 0.4, velDissipation: 0.4, bloom: 0.4, threshold: 0.5, rays: 0.22, exposure: 1.0, pressure: 0.8, bg: [0.004, 0.004, 0.005],
      conductor: { bpm: 44, speed: 0.6, swirl: 0.5, emitters: 3, gain: 0.9 } },
    { id: 'glass', name: 'Glass Garden', palette: ['#9bffd9', '#ff9ecf', '#ffe37a', '#8fc7ff'],
      radius: 0.015, force: 1.0, curl: 22, dissipation: 0.7, velDissipation: 0.3, bloom: 0.6, threshold: 0.45, rays: 0.35, exposure: 0.95, pressure: 0.8, bg: [0.004, 0.007, 0.008],
      conductor: { bpm: 58, speed: 0.95, swirl: 1.0, emitters: 4, gain: 1.0 } },
  ];

  /** Extra curated palettes (the scene palettes are offered as well). */
  const EXTRA_PALETTES = [
    { id: 'sunset', name: 'Sunset', colors: ['#ff5e62', '#ff9966', '#ffd86f', '#7b2ff7'] },
    { id: 'toxic', name: 'Toxic', colors: ['#b6ff00', '#00ffa3', '#00b3ff', '#ff00c8'] },
    { id: 'candy', name: 'Candy', colors: ['#ff7ad9', '#7afcff', '#fffa7a', '#b27aff'] },
  ];

  /** Slider definitions for the dock (scene-driven parameters). */
  const SLIDERS = [
    { key: 'radius', label: 'Brush', min: 0.004, max: 0.05, step: 0.001, fmt: (v) => (v * 1000).toFixed(0) },
    { key: 'force', label: 'Force', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
    { key: 'curl', label: 'Vorticity', min: 0, max: 60, step: 1, fmt: (v) => v.toFixed(0) },
    { key: 'dissipation', label: 'Dye fade', min: 0, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
    { key: 'bloom', label: 'Bloom', min: 0, max: 2, step: 0.02, fmt: (v) => v.toFixed(2) },
    { key: 'rays', label: 'Light rays', min: 0, max: 1.5, step: 0.02, fmt: (v) => v.toFixed(2) },
    { key: 'exposure', label: 'Exposure', min: 0.4, max: 2.2, step: 0.02, fmt: (v) => v.toFixed(2) },
  ];

  function vectorFor(scene) {
    const v = new Float32Array(KEYS.length);
    for (const k of KEYS) if (k in scene && typeof scene[k] === 'number') v[IDX[k]] = scene[k];
    v[IDX.bg0] = scene.bg[0]; v[IDX.bg1] = scene.bg[1]; v[IDX.bg2] = scene.bg[2];
    setPalette(v, scene.palette);
    return v;
  }
  function setPalette(v, hexes) {
    hexes.forEach((h, i) => {
      const rgb = FF.util.hexToRgb(h);
      v[IDX['pal' + i * 3]] = rgb[0]; v[IDX['pal' + (i * 3 + 1)]] = rgb[1]; v[IDX['pal' + (i * 3 + 2)]] = rgb[2];
    });
  }

  FF.scenes = { KEYS, IDX, SCENES, EXTRA_PALETTES, SLIDERS, vectorFor, setPalette };
})();
