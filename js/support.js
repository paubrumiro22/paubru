'use strict';
// "Support Blocklands": a button on the title screen (and an app on the phone) that opens a small
// card to buy Pau a coffee. The game stays free and without ads; donations are optional and never
// unlock anything. Set SUPPORT.kofi (the Ko-fi page name) and/or SUPPORT.paypal (a paypal.me
// name) to switch the buttons on; until then the card says it is coming soon.

const SUPPORT = { kofi: '', paypal: '' };

const Support = {
  el: null,
  url(kind, amount) {
    if (kind === 'kofi' && SUPPORT.kofi) return 'https://ko-fi.com/' + encodeURIComponent(SUPPORT.kofi);
    if (kind === 'paypal' && SUPPORT.paypal) return 'https://paypal.me/' + encodeURIComponent(SUPPORT.paypal) + (amount ? '/' + amount + 'EUR' : '');
    return '';
  },
  open() {
    if (this.el) { this.close(); return; }
    if (document.pointerLockElement) document.exitPointerLock();
    const on = !!(SUPPORT.kofi || SUPPORT.paypal);
    const tiers = [['☕', 'A coffee', 3], ['🥐', 'Coffee & croissant', 5], ['🍕', 'A pizza for the dev nights', 10]];
    const el = this.el = document.createElement('div');
    el.id = 'supportUI';
    el.innerHTML = `<div class="sp-card" role="dialog" aria-label="Support Blocklands">
      <button class="sp-x" aria-label="Close">✕</button>
      <div class="sp-cup"><svg viewBox="0 0 64 64"><path class="sp-steam" d="M24 8c-3 4 3 6 0 10M32 5c-3 4 3 7 0 11M40 8c-3 4 3 6 0 10"/><path d="M12 24h36v14a16 16 0 0 1-16 16h-4a16 16 0 0 1-16-16z" fill="#fff"/><path d="M48 28h4a7 7 0 0 1 0 14h-5" fill="none" stroke="#fff" stroke-width="4"/><path d="M16 30h28v6a12 12 0 0 1-12 12h-4a12 12 0 0 1-12-12z" fill="#ff7a59"/><path d="M26 36c0-3 6-3 6 1 0-4 6-4 6-1 0 4-6 8-6 8s-6-4-6-8z" fill="#fff"/></svg></div>
      <h2>Support Blocklands</h2>
      <p>Blocklands is free, with no ads and nothing to buy. If you enjoy it, you can buy Pau a coffee: it keeps the servers and the new updates going.</p>
      <div class="sp-tiers">${tiers.map(([i, n, eur]) => `<a class="sp-tier${on ? '' : ' off'}" data-eur="${eur}" target="_blank" rel="noopener"><i>${i}</i><b>${eur} €</b><span>${n}</span></a>`).join('')}</div>
      <div class="sp-row">${on ? '' : '<span class="sp-soon">Donations open very soon ✨</span>'}
        ${SUPPORT.kofi ? `<a class="sp-btn kofi" href="${this.url('kofi')}" target="_blank" rel="noopener">☕ Ko-fi</a>` : ''}
        ${SUPPORT.paypal ? `<a class="sp-btn paypal" href="${this.url('paypal')}" target="_blank" rel="noopener">PayPal</a>` : ''}</div>
      <small>Under 18? Ask an adult first. Donations are a thank-you: they don't unlock anything in the game.</small>
    </div>`;
    document.body.append(el);
    el.querySelectorAll('.sp-tier').forEach((a) => {
      const u = this.url(SUPPORT.kofi ? 'kofi' : 'paypal', a.dataset.eur);
      if (u) a.href = u; else a.addEventListener('click', (e) => e.preventDefault());
    });
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.sp-x')) this.close(); });
    requestAnimationFrame(() => el.classList.add('on'));
  },
  close() {
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.remove('on');
    setTimeout(() => el.remove(), 250);
  },
};

{
  const foot = document.querySelector('#title .title-foot');
  if (foot) {
    const b = document.createElement('button');
    b.id = 'tSupport';
    b.innerHTML = '<span>☕</span> Support Blocklands';
    b.addEventListener('click', () => Support.open());
    foot.insertBefore(b, foot.lastElementChild);
  }
  window.addEventListener('keydown', (e) => { if (Support.el && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); Support.close(); } }, true);
  if (typeof PC !== 'undefined') PC.add({ key: 'support', icon: '☕', name: 'Support', closes: true, run() { setTimeout(() => Support.open(), 80); } });
}
