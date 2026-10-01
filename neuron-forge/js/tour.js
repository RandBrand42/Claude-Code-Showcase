/* NEURON FORGE - 7-step spotlight tour */
(function (root) {
  'use strict';
  const NF = root.NF = root.NF || {};
  const el = NF.ui.el;

  class Tour {
    constructor(onClose) {
      this.root = document.getElementById('tour'); this.spot = this.root.querySelector('.tour__spot'); this.card = this.root.querySelector('.tour__card');
      this.i = 0; this.onClose = onClose; this.opener = null;
      window.addEventListener('resize', () => { if (this.isOpen()) this.show(this.i, true); });
      document.addEventListener('keydown', e => {
        if (!this.isOpen()) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
        else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (e.target.tagName !== 'BUTTON' || e.key === 'ArrowRight') { e.preventDefault(); this.next(); } }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); this.show(Math.max(0, this.i - 1)); }
        else if (e.key === 'Tab') { // keep focus inside the dialog
          const f = [...this.card.querySelectorAll('button')]; if (!f.length) return;
          const a = f[0], z = f[f.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        }
      }, true);
    }
    isOpen() { return !this.root.hidden; }
    open(i) { this.opener = document.activeElement; this.root.hidden = false; this.show(i || 0); }
    close() {
      this.root.hidden = true;
      if (this.opener && this.opener.focus) this.opener.focus({ preventScroll: true });
      this.onClose && this.onClose();
    }
    next() { this.i >= NF.TOUR.length - 1 ? this.close() : this.show(this.i + 1); }
    show(i, instant) {
      this.i = i;
      const s = NF.TOUR[i], target = document.querySelector(s.target) || document.body;
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      const r = target.getBoundingClientRect(), pad = s.pad == null ? 8 : s.pad, vw = innerWidth, vh = innerHeight;
      const st = this.spot.style;
      st.left = r.left - pad + 'px'; st.top = r.top - pad + 'px'; st.width = r.width + pad * 2 + 'px'; st.height = r.height + pad * 2 + 'px';
      const last = i === NF.TOUR.length - 1;
      this.card.replaceChildren(
        el('span', { class: 'mono-label', style: 'color:var(--amber)' }, `Step ${i + 1} of ${NF.TOUR.length}`),
        el('h2', null, s.title), el('p', null, s.body),
        el('div', { class: 'tour__foot' },
          el('div', { class: 'tour__dots' }, NF.TOUR.map((_, k) => el('i', { class: k === i ? 'on' : '' }))),
          el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => this.close() }, last ? 'Close' : 'Skip'),
          i > 0 ? el('button', { class: 'btn btn--sm', type: 'button', onclick: () => this.show(i - 1) }, 'Back') : null,
          el('button', { class: 'btn btn--sm btn--primary', type: 'button', style: 'min-width:0', onclick: () => this.next() }, last ? 'Start exploring' : 'Next')));
      // place the card beside the spotlight where there is room
      const cw = Math.min(360, vw - 24), ch = this.card.offsetHeight, gap = 18;
      const fits = {
        right: r.right + pad + gap + cw < vw - 8, left: r.left - pad - gap - cw > 8,
        below: r.bottom + pad + gap + ch < vh - 8, above: r.top - pad - gap - ch > 8,
      };
      const wide = r.width > vw * 0.6;
      const order = wide ? ['below', 'above', 'right', 'left'] : ['right', 'left', 'below', 'above'];
      const side = order.find(k => fits[k]) || 'below';
      let x, y;
      if (side === 'right') { x = r.right + pad + gap; y = r.top + r.height / 2 - ch / 2; }
      else if (side === 'left') { x = r.left - pad - gap - cw; y = r.top + r.height / 2 - ch / 2; }
      else if (side === 'below') { x = r.left + r.width / 2 - cw / 2; y = r.bottom + pad + gap; }
      else { x = r.left + r.width / 2 - cw / 2; y = r.top - pad - gap - ch; }
      x = Math.max(12, Math.min(vw - cw - 12, x)); y = Math.max(12, Math.min(vh - ch - 12, y));
      if (instant) { this.card.style.transition = 'none'; }
      this.card.style.left = x + 'px'; this.card.style.top = y + 'px';
      if (instant) { void this.card.offsetWidth; this.card.style.transition = ''; }
      const primary = this.card.querySelector('.btn--primary'); if (primary) primary.focus({ preventScroll: true });
    }
  }
  NF.Tour = Tour;
})(typeof globalThis !== 'undefined' ? globalThis : window);
