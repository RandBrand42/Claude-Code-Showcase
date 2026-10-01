/* RESONANCE - visuals.js
 * Live visualisers driven by the real AnalyserNodes: phosphor-persistence oscilloscope, log-frequency spectrum
 * with peak-hold, scrolling spectrogram, stereo LED meter with clip latch. Everything breathes gently when silent.
 */
(function () {
  'use strict';
  const R = window.R, U = R.util;
  const $ = (s) => document.querySelector(s);
  const cvS = $('#cvScope'), cvF = $('#cvSpec'), cvG = $('#cvGram'), cvM = $('#cvMeter'), cvSp = $('#cvSplash');
  const gS = cvS.getContext('2d'), gF = cvF.getContext('2d'), gG = cvG.getContext('2d', { willReadFrequently: false }), gM = cvM.getContext('2d'), gSp = cvSp.getContext('2d');
  const roSpec = $('#roSpec'), roScope = $('#roScope'), clipLed = $('#clipLed');
  const dprOf = () => Math.min(window.devicePixelRatio || 1, 2);

  let N = null;                       // engine node bag once powered on
  let tdata = new Float32Array(2048), fdata = new Uint8Array(2048), lbuf = new Float32Array(1024), rbuf = new Float32Array(1024);
  let act = 0, frame = 0, running = false;
  const nowS = () => performance.now() / 1000;

  function fit(cv, scale) {
    const d = dprOf() * (scale || 1), w = Math.max(2, Math.round(cv.clientWidth * d)), h = Math.max(2, Math.round(cv.clientHeight * d));
    if (cv.width === w && cv.height === h) return false;
    cv.width = w; cv.height = h; return true;
  }

  /* ---------- oscilloscope ---------- */
  function drawScope(t) {
    fit(cvS);
    const w = cvS.width, h = cvS.height, d = dprOf();
    let peak = 0;
    if (N) {
      N.anScope.getFloatTimeDomainData(tdata);
      for (let i = 0; i < tdata.length; i += 4) { const a = Math.abs(tdata[i]); if (a > peak) peak = a; }
    }
    act += ((peak > 0.004 ? 1 : 0) - act) * 0.07;
    const idleAmp = (1 - act) * (0.07 + 0.035 * Math.sin(t * 0.7));
    // rising zero-crossing trigger keeps periodic waves still
    let start = 0;
    if (N && peak > 0.004) for (let i = 1; i < tdata.length / 2; i++) if (tdata[i - 1] < 0 && tdata[i] >= 0) { start = i; break; }
    const len = 1024;
    gS.globalCompositeOperation = 'destination-out';
    gS.fillStyle = 'rgba(0,0,0,0.2)';
    gS.fillRect(0, 0, w, h);
    gS.globalCompositeOperation = 'lighter';
    gS.lineJoin = 'round';
    const path = new Path2D();
    for (let i = 0; i < len; i += 2) {
      const x = (i / (len - 1)) * w;
      const real = N ? tdata[start + i] || 0 : 0;
      const idle = idleAmp * (0.6 * Math.sin(i * 0.021 + t * 0.9) + 0.4 * Math.sin(i * 0.057 - t * 0.6));
      const y = h * 0.5 - (real * 1.25 + idle) * h * 0.42;
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
    }
    gS.strokeStyle = 'rgba(70,255,220,0.16)'; gS.lineWidth = 6 * d; gS.stroke(path);
    gS.strokeStyle = 'rgba(150,255,235,0.95)'; gS.lineWidth = 1.6 * d; gS.stroke(path);
    if (frame % 8 === 0) roScope.textContent = N ? (peak > 0.004 ? (20 * Math.log10(peak)).toFixed(1) + ' dB' : 'SIGNAL -') : 'STANDBY';
  }

  /* ---------- spectrum ---------- */
  let bars = [], pk = [], pkHold = [], grad = null, gradH = 0;
  function drawSpectrum(t) {
    fit(cvF);
    const w = cvF.width, h = cvF.height, d = dprOf();
    const nb = Math.max(16, Math.floor(w / (7 * d)));
    if (bars.length !== nb) { bars = new Array(nb).fill(0); pk = new Array(nb).fill(0); pkHold = new Array(nb).fill(0); }
    if (N) N.anSpec.getByteFrequencyData(fdata);
    const sr = N ? N.anSpec.context.sampleRate : 48000, binHz = sr / 4096;
    let maxV = 0, maxI = 0;
    gF.clearRect(0, 0, w, h);
    if (!grad || gradH !== h) {
      grad = gF.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, '#0c6f86'); grad.addColorStop(0.45, '#45e0ff'); grad.addColorStop(0.78, '#ffd27d'); grad.addColorStop(1, '#ff9d2e');
      gradH = h;
    }
    const bw = w / nb;
    for (let i = 0; i < nb; i++) {
      const f0 = 30 * Math.pow(600, i / nb), f1 = 30 * Math.pow(600, (i + 1) / nb);
      let v = 0;
      if (N) {
        const b0 = Math.floor(f0 / binHz), b1 = Math.max(b0, Math.floor(f1 / binHz));
        for (let b = b0; b <= b1; b++) { const x = fdata[b] || 0; if (x > v) v = x; if (x > maxV) { maxV = x; maxI = b; } }
        v /= 255;
      }
      const idle = (1 - act) * (0.05 + 0.035 * Math.sin(t * 0.9 + i * 0.22)) * (1 - (i / nb) * 0.55);
      v = Math.max(v, idle);
      bars[i] += (v - bars[i]) * (v > bars[i] ? 0.65 : 0.16);
      if (bars[i] >= pk[i]) { pk[i] = bars[i]; pkHold[i] = 24; } else if (pkHold[i]-- < 0) pk[i] = Math.max(0, pk[i] - 0.008);
      const bh = Math.pow(bars[i], 1.25) * h * 0.93;
      gF.fillStyle = grad;
      gF.fillRect(i * bw + 1 * d, h - bh, Math.max(1, bw - 2 * d), bh);
      gF.fillStyle = 'rgba(255,244,214,0.95)';
      gF.fillRect(i * bw + 1 * d, h - Math.pow(pk[i], 1.25) * h * 0.93 - 2 * d, Math.max(1, bw - 2 * d), 2 * d);
    }
    gF.globalCompositeOperation = 'destination-out';         // LED-matrix segment gaps
    gF.fillStyle = 'rgba(0,0,0,0.75)';
    for (let y = 0; y < h; y += 4 * d) gF.fillRect(0, y, w, 1 * d);
    gF.globalCompositeOperation = 'source-over';
    if (frame % 6 === 0) roSpec.textContent = N && maxV > 40 ? Math.round(maxI * binHz) + ' Hz' : '20 Hz - 18 kHz';
  }

  /* ---------- spectrogram ---------- */
  const LUT = new Uint8ClampedArray(256 * 3);
  (function () {
    const stops = [[0, 3, 8, 12], [0.22, 8, 40, 78], [0.5, 22, 150, 185], [0.78, 255, 178, 62], [1, 255, 246, 222]];
    for (let i = 0; i < 256; i++) {
      const x = i / 255; let s = 0;
      while (s < stops.length - 2 && x > stops[s + 1][0]) s++;
      const a = stops[s], b = stops[s + 1], k = (x - a[0]) / (b[0] - a[0]);
      for (let c = 0; c < 3; c++) LUT[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * k;
    }
  })();
  let gramRows = null, gramImg = null, gramT = 0;
  function drawGram(t) {
    if (fit(cvG, 0.6 / dprOf() * dprOf())) { gramRows = null; gG.fillStyle = '#04090a'; gG.fillRect(0, 0, cvG.width, cvG.height); }
    const w = cvG.width, h = cvG.height;
    if (!gramRows) {
      const binHz = (N ? N.anSpec.context.sampleRate : 48000) / 4096;
      gramRows = new Int16Array(h);
      for (let y = 0; y < h; y++) gramRows[y] = Math.floor((40 * Math.pow(450, 1 - y / h)) / binHz);
      gramImg = gG.createImageData(1, h);
    }
    const dx = Math.max(1, Math.min(14, Math.round((t - gramT) * 48 * 0.6)));
    gramT = t;
    gG.globalCompositeOperation = 'copy';
    gG.drawImage(cvG, -dx, 0);
    gG.globalCompositeOperation = 'source-over';
    const dat = gramImg.data;
    for (let y = 0; y < h; y++) {
      let v = N ? fdata[gramRows[y]] || 0 : 0;
      v = Math.max(v, (1 - act) * (14 + 8 * Math.sin(t * 0.8 + y * 0.12)));
      const o = v * 3, p = y * 4;
      dat[p] = LUT[o]; dat[p + 1] = LUT[o + 1]; dat[p + 2] = LUT[o + 2]; dat[p + 3] = 255;
    }
    gG.putImageData(gramImg, w - 1, 0);
    if (dx > 1) gG.drawImage(cvG, w - 1, 0, 1, h, w - dx, 0, dx, h);
  }

  /* ---------- meter ---------- */
  const lvl = [0, 0], hold = [0, 0], holdT = [0, 0];
  let clipped = false;
  function dbNorm(a) { return U.clamp((20 * Math.log10(a + 1e-6) + 54) / 54, 0, 1); }
  function drawMeter() {
    fit(cvM);
    const w = cvM.width, h = cvM.height, d = dprOf(), vertical = h >= w * 0.8;
    const peaks = [0, 0];
    if (N) {
      N.anL.getFloatTimeDomainData(lbuf); N.anR.getFloatTimeDomainData(rbuf);
      for (let i = 0; i < lbuf.length; i++) { const a = Math.abs(lbuf[i]), b = Math.abs(rbuf[i]); if (a > peaks[0]) peaks[0] = a; if (b > peaks[1]) peaks[1] = b; }
    }
    if (Math.max(peaks[0], peaks[1]) >= 0.93 && !clipped) { clipped = true; clipLed.classList.add('hot'); }
    gM.clearRect(0, 0, w, h);
    const segs = vertical ? 22 : 30;
    const pad = 6 * d, gap = 6 * d;
    for (let ch = 0; ch < 2; ch++) {
      const target = dbNorm(peaks[ch]);
      lvl[ch] += (target - lvl[ch]) * (target > lvl[ch] ? 0.6 : 0.1);
      if (lvl[ch] >= hold[ch]) { hold[ch] = lvl[ch]; holdT[ch] = 40; } else if (holdT[ch]-- < 0) hold[ch] = Math.max(0, hold[ch] - 0.012);
      const span = vertical ? (w - pad * 2 - gap) / 2 : (h - pad * 2 - gap) / 2;
      const off = pad + ch * (span + gap);
      for (let s = 0; s < segs; s++) {
        const frac = (s + 0.5) / segs, on = frac <= lvl[ch], isHold = Math.abs(frac - hold[ch]) < 0.5 / segs;
        const col = frac > 0.93 ? '255,77,87' : frac > 0.78 ? '255,178,62' : '69,224,255';
        gM.fillStyle = on || isHold ? 'rgba(' + col + ',' + (on ? 0.95 : 0.8) + ')' : 'rgba(' + col + ',0.09)';
        if (vertical) {
          const sh = (h - pad * 2) / segs;
          gM.fillRect(off, h - pad - (s + 1) * sh + 1.5 * d, span, sh - 3 * d);
        } else {
          const sw = (w - pad * 2) / segs;
          gM.fillRect(pad + s * sw + 1.5 * d, off, sw - 3 * d, span);
        }
      }
    }
  }
  clipLed.addEventListener('click', () => { clipped = false; clipLed.classList.remove('hot'); });

  /* ---------- splash backdrop (runs before power-on) ---------- */
  function drawSplash(t) {
    fit(cvSp, 0.75);
    const w = cvSp.width, h = cvSp.height;
    gSp.globalCompositeOperation = 'destination-out'; gSp.fillStyle = 'rgba(0,0,0,0.12)'; gSp.fillRect(0, 0, w, h);
    gSp.globalCompositeOperation = 'lighter';
    for (let l = 0; l < 3; l++) {
      gSp.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const u = x / w, env = Math.sin(u * Math.PI);
        const y = h * 0.5 + Math.sin(u * 9 + t * (0.5 + l * 0.2) + l * 2) * h * 0.11 * env * (0.6 + 0.4 * Math.sin(t * 0.5 + l)) + Math.sin(u * 23 - t * 0.9) * h * 0.02 * env;
        if (x) gSp.lineTo(x, y); else gSp.moveTo(x, y);
      }
      gSp.strokeStyle = l === 0 ? 'rgba(69,224,255,0.35)' : l === 1 ? 'rgba(255,178,62,0.22)' : 'rgba(69,224,255,0.12)';
      gSp.lineWidth = (l === 0 ? 2 : 1.4) * dprOf();
      gSp.stroke();
    }
  }

  /* ---------- loop ---------- */
  const listeners = [];
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const t = nowS();
    frame++;
    if (document.getElementById('splash').classList.contains('gone')) { drawScope(t); drawSpectrum(t); if (frame % 1 === 0) drawGram(t); drawMeter(); }
    else drawSplash(t);
    for (const fn of listeners) fn(t);
  }
  R.Visuals = {
    attach(nodes) { N = nodes; gramRows = null; },
    onFrame(fn) { listeners.push(fn); },
    start() { if (!running) { running = true; requestAnimationFrame(loop); } },
    drawOnce() { const t = nowS(); drawScope(t); drawSpectrum(t); drawGram(t); drawMeter(); },
  };
})();
