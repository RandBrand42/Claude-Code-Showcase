/* RESONANCE - themes.js
 * The list of panel skins (styled in css/themes.css), the choice that is remembered between visits, and the
 * hook that lets a genre style suggest a skin. Studio Graphite is the original look and is represented by
 * having no data-theme attribute on <html>.
 */
(function () {
  'use strict';
  const R = window.R;
  const KEY = 'resonance.v1.theme';

  /* pv = the little colour preview shown in the picker: chassis, side cheek, LCD, and the two accent colours */
  const THEMES = [
    { id: 'graphite', name: 'Studio Graphite', desc: 'The original: anodized graphite, walnut cheeks, amber and cyan LEDs.', pv: { chassis: '#2a2d33', cheek: '#6a3b22', lcd: '#08171b', a: '#ffb23e', b: '#45e0ff' } },
    { id: 'piano', name: 'Grand Piano', desc: 'Black lacquer and ivory. Calm, formal and glossy.', pv: { chassis: '#121316', cheek: '#2c2d33', lcd: '#100e0a', a: '#f1e3bd', b: '#c9dbec' } },
    { id: 'hall', name: 'Concert Hall', desc: 'Burgundy velvet with gold trim, like a theatre box.', pv: { chassis: '#4a1520', cheek: '#7b5a22', lcd: '#170e05', a: '#e8bf66', b: '#f0b8a6' } },
    { id: 'jazz', name: 'Jazz Club', desc: 'Midnight blue, dark oak and a neon sign glow.', pv: { chassis: '#16243b', cheek: '#43301f', lcd: '#08171b', a: '#ffb347', b: '#3ee0c6' } },
    { id: 'amp', name: 'Tube Amp', desc: 'Black tolex, gold faceplate trim and a red pilot lamp.', pv: { chassis: '#151515', cheek: '#c4c7cc', lcd: '#1a1103', a: '#f2c14e', b: '#ff5a3c' } },
    { id: 'kit', name: 'Drum Kit', desc: 'Red sparkle lacquer with chrome hardware.', pv: { chassis: '#7b141d', cheek: '#dfe3e8', lcd: '#130406', a: '#ff7a59', b: '#e8eef6' } },
    { id: 'synthwave', name: 'Neon Synthwave', desc: 'Ultraviolet panel with magenta and cyan glow.', pv: { chassis: '#1a0933', cheek: '#c02fe0', lcd: '#0f0426', a: '#ff4fd8', b: '#3de8ff' } },
  ];
  const byId = Object.fromEntries(THEMES.map((t) => [t.id, t]));

  const Theme = { list: THEMES, byId, current: 'graphite', manual: 'graphite' };

  function apply(id) {
    if (id === 'graphite') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', id);
  }
  /** Choose a skin. auto = true when a genre style suggested it: then it is not remembered as the user's choice. */
  Theme.set = function (id, auto) {
    if (!byId[id]) return false;
    Theme.current = id;
    apply(id);
    if (!auto) {
      Theme.manual = id;
      try { localStorage.setItem(KEY, id); } catch (e) { /* storage unavailable */ }
    }
    R.emit('theme', id);
    return true;
  };

  try { const saved = localStorage.getItem(KEY); if (saved && byId[saved]) { Theme.current = Theme.manual = saved; apply(saved); } } catch (e) { /* storage unavailable */ }

  R.Theme = Theme;
})();
