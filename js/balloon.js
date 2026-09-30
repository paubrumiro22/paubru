'use strict';
// Hot-air balloons. Three wait inflated on the field of the funfair (fair_gen.js); a flight costs
// BALLOON_PRICE. In the basket: Space opens the burner (the air inside heats up and you climb),
// let go and it cools and you sink; the wind carries you (it turns slowly and blows harder up
// high); WASD only nudge. Land anywhere, Shift to climb out (up in the air: a parachute). The
// balloon stays where you left it until you walk away; nothing is saved.

const BALLOON_PRICE = 40;
{
  const WICKER = [0.62, 0.45, 0.25], DK = [0.3, 0.22, 0.14], ROPE = [0.85, 0.8, 0.7];
  const BANDS = [[0.92, 0.2, 0.22], [0.98, 0.62, 0.12], [0.98, 0.86, 0.2], [0.3, 0.75, 0.35], [0.2, 0.55, 0.92], [0.55, 0.3, 0.85]];
  const parts = [
    // the basket: wicker walls, a darker rim, the floor
    [-0.85, 0, -0.85, 0.85, 0.12, 0.85, 'white', { c: DK }],
    [-0.85, 0.12, -0.85, 0.85, 1.05, -0.72, 'white', { c: WICKER }], [-0.85, 0.12, 0.72, 0.85, 1.05, 0.85, 'white', { c: WICKER }],
    [-0.85, 0.12, -0.72, -0.72, 1.05, 0.72, 'white', { c: WICKER }], [0.72, 0.12, -0.72, 0.85, 1.05, 0.72, 'white', { c: WICKER }],
    [-0.9, 1.05, -0.9, 0.9, 1.17, 0.9, 'white', { c: DK }],
    // uprights to the burner frame, the burner, the ropes up to the envelope's mouth
    [-0.8, 1.17, -0.8, -0.72, 3.3, -0.72, 'metal'], [0.72, 1.17, -0.8, 0.8, 3.3, -0.72, 'metal'], [-0.8, 1.17, 0.72, -0.72, 3.3, 0.8, 'metal'], [0.72, 1.17, 0.72, 0.8, 3.3, 0.8, 'metal'],
    [-0.8, 3.3, -0.8, 0.8, 3.42, 0.8, 'metal'], [-0.32, 3.2, -0.32, 0.32, 3.75, 0.32, 'hullDark'],
    [-1.3, 3.42, -0.05, -0.75, 4.9, 0.05, 'white', { c: ROPE }], [0.75, 3.42, -0.05, 1.3, 4.9, 0.05, 'white', { c: ROPE }],
    [-0.05, 3.42, -1.3, 0.05, 4.9, -0.75, 'white', { c: ROPE }], [-0.05, 3.42, 0.75, 0.05, 4.9, 1.3, 'white', { c: ROPE }],
  ];
  // the envelope: slices of an upside-down teardrop, each an octagon of three boxes, in colour bands
  const prof = (t) => t < 0.72 ? 1.2 + (4.3 - 1.2) * Math.sin(t / 0.72 * Math.PI / 2) : 4.3 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.72) / 0.3, 2))) + 0.4;
  const Y0 = 4.9, Y1 = 15.2, N = 16;
  for (let i = 0; i < N; i++) {
    const y0 = Y0 + (Y1 - Y0) * i / N, y1 = Y0 + (Y1 - Y0) * (i + 1) / N, r = prof((i + 0.5) / N), c = BANDS[Math.floor(i / 3) % BANDS.length];
    const col = i % 3 === 1 ? [0.97, 0.96, 0.92] : c;
    parts.push([-r, y0, -r * 0.42, r, y1, r * 0.42, 'white', { c: col }], [-r * 0.42, y0, -r, r * 0.42, y1, r, 'white', { c: col }], [-r * 0.74, y0, -r * 0.74, r * 0.74, y1, r * 0.74, 'white', { c: col }]);
  }
  parts.push([-0.6, Y1, -0.6, 0.6, Y1 + 0.25, 0.6, 'white', { c: [0.92, 0.2, 0.22] }]);
  RIDE_KINDS.balloon = {
    item: I.AVE_TICKET, name: 'Hot-air balloon', type: 'air', max: 8, rev: 0, acc: 0, brake: 0, steer: 0, base: 8, step: 1.05, h: 16, len: 2, w: 2,
    seat: [0, 0.9, 0], eye: [0, 1.75, 0], cam: 18, sit: false, hide: false, paintDefault: 0,
    parts, hit: [[-0.9, 0, -0.9, 0.9, 1.2, 0.9], [-4.3, 5, -4.3, 4.3, 15, 4.3]],
  };
  RIDE_KEYS.push('balloon');
  const d = RIDE_KINDS.balloon;
  d.key = 'balloon';
  d.model = d.parts.map(([x0, y0, z0, x1, y1, z1, sw, o = {}]) => ({ box: [x0, y0, z0, x1, y1, z1], sw, o }));
}

const Balloons = {
  parked: [], burnT: 0, hudT: 0,
  field() { const S = Fair.site(); return S ? { x: S.x + FAIR_BALLOONS.a + 0.5, y: S.F, z: S.z + FAIR_BALLOONS.b + 0.5 } : null; },
  wind(y) {
    const t = Date.now() / 1000;
    const a = Math.sin(t / 97) * 2.2 + Math.cos(t / 41) * 0.6 + y * 0.012;
    const s = clamp(1.2 + (y - 60) * 0.045, 0.6, 6.5) * (Weather.kind === 'storm' ? 1.8 : 1);
    return [Math.cos(a) * s, Math.sin(a) * s, a];
  },
  update(dt) {
    const F = this.field(), p = G.player;
    // the three waiting on the field, when you are near
    const near = F && Math.hypot(F.x - p.pos[0], F.z - p.pos[2]) < 180;
    this.parked = this.parked.filter((v) => !v.removed && v.parked);
    if (near && this.parked.length < 3 && !this.spawned) {
      this.spawned = true;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2 + 0.4, v = Rides.spawn('balloon', F.x + Math.cos(a) * 4.2, F.y, F.z + Math.sin(a) * 4.2, a, 0);
        v.scripted = true; v.balloon = true; v.parked = true; v.heat = 0.4; v.vy = 0; v.home = [v.pos[0], v.pos[1], v.pos[2]]; v.onGround = true;
        this.parked.push(v);
      }
    }
    if (!near && this.spawned) { for (const v of this.parked) v.removed = true; this.parked = []; this.spawned = false; }
    for (const v of Vehicles.list) {
      if (!v.balloon || v.removed) continue;
      if (v.parked) {
        // tethered: a slow bob and sway
        const t = G.time + v.home[0];
        v.pos = [v.home[0], v.home[1] + 0.06 + Math.sin(t * 0.8) * 0.05, v.home[2]]; v.roll = Math.sin(t * 0.6) * 0.02; v.pitch = Math.cos(t * 0.5) * 0.02;
        v.basis();
        continue;
      }
      if (G.vehicle !== v) {
        this.fly(v, dt, null);
        if (Math.hypot(v.pos[0] - p.pos[0], v.pos[2] - p.pos[2]) > 220) v.removed = true;
      }
    }
    this.hud();
  },
  // the physics of one balloon; input null = nobody in it
  fly(v, dt, input) {
    const burn = !!(input && input.keys && input.keys.has('Space'));
    v.burning = burn;
    v.heat = clamp((v.heat || 0) + (burn ? 0.32 : -0.055) * dt, 0, 1);
    const target = (v.heat - 0.42) * 7;
    v.vy += (target - v.vy) * Math.min(1, dt * 0.7);
    const [wx, wz] = this.wind(v.pos[1]);
    let hx = v.onGround ? 0 : wx, hz = v.onGround ? 0 : wz;
    if (input && input.keys && !v.onGround) {
      const k = input.keys, yaw = G.player.yaw, f = [-Math.sin(yaw), -Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)];
      const mf = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), mr = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      hx += (f[0] * mf + r[0] * mr) * 1.6; hz += (f[1] * mf + r[1] * mr) * 1.6;
    }
    v.vel[0] += (hx - v.vel[0]) * Math.min(1, dt * 0.5);
    v.vel[2] += (hz - v.vel[2]) * Math.min(1, dt * 0.5);
    const w = G.world, solid = (x, y, z) => { const id = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return id > 0 && BLOCK_SOLID[id] && !IS_LIQUID(id); };
    // up and down: the ground (or a roof) under the basket stops you
    let ny = v.pos[1] + v.vy * dt;
    const under = [[0, 0], [0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8]].some(([a, b]) => solid(v.pos[0] + a, ny - 0.02, v.pos[2] + b));
    const water = IS_LIQUID(w.getBlock(Math.floor(v.pos[0]), Math.floor(ny + 0.1), Math.floor(v.pos[2])));
    if (v.vy < 0 && (under || water)) { ny = water ? Math.floor(ny + 0.1) + 0.9 : Math.floor(ny - 0.02) + 1; v.vy = 0; if (!v.onGround) { v.onGround = true; sfx('place_1', v.pos, 0.6, 0.6); } }
    else if (v.vy > 0.05 || !under) v.onGround = v.vy <= 0 && under;
    if (v.vy > 0 && solid(v.pos[0], ny + 15.5, v.pos[2])) { v.vy = -0.5; ny = v.pos[1]; }
    ny = Math.min(ny, 250);
    // sideways: a wall at basket or envelope height stops the drift
    const nx = v.pos[0] + v.vel[0] * dt, nz = v.pos[2] + v.vel[2] * dt;
    const blocked = [0.5, 1, 6, 10].some((h) => solid(nx + Math.sign(v.vel[0]) * (h > 2 ? 4 : 0.9), ny + h, v.pos[2]) || solid(v.pos[0], ny + h, nz + Math.sign(v.vel[2]) * (h > 2 ? 4 : 0.9)));
    if (!blocked && !v.onGround) { v.pos[0] = nx; v.pos[2] = nz; } else { v.vel[0] *= 0.5; v.vel[2] *= 0.5; }
    v.pos[1] = ny;
    v.speed = Math.hypot(v.vel[0], v.vel[2]);
    // a gentle sway with the wind
    v.roll = Math.sin(G.time * 0.7) * 0.03 + (v.vel[0] - wx) * 0.01; v.pitch = Math.cos(G.time * 0.5) * 0.03;
    v.yaw += Math.sin(G.time * 0.1) * 0.02 * dt;
    v.basis();
    if (burn) {
      const f = v.toWorld([0, 3.9, 0]);
      for (let i = 0; i < 2; i++) Particles.flame(f[0] + rand(-0.15, 0.15), f[1] + rand(0, 0.4), f[2] + rand(-0.15, 0.15));
    }
  },
  open(v) {
    const F = this.field();
    if (!F) { G.ui.toast('Balloons fly from the funfair'); return; }
    const q = GPanel.open({ title: ED('Globus aerostàtic', 'Hot-air balloon'), icon: '🎈', sub: Fair.name() + ' · ' + CITY, width: 440, cls: 'gp-fair' });
    q.body.innerHTML = `<div class="fr-card"><div class="fr-hero">🎈</div><p>Fly wherever the wind takes you. Land anywhere.</p>
      <div class="fr-keys"><div><kbd>Space</kbd> burner: climb</div><div>let go: cool down and sink</div><div><kbd>W A S D</kbd> a little nudge</div><div><kbd>V</kbd> camera · <kbd>Shift</kbd> climb out</div></div>
      <button class="gp-btn ok fr-go">${G.mode === 'creative' ? '' : '🪙 ' + BALLOON_PRICE + ' · '}Take off</button></div>`;
    q.body.querySelector('.fr-go').addEventListener('click', () => {
      if (G.vehicle || Fair.seat) { G.ui.toast('You are already on a ride'); return; }
      if (!Shops.pay(BALLOON_PRICE)) { G.ui.toast('🪙 A flight costs ' + BALLOON_PRICE + ' coins'); sfx('gate_no', null, 0.6, 1); return; }
      q.close();
      let b = v && !v.removed && v.parked ? v : null;
      if (!b) {
        const p = G.player.pos;
        b = this.parked.slice().sort((a, c) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(c.pos[0] - p[0], c.pos[2] - p[2]))[0];
      }
      if (!b) { b = Rides.spawn('balloon', F.x, F.y, F.z, 0, 0); b.scripted = true; b.balloon = true; b.vy = 0; }
      b.parked = false; b.heat = 0.5; b.vy = 0; b.onGround = true;
      this.parked = this.parked.filter((x) => x !== b);
      boardBalloon.call(Vehicles, b);
      const pr = G.prog || (G.prog = {});
      pr.balloon = (pr.balloon || 0) + 1;
      G.ui.banner('🎈', 'Hold Space to fire the burner and climb');
    });
  },
  hud() {
    const v = G.vehicle;
    let el = $('balloonHud');
    document.body.classList.toggle('balloon', !!(v && v.balloon));
    if (!v || !v.balloon) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'balloonHud'; document.body.append(el); }
    const [wx, wz, a] = this.wind(v.pos[1]), ground = Math.max(0, Math.round(v.pos[1] - G.world.gen.height(Math.floor(v.pos[0]), Math.floor(v.pos[2])) - 1));
    const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'], dir = dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
    el.innerHTML = `<div class="bl-row"><b>${ground} m</b><span>${v.vy > 0.3 ? '▲ climbing' : v.vy < -0.3 ? '▼ sinking' : v.onGround ? 'on the ground' : 'floating'}</span></div>
      <div class="bl-heat"><i style="width:${Math.round(v.heat * 100)}%"></i></div>
      <div class="bl-row"><small>🌬️ ${dir} · ${Math.round(Math.hypot(wx, wz) * 3.6)} km/h</small><small>${v.burning ? '🔥 burner' : 'Space: burner'}</small></div>`;
    el.classList.add('show');
  },
};
SYNTH.burner = (ctx, o, t) => { Sound.noise(ctx, o, t, 0.4, { type: 'bandpass', freq: 380, q: 0.7, gain: 0.35, attack: 0.03 }); Sound.noise(ctx, o, t, 0.4, { type: 'highpass', freq: 2500, gain: 0.06 }); };

const boardBalloon = Vehicles.board;
{
  Vehicles.board = function (v) {
    if (v && v.balloon && v.parked) { Balloons.open(v); return; }
    return boardBalloon.call(this, v);
  };
  const ser = Vehicles.serialize;
  Vehicles.serialize = function () { const keep = this.list; this.list = keep.filter((v) => !v.balloon); try { return ser.call(this); } finally { this.list = keep; } };
  const pk = Vehicles.pickUp;
  Vehicles.pickUp = function (v) { if (v && v.balloon) return; return pk.call(this, v); };
  const hit = Vehicles.hit;
  if (hit) Vehicles.hit = function (v) { if (v && v.balloon) return; return hit.call(this, v); };
  const idle = Ride.prototype.updateIdle;
  Ride.prototype.updateIdle = function (dt) { if (this.balloon) return; return idle.call(this, dt); };
  const pilot = Rides.pilot;
  Rides.pilot = function (v, dt, input, horn) {
    if (!v.balloon) return pilot.call(this, v, dt, input, horn);
    Balloons.fly(v, dt, input);
    const p = G.player, at = v.toWorld([0, 0.14, 0]);
    p.pos = at; p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    p.inWater = p.eyeInWater = p.inLava = p.eyeInLava = false;
    this.stopMotor();
    Balloons.burnT -= dt;
    if (v.burning && Balloons.burnT <= 0) { sfx('burner', v.pos, 0.55, 1); Balloons.burnT = 0.34; }
  };
  const dis = Rides.dismount;
  Rides.dismount = function (v, forced) {
    if (!v.balloon) return dis.call(this, v, forced);
    dis.call(this, v, forced);
    const p = G.player;
    if (!v.onGround) { p.pos = v.toWorld([1.4, 0.3, 0]); p.vel = [0, 0, 0]; p.parachute = true; G.ui.toast('Out of the basket: parachute open'); liftOutOfBlocks(p); }
    v.heat = Math.min(v.heat, 0.3);
  };
  const rb = Rides.board;
  Rides.board = function (v) {
    if (!v || !v.balloon) return rb.call(this, v);
    const toast = G.ui.toast;
    G.ui.toast = () => {};
    try { rb.call(this, v); } finally { G.ui.toast = toast; }
    G.ui.toast('Space burner (climb) · let go to sink · WASD nudge · V camera · Shift climb out', 6000);
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); try { Balloons.update(dt || 0.016); } catch (e) { console.warn('Blocklands: balloons', e); } };
}
