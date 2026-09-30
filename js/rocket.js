'use strict';
// The rocket to the Moon. It stands on the launch pad of the spaceport (moon_gen.js builds it
// south of the district) and on the pad of the Moon base. Buy a seat at the control building,
// the rocket or the Space app: ten seconds of countdown with smoke building up, ignition,
// lift-off on a column of fire, the sky going dark, a few seconds among the stars with the Moon
// growing ahead, and a powered landing on the other pad. On the Moon gravity is a third (jumps
// go high), the sky is black with the Earth hanging in it, and no monsters walk.

const ROCKET_PRICE = 500;
{
  const WH = [0.95, 0.95, 0.96], DK = [0.14, 0.15, 0.18], RED = [0.84, 0.12, 0.16], GRY = [0.6, 0.62, 0.66];
  const parts = [
    // the core stage
    [-1.6, 3, -1.6, 1.6, 20, 1.6, 'white', { c: WH }], [-1.62, 12, -1.62, 1.62, 13.5, 1.62, 'white', { c: DK }],
    [-1.62, 3, -1.62, 1.62, 4.2, 1.62, 'white', { c: DK }], [-1.63, 16, -1.63, 1.63, 16.4, 1.63, 'white', { c: RED }],
    // the upper stage and the capsule
    [-1.3, 20, -1.3, 1.3, 26, 1.3, 'white', { c: WH }], [-1.32, 22.5, -1.32, 1.32, 23, 1.32, 'white', { c: RED }],
    [-1.05, 26, -1.05, 1.05, 28.2, 1.05, 'white', { c: WH }], [-0.75, 28.2, -0.75, 0.75, 29.6, 0.75, 'white', { c: WH }],
    [-0.4, 29.6, -0.4, 0.4, 30.6, 0.4, 'white', { c: WH }], [-0.08, 30.6, -0.08, 0.08, 32.4, 0.08, 'metal'],
    [-1.07, 26.6, 0.5, 1.07, 27.4, 1.07, 'glass'],
    // side boosters
    [1.6, 1.5, -0.7, 3.0, 15, 0.7, 'white', { c: WH, m: true }], [1.7, 15, -0.55, 2.9, 16.4, 0.55, 'white', { c: WH, m: true }],
    [1.75, 16.4, -0.35, 2.85, 17.2, 0.35, 'white', { c: RED, m: true }], [1.6, 1.5, -0.72, 3.02, 2.4, 0.72, 'white', { c: DK, m: true }],
    // fins and the engine bells
    [3.0, 1.5, -0.12, 4.1, 4.5, 0.12, 'white', { c: RED, m: true }], [-0.12, 1.5, 1.6, 0.12, 4.5, 2.8, 'white', { c: RED }], [-0.12, 1.5, -2.8, 0.12, 4.5, -1.6, 'white', { c: RED }],
    [-1.2, 1.4, -1.2, 1.2, 3, 1.2, 'metal'], [-0.9, 0.4, -0.9, 0.9, 1.4, 0.9, 'hullDark'], [1.9, 0.6, -0.5, 2.7, 1.5, 0.5, 'hullDark', { m: true }],
    // windows and lights
    [1.31, 24, -0.4, 1.33, 24.8, 0.4, 'glass', { m: true }], [-0.1, 32.4, -0.1, 0.1, 32.6, 0.1, 'navRed', { glow: 2 }],
  ];
  RIDE_KINDS.rocket = {
    item: I.AVE_TICKET, name: 'Rocket', type: 'air', max: 200, rev: 0, acc: 0, brake: 0, steer: 0, base: 8, step: 1.05, h: 33, len: 8, w: 8,
    seat: [0, 26.2, 0.2], eye: [0, 27.2, 0.7], cam: 44, sit: true, hide: true, sound: 'heli', paintDefault: 0,
    parts, hit: [[-3, 0, -3, 3, 32, 3]],
  };
  RIDE_KEYS.push('rocket');
  const d = RIDE_KINDS.rocket;
  d.key = 'rocket';
  const out = [];
  for (const [x0, y0, z0, x1, y1, z1, sw, o = {}] of d.parts) {
    out.push({ box: [x0, y0, z0, x1, y1, z1], sw, o });
    if (o.m) out.push({ box: [-x1, y0, z0, -x0, y1, z1], sw, o: Object.assign({}, o) });
  }
  d.model = out;
}

const Rocket = {
  v: null, at: null, trip: null, fx: null, hint: {},
  pads() {
    const g = G.world && G.world.gen, S = g && spacePort(g);
    const out = [];
    if (S) out.push({ k: 'earth', x: S.x + 0.5, y: S.F + 1, z: S.z + 0.5, name: ED('Cosmòdrom ', 'Spaceport ') + CITY });
    if (g && g.type === 'default') { const [x, z] = dimWorld(DIM_MOON, 0, 0); out.push({ k: 'moon', x: x + 0.5, y: MOON_BASE_Y + 1, z: z + 0.5, name: ED('Base Lunar Tranquil·litat', 'Tranquility Moon Base') }); }
    return out;
  },
  pad(k) { return this.pads().find((p) => p.k === k) || null; },
  nearPad() { const p = G.player.pos; return this.pads().find((q) => Math.hypot(q.x - p[0], q.z - p[2]) < 220 && Math.abs(q.y - p[1]) < 140) || null; },
  onMoon() { const p = G.player.pos; return dimOf(p[0], p[2]) === DIM_MOON; },
  spawn(P) {
    if (this.v && !this.v.removed) this.v.removed = true;
    const v = this.v = Rides.spawn('rocket', P.x, P.y, P.z, 0, 0);
    v.scripted = true; v.rocket = true; v.onGround = true;
    this.at = P.k;
    return v;
  },

  update(dt) {
    if (this.trip) { this.fly(dt); return; }
    const P = this.nearPad();
    if (!P) { if (this.v) { this.v.removed = true; this.v = null; } return; }
    if (!this.v || this.v.removed || this.at !== P.k) this.spawn(P);
    const v = this.v;
    v.pos = [P.x, P.y, P.z]; v.yaw = 0; v.pitch = 0; v.roll = 0; v.speed = 0;
    if (v.basis) v.basis();
    // steam venting while it waits
    if (Math.random() < dt * 2) Particles.smoke && Particles.smoke(P.x + rand(-1.5, 1.5), P.y + rand(4, 14), P.z + rand(-1.5, 1.5), 1, 0.4);
    const p = G.player.pos;
    if (!this.hint[P.k] && Math.hypot(P.x - p[0], P.z - p[2]) < 40) { this.hint[P.k] = true; G.ui.banner('🚀', P.name + (P.k === 'earth' ? ' · seats to the Moon at the control building' : ' · the rocket home is on the pad')); }
  },

  open() {
    const P = this.nearPad();
    if (!P) { this.find(); return; }
    const to = P.k === 'earth' ? 'moon' : 'earth';
    const q = GPanel.open({ title: P.name, sub: to === 'moon' ? 'Next launch: now' : 'Flight home', icon: '🚀', cls: 'gp-rocket', width: 480 });
    const price = to === 'moon' ? ROCKET_PRICE : 0;
    q.body.innerHTML = `<div class="rk-card"><div class="rk-route"><span>${P.k === 'earth' ? '🌍' : '🌕'}</span><i></i><span>${to === 'moon' ? '🌕' : '🌍'}</span></div>
      <b>${to === 'moon' ? 'To the Moon · Tranquility base' : 'Back to ' + BZ.esc(CITY)}</b>
      <p>${to === 'moon' ? 'Countdown, lift-off, a few minutes among the stars and a landing next to the domes. Low gravity, black sky, the Earth overhead.' : 'The flight home is included with your seat.'}</p>
      <button class="gp-btn ok rk-go">${price ? '🪙 ' + price + ' · ' : ''}Board the rocket</button></div>`;
    q.body.querySelector('.rk-go').addEventListener('click', () => {
      if (this.trip || Ave.trip || Airport.mine || Cruise.trip) { G.ui.toast('You are already travelling'); return; }
      if (price && !Shops.pay(price)) { G.ui.toast('🪙 A seat costs ' + price + ' coins'); sfx('gate_no', null, 0.6, 1); return; }
      q.close();
      this.launch(P, to);
    });
  },
  find() {
    const S = this.pad('earth');
    if (!S) { G.ui.toast('This world has no spaceport'); return; }
    G.markers = G.markers || [];
    if (!G.markers.some((m) => m.x === Math.round(S.x) && m.z === Math.round(S.z))) G.markers.push({ x: Math.round(S.x), z: Math.round(S.z), name: '🚀 Spaceport', color: '#ff7a3d' });
    const p = G.player.pos, d = Math.hypot(S.x - p[0], S.z - p[2]);
    G.ui.banner('🚀', 'Spaceport · ' + Math.round(d) + ' blocks south of the district · marked on your map (M)');
  },

  launch(P, to) {
    const v = this.v && !this.v.removed && this.at === P.k ? this.v : this.spawn(P);
    this.trip = { from: P, to, phase: 'count', t: 0, v };
    Airport.fade(true, () => {
      boardRocket.call(Vehicles, v);
      G.player.yaw = Math.PI * 0.75; G.player.pitch = -0.35;
      G.ui.banner('🚀', 'Strap in: launch in 10 seconds');
      Airport.fade(false);
    }, 700);
  },
  fly(dt) {
    const T = this.trip, v = T.v;
    if (!v || v.removed) { this.trip = null; return; }
    T.t += dt;
    const P = T.phase === 'down' ? T.dest : T.from;
    let y = P.y;
    if (T.phase === 'count') {
      const n = Math.ceil(10 - T.t);
      if (n !== T.said && n > 0) { T.said = n; sfx('click', null, 0.8, 0.7 + (10 - n) * 0.04); }
      if (T.t > 6) for (let i = 0; i < 3; i++) Particles.smoke && Particles.smoke(P.x + rand(-3, 3), P.y + rand(0, 2), P.z + rand(-3, 3), 2, 0.8);
      if (T.t > 8.5 && Math.random() < 0.6) Particles.flame && Particles.flame(P.x + rand(-1, 1), P.y + 0.5, P.z + rand(-1, 1));
      if (T.t >= 10) { T.phase = 'up'; T.t = 0; sfx('rocket_roar', null, 1, 1); G.ui.banner('🔥', 'Lift-off!'); }
    } else if (T.phase === 'up') {
      y = P.y + 0.5 * 3.6 * T.t * T.t;
      this.exhaust(v, 1);
      if (Math.random() < dt * 2) sfx('rocket_roar', null, 0.7, 0.9 + T.t * 0.02);
      if (T.t > 11 && !T.busy) { T.busy = true; this.space(T); }
    } else if (T.phase === 'down') {
      const k = Math.min(1, T.t / 12);
      y = P.y + 180 * (1 - k) * (1 - k);
      this.exhaust(v, 0.6);
      if (T.t >= 12 && !T.busy) { T.busy = true; this.landed(T); }
    }
    v.pos = [P.x, y, P.z]; v.yaw = 0; v.pitch = 0; v.roll = T.phase === 'up' ? Math.sin(T.t * 30) * 0.002 * T.t : 0;
    v.speed = T.phase === 'up' ? 3.6 * T.t : T.phase === 'down' ? 30 * (1 - T.t / 12) : 0;
    if (v.basis) v.basis();
    this.hud();
  },
  exhaust(v, k) {
    for (let i = 0; i < 4; i++) {
      Particles.flame && Particles.flame(v.pos[0] + rand(-0.8, 0.8), v.pos[1] + rand(-1.5, 0.5), v.pos[2] + rand(-0.8, 0.8));
      if (Math.random() < k) Particles.smoke && Particles.smoke(v.pos[0] + rand(-2, 2), v.pos[1] - rand(1, 6), v.pos[2] + rand(-2, 2), 2, 0.8);
    }
  },
  // the cruise between the two worlds
  space(T) {
    Airport.fade(true, () => {
      const dest = this.pad(T.to);
      this.stars(true, T.to);
      setTimeout(() => {
        const p = G.player;
        T.dest = dest; T.phase = 'down'; T.t = 0; T.busy = false;
        T.v.pos = [dest.x, dest.y + 180, dest.z];
        p.pos = [dest.x, dest.y + 180, dest.z]; p.vel = [0, 0, 0]; p.fallStart = null;
        prepareArea(dest.x, dest.z, 2);
        Net.teleported();
        this.stars(false);
        Airport.fade(false);
        G.ui.banner(T.to === 'moon' ? '🌕' : '🌍', T.to === 'moon' ? 'Moon in sight · landing burn' : 'Re-entry · welcome home');
      }, 5200);
    }, 900);
  },
  landed(T) {
    Airport.fade(true, () => {
      const v = T.v, dest = T.dest, p = G.player;
      this.trip = null;
      if (G.vehicle === v) Vehicles.dismount(true);
      this.at = dest.k;
      p.pos = [dest.x + 5.5, dest.y + 0.01, dest.z + 0.5]; p.vel = [0, 0, 0]; p.fallStart = null; p.yaw = Math.PI / 2;
      liftOutOfBlocks(p);
      Net.teleported();
      if (dest.k === 'moon') {
        const pr = G.prog || (G.prog = {});
        if (!pr.moon) { pr.moon = Date.now(); Shops.earn(100); }
        G.ui.banner('🌕', 'Tranquility base · one small step… · low gravity: jump!');
      } else G.ui.banner('🌍', 'Back on Earth · ' + CITY + ' spaceport');
      sfx('achieve', null, 0.9, 1);
      Airport.fade(false);
      this.hud();
    }, 900);
  },
  stars(on, to) {
    if (!on) { if (this.fx) { this.fx.remove(); this.fx = null; } return; }
    const c = this.fx = document.createElement('canvas');
    c.id = 'spaceFx'; c.width = innerWidth; c.height = innerHeight;
    document.body.append(c);
    const g = c.getContext('2d'), W = c.width, H = c.height, t0 = performance.now();
    const st = Array.from({ length: 420 }, () => ({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.1, 1) }));
    const frame = () => {
      if (this.fx !== c) return;
      const t = Math.min(1, (performance.now() - t0) / 5200);
      g.fillStyle = '#02030a'; g.fillRect(0, 0, W, H);
      for (const s of st) {
        s.z -= 0.012; if (s.z <= 0.02) { s.z = 1; s.x = rand(-1, 1); s.y = rand(-1, 1); }
        const sx = W / 2 + s.x / s.z * W * 0.25, sy = H / 2 + s.y / s.z * H * 0.25, r = (1 - s.z) * 2.4;
        g.fillStyle = `rgba(255,255,255,${(1 - s.z).toFixed(2)})`; g.fillRect(sx, sy, r, r * (1 + (1 - s.z) * 3));
      }
      // the world behind shrinking, the one ahead growing
      const ahead = to === 'moon', R1 = Math.max(2, H * (0.05 + 0.35 * t * t)), R0 = Math.max(2, H * 0.5 * (1 - t) + 10);
      const disc = (x, y, R, a, b) => { const gr = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill(); };
      disc(W * 0.12, H * 1.05, R0, ahead ? '#6fb6ff' : '#e8e8e8', ahead ? '#123b7a' : '#6b6b70');
      disc(W / 2, H / 2, R1, ahead ? '#f2f2f0' : '#7fc0ff', ahead ? '#7a7a80' : '#1b4f9a');
      g.fillStyle = '#fff'; g.font = `800 ${Math.round(H * 0.035)}px system-ui`; g.textAlign = 'center';
      g.fillText(ahead ? ED('Rumb a la Lluna', 'Heading for the Moon') : ED('Tornant a la Terra', 'Heading home'), W / 2, H * 0.12);
      g.font = `600 ${Math.round(H * 0.022)}px system-ui`; g.fillStyle = '#9fb0c8';
      g.fillText(Math.round(384400 * (ahead ? t : 1 - t)).toLocaleString() + ' km', W / 2, H * 0.17);
      requestAnimationFrame(frame);
    };
    frame();
  },
  hud() {
    const T = this.trip;
    let el = $('rocketHud');
    if (!T) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'rocketHud'; document.body.append(el); }
    const big = T.phase === 'count' ? Math.max(0, Math.ceil(10 - T.t)) : '';
    const alt = Math.max(0, Math.round((T.v.pos[1] - (T.phase === 'down' ? T.dest.y : T.from.y)) * 10));
    el.innerHTML = big !== '' ? `<b class="rk-count">${big || 'IGNITION'}</b><span>T-${big}</span>` : `<b>${T.phase === 'up' ? '🚀 Ascent' : '🛬 Powered descent'}</b><span>${alt} m · ${Math.round(T.v.speed * 3.6 * 6)} km/h</span>`;
    el.classList.add('show');
  },

  // the Moon's sky: stars and the Earth
  render(cp) {
    if (dimOf(cp[0], cp[2]) !== DIM_MOON) return;
    const uv = () => Vehicles.swatchUV('white');
    ER.ov = 3;
    if (!this.sky) this.sky = Array.from({ length: 260 }, (_, i) => { const a = hash3(i, 1, 2, 3) * Math.PI * 2, e = 0.08 + hash3(i, 4, 5, 6) * 1.35; return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0.25 + hash3(i, 7, 8, 9) * 0.45]; });
    const D = 140;
    for (const [x, y, z, s] of this.sky) {
      const m = XF.t(x * D, y * D, z * D);
      ER.color = [0.8, 0.82, 0.9]; ER.box(m, -s, -s, -s, s, s, s, uv);
    }
    // the Earth: a blue ball with green land and white clouds, always in the same place
    const E = XF.t(-0.45 * D, 0.62 * D, -0.64 * D), R = 11;
    for (let i = -R; i <= R; i += 1.4) for (let j = -R; j <= R; j += 1.4) {
      const d = Math.hypot(i, j);
      if (d > R) continue;
      const land = Math.sin(i * 0.35) + Math.cos(j * 0.3 + i * 0.1) > 0.9, cloud = Math.sin(i * 0.8 + j * 0.2) > 0.85;
      const shade = 0.55 + 0.45 * (1 - (i + R) / (2 * R));
      ER.color = cloud ? [shade, shade, shade] : land ? [0.25 * shade, 0.55 * shade, 0.25 * shade] : [0.15 * shade, 0.38 * shade, 0.9 * shade];
      ER.box(E, i - 0.7, j - 0.7, -Math.sqrt(R * R - d * d) * 0.2, i + 0.7, j + 0.7, 0.4, uv);
    }
    ER.ov = 0; ER.color = [1, 1, 1];
  },
};

PIC_BUILTIN.space_sign = { w: 8, h: 2, draw(g, W, H) {
  const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, '#0b1230'); grd.addColorStop(1, '#241a52');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
  g.font = `${H * 0.6}px serif`; g.textBaseline = 'middle'; g.fillText('🚀', H * 0.2, H * 0.52);
  g.fillStyle = '#fff'; g.font = `900 ${H * 0.3}px Arial`; g.fillText(ED('COSMÒDROM ', 'SPACEPORT ') + CITY.toUpperCase(), H * 1.1, H * 0.38);
  g.fillStyle = '#ff9d3d'; g.font = `700 ${H * 0.17}px Arial`; g.fillText(ED('Vols a la Lluna · base Tranquil·litat', 'Flights to the Moon · Tranquility base'), H * 1.12, H * 0.7);
} };
PIC_BUILTIN.moon_sign = { w: 4, h: 2, draw(g, W, H) {
  g.fillStyle = '#10141e'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffcc33'; g.lineWidth = H * 0.03; g.strokeRect(W * 0.04, H * 0.06, W * 0.92, H * 0.88);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${H * 0.3}px serif`; g.fillText('🌕', W / 2, H * 0.3);
  g.fillStyle = '#fff'; g.font = `900 ${H * 0.15}px Arial`; g.fillText(ED('BASE LUNAR', 'MOON BASE'), W / 2, H * 0.6);
  g.fillStyle = '#ffcc33'; g.font = `700 ${H * 0.11}px Arial`; g.fillText(ED('TRANQUIL·LITAT', 'TRANQUILITY'), W / 2, H * 0.78);
} };
SYNTH.rocket_roar = (ctx, o, t) => { Sound.noise(ctx, o, t, 2.2, { type: 'lowpass', freq: 380, gain: 0.35 }); Sound.tone(ctx, o, t, 2, { wave: 'sawtooth', f0: 48, f1: 40, gain: 0.05 }); };

const boardRocket = Vehicles.board;
{
  Vehicles.board = function (v) {
    if (v && v.rocket) { if (Rocket.trip && Rocket.trip.v === v) return boardRocket.call(this, v); if (!Rocket.trip) Rocket.open(); return; }
    return boardRocket.call(this, v);
  };
  const ser = Vehicles.serialize;
  Vehicles.serialize = function () { const keep = this.list; this.list = keep.filter((v) => !v.rocket); try { return ser.call(this); } finally { this.list = keep; } };
  const hit = Vehicles.hit;
  if (hit) Vehicles.hit = function (v) { if (v && v.rocket) return; return hit.call(this, v); };
  const pk = Vehicles.pickUp;
  Vehicles.pickUp = function (v) { if (v && v.rocket) return; return pk.call(this, v); };
  const idle = Ride.prototype.updateIdle;
  Ride.prototype.updateIdle = function (dt) { if (this.rocket) { if (this.basis) this.basis(); return; } return idle.call(this, dt); };
  const pilot = Rides.pilot;
  Rides.pilot = function (v, dt, input, horn) {
    if (!v.rocket) return pilot.call(this, v, dt, input, horn);
    const p = G.player, at = v.toWorld(v.def.seat);
    p.pos = [at[0], at[1] - 0.75, at[2]];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    this.updateMotor(v);
  };
  const dis = Vehicles.dismount;
  Vehicles.dismount = function (forced) { if (!forced && G.vehicle && G.vehicle.rocket && Rocket.trip) { G.ui.toast('🚀 Stay strapped in'); return; } return dis.call(this, forced); };
  // low gravity on the Moon
  const upd = Player.prototype.update;
  Player.prototype.update = function (dt, input) {
    const r = upd.call(this, dt, input);
    if (this === G.player && !this.flying && !G.vehicle && dimOf(this.pos[0], this.pos[2]) === DIM_MOON) { this.vel[1] += GRAVITY * 0.66 * dt; this.fallStart = null; }
    return r;
  };
  // no creatures on the Moon
  const sp = Ents.spawn;
  Ents.spawn = function (dt) { const p = G.player; if (dimOf(p.pos[0], p.pos[2]) === DIM_MOON) return; return sp.call(this, dt); };
  // the creative jump to the Moon (Places) and back
  const tr = Portals.travel;
  Portals.travel = function (kind, force) {
    const p = G.player, from = dimOf(p.pos[0], p.pos[2]), to = force;
    if (to === DIM_MOON || (from === DIM_MOON && to !== undefined)) {
      const dest = Rocket.pad(to === DIM_MOON ? 'moon' : 'earth');
      if (!dest) return;
      if (G.vehicle) Vehicles.dismount(true);
      p.pos = [dest.x + 5.5, dest.y + 0.5, dest.z + 0.5]; p.vel = [0, 0, 0]; p.fallStart = null;
      prepareArea(p.pos[0], p.pos[2], 2); liftOutOfBlocks(p); Net.teleported();
      G.ui.banner(to === DIM_MOON ? '🌕' : '🌍', dest.name);
      return;
    }
    return tr.call(this, kind, force);
  };
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target, b = t && t.block;
    if (initial && b && b.id === B.VENDING_MACHINE && !G.player.sneaking) {
      const P = Rocket.nearPad();
      if (P && Math.hypot(b.pos[0] - P.x, b.pos[2] - P.z) < 60) { Rocket.open(); this.swingHand(); return true; }
    }
    return use.call(this, initial);
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); try { Rocket.update(dt || 0.016); } catch (e) { console.warn('Blocklands: rocket', e); } };
  const wr = Weather.render;
  Weather.render = function (cp, ...a) { const r = wr.call(this, cp, ...a); try { Rocket.render(cp); } catch (e) { /* ignore */ } return r; };
  PC.add({ key: 'space', icon: '🚀', name: ED('Espai', 'Space'), run() { Rocket.open(); } });
}
