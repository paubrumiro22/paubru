'use strict';
// More realistic physics (setting "physics": realistic by default).
// - Structures: in survival, blocks that players built have to hang on something. Each built
//   block is supported from below, or by the natural ground it touches; every step sideways (or
//   hanging under another block) from a support costs 1 and more than PHYS_SPAN steps is too far.
//   Knock out a pillar and what it held comes down; a bridge can't reach further than that
//   without a pillar. Checked after every block you break or place and after explosions.
// - Falling blocks tumble: they keep sideways speed, spin as they fall, and fragile ones (glass,
//   leaves, lamps...) shatter when they land instead of settling.
// - Explosions throw debris: some of the blocks they blow out fly off and land around the crater.
// - Felled trees topple away from you instead of just vanishing.
// - Ice is slippery and mud slows you down (player.js).

const PHYS_SPAN = 7, PHYS_BUDGET = 700;
const PHYS_FRAGILE = new Set([B.GLASS, B.GLASS_PANE, B.GLASS_LAMP, B.SEA_LANTERN, B.LANTERN, B.GLOWSTONE, B.TORCH, B.WALL_TORCH, B.ICE,
  B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.PALM_LEAVES, B.CHERRY_LEAVES, B.DARK_OAK_LEAVES, B.ACACIA_LEAVES, B.PAPER_LANTERN, B.AUTO_DOOR]);

const Physics = {
  queue: [], seen: new Set(),

  on() { return G.settings.physics !== 'classic'; },
  structural() { return this.on() && G.mode === 'survival'; },

  // blocks a player put there (saved edits) are the only ones that need holding up
  built(x, y, z, id) {
    if (!BLOCK_SOLID[id] || IS_LIQUID(id) || BLOCK_HARD[id] < 0) return false;
    const e = G.world.edits.get(chunkKey(x >> 4, z >> 4));
    return !!(e && e.get(blockIndex(x & 15, y, z & 15)) === id);
  },

  check(x, y, z) {
    if (!this.structural()) return;
    const k = posKey(x, y, z);
    if (this.seen.has(k) || this.queue.length > 60) return;
    this.seen.add(k);
    this.queue.push([x, y, z]);
  },
  checkAround(x, y, z) { for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) this.check(x + dx, y + dy, z + dz); },

  update(dt) {
    void dt;
    for (let n = 0; n < 3 && this.queue.length; n++) {
      const [x, y, z] = this.queue.shift();
      this.seen.delete(posKey(x, y, z));
      this.settle(x, y, z);
    }
  },

  // How well the built blocks connected to (x, y, z) are held up; bring down what is not.
  settle(x0, y0, z0) {
    const w = G.world;
    if (!w.isLoaded(x0, z0)) return;
    const id0 = w.getBlock(x0, y0, z0);
    if (!this.built(x0, y0, z0, id0)) return;
    // the connected built blocks
    const nodes = new Map(), list = [], stack = [[x0, y0, z0]];
    nodes.set(posKey(x0, y0, z0), 0);
    while (stack.length) {
      const [x, y, z] = stack.pop();
      list.push([x, y, z]);
      if (list.length > PHYS_BUDGET) return;      // a big building: leave it be
      for (const [dx, dy, dz] of N6) {
        const a = x + dx, b = y + dy, c = z + dz, k = posKey(a, b, c);
        if (nodes.has(k) || !w.isLoaded(a, c)) continue;
        const id = w.getBlock(a, b, c);
        if (this.built(a, b, c, id)) { nodes.set(k, 0); stack.push([a, b, c]); }
      }
    }
    // cost to reach each from something solid that is not built (0-1 breadth first search)
    const cost = new Map(), dq = [];
    for (const [x, y, z] of list) {
      let anchored = y <= 1;
      for (const [dx, dy, dz] of N6) {
        if (anchored) break;
        const a = x + dx, b = y + dy, c = z + dz;
        if (nodes.has(posKey(a, b, c))) continue;
        const id = w.getBlock(a, b, c);
        // resting on the ground, or set into the natural ground (or a generated building) beside or above
        if ((BLOCK_SOLID[id] && !IS_LIQUID(id)) || !w.isLoaded(a, c)) anchored = true;
      }
      if (anchored) { const k = posKey(x, y, z); cost.set(k, 0); dq.push([x, y, z, 0]); }
    }
    for (let h = 0; h < dq.length; h++) {
      const [x, y, z, c0] = dq[h];
      if (cost.get(posKey(x, y, z)) < c0) continue;
      for (const [dx, dy, dz] of N6) {
        const a = x + dx, b = y + dy, c = z + dz, k = posKey(a, b, c);
        if (!nodes.has(k)) continue;
        const nc = c0 + (dy > 0 ? 0 : 1);           // straight up a pillar is free
        if (nc > PHYS_SPAN) continue;
        if (cost.has(k) && cost.get(k) <= nc) continue;
        cost.set(k, nc);
        if (dy > 0) dq.splice(h + 1, 0, [a, b, c, nc]); else dq.push([a, b, c, nc]);
      }
    }
    const loose = list.filter(([x, y, z]) => !cost.has(posKey(x, y, z)));
    if (!loose.length) return;
    loose.sort((p, q) => p[1] - q[1]);
    const snd = BLOCK_SOUND[w.getBlock(loose[0][0], loose[0][1], loose[0][2])];
    for (const [x, y, z] of loose.slice(0, 160)) {
      const id = w.getBlock(x, y, z);
      editBlock(x, y, z, B.AIR);
      const f = new FallingBlock(id, x, y, z);
      f.vel[0] = rand(-0.6, 0.6); f.vel[2] = rand(-0.6, 0.6);
      f.spinV = rand(-2, 2); f.yawR = rand(0, Math.PI * 2);
      Ents.falling.push(f);
    }
    sfx('break_' + snd, [x0 + 0.5, y0 + 0.5, z0 + 0.5], 1, 0.6);
    sfx('land', [x0 + 0.5, y0, z0 + 0.5], 1, 0.5);
    G.shake = Math.max(G.shake || 0, Math.min(0.6, loose.length * 0.02));
    if (loose.length > 3) G.ui.toast('💥 Without enough support, part of the building came down', 2500);
  },

  // explosions: a share of the blown-out blocks flies off as debris (taken = no item drop)
  debris(bx, by, bz, id, x, y, z, power, remote, n) {
    if (!this.on() || n > 48 || !BLOCK_SOLID[id] || BLOCK_RT[id] !== RT_CUBE || PHYS_FRAGILE.has(id) || Math.random() > 0.35) return false;
    const f = new FallingBlock(id, bx, by, bz);
    const dx = bx + 0.5 - x, dy = by + 0.5 - y, dz = bz + 0.5 - z, l = Math.hypot(dx, dy, dz) || 1;
    const sp = power * rand(1.6, 3.2);
    f.vel = [dx / l * sp, Math.max(4, dy / l * sp + power * 1.8), dz / l * sp];
    f.spinV = rand(-9, 9); f.yawR = rand(0, Math.PI * 2);
    f.remote = remote;                                 // replayed blasts show the debris but do not place it
    Ents.falling.push(f);
    return true;
  },

  // a felled log tumbles away from the chopper and turns into nothing (the wood is already yours)
  topple(x, y, z, id, from, height) {
    if (!this.on()) return;
    const f = new FallingBlock(id, x, y, z);
    const dx = x + 0.5 - from[0], dz = z + 0.5 - from[2], l = Math.hypot(dx, dz) || 1;
    const sp = 1.2 + height * 0.55;
    f.vel = [dx / l * sp, 1.5, dz / l * sp];
    f.spinV = (Math.random() < 0.5 ? -1 : 1) * (2.5 + height * 0.3); f.yawR = Math.atan2(dx, dz);
    f.vanish = true;
    Ents.falling.push(f);
  },
};

// ---------------------------------------------------------------- falling blocks ----
// sideways speed, spin, shattering; debris from someone else's blast and toppled logs never place
FallingBlock.prototype.update = function (dt) {
  this.age += dt;
  this.vel[1] = Math.max(this.vel[1] - 24 * dt, -40);
  const vx = this.vel[0], vz = this.vel[2];
  bodyMove(G.world, this, vx * dt, this.vel[1] * dt, vz * dt, 0, null);
  if (this.collidedH) { this.vel[0] *= -0.3; this.vel[2] *= -0.3; }
  if (this.spinV) this.spin = (this.spin || 0) + this.spinV * dt;
  const x = Math.floor(this.pos[0]), y = Math.floor(this.pos[1] + 0.02), z = Math.floor(this.pos[2]);
  if (this.onGround || this.age > 20) {
    this.removed = true;
    const at = [x + 0.5, y + 0.3, z + 0.5];
    if (this.vanish || this.remote) { Particles.blockBreak(x, y, z, this.id); sfx('break_' + BLOCK_SOUND[this.id], at, 0.6, 0.8); return; }
    if (PHYS_FRAGILE.has(this.id) && (this.spinV || this.vel[1] < -8)) {
      Particles.blockBreak(x, y, z, this.id);
      sfx('break_' + BLOCK_SOUND[this.id], at, 1, 0.9);
      if (G.mode === 'survival') for (const [it, n] of blockDrops(this.id, 0, Math.random)) Ents.spawnItem({ id: it, count: n }, at[0], at[1], at[2]);
      return;
    }
    const cur = G.world.getBlock(x, y, z);
    if (BLOCK_REPLACE[cur] || BLOCK_RT[cur] === RT_CROSS) {
      editBlock(x, y, z, this.id);
      sfx('place_' + BLOCK_SOUND[this.id], at, 0.8, 0.9);
      if (this.spinV) Particles.blockBreak(x, y, z, this.id);
      checkFalling(x, y, z);
    } else Ents.spawnItem({ id: this.id, count: 1 }, at[0], at[1], at[2]);
  }
  if (this.pos[1] < -20) this.removed = true;
};

// ---------------------------------------------------------------- hooks ----
{
  const destroy = destroyBlock;
  // eslint-disable-next-line no-global-assign
  destroyBlock = function (x, y, z, opts) {
    const r = destroy.call(this, x, y, z, opts);
    if (r && opts && opts.tool !== undefined) Physics.checkAround(x, y, z);
    return r;
  };
  const place = Act.placeBlock;
  Act.placeBlock = function (hit) {
    const ok = place.call(this, hit);
    if (ok && Physics.structural()) {
      // the placed block is next to the face that was clicked
      const [x, y, z] = hit.pos, n = hit.normal;
      Physics.check(x + n[0], y + n[1], z + n[2]);
      Physics.check(x, y, z);
    }
    return ok;
  };
}
