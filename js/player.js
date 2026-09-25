'use strict';
// First-person player: movement physics, AABB collision, swimming, flying and block raycasts.

const PLAYER_HALF_W = 0.3;
const PLAYER_H = 1.8;
const PLAYER_EYE = 1.62;
const GRAVITY = 30;
const JUMP_V = 8.9;

class Player {
  constructor(world) {
    this.world = world;
    this.pos = [0.5, 90, 0.5];
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.eyeInWater = false;
    this.sprinting = false;
    this.sneaking = false;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.fovBoost = 0;
  }

  isSolidAt(x, y, z) {
    if (y < 0) return true;
    if (y >= CH) return false;
    if (!this.world.isLoaded(x, z)) return true;
    return BLOCK_SOLID[this.world.getBlock(x, y, z)] === 1;
  }

  eyePos() {
    const sneak = this.sneaking && !this.flying ? 0.12 : 0;
    const bob = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmount;
    return [this.pos[0], this.pos[1] + PLAYER_EYE - sneak + bob, this.pos[2]];
  }

  // Loaded chunk under the player? Physics waits until the ground exists.
  groundReady() {
    return this.world.isLoaded(Math.floor(this.pos[0]), Math.floor(this.pos[2]));
  }

  collides(px, py, pz) {
    const x0 = Math.floor(px - PLAYER_HALF_W + 1e-4), x1 = Math.floor(px + PLAYER_HALF_W - 1e-4);
    const y0 = Math.floor(py + 1e-4), y1 = Math.floor(py + PLAYER_H - 1e-4);
    const z0 = Math.floor(pz - PLAYER_HALF_W + 1e-4), z1 = Math.floor(pz + PLAYER_HALF_W - 1e-4);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (this.isSolidAt(x, y, z)) return true;
    }
    return false;
  }

  moveAxis(axis, d) {
    if (d === 0) return;
    const p = this.pos;
    p[axis] += d;
    const x0 = Math.floor(p[0] - PLAYER_HALF_W + 1e-4), x1 = Math.floor(p[0] + PLAYER_HALF_W - 1e-4);
    const y0 = Math.floor(p[1] + 1e-4), y1 = Math.floor(p[1] + PLAYER_H - 1e-4);
    const z0 = Math.floor(p[2] - PLAYER_HALF_W + 1e-4), z1 = Math.floor(p[2] + PLAYER_HALF_W - 1e-4);
    let limit = d > 0 ? Infinity : -Infinity;
    let hit = false;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!this.isSolidAt(x, y, z)) continue;
      hit = true;
      const b = axis === 0 ? x : axis === 1 ? y : z;
      if (d > 0) {
        const lim = axis === 1 ? b - PLAYER_H : b - PLAYER_HALF_W;
        if (lim < limit) limit = lim;
      } else {
        const lim = axis === 1 ? b + 1 : b + 1 + PLAYER_HALF_W;
        if (lim > limit) limit = lim;
      }
    }
    if (!hit) return;
    p[axis] = d > 0 ? limit - 1e-5 : limit + (axis === 1 ? 0 : 1e-5);
    if (axis === 1 && d < 0) this.onGround = true;
    this.vel[axis] = 0;
  }

  // Would stepping to (px, pz) leave the player without any ground beneath? (sneak edge guard)
  hasGroundBelow(px, pz) {
    const y = Math.floor(this.pos[1] - 0.05);
    const x0 = Math.floor(px - PLAYER_HALF_W + 1e-4), x1 = Math.floor(px + PLAYER_HALF_W - 1e-4);
    const z0 = Math.floor(pz - PLAYER_HALF_W + 1e-4), z1 = Math.floor(pz + PLAYER_HALF_W - 1e-4);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (this.isSolidAt(x, y, z)) return true;
    return false;
  }

  updateWaterState() {
    const w = this.world, p = this.pos;
    const fx = Math.floor(p[0]), fz = Math.floor(p[2]);
    this.inWater = w.getBlock(fx, Math.floor(p[1] + 0.35), fz) === B.WATER || w.getBlock(fx, Math.floor(p[1] + 1.0), fz) === B.WATER;
    const e = this.eyePos();
    const ey = Math.floor(e[1]);
    const id = w.getBlock(fx, ey, fz);
    if (id === B.WATER) {
      const above = w.getBlock(fx, ey + 1, fz);
      this.eyeInWater = above === B.WATER || e[1] - ey < 0.875;
    } else this.eyeInWater = false;
  }

  update(dt, input) {
    if (!this.groundReady()) { this.vel[0] = this.vel[1] = this.vel[2] = 0; return; }
    const k = input.keys;
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const str = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const jump = k.has('Space');
    this.sneaking = k.has('ShiftLeft') || k.has('ShiftRight');
    if (input.sprintHeld && fwd > 0) this.sprinting = true;
    if (fwd <= 0 || this.sneaking) this.sprinting = false;

    this.updateWaterState();
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

    let speed;
    if (this.flying) speed = this.sprinting ? 22 : 11;
    else if (this.inWater) speed = this.sprinting ? 3.6 : 2.6;
    else if (this.sneaking) speed = 1.6;
    else speed = this.sprinting ? 5.8 : 4.3;

    const v = this.vel;
    if (this.flying) {
      const r = 1 - Math.exp(-dt * 9);
      v[0] += (wx * speed - v[0]) * r;
      v[2] += (wz * speed - v[2]) * r;
      const vy = ((jump ? 1 : 0) - (this.sneaking ? 1 : 0)) * 8;
      v[1] += (vy - v[1]) * r;
    } else if (this.inWater) {
      const r = 1 - Math.exp(-dt * 5);
      v[0] += (wx * speed - v[0]) * r;
      v[2] += (wz * speed - v[2]) * r;
      v[1] -= GRAVITY * 0.22 * dt;
      if (jump) v[1] += 24 * dt;
      v[1] *= Math.exp(-dt * 2.2);
      v[1] = clamp(v[1], -4, 4.2);
      // hop out onto a ledge when swimming against it
      if (jump && (this.collides(this.pos[0] + wx * 0.35, this.pos[1] + 0.2, this.pos[2] + wz * 0.35))) v[1] = Math.max(v[1], 5.5);
    } else {
      const r = 1 - Math.exp(-dt * (this.onGround ? 16 : 2.4));
      v[0] += (wx * speed - v[0]) * r;
      v[2] += (wz * speed - v[2]) * r;
      v[1] -= GRAVITY * dt;
      if (v[1] < -58) v[1] = -58;
      if (jump && this.onGround) {
        v[1] = JUMP_V;
        if (this.sprinting) { v[0] += wx * 1.2; v[2] += wz * 1.2; }
      }
    }

    const dx = v[0] * dt, dy = v[1] * dt, dz = v[2] * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
    const wasOnGround = this.onGround;
    this.onGround = false;
    for (let s = 0; s < steps; s++) {
      this.moveAxis(1, dy / steps);
      const guard = this.sneaking && !this.flying && !this.inWater && (wasOnGround || this.onGround);
      const nx = this.pos[0] + dx / steps;
      if (!guard || this.hasGroundBelow(nx, this.pos[2])) this.moveAxis(0, dx / steps);
      else v[0] = 0;
      const nz = this.pos[2] + dz / steps;
      if (!guard || this.hasGroundBelow(this.pos[0], nz)) this.moveAxis(2, dz / steps);
      else v[2] = 0;
    }
    if (this.flying && this.onGround && !jump) this.flying = false;

    // view bobbing / sprint FOV
    const hs = Math.hypot(v[0], v[2]);
    const walking = this.onGround && !this.flying && hs > 0.5;
    this.bobAmount += ((walking ? Math.min(hs / 4.3, 1.4) : 0) - this.bobAmount) * (1 - Math.exp(-dt * 8));
    if (walking) this.bobPhase += dt * hs * 1.35;
    this.fovBoost += ((this.sprinting && hs > 3 ? (this.flying ? 12 : 8) : 0) - this.fovBoost) * (1 - Math.exp(-dt * 7));
    if (this.pos[1] < -20) { this.pos[1] = CH + 10; this.vel[1] = 0; }
    this.updateWaterState();
  }

  lookDir() {
    return [-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)];
  }

  // Amanatides-Woo voxel traversal. Returns { pos, normal, id } or null.
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
    for (let i = 0; i < 64 && t <= maxDist; i++) {
      if (y >= 0 && y < CH) {
        const id = this.world.getBlock(x, y, z);
        if (id !== B.AIR && id !== B.WATER) return { pos: [x, y, z], normal, id };
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; normal = [-sx, 0, 0]; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; normal = [0, -sy, 0]; }
      else { z += sz; t = tmz; tmz += tdz; normal = [0, 0, -sz]; }
    }
    return null;
  }

  intersectsBlock(bx, by, bz) {
    const p = this.pos;
    return p[0] + PLAYER_HALF_W > bx && p[0] - PLAYER_HALF_W < bx + 1 &&
      p[1] + PLAYER_H > by && p[1] < by + 1 &&
      p[2] + PLAYER_HALF_W > bz && p[2] - PLAYER_HALF_W < bz + 1;
  }
}
