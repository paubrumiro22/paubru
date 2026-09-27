'use strict';
// The STUCOM metro line runs by itself, and players can ride in other players' vehicles.
//
// Line: campus.js builds Universitat (under the campus) and Catalunya at the end of a tunnel;
// plan.metro.line holds the track and the two stops. While you are near it a train (a metro ride
// with `auto`) shuttles between them: it pulls into the platform, opens for a few seconds with
// the chime and the next station on the sign, then leaves the other way (the driver changes cab:
// the train keeps its place on the track and the lead car becomes the other end). Right-click it
// to get on as a passenger; Shift gets off. It is local to each player and never saved.
//
// Passengers: right-click another player's car, bus, boat, helicopter or metro to sit in one of
// its free seats. Your position then follows their vehicle, and your presence says where you sit
// (`ps`: [driver's peer id, seat]) so everybody draws you there.

const METRO_LEN = 20.7;   // from the lead car's centre to the back of the last car
const METRO_STOP = { dwell: 9, announce: 5 };
// Passenger seats in each vehicle (local coordinates, like def.seat).
const PASSENGER_SEATS = {
  car: [[-0.42, 0.42, -0.1], [0.42, 0.42, -1.25], [-0.42, 0.42, -1.25]],
  bus: [[-0.6, 0.95, 2.6], [0.6, 0.95, 1.2], [-0.6, 0.95, 1.2], [0.6, 0.95, -0.4], [-0.6, 0.95, -0.4], [0.6, 0.95, -2], [-0.6, 0.95, -2]],
  boat: [[0, 0.4, 0.35], [0, 0.4, -0.35]],
  heli: [[-0.42, 0.55, 0.55], [0.42, 0.55, -0.6], [-0.42, 0.55, -0.6]],
  metro: [[0.7, 0.75, -2], [-0.7, 0.75, -2], [0.7, 0.75, -10.5], [-0.7, 0.75, -10.5], [0.7, 0.75, -18.5], [-0.7, 0.75, -18.5]],
  dozer: [[0.5, 1.3, -0.6]],
};

const Metro = {
  line: null, lineKey: null, train: null, sign: null, signT: 0,

  lineOf() {
    const w = G.world;
    if (!w || !w.gen || !w.gen.structs) return null;
    const key = w.seed + ':' + w.genVer;
    if (this.lineKey !== key) {
      this.lineKey = key;
      const st = typeof stucomVillage === 'function' ? stucomVillage(w.gen) : null;
      if (st && !st.metro) structuresIn(w.gen, st.x, st.z, st.x, st.z);   // pieces are planned lazily
      this.line = st && st.metro && st.metro.line ? st.metro.line : null;
      if (this.line) {
        const L = this.line;
        const A = L.stops[0].at, Bp = L.stops[1].at, l = Math.hypot(Bp[0] - A[0], Bp[2] - A[2]) || 1;
        L.u = [(Bp[0] - A[0]) / l, 0, (Bp[2] - A[2]) / l];
      }
      this.train = null;
    }
    return this.line;
  },

  update(dt) {
    const L = this.lineOf();
    this.updateSign(dt);
    Passengers.update(dt);
    if (!L) return;
    const p = G.player, w = G.world;
    const A = L.stops[0].at, Bp = L.stops[1].at;
    const mid = [(A[0] + Bp[0]) / 2, (A[2] + Bp[2]) / 2];
    const near = Math.hypot(p.pos[0] - mid[0], p.pos[2] - mid[1]) < 110 && Math.abs(p.pos[1] - A[1]) < 50;
    const t = this.train;
    if (t && (t.removed || !Vehicles.list.includes(t))) this.train = null;
    if (!near) {
      if (this.train && G.vehicle !== this.train) { this.train.removed = true; this.train = null; }
      return;
    }
    if (!this.train && w.isLoaded(Math.floor(A[0]), Math.floor(A[2])) && IS_RAIL(w.getBlock(Math.floor(A[0]), Math.floor(A[1]), Math.floor(A[2])))) {
      // start at Universitat, pulled in from the tunnel (so its lead car faces the city end)
      const yaw = Math.atan2(-L.u[0], -L.u[2]);
      const v = Rides.spawn('metro', A[0], A[1] + 2 / 16, A[2], yaw, 0);
      if (v.findRail()) {
        v.auto = { stop: 0, state: 'dwell', t: METRO_STOP.dwell, said: false };
        this.train = v;
      } else v.removed = true;
    }
  },

  // One step of the autopilot: accelerate, brake into the platform, wait, change cab.
  drive(v, dt) {
    const L = this.line, a = v.auto;
    if (!L || !v.rail) { v.drive(dt, null); return; }
    const keys = new Set();
    if (a.state === 'run') {
      const to = L.stops[a.stop].at;
      const f = [Math.sin(v.yaw), Math.cos(v.yaw)];
      const s = (to[0] - v.pos[0]) * f[0] + (to[2] - v.pos[2]) * f[1];
      const brakeDist = v.speed * v.speed / (2 * v.def.brake * 1.5) + 1;
      if (s > brakeDist) keys.add('KeyW');
      else if (v.speed > 0.6) keys.add('Space');
      if (s < 0.4 || (s < 2.5 && v.speed < 0.7)) {
        a.state = 'dwell'; a.t = METRO_STOP.dwell; a.said = false; v.speed = 0;
        this.say(v, 'arrive', L.stops[a.stop].name);
      }
    } else {
      a.t -= dt;
      v.speed = 0;
      if (!a.said && a.t < METRO_STOP.announce) { a.said = true; this.say(v, 'next', L.stops[1 - a.stop].name); }
      if (a.t <= 0) {
        // the driver walks to the other cab: the lead car becomes the far end of the train
        const f = [Math.sin(v.yaw), Math.cos(v.yaw)];
        v.pos[0] -= f[0] * (METRO_LEN - 4); v.pos[2] -= f[1] * (METRO_LEN - 4);
        v.yaw = wrapAngle(v.yaw + Math.PI);
        v.findRail();
        a.stop = 1 - a.stop; a.state = 'run';
        sfx('metro_doors', v.pos, 1, 1);
      }
    }
    v.drive(dt, { keys });
  },

  say(v, kind, name) {
    const p = G.player;
    const aboard = G.vehicle === v;
    const close = Math.hypot(p.pos[0] - v.pos[0], p.pos[2] - v.pos[2]) < 40;
    if (!aboard && !close) return;
    sfx('metro_chime', aboard ? null : v.pos, 1, 1);
    this.showSign(kind === 'arrive' ? name : 'Next stop: ' + name, kind === 'arrive' ? 'Doors open' : 'Doors closing · mind the gap');
  },
  showSign(title, sub) {
    if (!this.sign) {
      this.sign = document.createElement('div');
      this.sign.id = 'metroSign';
      this.sign.innerHTML = '<i>M</i><div><b></b><span></span></div>';
      $('hud').append(this.sign);
    }
    this.sign.querySelector('b').textContent = title;
    this.sign.querySelector('span').textContent = sub;
    this.sign.classList.add('show');
    this.signT = 5;
  },
  updateSign(dt) {
    if (!this.sign || this.signT <= 0) return;
    this.signT -= dt;
    if (this.signT <= 0) this.sign.classList.remove('show');
  },
};

const Passengers = {
  seat: null,   // { peer, idx } while riding someone else's vehicle
  exitT: 0,

  // the remote vehicle a ray hits (for right-clicking to get in)
  pick(o, d, maxDist) {
    let best = null, bestT = maxDist;
    for (const [peer, r] of Net.peers) {
      const v = r.ride;
      if (!v || !v.m || !PASSENGER_SEATS[v.kind]) continue;
      const m = v.m, ro = [o[0] - v.pos[0], o[1] - v.pos[1], o[2] - v.pos[2]];
      const lo = [m[0] * ro[0] + m[4] * ro[1] + m[8] * ro[2], m[1] * ro[0] + m[5] * ro[1] + m[9] * ro[2], m[2] * ro[0] + m[6] * ro[1] + m[10] * ro[2]];
      const ld = [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
      for (const b of v.def.hit) {
        let t0 = 0, t1 = bestT, ok = true;
        for (let k = 0; k < 3 && ok; k++) {
          if (Math.abs(ld[k]) < 1e-9) { if (lo[k] < b[k] || lo[k] > b[k + 3]) ok = false; continue; }
          let a = (b[k] - lo[k]) / ld[k], c = (b[k + 3] - lo[k]) / ld[k];
          if (a > c) [a, c] = [c, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, c);
          if (t0 > t1) ok = false;
        }
        if (ok && t0 < bestT) { bestT = t0; best = { peer, ride: v, dist: t0 }; }
      }
    }
    return best;
  },

  join(peer, v) {
    const seats = PASSENGER_SEATS[v.kind] || [];
    const taken = new Set();
    for (const r of Net.peers.values()) if (r.ps && r.ps[0] === peer) taken.add(r.ps[1]);
    const idx = seats.findIndex((_, i) => !taken.has(i));
    if (idx < 0) { G.ui.toast('No free seats'); return false; }
    if (G.vehicle) Vehicles.dismount(true);
    this.seat = { peer, idx };
    G.player.flying = false;
    this.exitT = 0.4;
    const r = Net.peers.get(peer);
    G.ui.toast('You ride with ' + (r ? r.name : 'a friend') + ' · Shift to get out', 3000);
    sfx('door_close', null, 0.8, 1.2);
    Net.sendT = 0;
    return true;
  },
  leave() {
    if (!this.seat) return;
    const r = Net.peers.get(this.seat.peer), v = r && r.ride;
    this.seat = null;
    const p = G.player;
    if (v) { const side = v.toWorld([2.2, 0.5, 0]); p.pos = side; }
    p.vel = [0, 0, 0]; p.fallStart = null;
    liftOutOfBlocks(p);
    Net.sendT = 0;
  },
  update(dt) {
    if (!this.seat) return;
    const r = Net.peers.get(this.seat.peer), v = r && r.ride;
    if (!Net.on || !v) { this.leave(); G.ui.toast('The driver got out'); return; }
    const seat = (PASSENGER_SEATS[v.kind] || [])[this.seat.idx];
    if (!seat) { this.leave(); return; }
    const p = G.player, at = v.toWorld(seat);
    p.pos = [at[0], at[1] - 0.75, at[2]];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    this.exitT -= dt;
    const k = G.input && G.input.keys;
    if (this.exitT <= 0 && k && (k.has('ShiftLeft') || k.has('ShiftRight'))) this.leave();
  },
  // where a remote passenger sits (their presence `ps`), or null
  seatOf(r) {
    if (!Array.isArray(r.ps) || r.ps.length < 2) return null;
    const [peer, idx] = r.ps;
    const v = peer === Net.selfPeer ? (G.vehicle && G.vehicle.ride ? G.vehicle : null) : (Net.peers.get(peer) || {}).ride;
    const seat = v && (PASSENGER_SEATS[v.kind] || [])[idx];
    return seat ? { v, seat } : null;
  },
  renderSeated(v, seat, cp, skin, tint) {
    const at = v.toWorld(seat);
    const mob = { type: 'avatar', pos: [at[0], at[1] - 0.75, at[2]], h: 1.8, bodyYaw: v.yaw, headYaw: v.yaw, headPitch: 0,
      walkPhase: 0, walkAmt: 0, hurtTime: 0, dead: false, fuse: 0, age: G.time, fire: 0, aiming: 0, sit: true, ride: v.kind, skin, tint };
    ER.mob(null, mob, cp);
  },
};

// ---------------------------------------------------------------- hooks ----
{
  // the autopilot drives the line's train, parked or with you aboard
  const idle0 = Ride.prototype.updateIdle;
  Ride.prototype.updateIdle = function (dt) { if (this.auto) Metro.drive(this, dt); else idle0.call(this, dt); };
  const pilot0 = Rides.pilot;
  Rides.pilot = function (v, dt, input, horn) {
    if (!v.auto) return pilot0.call(this, v, dt, input, horn);
    Metro.drive(v, dt);
    const p = G.player, at = v.toWorld(PASSENGER_SEATS.metro[0]);
    p.pos = [at[0], at[1] - 0.75, at[2]];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    this.updateMotor(v);
  };
  const board0 = Rides.board;
  Rides.board = function (v) {
    board0.call(this, v);
    if (v.auto) G.ui.toast('All aboard! The train runs by itself · Shift to get off', 3500);
  };
  // the line's train is never saved
  const ser0 = Vehicles.serialize;
  Vehicles.serialize = function () {
    const keep = this.list;
    this.list = keep.filter((v) => !v.auto);
    try { return ser0.call(this); } finally { this.list = keep; }
  };
  // right-clicking another player's vehicle gets you in as a passenger
  const ray0 = Vehicles.raycast;
  Vehicles.raycast = function (o, d, maxDist) {
    const hit = ray0.call(this, o, d, maxDist);
    if (!Net.on) return hit;
    const r = Passengers.pick(o, d, hit ? hit.dist : maxDist);
    return r ? { vehicle: r.ride, dist: r.dist, peer: r.peer } : hit;
  };
  const vb0 = Vehicles.board;
  Vehicles.board = function (v) {
    if (v && v.remote) {
      for (const [peer, r] of Net.peers) if (r.ride === v) { Passengers.join(peer, v); return; }
      return;
    }
    return vb0.call(this, v);
  };
  // presence: where we sit
  const pd0 = Net.presenceData;
  Net.presenceData = function () {
    const d = pd0.call(this);
    if (Passengers.seat) d.ps = [Passengers.seat.peer, Passengers.seat.idx];
    return d;
  };
  const op0 = Net.onPresence;
  Net.onPresence = function (peer, pr) {
    op0.call(this, peer, pr);
    const r = this.peers.get(peer);
    if (r) r.ps = pr && Array.isArray(pr.ps) && typeof pr.ps[0] === 'string' && Number.isInteger(pr.ps[1]) ? pr.ps : null;
  };
}

SYNTH.metro_chime = (ctx, o, t) => {
  [659, 523, 784].forEach((f, i) => Sound.tone(ctx, o, t + i * 0.28, 0.5, { wave: 'sine', f0: f, gain: 0.16 }));
};
SYNTH.metro_doors = (ctx, o, t) => {
  for (let i = 0; i < 4; i++) Sound.tone(ctx, o, t + i * 0.22, 0.12, { wave: 'square', f0: 1400, gain: 0.05, filter: ['lowpass', 3000, 1] });
  Sound.noise(ctx, o, t + 0.9, 0.5, { type: 'bandpass', freq: 800, q: 0.7, gain: 0.25, attack: 0.05 });
};
