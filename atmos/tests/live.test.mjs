// Unit tests for the pure half of js/live.js (series building, interpolation, alert parsing, time zones).
// Run:  node atmos/tests/live.test.mjs        add --live to also pull the real APIs once for every live city and sanity-check the result.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const X = require(path.join(here, '..', 'js', 'live.js'));

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'expected equal') + '\n  got:      ' + JSON.stringify(a) + '\n  expected: ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const near = (a, b, e, m) => { if (!(Math.abs(a - b) <= e)) throw new Error((m || 'not close') + ': ' + a + ' vs ' + b); };

/* a 3-day synthetic Open-Meteo response */
function fixture(over) {
  const times = []; for (let d = 0; d < 3; d++) for (let h = 0; h < 24; h++) times.push('2026-10-0' + (1 + d) + 'T' + String(h).padStart(2, '0') + ':00');
  const n = times.length, col = (f) => times.map((_, i) => f(i));
  const om = { utc_offset_seconds: -18000, hourly: { time: times, temperature_2m: col((i) => 10 + (i % 24)), apparent_temperature: col((i) => 9 + (i % 24)), relative_humidity_2m: col(() => 60), dew_point_2m: col(() => 5),
    precipitation_probability: col(() => 10), precipitation: col(() => 0), snowfall: col(() => 0), weather_code: col(() => 0), pressure_msl: col(() => 1015), cloud_cover: col(() => 20), visibility: col(() => 24000),
    wind_speed_10m: col(() => 12), wind_direction_10m: col((i) => (i * 15) % 360), wind_gusts_10m: col(() => 20), uv_index: col(() => 3) },
    daily: { time: ['2026-10-01', '2026-10-02', '2026-10-03'], sunrise: ['2026-10-01T07:15', '2026-10-02T07:16', '2026-10-03T07:17'], sunset: ['2026-10-01T19:05', '2026-10-02T19:04', '2026-10-03T19:02'] } };
  if (over) over(om.hourly, n);
  return om;
}

console.log('series');
await t('builds hourly arrays on the local-hour axis', () => { const S = X.buildSeries(fixture()); eq(S.n, 72); eq(S.t0, Date.UTC(2026, 9, 1) / 36e5); near(S.off, -5, 1e-9); });
await t('interpolates between hours', () => { const S = X.buildSeries(fixture()); const r = X.readSeries(S, S.t0 + 5.5); near(r.temp, 15.5, 1e-4); near(r.cloud, 0.2, 1e-6); });
await t('holds the first and last value outside the data', () => { const S = X.buildSeries(fixture()); near(X.readSeries(S, S.t0 - 50).temp, 10, 1e-4); near(X.readSeries(S, S.t0 + 500).temp, 33, 1e-4); ok(!X.readSeries(S, S.t0 - 50).inRange); });
await t('wind direction interpolates the short way round 350 -> 10', () => { const S = X.buildSeries(fixture((h) => { h.wind_direction_10m[0] = 350; h.wind_direction_10m[1] = 10; })); near(X.readSeries(S, S.t0 + 0.5).windDir, 0, 1e-3); });
await t('sunrise and sunset are kept per local day', () => { const S = X.buildSeries(fixture()); const day = Math.round(S.t0 / 24); near(S.sun[day].sunrise, 7.25, 1e-9); near(S.sun[day].sunset, 19 + 5 / 60, 1e-9); });
await t('junk is rejected: no hourly data, uneven times, mostly missing temperatures', () => {
  let threw = 0; for (const bad of [{}, { hourly: { time: ['2026-10-01T00:00'] } }]) { try { X.buildSeries(bad); } catch (e) { threw++; } }
  try { X.buildSeries(fixture((h) => { h.time[40] = '2026-12-01T00:00'; })); } catch (e) { threw++; }
  try { X.buildSeries(fixture((h, n) => { for (let i = 0; i < n; i++) h.temperature_2m[i] = i % 3 ? null : 5; })); } catch (e) { threw++; }
  eq(threw, 4);
});
await t('out-of-range readings become gaps and are filled from neighbours', () => { const S = X.buildSeries(fixture((h) => { h.temperature_2m[10] = 999; h.relative_humidity_2m[5] = -40; })); near(S.f.temp[10], S.f.temp[9], 1e-6); ok(S.f.humidity[5] >= 0 && S.f.humidity[5] <= 100); });
await t('missing air quality stays NaN (shown as "--"), real values land on the right hour', () => {
  const S0 = X.buildSeries(fixture()); ok(Number.isNaN(S0.f.aqi[3]));
  const S1 = X.buildSeries(fixture(), { hourly: { time: ['2026-10-01T02:00', '2026-10-01T03:00'], us_aqi: [41, 77] } }); eq([S1.f.aqi[2], S1.f.aqi[3]], [41, 77]); ok(Number.isNaN(S1.f.aqi[4]));
});

console.log('weather codes');
await t('thunderstorm code 95 gives storm, rain and full cloud', () => { const S = X.buildSeries(fixture((h) => { h.weather_code[4] = 95; })); ok(S.f.storm[4] >= 0.85 && S.f.rain[4] > 0.5 && S.f.cloud[4] === 1); });
await t('snow code gives snow and no rain; heavier snowfall raises it', () => { const S = X.buildSeries(fixture((h) => { h.weather_code[4] = 73; h.weather_code[5] = 73; h.snowfall[5] = 3; })); ok(S.f.snow[4] > 0.4 && S.f.rain[4] === 0 && S.f.snow[5] > S.f.snow[4]); });
await t('fog code and very low visibility give fog', () => { const S = X.buildSeries(fixture((h) => { h.weather_code[4] = 45; h.visibility[8] = 300; })); ok(S.f.fog[4] >= 0.8 && S.f.fog[8] > 0.5); });
await t('precipitation without a precip code is rain when warm and snow when cold', () => { const S = X.buildSeries(fixture((h) => { h.precipitation[4] = 2; h.temperature_2m[4] = 12; h.precipitation[6] = 2; h.temperature_2m[6] = -4; })); ok(S.f.rain[4] > 0 && S.f.snow[4] === 0 && S.f.snow[6] > 0 && S.f.rain[6] === 0); });
await t('clear sky stays clear', () => { const S = X.buildSeries(fixture()); ok(S.f.rain[0] === 0 && S.f.snow[0] === 0 && S.f.storm[0] === 0 && S.f.fog[0] === 0); });

console.log('alerts');
const NOW = Date.UTC(2026, 9, 1, 18);
const nws = { features: [
  { properties: { id: 'a', event: 'Flood Watch', severity: 'Moderate', headline: 'Flood Watch issued', areaDesc: 'Dallas; Tarrant', onset: '2026-10-01T06:00:00Z', ends: '2026-10-02T06:00:00Z', description: 'Heavy rain <b>expected</b>.\n\n\n\nMore.', instruction: 'Turn around.', messageType: 'Alert' } },
  { properties: { id: 'b', event: 'Tornado Warning', severity: 'Extreme', headline: 'x', areaDesc: 'y', ends: '2026-10-02T06:00:00Z', messageType: 'Update' } },
  { properties: { id: 'c', event: 'Old Alert', severity: 'Minor', ends: '2026-09-30T06:00:00Z' } },
  { properties: { id: 'd', event: 'Cancelled thing', severity: 'Severe', messageType: 'Cancel' } },
  { nonsense: true }, null ] };
await t('NWS: expired and cancelled dropped, sorted worst first, text is plain', () => {
  const a = X.nwsAlerts(nws, NOW); eq(a.map((x) => x.title), ['Tornado Warning', 'Flood Watch']); eq(a[0].level, 'extreme');
  ok(!/</.test(a[1].text) && !/\n\n\n/.test(a[1].text), a[1].text); eq(a[1].source, 'National Weather Service');
});
await t('NWS: junk input does not throw', () => { eq(X.nwsAlerts(null, NOW), []); eq(X.nwsAlerts({ features: 'x' }, NOW), []); });
const jma = (rd, ws) => ({ reportDatetime: rd, areaTypes: [{ areas: [{ code: '016010', warnings: ws }] }] });
await t('JMA: issued and continuing warnings are shown with English names; cancelled and none are not', () => {
  const r = X.jmaAlerts(jma('2026-10-01T10:00:00+09:00', [{ code: '03', status: '発表' }, { code: '14', status: '継続' }, { code: '20', status: '解除' }, { status: '発表警報・注意報はなし' }]), '016010', 'Ishikari Region', NOW);
  eq(r.items.map((x) => x.title), ['Heavy rain warning', 'Thunderstorm advisory']); eq(r.stale, false);
});
await t('JMA: a report older than 48 hours is ignored (a stale "continuing" advisory must never look current)', () => {
  const r = X.jmaAlerts(jma('2026-05-28T04:03:00+09:00', [{ code: '14', status: '継続' }]), '016010', 'Ishikari Region', NOW); eq(r.items, []); eq(r.stale, true);
});
await t('JMA: unknown area, bad date, unknown code do not throw', () => { eq(X.jmaAlerts(jma('2026-10-01T10:00:00+09:00', [{ code: '99', status: '発表' }]), '016010', 'x', NOW).items, []); eq(X.jmaAlerts({}, 'a', 'b', NOW).stale, true); eq(X.jmaAlerts(jma('2026-10-01T10:00:00+09:00', []), 'zzz', 'x', NOW).items, []); });
const quakes = { features: [
  { id: 'q1', properties: { mag: 5.6, time: NOW - 3600e3, place: '40 km E of <b>Somewhere</b>, Japan', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/q1' }, geometry: { coordinates: [140, 36, 20] } },
  { id: 'q2', properties: { mag: 6.8, time: NOW - 3600e3, place: 'Far away', url: 'https://evil.example/x' }, geometry: { coordinates: [-70, -30, 10] } },
  { id: 'q3', properties: { mag: 4.6, time: NOW - 40 * 3600e3, place: 'old' }, geometry: { coordinates: [139.7, 35.7, 10] } },
  { id: 'q4', properties: { mag: 4.6, time: NOW - 3600e3, place: 'near', url: 'javascript:alert(1)' }, geometry: { coordinates: [139.7, 35.7, 10] } }] };
await t('USGS: only recent quakes near the city, text is plain, only usgs.gov links survive', () => {
  const q = X.quakesNear(quakes, 35.68, 139.69, 400, NOW); eq(q.map((x) => x.id), ['usgs-q1', 'usgs-q4']);
  ok(!/</.test(q[0].headline)); eq(q[1].url, 'https://earthquake.usgs.gov/'); eq(q[0].level, 'moderate');
});
await t('haversine: Dallas to Fort Worth is about 50 km', () => near(X.haversine(32.78, -96.8, 32.75, -97.33), 50, 3));

console.log('time zones');
await t('zone offset follows daylight saving', () => {
  near(X.zoneOffset('America/Chicago', new Date(Date.UTC(2026, 6, 1))), -5, 1e-9); near(X.zoneOffset('America/Chicago', new Date(Date.UTC(2026, 0, 15))), -6, 1e-9);
  near(X.zoneOffset('Asia/Tokyo', new Date(Date.UTC(2026, 6, 1))), 9, 1e-9);
});

console.log('configuration');
await t('every live city has what the loader needs, and every Japanese city has a JMA area', () => {
  const src = fs.readFileSync(path.join(here, '..', 'js', 'data.js'), 'utf8'); const rows = [...src.matchAll(/\{ id: '(\w+)'[^\n]*live: true[^\n]*\}/g)].map((m) => m[0]);
  ok(rows.length >= 18, 'live rows ' + rows.length);
  for (const r of rows) { for (const k of ['lat:', 'lon:', "zone: '", "country: '", 'seed:', 'mean:']) ok(r.includes(k), r.slice(0, 40) + ' lacks ' + k); }
  for (const m of rows.filter((r) => r.includes("country: 'JP'"))) ok(X.JMA_AREAS[m.match(/id: '(\w+)'/)[1]], 'JMA area for ' + m.slice(0, 30));
});

if (process.argv.includes('--live')) {
  console.log('live (real network)');
  const src = fs.readFileSync(path.join(here, '..', 'js', 'data.js'), 'utf8');
  const cs = [...src.matchAll(/\{ id: '(\w+)', name: '([^']+)'[^\n]*live: true[^\n]*?lat: ([-\d.]+), lon: ([-\d.]+)/g)].map((m) => ({ id: m[1], name: m[2], lat: +m[3], lon: +m[4] }));
  for (let i = 0; i < cs.length; i += 6) {
    const b = cs.slice(i, i + 6), u = (base, extra) => base + 'latitude=' + b.map((c) => c.lat).join(',') + '&longitude=' + b.map((c) => c.lon).join(',') + extra;
    const om = await (await fetch(u('https://api.open-meteo.com/v1/forecast?', '&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,snowfall,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index&daily=sunrise,sunset&timezone=auto&past_days=1&forecast_days=10'))).json();
    const aq = await (await fetch(u('https://air-quality-api.open-meteo.com/v1/air-quality?', '&hourly=us_aqi&timezone=auto&past_days=1&forecast_days=5'))).json();
    b.forEach((c, k) => {
      const S = X.buildSeries(om[k], aq[k]), now = Date.now() / 36e5 + S.off, r = X.readSeries(S, now);
      console.log('  ' + c.id.padEnd(4) + c.name.padEnd(18) + ('n=' + S.n).padEnd(7) + ('now ' + r.temp.toFixed(1) + 'C feels ' + r.feels.toFixed(1)).padEnd(24) + ('rain ' + r.rain.toFixed(2) + ' cloud ' + r.cloud.toFixed(2) + ' wind ' + r.wind.toFixed(0) + ' aqi ' + (isFinite(r.aqi) ? r.aqi.toFixed(0) : '--')).padEnd(42) + 'off ' + S.off + 'h  sun days ' + Object.keys(S.sun).length);
      ok(r.inRange && r.temp > -60 && r.temp < 60, c.id + ' now outside data range');
    });
    await new Promise((r) => setTimeout(r, 400));
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
