'use strict';
// Box physics shared by the player and mobs (partial-height blocks, step-up), plus the
// first-person player: movement, swimming, climbing, flying and block raycasts.

const PLAYER_HALF_W = 0.3;
const PLAYER_H = 1.8;
const PLAYER_EYE = 1.62;
const GRAVITY = 30;
const JUMP_V = 8.9;

// Collision boxes of a cell in block-local units (null = passable). Plain blocks are one box of
// their height; stairs, roofs, fences, walls, panes, lanterns and top slabs have their own.
const HEIGHT_BOXES = [];
for (let h = 0; h <= 32; h++) HEIGHT_BOXES.push([[0, 0, 0, 1, h / 16, 1]]);
const UNIT_BOXES = HEIGHT_BOXES[16];
function cellBoxes(world, x, y, z) {
  if (y < 0) return UNIT_BOXES;
  if (y >= CH) return null;
  if (!world.isLoaded(x, z)) return UNIT_BOXES;
  const id = world.getBlock(x, y, z);
  if (!BLOCK_SOLID[id]) return null;
  const rt = BLOCK_RT[id];
  if (rt === RT_SHAPE || rt === RT_CONNECT || rt === RT_LANTERN || rt === RT_SLAB) {
    const sb = specialBoxes(id, world.getFacing(x, y, z), (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz), true);
    if (sb) return sb;
  }
  const h = BLOCK_HEIGHT[id];
  return h ? HEIGHT_BOXES[h] : null;
}

// Height (in blocks) of the collision boxes at a cell, 0 when passable.
function solidHeight(world, x, y, z) {
  const bx = cellBoxes(world, x, y, z);
  if (!bx) return 0;
  let top = 0;
  for (const b of bx) if (b[4] > top) top = b[4];
  return top;
}

const EPS = 1e-4;
function boxCollides(world, px, py, pz, hw, h) {
  const x0 = Math.floor(px - hw + EPS), x1 = Math.floor(px + hw - EPS);
  const y0 = Math.floor(py + EPS) - 1, y1 = Math.floor(py + h - EPS);
  const z0 = Math.floor(pz - hw + EPS), z1 = Math.floor(pz + hw - EPS);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const bx = cellBoxes(world, x, y, z);
    if (!bx) continue;
    for (const b of bx) {
      if (px - hw < x + b[3] - EPS && px + hw > x + b[0] + EPS && py < y + b[4] - EPS && py + h > y + b[1] + EPS &&
        pz - hw < z + b[5] - EPS && pz + hw > z + b[2] + EPS) return true;
    }
  }
  return false;
}

// Moves body.pos along one axis, stopping at block boxes. Returns true on contact.
function bodyMoveAxis(world, b, axis, d) {
  if (d === 0) return false;
  const p = b.pos, hw = b.hw, h = b.h;
  p[axis] += d;
  const x0 = Math.floor(p[0] - hw + EPS), x1 = Math.floor(p[0] + hw - EPS);
  const y0 = Math.floor(p[1] + EPS) - 1, y1 = Math.floor(p[1] + h - EPS);
  const z0 = Math.floor(p[2] - hw + EPS), z1 = Math.floor(p[2] + hw - EPS);
  let limit = d > 0 ? Infinity : -Infinity;
  let hit = false;
  const lo = [p[0] - hw, p[1], p[2] - hw], hi = [p[0] + hw, p[1] + h, p[2] + hw], ext = [hw, 0, hw];
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const bx = cellBoxes(world, x, y, z);
    if (!bx) continue;
    for (const c of bx) {
      const wl = [x + c[0], y + c[1], z + c[2]], wh = [x + c[3], y + c[4], z + c[5]];
      if (!(lo[0] < wh[0] - EPS && hi[0] > wl[0] + EPS && lo[1] < wh[1] - EPS && hi[1] > wl[1] + EPS && lo[2] < wh[2] - EPS && hi[2] > wl[2] + EPS)) continue;
      hit = true;
      if (d > 0) {
        const lim = axis === 1 ? wl[1] - h : wl[axis] - ext[axis];
        if (lim < limit) limit = lim;
      } else {
        const lim = axis === 1 ? wh[1] : wh[axis] + ext[axis];
        if (lim > limit) limit = lim;
      }
    }
  }
  if (!hit) return false;
  p[axis] = d > 0 ? limit - 1e-5 : limit + (axis === 1 ? 0 : 1e-5);
  if (axis === 1 && d < 0) b.onGround = true;
  b.vel[axis] = 0;
  return true;
}

// Full move with substeps and automatic step-up onto slabs / half blocks.
function bodyMove(world, b, dx, dy, dz, stepH, guard) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
  const wasOnGround = b.onGround;
  b.onGround = false;
  b.collidedH = false;
  for (let s = 0; s < steps; s++) {
    bodyMoveAxis(world, b, 1, dy / steps);
    for (const axis of [0, 2]) {
      const dd = (axis === 0 ? dx : dz) / steps;
      if (!dd) continue;
      if (guard && !guard(axis, dd)) { b.vel[axis] = 0; continue; }
      const before = b.pos.slice();
      if (!bodyMoveAxis(world, b, axis, dd)) continue;
      b.collidedH = true;
      // try stepping up
      if (stepH > 0 && (wasOnGround || b.onGround)) {
        const save = b.pos.slice(), saveV = b.vel[axis];
        b.pos[0] = before[0]; b.pos[1] = before[1]; b.pos[2] = before[2];
        const clearance = findStep(world, b, axis, dd, stepH);
        if (clearance > 0) {
          b.pos[1] += clearance;
          b.pos[axis] += dd;
          b.vel[axis] = saveV || dd;
          b.stepped = clearance;
        } else { b.pos[0] = save[0]; b.pos[1] = save[1]; b.pos[2] = save[2]; }
      }
    }
  }
}

// Smallest lift <= stepH that lets the body move dd along axis without collision.
function findStep(world, b, axis, dd, stepH) {
  const p = b.pos;
  const nx = p[0] + (axis === 0 ? dd : 0), nz = p[2] + (axis === 2 ? dd : 0);
  for (let lift = 0.0625; lift <= stepH + 1e-6; lift += 0.0625) {
    if (boxCollides(world, p[0], p[1] + lift, p[2], b.hw, b.h)) return 0;
    if (!boxCollides(world, nx, p[1] + lift, nz, b.hw, b.h)) {
      // settle on the actual surface
      let y = p[1] + lift;
      while (y - 0.0625 >= p[1] && !boxCollides(world, nx, y - 0.0625, nz, b.hw, b.h)) y -= 0.0625;
      return y - p[1] > 0.01 ? y - p[1] : 0;
    }
  }
  return 0;
}

function liquidAt(world, x, y, z) {
  const id = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  return id === B.WATER || id === B.LAVA ? id : 0;
}

class Player {
  constructor(world) {
    this.world = world;
    this.pos = [0.5, 90, 0.5];
    this.vel = [0, 0, 0];
    this.hw = PLAYER_HALF_W;
    this.h = PLAYER_H;
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.inLava = false;
    this.eyeInWater = false;
    this.eyeInLava = false;
    this.onLadder = false;
    this.sprinting = false;
    this.sneaking = false;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.fovBoost = 0;
    this.sneakOffset = 0;
    this.fallStart = null;     // highest y since leaving the ground
    this.landed = 0;           // fall distance reported on landing (consumed by survival)
    this.jumped = false;
    this.distWalked = 0;
    this.stepDist = 0;
    this.creative = true;
    this.flySpeed = 1;
    this.stepped = 0;
    this.eyeSmooth = 0;
  }

  isSolidAt(x, y, z) { return solidHeight(this.world, x, y, z) > 0; }

  eyePos() {
    const bob = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmount;
    return [this.pos[0], this.pos[1] + PLAYER_EYE - this.sneakOffset + bob - this.eyeSmooth, this.pos[2]];
  }

  // Loaded chunk under the player? Physics waits until the ground exists.
  groundReady() {
    return this.world.isLoaded(Math.floor(this.pos[0]), Math.floor(this.pos[2]));
  }

  collides(px, py, pz) { return boxCollides(this.world, px, py, pz, this.hw, this.h); }

  // Would stepping to (px, pz) leave the player without any ground beneath? (sneak edge guard)
  hasGroundBelow(px, pz) {
    const y = this.pos[1] - 0.05;
    const x0 = Math.floor(px - PLAYER_HALF_W + 1e-4), x1 = Math.floor(px + PLAYER_HALF_W - 1e-4);
    const z0 = Math.floor(pz - PLAYER_HALF_W + 1e-4), z1 = Math.floor(pz + PLAYER_HALF_W - 1e-4);
    const yi = Math.floor(y);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const sh = solidHeight(this.world, x, yi, z);
      if (sh > 0 && y < yi + sh) return true;
    }
    return false;
  }

  updateEnvState() {
    const w = this.world, p = this.pos;
    const fx = Math.floor(p[0]), fz = Math.floor(p[2]);
    const feet = w.getBlock(fx, Math.floor(p[1] + 0.35), fz), waist = w.getBlock(fx, Math.floor(p[1] + 1.0), fz);
    this.inWater = feet === B.WATER || waist === B.WATER;
    this.inLava = feet === B.LAVA || waist === B.LAVA;
    const e = this.eyePos();
    const ey = Math.floor(e[1]);
    const id = w.getBlock(fx, ey, fz);
    if (id === B.WATER || id === B.LAVA) {
      const above = w.getBlock(fx, ey + 1, fz);
      const under = above === id || e[1] - ey < 0.875;
      this.eyeInWater = id === B.WATER && under;
      this.eyeInLava = id === B.LAVA && under;
    } else { this.eyeInWater = false; this.eyeInLava = false; }
    // ladders anywhere in the body's column
    this.onLadder = false;
    for (let y = Math.floor(p[1]); y <= Math.floor(p[1] + 1.2); y++) {
      if (w.getBlock(fx, y, fz) === B.LADDER) { this.onLadder = true; break; }
    }
  }

  update(dt, input) {
    if (!this.groundReady()) { this.vel[0] = this.vel[1] = this.vel[2] = 0; return; }
    const k = input.keys;
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const str = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const jump = k.has('Space');
    this.sneaking = k.has('ShiftLeft') || k.has('ShiftRight');
    if (input.sprintHeld && fwd > 0 && !input.noSprint) this.sprinting = true;
    if (fwd <= 0 || this.sneaking || input.noSprint) this.sprinting = false;
    this.jumped = false;

    this.updateEnvState();
    // unstick if something was placed inside us / spawned in a block
    if (this.collides(this.pos[0], this.pos[1], this.pos[2])) {
      this.pos[1] = Math.floor(this.pos[1]) + 1;
      this.vel[1] = 0;
      return;
    }

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = fwd * -sy + str * cy;
    let wz = fwd * -cy + str * -sy;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    const liquid = this.inWater || this.inLava;
    let speed;
    if (this.flying) speed = (this.sprinting ? 22 : 11) * this.flySpeed;
    else if (this.inLava) speed = 1.6;
    else if (this.inWater) speed = this.sprinting ? 3.6 : 2.6;
    else if (this.sneaking) speed = 1.6;
    else speed = this.sprinting ? 5.8 : 4.3;
    if (input.slow) speed *= 0.35;
    if (!this.flying && typeof hasEffect === 'function' && hasEffect('speed')) speed *= 1.35;

    const v = this.vel;
    if (this.flying) {
      const r = 1 - Math.exp(-dt * 9);
      v[0] += (wx * speed - v[0]) * r;
      v[2] += (wz * speed - v[2]) * r;
      const vy = ((jump ? 1 : 0) - (this.sneaking ? 1 : 0)) * 8 * this.flySpeed;
      v[1] += (vy - v[1]) * r;
    } else if (liquid) {
      const r = 1 - Math.exp(-dt * (this.inLava ? 3 : 5));
      v[0] += (wx * speed - v[0]) * r;
      v[2] += (wz * speed - v[2]) * r;
      v[1] -= GRAVITY * (this.inLava ? 0.12 : 0.22) * dt;
      if (jump) v[1] += (this.inLava ? 14 : 24) * dt;
      v[1] *= Math.exp(-dt * (this.inLava ? 4 : 2.2));
      v[1] = clamp(v[1], -4, 4.2);
      // hop out onto a ledge when swimming against it
      if (jump && (this.collides(this.pos[0] + wx * 0.35, this.pos[1] + 0.2, this.pos[2] + wz * 0.35))) v[1] = Math.max(v[1], 5.5);
      // the current carries you downstream and waterfalls push you down
      const cur = typeof Fluids !== 'undefined' && this.world === G.world ? Fluids.push(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.35), Math.floor(this.pos[2])) : null;
      if (cur) { v[0] += cur[0] * 9 * dt; v[2] += cur[2] * 9 * dt; v[1] += cur[1] * 6 * dt; }
    } else {
      const r = 1 - Math.exp(-dt * (this.onGround ? 16 : 2.4));
      v[0] += (wx * speed - v[0]) * r;
      v[2] += (wz * speed - v[2]) * r;
      v[1] -= GRAVITY * dt;
      if (v[1] < -58) v[1] = -58;
      if (jump && this.onGround) {
        v[1] = JUMP_V * (typeof hasEffect === 'function' && hasEffect('jump') ? 1.27 : 1);
        this.jumped = true;
        if (this.sprinting) { v[0] += wx * 1.2; v[2] += wz * 1.2; }
      }
      if (this.onLadder) {
        if (jump || (this.collidedH && (fwd || str))) v[1] = 3.2;
        else if (this.sneaking) v[1] = Math.max(v[1], 0);
        else v[1] = Math.max(v[1], -2.6);
      }
      if (this.parachute) {
        // slow descent, gentle steering
        if (v[1] < -4.2) v[1] += (-4.2 - v[1]) * (1 - Math.exp(-dt * 4));
        const r2 = 1 - Math.exp(-dt * 1.5);
        v[0] += (wx * 5 - v[0]) * r2; v[2] += (wz * 5 - v[2]) * r2;
        this.fallStart = null;
      }
    }

    const dx = v[0] * dt, dy = v[1] * dt, dz = v[2] * dt;
    const px0 = this.pos[0], pz0 = this.pos[2];
    const edgeGuard = this.sneaking && !this.flying && !liquid && this.onGround;
    const guard = edgeGuard ? (axis, dd) => (axis === 0 ? this.hasGroundBelow(this.pos[0] + dd, this.pos[2]) : this.hasGroundBelow(this.pos[0], this.pos[2] + dd)) : null;
    this.stepped = 0;
    bodyMove(this.world, this, dx, dy, dz, this.flying ? 0 : 0.6, guard);
    // smooth the camera over automatic steps
    if (this.stepped) this.eyeSmooth += this.stepped;
    this.eyeSmooth *= Math.exp(-dt * 14);
    if (this.flying && this.onGround && !jump) this.flying = false;
    if (this.parachute && (this.onGround || liquid || this.flying)) { this.parachute = false; this.fallStart = null; this.landed = 0; }

    // fall tracking
    if (this.onGround || liquid || this.flying || this.onLadder) {
      if (this.onGround && this.fallStart !== null && !liquid && !this.flying) this.landed = Math.max(0, this.fallStart - this.pos[1]);
      this.fallStart = null;
    } else if (this.fallStart === null || this.pos[1] > this.fallStart) this.fallStart = this.pos[1];

    const moved = Math.hypot(this.pos[0] - px0, this.pos[2] - pz0);
    this.distWalked += moved;
    if (this.onGround) this.stepDist += moved;

    // view bobbing / sprint FOV / sneak camera
    const hs = Math.hypot(v[0], v[2]);
    const walking = this.onGround && !this.flying && hs > 0.5;
    this.bobAmount += ((walking ? Math.min(hs / 4.3, 1.4) : 0) - this.bobAmount) * (1 - Math.exp(-dt * 8));
    if (walking) this.bobPhase += dt * hs * 1.35;
    this.fovBoost += ((this.sprinting && hs > 3 ? (this.flying ? 12 : 8) : 0) - this.fovBoost) * (1 - Math.exp(-dt * 7));
    this.sneakOffset += ((this.sneaking && !this.flying ? 0.14 : 0) - this.sneakOffset) * (1 - Math.exp(-dt * 14));
    if (this.pos[1] < -40 && this.creative) { this.pos[1] = CH + 10; this.vel[1] = 0; }
    this.updateEnvState();
  }

  lookDir() {
    return [-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)];
  }

  // Amanatides-Woo voxel traversal against block shapes. Returns { pos, normal, id, dist } or null.
  raycast(maxDist) {
    const o = this.eyePos(), d = this.lookDir();
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const sx = Math.sign(d[0]), sy = Math.sign(d[1]), sz = Math.sign(d[2]);
    const tdx = sx ? Math.abs(1 / d[0]) : Infinity, tdy = sy ? Math.abs(1 / d[1]) : Infinity, tdz = sz ? Math.abs(1 / d[2]) : Infinity;
    let tmx = sx > 0 ? (x + 1 - o[0]) * tdx : sx < 0 ? (o[0] - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - o[1]) * tdy : sy < 0 ? (o[1] - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - o[2]) * tdz : sz < 0 ? (o[2] - z) * tdz : Infinity;
    let normal = [0, 0, 0];
    let t = 0;
    for (let i = 0; i < 80 && t <= maxDist; i++) {
      if (y >= 0 && y < CH) {
        const id = this.world.getBlock(x, y, z);
        if (id !== B.AIR && id !== B.WATER && id !== B.LAVA) {
          const box = blockShape(this.world, id, x, y, z);
          const parts = pickBoxes(this.world, id, x, y, z);
          let hit = null;
          if (parts) {
            for (const b of parts) {
              const h = rayBox(o, d, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
              if (h && (!hit || h.t < hit.t)) hit = h;
            }
          } else hit = rayBox(o, d, x + box[0], y + box[1], z + box[2], x + box[3], y + box[4], z + box[5]);
          if (hit && hit.t <= maxDist) return { pos: [x, y, z], normal: hit.n, id, dist: hit.t, box, point: [o[0] + d[0] * hit.t, o[1] + d[1] * hit.t, o[2] + d[2] * hit.t] };
        }
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; normal = [-sx, 0, 0]; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; normal = [0, -sy, 0]; }
      else { z += sz; t = tmz; tmz += tdz; normal = [0, 0, -sz]; }
    }
    void normal;
    return null;
  }

  intersectsBlock(bx, by, bz, h = 1) {
    const p = this.pos;
    return p[0] + PLAYER_HALF_W > bx && p[0] - PLAYER_HALF_W < bx + 1 &&
      p[1] + PLAYER_H > by && p[1] < by + h &&
      p[2] + PLAYER_HALF_W > bz && p[2] - PLAYER_HALF_W < bz + 1;
  }
}

// The separate boxes a ray can hit on shaped blocks (null: use blockShape's single box).
function pickBoxes(world, id, x, y, z) {
  const rt = BLOCK_RT[id];
  if (rt !== RT_SHAPE && rt !== RT_CONNECT && rt !== RT_LANTERN) return null;
  return specialBoxes(id, world.getFacing(x, y, z), (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz), false);
}

// Selection / hit box of a block in block-local coordinates.
function blockShape(world, id, x, y, z) {
  const parts = pickBoxes(world, id, x, y, z);
  if (parts) {
    const u = [1, 1, 1, 0, 0, 0];
    for (const b of parts) for (let k = 0; k < 3; k++) { u[k] = Math.min(u[k], b[k]); u[k + 3] = Math.max(u[k + 3], b[k + 3]); }
    return u;
  }
  switch (BLOCK_RT[id]) {
    case RT_SLAB: return world.getFacing(x, y, z) & 8 ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
    case RT_BED: return [0, 0, 0, 1, 9 / 16, 1];
    case RT_FARMLAND: return [0, 0, 0, 1, 15 / 16, 1];
    case RT_TORCH: return [6 / 16, 0, 6 / 16, 10 / 16, 10 / 16, 10 / 16];
    case RT_CROSS: return [2 / 16, 0, 2 / 16, 14 / 16, id >= B.WHEAT_0 && id <= B.WHEAT_2 ? 0.3 + (id - B.WHEAT_0) * 0.2 : 13 / 16, 14 / 16];
    case RT_DOOR: return doorPanel(world.getFacing(x, y, z), isOpenDoor(id)).map((v) => v / 16);
    case RT_TRAPDOOR: return trapdoorPanel(world.getFacing(x, y, z), isOpenDoor(id)).map((v) => v / 16);
    case RT_WALL_TORCH: case RT_LADDER: {
      // the supporting wall sits on the side opposite the facing
      const ladder = BLOCK_RT[id] === RT_LADDER;
      const f = world.getFacing(x, y, z);
      const t = ladder ? 2 / 16 : 5 / 16;
      const lo = ladder ? 0 : 3 / 16, hi = ladder ? 1 : 13 / 16;
      const a = ladder ? 0 : 0.3, b = ladder ? 1 : 0.7;
      if (f === 0) return [0, lo, a, t, hi, b];
      if (f === 1) return [1 - t, lo, a, 1, hi, b];
      if (f === 4) return [a, lo, 0, b, hi, t];
      return [a, lo, 1 - t, b, hi, 1];
    }
    default: return [0, 0, 0, 1, 1, 1];
  }
}

// Slab-method ray/box intersection. Returns { t, n } of the entry face or null.
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, n = null;
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return null; continue; }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    let s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[a] = d[a] > 0 ? -1 : 1; void s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), n: n || [0, 1, 0] };
}
