'use strict';
// Mechanisms: how signal power flows (the blocks are in mech_blocks.js).
// - Sources: lever, button (1 s, wooden 1.5 s), pressure plate (while something stands on it),
//   timer (switches on and off by itself) and the signal block (always on). A source powers the
//   six cells around it, and a lever or button also powers the block it is fixed to, which then
//   powers everything touching it (so a lever on a wall works a door on the other side).
// - Signal wire carries power up to 15 blocks and glows while it does.
// - Consumers: signal lamps, doors and trapdoors (opened when power arrives, closed when it goes,
//   still usable by hand), TNT (lit), pistons (push up to 12 blocks; sticky ones pull one back).
// Changes are handled a tick after the edit that caused them (Mech.touch -> queue). What follows
// from power (lamps, doors, pistons, wire) is worked out on every player's machine from the same
// levers and buttons, so it is not sent online, like flowing water.

const MECH_SOURCE = new Uint8Array(MAX_BLOCK);
for (const id of [B.LEVER_ON, B.BUTTON_ON, B.WOOD_BUTTON_ON, B.PLATE_ON, B.WOOD_PLATE_ON, B.TIMER_ON, B.SIGNAL_BLOCK]) MECH_SOURCE[id] = 1;
const MECH_ANY = new Uint8Array(MAX_BLOCK);
for (let i = 0; i < MAX_BLOCK; i++) if (MECH_JOIN[i]) MECH_ANY[i] = 1;
for (const id of [B.PISTON_HEAD, B.STICKY_HEAD, B.DOOR_TOP, B.DOOR_OPEN_TOP]) MECH_ANY[id] = 1;
const IS_MOUNTED = (id) => id === B.LEVER || id === B.LEVER_ON || id === B.BUTTON || id === B.BUTTON_ON || id === B.WOOD_BUTTON || id === B.WOOD_BUTTON_ON;
const IS_PLATE = (id) => id === B.PLATE || id === B.PLATE_ON || id === B.WOOD_PLATE || id === B.WOOD_PLATE_ON;
const IS_PISTON = (id) => id === B.PISTON || id === B.STICKY_PISTON;
const IS_PISTON_EXT = (id) => id === B.PISTON_ON || id === B.STICKY_PISTON_ON;
const IS_HEAD = (id) => id === B.PISTON_HEAD || id === B.STICKY_HEAD;
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const TIMER_PERIODS = { 0: 0.5, 1: 1, 4: 2, 5: 4 };
const PISTON_PUSH = 12;
const PISTON_IMMOVABLE = new Set([B.BEDROCK, B.OBSIDIAN, B.CRYING_OBSIDIAN, B.NETHER_PORTAL, B.END_PORTAL, B.DEEP_PORTAL,
  B.REINFORCED_DEEPSLATE, B.ENDER_FRAME, B.CHEST, B.BARREL, B.FURNACE, B.FURNACE_LIT, B.BREWING_STAND, B.ENCHANT_TABLE, B.BED,
  B.DOOR, B.DOOR_TOP, B.DOOR_OPEN, B.DOOR_OPEN_TOP, B.PISTON_ON, B.STICKY_PISTON_ON, B.PISTON_HEAD, B.STICKY_HEAD]);

const Mech = {
  queue: new Map(),     // posKey -> [x, y, z] waiting to be looked at
  timers: new Map(),    // posKey -> { x, y, z, t }
  buttons: new Map(),   // posKey -> { x, y, z, t, mine }
  platesOn: new Map(),  // posKey -> { x, y, z, t }
  last: new Map(),      // posKey -> power a door last saw (doors only follow changes)
  plateT: 0,

  reset() { this.queue.clear(); this.timers.clear(); this.buttons.clear(); this.platesOn.clear(); this.last.clear(); },

  // Something changed at x, y, z (called by every block edit).
  touch(x, y, z) {
    const w = G.world;
    if (!w) return;
    let near = MECH_ANY[w.getBlock(x, y, z)];
    for (let i = 0; i < 6 && !near; i++) near = MECH_ANY[w.getBlock(x + N6[i][0], y + N6[i][1], z + N6[i][2])];
    // a lever's wall two cells away can matter too
    if (!near) for (let i = 0; i < 6 && !near; i++) {
      const a = x + N6[i][0], b = y + N6[i][1], c = z + N6[i][2];
      if (!BLOCK_SOLID[w.getBlock(a, b, c)]) continue;
      for (let j = 0; j < 6 && !near; j++) near = MECH_SOURCE[w.getBlock(a + N6[j][0], b + N6[j][1], c + N6[j][2])];
    }
    if (near) this.queue.set(posKey(x, y, z), [x, y, z]);
  },

  // A chunk arrived: look at the mechanisms players built in it.
  chunkAdded(c) {
    const e = G.world.edits.get(chunkKey(c.cx, c.cz));
    if (!e) return;
    for (const [idx, id] of e) {
      if (!MECH_ANY[id]) continue;
      const x = c.cx * CS + (idx % CS), z = c.cz * CS + (Math.floor(idx / CS) % CS), y = Math.floor(idx / (CS * CS));
      this.queue.set(posKey(x, y, z), [x, y, z]);
    }
  },

  // ---------------------------------------------------------------- player actions ----
  use(x, y, z, id) {
    const w = G.world, f = w.getFacing(x, y, z), at = [x + 0.5, y + 0.5, z + 0.5];
    if (id === B.LEVER || id === B.LEVER_ON) {
      editBlock(x, y, z, id === B.LEVER ? B.LEVER_ON : B.LEVER, f);
      sfx('lever', at, 1, id === B.LEVER ? 1.1 : 0.9);
      return true;
    }
    if (id === B.BUTTON || id === B.WOOD_BUTTON) {
      editBlock(x, y, z, id + 1, f);
      this.buttons.set(posKey(x, y, z), { x, y, z, t: id === B.WOOD_BUTTON ? 1.5 : 1, mine: true });
      sfx('lever', at, 0.8, 1.4);
      return true;
    }
    if (id === B.BUTTON_ON || id === B.WOOD_BUTTON_ON) return true;
    if (id === B.TIMER || id === B.TIMER_ON) {
      const next = { 0: 1, 1: 4, 4: 5, 5: 0 }[TIMER_PERIODS[f] ? f : 0];
      editBlock(x, y, z, id, next);
      G.ui.toast('Timer: switches every ' + TIMER_PERIODS[next] + ' s');
      sfx('click', at, 1, 1);
      return true;
    }
    return false;
  },

  // ---------------------------------------------------------------- every frame ----
  update(dt) {
    const w = G.world;
    if (!w || !G.started) return;
    const was = Net.capture;
    Net.capture = false;
    try {
      // buttons pop back out (the one who pressed it shares that)
      for (const [k, b] of this.buttons) {
        b.t -= dt;
        if (b.t > 0) continue;
        this.buttons.delete(k);
        const id = w.getBlock(b.x, b.y, b.z);
        if (id !== B.BUTTON_ON && id !== B.WOOD_BUTTON_ON) continue;
        Net.capture = b.mine;
        editBlock(b.x, b.y, b.z, id - 1, w.getFacing(b.x, b.y, b.z));
        Net.capture = false;
        sfx('lever', [b.x + 0.5, b.y + 0.5, b.z + 0.5], 0.6, 1.2);
      }
      // timers
      for (const [k, t] of this.timers) {
        const id = w.getBlock(t.x, t.y, t.z);
        if (id !== B.TIMER && id !== B.TIMER_ON) { this.timers.delete(k); continue; }
        if (!w.isLoaded(t.x, t.z)) continue;
        t.t -= dt;
        if (t.t > 0) continue;
        const f = w.getFacing(t.x, t.y, t.z);
        t.t = TIMER_PERIODS[f] || 1;
        editBlock(t.x, t.y, t.z, id === B.TIMER ? B.TIMER_ON : B.TIMER, f);
        sfx('click', [t.x + 0.5, t.y + 0.5, t.z + 0.5], 0.35, id === B.TIMER ? 1.3 : 1);
      }
      // pressure plates
      this.plateT -= dt;
      if (this.plateT <= 0) { this.plateT = 0.1; this.plates(); }
      // power changes
      let n = 0;
      for (const [k, p] of this.queue) {
        this.queue.delete(k);
        this.process(p[0], p[1], p[2]);
        if (++n >= 64) break;
      }
    } finally { Net.capture = was; }
  },

  plates() {
    const w = G.world, seen = new Set();
    const feel = (pos) => {
      const x = Math.floor(pos[0]), y = Math.floor(pos[1] + 0.05), z = Math.floor(pos[2]);
      const id = w.getBlock(x, y, z);
      if (!IS_PLATE(id)) return;
      const k = posKey(x, y, z);
      seen.add(k);
      if (id === B.PLATE || id === B.WOOD_PLATE) { editBlock(x, y, z, id + 1, 0); sfx('lever', [x + 0.5, y, z + 0.5], 0.7, 0.8); }
      this.platesOn.set(k, { x, y, z, t: 0.4 });
    };
    if (!G.stats.dead && !G.vehicle) feel(G.player.pos);
    for (const m of Ents.mobs) if (!m.dead) feel(m.pos);
    for (const r of Net.peers.values()) if (!r.jet) feel(r.pos);
    for (const [k, p] of this.platesOn) {
      if (seen.has(k)) continue;
      p.t -= 0.1;
      if (p.t > 0) continue;
      this.platesOn.delete(k);
      const id = w.getBlock(p.x, p.y, p.z);
      if (id === B.PLATE_ON || id === B.WOOD_PLATE_ON) { editBlock(p.x, p.y, p.z, id - 1, 0); sfx('lever', [p.x + 0.5, p.y, p.z + 0.5], 0.6, 0.7); }
    }
  },

  // ---------------------------------------------------------------- power ----
  // The block a lever / button hangs on or a plate lies on (it passes their power on).
  attachOf(id, x, y, z) {
    const w = G.world;
    if (IS_MOUNTED(id)) {
      const f = w.getFacing(x, y, z);
      if (f & 8) return [x, y - 1, z];
      const d = FACE_DIR[f & 7] || [0, 0, -1];
      return [x + d[0], y, z + d[2]];
    }
    if (IS_PLATE(id)) return [x, y - 1, z];
    return null;
  },
  // A solid block that a lit source is fixed to.
  strongly(x, y, z) {
    const w = G.world;
    if (!BLOCK_SOLID[w.getBlock(x, y, z)]) return false;
    for (const [dx, dy, dz] of N6) {
      const sx = x + dx, sy = y + dy, sz = z + dz, id = w.getBlock(sx, sy, sz);
      if (!MECH_SOURCE[id] || !(IS_MOUNTED(id) || IS_PLATE(id))) continue;
      const a = this.attachOf(id, sx, sy, sz);
      if (a && a[0] === x && a[1] === y && a[2] === z) return true;
    }
    return false;
  },
  // Power reaching a cell from its neighbours (skip: a cell not to count, like a piston's face).
  powered(x, y, z, skip, viaWire = true) {
    const w = G.world;
    for (const [dx, dy, dz] of N6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (skip && skip[0] === nx && skip[1] === ny && skip[2] === nz) continue;
      const id = w.getBlock(nx, ny, nz);
      if (MECH_SOURCE[id]) return true;
      if (viaWire && id === B.WIRE_ON) return true;
      if (BLOCK_SOLID[id] && !MECH_ANY[id] && this.strongly(nx, ny, nz)) return true;
    }
    return false;
  },

  // Wire joined to the wire at x, y, z (flat, or one block up or down a step).
  wireLinks(x, y, z) {
    const w = G.world, out = [];
    const upFree = !BLOCK_OPAQUE[w.getBlock(x, y + 1, z)];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (IS_WIRE(w.getBlock(x + dx, y, z + dz))) out.push([x + dx, y, z + dz]);
      if (upFree && IS_WIRE(w.getBlock(x + dx, y + 1, z + dz))) out.push([x + dx, y + 1, z + dz]);
      if (!BLOCK_OPAQUE[w.getBlock(x + dx, y, z + dz)] && IS_WIRE(w.getBlock(x + dx, y - 1, z + dz))) out.push([x + dx, y - 1, z + dz]);
    }
    return out;
  },

  // Relight a whole stretch of wire: distance from the powered ends, lit up to 15.
  wireNet(x, y, z, consumers) {
    const w = G.world;
    const cells = new Map(), list = [];
    const add = (p) => { const k = posKey(p[0], p[1], p[2]); if (!cells.has(k)) { cells.set(k, p); list.push(p); } };
    add([x, y, z]);
    for (let i = 0; i < list.length && list.length < 600; i++) for (const q of this.wireLinks(...list[i])) add(q);
    const dist = new Map(), front = [];
    for (const [k, p] of cells) if (this.powered(p[0], p[1], p[2], null, false)) { dist.set(k, 0); front.push(p); }
    for (let i = 0; i < front.length; i++) {
      const p = front[i], d = dist.get(posKey(p[0], p[1], p[2]));
      if (d >= 15) continue;
      for (const q of this.wireLinks(...p)) {
        const k = posKey(q[0], q[1], q[2]);
        if (!cells.has(k) || dist.has(k)) continue;
        dist.set(k, d + 1); front.push(q);
      }
    }
    for (const [k, p] of cells) {
      const want = dist.has(k) ? B.WIRE_ON : B.WIRE;
      if (w.getBlock(p[0], p[1], p[2]) !== want) editBlock(p[0], p[1], p[2], want, 0);
      for (const [dx, dy, dz] of N6) consumers.push([p[0] + dx, p[1] + dy, p[2] + dz]);
    }
    return cells.keys();
  },

  process(x, y, z) {
    const w = G.world;
    if (!w.isLoaded(x, z)) return;
    const id0 = w.getBlock(x, y, z);
    if (id0 === B.TIMER || id0 === B.TIMER_ON) {
      const k = posKey(x, y, z);
      if (!this.timers.has(k)) this.timers.set(k, { x, y, z, t: TIMER_PERIODS[w.getFacing(x, y, z)] || 1 });
    }
    if ((id0 === B.BUTTON_ON || id0 === B.WOOD_BUTTON_ON) && !this.buttons.has(posKey(x, y, z))) this.buttons.set(posKey(x, y, z), { x, y, z, t: 1, mine: false });
    // everything within two cells, plus the wire those touch
    const cand = [], wires = [];
    for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 3) continue;
      const p = [x + dx, y + dy, z + dz], id = w.getBlock(p[0], p[1], p[2]);
      if (!MECH_ANY[id]) continue;
      (IS_WIRE(id) ? wires : cand).push(p);
    }
    const done = new Set();
    for (const p of wires) {
      if (done.has(posKey(p[0], p[1], p[2]))) continue;
      for (const k of this.wireNet(p[0], p[1], p[2], cand)) done.add(k);
    }
    const seen = new Set();
    for (const p of cand) {
      const k = posKey(p[0], p[1], p[2]);
      if (seen.has(k)) continue;
      seen.add(k);
      this.consumer(p[0], p[1], p[2]);
    }
    // a mounted piece or plate falls off when what holds it goes
    if (IS_MOUNTED(id0) && !canStay(id0, x, y, z)) destroyBlock(x, y, z);
    for (const [dx, dy, dz] of N6) {
      const nx = x + dx, ny = y + dy, nz = z + dz, id = w.getBlock(nx, ny, nz);
      if (IS_MOUNTED(id) && !canStay(id, nx, ny, nz)) destroyBlock(nx, ny, nz);
    }
  },

  consumer(x, y, z) {
    const w = G.world;
    const id = w.getBlock(x, y, z);
    if (id === B.SIGNAL_LAMP || id === B.SIGNAL_LAMP_ON) {
      const want = this.powered(x, y, z) ? B.SIGNAL_LAMP_ON : B.SIGNAL_LAMP;
      if (want !== id) editBlock(x, y, z, want);
      return;
    }
    if (id === B.TNT) { if (this.powered(x, y, z)) igniteTNT(x, y, z); return; }
    if (DOOR_IDS.has(id) || id === B.TRAPDOOR || id === B.TRAPDOOR_OPEN) {
      const trap = id === B.TRAPDOOR || id === B.TRAPDOOR_OPEN;
      const by = !trap && isDoorTop(id) ? y - 1 : y;
      const on = this.powered(x, by, z) || (!trap && this.powered(x, by + 1, z));
      const k = posKey(x, by, z), prev = this.last.get(k);
      this.last.set(k, on);
      if (prev === on || (prev === undefined && !on)) return;
      const open = trap ? id === B.TRAPDOOR_OPEN : isOpenDoor(w.getBlock(x, by, z));
      if (open !== on) toggleDoor(x, by, z);
      return;
    }
    if (IS_PISTON(id) || IS_PISTON_EXT(id)) {
      const f = w.getFacing(x, y, z), d = PISTON_DIRS[f] || [0, 0, -1];
      const face = [x + d[0], y + d[1], z + d[2]];
      const on = this.powered(x, y, z, face);
      const sticky = id === B.STICKY_PISTON || id === B.STICKY_PISTON_ON;
      if (IS_PISTON(id) && on) this.extend(x, y, z, f, d, sticky);
      else if (IS_PISTON_EXT(id)) {
        const head = w.getBlock(face[0], face[1], face[2]);
        if (!IS_HEAD(head)) editBlock(x, y, z, sticky ? B.STICKY_PISTON : B.PISTON, f);
        else if (!on) this.retract(x, y, z, f, d, sticky);
      }
      return;
    }
    if (IS_HEAD(id)) {
      // a head without its piston goes
      const f = w.getFacing(x, y, z), d = PISTON_DIRS[f] || [0, 0, -1];
      const base = w.getBlock(x - d[0], y - d[1], z - d[2]);
      if (!IS_PISTON_EXT(base)) editBlock(x, y, z, B.AIR);
    }
  },

  extend(x, y, z, f, d, sticky) {
    const w = G.world, line = [];
    for (let i = 1; ; i++) {
      const px = x + d[0] * i, py = y + d[1] * i, pz = z + d[2] * i;
      if (py < 0 || py >= CH || !w.isLoaded(px, pz)) return false;
      const id = w.getBlock(px, py, pz);
      if (id === B.AIR || BLOCK_REPLACE[id]) break;
      if (PISTON_IMMOVABLE.has(id) || IS_PISTON_EXT(id) || i > PISTON_PUSH) return false;
      line.push([px, py, pz, id, w.getFacing(px, py, pz)]);
    }
    const edits = [];
    for (let j = line.length - 1; j >= 0; j--) {
      const b = line[j];
      edits.push([b[0] + d[0], b[1] + d[1], b[2] + d[2], b[3], b[4]]);
    }
    edits.push([x + d[0], y + d[1], z + d[2], sticky ? B.STICKY_HEAD : B.PISTON_HEAD, f]);
    edits.push([x, y, z, sticky ? B.STICKY_PISTON_ON : B.PISTON_ON, f]);
    editBlocks(edits);
    this.shove(x, y, z, d, line.length + 1);
    sfx('piston', [x + 0.5, y + 0.5, z + 0.5], 1, 1);
    for (const e of edits) this.queue.set(posKey(e[0], e[1], e[2]), [e[0], e[1], e[2]]);
    return true;
  },

  retract(x, y, z, f, d, sticky) {
    const w = G.world;
    const hx = x + d[0], hy = y + d[1], hz = z + d[2];
    const edits = [[hx, hy, hz, B.AIR], [x, y, z, sticky ? B.STICKY_PISTON : B.PISTON, f]];
    if (sticky) {
      const bx = hx + d[0], by = hy + d[1], bz = hz + d[2], id = w.getBlock(bx, by, bz);
      if (id !== B.AIR && !BLOCK_REPLACE[id] && !PISTON_IMMOVABLE.has(id) && !IS_PISTON_EXT(id)) {
        edits[0] = [hx, hy, hz, id, w.getFacing(bx, by, bz)];
        edits.push([bx, by, bz, B.AIR]);
      }
    }
    editBlocks(edits);
    sfx('piston', [x + 0.5, y + 0.5, z + 0.5], 0.9, 0.8);
    for (const e of edits) this.queue.set(posKey(e[0], e[1], e[2]), [e[0], e[1], e[2]]);
  },

  // Players and mobs in the cells a piston just filled get pushed along.
  shove(x, y, z, d, n) {
    const hit = (pos, hw, h) => {
      for (let i = 1; i <= n; i++) {
        const cx = x + d[0] * i, cy = y + d[1] * i, cz = z + d[2] * i;
        if (pos[0] + hw > cx && pos[0] - hw < cx + 1 && pos[2] + hw > cz && pos[2] - hw < cz + 1 && pos[1] + h > cy && pos[1] < cy + 1) return true;
      }
      return false;
    };
    const push = (e, hw, h) => {
      if (!hit(e.pos, hw, h)) return;
      e.pos[0] += d[0] * 1.02; e.pos[1] += d[1] * 1.02 + (d[1] > 0 ? 0.05 : 0); e.pos[2] += d[2] * 1.02;
      if (e.vel) { e.vel[0] += d[0] * 3; e.vel[1] += Math.max(0, d[1]) * 4; e.vel[2] += d[2] * 3; }
    };
    push(G.player, PLAYER_HALF_W, 1.8);
    for (const m of Ents.mobs) if (!m.dead) push(m, m.hw || 0.3, m.h || 1);
  },
};

// ---------------------------------------------------------------- sounds ----
SYNTH.lever = (ctx, o, t, p) => {
  Sound.tone(ctx, o, t, 0.04, { wave: 'square', f0: 900 * p, f1: 500 * p, gain: 0.12, filter: ['lowpass', 2500, 1] });
  Sound.noise(ctx, o, t, 0.05, { type: 'bandpass', freq: 2400 * p, q: 3, gain: 0.3 });
};
SYNTH.piston = (ctx, o, t, p) => {
  Sound.noise(ctx, o, t, 0.22, { type: 'bandpass', freq: 500 * p, freqEnd: 1600 * p, q: 1.5, gain: 0.45 });
  Sound.tone(ctx, o, t + 0.12, 0.12, { wave: 'triangle', f0: 180 * p, f1: 90 * p, gain: 0.35 });
};

// ---------------------------------------------------------------- textures ----
const SIG_OFF = [62, 86, 92], SIG_ON = [90, 236, 246];
gen('lever_stick', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [132, 98, 58], (x & 3 ? 1 : 0.85) * (0.9 + rng() * 0.12))), { smooth: 0.4, bump: 1 });
gen('lever_knob', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [70, 90, 98], 0.9 + rng() * 0.15)), { smooth: 0.7, bump: 0.6 });
gen('lever_knob_on', (d, rng, ctx) => fillTile(d, (x, y, k) => { put(d, x, y, SIG_ON, 0.9 + rng() * 0.12); ctx.emit[k] = 0.9; }), { smooth: 0.7, bump: 0.4 });
gen('wire', (d, rng) => fillTile(d, (x, y) => put(d, x, y, SIG_OFF, (0.8 + rng() * 0.3) * ((x + y) % 5 ? 1 : 0.8))), { smooth: 0.5, bump: 0.6 });
gen('wire_on', (d, rng, ctx) => fillTile(d, (x, y, k) => { const s = (x + y) % 5 ? 1 : 1.15; put(d, x, y, SIG_ON, (0.85 + rng() * 0.2) * s); ctx.emit[k] = 0.95; }), { smooth: 0.5, bump: 0.4 });
function lampTile(on) {
  return (d, rng, ctx) => fillTile(d, (x, y, k) => {
    const frame = x < 3 || y < 3 || x > 28 || y > 28;
    const bar = !frame && (x % 9 === 3 || y % 9 === 3);
    if (frame) { put(d, x, y, [92, 84, 72], (x < 1 || y < 1 ? 1.2 : x > 30 || y > 30 ? 0.7 : 1) * (0.9 + rng() * 0.1)); return; }
    if (bar) { put(d, x, y, on ? [180, 150, 90] : [74, 68, 60], 0.9 + rng() * 0.1); if (on) ctx.emit[k] = 0.5; return; }
    const cx = x - 15.5, cy = y - 15.5, r = Math.hypot(cx, cy) / 16;
    if (on) { put(d, x, y, [255, 214 - r * 50, 120 - r * 60], 1.05 - r * 0.2 + rng() * 0.05); ctx.emit[k] = 1; }
    else put(d, x, y, [70, 60, 48], 0.85 + rng() * 0.15 + (r < 0.3 ? 0.2 : 0));
  });
}
gen('lamp_off', lampTile(false), { smooth: 0.6, bump: 1.2 });
gen('lamp_on', lampTile(true), { smooth: 0.6, bump: 0.8 });
gen('piston_side', (d, rng) => fillTile(d, (x, y) => {
  // stone body with a wooden band at the face end (top of the tile)
  if (y < 8) { put(d, x, y, [150, 118, 76], (y === 0 ? 1.2 : y === 7 ? 0.72 : 1) * ((x & 7) === 0 ? 0.82 : 1) * (0.9 + rng() * 0.12)); return; }
  put(d, x, y, [118, 118, 116], (y === 8 ? 1.15 : 1) * (x === 0 || x === 31 ? 0.8 : 1) * (0.86 + rng() * 0.16));
}), { smooth: 0.3, bump: 1.4 });
function pistonFace(ring) {
  return (d, rng) => fillTile(d, (x, y) => {
    const edge = x < 2 || y < 2 || x > 29 || y > 29;
    if (edge) { put(d, x, y, [120, 120, 118], 0.9 + rng() * 0.1); return; }
    const cx = x - 15.5, cy = y - 15.5;
    if (ring && Math.hypot(cx, cy) < 11) { put(d, x, y, [120, 170, 70], 0.85 + rng() * 0.25); return; }
    put(d, x, y, [160, 126, 82], ((y & 7) === 0 ? 0.78 : 1) * (0.9 + rng() * 0.12));
  });
}
gen('piston_face', pistonFace(false), { smooth: 0.3, bump: 1.2 });
gen('sticky_face', pistonFace(true), { smooth: 0.5, bump: 1 });
gen('piston_rod', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [178, 170, 150], (x % 4 === 0 ? 0.85 : 1.05) * (0.9 + rng() * 0.1))), { smooth: 0.6, bump: 0.8 });
function timerTile(top, on) {
  return (d, rng, ctx) => fillTile(d, (x, y, k) => {
    const edge = x < 2 || y < 2 || x > 29 || y > 29;
    if (edge) { put(d, x, y, [110, 110, 112], 0.9 + rng() * 0.1); return; }
    if (!top) {
      const lit = y > 12 && y < 19 && x > 6 && x < 25;
      if (lit) { put(d, x, y, on ? SIG_ON : SIG_OFF, 0.9 + rng() * 0.1); if (on) ctx.emit[k] = 0.8; return; }
      put(d, x, y, [150, 150, 150], 0.86 + rng() * 0.14);
      return;
    }
    const cx = x - 15.5, cy = y - 15.5, r = Math.hypot(cx, cy);
    if (r < 12) {
      const hand = (Math.abs(cx) < 1.2 && cy < 0 && cy > -10) || (Math.abs(cy) < 1.2 && cx > 0 && cx < 7);
      const tick = r > 9.5 && Math.abs(Math.atan2(cy, cx) * 6 / Math.PI % 1) < 0.12;
      put(d, x, y, hand ? [30, 34, 40] : tick ? [70, 80, 90] : on ? [200, 250, 252] : [226, 222, 208], 0.95 + rng() * 0.05);
      if (on && !hand) ctx.emit[k] = 0.6;
      return;
    }
    put(d, x, y, [150, 150, 150], 0.86 + rng() * 0.14);
  });
}
gen('timer_top', timerTile(true, false), { smooth: 0.7, bump: 0.8 });
gen('timer_top_on', timerTile(true, true), { smooth: 0.7, bump: 0.8 });
gen('timer_side', timerTile(false, false), { smooth: 0.4, bump: 1 });
gen('timer_side_on', timerTile(false, true), { smooth: 0.4, bump: 1 });
gen('signal_block', (d, rng, ctx) => fillTile(d, (x, y, k) => {
  const trace = (x % 8 === 3 && y % 16 < 12) || (y % 8 === 5 && x % 16 > 4) || (x % 8 === 3 && y % 8 === 5);
  if (trace) { put(d, x, y, SIG_ON, 0.9 + rng() * 0.15); ctx.emit[k] = 0.7; return; }
  put(d, x, y, [40, 64, 72], (x === 0 || y === 0 ? 1.25 : x === 31 || y === 31 ? 0.7 : 1) * (0.85 + rng() * 0.15));
}), { smooth: 0.7, bump: 1 });

// ---------------------------------------------------------------- recipes and drops ----
shaped(B.LEVER, 1, ['S', 'C'], { S: I.STICK, C: B.COBBLE });
shaped(B.BUTTON, 1, ['S'], { S: B.STONE });
shaped(B.WOOD_BUTTON, 1, ['P'], { P: TAG.planks });
shaped(B.PLATE, 1, ['SS'], { S: B.STONE });
shaped(B.WOOD_PLATE, 1, ['PP'], { P: TAG.planks });
shaped(B.WIRE, 16, ['GGG'], { G: I.GOLD_INGOT });
shaped(B.SIGNAL_LAMP, 1, [' G ', 'GLG', ' W '], { G: B.GLASS, L: B.GLOWSTONE, W: B.WIRE });
shaped(B.PISTON, 1, ['PPP', 'CIC', 'CWC'], { P: TAG.planks, C: B.COBBLE, I: I.IRON_INGOT, W: B.WIRE });
shaped(B.STICKY_PISTON, 1, ['H', 'P'], { H: B.HONEYCOMB, P: B.PISTON });
shaped(B.TIMER, 1, ['CWC', 'WIW', 'CWC'], { C: B.COBBLE, W: B.WIRE, I: I.IRON_INGOT });
shaped(B.SIGNAL_BLOCK, 1, ['WWW', 'WWW', 'WWW'], { W: B.WIRE });
{
  const base = blockDrops;
  const off = {
    [B.LEVER_ON]: B.LEVER, [B.BUTTON_ON]: B.BUTTON, [B.WOOD_BUTTON_ON]: B.WOOD_BUTTON, [B.PLATE_ON]: B.PLATE, [B.WOOD_PLATE_ON]: B.WOOD_PLATE,
    [B.WIRE_ON]: B.WIRE, [B.SIGNAL_LAMP_ON]: B.SIGNAL_LAMP, [B.PISTON_ON]: B.PISTON, [B.STICKY_PISTON_ON]: B.STICKY_PISTON, [B.TIMER_ON]: B.TIMER,
  };
  // eslint-disable-next-line no-global-assign
  blockDrops = function (id, toolItem, rnd) {
    if (IS_HEAD(id)) return [];
    if (off[id]) return [[off[id], 1]];
    if (MECH_ANY[id] && MECH_JOIN[id] && id !== B.TNT && !DOOR_IDS.has(id) && id !== B.TRAPDOOR && id !== B.TRAPDOOR_OPEN) return [[id, 1]];
    return base(id, toolItem, rnd);
  };
}
