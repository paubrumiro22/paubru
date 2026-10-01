'use strict';
// A living city (the STUCOM district, and Blockton in the CrazyGames edition):
// - Traffic: cars drive round the street grid on the right, turn at the crossings, stop at red
//   lights (traffic lights on every crossing, drawn as models) and for people on the zebra
//   crossings, keep their distance; now and then an ambulance with its siren goes by fast.
// - Extreme weather: a lightning bolt in the district can cut the power (street lamps, lit windows,
//   traffic lights and lifts go out for a while), hail storms that hurt outdoors, heavier snow in
//   winter.
// - Surprise events, one a day chosen by the date (the same for everybody online): a concert on a
//   stage in the square, a night market with lanterns and stalls, a street race round the square
//   with checkpoints; and sometimes a building catches fire: help the firefighters with a bucket
//   of water.
// - Neighbours with a routine: named citizens who live in the plots (or come by metro), walk the
//   pavements to work in the morning, have lunch in the square, go to the park in the evening and
//   home at night; right-click one to chat. At rush hour the metro and the buses fill up.
// Everything is local to each player except the event of the day (the date decides it).

const CA_STREET_OFF = 5;         // a street's centre line, from the start of its band
const CA_LANE = 2.0;             // lanes this far right of the centre line
const CA_BOX = 5.5;              // half size of a crossing
const CA_LIGHT = { cycle: 24, green: 10, amber: 2 };

const CityAlive = {
  key: null, D: null, plan: null, t: 0,
  district() {
    const g = G.world && G.world.gen;
    if (!g || !g.structs || typeof stucomVillage !== 'function') return null;
    try { const s = stucomVillage(g); return s && s.district ? s : null; } catch (e) { return null; }
  },
  near(plan, r = 200) { const p = G.player.pos; return Math.abs(p[0] - plan.x) < r && Math.abs(p[2] - plan.z) < r && Math.abs(p[1] - plan.y) < 60 && !G.slot; },
  clock() { return Date.now() / 1000; },
  hour() { return ((G.dayTime || 0) * 24 + 6) % 24; },

  update(dt) {
    const plan = this.district();
    if (!plan) { Traffic.clear(); Citizens.clear(); return; }
    const k = G.world.seed + ':' + plan.x + ':' + plan.z;
    if (k !== this.key) { this.key = k; Traffic.clear(); Citizens.clear(); Traffic.build(plan); }
    const here = this.near(plan);
    Traffic.update(dt, plan, here);
    Citizens.update(dt, plan, here);
    CityEvents.update(dt, plan, here);
    Blackout.update(dt, plan);
  },
  render(cp) {
    const plan = this.district();
    if (!plan || !this.near(plan, 260)) return;
    Traffic.render(cp, plan);
    CityEvents.render(cp, plan);
    Crowd.render(cp);
  },
};

// ---------------------------------------------------------------- traffic ----
const Traffic = {
  nodes: [], cars: [], plan: null, sirenT: 0, ambT: 90,
  build(plan) {
    this.plan = plan;
    const lines = [];
    for (let b = -DHALF; b < DHALF; b += DP) lines.push(b + CA_STREET_OFF);
    const skip = (u, v) => CG && u >= 72 && Math.abs(v) <= 76;           // the airport (CG)
    this.lines = lines;
    this.nodes = [];
    for (const u of lines) for (const v of lines) if (!skip(u, v)) this.nodes.push({ u, v, off: Math.floor(hash3(u, 7, v, 11) * CA_LIGHT.cycle) });
    const at = (u, v) => this.nodes.find((n) => n.u === u && n.v === v);
    for (const n of this.nodes) {
      n.out = [];
      const i = lines.indexOf(n.u), j = lines.indexOf(n.v);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const m = lines[i + di] !== undefined && lines[j + dj] !== undefined ? at(lines[i + di], lines[j + dj]) : null;
        if (m) n.out.push(m);
      }
    }
  },
  clear() { for (const c of this.cars) if (c.v) c.v.removed = true; this.cars = []; },
  // the light for traffic along x (axis 0) or z (axis 1) at a node: 'g', 'a' or 'r'
  light(n, axis) {
    if (Blackout.on) return 'a';
    const ph = ((CityAlive.clock() + n.off) % CA_LIGHT.cycle + CA_LIGHT.cycle) % CA_LIGHT.cycle;
    const half = CA_LIGHT.cycle / 2, q = axis === 0 ? ph : (ph + half) % CA_LIGHT.cycle;
    return q < CA_LIGHT.green ? 'g' : q < CA_LIGHT.green + CA_LIGHT.amber ? 'a' : 'r';
  },
  spawnCar(plan, kind) {
    const p = G.player.pos;
    const near = this.nodes.filter((n) => Math.hypot(plan.x + n.u - p[0], plan.z + n.v - p[2]) < 110);
    if (!near.length) return null;
    const a = near[Math.floor(Math.random() * near.length)], b = a.out[Math.floor(Math.random() * a.out.length)];
    if (!b) return null;
    const c = { a, b, s: CA_BOX + Math.random() * 20, speed: 0, kind: kind || 'car', turn: null, seed: Math.random() };
    const paint = kind === 'amb' ? 0 : kind === 'fire' ? 1 : Math.floor(Math.random() * RIDE_PAINTS.length);
    const pos = this.pos(c);
    c.v = Rides.spawn('car', pos[0], plan.y, pos[2], pos[3], paint);
    c.v.scripted = true; c.v.traffic = kind || 'car'; c.v.onGround = true;
    if (kind === 'amb') c.v.tintOverride = [1, 1, 1];
    this.cars.push(c);
    return c;
  },
  // world position and yaw of a car
  pos(c) {
    const P = this.plan;
    if (c.turn) {
      const t = c.turn, k = c.s / t.len, q = 1 - k;
      const x = q * q * t.p0[0] + 2 * q * k * t.p1[0] + k * k * t.p2[0], z = q * q * t.p0[1] + 2 * q * k * t.p1[1] + k * k * t.p2[1];
      const dx = 2 * q * (t.p1[0] - t.p0[0]) + 2 * k * (t.p2[0] - t.p1[0]), dz = 2 * q * (t.p1[1] - t.p0[1]) + 2 * k * (t.p2[1] - t.p1[1]);
      return [P.x + x, 0, P.z + z, Math.atan2(dx, dz)];
    }
    const d = [Math.sign(c.b.u - c.a.u), Math.sign(c.b.v - c.a.v)], r = [-d[1], d[0]];
    const x = c.a.u + d[0] * c.s + r[0] * CA_LANE, z = c.a.v + d[1] * c.s + r[1] * CA_LANE;
    return [P.x + x + 0.5, 0, P.z + z + 0.5, Math.atan2(d[0], d[1])];
  },
  len(c) { return Math.abs(c.b.u - c.a.u) + Math.abs(c.b.v - c.a.v); },
  update(dt, plan, here) {
    if (!here) { if (this.cars.length) this.clear(); return; }
    this.cars = this.cars.filter((c) => { if (c.v.removed || !Vehicles.list.includes(c.v)) return false; const p = G.player.pos; if (Math.hypot(c.v.pos[0] - p[0], c.v.pos[2] - p[2]) > 150) { c.v.removed = true; return false; } return true; });
    const want = CG ? 18 : 12;
    if (this.cars.filter((c) => c.kind === 'car').length < want) this.spawnCar(plan);
    // an ambulance now and then
    this.ambT -= dt;
    if (this.ambT <= 0) { this.ambT = rand(120, 240); const c = this.spawnCar(plan, 'amb'); if (c) { c.life = 70; } }
    for (const c of this.cars) this.drive(c, dt, plan);
    this.siren(dt);
  },
  drive(c, dt, plan) {
    const vmax = c.kind === 'amb' ? 12 : c.kind === 'fire' ? 10 : 7.5;
    let want = vmax;
    const L = this.len(c);
    if (c.life !== undefined) { c.life -= dt; if (c.life < 0) { c.v.removed = true; return; } }
    if (c.parked) { c.speed = 0; this.place(c, plan); return; }
    if (!c.turn) {
      // the stop line before the next crossing
      const toLine = L - CA_BOX - 1.2 - c.s;
      const axis = c.b.u !== c.a.u ? 0 : 1, lt = this.light(c.b, axis);
      if (c.kind === 'car' && toLine > -0.5 && toLine < 14 && (lt === 'r' || (lt === 'a' && toLine > 3) || (Blackout.on && !c.waited))) {
        want = Math.min(want, Math.max(0, toLine - 0.3) * 1.2);
        if (Blackout.on && toLine < 0.8) { c.stopT = (c.stopT || 0) + dt; if (c.stopT > 2) c.waited = true; }
      }
      if (toLine < -0.5) c.waited = false;
    }
    // the car ahead, and people in front (the player, citizens)
    const me = c.v.pos, f = [Math.sin(c.v.yaw), Math.cos(c.v.yaw)];
    const blockers = [G.player.pos];
    for (const m of Citizens.list) blockers.push(m.pos);
    for (const o of this.cars) if (o !== c && !o.v.removed) blockers.push(o.v.pos);
    for (const q of blockers) {
      const dx = q[0] - me[0], dz = q[2] - me[2], ahead = dx * f[0] + dz * f[1], side = Math.abs(dx * f[1] - dz * f[0]);
      if (ahead > 0.5 && ahead < 14 && side < 1.7 && Math.abs(q[1] - me[1]) < 3) want = Math.min(want, Math.max(0, ahead - 5.5) * 1.3);
    }
    if (c.kind === 'amb') want = Math.max(want, 4);
    c.speed += clamp(want - c.speed, -9 * dt, 3.2 * dt);
    c.s += c.speed * dt;
    if (c.turn) {
      if (c.s >= c.turn.len) { c.s = CA_BOX + (c.s - c.turn.len); c.a = c.turn.from; c.b = c.turn.to; c.turn = null; }
    } else if (c.s >= L - CA_BOX) {
      // into the crossing: pick the way on (not back) and follow a curve to its lane
      const n = c.b, opts = n.out.filter((m) => m !== c.a);
      const nx = opts.length ? opts[Math.floor(hash3(Math.floor(c.seed * 1e6), n.u, n.v, 3) * opts.length + (c.s * 13 % 1)) % opts.length] : c.a;
      const d0 = [Math.sign(n.u - c.a.u), Math.sign(n.v - c.a.v)], r0 = [-d0[1], d0[0]];
      const d1 = [Math.sign(nx.u - n.u), Math.sign(nx.v - n.v)], r1 = [-d1[1], d1[0]];
      const p0 = [n.u - d0[0] * CA_BOX + r0[0] * CA_LANE + 0.5, n.v - d0[1] * CA_BOX + r0[1] * CA_LANE + 0.5];
      const p2 = [n.u + d1[0] * CA_BOX + r1[0] * CA_LANE + 0.5, n.v + d1[1] * CA_BOX + r1[1] * CA_LANE + 0.5];
      const straight = d0[0] === d1[0] && d0[1] === d1[1];
      const p1 = straight ? [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2] : [n.u + 0.5 + r0[0] * CA_LANE + r1[0] * CA_LANE + (d0[0] + d1[0]) * 0 , n.v + 0.5 + r0[1] * CA_LANE + r1[1] * CA_LANE];
      // a quadratic's length, near enough
      let len = 0, prev = p0;
      for (let i = 1; i <= 8; i++) { const k = i / 8, q = 1 - k, pt = [q * q * p0[0] + 2 * q * k * p1[0] + k * k * p2[0], q * q * p0[1] + 2 * q * k * p1[1] + k * k * p2[1]]; len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]); prev = pt; }
      c.turn = { p0, p1, p2, len: Math.max(1, len), from: n, to: nx };
      c.s = 0;
    }
    this.place(c, plan);
  },
  place(c, plan) {
    const [x, , z, yaw] = this.pos(c), v = c.v;
    let dy = yaw - v.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    v.yaw += dy * 0.35;
    v.pos = [x, plan.y, z]; v.speed = c.speed; v.pitch = 0; v.roll = 0; v.vel = [0, 0, 0]; v.onGround = true;
    v.rpm = 0.15 + c.speed / 12 * 0.7;
    if (v.basis) v.basis();
  },
  // the siren of the nearest emergency vehicle
  siren(dt) {
    this.sirenT -= dt;
    if (this.sirenT > 0) return;
    this.sirenT = 0.9;
    const p = G.player.pos;
    for (const c of this.cars) if ((c.kind === 'amb' || c.kind === 'fire') && !c.parked && Math.hypot(c.v.pos[0] - p[0], c.v.pos[2] - p[2]) < 90) { sfx('siren2', c.v.pos, 0.55, 1); break; }
  },

  render(cp, plan) {
    const uv = () => Vehicles.swatchUV('white');
    // traffic lights: a pole on each corner of a crossing, lamps facing both ways
    for (const n of this.nodes) {
      const cx = plan.x + n.u + 0.5, cz = plan.z + n.v + 0.5;
      if (Math.abs(cx - cp[0]) > 80 || Math.abs(cz - cp[2]) > 80) continue;
      ER.lightAt(cx, plan.y + 3, cz);
      const lx = this.light(n, 0), lz = this.light(n, 1), blink = Blackout.on && Math.floor(G.time * 2) % 2 === 0;
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const px = cx + sx * (CA_BOX + 0.6), pz = cz + sz * (CA_BOX + 0.6);
        const m = XF.t(px - cp[0], plan.y - cp[1], pz - cp[2]);
        ER.color = [0.18, 0.2, 0.22];
        ER.box(m, -0.07, 0, -0.07, 0.07, 3.3, 0.07, uv);
        ER.box(m, -0.22, 2.35, -0.22, 0.22, 3.45, 0.22, uv);
        // lamps: the x faces show the light for x traffic, the z faces for z traffic
        const lamp = (st, off, axisX) => {
          const cols = { r: [1, 0.12, 0.1], a: [1, 0.72, 0.1], g: [0.15, 1, 0.35] };
          const order = ['r', 'a', 'g'];
          order.forEach((k, i) => {
            const on = Blackout.on ? (k === 'a' && blink) : st === k;
            ER.color = on ? cols[k] : [0.12, 0.12, 0.12]; ER.ov = on ? 3 : 0;
            const y0 = 3.15 - i * 0.33;
            if (axisX) ER.box(m, off - 0.03, y0 - 0.12, -0.12, off + 0.03, y0 + 0.12, 0.12, uv);
            else ER.box(m, -0.12, y0 - 0.12, off - 0.03, 0.12, y0 + 0.12, off + 0.03, uv);
          });
          ER.ov = 0;
        };
        lamp(lx, -0.23 * sx, true); lamp(lz, -0.23 * sz, false);
      }
    }
    // beacons on the ambulances and fire engines
    for (const c of this.cars) {
      if (c.kind !== 'amb' && c.kind !== 'fire') continue;
      const v = c.v;
      if (Math.abs(v.pos[0] - cp[0]) > 90 || Math.abs(v.pos[2] - cp[2]) > 90) continue;
      const on = Math.floor(G.time * 5) % 2 === 0;
      const m = XF.chain(XF.t(v.pos[0] - cp[0], v.pos[1] - cp[1], v.pos[2] - cp[2]), XF.ry(v.yaw));
      ER.ov = 3;
      ER.color = on ? [0.2, 0.4, 1] : [1, 0.15, 0.15]; ER.box(m, -0.55, 1.62, -0.35, -0.05, 1.82, -0.05, uv);
      ER.color = on ? [1, 0.15, 0.15] : [0.2, 0.4, 1]; ER.box(m, 0.05, 1.62, -0.35, 0.55, 1.82, -0.05, uv);
      ER.ov = 0;
      if (c.kind === 'amb') { ER.color = [0.9, 0.1, 0.1]; for (const s of [-1, 1]) { ER.box(m, s * 0.93, 0.9, -0.5, s * 0.95, 1.3, -0.3, uv); ER.box(m, s * 0.93, 1.02, -0.62, s * 0.95, 1.18, -0.18, uv); } }
      if (c.kind === 'fire') { ER.color = [0.75, 0.75, 0.78]; ER.box(m, -0.12, 1.5, -1.6, 0.12, 1.62, 1.2, uv); }
    }
    ER.color = [1, 1, 1];
  },
};

// ---------------------------------------------------------------- blackouts ----
const Blackout = {
  on: false, t: 0,
  start(plan) {
    if (this.on) return;
    this.on = true; this.t = rand(25, 45);
    G.ui.banner('⚡', 'Blackout! Lightning hit the power station · no lights, no lifts');
    sfx('power_down', null, 0.8, 1);
  },
  update(dt, plan) {
    const target = this.on ? 1 : 0;
    G.blackout = (G.blackout || 0) + (target - (G.blackout || 0)) * Math.min(1, dt * (this.on ? 6 : 1.5));
    if (!this.on) return;
    this.t -= dt;
    if (this.t <= 0 || !CityAlive.near(plan, 300)) { this.on = false; G.ui.toast('💡 The power is back'); sfx('power_up', null, 0.7, 1); }
  },
};

// ---------------------------------------------------------------- the event of the day ----
const CA_EVENTS = ['concert', 'market', 'race'];
const CityEvents = {
  cur: null, fire: null, fireT: 180, race: null, crowd: [], lastKey: '',
  // today's event and its hours (the same for everybody: the day number decides)
  today() {
    const d = (G.prog && G.prog.day) | 0;
    const kind = CA_EVENTS[Math.floor(hash3(d, 17, 5, 91) * CA_EVENTS.length)];
    const win = { concert: [18.5, 22.5], market: [20, 24.5], race: [10, 17] }[kind];
    return { d, kind, win };
  },
  active(h) { const e = this.today(); const hh = h < 6 ? h + 24 : h; return hh >= e.win[0] && hh < e.win[1] ? e : null; },
  update(dt, plan, here) {
    const h = CityAlive.hour(), e = here ? this.active(h) : null;
    const key = e ? e.d + ':' + e.kind : '';
    if (key !== this.lastKey) {
      this.stop();
      this.lastKey = key;
      if (e) this.startEvent(e, plan);
    }
    if (this.cur) this.tickEvent(dt, plan);
    this.updateFire(dt, plan, here);
    this.updateRace(dt, plan);
  },
  stop() {
    for (const m of this.crowd) m.removed = true;
    this.crowd = [];
    if (this.cur && this.cur.kind === 'concert' && this.cur.started) Football.fireworks([this.cur.stage[0], this.cur.stage[1], this.cur.stage[2]]);
    this.cur = null;
    this.race = null;
    RaceHud.hide();
  },
  spawnPerson(x, y, z, prof, stay) {
    const m = Ents.spawnMob('villager', x, y + 0.01, z);
    m.persistent = true; m.eventNpc = true;
    m.prof = prof;
    m.skin = prof === 'student' ? STUDENT_SKINS[Math.floor(Math.random() * STUDENT_SKINS.length)] : (VILLAGER_SKIN[prof] || VILLAGER_SKIN.farmer);
    m.home = [x, z]; m.homeR = stay ? 0.6 : 3;
    m.name = VILLAGER_NAMES[Math.floor(Math.random() * VILLAGER_NAMES.length)];
    this.crowd.push(m);
    return m;
  },
  startEvent(e, plan) {
    const F = plan.y, X = (u) => plan.x + u + 0.5, Z = (v) => plan.z + v + 0.5;
    const c = this.cur = { kind: e.kind, t: 0, started: false };
    if (e.kind === 'concert') {
      c.stage = [X(-1), F, Z(-12)];
      G.ui.banner('🎸', 'Concert tonight in Plaça Universitat!');
      for (let i = 0; i < 3; i++) this.spawnPerson(X(-4 + i * 3), F + 1.1, Z(-14), ['student', 'librarian', 'student'][i], true).dancer = 'band';
      for (let i = 0; i < 16; i++) this.spawnPerson(X(-8 + (i % 8) * 2.2 + rand(-0.4, 0.4)), F, Z(-6 + Math.floor(i / 8) * 2.5 + rand(-0.4, 0.4)), i % 3 ? 'student' : 'farmer', true).dancer = 'crowd';
    } else if (e.kind === 'market') {
      c.stalls = [[-14, -2, 0], [-14, 6, 1], [-14, 14, 2], [14, -12, 3], [14, 12, 4], [3, 14, 5]].map(([u, v, k]) => ({ x: X(u), z: Z(v), k }));
      G.ui.banner('🏮', 'Night market in the square: street food and bargains');
      const profs = ['farmer', 'butcher', 'fisher', 'librarian', 'smith', 'cleric'];
      c.stalls.forEach((s, i) => this.spawnPerson(s.x + (s.x < plan.x ? -1.4 : 1.4), F, s.z, profs[i % profs.length], true));
      for (let i = 0; i < 8; i++) this.spawnPerson(X(rand(-12, 12)), F, Z(rand(-12, 12)), 'student', false);
    } else if (e.kind === 'race') {
      G.ui.banner('🏁', 'Street race today! Get in a car or on a bike and drive through the start arch by the school');
      // round the square on the inner ring road, the bus L1 loop
      const loop = BUS_LINES[1].loop;
      c.checks = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        for (const k of [0.25, 0.75]) c.checks.push([X(a[0] + (b[0] - a[0]) * k), F, Z(a[1] + (b[1] - a[1]) * k)]);
      }
      c.start = c.checks[0];
    }
  },
  tickEvent(dt, plan) {
    const c = this.cur;
    c.t += dt;
    if (c.kind === 'concert') {
      c.started = true;
      // the crowd jumps to the beat, the band sways
      const beat = (CityAlive.clock() * 2) % 1;
      for (const m of this.crowd) {
        if (m.dancer === 'crowd' && m.onGround && beat < 0.08 && Math.random() < 0.5) m.vel[1] = 4.2;
        if (m.dancer === 'band') { m.bodyYaw = Math.PI + Math.sin(G.time * 3 + m.pos[0]) * 0.3; m.headYaw = m.bodyYaw; }
      }
      ConcertMusic.tick(c.stage);
    }
  },

  // ---- fire! ----
  updateFire(dt, plan, here) {
    const f = this.fire;
    if (!f) {
      if (!here || G.dimension) return;
      this.fireT -= dt;
      if (this.fireT > 0) return;
      this.fireT = rand(240, 480);
      if (Math.random() > 0.5 || !isDaytime()) return;
      // a window of one of the district's buildings
      const cand = [];
      const cp = plan.campus || {};
      if (cp.bank) cand.push([cp.bank.x0 - 0.2, plan.y + 6, (cp.bank.z0 + cp.bank.z1) / 2, 'Banc Central']);
      if (cp.annex) cand.push([(cp.annex.x0 + cp.annex.x1) / 2, plan.y + 5, cp.annex.z0 - 0.2, 'the annex']);
      cand.push([plan.x - 8 + 8, plan.y + 9, plan.z - 32 + 0.2, SCHOOL]);
      const t = cand[Math.floor(Math.random() * cand.length)];
      this.fire = { x: t[0], y: t[1], z: t[2], name: t[3], hp: 100, t: 0 };
      G.ui.banner('🔥', 'Fire at ' + t[3] + '! Help the firefighters: throw water on it');
      sfx('siren2', null, 0.6, 1);
      // the fire engine drives there
      const c = Traffic.spawnCar(plan, 'fire');
      if (c) { c.life = 200; this.fire.truck = c; }
      return;
    }
    f.t += dt;
    // big licking flames out of the window and a column of dark smoke
    const fk = clamp(f.hp / 100, 0.2, 1);
    for (let i = 0; i < 4; i++) if (Math.random() < dt * 30 * fk) {
      const l = rand(0.5, 1.0);
      Particles.add(Particles.base(f.x + rand(-1.5, 1.5), f.y + rand(-0.8, 0.6), f.z + rand(-1.5, 1.5), { vx: rand(-0.3, 0.3), vy: rand(1.2, 2.6), vz: rand(-0.3, 0.3), life: l, max: l, size: rand(0.28, 0.55) * fk + 0.1, layer: T.p_flame, glow: true, drag: 0.96, shrink: true, collide: false }));
    }
    if (Math.random() < dt * 14) Particles.smoke(f.x + rand(-1, 1), f.y + 2.2, f.z + rand(-1, 1), 3, 1.2, true);
    if (f.truck && !f.truck.parked && Math.hypot(f.truck.v.pos[0] - f.x, f.truck.v.pos[2] - f.z) < 30) { f.truck.parked = true; f.truck.speed = 0; }
    if (f.truck && f.truck.parked) f.hp -= dt * 0.35;       // the firefighters work too
    if (f.hp <= 0 || f.t > 240) {
      G.ui.banner(f.hp <= 0 ? '🚒' : '💨', f.hp <= 0 ? 'The fire is out!' + (f.helped ? ' Thanks for your help: +80 coins' : '') : 'The fire burnt itself out');
      if (f.hp <= 0 && f.helped && G.mode === 'survival') G.money = (G.money | 0) + 80;
      if (f.truck) f.truck.life = 25, f.truck.parked = false;
      this.fire = null;
    }
  },
  // water on the fire (a water bucket, right-click near it)
  douse() {
    const f = this.fire, p = G.player;
    if (!f) return false;
    const e = p.eyePos(), d = Math.hypot(f.x - e[0], f.y - e[1], f.z - e[2]);
    if (d > 9) return false;
    f.hp -= 22; f.helped = true;
    for (let i = 0; i < 30; i++) Particles.add(Particles.base(e[0], e[1] - 0.2, e[2], { vx: (f.x - e[0]) / d * 9 + rand(-1, 1), vy: (f.y - e[1]) / d * 9 + rand(0, 2), vz: (f.z - e[2]) / d * 9 + rand(-1, 1), life: 0.9, max: 0.9, size: 0.1, layer: T.p_smoke, r: 0.5, g: 0.7, b: 1.2, blend: true, grav: 9, drag: 0.98 }));
    sfx('splash', [f.x, f.y, f.z], 0.8, 1.2);
    Particles.smoke(f.x, f.y + 1, f.z, 8, 1.2, false);
    return true;
  },

  // ---- the race ----
  updateRace(dt, plan) {
    const c = this.cur;
    if (!c || c.kind !== 'race') return;
    const v = G.vehicle, inCar = v && v.ride && (v.kind === 'car' || v.kind === 'bike') && !v.traffic && !v.taxi;
    const p = G.player.pos;
    let r = this.race;
    if (!r) {
      if (inCar && Math.hypot(p[0] - c.start[0], p[2] - c.start[2]) < 6) {
        this.race = r = { i: 1, t: 0, count: 3 };
        G.ui.toast('🏁 Ready…', 1200);
      }
      return;
    }
    if (!inCar) { RaceHud.hide(); this.race = null; G.ui.toast('🏁 Race abandoned'); return; }
    if (r.count > 0) {
      const before = Math.ceil(r.count);
      r.count -= dt;
      if (Math.ceil(r.count) !== before) { sfx('bell', null, 0.8, r.count <= 0 ? 1.6 : 1); G.ui.toast(r.count <= 0 ? '🏁 GO!' : String(Math.ceil(r.count)), 700); }
      RaceHud.show(r, c);
      return;
    }
    r.t += dt;
    const ck = c.checks[r.i % c.checks.length];
    if (Math.hypot(p[0] - ck[0], p[2] - ck[2]) < 6) {
      sfx('pling', null, 0.8, 1.2 + r.i * 0.04);
      r.i++;
      if (r.i > c.checks.length) {
        const best = G.prog.race || Infinity, prize = r.t < 35 ? 150 : r.t < 50 ? 80 : 30;
        G.ui.banner('🏆', 'Finish! ' + r.t.toFixed(1) + ' s' + (r.t < best ? ' · new record!' : '') + (G.mode === 'survival' ? ' · +' + prize + ' coins' : ''));
        if (r.t < best) G.prog.race = r.t;
        if (G.mode === 'survival') G.money = (G.money | 0) + prize;
        Football.fireworks([p[0], p[1], p[2]]);
        this.race = null; RaceHud.hide();
        return;
      }
    }
    RaceHud.show(r, c);
  },

  render(cp, plan) {
    const uv = () => Vehicles.swatchUV('white'), c = this.cur;
    const B0 = (m, a, b, cx, cy, cz, col, glow) => { ER.color = col; ER.ov = glow ? 3 : 0; ER.box(m, a[0], a[1], a[2], b[0], b[1], b[2], uv); };
    if (c && c.kind === 'concert') {
      const [sx, sy, sz] = c.stage;
      ER.lightAt(sx, sy + 3, sz);
      const m = XF.t(sx - cp[0], sy - cp[1], sz - cp[2]);
      B0(m, [-6, 0, -3], [6, 1.1, 2], 0, 0, 0, [0.12, 0.12, 0.14]);
      B0(m, [-6, 1.1, 1.8], [6, 1.15, 2], 0, 0, 0, [0.9, 0.2, 0.5], true);
      for (const x of [-6, 5.7]) B0(m, [x, 1.1, -3], [x + 0.3, 6.5, -2.7], 0, 0, 0, [0.5, 0.5, 0.55]);
      B0(m, [-6, 6.2, -3], [6.3, 6.5, -2.7], 0, 0, 0, [0.5, 0.5, 0.55]);
      B0(m, [-5.6, 1.2, -3.1], [5.6, 6.1, -2.95], 0, 0, 0, [0.05, 0.05, 0.08]);
      // speaker stacks
      for (const x of [-7.6, 6.2]) { B0(m, [x, 0, -1.5], [x + 1.4, 3.2, 0.2], 0, 0, 0, [0.08, 0.08, 0.09]); for (let y = 0.4; y < 3; y += 0.9) B0(m, [x + 0.25, y, 0.21], [x + 1.15, y + 0.6, 0.23], 0, 0, 0, [0.25, 0.25, 0.28]); }
      // lights sweeping in colour
      const beat = (CityAlive.clock() * 2) % 1;
      for (let i = 0; i < 8; i++) {
        const hue = (G.time * 0.2 + i / 8) % 1, col = [0.5 + 0.5 * Math.sin(hue * 6.28), 0.5 + 0.5 * Math.sin(hue * 6.28 + 2.1), 0.5 + 0.5 * Math.sin(hue * 6.28 + 4.2)];
        const x = -5.3 + i * 1.5;
        B0(m, [x, 5.9, -2.9], [x + 0.4, 6.2, -2.5], 0, 0, 0, col, beat < 0.5 || i % 2);
        // the screen at the back pulses too
        B0(m, [-5.5 + i * 1.375, 1.3, -2.94], [-4.2 + i * 1.375, 1.3 + 4.6 * (0.3 + 0.7 * Math.abs(Math.sin(G.time * 3 + i))), -2.93], 0, 0, 0, col, true);
      }
    }
    if (c && c.kind === 'market') {
      for (const s of c.stalls) {
        if (Math.abs(s.x - cp[0]) > 80 || Math.abs(s.z - cp[2]) > 80) continue;
        ER.lightAt(s.x, plan.y + 2, s.z);
        const m = XF.t(s.x - cp[0], plan.y - cp[1], s.z - cp[2]);
        const col = [[0.85, 0.15, 0.15], [0.15, 0.45, 0.9], [0.95, 0.7, 0.1], [0.2, 0.7, 0.3], [0.8, 0.3, 0.8], [0.95, 0.45, 0.1]][s.k];
        B0(m, [-1.2, 0, -1.5], [1.2, 1.0, 1.5], 0, 0, 0, [0.55, 0.38, 0.22]);
        for (const [x, z] of [[-1.2, -1.5], [1.1, -1.5], [-1.2, 1.4], [1.1, 1.4]]) B0(m, [x, 1, z], [x + 0.1, 2.5, z + 0.1], 0, 0, 0, [0.4, 0.3, 0.2]);
        for (let i = 0; i < 6; i++) B0(m, [-1.4, 2.5, -1.7 + i * 0.57], [1.4, 2.65, -1.7 + (i + 1) * 0.57], 0, 0, 0, i % 2 ? [0.95, 0.95, 0.9] : col);
        // goods on the counter and a lantern
        for (let i = 0; i < 4; i++) B0(m, [-0.9 + (i % 2) * 1, 1.0, -1.1 + Math.floor(i / 2) * 1.2], [-0.3 + (i % 2) * 1, 1.3, -0.5 + Math.floor(i / 2) * 1.2], 0, 0, 0, [[0.9, 0.3, 0.2], [0.9, 0.8, 0.3], [0.4, 0.8, 0.3], [0.8, 0.5, 0.2]][i]);
        B0(m, [-0.18, 2.1, -0.18], [0.18, 2.45, 0.18], 0, 0, 0, [1, 0.55, 0.2], true);
      }
      // strings of paper lanterns across the square
      for (let k = 0; k < 2; k++) for (let i = 0; i < 14; i++) {
        const x = plan.x - 16 + i * 2.4, z = plan.z - 8 + k * 16, y = plan.y + 4.2 - Math.sin(i / 13 * Math.PI) * 0.8;
        const m = XF.t(x - cp[0], y - cp[1], z - cp[2]);
        B0(m, [-0.2, -0.25, -0.2], [0.2, 0.25, 0.2], 0, 0, 0, [[1, 0.3, 0.2], [1, 0.75, 0.2], [0.95, 0.4, 0.7]][i % 3], true);
      }
    }
    const f = this.fire;
    if (f && Math.abs(f.x - cp[0]) < 90 && Math.abs(f.z - cp[2]) < 90) {
      // tongues of flame licking out of the window, shrinking as the fire dies down
      const k = clamp(f.hp / 100, 0.15, 1);
      for (let i = 0; i < 9; i++) {
        const ph = G.time * (5 + i) + i * 1.7, h = (0.9 + 1.9 * Math.abs(Math.sin(ph))) * k;
        const ox = Math.sin(i * 2.3 + G.time * 0.7) * 1.7 * k, oz = Math.cos(i * 1.7 + G.time * 0.5) * 1.7 * k;
        const m = XF.chain(XF.t(f.x + ox - cp[0], f.y - 0.8 - cp[1], f.z + oz - cp[2]), XF.ry(i * 0.8 + G.time * 2));
        const col = i % 3 === 0 ? [1, 0.85, 0.3] : i % 3 === 1 ? [1, 0.45, 0.08] : [0.95, 0.22, 0.05];
        const w = (0.12 + 0.1 * Math.abs(Math.sin(ph * 1.3))) * k;
        B0(m, [-w, 0, -w], [w, h, w], 0, 0, 0, col, true);
        B0(m, [-w * 0.6, h, -w * 0.6], [w * 0.6, h * 1.25, w * 0.6], 0, 0, 0, [1, 0.9, 0.5], true);
      }
    }
    if (c && c.kind === 'race') {
      // the start arch, and the next checkpoint as a glowing gate
      const r = this.race, next = r ? c.checks[r.i % c.checks.length] : c.start;
      const gate = (q, col, big) => {
        const a = Math.floor(G.time * 4) % 2;
        const m = XF.t(q[0] - cp[0], q[1] - cp[1], q[2] - cp[2]);
        for (const [x0, z0] of [[-4, -4], [3.7, -4], [-4, 3.7], [3.7, 3.7]]) B0(m, [x0, 0, z0], [x0 + 0.3, big ? 5 : 3.5, z0 + 0.3], 0, 0, 0, col, true);
        B0(m, [-4, big ? 5 : 3.5, -4], [4, (big ? 5 : 3.5) + 0.3, -3.7], 0, 0, 0, a ? col : [1, 1, 1], true);
        B0(m, [-4, big ? 5 : 3.5, 3.7], [4, (big ? 5 : 3.5) + 0.3, 4], 0, 0, 0, a ? col : [1, 1, 1], true);
      };
      gate(c.start, [1, 0.85, 0.1], true);
      if (r && r.count <= 0) gate(next, [0.2, 1, 0.5], false);
    }
    ER.ov = 0; ER.color = [1, 1, 1];
  },
};

// the beat of the concert, soft (it is background music)
const ConcertMusic = {
  next: 0, bar: 0,
  tick(at) {
    const ctx = Sound.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const p = G.player.pos, d = Math.hypot(p[0] - at[0], p[2] - at[2]);
    if (d > 70) return;
    const vol = clamp(1 - d / 70, 0, 1) * 0.55 * (G.settings.music === undefined ? 0.3 : G.settings.music) / 0.3;
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
    const spb = 0.5;
    while (this.next < ctx.currentTime + 0.3) {
      const t = this.next, b = this.bar % 16;
      const out = Sound.master;
      Sound.tone(ctx, out, t, 0.18, { wave: 'sine', f0: 110, f1: 40, gain: 0.35 * vol });                 // kick
      if (b % 4 === 2) Sound.noise(ctx, out, t, 0.12, { type: 'highpass', freq: 1800, gain: 0.12 * vol });  // clap
      Sound.noise(ctx, out, t + spb / 2, 0.04, { type: 'highpass', freq: 7000, gain: 0.05 * vol });       // hat
      const bass = [55, 55, 65.4, 49][Math.floor(b / 4)];
      Sound.tone(ctx, out, t + spb / 2, 0.22, { wave: 'sawtooth', f0: bass, gain: 0.07 * vol, filter: ['lowpass', 400, 1] });
      if (b % 2 === 0) { const lead = [440, 523, 587, 659, 587, 523, 494, 523][(this.bar >> 1) % 8]; Sound.tone(ctx, out, t, 0.3, { wave: 'triangle', f0: lead, gain: 0.04 * vol }); }
      this.bar++; this.next += spb;
    }
  },
};

const RaceHud = {
  el: null,
  show(r, c) {
    if (!this.el) { this.el = document.createElement('div'); this.el.id = 'raceHud'; document.body.append(this.el); }
    this.el.innerHTML = `<b>🏁 Street race</b><span>${r.count > 0 ? 'Get ready…' : 'Checkpoint ' + Math.min(r.i, c.checks.length) + ' / ' + c.checks.length}</span><em>${r.t.toFixed(1)} s</em>${G.prog.race ? `<small>Record ${G.prog.race.toFixed(1)} s</small>` : ''}`;
    this.el.classList.add('show');
  },
  hide() { if (this.el) this.el.classList.remove('show'); },
};

// ---------------------------------------------------------------- citizens ----
const CA_JOBS = [
  { k: 'school', name: SCHOOL, at: [0, -31], prof: 'teacher' },
  { k: 'bank', name: 'Banc Central', at: [28, 0], prof: 'banker' },
  { k: 'mall', name: 'the Galeries', at: [-3, -3], prof: 'shopkeeper' },
  { k: 'kiosk', name: 'the kiosk', at: [10, 9], prof: 'librarian' },
  { k: 'park', name: 'the park', at: [-8, 44], prof: 'farmer' },
];
const CA_FUN = [[-8, 1, 'the square'], [-8, 46, 'the park'], [-28, 0, 'the football pitch'], [0, -52, 'the basketball court'], [6, 14, 'the bus stop']];
const Citizens = {
  list: [], t: 0,
  clear() { for (const m of this.list) m.removed = true; this.list = []; },
  // The pavements: the ring round every block (lines at k·DP ± 18.5). A route leaves the block
  // straight to its pavement, follows the pavements (crossing at the corners) and goes in again.
  exit(u, v) {
    const k = Math.round(u / DP), l = Math.round(v / DP), a = u - k * DP, b = v - l * DP;
    if (Math.abs(a) > 18.5 || Math.abs(b) > 18.5) return [u, v];
    return 18.5 - Math.abs(a) < 18.5 - Math.abs(b) ? [k * DP + Math.sign(a || 1) * 18.5, v] : [u, l * DP + Math.sign(b || 1) * 18.5];
  },
  // the corner line next to x, on the side of `to` (so a route never doubles back)
  lattice(x, to) { const k = Math.round(x / DP), c = [k * DP - 18.5, k * DP + 18.5], cost = (q) => Math.abs(x - q) + Math.abs(q - to); return cost(c[0]) <= cost(c[1]) ? c[0] : c[1]; },
  onLine(x) { const k = Math.round(x / DP); return Math.abs(Math.abs(x - k * DP) - 18.5) < 0.01; },
  corner(e, to) { return this.onLine(e[0]) ? [e[0], this.lattice(e[1], to[1])] : [this.lattice(e[0], to[0]), e[1]]; },
  route(a, b) {
    const ea = this.exit(a[0], a[1]), eb = this.exit(b[0], b[1]);
    const ca = this.corner(ea, eb), cb = this.corner(eb, ea);
    const pts = [ea, ca, [cb[0], ca[1]], cb, eb, b], out = [];
    for (const q of pts) if (!out.length || Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) > 0.8) out.push(q);
    return out;
  },
  people(plan) {
    // who lives here: the same neighbours in every game of this world
    const out = [], n = CG ? 16 : 12, plots = plan.plots || [];
    for (let i = 0; i < n; i++) {
      const h = hash3(plan.x, i, plan.z, 55);
      const job = CA_JOBS[Math.floor(hash3(i, 3, plan.x, 56) * CA_JOBS.length)];
      const byMetro = hash3(i, 4, plan.z, 57) < 0.35 || !plots.length;
      const plot = plots[Math.floor(h * plots.length)];
      const home = byMetro ? (i % 2 ? [0, -10] : [0, 55]) : [plot.sign[0] - plan.x, plot.sign[1] - plan.z + (plot.front > 0 ? 1 : -1)];
      const fun = CA_FUN[Math.floor(hash3(i, 5, plan.z, 58) * CA_FUN.length)];
      out.push({ i, name: VILLAGER_NAMES[Math.floor(h * 997) % VILLAGER_NAMES.length], job, home, byMetro, plot: plot && !byMetro ? plot.id : null, fun, late: hash3(i, 6, 1, 59) * 1.2 });
    }
    return out;
  },
  // where someone should be at this hour: [u, v, what]
  goal(c, h) {
    const hh = h - c.late;
    if (hh < 7 || hh >= 22) return null;                                           // asleep
    if (hh < 13) return [c.job.at[0], c.job.at[1], 'work'];
    if (hh < 14) return [-8, 1, 'lunch'];
    if (hh < 17) return [c.job.at[0], c.job.at[1], 'work'];
    if (hh < 20) return [c.fun[0], c.fun[1], 'fun'];
    return [c.home[0], c.home[1], 'home'];
  },
  update(dt, plan, here) {
    if (!here || !G.rules.mobSpawning) { if (this.list.length) this.clear(); return; }
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 2;
      const h = CityAlive.hour();
      if (!this.who || this.who.plan !== plan) this.who = { plan, people: this.people(plan) };
      for (const c of this.who.people) {
        let m = this.list.find((q) => q.cit === c && !q.removed);
        const g = this.goal(c, h);
        if (!g) { if (m) { m.removed = true; } continue; }
        if (!m) {
          // appear at home (or at the metro) and walk from there; or already where they should be
          const start = c.appeared ? [g[0], g[1]] : c.home;
          c.appeared = true;
          m = Ents.spawnMob('villager', plan.x + start[0] + 0.5, plan.y + 0.01, plan.z + start[1] + 0.5);
          m.persistent = true; m.citizen = true; m.cit = c;
          m.prof = c.job.prof; m.skin = VILLAGER_SKIN[c.job.prof] || VILLAGER_SKIN.farmer; m.name = c.name;
          m.home = [m.pos[0], m.pos[2]]; m.homeR = 2.5;
          this.list.push(m);
        }
        if (!m.goal || m.goal[2] !== g[2]) {
          m.goal = g;
          const here2 = [m.pos[0] - plan.x, m.pos[2] - plan.z];
          m.path = this.route(here2, [g[0] + 0.5, g[1] + 0.5]).map((q) => [plan.x + q[0], plan.z + q[1]]);
        }
      }
      this.list = this.list.filter((m) => !m.removed);
    }
    for (const m of this.list) this.walk(m, dt, plan);
  },
  walk(m, dt, plan) {
    if (!m.path || !m.path.length) return;
    const q = m.path[0], dx = q[0] - m.pos[0], dz = q[1] - m.pos[2], d = Math.hypot(dx, dz);
    if (d < 1.1) {
      m.path.shift(); m.walkTo = null;
      if (!m.path.length) {
        m.home = [q[0], q[1]]; m.homeR = m.goal[2] === 'work' ? 2 : 4;
        // the metro takes the commuters home
        if (m.goal[2] === 'home' && m.cit.byMetro) m.removed = true;
      }
      return;
    }
    m.walkTo = [q[0], q[1]];
  },
  talk(m) {
    const c = m.cit, g = m.goal ? m.goal[2] : 'work';
    const line = { work: 'Busy day at ' + c.job.name + '!', lunch: 'Lunch break in the square, finally.', fun: 'Off to ' + c.fun[2] + ' before dinner.', home: c.byMetro ? 'Taking the metro home.' : 'Heading home, see you tomorrow!' }[g];
    const p = GPanel.open({ title: c.name, sub: (PROF_NAMES[c.job.prof] || 'Neighbour') + ' · ' + c.job.name, icon: '🙂', width: 380 });
    p.body.innerHTML = `<div class="gp-card"><p class="gp-big" style="font-size:18px">“${GPanel.esc(line)}”</p>
      <p>${c.byMetro ? '🚇 Lives outside the district and comes by metro' : '🏠 Lives on plot ' + GPanel.esc(String(c.plot || '').slice(1))}</p>
      <p>🕗 Works 8–13 and 14–17 · lunch at 13 · ${GPanel.esc(c.fun[2])} after work</p></div>`;
  },
};

// the walking of citizens: the normal mob AI, steered to the next corner of their route
{
  const up = Mob.prototype.update;
  Mob.prototype.update = function (dt) {
    if (this.citizen && this.walkTo && !this.dead) { const ai = this.ai; ai.state = 'walk'; ai.timer = 5; ai.tx = this.walkTo[0]; ai.tz = this.walkTo[1]; }
    return up.call(this, dt);
  };
}

// ---------------------------------------------------------------- crowds on the metro and the buses ----
const Crowd = {
  render(cp) {
    const h = CityAlive.hour();
    const rush = (h >= 7.5 && h < 9.5) || (h >= 17 && h < 19.5) ? 1 : h >= 6.5 && h < 22 ? 0.35 : 0;
    if (!rush) return;
    const skins = Object.values(VILLAGER_SKIN).concat(STUDENT_SKINS);
    const seatFor = (v, list) => {
      const n = Math.round(list.length * rush);
      for (let i = 0; i < n; i++) {
        const k = (i * 5 + (v.metro ? v.metro.k * 3 : 1)) % list.length;
        if (v === G.vehicle && v.metro && k === Metro.mySeat()) continue;
        if (v === G.vehicle && v.busLine && k === 1) continue;
        if (Math.abs(v.pos[0] - cp[0]) > 70 || Math.abs(v.pos[2] - cp[2]) > 70) return;
        Passengers.renderSeated(v, list[k], cp, skins[(k * 7 + i) % skins.length], null);
      }
    };
    for (const v of Metro.trains.values()) seatFor(v, PASSENGER_SEATS.metro);
    if (typeof Bus !== 'undefined') for (const b of Object.values(Bus.buses)) if (b && b.v) seatFor(b.v, PASSENGER_SEATS.bus);
  },
};

// ---------------------------------------------------------------- hooks ----
{
  // runs with the other city systems (and draws after the weather)
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); CityAlive.update(dt || 0.016); };
  const wr = Weather.render;
  Weather.render = function (cp) { wr.call(this, cp); CityAlive.render(cp); };
  // lightning over the district can cut the power
  const st = Weather.strike;
  Weather.strike = function (x, z) {
    st.call(this, x, z);
    const plan = CityAlive.district();
    if (plan && Math.hypot(x - plan.x, z - plan.z) < 160 && CityAlive.near(plan, 220) && Math.random() < 0.3) Blackout.start(plan);
  };
  // citizens and the people of an event are never stashed with the animals (they would come back
  // as plain villagers): they are made again when you come back
  const kp = Ents.keepable;
  Ents.keepable = function (m) { if (m.citizen || m.eventNpc) return false; return kp.call(this, m); };
  // the traffic is never saved, boarded, hit or picked up
  const ser = Vehicles.serialize;
  Vehicles.serialize = function () { const keep = this.list; this.list = keep.filter((v) => !v.traffic); try { return ser.call(this); } finally { this.list = keep; } };
  const vb = Vehicles.board;
  Vehicles.board = function (v) { if (v && v.traffic) { G.ui.toast(v.traffic === 'amb' ? '🚑 Not now, they are on an emergency!' : v.traffic === 'fire' ? '🚒 The firefighters are busy' : '🚗 That car is not yours · call a /taxi'); return; } return vb.call(this, v); };
  const pk = Vehicles.pickUp;
  Vehicles.pickUp = function (v) { if (v && v.traffic) return; return pk.call(this, v); };
  if (Vehicles.hit) { const vh = Vehicles.hit; Vehicles.hit = function (v) { if (v && v.traffic) return; return vh.call(this, v); }; }
  // chatting with a neighbour, and water on the fire
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.mob && t.mob.citizen && !t.mob.dead) { Citizens.talk(t.mob); this.swingHand(); return true; }
    const held = G.inv.held;
    if (initial && held && held.id === I.WATER_BUCKET && CityEvents.fire && CityEvents.douse()) { this.swingHand(); return true; }
    return use.call(this, initial);
  };
  // no lifts in a blackout
  if (typeof Lift !== 'undefined') {
    const lu = Lift.update;
    Lift.update = function (dt) { if (Blackout.on && !this.ride) { const p = G.player; if (p.onGround && G.world.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] - 0.2), Math.floor(p.pos[2])) === B.LIFT_FLOOR && !this.dark) { this.dark = true; G.ui.toast('🛗 Out of service: blackout'); } return; } this.dark = false; return lu.call(this, dt); };
  }
}

SYNTH.siren2 = (ctx, o, t) => { for (let i = 0; i < 2; i++) Sound.tone(ctx, o, t + i * 0.42, 0.4, { wave: 'triangle', f0: i ? 700 : 950, f1: i ? 950 : 700, gain: 0.1 }); };
SYNTH.power_down = (ctx, o, t) => { Sound.tone(ctx, o, t, 1.4, { wave: 'sawtooth', f0: 180, f1: 30, gain: 0.12, filter: ['lowpass', 900, 1] }); Sound.noise(ctx, o, t, 0.25, { type: 'bandpass', freq: 2500, q: 1, gain: 0.3 }); };
SYNTH.power_up = (ctx, o, t) => { Sound.tone(ctx, o, t, 0.9, { wave: 'sine', f0: 60, f1: 220, gain: 0.1 }); };
SYNTH.pling = (ctx, o, t) => { Sound.tone(ctx, o, t, 0.25, { wave: 'sine', f0: 1320, gain: 0.12 }); };
SYNTH.hail_tick = (ctx, o, t) => { for (let i = 0; i < 3; i++) Sound.noise(ctx, o, t + Math.random() * 0.1, 0.02, { type: 'highpass', freq: 3500 + Math.random() * 3000, gain: 0.08 }); };
