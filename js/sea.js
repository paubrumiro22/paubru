'use strict';
// The sea: fishing with a rod, a sailing boat and the ferries.
// - Fishing rod: right-click facing water to cast; the float bobs on the surface until a fish
//   bites (it dips with a splash: right-click within a second and a bit to strike). Mostly fish,
//   now and then salmon or a tropical fish, rarely junk or treasure. Rain makes them bite sooner.
// - Sailing boat: a sail, a mast and a wooden hull, quicker than the motor boat. Motor STUCOM
//   sells it, or craft it.
// - Ferries: at every fishing port on the coast a ferry docks at the end of the pier, sails out
//   and comes back. Buy a ticket from the ferry (right-click it while it is docked) to the
//   Archipelago or the Paradise beach; the return ticket brings you back to that port. The
//   "Ferry" app on a computer finds the nearest port and puts it on your map.

Object.assign(I, { FISHING_ROD: 444, SAILBOAT: 445, SALMON: 446, TROPICAL_FISH: 447, COOKED_SALMON: 448, FERRY_TICKET: 449 });
defItem(I.FISHING_ROD, 'Fishing Rod', { sprite: 'i_fishing_rod', stack: 1, dur: 64, cat: 'tools' });
defItem(I.SAILBOAT, 'Sailing Boat', { sprite: 'i_sailboat', stack: 1, cat: 'transport' });
defItem(I.SALMON, 'Raw Salmon', { sprite: 'i_salmon', food: [2, 0.4], cat: 'food' });
defItem(I.TROPICAL_FISH, 'Tropical Fish', { sprite: 'i_tropical_fish', food: [1, 0.2], cat: 'food' });
defItem(I.COOKED_SALMON, 'Cooked Salmon', { sprite: 'i_cooked_salmon', food: [6, 9.6], cat: 'food' });
defItem(I.FERRY_TICKET, 'Ferry Ticket · back to port', { sprite: 'i_ferry_ticket', stack: 16, cat: 'transport' });
shaped(I.FISHING_ROD, 1, ['  S', ' SX', 'S X'], { S: I.STICK, X: I.STRING });
shaped(I.SAILBOAT, 1, ['  W', ' WW', 'PPP'], { W: B.WOOL, P: B.PLANKS });
if (typeof SMELT !== 'undefined') SMELT[I.SALMON] = I.COOKED_SALMON;
SHOPS.super.sell.push([I.FISHING_ROD, 12]);
SHOPS.super.buy.push([I.SALMON, 3], [I.TROPICAL_FISH, 5]);
SHOPS.cotxes.sell.splice(2, 0, [I.SAILBOAT, 220]);
MARKET_VALUE[I.SALMON] = 3; MARKET_VALUE[I.TROPICAL_FISH] = 5; MARKET_VALUE[I.FISHING_ROD] = 12;

// ---- the sailing boat and the ferry ----
{
  const WOOD = [0.55, 0.36, 0.2], SAIL = [0.97, 0.96, 0.92], NAVY = [0.1, 0.18, 0.42], RED = [0.82, 0.12, 0.14];
  RIDE_KINDS.sailboat = {
    item: I.SAILBOAT, name: 'Sailing Boat', type: 'water', max: 13, rev: 3, acc: 4.2, brake: 6, steer: 0.75, base: 3, step: 0.3, h: 1, len: 5, w: 1.9,
    seat: [0, 0.45, -1.4], eye: [0, 1.3, -1.4], cam: 9, sit: true, sound: 'boat', paintDefault: 3,
    parts: [
      [-0.9, 0, -2.2, 0.9, 0.25, 2.0, 'white', { c: WOOD }],
      [0.75, 0.2, -2.2, 0.95, 0.8, 2.0, 'white', { paint: true, m: true }],
      [-0.95, 0.2, -2.3, 0.95, 0.8, -2.1, 'white', { paint: true }],
      [-0.7, 0.1, 2.0, 0.7, 0.8, 2.5, 'white', { paint: true }], [-0.4, 0.2, 2.5, 0.4, 0.8, 2.9, 'white', { paint: true }],
      [-0.9, 0.8, -2.3, 0.9, 0.88, 2.9, 'white', { c: WOOD }],
      [-0.07, 0.8, 0.6, 0.07, 6.2, 0.74, 'metal'],                                   // mast
      [-0.05, 1.4, -1.9, 0.05, 1.5, 0.66, 'metal'],                                  // boom
      [-0.03, 1.5, -1.8, 0.03, 6.0, 0.6, 'white', { c: SAIL }],                       // mainsail
      [-0.03, 1.2, 0.8, 0.03, 5.6, 2.6, 'white', { c: SAIL }],                        // jib
      [-0.12, 5.9, 0.55, 0.12, 6.3, 0.8, 'navWhite', { glow: 1.2 }],
    ],
    hit: [[-0.95, -0.2, -2.3, 0.95, 1.2, 2.9]],
  };
  RIDE_KINDS.ferry = {
    item: I.FERRY_TICKET, name: 'Ferry', type: 'water', max: 10, rev: 0, acc: 0, brake: 0, steer: 0, base: 8, step: 0.3, h: 8, len: 22, w: 6,
    seat: [1.6, 3.6, -7], eye: [1.6, 4.5, -7], cam: 26, sit: true, sound: 'boat', paintDefault: 3,
    parts: [
      [-3, -0.6, -10, 3, 1.8, 10, 'white', { c: NAVY }],
      [-3, 1.8, -10, 3, 3.4, 10, 'white', { c: [0.97, 0.97, 0.97] }],
      [3, 2.1, -10, 3.05, 2.5, 10, 'white', { c: RED, m: true }],
      [-2.2, -0.4, 10, 2.2, 3.4, 11.5, 'white', { c: [0.97, 0.97, 0.97] }], [-1.2, 0, 11.5, 1.2, 3.4, 12.6, 'white', { c: [0.97, 0.97, 0.97] }],
      [-2.9, 3.4, -9.7, 2.9, 3.5, 9.7, 'white', { c: WOOD }],
      [-2.4, 3.5, -5.5, 2.4, 6, 4, 'white', { c: [0.97, 0.97, 0.97] }],
      [2.4, 4.3, -5, 2.45, 5.3, 3.5, 'glass', { m: true }],
      [-2, 6, 1, 2, 7.6, 4, 'white', { c: [0.97, 0.97, 0.97] }], [-1.8, 6.3, 4, 1.8, 7.3, 4.05, 'glass'],
      [-0.8, 6, -4, 0.8, 8.8, -2.3, 'white', { c: RED }], [-0.85, 8.4, -4.05, 0.85, 8.8, -2.25, 'hullDark'],
      [2.9, 3.5, -9.7, 3, 4.4, 9.7, 'metal', { m: true }], [-2.9, 3.5, -9.8, 2.9, 4.4, -9.7, 'metal'],
      [2.95, 2.8, 6, 3.05, 3.1, 6.3, 'navGreen', { glow: 1.3 }], [-3.05, 2.8, 6, -2.95, 3.1, 6.3, 'navRed', { glow: 1.3 }],
      [-0.1, 7.6, 3, 0.1, 9, 3.2, 'metal'], [-0.15, 9, 3, 0.15, 9.2, 3.2, 'navWhite', { strobe: true }],
    ],
    hit: [[-3, -0.6, -10, 3, 7.6, 12.6]],
  };
  for (const k of ['sailboat', 'ferry']) {
    RIDE_KEYS.push(k);
    const d = RIDE_KINDS[k];
    d.key = k;
    if (k === 'sailboat') RIDE_BY_ITEM[d.item] = d;
    const out = [];
    for (const [x0, y0, z0, x1, y1, z1, sw, o = {}] of d.parts) {
      out.push({ box: [x0, y0, z0, x1, y1, z1], sw, o });
      if (o.m) out.push({ box: [-x1, y0, z0, -x0, y1, z1], sw, o: Object.assign({}, o) });
    }
    d.model = out;
  }
}

// ---------------------------------------------------------------- fishing ----
const Fishing = {
  cast: null,   // { pos, t, bite, biting, window }
  start() {
    const p = G.player, e = p.eyePos(), d = p.lookDir(), w = G.world;
    let hit = null;
    for (let t = 1.5; t < 20; t += 0.25) {
      const x = e[0] + d[0] * t, y = e[1] + d[1] * t - Math.max(0, t - 6) * 0.08, z = e[2] + d[2] * t;
      const id = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id === B.WATER) {
        let top = Math.floor(y);
        while (w.getBlock(Math.floor(x), top + 1, Math.floor(z)) === B.WATER) top++;
        hit = [x, top + 0.92, z];
        break;
      }
      if (id !== B.AIR && BLOCK_SOLID[id]) break;
    }
    Act.swingHand();
    if (!hit) { G.ui.toast('🎣 Cast into water', 1400); return; }
    const rain = typeof Weather !== 'undefined' && (Weather.kind === 'rain' || Weather.kind === 'storm');
    this.cast = { pos: hit, t: 0, bite: rand(5, 16) * (rain ? 0.6 : 1), biting: 0 };
    sfx('fish_cast', null, 0.6, 1);
    Particles.splash && Particles.splash(hit[0], hit[1], hit[2]);
  },
  reel() {
    const c = this.cast;
    this.cast = null;
    Act.swingHand();
    if (!c) return;
    if (c.biting <= 0) { G.ui.toast(c.t > c.bite + 1.5 ? '🐟 It got away…' : '🎣 Nothing yet', 1300); return; }
    const r = Math.random();
    const luck = [[0.6, I.RAW_FISH], [0.8, I.SALMON], [0.88, I.TROPICAL_FISH], [0.93, [I.STICK, I.LEATHER, I.BONE, I.STRING][Math.floor(Math.random() * 4)]],
      [0.98, [I.EMERALD, I.GOLD_INGOT, I.IRON_INGOT][Math.floor(Math.random() * 3)]], [1, I.ENCHANTED_BOOK || I.EMERALD]];
    const id = luck.find(([k]) => r < k)[1];
    const st = mkStack(id, 1);
    if (id === I.ENCHANTED_BOOK && typeof randomEnchant === 'function') try { randomEnchant(st); } catch (e) { /* plain book */ }
    const left = G.inv.add(st);
    if (left) Ents.spawnItem(st, G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]);
    if (G.mode === 'survival' && G.inv.damageHeld(1)) sfx('tool_break', null, 0.8, 1);
    G.ui.invDirty();
    const pr = G.prog || (G.prog = {});
    pr.fish = (pr.fish || 0) + 1;
    sfx('pop', null, 1, 1.3);
    G.ui.toast((r < 0.88 ? '🐟 ' : r < 0.93 ? '🥾 ' : '💎 ') + 'You caught: ' + ITEM_DEF[id].name + ' · ' + pr.fish + ' catches', 2200);
  },
  update(dt) {
    const c = this.cast;
    if (!c) return;
    const p = G.player, held = G.inv.held;
    if (!held || held.id !== I.FISHING_ROD || Math.hypot(p.pos[0] - c.pos[0], p.pos[2] - c.pos[2]) > 26 || G.vehicle && G.vehicle.kind !== 'boat' && G.vehicle.kind !== 'sailboat') { this.cast = null; return; }
    c.t += dt;
    if (c.biting > 0) { c.biting -= dt; if (c.biting <= 0) { c.bite = c.t + rand(4, 12); } }
    else if (c.t >= c.bite && c.t < c.bite + 0.2) {
      c.biting = 1.3;
      sfx('fish_bite', c.pos, 1, rand(0.9, 1.1));
      for (let i = 0; i < 10; i++) Particles.add(Particles.base(c.pos[0] + rand(-0.3, 0.3), c.pos[1] + 0.1, c.pos[2] + rand(-0.3, 0.3), { vx: rand(-1, 1), vy: rand(1.5, 3), vz: rand(-1, 1), life: 0.6, max: 0.6, size: 0.06, layer: T.p_bubble, r: 0.8, g: 0.9, b: 1, grav: 12, collide: false }));
      G.ui.toast('❗ Bite! Right-click now', 900);
    }
    // the float, bobbing (or pulled under), and the line
    const dip = c.biting > 0 ? -0.18 : Math.sin(c.t * 3) * 0.03;
    const fpos = [c.pos[0], c.pos[1] + dip, c.pos[2]];
    Particles.add(Particles.base(fpos[0], fpos[1] + 0.07, fpos[2], { life: 0.03, max: 0.03, size: 0.09, layer: T.p_crit, r: 1, g: 0.15, b: 0.12, glow: true, collide: false, grav: 0 }));
    Particles.add(Particles.base(fpos[0], fpos[1] + 0.16, fpos[2], { life: 0.03, max: 0.03, size: 0.07, layer: T.p_crit, r: 1, g: 1, b: 1, collide: false, grav: 0 }));
    const e = p.eyePos(), d = p.lookDir(), r0 = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    const tip = [e[0] + d[0] * 1.6 + r0[0] * 0.35, e[1] + d[1] * 1.6 + 0.35, e[2] + d[2] * 1.6 + r0[2] * 0.35];
    for (let i = 1; i < 14; i++) {
      const k = i / 14, sag = Math.sin(k * Math.PI) * 0.6;
      Particles.add(Particles.base(tip[0] + (fpos[0] - tip[0]) * k, tip[1] + (fpos[1] + 0.15 - tip[1]) * k - sag, tip[2] + (fpos[2] - tip[2]) * k, { life: 0.03, max: 0.03, size: 0.018, layer: T.p_crit, r: 0.9, g: 0.9, b: 0.9, collide: false, grav: 0 }));
    }
  },
};
SYNTH.fish_cast = (ctx, o, t) => { Sound.noise(ctx, o, t, 0.25, { type: 'bandpass', freq: 2400, freqEnd: 900, q: 1.2, gain: 0.12 }); Sound.noise(ctx, o, t + 0.45, 0.2, { type: 'lowpass', freq: 900, gain: 0.25 }); };
SYNTH.fish_bite = (ctx, o, t) => { Sound.noise(ctx, o, t, 0.3, { type: 'lowpass', freq: 1100, gain: 0.4 }); Sound.tone(ctx, o, t, 0.12, { f0: 900, f1: 500, gain: 0.05 }); };

// ---------------------------------------------------------------- ferries ----
const FERRY_DESTS = ['islands', 'beach'];
const Ferry = {
  port: null, v: null, state: 'docked', t: 0, trip: null, scanT: 0,
  nearPort() {
    const g = G.world && G.world.gen, p = G.player.pos;
    if (!g || !g.structs) return null;
    let best = null, bd = 170;
    for (const pl of structuresIn(g, p[0] - 170, p[2] - 170, p[0] + 170, p[2] + 170)) {
      if (!pl || pl.type !== 'port' || !pl.pier) continue;
      const d = Math.hypot(pl.x - p[0], pl.z - p[2]);
      if (d < bd) { bd = d; best = pl; }
    }
    return best;
  },
  // where the ferry lies alongside the end of the pier, and the way out to sea
  dock(pl) {
    const q = pl.pier, ex = q.x + q.sx * q.len, ez = q.z + q.sz * q.len;
    const px = -q.sz, pz = q.sx;   // across the pier
    return { x: ex - q.sx * 7 + px * 7 + 0.5, z: ez - q.sz * 7 + pz * 7 + 0.5, y: SEA + 0.1, yaw: Math.atan2(q.sx, q.sz), out: [q.sx, q.sz] };
  },
  update(dt) {
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 3;
      const pl = this.nearPort();
      if (pl !== this.port && !(this.trip && G.vehicle === this.v)) { if (this.v) this.v.removed = true; this.v = null; this.port = pl; this.state = 'docked'; this.t = 0; }
    }
    if (!this.port) return;
    const D = this.dock(this.port);
    if (!this.v || this.v.removed) {
      this.v = Rides.spawn('ferry', D.x, D.y, D.z, D.yaw, 3);
      this.v.scripted = true; this.v.ferry = true; this.v.onGround = true;
    }
    const v = this.v;
    this.t += dt;
    // docked 50 s, out to sea 35 s, away 40 s, back in 35 s
    let off = 0;
    if (this.state === 'docked') { if (this.t > 50 && !this.trip) { this.state = 'out'; this.t = 0; sfx('horn', v.pos, 1, 0.5); } }
    else if (this.state === 'out') { off = 4 * this.t * this.t / 2 / 10; if (this.t > 35) { this.state = 'away'; this.t = 0; } }
    else if (this.state === 'away') { off = 400; if (this.t > 40) { this.state = 'in'; this.t = 0; } }
    else if (this.state === 'in') { const k = 1 - this.t / 35; off = 245 * k * k; if (this.t > 35) { this.state = 'docked'; this.t = 0; sfx('horn', v.pos, 1, 0.5); } }
    if (this.state === 'out') off = Math.min(off, 245);
    v.pos = [D.x + D.out[0] * off, D.y + Math.sin(G.time * 0.8) * 0.06, D.z + D.out[1] * off];
    v.yaw = D.yaw + (this.state === 'in' ? 0 : 0); v.pitch = 0; v.roll = Math.sin(G.time * 0.6) * 0.02;
    v.speed = this.state === 'out' ? Math.min(10, 0.4 * this.t) : this.state === 'in' ? 7 * (1 - this.t / 35) : 0;
    v.rpm = 0.2 + v.speed / 12;
    if (v.basis) v.basis();
    if (this.state === 'away' && G.vehicle !== v) v.pos[1] = -50;
    // the trip: after sailing out, arrive at the place
    if (this.trip && G.vehicle === v && this.state === 'out' && this.t > 22 && !this.trip.done) {
      this.trip.done = true;
      const d = this.trip.d, port = this.port;
      Airport.fade(true, () => {
        if (G.vehicle === v) Vehicles.dismount(true);
        const pr = G.prog || (G.prog = {});
        pr.found = pr.found || {}; pr.found[d.key] = true;
        pr.ferryPort = [port.x, port.y, port.z, port.name];
        travelTo(d.key);
        G.player.parachute = false;
        const left = G.inv.add(mkStack(I.FERRY_TICKET, 1));
        if (left) Ents.spawnItem(mkStack(I.FERRY_TICKET, 1), G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]);
        G.ui.invDirty();
        G.ui.banner('⛴️', 'Welcome to ' + d.name + '! Your ferry ticket takes you back to ' + (port.name || 'the port'));
        this.trip = null;
        Airport.fade(false);
      }, 1200);
    }
  },
  open() {
    if (!this.port || this.state !== 'docked') { G.ui.toast('⛴️ The ferry is at sea: wait for it at the end of the pier'); return; }
    const g = G.world.gen, list = FERRY_DESTS.map((k) => g.regions && g.regions.find((r) => r.key === k)).filter(Boolean).map((r) => {
      const dd = Math.hypot(r.x - this.port.x, r.z - this.port.z);
      return { key: r.key, name: r.p.name, icon: r.p.icon, d: dd, price: 20 + Math.round(dd / 60) };
    });
    const q = GPanel.open({ title: 'Ferry · ' + (this.port.name || 'Port'), sub: 'Leaves when you board', icon: '⛴️', cls: 'gp-shop', width: 480 });
    q.wrap.querySelector('.gp').style.setProperty('--shop', '#1a3f8a');
    q.body.innerHTML = `<div class="dep-board">${list.map((d) => `<div class="dep-row" style="grid-template-columns:1fr auto auto"><span class="dep-d">${d.icon} ${GPanel.esc(d.name)}</span><span class="dep-g">${Math.round(d.d)} blocks</span><button class="gp-btn ok" data-go="${d.key}">🪙 ${d.price}</button></div>`).join('') || '<div class="gp-empty">No sea routes in this world</div>'}</div>`;
    q.body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const d = list.find((x) => x.key === b.dataset.go);
      if (!Shops.pay(d.price)) { G.ui.toast('🪙 The ticket costs ' + d.price + ' coins'); return; }
      q.close();
      this.trip = { d };
      board.call(Vehicles, this.v);
      this.state = 'out'; this.t = 0;
      sfx('horn', this.v.pos, 1, 0.5);
      G.ui.banner('⛴️', 'All aboard for ' + d.name + '!');
    }));
  },
  back() {
    const pr = G.prog && G.prog.ferryPort;
    if (!pr) { G.ui.toast('You have not taken a ferry yet'); return false; }
    Airport.fade(true, () => {
      if (G.vehicle) Vehicles.dismount(true);
      const p = G.player;
      p.pos = [pr[0] + 0.5, pr[1] + 1, pr[2] + 0.5]; p.vel = [0, 0, 0]; p.fallStart = null;
      prepareArea(p.pos[0], p.pos[2], 2);
      liftOutOfBlocks(p);
      Net.teleported();
      G.ui.banner('⛴️', 'Back at ' + (pr[3] || 'the port'));
      Airport.fade(false);
    }, 1200);
    return true;
  },
  // the nearest port from here, on the map
  find() {
    const g = G.world.gen, p = G.player.pos;
    if (!g || !g.structs) { G.ui.toast('No ports in this world'); return; }
    let best = null, bd = Infinity;
    for (let R = 400; R <= 1600 && !best; R += 400) {
      for (const pl of structuresIn(g, p[0] - R, p[2] - R, p[0] + R, p[2] + R)) {
        if (!pl || pl.type !== 'port' || !pl.pier) continue;
        const d = Math.hypot(pl.x - p[0], pl.z - p[2]);
        if (d < bd) { bd = d; best = pl; }
      }
    }
    if (!best) { G.ui.toast('⛴️ No port within 1.6 km'); return; }
    G.markers = G.markers || [];
    if (!G.markers.some((m) => m.x === best.x && m.z === best.z)) G.markers.push({ x: best.x, z: best.z, name: '⛴️ ' + (best.name || 'Port'), color: '#2a6ce0' });
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((Math.atan2(best.x - p[0], -(best.z - p[2])) / (Math.PI / 4) + 8)) % 8];
    G.ui.banner('⛴️', (best.name || 'A port') + ' · ' + Math.round(bd) + ' blocks ' + dir + ' · marked on your map (M)');
  },
};
const board = Vehicles.board;

// ---------------------------------------------------------------- hooks ----
{
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); Fishing.update(dt || 0.016); Ferry.update(dt || 0.016); };
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const held = G.inv.held;
    if (initial && held && held.id === I.FISHING_ROD) { if (Fishing.cast) Fishing.reel(); else Fishing.start(); return true; }
    if (initial && held && held.id === I.FERRY_TICKET && !(this.target && (this.target.mob || this.target.vehicle))) { if (Ferry.back()) { Act.consume(); this.swingHand(); } return true; }
    return use.call(this, initial);
  };
  Vehicles.board = function (v) { if (v && v.ferry) { if (!(Ferry.trip && G.vehicle !== v)) Ferry.open(); return; } return board.call(this, v); };
  const ser = Vehicles.serialize;
  Vehicles.serialize = function () { const keep = this.list; this.list = keep.filter((v) => !v.ferry); try { return ser.call(this); } finally { this.list = keep; } };
  const hit = Vehicles.hit;
  Vehicles.hit = function (v) { if (v && v.ferry) return; return hit.call(this, v); };
  const idle = Ride.prototype.updateIdle;
  Ride.prototype.updateIdle = function (dt) { if (this.ferry) { if (this.basis) this.basis(); return; } return idle.call(this, dt); };
  const pilot = Rides.pilot;
  Rides.pilot = function (v, dt, input, horn) {
    if (!v.ferry) return pilot.call(this, v, dt, input, horn);
    const p = G.player, at = v.toWorld(v.def.seat);
    p.pos = [at[0], at[1] - 0.75, at[2]];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    this.updateMotor(v);
  };
  const dis = Vehicles.dismount;
  Vehicles.dismount = function (forced) { if (!forced && G.vehicle && G.vehicle.ferry && Ferry.trip) { G.ui.toast('⛴️ Stay on board until we arrive'); return; } return dis.call(this, forced); };
  PC.add({ key: 'ferry', icon: '⛴️', name: 'Ferry', closes: true, run() { Ferry.find(); } });
  const run = Commands.run;
  Commands.run = function (text) { if (/^\/(ferry|port)\b/i.test(text)) { Ferry.find(); return; } return run.call(this, text); };
}

// ---------------------------------------------------------------- sprites ----
{
  const fish = (d, body, belly, fin) => {
    sprEllipse(d, 15, 16, 10, 5.5, -0.15, body);
    sprEllipse(d, 15, 18, 8, 2.6, -0.15, belly);
    sprPoly(d, [[24, 14], [30, 9], [30, 22], [24, 18]], fin);
    sprDisc(d, 9, 14.5, 1.2, [20, 20, 24]);
  };
  sprite('i_salmon', (d) => fish(d, [200, 90, 80], [240, 160, 140], [170, 70, 60]));
  sprite('i_cooked_salmon', (d) => fish(d, [210, 120, 70], [240, 180, 120], [180, 100, 60]));
  sprite('i_tropical_fish', (d) => { fish(d, [250, 140, 30], [255, 220, 120], [60, 120, 230]); sprRect(d, 13, 11, 15, 21, [255, 255, 255]); });
  sprite('i_fishing_rod', (d) => {
    sprSeg(d, 5, 28, 26, 5, 1.6, [120, 80, 40]);
    sprSeg(d, 26, 5, 27, 22, 0.5, [230, 230, 230]);
    sprDisc(d, 27, 23, 1.6, [220, 40, 40]);
    sprDisc(d, 9, 24, 2.2, [70, 70, 76]);
  });
  sprite('i_sailboat', (d) => {
    sprPoly(d, [[4, 22], [28, 22], [24, 27], [8, 27]], [150, 96, 50]);
    sprSeg(d, 16, 22, 16, 4, 1, [90, 90, 96]);
    sprPoly(d, [[17, 5], [17, 20], [27, 20]], [246, 244, 236]);
    sprPoly(d, [[15, 7], [15, 20], [7, 20]], [236, 234, 226]);
  });
  sprite('i_ferry_ticket', (d) => {
    sprRect(d, 3, 9, 29, 24, [240, 246, 252]); sprRect(d, 3, 9, 29, 13, [26, 63, 138]);
    sprRect(d, 6, 16, 18, 17, [60, 64, 76]); sprRect(d, 6, 19, 14, 20, [60, 64, 76]);
    sprPoly(d, [[20, 20], [28, 20], [26, 23], [22, 23]], [26, 63, 138]);
  });
}
