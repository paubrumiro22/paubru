'use strict';
// Island cruise: the Blocklands Star, a white cruise ship with three decks of cabins, a pool on
// top, lifeboats and a red funnel, lies at anchor off every port (sea.js finds the ports). Buy a
// cruise at the ferry office or with the Cruise app: you are taken aboard, it sails out and
// calls at the islands and the beach, three minutes ashore at each (the horn warns you, the app
// takes you back early or lets you stay), and then home to the port it left from.

const CRUISE_PRICE = 160, CRUISE_ASHORE = 180, CRUISE_SAIL = 22;
const CRUISE_ROUTE = ['islands', 'beach'];

{
  const NAVY = [0.1, 0.16, 0.34], WH = [0.97, 0.97, 0.98], RED = [0.82, 0.12, 0.14], WOOD = [0.64, 0.46, 0.28], ORANGE = [0.98, 0.5, 0.1], POOL = [0.22, 0.68, 0.95];
  const parts = [
    // hull
    [-6.5, -3, -34, 6.5, 1.3, 30, 'white', { c: NAVY }], [-6.52, 1.3, -34, 6.52, 1.6, 30, 'white', { c: RED }], [-6.5, 1.6, -34, 6.5, 5, 30, 'white', { c: WH }],
    [-5.6, -2.6, 30, 5.6, 1.3, 33.5, 'white', { c: NAVY }], [-5.6, 1.3, 30, 5.6, 5.2, 33.5, 'white', { c: WH }],
    [-4.2, -2, 33.5, 4.2, 1.3, 36.5, 'white', { c: NAVY }], [-4.2, 1.3, 33.5, 4.2, 5.4, 36.5, 'white', { c: WH }],
    [-2.4, -1, 36.5, 2.4, 1.3, 39, 'white', { c: NAVY }], [-2.4, 1.3, 36.5, 2.4, 5.6, 39, 'white', { c: WH }],
    [-6, -2.4, -37, 6, 1.3, -34, 'white', { c: NAVY }], [-6, 1.3, -37, 6, 5, -34, 'white', { c: WH }],
    [6.5, 2.4, -32, 6.56, 3.1, 28, 'glass', { m: true }],                                   // portholes band
    // the promenade deck and three decks of cabins
    [-6.4, 5, -33, 6.4, 5.2, 29, 'white', { c: WOOD }],
    [-6, 5.2, -30, 6, 8, 24, 'white', { c: WH }], [6, 6.2, -29, 6.06, 7.3, 23, 'glass', { m: true }],
    [-5.6, 8, -28, 5.6, 10.8, 22, 'white', { c: WH }], [5.6, 8.9, -27, 5.66, 10.1, 21, 'glass', { m: true }], [5.6, 8, -27, 6.2, 8.15, 21, 'metal', { m: true }],
    [-5.2, 10.8, -26, 5.2, 13.6, 20, 'white', { c: WH }], [5.2, 11.7, -25, 5.26, 12.9, 19, 'glass', { m: true }], [5.2, 10.8, -25, 5.8, 10.95, 19, 'metal', { m: true }],
    [-5.2, 13.6, -26, 5.2, 13.8, 20, 'white', { c: WOOD }],
    // lights along the decks (they glow at night)
    [6.06, 7.9, -29, 6.12, 8.0, 23, 'navWhite', { glow: 1.2, m: true }], [5.66, 10.7, -27, 5.72, 10.8, 21, 'navWhite', { glow: 1.2, m: true }], [5.26, 13.5, -25, 5.32, 13.6, 19, 'navWhite', { glow: 1.2, m: true }],
    // the pool, deck chairs, a water slide
    [-2.6, 13.8, -11, 2.6, 14.0, -2, 'white', { c: [0.9, 0.9, 0.92] }], [-2.2, 13.8, -10.6, 2.2, 14.05, -2.4, 'white', { c: POOL }],
    [3.2, 13.8, -9, 4.4, 14.3, -8.3, 'white', { c: WH, m: true }], [3.2, 13.8, -6.5, 4.4, 14.3, -5.8, 'white', { c: WH, m: true }], [3.2, 13.8, -4, 4.4, 14.3, -3.3, 'white', { c: WH, m: true }],
    [-4.4, 13.8, -16, -3.6, 18, -15.2, 'white', { c: [0.98, 0.8, 0.1] }], [-4.4, 17.2, -15.2, -3.6, 18, -11, 'white', { c: RED }], [-4.4, 15.2, -11, -3.6, 16, -8, 'white', { c: [0.2, 0.7, 0.3] }],
    // the bridge
    [-5.8, 13.8, 14, 5.8, 16.4, 19, 'white', { c: WH }], [-5.6, 15, 19, 5.6, 16.1, 19.06, 'glass'], [5.8, 15, 15, 7, 16.2, 18, 'white', { c: WH, m: true }],
    [6.9, 15.4, 16, 7.02, 15.8, 16.4, 'navGreen', { glow: 1.4 }], [-7.02, 15.4, 16, -6.9, 15.8, 16.4, 'navRed', { glow: 1.4 }],
    [-0.1, 16.4, 16, 0.1, 21, 16.3, 'metal'], [-0.15, 21, 16, 0.15, 21.25, 16.3, 'navWhite', { strobe: true }],
    // the funnel
    [-1.9, 13.8, -24, 1.9, 20, -18.5, 'white', { c: RED }], [-1.95, 20, -24.05, 1.95, 21, -18.45, 'hullDark'], [-1.96, 17.5, -24.06, 1.96, 18, -18.44, 'white', { c: WH }],
  ];
  for (const z of [-21, -13, -5, 3, 11]) parts.push([6.1, 6.4, z, 6.9, 7.5, z + 5, 'white', { c: ORANGE, m: true }], [6.0, 7.5, z + 0.4, 6.2, 7.8, z + 4.6, 'metal', { m: true }]);
  RIDE_KINDS.cruise = {
    item: I.FERRY_TICKET, name: 'Cruise ship', type: 'water', max: 10, rev: 0, acc: 0, brake: 0, steer: 0, base: 8, step: 0.3, h: 21, len: 76, w: 14,
    seat: [3.4, 13.95, 3], eye: [3.4, 15.5, 3], cam: 70, sit: true, sound: 'boat', paintDefault: 3,
    parts, hit: [[-6.5, -3, -37, 6.5, 14, 39]],
  };
  RIDE_KEYS.push('cruise');
  const d = RIDE_KINDS.cruise;
  d.key = 'cruise';
  const out = [];
  for (const [x0, y0, z0, x1, y1, z1, sw, o = {}] of d.parts) {
    out.push({ box: [x0, y0, z0, x1, y1, z1], sw, o });
    if (o.m) out.push({ box: [-x1, y0, z0, -x0, y1, z1], sw, o: Object.assign({}, o) });
  }
  d.model = out;
}

const Cruise = {
  v: null, port: null, trip: null, hornT: 40,
  anchorOf(port) {
    const D = Ferry.dock(port);
    return { x: D.x + D.out[0] * 85, z: D.z + D.out[1] * 85, yaw: D.yaw };
  },
  ship(x, z, yaw) {
    if (this.v && !this.v.removed) this.v.removed = true;
    const v = this.v = Rides.spawn('cruise', x, SEA + 0.1, z, yaw, 3);
    v.scripted = true; v.cruise = true; v.onGround = true;
    v.anchor = [x, z];
    return v;
  },
  bob(v) {
    v.pos[1] = SEA + 0.1 + Math.sin(G.time * 0.5) * 0.08;
    v.roll = Math.sin(G.time * 0.37) * 0.012; v.pitch = Math.sin(G.time * 0.29) * 0.006;
    if (v.basis) v.basis();
  },
  // deep water near (x, z), the ship's bow pointing away from the shore
  findSea(x, z) {
    const g = G.world.gen;
    for (let r = 50; r <= 260; r += 15) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
      let ok = true;
      for (const [dx, dz] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [20, 20], [-20, -20]]) if (g.height(Math.floor(sx + dx), Math.floor(sz + dz)) > SEA - 4) { ok = false; break; }
      if (ok) return { x: sx, z: sz, yaw: Math.atan2(sx - x, sz - z) };
    }
    return null;
  },

  update(dt) {
    if (this.trip) { this.run(dt); return; }
    const port = Ferry.port;
    if (port !== this.port) { if (this.v) this.v.removed = true; this.v = null; this.port = port; }
    if (!port) return;
    const A = this.anchorOf(port);
    if (!this.v || this.v.removed) this.ship(A.x, A.z, A.yaw);
    this.bob(this.v);
    this.hornT -= dt;
    if (this.hornT <= 0) { this.hornT = 90 + Math.random() * 60; sfx('horn', this.v.pos, 1.2, 0.35); }
  },

  // ---- the cruise ----
  route(port) {
    const g = G.world.gen;
    return CRUISE_ROUTE.map((k) => g.regions && g.regions.find((r) => r.key === k)).filter(Boolean).map((r) => ({ key: r.key, name: r.p.name, icon: r.p.icon, x: r.x, z: r.z }))
      .sort((a, b) => Math.hypot(a.x - port.x, a.z - port.z) - Math.hypot(b.x - port.x, b.z - port.z));
  },
  book() {
    const port = this.port || Ferry.port;
    if (!port) { Ferry.find(); return; }
    const stops = this.route(port);
    if (!stops.length) { G.ui.toast('No islands to sail to in this world'); return; }
    if (this.trip || Ave.trip || Airport.mine) { G.ui.toast('You are already travelling'); return; }
    if (!Shops.pay(CRUISE_PRICE)) { G.ui.toast('🪙 The cruise costs ' + CRUISE_PRICE + ' coins'); sfx('gate_no', null, 0.6, 1); return; }
    sfx('shop_till', null, 0.7, 1);
    this.trip = { port: { x: port.x, y: port.y, z: port.z, name: port.name, pier: port.pier }, stops, i: 0, phase: 'sail', t: 0, speed: 0 };
    Airport.fade(true, () => {
      if (G.vehicle) Vehicles.dismount(true);
      if (!this.v || this.v.removed) { const A = this.anchorOf(port); this.ship(A.x, A.z, A.yaw); }
      this.aboard();
      G.ui.banner('🛳️', 'Welcome aboard the Blocklands Star! Next stop: ' + stops[0].name);
      sfx('horn', this.v.pos, 1.3, 0.35);
      Airport.fade(false);
    }, 900);
  },
  aboard() {
    const v = this.v, p = G.player, at = v.toWorld(v.def.seat);
    p.pos = [at[0], at[1] - 0.75, at[2]]; p.vel = [0, 0, 0]; p.fallStart = null;
    boardCruise.call(Vehicles, v);
    p.yaw = v.yaw + Math.PI * 0.75; p.pitch = -0.15;
    Net.teleported();
  },
  run(dt) {
    const T = this.trip, v = this.v;
    T.t += dt;
    if (T.phase === 'sail') {
      if (!v || v.removed) { this.trip = null; return; }
      T.speed = Math.min(9, T.speed + dt * 0.7);
      const f = [Math.sin(v.yaw), Math.cos(v.yaw)];
      v.pos[0] += f[0] * T.speed * dt; v.pos[2] += f[1] * T.speed * dt;
      v.speed = T.speed; v.rpm = 0.3 + T.speed / 12;
      this.bob(v);
      if (Math.random() < dt * 3) Particles.poof && Particles.poof(v.pos[0] + f[0] * 36, SEA + 0.5, v.pos[2] + f[1] * 36, 1.5, 1);
      if (T.t > CRUISE_SAIL && !T.busy) { T.busy = true; T.i >= T.stops.length ? this.goHome() : this.call(T.stops[T.i]); }
    } else if (T.phase === 'ashore') {
      if (v && !v.removed) this.bob(v);
      const left = CRUISE_ASHORE - T.t;
      if (left < 30 && !T.warned) { T.warned = true; sfx('horn', v ? v.pos : null, 1.4, 0.35); G.ui.toast('🛳️ All aboard in 30 seconds!', 3500); }
      if (left <= 0 && !T.busy) this.reboard();
    }
  },
  // arriving at a stop: you go ashore, the ship waits offshore
  call(stop) {
    const T = this.trip;
    Airport.fade(true, () => {
      if (G.vehicle) Vehicles.dismount(true);
      const pr = G.prog || (G.prog = {});
      pr.found = pr.found || {}; pr.found[stop.key] = true;
      travelTo(stop.key);
      const p = G.player.pos, sea = this.findSea(p[0], p[2]);
      if (sea) this.ship(sea.x, sea.z, sea.yaw); else if (this.v) { this.v.removed = true; this.v = null; }
      T.phase = 'ashore'; T.t = 0; T.busy = false; T.warned = false;
      G.ui.banner(stop.icon, 'Stop ' + (T.i + 1) + ' of ' + T.stops.length + ': ' + stop.name + ' · three minutes ashore · 📱 Cruise app to go back early');
      Airport.fade(false);
    }, 1200);
  },
  reboard() {
    const T = this.trip;
    if (!T || T.phase !== 'ashore') return;
    T.busy = true;
    Airport.fade(true, () => {
      if (G.vehicle) Vehicles.dismount(true);
      if (!this.v || this.v.removed) { const p = G.player.pos, sea = this.findSea(p[0], p[2]) || { x: p[0] + 120, z: p[2], yaw: Math.PI / 2 }; this.ship(sea.x, sea.z, sea.yaw); }
      T.i++; T.phase = 'sail'; T.t = 0; T.speed = 0; T.busy = false;
      this.aboard();
      const next = T.stops[T.i];
      G.ui.banner('🛳️', next ? 'Next stop: ' + next.name : 'Heading home to ' + (T.port.name || 'the port'));
      sfx('horn', this.v.pos, 1.3, 0.35);
      Airport.fade(false);
    }, 900);
  },
  goHome() {
    const T = this.trip;
    Airport.fade(true, () => {
      if (G.vehicle) Vehicles.dismount(true);
      this.trip = null;
      this.land(T.port);
      G.ui.banner('🛳️', 'Back at ' + (T.port.name || 'the port') + ' · thank you for sailing with the Blocklands Star');
      Airport.fade(false);
    }, 1200);
  },
  land(port) {
    const p = G.player, q = port.pier;
    const x = q ? q.x + q.sx * Math.max(2, q.len - 3) : port.x, z = q ? q.z + q.sz * Math.max(2, q.len - 3) : port.z;
    p.pos = [x + 0.5, port.y + 1, z + 0.5]; p.vel = [0, 0, 0]; p.fallStart = null;
    prepareArea(p.pos[0], p.pos[2], 2);
    liftOutOfBlocks(p);
    Net.teleported();
    if (this.v) { this.v.removed = true; this.v = null; }
    this.port = null;
  },
  stay() {
    const T = this.trip;
    if (!T) return;
    this.trip = null;
    const pr = G.prog || (G.prog = {});
    pr.ferryPort = [T.port.x, T.port.y, T.port.z, T.port.name];
    const left = G.inv.add(mkStack(I.FERRY_TICKET, 1));
    if (left) Ents.spawnItem(mkStack(I.FERRY_TICKET, 1), G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]);
    G.ui.invDirty();
    if (this.v) { sfx('horn', this.v.pos, 1.2, 0.35); this.v.removed = true; this.v = null; }
    G.ui.banner('🛳️', 'You stay here · a ferry ticket takes you back to ' + (T.port.name || 'the port'));
  },

  // the app: book, or (ashore) go back early / stay
  open() {
    const T = this.trip, e = GPanel.esc;
    if (!T && !Ferry.port) { Ferry.find(); return; }
    const q = GPanel.open({ title: 'Blocklands Star', sub: T ? 'Island cruise · stop ' + Math.min(T.i + 1, T.stops.length) + ' of ' + T.stops.length : 'Island cruise from ' + (Ferry.port.name || 'the port'), icon: '🛳️', cls: 'gp-cruise', width: 520 });
    if (T && T.phase === 'ashore') {
      const left = Math.max(0, Math.ceil(CRUISE_ASHORE - T.t));
      q.body.innerHTML = `<div class="cr-card"><div class="cr-big">⏱️ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div><p>The ship sails ${T.i + 1 < T.stops.length ? 'on to <b>' + e(T.stops[T.i + 1].name) + '</b>' : 'home to <b>' + e(T.port.name || 'the port') + '</b>'} when the time is up.</p>
        <div class="fl-act" style="justify-content:center"><button class="gp-btn ok" data-a="back">🛳️ Back on board now</button><button class="gp-btn" data-a="stay">🏖️ Stay here</button></div></div>`;
      q.body.querySelector('[data-a="back"]').addEventListener('click', () => { q.close(); this.reboard(); });
      q.body.querySelector('[data-a="stay"]').addEventListener('click', () => { q.close(); this.stay(); });
      return;
    }
    if (T) { q.body.innerHTML = '<div class="cr-card"><p>We are at sea. Enjoy the view from the pool deck!</p></div>'; return; }
    this.card(q.body);
  },
  card(host) {
    const port = this.port || Ferry.port, stops = port ? this.route(port) : [], e = GPanel.esc;
    const el = document.createElement('div');
    el.className = 'cr-offer';
    el.innerHTML = `<div class="cr-ship">🛳️</div><div class="cr-txt"><b>Island cruise · Blocklands Star</b><span>${stops.map((s) => s.icon + ' ' + e(s.name)).join(' → ')} → ⚓ back here · ${Math.round(CRUISE_ASHORE / 60)} min ashore at each stop · pool deck</span></div>
      <button class="gp-btn ok" ${stops.length ? '' : 'disabled'}>🪙 ${CRUISE_PRICE}</button>`;
    el.querySelector('button').addEventListener('click', () => { const top = GPanel.top(); if (top) top.close(); this.book(); });
    host.append(el);
  },
  updateHud() {
    const T = this.trip;
    let el = $('cruiseHud');
    if (!T) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'cruiseHud'; document.body.append(el); }
    const next = T.stops[T.i];
    let line;
    if (T.phase === 'ashore') { const left = Math.max(0, Math.ceil(CRUISE_ASHORE - T.t)); line = `Ashore at ${GPanel.esc(next.name)} · all aboard in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · 📱 Cruise`; }
    else line = (next ? 'Sailing to ' + GPanel.esc(next.name) : 'Sailing home') + ' · ' + Math.round(T.speed * 1.94 * 1.6) + ' knots';
    el.innerHTML = `<b>🛳️ Blocklands Star</b><span>${line}</span><div class="cr-dots">${T.stops.map((s, i) => `<i class="${i < T.i ? 'done' : i === T.i ? 'now' : ''}">${s.icon}</i>`).join('<u></u>')}<u></u><i class="${T.i >= T.stops.length ? 'now' : ''}">⚓</i></div>`;
    el.classList.add('show');
  },
};

const boardCruise = Vehicles.board;
{
  Vehicles.board = function (v) {
    if (v && v.cruise) { if (Cruise.trip && G.vehicle !== v) return boardCruise.call(this, v); if (!Cruise.trip) Cruise.open(); return; }
    return boardCruise.call(this, v);
  };
  const ser = Vehicles.serialize;
  Vehicles.serialize = function () { const keep = this.list; this.list = keep.filter((v) => !v.cruise); try { return ser.call(this); } finally { this.list = keep; } };
  const hit = Vehicles.hit;
  if (hit) Vehicles.hit = function (v) { if (v && v.cruise) return; return hit.call(this, v); };
  const pk = Vehicles.pickUp;
  Vehicles.pickUp = function (v) { if (v && v.cruise) return; return pk.call(this, v); };
  const idle = Ride.prototype.updateIdle;
  Ride.prototype.updateIdle = function (dt) { if (this.cruise) { if (this.basis) this.basis(); return; } return idle.call(this, dt); };
  const pilot = Rides.pilot;
  Rides.pilot = function (v, dt, input, horn) {
    if (!v.cruise) return pilot.call(this, v, dt, input, horn);
    const p = G.player, at = v.toWorld(v.def.seat);
    p.pos = [at[0], at[1] - 0.75, at[2]];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    this.updateMotor(v);
  };
  const dis = Vehicles.dismount;
  Vehicles.dismount = function (forced) { if (!forced && G.vehicle && G.vehicle.cruise && Cruise.trip) { G.ui.toast('🛳️ We are at sea: enjoy the trip'); return; } return dis.call(this, forced); };
  // the ferry office sells cruises too
  const fo = Ferry.open;
  Ferry.open = function () {
    fo.call(this);
    const q = GPanel.top();
    if (q && Ferry.port && q.wrap.querySelector('.gp-t').textContent.startsWith('Ferry')) Cruise.card(q.body);
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); try { Cruise.update(dt || 0.016); Cruise.updateHud(); } catch (e) { console.warn('Blocklands: cruise', e); } };
  PC.add({ key: 'cruise', icon: '🛳️', name: ED('Creuer', 'Cruise'), run() { Cruise.open(); } });
}
