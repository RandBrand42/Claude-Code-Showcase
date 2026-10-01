/* MERIDIAN - boot + view manager. */
(function (M) {
  'use strict';
  const U = M.U, S = M.S, UI = M.UI, st = S.st;
  let host, cur = null, skeleton = false;

  function mountView(first) {
    if (cur && cur.destroy) cur.destroy();
    U.clear(host);
    host.className = 'view';
    const v = M.views[st.view];
    v.mount(host);
    cur = v; M.current = v;
    U.$$('.rv', host).forEach((n, i) => n.style.setProperty('--rv', i));
    host.classList.add('in');
    window.scrollTo(0, 0);
    if (first && !U.reduced()) {
      skeleton = true; host.classList.add('skel');
      setTimeout(() => { skeleton = false; host.classList.remove('skel'); v.update('enter'); }, 750);
    } else v.update('enter');
  }

  function boot() {
    host = document.getElementById('view');
    S.applyTheme();
    S.applyHash(true);
    S.applyTheme();
    UI.init();
    S.on((keys) => {
      if (keys.includes('theme') || keys.includes('density')) S.applyTheme();
      UI.syncChrome();
      if (keys.includes('view')) { mountView(false); return; }
      if (skeleton || !cur) return;
      if (keys.some((k) => k === 'range' || k === 'cmp' || k === 'f' || k.startsWith('v:'))) cur.update('change');
      else if (keys.includes('theme') && cur.update) cur.update('theme');
    });
    mountView(true);
    // pause heavy work when the tab is hidden
    document.addEventListener('visibilitychange', () => { if (cur && cur.visibility) cur.visibility(!document.hidden); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})((window.M = window.M || {}));
