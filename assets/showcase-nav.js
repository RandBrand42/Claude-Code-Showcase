/**
 * showcase-nav.js - a small "back to the gallery" pill shared by every app in the suite.
 *
 * Add to an app's index.html (last thing before </body>):
 *   <script src="../assets/showcase-nav.js" data-pos="bottom-right"></script>
 *
 * data-pos     top-left | top-center | top-right | bottom-left | bottom-center | bottom-right   (default bottom-right)
 * data-offset  "x,y" extra distance in px from the chosen edges, to dodge an app's own controls   (default 14,14)
 * data-compact "true" shows only the icon
 * data-pos-mobile / data-offset-mobile   same, but used on screens up to 760px wide (the pill becomes icon-only there);
 *              data-pos-mobile="none" hides it on phones when the app has no free spot
 *
 * It is a plain link (works from file:// and on a static host), dims itself until hovered or focused,
 * hides while the page is fullscreen, and adds no event listeners to the host app.
 */
(function () {
  'use strict';
  var me = document.currentScript;
  if (!me || document.getElementById('showcase-home')) return;

  var pos = (me.getAttribute('data-pos') || 'bottom-right').split('-');
  var off = (me.getAttribute('data-offset') || '14,14').split(',');
  var compact = me.getAttribute('data-compact') === 'true';

  var css = document.createElement('style');
  css.textContent =
    '#showcase-home{position:fixed;z-index:2147483000;display:inline-flex;align-items:center;gap:7px;box-sizing:border-box;height:32px;padding:0 13px 0 10px;' +
    'border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(10,12,18,.78);color:#eceff7;text-decoration:none;' +
    'font:600 12.5px/1 "Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif;letter-spacing:.01em;opacity:.55;' +
    'box-shadow:0 4px 18px rgba(0,0,0,.35);transition:opacity .2s,transform .2s,background .2s}' +
    '#showcase-home:hover,#showcase-home:focus-visible{opacity:1;background:rgba(18,20,30,.95);transform:translateY(-1px)}' +
    '#showcase-home:focus-visible{outline:2px solid #ffb37a;outline-offset:2px}' +
    '#showcase-home svg{flex:none}' +
    '#showcase-home.compact span{display:none}#showcase-home.compact{padding:0;width:32px;justify-content:center}' +
    '@media (max-width:760px){#showcase-home span{display:none}#showcase-home{padding:0;width:34px;height:34px;justify-content:center}}' +
    '#showcase-home[hidden]{display:none}@media print{#showcase-home{display:none}}';
  document.head.appendChild(css);

  var a = document.createElement('a');
  a.id = 'showcase-home';
  a.className = compact ? 'compact' : '';
  a.href = '../index.html';
  a.setAttribute('aria-label', 'Back to the Showcase gallery');
  a.title = 'Back to the Showcase gallery';
  a.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg><span>Showcase</span>';

  var posM = (me.getAttribute('data-pos-mobile') || me.getAttribute('data-pos') || 'bottom-right').split('-');
  var offM = (me.getAttribute('data-offset-mobile') || me.getAttribute('data-offset') || '14,14').split(',');
  var narrow = window.matchMedia('(max-width: 760px)');

  function place() {
    var p = narrow.matches ? posM : pos, o = narrow.matches ? offM : off;
    var x = parseInt(o[0], 10), y = parseInt(o[1], 10);
    a.hidden = p[0] === 'none';   // data-pos-mobile="none" hides the pill when an app has no free spot on a phone
    if (a.hidden) return;
    var v = p[0], h = p[1] || 'right';
    a.style.top = a.style.bottom = a.style.left = a.style.right = a.style.marginLeft = '';
    a.style[v === 'top' ? 'top' : 'bottom'] = (isNaN(y) ? 14 : y) + 'px';
    if (h === 'center') { a.style.left = '50%'; a.style.marginLeft = (narrow.matches ? -17 : -52) + 'px'; } else a.style[h] = (isNaN(x) ? 14 : x) + 'px';
  }
  place();
  if (narrow.addEventListener) narrow.addEventListener('change', place);
  document.body.appendChild(a);

  function sync() { a.style.display = document.fullscreenElement ? 'none' : ''; }
  document.addEventListener('fullscreenchange', sync);
})();
