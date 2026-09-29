'use strict';
// Mercat: the players' market. Put things from your inventory up for sale at your own price
// (they leave your inventory while they are on the stall); anyone on the server can buy them,
// also while you are away: the coins wait for you and arrive the next time you play. Playing on
// your own, neighbours come by now and then and buy what is fairly priced. Open it from a
// computer (Mercat app), with /market, or at the market stall sign of the Galeries.
// On a server every listing is a shared state entry 'mk:<id>' (kept in the cloud), so it is
// there for whoever comes next; a sale marks it sold and the seller collects it.

const MARKET_MAX = 12;
const MARKET_BUYERS = ['Marta', 'Jordi', 'Laia', 'Pol', 'Núria', 'Arnau', 'Carla', 'Marc', 'Anna', 'Oriol', 'Júlia', 'Biel'];
const MARKET_VALUE = {};
{
  const V = (id, v) => { if (id !== undefined) MARKET_VALUE[id] = v; };
  for (const S of Object.values(SHOPS)) for (const [id, p] of S.sell) V(id, p);
  V(I.DIAMOND, 40); V(I.EMERALD, 14); V(I.GOLD_INGOT, 10); V(I.IRON_INGOT, 6); V(I.COAL, 1); V(I.REDSTONE, 2);
  V(I.ENDER_PEARL, 20); V(I.LEATHER, 2); V(I.STRING, 1); V(I.FEATHER, 1); V(I.BONE, 1); V(I.GUNPOWDER, 3); V(I.ENCHANTED_BOOK, 45);
  V(B.DIAMOND_BLOCK, 360); V(B.GOLD_BLOCK, 90); V(B.IRON_BLOCK, 54); V(B.OBSIDIAN, 6); V(B.TNT, 8);
}

const Market = {
  map: new Map(), p: null, tab: 'browse', simT: 0,
  value(s) {
    if (!s) return 0;
    let v = MARKET_VALUE[s.id];
    const d = ITEM_DEF[s.id];
    if (v === undefined) v = d && d.tool ? 12 : d && d.food ? 3 : d && d.block ? 0.5 : 1;
    if (s.ench) v += Object.values(s.ench).reduce((a, n) => a + n * 10, 0);
    return v * s.count;
  },
  load() {
    this.map.clear();
    const src = G.prog && G.prog.market;
    if (Array.isArray(src)) for (const l of src) if (this.valid(l)) this.map.set(l.id, l);
  },
  store() { if (!G.prog) G.prog = {}; G.prog.market = [...this.map.values()].slice(-200); },
  valid(l) { return l && typeof l.id === 'string' && typeof l.o === 'string' && l.s && isItem(l.s.id) && Number.isFinite(l.p) && l.p > 0; },
  share(l) { this.store(); if (typeof SharedState !== 'undefined') SharedState.put('mk:' + l.id, l.gone ? null : l); },
  mine() { return [...this.map.values()].filter((l) => l.o === Net.owner && !l.gone); },

  list(slot, count, price) {
    const s = G.inv.slots[slot];
    if (!s) return;
    if (this.mine().filter((l) => !l.sold).length >= MARKET_MAX) { G.ui.toast('You can have ' + MARKET_MAX + ' things on sale at once'); return; }
    count = clamp(count | 0, 1, s.count);
    price = clamp(Math.round(price), 1, 1e6);
    const st = cloneStack(s); st.count = count;
    s.count -= count; if (s.count <= 0) G.inv.slots[slot] = null;
    G.ui.invDirty();
    const l = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), o: Net.owner, n: Net.name, s: st, p: price, t: Date.now() };
    this.map.set(l.id, l);
    this.share(l);
    sfx('pop', null, 0.8, 1.2);
    G.ui.toast('🧺 On sale: ' + count + '× ' + ITEM_DEF[st.id].name + ' for ' + price + ' coins');
  },
  cancel(l) {
    if (l.o !== Net.owner || l.sold) return;
    l.gone = true;
    this.give(l.s);
    this.share(l); this.map.delete(l.id); this.store();
  },
  buy(l) {
    if (l.sold || l.gone || l.o === Net.owner) return;
    if (!Shops.pay(l.p)) { G.ui.toast('🪙 You need ' + l.p + ' coins'); sfx('gate_no', null, 0.6, 1); return; }
    l.sold = { by: Net.owner, bn: Net.name, t: Date.now() };
    this.give(l.s);
    this.share(l);
    sfx('shop_till', null, 0.7, 1);
    G.ui.toast('🧺 You bought ' + l.s.count + '× ' + ITEM_DEF[l.s.id].name + ' from ' + l.n);
  },
  give(s) {
    const st = cloneStack(s);
    const left = G.inv.add(st);
    if (left > 0) Ents.spawnItem(Object.assign(cloneStack(st), { count: left }), G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]);
    G.ui.invDirty();
  },
  // the seller collects the coins of everything sold
  collect() {
    let got = 0; const names = [];
    for (const l of this.mine()) {
      if (!l.sold) continue;
      got += l.p; names.push(l.s.count + '× ' + ITEM_DEF[l.s.id].name + ' → ' + l.sold.bn);
      l.gone = true; this.share(l); this.map.delete(l.id);
    }
    this.store();
    if (got) {
      Shops.earn(got);
      G.ui.banner('💰', 'Market: +' + got + ' coins · ' + names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : ''));
      sfx('achieve', null, 0.6, 1.2);
    }
    return got;
  },
  receive(id, v) {
    if (!v) { const l = this.map.get(id); if (l && !(l.o === Net.owner && l.sold)) this.map.delete(id); }
    else if (this.valid(v)) this.map.set(id, v);
    this.store();
    if (this.p) this.render();
  },

  update(dt) {
    // on your own, neighbours buy fairly priced things now and then (about once a minute each)
    this.simT += dt;
    if (this.simT < 20) return;
    this.simT = 0;
    const alone = !(Net.on && Net.server);
    for (const l of this.mine()) {
      if (l.sold) continue;
      if (!alone && Date.now() - l.t < 30 * 60e3) continue;     // on servers the neighbours step in after half an hour
      const fair = this.value(l.s) / l.p;
      const chance = clamp(fair, 0, 2) * (alone ? 0.18 : 0.05);
      if (Math.random() < chance) l.sold = { by: 'npc', bn: MARKET_BUYERS[Math.floor(Math.random() * MARKET_BUYERS.length)], t: Date.now() }, this.share(l);
    }
    if (this.mine().some((l) => l.sold)) this.collect();
  },

  // ---------------------------------------------------------------- panel ----
  open(tab) {
    if (this.p) { this.p.close(); return; }
    if (tab) this.tab = tab;
    this.p = GPanel.open({ title: ED('Mercat', 'Market'), sub: Net.on && Net.server ? Net.server.name : 'Your neighbourhood', icon: '🧺', cls: 'gp-shop', width: 680, onClose: () => { this.p = null; } });
    this.p.wrap.querySelector('.gp').style.setProperty('--shop', '#2fbf71');
    this.collect();
    this.render();
  },
  render() {
    const p = this.p;
    if (!p) return;
    const e = GPanel.esc, money = G.mode === 'creative' ? '∞' : (G.money | 0);
    const mine = this.mine();
    let h = `<div class="gp-tabs"><button data-tab="browse" class="${this.tab === 'browse' ? 'on' : ''}">🛍️ Browse</button><button data-tab="mine" class="${this.tab === 'mine' ? 'on' : ''}">🧺 My stall (${mine.length})</button>
      <button data-tab="sell" class="${this.tab === 'sell' ? 'on' : ''}">➕ Sell something</button><span class="shop-money">🪙 ${money}</span></div>`;
    const card = (l, btn) => `<div class="shop-it mk-it"><i class="shop-ic" style="background-image:url(${iconURL(l.s.id)})"></i><b>${l.s.count > 1 ? l.s.count + '× ' : ''}${e(ITEM_DEF[l.s.id].name)}</b>
      <span class="shop-pr">🪙 ${l.p}</span><span class="gp-dim">${l.o === Net.owner ? (l.sold ? 'Sold to ' + e(l.sold.bn) : 'On sale · ' + agoText(l.t)) : 'by ' + e(l.n)}</span>${btn}</div>`;
    if (this.tab === 'browse') {
      const all = [...this.map.values()].filter((l) => !l.sold && !l.gone && l.o !== Net.owner).sort((a, b) => b.t - a.t);
      h += all.length ? `<div class="shop-grid">${all.map((l) => card(l, `<button class="gp-btn ok" data-buy="${l.id}">Buy</button>`)).join('')}</div>`
        : `<div class="gp-empty">${Net.on && Net.server ? 'Nobody is selling anything right now.' : 'Here you see what other players sell on a server.<br>Playing alone, your neighbours buy what you put on your stall.'}</div>`;
    } else if (this.tab === 'mine') {
      h += mine.length ? `<div class="shop-grid">${mine.map((l) => card(l, l.sold ? '' : `<button class="gp-btn" data-cancel="${l.id}">Take back</button>`)).join('')}</div>`
        : '<div class="gp-empty">Your stall is empty. Put something on sale in ➕ Sell something.</div>';
    } else {
      const slots = G.inv.slots.map((s, i) => [s, i]).filter(([s]) => s);
      h += `<p class="gp-dim" style="margin:0 0 10px">Pick something from your inventory, then the amount and the price.</p>
        <div class="shop-grid">${slots.map(([s, i]) => `<button class="shop-it${this.pick === i ? ' in' : ''}" data-pick="${i}"><i class="shop-ic" style="background-image:url(${iconURL(s.id)})"></i><b>${e(ITEM_DEF[s.id].name)}</b><span class="gp-dim">× ${s.count}</span></button>`).join('')}</div>`;
      const s = this.pick !== undefined && G.inv.slots[this.pick];
      if (s) {
        const sug = Math.max(1, Math.round(this.value(s) * 1.1));
        h += `<div class="shop-foot"><span>${e(ITEM_DEF[s.id].name)} · amount <input type="number" class="mk-n" min="1" max="${s.count}" value="${s.count}" style="width:70px"> · price 🪙 <input type="number" class="mk-p" min="1" value="${sug}" style="width:90px"> <span class="gp-dim">(fair price ≈ ${sug})</span></span><button class="gp-btn ok" data-list>Put on sale</button></div>`;
      }
    }
    p.body.innerHTML = h;
    p.body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); }));
    p.body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { const l = this.map.get(b.dataset.buy); if (l) this.buy(l); this.render(); }));
    p.body.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { const l = this.map.get(b.dataset.cancel); if (l) this.cancel(l); this.render(); }));
    p.body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { this.pick = Number(b.dataset.pick); this.render(); }));
    const n = p.body.querySelector('.mk-n'), pr = p.body.querySelector('.mk-p');
    if (n && pr) {
      const s = G.inv.slots[this.pick];
      n.addEventListener('input', () => { const k = clamp(Number(n.value) | 0, 1, s.count); pr.value = Math.max(1, Math.round(this.value(Object.assign({}, s, { count: k })) * 1.1)); });
      p.body.querySelector('[data-list]').addEventListener('click', () => { this.list(this.pick, Number(n.value), Number(pr.value)); this.pick = undefined; this.tab = 'mine'; this.render(); });
    }
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const apply = SharedState.apply;
  SharedState.apply = function (k, v) { if (k.startsWith('mk:')) { Market.receive(k.slice(3), v); return; } return apply.call(this, k, v); };
  // whoever joins gets the stalls we know
  const greet = SharedState.greet;
  SharedState.greet = function () {
    greet.call(this);
    let n = 0;
    for (const l of Market.map.values()) if (!l.gone && n++ < 120) Net.sendState({ k: 'mk:' + l.id, v: l, t: this.times.get('mk:' + l.id) || l.t });
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); Market.update(dt || 0.016); };
  PC.add({ key: 'market', icon: '🧺', name: ED('Mercat', 'Market'), run() { Market.open(); } });
  const run = Commands.run;
  Commands.run = function (text) { if (/^\/(market|mercat)\b/i.test(text)) { Market.open(); return; } return run.call(this, text); };
  // the kiosk keeper also runs the market board
  SHOPS.quiosc.market = true;
  const open = Shops.open;
  Shops.open = function (key, delivery) {
    open.call(this, key, delivery);
    if (key === 'quiosc' && !delivery) {
      const p = GPanel.top(), t = p && p.body.querySelector('.gp-tabs');
      if (t) { const b = document.createElement('button'); b.textContent = '🧺 Mercat'; b.addEventListener('click', () => { p.close(); Market.open(); }); t.insertBefore(b, t.querySelector('.shop-money')); }
    }
  };
  // listings live with the world's progress
  const newW = newWorld;
  // eslint-disable-next-line no-global-assign
  newWorld = function (...a) { const r = newW.apply(this, a); Market.load(); return r; };
}
