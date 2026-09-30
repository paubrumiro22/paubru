'use strict';
// The funfair (fair_gen.js lays out the ground). Four rides that run on the shared clock, so every
// player online sees the same trains and cabins in the same place:
// - the roller coaster: a chain lift, a 24 m drop, a vertical loop, a banked turn, airtime hills
//   and a helix; the trains follow fairTrack() with a real speed profile (gravity, friction,
//   chain, brakes) and a banked, parallel-transported frame, and the rider's camera rolls and
//   loops with the car (mouse look stays free, relative to the seat);
// - the Ferris wheel: 16 cabins, one turn every 96 s, the cabin at the bottom takes you;
// - the carousel: 18 horses bobbing on a turning, lit platform with a music box;
// - the drop tower: 12 seats that climb the mast, wait, drop and brake.
// Ticket machines at each ride (and the Funfair app) open the ride's card. Balloons: balloon.js.

const FAIR_PRICES = { coaster: 15, wheel: 8, carousel: 5, tower: 12 };
const FAIR_G = 12;                        // gravity felt on the coaster, in blocks/s²
const COASTER_CARS = 4, COASTER_GAP = 2.7, COASTER_DWELL = 14;
const WHEEL_PERIOD = 96, CAROUSEL_PERIOD = 26, TOWER_CYCLE = 44;
const FAIR_COLS = [[0.9, 0.18, 0.2], [0.16, 0.5, 0.92], [0.98, 0.78, 0.12], [0.2, 0.72, 0.36], [0.72, 0.28, 0.85], [0.98, 0.5, 0.12]];

const Coaster = {
  // built once from the track: positions (local), frames, speed and time along the run
  build() {
    if (this.pts) return this;
    const raw = fairTrack().slice(0, -1);
    // start the run where the head of a stopped train sits in the station
    const stop = raw.findIndex((p, i) => i > 0 && p.x >= FAIR_STATION.a0 + 14.5);
    const P = raw.slice(stop).concat(raw.slice(0, stop));
    const n = P.length, pos = P.map((p) => [p.x, p.y, p.z]);
    const T = [], U = [], R = [], S = [0];
    for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(pos[i][0] - pos[i - 1][0], pos[i][1] - pos[i - 1][1], pos[i][2] - pos[i - 1][2]));
    const L = S[n - 1] + Math.hypot(pos[0][0] - pos[n - 1][0], pos[0][1] - pos[n - 1][1], pos[0][2] - pos[n - 1][2]);
    for (let i = 0; i < n; i++) { const a = pos[(i - 1 + n) % n], b = pos[(i + 1) % n]; T.push(V3.norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]])); }
    // parallel transport of "up", then spread the twist left over at the end of the circuit
    let u = [0, 1, 0];
    for (let i = 0; i < n; i++) { const t = T[i], d = V3.dot(u, t); u = V3.norm([u[0] - t[0] * d, u[1] - t[1] * d, u[2] - t[2] * d]); U.push(u); }
    {
      const t = T[0], d = V3.dot(u, t), ue = V3.norm([u[0] - t[0] * d, u[1] - t[1] * d, u[2] - t[2] * d]);
      const r0 = V3.cross(t, U[0]), tw = Math.atan2(V3.dot(ue, r0), V3.dot(ue, U[0]));
      for (let i = 0; i < n; i++) U[i] = rotAbout(U[i], T[i], -tw * i / n);
    }
    // speeds: off from the station, the chain at a steady pace, then gravity and friction, brakes at the end
    const v = new Float32Array(n);
    let v2 = 0;
    for (let i = 1; i < n; i++) {
      const ds = S[i] - S[i - 1], k = P[i].k;
      v2 = Math.max(0, v2 + 2 * FAIR_G * (pos[i - 1][1] - pos[i][1]) - 0.22 * ds);
      if (k === 2) v2 = Math.max(v2, 3.6 * 3.6);
      if (S[i] < 14) v2 = Math.max(v2, Math.min(3.2 * 3.2, 2 * 1.6 * S[i]));
      v2 = Math.max(v2, 2.2 * 2.2);
      const left = L - S[i];
      if (left < 90) v2 = Math.min(v2, Math.pow(Math.sqrt(2 * 2.2 * Math.max(0, left - 12)) + 0.6, 2));
      if (left < 12) v2 = Math.min(v2, Math.pow(0.25 + left / 12 * 0.35, 2));
      v[i] = Math.sqrt(v2);
    }
    v[0] = 0.25;
    const t = new Float32Array(n + 1);
    for (let i = 1; i < n; i++) t[i] = t[i - 1] + (S[i] - S[i - 1]) / Math.max(0.3, (v[i] + v[i - 1]) / 2);
    t[n] = t[n - 1] + (L - S[n - 1]) / 0.3;
    // banking from the sideways curvature, smoothed, never in the loop
    const bank = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (P[i].k === 3 || Math.abs(T[i][1]) > 0.8) continue;
      const a = T[(i - 2 + n) % n], b = T[(i + 2) % n], ds = 2 * (S[1] - S[0]) || 1;
      const r = V3.cross(T[i], U[i]), kap = V3.dot([(b[0] - a[0]) / ds, (b[1] - a[1]) / ds, (b[2] - a[2]) / ds], r);
      bank[i] = clamp(Math.atan(v[i] * v[i] * kap / FAIR_G) * 0.8, -1.15, 1.15);
    }
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = -10; j <= 10; j++) s += bank[(i + j + n) % n]; sm[i] = s / 21; }
    for (let i = 0; i < n; i++) { if (Math.abs(sm[i]) > 0.01) U[i] = rotAbout(U[i], T[i], sm[i]); R.push(V3.norm(V3.cross(T[i], U[i]))); }
    Object.assign(this, { pts: P, pos, T, U, R, S, L, v, t, n, run: t[n], cycle: t[n] + COASTER_DWELL, top: Math.max(...v) });
    return this;
  },
  // head of the train at time τ into the cycle: { s, v, running }
  at(tc) {
    if (tc < COASTER_DWELL) return { s: 0, v: 0, running: false, wait: COASTER_DWELL - tc };
    const x = tc - COASTER_DWELL, t = this.t;
    let lo = 0, hi = this.n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; }
    const f = clamp((x - t[lo]) / Math.max(1e-6, t[hi] - t[lo]), 0, 1), s1 = hi >= this.n ? this.L : this.S[hi];
    return { s: this.S[lo] + (s1 - this.S[lo]) * f, v: this.v[lo] + ((this.v[hi % this.n] || 0) - this.v[lo]) * f, running: true, left: this.run - x };
  },
  // position and frame at arc length s (wraps)
  frame(s) {
    const L = this.L, S = this.S, n = this.n;
    s = ((s % L) + L) % L;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const j = hi % n, s1 = hi >= n ? L : S[hi], f = clamp((s - S[lo]) / Math.max(1e-6, s1 - S[lo]), 0, 1);
    const mix = (a, b) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const t = V3.norm(mix(this.T[lo], this.T[j])), u0 = mix(this.U[lo], this.U[j]), d = V3.dot(u0, t);
    const u = V3.norm([u0[0] - t[0] * d, u0[1] - t[1] * d, u0[2] - t[2] * d]);
    return { p: mix(this.pos[lo], this.pos[j]), t, u, r: V3.norm(V3.cross(t, u)), k: this.pts[lo].k };
  },
};
function rotAbout(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), d = V3.dot(v, k), x = V3.cross(k, v);
  return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
}

const Fair = {
  seat: null, wait: null, hint: false, lastYaw: 0, noteT: 0, noteI: 0, sndT: 0,
  site() { const g = G.world && G.world.gen; return g && G.world.type !== 'campnou' && G.slot !== 'jet' ? fairSite(g) : null; },
  now() { return Date.now() / 1000; },
  local(S, p) { return [p[0] - S.x, p[1] - S.F, p[2] - S.z]; },
  inside(p, pad = 0) { const S = this.site(); if (!S) return false; const a = p[0] - S.x, b = p[2] - S.z; return Math.abs(a) <= FAIR_A + pad && b >= FAIR_B0 - pad && b <= FAIR_B1 + pad; },
  name() { return ED('Parc d\'atraccions', 'Funfair'); },

  // ---- ride states on the shared clock ----
  coasterState() { const C = Coaster.build(); return C.at(this.now() % C.cycle); },
  wheelAngle() { return (this.now() / WHEEL_PERIOD) % 1 * Math.PI * 2; },
  carouselAngle() { return (this.now() / CAROUSEL_PERIOD) % 1 * Math.PI * 2; },
  towerY(tc = this.now() % TOWER_CYCLE) {
    if (tc < 10) return 1;
    if (tc < 28) { const k = (tc - 10) / 18; return 1 + 37 * (k * k * (3 - 2 * k)); }
    if (tc < 33) return 38;
    const fall = tc - 33, tf = Math.sqrt(2 * 26 / 9.8);
    if (fall < tf) return 38 - 0.5 * 9.8 * fall * fall;
    const vb = 9.8 * tf, bt = fall - tf, dec = vb * vb / (2 * 11);
    if (bt < vb / dec) return Math.max(1, 12 - (vb * bt - 0.5 * dec * bt * bt));
    return 1;
  },
  towerPhase(tc = this.now() % TOWER_CYCLE) { return tc < 10 ? 'board' : tc < 28 ? 'up' : tc < 33 ? 'top' : tc < 38 ? 'drop' : 'board'; },

  // ---- boarding ----
  open(kind) {
    const S = this.site();
    if (!S) { G.ui.toast('This world has no funfair'); return; }
    if (!kind) { this.menu(); return; }
    const info = {
      coaster: { icon: '🎢', title: ED('Muntanya russa', 'Roller coaster'), text: 'A chain lift to 27 m, a 24 m drop, a vertical loop, a banked turn, airtime hills and a helix.', stats: () => { const C = Coaster.build(), st = this.coasterState(); return [['Top speed', Math.round(C.top * 3.6) + ' km/h'], ['Length', Math.round(C.L) + ' m'], ['Ride', Math.round(C.run) + ' s'], [st.running ? 'Next train' : 'Leaves in', Math.ceil(st.running ? st.left + COASTER_DWELL : st.wait) + ' s']]; } },
      wheel: { icon: '🎡', title: ED('Nòria', 'Ferris wheel'), text: 'A slow turn 36 m up: the whole city, the sea and the mountains.', stats: () => [['Height', '36 m'], ['Cabins', FAIR_WHEEL.n], ['One turn', WHEEL_PERIOD + ' s']] },
      carousel: { icon: '🎠', title: ED('Cavallets', 'Carousel'), text: 'Horses that rise and fall to a music box, under a roof of lights. Get off whenever you like.', stats: () => [['Horses', 18], ['One turn', CAROUSEL_PERIOD + ' s']] },
      tower: { icon: '🗼', title: ED('Torre de caiguda', 'Drop tower'), text: 'Up the 42 m mast, a moment of silence at the top… and free fall.', stats: () => { const tc = this.now() % TOWER_CYCLE; return [['Height', '40 m'], ['Free fall', '2.3 s'], [this.towerPhase(tc) === 'board' ? 'Leaves in' : 'Back down in', Math.ceil(tc < 10 ? 10 - tc : TOWER_CYCLE - tc + 10) + ' s']]; } },
    }[kind];
    if (!info) return;
    const price = FAIR_PRICES[kind];
    const q = GPanel.open({ title: info.title, icon: info.icon, sub: this.name() + ' · ' + CITY, width: 440, cls: 'gp-fair' });
    const draw = () => {
      if (!q.body.isConnected) { clearInterval(iv); return; }
      q.body.innerHTML = `<div class="fr-card"><div class="fr-hero">${info.icon}</div><p>${info.text}</p>
        <div class="fr-stats">${info.stats().map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
        <button class="gp-btn ok fr-go">${G.mode === 'creative' ? '' : '🪙 ' + price + ' · '}Ride</button></div>`;
      q.body.querySelector('.fr-go').addEventListener('click', () => {
        if (this.seat) { G.ui.toast('You are already on a ride'); return; }
        if (!Shops.pay(price)) { G.ui.toast('🪙 A ride costs ' + price + ' coins'); sfx('gate_no', null, 0.6, 1); return; }
        q.close();
        this.board(kind);
      });
    };
    const iv = setInterval(draw, 1000);
    draw();
  },
  menu() {
    const S = this.site();
    const q = GPanel.open({ title: this.name(), icon: '🎡', sub: CITY, width: 460, cls: 'gp-fair' });
    const rides = [['coaster', '🎢', ED('Muntanya russa', 'Roller coaster')], ['wheel', '🎡', ED('Nòria', 'Ferris wheel')], ['carousel', '🎠', ED('Cavallets', 'Carousel')], ['tower', '🗼', ED('Torre de caiguda', 'Drop tower')], ['balloon', '🎈', ED('Globus aerostàtic', 'Hot-air balloon')]];
    const inFair = this.inside(G.player.pos, 20);
    q.body.innerHTML = `<div class="fr-menu">${rides.map(([k, i, n]) => `<button class="fr-ride" data-k="${k}"><span>${i}</span><b>${n}</b><small>${k === 'balloon' ? '🪙 ' + BALLOON_PRICE : '🪙 ' + FAIR_PRICES[k]}</small></button>`).join('')}</div>
      <p class="gp-dim">${inFair ? 'Tickets at the machine by each ride, or here.' : 'The funfair is north of the district. Mark it on your map and walk up the path.'}</p>
      ${inFair ? '' : '<button class="gp-btn ok fr-mark">📍 Mark it on my map</button>'}`;
    q.body.querySelectorAll('.fr-ride').forEach((b) => b.addEventListener('click', () => {
      if (!inFair) { G.ui.toast('Go to the funfair first'); return; }
      q.close();
      if (b.dataset.k === 'balloon') Balloons.open(); else this.open(b.dataset.k);
    }));
    const m = q.body.querySelector('.fr-mark');
    if (m) m.addEventListener('click', () => {
      G.markers = G.markers || [];
      const x = Math.round(S.x), z = Math.round(S.z + FAIR_B1);
      if (!G.markers.some((k) => k.x === x && k.z === z)) G.markers.push({ x, z, name: '🎡 ' + this.name(), color: '#ff4fd8' });
      const d = Math.hypot(x - G.player.pos[0], z - G.player.pos[2]);
      G.ui.banner('🎡', this.name() + ' · ' + Math.round(d) + ' blocks · marked on your map (M)');
      q.close();
    });
  },
  board(kind) {
    const S = this.site(), p = G.player;
    if (!S) return;
    if (G.vehicle) Vehicles.dismount(true);
    if (p.seat) Furniture.stand(p);
    p.flying = false;
    const seat = { kind, t0: this.now(), yaw0: p.yaw };
    if (kind === 'coaster') {
      const st = this.coasterState();
      if (st.running || st.wait < 2.5) {
        this.wait = { kind, until: this.now() + (st.running ? st.left : st.wait) + 0.5 };
        G.ui.banner('🎢', 'Your seat is booked: wait on the platform for the next train (' + Math.ceil(st.running ? st.left + 1 : st.wait + 1) + ' s)');
        return;
      }
      seat.car = 0; seat.row = 0; seat.side = Math.random() < 0.5 ? -1 : 1;   // the front row: the best view
      p.yaw = 0; p.pitch = -0.05;
      G.ui.banner('🎢', 'Lap bar down · hold on!');
    } else if (kind === 'wheel') {
      const th = this.wheelAngle(), n = FAIR_WHEEL.n;
      let best = 0, bd = 9;
      for (let i = 0; i < n; i++) { const a = ((th + i / n * Math.PI * 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2), d = Math.min(a, Math.PI * 2 - a); if (d < bd) { bd = d; best = i; } }
      seat.i = best;
      p.yaw = Math.PI; p.pitch = 0;
      G.ui.banner('🎡', 'Enjoy the view · one full turn');
    } else if (kind === 'carousel') {
      const C = FAIR_CAROUSEL, ph = this.carouselAngle();
      let best = 0, bd = 1e9;
      for (let i = 0; i < 18; i++) { const h = this.horse(S, i, ph); const d = Math.hypot(h.x - p.pos[0], h.z - p.pos[2]); if (d < bd) { bd = d; best = i; } }
      seat.i = best; void C;
      G.ui.banner('🎠', 'Round and round · Shift to get off');
    } else if (kind === 'tower') {
      if (this.towerPhase() !== 'board') {
        const tc = this.now() % TOWER_CYCLE;
        this.wait = { kind, until: this.now() + (TOWER_CYCLE - tc) + 0.5 };
        G.ui.banner('🗼', 'Seat booked: the next ride goes up in ' + Math.ceil(TOWER_CYCLE - tc + 1) + ' s');
        return;
      }
      const T = FAIR_TOWER;
      const ang = Math.atan2(p.pos[2] - (S.z + T.b), p.pos[0] - (S.x + T.a));
      seat.i = ((Math.round(ang / (Math.PI / 6)) % 12) + 12) % 12;
      const o = this.towerSeat(S, seat.i, 1);
      p.yaw = Math.atan2(-o.out[0], -o.out[2]); p.pitch = 0;
      G.ui.banner('🗼', 'Seat belt on · look down when it stops at the top');
    }
    this.seat = seat;
    const pr = G.prog || (G.prog = {});
    pr.fair = pr.fair || {};
    pr.fair[kind] = (pr.fair[kind] || 0) + 1;
    if (Object.keys(pr.fair).length >= 4 && !pr.fairAll) { pr.fairAll = 1; Shops.earn(60); G.ui.banner('🏆', 'Every ride at the funfair! +60 coins'); }
    sfx('click', null, 0.8, 0.8);
  },
  leave(msg) {
    const s = this.seat, S = this.site(), p = G.player;
    this.seat = null;
    if (!S || !s) return;
    let to;
    if (s.kind === 'coaster') to = [S.x + FAIR_STATION.a0 + 8, S.F + 2, S.z + FAIR_STATION.b + 3.5];
    else if (s.kind === 'wheel') to = [S.x + FAIR_WHEEL.a + 0.5, S.F, S.z + FAIR_WHEEL.b + 4];
    else if (s.kind === 'carousel') to = [S.x + FAIR_CAROUSEL.a + 0.5, S.F, S.z + FAIR_CAROUSEL.b + FAIR_CAROUSEL.R + 2.5];
    else { const o = this.towerSeat(S, s.i, 1); to = [o.x + o.out[0] * 2.2, S.F, o.z + o.out[2] * 2.2]; }
    p.pos = to; p.vel = [0, 0, 0]; p.fallStart = null; p.landed = 0;
    if (s.kind === 'coaster') p.yaw = s.yaw0;
    liftOutOfBlocks(p);
    Net.teleported && Net.teleported();
    this.hud();
    if (msg) G.ui.toast(msg);
  },

  // ---- geometry of each ride in world space ----
  wheelCabin(S, i, th) {
    const Wh = FAIR_WHEEL, a = th + i / Wh.n * Math.PI * 2;
    return { x: S.x + Wh.a + 0.5 + Math.sin(a) * Wh.R, y: S.F + Wh.y - Math.cos(a) * Wh.R, z: S.z + Wh.b + 0.5, a };
  },
  horse(S, i, ph) {
    const C = FAIR_CAROUSEL, inner = i >= 12, k = inner ? i - 12 : i, n = inner ? 6 : 12, r = inner ? 3.3 : 5.4;
    const a = ph + (k + (inner ? 0.5 : 0)) / n * Math.PI * 2;
    const bob = Math.sin(ph * 5 + k * 1.3 + (inner ? 1 : 0)) * 0.35;
    return { x: S.x + C.a + 0.5 + Math.cos(a) * r, y: S.F + 0.95 + bob, z: S.z + C.b + 0.5 + Math.sin(a) * r, a, yaw: Math.PI - a };
  },
  towerSeat(S, i, y) {
    const T = FAIR_TOWER, side = Math.floor(i / 3), k = i % 3 - 1;
    const out = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]][side], along = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]][side];
    return { x: S.x + T.a + 0.5 + out[0] * 2.3 + along[0] * k * 1.05, y: S.F + y, z: S.z + T.b + 0.5 + out[2] * 2.3 + along[2] * k * 1.05, out, along };
  },
  // world position, frame and eye of the rider's coaster seat
  coasterSeat(S, st, s) {
    const f = Coaster.frame(st.s - s.car * COASTER_GAP - 1.1 + (s.row ? -0.6 : 0.35));
    const base = [S.x + 0.5 + f.p[0], S.F + f.p[1], S.z + 0.5 + f.p[2]];
    const off = (r, u) => [base[0] + f.r[0] * r + f.u[0] * u, base[1] + f.r[1] * r + f.u[1] * u, base[2] + f.r[2] * r + f.u[2] * u];
    return { f, eye: off(s.side * 0.3, 1.5), foot: off(s.side * 0.3, 0.35) };
  },

  // ---- per frame ----
  update(dt) {
    const S = this.site(), p = G.player;
    if (!S) { if (this.seat) this.seat = null; return; }
    const d = Math.hypot(p.pos[0] - S.x, p.pos[2] - S.z);
    if (!this.hint && this.inside(p.pos, -2)) { this.hint = true; G.ui.banner('🎡', this.name() + ' · tickets at the machines by each ride'); }
    // a booked seat: board when the ride is ready
    if (this.wait && !this.seat) {
      const w = this.wait;
      if (d > 140) this.wait = null;
      else if (w.kind === 'coaster') { const st = this.coasterState(); if (!st.running && st.wait > 2.5) { this.wait = null; this.board('coaster'); } }
      else if (w.kind === 'tower' && this.towerPhase() === 'board' && this.now() % TOWER_CYCLE < 8) { this.wait = null; this.board('tower'); }
    }
    this.sounds(dt, S, d);
    const s = this.seat;
    if (!s) { this.hud(); return; }
    let foot;
    if (s.kind === 'coaster') {
      const st = this.coasterState();
      if (st.running) s.ran = true;
      else if (s.ran) { this.leave('🎢 What a ride!'); sfx('achieve', null, 0.7, 1.1); return; }
      const q = this.coasterSeat(S, st, s);
      foot = [q.eye[0], q.eye[1] - 1.62, q.eye[2]];
      s.q = q; s.v = st.v;
    } else if (s.kind === 'wheel') {
      const c = this.wheelCabin(S, s.i, this.wheelAngle());
      foot = [c.x, c.y - 2.75, c.z];
      if (this.now() - s.t0 > WHEEL_PERIOD - 1.5) { this.leave('🎡 Back on the ground'); return; }
    } else if (s.kind === 'carousel') {
      const h = this.horse(S, s.i, this.carouselAngle());
      foot = [h.x, h.y + 0.25, h.z];
    } else if (s.kind === 'tower') {
      const tc = this.now() % TOWER_CYCLE, ph = this.towerPhase(tc);
      const o = this.towerSeat(S, s.i, this.towerY(tc));
      foot = [o.x, o.y - 0.37, o.z];
      if (ph === 'top' && !s.top) { s.top = true; G.ui.toast('😶 …', 1500); }
      if (ph === 'drop' && !s.dropped) { s.dropped = true; sfx('tower_drop', null, 1, 1); }
      if (s.dropped && ph === 'board') { this.leave('🗼 Legs still shaking?'); return; }
      if (ph === 'drop' && tc > 34.5 && tc < 36) G.shake = Math.max(G.shake || 0, 0.8);
    }
    p.pos = foot; p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    p.inWater = p.eyeInWater = p.inLava = p.eyeInLava = false;
    this.hud();
  },
  exitKey() {
    const s = this.seat;
    if (!s) return false;
    if (s.kind === 'carousel') { this.leave(); return true; }
    if (s.kind === 'coaster') { const st = this.coasterState(); if (!st.running) { this.leave(); return true; } G.ui.toast('🎢 Keep your arms inside the car!'); return true; }
    if (s.kind === 'wheel') { const c = this.wheelCabin(this.site(), s.i, this.wheelAngle()); const a = ((c.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); if (Math.min(a, Math.PI * 2 - a) < 0.25) { this.leave(); return true; } G.ui.toast('🎡 Wait until your cabin reaches the bottom'); return true; }
    if (s.kind === 'tower') { if (this.towerPhase() === 'board') { this.leave(); return true; } G.ui.toast('🗼 The seat belt is locked'); return true; }
    return false;
  },
  camera(dt) {
    const s = this.seat, p = G.player;
    void dt;
    if (!s || s.kind !== 'coaster' || !s.q) {
      const e = p.eyePos();
      return { pos: e, yaw: p.yaw, pitch: p.pitch, roll: 0, fov: G.settings.fov };
    }
    const { f, eye } = s.q;
    // the look relative to the seat, turned into the car's frame
    const fl = [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
    const rl = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)], ul = V3.cross(rl, fl);
    const w = (l) => [f.r[0] * l[0] + f.u[0] * l[1] + f.t[0] * -l[2], f.r[1] * l[0] + f.u[1] * l[1] + f.t[1] * -l[2], f.r[2] * l[0] + f.u[2] * l[1] + f.t[2] * -l[2]];
    const F = w(fl), Uw = w(ul);
    const pitch = Math.asin(clamp(F[1], -1, 1));
    let yaw = Math.abs(F[1]) > 0.995 ? this.lastYaw : Math.atan2(-F[0], -F[2]);
    this.lastYaw = yaw;
    const r0 = [Math.cos(yaw), 0, -Math.sin(yaw)], u0 = V3.cross(r0, [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]);
    const roll = Math.atan2(-V3.dot(Uw, r0), V3.dot(Uw, u0));
    const fov = G.settings.fov + clamp((s.v || 0) / 22, 0, 1) * 14;
    const sh = (s.v || 0) > 8 ? (Math.random() - 0.5) * 0.02 * (s.v / 20) : 0;
    return { pos: [eye[0], eye[1] + sh, eye[2]], yaw, pitch, roll, fov };
  },

  // ---- sound: the chain, the rush of air, the music box ----
  sounds(dt, S, d) {
    const s = this.seat;
    this.sndT -= dt;
    if (s && s.kind === 'coaster' && s.q && this.sndT <= 0) {
      if (s.q.f.k === 2) { sfx('chain_clack', null, 0.5, 1); this.sndT = 0.22; }
      else if ((s.v || 0) > 6) { sfx('coaster_rush', null, clamp(s.v / 24, 0.2, 1), 0.8 + s.v / 40); this.sndT = 0.45; }
      else this.sndT = 0.3;
    }
    // the carousel's music box, soft, only near it
    const C = FAIR_CAROUSEL, dc = Math.hypot(G.player.pos[0] - (S.x + C.a), G.player.pos[2] - (S.z + C.b));
    this.noteT -= dt;
    if (dc < 28 && this.noteT <= 0) {
      const tune = [0, 4, 7, 12, 7, 4, 5, 9, 12, 9, 5, 2, 7, 11, 14, 11, 7, 4, 0, -1];
      const n = tune[this.noteI++ % tune.length];
      sfx('music_box', [S.x + C.a, S.F + 3, S.z + C.b], 0.35 * (1 - dc / 28), Math.pow(2, n / 12));
      this.noteT = this.noteI % 4 === 0 ? 0.6 : 0.3;
    }
    void d;
  },

  hud() {
    const s = this.seat, w = this.wait;
    let el = $('fairHud');
    if (!s && !w) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'fairHud'; document.body.append(el); }
    let html;
    if (!s) html = `<b>${w.kind === 'coaster' ? '🎢' : '🗼'} Seat booked</b><span>Boarding in ${Math.max(0, Math.ceil(w.until - this.now()))} s</span>`;
    else if (s.kind === 'coaster') {
      const st = this.coasterState(), S = this.site();
      const h = s.q ? Math.round(s.q.eye[1] - S.F - 1.5) : 0;
      html = st.running ? `<b>🎢 ${Math.round((s.v || 0) * 3.6)} km/h</b><span>${Math.max(0, h)} m${s.q && s.q.f.k === 2 ? ' · click… click… click…' : s.q && s.q.f.u[1] < 0 ? ' · upside down!' : ''}</span>`
        : `<b>🎢 Leaving in ${Math.ceil(st.wait)} s</b><span>Shift to get off</span>`;
    } else if (s.kind === 'wheel') html = `<b>🎡 ${Math.round(G.player.pos[1] - this.site().F)} m</b><span>${Math.max(0, Math.ceil(WHEEL_PERIOD - (this.now() - s.t0)))} s to the bottom</span>`;
    else if (s.kind === 'carousel') html = '<b>🎠 Carousel</b><span>Shift to get off</span>';
    else { const tc = this.now() % TOWER_CYCLE, ph = this.towerPhase(tc); html = `<b>🗼 ${Math.round(G.player.pos[1] - this.site().F)} m</b><span>${ph === 'board' ? 'Going up in ' + Math.ceil(10 - tc) + ' s' : ph === 'up' ? 'Going up…' : ph === 'top' ? 'Hold on…' : 'AAAAH!'}</span>`; }
    el.innerHTML = html;
    el.classList.add('show');
  },

  // ---- drawing ----
  render(cp) {
    const S = this.site();
    if (!S || Math.abs(cp[0] - S.x) > 300 || Math.abs(cp[2] - S.z) > 300) return;
    const uv = () => Vehicles.swatchUV('white');
    const night = typeof isDaytime === 'function' && !isDaytime();
    const box = (m, a, b, col, glow) => { ER.color = col; ER.ov = glow ? 3 : 0; ER.box(m, a[0], a[1], a[2], b[0], b[1], b[2], uv); };
    const at = (x, y, z) => XF.t(x - cp[0], y - cp[1], z - cp[2]);
    // a beam from p to q with a square section w
    const beam = (p, q, w, col, glow) => {
      const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(d[0], d[1], d[2]);
      if (L < 1e-3) return;
      const t = [d[0] / L, d[1] / L, d[2] / L], up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const r = V3.norm(V3.cross(t, up)), u = V3.cross(r, t);
      const m = [r[0], u[0], t[0], p[0] - cp[0], r[1], u[1], t[1], p[1] - cp[1], r[2], u[2], t[2], p[2] - cp[2]];
      box(m, [-w / 2, -w / 2, 0], [w / 2, w / 2, L], col, glow);
    };
    const frameM = (o, r, u, t) => [r[0], u[0], t[0], o[0] - cp[0], r[1], u[1], t[1], o[1] - cp[1], r[2], u[2], t[2], o[2] - cp[2]];
    const flash = (i) => night ? 0.55 + 0.45 * Math.sin(G.time * 4 + i * 0.7) : 0.8;

    // ---- the Ferris wheel ----
    {
      const Wh = FAIR_WHEEL, th = this.wheelAngle(), cx = S.x + Wh.a + 0.5, cy = S.F + Wh.y, cz = S.z + Wh.b + 0.5;
      if (Math.hypot(cx - cp[0], cz - cp[2]) < 260) {
        ER.lightAt(cx, S.F + 3, cz + 6);
        const seg = 48, rim = (a, dz, R = Wh.R) => [cx + Math.sin(a) * R, cy - Math.cos(a) * R, cz + dz];
        for (const dz of [-1.3, 1.3]) {
          for (let i = 0; i < seg; i++) {
            const a0 = th + i / seg * Math.PI * 2, a1 = th + (i + 1) / seg * Math.PI * 2;
            beam(rim(a0, dz), rim(a1, dz), 0.4, [0.95, 0.95, 0.97]);
            beam(rim(a0, dz, Wh.R - 1.6), rim(a1, dz, Wh.R - 1.6), 0.22, [0.9, 0.9, 0.93]);
            if (i % 2 === 0) { const q = rim(a0, dz + Math.sign(dz) * 0.3, Wh.R + 0.05); const c = FAIR_COLS[(i / 2 + Math.floor(G.time * 2)) % 6 | 0]; box(at(q[0], q[1], q[2]), [-0.22, -0.22, -0.22], [0.22, 0.22, 0.22], c.map((v) => v * flash(i)), true); }
          }
          for (let i = 0; i < Wh.n; i++) { const a = th + i / Wh.n * Math.PI * 2; beam([cx, cy, cz + dz * 0.6], rim(a, dz), 0.2, [0.85, 0.85, 0.88]); beam(rim(a, dz, Wh.R - 1.6), rim(a + Math.PI / Wh.n, dz), 0.14, [0.85, 0.85, 0.88]); }
        }
        box(at(cx, cy, cz), [-0.9, -0.9, -2.9], [0.9, 0.9, 2.9], [0.6, 0.6, 0.64]);
        box(at(cx, cy, cz), [-0.5, -0.5, -3.1], [0.5, 0.5, 3.1], [0.95, 0.3, 0.3], night);
        for (let i = 0; i < Wh.n; i++) {
          const c = this.wheelCabin(S, i, th), col = FAIR_COLS[i % 6];
          ER.lightAt(c.x, c.y - 1, c.z);
          const m = at(c.x, c.y, c.z);
          beam([c.x, c.y, c.z - 1.3], [c.x, c.y, c.z + 1.3], 0.16, [0.7, 0.7, 0.72]);
          box(m, [-0.08, -0.7, -0.08], [0.08, 0, 0.08], [0.5, 0.5, 0.52]);
          box(m, [-1.2, -0.85, -1.05], [1.2, -0.6, 1.05], col);                   // roof
          box(m, [-0.9, -0.6, -0.8], [0.9, -0.5, 0.8], col.map((v) => v * 0.7));
          for (const [x, z] of [[-1.05, -0.9], [0.95, -0.9], [-1.05, 0.8], [0.95, 0.8]]) box(m, [x, -2.3, z], [x + 0.1, -0.6, z + 0.1], [0.9, 0.9, 0.92]);
          box(m, [-1.1, -2.45, -1.0], [1.1, -2.3, 1.0], [0.3, 0.3, 0.33]);        // floor
          box(m, [-1.1, -2.3, -1.0], [1.1, -1.85, -0.9], col); box(m, [-1.1, -2.3, 0.9], [1.1, -1.85, 1.0], col);
          box(m, [-1.1, -2.3, -1.0], [-1.0, -1.85, 1.0], col); box(m, [1.0, -2.3, -1.0], [1.1, -1.85, 1.0], col);
          box(m, [-1.1, -1.6, -1.0], [1.1, -1.52, -0.92], [0.9, 0.9, 0.92]); box(m, [-1.1, -1.6, 0.92], [1.1, -1.52, 1.0], [0.9, 0.9, 0.92]);
          box(m, [-0.8, -2.3, -0.2], [0.8, -1.9, 0.2], [0.55, 0.36, 0.2]);         // bench
          if (night) box(m, [-0.15, -0.62, -0.15], [0.15, -0.5, 0.15], [1, 0.9, 0.6], true);
        }
      }
    }
    // ---- the carousel ----
    {
      const C = FAIR_CAROUSEL, ph = this.carouselAngle(), cx = S.x + C.a + 0.5, cz = S.z + C.b + 0.5, y0 = S.F;
      if (Math.hypot(cx - cp[0], cz - cp[2]) < 200) {
        ER.lightAt(cx, y0 + 2, cz + C.R);
        for (let i = 0; i < 20; i++) {
          const a = ph + i / 20 * Math.PI * 2, m = XF.chain(at(cx, y0, cz), XF.ry(-a));
          box(m, [0, 0.05, -1.2], [C.R, 0.35, 1.2], i % 2 ? [0.62, 0.4, 0.22] : [0.55, 0.34, 0.18]);
          box(m, [C.R - 0.1, 0.0, -1.2], [C.R + 0.05, 0.4, 1.2], [0.85, 0.7, 0.2]);
          // the roof: a cone of stripes and a scalloped skirt of bulbs
          for (let k = 0; k < 4; k++) { const r0 = C.R + 0.4 - k * 1.8; box(m, [0, 5.2 + k * 0.55, -r0 * 0.33], [r0, 5.5 + k * 0.55, r0 * 0.33], i % 2 ? [0.9, 0.15, 0.2] : [0.97, 0.95, 0.9]); }
          box(m, [C.R + 0.2, 4.6, -1.2], [C.R + 0.4, 5.2, 1.2], i % 2 ? [0.9, 0.15, 0.2] : [0.97, 0.95, 0.9]);
          box(m, [C.R + 0.35, 4.75, -0.1], [C.R + 0.55, 4.95, 0.1], FAIR_COLS[(i + Math.floor(G.time * 3)) % 6].map((v) => v * flash(i)), true);
        }
        box(at(cx, y0, cz), [-1.3, 0.35, -1.3], [1.3, 5.2, 1.3], [0.9, 0.78, 0.3]);
        box(at(cx, y0, cz), [-1.35, 1.2, -1.35], [1.35, 4.4, 1.35], [0.7, 0.8, 0.95], true);
        box(at(cx, y0, cz), [-0.3, 7.4, -0.3], [0.3, 8.3, 0.3], [0.95, 0.8, 0.2], night);
        for (let i = 0; i < 18; i++) {
          const h = this.horse(S, i, ph), rideMe = this.seat && this.seat.kind === 'carousel' && this.seat.i === i;
          ER.lightAt(h.x, h.y + 1, h.z);
          const m = XF.chain(at(h.x, h.y, h.z), XF.ry(h.yaw));
          box(XF.chain(at(h.x, y0, h.z), XF.ry(h.yaw)), [-0.05, 0.3, -0.05], [0.05, 5.2, 0.05], [0.95, 0.82, 0.3]);
          const coat = [[0.96, 0.95, 0.92], [0.55, 0.35, 0.2], [0.18, 0.16, 0.16], [0.85, 0.75, 0.55]][i % 4], sad = FAIR_COLS[i % 6];
          const gal = Math.sin(ph * 5 + i * 1.3) * 0.5;
          box(m, [-0.25, 0.55, -0.7], [0.25, 1.05, 0.6], coat);                       // body
          box(m, [-0.18, 0.9, -1.0], [0.18, 1.55, -0.62], coat);                      // neck
          box(m, [-0.16, 1.4, -1.35], [0.16, 1.7, -0.85], coat);                      // head
          box(m, [-0.2, 1.05, -0.25], [0.2, 1.12, 0.25], sad);                        // saddle
          box(m, [-0.06, 1.1, -0.95], [0.06, 1.62, -0.5], [0.2, 0.15, 0.12]);         // mane
          box(m, [-0.06, 0.6, 0.6], [0.06, 1.0, 0.85], [0.2, 0.15, 0.12]);            // tail
          for (const [x, z, s] of [[-0.18, -0.55, 1], [0.1, -0.55, 1], [-0.18, 0.45, -1], [0.1, 0.45, -1]]) {
            const lm = XF.chain(m, XF.t(x + 0.04, 0.6, z), XF.rx(gal * s));
            box(lm, [-0.04, -0.55, -0.05], [0.04, 0, 0.05], coat);
          }
          void rideMe;
        }
      }
    }
    // ---- the drop tower's ring of seats ----
    {
      const T = FAIR_TOWER, tc = this.now() % TOWER_CYCLE, y = this.towerY(tc), cx = S.x + T.a + 0.5, cz = S.z + T.b + 0.5;
      if (Math.hypot(cx - cp[0], cz - cp[2]) < 220) {
        ER.lightAt(cx, S.F + y + 1, cz + 3);
        box(at(cx, S.F + y, cz), [-2.0, 1.2, -2.0], [2.0, 1.7, 2.0], [0.2, 0.2, 0.24]);
        box(at(cx, S.F + y, cz), [-2.05, 1.7, -2.05], [2.05, 1.85, 2.05], [0.95, 0.75, 0.1], night);
        for (let i = 0; i < 12; i++) {
          const o = this.towerSeat(S, i, y), yaw = Math.atan2(o.out[0], o.out[2]);
          const m = XF.chain(at(o.x, o.y, o.z), XF.ry(yaw));
          const c = FAIR_COLS[i % 6];
          box(m, [-0.42, 0.35, -0.55], [0.42, 1.8, -0.35], c);        // back
          box(m, [-0.42, 0.25, -0.4], [0.42, 0.45, 0.25], c);          // seat
          if (!(this.seat && this.seat.kind === 'tower' && this.seat.i === i)) { box(m, [-0.35, 1.0, -0.35], [-0.2, 1.75, 0.15], [0.25, 0.25, 0.28]); box(m, [0.2, 1.0, -0.35], [0.35, 1.75, 0.15], [0.25, 0.25, 0.28]); }
          else box(m, [-0.3, 0.55, 0.12], [0.3, 0.65, 0.3], [0.9, 0.8, 0.1]);
          box(m, [-0.08, -0.4, -0.1], [0.08, 0.25, 0.1], [0.4, 0.4, 0.42]);
        }
      }
    }
    // ---- the coaster: track and trains ----
    {
      const C = Coaster.build(), ox = S.x + 0.5, oz = S.z + 0.5, oy = S.F;
      const cxl = cp[0] - ox, czl = cp[2] - oz;
      if (Math.hypot(cxl - 32, czl + 30) < 240) {
        const n = C.n;
        ER.lightAt(ox + 30, oy + 6, oz - 20);
        for (let i = 0; i < n; i += 2) {
          const j = (i + 2) % n, p = C.pos[i], q = C.pos[j];
          if (Math.abs(p[0] - cxl) > 150 || Math.abs(p[2] - czl) > 150) continue;
          const o = [ox + p[0], oy + p[1], oz + p[2]], o2 = [ox + q[0], oy + q[1], oz + q[2]];
          const r = C.R[i], u = C.U[i], r2 = C.R[j], u2 = C.U[j];
          const side = (k, dy, rr, uu) => [0, 1, 2].map((a) => (k === 0 ? o : o2)[a] + (k === 0 ? r : r2)[a] * rr + (k === 0 ? u : u2)[a] * uu);
          beam(side(0, 0, -0.55, 0), side(1, 0, -0.55, 0), 0.16, [0.85, 0.87, 0.9]);
          beam(side(0, 0, 0.55, 0), side(1, 0, 0.55, 0), 0.16, [0.85, 0.87, 0.9]);
          beam(side(0, 0, 0, -0.45), side(1, 0, 0, -0.45), 0.34, [0.1, 0.62, 0.72]);
          if (i % 4 === 0) { const m = frameM(o, r, u, C.T[i]); box(m, [-0.6, -0.45, -0.07], [0.6, -0.05, 0.07], [0.3, 0.3, 0.33]); }
          if (C.pts[i].k === 2 && i % 4 === 0) { const m = frameM(o, r, u, C.T[i]); box(m, [-0.12, -0.02, -0.2], [0.12, 0.06, 0.2], [0.25, 0.25, 0.25]); }
          if (night && i % 12 === 0) { const m = frameM(o, r, u, C.T[i]); box(m, [-0.08, -0.62, -0.08], [0.08, -0.5, 0.08], FAIR_COLS[(i / 12) % 6 | 0], true); }
        }
        // the train
        const st = C.at(this.now() % C.cycle);
        for (let c = 0; c < COASTER_CARS; c++) {
          const f = C.frame(st.s - c * COASTER_GAP - 1.1);
          const o = [ox + f.p[0], oy + f.p[1], oz + f.p[2]];
          ER.lightAt(o[0], o[1] + 1, o[2]);
          const m = frameM(o, f.r, f.u, f.t), col = c === 0 ? [0.92, 0.18, 0.2] : [0.95, 0.75, 0.15];
          box(m, [-0.75, 0.05, -1.15], [0.75, 0.55, 1.15], [0.2, 0.2, 0.22]);                       // chassis
          box(m, [-0.78, 0.35, -1.2], [0.78, 1.05, -0.95], col); box(m, [-0.78, 0.35, 0.95], [0.78, 1.05, 1.2], col);
          box(m, [-0.8, 0.35, -1.2], [-0.65, 1.0, 1.2], col); box(m, [0.65, 0.35, -1.2], [0.8, 1.0, 1.2], col);
          for (const z of [-0.55, 0.4]) {
            box(m, [-0.6, 0.55, z - 0.3], [0.6, 0.7, z + 0.2], [0.15, 0.15, 0.18]);                   // seat
            box(m, [-0.6, 0.7, z - 0.35], [0.6, 1.35, z - 0.22], [0.15, 0.15, 0.18]);                 // back
            box(m, [-0.55, 1.05, z + 0.15], [0.55, 1.15, z + 0.3], [0.9, 0.9, 0.2]);                   // lap bar
          }
          if (c === 0) { box(m, [-0.75, 0.3, 1.2], [0.75, 0.9, 1.6], col); box(m, [-0.5, 0.45, 1.6], [-0.2, 0.65, 1.62], [1, 1, 0.8], true); box(m, [0.2, 0.45, 1.6], [0.5, 0.65, 1.62], [1, 1, 0.8], true); }
          for (const x of [-0.6, 0.6]) for (const z of [-0.8, 0.8]) box(m, [x - 0.12, -0.15, z - 0.2], [x + 0.12, 0.1, z + 0.2], [0.35, 0.35, 0.38]);
        }
      }
    }
    ER.ov = 0; ER.color = [1, 1, 1];
  },
};

PIC_BUILTIN.fair_sign = { w: 10, h: 3, draw(g, W, H) {
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#2a0f4f'); grd.addColorStop(1, '#6b1a6b');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 44; i++) {
    const t = i / 44, x = t < 0.5 ? t * 2 * W : (1 - (t - 0.5) * 2) * W, y = t < 0.5 ? H * 0.06 : H * 0.94;
    g.fillStyle = i % 2 ? '#ffe27a' : '#ff8a3d'; g.beginPath(); g.arc(x, y, H * 0.03, 0, 7); g.fill();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${H * 0.34}px serif`; g.fillText('🎡', W * 0.08, H * 0.48); g.fillText('🎢', W * 0.92, H * 0.48);
  g.fillStyle = '#fff'; g.font = `900 ${H * 0.25}px Arial`;
  g.shadowColor = '#ff4fd8'; g.shadowBlur = H * 0.06;
  g.fillText(ED('PARC D\'ATRACCIONS', 'FUNFAIR'), W / 2, H * 0.4);
  g.shadowBlur = 0; g.fillStyle = '#ffd24a'; g.font = `800 ${H * 0.12}px Arial`;
  g.fillText(ED('MUNTANYA RUSSA · NÒRIA · CAVALLETS · TORRE · GLOBUS', 'COASTER · WHEEL · CAROUSEL · DROP TOWER · BALLOONS'), W / 2, H * 0.72);
} };
SYNTH.chain_clack = (ctx, o, t) => { Sound.noise(ctx, o, t, 0.05, { type: 'bandpass', freq: 2400, q: 4, gain: 0.25 }); Sound.tone(ctx, o, t, 0.04, { wave: 'square', f0: 180, gain: 0.04 }); };
SYNTH.coaster_rush = (ctx, o, t) => { Sound.noise(ctx, o, t, 0.6, { type: 'lowpass', freq: 700, gain: 0.28, attack: 0.08 }); Sound.noise(ctx, o, t, 0.5, { type: 'bandpass', freq: 160, q: 2, gain: 0.25 }); };
SYNTH.tower_drop = (ctx, o, t) => { Sound.noise(ctx, o, t, 2.4, { type: 'bandpass', freq: 500, freqEnd: 2600, q: 1.5, gain: 0.35, attack: 0.2 }); };
SYNTH.music_box = (ctx, o, t) => { Sound.tone(ctx, o, t, 0.9, { wave: 'triangle', f0: 1046, gain: 0.07 }); Sound.tone(ctx, o, t, 0.5, { wave: 'sine', f0: 2093, gain: 0.025 }); };

{
  // the ticket machines inside the fair open the nearest ride
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target, b = t && t.block, S = Fair.site();
    if (initial && b && S && b.id === B.TICKET_MACHINE && Fair.inside(b.pos, 1)) {
      const a = b.pos[0] - S.x, bb = b.pos[2] - S.z;
      const spots = [['coaster', FAIR_STATION.a1 + 2, FAIR_STATION.b + 5], ['wheel', FAIR_WHEEL.a + 3, FAIR_WHEEL.b + 4], ['carousel', FAIR_CAROUSEL.a + 2, FAIR_CAROUSEL.b + FAIR_CAROUSEL.R + 2], ['tower', FAIR_TOWER.a + 2, FAIR_TOWER.b + 6], ['balloon', FAIR_BALLOONS.a, FAIR_BALLOONS.b + 10]];
      let best = null, bd = 12;
      for (const [k, x, z] of spots) { const d = Math.hypot(a - x, bb - z); if (d < bd) { bd = d; best = k; } }
      if (best === 'balloon') Balloons.open(); else if (best) Fair.open(best); else Fair.menu();
      this.swingHand();
      return true;
    }
    return use.call(this, initial);
  };
  // riding: the seat moves you; Shift / Space to get off where the ride allows it
  const upd = Player.prototype.update;
  Player.prototype.update = function (dt, input) {
    if (this !== G.player || !Fair.seat) return upd.call(this, dt, input);
    const k = input && input.keys;
    if (k && (k.has('ShiftLeft') || k.has('ShiftRight'))) { if (!Fair.exitT || G.time - Fair.exitT > 0.6) { Fair.exitT = G.time; Fair.exitKey(); } }
    this.vel[0] = this.vel[1] = this.vel[2] = 0;
    this.onGround = true; this.sneaking = false; this.sprinting = false; this.fallStart = null;
  };
  const dmg = Stats.prototype.damage;
  Stats.prototype.damage = function (amount, src) { if (Fair.seat && src && (src.type === 'fall' || src.type === 'suffocate' || src.type === 'wall')) return; return dmg.call(this, amount, src); };
  const die = Stats.prototype.die;
  Stats.prototype.die = function (src) { Fair.seat = null; Fair.wait = null; return die.call(this, src); };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); try { Fair.update(dt || 0.016); } catch (e) { console.warn('Blocklands: fair', e); } };
  const wr = Weather.render;
  Weather.render = function (cp, ...a) { const r = wr.call(this, cp, ...a); try { Fair.render(cp); } catch (e) { console.warn('Blocklands: fair render', e); } return r; };
  PC.add({ key: 'fair', icon: '🎡', name: ED('Fira', 'Funfair'), run() { Fair.menu(); } });
}
