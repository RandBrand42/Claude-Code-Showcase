/* ATMOS - app.js : state, the master animation loop, keyboard, scenes, persistence. */
(function () {
  'use strict';
  const A = window.Atmos, D = A.Data, U = A.util, Sky = A.Sky, UI = A.UI, F = D.fmt;
  const $ = (s) => document.querySelector(s);
  const clamp = U.clamp, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = new URLSearchParams(location.search);
  const S = { ci: 0, f: null, t: 0, playing: false, shown: 0, intro: P.get('intro') === '0' || reduced ? 1 : 0, dirty: true, iconKey: '', lastChips: 0, lastInk: 0, sumKey: '' };

  const SCENES = [
    { id: 'live', label: 'Live' },
    { id: 'clear', label: 'Clear day', when: 'noon', o: { cloud: 0.05, wind: 9 } },
    { id: 'golden', label: 'Golden hour', when: 'golden', o: { cloud: 0.32, wind: 8 } },
    { id: 'dusk', label: 'Dusk', when: 'dusk', o: { cloud: 0.4, wind: 8 } },
    { id: 'night', label: 'Clear night', when: 'night', o: { cloud: 0.03, wind: 5 } },
    { id: 'dawn', label: 'Dawn', when: 'dawn', o: { cloud: 0.3, wind: 6 } },
    { id: 'rain', label: 'Rain', when: 'noon', o: { cloud: 0.88, r: 0.75, ptype: 'rain', wind: 24 } },
    { id: 'storm', label: 'Thunderstorm', when: 'dusk', o: { cloud: 1, r: 0.95, ptype: 'rain', storm: 0.9, wind: 40 } },
    { id: 'snow', label: 'Snow', when: 'noon', o: { cloud: 0.9, r: 0.65, ptype: 'snow', wind: 14 } },
    { id: 'fog', label: 'Fog', when: 'morning', o: { cloud: 0.5, fog: 0.9, wind: 3 } },
    { id: 'heat', label: 'Heatwave', when: 'noon', o: { cloud: 0, heat: 1, wind: 6 } },
    { id: 'overcast', label: 'Overcast', when: 'noon', o: { cloud: 0.96, wind: 16 } },
  ];
  let sceneId = 'live';

  const city = () => D.cities[S.ci];
  const L0 = () => S.f.L0;
  const sampleAt = (t) => D.sample(city(), L0() + t);

  function hourFor(when) {
    const c = city(), a = D.astro(c, Math.floor(D.localNow(c) / 24) * 24 + 12);
    return { noon: 12.5, golden: a.sunset - 0.4, dusk: a.sunset + 0.45, night: a.sunset + 4.6, dawn: a.sunrise - 0.25, morning: a.sunrise + 0.4 }[when];
  }
  function setHour(h) { const hod0 = ((D.localNow(city()) % 24) + 24) % 24; D.shift += (((h - hod0) % 24) + 24) % 24; }

  function rebuild(keepT) {
    D.invalidate(); S.f = D.forecast(city()); UI._sel = -1; UI.buildCity(S.f); if (!keepT) S.t = 0; S.iconKey = ''; S.sumKey = ''; S.dirty = true; S.lastChips = 0;
    Sky.setCity(city().sky, city().seed);
  }
  function selectCity(i) {
    S.ci = (i + D.cities.length) % D.cities.length; rebuild(true); live(city());
    try { localStorage.setItem('atmos.city', city().id); } catch (e) { /* storage unavailable */ }
    const chip = document.querySelectorAll('.chip')[S.ci]; if (chip) chip.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }
  // live data for a city: fetch weather (batched with the nearest cities), alerts, and refresh the panels when something arrives
  function live(c) {
    A.Panels.select(c);
    if (!c.live) return;
    const near = D.cities.filter((x) => x.live && x !== c && x.country === c.country).slice(0, 5);
    A.Live.load([c].concat(near));
  }
  function setScene(id, hourOverride) {
    const sc = SCENES.find((s) => s.id === id) || SCENES[0]; sceneId = sc.id;
    if (sc.id === 'live') { D.override = null; D.shift = 0; } else { D.override = Object.assign({}, sc.o); if (sc.when) setHour(hourFor(sc.when)); }
    if (hourOverride !== undefined) setHour(hourOverride);
    rebuild(false);
    document.querySelectorAll('#sceneGrid button').forEach((b) => b.classList.toggle('on', b.dataset.id === sceneId));
    $('#hScene').hidden = sceneId === 'live'; $('#hScene').textContent = 'Scene: ' + sc.label; syncSliders();
  }
  function syncSliders() { const w = S.f.hourly[0]; $('#hodRange').value = w.hod.toFixed(2); $('#hodOut').textContent = F.hour(w.hod); $('#windRange').value = Math.round(w.wind); $('#windOut').textContent = F.wind(w.wind) + ' ' + F.windU(); }
  function setT(t) { S.t = clamp(t, 0, 48); S.dirty = true; }
  function manual() { if (S.playing) togglePlay(false); }
  function togglePlay(on) { S.playing = on === undefined ? !S.playing : on; UI.setPlaying(S.playing); }
  function setUnits(k, v) { D.units[k] = v; document.querySelectorAll(`.seg button[data-u=${k}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); try { localStorage.setItem('atmos.units', JSON.stringify(D.units)); } catch (e) { /* ignore */ } if (S.f) { rebuild(true); syncSliders(); } }

  // ---- master loop ----
  let last = performance.now();
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (S.playing) { S.t += dt * 2.4; if (S.t >= 48) S.t -= 48; S.dirty = true; }
    const p = S.intro < 1 ? (S.intro = Math.min(1, S.intro + dt / 2.8)) : 1, off = 9 * Math.pow(1 - p, 3);
    const w = sampleAt(S.t), ws = off > 0.01 ? sampleAt(S.t - off) : w;
    Sky.set({ theta: ws.theta, maxAlt: ws.maxAlt, alt: ws.alt, moonTheta: ws.moonTheta, moonPhase: ws.moonPhase, illum: ws.moonIllum, cloud: ws.cloud, rain: ws.rain, snow: ws.snow, storm: ws.storm, fog: ws.fog, heat: ws.heat, wind: ws.wind, windX: ws.windX });
    // hero
    const target = F.cvt(w.temp); S.shown += (target - S.shown) * (1 - Math.exp(-dt * (S.intro < 1 ? 5 : 11))); if (Math.abs(target - S.shown) < 0.05) S.shown = target;
    $('#hTemp').textContent = Math.round(S.shown) + '°';
    if (S.dirty || p < 1) {
      const d = D.daySummary(city(), w.day);
      $('#hCond').textContent = w.cond.label; $('#hFeels').textContent = F.temp(w.feels); $('#hHi').textContent = F.temp(d.hi); $('#hLo').textContent = F.temp(d.lo);
      if (S.iconKey !== w.cond.icon) { S.iconKey = w.cond.icon; $('#hIcon').innerHTML = A.icon(w.cond.icon); }
      const sk = w.cond.key + Math.round(S.t); if (sk !== S.sumKey) { S.sumKey = sk; $('#hSummary').textContent = UI.summarize(w, S.t); }
      $('#hMoon').textContent = w.night ? `${D.moonName(w.moonPhase)} · ${Math.round(w.moonIllum * 100)}%` : `Daylight ${Math.floor(w.dayLen)}h ${Math.round((w.dayLen % 1) * 60)}m`;
      UI.update(w, S.t); S.dirty = false;
    }
    if (ts - S.lastChips > 400) { S.lastChips = ts; UI.updateChips(S.t, S.ci); }
    if (ts - S.lastInk > 140) { S.lastInk = ts; applyInk(); }
    Sky.frame(dt, ts / 1000);
  }
  // Text + glass adapt to the sky: dark frosted glass with white ink, or pale glass with deep-blue ink on bright skies
  let inkDark = false, lastGlass = '';
  function applyInk() {
    const i = Sky.info, root = document.documentElement;
    if (!inkDark && i.lum > 0.44) inkDark = true; else if (inkDark && i.lum < 0.38) inkDark = false;
    if (root.dataset.ink !== (inkDark ? 'dark' : 'light')) root.dataset.ink = inkDark ? 'dark' : 'light';
    const m = i.mid, rgb = inkDark ? U.mix3(m, [255, 255, 255], 0.74) : m.map((v) => v * 0.2), a = inkDark ? 0.5 : 0.44 + 0.14 * clamp(i.lum * 2, 0, 1), key = rgb.map(Math.round).join(',') + a.toFixed(2);
    if (key !== lastGlass) { lastGlass = key; root.style.setProperty('--glass-rgb', rgb.map(Math.round).join(',')); root.style.setProperty('--glass-a', a.toFixed(2)); }
  }

  // ---- wiring ----
  function init() {
    try { const u = JSON.parse(localStorage.getItem('atmos.units') || 'null'); if (u && u.t && u.w) Object.assign(D.units, u); } catch (e) { /* ignore */ }
    setUnits('t', D.units.t); setUnits('w', D.units.w);
    Sky.init($('#sky'));
    UI.init({ scrub: (t) => setT(t), manual, step: (dir, big) => { manual(); setT(S.t + dir * (big ? 6 : 1)); }, city: (i) => selectCity(i) });
    $('#sceneGrid').innerHTML = SCENES.map((s) => `<button data-id="${s.id}">${s.label}</button>`).join('');
    $('#sceneGrid').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setScene(b.dataset.id); });
    let ci = 0; try { const saved = localStorage.getItem('atmos.city'); ci = Math.max(0, D.cities.findIndex((c) => c.id === saved)); } catch (e) { /* ignore */ }
    const pc = P.get('city'); if (pc) { const k = D.cities.findIndex((c) => c.id === pc); if (k >= 0) ci = k; }
    A.Live.refreshZones(); A.Panels.init();
    A.Live.on((type, id) => { if (type === 'weather') { if (id === city().id) { rebuild(true); A.Panels.badge(city()); } S.lastChips = 0; } });
    S.ci = ci; rebuild(false); live(city());
    setTimeout(() => A.Live.load(D.cities.filter((x) => x.live)), 4000);          // fill in the other cities' chips shortly after the first paint
    document.addEventListener('visibilitychange', () => { if (!document.hidden && city().live) A.Live.load([city()]); });
    if (P.get('scene')) setScene(P.get('scene'));
    if (P.get('hour')) { setHour(+P.get('hour')); rebuild(false); }
    if (P.get('t')) setT(+P.get('t'));
    Sky.set({}, true);
    // controls
    document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setUnits(b.dataset.u, b.dataset.v)));
    $('#btnNow').addEventListener('click', () => { manual(); setT(0); });
    $('#btnPlay').addEventListener('click', () => togglePlay());
    const panel = $('#scenes'), help = $('#help');
    const togglePanel = (on) => { panel.hidden = on === undefined ? !panel.hidden : !on; if (!panel.hidden) syncSliders(); };
    $('#btnScenes').addEventListener('click', () => togglePanel()); $('#scClose').addEventListener('click', () => togglePanel(false));
    $('#btnHelp').addEventListener('click', () => (help.hidden = false)); $('#helpClose').addEventListener('click', () => (help.hidden = true));
    help.addEventListener('click', (e) => { if (e.target === help) help.hidden = true; });
    $('#btnStrike').addEventListener('click', () => Sky.strike());
    $('#btnLive').addEventListener('click', () => setScene('live'));
    $('#hodRange').addEventListener('input', (e) => { setHour(+e.target.value); rebuild(true); Sky.set({}, false); $('#hodOut').textContent = F.hour(+e.target.value); });
    $('#windRange').addEventListener('input', (e) => { D.override = Object.assign(D.override || {}, { wind: +e.target.value }); rebuild(true); $('#windOut').textContent = F.wind(+e.target.value) + ' ' + F.windU(); });
    const search = $('#search');
    search.addEventListener('input', () => UI.filterChips(search.value));
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const k = UI.filterChips(search.value); if (k >= 0) { selectCity(k); search.blur(); } } if (e.key === 'Escape') { search.value = ''; UI.filterChips(''); search.blur(); } e.stopPropagation(); });
    addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === 'Escape') { help.hidden = true; togglePanel(false); return; }
      if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); manual(); setT(S.t + (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 6 : 1)); }
      else if (k === ' ' && !(e.target.tagName === 'BUTTON')) { e.preventDefault(); togglePlay(); }
      else if (k === 'Home') { manual(); setT(0); }
      else if (k === 'c' || k === 'C') selectCity(S.ci + 1);
      else if (k === 'u' || k === 'U') { const m = D.units.t === 'C'; setUnits('t', m ? 'F' : 'C'); setUnits('w', m ? 'mph' : 'kmh'); }
      else if (k === 'd' || k === 'D') togglePanel();
      else if (k === '?') help.hidden = !help.hidden;
      else if (k === '/') { e.preventDefault(); search.focus(); }
    });
    if (P.get('play') === '1') togglePlay(true);
    // exposed for the verification harness
    A.app = { S, setScene, selectCity, setT, setHour, SCENES, rebuild, togglePlay };
    requestAnimationFrame((ts) => { last = ts; frame(ts); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
