'use strict';
// Felling trees: chop the first log of a natural tree and the whole tree comes down, log by log
// from the cut upwards, with its leaves after it; the wood (and now and then a sapling or an
// apple from the leaves) goes straight into your inventory. Sneak to cut a single log. Player
// built log walls are left alone: only logs the world grew, with leaves on them, count as a tree.
// Online the felling is one op ('t') and every player replays it, like explosions.

const TREE_LOGS = new Set([B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.PALM_LOG, B.DARK_OAK_LOG, B.CHERRY_LOG, B.ACACIA_LOG, B.CRIMSON_STEM, B.WARPED_STEM]);
const TREE_LEAVES = new Set([B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.PALM_LEAVES, B.DARK_OAK_LEAVES, B.CHERRY_LEAVES, B.ACACIA_LEAVES,
  B.NETHER_WART_BLOCK, B.WARPED_WART_BLOCK, B.SHROOMLIGHT]);
const TREE_SAPLING = {
  [B.LEAVES]: B.OAK_SAPLING, [B.BIRCH_LEAVES]: B.BIRCH_SAPLING, [B.SPRUCE_LEAVES]: B.SPRUCE_SAPLING, [B.DARK_OAK_LEAVES]: B.DARK_OAK_SAPLING,
  [B.CHERRY_LEAVES]: B.CHERRY_SAPLING, [B.ACACIA_LEAVES]: B.ACACIA_SAPLING,
};
const TREE_MAX_LOGS = 260;

const Lumber = {
  jobs: [],

  // did a player put this block here (a saved edit) rather than the world growing it?
  placed(x, y, z, id) {
    const e = G.world.edits.get(chunkKey(x >> 4, z >> 4));
    return !!(e && e.get(blockIndex(x & 15, y, z & 15)) === id);
  },

  // The logs of the tree a log at (x, y, z) belonged to (that log already cut), bottom first, or
  // null when it is not a natural tree.
  treeAbove(x, y, z) {
    const w = G.world, seen = new Set(), logs = [], stack = [];
    const push = (a, b, c) => {
      const k = posKey(a, b, c);
      if (seen.has(k) || b < y || Math.abs(a - x) > 10 || Math.abs(c - z) > 10) return;
      seen.add(k);
      if (TREE_LOGS.has(w.getBlock(a, b, c))) stack.push([a, b, c]);
    };
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) if (dx || dy || dz) push(x + dx, y + dy, z + dz);
    while (stack.length && logs.length < TREE_MAX_LOGS) {
      const [a, b, c] = stack.pop();
      if (this.placed(a, b, c, w.getBlock(a, b, c))) return null;
      logs.push([a, b, c]);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) if (dx || dy || dz) push(a + dx, b + dy, c + dz);
    }
    if (!logs.length) return null;
    // a real tree wears leaves
    let leaves = 0;
    for (const [a, b, c] of logs) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) if (TREE_LEAVES.has(w.getBlock(a + dx, b + dy, c + dz))) leaves++;
      if (leaves >= 3) break;
    }
    if (leaves < 3) return null;
    logs.sort((p, q) => p[1] - q[1] || Math.hypot(p[0] - x, p[2] - z) - Math.hypot(q[0] - x, q[2] - z));
    return logs;
  },

  // Leaves that are left hanging once the logs are gone: near the fallen tree, no log within 4.
  looseLeaves(logs) {
    const w = G.world;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [a, b, c] of logs) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); z0 = Math.min(z0, c); z1 = Math.max(z1, c); }
    const out = [];
    for (let a = x0 - 4; a <= x1 + 4; a++) for (let c = z0 - 4; c <= z1 + 4; c++) for (let b = y0 - 1; b <= y1 + 4; b++) {
      const id = w.getBlock(a, b, c);
      if (!TREE_LEAVES.has(id) || this.placed(a, b, c, id)) continue;
      let held = false;
      for (let dx = -4; dx <= 4 && !held; dx++) for (let dz = -4; dz <= 4 && !held; dz++) for (let dy = -4; dy <= 4 && !held; dy++) {
        const q = w.getBlock(a + dx, b + dy, c + dz);
        if (TREE_LOGS.has(q) && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 5) held = true;
      }
      if (!held) out.push([a, b, c, id]);
    }
    return out;
  },

  // Start felling from a cut at (x, y, z); mine: this player chopped it (gets the wood)
  fell(x, y, z, mine) {
    const logs = this.treeAbove(x, y, z);
    if (!logs) return false;
    const from = mine ? G.player.pos.slice() : [x + 0.5 + (hash3(x, y, z, 1) - 0.5), y, z + 0.5 + (hash3(x, y, z, 2) - 0.5)];
    this.jobs.push({ x, y, z, logs, i: 0, t: 0.12, mine, leaves: null, li: 0, wood: 0, from });
    sfx('timber', [x + 0.5, y + 1.5, z + 0.5], 1, rand(0.9, 1.05));
    if (mine && Net.on) Net.op(['t', x, y, z]);
    return true;
  },

  give(id, n, at) {
    if (G.mode !== 'survival' || n <= 0) return;
    const left = G.inv.add(mkStack(id, n));
    if (left > 0) Ents.spawnItem({ id, count: left }, at[0], at[1], at[2]);
    G.ui.invDirty();
  },

  update(dt) {
    if (!this.jobs.length || !G.world) return;
    const j = this.jobs[0];
    j.t -= dt;
    // slow frames still fell at the same pace
    for (let n = 0; n < 4 && j.t <= 0 && this.jobs[0] === j; n++) { j.t += 0.045; this.step(j); }
  },

  step(j) {
    const was = Net.capture, cloud = Net.cloudOnly;
    Net.capture = false; Net.cloudOnly = j.mine;       // everyone replays it; the cloud keeps the chopper's copy
    try {
      if (j.i < j.logs.length) {
        // one layer of logs per step, so the trunk comes down from the cut up
        const y = j.logs[j.i][1];
        let n = 0;
        while (j.i < j.logs.length && j.logs[j.i][1] === y) {
          const [a, b, c] = j.logs[j.i++];
          const id = G.world.getBlock(a, b, c);
          if (!TREE_LOGS.has(id)) continue;
          destroyBlock(a, b, c, { drops: false, silent: n++ > 1 });
          if (b > j.y && typeof Physics !== 'undefined') Physics.topple(a, b, c, id, j.from, b - j.y);
          if (j.mine) this.give(id === B.CRIMSON_STEM || id === B.WARPED_STEM ? id : id, 1, G.player.pos);
          j.wood++;
        }
        if (j.i >= j.logs.length) { j.leaves = this.looseLeaves(j.logs); G.shake = Math.max(G.shake || 0, 0.25); sfx('land', [j.x + 0.5, j.y + 1, j.z + 0.5], 1, 0.6); }
        return;
      }
      // then the leaves, a handful at a time
      for (let k = 0; k < 24 && j.li < j.leaves.length; k++) {
        const [a, b, c, id] = j.leaves[j.li++];
        if (G.world.getBlock(a, b, c) !== id) continue;
        destroyBlock(a, b, c, { drops: false, silent: k % 6 !== 0 });
        if (j.mine) {
          const r = hash3(a, b, c, 77);
          if (r < 0.05 && TREE_SAPLING[id]) this.give(TREE_SAPLING[id], 1, G.player.pos);
          else if (r > 0.985 && id === B.LEAVES) this.give(I.APPLE, 1, G.player.pos);
        }
      }
      if (j.li >= j.leaves.length) {
        this.jobs.shift();
        if (j.mine && G.mode === 'survival') {
          // the axe wears a little for the whole tree
          const d = ITEM_DEF[Act.heldId()];
          if (d && d.dur && d.tool === TOOL_AXE && G.inv.damageHeld(Math.ceil(j.wood / 3))) sfx('tool_break', null, 0.8, 1);
          G.ui.invDirty();
          if (j.wood > 1) G.ui.toast('🪵 +' + (j.wood + 1) + ' wood');
        }
      }
    } finally { Net.capture = was; Net.cloudOnly = cloud; }
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const finish = Act.finishBreak;
  Act.finishBreak = function (x, y, z, id) {
    finish.call(this, x, y, z, id);
    if (TREE_LOGS.has(id) && !G.player.sneaking && !Lumber.placed(x, y, z, id)) Lumber.fell(x, y, z, true);
  };
  const ap = Net.applyOp;
  Net.applyOp = function (r, o) {
    if (o[1] === 't') {
      const [x, y, z] = [o[2], o[3], o[4]].map(Number);
      if ([x, y, z].every(Number.isInteger) && G.world.isLoaded(x, z)) Lumber.fell(x, y, z, false);
      return;
    }
    return ap.call(this, r, o);
  };
}

// a creak and a crash
SYNTH.timber = (ctx, o, t, p) => {
  Sound.tone(ctx, o, t, 0.9, { wave: 'sawtooth', f0: 140 * p, f1: 70 * p, vib: [9, 14], filter: ['bandpass', 420, 3], gain: 0.22, attack: 0.1 });
  Sound.noise(ctx, o, t + 0.75, 0.9, { type: 'lowpass', freq: 900, freqEnd: 180, gain: 0.55 });
  Sound.noise(ctx, o, t + 0.8, 0.6, { type: 'bandpass', freq: 2600, q: 0.8, gain: 0.18 });
};
