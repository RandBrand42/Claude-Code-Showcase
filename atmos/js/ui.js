/* ATMOS - ui.js : glass cards, charts, gauges, the scrubber, the city carousel. Vanilla DOM + SVG. */
(function () {
  'use strict';
  const A = window.Atmos, D = A.Data, U = A.util, F = D.fmt, I = A.ui;
  const $ = (s, r) => (r || document).querySelector(s);
  const clamp = U.clamp;
  const UI = (A.UI = {});
  let f = null, els = {}, chartG = null, chipEls = [];
  const tempColor = (c) => { const st = [[-10, [106, 169, 255]], [5, [95, 208, 232]], [15, [126, 224, 138]], [22, 232, 222, 75], [30, [245, 154, 60]], [38, [229, 72, 77]]]; st[3] = [22, [232, 222, 75]]; let a = st[0], b = st[st.length - 1]; if (c <= a[0]) return `rgb(${a[1]})`; for (let i = 1; i < st.length; i++) if (c <= st[i][0]) { a = st[i - 1]; b = st[i]; const t = (c - a[0]) / (b[0] - a[0]), m = U.mix3(a[1], b[1], t); return `rgb(${m.map(Math.round)})`; } return `rgb(${b[1]})`; };
  const tileHead = (ic, label) => `<div class="t-h">${I[ic]}<h2 class="micro">${label}</h2></div>`;

  // Fritsch-Carlson monotone cubic spline -> SVG path
  function monotone(p) {
    const n = p.length, dx = [], m = [], t = new Array(n);
    for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
    let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) d += `C${(p[i][0] + dx[i] / 3).toFixed(1)},${(p[i][1] + t[i] * dx[i] / 3).toFixed(1)} ${(p[i + 1][0] - dx[i] / 3).toFixed(1)},${(p[i + 1][1] - t[i + 1] * dx[i] / 3).toFixed(1)} ${p[i + 1][0].toFixed(1)},${p[i + 1][1].toFixed(1)}`;
    return d;
  }
  const arcPt = (cx, cy, r, a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];

  UI.init = function (cb) {
    UI.cb = cb;
    $('#logo').innerHTML = I.logo; $('#searchIc').innerHTML = I.search; $('#btnScenes').innerHTML = I.sliders; $('#btnHelp').innerHTML = I.help;
    $('#scClose').innerHTML = I.close; $('#helpClose').innerHTML = I.close; $('#nowIc').innerHTML = I.now; $('#strikeIc').innerHTML = I.bolt; UI.setPlaying(false);
    // scrubber pointer handling
    const tr = $('#track'); let drag = false;
    const at = (e) => { const r = tr.getBoundingClientRect(); cb.scrub(clamp((e.clientX - r.left) / r.width, 0, 1) * 48); };
    tr.addEventListener('pointerdown', (e) => { drag = true; tr.classList.add('drag'); tr.setPointerCapture(e.pointerId); cb.manual(); at(e); });
    tr.addEventListener('pointermove', (e) => { if (drag) at(e); });
    const end = () => { drag = false; tr.classList.remove('drag'); };
    tr.addEventListener('pointerup', end); tr.addEventListener('pointercancel', end);
    tr.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); cb.step(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey); } });
    // chart scrubbing
    const ch = $('#chart'); let cd = false;
    const cat = (e) => { if (!chartG) return; const r = ch.getBoundingClientRect(); cb.scrub(clamp((e.clientX - r.left - chartG.l) / (r.width - chartG.l - chartG.r), 0, 1) * 48); };
    ch.addEventListener('pointerdown', (e) => { cd = true; ch.setPointerCapture(e.pointerId); cb.manual(); cat(e); });
    ch.addEventListener('pointermove', (e) => { if (cd) cat(e); }); ch.addEventListener('pointerup', () => (cd = false)); ch.addEventListener('pointercancel', () => (cd = false));
    new ResizeObserver(() => { clearTimeout(UI._rz); UI._rz = setTimeout(() => f && UI.buildChart(), 120); }).observe(ch);
    const ticks = $('#ticks');
    UI.buildChips();
  };
  UI.setPlaying = (p) => { $('#btnPlay').innerHTML = p ? I.pause : I.play; $('#btnPlay').setAttribute('aria-label', p ? 'Pause time-lapse' : 'Play time-lapse'); };

  UI.buildChips = function () {
    const nav = $('#cities'); nav.innerHTML = '';
    chipEls = D.cities.map((c, i) => {
      const b = document.createElement('button'); b.className = 'chip'; b.dataset.i = i; b.setAttribute('aria-label', c.name);
      b.innerHTML = `<div class="orb"></div><div class="ground"></div><div class="cn">${c.name}</div><div class="ct"></div><div class="cd"></div><span class="ci"></span>`;
      b.addEventListener('click', () => UI.cb.city(i)); nav.appendChild(b);
      return { b, ct: $('.ct', b), cd: $('.cd', b), ci: $('.ci', b), orb: $('.orb', b), key: '' };
    });
  };
  UI.updateChips = function (t, cur) {
    D.cities.forEach((c, i) => {
      const e = chipEls[i], L = D.localNow(c) + t, w = D.sample(c, L), hod = ((L % 24) + 24) % 24;
      e.b.style.background = A.Sky.css(w.alt, w, w.theta < 0.5); e.b.setAttribute('aria-current', i === cur ? 'true' : 'false');
      e.ct.textContent = `${F.hour(hod)} · ${w.cond.label}`; e.cd.textContent = F.temp(w.temp);
      if (e.key !== w.cond.icon) { e.key = w.cond.icon; e.ci.innerHTML = A.icon(w.cond.icon); }
      e.b.classList.toggle('rainy', w.rain > 0.15 || w.storm > 0.3); e.b.classList.toggle('snowy', w.snow > 0.15);
      const moon = w.night, th = moon ? clamp(w.moonTheta, 0, 1) : clamp(w.theta, 0, 1);
      e.orb.className = 'orb' + (moon ? ' moon' : ''); const vis = moon ? w.moonTheta > 0 && w.moonTheta < 1 : w.alt > -3;
      e.orb.style.opacity = vis && w.cloud < 0.85 && w.fog < 0.6 ? 0.9 : 0; e.orb.style.transform = `translate(${8 + th * 154}px, ${58 - Math.sin(Math.PI * th) * 44}px)`;
    });
  };
  UI.filterChips = function (q) {
    q = q.trim().toLowerCase(); let first = -1;
    D.cities.forEach((c, i) => { const hit = !q || (c.name + ' ' + c.region).toLowerCase().includes(q); chipEls[i].b.hidden = !hit; if (hit && first < 0) first = i; });
    return first;
  };

  function summarize(w0, t) {
    const L0 = f.L0 + t, rows = []; for (let i = 0; i <= 12; i++) rows.push(D.sample(f.city, L0 + i));
    const wet = (w) => w.rain + w.snow + w.storm * 0.6 > 0.2, now = wet(rows[0]), noun = rows[0].snow > 0.14 ? 'Snow' : 'Rain';
    const when = (i) => F.hour1(rows[i].hod + (rows[i].L - Math.floor(rows[i].L)) + 0.4);
    let s = '';
    if (now) { const e = rows.findIndex(wet.bind(null)) >= 0 ? rows.findIndex((w, i) => i > 0 && !wet(w)) : -1; s = e > 0 ? `${noun} easing around ${when(e)}.` : `${noun} continues for the next 12 hours.`; }
    else { const b = rows.findIndex((w, i) => i > 0 && wet(w)); s = b > 0 ? `${rows[b].snow > 0.14 ? 'Snow' : rows[b].storm > 0.3 ? 'Storms' : 'Rain'} arrives around ${when(b)}.` : `${rows[0].cond.label} for the next 12 hours.`; }
    const g = Math.max(...rows.map((w) => w.gust));
    s += g > 45 ? ` Gusts up to ${F.wind(g)} ${F.windU()}.` : ` Winds ${D.compass(rows[0].windDir)} at ${F.wind(rows[0].wind)} ${F.windU()}.`;
    return s;
  }

  UI.buildCity = function (fc) {
    f = fc; const c = f.city;
    $('#hCity').textContent = c.name;
    // hourly
    $('#hourly').innerHTML = f.hourly.slice(0, 25).map((w, i) => `<button class="hr" data-i="${i}" style="animation:rise .7s var(--ease) both;animation-delay:${400 + i * 22}ms;background:none;color:inherit;font:inherit"><span class="h-t">${i === 0 ? 'Now' : F.hour1(w.hod)}</span>${A.icon(w.cond.icon)}<span class="h-v">${F.temp(w.temp)}</span><span class="h-p">${w.pop >= 20 && (w.rain + w.snow > 0.05 || w.pop > 40) ? w.pop + '%' : ''}</span></button>`).join('');
    $('#hourly').onclick = (e) => { const b = e.target.closest('.hr'); if (b) { UI.cb.manual(); UI.cb.scrub(+b.dataset.i - (f.L0 - f.L0h)); } };
    // daily
    const lo = Math.min(...f.daily.map((d) => d.lo)), hi = Math.max(...f.daily.map((d) => d.hi)), span = Math.max(1, hi - lo);
    $('#daily').innerHTML = f.daily.map((d, k) => { const l = (d.lo - lo) / span * 100, w = Math.max(6, (d.hi - d.lo) / span * 100); const w0 = k === 0 ? f.hourly[0] : null; return `<div class="dy" data-k="${k}"><span class="d-n">${k === 0 ? 'Today' : F.dow(d.day)}</span>${A.icon(d.cond.icon)}<span class="d-p">${d.pop >= 25 ? d.pop + '%' : ''}</span><span class="d-lo">${F.temp(d.lo)}</span><div class="rng"><i style="left:${l}%;width:${w}%;--a:${tempColor(d.lo)};--b:${tempColor(d.hi)};--k:${k}"></i>${w0 ? `<u style="left:${(w0.temp - lo) / span * 100}%"></u>` : ''}</div><span class="d-hi">${F.temp(d.hi)}</span></div>`; }).join('');
    $('#daily').onclick = (e) => { const r = e.target.closest('.dy'); if (!r) return; const d = f.daily[+r.dataset.k]; UI.cb.manual(); UI.cb.scrub(clamp((d.day * 24 + 13) - f.L0, 0, 48)); };
    // tiles
    $('#tWind').innerHTML = tileHead('wind', 'Wind') + `<div class="row2"><svg class="viz compass" viewBox="0 0 120 120" style="max-width:124px"><circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5"/>${Array.from({ length: 36 }, (_, i) => `<line x1="60" y1="${i % 9 ? 9 : 6}" x2="60" y2="${i % 9 ? 12 : 16}" stroke="currentColor" stroke-opacity="${i % 9 ? .4 : .9}" stroke-width="${i % 9 ? 1 : 1.8}" transform="rotate(${i * 10} 60 60)"/>`).join('')}<text x="60" y="30" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">N</text><text x="97" y="64" text-anchor="middle" font-size="9" fill="currentColor" opacity=".7">E</text><text x="60" y="100" text-anchor="middle" font-size="9" fill="currentColor" opacity=".7">S</text><text x="23" y="64" text-anchor="middle" font-size="9" fill="currentColor" opacity=".7">W</text><g class="needle" data-k="needle"><path d="M60 22l7 38H53z" fill="var(--accent)"/><path d="M60 98l-6-38h12z" fill="currentColor" opacity=".35"/></g><circle cx="60" cy="60" r="4" fill="currentColor"/></svg><div><div class="big" data-k="ws">0<small>${F.windU()}</small></div><div class="sub" style="padding-top:4px" data-k="wsub"></div></div></div>`;
    $('#tUv').innerHTML = tileHead('sun', 'UV index') + `<svg class="viz" viewBox="0 0 120 72" style="margin-top:8px"><defs><linearGradient id="uvg" x1="0" x2="1"><stop offset="0" stop-color="#4fd38a"/><stop offset=".35" stop-color="#e8de4b"/><stop offset=".6" stop-color="#f59a3c"/><stop offset=".8" stop-color="#e5484d"/><stop offset="1" stop-color="#9b4fd3"/></linearGradient></defs><path d="M12 62A48 48 0 0 1 108 62" fill="none" stroke="url(#uvg)" stroke-width="9" stroke-linecap="round"/><circle data-k="uvdot" r="7.500" fill="#fff" stroke="rgba(10,26,44,.55)" stroke-width="3"/><text data-k="uvn" x="60" y="58" text-anchor="middle" font-size="26" font-weight="300" fill="currentColor">0</text></svg><div class="sub" data-k="uvs"></div>`;
    $('#tHum').innerHTML = tileHead('drop', 'Humidity') + `<div class="row2"><div><div class="big" data-k="hum">0<small>%</small></div></div><svg class="viz" viewBox="0 0 40 52" style="max-width:54px"><defs><clipPath id="dropclip"><path d="M20 3S34 18 34 32a14 14 0 0 1-28 0C6 18 20 3 20 3z"/></clipPath></defs><path d="M20 3S34 18 34 32a14 14 0 0 1-28 0C6 18 20 3 20 3z" fill="rgba(255,255,255,.14)" stroke="currentColor" stroke-opacity=".6" stroke-width="1.5"/><rect data-k="humfill" x="0" width="40" height="52" fill="#7cc4ff" clip-path="url(#dropclip)" opacity=".9"/></svg></div><div class="sub" data-k="hsub"></div>`;
    $('#tPres').innerHTML = tileHead('gauge', 'Pressure') + `<div class="row2"><div class="big" data-k="pr">0<small>hPa</small></div><svg class="viz" viewBox="0 0 40 40" style="max-width:44px"><g data-k="parrow" style="transition:transform .6s var(--spring);transform-origin:20px 20px"><path d="M20 6v28M10 16l10-10 10 10" fill="none" stroke="var(--accent)" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round"/></g></svg></div><div class="sub" data-k="psub"></div>`;
    $('#tVis').innerHTML = tileHead('eye', 'Visibility') + `<div class="big" data-k="vis">0</div><div class="bar" style="background:linear-gradient(90deg,rgba(255,255,255,.15),rgba(255,255,255,.6))"><i data-k="visdot"></i></div><div class="sub" data-k="vsub"></div>`;
    $('#tAqi').innerHTML = tileHead('leaf', 'Air quality') + `<div class="big" data-k="aqi">0</div><div class="bar"><i data-k="aqidot"></i></div><div class="sub" data-k="asub"></div>`;
    $('#tSun').innerHTML = tileHead('sun', 'Sunrise &amp; sunset') + `<svg class="viz" viewBox="0 0 300 110" style="margin-top:6px;max-height:130px"><path d="M20 88Q150 -34 280 88" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2" stroke-dasharray="3 5"/><path data-k="sunpath" d="M20 88Q150 -34 280 88" fill="none" stroke="var(--accent)" stroke-width="3.500" stroke-linecap="round"/><line x1="8" y1="88" x2="292" y2="88" stroke="currentColor" stroke-opacity=".5" stroke-width="1.500"/><circle data-k="sundot" r="8" fill="#ffd36a" stroke="#fff" stroke-width="2.500"/></svg><div class="row2" style="justify-content:space-between;margin-top:4px"><div class="sub" style="padding:0"><b data-k="sr"></b><br>Sunrise</div><div class="sub" style="padding:0;text-align:center" data-k="moon"></div><div class="sub" style="padding:0;text-align:right"><b data-k="ss"></b><br>Sunset</div></div>`;
    $('#tPrec').innerHTML = tileHead('umbrella', 'Precipitation') + `<div class="row2" style="align-items:flex-end"><div><div class="big" data-k="pp">0<small>%</small></div><div class="sub" style="padding-top:4px" data-k="psum"></div></div><svg class="viz" viewBox="0 0 240 70" data-k="pbars" style="flex:2"></svg></div>`;
    $('#tPrec').querySelector('[data-k=pbars]').innerHTML = f.hourly.slice(0, 24).map((w, i) => `<rect data-i="${i}" x="${i * 10 + 1}" width="7" rx="3" y="${64 - Math.max(3, w.pop * 0.6)}" height="${Math.max(3, w.pop * 0.6)}" fill="var(--rain)" opacity=".5"/>`).join('');
    ['tWind', 'tUv', 'tHum', 'tPres', 'tVis', 'tAqi', 'tSun', 'tPrec'].forEach((id) => { const t = $('#' + id); t.querySelectorAll('[data-k]').forEach((n) => (els[id + n.dataset.k] = n)); });
    UI.buildChart(); UI.buildTrack();
  };

  UI.buildTrack = function () {
    const stops = f.hourly.map((w, i) => `rgb(${A.Sky.palette(w.alt, w, w.theta < 0.5).mid.map(Math.round)}) ${(i / 48 * 100).toFixed(1)}%`).join(',');
    $('#trackBg').style.background = `linear-gradient(90deg,${stops})`;
    let h = ''; for (let i = 0; i <= 48; i += 6) h += `<span style="left:${i / 48 * 100}%">${i === 0 ? '' : F.hour1(f.hourly[i].hod)}</span>`;
    $('#ticks').innerHTML = h;
  };

  UI.buildChart = function () {
    const box = $('#chart'), w = box.clientWidth, h = box.clientHeight; if (!w) return;
    const l = 34, r = 10, tp = 22, bt = 26, pw = w - l - r, ph = h - tp - bt, pbH = 38;
    const hs = f.hourly, tv = hs.map((x) => F.cvt(x.temp)), mn = Math.floor(Math.min(...tv) - 1), mx = Math.ceil(Math.max(...tv) + 1);
    const X = (i) => l + i / 48 * pw, Y = (v) => tp + (1 - (v - mn) / (mx - mn)) * (ph - pbH - 6);
    const pts = tv.map((v, i) => [X(i), Y(v)]), line = monotone(pts);
    let night = '', run = -1;
    hs.forEach((x, i) => { if (x.night && run < 0) run = i; if ((!x.night || i === 48) && run >= 0) { night += `<rect x="${X(run)}" y="${tp}" width="${X(i) - X(run)}" height="${ph}" fill="rgba(6,12,40,.22)" rx="6"/>`; run = -1; } });
    let grid = '', lab = '';
    for (let k = 0; k <= 3; k++) { const v = mn + (mx - mn) * k / 3; grid += `<line x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" stroke-opacity=".12"/>`; lab += `<text x="${l - 8}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}°</text>`; }
    for (let i = 0; i <= 48; i += 6) lab += `<text x="${X(i)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === 48 ? 'end' : 'middle'}">${i === 0 ? 'Now' : F.hour1(hs[i].hod)}</text>`;
    const bars = hs.map((x, i) => { const bh = Math.max(2, x.pop / 100 * pbH); return `<rect x="${X(i) - pw / 48 * 0.32}" y="${tp + ph - bh}" width="${pw / 48 * 0.64}" height="${bh}" rx="2.500" fill="var(--rain)" opacity="${0.25 + x.pop / 160}"/>`; }).join('');
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Temperature and rain chance chart for the next 48 hours"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${night}${grid}${bars}<path d="${line}L${X(48)},${tp + ph - pbH}L${l},${tp + ph - pbH}Z" fill="url(#cg)" opacity=".8"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:dash 1.6s var(--ease) .7s forwards"/>${lab}<g id="cursor"><line class="cur-l" y1="${tp - 6}" y2="${tp + ph}" stroke="currentColor" stroke-width="1.500" stroke-opacity=".8"/><circle r="6" fill="#fff" stroke="rgba(10,26,44,.5)" stroke-width="3"/><text class="tip" text-anchor="middle" y="-14"></text></g></svg>`;
    if (!document.getElementById('dashk')) { const s = document.createElement('style'); s.id = 'dashk'; s.textContent = '@keyframes dash{to{stroke-dashoffset:0}}'; document.head.appendChild(s); }
    chartG = { l, r, tp, ph, X, Y, mn, mx, cur: $('#cursor', box), tv };
    if (UI.last) UI.update(UI.last.w, UI.last.t);
  };

  // dynamic values, called every frame while the scrubber moves
  UI.update = function (w, t) {
    UI.last = { w, t }; const g = (id, k) => els[id + k];
    g('tWind', 'needle').style.transform = `rotate(${Math.round(w.windDir + 180)}deg)`;
    g('tWind', 'ws').firstChild.nodeValue = F.wind(w.wind); g('tWind', 'wsub').textContent = `From ${D.compass(w.windDir)} · gusts ${F.wind(w.gust)} ${F.windU()}`;
    const uv = w.uv, a = Math.PI * (1 - clamp(uv / 12, 0, 1)), p = arcPt(60, 62, 48, a); g('tUv', 'uvdot').setAttribute('cx', p[0]); g('tUv', 'uvdot').setAttribute('cy', p[1]); g('tUv', 'uvn').textContent = Math.round(uv);
    g('tUv', 'uvs').textContent = uv < 0.5 ? 'None after dark' : uv < 3 ? 'Low. Enjoy the outdoors.' : uv < 6 ? 'Moderate. Sunscreen advised.' : uv < 8 ? 'High. Seek shade at midday.' : 'Very high. Limit exposure.';
    g('tHum', 'hum').firstChild.nodeValue = Math.round(w.humidity); g('tHum', 'humfill').setAttribute('y', 52 - 46 * w.humidity / 100 - 2); g('tHum', 'hsub').textContent = `Dew point ${F.temp(w.dew)}`;
    const pa = D.sample(f.city, w.L + 3).pressure - D.sample(f.city, w.L - 3).pressure, trend = pa > 1.2 ? 'Rising' : pa < -1.2 ? 'Falling' : 'Steady';
    g('tPres', 'pr').firstChild.nodeValue = Math.round(w.pressure); g('tPres', 'parrow').style.transform = `rotate(${trend === 'Rising' ? 0 : trend === 'Falling' ? 180 : 90}deg)`; g('tPres', 'psub').textContent = `${trend} over 6 h`;
    const v = F.dist(w.vis); g('tVis', 'vis').textContent = v; g('tVis', 'visdot').style.left = clamp(w.vis / 25, 0.02, 0.98) * 100 + '%'; g('tVis', 'vsub').textContent = w.vis > 15 ? 'Crystal clear' : w.vis > 6 ? 'Good' : w.vis > 2 ? 'Hazy' : 'Poor, low cloud or fog';
    g('tAqi', 'aqi').textContent = w.aqi; g('tAqi', 'aqidot').style.left = clamp(w.aqi / 200, 0.02, 0.98) * 100 + '%'; g('tAqi', 'asub').textContent = w.aqi < 50 ? 'Good' : w.aqi < 100 ? 'Moderate' : w.aqi < 150 ? 'Unhealthy for sensitive groups' : 'Unhealthy';
    const th = clamp(w.theta, 0, 1), sp = sunPoint(th); const dot = g('tSun', 'sundot'); const day = w.alt > -0.8;
    dot.setAttribute('cx', sp[0]); dot.setAttribute('cy', day ? sp[1] : 88); dot.setAttribute('opacity', day ? 1 : 0.35);
    g('tSun', 'sunpath').style.strokeDasharray = 1; g('tSun', 'sunpath').setAttribute('pathLength', 1); g('tSun', 'sunpath').style.strokeDashoffset = 1 - th;
    g('tSun', 'sr').textContent = F.hour(w.sunrise); g('tSun', 'ss').textContent = F.hour(w.sunset); g('tSun', 'moon').innerHTML = `${D.moonName(w.moonPhase)}<br>${Math.round(w.moonIllum * 100)}% lit · ${Math.floor(w.dayLen)}h ${Math.round((w.dayLen % 1) * 60)}m of day`;
    g('tPrec', 'pp').firstChild.nodeValue = w.pop; let tot = 0, tc = 0; for (let i = 0; i < 24; i++) { const x = f.hourly[i]; tot += x.mm; tc += x.cm; }
    g('tPrec', 'psum').textContent = tc > 0.2 ? `${tc.toFixed(1)} cm snow next 24 h` : tot < 0.05 ? 'Dry next 24 h' : `${F.mm(tot)} next 24 h`;
    const sel = t < 0.05 ? 0 : Math.round(t + (f.L0 - f.L0h));
    g('tPrec', 'pbars').querySelectorAll('rect').forEach((r, i) => r.setAttribute('opacity', i === sel ? 1 : 0.45));
    // hourly highlight + chart cursor + scrubber
    if (UI._sel !== sel) { UI._sel = sel; $('#hourly').querySelectorAll('.hr').forEach((b, i) => b.classList.toggle('on', i === sel)); }
    if (chartG) { const x = chartG.X(t), y = chartG.Y(F.cvt(w.temp)); chartG.cur.setAttribute('transform', `translate(${x.toFixed(1)},0)`); const c = chartG.cur; c.querySelector('circle').setAttribute('cy', y); const tip = c.querySelector('text'); tip.setAttribute('y', y - 14); tip.textContent = F.temp(w.temp); const half = 20; tip.setAttribute('dx', x < chartG.l + half ? half : x > $('#chart').clientWidth - half ? -half : 0); }
    $('#thumb').style.left = t / 48 * 100 + '%'; const tr = $('#track'); tr.setAttribute('aria-valuenow', t.toFixed(1));
    const hod = w.hod, dayN = F.dow(w.day), isNow = t < 0.05;
    const label = isNow ? 'Now' : `${dayN} ${F.hour(hod)}`; $('#scTime').textContent = label; tr.setAttribute('aria-valuetext', label);
    $('#scSub').textContent = isNow ? `${w.cond.label} · ${F.temp(w.temp)}` : `+${Math.round(t)} h · ${w.cond.label} · ${F.temp(w.temp)}`;
    $('#hClock').textContent = `${F.dow(w.day, true)}, ${F.date(w.day)} · ${F.hour(hod)} · ${f.city.region}`;
  };
  // point on the quadratic sun arc (20,88) -> ctrl (150,-34) -> (280,88)
  function sunPoint(th) { return [20 + 260 * th, 88 - 244 * th * (1 - th)]; }
  UI.summarize = summarize;
})();
