'use strict';
// The metro runs on a timetable, and players can ride in other players' vehicles.
//
// Line: campus.js / district.js build Universitat and Catalunya; the control panel (metro_panel.js)
// adds stations further on. MetroNet follows the rails to find the whole line, its platforms and,
// on double-track lines, the second track (the twin) that runs back the other way.
//
// Trains: every line has a fixed cycle worked out from its track (Metro.build): out along the
// first track stopping at every station, a few seconds at the terminus while the driver changes
// cab, back along the twin (over a crossover just outside the station) stopping at the far
// platforms, and over the other crossover into the first terminus again. Single-track lines
// shuttle on their one track. Where each train is comes from the clock alone, so every player
// sees the same trains in the same places (nothing is spawned per player any more, nothing
// collides) and the platforms can say when the next one comes. Long lines run several trains,
// spaced along the cycle. A train is only built as a vehicle while someone is near it.
// Right-click it while it stands at a platform to get on; Shift at a station gets you off.
//
// Passengers: right-click another player's car, bus, boat or helicopter to sit in one of its free
// seats (`ps`: [driver's peer id, seat]). On the metro and the buses, which every player drives
// the same, the presence only says which train and seat (`sv`) and everybody draws you there.

const METRO_LEN = 20.7;   // from the lead car's centre to the back of the last car
const METRO_STOP = { dwell: 9, end: 14, announce: 5 };
const METRO_RUN = { vmax: 11, acc: 1.3, body: 16.7, tail: 26, cross: 6 };
// Passenger seats in each vehicle (local coordinates, like def.seat).
const PASSENGER_SEATS = {
  car: [[-0.42, 0.42, -0.1], [0.42, 0.42, -1.25], [-0.42, 0.42, -1.25]],
  bus: [[-0.6, 0.95, 2.6], [0.6, 0.95, 1.2], [-0.6, 0.95, 1.2], [0.6, 0.95, -0.4], [-0.6, 0.95, -0.4], [0.6, 0.95, -2], [-0.6, 0.95, -2]],
  boat: [[0, 0.4, 0.35], [0, 0.4, -0.35]],
  heli: [[-0.42, 0.55, 0.55], [0.42, 0.55, -0.6], [-0.42, 0.55, -0.6]],
  metro: [[0.7, 0.75, -2], [-0.7, 0.75, -2], [0.7, 0.75, -10.5], [-0.7, 0.75, -10.5], [0.7, 0.75, -18.5], [-0.7, 0.75, -18.5], [0.7, 0.75, 1.2], [-0.7, 0.75, -6.5]],
  dozer: [[0.5, 1.3, -0.6]],
};

// distance and speed after t seconds on a run of length L (accelerate, cruise, brake)
function runProfile(L, vmax, acc) {
  const full = L >= vmax * vmax / acc;
  const t1 = full ? vmax / acc : Math.sqrt(L / acc);
  const top = full ? vmax : acc * t1;
  const tt = full ? 2 * t1 + (L - vmax * vmax / acc) / vmax : 2 * t1;
  return {
    tt,
    at(t) {
      if (t <= 0) return [0, 0];
      if (t >= tt) return [L, 0];
      if (t < t1) return [acc * t * t / 2, acc * t];
      if (t > tt - t1) { const r = tt - t; return [L - acc * r * r / 2, acc * r]; }
      return [acc * t1 * t1 / 2 + (t - t1) * top, top];
    },
  };
}
// a polyline with its running length, and the point at any length along it
function polyline(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function polyAt(P, s) {
  const { pts, cum } = P;
  if (s <= 0) return pts[0];
  if (s >= P.len) return pts[pts.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], k = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
const timeText = (t) => (t < 60 ? Math.ceil(t) + ' s' : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'));

const Metro = {
  routes: new Map(),   // line -> its cycle
  trains: new Map(),   // 'line:k' -> the train's vehicle, while someone is near it
  st: new Map(),       // 'line:k' -> what that train was doing last frame (for the chimes)
  sign: null, signT: 0, hudT: 0,

  clock() { return Date.now() / 1000; },
  // the line as traced along its rails (metro_panel.js): path, index of each cell, stations
  net() { return typeof MetroNet !== 'undefined' ? MetroNet.current(G.player.pos) : null; },

  // ---- the cycle of a line ----
  route(N) {
    let R = this.routes.get(N.n);
    if (R && R.N === N) return R;
    try { R = this.build(N); } catch (e) { console.warn('Blocklands: metro route', e); R = null; }
    if (R) R.N = N;
    this.routes.set(N.n, R);
    return R;
  },
  build(N) {
    const S = N.stations, A = N.path;
    if (!S || S.length < 2 || A.length < 6) return null;
    const pt = (path, i) => {
      const n = path.length, c = (j) => [path[j][0] + 0.5, path[j][1] + 2 / 16, path[j][2] + 0.5];
      if (i >= 0 && i < n) return c(i);
      const [a, b, k] = i < 0 ? [c(0), c(1), -i] : [c(n - 1), c(n - 2), i - n + 1];
      return [a[0] + (a[0] - b[0]) * k, a[1], a[2] + (a[2] - b[2]) * k];
    };
    const seq = (path, i0, i1) => { const out = [], d = i1 >= i0 ? 1 : -1; for (let i = i0; i !== i1 + d; i += d) out.push(pt(path, i)); return out; };
    const tailOf = (path, i, dir) => seq(path, i - dir * METRO_RUN.tail, i - dir);
    const legs = [];
    const leg = (tail, pts, stop, dwell) => {
      const P = polyline(tail.concat(pts)), s0 = polyline(tail.concat([pts[0]])).len;
      const L = Math.max(0.5, P.len - s0), prof = runProfile(L, METRO_RUN.vmax, METRO_RUN.acc);
      legs.push({ P, s0, L, prof, stop, dwell });
    };
    const first = S[0], last = S[S.length - 1], name = (k) => S[k].name;
    const T = N.twin, X = METRO_RUN.cross;
    const aX1 = last.i0 - 2, aX0 = first.i1 + 2;
    const double = T && T.bOf && aX1 - X > aX0 + X;
    // out along the first track, a stop at every platform
    for (let k = 0; k < S.length - 1; k++) {
      const end = k + 1 === S.length - 1;
      leg(tailOf(A, S[k].hp, 1), seq(A, S[k].hp, S[k + 1].hp), { st: k + 1, plat: 'A', dir: 1, to: end ? name(0) : name(S.length - 1), end }, end ? METRO_STOP.end : METRO_STOP.dwell);
    }
    if (double) {
      // back: over the crossover onto the twin, the far platforms, and over into the terminus
      const B = T.path, bOf = T.bOf;
      const ptB = (ai) => pt(B, bOf[clamp(ai, 0, bOf.length - 1)]);
      const cross = (from, to, a0) => {
        const out = [];
        for (let j = 1; j < X; j++) {
          const f = j / X, e = f * f * (3 - 2 * f), p = from(a0 - j), q = to(a0 - j);
          out.push([p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e, p[2] + (q[2] - p[2]) * e]);
        }
        return out;
      };
      const ptA = (ai) => pt(A, ai);
      let pts = seq(A, last.hm, aX1).concat(cross(ptA, ptB, aX1));
      let bi = bOf[aX1 - X], tail = tailOf(A, last.hm, -1);
      for (let k = S.length - 2; k >= 1; k--) {
        const bs = T.stations.find((q) => q.a === k);
        if (!bs || bs.hm >= bi) continue;
        pts = pts.concat(seq(B, bi, bs.hm));
        leg(tail, pts, { st: k, plat: 'B', dir: -1, to: name(0) }, METRO_STOP.dwell);
        tail = tailOf(B, bs.hm, -1); bi = bs.hm; pts = [];
      }
      const bEnd = bOf[aX0 + X];
      pts = pts.concat(seq(B, bi, Math.min(bi, bEnd)), cross(ptB, ptA, aX0 + X), seq(A, aX0, first.hm));
      leg(tail, pts, { st: 0, plat: 'A', dir: -1, to: name(S.length - 1), end: true }, METRO_STOP.end);
    } else {
      // one track: back the same way, stopping again
      for (let k = S.length - 1; k > 0; k--) {
        const end = k - 1 === 0;
        leg(tailOf(A, S[k].hm, -1), seq(A, S[k].hm, S[k - 1].hm), { st: k - 1, plat: 'A', dir: -1, to: end ? name(S.length - 1) : name(0), end }, end ? METRO_STOP.end : METRO_STOP.dwell);
      }
    }
    let t = 0;
    for (const l of legs) { l.t0 = t; l.arr = t + l.prof.tt; t = l.arr + l.dwell; }
    const cycle = t;
    const count = double ? clamp(Math.floor(cycle / 45), 1, 6) : 1;
    // a bounding box, to know when anybody is near the line
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, y = 0;
    for (const c of A) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); z0 = Math.min(z0, c[2]); z1 = Math.max(z1, c[2]); y = c[1]; }
    return { n: N.n, legs, cycle, count, double, box: [x0, z0, x1, z1, y], offset: (N.n * 37.3) % cycle };
  },
  // where train k of a route is at time t
  state(R, k, t) {
    const ph = (((t + R.offset + (k * R.cycle) / R.count) % R.cycle) + R.cycle) % R.cycle;
    let j = 0;
    while (j < R.legs.length - 1 && R.legs[j + 1].t0 <= ph) j++;
    const l = R.legs[j], dt = ph - l.t0;
    const [d, v] = dt < l.prof.tt ? l.prof.at(dt) : [l.L, 0];
    const s = l.s0 + d, head = polyAt(l.P, s), back = polyAt(l.P, s - METRO_RUN.body);
    return { j, leg: l, run: dt < l.prof.tt, left: l.arr + l.dwell - ph, speed: v, pos: head, yaw: Math.atan2(head[0] - back[0], head[2] - back[2]) };
  },
  near(R, p, r) {
    const b = R.box;
    return p[0] > b[0] - r && p[0] < b[2] + r && p[2] > b[1] - r && p[2] < b[3] + r && Math.abs(p[1] - b[4]) < 70;
  },

  update(dt) {
    this.updateSign(dt);
    Passengers.update(dt);
    if (typeof MetroStrip !== 'undefined') MetroStrip.update();
    const lines = typeof MetroNet !== 'undefined' ? MetroNet.all() : [];
    const p = G.player.pos, t = this.clock(), seen = new Set();
    for (const N of lines) {
      const R = this.route(N);
      if (!R || !this.near(R, p, 160)) continue;
      for (let k = 0; k < R.count; k++) {
        const key = N.n + ':' + k, s = this.state(R, k, t);
        let v = this.trains.get(key);
        if (v && (v.removed || !Vehicles.list.includes(v))) { this.trains.delete(key); v = null; }
        const close = Math.hypot(s.pos[0] - p[0], s.pos[2] - p[2]) < 150 && Math.abs(s.pos[1] - p[1]) < 45;
        if (!close && G.vehicle !== v) { if (v) v.removed = true; this.trains.delete(key); this.st.delete(key); continue; }
        seen.add(key);
        if (!v) {
          v = Rides.spawn('metro', s.pos[0], s.pos[1], s.pos[2], s.yaw, 0);
          v.scripted = true; v.metro = { n: N.n, k }; v.onGround = true;
          this.trains.set(key, v);
        }
        this.place(v, s, R, N);
        this.events(key, v, s, N);
      }
    }
    // trains of lines nobody is near any more (or that were rebuilt)
    for (const [key, v] of this.trains) if (!seen.has(key) && G.vehicle !== v) { v.removed = true; this.trains.delete(key); this.st.delete(key); }
    this.updateHud(dt);
  },
  place(v, s, R, N) {
    const prev = v.pos;
    v.pos = s.pos.slice();
    v.yaw = s.yaw; v.pitch = 0; v.roll = 0;
    v.speed = s.speed; v.vel = [0, 0, 0]; v.onGround = true;
    v.rpm = 0.15 + s.speed / METRO_RUN.vmax * 0.75;
    // what the line strip and the panel read
    const st = s.leg.stop;
    v.auto = { line: N.n, target: st.st, state: s.run ? 'run' : 'dwell', dir: st.dir, to: st.to, left: s.left };
    if (Math.hypot(prev[0] - v.pos[0], prev[2] - v.pos[2]) > 4) v.rail = null;
    if (v.basis) v.basis();
  },
  events(key, v, s, N) {
    const was = this.st.get(key), now = { j: s.j, run: s.run, said: was && was.j === s.j ? was.said : false };
    this.st.set(key, now);
    if (!was) return;
    const S = N.stations, stop = s.leg.stop, here = S[stop.st];
    if (was.run && !s.run) {
      this.say(v, 'arrive', here ? here.name : '', stop.end ? 'Terminus · all change' : 'Doors open');
      sfx('metro_doors', v.pos, 0.7, 1.1);
    }
    if (!s.run && !now.said && s.left < METRO_STOP.announce) {
      now.said = true;
      const R = this.routes.get(N.n), nx = R && R.legs[(s.j + 1) % R.legs.length], ns = nx && S[nx.stop.st];
      if (ns) this.say(v, 'next', ns.name, 'Doors closing · mind the gap');
    }
    if (!was.run && s.run && was.j !== s.j) sfx('metro_doors', v.pos, 1, 1);
  },

  say(v, kind, name, sub) {
    const p = G.player;
    const aboard = G.vehicle === v;
    const close = Math.hypot(p.pos[0] - v.pos[0], p.pos[2] - v.pos[2]) < 40;
    if (!aboard && !close) return;
    sfx('metro_chime', aboard ? null : v.pos, 1, 1);
    // the stop sign only for whoever is on the train
    if (!aboard) return;
    this.showSign(kind === 'arrive' ? name : 'Next stop: ' + name, sub);
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

  // ---- the platforms: when does the next train come? ----
  // the station and platform you stand on, or null
  platformAt(p) {
    if (typeof MetroNet === 'undefined') return null;
    let best = null;
    for (const N of MetroNet.all()) {
      const R = this.route(N);
      if (!R || !this.near(R, p, 20)) continue;
      N.stations.forEach((st, k) => {
        const tracks = [['A', N.path, st]];
        const bs = N.twin && N.twin.stations.find((q) => q.a === k);
        if (bs) tracks.push(['B', N.twin.path, bs]);
        for (const [plat, path, run] of tracks) for (let i = run.i0; i <= run.i1; i += 2) {
          const c = path[i];
          if (Math.abs(p[1] - (c[1] + 1)) > 2.5) continue;
          const d = Math.hypot(c[0] + 0.5 - p[0], c[2] + 0.5 - p[2]);
          if (d < 7.5 && (!best || d < best.d)) best = { d, N, R, k, plat, st };
        }
      });
    }
    return best;
  },
  // the next trains at a platform: [{ eta, to, boarding }]
  arrivals(R, k, plat, t) {
    const out = [];
    for (let n = 0; n < R.count; n++) {
      const ph = (((t + R.offset + (n * R.cycle) / R.count) % R.cycle) + R.cycle) % R.cycle;
      for (const l of R.legs) {
        if (l.stop.st !== k || l.stop.plat !== plat) continue;
        const since = ph - l.arr;
        if (since >= 0 && since < l.dwell) out.push({ eta: 0, left: l.dwell - since, to: l.stop.to });
        else out.push({ eta: ((l.arr - ph) % R.cycle + R.cycle) % R.cycle, to: l.stop.to });
      }
    }
    return out.sort((a, b) => a.eta - b.eta);
  },
  updateHud(dt) {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.25;
    let el = $('metroHud');
    const at = !G.vehicle && !G.hudHidden ? this.platformAt(G.player.pos) : null;
    if (!at) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'metroHud'; document.body.append(el); }
    const { N, R, k, plat, st } = at, t = this.clock();
    const list = this.arrivals(R, k, plat, t);
    // one row per destination: the next train and the one after
    const rows = [];
    for (const to of [...new Set(list.map((a) => a.to))]) {
      const mine = list.filter((a) => a.to === to);
      const a = mine[0], b = mine[1];
      const big = a.eta === 0 ? (a.left > 1 ? 'Boarding' : 'Departing') : a.eta < 6 ? 'Arriving' : timeText(a.eta);
      rows.push(`<div class="mh-row${a.eta < 6 ? ' now' : ''}"><span>→ ${escapeHtml(to)}</span><b>${big}</b><small>${b ? 'then ' + timeText(b.eta) : 'every ' + timeText(R.cycle / R.count)}${R.double ? ' · platform ' + (plat === 'A' ? 1 : 2) : ''}</small></div>`);
    }
    const clock = typeof Phone !== 'undefined' ? Phone.clock() : '';
    el.style.setProperty('--lc', N.color);
    // the far platform of a terminus: the trains leave from the other one
    const none = `<div class="mh-row"><span>${R.double ? 'Trains leave from platform 1' : 'No service'}</span><small>${R.double ? 'take the underpass ↓' : ''}</small></div>`;
    el.innerHTML = `<h4><i>L${N.n}</i>${escapeHtml(st.name || '')}<em>${clock}</em></h4>${rows.join('') || none}<div class="mh-foot">Right-click the train when it stops · Shift to get off</div>`;
    el.classList.add('show');
  },

  // every train of a line right now (the panel and the maps draw them)
  positions(N) {
    const R = N && this.route(N);
    if (!R) return [];
    const t = this.clock(), out = [];
    for (let k = 0; k < R.count; k++) { const s = this.state(R, k, t); out.push({ x: s.pos[0], y: s.pos[1], z: s.pos[2], dir: s.leg.stop.dir, run: s.run }); }
    return out;
  },
  // forget the cycles (a station was built): the trains come back on the new track
  reset() {
    this.routes.clear();
    for (const [key, v] of this.trains) if (G.vehicle !== v) { v.removed = true; this.trains.delete(key); }
  },
  // get off onto the platform side, not between the tracks
  alight(v) {
    const p = G.player, y = Math.floor(v.pos[1]);
    const opts = [];
    for (const side of [1, -1]) for (const z of [2.8, -3, -10.5, -17]) {
      const q = v.toWorld([side * 2.2, 0, z]);
      const id = G.world.getBlock(Math.floor(q[0]), y, Math.floor(q[2]));
      if (BLOCK_SOLID[id] && !IS_RAIL(id)) opts.push([q[0], y + 1, q[2]]);
    }
    return opts.length ? standNear(p, opts, 0) : false;
  },
  mySeat() {
    const id = String((typeof Net !== 'undefined' && Net.selfPeer) || 'me');
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(h) % PASSENGER_SEATS.metro.length;
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
    p.vel = [0, 0, 0]; p.fallStart = null;
    if (v && standNear(p, [v.toWorld([2.2, 0.5, 0]), v.toWorld([-2.2, 0.5, 0])], v.kind === 'metro' ? 1 : 0)) { Net.sendT = 0; return; }
    if (v) p.pos = v.toWorld([2.2, 0.5, 0]);
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
  // where a remote passenger sits (their presence `ps`, or `sv` on a timetable train or bus)
  seatOf(r) {
    if (Array.isArray(r.sv)) {
      const [kind, line, a, b] = r.sv;
      const v = kind === 'm' ? Metro.trains.get(line + ':' + a) : kind === 'b' && typeof Bus !== 'undefined' && Bus.buses[line] ? Bus.buses[line].v : null;
      const seats = v && PASSENGER_SEATS[v.kind];
      const seat = seats && seats[(kind === 'm' ? b : a) % seats.length];
      return seat ? { v, seat } : null;
    }
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
  // the timetable moves the trains
  const idle0 = Ride.prototype.updateIdle;
  Ride.prototype.updateIdle = function (dt) { if (this.metro) { if (this.basis) this.basis(); return; } idle0.call(this, dt); };
  const pilot0 = Rides.pilot;
  Rides.pilot = function (v, dt, input, horn) {
    if (!v.metro) return pilot0.call(this, v, dt, input, horn);
    const p = G.player, at = v.toWorld(PASSENGER_SEATS.metro[Metro.mySeat()]);
    p.pos = [at[0], at[1] - 0.75, at[2]];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    this.updateMotor(v);
  };
  const board0 = Rides.board;
  Rides.board = function (v) {
    if (v.metro) {
      if (v.auto && v.auto.state === 'run' && v.speed > 0.8) { G.ui.toast('🚇 Wait for the train to stop at the platform'); return; }
      board0.call(this, v);
      G.ui.toast('🚇 All aboard · L' + v.metro.n + (v.auto && v.auto.to ? ' to ' + v.auto.to : '') + ' · Shift to get off at a station', 3500);
      return;
    }
    return board0.call(this, v);
  };
  const dis0 = Vehicles.dismount;
  Vehicles.dismount = function (forced) {
    const v = G.vehicle;
    if (v && v.metro && !forced && v.auto && v.auto.state === 'run') { G.ui.toast('🚇 Wait for the next station'); return; }
    const r = dis0.call(this, forced);
    if (v && v.metro && G.vehicle !== v) Metro.alight(v);
    return r;
  };
  // the line's trains are never saved, hit or picked up
  const ser0 = Vehicles.serialize;
  Vehicles.serialize = function () {
    const keep = this.list;
    this.list = keep.filter((v) => !v.metro);
    try { return ser0.call(this); } finally { this.list = keep; }
  };
  const hit0 = Vehicles.hit;
  if (hit0) Vehicles.hit = function (v) { if (v && v.metro) return; return hit0.call(this, v); };
  const pick0 = Vehicles.pickUp;
  Vehicles.pickUp = function (v) { if (v && v.metro) return; return pick0.call(this, v); };
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
  // presence: where we sit. On a timetable train or bus the others have the same vehicle, so
  // only which one and which seat (no copy of it is sent)
  const pd0 = Net.presenceData;
  Net.presenceData = function () {
    const d = pd0.call(this);
    if (Passengers.seat) d.ps = [Passengers.seat.peer, Passengers.seat.idx];
    const v = G.vehicle;
    if (v && v.metro) { delete d.rd; d.sv = ['m', v.metro.n, v.metro.k, Metro.mySeat()]; }
    else if (v && v.busLine) { delete d.rd; d.sv = ['b', v.busLine, 1]; }
    return d;
  };
  const op0 = Net.onPresence;
  Net.onPresence = function (peer, pr) {
    op0.call(this, peer, pr);
    const r = this.peers.get(peer);
    if (!r) return;
    r.ps = pr && Array.isArray(pr.ps) && typeof pr.ps[0] === 'string' && Number.isInteger(pr.ps[1]) ? pr.ps : null;
    r.sv = pr && Array.isArray(pr.sv) && (pr.sv[0] === 'm' || pr.sv[0] === 'b') && pr.sv.slice(1).every((n) => Number.isInteger(n) && n >= 0 && n < 100) ? pr.sv : null;
  };
}

SYNTH.metro_chime = (ctx, o, t) => {
  [659, 523, 784].forEach((f, i) => Sound.tone(ctx, o, t + i * 0.28, 0.5, { wave: 'sine', f0: f, gain: 0.16 }));
};
SYNTH.metro_doors = (ctx, o, t) => {
  for (let i = 0; i < 4; i++) Sound.tone(ctx, o, t + i * 0.22, 0.12, { wave: 'square', f0: 1400, gain: 0.05, filter: ['lowpass', 3000, 1] });
  Sound.noise(ctx, o, t + 0.9, 0.5, { type: 'bandpass', freq: 800, q: 0.7, gain: 0.25, attack: 0.05 });
};
