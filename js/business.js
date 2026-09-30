'use strict';
// Owning the city. Four ways to make and spend money that keep going while you play:
// - Flats (Flats): every tall lift (5+ stops, not on a house plot) is a tower of flats. Stand on the
//   lift plate at any floor and the panel says who owns it; the ones for sale are bought there
//   (400 + 60 × floor). The builders furnish it as a loft round the lift core, it becomes your
//   home, and on a server nobody else can touch it (Claims.can gets the height).
// - Businesses (Biz): open a café, a bakery, a gym... where you stand (your plot, your flat or
//   any free ground). A market stall goes up with a striped awning and a shopkeeper; it earns
//   coins every real hour (more with levels and staff, up to a cap: come back to collect), the
//   neighbours (cityalive.js) come to shop after work, and other players buy from your keeper.
// - The stock market (Stocks): seven companies whose prices move by deterministic noise on the
//   real clock, so everyone online sees the same market. Buy, sell (1 % fee), charts, news.
// - Renting (Rent): put a house or flat on the market at a price per game day. Friends on the
//   server rent it (and can then build and sleep there); if nobody does, a neighbour moves in
//   and pays, more likely the fairer the price. The owner collects the rent from the phone.
// World records live in world.biz (saved with the world, SharedState keys flat:, biz:, rent:,
// lease:); your own takings and shares in G.prog.

const BZ = {
  data() {
    const w = G.world;
    if (!w) return { flats: {}, shops: {}, rent: {}, lease: {} };
    const d = w.biz || (w.biz = {});
    for (const k of ['flats', 'shops', 'rent', 'lease']) if (!d[k] || typeof d[k] !== 'object') d[k] = {};
    return d;
  },
  prog() {
    if (!G.prog) G.prog = {};
    const p = G.prog;
    for (const k of ['biz', 'stocks', 'rentGot']) if (!p[k] || typeof p[k] !== 'object') p[k] = {};
    return p;
  },
  PFX: { flats: 'flat:', shops: 'biz:', rent: 'rent:', lease: 'lease:' },
  put(kind, id, v) {
    const d = this.data()[kind];
    if (v) d[id] = v; else delete d[id];
    if (G.world) G.world.editsDirty = true;
    if (typeof SharedState !== 'undefined') SharedState.put(this.PFX[kind] + id, v || null);
  },
  coins(n) { return '🪙 ' + Math.round(n).toLocaleString('en'); },
  esc(t) { return GPanel.esc(t == null ? '' : t); },
  me(o) { return o === Net.owner; },
  // the facing whose front points along (dx, dz)
  fac(dx, dz) {
    for (let f = 0; f < 6; f++) { const v = Furniture.front(f); if (Math.round(v[0]) === dx && Math.round(v[2]) === dz) return f; }
    return 0;
  },
  mmss(ms) { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? h + ' h ' + m + ' min' : m ? m + ' min' : s + ' s'; },
};

// ================================================================ flats ====
const Flats = {
  cache: new Map(), offered: new Set(), was: null,
  key(x, z, y) { return x + ',' + z + ',' + y; },
  price(floor) { return 400 + 60 * floor; },
  // the floor round a lift shaft at standing height y: the cells you can walk to from the lift door
  area(x, z, y) {
    const w = G.world;
    const open = (a, b) => {
      const f = w.getBlock(a, y - 1, b);
      return !BLOCK_SOLID[w.getBlock(a, y, b)] && !BLOCK_SOLID[w.getBlock(a, y + 1, b)] && BLOCK_SOLID[f] && f !== B.LIFT_FLOOR;
    };
    let o = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(x + dx, z + dz)) { o = [dx, dz]; break; }
    if (!o) return null;
    const cells = new Set(), q = [[x + o[0], z + o[1]]];
    cells.add((x + o[0]) + ',' + (z + o[1]));
    let x0 = x, x1 = x, z0 = z, z1 = z;
    while (q.length && cells.size < 400) {
      const [a, b] = q.shift();
      x0 = Math.min(x0, a); x1 = Math.max(x1, a); z0 = Math.min(z0, b); z1 = Math.max(z1, b);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const na = a + dx, nb = b + dz, k = na + ',' + nb;
        if (cells.has(k) || Math.abs(na - x) > 9 || Math.abs(nb - z) > 9 || !open(na, nb)) continue;
        cells.add(k); q.push([na, nb]);
      }
    }
    return { cells, o, x0, x1, z0, z1 };
  },
  // is this lift a tower of flats?
  tower(x, z, stops) {
    const k = x + ',' + z, c = this.cache.get(k);
    if (c && (c.ok || performance.now() - c.t < 8000)) return c.ok;
    let ok = stops.length >= 5 && !(typeof Homes !== 'undefined' && Homes.plotAt(x, z));
    if (ok) { const a = this.area(x, z, stops[1]); ok = !!a && a.cells.size >= 60 && a.cells.size < 400; }
    this.cache.set(k, { ok, t: performance.now() });
    return ok;
  },
  rec(x, z, y) { return BZ.data().flats[this.key(x, z, y)] || null; },
  at(x, y, z) {
    for (const r of Object.values(BZ.data().flats)) if (r && r.b && x >= r.b[0] && x <= r.b[2] && z >= r.b[1] && z <= r.b[3] && y >= r.y - 1 && y <= r.y + 2) return r;
    return null;
  },
  mayUse(r) { return BZ.me(r.o) || Rent.tenant('f:' + this.key(r.x, r.z, r.y)); },
  mine() { return Object.entries(BZ.data().flats).filter(([, r]) => r && BZ.me(r.o)); },
  spot(r) { const d = Array.isArray(r.d) ? r.d : [1, 0]; return [r.x + d[0] * 3 + 0.5, r.y, r.z + d[1] * 3 + 0.5]; },

  // the lift panel shows who owns each floor and sells the one you are on
  decorate(p, x, z, stops, cur) {
    if (!p) return;
    const e = BZ.esc, grid = p.body.querySelector('.lift-grid');
    if (grid && stops.length > 6) grid.classList.add('two');
    p.body.querySelectorAll('.lift-b').forEach((b) => {
      const i = Number(b.dataset.i);
      if (i <= 0 || i >= stops.length - 1) return;
      const r = this.rec(x, z, stops[i]);
      const t = document.createElement('em');
      t.className = 'fl-b ' + (r ? (BZ.me(r.o) ? 'mine' : 'sold') : 'free');
      t.textContent = r ? (BZ.me(r.o) ? '🏠' : '🔒') : '🪙';
      b.append(t);
    });
    const card = document.createElement('div');
    card.className = 'fl-card';
    const flats = stops.length - 2, sold = stops.slice(1, -1).filter((y) => this.rec(x, z, y)).length;
    if (cur <= 0 || cur >= stops.length - 1) {
      card.innerHTML = `<b>🏢 ${flats} flats · ${flats - sold} for sale</b><span>From ${BZ.coins(this.price(1))} · pick a floor with 🪙 and look at it</span>`;
    } else {
      const y = stops[cur], r = this.rec(x, z, y), lk = Rent.data('f:' + this.key(x, z, y));
      if (r && BZ.me(r.o)) {
        card.innerHTML = `<b>🏠 Your flat · floor ${cur}</b><span>${lk.lease && lk.lease.until > Date.now() ? 'Rented to ' + e(lk.lease.tn) : lk.rent && lk.rent.open ? 'On the rental market' : 'Furnished loft · your home'}</span><div class="fl-act"><button class="gp-btn" data-a="home">Set as home</button><button class="gp-btn" data-a="rent">Rent it out…</button></div>`;
      } else if (r) {
        const ten = lk.lease && lk.lease.until > Date.now() ? lk.lease : null;
        card.innerHTML = `<b>🔒 ${e(r.n)}’s flat · floor ${cur}</b><span>${ten ? (ten.tenant === Net.owner ? 'You rent it · until ' + new Date(ten.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Rented to ' + e(ten.tn)) : lk.rent && lk.rent.open ? 'For rent · ' + BZ.coins(lk.rent.price) + ' a day' : 'Private'}</span>${!ten && lk.rent && lk.rent.open && !BZ.me(r.o) ? '<div class="fl-act"><button class="gp-btn ok" data-a="lease">Rent it…</button></div>' : ''}`;
      } else {
        card.innerHTML = `<b>🔑 Flat for sale · floor ${cur}</b><span>A furnished loft round the lift: living room, kitchen, bedroom, bathroom${cur > 5 ? ' · amazing views' : ''}</span><div class="fl-act"><button class="gp-btn ok" data-a="buy">Buy · ${BZ.coins(this.price(cur))}</button></div>`;
      }
    }
    p.body.append(card);
    const act = (a) => {
      const y = stops[cur], k = this.key(x, z, y);
      if (a === 'buy' && this.buy(x, z, stops, cur)) p.close();
      if (a === 'home') { const r = this.rec(x, z, y); Home.set(this.spot(r), 'flat'); G.ui.toast('🏠 Home set: your flat on floor ' + cur); }
      if (a === 'rent') { p.close(); Rent.open('f:' + k); }
      if (a === 'lease') { p.close(); Rent.open('f:' + k); }
    };
    card.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => act(b.dataset.a)));
  },

  buy(x, z, stops, i) {
    const y = stops[i], k = this.key(x, z, y);
    if (this.rec(x, z, y)) { G.ui.toast('This flat is already sold'); return false; }
    const a = this.area(x, z, y);
    if (!a || a.cells.size < 40) { G.ui.toast('This floor is not a flat'); return false; }
    const price = this.price(i);
    if (!Shops.pay(price)) { G.ui.toast('🪙 This flat costs ' + price + ' coins (you have ' + (G.money | 0) + ')', 3500); sfx('gate_no', null, 0.6, 1); return false; }
    const r = { o: Net.owner, n: Net.name, x, z, y, fl: i, d: a.o, b: [a.x0, a.z0, a.x1, a.z1], t: Date.now() };
    BZ.put('flats', k, r);
    this.furnish(x, z, y, a);
    Home.set([x + a.o[0] * 3 + 0.5, y, z + a.o[1] * 3 + 0.5], 'flat');
    G.ui.banner('🏠', 'Your flat on floor ' + i + ' · the movers are in');
    sfx('shop_till', null, 0.8, 1);
    setTimeout(() => sfx('achieve', null, 0.8, 1), 900);
    return true;
  },

  // a loft round the core: living room in front of the lift, dining and kitchen on one side,
  // bedroom, desk and bathroom behind
  furnish(x, z, y, a) {
    const [ox, oz] = a.o, px = -oz, pz = ox, w = G.world, out = [], used = new Set();
    const W = (A, Bb) => [x + A * ox + Bb * px, z + A * oz + Bb * pz];
    const F = (fa, fb) => BZ.fac(fa * ox + fb * px, fa * oz + fb * pz);
    const free = (X, yy, Z) => a.cells.has(X + ',' + Z) && !used.has(X + ',' + yy + ',' + Z) && w.getBlock(X, yy, Z) === B.AIR;
    const put = (A, Bb, dy, id, fa, fb) => {
      const [X, Z] = W(A, Bb);
      if (!free(X, y + dy, Z)) return false;
      used.add(X + ',' + (y + dy) + ',' + Z);
      out.push([X, y + dy, Z, id, fa === undefined ? undefined : F(fa, fb)]);
      return true;
    };
    // living room
    for (const b of [2, 3, 4]) put(2, b, 0, B.SOFA_GRAY, 1, 0);
    put(3, 3, 0, B.COFFEE_TABLE, 1, 0);
    for (const b of [2, 3, 4]) put(4, b, 0, B.RUG_BEIGE, 1, 0);
    put(5, 3, 0, B.TV_ON, -1, 0);
    put(5, 5, 0, B.FLOOR_LAMP, -1, 0); put(2, 5, 0, B.FLOOR_LAMP, 1, 0);
    // dining and kitchen
    for (const b of [-2, -3]) { put(4, b, 0, B.TABLE, 1, 0); put(3, b, 0, B.CHAIR, 1, 0); put(5, b, 0, B.CHAIR, -1, 0); }
    [B.KITCHEN_COUNTER, B.KITCHEN_SINK, B.STOVE, B.KITCHEN_COUNTER].forEach((id, k) => put(k, -5, 0, id, 0, 1));
    if (put(4, -5, 0, B.FRIDGE, 0, 1)) put(4, -5, 1, B.FRIDGE_TOP, 0, 1);
    // bedroom: a double bed with its head to the far wall
    {
      const f = F(1, 0), fr = Furniture.front(f), side = furnSide(f);
      const [hx, hz] = W(-5, 3), cells = [[hx, hz, B.DOUBLE_BED_HEAD, f], [hx + side[0], hz + side[2], B.DOUBLE_BED_HEAD, f | 8],
        [hx + fr[0], hz + fr[2], B.DOUBLE_BED, f], [hx + fr[0] + side[0], hz + fr[2] + side[2], B.DOUBLE_BED, f | 8]];
      if (cells.every(([X, Z]) => free(X, y, Z))) for (const [X, Z, id, ff] of cells) { used.add(X + ',' + y + ',' + Z); out.push([X, y, Z, id, ff]); }
    }
    put(-5, 5, 0, B.FLOOR_LAMP, 1, 0);
    for (const b of [2, 3, 4]) put(-2, b, 0, B.RUG_BLUE, 1, 0);
    // desk
    if (put(-5, -2, 0, B.TABLE, 1, 0)) put(-5, -2, 1, B.DESKTOP_PC, 1, 0);
    put(-4, -2, 0, B.CHAIR, -1, 0);
    // bathroom corner
    if (put(-5, -5, 0, B.SHOWER, 0, 1)) put(-5, -5, 1, B.SHOWER_TOP, 0, 1);
    put(-4, -5, 0, B.TOILET, 0, 1); put(-3, -5, 0, B.KITCHEN_SINK, 0, 1); put(-2, -5, 0, B.WASHER, 0, 1);
    // plants, paintings, lights
    for (const [A, Bb] of [[5, -5], [-5, 0]]) put(A, Bb, 0, B.BUSH);
    put(5, 1, 1, B.PAINTING_CITY, -1, 0); put(-5, 1, 1, B.PAINTING_SEA, 1, 0);
    for (const [A, Bb] of [[3, 3], [4, -3], [-3, 3], [-3, -3]]) put(A, Bb, 2, B.CEILING_LAMP, 1, 0);
    // bottom first, a little at a time: the movers carry it in
    let i = 0;
    const step = () => {
      if (!G.world || G.world !== w) return;
      const batch = out.slice(i, i + 3);
      i += 3;
      if (!batch.length) { saveWorld(); return; }
      editBlocks(batch);
      for (const b of batch) Particles.poof(b[0] + 0.5, b[1] + 0.5, b[2] + 0.5, 1, 1);
      sfx('place_1', [batch[0][0] + 0.5, y + 0.5, batch[0][2] + 0.5], 0.4, rand(0.8, 1.1));
      setTimeout(step, 90);
    };
    step();
  },

  update() {
    // arriving at a floor for sale: offer it once per tower
    const r = Lift.ride;
    if (this.was && !r) {
      const q = this.was, y = q.stops[q.to], k = q.x + ',' + q.z;
      if (q.to > 0 && q.to < q.stops.length - 1 && !this.offered.has(k) && this.tower(q.x, q.z, q.stops) && !this.rec(q.x, q.z, y)) {
        this.offered.add(k);
        setTimeout(() => {
          if (GPanel.top()) return;
          const p = GPanel.open({ title: 'Flat for sale', sub: 'Floor ' + q.to, icon: '🔑', width: 360 });
          p.body.innerHTML = `<div class="gp-card"><div class="gp-big">🏙️</div><p><b>Floor ${q.to}</b> · a furnished loft with views over ${BZ.esc(CITY)}</p><p class="gp-dim">Every floor with 🪙 on the lift buttons is for sale. You have ${G.mode === 'creative' ? '∞' : BZ.coins(G.money | 0)}.</p>
            <div class="fl-act" style="justify-content:center"><button class="gp-btn ok" data-a="buy">Buy · ${BZ.coins(this.price(q.to))}</button><button class="gp-btn" data-a="no">Just looking</button></div></div>`;
          p.body.querySelector('[data-a="buy"]').addEventListener('click', () => { if (this.buy(q.x, q.z, q.stops, q.to)) p.close(); });
          p.body.querySelector('[data-a="no"]').addEventListener('click', () => p.close());
        }, 700);
      }
    }
    this.was = r ? { x: r.x, z: r.z, stops: r.stops, to: r.to } : null;
  },
};

// ============================================================ businesses ====
const BIZ_TYPES = {
  cafe: { icon: '☕', name: ED('Cafeteria', 'Café'), cost: 500, rate: 120, awn: 12, item: I.COOKIE, n: 3, price: 4, what: 'a coffee and a cookie', back: [B.SHELF_DRINKS, B.STOVE, B.SHELF_DRINKS] },
  bakery: { icon: '🥐', name: ED('Forn de pa', 'Bakery'), cost: 450, rate: 100, awn: 1, item: I.CROISSANT, n: 2, price: 5, what: 'two croissants', back: [B.SHELF_BREAD, B.SHELF_BREAD, B.SHELF_BREAD] },
  florist: { icon: '💐', name: ED('Floristeria', 'Flower shop'), cost: 350, rate: 80, awn: 6, item: B.TULIP, n: 4, price: 4, what: 'a bunch of tulips', back: [[B.PODZOL, B.HYDRANGEA], [B.PODZOL, B.LAVENDER], [B.PODZOL, B.HYDRANGEA]] },
  gym: { icon: '🏋️', name: ED('Gimnàs', 'Gym'), cost: 900, rate: 200, awn: 14, item: I.JUICE, n: 2, price: 6, what: 'a class and a smoothie', back: [B.TV_ON, B.TV_ON, B.TV_ON], heal: true },
  tech: { icon: '💻', name: ED('Botiga d’informàtica', 'Tech shop'), cost: 1200, rate: 260, awn: 3, price: 15, what: 'a repair of the tool in your hand', back: [[B.TABLE, B.DESKTOP_PC], [B.TABLE, B.DESKTOP_PC], [B.TABLE, B.DESKTOP_PC]], repair: true },
  resto: { icon: '🍝', name: ED('Restaurant', 'Restaurant'), cost: 1500, rate: 320, awn: 14, item: I.STEAK, n: 2, price: 12, what: 'the menu of the day', back: [B.KITCHEN_COUNTER, B.STOVE, [B.FRIDGE, B.FRIDGE_TOP]] },
};
const BIZ_MAX = 4, BIZ_LVL = 5, BIZ_STAFF = 3, BIZ_SALARY = 25;

const Biz = {
  npcs: new Map(), tags: new Map(), t: 0, welcomed: false,
  list() { return Object.entries(BZ.data().shops).filter(([, s]) => s && BIZ_TYPES[s.type]); },
  mine() { return this.list().filter(([, s]) => BZ.me(s.o)); },
  own(id) {
    const P = BZ.prog().biz;
    return P[id] || (P[id] = { lvl: 1, staff: 0, last: Date.now(), bank: 0, sold: 0, total: 0 });
  },
  gross(s, b) { const T = BIZ_TYPES[s.type]; return T.rate * (1 + 0.6 * (b.lvl - 1)) * (1 + 0.35 * b.staff); },
  net(s, b) { return this.gross(s, b) - b.staff * BIZ_SALARY; },
  cap(s, b) { return Math.round(this.net(s, b) * (2 + 0.5 * (b.lvl - 1))); },
  accrue(id, s) {
    const b = this.own(id), now = Date.now(), h = Math.max(0, now - (b.last || now)) / 3.6e6;
    const cap = this.cap(s, b);
    if (b.bank < cap) b.bank = Math.min(cap, b.bank + this.net(s, b) * h);
    b.last = now;
    return b;
  },
  pending() { let n = 0; for (const [id, s] of this.mine()) n += this.accrue(id, s).bank; return n; },
  perHour() { let n = 0; for (const [id, s] of this.mine()) n += this.net(s, this.own(id)); return n; },
  // the stall's cells: d steps in front of where the owner stood, k to the side
  cell(s, d, k) { return [s.x + s.fx * d - s.fz * k, s.z + s.fz * d + s.fx * k]; },
  spot(s) { const [x, z] = this.cell(s, 1, 0); return [x + 0.5, s.y, z + 0.5]; },

  canOpen() {
    const p = G.player, x = Math.floor(p.pos[0]), y = Math.floor(p.pos[1] + 0.01), z = Math.floor(p.pos[2]);
    const look = p.lookDir(), ax = Math.abs(look[0]) > Math.abs(look[2]);
    const fx = ax ? Math.sign(look[0]) : 0, fz = ax ? 0 : Math.sign(look[2]) || 1;
    const s = { x, y, z, fx, fz }, w = G.world;
    if (this.mine().length >= BIZ_MAX) return { err: 'You already run ' + BIZ_MAX + ' businesses: close one first' };
    if (G.vehicle || !p.onGround) return { err: 'Stand on the ground where the stall should go' };
    for (let d = 1; d <= 4; d++) for (let k = -2; k <= 2; k++) {
      const [cx, cz] = this.cell(s, d, k);
      if (!BLOCK_SOLID[w.getBlock(cx, y - 1, cz)]) return { err: 'The ground in front of you is not flat: you need 5 × 4 free blocks' };
      for (let yy = y; yy <= y + 3; yy++) { const id = w.getBlock(cx, yy, cz); if (id !== B.AIR && !BLOCK_REPLACE[id]) return { err: 'Something is in the way: you need 5 × 4 free blocks in front of you, 4 high' }; }
      if (!Claims.can(cx, cz, y)) return { err: 'That is someone else’s plot' };
      const f = Flats.at(cx, y, cz);
      if (f && !Flats.mayUse(f)) return { err: 'That is someone else’s flat' };
    }
    for (const [, o] of this.list()) if (Math.abs(o.x - x) < 7 && Math.abs(o.z - z) < 7 && Math.abs(o.y - y) < 4) return { err: 'Too close to ' + o.name };
    return { s };
  },

  open(type, name) {
    const T = BIZ_TYPES[type], c = this.canOpen();
    if (c.err) { G.ui.toast('🏪 ' + c.err, 3500); sfx('gate_no', null, 0.6, 1); return false; }
    if (!Shops.pay(T.cost)) { G.ui.toast('🪙 A ' + T.name + ' costs ' + T.cost + ' coins (you have ' + (G.money | 0) + ')', 3500); sfx('gate_no', null, 0.6, 1); return false; }
    const s = Object.assign(c.s, { o: Net.owner, n: Net.name, type, name: String(name || (Net.name + '’s ' + T.name)).slice(0, 28), t: Date.now(), lvl: 1 });
    const id = 's' + Date.now().toString(36);
    BZ.put('shops', id, s);
    const b = this.own(id);
    b.last = Date.now(); b.bank = 0;
    this.build(s);
    G.ui.banner(T.icon, s.name + ' is open!');
    sfx('shop_till', null, 0.8, 1);
    return true;
  },

  build(s) {
    const T = BIZ_TYPES[s.type], y = s.y, out = [];
    const at = (d, k, dy, id, f) => { const [x, z] = this.cell(s, d, k); out.push([x, y + dy, z, id, f]); };
    const toCust = BZ.fac(-s.fx, -s.fz);
    [B.KITCHEN_COUNTER, B.CASH_REGISTER, B.KITCHEN_COUNTER].forEach((id, i) => at(2, i - 1, 0, id, toCust));
    T.back.forEach((e, i) => { const [a, b2] = Array.isArray(e) ? e : [e]; at(4, i - 1, 0, a, toCust); if (b2) at(4, i - 1, 1, b2, toCust); });
    for (const [d, k] of [[1, -2], [1, 2], [4, -2], [4, 2]]) for (let dy = 0; dy <= 2; dy++) at(d, k, dy, B.DARK_OAK_FENCE);
    for (let d = 1; d <= 4; d++) for (let k = -2; k <= 2; k++) at(d, k, 3, B.WOOL + (k % 2 === 0 ? T.awn : 0));
    at(1, -1, 2, B.LANTERN, 8); at(1, 1, 2, B.LANTERN, 8);
    editBlocks(out);
    for (const b of out) if (Math.random() < 0.4) Particles.poof(b[0] + 0.5, b[1] + 0.5, b[2] + 0.5, 1, 1);
  },

  close(id) {
    const s = BZ.data().shops[id];
    if (!s) return;
    const T = BIZ_TYPES[s.type], b = this.own(id);
    Shops.earn(Math.round(b.bank) + Math.round(T.cost * 0.5));
    delete BZ.prog().biz[id];
    BZ.put('shops', id, null);
    this.dropNpcs(id);
    G.ui.toast('🏪 ' + s.name + ' closed · the stall is yours to take down', 3500);
  },

  collect(id) {
    const s = BZ.data().shops[id];
    if (!s) return 0;
    const b = this.accrue(id, s), n = Math.floor(b.bank);
    if (n <= 0) return 0;
    b.bank -= n; b.total = (b.total || 0) + n;
    Shops.earn(n);
    sfx('shop_till', null, 0.7, 1.1);
    return n;
  },
  collectAll() {
    let n = 0;
    for (const [id] of this.mine()) n += this.collect(id);
    if (n) G.ui.banner('💰', 'Collected ' + BZ.coins(n) + ' from your businesses');
    else G.ui.toast('Nothing to collect yet');
    return n;
  },
  upgrade(id) {
    const s = BZ.data().shops[id], b = this.accrue(id, s), T = BIZ_TYPES[s.type];
    if (b.lvl >= BIZ_LVL) return;
    const cost = Math.round(T.cost * 0.75 * b.lvl);
    if (!Shops.pay(cost)) { G.ui.toast('🪙 The upgrade costs ' + cost); sfx('gate_no', null, 0.6, 1); return; }
    b.lvl++;
    s.lvl = b.lvl;
    BZ.put('shops', id, s);
    G.ui.banner('⭐', s.name + ' · level ' + b.lvl);
    sfx('achieve', null, 0.8, 1.1);
  },
  hire(id) {
    const s = BZ.data().shops[id], b = this.accrue(id, s);
    if (b.staff >= BIZ_STAFF) return;
    const cost = 200 * (b.staff + 1);
    if (!Shops.pay(cost)) { G.ui.toast('🪙 Hiring costs ' + cost); sfx('gate_no', null, 0.6, 1); return; }
    b.staff++;
    s.staff = b.staff;
    BZ.put('shops', id, s);
    this.dropNpcs(id);
    G.ui.toast('🤝 ' + this.staffName(s, b.staff) + ' starts tomorrow… no, today!', 3000);
    sfx('pling', null, 0.7, 1);
  },
  staffName(s, i) { return VILLAGER_NAMES[Math.floor(hash3(s.x, i, s.z, 91) * 997) % VILLAGER_NAMES.length]; },

  // someone buys at a stall (the keeper's right-click)
  serve(id) {
    const s = BZ.data().shops[id];
    if (!s) return;
    const T = BIZ_TYPES[s.type], e = BZ.esc, keeper = this.staffName(s, 0);
    const mine = BZ.me(s.o);
    if (mine) { this.panel(id); return; }
    const p = GPanel.open({ title: s.name, sub: 'Run by ' + s.n + ' · ' + '★'.repeat(s.lvl || 1), icon: T.icon, width: 380 });
    p.body.innerHTML = `<div class="gp-card"><p class="gp-big" style="font-size:18px">“Hi! What can I get you?”</p><p class="gp-dim">${e(keeper)} works here</p>
      <div class="bz-buy"><b>${T.icon} ${e(T.what)}</b><button class="gp-btn ok" data-a="buy">Buy · ${BZ.coins(T.price)}</button></div></div>`;
    p.body.querySelector('[data-a="buy"]').addEventListener('click', () => {
      if (T.repair) {
        const h = G.inv.held;
        if (!h || !(h.dmg > 0)) { G.ui.toast('🔧 Hold a worn tool to get it repaired'); return; }
      }
      if (!Shops.pay(T.price)) { G.ui.toast('🪙 You need ' + T.price + ' coins'); sfx('gate_no', null, 0.6, 1); return; }
      if (T.repair) G.inv.held.dmg = 0;
      else if (T.item) { const rest = G.inv.add(mkStack(T.item, T.n)); if (rest > 0) Ents.spawnItem(mkStack(T.item, rest), G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]); }
      if (T.heal && G.stats) G.stats.health = Math.min(G.stats.maxHealth || 20, (G.stats.health || 20) + 6);
      if (Net.on) Net.op(['BZ', id, T.price]);
      G.ui.toast(T.icon + ' ' + T.what + ' · thank you!', 2200);
      sfx('shop_till', null, 0.6, 1.2);
      p.close();
    });
  },

  // ---- the keepers ----
  dropNpcs(id) { const l = this.npcs.get(id); if (l) for (const m of l) m.removed = true; this.npcs.delete(id); },
  keepers(dt) {
    const p = G.player.pos, w = G.world, shops = this.list();
    const live = new Set(shops.map(([id]) => id));
    for (const id of [...this.npcs.keys()]) if (!live.has(id)) this.dropNpcs(id);
    for (const [id, s] of shops) {
      const near = Math.abs(s.x - p[0]) < 56 && Math.abs(s.z - p[2]) < 56 && Math.abs(s.y - p[1]) < 40 && w.isLoaded(s.x, s.z);
      let l = this.npcs.get(id);
      if (l && (!near || l.some((m) => m.removed || m.dead))) { this.dropNpcs(id); l = null; if (!near) continue; }
      if (!near || l || !G.rules.mobSpawning) continue;
      l = [];
      const n = 1 + Math.min(BIZ_STAFF, s.staff | 0);
      for (let i = 0; i < n; i++) {
        const k = i === 0 ? 0 : i === 1 ? -1 : i === 2 ? 1 : 0, d = i === 3 ? 1 : 3;
        const [x, z] = i === 3 ? this.cell(s, 0, 2) : this.cell(s, d, k);
        const m = Ents.spawnMob('villager', x + 0.5, s.y + 0.01, z + 0.5);
        if (!m) continue;
        m.persistent = true; m.bizNpc = id; m.bizMain = i === 0;
        m.prof = 'shopkeeper'; m.skin = i === 0 ? (VILLAGER_SKIN.shopkeeper || 0) : (STUDENT_SKINS.length ? STUDENT_SKINS[Math.floor(hash3(s.x, i, s.z, 92) * STUDENT_SKINS.length)] : VILLAGER_SKIN.shopkeeper);
        m.name = this.staffName(s, i);
        m.home = [x + 0.5, z + 0.5]; m.homeR = 0.3;
        m.yaw = Math.atan2(-s.fx, -s.fz);
        l.push(m);
      }
      this.npcs.set(id, l);
    }
  },

  // the neighbours shop after work: a sale each time one reaches one of your stalls
  customers() {
    if (typeof Citizens === 'undefined' || !Citizens.list.length) return;
    const day = ((G.prog && G.prog.day) | 0) + Math.floor((G.dayTime || 0) * 4);
    for (const [id, s] of this.mine()) {
      const sp = this.spot(s), T = BIZ_TYPES[s.type];
      for (const m of Citizens.list) {
        if (m.removed || Math.hypot(m.pos[0] - sp[0], m.pos[2] - sp[2]) > 2.6 || Math.abs(m.pos[1] - sp[1]) > 2) continue;
        const tag = id + ':' + day;
        if (m.bizSeen === tag) continue;
        m.bizSeen = tag;
        const b = this.own(id), got = Math.round(T.price * (1 + 0.25 * (b.lvl - 1)) * 2);
        b.bank += got; b.sold = (b.sold || 0) + 1;
        const pp = G.player.pos;
        if (Math.hypot(pp[0] - sp[0], pp[2] - sp[2]) < 24) {
          G.ui.toast(T.icon + ' ' + m.name + ' bought ' + T.what + ' · +' + got, 2400);
          sfx('pling', sp, 0.5, 1.2);
          Particles.poof && Particles.poof(sp[0], sp[1] + 1.8, sp[2], 0.5, 1);
        }
      }
    }
  },
  // where a neighbour goes shopping instead (the stalls on the district's ground)
  visit(c, plan) {
    const shops = this.list().filter(([, s]) => Math.abs(s.y - plan.y) <= 2 && Math.abs(s.x - plan.x) < 260 && Math.abs(s.z - plan.z) < 260);
    if (!shops.length) return null;
    const day = (G.prog && G.prog.day) | 0;
    if (hash3(c.i, day, 3, 93) > 0.6) return null;
    const [, s] = shops[Math.floor(hash3(c.i, day, 4, 94) * shops.length)];
    const [x, z] = this.cell(s, 1, Math.round(hash3(c.i, day, 5, 95) * 2 - 1));
    return [x - plan.x, z - plan.z, 'fun'];
  },

  // floating shop signs over the stalls
  drawTags() {
    const R = G.renderer;
    let host = $('bizTags');
    if (!host) { host = document.createElement('div'); host.id = 'bizTags'; document.body.append(host); }
    const show = R && R.viewProj && !G.onTitle && !G.hudHidden && !G.screenOpen;
    const seen = new Set();
    if (show) {
      const vp = R.viewProj, cam = R.camPos, W = window.innerWidth, H = window.innerHeight;
      for (const [id, s] of this.list()) {
        const [x, z] = this.cell(s, 2.5, 0), rel = [x + 0.5 - cam[0], s.y + 4.4 - cam[1], z + 0.5 - cam[2]];
        const dist = Math.hypot(rel[0], rel[1], rel[2]);
        if (dist > 48) continue;
        const w = vp[3] * rel[0] + vp[7] * rel[1] + vp[11] * rel[2] + vp[15];
        if (w < 0.1) continue;
        const sx = ((vp[0] * rel[0] + vp[4] * rel[1] + vp[8] * rel[2] + vp[12]) / w * 0.5 + 0.5) * W;
        const sy = (1 - ((vp[1] * rel[0] + vp[5] * rel[1] + vp[9] * rel[2] + vp[13]) / w * 0.5 + 0.5)) * H;
        let el = this.tags.get(id);
        if (!el) { el = document.createElement('div'); el.className = 'bztag'; host.append(el); this.tags.set(id, el); }
        const T = BIZ_TYPES[s.type], h = CityAlive.hour(), openNow = h >= 7 && h < 23;
        const html = `<i>${T.icon}</i><b>${BZ.esc(s.name)}</b><span>${'★'.repeat(s.lvl || 1)} · ${openNow ? 'OPEN' : 'CLOSED'}</span>`;
        if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; el.classList.toggle('shut', !openNow); }
        el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%) scale(${clamp(14 / Math.max(8, dist), 0.45, 1).toFixed(3)})`;
        el.style.opacity = String(clamp((48 - dist) / 10, 0, 1));
        seen.add(id);
      }
    }
    for (const [id, el] of this.tags) if (!seen.has(id)) { el.remove(); this.tags.delete(id); }
  },

  update(dt) {
    if (!G.world || G.onTitle) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    if (!this.welcomed) {
      this.welcomed = true;
      const n = Math.floor(this.pending());
      if (n > 20) setTimeout(() => G.ui.banner('💼', 'Your businesses made ' + BZ.coins(n) + ' while you were away · collect it on the phone'), 4000);
    }
    this.keepers(dt);
    this.customers();
  },

  // ---- the app ----
  panel(focus) {
    const q = GPanel.open({ title: ED('Els meus negocis', 'My businesses'), sub: CITY, icon: '💼', cls: 'gp-biz', width: 720 });
    let iv = 0;
    q.onClose = () => clearInterval(iv);
    const draw = () => {
      const e = BZ.esc, mine = this.mine(), others = this.list().filter(([, s]) => !BZ.me(s.o));
      const pend = this.pending(), ph = this.perHour();
      const money = G.mode === 'creative' ? '∞' : BZ.coins(G.money | 0);
      q.body.innerHTML = `
        <div class="bz-hero">
          <div><small>Ready to collect</small><b class="bz-pend">${BZ.coins(pend)}</b></div>
          <div><small>Income</small><b>+${Math.round(ph)}<em>/h</em></b></div>
          <div><small>You have</small><b>${money}</b></div>
          <button class="gp-btn ok" data-a="all" ${pend >= 1 ? '' : 'disabled'}>Collect all</button>
        </div>
        ${mine.length ? mine.map(([id, s]) => {
          const T = BIZ_TYPES[s.type], b = this.accrue(id, s), cap = this.cap(s, b);
          const up = Math.round(T.cost * 0.75 * b.lvl), hire = 200 * (b.staff + 1);
          return `<div class="bz-shop${focus === id ? ' focus' : ''}" data-id="${id}">
            <div class="bz-ic" style="--c:${['#e8e8e8', '#f07614', '#be46b4', '#3cb0da', '#f8c628', '#70ba1a', '#ee8eac', '#40464a', '#909088', '#168a92', '#7a2cac', '#363a9e', '#724828', '#546e1c', '#a22824', '#16161a'][T.awn]}">${T.icon}</div>
            <div class="bz-main"><b>${e(s.name)}</b><small>${e(T.name)} · ${'★'.repeat(b.lvl)}${'☆'.repeat(BIZ_LVL - b.lvl)} · ${b.staff} staff · ${b.sold || 0} customers · ${People.dist([s.x, s.y, s.z])}</small>
              <div class="bz-bar"><i style="width:${Math.min(100, b.bank / Math.max(1, cap) * 100).toFixed(1)}%"></i><span>${BZ.coins(b.bank)} / ${cap}${b.bank >= cap - 0.5 ? ' · full! collect it' : ' · +' + Math.round(this.net(s, b)) + '/h'}</span></div></div>
            <div class="bz-acts"><button class="gp-btn ok" data-a="col" ${b.bank >= 1 ? '' : 'disabled'}>Collect</button>
              <button class="gp-btn" data-a="up" ${b.lvl >= BIZ_LVL ? 'disabled' : ''} title="More income and a bigger till">${b.lvl >= BIZ_LVL ? 'Top level' : '⭐ ' + up}</button>
              <button class="gp-btn" data-a="hire" ${b.staff >= BIZ_STAFF ? 'disabled' : ''} title="+35% income, ${BIZ_SALARY}/h salary">${b.staff >= BIZ_STAFF ? 'Full team' : '🤝 ' + hire}</button>
              <button class="gp-btn" data-a="ren" title="Rename">✏️</button><button class="gp-btn bad" data-a="del" title="Close it (half the price back)">✕</button></div>
          </div>`;
        }).join('') : '<p class="gp-dim" style="margin:4px 0 12px">You don’t run any business yet. Stand where you want it, look where the counter should go and open one below: it earns coins every hour, even while you are away.</p>'}
        <h4 class="bz-h">Open a business here <span>5 × 4 free blocks in front of you · max ${BIZ_MAX}</span></h4>
        <div class="bz-types">${Object.entries(BIZ_TYPES).map(([k, T]) => `<button class="bz-type" data-open="${k}"><i>${T.icon}</i><b>${e(T.name)}</b><span>+${T.rate}/h · sells ${e(T.what)}</span><em>${BZ.coins(T.cost)}</em></button>`).join('')}</div>
        ${others.length ? `<h4 class="bz-h">Around ${e(CITY)}</h4>${others.map(([, s]) => `<div class="gp-row"><span style="font-size:20px">${BIZ_TYPES[s.type].icon}</span><div class="gp-grow"><b>${e(s.name)}</b><small>${e(s.n)} · ${'★'.repeat(s.lvl || 1)} · ${People.dist([s.x, s.y, s.z])}</small></div></div>`).join('')}` : ''}`;
      q.body.querySelector('[data-a="all"]').addEventListener('click', () => { this.collectAll(); draw(); });
      q.body.querySelectorAll('.bz-shop').forEach((row) => {
        const id = row.dataset.id;
        row.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
          const a = b.dataset.a;
          if (a === 'col') { const n = this.collect(id); if (n) G.ui.toast('💰 +' + n); }
          if (a === 'up') this.upgrade(id);
          if (a === 'hire') this.hire(id);
          if (a === 'ren') {
            const s = BZ.data().shops[id], nm = prompt('Name of your business', s.name);
            if (nm && nm.trim()) { s.name = nm.trim().slice(0, 28); BZ.put('shops', id, s); }
          }
          if (a === 'del') { if (confirm('Close ' + BZ.data().shops[id].name + '? You get half of what it cost and the till.')) this.close(id); }
          draw();
        }));
      });
      q.body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
        const T = BIZ_TYPES[b.dataset.open];
        const c = this.canOpen();
        if (c.err) { G.ui.toast('🏪 ' + c.err, 3500); sfx('gate_no', null, 0.6, 1); return; }
        const nm = prompt('Name your ' + T.name, Net.name + '’s ' + T.name);
        if (nm === null) return;
        if (this.open(b.dataset.open, nm.trim() || undefined)) q.close();
      }));
    };
    draw();
    // the tills fill up while you look
    iv = setInterval(() => {
      if (!q.wrap.isConnected) { clearInterval(iv); return; }
      for (const row of q.body.querySelectorAll('.bz-shop')) {
        const id = row.dataset.id, s = BZ.data().shops[id];
        if (!s) continue;
        const b = this.accrue(id, s), cap = this.cap(s, b), bar = row.querySelector('.bz-bar');
        bar.querySelector('i').style.width = Math.min(100, b.bank / Math.max(1, cap) * 100).toFixed(1) + '%';
        bar.querySelector('span').textContent = BZ.coins(b.bank) + ' / ' + cap + (b.bank >= cap - 0.5 ? ' · full! collect it' : ' · +' + Math.round(this.net(s, b)) + '/h');
      }
      const pe = q.body.querySelector('.bz-pend');
      if (pe) pe.textContent = BZ.coins(this.pending());
    }, 1000);
  },
};

// ======================================================== stock market ====
const STOCKS = [
  { k: 'BANC', name: ED('Banc de STUCOM', 'Blockton Bank'), icon: '🏦', base: 120, vol: 0.7, seed: 11 },
  { k: 'METR', name: ED('Metro de STUCOM', 'Blockton Metro'), icon: '🚇', base: 46, vol: 0.9, seed: 12 },
  { k: 'AIR', name: 'BlocAir', icon: '✈️', base: 82, vol: 1.4, seed: 13 },
  { k: 'MINE', name: 'Deep Rock Mining', icon: '⛏️', base: 31, vol: 1.3, seed: 14 },
  { k: 'PIXL', name: 'Pixel Studios', icon: '🎮', base: 210, vol: 1.8, seed: 15 },
  { k: 'FORN', name: 'Forn & Co', icon: '🥐', base: 18, vol: 0.5, seed: 16 },
  { k: 'VOLT', name: 'Volt Motors', icon: '🔋', base: 150, vol: 2.2, seed: 17 },
];
const STOCK_NEWS = {
  BANC: ['Bank raises its interest rates', 'Bank fined for hidden fees'],
  METR: ['New metro line brings record passengers', 'Signal failure stops the metro for hours'],
  AIR: ['Holiday rush fills every BlocAir flight', 'Storms ground half the fleet'],
  MINE: ['Miners hit a huge diamond vein', 'Flooded shaft closes the main mine'],
  PIXL: ['Pixel Studios’ new game is a smash hit', 'Big release delayed again'],
  FORN: ['Croissant craze sweeps the city', 'Flour prices hit a record high'],
  VOLT: ['Volt unveils a self-driving car', 'Volt recalls 10,000 cars'],
};
const STOCK_FEE = 0.01;

const Stocks = {
  sel: 'BANC', range: 60,
  vn(x, seed) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    const a = hash3(i, seed, 7, 91) * 2 - 1, b = hash3(i + 1, seed, 7, 91) * 2 - 1;
    return a + (b - a) * u;
  },
  // the price at minute m of the real clock: the same on every computer
  at(s, m) {
    let l = 0;
    for (const [per, amp, o] of [[0.8, 0.003, 1], [7, 0.011, 2], [50, 0.028, 3], [400, 0.075, 4], [3000, 0.2, 5]]) l += amp * s.vol * this.vn(m / per, s.seed * 10 + o);
    return s.base * Math.exp(l);
  },
  now() { return Date.now() / 60000; },
  price(s) { return this.at(s, this.now()); },
  change(s, mins) { const n = this.now(); return this.at(s, n) / this.at(s, n - mins) - 1; },
  of(k) { return STOCKS.find((s) => s.k === k); },
  hold() { return BZ.prog().stocks; },
  value() { let v = 0; for (const [k, h] of Object.entries(this.hold())) { const s = this.of(k); if (s && h) v += h.n * this.price(s); } return v; },
  cost() { let v = 0; for (const h of Object.values(this.hold())) if (h) v += h.cost; return v; },
  buy(k, n) {
    const s = this.of(k); n = Math.floor(n);
    if (!s || n <= 0) return;
    const total = Math.ceil(this.price(s) * n * (1 + STOCK_FEE));
    if (!Shops.pay(total)) { G.ui.toast('🪙 ' + n + ' × ' + k + ' cost ' + total + ' (you have ' + (G.money | 0) + ')'); sfx('gate_no', null, 0.6, 1); return; }
    const H = this.hold(), h = H[k] || (H[k] = { n: 0, cost: 0 });
    h.n += n; h.cost += total;
    G.ui.toast('📈 Bought ' + n + ' ' + k + ' · ' + BZ.coins(total));
    sfx('shop_till', null, 0.6, 1.3);
  },
  sell(k, n) {
    const s = this.of(k), H = this.hold(), h = H[k];
    n = Math.floor(Math.min(n, h ? h.n : 0));
    if (!s || n <= 0) return;
    const got = Math.floor(this.price(s) * n * (1 - STOCK_FEE));
    h.cost *= (h.n - n) / h.n; h.n -= n;
    if (h.n <= 0) delete H[k];
    if (G.mode === 'creative') G.ui.toast('📉 Sold (coins don’t count in creative)'); else Shops.earn(got);
    G.ui.toast('💰 Sold ' + n + ' ' + k + ' · ' + BZ.coins(got));
    sfx('shop_till', null, 0.6, 1.1);
  },
  // headlines: the biggest half-hour moves of the last day
  news() {
    const n = Math.floor(this.now() / 30) * 30, out = [];
    for (const s of STOCKS) for (let i = 0; i < 48; i++) {
      const t = n - i * 30, ch = this.at(s, t) / this.at(s, t - 30) - 1;
      if (Math.abs(ch) > 0.012 + 0.006 * s.vol) out.push({ s, t, ch });
    }
    out.sort((a, b) => b.t - a.t);
    const seen = new Set();
    return out.filter((q) => { const k = q.s.k + (q.ch > 0); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6).map((q) => ({ ...q, text: STOCK_NEWS[q.s.k][q.ch > 0 ? 0 : 1] }));
  },
  spark(c, s, mins, big) {
    const g = c.getContext('2d'), W = c.width, H = c.height, n = big ? 160 : 40, now = this.now(), pts = [];
    for (let i = 0; i <= n; i++) pts.push(this.at(s, now - mins + mins * i / n));
    let lo = Math.min(...pts), hi = Math.max(...pts);
    if (hi - lo < 1e-6) hi = lo + 1;
    const pad = big ? 22 : 3, up = pts[n] >= pts[0], col = up ? '#3cf29a' : '#ff6b6b';
    const X = (i) => pad + (W - pad * 2) * i / n, Y = (v) => pad + (H - pad * 2) * (1 - (v - lo) / (hi - lo));
    g.clearRect(0, 0, W, H);
    if (big) {
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
      for (let k = 0; k <= 4; k++) { const y = pad + (H - pad * 2) * k / 4; g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.45)'; g.font = '600 11px system-ui';
      g.fillText(hi.toFixed(2), 4, pad - 6); g.fillText(lo.toFixed(2), 4, H - 6);
      const lab = mins <= 60 ? '1 hour' : mins <= 1440 ? '24 hours' : '7 days';
      g.textAlign = 'right'; g.fillText(lab + ' · now', W - 4, H - 6); g.textAlign = 'left';
    }
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, up ? 'rgba(60,242,154,.35)' : 'rgba(255,107,107,.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.beginPath(); g.moveTo(X(0), Y(pts[0]));
    for (let i = 1; i <= n; i++) g.lineTo(X(i), Y(pts[i]));
    g.lineTo(X(n), H - pad); g.lineTo(X(0), H - pad); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); g.moveTo(X(0), Y(pts[0]));
    for (let i = 1; i <= n; i++) g.lineTo(X(i), Y(pts[i]));
    g.strokeStyle = col; g.lineWidth = big ? 2.2 : 1.5; g.lineJoin = 'round'; g.stroke();
    if (big) { g.fillStyle = col; g.beginPath(); g.arc(X(n), Y(pts[n]), 4, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(X(n), Y(pts[n]), 8 + 3 * Math.sin(performance.now() / 300), 0, 7); g.fill(); }
    return { pts, lo, hi, X, Y, pad };
  },
  open() {
    const q = GPanel.open({ title: ED('Borsa de STUCOM', CITY + ' Stock Exchange'), sub: 'Live', icon: '📈', cls: 'gp-stocks', width: 980 });
    let iv = 0, qty = 1;
    q.onClose = () => clearInterval(iv);
    const pct = (v) => (v >= 0 ? '▲ ' : '▼ ') + Math.abs(v * 100).toFixed(2) + '%';
    const cls = (v) => (v >= 0 ? 'up' : 'dn');
    const draw = () => {
      const e = BZ.esc, s = this.of(this.sel), H = this.hold(), h = H[s.k], pr = this.price(s);
      const val = this.value(), cost = this.cost(), pl = val - cost;
      q.body.innerHTML = `
        <div class="st-tape"><div>${[...STOCKS, ...STOCKS].map((t) => { const c = this.change(t, 60); return `<span>${t.icon} <b>${t.k}</b> ${this.price(t).toFixed(2)} <em class="${cls(c)}">${pct(c)}</em></span>`; }).join('')}</div></div>
        <div class="st-wrap">
          <div class="st-list">${STOCKS.map((t) => { const c = this.change(t, 60); return `<button class="st-row${t.k === s.k ? ' on' : ''}" data-k="${t.k}"><i>${t.icon}</i><div><b>${t.k}</b><small>${e(t.name)}</small></div><canvas width="60" height="24" data-sp="${t.k}"></canvas><div class="st-p"><b data-pr="${t.k}">${this.price(t).toFixed(2)}</b><em class="${cls(c)}">${pct(c)}</em></div></button>`; }).join('')}</div>
          <div class="st-main">
            <div class="st-head"><div><b>${s.icon} ${e(s.name)}</b><small>${s.k} · volatility ${'●'.repeat(Math.round(s.vol * 2))}</small></div><div class="st-big"><b data-big>${pr.toFixed(2)}</b><em class="${cls(this.change(s, this.range))}" data-bch>${pct(this.change(s, this.range))}</em></div></div>
            <div class="st-rng">${[[60, '1H'], [1440, '1D'], [10080, '1W']].map(([m, l]) => `<button class="${m === this.range ? 'on' : ''}" data-r="${m}">${l}</button>`).join('')}</div>
            <canvas class="st-chart" width="520" height="210"></canvas>
            <div class="st-trade">
              <div class="st-qty"><button data-q="-">−</button><input type="number" min="1" value="${qty}" /><button data-q="+">+</button>${[1, 10, 100].map((n) => `<button data-qs="${n}">${n}</button>`).join('')}<button data-qs="max">Max</button></div>
              <button class="gp-btn ok" data-a="buy">Buy · <span data-tb>${BZ.coins(pr * qty * (1 + STOCK_FEE))}</span></button>
              <button class="gp-btn bad" data-a="sell" ${h ? '' : 'disabled'}>Sell</button>
            </div>
            <p class="gp-dim st-own">${h ? `You own <b>${h.n}</b> ${s.k} · paid ${BZ.coins(h.cost)} · worth ${BZ.coins(h.n * pr)} · <span class="${cls(h.n * pr - h.cost)}">${h.n * pr - h.cost >= 0 ? '+' : ''}${Math.round(h.n * pr - h.cost)}</span>` : 'You don’t own any ' + s.k + ' yet'} · 1% fee on every trade</p>
          </div>
          <div class="st-side">
            <div class="st-port"><small>Your portfolio</small><b>${BZ.coins(val)}</b><em class="${cls(pl)}">${pl >= 0 ? '+' : ''}${Math.round(pl)} (${cost ? (pl / cost * 100).toFixed(1) : '0.0'}%)</em><small>Cash ${G.mode === 'creative' ? '∞' : BZ.coins(G.money | 0)}</small></div>
            <small class="st-nh">📰 Market news</small>
            ${this.news().map((n) => `<div class="st-news"><b>${n.s.icon} ${e(n.text)}</b><small>${n.s.k} <em class="${cls(n.ch)}">${pct(n.ch)}</em> · ${BZ.mmss((this.now() - n.t) * 60000)} ago</small></div>`).join('') || '<p class="gp-dim">A calm day on the market.</p>'}
          </div>
        </div>`;
      q.body.querySelectorAll('[data-sp]').forEach((c) => this.spark(c, this.of(c.dataset.sp), 60, false));
      const chart = q.body.querySelector('.st-chart');
      this.spark(chart, s, this.range, true);
      q.body.querySelectorAll('.st-row').forEach((b) => b.addEventListener('click', () => { this.sel = b.dataset.k; draw(); }));
      q.body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { this.range = Number(b.dataset.r); draw(); }));
      const inp = q.body.querySelector('.st-qty input');
      const setQ = (n) => { qty = clamp(Math.floor(n) || 1, 1, 99999); inp.value = qty; q.body.querySelector('[data-tb]').textContent = BZ.coins(this.price(s) * qty * (1 + STOCK_FEE)); };
      inp.addEventListener('input', () => setQ(Number(inp.value)));
      q.body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => setQ(qty + (b.dataset.q === '+' ? 1 : -1))));
      q.body.querySelectorAll('[data-qs]').forEach((b) => b.addEventListener('click', () => setQ(b.dataset.qs === 'max' ? (h && G.mode !== 'creative' && (G.money | 0) < this.price(s) * (1 + STOCK_FEE) ? h.n : Math.max(1, Math.floor((G.mode === 'creative' ? 1000 * this.price(s) : G.money | 0) / (this.price(s) * (1 + STOCK_FEE))))) : Number(b.dataset.qs))));
      q.body.querySelector('[data-a="buy"]').addEventListener('click', () => { this.buy(s.k, qty); draw(); });
      q.body.querySelector('[data-a="sell"]').addEventListener('click', () => { this.sell(s.k, Math.min(qty, h ? h.n : 0)); draw(); });
      // hover: the price at that moment
      chart.addEventListener('mousemove', (ev) => {
        const r = chart.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width * chart.width;
        const g = this.spark(chart, s, this.range, true), n = g.pts.length - 1;
        const i = clamp(Math.round((fx - g.pad) / (chart.width - g.pad * 2) * n), 0, n), cx = chart.getContext('2d');
        cx.strokeStyle = 'rgba(255,255,255,.35)'; cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(g.X(i), g.pad); cx.lineTo(g.X(i), chart.height - g.pad); cx.stroke(); cx.setLineDash([]);
        const ago = this.range * (1 - i / n), lab = g.pts[i].toFixed(2) + ' · ' + (ago < 1 ? 'now' : BZ.mmss(ago * 60000) + ' ago');
        cx.font = '700 12px system-ui'; const tw = cx.measureText(lab).width + 12, bx = clamp(g.X(i) - tw / 2, 2, chart.width - tw - 2);
        cx.fillStyle = 'rgba(10,14,24,.9)'; cx.fillRect(bx, 4, tw, 20); cx.fillStyle = '#fff'; cx.fillText(lab, bx + 6, 18);
      });
    };
    draw();
    iv = setInterval(() => {
      if (!q.wrap.isConnected) { clearInterval(iv); return; }
      const s = this.of(this.sel);
      q.body.querySelectorAll('[data-pr]').forEach((b) => { b.textContent = this.price(this.of(b.dataset.pr)).toFixed(2); });
      const big = q.body.querySelector('[data-big]');
      if (big) big.textContent = this.price(s).toFixed(2);
      const chart = q.body.querySelector('.st-chart');
      if (chart && !chart.matches(':hover')) this.spark(chart, s, this.range, true);
      const tb = q.body.querySelector('[data-tb]');
      if (tb) tb.textContent = BZ.coins(this.price(s) * qty * (1 + STOCK_FEE));
    }, 1000);
  },
};

// =============================================================== renting ====
const Rent = {
  t: 0,
  day() { return DAY_LENGTH * 1000; },
  data(id) { const D = BZ.data(); return { rent: D.rent[id] || null, lease: D.lease[id] || null }; },
  tenant(id) { const l = BZ.data().lease[id]; return !!l && l.tenant === Net.owner && l.until > Date.now(); },
  // what I own that could be rented: houses and flats
  props() {
    const out = [];
    const R = G.world && G.world.homes;
    if (R && typeof Homes !== 'undefined') for (const p of Homes.plots()) {
      const r = R[p.id];
      if (!r || !BZ.me(r.o)) continue;
      const T = HOME_TYPES[r.type] || { icon: '🏠', name: 'House', price: 800 };
      out.push({ id: 'h:' + p.id, icon: T.icon, label: T.name + ' · plot ' + p.id.slice(1), pos: [p.x0 + 7, p.F, p.z0 + 7], fair: Math.round(T.price / 9), plot: p });
    }
    for (const [k, r] of Flats.mine()) out.push({ id: 'f:' + k, icon: '🏙️', label: 'Flat · floor ' + r.fl, pos: Flats.spot(r), fair: Math.round(Flats.price(r.fl) / 8) });
    return out;
  },
  // a tenant builds and sleeps in the house they rent
  byClaim(c) {
    const D = BZ.data();
    for (const [id, l] of Object.entries(D.lease)) {
      if (!l || l.tenant !== Net.owner || l.until <= Date.now() || !id.startsWith('h:')) continue;
      const p = Homes.plots().find((q) => 'h:' + q.id === id);
      if (p && c.x >= p.x0 - 1 && c.x <= p.x1 + 1 && c.z >= p.z0 - 1 && c.z <= p.z1 + 1) return true;
    }
    return false;
  },
  list(id, price, open, prop) {
    const r = { o: Net.owner, n: Net.name, price: clamp(Math.round(price), 5, 5000), open: !!open, label: prop.label, icon: prop.icon, x: prop.pos[0], y: prop.pos[1], z: prop.pos[2], fair: prop.fair, t: Date.now() };
    BZ.put('rent', id, r);
  },
  lease(id, days) {
    const { rent, lease } = this.data(id);
    if (!rent || !rent.open) return;
    if (lease && lease.until > Date.now() && lease.tenant !== Net.owner) { G.ui.toast('Someone already lives there'); return; }
    const cost = rent.price * days;
    if (!Shops.pay(cost)) { G.ui.toast('🪙 ' + days + ' days cost ' + cost); sfx('gate_no', null, 0.6, 1); return; }
    const from = lease && lease.tenant === Net.owner && lease.until > Date.now() ? lease.until : Date.now();
    BZ.put('lease', id, { tenant: Net.owner, tn: Net.name, until: from + days * this.day(), paid: ((lease && lease.paid) || 0) + cost });
    Home.set([rent.x, rent.y, rent.z], 'rent');
    G.ui.banner('🔑', 'Keys in hand! ' + rent.label + ' is yours for ' + days + ' day' + (days > 1 ? 's' : ''));
    sfx('achieve', null, 0.8, 1);
  },
  pending() {
    const D = BZ.data(), got = BZ.prog().rentGot;
    let n = 0;
    for (const [id, r] of Object.entries(D.rent)) if (r && BZ.me(r.o)) { const l = D.lease[id]; if (l) n += Math.max(0, (l.paid || 0) - (got[id] || 0)); }
    return n;
  },
  collect() {
    const D = BZ.data(), got = BZ.prog().rentGot;
    let n = 0;
    for (const [id, r] of Object.entries(D.rent)) if (r && BZ.me(r.o)) { const l = D.lease[id]; if (l) { n += Math.max(0, (l.paid || 0) - (got[id] || 0)); got[id] = l.paid || 0; } }
    if (n > 0) { Shops.earn(n); G.ui.banner('🔑', 'Rent collected · ' + BZ.coins(n)); sfx('shop_till', null, 0.7, 1); }
    return n;
  },
  // neighbours move into what nobody rents, and pay (the owner's computer runs them)
  update(dt) {
    this.t -= dt;
    if (this.t > 0 || !G.world || G.onTitle) return;
    this.t = 5;
    const D = BZ.data(), now = Date.now(), day = this.day();
    for (const [id, r] of Object.entries(D.rent)) {
      if (!r || !BZ.me(r.o) || !r.open) continue;
      let l = D.lease[id];
      if (l && l.until > now) continue;
      const want = clamp((r.fair || r.price) / r.price, 0.03, 1);
      // a neighbour's lease ran out while we were away: they stay on (or not), three days at a time
      if (l && l.npc) {
        let k = 0, changed = false;
        while (l.until <= now && k++ < 30 && hash3(Math.floor(l.until / day), id.length, k, 96) < 0.55 + 0.4 * want) { l = { ...l, until: l.until + 3 * day, paid: (l.paid || 0) + r.price * 3 }; changed = true; }
        if (changed) { BZ.put('lease', id, l); if (l.until > now) continue; }
      }
      r.wait = r.wait || now + (40 + 100 * Math.random()) * 1000;
      if (now < r.wait) continue;
      r.wait = 0;
      if (Math.random() > want) continue;
      const nm = VILLAGER_NAMES[Math.floor(Math.random() * VILLAGER_NAMES.length)];
      BZ.put('lease', id, { tenant: 'npc', tn: nm, npc: true, until: now + 3 * day, paid: ((l && l.paid) || 0) + r.price * 3 });
      G.ui.toast('🔑 ' + nm + ' rented your ' + r.label + ' · ' + BZ.coins(r.price * 3) + ' to collect', 4500);
      sfx('pling', null, 0.6, 1);
    }
  },

  open(focus) {
    const q = GPanel.open({ title: ED('Lloguers', 'Rentals'), sub: CITY, icon: '🔑', cls: 'gp-rent', width: 680 });
    const draw = () => {
      const e = BZ.esc, D = BZ.data(), now = Date.now(), props = this.props(), pend = this.pending();
      const until = (t) => { const d = (t - now) / this.day(); return d >= 1 ? d.toFixed(1) + ' days left' : BZ.mmss(t - now) + ' left'; };
      const market = Object.entries(D.rent).filter(([id, r]) => r && r.open && !BZ.me(r.o));
      q.body.innerHTML = `
        <div class="bz-hero"><div><small>Rent to collect</small><b>${BZ.coins(pend)}</b></div><div><small>Your properties</small><b>${props.length}</b></div><div><small>Rented now</small><b>${props.filter((p) => D.lease[p.id] && D.lease[p.id].until > now).length}</b></div><button class="gp-btn ok" data-a="col" ${pend >= 1 ? '' : 'disabled'}>Collect</button></div>
        <h4 class="bz-h">Your properties <span>price per game day (${Math.round(DAY_LENGTH / 60)} min) · neighbours rent fair prices sooner</span></h4>
        ${props.length ? props.map((p) => {
          const r = D.rent[p.id], l = D.lease[p.id], live = l && l.until > now, price = r ? r.price : p.fair;
          return `<div class="rt-row${focus === p.id ? ' focus' : ''}" data-id="${p.id}"><i>${p.icon}</i><div class="gp-grow"><b>${e(p.label)}</b><small>${live ? (l.npc ? '🙂 ' : '👤 ') + 'Rented to ' + e(l.tn) + ' · ' + until(l.until) : r && r.open ? '📣 On the market · waiting for a tenant' : 'Not for rent'} · fair price ~${p.fair}</small></div>
            <div class="rt-price"><button data-p="-">−</button><b data-pv>${price}</b><button data-p="+">+</button></div>
            <button class="gp-btn ${r && r.open ? 'bad' : 'pri'}" data-a="tog">${r && r.open ? 'Take off' : 'Rent out'}</button></div>`;
        }).join('') : '<p class="gp-dim">Buy a house (📱 Real estate) or a flat in a tower (step onto its lift) and you can rent it out here.</p>'}
        <h4 class="bz-h">For rent in ${e(CITY)} <span>${Net.on ? 'from the other players' : 'online, your friends’ houses show up here'}</span></h4>
        ${market.length ? market.map(([id, r]) => {
          const l = D.lease[id], live = l && l.until > now, mine = live && l.tenant === Net.owner;
          return `<div class="rt-row" data-id="${id}"><i>${r.icon || '🏠'}</i><div class="gp-grow"><b>${e(r.label)}</b><small>${e(r.n)}’s · ${BZ.coins(r.price)} a day · ${People.dist([r.x, r.y, r.z])}${live ? ' · ' + (mine ? 'you live here · ' + until(l.until) : 'rented to ' + e(l.tn)) : ''}</small></div>
            ${live && !mine ? '' : [1, 3, 7].map((d) => `<button class="gp-btn ${d === 3 ? 'ok' : ''}" data-days="${d}">${mine ? '+' : ''}${d} d · ${r.price * d}</button>`).join('')}</div>`;
        }).join('') : '<p class="gp-dim">Nothing on the market right now.</p>'}`;
      q.body.querySelector('[data-a="col"]').addEventListener('click', () => { this.collect(); draw(); });
      q.body.querySelectorAll('.rt-row').forEach((row) => {
        const id = row.dataset.id, prop = props.find((p) => p.id === id);
        if (prop) {
          const pv = row.querySelector('[data-pv]');
          row.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
            const v = Number(pv.textContent), st = v >= 200 ? 25 : v >= 50 ? 5 : 1;
            const nv = clamp(v + (b.dataset.p === '+' ? st : -st), 5, 5000);
            pv.textContent = nv;
            const r = D.rent[id];
            if (r) this.list(id, nv, r.open, prop);
          }));
          row.querySelector('[data-a="tog"]').addEventListener('click', () => {
            const r = D.rent[id];
            this.list(id, Number(pv.textContent), !(r && r.open), prop);
            if (!(r && r.open)) G.ui.toast('📣 ' + prop.label + ' is on the market');
            draw();
          });
        }
        row.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { this.lease(id, Number(b.dataset.days)); draw(); }));
      });
    };
    draw();
  },
};

// ================================================================= hooks ====
SYNTH.cash_up = (ctx, o, t) => { Sound.tone(ctx, o, t, 0.12, { wave: 'triangle', f0: 1568, gain: 0.08 }); Sound.tone(ctx, o, t + 0.08, 0.2, { wave: 'triangle', f0: 2093, gain: 0.08 }); };
{
  // flats are private on servers (Claims.can gets the height from the callers)
  const can = Claims.can;
  Claims.can = function (x, z, y) {
    if (!can.call(this, x, z)) return false;
    if (y === undefined || !Net.on || !Net.server) return true;
    const f = Flats.at(x, y, z);
    if (f && !Flats.mayUse(f)) { Flats.denied = f; return false; }
    Flats.denied = null;
    return true;
  };
  const deny = Claims.deny;
  Claims.deny = function (x, z) {
    const f = Flats.denied;
    if (f && this.warnT <= 0) { this.warnT = 2; G.ui.toast('🔒 This is ' + f.n + '’s flat', 2500); sfx('gate_no', null, 0.6, 1); return; }
    return deny.call(this, x, z);
  };
  const tr = Claims.trusted;
  Claims.trusted = function (c) { return tr.call(this, c) || Rent.byClaim(c); };

  if (typeof Lift !== 'undefined') {
    const off = Lift.offer;
    Lift.offer = function (x, z, stops, cur) {
      off.call(this, x, z, stops, cur);
      try { if (Flats.tower(x, z, stops)) Flats.decorate(this.panel, x, z, stops, cur); } catch (e) { console.warn('Blocklands: flats', e); }
    };
  }
  const kp = Ents.keepable;
  Ents.keepable = function (m) { if (m.bizNpc) return false; return kp.call(this, m); };
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.mob && t.mob.bizNpc && !t.mob.dead) { Biz.serve(t.mob.bizNpc); this.swingHand(); return true; }
    return use.call(this, initial);
  };
  if (typeof Citizens !== 'undefined') {
    const goal = Citizens.goal;
    Citizens.goal = function (c, h) {
      const g = goal.call(this, c, h);
      if (g && g[2] === 'fun' && this.who && this.who.plan) { const v = Biz.visit(c, this.who.plan); if (v) return v; }
      return g;
    };
  }
  const ap = Net.applyOp;
  Net.applyOp = function (r, o) {
    if (o[1] === 'BZ') {
      const id = String(o[2]), s = BZ.data().shops[id], n = clamp(Number(o[3]) || 0, 0, 100);
      if (s && BZ.me(s.o) && n > 0) {
        const b = Biz.own(id);
        b.bank += n; b.sold = (b.sold || 0) + 1;
        G.ui.toast(BIZ_TYPES[s.type].icon + ' ' + ((r && r.name) || 'Someone') + ' bought at ' + s.name + ' · +' + n, 3000);
        sfx('cash_up', null, 0.6, 1);
      }
      return;
    }
    return ap.call(this, r, o);
  };
  const apply = SharedState.apply;
  SharedState.apply = function (k, v) {
    for (const [kind, pfx] of Object.entries(BZ.PFX)) if (k.startsWith(pfx)) {
      const id = k.slice(pfx.length), D = BZ.data()[kind];
      if (v && typeof v === 'object' && JSON.stringify(v).length < 800) D[id] = v; else if (!v) delete D[id];
      if (kind === 'shops') Biz.dropNpcs(id);
      return;
    }
    return apply.call(this, k, v);
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) {
    fu.call(this, dt);
    const d = dt || 0.016;
    try { Flats.update(); Biz.update(d); Rent.update(d); } catch (e) { console.warn('Blocklands: business', e); }
  };
  const wr = Weather.render;
  Weather.render = function (...a) { const r = wr.apply(this, a); try { Biz.drawTags(); } catch (e) { /* ignore */ } return r; };

  PC.add({ key: 'biz', icon: '💼', name: ED('Negocis', 'Business'), run() { Biz.panel(); } });
  PC.add({ key: 'stocks', icon: '📈', name: ED('Borsa', 'Stocks'), run() { Stocks.open(); } });
  PC.add({ key: 'rent', icon: '🔑', name: ED('Lloguers', 'Rentals'), run() { Rent.open(); } });
}
