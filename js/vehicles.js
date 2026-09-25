'use strict';
// A rideable fighter jet: box model painted from atlas swatches, arcade flight model with
// mouse aim (the jet chases the camera direction, banking into turns), landing gear, taxiing,
// stalls, crashes, cannon and missiles, chase / cockpit cameras and a head-up display.

const JET_GEAR_H = 1.55;      // centre of gravity above the wheels
const JET_MIN_FLY = 24;       // lift-off / stall speed (blocks per second)
const JET_MAX = 150;

// Parts in blocks: [x0, y0, z0, x1, y1, z1, swatch, options]. Written in "parked" coordinates
// (wheels at y = 0, nose towards +Z, +X is the pilot's left); `m` adds a mirrored copy.
const JET_PARTS_SRC = [
  // fuselage
  [-0.75, 1.0, -5.0, 0.75, 2.15, 3.2, 'hull', { faces: { bottom: 'belly' } }],
  [-0.48, 2.15, -4.6, 0.48, 2.42, 1.2, 'hull'],
  [-0.62, 0.86, -4.4, 0.62, 1.0, 2.6, 'belly'],
  [-0.62, 1.08, 3.2, 0.62, 2.08, 5.0, 'hull', { faces: { bottom: 'belly' } }],
  [-0.48, 1.22, 5.0, 0.48, 1.96, 6.4, 'hull', { faces: { bottom: 'belly' } }],
  [-0.33, 1.36, 6.4, 0.33, 1.84, 7.5, 'hullDark'],
  [-0.18, 1.48, 7.5, 0.18, 1.72, 8.1, 'hullDark'],
  [-0.04, 1.57, 8.1, 0.04, 1.63, 8.8, 'metal'],
  // canopy
  [-0.44, 2.08, 1.9, 0.44, 2.62, 4.3, 'glass', { canopy: true }],
  [-0.34, 2.08, 4.3, 0.34, 2.42, 5.05, 'glass', { canopy: true }],
  [-0.46, 2.08, 3.2, 0.46, 2.66, 3.32, 'hullDark', { canopy: true }],
  [-0.4, 2.08, 1.2, 0.4, 2.4, 1.9, 'hull'],
  // seen from the seat: glare shield and canopy frame
  [-0.4, 1.95, 3.95, 0.4, 2.3, 4.25, 'hullDark', { inside: true }],
  [-0.3, 2.3, 4.05, 0.3, 2.31, 4.2, 'glass', { inside: true }],
  [0.4, 2.08, 1.9, 0.46, 2.16, 5.0, 'hullDark', { m: true, inside: true }],
  [-0.36, 2.44, 4.95, 0.36, 2.5, 5.05, 'hullDark', { inside: true }],
  [0.31, 2.08, 4.9, 0.37, 2.47, 5.05, 'hullDark', { m: true, inside: true }],
  // intakes and engines
  [0.75, 1.0, -0.6, 1.3, 1.95, 2.8, 'hull', { m: true, faces: { front: 'intake', bottom: 'belly' } }],
  [0.73, 1.95, 1.8, 1.32, 2.02, 2.8, 'hullDark', { m: true }],
  [0.08, 1.02, -5.9, 0.74, 1.9, -5.0, 'nozzle', { m: true }],
  [0.16, 1.1, -5.96, 0.66, 1.82, -5.9, 'glow', { m: true, glow: true }],
  // wings
  [0.75, 1.37, -4.3, 1.9, 1.52, 1.8, 'hull', { m: true, faces: { bottom: 'belly' } }],
  [1.9, 1.38, -4.3, 3.0, 1.51, 0.3, 'hull', { m: true, faces: { top: 'roundel', bottom: 'belly' } }],
  [3.0, 1.39, -4.1, 4.0, 1.5, -1.1, 'hull', { m: true, faces: { bottom: 'belly' } }],
  [4.0, 1.4, -3.9, 4.75, 1.49, -2.1, 'hull', { m: true, faces: { bottom: 'belly' } }],
  [1.0, 1.36, -4.45, 3.9, 1.5, -4.3, 'hullDark', { m: true }],
  [0.75, 1.46, 1.8, 1.25, 1.56, 3.6, 'hull', { m: true }],
  [4.75, 1.33, -4.0, 4.9, 1.53, -1.7, 'hullDark', { m: true }],
  // wingtip missiles (always carried)
  [4.78, 1.1, -3.5, 4.94, 1.3, -0.3, 'white', { m: true }],
  [4.79, 1.12, -0.3, 4.93, 1.28, 0.05, 'hullDark', { m: true }],
  [4.7, 1.04, -3.5, 5.02, 1.36, -3.2, 'white', { m: true }],
  // under-wing missiles (fired and reloaded)
  [2.45, 1.3, -1.8, 2.55, 1.38, 0.2, 'hullDark', { m: true }],
  [2.36, 1.02, -2.9, 2.64, 1.3, 0.9, 'white', { m: true, missile: true }],
  [2.4, 1.06, 0.9, 2.6, 1.26, 1.3, 'red', { m: true, missile: true }],
  [2.28, 0.96, -2.9, 2.72, 1.36, -2.6, 'white', { m: true, missile: true }],
  // tail
  [0.74, 1.3, -6.3, 1.9, 1.42, -4.7, 'hull', { m: true }],
  [1.9, 1.31, -6.4, 2.85, 1.41, -5.4, 'hull', { m: true }],
  [0.3, 2.1, -5.7, 0.44, 3.95, -4.0, 'tail', { m: true, pivot: [0.37, 2.1, -4.85], rz: -0.32 }],
  [0.3, 3.95, -5.55, 0.44, 4.25, -4.7, 'hullDark', { m: true, pivot: [0.37, 2.1, -4.85], rz: -0.32 }],
  // landing gear
  [-0.05, 0.3, 5.1, 0.05, 1.1, 5.2, 'metal', { gear: true }],
  [-0.11, 0, 4.95, 0.11, 0.38, 5.35, 'tire', { gear: true }],
  [0.98, 0.35, -1.2, 1.08, 1.05, -1.1, 'metal', { m: true, gear: true }],
  [0.92, 0, -1.45, 1.14, 0.52, -0.85, 'tire', { m: true, gear: true }],
  // navigation lights: red on the left wing, green on the right, white strobes on the fins
  [4.8, 1.53, -2.55, 4.92, 1.61, -2.4, 'navRed', { nav: 'L' }],
  [-4.92, 1.53, -2.55, -4.8, 1.61, -2.4, 'navGreen', { nav: 'R' }],
  [0.3, 4.25, -5.2, 0.44, 4.33, -5.0, 'navWhite', { m: true, nav: 'S', pivot: [0.37, 2.1, -4.85], rz: -0.32 }],
];

const JET_PARTS = (() => {
  const out = [];
  for (const [x0, y0, z0, x1, y1, z1, sw, o = {}] of JET_PARTS_SRC) {
    const base = Object.assign({}, o, { box: [x0, y0 - JET_GEAR_H, z0, x1, y1 - JET_GEAR_H, z1], sw });
    if (o.pivot) base.pivot = [o.pivot[0], o.pivot[1] - JET_GEAR_H, o.pivot[2]];
    base.side = x0 + x1 > 0 ? 0 : 1;
    out.push(base);
    if (o.m) {
      const mb = Object.assign({}, base, { box: [-x1, y0 - JET_GEAR_H, z0, -x0, y1 - JET_GEAR_H, z1], side: 1 });
      if (o.pivot) mb.pivot = [-o.pivot[0], o.pivot[1] - JET_GEAR_H, o.pivot[2]];
      if (o.rz) mb.rz = -o.rz;
      out.push(mb);
    }
  }
  return out;
})();

// Points that must stay out of the terrain (local, relative to the centre of gravity).
const JET_PROBES = [[0, 0.05, 8.3], [4.85, -0.1, -2.6], [-4.85, -0.1, -2.6], [0.9, 2.4, -5.1], [-0.9, 2.4, -5.1], [0, 0.9, 3.4], [0, -0.5, -5.5], [2.5, -0.1, -5.6], [-2.5, -0.1, -5.6]];
const JET_GUNS = [[0.62, 0.35, 4.6], [-0.62, 0.35, 4.6]];
const JET_PYLONS = [[2.5, -0.35, -0.8], [-2.5, -0.35, -0.8]];
const JET_NOZZLES = [[0.41, -0.09, -6.1], [-0.41, -0.09, -6.1]];

function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// Top of whatever the wheels would rest on below (x, yTop, z), or -Infinity within 8 blocks.
function jetGround(world, x, yTop, z) {
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let y = Math.floor(yTop); y > Math.floor(yTop) - 8 && y >= 0; y--) {
    const id = world.getBlock(bx, y, bz);
    if (id === B.WATER) return y + 0.88;
    if (BLOCK_SOLID[id] && !isSoftForJet(id)) return y + BLOCK_HEIGHT[id] / 16;
  }
  return -Infinity;
}
// foliage and plants brush past the airframe instead of wrecking it
function isSoftForJet(id) { return BLOCK_RT[id] === RT_CUTOUT && id !== B.GLASS; }

class Jet {
  constructor(x, y, z, yaw) {
    this.id = Math.random().toString(36).slice(2, 10);
    this.pos = [x, y, z];
    this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.throttle = 0; this.burner = false; this.brake = false;
    this.vel = [0, 0, 0];
    this.onGround = true; this.gear = 1; this.gearDown = true;
    this.missiles = [true, true]; this.reload = [0, 0];
    this.gunCd = 0; this.gunSide = 0; this.missileCd = 0;
    this.manualRoll = 0; this.rollHold = 0;
    this.hits = 0; this.removed = false;
    this.pitchRate = 0; this.yawRate = 0;
    this.blink = Math.random() * 2;
    this.basis();
  }

  basis() {
    const m = XF.chain(XF.ry(this.yaw), XF.rx(-this.pitch), XF.rz(this.roll));
    this.m = m;
    this.fwd = [m[2], m[6], m[10]];
    this.up = [m[1], m[5], m[9]];
    this.left = [m[0], m[4], m[8]];
  }

  toWorld(l) {
    const m = this.m, p = this.pos;
    return [p[0] + m[0] * l[0] + m[1] * l[1] + m[2] * l[2], p[1] + m[4] * l[0] + m[5] * l[1] + m[6] * l[2], p[2] + m[8] * l[0] + m[9] * l[1] + m[10] * l[2]];
  }

  get state() {
    return { pos: this.pos, yaw: this.yaw, pitch: this.pitch, roll: this.roll, gear: this.gear, throttle: this.throttle, burner: this.burner, missiles: this.missiles, blink: this.blink };
  }

  // Parked, or after the pilot jumped out: brake, settle on the ground or fall.
  updateIdle(dt) {
    const w = G.world;
    this.throttle = Math.max(0, this.throttle - dt * 0.5);
    this.burner = false;
    if (this.onGround) {
      this.speed = Math.max(0, this.speed - dt * 14);
      this.pitch += (0 - this.pitch) * (1 - Math.exp(-dt * 4));
      this.roll += (0 - wrapAngle(this.roll)) * (1 - Math.exp(-dt * 4));
      this.basis();
      const nx = this.pos[0] + this.fwd[0] * this.speed * dt, nz = this.pos[2] + this.fwd[2] * this.speed * dt;
      const g = jetGround(w, nx, this.pos[1] - JET_GEAR_H + 1.2, nz);
      if (g === -Infinity) this.onGround = false;
      else if (g - (this.pos[1] - JET_GEAR_H) > 1.1) this.speed = 0;
      else { this.pos[0] = nx; this.pos[2] = nz; this.pos[1] = g + JET_GEAR_H; }
      this.vel = [this.fwd[0] * this.speed, 0, this.fwd[2] * this.speed];
    } else {
      // pilotless glide down
      this.vel[1] -= 20 * dt;
      this.pitch += (-0.25 - this.pitch) * dt * 0.5;
      this.basis();
      for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt;
      const g = jetGround(w, this.pos[0], this.pos[1], this.pos[2]);
      if (this.pos[1] - JET_GEAR_H <= g) {
        if (Math.abs(this.vel[1]) > 12 || Math.hypot(this.vel[0], this.vel[2]) > 45) { this.crash(); return; }
        this.onGround = true; this.pos[1] = g + JET_GEAR_H; this.speed = Math.hypot(this.vel[0], this.vel[2]);
      }
    }
    this.gear += ((this.onGround || this.gearDown ? 1 : 0) - this.gear) * (1 - Math.exp(-dt * 2));
  }

  // aim = unit vector the pilot is looking along; input = keyboard state.
  fly(dt, aim, input) {
    const k = input.keys;
    const w = G.world;
    if (k.has('KeyW')) this.throttle = Math.min(1, this.throttle + dt * 0.6);
    if (k.has('KeyS')) this.throttle = Math.max(0, this.throttle - dt * 0.8);
    this.burner = k.has('Space') && this.throttle > 0.3;
    this.brake = k.has('KeyS') && this.throttle === 0;
    const rollIn = (k.has('KeyA') ? 1 : 0) - (k.has('KeyD') ? 1 : 0);

    const yawT = Math.atan2(aim[0], aim[2]);
    const pitchT = Math.asin(clamp(aim[1], -1, 1));
    const yawErr = wrapAngle(yawT - this.yaw);
    const pitchErr = pitchT - this.pitch;
    const thrust = 12 + 58 * this.throttle + (this.burner ? 48 : 0);

    if (this.onGround) {
      // taxi, take-off roll and landing roll-out
      let acc = (thrust - 12) * 0.095 - this.speed * this.speed * 0.0012 - 0.6;
      if (this.throttle < 0.02) acc = -this.speed * 0.25 - 1.5;
      if (this.brake) acc = -16;
      this.speed = clamp(this.speed + acc * dt, 0, JET_MAX);
      const steer = this.speed < 30 ? 0.9 : 0.35;
      this.yawRate = clamp(yawErr * 2, -1, 1) * steer * Math.min(1, this.speed / 3 + 0.25);
      this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
      const rot = this.speed > JET_MIN_FLY - 4 ? clamp(pitchT, 0, 0.3) : 0;
      this.pitch += (rot - this.pitch) * (1 - Math.exp(-dt * 2.5));
      this.roll += (0 - wrapAngle(this.roll)) * (1 - Math.exp(-dt * 5));
      this.basis();
      const nx = this.pos[0] + this.fwd[0] * this.speed * dt, nz = this.pos[2] + this.fwd[2] * this.speed * dt;
      const g = jetGround(w, nx, this.pos[1] - JET_GEAR_H + 1.2, nz);
      const cur = this.pos[1] - JET_GEAR_H;
      if (g === -Infinity || cur - g > 1.2) {
        this.onGround = false;       // rolled off an edge
        this.pos[0] = nx; this.pos[2] = nz;
      } else if (g - cur > 1.1) {
        if (this.speed > 14) { this.crash(); return; }
        this.speed = 0;
      } else { this.pos[0] = nx; this.pos[2] = nz; this.pos[1] = g + JET_GEAR_H; }
      if (this.speed > JET_MIN_FLY && this.pitch > 0.07) { this.onGround = false; this.pos[1] += 0.05; }
      this.vel = [this.fwd[0] * this.speed, 0, this.fwd[2] * this.speed];
    } else {
      const auth = clamp((this.speed - 10) / 32, 0.12, 1);
      const pr = clamp(pitchErr * 2.6, -1, 1) * 1.15 * auth;
      const yr = clamp(yawErr * 2.3, -1, 1) * 1.0 * auth;
      this.pitchRate += (pr - this.pitchRate) * (1 - Math.exp(-dt * 6));
      this.yawRate += (yr - this.yawRate) * (1 - Math.exp(-dt * 6));
      this.pitch = clamp(this.pitch + this.pitchRate * dt, -1.45, 1.45);
      this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
      // energy: thrust against drag and gravity along the flight path
      this.speed += ((thrust - this.speed) * 0.32 - 14 * Math.sin(this.pitch)) * dt;
      this.speed = clamp(this.speed, 0, JET_MAX);
      let sink = 0;
      if (this.speed < JET_MIN_FLY) {
        const s = (JET_MIN_FLY - this.speed) / JET_MIN_FLY;
        sink = s * 26;
        this.pitch -= s * 0.9 * dt;
      }
      // bank into turns, or roll by hand with A / D
      if (rollIn) { this.roll = wrapAngle(this.roll + rollIn * 3.6 * dt); this.rollHold = 0.6; }
      else {
        this.rollHold -= dt;
        const target = clamp(-this.yawRate * 1.25, -1.3, 1.3);
        const rate = this.rollHold > 0 ? 1.5 : 4;
        this.roll = wrapAngle(this.roll + wrapAngle(target - this.roll) * (1 - Math.exp(-dt * rate)));
      }
      this.basis();
      this.vel = [this.fwd[0] * this.speed, this.fwd[1] * this.speed - sink, this.fwd[2] * this.speed];
      for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt;
      // service ceiling: the thin air gives no more lift
      if (this.pos[1] > 260) { this.pos[1] = 260; this.pitch = Math.min(this.pitch, 0.05); }
      // touch-down or impact
      const g = jetGround(w, this.pos[0], this.pos[1] - JET_GEAR_H + 1, this.pos[2]);
      if (this.pos[1] - JET_GEAR_H <= g) {
        const soft = this.gear > 0.9 && this.vel[1] > -11 && Math.abs(wrapAngle(this.roll)) < 0.4 && this.pitch > -0.18 && this.speed < 75;
        if (!soft) { this.crash(); return; }
        this.onGround = true;
        this.pos[1] = g + JET_GEAR_H;
        this.pitch = Math.max(0, this.pitch);
        sfx('land', null, 1, 0.6);
        G.shake = Math.max(G.shake, 0.25);
      }
    }
    if (this.checkImpact()) return;
    // landing gear: down on the ground and when slow and low, up otherwise (G toggles)
    const agl = this.pos[1] - JET_GEAR_H - jetGround(w, this.pos[0], this.pos[1], this.pos[2]);
    const auto = this.onGround || (this.speed < 60 && agl < 22);
    if (this.gearManual !== undefined && !this.onGround) this.gearDown = this.gearManual;
    else this.gearDown = auto;
    this.gear += ((this.gearDown ? 1 : 0) - this.gear) * (1 - Math.exp(-dt * 1.6));
  }

  checkImpact() {
    if (this.speed < 6 && this.onGround) return false;
    const w = G.world;
    for (const l of JET_PROBES) {
      const p = this.toWorld(l);
      const id = w.getBlock(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]));
      if (BLOCK_SOLID[id] && !isSoftForJet(id) && p[1] - Math.floor(p[1]) < BLOCK_HEIGHT[id] / 16) {
        if (this.speed > 9) { this.crash(); return true; }
        this.speed = 0;
      }
    }
    return false;
  }

  crash() {
    if (this.removed) return;
    this.removed = true;
    const p = this.pos;
    const pilot = G.vehicle === this;
    if (pilot) Vehicles.dismount(true);
    explode(p[0], p[1], p[2], 4.5, null);
    for (let i = 0; i < 40; i++) {
      const l = rand(0.6, 2);
      Particles.add(Particles.base(p[0] + rand(-3, 3), p[1] + rand(-1, 1), p[2] + rand(-3, 3), {
        vx: this.vel[0] * 0.3 + rand(-6, 6), vy: rand(2, 12), vz: this.vel[2] * 0.3 + rand(-6, 6), life: l, max: l, size: rand(0.1, 0.25),
        layer: T.p_flame, glow: true, grav: 14, drag: 0.97,
      }));
    }
    Particles.smoke(p[0], p[1] + 1, p[2], 30, 2.5, true);
    G.shake = 1;
  }
}

// ----------------------------------------------------------------- manager ----
const Vehicles = {
  list: [], bullets: [], missiles: [],
  camMode: 'chase', camSmooth: null, hudCtx: null, lastHint: 0,

  clear() { this.list.length = 0; this.bullets.length = 0; this.missiles.length = 0; },

  spawnJet(x, y, z, yaw) {
    const j = new Jet(x, y, z, yaw);
    this.list.push(j);
    return j;
  },

  // Puts a jet on the ground a little ahead of the player, nose pointing where they look.
  spawnAhead() {
    const p = G.player, w = G.world;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    for (let d = 12; d < 40; d += 2) {
      const x = Math.floor(p.pos[0] + fx * d), z = Math.floor(p.pos[2] + fz * d);
      if (!w.isLoaded(x, z)) continue;
      const g = jetGround(w, x + 0.5, w.surfaceHeight(x, z) + 1.5, z + 0.5);
      if (g === -Infinity) continue;
      // wings need open air around the fuselage
      let blocked = false;
      for (const [ox, oz] of [[0, 0], [4, 0], [-4, 0], [0, 6], [0, -5]]) {
        const lx = Math.floor(x + ox * Math.cos(p.yaw) + oz * fx), lz = Math.floor(z - ox * Math.sin(p.yaw) + oz * fz);
        for (let y = Math.floor(g) + 1; y < g + 4; y++) if (BLOCK_SOLID[w.getBlock(lx, y, lz)]) blocked = true;
      }
      if (blocked) continue;
      const j = this.spawnJet(x + 0.5, g + JET_GEAR_H, z + 0.5, Math.atan2(fx, fz));
      Particles.poof(j.pos[0], j.pos[1], j.pos[2], 3, 2);
      sfx('portal', j.pos, 0.6, 1.4);
      return j;
    }
    return null;
  },

  raycast(o, d, maxDist) {
    let best = null, bestT = maxDist;
    for (const v of this.list) {
      if (v.removed || v === G.vehicle) continue;
      // coarse boxes: fuselage, wings, tail
      for (const b of [[-0.8, -0.7, -6.4, 0.8, 1.1, 8.8], [-4.9, -0.4, -4.4, 4.9, 0.1, 1.8], [-2.9, -0.4, -6.5, 2.9, 2.8, -4.0]]) {
        // transform the ray into the jet's frame (rotation only has yaw/pitch/roll)
        const m = v.m;
        const ro = [o[0] - v.pos[0], o[1] - v.pos[1], o[2] - v.pos[2]];
        const lo = [m[0] * ro[0] + m[4] * ro[1] + m[8] * ro[2], m[1] * ro[0] + m[5] * ro[1] + m[9] * ro[2], m[2] * ro[0] + m[6] * ro[1] + m[10] * ro[2]];
        const ld = [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
        const hit = rayBox(lo, ld, b[0], b[1], b[2], b[3], b[4], b[5]);
        if (hit && hit.t < bestT) { bestT = hit.t; best = v; }
      }
    }
    return best ? { vehicle: best, dist: bestT } : null;
  },

  board(v) {
    if (G.vehicle || v.removed) return;
    const p = G.player;
    G.vehicle = v;
    v.pilot = true;
    v.gearManual = undefined;
    p.flying = false; p.vel = [0, 0, 0]; p.parachute = false;
    // look where the nose points
    p.yaw = wrapAngle(v.yaw + Math.PI); p.pitch = v.pitch;
    this.camSmooth = null;
    document.body.classList.add('piloting');
    sfx('canopy', null, 1, 1);
    Sound.init();
    Engine.start();
    G.ui.toast('W/S throttle · mouse steer · Space afterburner · LMB cannon · RMB missile · V camera · G gear · Shift exit', 6000);
  },

  dismount(forced) {
    const v = G.vehicle;
    if (!v) return;
    G.vehicle = null;
    v.pilot = false;
    document.body.classList.remove('piloting');
    Engine.stop();
    const p = G.player;
    p.fallStart = null; p.landed = 0;
    if (v.onGround && !forced) {
      // climb down beside the cockpit
      const side = v.toWorld([2.2, -JET_GEAR_H + 0.1, 3.0]);
      p.pos = [side[0], side[1] + 0.2, side[2]];
      p.vel = [0, 0, 0];
      liftOutOfBlocks(p);
    } else {
      // ejection seat and parachute
      const seat = v.toWorld([0, 1.4, 3.4]);
      p.pos = [seat[0], seat[1], seat[2]];
      p.vel = [v.vel[0] * 0.35 + v.up[0] * 6, Math.max(8, v.vel[1] * 0.35 + 10), v.vel[2] * 0.35 + v.up[2] * 6];
      if (!v.onGround) { p.parachute = true; if (!forced) G.ui.toast('Ejected! Parachute deployed'); }
      liftOutOfBlocks(p);
    }
  },

  hit(v) {
    if (G.mode === 'creative') { this.pickUp(v); return; }
    v.hits++;
    sfx('place_8', v.pos, 1, 0.8);
    Particles.crit(v.pos[0], v.pos[1] + 0.5, v.pos[2], 6);
    if (v.hits >= 4) this.pickUp(v);
  },

  pickUp(v) {
    v.removed = true;
    if (G.mode === 'survival') Ents.spawnItem({ id: I.JET, count: 1 }, v.pos[0], v.pos[1], v.pos[2]);
    else G.inv.add({ id: I.JET, count: 1 });
    G.ui.invDirty();
    Particles.poof(v.pos[0], v.pos[1], v.pos[2], 3, 2);
    sfx('pop', v.pos, 1, 0.7);
  },

  // Per frame while piloting (input already filtered for menus / death).
  pilot(dt, input, firing) {
    const v = G.vehicle;
    if (!v) return;
    const p = G.player;
    const aim = p.lookDir();
    v.fly(dt, aim, input);
    if (G.vehicle !== v) return; // crashed
    // the pilot rides in the cockpit
    const seat = v.toWorld([0, 0.3, 3.4]);
    p.pos = [seat[0], seat[1] - 0.5, seat[2]];
    p.vel = [0, 0, 0];
    p.onGround = true; p.fallStart = null; p.landed = 0;
    p.inWater = p.eyeInWater = p.inLava = p.eyeInLava = false;
    // weapons
    v.gunCd -= dt;
    if (firing.gun && v.gunCd <= 0) { v.gunCd = 0.055; this.fireGun(v); }
    v.missileCd -= dt;
    if (firing.missile && v.missileCd <= 0) { v.missileCd = 0.35; this.fireMissile(v); }
    Engine.update(v.throttle, v.burner, v.speed, 0);
  },

  fireGun(v) {
    const side = v.gunSide = 1 - v.gunSide;
    const o = v.toWorld(JET_GUNS[side]);
    const spread = 0.006;
    const d = [v.fwd[0] + rand(-spread, spread), v.fwd[1] + rand(-spread, spread), v.fwd[2] + rand(-spread, spread)];
    const s = 320;
    this.bullets.push({ pos: o, vel: [v.vel[0] + d[0] * s, v.vel[1] + d[1] * s, v.vel[2] + d[2] * s], life: 1.3, own: true });
    sfx('gun', null, 0.5, rand(0.9, 1.1));
    Particles.add(Particles.base(o[0] + v.fwd[0] * 0.6, o[1] + v.fwd[1] * 0.6, o[2] + v.fwd[2] * 0.6, {
      vx: v.vel[0], vy: v.vel[1], vz: v.vel[2], life: 0.05, max: 0.05, size: 0.22, layer: T.p_flame, glow: true, collide: false }));
  },

  fireMissile(v) {
    const side = v.missiles[0] ? 0 : v.missiles[1] ? 1 : -1;
    if (side < 0) { sfx('beep', null, 1, 0.6); return; }
    v.missiles[side] = false;
    v.reload[side] = 5;
    const o = v.toWorld(JET_PYLONS[side]);
    this.missiles.push({ pos: o, vel: v.vel.slice(), dir: v.fwd.slice(), life: 6, t: 0, own: true });
    sfx('missile', null, 1, 1);
    Net.missile(o, v.fwd, Math.max(v.speed, 20));
  },

  // Remote players' missiles are simulated here too (they explode where they hit).
  addRemoteMissile(pos, dir, speed) {
    if (this.missiles.length > 30) return;
    this.missiles.push({ pos: pos.slice(), vel: dir.map((c) => c * speed), dir: dir.slice(), life: 6, t: 0, own: false });
  },

  update(dt) {
    const w = G.world;
    for (const v of this.list) {
      if (v.removed) continue;
      v.blink += dt;
      for (let s = 0; s < 2; s++) if (!v.missiles[s]) { v.reload[s] -= dt; if (v.reload[s] <= 0) v.missiles[s] = true; }
      if (v !== G.vehicle) v.updateIdle(dt);
      this.effects(v, dt);
    }
    this.list = this.list.filter((v) => !v.removed);
    if (!G.vehicle) Engine.stop();

    // cannon rounds: fast rays that stop at blocks and mobs
    for (const b of this.bullets) {
      b.life -= dt;
      const step = Math.hypot(b.vel[0], b.vel[1], b.vel[2]) * dt;
      const d = [b.vel[0] * dt / step, b.vel[1] * dt / step, b.vel[2] * dt / step];
      const mob = Ents.raycastMob(b.pos, d, step);
      let blockT = Infinity, bid = 0, bp = null;
      for (let t = 0; t < step; t += 0.45) {
        const x = Math.floor(b.pos[0] + d[0] * t), y = Math.floor(b.pos[1] + d[1] * t), z = Math.floor(b.pos[2] + d[2] * t);
        const id = w.getBlock(x, y, z);
        if (id !== B.AIR && (BLOCK_SOLID[id] || IS_LIQUID(id))) { blockT = t; bid = id; bp = [x, y, z]; break; }
      }
      if (mob && mob.dist < blockT) {
        if (b.own) mob.mob.damage(6, { player: true, from: b.pos, knock: 0.6 });
        Particles.crit(b.pos[0] + d[0] * mob.dist, b.pos[1] + d[1] * mob.dist, b.pos[2] + d[2] * mob.dist, 4);
        b.life = 0;
      } else if (bp) {
        const hp = [b.pos[0] + d[0] * blockT, b.pos[1] + d[1] * blockT, b.pos[2] + d[2] * blockT];
        if (bid === B.WATER) Particles.splash(hp[0], bp[1] + 1, hp[2], 5);
        else {
          Particles.blockHit(bp[0], bp[1], bp[2], bid, [-Math.sign(d[0]) * (Math.abs(d[0]) > 0.5 ? 1 : 0), d[1] < -0.5 ? 1 : 0, -Math.sign(d[2]) * (Math.abs(d[2]) > 0.5 ? 1 : 0)]);
          Particles.crit(hp[0], hp[1], hp[2], 2);
          // glass, leaves and plants do not survive a burst
          if (b.own && BLOCK_HARD[bid] >= 0 && BLOCK_HARD[bid] <= 0.3 && Math.random() < 0.5) destroyBlock(bp[0], bp[1], bp[2], { drops: false });
        }
        b.life = 0;
      } else for (let i = 0; i < 3; i++) b.pos[i] += b.vel[i] * dt;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    // missiles: boost, smoke trail, blast on contact
    for (const m of this.missiles) {
      m.t += dt; m.life -= dt;
      const sp = Math.hypot(m.vel[0], m.vel[1], m.vel[2]);
      const want = Math.min(190, sp + 140 * dt);
      const drop = m.t < 0.25 ? 6 : 0;
      m.vel = [m.dir[0] * want, m.dir[1] * want - drop, m.dir[2] * want];
      const n = Math.max(1, Math.ceil(want * dt / 0.5));
      let hit = null;
      for (let i = 0; i < n && !hit; i++) {
        for (let k = 0; k < 3; k++) m.pos[k] += m.vel[k] * dt / n;
        const id = w.getBlock(Math.floor(m.pos[0]), Math.floor(m.pos[1]), Math.floor(m.pos[2]));
        if (m.t > 0.15 && id !== B.AIR && (BLOCK_SOLID[id] || IS_LIQUID(id))) hit = m.pos.slice();
        const mb = m.t > 0.15 ? Ents.raycastMob(m.pos, [m.dir[0], m.dir[1], m.dir[2]], 1) : null;
        if (mb) hit = m.pos.slice();
      }
      if (m.t > 0.08) {
        Particles.add(Particles.base(m.pos[0] - m.dir[0], m.pos[1] - m.dir[1], m.pos[2] - m.dir[2], {
          vx: rand(-0.4, 0.4), vy: rand(-0.2, 0.4), vz: rand(-0.4, 0.4), life: 2.4, max: 2.4, size: rand(0.35, 0.5),
          layer: T.p_smoke, r: 0.86, g: 0.86, b: 0.88, blend: true, drag: 0.97, grow: 3, collide: false }));
        Particles.flame(m.pos[0] - m.dir[0] * 1.2, m.pos[1] - m.dir[1] * 1.2, m.pos[2] - m.dir[2] * 1.2);
      }
      if (hit || m.life <= 0) {
        m.life = 0;
        // someone else's missile: their game shares the blast itself
        if (m.own) explode(m.pos[0], m.pos[1], m.pos[2], 4, null);
        else { Particles.explosion(m.pos[0], m.pos[1], m.pos[2], 3); sfx('explode', m.pos, 1.2, 1); }
      }
    }
    this.missiles = this.missiles.filter((m) => m.life > 0);
  },

  // Afterburner flames, heat, contrails.
  effects(v, dt) {
    if (v.throttle < 0.05 && !v.burner) return;
    const n = v.burner && Math.random() < 0.5 ? 1 : 0;
    for (const nz of JET_NOZZLES) {
      const o = v.toWorld(nz);
      for (let i = 0; i < n; i++) {
        const l = rand(0.05, 0.12) * (v.burner ? 1.4 : 1);
        const back = rand(4, 14);
        Particles.add(Particles.base(o[0] - v.fwd[0] * rand(0, 1.2), o[1] - v.fwd[1] * rand(0, 1.2), o[2] - v.fwd[2] * rand(0, 1.2), {
          vx: v.vel[0] - v.fwd[0] * back, vy: v.vel[1] - v.fwd[1] * back, vz: v.vel[2] - v.fwd[2] * back,
          life: l, max: l, size: rand(0.1, 0.18), layer: T.p_flame, glow: true, drag: 1, shrink: true, collide: false }));
      }
    }
    // wingtip vapour in hard turns and at speed
    const g = Math.abs(v.pitchRate) + Math.abs(v.yawRate);
    if (!v.onGround && (g > 0.7 || v.speed > 95) && Math.random() < dt * 30) {
      for (const tip of [[4.9, -0.05, -2.6], [-4.9, -0.05, -2.6]]) {
        const o = v.toWorld(tip);
        Particles.add(Particles.base(o[0], o[1], o[2], { life: 1.0, max: 1.0, size: 0.16, layer: T.p_smoke, r: 1, g: 1, b: 1, blend: true, drag: 0.9, grow: 3, collide: false }));
      }
    }
  },

  // ------------------------------------------------------------ rendering ----
  swatchUV(name) {
    const s = JET_SWATCH_RECT[name] || JET_SWATCH_RECT.hull;
    return [-1, s[0] / ATLAS_W, s[1] / ATLAS_H, (s[0] + s[2]) / ATLAS_W, (s[1] + s[3]) / ATLAS_H];
  },

  // st: { pos, yaw, pitch, roll, gear, throttle, burner, missiles, blink }; cockpit hides the canopy.
  renderJet(st, cp, cockpit) {
    ER.lightAt(st.pos[0], st.pos[1] + 1, st.pos[2]);
    const base = XF.chain(XF.t(st.pos[0] - cp[0], st.pos[1] - cp[1], st.pos[2] - cp[2]), XF.ry(st.yaw), XF.rx(-st.pitch), XF.rz(st.roll));
    const light = ER.light.slice();
    for (const part of JET_PARTS) {
      if (part.canopy && cockpit) continue;
      if (part.inside && !cockpit) continue;
      if (part.missile && st.missiles && !st.missiles[part.side]) continue;
      let m = base;
      if (part.gear) {
        if (st.gear < 0.03) continue;
        m = XF.mul(base, XF.t(0, (1 - st.gear) * 0.85, 0));
      }
      if (part.pivot) m = XF.chain(m, XF.t(part.pivot[0], part.pivot[1], part.pivot[2]), XF.rz(part.rz), XF.t(-part.pivot[0], -part.pivot[1], -part.pivot[2]));
      ER.color = [1, 1, 1]; ER.ov = 0; ER.light = light;
      if (part.glow) {
        const heat = 0.25 + st.throttle * 0.9 + (st.burner ? 1.4 : 0);
        ER.ov = 2 + heat;
      } else if (part.nav) {
        const on = part.nav === 'S' ? (st.blink % 1.2) < 0.08 : true;
        ER.ov = on ? 2 + (part.nav === 'S' ? 3 : 1.2) : 0;
      }
      const faces = part.faces;
      const sw = part.sw;
      const uvOf = (f) => this.swatchUV(faces && faces[f.key] ? faces[f.key] : sw);
      const b = part.box;
      ER.box(m, b[0], b[1], b[2], b[3], b[4], b[5], uvOf);
    }
    // exhaust flames: tapering self-lit cones behind the nozzles, long with the afterburner
    if (st.throttle > 0.05 || st.burner) {
      const heat = st.throttle + (st.burner ? 1.2 : 0);
      const L = (st.burner ? 2.4 : 0.35 + 0.7 * st.throttle) * (0.85 + Math.random() * 0.3);
      const z0 = -5.96, uv = () => this.swatchUV('glow');
      for (const n of JET_NOZZLES) {
        const cx = n[0], cy = n[1];
        const ring = [[0.2, 0, 0.35, 1.3], [0.15, 0.35, 0.75, 1.0], [0.09, 0.75, 1.25, 0.6]];
        for (const [r, a0, a1, k] of ring) {
          ER.ov = 2 + heat * k * (st.burner ? 1.6 : 1);
          ER.color = st.burner ? [1, 0.82 - a0 * 0.3, 0.6 - a0 * 0.4] : [1, 0.7, 0.45];
          ER.box(base, cx - r, cy - r, z0 - L * a1, cx + r, cy + r, z0 - L * a0, uv);
        }
      }
    }
    ER.ov = 0; ER.color = [1, 1, 1];
  },

  renderAll(cp, cockpitJet) {
    for (const v of this.list) {
      if (v.removed) continue;
      if (Math.abs(v.pos[0] - cp[0]) > 400 || Math.abs(v.pos[2] - cp[2]) > 400) continue;
      this.renderJet(v.state, cp, v === cockpitJet);
    }
    // tracers
    for (const b of this.bullets) {
      const sp = Math.hypot(b.vel[0], b.vel[1], b.vel[2]) || 1;
      const yaw = Math.atan2(b.vel[0], b.vel[2]), pitch = Math.asin(clamp(b.vel[1] / sp, -1, 1));
      ER.light = [1, 1]; ER.ov = 4.5; ER.color = [1, 0.85, 0.5];
      const m = XF.chain(XF.t(b.pos[0] - cp[0], b.pos[1] - cp[1], b.pos[2] - cp[2]), XF.ry(yaw), XF.rx(-pitch));
      ER.box(m, -0.035, -0.035, -2.6, 0.035, 0.035, 0, () => this.swatchUV('glow'));
    }
    ER.ov = 0; ER.color = [1, 1, 1];
    for (const ms of this.missiles) {
      const yaw = Math.atan2(ms.dir[0], ms.dir[2]), pitch = Math.asin(clamp(ms.dir[1], -1, 1));
      ER.lightAt(ms.pos[0], ms.pos[1], ms.pos[2]);
      const m = XF.chain(XF.t(ms.pos[0] - cp[0], ms.pos[1] - cp[1], ms.pos[2] - cp[2]), XF.ry(yaw), XF.rx(-pitch));
      ER.box(m, -0.14, -0.14, -1.9, 0.14, 0.14, 1.4, () => this.swatchUV('white'));
      ER.box(m, -0.1, -0.1, 1.4, 0.1, 0.1, 1.8, () => this.swatchUV('red'));
      ER.box(m, -0.3, -0.03, -1.9, 0.3, 0.03, -1.5, () => this.swatchUV('white'));
      ER.box(m, -0.03, -0.3, -1.9, 0.03, 0.3, -1.5, () => this.swatchUV('white'));
      ER.ov = 4; ER.light = [1, 1];
      ER.box(m, -0.1, -0.1, -2.1, 0.1, 0.1, -1.9, () => this.swatchUV('glow'));
      ER.ov = 0;
    }
  },

  // ---------------------------------------------------------------- camera ----
  camera(dt) {
    const v = G.vehicle, p = G.player;
    const aim = p.lookDir();
    let pos;
    let roll = 0;
    if (this.camMode === 'cockpit') {
      pos = v.toWorld([0, 0.98, 3.1]);
      roll = -v.roll * 0.55;
    } else {
      const dist = 15 + v.speed * 0.035;
      const target = [v.pos[0] - aim[0] * dist, v.pos[1] - aim[1] * dist + 3.2, v.pos[2] - aim[2] * dist];
      // keep the camera out of hills and trees
      const from = [v.pos[0], v.pos[1] + 2.5, v.pos[2]];
      const dv = [target[0] - from[0], target[1] - from[1], target[2] - from[2]];
      const len = Math.hypot(dv[0], dv[1], dv[2]);
      let t = 1;
      for (let s = 0.5; s < len; s += 0.5) {
        const q = [from[0] + dv[0] * s / len, from[1] + dv[1] * s / len, from[2] + dv[2] * s / len];
        if (BLOCK_OPAQUE[G.world.getBlock(Math.floor(q[0]), Math.floor(q[1]), Math.floor(q[2]))]) { t = Math.max(0.1, (s - 0.8) / len); break; }
      }
      pos = [from[0] + dv[0] * t, from[1] + dv[1] * t, from[2] + dv[2] * t];
      roll = -wrapAngle(v.roll) * 0.12;
    }
    const fov = G.settings.fov + clamp(v.speed / JET_MAX, 0, 1) * 16 + (v.burner ? 6 : 0);
    return { pos, yaw: p.yaw, pitch: p.pitch, roll, fov };
  },

  // ------------------------------------------------------------------- HUD ----
  drawHud() {
    const cv = $('flightHud');
    const v = G.vehicle;
    if (!v || G.hudHidden) { if (!cv.classList.contains('hidden')) cv.classList.add('hidden'); return; }
    cv.classList.remove('hidden');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = this.hudCtx || (this.hudCtx = cv.getContext('2d'));
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const green = '#8dffb8';
    c.strokeStyle = green; c.fillStyle = green; c.lineWidth = 1.6;
    c.shadowColor = 'rgba(40, 255, 140, 0.7)'; c.shadowBlur = 6;
    c.font = '600 14px ui-monospace, "Cascadia Mono", Consolas, monospace';
    const cx = W / 2, cy = H / 2;
    // aim circle (where the jet is being steered)
    c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(cx, cy, 1.8, 0, Math.PI * 2); c.fill();
    // boresight: where the nose (and the cannon) points
    const r = G.renderer, cam = r.camPos;
    const tgt = v.toWorld([0, 0, 400]);
    const vp = r.viewProj;
    const rel = [tgt[0] - cam[0], tgt[1] - cam[1], tgt[2] - cam[2]];
    const cw = vp[3] * rel[0] + vp[7] * rel[1] + vp[11] * rel[2] + vp[15];
    if (cw > 0.1) {
      const sx = ((vp[0] * rel[0] + vp[4] * rel[1] + vp[8] * rel[2] + vp[12]) / cw * 0.5 + 0.5) * W;
      const sy = (1 - ((vp[1] * rel[0] + vp[5] * rel[1] + vp[9] * rel[2] + vp[13]) / cw * 0.5 + 0.5)) * H;
      c.beginPath();
      c.moveTo(sx - 22, sy); c.lineTo(sx - 9, sy); c.lineTo(sx - 4, sy + 7); c.lineTo(sx, sy); c.lineTo(sx + 4, sy + 7); c.lineTo(sx + 9, sy); c.lineTo(sx + 22, sy);
      c.stroke();
    }
    // speed and altitude boxes
    const kmh = Math.round(v.speed * 3.6);
    const alt = Math.round(v.pos[1] - JET_GEAR_H);
    const surf = G.world.surfaceHeight(Math.floor(v.pos[0]), Math.floor(v.pos[2]));
    const agl = surf < 0 ? Infinity : Math.round(v.pos[1] - JET_GEAR_H - surf - 1);
    const box = (x, y, label, val, align) => {
      c.textAlign = align;
      c.globalAlpha = 0.75; c.fillText(label, x, y - 20); c.globalAlpha = 1;
      c.font = '700 22px ui-monospace, "Cascadia Mono", Consolas, monospace';
      c.fillText(val, x, y + 4);
      c.font = '600 14px ui-monospace, "Cascadia Mono", Consolas, monospace';
    };
    box(cx - 190, cy, 'SPD km/h', String(kmh), 'right');
    box(cx + 190, cy, 'ALT m', String(alt), 'left');
    c.textAlign = 'left';
    if (agl < 400 && !v.onGround) { c.globalAlpha = 0.75; c.fillText('R ' + agl, cx + 190, cy + 26); c.globalAlpha = 1; }
    // heading tape
    const hdg = Math.round(((Math.atan2(v.fwd[0], -v.fwd[2]) * 180 / Math.PI) + 360) % 360);
    c.textAlign = 'center';
    c.fillText('HDG ' + String(hdg).padStart(3, '0'), cx, 44);
    for (let i = -4; i <= 4; i++) {
      const hh = Math.round(hdg / 10) * 10 + i * 10;
      const x = cx + (hh - hdg) * 6;
      c.beginPath(); c.moveTo(x, 54); c.lineTo(x, hh % 30 === 0 ? 64 : 60); c.stroke();
      if (hh % 30 === 0) c.fillText(String(((hh % 360) + 360) % 360 / 10 | 0).padStart(2, '0'), x, 78);
    }
    // pitch ladder around the aim point
    const pd = v.pitch * 180 / Math.PI;
    c.save();
    c.translate(cx, cy); c.rotate(-v.roll);
    c.globalAlpha = 0.55;
    for (let a = -60; a <= 60; a += 10) {
      const y = (pd - a) * 7;
      if (Math.abs(y) > H * 0.32) continue;
      c.setLineDash(a < 0 ? [6, 5] : []);
      c.beginPath(); c.moveTo(-110, y); c.lineTo(-50, y); c.moveTo(50, y); c.lineTo(110, y); c.stroke();
      if (a !== 0) { c.textAlign = 'right'; c.fillText(String(a), -116, y + 5); }
    }
    c.setLineDash([]);
    c.restore();
    c.globalAlpha = 1;
    // throttle and weapons, bottom left
    const bx = 34, by = H - 150;
    c.textAlign = 'left';
    c.strokeRect(bx, by, 14, 110);
    c.fillStyle = v.burner ? '#ffb45a' : green;
    c.fillRect(bx + 2, by + 108 - v.throttle * 106, 10, v.throttle * 106);
    c.fillStyle = green;
    c.fillText('THR ' + Math.round(v.throttle * 100) + '%', bx + 24, by + 14);
    if (v.burner) { c.fillStyle = '#ffb45a'; c.fillText('AFTERBURNER', bx + 24, by + 34); c.fillStyle = green; }
    c.fillText('GUN  ' + (v.gunCd > -0.2 ? 'FIRE' : 'RDY'), bx + 24, by + 58);
    c.fillText('MSL  ' + (v.missiles[0] ? '■' : '□') + ' ' + (v.missiles[1] ? '■' : '□'), bx + 24, by + 78);
    c.fillText('GEAR ' + (v.gear > 0.9 ? 'DOWN' : v.gear < 0.1 ? 'UP' : 'TRANSIT'), bx + 24, by + 98);
    c.fillText((this.camMode === 'cockpit' ? 'COCKPIT' : 'CHASE') + ' [V]', bx + 24, by + 118);
    // warnings
    const warn = [];
    if (!v.onGround && v.speed < JET_MIN_FLY + 2) warn.push('STALL');
    if (!v.onGround && agl < 60 && v.vel[1] < -18) warn.push('PULL UP');
    if (!v.onGround && agl < 30 && v.gear < 0.5 && v.speed < 70) warn.push('GEAR');
    if (warn.length && (G.time * 3) % 1 < 0.6) {
      c.fillStyle = '#ff6a5a'; c.shadowColor = 'rgba(255, 80, 60, 0.8)';
      c.font = '800 26px ui-monospace, "Cascadia Mono", Consolas, monospace';
      c.textAlign = 'center';
      c.fillText(warn.join('   '), cx, cy + 96);
    }
    if (v.onGround && v.speed < 2 && v.throttle < 0.05) {
      c.textAlign = 'center'; c.globalAlpha = 0.8; c.fillStyle = green;
      c.fillText('W: throttle up · look up past ' + Math.round(JET_MIN_FLY * 3.6) + ' km/h to take off · Shift: climb out', cx, H - 120);
    }
    c.globalAlpha = 1;
  },

  // ----------------------------------------------------------- persistence ----
  serialize() {
    return this.list.filter((v) => !v.removed).map((v) => ({ p: v.pos.map((x) => Math.round(x * 100) / 100), yaw: Math.round(v.yaw * 1000) / 1000 }));
  },
  load(arr) {
    this.clear();
    if (!Array.isArray(arr)) return;
    for (const e of arr.slice(0, 64)) {
      if (!e || !Array.isArray(e.p) || e.p.length !== 3 || !e.p.every(Number.isFinite)) continue;
      const j = this.spawnJet(e.p[0], e.p[1], e.p[2], Number.isFinite(e.yaw) ? e.yaw : 0);
      j.onGround = true;
    }
  },
};
