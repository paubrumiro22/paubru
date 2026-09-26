'use strict';
// Ground, water and rail vehicles next to the fighter jet: car, city bus, rowing boat with an
// outboard, helicopter, bicycle and a rail cart that follows rails. Each kind is a box model
// painted with the jet's atlas swatches (tinted with ER.color), a small physics model and a
// camera. They live in the same Vehicles.list as jets (flag `ride`), so saving, boarding with
// right click, picking up and the minimap work for both; Vehicles' jet code is wrapped below.

Object.assign(I, { CAR: 410, BUS: 411, BOAT: 412, HELI: 413, BIKE: 414, CART: 415 });

const RIDE_PAINTS = [[0.86, 0.16, 0.14], [0.14, 0.34, 0.8], [0.95, 0.78, 0.16], [0.93, 0.93, 0.93], [0.16, 0.16, 0.18], [0.12, 0.56, 0.3], [0.9, 0.46, 0.12], [0.55, 0.62, 0.7]];
const RIDE_DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // north, east, south, west

// Box parts: [x0, y0, z0, x1, y1, z1, swatch, options]. Nose towards +Z, +X is the driver's left,
// y = 0 where the wheels touch the ground. Options: paint (body colour), c (fixed colour),
// m (mirror across x), wheel (spins about x around its centre), glow (self-lit), rotor / tail.
const RIDE_KINDS = {
  car: {
    item: I.CAR, name: 'Car', type: 'ground', max: 24, rev: 6, acc: 9, brake: 22, steer: 0.62, base: 2.5, step: 1.05, h: 1.55, len: 4.2, w: 1.9,
    seat: [0.42, 0.42, -0.1], eye: [0.42, 1.3, -0.1], cam: 7.5, sit: true, hide: true, sound: 'car',
    parts: [
      [-0.95, 0.32, -2.1, 0.95, 0.95, 2.1, 'white', { paint: true }],
      [-0.86, 0.95, -1.15, 0.86, 1.47, 0.8, 'glass'],
      [-0.84, 1.47, -1.1, 0.84, 1.56, 0.72, 'white', { paint: true }],
      [0.8, 0.95, 0.72, 0.88, 1.47, 0.84, 'white', { paint: true, m: true }],
      [0.8, 0.95, -1.18, 0.88, 1.47, -1.05, 'white', { paint: true, m: true }],
      [-0.97, 0.3, 2.08, 0.97, 0.5, 2.22, 'hullDark'],
      [-0.97, 0.3, -2.22, 0.97, 0.5, -2.08, 'hullDark'],
      [0.52, 0.62, 2.1, 0.86, 0.8, 2.16, 'navWhite', { m: true, glow: 1.4 }],
      [0.56, 0.64, -2.16, 0.86, 0.82, -2.1, 'navRed', { m: true, glow: 0.8 }],
      [-0.3, 0.52, 2.12, 0.3, 0.62, 2.18, 'metal'],
      [0.97, 0.9, 0.55, 1.12, 1.0, 0.72, 'hullDark', { m: true }],
      [0.78, 0, 1.12, 1.0, 0.64, 1.76, 'tire', { m: true, wheel: [0.32, 1.44] }],
      [0.78, 0, -1.72, 1.0, 0.64, -1.08, 'tire', { m: true, wheel: [0.32, -1.4] }],
      [0.99, 0.18, 1.3, 1.02, 0.46, 1.58, 'metal', { m: true, wheel: [0.32, 1.44] }],
      [0.99, 0.18, -1.54, 1.02, 0.46, -1.26, 'metal', { m: true, wheel: [0.32, -1.4] }],
    ],
    hit: [[-1, 0, -2.2, 1, 1.6, 2.2]],
  },
  bus: {
    item: I.BUS, name: 'City Bus', type: 'ground', max: 17, rev: 4, acc: 4.2, brake: 12, steer: 0.55, base: 6, step: 1.05, h: 3.15, len: 10.4, w: 2.5,
    seat: [0.62, 0.95, 4.2], eye: [0.62, 2.05, 4.3], cam: 14, sit: true, hide: true, sound: 'bus', paintDefault: 0,
    parts: [
      [-1.25, 0.42, -5.2, 1.25, 3.05, 5.2, 'white', { paint: true }],
      [-1.27, 1.55, -4.7, 1.27, 2.6, 4.5, 'glass'],
      [-1.2, 1.05, 5.18, 1.2, 2.72, 5.24, 'glass'],
      [-1.2, 1.7, -5.24, 1.2, 2.6, -5.18, 'glass'],
      [-1.2, 3.05, -5.0, 1.2, 3.2, 5.0, 'white', { c: [0.95, 0.95, 0.95] }],
      [-0.9, 3.25, -3.4, 0.9, 3.5, -1.2, 'metal'],
      [-0.95, 2.76, 5.2, 0.95, 3.0, 5.26, 'glow', { glow: 2.2, c: [1, 0.62, 0.2] }],
      [-1.27, 0.42, -5.22, 1.27, 0.75, 5.22, 'hullDark'],
      [-1.29, 0.5, 2.9, -1.26, 2.6, 4.3, 'hullDark'],
      [-1.29, 0.5, -1.2, -1.26, 2.6, 0.2, 'hullDark'],
      [0.72, 0.8, 5.2, 1.12, 1.02, 5.27, 'navWhite', { m: true, glow: 1.4 }],
      [0.8, 0.9, -5.27, 1.12, 1.3, -5.2, 'navRed', { m: true, glow: 0.8 }],
      [1.08, 0, 2.9, 1.3, 0.9, 3.9, 'tire', { m: true, wheel: [0.45, 3.4] }],
      [1.08, 0, -3.3, 1.3, 0.9, -2.3, 'tire', { m: true, wheel: [0.45, -2.8] }],
      [1.08, 0, -4.4, 1.3, 0.9, -3.4, 'tire', { m: true, wheel: [0.45, -3.9] }],
      [1.28, 2.2, 5.0, 1.36, 2.7, 5.1, 'hullDark', { m: true }],
    ],
    hit: [[-1.3, 0, -5.3, 1.3, 3.3, 5.3]],
  },
  boat: {
    item: I.BOAT, name: 'Motor Boat', type: 'water', max: 15, rev: 4, acc: 6, brake: 9, steer: 0.9, base: 2.4, step: 0.3, h: 0.9, len: 4.4, w: 1.7,
    seat: [0, 0.4, -1.05], eye: [0, 1.25, -1.05], cam: 7, sit: true, sound: 'boat', paintDefault: 3,
    parts: [
      [-0.8, 0, -1.9, 0.8, 0.22, 1.8, 'white', { c: [0.62, 0.42, 0.24] }],
      [0.64, 0.2, -1.9, 0.82, 0.72, 1.8, 'white', { paint: true, m: true }],
      [-0.82, 0.2, -1.92, 0.82, 0.72, -1.74, 'white', { paint: true }],
      [-0.64, 0.1, 1.8, 0.64, 0.72, 2.2, 'white', { paint: true }],
      [-0.38, 0.18, 2.2, 0.38, 0.72, 2.5, 'white', { paint: true }],
      [-0.84, 0.64, -1.92, 0.84, 0.76, 2.2, 'white', { c: [0.5, 0.33, 0.18] }],
      [-0.66, 0.36, -0.2, 0.66, 0.44, 0.22, 'white', { c: [0.6, 0.42, 0.25] }],
      [-0.66, 0.3, -1.3, 0.66, 0.38, -0.85, 'white', { c: [0.6, 0.42, 0.25] }],
      [-0.2, 0.35, -2.25, 0.2, 1.0, -1.85, 'hullDark'],
      [-0.06, -0.3, -2.12, 0.06, 0.35, -2.0, 'metal'],
      [-0.2, -0.36, -2.24, 0.2, -0.26, -2.18, 'metal', { prop: true }],
    ],
    hit: [[-0.85, -0.2, -2.2, 0.85, 1, 2.5]],
  },
  heli: {
    item: I.HELI, name: 'Helicopter', type: 'air', max: 32, rev: 8, acc: 10, brake: 10, steer: 0, base: 3, step: 1.2, h: 2.6, len: 7, w: 2,
    seat: [0.42, 0.55, 0.55], eye: [0.42, 1.45, 0.75], cam: 13, sit: true, sound: 'heli', paintDefault: 2,
    parts: [
      [-0.9, 0.45, -1.2, 0.9, 2.15, 1.5, 'white', { paint: true }],
      [-0.84, 0.55, 1.5, 0.84, 1.95, 2.3, 'glass'],
      [-0.6, 0.6, 2.3, 0.6, 1.5, 2.6, 'glass'],
      [0.9, 0.9, -0.2, 0.93, 1.9, 1.3, 'glass', { m: true }],
      [-0.55, 2.15, -1.0, 0.55, 2.45, 1.1, 'white', { paint: true }],
      [-0.2, 1.5, -5.6, 0.2, 1.9, -1.2, 'white', { paint: true }],
      [-0.06, 1.55, -5.7, 0.06, 2.9, -5.05, 'white', { paint: true }],
      [-0.9, 1.62, -5.5, 0.9, 1.7, -5.05, 'white', { paint: true }],
      [-0.9, 0.9, -1.25, 0.9, 1.1, -1.2, 'hullDark'],
      [0.62, 0, -1.4, 0.74, 0.1, 2.0, 'metal', { m: true }],
      [0.62, 0.1, 1.2, 0.68, 0.5, 1.3, 'metal', { m: true }],
      [0.62, 0.1, -0.9, 0.68, 0.5, -0.8, 'metal', { m: true }],
      [-0.1, 2.45, -0.1, 0.1, 2.72, 0.1, 'metal'],
      [-0.14, 2.72, -4.4, 0.14, 2.78, 4.4, 'hullDark', { rotor: 0 }],
      [-4.4, 2.72, -0.14, 4.4, 2.78, 0.14, 'hullDark', { rotor: 0 }],
      [0.08, 1.2, -5.5, 0.12, 2.6, -5.3, 'hullDark', { tail: [0.1, 1.9, -5.4] }],
      [0.14, 1.65, -5.5, 0.18, 1.75, -5.3, 'navRed', { glow: 1.2 }],
      [-0.18, 1.65, -5.5, -0.14, 1.75, -5.3, 'navGreen', { glow: 1.2 }],
      [-0.05, 2.9, -5.45, 0.05, 2.98, -5.3, 'navWhite', { strobe: true }],
    ],
    hit: [[-1, 0, -1.4, 1, 2.5, 2.6], [-0.3, 1.4, -5.8, 0.3, 3, -1.2]],
  },
  bike: {
    item: I.BIKE, name: 'Bicycle', type: 'ground', max: 11, rev: 2, acc: 5, brake: 14, steer: 0.75, base: 1.1, step: 1.05, h: 1.1, len: 1.8, w: 0.5,
    seat: [0, 0.2, -0.28], eye: [0, 1.85, -0.2], cam: 4.6, pedal: true, sound: 'bike', paintDefault: 5,
    parts: [
      [-0.04, 0, 0.3, 0.04, 0.72, 1.02, 'tire', { wheel: [0.36, 0.66] }],
      [-0.04, 0, -0.95, 0.04, 0.72, -0.23, 'tire', { wheel: [0.36, -0.59] }],
      [-0.05, 0.3, 0.6, 0.05, 0.42, 0.72, 'metal', { wheel: [0.36, 0.66] }],
      [-0.05, 0.3, -0.65, 0.05, 0.42, -0.53, 'metal', { wheel: [0.36, -0.59] }],
      [-0.035, 0.62, -0.4, 0.035, 0.7, 0.5, 'white', { paint: true }],
      [-0.035, 0.34, -0.3, 0.035, 0.66, -0.22, 'white', { paint: true }],
      [-0.035, 0.34, -0.3, 0.035, 0.42, 0.2, 'white', { paint: true }],
      [-0.035, 0.36, 0.5, 0.035, 1.0, 0.58, 'white', { paint: true }],
      [-0.035, 0.36, -0.62, 0.035, 0.44, -0.3, 'white', { paint: true }],
      [-0.035, 0.66, -0.34, 0.035, 0.92, -0.26, 'metal'],
      [-0.09, 0.92, -0.44, 0.09, 0.98, -0.18, 'hullDark'],
      [-0.32, 1.0, 0.5, 0.32, 1.05, 0.56, 'metal'],
      [-0.34, 0.98, 0.49, -0.26, 1.07, 0.57, 'hullDark'],
      [0.26, 0.98, 0.49, 0.34, 1.07, 0.57, 'hullDark'],
      [-0.12, 0.36, -0.08, 0.12, 0.42, 0.02, 'metal', { crank: [0.38, -0.03] }],
      [-0.06, 0.82, 0.56, 0.06, 0.9, 0.62, 'navWhite', { glow: 1.1 }],
    ],
    hit: [[-0.35, 0, -0.95, 0.35, 1.1, 1.05]],
  },
  cart: {
    item: I.CART, name: 'Rail Cart', type: 'rail', max: 22, rev: 0, acc: 6, brake: 10, steer: 0, base: 1.4, step: 1.05, h: 0.9, len: 1.6, w: 1.1,
    seat: [0, 0.3, 0], eye: [0, 1.2, 0.1], cam: 5, sit: true, sound: 'cart', paintDefault: 7,
    parts: [
      [-0.55, 0.14, -0.75, 0.55, 0.24, 0.75, 'metal'],
      [0.47, 0.24, -0.75, 0.55, 0.85, 0.75, 'white', { paint: true, m: true }],
      [-0.55, 0.24, 0.67, 0.55, 0.85, 0.75, 'white', { paint: true }],
      [-0.55, 0.24, -0.75, 0.55, 0.85, -0.67, 'white', { paint: true }],
      [-0.58, 0.8, -0.78, 0.58, 0.88, 0.78, 'hullDark'],
      [0.42, 0, 0.35, 0.5, 0.28, 0.63, 'tire', { m: true, wheel: [0.14, 0.49] }],
      [0.42, 0, -0.63, 0.5, 0.28, -0.35, 'tire', { m: true, wheel: [0.14, -0.49] }],
      [-0.2, 0.55, 0.75, 0.2, 0.7, 0.8, 'navWhite', { glow: 1.2 }],
    ],
    hit: [[-0.6, 0, -0.8, 0.6, 0.9, 0.8]],
  },
};
const RIDE_KEYS = Object.keys(RIDE_KINDS);
const RIDE_BY_ITEM = {};
for (const k of RIDE_KEYS) {
  const d = RIDE_KINDS[k];
  d.key = k;
  RIDE_BY_ITEM[d.item] = d;
  // mirrored copies of the parts marked m
  const out = [];
  for (const [x0, y0, z0, x1, y1, z1, sw, o = {}] of d.parts) {
    out.push({ box: [x0, y0, z0, x1, y1, z1], sw, o });
    if (o.m) {
      const mo = Object.assign({}, o);
      if (o.wheel) mo.wheel = o.wheel;
      if (sw === 'navRed' && d.key === 'heli') continue;
      out.push({ box: [-x1, y0, z0, -x0, y1, z1], sw, o: mo });
    }
  }
  d.model = out;
}

// Top of whatever a vehicle would rest on below (x, yTop, z): { y, water } or null within `depth`.
function rideGround(x, yTop, z, depth = 6, rails) {
  const w = G.world, bx = Math.floor(x), bz = Math.floor(z);
  for (let y = Math.floor(yTop); y > Math.floor(yTop) - depth && y >= 0; y--) {
    const id = w.getBlock(bx, y, bz);
    if (IS_LIQUID(id)) return { y: y + 0.88, water: id === B.WATER, lava: id !== B.WATER };
    if (rails && IS_RAIL(id)) return { y: y + 2 / 16, rail: true };
    if (BLOCK_SOLID[id] && BLOCK_RT[id] !== RT_CROSS) return { y: y + BLOCK_HEIGHT[id] / 16 };
  }
  return null;
}
const rideSolid = (x, y, z) => { const id = G.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return BLOCK_SOLID[id] && BLOCK_RT[id] !== RT_CROSS && !IS_RAIL(id); };

class Ride {
  constructor(kind, x, y, z, yaw, paint) {
    this.ride = true;
    this.def = RIDE_KINDS[kind];
    this.kind = kind;
    this.id = Math.random().toString(36).slice(2, 10);
    this.pos = [x, y, z];
    this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.steer = 0; this.vy = 0;
    this.vel = [0, 0, 0];
    this.paint = Number.isInteger(paint) ? paint : (this.def.paintDefault !== undefined ? this.def.paintDefault : Math.floor(Math.random() * RIDE_PAINTS.length));
    this.onGround = true; this.removed = false; this.hits = 0;
    this.wheel = 0; this.rotor = 0; this.rpm = 0; this.lift = 0; this.blink = Math.random() * 2;
    // jet fields the shared code reads
    this.throttle = 0; this.burner = false; this.gear = 1; this.missiles = [true, true]; this.reload = [0, 0];
    this.rail = null;
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

  get state() { return { ride: this }; }

  updateIdle(dt) { this.drive(dt, null); }

  // One step of driving; input is null for a parked (or abandoned) vehicle.
  drive(dt, input) {
    // nothing to stand on until the chunk streams in
    if (!G.world.isLoaded(Math.floor(this.pos[0]), Math.floor(this.pos[2]))) return;
    // a parked vehicle at rest only checks now and then that the ground is still there
    if (!input && this.onGround && Math.abs(this.speed) < 0.01 && !this.rail && this.rpm < 0.01) {
      this.rest = (this.rest || 0) + dt;
      if (this.rest < 0.5) return;
      this.rest = 0;
    }
    const k = input ? input.keys : null;
    const ctl = {
      gas: k && (k.has('KeyW') || k.has('ArrowUp')) ? 1 : 0,
      back: k && (k.has('KeyS') || k.has('ArrowDown')) ? 1 : 0,
      steer: k ? (k.has('KeyA') ? 1 : 0) - (k.has('KeyD') ? 1 : 0) : 0,
      up: k && k.has('Space') ? 1 : 0,
      down: k && (k.has('KeyC') || k.has('ControlLeft')) ? 1 : 0,
    };
    this.blink += dt;
    const t = this.def.type;
    if (t === 'air') this.fly(dt, ctl, !!input);
    else if (t === 'rail' && this.rail) this.onRails(dt, ctl);
    else this.roll_(dt, ctl);
    this.basis();
    this.throttle = ctl.gas ? 1 : Math.abs(this.speed) / this.def.max * 0.4;
    if (input && Math.abs(this.speed) > 4 && t !== 'air') this.bump();
  }

  // ---- wheels on the ground (car, bus, bike), a hull on the water (boat) or a derailed cart ----
  roll_(dt, c) {
    const d = this.def;
    const water = d.type === 'water';
    let max = d.max;
    // how far along we can go
    if (c.gas) this.speed += (this.speed < -0.2 ? d.brake : d.acc * (1 - Math.max(0, this.speed) / max * 0.7)) * dt;
    else if (c.back) this.speed -= (this.speed > 0.2 ? d.brake : d.acc * 0.7) * dt;
    else if (c.up && !water) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), d.brake * 1.3 * dt);
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (water ? 1.6 : 2.4) * dt + Math.abs(this.speed) * 0.04 * dt);
    // terrain under the centre decides the medium
    const here = rideGround(this.pos[0], this.pos[1] + 0.6, this.pos[2], 3);
    const inWater = here && here.water && here.y > this.pos[1] + 0.2;
    if (water && !(here && here.water)) max = 1.6;         // a boat dragged over land
    if (!water && inWater) max = 2.5;                      // wheels in deep water
    if (d.type === 'rail') max = 2;                        // a cart off its rails
    this.speed = clamp(this.speed, -d.rev, max);
    // steering: a bicycle-model turn rate, less lock at speed
    const lock = d.steer / (1 + Math.abs(this.speed) * 0.05);
    this.steer += (c.steer * lock - this.steer) * (1 - Math.exp(-dt * 6));
    const yawRate = water ? this.steer * clamp(this.speed / 4, -1, 1) * 1.1 : this.speed * Math.tan(this.steer) / d.base;
    this.yaw = wrapAngle(this.yaw + yawRate * dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const nx = this.pos[0] + fx * this.speed * dt, nz = this.pos[2] + fz * this.speed * dt;
    // probes at the four corners and the middle of each side
    const hl = d.len / 2 - 0.1, hw = d.w / 2 - 0.05;
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    const probe = (x, z, a, b) => [x + fx * a + lx * b, z + fz * a + lz * b];
    const pts = [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw]];
    const yTop = this.pos[1] + d.step + 0.3;
    let top = -Infinity, front = -Infinity, backY = -Infinity, left = -Infinity, right = -Infinity, blocked = false;
    for (const [a, b] of pts) {
      const [px, pz] = probe(nx, nz, a, b);
      const g = rideGround(px, yTop, pz, 8);
      let gy = g ? g.y : -Infinity;
      if (water && g && !g.water && gy > this.pos[1] + d.step) { blocked = true; break; }
      if (water && g && g.water) gy -= 0.28;                // the hull sits in the water
      if (!water && g && g.water) gy = rideGround(px, gy - 0.9, pz, 8) ? rideGround(px, gy - 0.9, pz, 8).y : gy;
      if (gy - this.pos[1] > d.step) { blocked = true; break; }
      // room for the body above the new ground
      const base = Math.max(gy, this.pos[1]);
      for (let yy = Math.floor(base + 0.15); yy < base + d.h - 0.05; yy++) if (rideSolid(px, yy, pz)) { blocked = true; break; }
      if (blocked) break;
      top = Math.max(top, gy);
      if (a > 0) front = Math.max(front, gy); else if (a < 0) backY = Math.max(backY, gy);
      if (b > 0) left = Math.max(left, gy); else if (b < 0) right = Math.max(right, gy);
    }
    if (blocked) {
      if (Math.abs(this.speed) > 7 && this.driven) { sfx('land', this.pos, 1, 0.6); G.shake = Math.max(G.shake, Math.min(0.6, Math.abs(this.speed) / 30)); }
      this.speed *= -0.2;
    } else { this.pos[0] = nx; this.pos[2] = nz; }
    // settle on the highest probe, fall when nothing is under
    if (top === -Infinity) { const g = rideGround(this.pos[0], this.pos[1] + 0.5, this.pos[2], 64); top = g ? g.y : this.pos[1] - 1; }
    if (top > this.pos[1] - 0.01) { this.pos[1] += (top - this.pos[1]) * (1 - Math.exp(-dt * 14)); this.vy = 0; this.onGround = true; if (top - this.pos[1] < 0.02) this.pos[1] = top; }
    else {
      this.vy -= 24 * dt;
      this.pos[1] = Math.max(top, this.pos[1] + this.vy * dt);
      this.onGround = this.pos[1] <= top + 0.001;
      if (this.onGround) { if (this.vy < -9 && this.driven) { sfx('land', this.pos, 1, 0.8); G.shake = Math.max(G.shake, 0.3); } this.vy = 0; }
    }
    // body follows the slope
    const lim = (v) => (Number.isFinite(v) ? v : this.pos[1]);
    const pT = water ? Math.sin(this.blink * 1.7) * 0.03 + clamp(this.speed / d.max, 0, 1) * 0.12 : Math.atan2(lim(front) - lim(backY), d.len - 0.2);
    const rT = water ? Math.sin(this.blink * 1.3) * 0.04 - this.steer * clamp(this.speed / 8, -1, 1) * 0.12 : Math.atan2(lim(left) - lim(right), Math.max(0.5, d.w)) * (d.key === 'bike' ? 0 : 1);
    const lean = d.key === 'bike' ? -clamp(this.speed * Math.tan(this.steer) / d.base * this.speed * 0.05, -0.5, 0.5) : 0;
    this.pitch += (clamp(pT, -0.6, 0.6) - this.pitch) * (1 - Math.exp(-dt * 8));
    this.roll += (clamp(rT + lean, -0.6, 0.6) - this.roll) * (1 - Math.exp(-dt * 8));
    this.vel = [fx * this.speed, this.vy, fz * this.speed];
    this.wheel += this.speed * dt / 0.34;
    // a cart set down on rails picks them up
    if (d.type === 'rail') this.findRail();
    // wake behind a boat
    if (water && here && here.water && Math.abs(this.speed) > 3 && Math.random() < dt * 20) {
      const b = this.toWorld([rand(-0.6, 0.6), 0.1, -2.1]);
      Particles.splash(b[0], this.pos[1] + 0.25, b[2], 1);
    }
  }

  // ---- rails: the cart runs along the track, block by block ----
  findRail() {
    const bx = Math.floor(this.pos[0]), bz = Math.floor(this.pos[2]);
    for (const dy of [0, -1, 1]) {
      const by = Math.floor(this.pos[1] + 0.2) + dy;
      const id = G.world.getBlock(bx, by, bz);
      if (!IS_RAIL(id)) continue;
      const links = RAIL_LINKS[RAIL_IDS.indexOf(id)];
      // leave through the link closest to where the cart points
      const f = [Math.sin(this.yaw), Math.cos(this.yaw)];
      const dot = (dir) => RIDE_DIRV[dir][0] * f[0] + RIDE_DIRV[dir][1] * f[1];
      const out = dot(links[0]) >= dot(links[1]) ? links[0] : links[1];
      this.rail = { x: bx, y: by, z: bz, inDir: out === links[0] ? links[1] : links[0], outDir: out, t: 0.5 };
      this.speed = Math.abs(this.speed);
      return true;
    }
    return false;
  }
  railPoint(r, t) {
    const cx = r.x + 0.5, cz = r.z + 0.5, a = RIDE_DIRV[r.inDir], b = RIDE_DIRV[r.outDir];
    if (t < 0.5) { const s = 1 - t * 2; return [cx + a[0] * 0.5 * s, cz + a[1] * 0.5 * s, -a[0], -a[1]]; }
    const s = (t - 0.5) * 2;
    return [cx + b[0] * 0.5 * s, cz + b[1] * 0.5 * s, b[0], b[1]];
  }
  onRails(dt, c) {
    const d = this.def, r = this.rail;
    // S at a standstill reverses along the track
    if (c.back && this.speed < 0.3) { const i = r.inDir; r.inDir = r.outDir; r.outDir = i; r.t = 1 - r.t; this.speed = 0.4; }
    else if (c.back) this.speed -= d.brake * dt;
    if (c.gas) this.speed += d.acc * (1 - this.speed / d.max * 0.6) * dt;
    if (c.up) this.speed -= d.brake * 1.5 * dt;
    this.speed -= (0.25 + this.speed * 0.012) * dt;
    this.speed = clamp(this.speed, 0, d.max);
    r.t += this.speed * dt;
    let guard = 0;
    while (r.t >= 1 && guard++ < 4) {
      const v = RIDE_DIRV[r.outDir], back = (r.outDir + 2) & 3;
      const nx = r.x + v[0], nz = r.z + v[1];
      let next = null;
      for (const dy of [0, -1, 1]) {
        const id = G.world.getBlock(nx, r.y + dy, nz);
        if (!IS_RAIL(id)) continue;
        const links = RAIL_LINKS[RAIL_IDS.indexOf(id)];
        if (links.includes(back)) { next = { x: nx, y: r.y + dy, z: nz, inDir: back, outDir: links[0] === back ? links[1] : links[0], t: r.t - 1 }; break; }
      }
      if (!next) {
        // end of the line (or a rail that does not join): stop at the buffer
        r.t = 1;
        if (this.speed > 6 && this.driven) { sfx('land', this.pos, 1, 0.5); G.shake = Math.max(G.shake, 0.3); }
        this.speed = 0;
        break;
      }
      // going downhill speeds the cart up, uphill slows it
      if (next.y < r.y) this.speed = Math.min(d.max, this.speed + 1.4);
      else if (next.y > r.y) this.speed = Math.max(0.6, this.speed - 1.6);
      Object.assign(r, next);
    }
    // the rail may have been broken under the cart
    if (!IS_RAIL(G.world.getBlock(r.x, r.y, r.z))) { this.rail = null; return; }
    const [px, pz, dx, dz] = this.railPoint(r, clamp(r.t, 0, 1));
    this.pos[0] = px; this.pos[2] = pz;
    const ty = r.y + 2 / 16;
    this.pos[1] += (ty - this.pos[1]) * (1 - Math.exp(-dt * 10));
    const yawT = Math.atan2(dx, dz);
    this.yaw = wrapAngle(this.yaw + wrapAngle(yawT - this.yaw) * (1 - Math.exp(-dt * 12)));
    this.pitch *= Math.exp(-dt * 6); this.roll *= Math.exp(-dt * 6);
    this.vel = [Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed];
    this.wheel += this.speed * dt / 0.14;
    this.onGround = true;
    if (this.speed > 8 && Math.random() < dt * 6) { const b = this.toWorld([rand(-0.5, 0.5), 0.05, -0.7]); Particles.crit(b[0], b[1], b[2], 1); }
  }

  // ---- helicopter: collective up / down, W/S tilt forward / back, A/D turn ----
  fly(dt, c, piloted) {
    const d = this.def;
    this.rpm += ((piloted ? 1 : 0) - this.rpm) * (1 - Math.exp(-dt * (piloted ? 0.9 : 0.4)));
    this.rotor += this.rpm * dt * 28;
    const power = clamp((this.rpm - 0.55) / 0.45, 0, 1);
    const yawIn = c.steer * (this.onGround ? 0.8 : 1.6);
    this.steer += (yawIn - this.steer) * (1 - Math.exp(-dt * 4));
    this.yaw = wrapAngle(this.yaw + this.steer * dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // horizontal speed along the heading
    const want = (c.gas - c.back * 0.5) * d.max * power;
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * (c.gas || c.back ? 0.7 : 0.9)));
    if (this.onGround && !c.up) this.speed *= Math.exp(-dt * 5);
    // climb and sink
    const vyT = ((c.up ? 9 : 0) - (c.down ? 8 : 0)) * power - (1 - power) * 14;
    this.vy += (vyT - this.vy) * (1 - Math.exp(-dt * 2.2));
    const vx = fx * this.speed, vz = fz * this.speed;
    // move axis by axis against a few body points
    const pts = [[0, 0.3, 2.4], [0, 0.3, -1.3], [0.9, 0.3, 0], [-0.9, 0.3, 0], [0, 2.3, 0], [0, 1.7, -5.6], [0.8, 1.2, 1.4], [-0.8, 1.2, 1.4]];
    // a point already inside something (leaves it was set down in) may move out of it
    const hits = (ox, oy, oz) => pts.some((l) => { const p = this.toWorld(l); return !rideSolid(p[0], p[1], p[2]) && rideSolid(p[0] + ox, p[1] + oy, p[2] + oz); });
    let blocked = false;
    if (!hits(vx * dt, 0, 0)) this.pos[0] += vx * dt; else blocked = true;
    if (!hits(0, 0, vz * dt)) this.pos[2] += vz * dt; else blocked = true;
    if (blocked) { if (Math.abs(this.speed) > 8 && piloted) { sfx('land', this.pos, 1, 0.5); G.shake = Math.max(G.shake, 0.4); } this.speed *= -0.3; }
    const g = rideGround(this.pos[0], this.pos[1] + 0.5, this.pos[2], 96);
    const gy = g ? g.y - (g.water ? 0.3 : 0) : -64;
    const ny = this.pos[1] + this.vy * dt;
    if (ny <= gy) { this.pos[1] = gy; if (this.vy < -10 && piloted) { sfx('land', this.pos, 1, 0.6); G.shake = Math.max(G.shake, 0.4); } this.vy = Math.max(0, this.vy); this.onGround = true; }
    else if (this.vy > 0 && hits(0, this.vy * dt, 0)) this.vy = 0;
    else { this.pos[1] = ny; this.onGround = false; }
    if (this.pos[1] > 300) { this.pos[1] = 300; this.vy = Math.min(0, this.vy); }
    // attitude: nose down to go forward, bank into turns
    const pT = this.onGround ? 0 : -clamp(this.speed / d.max, -0.5, 1) * 0.22;
    const rT = this.onGround ? 0 : -this.steer * clamp(Math.abs(this.speed) / 10, 0.2, 1) * 0.3;
    this.pitch += (pT - this.pitch) * (1 - Math.exp(-dt * 3));
    this.roll += (rT - this.roll) * (1 - Math.exp(-dt * 3));
    this.vel = [vx, this.vy, vz];
    this.lift = power;
    // rotor wash kicks up dust near the ground
    if (!this.onGround && this.rpm > 0.8 && g && this.pos[1] - gy < 6 && Math.random() < dt * 25) {
      const a = Math.random() * Math.PI * 2;
      const x = this.pos[0] + Math.cos(a) * 3, z = this.pos[2] + Math.sin(a) * 3;
      if (g.water) Particles.splash(x, gy + 0.3, z, 1);
      else Particles.add(Particles.base(x, gy + 0.2, z, { vx: Math.cos(a) * 5, vy: 0.6, vz: Math.sin(a) * 5, life: 0.8, max: 0.8, size: 0.3, layer: T.p_smoke, r: 0.8, g: 0.76, b: 0.68, blend: true, drag: 0.9, grow: 2, collide: false }));
    }
  }

  // Knocks mobs aside when driving into them.
  bump() {
    const sp = Math.abs(this.speed);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const reach = this.def.len / 2 + 0.6;
    for (const m of Ents.mobs) {
      if (m.dead || m.remote || m.bumpT > G.time) continue;
      const dx = m.pos[0] - this.pos[0], dz = m.pos[2] - this.pos[2];
      if (Math.abs(m.pos[1] - this.pos[1]) > 2.2) continue;
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (Math.abs(along) > reach || Math.abs(side) > this.def.w / 2 + 0.4) continue;
      if (along * Math.sign(this.speed) < 0.2) continue;
      m.bumpT = G.time + 0.6;
      m.damage(Math.round(sp * 0.45), { player: true, from: this.pos, knock: 0.5 + sp * 0.05 });
      sfx('hit', m.pos, 1, 0.8);
    }
  }
}

// ------------------------------------------------------------ manager ----
const Rides = {
  motor: null,

  spawn(kind, x, y, z, yaw, paint) {
    const v = new Ride(kind, x, y, z, yaw, paint);
    Vehicles.list.push(v);
    return v;
  },

  // Right-clicking a block with a vehicle item puts the vehicle there, facing away from you.
  place(def, hit) {
    const p = G.player;
    const [x, y, z] = hit.pos;
    const yaw = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
    let px = x + 0.5, pz = z + 0.5, py;
    if (def.type === 'rail' && IS_RAIL(hit.id)) py = y + 2 / 16;
    else if (def.type === 'water') {
      // on the water surface clicked (or next to it)
      const g = rideGround(px, y + 1.5, pz, 4);
      if (!g) return false;
      py = g.water ? g.y - 0.28 : g.y;
    } else {
      if (hit.normal[1] !== 1) return false;
      const top = y + BLOCK_HEIGHT[hit.id] / 16;
      const d = def.len / 2 + 1;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      px += fx * (def.key === 'bike' ? 0.5 : d * 0.5); pz += fz * (def.key === 'bike' ? 0.5 : d * 0.5);
      py = def.type === 'air' ? top : top + 0.01;
    }
    const v = this.spawn(def.key, px, py, pz, yaw);
    if (def.type === 'rail') v.findRail();
    Particles.poof(v.pos[0], v.pos[1] + 0.5, v.pos[2], 2, 1.5);
    sfx('place_8', v.pos, 1, 0.8);
    return true;
  },

  board(v) {
    const p = G.player;
    G.vehicle = v;
    v.driven = true;
    p.flying = false; p.vel = [0, 0, 0]; p.parachute = false;
    p.yaw = wrapAngle(v.yaw + Math.PI); p.pitch = -0.2;
    Vehicles.camSmooth = null;
    Vehicles.camMode = 'chase';
    document.body.classList.add('piloting', 'driving');
    Sound.init();
    sfx(v.kind === 'bike' ? 'bell' : 'door_close', v.pos, 0.8, 1);
    const tips = {
      car: 'W/S drive · A/D steer · Space handbrake · LMB horn · V camera · Shift get out',
      bus: 'W/S drive · A/D steer · Space brake · LMB horn · V camera · Shift get out',
      boat: 'W/S throttle · A/D steer · LMB horn · V camera · Shift get out',
      heli: 'Space climb · C descend · W/S forward/back · A/D turn · V camera · Shift get out',
      bike: 'W pedal · S brake · A/D steer · LMB bell · V camera · Shift get off',
      cart: 'W go · S brake (at a stop: reverse) · follows the rails · V camera · Shift get out',
    };
    G.ui.toast(tips[v.kind], 6000);
  },

  dismount(v, forced) {
    G.vehicle = null;
    v.driven = false;
    document.body.classList.remove('piloting', 'driving');
    this.stopMotor();
    const p = G.player;
    p.fallStart = null; p.landed = 0;
    // step out on the driver's side (or on top of a boat on open water)
    const side = v.toWorld([v.def.w / 2 + 0.7, 0.2, v.def.seat[2]]);
    p.pos = [side[0], Math.max(side[1], v.pos[1]) + 0.2, side[2]];
    if (v.kind === 'heli' && !v.onGround) { p.pos = v.toWorld([0, -0.6, 0]); p.vel = [v.vel[0] * 0.5, v.vel[1], v.vel[2] * 0.5]; p.parachute = true; G.ui.toast('Jumped out! Parachute deployed'); }
    else p.vel = [0, 0, 0];
    liftOutOfBlocks(p);
    void forced;
  },

  // Per frame while driving.
  pilot(v, dt, input, horn) {
    const p = G.player;
    v.drive(dt, input);
    const seat = v.toWorld(v.def.seat);
    p.pos = [seat[0], seat[1] - (v.def.sit ? 0.75 : 0), seat[2]];
    p.vel = [0, 0, 0];
    p.onGround = true; p.fallStart = null; p.landed = 0;
    p.inWater = p.eyeInWater = p.inLava = p.eyeInLava = false;
    if (horn && !this.hornT) { sfx(v.kind === 'bike' ? 'bell' : 'horn', v.pos, 1, v.kind === 'bus' ? 0.7 : 1); this.hornT = v.kind === 'bike' ? 0.5 : 0.35; }
    this.hornT = Math.max(0, (this.hornT || 0) - dt);
    this.updateMotor(v);
  },

  key(code) {
    switch (code) {
      case 'ShiftLeft': case 'ShiftRight': Vehicles.dismount(false); return true;
      case 'KeyV':
        Vehicles.camMode = Vehicles.camMode === 'chase' ? 'cockpit' : 'chase';
        UI.toast(Vehicles.camMode === 'chase' ? 'Chase camera' : 'Driver camera');
        return true;
      case 'Space': case 'KeyF': case 'KeyQ': case 'KeyR': case 'KeyG': case 'KeyC': return true;
      default: return false;
    }
  },

  camera(v, dt) {
    const p = G.player, d = v.def;
    const aim = p.lookDir();
    let pos, roll = 0;
    if (Vehicles.camMode === 'cockpit') {
      pos = v.toWorld(d.eye);
      roll = -v.roll * 0.5;
    } else {
      const dist = d.cam + Math.abs(v.speed) * 0.08;
      const from = v.toWorld([0, d.h * 0.8 + 0.6, 0]);
      const target = [from[0] - aim[0] * dist, from[1] - aim[1] * dist + 0.8, from[2] - aim[2] * dist];
      const dv = [target[0] - from[0], target[1] - from[1], target[2] - from[2]];
      const len = Math.hypot(dv[0], dv[1], dv[2]);
      let t = 1;
      for (let s = 0.4; s < len; s += 0.4) {
        const q = [from[0] + dv[0] * s / len, from[1] + dv[1] * s / len, from[2] + dv[2] * s / len];
        if (BLOCK_OPAQUE[G.world.getBlock(Math.floor(q[0]), Math.floor(q[1]), Math.floor(q[2]))]) { t = Math.max(0.1, (s - 0.6) / len); break; }
      }
      pos = [from[0] + dv[0] * t, from[1] + dv[1] * t, from[2] + dv[2] * t];
    }
    void dt;
    const fov = G.settings.fov + clamp(Math.abs(v.speed) / 30, 0, 1) * 10;
    return { pos, yaw: p.yaw, pitch: p.pitch, roll, fov };
  },

  // ----------------------------------------------------------- rendering ----
  render(v, cp, inside) {
    const d = v.def;
    ER.lightAt(v.pos[0], v.pos[1] + d.h * 0.6, v.pos[2]);
    const light = ER.light.slice();
    const base = XF.chain(XF.t(v.pos[0] - cp[0], v.pos[1] - cp[1], v.pos[2] - cp[2]), XF.ry(v.yaw), XF.rx(-v.pitch), XF.rz(v.roll));
    const paint = RIDE_PAINTS[v.paint % RIDE_PAINTS.length];
    const night = G.dayTime > 0.52 || G.eyeSky < 0.35;
    for (const part of d.model) {
      const o = part.o;
      let m = base;
      if (o.wheel) { const [wy, wz] = o.wheel; m = XF.chain(base, XF.t(0, wy, wz), XF.rx(v.wheel || 0), XF.t(0, -wy, -wz)); }
      else if (o.crank) { const [wy, wz] = o.crank; m = XF.chain(base, XF.t(0, wy, wz), XF.rx(v.wheel * 0.5 || 0), XF.t(0, -wy, -wz)); }
      else if (o.rotor !== undefined) m = XF.mul(base, XF.ry(v.rotor || 0));
      else if (o.tail) { const [tx, ty, tz] = o.tail; m = XF.chain(base, XF.t(tx, ty, tz), XF.rx((v.rotor || 0) * 1.7), XF.t(-tx, -ty, -tz)); }
      else if (o.prop) m = XF.chain(base, XF.t(0, -0.31, -2.21), XF.rz((v.wheel || 0) * 3), XF.t(0, 0.31, 2.21));
      // seen from the driver's seat the roof and pillars would block the view
      if (inside && (part.sw === 'glass' || (o.paint && part.box[1] >= 0.94 && d.hide))) continue;
      ER.light = light; ER.ov = 0;
      ER.color = o.paint ? paint : o.c || [1, 1, 1];
      if (o.glow) ER.ov = (part.sw === 'navWhite' && !night && (d.key !== 'heli')) ? 0.4 : 2 + o.glow;
      if (o.strobe) ER.ov = (v.blink % 1.1) < 0.08 ? 5 : 0;
      const b = part.box;
      const uv = () => Vehicles.swatchUV(part.sw);
      ER.box(m, b[0], b[1], b[2], b[3], b[4], b[5], uv);
    }
    // rotor disc blur when spinning fast
    if (d.key === 'heli' && v.rpm > 0.6) {
      ER.color = [0.2, 0.2, 0.22]; ER.ov = 0;
      for (let i = 1; i <= 2; i++) {
        const mm = XF.mul(base, XF.ry((v.rotor || 0) + i * 0.35));
        ER.box(mm, -0.08, 2.735, -4.3, 0.08, 2.765, 4.3, () => Vehicles.swatchUV('hullDark'));
      }
    }
    ER.ov = 0; ER.color = [1, 1, 1];
  },

  // The driver (you in third person, or a remote player) sitting in the seat.
  rider(v, cp, skin, tint, look) {
    const d = v.def;
    if (d.hide) return;   // the tinted glass of cars and buses hides the driver
    const seat = v.toWorld(d.seat);
    const walk = d.pedal ? v.wheel * 0.9 : 0;
    const mob = { type: 'avatar', pos: [seat[0], seat[1] - (d.sit ? 0.75 : 0), seat[2]], h: 1.8, bodyYaw: v.yaw, headYaw: look !== undefined ? look : v.yaw, headPitch: 0,
      walkPhase: walk, walkAmt: d.pedal ? Math.min(1, Math.abs(v.speed) / 3 + 0.2) : 0, hurtTime: 0, dead: false, fuse: 0, age: G.time, fire: 0, aiming: 0,
      sit: !!d.sit, ride: d.key, skin, tint };
    ER.mob(null, mob, cp);
  },

  // ----------------------------------------------------------------- HUD ----
  hud(v, c, W, H) {
    const kmh = Math.round(Math.abs(v.speed) * 3.6);
    const cx = W / 2, by = H - 118;
    c.shadowBlur = 0;
    // dial
    c.fillStyle = 'rgba(12, 16, 22, 0.55)';
    c.beginPath(); c.arc(cx, by, 52, Math.PI * 0.8, Math.PI * 2.2); c.lineTo(cx, by); c.closePath(); c.fill();
    const frac = clamp(Math.abs(v.speed) / v.def.max, 0, 1);
    c.lineWidth = 5; c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.beginPath(); c.arc(cx, by, 44, Math.PI * 0.8, Math.PI * 2.2); c.stroke();
    c.strokeStyle = frac > 0.85 ? '#ff8a5a' : '#7fe3ff';
    c.beginPath(); c.arc(cx, by, 44, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * frac)); c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center';
    c.font = '700 26px ui-monospace, "Cascadia Mono", Consolas, monospace';
    c.fillText(String(kmh), cx, by + 6);
    c.font = '600 11px ui-monospace, "Cascadia Mono", Consolas, monospace';
    c.globalAlpha = 0.75;
    let sub = 'km/h';
    if (v.kind === 'heli') sub = 'ALT ' + Math.round(v.pos[1]) + ' m';
    else if (v.speed < -0.3) sub = 'R · km/h';
    else if (v.kind === 'cart') sub = v.rail ? 'on rails' : 'off rails';
    c.fillText(sub, cx, by + 24);
    c.fillText(v.def.name.toUpperCase() + '  ·  ' + (Vehicles.camMode === 'cockpit' ? 'DRIVER' : 'CHASE') + ' [V]', cx, by + 50);
    c.globalAlpha = 1; c.lineCap = 'butt';
    if (v.kind === 'heli' && v.rpm < 0.8) {
      c.fillStyle = '#ffd36a'; c.font = '700 14px ui-monospace, "Cascadia Mono", Consolas, monospace';
      c.fillText('ROTOR ' + Math.round(v.rpm * 100) + '%', cx, by - 64);
    }
  },

  // -------------------------------------------------------------- engine ----
  startMotor(kind) {
    const ctx = Sound.ctx;
    if (!ctx || ctx.state !== 'running' || kind === 'bike') return null;
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(Sound.master);
    const osc = ctx.createOscillator(); osc.type = kind === 'heli' ? 'triangle' : 'sawtooth'; osc.frequency.value = 40;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = kind === 'cart' ? 0.12 : 0.35;
    osc.connect(f); f.connect(g); g.connect(out);
    const n = ctx.createBufferSource(); n.buffer = Sound.noiseBuf; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = kind === 'cart' ? 2200 : 900; nf.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.15;
    n.connect(nf); nf.connect(ng); ng.connect(out);
    // helicopter blades: the whole sound pulses with the rotor
    let lfo = null;
    if (kind === 'heli') {
      lfo = ctx.createOscillator(); lfo.frequency.value = 8;
      const lg = ctx.createGain(); lg.gain.value = 0.28;
      lfo.connect(lg); lg.connect(g.gain); lg.connect(ng.gain);
      lfo.start();
    }
    osc.start(); n.start();
    return { kind, out, osc, f, g, n, nf, ng, lfo };
  },
  updateMotor(v) {
    if (!this.motor || this.motor.kind !== v.kind) { this.stopMotor(); this.motor = this.startMotor(v.kind); }
    const m = this.motor;
    if (!m) return;
    const t = Sound.ctx.currentTime;
    const sp = Math.abs(v.speed) / v.def.max;
    if (v.kind === 'heli') {
      m.osc.frequency.setTargetAtTime(30 + v.rpm * 30, t, 0.2);
      m.lfo.frequency.setTargetAtTime(2 + v.rpm * 12, t, 0.3);
      m.out.gain.setTargetAtTime(0.05 + v.rpm * 0.5, t, 0.2);
      m.f.frequency.setTargetAtTime(300 + v.rpm * 400, t, 0.2);
      return;
    }
    // a simple gearbox for the road vehicles: the pitch climbs, drops at each shift
    const gears = v.kind === 'bus' ? 4 : v.kind === 'car' ? 5 : 1;
    const gpos = sp * gears, inGear = gpos - Math.min(gears - 1, Math.floor(gpos));
    const rpm = 0.25 + (gears > 1 ? inGear * 0.6 + sp * 0.2 : sp * 0.8) + v.throttle * 0.1;
    const baseF = v.kind === 'bus' ? 28 : v.kind === 'boat' ? 55 : v.kind === 'cart' ? 20 : 38;
    m.osc.frequency.setTargetAtTime(baseF * (1 + rpm * 2.2), t, 0.08);
    m.f.frequency.setTargetAtTime(300 + rpm * 900, t, 0.1);
    m.ng.gain.setTargetAtTime(0.04 + sp * 0.18, t, 0.2);
    m.out.gain.setTargetAtTime(0.08 + v.throttle * 0.22 + sp * 0.1, t, 0.12);
  },
  stopMotor() {
    const m = this.motor;
    if (!m) return;
    this.motor = null;
    const ctx = Sound.ctx;
    m.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
    setTimeout(() => { try { m.osc.stop(); m.n.stop(); if (m.lfo) m.lfo.stop(); m.out.disconnect(); } catch (e) { /* ignore */ } }, 1200);
  },
};

// sounds
SYNTH.horn = (ctx, o, t, p) => { for (const f of [392, 494]) Sound.tone(ctx, o, t, 0.45, { wave: 'square', f0: f * p, filter: ['lowpass', 1800, 1], gain: 0.12, attack: 0.02 }); };
SYNTH.bell = (ctx, o, t) => { for (const i of [0, 0.14]) [1, 2.7, 5.1].forEach((r) => Sound.tone(ctx, o, t + i, 0.5, { f0: 1900 * r, gain: 0.07 / r })); };

// ------------------------------------------------------------ rails ----
const Rails = {
  // Layout for a rail at x,y,z from the rails around it: joins two neighbours, straight if it can.
  shapeFor(x, y, z, prefer) {
    const w = G.world;
    const has = [0, 1, 2, 3].map((d) => {
      const nx = x + RIDE_DIRV[d][0], nz = z + RIDE_DIRV[d][1];
      return IS_RAIL(w.getBlock(nx, y, nz)) || IS_RAIL(w.getBlock(nx, y - 1, nz)) || IS_RAIL(w.getBlock(nx, y + 1, nz));
    });
    const n = has.filter(Boolean).length;
    if (n >= 2) {
      if (has[0] && has[2]) return B.RAIL;
      if (has[1] && has[3]) return B.RAIL_EW;
      for (let i = 2; i < 6; i++) { const [a, b] = RAIL_LINKS[i]; if (has[a] && has[b]) return RAIL_IDS[i]; }
    }
    if (n === 1) return has[1] || has[3] ? B.RAIL_EW : B.RAIL;
    return prefer === 1 || prefer === 3 ? B.RAIL_EW : B.RAIL;
  },
  // After placing a rail, neighbours with a loose end turn towards it.
  placed(x, y, z) {
    const w = G.world;
    for (let d = 0; d < 4; d++) for (const dy of [0, -1, 1]) {
      const nx = x + RIDE_DIRV[d][0], ny = y + dy, nz = z + RIDE_DIRV[d][1];
      const id = w.getBlock(nx, ny, nz);
      if (!IS_RAIL(id)) continue;
      const links = RAIL_LINKS[RAIL_IDS.indexOf(id)];
      const back = (d + 2) & 3;
      if (links.includes(back)) continue;
      const loose = links.filter((l) => { const vx = nx + RIDE_DIRV[l][0], vz = nz + RIDE_DIRV[l][1]; return ![0, -1, 1].some((q) => IS_RAIL(w.getBlock(vx, ny + q, vz))); });
      if (!loose.length) continue;
      const nid = this.shapeFor(nx, ny, nz);
      if (nid !== id) editBlock(nx, ny, nz, nid);
    }
  },
};

// ------------------------------------------------------------ items ----
defItem(I.CAR, 'Car', { sprite: 'i_car', stack: 1, cat: 'transport' });
defItem(I.BUS, 'City Bus', { sprite: 'i_bus', stack: 1, cat: 'transport' });
defItem(I.BOAT, 'Motor Boat', { sprite: 'i_boat', stack: 1, cat: 'transport' });
defItem(I.HELI, 'Helicopter', { sprite: 'i_heli', stack: 1, cat: 'transport' });
defItem(I.BIKE, 'Bicycle', { sprite: 'i_bike', stack: 1, cat: 'transport' });
defItem(I.CART, 'Rail Cart', { sprite: 'i_cart', stack: 1, cat: 'transport' });
shaped(I.CAR, 1, [' G ', 'IFI', 'C C'], { G: B.GLASS_PANE, I: I.IRON_INGOT, F: B.FURNACE, C: TAG.coal });
shaped(I.BUS, 1, ['GGG', 'IFI', 'I I'], { G: B.GLASS_PANE, I: B.IRON_BLOCK, F: B.FURNACE });
shaped(I.BOAT, 1, ['P P', 'PFP'], { P: TAG.planks, F: B.FURNACE });
shaped(I.HELI, 1, ['III', ' G ', 'IFI'], { I: I.IRON_INGOT, G: B.GLASS, F: B.FURNACE });
shaped(I.BIKE, 1, [' S ', 'III', 'L L'], { S: I.LEATHER, I: I.IRON_INGOT, L: I.STRING });
shaped(I.CART, 1, ['I I', 'III'], { I: I.IRON_INGOT });

sprite('i_car', (d) => {
  const body = [200, 44, 36];
  sprPoly(d, [[2, 21], [3, 16], [9, 15], [12, 9], [22, 9], [26, 15], [30, 16], [30, 22], [2, 22]], body);
  sprPoly(d, [[13, 10.5], [16.5, 10.5], [16.5, 15], [10.5, 15]], [120, 170, 210]);
  sprPoly(d, [[18, 10.5], [21.5, 10.5], [24.5, 15], [18, 15]], [120, 170, 210]);
  sprRect(d, 28, 17, 30, 19, [255, 236, 170]); sprRect(d, 2, 17, 4, 19, [230, 60, 50]);
  for (const cx of [8.5, 24]) { sprDisc(d, cx, 22.5, 4, [30, 30, 34]); sprDisc(d, cx, 22.5, 1.8, [170, 176, 184]); }
});
sprite('i_bus', (d) => {
  sprRect(d, 1, 7, 31, 25, [214, 42, 40]);
  sprRect(d, 1, 23, 31, 25, [60, 60, 66]);
  for (let x = 3; x < 27; x += 5) sprRect(d, x, 9, x + 4, 15, [140, 190, 226]);
  sprRect(d, 27, 9, 31, 20, [140, 190, 226]);
  sprRect(d, 22, 16, 26, 23, [70, 70, 76]);
  sprRect(d, 1, 6, 31, 7, [240, 240, 240]);
  sprRect(d, 27, 7, 31, 9, [255, 180, 60]);
  for (const cx of [7, 24]) { sprDisc(d, cx, 25, 3.6, [30, 30, 34]); sprDisc(d, cx, 25, 1.5, [170, 176, 184]); }
});
sprite('i_boat', (d) => {
  sprPoly(d, [[2, 14], [30, 14], [26, 22], [6, 22]], [236, 236, 232]);
  sprPoly(d, [[2, 14], [30, 14], [29.3, 15.6], [2.6, 15.6]], [60, 110, 180]);
  sprRect(d, 7, 18, 25, 19, [60, 110, 180]);
  sprRect(d, 3, 9, 7, 16, [60, 62, 70]);
  sprRect(d, 4, 16, 5, 25, [150, 156, 164]);
  sprRect(d, 12, 11, 20, 14, [150, 108, 64]);
  sprSeg(d, 8, 27, 26, 27, 1.2, [120, 180, 230]);
});
sprite('i_heli', (d) => {
  const body = [236, 186, 40];
  sprSeg(d, 3, 15, 18, 15, 2.2, body);
  sprPoly(d, [[3, 10], [5, 10], [6, 15], [3, 16]], body);
  sprEllipse(d, 21, 16, 8, 5.5, 0, body);
  sprPoly(d, [[21, 11], [27, 12.5], [28.5, 17], [21, 17]], [120, 180, 220]);
  sprSeg(d, 3, 7, 30, 7, 1.2, [50, 50, 56]);
  sprRect(d, 20, 7, 22, 11, [90, 90, 96]);
  sprSeg(d, 15, 24, 29, 24, 1.2, [120, 124, 130]);
  sprSeg(d, 18, 21, 17, 24, 1, [120, 124, 130]); sprSeg(d, 25, 21, 26, 24, 1, [120, 124, 130]);
});
sprite('i_bike', (d) => {
  for (const cx of [8, 24]) sprDisc(d, cx, 21, 6, [30, 30, 34]);
  fillTile(d, (x, y, k) => { const i = k << 2; for (const cx of [8, 24]) if (Math.hypot(x + 0.5 - cx, y + 0.5 - 21) < 4.8) d[i + 3] = 0; });
  const fr = [40, 150, 80];
  sprSeg(d, 8, 21, 15, 21, 1.4, fr); sprSeg(d, 15, 21, 12, 12, 1.4, fr); sprSeg(d, 12, 12, 22, 12, 1.4, fr);
  sprSeg(d, 22, 12, 15, 21, 1.4, fr); sprSeg(d, 22, 12, 24, 21, 1.4, fr); sprSeg(d, 8, 21, 12, 12, 1.4, fr);
  sprSeg(d, 21, 12, 20, 8, 1.2, [120, 124, 130]); sprSeg(d, 18, 8, 23, 8, 1.4, [50, 50, 56]);
  sprSeg(d, 12, 12, 11, 9, 1.2, [120, 124, 130]); sprRect(d, 8, 8, 14, 9, [40, 40, 44]);
});
sprite('i_cart', (d) => {
  sprPoly(d, [[3, 10], [29, 10], [26, 23], [6, 23]], [110, 122, 138]);
  sprRect(d, 3, 10, 29, 12, [150, 160, 172]);
  sprRect(d, 7, 15, 25, 17, [80, 90, 104]);
  for (const cx of [9, 23]) { sprDisc(d, cx, 24.5, 3, [40, 40, 44]); sprDisc(d, cx, 24.5, 1.2, [170, 176, 184]); }
  sprSeg(d, 1, 28.5, 31, 28.5, 1.2, [150, 154, 160]);
});

// ------------------------------------------ wrap the jet manager ----
{
  const V = Vehicles;
  const orig = { board: V.board, dismount: V.dismount, pickUp: V.pickUp, pilot: V.pilot, camera: V.camera, drawHud: V.drawHud, renderJet: V.renderJet, raycast: V.raycast, effects: V.effects, serialize: V.serialize, load: V.load };
  V.board = function (v) {
    if (G.vehicle || v.removed) return;
    if (v.ride) { Rides.board(v); return; }
    orig.board.call(this, v);
  };
  V.dismount = function (forced) {
    const v = G.vehicle;
    if (v && v.ride) { Rides.dismount(v, forced); return; }
    orig.dismount.call(this, forced);
  };
  V.pickUp = function (v) {
    if (!v.ride) { orig.pickUp.call(this, v); return; }
    v.removed = true;
    const st = { id: v.def.item, count: 1 };
    if (G.mode === 'survival') Ents.spawnItem(st, v.pos[0], v.pos[1] + 0.5, v.pos[2]);
    else G.inv.add(st);
    G.ui.invDirty();
    Particles.poof(v.pos[0], v.pos[1] + 0.5, v.pos[2], 2, 1.5);
    sfx('pop', v.pos, 1, 0.7);
  };
  V.pilot = function (dt, input, firing) {
    const v = G.vehicle;
    if (v && v.ride) { Rides.pilot(v, dt, input, !!(firing && firing.gun)); return; }
    orig.pilot.call(this, dt, input, firing);
  };
  V.camera = function (dt) { const v = G.vehicle; return v && v.ride ? Rides.camera(v, dt) : orig.camera.call(this, dt); };
  V.effects = function (v, dt) { if (!v.ride) orig.effects.call(this, v, dt); };
  V.renderJet = function (st, cp, cockpit) {
    if (!st.ride) { orig.renderJet.call(this, st, cp, cockpit); return; }
    const v = st.ride;
    this_render(v, cp, cockpit);
  };
  function this_render(v, cp, cockpit) {
    Rides.render(v, cp, !!cockpit);
    // the player drives in third person; in the driver's view only the vehicle shows
    if (v === G.vehicle && !cockpit) Rides.rider(v, cp, G.settings.skin, NET_COLORS[Net.color].map((c) => c / 255 * 1.1), G.player.yaw + Math.PI);
  }
  V.drawHud = function () {
    const v = G.vehicle;
    if (!v || !v.ride) { orig.drawHud.call(this); return; }
    const cv = $('flightHud');
    if (G.hudHidden) { cv.classList.add('hidden'); return; }
    cv.classList.remove('hidden');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = this.hudCtx || (this.hudCtx = cv.getContext('2d'));
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    Rides.hud(v, c, W, H);
  };
  V.raycast = function (o, d, maxDist) {
    const jet = orig.raycast.call(this, o, d, maxDist);
    let best = jet && !jet.vehicle.ride ? jet : null, bestT = best ? best.dist : maxDist;
    for (const v of this.list) {
      if (!v.ride || v.removed || v === G.vehicle) continue;
      const m = v.m;
      const ro = [o[0] - v.pos[0], o[1] - v.pos[1], o[2] - v.pos[2]];
      const lo = [m[0] * ro[0] + m[4] * ro[1] + m[8] * ro[2], m[1] * ro[0] + m[5] * ro[1] + m[9] * ro[2], m[2] * ro[0] + m[6] * ro[1] + m[10] * ro[2]];
      const ld = [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
      for (const b of v.def.hit) {
        const hit = rayBox(lo, ld, b[0], b[1], b[2], b[3], b[4], b[5]);
        if (hit && hit.t < bestT) { bestT = hit.t; best = { vehicle: v, dist: hit.t }; }
      }
    }
    return best;
  };
  V.serialize = function () {
    return this.list.filter((v) => !v.removed).map((v) => {
      const e = { p: v.pos.map((x) => Math.round(x * 100) / 100), yaw: Math.round(v.yaw * 1000) / 1000 };
      if (v.ride) { e.k = v.kind; e.c = v.paint; }
      return e;
    });
  };
  V.load = function (arr) {
    orig.load.call(this, Array.isArray(arr) ? arr.filter((e) => e && !e.k) : arr);
    if (!Array.isArray(arr)) return;
    for (const e of arr.slice(0, 64)) {
      if (!e || !RIDE_KINDS[e.k] || !Array.isArray(e.p) || e.p.length !== 3 || !e.p.every(Number.isFinite)) continue;
      const v = Rides.spawn(e.k, e.p[0], e.p[1], e.p[2], Number.isFinite(e.yaw) ? e.yaw : 0, Number.isInteger(e.c) ? e.c : undefined);
      void v;
    }
  };
  // a Ride's missiles never run out, so the jet reload loop in update() leaves it alone
}
