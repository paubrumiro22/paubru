'use strict';
// Shops in the Galeries STUCOM (built by district.js under the square, off the Universitat metro
// landing): the SuperBloc supermarket, Forn Can Pau, Mobles Blocklands, the car showroom and the
// kiosk. Right-click a shopkeeper or a till to open the shop: a catalogue with prices in coins,
// a basket, and a "Sell" tab where the supermarket and the bakery buy your crops and food.
// Bakery goods are new foods (croissant, ensaïmada, coca, cookie...). During Sant Joan the coca is
// half price, at Christmas everything in the bakery is 20% off. The cars on show are real cars
// that turn slowly on their turntable: right-click one to buy it. Prices on the computer (PC app)
// too: "Botiga online" delivers to your inventory.

Object.assign(I, { CROISSANT: 435, ENSAIMADA: 436, COCA: 437, COOKIE: 438, PA_TOMAQUET: 439, JUICE: 440, CHOCOLATE: 441, SANDWICH: 442 });
{
  const F = 'food';
  defItem(I.CROISSANT, 'Croissant', { sprite: 'i_croissant', food: [4, 5], cat: F });
  defItem(I.ENSAIMADA, 'Ensaïmada', { sprite: 'i_ensaimada', food: [5, 6], cat: F });
  defItem(I.COCA, 'Coca de Sant Joan', { sprite: 'i_coca', food: [7, 9], cat: F });
  defItem(I.COOKIE, 'Cookie', { sprite: 'i_cookie', food: [2, 1], cat: F });
  defItem(I.PA_TOMAQUET, 'Pa amb Tomàquet', { sprite: 'i_pa_tomaquet', food: [6, 8], cat: F });
  defItem(I.JUICE, 'Orange Juice', { sprite: 'i_juice', food: [3, 5], cat: F });
  defItem(I.CHOCOLATE, 'Chocolate Bar', { sprite: 'i_chocolate', food: [3, 2], cat: F });
  defItem(I.SANDWICH, 'Entrepà', { sprite: 'i_sandwich', food: [8, 10], cat: F });
}

const SHOPS = {
  super: { name: 'SuperBloc', icon: '🛒', tag: 'Supermercat', color: '#d6202b',
    sell: [[I.BREAD, 3], [I.APPLE, 2], [I.PA_TOMAQUET, 5], [I.SANDWICH, 7], [I.STEAK, 7], [I.COOKED_CHICKEN, 6], [I.COOKED_PORK, 6], [I.COOKED_FISH, 5],
      [I.MELON_SLICE, 1], [I.JUICE, 3], [I.CHOCOLATE, 2], [I.SEEDS, 1], [I.WHEAT, 2], [B.TORCH, 1], [I.PAPER, 1], [I.BUCKET, 8], [I.STEW, 5]],
    buy: [[I.WHEAT, 1], [I.APPLE, 1], [B.PUMPKIN, 3], [B.MELON, 3], [I.RAW_BEEF, 2], [I.RAW_PORK, 2], [I.RAW_CHICKEN, 2], [I.RAW_FISH, 2], [B.SUGAR_CANE, 1], [I.MELON_SLICE, 0.5], [I.EGG, 1]] },
  forn: { name: 'Forn Can Pau', icon: '🥐', tag: 'Forn de pa', color: '#b5652a',
    sell: [[I.BREAD, 3], [I.CROISSANT, 3], [I.ENSAIMADA, 4], [I.COCA, 10], [I.COOKIE, 1], [I.PA_TOMAQUET, 5], [I.SANDWICH, 7], [I.CHOCOLATE, 2]],
    buy: [[I.WHEAT, 1.5], [B.SUGAR_CANE, 1], [I.EGG, 1]] },
  mobles: { name: 'Mobles Blocklands', icon: '🛋️', tag: 'Mobles', color: '#e0782a', sell: [], buy: [] },
  cotxes: { name: 'Motor STUCOM', icon: '🚗', tag: 'Concessionari', color: '#1e2432',
    sell: [[I.BIKE, 60], [I.CAR, 400], [I.BOAT, 180], [I.BUS, 900], [I.HELI, 1600], [I.CART, 90]], buy: [] },
  quiosc: { name: 'Quiosc de la Plaça', icon: '📰', tag: 'Quiosc', color: '#2a6ce0',
    sell: [[I.JUICE, 3], [I.CHOCOLATE, 2], [I.COOKIE, 1], [I.PAPER, 1], [I.METRO_CARD, 20], [I.PICTURE, 4], [I.SIGN, 3]], buy: [] },
};
// the furniture shop sells every piece of furniture
{
  const P = { [B.DOUBLE_BED]: 60, [B.FRIDGE]: 55, [B.TV]: 50, [B.STOVE]: 40, [B.DESKTOP_PC]: 90, [B.GAME_CONSOLE]: 70, [B.SHOWER]: 45, [B.BATHTUB]: 45, [B.WASHER]: 50,
    [B.TOILET]: 25, [B.KITCHEN_SINK]: 30, [B.KITCHEN_COUNTER]: 20, [B.COFFEE_TABLE]: 18, [B.TABLE]: 16, [B.CHAIR]: 8, [B.FLOOR_LAMP]: 14, [B.CEILING_LAMP]: 14, [B.WALL_SHELF]: 12, [B.LIFT_FLOOR]: 30 };
  const list = [];
  for (let i = 0; i < 5; i++) list.push([B.SOFA_GRAY + i, 35]);
  for (const [id, pr] of Object.entries(P)) list.push([Number(id), pr]);
  for (const id of [B.RUG_RED, B.RUG_BLUE, B.RUG_BEIGE]) list.push([id, 6]);
  for (const id of [B.PAINTING_SEA, B.PAINTING_CITY, B.PAINTING_FLOWERS, B.PAINTING_ABSTRACT]) list.push([id, 22]);
  SHOPS.mobles.sell = list;
}

const Shops = {
  plan() {
    const w = G.world;
    try { const s = w && w.gen && w.gen.structs && typeof stucomVillage === 'function' ? stucomVillage(w.gen) : null; return s && s.shops ? s : null; } catch (e) { return null; }
  },
  at(x, y, z) {
    const pl = this.plan();
    if (!pl) return null;
    return pl.shops.find((s) => x >= s.x0 - 1 && x <= s.x1 + 2 && z >= s.z0 - 1 && z <= s.z1 + 1 && Math.abs(y - s.y) < 4) || null;
  },
  price(key, id, p) {
    let k = 1;
    const fe = typeof Calendar !== 'undefined' ? Calendar.festa() : null;
    if (fe && fe.k === 'santjoan' && id === I.COCA) k = 0.5;
    if (fe && fe.k === 'nadal' && key === 'forn') k = 0.8;
    return Math.max(1, Math.round(p * k));
  },
  pay(n) {
    if (G.mode === 'creative') return true;
    if ((G.money | 0) < n) return false;
    G.money = (G.money | 0) - n;
    if (typeof Bank !== 'undefined' && Bank.refresh) Bank.refresh();
    return true;
  },
  earn(n) { if (G.mode === 'creative') return; G.money = (G.money | 0) + n; if (typeof Bank !== 'undefined' && Bank.refresh) Bank.refresh(); },

  open(key, delivery) {
    const S = SHOPS[key];
    if (!S) return;
    const p = GPanel.open({ title: S.name, sub: S.tag + (delivery ? ' · online, delivered to you' : ''), icon: S.icon, cls: 'gp-shop', width: 640 });
    p.wrap.querySelector('.gp').style.setProperty('--shop', S.color);
    let tab = 'buy', q = '';
    const basket = new Map();
    const count = (id) => G.inv.slots.reduce((a, s) => a + (s && s.id === id ? s.count : 0), 0);
    const draw = () => {
      const e = GPanel.esc;
      const total = [...basket].reduce((a, [id, n]) => a + n * this.price(key, id, S.sell.find((x) => x[0] === id)[1]), 0);
      const money = G.mode === 'creative' ? '∞' : (G.money | 0);
      const tabs = `<div class="gp-tabs"><button data-tab="buy" class="${tab === 'buy' ? 'on' : ''}">🛍️ Buy</button>${S.buy.length ? `<button data-tab="sell" class="${tab === 'sell' ? 'on' : ''}">💰 Sell</button>` : ''}
        <span class="shop-money">🪙 ${money}</span></div>`;
      let body = '';
      if (tab === 'buy') {
        const list = S.sell.filter(([id]) => ITEM_DEF[id] && (!q || ITEM_DEF[id].name.toLowerCase().includes(q)));
        body = (S.sell.length > 12 ? `<input class="shop-q" placeholder="Search…" value="${e(q)}">` : '') + `<div class="shop-grid">${list.map(([id, pr]) => {
          const now = this.price(key, id, pr), n = basket.get(id) || 0;
          return `<button class="shop-it${n ? ' in' : ''}" data-add="${id}"><i class="shop-ic" style="background-image:url(${iconURL(id)})"></i><b>${e(ITEM_DEF[id].name)}</b>
            <span class="shop-pr">${now < pr ? `<s>${pr}</s> ` : ''}🪙 ${now}</span>${n ? `<i class="shop-n">${n}</i>` : ''}</button>`;
        }).join('')}</div>
        <div class="shop-foot"><span>${basket.size ? [...basket].map(([id, n]) => n + '× ' + e(ITEM_DEF[id].name)).join(', ') : 'Click things to put them in the basket'}</span>
          ${basket.size ? '<button class="gp-btn" data-clear>Empty</button>' : ''}<button class="gp-btn ok" data-pay ${basket.size ? '' : 'disabled'}>Pay 🪙 ${total}</button></div>`;
      } else {
        body = `<div class="shop-grid">${S.buy.filter(([id]) => ITEM_DEF[id]).map(([id, pr]) => {
          const have = count(id);
          return `<button class="shop-it" data-sell="${id}" ${have ? '' : 'disabled'}><i class="shop-ic" style="background-image:url(${iconURL(id)})"></i><b>${e(ITEM_DEF[id].name)}</b>
            <span class="shop-pr">+🪙 ${pr} each</span><span class="gp-dim">You have ${have}</span></button>`;
        }).join('')}</div><p class="gp-dim" style="margin:10px 0 0">Click to sell one · Shift-click to sell all</p>`;
      }
      p.body.innerHTML = tabs + body;
      p.body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
      const qi = p.body.querySelector('.shop-q');
      if (qi) { qi.addEventListener('input', () => { q = qi.value.toLowerCase(); const pos = qi.selectionStart; draw(); const n = p.body.querySelector('.shop-q'); n.focus(); n.setSelectionRange(pos, pos); }); }
      p.body.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', (ev) => {
        const id = Number(b.dataset.add);
        basket.set(id, (basket.get(id) || 0) + (ev.shiftKey ? 8 : 1));
        sfx('click', null, 0.5, 1.5);
        draw();
      }));
      const clr = p.body.querySelector('[data-clear]');
      if (clr) clr.addEventListener('click', () => { basket.clear(); draw(); });
      const pay = p.body.querySelector('[data-pay]');
      if (pay) pay.addEventListener('click', () => {
        if (!this.pay(total)) { G.ui.toast('🪙 Not enough coins: you need ' + total); sfx('gate_no', null, 0.6, 1); return; }
        for (const [id, n] of basket) {
          let left = n;
          while (left > 0) {
            const k = Math.min(left, maxStack(id));
            const rest = G.inv.add(mkStack(id, k));
            if (rest > 0) Ents.spawnItem(mkStack(id, rest), G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]);
            left -= k;
          }
        }
        G.ui.invDirty();
        sfx('shop_till', null, 0.7, 1);
        G.ui.toast(S.icon + ' Thank you! ' + [...basket].map(([id, n]) => n + '× ' + ITEM_DEF[id].name).join(', '), 3000);
        basket.clear();
        draw();
      });
      p.body.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', (ev) => {
        const id = Number(b.dataset.sell), pr = S.buy.find((x) => x[0] === id)[1];
        const n = ev.shiftKey ? count(id) : Math.min(1, count(id));
        if (!n) return;
        let left = n;
        for (let i = 0; i < G.inv.slots.length && left > 0; i++) {
          const s = G.inv.slots[i];
          if (!s || s.id !== id) continue;
          const k = Math.min(left, s.count);
          s.count -= k; left -= k;
          if (s.count <= 0) G.inv.slots[i] = null;
        }
        const got = Math.floor(n * pr + 1e-6);
        this.earn(got);
        G.ui.invDirty();
        sfx('shop_till', null, 0.6, 1.2);
        G.ui.toast('💰 Sold ' + n + '× ' + ITEM_DEF[id].name + ' for ' + got + ' coins');
        draw();
      }));
    };
    draw();
  },

  // ---- the cars on show: real cars on turntables while you are near, never saved ----
  cars: [],
  update(dt) {
    const pl = this.plan();
    const p = G.player.pos;
    const shop = pl && pl.shops.find((s) => s.key === 'cotxes');
    const near = shop && Math.abs(p[0] - (shop.x0 + shop.x1) / 2) < 48 && Math.abs(p[2] - (shop.z0 + shop.z1) / 2) < 48 && Math.abs(p[1] - shop.y) < 20;
    if (!near) { if (this.cars.length) { for (const v of this.cars) v.removed = true; this.cars = []; } return; }
    if (!this.cars.length && typeof Rides !== 'undefined') {
      const cx = (shop.x0 + shop.x1) / 2 + 0.5;
      [[-2.2, 'car', 0], [3.2, 'car', 1]].forEach(([dz, kind, paint], i) => {
        const v = Rides.spawn(kind, cx - 0.5, shop.y, shop.z0 + 5 + dz, i ? Math.PI / 2 : 0.4, paint);
        v.display = true; v.onGround = true;
        this.cars.push(v);
      });
    }
    this.cars[0].yaw += dt * 0.25;
    for (const v of this.cars) { v.vel && (v.vel[0] = v.vel[2] = 0); v.speed = 0; }
  },
};

SYNTH.shop_till = (ctx, o, t) => {
  Sound.tone(ctx, o, t, 0.08, { wave: 'square', f0: 1800, gain: 0.04, filter: ['lowpass', 3000, 1] });
  Sound.tone(ctx, o, t + 0.12, 0.5, { wave: 'sine', f0: 2093, gain: 0.08 });
  Sound.tone(ctx, o, t + 0.12, 0.6, { wave: 'sine', f0: 2637, gain: 0.05 });
  Sound.noise(ctx, o, t + 0.2, 0.25, { type: 'bandpass', freq: 5000, q: 2, gain: 0.08 });
};

// ---------------------------------------------------------------- hooks ----
{
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.mob && t.mob.type === 'villager' && t.mob.prof === 'shopkeeper' && !t.mob.dead) {
      const s = Shops.at(Math.floor(t.mob.pos[0]), Math.floor(t.mob.pos[1]), Math.floor(t.mob.pos[2]));
      Shops.open(s ? s.key : 'super'); this.swingHand(); return true;
    }
    const b = t && t.block;
    if (initial && b && b.id === B.CASH_REGISTER && !G.player.sneaking) {
      const s = Shops.at(b.pos[0], b.pos[1], b.pos[2]);
      if (s) { Shops.open(s.key); this.swingHand(); return true; }
    }
    return use.call(this, initial);
  };
  // the cars on show open the showroom instead of driving off
  const board = Vehicles.board;
  Vehicles.board = function (v) { if (v && v.display) { Shops.open('cotxes'); return; } return board.call(this, v); };
  const hit = Vehicles.hit;
  Vehicles.hit = function (v) { if (v && v.display) return; return hit.call(this, v); };
  const ser = Vehicles.serialize;
  Vehicles.serialize = function () {
    const keep = this.list;
    this.list = keep.filter((v) => !v.display);
    try { return ser.call(this); } finally { this.list = keep; }
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); Shops.update(dt || 0.016); };
  PC.add({ key: 'shop', icon: '🛒', name: 'Botiga online', run() {
    const q = GPanel.open({ title: 'Botiga online', sub: 'Delivered to your inventory', icon: '🛒', width: 420 });
    q.body.innerHTML = `<div class="pp-grid">${Object.entries(SHOPS).filter(([k]) => k !== 'cotxes').map(([k, s]) => `<button class="gp-btn" data-s="${k}">${s.icon} ${GPanel.esc(s.name)}</button>`).join('')}</div>`;
    q.body.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => Shops.open(b.dataset.s, true)));
  } });
}

// ---------------------------------------------------------------- signs ----
{
  const sign = (key, draw) => { PIC_BUILTIN['shop_' + key] = { w: 4, h: 1, draw }; };
  const plate = (bg, fg, title, sub, icon) => (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, W, H * 0.08);
    g.textBaseline = 'middle';
    g.font = `${H * 0.62}px serif`; g.textAlign = 'center'; g.fillText(icon, H * 0.62, H * 0.53);
    g.fillStyle = fg; g.textAlign = 'left';
    g.font = `900 ${H * 0.46}px Arial, sans-serif`; g.fillText(title, H * 1.2, H * 0.42);
    g.globalAlpha = 0.8; g.font = `700 ${H * 0.2}px Arial, sans-serif`; g.fillText(sub, H * 1.22, H * 0.78); g.globalAlpha = 1;
  };
  sign('super', plate(['#e3262f', '#a8141c'], '#fff', 'SuperBloc', 'SUPERMERCAT · obert cada dia', '🛒'));
  sign('forn', plate(['#f3e2c4', '#d9b98a'], '#6a3a14', 'Forn Can Pau', 'PA · PASTISSERIA · DES DE 1924', '🥐'));
  sign('mobles', plate(['#ff9a3c', '#d9651a'], '#fff', 'Mobles', 'BLOCKLANDS · la teva casa', '🛋️'));
  sign('cotxes', plate(['#2a3244', '#10141c'], '#e8edf5', 'Motor STUCOM', 'CONCESSIONARI OFICIAL', '🚗'));
  sign('quiosc', plate(['#2f7df0', '#1a55b8'], '#fff', 'Quiosc', 'PREMSA · BEGUDES · TARGETES', '📰'));
  PIC_BUILTIN.shop_galeries = { w: 3, h: 1, draw: plate(['#141a26', '#0a0e16'], '#ffd34d', 'Galeries', '← BOTIGUES · SHOPS', '🛍️') };
}

// ---------------------------------------------------------------- textures and sprites ----
{
  gen('shelf_white', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [232, 234, 236], (x === 0 || x === TM ? 0.85 : 1) * (0.96 + rng() * 0.04))), { smooth: 0.6, bump: 0.1 });
  const goods = (pal, shape) => (d, rng) => {
    // rows of products: packets and tins in bright colours, a price strip under each row
    const cols = [];
    for (let i = 0; i < 8; i++) cols.push(pal[Math.floor(rng() * pal.length)]);
    fillTile(d, (x, y) => {
      const slot = Math.floor(x / 4), c = cols[slot];
      const inX = x % 4, top = shape === 'bottle' ? (inX === 0 || inX === 3 ? 6 : 2) : shape === 'loaf' ? 4 + ((x * 7) % 3) : 3;
      let col = [40, 40, 44], f = 0.6;
      if (y >= top && inX !== 3) { col = c; f = (inX === 0 ? 0.85 : 1) * (y === top ? 1.15 : 1); if (shape !== 'loaf' && y > 12 && y < 18) { col = [245, 245, 240]; f = 1; } }
      if (y >= 29) { col = [250, 214, 60]; f = 1; }
      put(d, x, y, col, f * (0.95 + rng() * 0.07));
    });
  };
  gen('goods_grocery', goods([[220, 40, 40], [40, 120, 220], [250, 200, 40], [60, 170, 80], [240, 130, 40], [150, 60, 180], [240, 240, 240]], 'box'), { smooth: 0.3, bump: 0.3 });
  gen('goods_bread', goods([[206, 146, 64], [180, 118, 50], [226, 176, 96], [150, 96, 40]], 'loaf'), { smooth: 0.1, bump: 0.6 });
  gen('goods_drinks', (d, rng, ctx) => {
    const cols = [[230, 60, 40], [250, 170, 40], [60, 160, 230], [240, 240, 250], [80, 190, 90], [40, 40, 50]];
    fillTile(d, (x, y, k) => {
      const inX = x % 4, c = cols[Math.floor(x / 4) % cols.length];
      let col = [210, 232, 245], f = 1;
      if (inX !== 3 && y >= (inX === 0 ? 8 : 4)) { col = c; f = inX === 0 ? 0.85 : 1.05; }
      if (y === 0 || y === TM) { col = [200, 204, 210]; }
      put(d, x, y, col, f * (0.95 + rng() * 0.05));
      ctx.emit[k] = 0.25;
    });
  }, { smooth: 0.9, bump: 0.1 });
  gen('till_screen', (d, rng, ctx) => fillTile(d, (x, y, k) => {
    let c = [20, 60, 40];
    if (y >= 8 && y <= 12 && x >= 4 && x <= 27 && (x + y) % 3) c = [90, 250, 150];
    if (y >= 18 && y <= 22 && x >= 16 && x <= 27) c = [250, 230, 90];
    put(d, x, y, c, 0.95 + rng() * 0.05);
    ctx.emit[k] = 0.8;
  }), { smooth: 0.9, bump: 0 });
  gen('till_keys', (d, rng) => fillTile(d, (x, y) => put(d, x, y, x % 4 && y % 4 ? [200, 204, 210] : [40, 40, 44], 0.95 + rng() * 0.05)), { smooth: 0.5, bump: 0.5 });

  sprite('i_croissant', (d) => {
    sprPoly(d, [[4, 20], [9, 12], [16, 9], [23, 12], [28, 20], [23, 18], [16, 16], [9, 18]], [214, 148, 60]);
    for (const x of [10, 16, 22]) sprSeg(d, x - 1, 12, x + 1, 17, 1.1, [240, 190, 110]);
  });
  sprite('i_ensaimada', (d) => { sprDisc(d, 16, 17, 11, [232, 190, 120]); sprDisc(d, 16, 17, 7, [220, 170, 100]); sprDisc(d, 16, 17, 3, [232, 190, 120]); for (let i = 0; i < 14; i++) sprDisc(d, 8 + (i * 37) % 17, 10 + (i * 53) % 14, 0.9, [255, 255, 255]); });
  sprite('i_coca', (d) => { sprRect(d, 3, 11, 29, 23, [226, 170, 90]); for (const [x, c] of [[7, [220, 40, 40]], [12, [60, 170, 70]], [17, [250, 200, 40]], [22, [220, 40, 40]], [26, [240, 130, 40]]]) sprDisc(d, x, 15 + (x % 3), 1.8, c); for (let i = 0; i < 10; i++) sprDisc(d, 5 + i * 2.4, 20, 0.8, [250, 240, 200]); });
  sprite('i_cookie', (d) => { sprDisc(d, 16, 16, 10, [196, 140, 70]); for (const [x, y] of [[12, 12], [19, 14], [14, 20], [21, 20], [16, 9]]) sprDisc(d, x, y, 1.5, [70, 40, 20]); });
  sprite('i_pa_tomaquet', (d) => { sprRect(d, 4, 10, 28, 24, [214, 160, 80]); sprRect(d, 6, 12, 26, 22, [200, 70, 50]); sprRect(d, 9, 14, 13, 16, [240, 120, 90]); sprRect(d, 18, 17, 22, 19, [240, 120, 90]); sprSeg(d, 6, 12, 26, 12, 1, [240, 220, 120]); });
  sprite('i_juice', (d) => { sprRect(d, 10, 8, 22, 28, [250, 150, 30]); sprRect(d, 10, 8, 22, 11, [250, 250, 250]); sprRect(d, 13, 4, 19, 8, [60, 170, 70]); sprDisc(d, 16, 19, 4, [255, 200, 60]); });
  sprite('i_chocolate', (d) => { sprRect(d, 6, 7, 26, 25, [92, 52, 30]); for (let x = 6; x < 26; x += 5) sprSeg(d, x, 7, x, 25, 0.5, [70, 38, 20]); for (let y = 7; y < 25; y += 6) sprSeg(d, 6, y, 26, y, 0.5, [70, 38, 20]); sprRect(d, 6, 17, 26, 25, [200, 40, 50]); });
  sprite('i_sandwich', (d) => { sprEllipse(d, 16, 17, 13, 6, 0, [214, 160, 80]); sprSeg(d, 5, 17, 27, 17, 1.5, [200, 70, 60]); sprSeg(d, 5, 15, 27, 15, 1, [110, 180, 70]); sprEllipse(d, 16, 13, 12, 3.5, 0, [230, 180, 100]); });
}
