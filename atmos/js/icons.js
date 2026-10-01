/* ATMOS - icons.js : hand-drawn animated SVG weather icons (no emoji, no assets). */
(function () {
  'use strict';
  const A = window.Atmos;
  const CLOUD = 'M14 38h22a8 8 0 0 0 1.4-15.9A10.5 10.5 0 0 0 17.2 19.6 9.3 9.3 0 0 0 14 38z';
  const rays = () => { let s = ''; for (let i = 0; i < 8; i++) s += `<line x1="24" y1="4.5" x2="24" y2="9" transform="rotate(${i * 45} 24 24)"/>`; return `<g class="ic-rays" stroke="#ffd36a" stroke-width="2.6" stroke-linecap="round">${s}</g>`; };
  const sun = (cx, cy, s) => `<g transform="translate(${cx} ${cy}) scale(${s}) translate(-24 -24)">${rays()}<circle cx="24" cy="24" r="9" fill="#ffd36a"/><circle cx="24" cy="24" r="9" fill="url(#none)" /></g>`;
  const moon = (cx, cy, s) => `<g transform="translate(${cx} ${cy}) scale(${s}) translate(-24 -24)"><path class="ic-moon" d="M31 10a14 14 0 1 0 8 25A12 12 0 0 1 31 10z" fill="#f2efe2"/><circle class="ic-star" cx="37" cy="13" r="1.3" fill="#fff"/><circle class="ic-star s2" cx="41" cy="22" r="1" fill="#fff"/></g>`;
  const cloud = (dark, x = 0, y = 0) => `<g class="ic-cloud" transform="translate(${x} ${y})"><path d="${CLOUD}" fill="${dark ? '#9aa8bd' : '#f4f7fb'}"/><path d="M14 38h22a8 8 0 0 0 2.6-.6c-2 2.2-4.400 3.400-7 3.400H16c-4 0-5-2-2-2.800z" fill="${dark ? '#7f8ea5' : '#cfd9e8'}" opacity=".6"/></g>`;
  const drops = () => [0, 1, 2].map((i) => `<line class="ic-drop d${i}" x1="${18 + i * 6}" y1="40" x2="${16.500 + i * 6}" y2="45" stroke="#7cc4ff" stroke-width="2.400" stroke-linecap="round"/>`).join('');
  const flakes = () => [0, 1, 2].map((i) => `<circle class="ic-flake d${i}" cx="${18 + i * 6.500}" cy="42" r="1.800" fill="#fff"/>`).join('');
  const bolt = () => '<path class="ic-bolt" d="M25 31l-5 8h4l-2 7 7-10h-4.500l3-5z" fill="#ffd95a"/>';
  const fog = () => [0, 1, 2, 3].map((i) => `<line class="ic-fog f${i % 2}" x1="${10 + (i % 2) * 4}" y1="${18 + i * 7}" x2="${34 + (i % 2) * 4}" y2="${18 + i * 7}" stroke="#dbe4ef" stroke-width="3" stroke-linecap="round" opacity="${0.95 - i * 0.12}"/>`).join('');
  const body = {
    sun: () => sun(24, 24, 1.15),
    moon: () => moon(24, 24, 1.1),
    cloud: () => cloud(false, 0, -3),
    'sun-cloud': () => sun(18, 17, 0.85) + cloud(false, 2, 1),
    'moon-cloud': () => moon(18, 17, 0.8) + cloud(false, 2, 1),
    rain: () => cloud(true, 0, -5) + drops(),
    snow: () => cloud(true, 0, -5) + flakes(),
    storm: () => cloud(true, 0, -6) + bolt(),
    fog: () => fog(),
  };
  A.icon = (k, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${(body[k] || body.cloud)()}</svg>`;

  const ui = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.500"/><path d="M16 16l4 4"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.500"/><path d="M9.600 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1.100.900-1.100 1.700M12 16.800v.1"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.500v13l11-6.500z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.500" y="5.500" width="4" height="13" rx="1.200"/><rect x="13.500" y="5.500" width="4" height="13" rx="1.200"/></svg>',
    now: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L5 13.500h5L9 22l9-12.500h-5.500z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    logo: '<svg viewBox="0 0 32 32" fill="none"><path d="M3 22h26" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 22a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 6v3M6.500 10l2 2M25.500 10l-2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 27h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"/></svg>',
    drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"><path d="M12 3.500s6 6.200 6 10.500a6 6 0 0 1-12 0c0-4.300 6-10.500 6-10.500z"/></svg>',
    wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><path d="M3 9h10a2.500 2.500 0 1 0-2.400-3M3 14h14a2.500 2.500 0 1 1-2.400 3M3 19h6"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600L7 7M17 17l1.400 1.400M5.600 18.400L7 17M17 7l1.400-1.400"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round"><path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l3.500-4.500"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7"/></svg>',
    umbrella: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><path d="M3.500 12a8.500 8.500 0 0 1 17 0zM12 12v6a2 2 0 0 0 4 0"/></svg>',
  };
  A.ui = ui;
})();
