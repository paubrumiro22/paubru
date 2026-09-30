'use strict';
// The high-speed trains on the line ave_gen.js builds. While you are near the station a train
// comes in from the west every couple of minutes, waits at the platform and leaves again, and
// one is always waiting at the south track for you: right-click it, a ticket machine in the hall
// or the AVE app. Pick a destination (the themed places on land): the doors close, it pulls out,
// crosses the viaduct at full speed and you arrive. The ticket brings you back: right-click with
// it anywhere and you ride into the station on the evening train.

Object.assign(I, { AVE_TICKET: 452 });
defItem(I.AVE_TICKET, 'AVE Ticket · back to ' + CITY, { sprite: 'i_ave_ticket', stack: 16, cat: 'transport' });
sprite('i_ave_ticket', (d) => {
  sprRect(d, 3, 9, 29, 23, [248, 248, 250]);
  sprRect(d, 3, 9, 29, 12, [120, 40, 150]);
  sprRect(d, 3, 20, 29, 23, [214, 32, 43]);
  sprRect(d, 6, 14, 15, 15, [60, 60, 70]); sprRect(d, 6, 17, 12, 18, [60, 60, 70]);
  sprRect(d, 20, 13, 26, 19, [30, 30, 40]);
});

// ---- the train: two power cars with long noses and two coaches, white with purple and red ----
{
  const WH = [0.97, 0.97, 0.98], PUR = [0.45, 0.14, 0.58], RED = [0.84, 0.12, 0.16], GRY = [0.55, 0.58, 0.63];
  const parts = [], CAR = 12, GAP = 0.4, N = 4, half = (N * CAR + (N - 1) * GAP) / 2;
  for (let c = 0; c < N; c++) {
    const z0 = -half + c * (CAR + GAP), z1 = z0 + CAR;
    parts.push(
      [-1.35, 0.55, z0, 1.35, 3.05, z1, 'white', { c: WH }],
      [-1.36, 1.2, z0, 1.36, 1.42, z1, 'white', { c: PUR }],
      [-1.365, 1.42, z0, 1.365, 1.52, z1, 'white', { c: RED }],
      [-1.37, 1.95, z0 + 0.6, 1.37, 2.55, z1 - 0.6, 'glass'],
      [-1.2, 0.2, z0 + 0.8, 1.2, 0.55, z0 + 3, 'hullDark'], [-1.2, 0.2, z1 - 3, 1.2, 0.55, z1 - 0.8, 'hullDark'],
      [-1.1, 3.05, z0 + 0.3, 1.1, 3.3, z1 - 0.3, 'metal'],
    );
    for (const dz of [-3.5, 3.5]) parts.push([1.37, 0.7, (z0 + z1) / 2 + dz - 0.55, 1.39, 2.6, (z0 + z1) / 2 + dz + 0.55, 'white', { c: GRY, m: true }]);
    if (c < N - 1) parts.push([-1.0, 0.6, z1, 1.0, 2.9, z1 + GAP, 'hullDark']);
  }
  // the noses, both ends
  for (const s of [1, -1]) {
    const e = half * s, Z = (a, b) => (s > 0 ? [e + a, e + b] : [e - b, e - a]);
    const box = (x, y0, y1, a, b, sw, o) => { const [p, q] = Z(a, b); parts.push([-x, y0, p, x, y1, q, sw, o]); };
    box(1.3, 0.55, 2.7, 0, 1.4, 'white', { c: WH });
    box(1.15, 0.55, 2.25, 1.4, 2.8, 'white', { c: WH });
    box(0.95, 0.55, 1.75, 2.8, 4.0, 'white', { c: WH });
    box(0.65, 0.55, 1.25, 4.0, 4.9, 'white', { c: WH });
    box(1.31, 1.2, 1.42, 0, 2.8, 'white', { c: PUR });
    box(1.16, 2.25, 2.72, 0.2, 1.5, 'glass');
    box(0.97, 1.75, 2.26, 1.45, 2.7, 'glass');
    box(0.66, 0.9, 1.1, 4.85, 4.95, 'white', { c: RED });
    const [p, q] = Z(3.2, 3.5);
    parts.push([0.6, 0.9, p, 0.9, 1.15, q, s > 0 ? 'navWhite' : 'navRed', { m: true, glow: 2 }]);
    // pantograph
    const [a, b] = Z(-5, -2);
    parts.push([-0.5, 3.3, a, 0.5, 3.4, b, 'metal'], [-0.05, 3.4, a + 0.5, 0.05, 4.2, b - 0.5, 'metal']);
  }
  RIDE_KINDS.ave = {
    item: I.AVE_TICKET, name: 'AVE', type: 'rail', max: 90, rev: 0, acc: 0, brake: 0, steer: 0, base: 8, step: 1.05, h: 4.2, len: 2 * half + 10, w: 2.8,
    seat: [0.65, 0.9, half - 16], eye: [0.65, 2.3, half - 16], cam: 34, sit: true, hide: true, sound: 'bus', paintDefault: 0,
    parts, hit: [[-1.4, 0, -half - 5, 1.4, 3.3, half + 5]],
  };
  RIDE_KEYS.push('ave');
  const d = RIDE_KINDS.ave;
  d.key = 'ave';
  const out = [];
  for (const [x0, y0, z0, x1, y1, z1, sw, o = {}] of d.parts) {
    out.push({ box: [x0, y0, z0, x1, y1, z1], sw, o });
    if (o.m) out.push({ box: [-x1, y0, z0, -x0, y1, z1], sw, o: Object.assign({}, o) });
  }
  d.model = out;
}

const AVE_ACC = 2.4, AVE_TOP = 62;      // blocks/s² and blocks/s (shown ×1.4 on the speedometer)
const Ave = {
  trains: [], ambientT: 20, trip: null, hint: false,
  line() { return G.world && G.world.gen ? aveLine(G.world.gen) : null; },
  near(L, r = 260) { const p = G.player.pos; return p[0] > L.xs - 420 && p[0] < L.xe + r && Math.abs(p[2] - L.z) < r && Math.abs(p[1] - L.y) < 120; },
  inStation(L, x, z) { return x >= L.xs - 4 && x <= L.xe + 4 && Math.abs(z - L.z) <= 18; },
  track(L, s) { return L.z + 5.5 * s; },

  // a train on a track (s = +1 south, -1 north); x(t) given by `move`
  spawn(L, s, x, faceWest) {
    const v = Rides.spawn('ave', x, L.y + 1.12, this.track(L, s), faceWest ? -Math.PI / 2 : Math.PI / 2, 0);
    v.scripted = true; v.ave = true; v.onGround = true;
    const T = { v, s, x, state: 'wait', t: 0, speed: 0 };
    this.trains.push(T);
    return T;
  },
  place(L, T) {
    const v = T.v;
    v.pos = [T.x, L.y + 1.12, this.track(L, T.s)];
    v.yaw = T.west ? -Math.PI / 2 : Math.PI / 2; v.pitch = 0; v.roll = 0;
    v.speed = T.speed; v.rpm = clamp(0.2 + T.speed / AVE_TOP, 0, 1);
    if (v.basis) v.basis();
  },
  drop(T) { if (G.vehicle !== T.v) T.v.removed = true; this.trains.splice(this.trains.indexOf(T), 1); },

  update(dt) {
    const L = this.line();
    for (const T of this.trains.slice()) if (T.v.removed) this.trains.splice(this.trains.indexOf(T), 1);
    if (!L) return;
    const near = this.near(L);
    if (!near && !this.trip) { for (const T of this.trains.slice()) this.drop(T); return; }
    // the one waiting for you at the south platform
    if (near && !this.trains.some((T) => T.boarding) && !this.trip) {
      const T = this.spawn(L, 1, L.stop, true);
      T.boarding = true; T.west = true;
    }
    // now and then one comes in on the north track, waits and goes
    this.ambientT -= dt;
    if (near && this.ambientT <= 0 && !this.trains.some((T) => T.ambient)) {
      this.ambientT = 110 + Math.random() * 60;
      const T = this.spawn(L, -1, L.stop - 600, false);
      T.ambient = true; T.state = 'in'; T.west = false; T.t = 0;
    }
    for (const T of this.trains.slice()) this.run(L, T, dt);
    // the first time you walk into the hall
    const p = G.player.pos;
    if (!this.hint && this.inStation(L, p[0], p[2]) && Math.abs(p[1] - L.F) < 12) { this.hint = true; G.ui.banner('🚄', 'AVE ' + CITY + ' · tickets at the machines, or right-click the train on the platform'); }
  },
  // arriving: brakes all the way in; leaving: speeds up to the top and away
  run(L, T, dt) {
    T.t += dt;
    if (T.state === 'in') {
      const D = 600, dur = Math.sqrt(2 * D / 1.1);
      const k = Math.max(0, dur - T.t);
      T.x = L.stop - 0.5 * 1.1 * k * k; T.speed = 1.1 * k;
      if (T.t >= dur) { T.state = 'wait'; T.t = 0; T.speed = 0; if (T.player) this.arrived(L, T); else sfx('ave_ding', [L.stop, L.y + 2, L.z], 0.6, 1); }
    } else if (T.state === 'wait') {
      T.x = L.stop; T.speed = 0;
      if (T.ambient && T.t > 30) { T.state = 'out'; T.t = 0; T.west = true; sfx('ave_ding', [L.stop, L.y + 2, L.z], 0.6, 1); }
    } else if (T.state === 'out') {
      const t = Math.max(0, T.t - 2), tTop = AVE_TOP / AVE_ACC;
      const dist = t < tTop ? 0.5 * AVE_ACC * t * t : 0.5 * AVE_ACC * tTop * tTop + AVE_TOP * (t - tTop);
      T.x = L.stop - dist; T.speed = t < tTop ? AVE_ACC * t : AVE_TOP;
      if (T.player && T.t > 19 && !T.gone) { T.gone = true; this.away(T); }
      if (!T.player && T.x < L.xw - 10) this.drop(T);
    }
    this.place(L, T);
    if (T.speed > 20 && G.vehicle !== T.v && Math.random() < dt * 2) sfx('ave_whoosh', T.v.pos, 0.5, 0.9 + Math.random() * 0.2);
  },

  dests() {
    return Airport.dests().filter((d) => d.key !== 'islands').map((d) => ({ ...d, price: 30 + Math.round(d.d / 45), mins: Math.max(1, Math.round(d.d / 900)) }));
  },
  open() {
    const L = this.line();
    if (!L) { G.ui.toast('This world has no AVE line'); return; }
    const p = G.player.pos;
    if (!this.inStation(L, p[0], p[2])) { this.find(); return; }
    const q = GPanel.open({ title: 'AVE · ' + CITY, sub: 'High-speed departures · platform 2', icon: '🚄', cls: 'gp-shop gp-ave', width: 660 });
    q.wrap.querySelector('.gp').style.setProperty('--shop', '#6a1f86');
    const now = new Date(), list = this.dests();
    q.body.innerHTML = `<div class="dep-board ave-board">${list.map((d, i) => {
      const m = now.getMinutes() + 3 + i * 9, h = (now.getHours() + Math.floor(m / 60)) % 24;
      return `<div class="dep-row"><span class="dep-t">${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}</span><span class="dep-f">AVE ${3101 + i * 12}</span>
        <span class="dep-d">${d.icon} ${GPanel.esc(d.name)}</span><span class="dep-g">${Math.round(d.d)} blocks · ${d.mins} min · via 2</span>
        <button class="gp-btn ok" data-go="${d.key}">🪙 ${d.price}</button></div>`;
    }).join('') || '<div class="gp-empty">No destinations in this world</div>'}</div>
      <p class="gp-dim" style="margin:10px 0 0">The train leaves as soon as you are seated: 300 km/h over the viaduct. A return ticket comes with every journey.</p>`;
    q.body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const d = list.find((x) => x.key === b.dataset.go);
      if (!d || this.trip) return;
      if (!Shops.pay(d.price)) { G.ui.toast('🪙 The ticket costs ' + d.price + ' coins'); sfx('gate_no', null, 0.6, 1); return; }
      q.close();
      this.board(L, d);
    }));
  },
  // the station on the map, from anywhere
  find() {
    const L = this.line();
    if (!L) { G.ui.toast('This world has no AVE line'); return; }
    const x = (L.xs + L.xe) / 2, z = L.z + 12, p = G.player.pos;
    G.markers = G.markers || [];
    if (!G.markers.some((m) => m.x === Math.round(x) && m.z === z)) G.markers.push({ x: Math.round(x), z, name: '🚄 AVE station', color: '#8a3fb0' });
    const d = Math.hypot(x - p[0], z - p[2]), dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((Math.atan2(x - p[0], -(z - p[2])) / (Math.PI / 4) + 8)) % 8];
    G.ui.banner('🚄', 'AVE station · ' + Math.round(d) + ' blocks ' + dir + ' · marked on your map (M) · follow the lit path west of the district');
  },

  board(L, d) {
    const T = this.trains.find((q) => q.boarding) || this.spawn(L, 1, L.stop, true);
    T.boarding = false; T.player = true; T.west = true; T.state = 'wait'; T.t = 0;
    this.trip = { d, T };
    sfx('shop_till', null, 0.7, 1);
    Airport.fade(true, () => {
      boardAve.call(Vehicles, T.v);
      G.player.yaw = -Math.PI; G.player.pitch = -0.1;
      G.ui.banner('🚄', 'AVE to ' + d.name + ' · doors closing');
      sfx('ave_ding', null, 0.8, 1);
      setTimeout(() => { if (this.trip && this.trip.T === T) { T.state = 'out'; T.t = 0; } }, 2500);
      Airport.fade(false);
    }, 700);
  },
  away(T) {
    const d = this.trip && this.trip.d;
    if (!d) return;
    Airport.fade(true, () => {
      this.trip = null;
      if (G.vehicle === T.v) Vehicles.dismount(true);
      this.drop(T);
      const pr = G.prog || (G.prog = {});
      pr.found = pr.found || {}; pr.found[d.key] = true;
      travelTo(d.key);
      const left = G.inv.add(mkStack(I.AVE_TICKET, 1));
      if (left) Ents.spawnItem(mkStack(I.AVE_TICKET, 1), G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]);
      G.ui.invDirty();
      G.ui.banner(d.icon, 'Welcome to ' + d.name + '! Your AVE ticket takes you back to ' + CITY);
      Airport.fade(false);
    }, 1200);
  },
  // the way back: you are aboard as it brakes into the station
  home() {
    const L = this.line();
    if (!L) { G.ui.toast('This world has no AVE line'); return false; }
    if (this.trip || Airport.mine || Police.jail) return false;
    Airport.fade(true, () => {
      if (G.vehicle) Vehicles.dismount(true);
      for (const T of this.trains.slice()) if (T.s === -1) this.drop(T);
      const T = this.spawn(L, -1, L.stop - 600, false);
      T.state = 'in'; T.t = Math.sqrt(2 * 600 / 1.1) - 14; T.player = true; T.west = false;
      this.trip = { d: { name: CITY, icon: '🏙️' }, T, home: true };
      this.run(L, T, 0);
      const p = G.player;
      p.pos = T.v.pos.slice(); p.vel = [0, 0, 0]; p.fallStart = null;
      prepareArea(L.stop, L.z, 3);
      boardAve.call(Vehicles, T.v);
      p.yaw = 0; p.pitch = -0.1;
      Net.teleported();
      G.ui.banner('🚄', 'AVE to ' + CITY + ' · arriving in a few seconds');
      Airport.fade(false);
    }, 1200);
    return true;
  },
  arrived(L, T) {
    Airport.fade(true, () => {
      this.trip = null;
      if (G.vehicle === T.v) Vehicles.dismount(true);
      const p = G.player;
      p.pos = [L.stop + 0.5, L.y + 2, L.z + 0.5]; p.vel = [0, 0, 0]; p.fallStart = null; p.yaw = Math.PI / 2;
      Net.teleported();
      T.ambient = true; T.player = false; T.t = 0;
      G.ui.banner('🚄', 'Welcome to ' + CITY + ' · the stairs and the lift go down to the hall');
      Airport.fade(false);
    }, 900);
  },
  updateHud() {
    const m = this.trip;
    let el = $('aveHud');
    if (!m) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'aveHud'; document.body.append(el); }
    const T = m.T, kmh = Math.round(T.speed * 3.6 * 1.4);
    const phase = m.home ? (T.state === 'in' ? 'Arriving · platform 1' : 'At the platform') : T.state === 'wait' ? 'Doors closing' : kmh < 200 ? 'Leaving ' + CITY : 'Cruising over the viaduct';
    el.innerHTML = `<b>🚄 AVE · ${m.home ? '→ ' + CITY : CITY + ' → ' + GPanel.esc(m.d.name)}</b><span>${phase}</span><em>${kmh}<small> km/h</small></em><i style="width:${Math.min(100, kmh / 3.1)}%"></i>`;
    el.classList.add('show');
  },
};

PIC_BUILTIN.ave_sign = { w: 8, h: 2, draw(g, W, H) {
  const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, '#5b1a78'); grd.addColorStop(1, '#8a2fb0');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d6202b'; g.fillRect(0, H * 0.84, W, H * 0.16);
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.font = `italic 900 ${H * 0.5}px Arial`; g.fillText('AVE', H * 0.3, H * 0.44);
  g.font = `800 ${H * 0.22}px Arial`; g.fillText(ED('ESTACIÓ ', 'STATION · ') + CITY.toUpperCase(), H * 1.55, H * 0.32);
  g.fillStyle = '#e9d6f5'; g.font = `600 ${H * 0.16}px Arial`; g.fillText(ED('Alta velocitat · 300 km/h · Andanes 1 i 2', 'High speed · 300 km/h · Platforms 1 and 2'), H * 1.56, H * 0.6);
} };
PIC_BUILTIN.ave_board = { w: 4, h: 2, draw(g, W, H) {
  g.fillStyle = '#0b0f18'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#b36bff'; g.font = `800 ${H * 0.1}px Arial`; g.textBaseline = 'middle'; g.fillText(ED('SORTIDES AVE', 'AVE DEPARTURES'), W * 0.04, H * 0.1);
  const rows = [['10:12', '3101', 'peaks', '2'], ['10:21', '3113', 'volcano', '2'], ['10:30', '3125', 'canyon', '2'], ['10:39', '3137', 'forest', '2'], ['10:48', '3149', 'oasis', '2']].map((r) => [r[0], r[1], REGION_TOWNS[r[2]].name.toUpperCase(), r[3]]);
  g.font = `700 ${H * 0.085}px 'Courier New', monospace`;
  rows.forEach((r, i) => {
    const y = H * (0.27 + i * 0.16);
    g.fillStyle = '#ffcc33'; g.fillText(r[0], W * 0.04, y); g.fillText(r[1], W * 0.2, y);
    g.fillStyle = '#e8eef8'; g.fillText(r[2], W * 0.36, y);
    g.fillStyle = '#3cf2c0'; g.fillText(ED('VIA ', 'PL ') + r[3], W * 0.82, y);
  });
} };

SYNTH.ave_ding = (ctx, o, t) => {
  for (const [dt, f] of [[0, 784], [0.28, 988], [0.56, 1175]]) Sound.tone(ctx, o, t + dt, 0.8, { wave: 'sine', f0: f, gain: 0.07 });
};
SYNTH.ave_whoosh = (ctx, o, t) => { Sound.noise(ctx, o, t, 1.4, { type: 'lowpass', freq: 600, gain: 0.14 }); };

const boardAve = Vehicles.board;
{
  Vehicles.board = function (v) {
    if (v && v.ave) {
      if (Ave.trip && Ave.trip.T.v === v) return boardAve.call(this, v);
      Ave.open();
      return;
    }
    return boardAve.call(this, v);
  };
  const ser = Vehicles.serialize;
  Vehicles.serialize = function () { const keep = this.list; this.list = keep.filter((v) => !v.ave); try { return ser.call(this); } finally { this.list = keep; } };
  const hit = Vehicles.hit;
  if (hit) Vehicles.hit = function (v) { if (v && v.ave) return; return hit.call(this, v); };
  const pk = Vehicles.pickUp;
  Vehicles.pickUp = function (v) { if (v && v.ave) return; return pk.call(this, v); };
  const idle = Ride.prototype.updateIdle;
  Ride.prototype.updateIdle = function (dt) { if (this.ave) { if (this.basis) this.basis(); return; } return idle.call(this, dt); };
  const pilot = Rides.pilot;
  Rides.pilot = function (v, dt, input, horn) {
    if (!v.ave) return pilot.call(this, v, dt, input, horn);
    const p = G.player, at = v.toWorld(v.def.seat);
    p.pos = [at[0], at[1] - 0.75, at[2]];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    this.updateMotor(v);
  };
  const dis = Vehicles.dismount;
  Vehicles.dismount = function (forced) { if (!forced && G.vehicle && G.vehicle.ave && Ave.trip) { G.ui.toast('🚄 We are at 300 km/h: stay seated'); return; } return dis.call(this, forced); };
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const held = G.inv.held, t = this.target, b = t && t.block;
    if (initial && held && held.id === I.AVE_TICKET && !(t && (t.mob || t.vehicle))) { if (Ave.home()) { Act.consume(); this.swingHand(); } return true; }
    if (initial && b && b.id === B.VENDING_MACHINE && !G.player.sneaking) {
      const L = Ave.line();
      if (L && Ave.inStation(L, b.pos[0], b.pos[2])) { Ave.open(); this.swingHand(); return true; }
    }
    return use.call(this, initial);
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); try { Ave.update(dt || 0.016); Ave.updateHud(); } catch (e) { console.warn('Blocklands: AVE', e); } };
  PC.add({ key: 'ave', icon: '🚄', name: 'AVE', run() { Ave.open(); } });
  const run = Commands.run;
  Commands.run = function (text) { if (/^\/(ave|train|tren)\b/i.test(text)) { Ave.find(); return; } return run.call(this, text); };
}
