/* ATMOS - live.js : real weather, alerts and local news for the "Live" cities.
 *
 *  Sources (all public, no key, no sign-in):
 *    Open-Meteo        forecast + air quality     https://open-meteo.com  (CC BY 4.0, free tier is for NON-COMMERCIAL use)
 *    NWS               US weather alerts          https://api.weather.gov (US government, public domain)
 *    JMA               Japan weather warnings     https://www.jma.go.jp/bosai/warning/
 *    USGS              earthquakes M4.5+ (24 h)   https://earthquake.usgs.gov
 *    /api/feeds        station news + video       the project's own serverless function (lib/feeds-core.js)
 *
 *  The first half of this file is pure (no DOM, no network) and is unit-tested under node (tests/live.test.mjs).
 *  The second half is the browser engine that fetches, caches in sessionStorage, and tells the UI when something changed.
 *  Anything fetched is treated as untrusted: numbers are range-checked, text is reduced to plain text and only ever shown with textContent.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Atmos = root.Atmos || {}; root.Atmos.LiveCore = api; if (root.document) api.install(root.Atmos); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : NaN);

  /* ================================================================== pure part ================================================================== */

  /* Open-Meteo weather_code (WMO) -> how strongly each effect should show (0..1) */
  const CODE_RAIN = { 51: 0.12, 53: 0.22, 55: 0.32, 56: 0.22, 57: 0.38, 61: 0.32, 63: 0.58, 65: 0.9, 66: 0.42, 67: 0.8, 80: 0.4, 81: 0.65, 82: 0.95, 95: 0.6, 96: 0.7, 99: 0.8 };
  const CODE_SNOW = { 71: 0.3, 73: 0.55, 75: 0.9, 77: 0.25, 85: 0.45, 86: 0.8 };
  const CODE_STORM = { 95: 0.85, 96: 1, 99: 1 };
  const CODE_FOG = { 45: 0.8, 48: 0.9 };

  const FIELDS = ['temp', 'feels', 'humidity', 'dew', 'pressure', 'wind', 'gust', 'cloud', 'uv', 'vis', 'aqi', 'pop', 'mm', 'cm', 'rain', 'snow', 'storm', 'fog'];
  const RANGE = { temp: [-90, 65], feels: [-120, 80], humidity: [0, 100], dew: [-90, 50], pressure: [850, 1090], wind: [0, 260], gust: [0, 320], cloud: [0, 1], uv: [0, 20], vis: [0, 60], aqi: [0, 600], pop: [0, 100], mm: [0, 200], cm: [0, 100] };

  /** Local-clock time string "2026-10-01T13:00" -> hours since epoch, treating the local clock as UTC (the app's own "local hour" axis). */
  function localHours(s) { const t = Date.parse(String(s).length === 16 ? s + ':00Z' : s + 'Z'); return t / 36e5; }

  /** Turn an Open-Meteo forecast response (and optionally an air-quality one) into hourly typed arrays on the app's local-hour axis. Throws on junk. */
  function buildSeries(om, aq) {
    const H = om && om.hourly; if (!H || !Array.isArray(H.time) || H.time.length < 24) throw new Error('forecast response has no hourly data');
    const n = H.time.length, tt = new Float64Array(n); for (let i = 0; i < n; i++) tt[i] = localHours(H.time[i]);
    const t0 = tt[0];
    if (!isFinite(t0)) throw new Error('hourly times are unreadable');
    // hourly, in order. A step of 0 or 2 hours is allowed because the local clock repeats or skips an hour when daylight saving changes.
    for (let i = 1; i < n; i++) { const d = tt[i] - tt[i - 1]; if (!(d >= 0 && d <= 2)) throw new Error('hourly times are not in order'); }
    const col = (k) => { const a = H[k]; const out = new Float32Array(n).fill(NaN); if (Array.isArray(a)) for (let i = 0; i < n && i < a.length; i++) out[i] = num(a[i]); return out; };
    const S = { n, t0, tt, off: num(om.utc_offset_seconds) / 3600, f: {}, sun: {} };
    const raw = { temp: col('temperature_2m'), feels: col('apparent_temperature'), humidity: col('relative_humidity_2m'), dew: col('dew_point_2m'), pressure: col('pressure_msl'),
      wind: col('wind_speed_10m'), gust: col('wind_gusts_10m'), cloud: col('cloud_cover'), uv: col('uv_index'), vis: col('visibility'), pop: col('precipitation_probability'),
      mm: col('precipitation'), cm: col('snowfall'), code: col('weather_code'), dir: col('wind_direction_10m') };
    raw.cloud = raw.cloud.map((v) => v / 100); raw.vis = raw.vis.map((v) => v / 1000);
    // range-check: out-of-range readings become gaps, then core fields are gap-filled from their neighbours
    for (const k of Object.keys(RANGE)) { const [lo, hi] = RANGE[k], a = raw[k]; if (!a) continue; for (let i = 0; i < n; i++) if (a[i] < lo || a[i] > hi) a[i] = NaN; }
    if (raw.temp.filter((v) => isFinite(v)).length < n * 0.8) throw new Error('too many missing temperatures');
    const fill = (a, dflt) => { let last = NaN; for (let i = 0; i < n; i++) { if (isFinite(a[i])) last = a[i]; else if (isFinite(last)) a[i] = last; } last = NaN; for (let i = n - 1; i >= 0; i--) { if (isFinite(a[i])) last = a[i]; else if (isFinite(last)) a[i] = last; } for (let i = 0; i < n; i++) if (!isFinite(a[i])) a[i] = dflt; };
    fill(raw.temp, 15); fill(raw.feels, NaN); fill(raw.humidity, 60); fill(raw.pressure, 1013); fill(raw.wind, 5); fill(raw.gust, 8); fill(raw.cloud, 0.5); fill(raw.dir, 0); fill(raw.mm, 0); fill(raw.cm, 0); fill(raw.pop, 0); fill(raw.uv, 0); fill(raw.vis, 24);
    for (let i = 0; i < n; i++) { if (!isFinite(raw.feels[i])) raw.feels[i] = raw.temp[i]; if (!isFinite(raw.dew[i])) raw.dew[i] = raw.temp[i] - (100 - raw.humidity[i]) / 5; }
    // derived effect strengths, per hour
    const rain = new Float32Array(n), snow = new Float32Array(n), storm = new Float32Array(n), fog = new Float32Array(n), cl = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = raw.code[i], T = raw.temp[i];
      let r = CODE_RAIN[c] || 0, s = CODE_SNOW[c] || 0;
      const amtR = clamp(raw.mm[i] / 6, 0, 1), amtS = clamp(raw.cm[i] / 2, 0, 1);
      if (r) r = Math.max(r, amtR); else if (!s && raw.mm[i] > 0.1) { if (T > 1) r = Math.max(0.12, amtR); else s = Math.max(0.12, amtR); }
      if (s) s = Math.max(s, amtS);
      rain[i] = r; snow[i] = s; storm[i] = CODE_STORM[c] || (raw.gust[i] > 90 ? 0.3 : 0);
      fog[i] = Math.max(CODE_FOG[c] || 0, raw.vis[i] < 1 ? clamp(1 - raw.vis[i], 0, 0.9) : 0);
      cl[i] = storm[i] >= 0.5 ? 1 : (r || s) ? Math.max(raw.cloud[i], 0.8) : raw.cloud[i];
    }
    Object.assign(S.f, { temp: raw.temp, feels: raw.feels, humidity: raw.humidity, dew: raw.dew, pressure: raw.pressure, wind: raw.wind, gust: raw.gust, uv: raw.uv, vis: raw.vis, pop: raw.pop, mm: raw.mm, cm: raw.cm, cloud: cl, rain, snow, storm, fog, aqi: new Float32Array(n).fill(NaN) });
    S.dir = raw.dir;
    // air quality is a separate response with its own time list
    if (aq && aq.hourly && Array.isArray(aq.hourly.time) && Array.isArray(aq.hourly.us_aqi)) {
      const at = new Map(); for (let i = 0; i < n; i++) at.set(Math.round(tt[i]), i);
      for (let j = 0; j < aq.hourly.time.length; j++) { const i = at.get(Math.round(localHours(aq.hourly.time[j]))), v = num(aq.hourly.us_aqi[j]); if (i !== undefined && v >= 0 && v <= 600) S.f.aqi[i] = v; }
    }
    // sunrise and sunset per local day, to place the sun correctly for this city and time zone
    const D = om.daily;
    if (D && Array.isArray(D.time)) for (let i = 0; i < D.time.length; i++) {
      const day = Math.round(localHours(D.time[i] + 'T00:00') / 24), sr = D.sunrise && D.sunrise[i], ss = D.sunset && D.sunset[i];
      if (sr && ss) { const a = localHours(sr) - day * 24, b = localHours(ss) - day * 24; if (a > 0 && b > a && b < 30) S.sun[day] = { sunrise: a, sunset: b }; }
    }
    return S;
  }

  function circ(a, b, t) { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; }
  /** Read the series at local hour L (fractional). Values are linearly interpolated; before/after the data they hold the first/last value. */
  function readSeries(S, L) {
    const tt = S.tt, last = S.n - 1, Lc = clamp(L, tt[0], tt[last]);
    let lo = 0, hi = last;                                    // binary search: the last hour that is not after L
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tt[mid] <= Lc) lo = mid; else hi = mid - 1; }
    const i0 = lo, i1 = Math.min(last, i0 + 1), span = tt[i1] - tt[i0], f = span > 0 ? clamp((Lc - tt[i0]) / span, 0, 1) : 0, o = {};
    for (const k of FIELDS) { const a = S.f[k][i0], b = S.f[k][i1]; o[k] = isFinite(a) && isFinite(b) ? lerp(a, b, f) : isFinite(a) ? a : isFinite(b) ? b : NaN; }
    o.windDir = circ(S.dir[i0], S.dir[i1], f);
    o.inRange = L >= tt[0] - 0.01 && L <= tt[last] + 0.01;
    return o;
  }

  /* ---------------------------------------------------------------- alerts */
  const clean = (s, max) => {
    let t = String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
  };
  /** NWS area lists can name dozens of counties: show the first few and count the rest. */
  const areaList = (d) => { const parts = clean(d, 1500).split(/;\s*/).filter(Boolean); return parts.length > 4 ? parts.slice(0, 4).join('; ') + ' and ' + (parts.length - 4) + ' more' : parts.join('; '); };
  const LEVELS = ['extreme', 'severe', 'moderate', 'minor', 'info'];

  /** NWS /alerts/active?point= response -> alert items. Cancelled and expired alerts are dropped. */
  function nwsAlerts(json, now) {
    const out = [];
    for (const f of (json && Array.isArray(json.features) ? json.features : []).slice(0, 40)) {
      const p = f && f.properties; if (!p || typeof p.event !== 'string') continue;
      if (/^cancel/i.test(p.messageType || '')) continue;
      const ends = Date.parse(p.ends || p.expires || ''); if (isFinite(ends) && ends < now) continue;
      const lv = { Extreme: 'extreme', Severe: 'severe', Moderate: 'moderate', Minor: 'minor' }[p.severity] || 'info';
      out.push({ id: String(p.id || p.event).slice(0, 120), level: lv, title: clean(p.event, 80), headline: clean(p.headline, 220), area: areaList(p.areaDesc),
        starts: Date.parse(p.onset || p.effective || '') || null, ends: isFinite(ends) ? ends : null, text: clean(p.description, 900), advice: clean(p.instruction, 500), source: 'National Weather Service', url: 'https://www.weather.gov/' });
    }
    return out.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (a.starts || 0) - (b.starts || 0));
  }

  /* JMA warning/advisory codes (English names). special = emergency warning, warning = warning, others = advisory. */
  const JMA_CODES = {
    32: ['Emergency blizzard warning', 'extreme'], 33: ['Emergency heavy rain warning', 'extreme'], 35: ['Emergency storm warning', 'extreme'], 36: ['Emergency heavy snow warning', 'extreme'], 37: ['Emergency high wave warning', 'extreme'], 38: ['Emergency storm surge warning', 'extreme'],
    2: ['Blizzard warning', 'severe'], 3: ['Heavy rain warning', 'severe'], 4: ['Flood warning', 'severe'], 5: ['Storm warning', 'severe'], 6: ['Heavy snow warning', 'severe'], 7: ['High wave warning', 'severe'], 8: ['Storm surge warning', 'severe'],
    10: ['Heavy rain advisory', 'moderate'], 12: ['Heavy snow advisory', 'moderate'], 13: ['Blowing snow advisory', 'moderate'], 14: ['Thunderstorm advisory', 'moderate'], 15: ['Strong wind advisory', 'moderate'], 16: ['High wave advisory', 'moderate'], 17: ['Snow melt advisory', 'minor'],
    18: ['Flood advisory', 'moderate'], 19: ['Storm surge advisory', 'moderate'], 20: ['Dense fog advisory', 'minor'], 21: ['Dry air advisory', 'minor'], 22: ['Avalanche advisory', 'moderate'], 23: ['Low temperature advisory', 'minor'], 24: ['Frost advisory', 'minor'], 25: ['Icing advisory', 'minor'], 26: ['Snow accretion advisory', 'minor'],
  };
  const JMA_AREAS = { tyo: ['130000', '130010', 'Tokyo Region'], osa: ['270000', '270000', 'Osaka Prefecture'], spk: ['016000', '016010', 'Ishikari Region (Sapporo)'], fuk: ['400000', '400010', 'Fukuoka Region'], nah: ['471000', '471010', 'Central and Southern Okinawa Main Island'] };
  const MAX_JMA_AGE = 48 * 3600e3;

  /** JMA warning JSON for one office -> alerts for one forecast area. A report older than 48 h is ignored (the file only changes when something changes, but a
   *  stale "continuing" advisory must never be shown as current). Returns { items, reportAt, stale }. */
  function jmaAlerts(json, areaCode, areaName, now) {
    const reportAt = Date.parse(json && json.reportDatetime || '');
    if (!isFinite(reportAt)) return { items: [], reportAt: null, stale: true };
    if (now - reportAt > MAX_JMA_AGE) return { items: [], reportAt, stale: true };
    const area = ((json.areaTypes && json.areaTypes[0] && json.areaTypes[0].areas) || []).find((a) => a && a.code === areaCode);
    const items = [];
    for (const w of (area && area.warnings) || []) {
      const info = JMA_CODES[+w.code]; if (!info || !/^(発表|継続)$/.test(String(w.status))) continue;   // issued or continuing
      items.push({ id: 'jma-' + areaCode + '-' + w.code, level: info[1], title: info[0], headline: info[0] + ' for ' + areaName, area: areaName, starts: reportAt, ends: null, text: '', advice: 'Follow guidance from local authorities and the Japan Meteorological Agency.', source: 'Japan Meteorological Agency', url: 'https://www.jma.go.jp/bosai/warning/' });
    }
    return { items: items.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)), reportAt, stale: false };
  }

  function haversine(lat1, lon1, lat2, lon2) { const R = 6371, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r, a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); }
  /** USGS GeoJSON -> earthquakes within `km` of the city, newest first. */
  function quakesNear(json, lat, lon, km, now) {
    const out = [];
    for (const f of (json && Array.isArray(json.features) ? json.features : [])) {
      const p = f && f.properties, c = f && f.geometry && f.geometry.coordinates; if (!p || !c) continue;
      const mag = num(p.mag), t = num(p.time), d = haversine(lat, lon, num(c[1]), num(c[0]));
      if (!(mag >= 4.5) || !isFinite(d) || d > km || !(t > now - 26 * 3600e3)) continue;
      out.push({ id: 'usgs-' + String(f.id || t).slice(0, 40), level: mag >= 7 ? 'extreme' : mag >= 6 ? 'severe' : mag >= 5 ? 'moderate' : 'minor', title: 'Earthquake M' + mag.toFixed(1), headline: 'M' + mag.toFixed(1) + ' earthquake, ' + clean(p.place, 100) + ' (about ' + Math.round(d) + ' km away)',
        area: clean(p.place, 100), starts: t, ends: null, text: 'Depth ' + (num(c[2]) >= 0 ? Math.round(c[2]) + ' km' : 'unknown') + '. Reported by the US Geological Survey; magnitude may be revised.', advice: '', source: 'US Geological Survey', url: typeof p.url === 'string' && /^https:\/\/earthquake\.usgs\.gov\//.test(p.url) ? p.url : 'https://earthquake.usgs.gov/' });
    }
    return out.sort((a, b) => b.starts - a.starts);
  }

  /** Offset of an IANA zone from UTC, in hours, at a given moment (handles daylight saving). */
  function zoneOffset(zone, date) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const p = {}; for (const x of f.formatToParts(date)) p[x.type] = +x.value;
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000) / 36e5;
  }

  const core = { buildSeries, readSeries, nwsAlerts, jmaAlerts, quakesNear, zoneOffset, localHours, haversine, clean, JMA_CODES, JMA_AREAS, LEVELS, install: null };

  /* ================================================================== browser engine ================================================================== */
  core.install = function (A) {
    const D = A.Data;
    const TTL = 10 * 60e3, ALERT_TTL = 4 * 60e3, FEED_TTL = 5 * 60e3;
    const subs = new Set();
    const L = (A.Live = { core, subs, wx: {}, al: {}, fd: {}, quakes: null });
    L.on = (fn) => { subs.add(fn); return () => subs.delete(fn); };
    const emit = (type, id) => subs.forEach((f) => { try { f(type, id); } catch (e) { /* a listener must not break the rest */ } });
    const isLive = (c) => !!c.live;
    L.isLive = isLive;
    const ss = { get: (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } } };
    const getJSON = async (url, ms) => {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms || 12000);
      try { const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' }, cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
      finally { clearTimeout(timer); }
    };

    /* ---- time zones: keep each live city's offset right for today, even across daylight-saving changes ---- */
    L.refreshZones = () => D.cities.forEach((c) => { if (c.live && c.zone) { try { const o = zoneOffset(c.zone, new Date()); if (isFinite(o)) c.tz = o; } catch (e) { /* unknown zone: keep static tz */ } } });

    /* ---- weather ---- */
    L.status = (c) => (L.wx[c.id] ? L.wx[c.id].status : 'idle');
    L.has = (c) => !!(L.wx[c.id] && L.wx[c.id].status === 'ok');
    L.read = (c, t) => (L.has(c) ? readSeries(L.wx[c.id].S, t) : null);
    function apply(c, om, aq, at) {
      const S = buildSeries(om, aq);
      if (isFinite(S.off) && Math.abs(S.off - c.tz) < 14) c.tz = S.off;      // the API's own offset wins over the computed one
      c.sunDays = S.sun; c._ac = {}; c._dc = {};
      L.wx[c.id] = { status: 'ok', S, at, source: 'Open-Meteo' };
    }
    const wxUrl = (cs) => 'https://api.open-meteo.com/v1/forecast?latitude=' + cs.map((c) => c.lat).join(',') + '&longitude=' + cs.map((c) => c.lon).join(',') +
      '&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,snowfall,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index' +
      '&daily=sunrise,sunset&timezone=auto&past_days=1&forecast_days=10&wind_speed_unit=kmh&temperature_unit=celsius&precipitation_unit=mm';
    const aqUrl = (cs) => 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + cs.map((c) => c.lat).join(',') + '&longitude=' + cs.map((c) => c.lon).join(',') + '&hourly=us_aqi&timezone=auto&past_days=1&forecast_days=5';
    const fail = (c, e) => {
      const cur = L.wx[c.id], msg = e && e.name === 'AbortError' ? 'timed out' : String(e && e.message || e).slice(0, 80);
      if (cur && cur.status === 'ok') { cur.refreshing = false; cur.error = msg; cur.failedAt = Date.now(); }       // keep the good data we already have
      else L.wx[c.id] = { status: 'error', error: msg, at: Date.now() };
    };
    /** Load forecasts for these cities (one request per batch, not per city). Resolves when done; failures are recorded per city, never thrown. */
    L.load = async function (cities, force) {
      const need = [];
      for (const c of cities) {
        if (!isLive(c)) continue;
        const cur = L.wx[c.id];
        if (!force && cur && (cur.status === 'loading' || (cur.status === 'ok' && Date.now() - cur.at < TTL))) continue;
        const cached = !force && ss.get('atmos.wx.v1.' + c.id);
        if (cached && Date.now() - cached.at < TTL) { try { apply(c, cached.om, cached.aq, cached.at); emit('weather', c.id); continue; } catch (e) { /* bad cache: refetch */ } }
        if (cur && cur.status === 'ok') cur.refreshing = true; else L.wx[c.id] = { status: 'loading' };   // keep showing good data while refreshing
        need.push(c);
      }
      if (need.length) emit('weather', need[0].id);
      for (let i = 0; i < need.length; i += 6) {
        const batch = need.slice(i, i + 6);
        try {
          const [om, aq] = await Promise.all([getJSON(wxUrl(batch)), getJSON(aqUrl(batch)).catch(() => null)]);
          const oms = Array.isArray(om) ? om : [om], aqs = Array.isArray(aq) ? aq : aq ? [aq] : [];
          batch.forEach((c, k) => {
            try { if (!oms[k]) throw new Error('no data for ' + c.name); const at = Date.now(); apply(c, oms[k], aqs[k] || null, at); ss.set('atmos.wx.v1.' + c.id, { at, om: oms[k], aq: aqs[k] || null }); }
            catch (e) { fail(c, e); }
          });
        } catch (e) { batch.forEach((c) => fail(c, e)); }
        batch.forEach((c) => emit('weather', c.id));
      }
    };

    /* ---- alerts ---- */
    async function loadQuakes() {
      if (L.quakes && Date.now() - L.quakes.at < 10 * 60e3) return L.quakes.json;
      const json = await getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
      L.quakes = { at: Date.now(), json }; return json;
    }
    L.loadAlerts = async function (c, force) {
      if (!isLive(c)) return;
      const cur = L.al[c.id];
      if (!force && cur && (cur.status === 'loading' || (cur.status === 'ok' && Date.now() - cur.at < ALERT_TTL))) return;
      L.al[c.id] = { status: 'loading', items: cur ? cur.items : [], at: cur ? cur.at : 0, notes: [] }; emit('alerts', c.id);
      const items = [], notes = []; let failed = 0, tried = 0;
      const now = Date.now();
      if (c.country === 'US') {
        tried++;
        try { items.push(...nwsAlerts(await getJSON('https://api.weather.gov/alerts/active?point=' + c.lat.toFixed(4) + ',' + c.lon.toFixed(4)), now)); } catch (e) { failed++; notes.push('National Weather Service alerts could not be loaded.'); }
      } else if (JMA_AREAS[c.id]) {
        tried++;
        const [office, area, name] = JMA_AREAS[c.id];
        try {
          const r = jmaAlerts(await getJSON('https://www.jma.go.jp/bosai/warning/data/warning/' + office + '.json'), area, name, now);
          items.push(...r.items);
          if (r.stale) notes.push('The latest Japan Meteorological Agency report for this area is ' + (r.reportAt ? 'from ' + new Date(r.reportAt).toISOString().slice(0, 10) + ' (too old to treat as current)' : 'unreadable') + ', so no JMA warnings are shown. Check jma.go.jp for the official status.');
        } catch (e) { failed++; notes.push('Japan Meteorological Agency warnings could not be loaded.'); }
      }
      tried++;
      try { items.push(...quakesNear(await loadQuakes(), c.lat, c.lon, 400, now)); } catch (e) { failed++; notes.push('Earthquake data could not be loaded.'); }
      items.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
      L.al[c.id] = { status: failed === tried ? 'error' : 'ok', items, notes, at: Date.now() };
      emit('alerts', c.id);
    };

    /* ---- news and video (served by the project's own function) ---- */
    L.feedsAvailable = () => location.protocol === 'http:' || location.protocol === 'https:';
    L.loadFeeds = async function (c, force) {
      if (!isLive(c)) return;
      const cur = L.fd[c.id];
      if (!L.feedsAvailable()) { L.fd[c.id] = { status: 'unavailable' }; emit('feeds', c.id); return; }
      if (!force && cur && (cur.status === 'loading' || (cur.status === 'ok' && Date.now() - cur.at < FEED_TTL))) return;
      L.fd[c.id] = Object.assign({}, cur, { status: 'loading' }); emit('feeds', c.id);
      try {
        const j = await getJSON(new URL('../api/feeds?city=' + encodeURIComponent(c.id), location.href).href, 15000);
        const arr = (v) => (Array.isArray(v) ? v : []);
        const news = arr(j.news).filter((n) => n && typeof n.title === 'string' && /^https:\/\//.test(n.url || '')).slice(0, 24).map((n) => ({ title: clean(n.title, 160), url: n.url, source: clean(n.source, 40), t: num(n.t) || null, summary: clean(n.summary, 200) }));
        const videos = arr(j.videos).filter((v) => v && /^[\w-]{11}$/.test(v.id || '')).slice(0, 12).map((v) => ({ id: v.id, title: clean(v.title, 140), channel: clean(v.channel, 40), t: num(v.t) || null }));
        const channels = arr(j.channels).filter((x) => x && /^UC[\w-]{22}$/.test(x.channel || '')).slice(0, 6).map((x) => ({ name: clean(x.name, 40), channel: x.channel }));
        L.fd[c.id] = { status: 'ok', news, videos, channels, errors: arr(j.errors).length, at: Date.now() };
      } catch (e) { L.fd[c.id] = { status: 'error', error: e && e.name === 'AbortError' ? 'timed out' : String(e && e.message || e).slice(0, 80), at: Date.now() }; }
      emit('feeds', c.id);
    };
  };
  return core;
});
