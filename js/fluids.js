'use strict';
// Flowing water and lava. Generated oceans, lakes and rivers are still sources; as soon as
// something around a liquid changes (a block mined, a bucket poured, an explosion, a natural
// spring loading in) the cells nearby are scheduled and the liquid spreads: straight down
// first, sideways only where it rests on something, one level weaker per block (water reaches
// 7 blocks, lava 3 and much slower). Two water sources side by side refill the gap between
// them, lava touching water turns into cobblestone (or obsidian if it was a source).
// Levels live in world.flow (1..7 spreading, 8 falling); the mesher slopes the surface from
// them and the water shader drags its ripples downstream.

const FLUID = {
  [B.WATER]: { step: 1, max: 7, every: 1 },
  [B.LAVA]: { step: 2, max: 6, every: 3 },
};
const FLUID_TICK = 0.2;
const FLUID_BUDGET = 600;      // cells per tick
const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const Fluids = {
  now: new Map(),     // posKey -> [x, y, z] to process on the next tick
  parked: new Map(),  // waiting for a neighbouring chunk to load
  prefCache: new Map(),
  timer: 0,
  tick: 0,

  reset() { this.now.clear(); this.parked.clear(); this.timer = 0; },

  // a chunk arrived: wake its spring and anything that was waiting at its border
  chunkAdded(c) {
    if (c.springs) this.schedule(c.springs[0], c.springs[1], c.springs[2]);
    if (!this.parked.size) return;
    for (const [k, p] of this.parked) {
      if (Math.abs((p[0] >> 4) - c.cx) <= 1 && Math.abs((p[2] >> 4) - c.cz) <= 1) { this.parked.delete(k); this.now.set(k, p); }
    }
  },

  schedule(x, y, z) {
    if (y < 0 || y >= CH) return;
    const k = posKey(x, y, z);
    if (!this.now.has(k)) this.now.set(k, [x, y, z]);
  },

  // Something changed at (x, y, z): wake the liquid around it.
  touch(x, y, z) {
    const w = G.world;
    let near = IS_LIQUID(w.getBlock(x, y, z));
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (IS_LIQUID(w.getBlock(x + dx, y + dy, z + dz))) { near = true; this.schedule(x + dx, y + dy, z + dz); }
    }
    if (near) this.schedule(x, y, z);
  },

  // Where liquid can go: air and things it washes away (plants, torches, snow layers...)
  open(id) { return id === B.AIR || (BLOCK_REPLACE[id] && !IS_LIQUID(id)) || BLOCK_SUPPORT[id] === SUP_SOIL || id === B.TORCH || id === B.WALL_TORCH; },

  level(x, y, z) { return G.world.getFlow(x, y, z); },

  // A block the liquid can rest on and spread sideways from
  floor(id) { return id !== B.AIR && !IS_LIQUID(id) && BLOCK_SOLID[id] !== 0 && !this.open(id); },

  // Like real streams, liquid resting on a floor only runs towards the nearest way down (within
  // 4 blocks); on flat ground with no drop in reach it spreads every way. Bitmask over H4.
  prefers(x, y, z, k) {
    const key = posKey(x, y, z) * 2 + (k === B.LAVA ? 1 : 0);
    const hit = this.prefCache.get(key);
    if (hit !== undefined) return hit;
    const w = G.world;
    const pass = (px, pz) => { const id = w.getBlock(px, y, pz); return this.open(id) || (id === k && w.getFlow(px, y, pz) > 0); };
    const dists = [99, 99, 99, 99];
    for (let d = 0; d < 4; d++) {
      const sx = x + H4[d][0], sz = z + H4[d][1];
      if (!pass(sx, sz)) continue;
      let frontier = [[sx, sz]];
      const seen = new Set([sx * 4096 + sz, x * 4096 + z]);
      for (let depth = 0; depth < 4 && frontier.length; depth++) {
        const next = [];
        for (const [px, pz] of frontier) {
          const below = w.getBlock(px, y - 1, pz);
          if (this.open(below) || (below === k && w.getFlow(px, y - 1, pz) > 0)) { dists[d] = depth; next.length = 0; frontier = []; break; }
          for (const [dx, dz] of H4) {
            const qx = px + dx, qz = pz + dz, qk = qx * 4096 + qz;
            if (seen.has(qk) || !pass(qx, qz)) continue;
            seen.add(qk); next.push([qx, qz]);
          }
        }
        if (dists[d] < 99) break;
        frontier = next;
      }
    }
    const m = Math.min(...dists);
    let mask = 0;
    for (let d = 0; d < 4; d++) if (m === 99 ? true : dists[d] === m) mask |= 1 << d;
    this.prefCache.set(key, mask);
    return mask;
  },

  // What (x, y, z) should hold for liquid kind k: -1 nothing, 0 source, 1..max spreading, 8 falling
  want(x, y, z, k) {
    const w = G.world, f = FLUID[k];
    if (w.getBlock(x, y + 1, z) === k) return 8;
    let best = 99, sources = 0;
    for (let d = 0; d < 4; d++) {
      const dx = H4[d][0], dz = H4[d][1];
      const nx = x + dx, nz = z + dz;
      if (w.getBlock(nx, y, nz) !== k) continue;
      const l = w.getFlow(nx, y, nz);
      if (l === 0) sources++;
      // a neighbour only feeds sideways while it rests on a floor (or on a pool of source)
      const below = w.getBlock(nx, y - 1, nz);
      const rests = this.floor(below) || (below === k && w.getFlow(nx, y - 1, nz) === 0);
      if (!rests) continue;
      // does that neighbour run this way? (direction from it to us is the opposite of d)
      if (!(this.prefers(nx, y, nz, k) & (1 << (d ^ 1)))) continue;
      const base = l === 8 ? 0 : l;
      best = Math.min(best, base + f.step);
    }
    if (k === B.WATER && sources >= 2) {
      const below = w.getBlock(x, y - 1, z);
      if (this.floor(below) || (below === k && w.getFlow(x, y - 1, z) === 0)) return 0;
    }
    return best <= f.max ? best : -1;
  },

  update(dt) {
    if (!this.now.size) { this.timer = 0; return; }
    this.timer += dt;
    if (this.timer < FLUID_TICK) return;
    this.timer = 0;
    this.tick++;
    this.prefCache.clear();
    const batch = this.now;
    this.now = new Map();
    let n = 0;
    const dirty = new Set();
    for (const [k, p] of batch) {
      if (n++ >= FLUID_BUDGET) { this.now.set(k, p); continue; }
      this.step(p[0], p[1], p[2], dirty);
    }
    for (const c of dirty) {
      if (neighborsLoaded(c.cx, c.cz)) meshChunk(c); else c.needsMesh = true;
    }
  },

  step(x, y, z, dirty) {
    const w = G.world;
    if (!w.isLoaded(x, z) || !w.isLoaded(x + 1, z) || !w.isLoaded(x - 1, z) || !w.isLoaded(x, z + 1) || !w.isLoaded(x, z - 1)) {
      if (this.parked.size < 20000) this.parked.set(posKey(x, y, z), [x, y, z]);
      return;
    }
    const id = w.getBlock(x, y, z);
    // lava meeting water hardens
    if (id === B.LAVA) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        if (w.getBlock(x + dx, y + dy, z + dz) !== B.WATER) continue;
        this.set(x, y, z, w.getFlow(x, y, z) === 0 ? B.OBSIDIAN : B.COBBLE, 0, dirty);
        sfx('fizz', [x + 0.5, y + 0.5, z + 0.5], 0.6, 1);
        Particles.smoke(x + 0.5, y + 1, z + 0.5, 6, 0.4, false);
        return;
      }
    }
    if (IS_LIQUID(id)) {
      const l = w.getFlow(x, y, z);
      if (l === 0) { this.spread(x, y, z, id); return; }        // sources never change on their own
      if (FLUID[id].every > 1 && this.tick % FLUID[id].every) { this.schedule(x, y, z); return; }
      const want = this.want(x, y, z, id);
      if (want < 0) this.set(x, y, z, B.AIR, 0, dirty);
      else if (want !== l) this.set(x, y, z, id, want, dirty);
      else this.spread(x, y, z, id);
      return;
    }
    if (!this.open(id)) return;
    // an empty cell next to liquid: does anything flow in?
    for (const k of [B.WATER, B.LAVA]) {
      if (FLUID[k].every > 1 && this.tick % FLUID[k].every) {
        if (this.adjacent(x, y, z, k)) this.schedule(x, y, z);
        continue;
      }
      const want = this.want(x, y, z, k);
      if (want < 0) continue;
      if (id !== B.AIR) {
        if (G.mode === 'survival') for (const [it, c] of blockDrops(id, 0, Math.random)) Ents.spawnItem({ id: it, count: c }, x + 0.5, y + 0.3, z + 0.5);
        Particles.blockBreak(x, y, z, id);
      }
      this.set(x, y, z, k, want, dirty);
      return;
    }
  },

  adjacent(x, y, z, k) {
    const w = G.world;
    return w.getBlock(x, y + 1, z) === k || H4.some(([dx, dz]) => w.getBlock(x + dx, y, z + dz) === k);
  },

  // wake the cells this liquid could run into
  spread(x, y, z, id) {
    const w = G.world;
    if (this.open(w.getBlock(x, y - 1, z))) { this.schedule(x, y - 1, z); return; }
    for (const [dx, dz] of H4) if (this.open(w.getBlock(x + dx, y, z + dz))) this.schedule(x + dx, y, z + dz);
  },

  // write without sharing it online: every player runs the same flow from the same edits
  set(x, y, z, id, level, dirty) {
    const w = G.world;
    const old = w.getBlock(x, y, z);
    const list = w.setBlock(x, y, z, id);
    if (level > 0) w.flow.set(posKey(x, y, z), level); else w.flow.delete(posKey(x, y, z));
    if (old !== id) cleanupBlockEntity(x, y, z, old, id);
    const c = w.getChunk(x >> 4, z >> 4);
    if (c) dirty.add(c);
    if (list) {
      const lx = x & 15, lz = z & 15;
      for (const n of list) {
        const ddx = n.cx - c.cx, ddz = n.cz - c.cz;
        if ((ddx === 0 || (ddx === -1 && lx === 0) || (ddx === 1 && lx === 15)) && (ddz === 0 || (ddz === -1 && lz === 0) || (ddz === 1 && lz === 15))) dirty.add(n);
      }
    }
    w.editsDirty = true;
    this.schedule(x, y, z);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) this.schedule(x + dx, y + dy, z + dz);
    // falling onto something that supports plants/sand etc.
    if (id === B.AIR) updateNeighbors(x, y, z);
  },

  // Current pushing things along: direction the level falls towards around (x, y, z).
  push(x, y, z) {
    const w = G.world;
    const k = w.getBlock(x, y, z);
    if (!IS_LIQUID(k)) return null;
    const l = w.getFlow(x, y, z);
    if (l === 0) return null;
    if (l === 8) return [0, -1, 0];
    let vx = 0, vz = 0;
    for (const [dx, dz] of H4) {
      const nb = w.getBlock(x + dx, y, z + dz);
      let nl;
      if (nb === k) nl = w.getFlow(x + dx, y, z + dz) || 0;
      else if (this.open(nb)) nl = FLUID[k].max + 1;
      else continue;
      if (nl === 8) nl = 0;
      vx += dx * (nl - l); vz += dz * (nl - l);
    }
    const m = Math.hypot(vx, vz);
    return m > 0 ? [vx / m, 0, vz / m] : null;
  },
};
