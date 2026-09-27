'use strict';
// Automatic sliding doors (blocks in mech_blocks.js): a glass leaf in an aluminium frame that
// slides open with a soft whoosh when anyone comes near (you, other players online, villagers,
// animals, monsters too) and closes again a moment after the last one has gone through. Like the
// power of mechanisms, opening and closing is worked out on every player's machine from where
// everyone stands, so those edits are not sent online.

const ADOOR_IDS = new Set([B.AUTO_DOOR, B.AUTO_DOOR_TOP, B.AUTO_DOOR_OPEN, B.AUTO_DOOR_OPEN_TOP]);
const isADoorTop = (id) => id === B.AUTO_DOOR_TOP || id === B.AUTO_DOOR_OPEN_TOP;
const ADOOR_REACH = 2.7, ADOOR_HOLD = 0.9;

const AutoDoor = {
  open: new Map(),   // posKey of the lower half -> { x, y, z, idle }
  t: 0,

  reset() { this.open.clear(); },

  // feet positions of everyone who can walk through
  walkers() {
    const p = G.player, out = [];
    if (!G.vehicle) out.push(p.pos);
    for (const r of Net.peers.values()) if (r.pos) out.push(r.pos);
    for (const m of Ents.mobs) {
      if (m.dead || m.removed || m.type === 'wyrm') continue;
      if (Math.abs(m.pos[0] - p.pos[0]) > 48 || Math.abs(m.pos[2] - p.pos[2]) > 48) continue;
      out.push(m.pos);
    }
    return out;
  },

  update(dt) {
    const w = G.world;
    if (!w || !G.started || G.onTitle) return;
    this.t -= dt;
    if (this.t > 0) return;
    const step = 0.1 - this.t;
    this.t = 0.1;
    const who = this.walkers();
    // doors near someone open (and ones found open, e.g. from a save, are looked after)
    for (const q of who) {
      const fx = Math.floor(q[0]), fy = Math.floor(q[1] + 0.2), fz = Math.floor(q[2]);
      for (let x = fx - 3; x <= fx + 3; x++) for (let z = fz - 3; z <= fz + 3; z++) for (let y = fy - 1; y <= fy + 1; y++) {
        const id = w.getBlock(x, y, z);
        if (id !== B.AUTO_DOOR && id !== B.AUTO_DOOR_OPEN) continue;
        if (id === B.AUTO_DOOR_OPEN) { if (!this.open.has(posKey(x, y, z))) this.open.set(posKey(x, y, z), { x, y, z, idle: 0 }); continue; }
        if (Math.hypot(q[0] - x - 0.5, q[2] - z - 0.5) <= ADOOR_REACH && q[1] > y - 1.2 && q[1] < y + 1.6) this.setOpen(x, y, z, true);
      }
    }
    // open doors close a little after the last one has left (never onto someone)
    for (const [k, e] of this.open) {
      const id = w.getBlock(e.x, e.y, e.z);
      if (id !== B.AUTO_DOOR_OPEN) { this.open.delete(k); continue; }
      const near = who.some((q) => Math.hypot(q[0] - e.x - 0.5, q[2] - e.z - 0.5) <= ADOOR_REACH + 0.3 && q[1] > e.y - 1.4 && q[1] < e.y + 1.8);
      e.idle = near ? 0 : e.idle + step;
      if (e.idle >= ADOOR_HOLD && !Act.entityBlocks(e.x, e.y, e.z, 2)) this.setOpen(e.x, e.y, e.z, false);
    }
  },

  setOpen(x, y, z, open) {
    const w = G.world, f = w.getFacing(x, y, z);
    const edits = [[x, y, z, open ? B.AUTO_DOOR_OPEN : B.AUTO_DOOR, f]];
    if (ADOOR_IDS.has(w.getBlock(x, y + 1, z))) edits.push([x, y + 1, z, open ? B.AUTO_DOOR_OPEN_TOP : B.AUTO_DOOR_TOP, w.getFacing(x, y + 1, z)]);
    const was = Net.capture;
    Net.capture = false;
    try { editBlocks(edits); } finally { Net.capture = was; }
    if (open) this.open.set(posKey(x, y, z), { x, y, z, idle: 0 });
    else this.open.delete(posKey(x, y, z));
    // double doors are heard once
    const k = Math.floor(x / 2) + ',' + y + ',' + Math.floor(z / 2) + (open ? 'o' : 'c');
    const now = performance.now();
    if (this.lastSnd !== k || now - (this.lastT || 0) > 400) sfx(open ? 'adoor_open' : 'adoor_close', [x + 0.5, y + 1, z + 0.5], 0.9, 0.95 + Math.random() * 0.1);
    this.lastSnd = k; this.lastT = now;
  },

  // side of the cell where the jamb stands for a facing ([dx, dz])
  jambDir(f) {
    const b = shapeGeom(SH_ADOOR_OPEN, f).boxes[0];
    const cx = (b[0] + b[3]) / 2 - 8, cz = (b[2] + b[5]) / 2 - 8;
    return [Math.sign(Math.round(cx)), Math.sign(Math.round(cz))];
  },

  // Placing one: two blocks tall, the leaf across the way you look; next to another automatic
  // door they become a pair that parts from the middle.
  place(hit) {
    const w = G.world;
    let [x, y, z] = hit.pos;
    const n = hit.normal;
    if (!BLOCK_REPLACE[hit.id]) { x += n[0]; y += n[1]; z += n[2]; }
    if (y < 1 || y + 1 >= CH) return false;
    if (!BLOCK_REPLACE[w.getBlock(x, y, z)] || !BLOCK_REPLACE[w.getBlock(x, y + 1, z)] || !BLOCK_SOLID[w.getBlock(x, y - 1, z)]) return false;
    if (Act.entityBlocks(x, y, z, 2)) return false;
    const lk = G.player.lookDir();
    let f = Math.abs(lk[0]) > Math.abs(lk[2]) ? (lk[0] > 0 ? 0 : 1) : (lk[2] > 0 ? 4 : 5);
    const along = f === 4 || f === 5 ? [1, 0] : [0, 1];
    const edits = [];
    for (const s of [1, -1]) {
      const px = x + along[0] * s, pz = z + along[1] * s, pid = w.getBlock(px, y, pz);
      if (pid !== B.AUTO_DOOR) continue;
      // our jamb away from the partner, the partner's away from us
      const pf = w.getFacing(px, y, pz) & 7;
      if ((pf === 4 || pf === 5) !== (f === 4 || f === 5)) continue;
      const j = this.jambDir(f);
      if (j[0] === along[0] * s && j[1] === along[1] * s) f ^= 8;
      let qf = pf;
      const jq = this.jambDir(qf);
      if (jq[0] === -along[0] * s && jq[1] === -along[1] * s) qf ^= 8;
      edits.push([px, y, pz, B.AUTO_DOOR, qf]);
      if (w.getBlock(px, y + 1, pz) === B.AUTO_DOOR_TOP) edits.push([px, y + 1, pz, B.AUTO_DOOR_TOP, qf]);
      break;
    }
    edits.push([x, y, z, B.AUTO_DOOR, f], [x, y + 1, z, B.AUTO_DOOR_TOP, f]);
    editBlocks(edits);
    sfx('place_' + BLOCK_SOUND[B.AUTO_DOOR], [x + 0.5, y + 0.5, z + 0.5], 1, 0.9);
    Act.consume(); Act.swingHand();
    return true;
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const place = Act.placeBlock;
  Act.placeBlock = function (hit) {
    const held = G.inv.held, d = held && ITEM_DEF[held.id];
    if (d && d.block === B.AUTO_DOOR) return AutoDoor.place(hit);
    return place.call(this, hit);
  };
  // the other half goes with it
  const destroy = destroyBlock;
  // eslint-disable-next-line no-global-assign
  destroyBlock = function (x, y, z, opts) {
    const w = G.world, id = w && w.getBlock(x, y, z);
    if (id && ADOOR_IDS.has(id)) {
      const oy = isADoorTop(id) ? y - 1 : y + 1;
      if (ADOOR_IDS.has(w.getBlock(x, oy, z))) editBlock(x, oy, z, B.AIR);
    }
    return destroy.call(this, x, y, z, opts);
  };
  const drops = blockDrops;
  // eslint-disable-next-line no-global-assign
  blockDrops = function (id, toolItem, rnd) {
    if (id === B.AUTO_DOOR || id === B.AUTO_DOOR_OPEN) return [[B.AUTO_DOOR, 1]];
    if (id === B.AUTO_DOOR_TOP || id === B.AUTO_DOOR_OPEN_TOP) return [];
    return drops(id, toolItem, rnd);
  };
  for (const id of ADOOR_IDS) PISTON_IMMOVABLE.add(id);
  const it = ITEM_DEF[B.AUTO_DOOR];
  it.render = 'sprite'; it.layer = defTex('i_autodoor');
}

// ---------------------------------------------------------------- sounds ----
SYNTH.adoor_open = (ctx, o, t, p) => {
  Sound.noise(ctx, o, t, 0.55, { type: 'bandpass', freq: 500 * p, freqEnd: 1500 * p, q: 0.9, gain: 0.16, attack: 0.08 });
  Sound.tone(ctx, o, t, 0.5, { wave: 'triangle', f0: 95 * p, f1: 120 * p, gain: 0.07, attack: 0.06 });
};
SYNTH.adoor_close = (ctx, o, t, p) => {
  Sound.noise(ctx, o, t, 0.5, { type: 'bandpass', freq: 1400 * p, freqEnd: 480 * p, q: 0.9, gain: 0.13, attack: 0.08 });
  Sound.tone(ctx, o, t + 0.46, 0.08, { wave: 'triangle', f0: 160 * p, f1: 110 * p, gain: 0.12 });
};

// ---------------------------------------------------------------- textures ----
// brushed aluminium: fine horizontal grain, bright edge, darker shadow line
gen('adoor_frame', (d, rng) => {
  const grain = [];
  for (let y = 0; y < TS; y++) grain.push(0.92 + rng() * 0.1);
  fillTile(d, (x, y) => put(d, x, y, [178, 184, 190], grain[y] * (0.97 + rng() * 0.05) * (x === 0 || y === 0 ? 1.12 : x === TM || y === TM ? 0.8 : 1)));
}, { smooth: 0.82, bump: 0.3 });
// clear glass: see-through with soft reflections; a frosted safety band (dots) on the lower leaf
// near hand height and a frosted strip with a thin line on the upper one
function adoorGlass(lower) {
  return (d, rng) => {
    clearTile(d, [200, 226, 236]);
    fillTile(d, (x, y) => {
      if (x < 2 || x > 29) { put(d, x, y, [150, 158, 164], 0.95 + rng() * 0.08); return; }   // gasket
      const band = lower ? y >= 3 && y <= 6 : y >= 20 && y <= 24;
      if (band && (lower ? (x + (y & 1) * 2) % 4 === 0 : (y === 22 || (x + y) % 3 === 0))) put(d, x, y, [236, 242, 244], 0.94 + rng() * 0.06);
    });
    const streak = (x0, y0, n, c) => { for (let i = 0; i < n; i++) put(d, x0 + i, y0 - i, c); };
    if (lower) { streak(6, 28, 8, [232, 246, 252]); streak(9, 29, 4, [220, 240, 248]); streak(19, 20, 6, [232, 246, 252]); }
    else { streak(8, 16, 9, [232, 246, 252]); streak(12, 17, 4, [220, 240, 248]); streak(20, 9, 5, [232, 246, 252]); }
  };
}
gen('adoor_glass_lo', adoorGlass(true), { smooth: 0.95, bump: 0 });
gen('adoor_glass_hi', adoorGlass(false), { smooth: 0.95, bump: 0 });
// the track housing: dark anodised with the motion sensor and a green light in the middle
gen('adoor_head', (d, rng, ctx) => fillTile(d, (x, y, k) => {
  const sensor = x >= 12 && x <= 19 && ((y >= 1 && y <= 5) || (y >= 26 && y <= 30));
  if (sensor) {
    const led = x === 18 && (y === 3 || y === 28);
    put(d, x, y, led ? [90, 240, 120] : [26, 28, 34], led ? 1 : 0.9 + rng() * 0.15);
    if (led) ctx.emit[k] = 1;
    return;
  }
  put(d, x, y, [70, 74, 80], (0.92 + rng() * 0.08) * (y % 8 === 0 ? 1.15 : 1));
}), { smooth: 0.7, bump: 0.5 });
sprite('i_autodoor', (d) => {
  sprRect(d, 6, 2, 26, 5, [70, 74, 80]);
  sprRect(d, 19, 3, 21, 4, [90, 240, 120]);
  for (const x0 of [6, 16]) {
    sprRect(d, x0, 5, x0 + 10, 30, [178, 184, 190]);
    sprRect(d, x0 + 1, 6, x0 + 9, 29, [196, 228, 240]);
    sprRect(d, x0 + 1, 15, x0 + 9, 17, [236, 242, 244]);
    for (let i = 0; i < 5; i++) put(d, x0 + 3 + i, 13 - i, [240, 250, 254]);
  }
  sprRect(d, 15, 5, 17, 30, [150, 158, 164]);
});

// ---------------------------------------------------------------- recipe ----
shaped(B.AUTO_DOOR, 2, ['IGI', 'IGI', 'IWI'], { I: I.IRON_INGOT, G: B.GLASS, W: B.WIRE });
