'use strict';
// Aeroport STUCOM (district.js builds it east of the ring road). While you are near, Blocklands
// Air airliners land on the runway, taxi to the stand, wait and take off again. At a check-in
// till (or with the airline staff) you buy a flight to any of the world's themed places: you
// board the plane at the stand, it taxis out and takes off with you, and you land at the place
// (it counts as discovered). You also get a return boarding pass: use it (right-click with it
// in your hand) wherever you are to fly back to the terminal.

Object.assign(I, { BOARDING_PASS: 443 });
defItem(I.BOARDING_PASS, 'Boarding Pass · back to STUCOM', { sprite: 'i_boarding_pass', stack: 16, cat: 'transport' });

// ---- the airliner: 22 long, 18 wingspan, white with a red tail and a blue cheat line ----
{
  const RED = [0.82, 0.1, 0.14], BLUE = [0.12, 0.26, 0.62], GREY = [0.62, 0.65, 0.7];
  RIDE_KINDS.airliner = {
    item: I.BOARDING_PASS, name: 'Airliner', type: 'air', max: 60, rev: 0, acc: 0, brake: 0, steer: 0, base: 12, step: 1.2, h: 6, len: 22, w: 18,
    seat: [0.8, 2.6, 6], eye: [0.8, 3.4, 6], cam: 34, sit: true, hide: true, sound: 'heli', paintDefault: 3,
    parts: [
      [-1.6, 1.4, -8, 1.6, 4.6, 8, 'white', { c: [0.96, 0.96, 0.97] }],          // fuselage
      [-1.3, 1.6, 8, 1.3, 4.3, 10, 'white', { c: [0.96, 0.96, 0.97] }],          // nose
      [-0.9, 1.9, 10, 0.9, 3.8, 11, 'white', { c: [0.96, 0.96, 0.97] }],
      [-0.8, 3.3, 9.6, 0.8, 3.9, 10.7, 'glass'],                                   // cockpit windows
      [-1.3, 1.8, -10, 1.3, 4.4, -8, 'white', { c: [0.96, 0.96, 0.97] }],        // tail cone
      [-0.8, 2.6, -11.5, 0.8, 4.3, -10, 'white', { c: [0.96, 0.96, 0.97] }],
      [1.6, 3.3, -7, 1.64, 3.7, 8, 'glass', { m: true }],                          // cabin windows
      [1.6, 2.2, -8, 1.65, 2.5, 9, 'white', { c: BLUE, m: true }],                 // cheat line
      [-1.62, 1.4, -8, 1.62, 1.8, 8, 'white', { c: GREY }],                       // belly
      [1.6, 1.9, -1.5, 9, 2.2, 2.2, 'white', { c: [0.9, 0.9, 0.92], m: true }],   // wings
      [8.6, 2.2, -1.4, 9, 3.4, 0, 'white', { c: RED, m: true }],                  // winglets
      [4, 0.8, 0.4, 5.4, 2.0, 3.6, 'metal', { m: true }],                          // engines
      [4.1, 0.9, 3.5, 5.3, 1.9, 3.7, 'hullDark', { m: true }],
      [-0.12, 4.3, -11.4, 0.12, 9, -7.6, 'white', { c: RED }],                     // fin
      [0.8, 4.2, -11.4, 4.6, 4.45, -9.2, 'white', { c: [0.9, 0.9, 0.92], m: true }], // stabilisers
      [-0.25, 0, 7.6, 0.25, 1.4, 8.1, 'tire'],                                    // nose gear
      [1.2, 0, -1.2, 1.7, 1.4, 0.2, 'tire', { m: true }],                          // main gear
      [8.9, 1.9, 0.4, 9.1, 2.1, 0.8, 'navGreen', { glow: 1.4 }], [-9.1, 1.9, 0.4, -8.9, 2.1, 0.8, 'navRed', { glow: 1.4 }],
      [-0.15, 9, -11.2, 0.15, 9.2, -10.9, 'navWhite', { strobe: true }],
    ],
    hit: [[-1.8, 0, -11.5, 1.8, 5, 11]],
  };
  RIDE_KEYS.push('airliner');
  const d = RIDE_KINDS.airliner;
  d.key = 'airliner';
  const out = [];
  for (const [x0, y0, z0, x1, y1, z1, sw, o = {}] of d.parts) {
    out.push({ box: [x0, y0, z0, x1, y1, z1], sw, o });
    if (o.m) out.push({ box: [-x1, y0, z0, -x0, y1, z1], sw, o: Object.assign({}, o) });
  }
  d.model = out;
}

// keyframes: [t, u, y, v, yaw, pitch, ease into this frame]
const FLIGHT_LAND = [
  [0, 120, 70, 330, Math.PI, 0.06], [20, 120, 0.1, 50, Math.PI, 0.05, 'out'], [28, 120, 0, -8, Math.PI, 0, 'out'],
  [33, 115, 0, -16, -Math.PI / 2, 0], [38, 110, 0, -10, 0, 0], [44, 110, 0, 4, 0, 0, 'out'],
];
const FLIGHT_OUT = [
  [0, 110, 0, 4, 0, 0], [7, 110, 0, 32, 0, 0, 'io'], [11, 115, 0, 44, Math.PI / 2, 0], [15, 120, 0, 48, Math.PI, 0, 'out'], [17, 120, 0, 48, Math.PI, 0],
  [29, 120, 0, -30, Math.PI, 0, 'in'], [32, 120, 4, -58, Math.PI, 0.2], [46, 120, 95, -400, Math.PI, 0.16],
];

const Airport = {
  flights: [], ambientT: 5, mine: null,
  plan() {
    const w = G.world;
    try { const s = w && w.gen && w.gen.structs && typeof stucomVillage === 'function' ? stucomVillage(w.gen) : null; return s && s.airport ? s : null; } catch (e) { return null; }
  },
  inside(x, z) { const pl = this.plan(); if (!pl) return false; const a = pl.airport; return x >= pl.x + a.term[0] && x <= pl.x + a.term[2] && z >= pl.z + a.term[1] && z <= pl.z + a.term[3]; },

  // a plane following keyframes (local to the district)
  fly(frames, then, v) {
    const pl = this.plan();
    if (!pl) return null;
    const f0 = frames[0];
    if (!v) v = Rides.spawn('airliner', pl.x + f0[1], pl.y + f0[2], pl.z + f0[3], f0[4], 3);
    v.scripted = true; v.airliner = true; v.onGround = true;
    const F = { v, frames, t: 0, then, pl };
    this.flights.push(F);
    return F;
  },
  step(F, dt) {
    F.t += dt;
    const fr = F.frames, pl = F.pl;
    let i = 1;
    while (i < fr.length - 1 && fr[i][0] < F.t) i++;
    const a = fr[i - 1], b = fr[i];
    let k = clamp((F.t - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
    const e = b[6];
    if (e === 'in') k = k * k; else if (e === 'out') k = 1 - (1 - k) * (1 - k); else if (e === 'io') k = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
    const L = (p, q) => p + (q - p) * k;
    let dy = b[4] - a[4]; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    const v = F.v, prev = v.pos.slice();
    v.pos = [pl.x + L(a[1], b[1]) + 0.5, pl.y + L(a[2], b[2]), pl.z + L(a[3], b[3]) + 0.5];
    v.yaw = a[4] + dy * k; v.pitch = -L(a[5], b[5]); v.roll = 0;
    v.speed = Math.hypot(v.pos[0] - prev[0], v.pos[2] - prev[2]) / Math.max(dt, 1e-3);
    v.rpm = clamp(0.3 + v.speed / 60, 0, 1);
    if (v.basis) v.basis();
    return F.t >= fr[fr.length - 1][0];
  },

  update(dt) {
    const pl = this.plan();
    for (const F of this.flights.slice()) {
      if (F.v.removed) { this.flights.splice(this.flights.indexOf(F), 1); continue; }
      if (this.step(F, dt)) { this.flights.splice(this.flights.indexOf(F), 1); if (F.then) F.then(F); else if (G.vehicle !== F.v) F.v.removed = true; }
    }
    if (!pl) return;
    // traffic while you are around: a plane lands, waits at the stand and takes off again
    const p = G.player.pos, near = Math.hypot(p[0] - (pl.x + 110), p[2] - pl.z) < 320 && Math.abs(p[1] - pl.y) < 120;
    if (!near) { for (const F of this.flights) if (!F.player && G.vehicle !== F.v) F.v.removed = true; return; }
    this.ambientT -= dt;
    if (this.ambientT <= 0 && !this.flights.length) {
      this.ambientT = 25;
      this.fly(FLIGHT_LAND, (F) => {
        F.v.onGround = true;
        setTimeout(() => { if (!F.v.removed && !this.mine) this.fly(FLIGHT_OUT, (G2) => { G2.v.removed = true; }, F.v); else F.v.removed = true; }, 25000);
      });
    }
    this.updateHud();
  },

  // ---- flights for the player ----
  dests() {
    const g = G.world.gen, pl = this.plan();
    if (!g || !g.regions || !pl) return [];
    return g.regions.map((r) => {
      const d = Math.hypot(r.x - pl.x, r.z - pl.z);
      return { key: r.key, name: r.p.name, icon: r.p.icon, d, price: 40 + Math.round(d / 30), mins: Math.max(1, Math.round(d / 250)) };
    }).sort((a, b) => a.d - b.d);
  },
  open() {
    const pl = this.plan();
    if (!pl) { G.ui.toast('Flights leave from the airport of the STUCOM district'); return; }
    const q = GPanel.open({ title: 'Blocklands Air', sub: 'Departures · Aeroport STUCOM', icon: '✈️', cls: 'gp-shop', width: 640 });
    q.wrap.querySelector('.gp').style.setProperty('--shop', '#d6202b');
    const now = new Date();
    const list = this.dests();
    q.body.innerHTML = `<div class="dep-board">${list.map((d, i) => {
      const h = (now.getHours() + Math.floor((now.getMinutes() + 10 + i * 12) / 60)) % 24, m = (now.getMinutes() + 10 + i * 12) % 60;
      return `<div class="dep-row"><span class="dep-t">${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}</span><span class="dep-f">BA${(101 + i * 7)}</span>
        <span class="dep-d">${d.icon} ${GPanel.esc(d.name)}</span><span class="dep-g">${Math.round(d.d)} blocks · ${d.mins} min</span>
        <button class="gp-btn ok" data-go="${d.key}">🪙 ${d.price}</button></div>`;
    }).join('')}</div><p class="gp-dim" style="margin:10px 0 0">You fly now: board at the stand, sit back. A return boarding pass comes with every ticket.</p>`;
    q.body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const d = list.find((x) => x.key === b.dataset.go);
      if (!d) return;
      if (this.mine) { G.ui.toast('You are already on a flight'); return; }
      if (!Shops.pay(d.price)) { G.ui.toast('🪙 The ticket costs ' + d.price + ' coins'); sfx('gate_no', null, 0.6, 1); return; }
      q.close();
      this.board(d);
    }));
  },
  board(d) {
    const pl = this.plan();
    sfx('shop_till', null, 0.7, 1);
    this.fade(true, () => {
      // your own plane at the stand, with you aboard
      const F = this.fly(FLIGHT_OUT, () => this.arrive(d));
      if (!F) return;
      F.player = true;
      this.mine = { d, F };
      this.step(F, 0);
      Vehicles.board(F.v);
      G.player.yaw = F.v.yaw + Math.PI + 0.7; G.player.pitch = -0.22;
      G.ui.banner('✈️', 'Blocklands Air BA to ' + d.name + ' · fasten your seat belt');
      sfx('metro_chime', null, 0.8, 0.8);
      this.fade(false);
      void pl;
    });
  },
  arrive(d) {
    this.fade(true, () => {
      const v = this.mine && this.mine.F.v;
      this.mine = null;
      if (G.vehicle === v) Vehicles.dismount(true);
      if (v) v.removed = true;
      const pr = G.prog || (G.prog = {});
      pr.found = pr.found || {};
      pr.found[d.key] = true;
      travelTo(d.key);
      G.player.parachute = false;
      const left = G.inv.add(mkStack(I.BOARDING_PASS, 1));
      if (left) Ents.spawnItem(mkStack(I.BOARDING_PASS, 1), G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]);
      G.ui.invDirty();
      G.ui.banner(d.icon, 'Welcome to ' + d.name + '! Your return boarding pass is in your inventory');
      this.fade(false);
    }, 1400);
  },
  flyHome() {
    const pl = this.plan();
    if (!pl) { G.ui.toast('This world has no STUCOM airport'); return false; }
    if (Police.jail) return false;
    this.fade(true, () => {
      if (G.vehicle) Vehicles.dismount(true);
      const p = G.player;
      p.pos = [pl.x + 94.5, pl.y, pl.z + 0.5]; p.vel = [0, 0, 0]; p.fallStart = null; p.yaw = Math.PI / 2;
      prepareArea(p.pos[0], p.pos[2], 2);
      liftOutOfBlocks(p);
      Net.teleported();
      G.ui.banner('✈️', 'Welcome back to Aeroport STUCOM');
      this.fade(false);
    }, 1200);
    return true;
  },
  fade(on, then, ms = 700) {
    let el = $('flightFade');
    if (!el) { el = document.createElement('div'); el.id = 'flightFade'; document.body.append(el); }
    el.classList.toggle('on', on);
    if (then) setTimeout(then, ms);
  },
  updateHud() {
    const m = this.mine;
    let el = $('tripHud');
    if (!m) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'tripHud'; document.body.append(el); }
    const F = m.F, tot = FLIGHT_OUT[FLIGHT_OUT.length - 1][0], alt = Math.max(0, Math.round(F.v.pos[1] - F.pl.y));
    const phase = F.t < 17 ? 'Taxiing' : F.t < 32 ? 'Take-off' : 'Climbing';
    el.innerHTML = `<b>✈️ STUCOM → ${GPanel.esc(m.d.name)}</b><span>${phase} · ${Math.round(F.v.speed * 3.6)} km/h · ${alt} m</span><i style="width:${Math.min(100, F.t / tot * 100)}%"></i>`;
    el.classList.add('show');
  },
};

PIC_BUILTIN.airport_board = { w: 4, h: 2, draw(g, W, H) {
  g.fillStyle = '#0b0f18'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffcc33'; g.font = `800 ${H * 0.11}px Arial`; g.textBaseline = 'middle'; g.fillText('SORTIDES · DEPARTURES', W * 0.04, H * 0.1);
  const rows = [['10:05', 'BA101', 'PARADISE BEACH', 'EMBARCANT'], ['10:20', 'BA108', 'VOLCANO', 'A HORA'], ['10:35', 'BA115', 'SNOWY PEAKS', 'A HORA'], ['10:50', 'BA122', 'RED CANYON', 'A HORA'], ['11:05', 'BA129', 'ARCHIPELAGO', 'A HORA']];
  g.font = `700 ${H * 0.085}px 'Courier New', monospace`;
  rows.forEach((r, i) => {
    const y = H * (0.26 + i * 0.16);
    g.fillStyle = '#ffcc33'; g.fillText(r[0], W * 0.04, y); g.fillText(r[1], W * 0.2, y);
    g.fillStyle = '#e8eef8'; g.fillText(r[2], W * 0.38, y);
    g.fillStyle = r[3] === 'EMBARCANT' ? '#3cf2c0' : '#9fb0c8'; g.fillText(r[3], W * 0.78, y);
  });
} };
PIC_BUILTIN.airport_sign = { w: 6, h: 2, draw(g, W, H) {
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#1d2a44'); grd.addColorStop(1, '#0d1424');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.font = `${H * 0.6}px serif`; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('✈️', H * 0.55, H * 0.5);
  g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = `900 ${H * 0.36}px Arial`; g.fillText('AEROPORT', H * 1.1, H * 0.36);
  g.fillStyle = '#ffcc33'; g.font = `900 ${H * 0.26}px Arial`; g.fillText('STUCOM · BLOCKLANDS AIR', H * 1.12, H * 0.72);
} };
sprite('i_boarding_pass', (d) => {
  sprRect(d, 3, 9, 29, 24, [246, 246, 240]); sprRect(d, 3, 9, 29, 13, [214, 32, 43]);
  sprRect(d, 21, 13, 22, 24, [200, 200, 196]);
  sprRect(d, 6, 16, 17, 17, [60, 64, 76]); sprRect(d, 6, 19, 14, 20, [60, 64, 76]);
  for (let x = 23; x < 28; x += 2) sprRect(d, x, 15, x + 1, 22, [30, 30, 36]);
});

// ---------------------------------------------------------------- hooks ----
{
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); Airport.update(dt || 0.016); };
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target, b = t && t.block;
    if (initial && b && b.id === B.CASH_REGISTER && Airport.inside(b.pos[0], b.pos[2])) { Airport.open(); this.swingHand(); return true; }
    if (initial && t && t.mob && t.mob.prof === 'shopkeeper' && Airport.inside(Math.floor(t.mob.pos[0]), Math.floor(t.mob.pos[2]))) { Airport.open(); this.swingHand(); return true; }
    const held = G.inv.held;
    if (initial && held && held.id === I.BOARDING_PASS && !(t && (t.mob || t.vehicle))) {
      if (Airport.flyHome()) { Act.consume(); this.swingHand(); }
      return true;
    }
    return use.call(this, initial);
  };
  // the airliners are never saved, picked up or driven by hand
  const ser = Vehicles.serialize;
  Vehicles.serialize = function () { const keep = this.list; this.list = keep.filter((v) => !v.airliner); try { return ser.call(this); } finally { this.list = keep; } };
  const hit = Vehicles.hit;
  Vehicles.hit = function (v) { if (v && v.airliner) return; return hit.call(this, v); };
  const board = Vehicles.board;
  Vehicles.board = function (v) { if (v && v.airliner && !(Airport.mine && Airport.mine.F.v === v)) { Airport.open(); return; } return board.call(this, v); };
  const idle = Ride.prototype.updateIdle;
  Ride.prototype.updateIdle = function (dt) { if (this.airliner) { if (this.basis) this.basis(); return; } return idle.call(this, dt); };
  const pilot = Rides.pilot;
  Rides.pilot = function (v, dt, input, horn) {
    if (!v.airliner) return pilot.call(this, v, dt, input, horn);
    const p = G.player, at = v.toWorld(v.def.seat);
    p.pos = [at[0], at[1] - 0.75, at[2]];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    this.updateMotor(v);
  };
  // no getting off mid-flight
  const dis = Vehicles.dismount;
  Vehicles.dismount = function (forced) {
    if (!forced && G.vehicle && G.vehicle.airliner && Airport.mine) { G.ui.toast('✈️ Please stay seated until we land'); return; }
    return dis.call(this, forced);
  };
  // the camera of airliners and ferries: behind where you look, never inside a building
  const rcam = Rides.camera;
  Rides.camera = function (v, dt) {
    if (!v.airliner && !v.ferry) return rcam.call(this, v, dt);
    const p = G.player, aim = p.lookDir(), dist = v.airliner ? 32 : 24;
    const c = v.toWorld([0, v.def.h * 0.6, 0]);
    const pos = [c[0] - aim[0] * dist, c[1] - aim[1] * dist + 3, c[2] - aim[2] * dist];
    for (let k = 0; k < 60 && BLOCK_OPAQUE[G.world.getBlock(Math.floor(pos[0]), Math.floor(pos[1]), Math.floor(pos[2]))]; k++) pos[1] += 1;
    return { pos, yaw: p.yaw, pitch: p.pitch, roll: 0, fov: G.settings.fov + 6 };
  };
  PC.add({ key: 'flights', icon: '✈️', name: 'Flights', run() { Airport.open(); } });
  const run = Commands.run;
  Commands.run = function (text) { if (/^\/(flights?|vols?)\b/i.test(text)) { Airport.open(); return; } return run.call(this, text); };
}
