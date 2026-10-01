/* ATMOS - data.js
 * Two kinds of city share one weather function, sample(city, localHour):
 *   - "Live" cities (live: true) read real hourly data from js/live.js once it has arrived (Open-Meteo). Until then, or if the network fails,
 *     they fall back to the synthetic climate profile below and the UI says so.
 *   - "Demo" cities are fully synthetic: every reading is a pure function of (city, absolute local hour), so the same instant always yields the
 *     same seeded weather and time can be scrubbed continuously. Nothing in those is real.
 * This file never talks to the network; js/live.js does. */
(function () {
  'use strict';
  const A = (window.Atmos = window.Atmos || {});
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n += n << 3; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  // Smooth 1-D value noise and a stretched 3-octave sum (mean ~0.5, wider spread)
  function noise(seed, x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i * 7919 + seed * 104729), hash((i + 1) * 7919 + seed * 104729), u); }
  function fbm(seed, x) { const v = noise(seed, x) * 0.6 + noise(seed + 17, x * 2.3) * 0.3 + noise(seed + 31, x * 5.1) * 0.1; return clamp(0.5 + (v - 0.5) * 1.6, 0, 1); }
  const wrap12 = (x) => ((((x + 12) % 24) + 24) % 24) - 12;
  A.util = { clamp, lerp, smooth, mix3, rng, hash, noise, fbm, wrap12, TAU, D2R };

  // ---- Cities: invented climate profiles (mean/amp in deg C, wet/storm/fog/windy 0..1) ----
  // Live cities first: real data from js/live.js. Demo cities after: invented climate profiles (mean/amp in deg C, wet/storm/fog/windy 0..1).
  const CITIES = [
    { id: 'dal', name: 'Dallas', region: 'Texas', live: true, country: 'US', lat: 32.78, lon: -96.8, zone: 'America/Chicago', tz: -5, mean: 19.5, amp: 11.5, diurnal: 10, wet: 0.32, storm: 0.7, windy: 0.6, fog: 0.08, humid: 0.62, aqi: 48, sky: 'skyline', seed: 101 },
    { id: 'ftw', name: 'Fort Worth', region: 'Texas', live: true, country: 'US', lat: 32.75, lon: -97.33, zone: 'America/Chicago', tz: -5, mean: 19, amp: 11.5, diurnal: 11, wet: 0.3, storm: 0.7, windy: 0.65, fog: 0.06, humid: 0.58, aqi: 44, sky: 'hills', seed: 103 },
    { id: 'san', name: 'San Diego', region: 'California', live: true, country: 'US', lat: 32.72, lon: -117.16, zone: 'America/Los_Angeles', tz: -7, mean: 18, amp: 4.5, diurnal: 6, wet: 0.12, storm: 0.03, windy: 0.4, fog: 0.38, humid: 0.68, aqi: 42, sky: 'harbour', seed: 107 },
    { id: 'oce', name: 'Oceanside', region: 'California', live: true, country: 'US', lat: 33.2, lon: -117.38, zone: 'America/Los_Angeles', tz: -7, mean: 17.5, amp: 4.5, diurnal: 6.5, wet: 0.12, storm: 0.03, windy: 0.4, fog: 0.4, humid: 0.7, aqi: 38, sky: 'hills', seed: 109 },
    { id: 'dc', name: 'Washington, D.C.', region: 'District of Columbia', live: true, country: 'US', lat: 38.91, lon: -77.04, zone: 'America/New_York', tz: -4, mean: 14, amp: 12.5, diurnal: 8.5, wet: 0.42, storm: 0.35, windy: 0.4, fog: 0.12, humid: 0.66, aqi: 46, sky: 'skyline', seed: 113 },
    { id: 'sea', name: 'Seattle', region: 'Washington', live: true, country: 'US', lat: 47.61, lon: -122.33, zone: 'America/Los_Angeles', tz: -7, mean: 11.5, amp: 6.5, diurnal: 6, wet: 0.75, storm: 0.05, windy: 0.35, fog: 0.25, humid: 0.74, aqi: 34, sky: 'pines', seed: 127 },
    { id: 'mia', name: 'Miami', region: 'Florida', live: true, country: 'US', lat: 25.76, lon: -80.19, zone: 'America/New_York', tz: -4, mean: 25.5, amp: 4, diurnal: 6, wet: 0.7, storm: 0.9, windy: 0.45, fog: 0.02, humid: 0.78, aqi: 40, sky: 'towers', seed: 131 },
    { id: 'orl', name: 'Orlando', region: 'Florida', live: true, country: 'US', lat: 28.54, lon: -81.38, zone: 'America/New_York', tz: -4, mean: 23.5, amp: 6, diurnal: 9, wet: 0.6, storm: 1, windy: 0.35, fog: 0.12, humid: 0.74, aqi: 38, sky: 'hills', seed: 137 },
    { id: 'tpa', name: 'Tampa', region: 'Florida', live: true, country: 'US', lat: 27.95, lon: -82.46, zone: 'America/New_York', tz: -4, mean: 23.5, amp: 6.5, diurnal: 8, wet: 0.55, storm: 0.9, windy: 0.4, fog: 0.12, humid: 0.74, aqi: 36, sky: 'harbour', seed: 139 },
    { id: 'jax', name: 'Jacksonville', region: 'Florida', live: true, country: 'US', lat: 30.33, lon: -81.66, zone: 'America/New_York', tz: -4, mean: 21, amp: 8, diurnal: 9, wet: 0.5, storm: 0.6, windy: 0.45, fog: 0.2, humid: 0.74, aqi: 38, sky: 'harbour', seed: 149 },
    { id: 'clt', name: 'Charlotte', region: 'North Carolina', live: true, country: 'US', lat: 35.23, lon: -80.84, zone: 'America/New_York', tz: -4, mean: 16.5, amp: 10.5, diurnal: 10, wet: 0.45, storm: 0.5, windy: 0.3, fog: 0.2, humid: 0.68, aqi: 44, sky: 'skyline', seed: 151 },
    { id: 'ral', name: 'Raleigh', region: 'North Carolina', live: true, country: 'US', lat: 35.78, lon: -78.64, zone: 'America/New_York', tz: -4, mean: 15.5, amp: 10.5, diurnal: 10.5, wet: 0.45, storm: 0.5, windy: 0.3, fog: 0.22, humid: 0.7, aqi: 40, sky: 'pines', seed: 157 },
    { id: 'ilm', name: 'Wilmington', region: 'North Carolina', live: true, country: 'US', lat: 34.23, lon: -77.94, zone: 'America/New_York', tz: -4, mean: 18, amp: 8.5, diurnal: 7.5, wet: 0.5, storm: 0.5, windy: 0.5, fog: 0.2, humid: 0.76, aqi: 34, sky: 'harbour', seed: 163 },
    { id: 'tyo', name: 'Tokyo', region: 'Japan', live: true, country: 'JP', lat: 35.68, lon: 139.69, zone: 'Asia/Tokyo', tz: 9, mean: 16.5, amp: 11, diurnal: 6.5, wet: 0.45, storm: 0.3, windy: 0.3, fog: 0.08, humid: 0.65, aqi: 46, sky: 'skyline', seed: 53 },
    { id: 'osa', name: 'Osaka', region: 'Japan', live: true, country: 'JP', lat: 34.69, lon: 135.5, zone: 'Asia/Tokyo', tz: 9, mean: 17, amp: 11.5, diurnal: 7, wet: 0.4, storm: 0.3, windy: 0.3, fog: 0.08, humid: 0.65, aqi: 52, sky: 'towers', seed: 167 },
    { id: 'spk', name: 'Sapporo', region: 'Japan', live: true, country: 'JP', lat: 43.06, lon: 141.35, zone: 'Asia/Tokyo', tz: 9, mean: 9, amp: 12.5, diurnal: 8, wet: 0.4, storm: 0.1, windy: 0.45, fog: 0.15, humid: 0.68, aqi: 20, sky: 'peaks', seed: 173 },
    { id: 'fuk', name: 'Fukuoka', region: 'Japan', live: true, country: 'JP', lat: 33.59, lon: 130.4, zone: 'Asia/Tokyo', tz: 9, mean: 17.5, amp: 10.5, diurnal: 6.5, wet: 0.45, storm: 0.3, windy: 0.5, fog: 0.08, humid: 0.68, aqi: 40, sky: 'harbour', seed: 179 },
    { id: 'nah', name: 'Naha', region: 'Japan (Okinawa)', live: true, country: 'JP', lat: 26.21, lon: 127.68, zone: 'Asia/Tokyo', tz: 9, mean: 24, amp: 5, diurnal: 4.5, wet: 0.6, storm: 0.5, windy: 0.6, fog: 0.03, humid: 0.78, aqi: 28, sky: 'harbour', seed: 181 },
    { id: 'rey', name: 'Reykjavik', region: 'Iceland', live: false, lat: 64.1, tz: 0, mean: 4.5, amp: 8, diurnal: 5, wet: 0.8, storm: 0.05, windy: 0.95, fog: 0.4, humid: 0.78, aqi: 14, sky: 'hills', seed: 11 },
    { id: 'sin', name: 'Singapore', region: 'Singapore', live: false, lat: 1.3, tz: 8, mean: 27.5, amp: 1, diurnal: 7, wet: 0.8, storm: 1, windy: 0.22, fog: 0.04, humid: 0.85, aqi: 52, sky: 'towers', seed: 23 },
    { id: 'rak', name: 'Marrakesh', region: 'Morocco', live: false, lat: 31.6, tz: 1, mean: 20.5, amp: 10.5, diurnal: 14, wet: 0.1, storm: 0.05, windy: 0.4, fog: 0, humid: 0.3, aqi: 68, sky: 'dunes', seed: 37 },
    { id: 'van', name: 'Vancouver', region: 'Canada', live: false, lat: 49.3, tz: -7, mean: 10.5, amp: 7.5, diurnal: 6, wet: 0.7, storm: 0.1, windy: 0.35, fog: 0.4, humid: 0.72, aqi: 26, sky: 'pines', seed: 41 },
    { id: 'syd', name: 'Sydney', region: 'Australia', live: false, lat: -33.9, tz: 10, mean: 18, amp: 5.5, diurnal: 6, wet: 0.35, storm: 0.25, windy: 0.45, fog: 0.05, humid: 0.62, aqi: 24, sky: 'harbour', seed: 67 },
    { id: 'den', name: 'Denver', region: 'United States', live: false, lat: 39.7, tz: -6, mean: 10.5, amp: 13.5, diurnal: 14, wet: 0.28, storm: 0.3, windy: 0.5, fog: 0.05, humid: 0.4, aqi: 48, sky: 'peaks', seed: 79 },
    { id: 'cpt', name: 'Cape Town', region: 'South Africa', live: false, lat: -33.9, tz: 2, mean: 17.5, amp: 5, diurnal: 7, wet: 0.3, storm: 0.1, windy: 0.85, fog: 0.15, humid: 0.6, aqi: 32, sky: 'table', seed: 97 },
  ];
  CITIES.forEach((c) => { c._ac = {}; c._dc = {}; });

  const D = { cities: CITIES, base: Date.now() / 3600000, shift: 0, override: null, units: { t: 'C', w: 'kmh' } };
  A.Data = D;
  D.invalidate = () => CITIES.forEach((c) => { c._dc = {}; });
  D.localNow = (city) => D.base + D.shift + city.tz;

  // ---- Astronomy: sun geometry from latitude + day of year; moon phase from a synodic month ----
  function dayOfYear(day) { const d = new Date(day * 86400000); return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000); }
  function astroDay(city, day) {
    const doy = dayOfYear(day), decl = 23.44 * Math.sin(TAU * (doy - 81) / 365) * D2R, lat = city.lat * D2R;
    const H0 = Math.acos(clamp(-Math.tan(lat) * Math.tan(decl), -1, 1));
    let dayLen = clamp(H0 / Math.PI * 24, 2.5, 21.5), noon = 12;
    const phase = (((day + 2440587.5 - 2451550.1) / 29.530588853) % 1 + 1) % 1;
    const sd = city.sunDays && city.sunDays[day];                      // real sunrise / sunset for live cities: solar noon is then not 12:00 on the clock
    if (sd) { dayLen = sd.sunset - sd.sunrise; noon = (sd.sunrise + sd.sunset) / 2; }
    return { doy, decl, lat, dayLen, noon, sunrise: noon - dayLen / 2, sunset: noon + dayLen / 2, maxAlt: 90 - Math.abs(city.lat - decl / D2R), phase };
  }
  function astro(city, L) {
    const day = Math.floor(L / 24), hod = L - day * 24;
    const d = city._ac[day] || (city._ac[day] = astroDay(city, day));
    const H = (hod - d.noon) * 15 * D2R;
    const sinAlt = Math.sin(d.lat) * Math.sin(d.decl) + Math.cos(d.lat) * Math.cos(d.decl) * Math.cos(H);
    const alt = Math.asin(clamp(sinAlt, -1, 1)) / D2R;
    const p = (((L / 24 + 2440587.5 - 2451550.1) / 29.530588853) % 1 + 1) % 1;
    const transit = 12 + p * 24.84;
    return {
      day, hod, doy: d.doy, alt, dayLen: d.dayLen, sunrise: d.sunrise, sunset: d.sunset, maxAlt: d.maxAlt,
      theta: 0.5 + wrap12(hod - d.noon) / d.dayLen, moonPhase: p, moonIllum: (1 - Math.cos(TAU * p)) / 2,
      moonTheta: 0.5 + wrap12(hod - transit) / 12.4,
    };
  }
  D.astro = astro;
  D.moonName = (p) => ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'][Math.round(p * 8) % 8];

  // ---- The weather function ----
  function classify(w, night) {
    const n = night;
    if (w.storm > 0.3) return { key: 'storm', label: 'Thunderstorms', icon: 'storm' };
    if (w.snow > 0.14) return { key: 'snow', label: w.snow > 0.7 ? 'Heavy snow' : w.snow > 0.4 ? 'Snow' : 'Light snow', icon: 'snow' };
    if (w.rain > 0.14) return { key: 'rain', label: w.rain > 0.75 ? 'Heavy rain' : w.rain > 0.42 ? 'Rain' : 'Light rain', icon: 'rain' };
    if (w.fog > 0.4) return { key: 'fog', label: 'Fog', icon: 'fog' };
    if (w.cloud < 0.14) return { key: 'clear', label: w.heat > 0.4 ? 'Hot and sunny' : n ? 'Clear' : 'Sunny', icon: n ? 'moon' : 'sun' };
    if (w.cloud < 0.36) return { key: 'mclear', label: n ? 'Mostly clear' : 'Mostly sunny', icon: n ? 'moon-cloud' : 'sun-cloud' };
    if (w.cloud < 0.62) return { key: 'partly', label: 'Partly cloudy', icon: n ? 'moon-cloud' : 'sun-cloud' };
    if (w.cloud < 0.85) return { key: 'mcloudy', label: 'Mostly cloudy', icon: 'cloud' };
    return { key: 'overcast', label: 'Overcast', icon: 'cloud' };
  }
  D.classify = classify;

  // A live city with data: read the real hour, add the sun and moon from astro(), and classify the sky like any other
  function sampleLive(city, L) {
    const a = astro(city, L), r = A.Live.read(city, L), T = r.temp, cloud = r.cloud, wind = r.wind;
    const heat = smooth(32, 38, T) * (1 - cloud * 0.8), windRad = r.windDir * D2R;
    const out = {
      L, hod: a.hod, day: a.day, temp: T, feels: r.feels, cloud, rain: r.rain, snow: r.snow, storm: r.storm, fog: r.fog, heat, wind, gust: Math.max(r.gust, wind), windDir: r.windDir, windX: 0,
      humidity: r.humidity, dew: r.dew, pressure: r.pressure, uv: r.uv, vis: clamp(r.vis, 0.1, 25), aqi: isFinite(r.aqi) ? Math.round(r.aqi) : NaN, pop: Math.round(r.pop), mm: r.mm, cm: r.cm,
      alt: a.alt, night: a.alt < -0.8, theta: a.theta, maxAlt: a.maxAlt, sunrise: a.sunrise, sunset: a.sunset, dayLen: a.dayLen,
      moonPhase: a.moonPhase, moonIllum: a.moonIllum, moonTheta: a.moonTheta, real: true,
    };
    out.windX = (Math.sin(windRad) <= 0 ? 1 : -1) * wind * (0.45 + 0.55 * Math.abs(Math.sin(windRad)));
    out.cond = classify(out, out.night);
    return out;
  }
  function sample(city, L) {
    if (city.live && !D.override && A.Live && A.Live.has(city)) return sampleLive(city, L);
    const s = city.seed, a = astro(city, L), hod = a.hod, o = D.override;
    const seas = -Math.cos(TAU * (a.doy - 15) / 365) * (city.lat < 0 ? -1 : 1);
    const wetN = fbm(s, L / 26), cloudN = fbm(s + 5, L / 19), tempN = fbm(s + 9, L / 60) - 0.5;
    const windN = fbm(s + 13, L / 14), stormN = fbm(s + 19, L / 9), fogN = fbm(s + 23, L / 11);
    const dcos = Math.cos(TAU * (hod - 15) / 24);
    const th = 0.86 - 0.3 * city.wet;
    let r = smooth(th, th + 0.18, wetN);
    let cloud = clamp(0.12 + 0.32 * city.wet + (cloudN - 0.5) * 1.6 + r * 0.75, 0, 1);
    let wind = city.windy * (6 + 34 * Math.pow(windN, 1.5)) + r * 6;
    let storm = 0, fog = 0, heat = 0, ptype = null;
    // pre-temperature estimate (storms need warmth; fog needs calm, cool, early-morning air)
    let T = city.mean + city.amp * seas + tempN * 8 + (city.diurnal / 2) * (1 - 0.45 * cloud - 0.3 * r) * dcos - r * 2;
    storm = smooth(0.48, 0.7, stormN) * city.storm * smooth(0.3, 0.65, r) * smooth(6, 16, T) * 1.25;
    const em = Math.exp(-(wrap12(hod - 6.5) ** 2) / (2 * 3.2 * 3.2));
    fog = clamp(smooth(0.5, 0.76, fogN) * city.fog * 2.4 * (0.15 + 0.85 * em) * (1 - smooth(10, 25, wind)) * (1 - smooth(0, 0.4, r)), 0, 1);
    if (o) {
      if (o.cloud !== undefined) cloud = o.cloud;
      if (o.r !== undefined) { r = o.r; ptype = o.ptype; }
      if (o.storm !== undefined) storm = o.storm;
      if (o.fog !== undefined) fog = o.fog;
      if (o.wind !== undefined) wind = o.wind;
      if (o.cloud !== undefined && o.r === undefined) { r = 0; if (o.storm === undefined) storm = 0; }
      if (o.cloud !== undefined && o.fog === undefined) fog = 0;
      T = city.mean + city.amp * seas + tempN * 8 + (city.diurnal / 2) * (1 - 0.45 * cloud - 0.3 * r) * dcos - r * 2;
      if (o.ptype === 'snow') T = Math.min(T, -2.5 + dcos);
      if (o.heat) { T = Math.max(T, 34 + 4 * dcos * 0.5 + 3); heat = 1; }
    }
    if (!o) heat = smooth(32, 38, T) * (1 - cloud * 0.8);
    if (o && o.heat) heat = 1;
    const cold = ptype ? (ptype === 'snow' ? 1 : 0) : smooth(1.5, -0.5, T);
    const snow = r * cold, rain = r * (1 - cold);
    const humidity = clamp(100 * city.humid + 25 * (cloud - 0.4) - 10 * dcos + r * 10 + fog * 15, 12, 100);
    const gust = wind * (1.35 + 0.25 * windN) + storm * 14;
    const windDir = (360 * fbm(s + 29, L / 40) + 360) % 360;
    const windRad = windDir * D2R;
    let feels = T;
    if (T < 10 && wind > 5) { const v = Math.pow(wind, 0.16); feels = 13.12 + 0.6215 * T - 11.37 * v + 0.3965 * T * v; }
    else if (T > 24) feels = T + Math.max(0, (humidity - 40) / 100) * (T - 20) * 0.55 - wind * 0.03;
    else feels = T - wind * 0.03;
    const uvBase = 12.5 * Math.pow(Math.max(0, Math.sin(clamp(a.alt, 0, 90) * D2R)), 1.15) * (1 - 0.06 * Math.abs(city.lat) / 10);
    const uv = Math.max(0, uvBase * (1 - 0.72 * cloud) * (1 - 0.4 * fog));
    const out = {
      L, hod, day: a.day, temp: T, feels, cloud, rain, snow, storm, fog, heat, wind, gust, windDir,
      windX: 0,
      humidity, dew: T - (100 - humidity) / 5,
      pressure: 1013 + (noise(s + 31, L / 45) - 0.5) * 44 - r * 7 - storm * 6,
      uv, vis: clamp(25 - 23 * fog - 8 * rain - 11 * snow - 5 * storm - (humidity > 85 ? 3 : 0), 0.3, 25),
      aqi: Math.round(clamp(city.aqi + (noise(s + 37, L / 30) - 0.5) * 38 + heat * 14 - r * 14 - wind * 0.35, 8, 190)),
      pop: Math.round(100 * smooth(th - 0.17, th + 0.22, wetN)),
      mm: rain > 0.02 ? Math.pow(rain, 1.4) * 5.5 * (1 + 2.2 * storm) : 0, cm: snow * 1.8,
      alt: a.alt, night: a.alt < -0.8, theta: a.theta, maxAlt: a.maxAlt, sunrise: a.sunrise, sunset: a.sunset, dayLen: a.dayLen,
      moonPhase: a.moonPhase, moonIllum: a.moonIllum, moonTheta: a.moonTheta,
    };
    // screen-space wind push: positive = blowing left-to-right (wind "from" west)
    out.windX = (Math.sin(windRad) <= 0 ? 1 : -1) * wind * (0.45 + 0.55 * Math.abs(Math.sin(windRad)));
    if (o && o.r !== undefined) out.pop = Math.round(55 + 45 * r);
    if (out.pop < 6 && r > 0.05) out.pop = 30;
    if (r < 0.03 && out.pop > 55) out.pop = 55;
    out.cond = classify(out, out.night);
    return out;
  }
  D.sample = sample;

  // ---- Forecast assembly ----
  D.daySummary = function (city, day) {
    const hit = city._dc[day]; if (hit) return hit;
    const hrs = []; for (let h = 0; h < 24; h++) hrs.push(sample(city, day * 24 + h));
    let hi = -99, lo = 99, mm = 0, cm = 0, pop = 0, mStorm = 0, mSnow = 0, mRain = 0, mFog = 0, cl = 0, n = 0;
    hrs.forEach((w, h) => {
      hi = Math.max(hi, w.temp); lo = Math.min(lo, w.temp); mm += w.mm; cm += w.cm; pop = Math.max(pop, w.pop);
      if (h >= 6 && h <= 21) { mStorm = Math.max(mStorm, w.storm); mSnow = Math.max(mSnow, w.snow); mRain = Math.max(mRain, w.rain); mFog = Math.max(mFog, w.fog); cl += w.cloud; n++; }
    });
    const a = astro(city, day * 24 + 12);
    const cond = classify({ storm: mStorm, snow: mSnow, rain: mRain, fog: mFog, cloud: cl / n, heat: hrs[15].heat }, false);
    return (city._dc[day] = { day, hi, lo, mm, cm, pop, cond, sunrise: a.sunrise, sunset: a.sunset, hours: hrs });
  };
  // Build the forecast package for a city "now": 49 hourly samples (now..+48h) and 10 daily summaries
  D.forecast = function (city) {
    const L0 = D.localNow(city), L0h = Math.floor(L0), day0 = Math.floor(L0 / 24);
    const hourly = []; for (let i = 0; i <= 48; i++) hourly.push(sample(city, L0h + i));
    const daily = []; for (let d = 0; d < 10; d++) daily.push(D.daySummary(city, day0 + d));
    return { city, L0, L0h, day0, hourly, daily };
  };
  // Internal-consistency check used by the verification harness: hourly extremes must equal daily hi/lo
  D.selfCheck = function () {
    const problems = []; let checked = 0;
    CITIES.forEach((c) => {
      const f = D.forecast(c);
      f.daily.forEach((d) => {
        const t = d.hours.map((w) => w.temp), lo = Math.min(...t), hi = Math.max(...t);
        const ser = []; for (let h = 0; h < 24; h++) ser.push(sample(c, d.day * 24 + h).temp);
        if (Math.abs(Math.min(...ser) - d.lo) > 1e-9 || Math.abs(Math.max(...ser) - d.hi) > 1e-9 || lo !== d.lo || hi !== d.hi) problems.push(c.id + ' day ' + d.day + ' hi/lo mismatch');
        if (!(d.sunrise < d.sunset)) problems.push(c.id + ' sunrise>=sunset');
        if (d.hi < d.lo) problems.push(c.id + ' hi<lo');
        checked++;
      });
      const dd = f.daily[0];
      f.hourly.forEach((w) => { if (w.day === dd.day && (w.temp > dd.hi + 1e-9 || w.temp < dd.lo - 1e-9)) problems.push(c.id + ' hourly outside daily range'); });
    });
    return { ok: problems.length === 0, checked, problems };
  };

  // ---- Units & formatting ----
  D.fmt = {
    cvt: (c) => (D.units.t === 'F' ? c * 9 / 5 + 32 : c),
    temp: (c) => Math.round(D.units.t === 'F' ? c * 9 / 5 + 32 : c) + '°',
    wind: (k) => Math.round(D.units.w === 'mph' ? k * 0.621371 : k),
    windU: () => (D.units.w === 'mph' ? 'mph' : 'km/h'),
    dist: (km) => { const v = D.units.w === 'mph' ? km * 0.621371 : km; return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + (D.units.w === 'mph' ? ' mi' : ' km'); },
    mm: (mm) => (D.units.w === 'mph' ? (mm / 25.4).toFixed(2) + ' in' : (mm < 10 ? mm.toFixed(1) : Math.round(mm)) + ' mm'),
    hour: (h) => { h = ((h % 24) + 24) % 24; let H = Math.floor(h), m = Math.round((h - H) * 60); if (m === 60) { H = (H + 1) % 24; m = 0; } const ap = H >= 12 ? 'PM' : 'AM'; return ((H + 11) % 12 + 1) + ':' + String(m).padStart(2, '0') + ' ' + ap; },
    hour1: (h) => { const H = ((Math.floor(h) % 24) + 24) % 24; return ((H + 11) % 12 + 1) + (H >= 12 ? ' PM' : ' AM'); },
    dow: (day, long) => new Date(day * 86400000).toLocaleDateString('en-US', { weekday: long ? 'long' : 'short', timeZone: 'UTC' }),
    date: (day) => new Date(day * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
  D.compass = (deg) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(deg / 22.5) % 16];
})();
