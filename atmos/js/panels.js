/* ATMOS - panels.js : the live-data surfaces: status badge, alerts card, local news + video card.
 * Everything that came from the network is inserted with textContent / setAttribute only (never innerHTML), and links are re-checked here. */
(function () {
  'use strict';
  const A = window.Atmos, D = A.Data, Live = A.Live, F = D.fmt;
  const $ = (s, r) => (r || document).querySelector(s);
  const P = (A.Panels = {});
  let city = null, tab = 'news', feedWatcher = null;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; };
  const safeUrl = (u, hostRx) => { try { const x = new URL(u); return x.protocol === 'https:' && hostRx.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } };
  const LV = { extreme: 'Extreme', severe: 'Severe', moderate: 'Moderate', minor: 'Minor', info: 'Info' };

  /* ---------- hero badge + footer note ---------- */
  P.badge = function (c) {
    city = c;
    const b = $('#hLive'), note = $('#fineLive'); if (!b) return;
    let cls = 'badge live', txt;
    if (!c.live) { cls = 'badge'; txt = 'Demo · synthetic weather'; }
    else {
      const w = Live.wx[c.id], st = w ? w.status : 'idle';
      if (st === 'ok') txt = 'Live · updated ' + clock(w.at);
      else if (st === 'loading' || st === 'idle') { cls += ' load'; txt = 'Loading live data…'; }
      else { cls = 'badge warn'; txt = 'Offline · showing a simulation'; }
    }
    b.className = cls; b.textContent = txt;
    if (note) note.textContent = c.live
      ? 'Live weather: Open-Meteo.com (CC BY 4.0, non-commercial use). Alerts: US National Weather Service, Japan Meteorological Agency, USGS. News and video belong to their stations. For information only: this is not an official warning service, so follow your local authorities in an emergency.'
      : 'This city is a demo: its weather is seeded, synthetic data generated in your browser. Pick a city marked LIVE for real readings.';
  };

  /* ---------- alerts ---------- */
  P.alerts = function (c) {
    const card = $('#cAlerts'); if (!card) return;
    card.hidden = !c.live; const chip = $('#hAlerts');
    if (!c.live) { chip.hidden = true; return; }
    const a = Live.al[c.id] || { status: 'idle', items: [], notes: [] };
    const list = $('#alList'), meta = $('#alMeta'); list.textContent = '';
    const items = a.items || [];
    const top = items.find((x) => x.level !== 'info' && x.level !== 'minor') || items[0];
    chip.hidden = !items.length; chip.textContent = '⚠ ' + items.length + (items.length === 1 ? ' alert' : ' alerts');
    chip.className = 'badge alert lv-' + (top ? top.level : 'info');
    meta.textContent = a.status === 'loading' ? 'Checking…' : a.at ? 'Checked ' + clock(a.at) : '';
    if (a.status === 'loading' && !items.length) { list.appendChild(el('p', 'al-empty', 'Checking for active alerts…')); return; }
    if (a.status === 'error') list.appendChild(el('p', 'al-empty warn', 'Alert sources could not be reached, so this list may be incomplete. Check official sources.'));
    else if (!items.length) list.appendChild(el('p', 'al-empty', 'No active weather alerts or nearby earthquakes (M4.5+, 400 km, last 24 h) were reported by the sources checked.'));
    for (const it of items) {
      const d = el('details', 'al lv-' + it.level);
      const s = el('summary'); s.append(el('span', 'al-lv', LV[it.level] || 'Info'), el('b', 'al-t', it.title), el('span', 'al-ar', it.area));
      d.appendChild(s);
      if (it.headline && it.headline !== it.title) d.appendChild(el('p', 'al-h', it.headline));
      if (it.text) d.appendChild(el('p', 'al-x', it.text));
      if (it.advice) { const p = el('p', 'al-adv'); p.append(el('b', '', 'What to do: '), document.createTextNode(it.advice)); d.appendChild(p); }
      const line = el('p', 'al-src'); line.append(document.createTextNode(it.source + (it.starts ? ' · ' + new Date(it.starts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') + (it.ends ? ' to ' + new Date(it.ends).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') + ' · '));
      const u = safeUrl(it.url, /(^|\.)(weather\.gov|jma\.go\.jp|usgs\.gov)$/);
      if (u) { const l = el('a', '', 'official source'); l.href = u; l.target = '_blank'; l.rel = 'noopener noreferrer'; line.appendChild(l); }
      d.appendChild(line); list.appendChild(d);
    }
    for (const n of a.notes || []) list.appendChild(el('p', 'al-note', n));
  };

  /* ---------- news and video ---------- */
  function renderNews(f) {
    const body = $('#nwBody'); body.textContent = '';
    if (!f || f.status === 'idle') { body.appendChild(el('p', 'al-empty', 'Open this panel to load local headlines.')); return; }
    if (f.status === 'unavailable') { body.appendChild(el('p', 'al-empty', 'Local news and video come from this site’s own server function, which is not available when the page is opened from a file or without the hosted API. Open the hosted version (or run node tools/serve.mjs) to see them.')); return; }
    if (f.status === 'loading' && !f.news) { body.appendChild(el('p', 'al-empty', 'Loading headlines…')); return; }
    if (f.status === 'error') { body.appendChild(el('p', 'al-empty warn', 'Headlines could not be loaded (' + f.error + ').')); return; }
    if (tab === 'news') {
      if (!f.news.length) body.appendChild(el('p', 'al-empty', 'No headlines came back from the stations’ feeds right now.'));
      const ul = el('div', 'nw-list');
      for (const n of f.news.slice(0, 14)) {
        const a = el('a', 'nw'); a.href = n.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.append(el('span', 'nw-src', n.source + (n.t ? ' · ' + ago(n.t) : '')), el('b', 'nw-t', n.title)); if (n.summary) a.appendChild(el('span', 'nw-s', n.summary));
        ul.appendChild(a);
      }
      body.appendChild(ul);
    } else {
      if (f.channels && f.channels.length) {
        const row = el('div', 'live-row'); row.appendChild(el('span', 'nw-src', 'Live streams, if on air:'));
        for (const ch of f.channels) { const a = el('a', 'live-link', ch.name); a.href = 'https://www.youtube.com/channel/' + ch.channel + '/live'; a.target = '_blank'; a.rel = 'noopener noreferrer'; row.appendChild(a); }
        body.appendChild(row);
      }
      if (!f.videos.length) body.appendChild(el('p', 'al-empty', 'No recent videos came back from the channels right now.'));
      const g = el('div', 'vd-grid');
      for (const v of f.videos) {
        const b = el('button', 'vd'); b.type = 'button'; b.setAttribute('aria-label', 'Play video: ' + v.title);
        const im = document.createElement('img'); im.className = 'vd-img'; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.referrerPolicy = 'no-referrer'; im.src = 'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg';
        b.append(im, el('span', 'vd-play', '▶'), el('span', 'vd-t', v.title), el('span', 'vd-c', v.channel + (v.t ? ' · ' + ago(v.t) : '')));
        b.addEventListener('click', () => {
          const box = el('div', 'vd on');
          const fr = document.createElement('iframe');
          fr.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0&playsinline=1';
          fr.title = v.title; fr.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; fr.allowFullscreen = true; fr.referrerPolicy = 'strict-origin-when-cross-origin';
          fr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
          const out = el('a', 'vd-out', 'Open on YouTube'); out.href = 'https://www.youtube.com/watch?v=' + v.id; out.target = '_blank'; out.rel = 'noopener noreferrer';
          box.append(fr, out); b.replaceWith(box);
        });
        g.appendChild(b);
      }
      body.appendChild(g);
      body.appendChild(el('p', 'al-note', 'Thumbnails come from YouTube when this tab opens (YouTube can see your address then); the player itself loads only when you press play. Some channels may not allow embedding; use “Open on YouTube” then.'));
    }
  }
  P.feeds = function (c) { if (!$('#cNews')) return; $('#cNews').hidden = !c.live; if (c.live) renderNews(Live.fd[c.id]); };
  P.setTab = function (t) { tab = t; document.querySelectorAll('#nwTabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t))); if (city) P.feeds(city); };

  P.select = function (c) {
    city = c; P.badge(c); P.alerts(c); P.feeds(c);
    if (c.live) { Live.loadAlerts(c); if (feedWatcher && feedWatcher.visible) Live.loadFeeds(c); }
  };

  P.init = function () {
    document.querySelectorAll('#nwTabs button').forEach((b) => b.addEventListener('click', () => P.setTab(b.dataset.t)));
    $('#hAlerts').addEventListener('click', () => { const c = $('#cAlerts'); c.scrollIntoView({ behavior: 'smooth', block: 'center' }); const d = c.querySelector('details'); if (d) d.open = true; });
    // news is only fetched once the card is near the viewport, so a visit that never scrolls down makes no feed requests
    feedWatcher = { visible: false };
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { feedWatcher.visible = es.some((e) => e.isIntersecting); if (feedWatcher.visible && city && city.live) Live.loadFeeds(city); }, { rootMargin: '240px' }).observe($('#cNews'));
    else feedWatcher.visible = true;
    Live.on((type, id) => {
      if (!city || id !== city.id) return;
      if (type === 'weather') P.badge(city); else if (type === 'alerts') P.alerts(city); else if (type === 'feeds') P.feeds(city);
    });
    setInterval(() => { if (!document.hidden && city && city.live) { Live.load([city]); Live.loadAlerts(city); if (feedWatcher.visible) Live.loadFeeds(city); } }, 60e3);   // each call is a no-op until its own cache expires
  };
})();
