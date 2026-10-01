/* RESONANCE - recorder.js
 * Record the master bus to a 16-bit stereo WAV. A ScriptProcessor tap (created only while recording)
 * collects raw PCM so the file is lossless; no AudioWorklet or network needed.
 */
(function () {
  'use strict';
  const R = window.R;
  const Rec = { active: false, chunks: [[], []], len: 0, proc: null, sink: null, t0: 0 };

  function encodeWav(chunks, len, sr) {
    const buf = new ArrayBuffer(44 + len * 4), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + len * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, len * 4, true);
    let o = 44;
    const L = chunks[0], Rr = chunks[1];
    for (let c = 0; c < L.length; c++) {
      for (let i = 0; i < L[c].length; i++) {
        v.setInt16(o, Math.max(-1, Math.min(1, L[c][i])) * 0x7fff, true);
        v.setInt16(o + 2, Math.max(-1, Math.min(1, Rr[c][i])) * 0x7fff, true);
        o += 4;
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  Rec.start = function () {
    const E = R.Engine, ctx = E.ctx;
    if (!ctx || Rec.active) return false;
    Rec.chunks = [[], []]; Rec.len = 0;
    Rec.proc = ctx.createScriptProcessor(4096, 2, 2);
    Rec.proc.onaudioprocess = (e) => {
      if (!Rec.active) return;
      for (let c = 0; c < 2; c++) Rec.chunks[c].push(new Float32Array(e.inputBuffer.getChannelData(c)));
      Rec.len += e.inputBuffer.length;
      if (Rec.len > ctx.sampleRate * 900) Rec.stop();
    };
    Rec.sink = ctx.createGain(); Rec.sink.gain.value = 0;
    E.nodes.out.connect(Rec.proc); Rec.proc.connect(Rec.sink).connect(ctx.destination);
    Rec.active = true; Rec.t0 = ctx.currentTime;
    R.emit('rec', true);
    return true;
  };
  Rec.stop = function () {
    if (!Rec.active) return null;
    Rec.active = false;
    const E = R.Engine, ctx = E.ctx;
    try { E.nodes.out.disconnect(Rec.proc); Rec.proc.disconnect(); Rec.sink.disconnect(); } catch (e) { /* ok */ }
    Rec.proc.onaudioprocess = null;
    const blob = encodeWav(Rec.chunks, Rec.len, ctx.sampleRate);
    const secs = Rec.len / ctx.sampleRate;
    Rec.chunks = [[], []];
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const name = 'resonance-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.wav';
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    R.emit('rec', false);
    return { name, secs, bytes: blob.size };
  };
  Rec.elapsed = () => (Rec.active ? R.Engine.ctx.currentTime - Rec.t0 : 0);
  R.Rec = Rec;
})();
