'use strict';
// Furniture in play (the blocks are in furniture_blocks.js): sit on sofas and chairs (Shift or
// Space to get up), sleep in the double bed, keep things in kitchen cabinets, the sink and the
// fridge, switch the stove and the TV on and off. The double bed (2 x 2) and the fridge (2 tall)
// are placed and broken as one piece. Textures, recipes and the creative tab are here too.

const SEATS = new Map();   // block id -> seat height in 1/16
for (let i = 0; i < SOFA_COLORS.length; i++) SEATS.set(B.SOFA_GRAY + i, 8);
SEATS.set(B.CHAIR, 9);
const STORAGE = new Set([B.KITCHEN_COUNTER, B.KITCHEN_SINK, B.FRIDGE, B.FRIDGE_TOP]);
const TOGGLE = new Map([[B.STOVE, B.STOVE_ON], [B.STOVE_ON, B.STOVE], [B.TV, B.TV_ON], [B.TV_ON, B.TV]]);
const DBED = (id) => id === B.DOUBLE_BED || id === B.DOUBLE_BED_HEAD;
const FXF = (f) => ((f & 7) === 0 || (f & 7) === 1 || (f & 7) === 4 ? f & 7 : 5);

const Furniture = {
  // world direction a piece faces (where someone sitting on it looks)
  front(f) { return shapeXfN(FXF(f), 0, 0, 1); },

  // the four blocks of a double bed from any of them: [x, y, z, id, facing]
  bedParts(x, y, z) {
    const w = G.world, id = w.getBlock(x, y, z), f = w.getFacing(x, y, z);
    const side = furnSide(f), mir = f & 8, fr = this.front(f);
    // step to the left foot block
    let fx = x, fz = z;
    if (id === B.DOUBLE_BED_HEAD) { fx += fr[0]; fz += fr[2]; }
    if (mir) { fx -= side[0]; fz -= side[2]; }
    const base = f & 7, back = [-fr[0], -fr[2]];
    return [
      [fx, y, fz, B.DOUBLE_BED, base], [fx + side[0], y, fz + side[2], B.DOUBLE_BED, base | 8],
      [fx + back[0], y, fz + back[1], B.DOUBLE_BED_HEAD, base], [fx + back[0] + side[0], y, fz + back[1] + side[2], B.DOUBLE_BED_HEAD, base | 8],
    ];
  },

  // ---- sitting ----
  sit(x, y, z, id) {
    const p = G.player;
    if (p.seat || G.vehicle) return false;
    const f = G.world.getFacing(x, y, z), fr = this.front(f);
    const h = SEATS.get(id) / 16;
    p.seat = { x, y, z, id, pos: [x + 0.5 + fr[0] * 0.08, y + h - 0.74, z + 0.5 + fr[2] * 0.08], yaw: Math.atan2(fr[0], fr[2]) };
    p.yaw = Math.atan2(-fr[0], -fr[2]);
    p.vel = [0, 0, 0];
    p.flying = false;
    sfx('place_6', [x + 0.5, y + 0.5, z + 0.5], 0.6, 0.8);
    G.ui.toast('Shift or Space to get up', 1600);
    return true;
  },
  stand(p) {
    const s = p.seat;
    p.seat = null;
    const w = G.world, f = w.getFacing(s.x, s.y, s.z), fr = this.front(f);
    // step off to the front if there is room, else stand on top
    const fx = s.x + fr[0], fz = s.z + fr[2];
    const free = (x, y, z) => !BLOCK_SOLID[w.getBlock(x, y, z)] && !BLOCK_SOLID[w.getBlock(x, y + 1, z)];
    if (free(fx, s.y, fz)) p.pos = [fx + 0.5, s.y, fz + 0.5];
    else p.pos = [s.x + 0.5, s.y + 1, s.z + 0.5];
    p.fallStart = null;
    p.vel = [0, 0, 0];
  },

  use(x, y, z, id) {
    if (SEATS.has(id)) return this.sit(x, y, z, id);
    if (DBED(id)) { trySleep(x, y, z); return true; }
    if (STORAGE.has(id)) {
      const by = id === B.FRIDGE_TOP ? y - 1 : y;
      if (id === B.FRIDGE || id === B.FRIDGE_TOP) sfx('adoor_close', [x + 0.5, y + 0.5, z + 0.5], 0.5, 1.6);
      G.ui.openChest(x, by, z);
      return true;
    }
    if (TOGGLE.has(id)) {
      const nid = TOGGLE.get(id);
      editBlock(x, y, z, nid, G.world.getFacing(x, y, z));
      sfx(nid === B.TV_ON ? 'metro_chime' : 'click', [x + 0.5, y + 0.5, z + 0.5], 0.4, nid === B.TV_ON || nid === B.STOVE_ON ? 1.3 : 0.9);
      return true;
    }
    return false;
  },

  // ---- placing the pieces that take more than one block ----
  place(hit, placeId) {
    const w = G.world;
    let [x, y, z] = hit.pos;
    const n = hit.normal;
    if (!BLOCK_REPLACE[hit.id]) { x += n[0]; y += n[1]; z += n[2]; }
    const lk = G.player.lookDir();
    const f = Math.abs(lk[0]) > Math.abs(lk[2]) ? (lk[0] > 0 ? 0 : 1) : (lk[2] > 0 ? 4 : 5);
    let list;
    if (placeId === B.FRIDGE) list = [[x, y, z, B.FRIDGE, f], [x, y + 1, z, B.FRIDGE_TOP, f]];
    else {
      // the bed goes away from you and to your right
      const fr = this.front(f), side = furnSide(f), back = [-fr[0], -fr[2]];
      list = [[x, y, z, B.DOUBLE_BED, f], [x + side[0], y, z + side[2], B.DOUBLE_BED, f | 8],
        [x + back[0], y, z + back[1], B.DOUBLE_BED_HEAD, f], [x + back[0] + side[0], y, z + back[1] + side[2], B.DOUBLE_BED_HEAD, f | 8]];
    }
    for (const [a, b, c] of list) {
      if (b < 0 || b >= CH || !BLOCK_REPLACE[w.getBlock(a, b, c)] || Act.entityBlocks(a, b, c, 1)) { G.ui.toast(placeId === B.FRIDGE ? 'The fridge needs two free blocks' : 'The bed needs 2 × 2 free blocks'); return false; }
      if (b === y && !BLOCK_SOLID[w.getBlock(a, b - 1, c)]) { G.ui.toast('It has to stand on the floor'); return false; }
    }
    editBlocks(list);
    sfx('place_' + BLOCK_SOUND[placeId], [x + 0.5, y + 0.5, z + 0.5], 1, 0.9);
    Act.consume(); Act.swingHand();
    return true;
  },

  // when one piece of a bed or fridge goes, the rest goes with it (no extra drops)
  broken(x, y, z, id) {
    const w = G.world;
    const out = [];
    if (id === B.FRIDGE && w.getBlock(x, y + 1, z) === B.FRIDGE_TOP) out.push([x, y + 1, z, B.AIR]);
    if (id === B.FRIDGE_TOP && w.getBlock(x, y - 1, z) === B.FRIDGE) out.push([x, y - 1, z, B.AIR]);
    if (out.length) editBlocks(out);
  },

  update() {
    const p = G.player;
    if (p.seat && G.world.getBlock(p.seat.x, p.seat.y, p.seat.z) !== p.seat.id) this.stand(p);
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const upd = Player.prototype.update;
  Player.prototype.update = function (dt, input) {
    const s = this.seat;
    if (!s) return upd.call(this, dt, input);
    const k = input.keys;
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Space')) { Furniture.stand(this); return; }
    this.pos[0] = s.pos[0]; this.pos[1] = s.pos[1]; this.pos[2] = s.pos[2];
    this.vel[0] = this.vel[1] = this.vel[2] = 0;
    this.onGround = true; this.sneaking = false; this.sprinting = false; this.fallStart = null;
  };

  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target, b = t && t.block;
    if (initial && b && !G.player.sneaking && Furniture.use(b.pos[0], b.pos[1], b.pos[2], b.id)) { this.swingHand(); return true; }
    return use.call(this, initial);
  };

  const place = Act.placeBlock;
  Act.placeBlock = function (hit) {
    const held = G.inv.held, d = held && ITEM_DEF[held.id];
    const id = d && (d.block || d.places);
    if (id === B.DOUBLE_BED || id === B.FRIDGE) return Furniture.place(hit, id);
    return place.call(this, hit);
  };

  const destroy = destroyBlock;
  // eslint-disable-next-line no-global-assign
  destroyBlock = function (x, y, z, opts) {
    const id = G.world.getBlock(x, y, z);
    const parts = DBED(id) ? Furniture.bedParts(x, y, z) : null;
    const r = destroy.call(this, x, y, z, opts);
    if (r) {
      if (parts) {
        const w = G.world, out = [];
        for (const [a, b, c, pid] of parts) if ((a !== x || c !== z) && w.getBlock(a, b, c) === pid) out.push([a, b, c, B.AIR]);
        if (out.length) editBlocks(out);
      } else Furniture.broken(x, y, z, id);
    }
    return r;
  };

  const drops = blockDrops;
  // eslint-disable-next-line no-global-assign
  blockDrops = function (id, toolItem, rnd) {
    if (id === B.DOUBLE_BED || id === B.DOUBLE_BED_HEAD) return [[B.DOUBLE_BED, 1]];
    if (id === B.FRIDGE || id === B.FRIDGE_TOP) return [[B.FRIDGE, 1]];
    if (id === B.STOVE_ON) return [[B.STOVE, 1]];
    if (id === B.TV_ON) return [[B.TV, 1]];
    if (BLOCK_SHAPE[id] && id >= B.SOFA_GRAY && id <= B.FLOOR_LAMP) return [[id, 1]];
    return drops(id, toolItem, rnd);
  };

  // cabinets, the sink and the fridge keep what is in them like chests
  const cleanup = cleanupBlockEntity;
  // eslint-disable-next-line no-global-assign
  cleanupBlockEntity = function (x, y, z, old, id) {
    const be = G.world.blockEntities.get(posKey(x, y, z));
    if (be && be.type === 'chest' && (id === B.KITCHEN_COUNTER || id === B.KITCHEN_SINK || id === B.FRIDGE)) return;
    return cleanup.call(this, x, y, z, old, id);
  };

  const tab = CREATIVE_TABS.findIndex((t) => t.key === 'functional');
  CREATIVE_TABS.splice(tab + 1, 0, { key: 'furniture', name: 'Furniture' });
  for (const id of [B.DOUBLE_BED, B.FRIDGE, B.TV, B.STOVE]) if (ITEM_DEF[id]) ITEM_DEF[id].stack = 1;
}

// ---------------------------------------------------------------- recipes ----
{
  const PL = B.PLANKS, WL = (c) => B.WOOL + c;
  [7, 14, 11, 13, 0].forEach((c, i) => shaped(B.SOFA_GRAY + i, 1, ['W  ', 'WWW', 'P P'], { W: WL(c), P: PL }));
  shaped(B.CHAIR, 2, ['P  ', 'PPP', 'S S'], { P: PL, S: I.STICK });
  shaped(B.TABLE, 1, ['PPP', 'S S', 'S S'], { P: PL, S: I.STICK });
  shaped(B.COFFEE_TABLE, 1, ['PPP', 'I I'], { P: B.DARK_OAK_PLANKS || PL, I: I.IRON_INGOT });
  shaped(B.DOUBLE_BED, 1, ['WWW', 'WWW', 'PPP'], { W: WL(0), P: PL });
  shaped(B.KITCHEN_COUNTER, 1, ['SSS', 'PCP', 'PPP'], { S: B.SMOOTH_STONE || B.STONE, P: PL, C: B.CHEST });
  shaped(B.KITCHEN_SINK, 1, ['I B', 'SSS', 'PPP'], { I: I.IRON_INGOT, B: I.BUCKET, S: B.SMOOTH_STONE || B.STONE, P: PL });
  shaped(B.STOVE, 1, ['III', 'IFI', 'III'], { I: I.IRON_INGOT, F: B.FURNACE });
  shaped(B.FRIDGE, 1, ['III', 'ICI', 'III'], { I: I.IRON_INGOT, C: B.CHEST });
  shaped(B.TV, 1, ['GGG', 'GRG', ' I '], { G: B.GLASS_PANE || B.GLASS, R: I.REDSTONE || B.WIRE, I: I.IRON_INGOT });
  shaped(B.FLOOR_LAMP, 1, ['WTW', ' I ', ' I '], { W: WL(0), T: B.TORCH, I: I.IRON_INGOT });
}

// ---------------------------------------------------------------- textures ----
{
  // woven fabric: fine crossing threads, lighter on raised weft
  const fabric = (base, cushion) => (d, rng) => fillTile(d, (x, y) => {
    const weave = ((x + (y >> 1)) & 1) ? 1.04 : 0.96;
    const seam = cushion && (x === 0 || y === 0 || x === TM || y === TM) ? 0.82 : cushion && (x === 1 || y === 1) ? 1.06 : 1;
    put(d, x, y, base, weave * seam * (0.94 + rng() * 0.07));
  });
  const SOFA_RGB = [[118, 122, 128], [168, 44, 48], [52, 84, 150], [70, 120, 84], [214, 200, 176]];
  SOFA_COLORS.forEach(([, t], i) => {
    gen(t, fabric(SOFA_RGB[i], false), { smooth: 0.1, bump: 0.5 });
    gen(t + '_cushion', fabric(SOFA_RGB[i].map((v) => Math.min(255, v * 1.08)), true), { smooth: 0.12, bump: 0.6 });
  });
  const wood = (base, grainK) => (d, rng) => {
    const g = [];
    for (let y = 0; y < TS; y++) g.push(0.9 + rng() * 0.12);
    fillTile(d, (x, y) => put(d, x, y, base, g[y] * (1 + Math.sin((x + g[y] * 20) * 0.6) * grainK) * (0.97 + rng() * 0.04)));
  };
  gen('furn_oak', wood([176, 132, 86], 0.05), { smooth: 0.45, bump: 0.4 });
  gen('furn_dark', wood([92, 62, 40], 0.06), { smooth: 0.5, bump: 0.4 });
  gen('furn_metal', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [186, 190, 196], (0.93 + rng() * 0.05) * (y % 6 === 0 ? 1.06 : 1))), { smooth: 0.8, bump: 0.2 });
  gen('furn_black', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [30, 31, 35], 0.92 + rng() * 0.08)), { smooth: 0.7, bump: 0.1 });
  gen('bed_sheet', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [236, 236, 230], 0.95 + rng() * 0.05)), { smooth: 0.1, bump: 0.3 });
  gen('bed_pillow', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [246, 244, 238], (x === 0 || y === 0 || x === TM || y === TM ? 0.86 : 1) * (0.96 + rng() * 0.04))), { smooth: 0.1, bump: 0.4 });
  gen('bed_blanket', (d, rng) => fillTile(d, (x, y) => {
    const stripe = (y % 16) < 2 ? [226, 214, 180] : [44, 66, 118];
    put(d, x, y, stripe, (((x + y) & 3) ? 1 : 0.9) * (0.94 + rng() * 0.06));
  }), { smooth: 0.1, bump: 0.6 });
  // white lacquered cabinet door with a thin steel handle
  gen('cabinet_front', (d, rng) => fillTile(d, (x, y) => {
    let c = [236, 236, 232], f = 0.97 + rng() * 0.03;
    if (x === 0 || x === TM || y === 0 || y === TM) f *= 0.72;
    else if (x === 15 || x === 16) f *= 0.8;                         // two doors
    if ((x === 12 || x === 19) && y >= 4 && y <= 12) { c = [170, 176, 184]; f = 1.05; }
    put(d, x, y, c, f);
  }), { smooth: 0.6, bump: 0.3 });
  gen('cabinet_side', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [230, 230, 226], (x === 0 || x === TM ? 0.85 : 1) * (0.97 + rng() * 0.03))), { smooth: 0.55, bump: 0.2 });
  gen('worktop', (d, rng) => fillTile(d, (x, y) => {
    const fleck = rng() < 0.08;
    put(d, x, y, fleck ? [210, 206, 196] : [66, 64, 62], 0.92 + rng() * 0.1);
  }), { smooth: 0.85, bump: 0.2 });
  gen('stove_front', (d, rng, ctx) => fillTile(d, (x, y) => {
    let c = [44, 46, 50], f = 0.95 + rng() * 0.05;
    if (y <= 5) { c = [210, 212, 214]; if (y >= 2 && y <= 3 && x % 6 === 3) { c = [40, 40, 44]; } }    // knobs
    else if (y === 8 && x >= 4 && x <= 27) { c = [200, 204, 210]; f = 1.1; }                              // handle
    else if (y >= 11 && y <= 27 && x >= 4 && x <= 27) { c = [20, 20, 24]; f = (x + y) % 9 === 0 ? 1.8 : 0.9; } // oven window
    put(d, x, y, c, f);
  }), { smooth: 0.8, bump: 0.2 });
  const hob = (on) => (d, rng, ctx) => fillTile(d, (x, y, k) => {
    let c = [18, 18, 22], f = 0.9 + rng() * 0.08;
    for (const [cx, cy, r] of [[9, 9, 6], [23, 9, 5], [9, 23, 5], [23, 23, 6]]) {
      const q = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      if (q <= r && q >= r - 1.4) { c = on ? [255, 90, 40] : [80, 80, 86]; f = 1; if (on) ctx.emit[k] = 1; }
      else if (on && q < r - 1.4 && q > r - 3) { c = [150, 40, 20]; ctx.emit[k] = 0.5; }
    }
    put(d, x, y, c, f);
  });
  gen('stove_top', hob(false), { smooth: 0.9, bump: 0.1 });
  gen('stove_top_on', hob(true), { smooth: 0.9, bump: 0.1 });
  const fridge = (hi) => (d, rng) => fillTile(d, (x, y) => {
    let c = [226, 230, 234], f = 0.97 + rng() * 0.03;
    if (x === 0 || x === TM) f *= 0.8;
    if ((hi ? y === TM : y === 0)) f *= 0.7;                            // gap between the doors
    if (x >= 26 && x <= 27 && (hi ? y >= 18 && y <= 29 : y >= 2 && y <= 13)) { c = [150, 156, 164]; f = 1.05; }
    put(d, x, y, c, f);
  });
  gen('fridge_front_lo', fridge(false), { smooth: 0.75, bump: 0.2 });
  gen('fridge_front_hi', fridge(true), { smooth: 0.75, bump: 0.2 });
  gen('fridge_side', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [220, 224, 228], 0.96 + rng() * 0.03)), { smooth: 0.7, bump: 0.1 });
  gen('tv_screen', (d, rng) => fillTile(d, (x, y) => {
    const edge = x === 0 || x === TM || y === 0 || y === TM;
    put(d, x, y, edge ? [36, 36, 40] : [14, 16, 20], edge ? 1 : 0.9 + (x - y > 10 && x - y < 14 ? 0.5 : 0) + rng() * 0.05);
  }), { smooth: 0.95, bump: 0 });
  // switched on: a sunny landscape with a football match score bug
  gen('tv_screen_on', (d, rng, ctx) => fillTile(d, (x, y, k) => {
    let c;
    if (x === 0 || x === TM || y === 0 || y === TM) { put(d, x, y, [36, 36, 40]); return; }
    if (y < 12) c = [96 + y * 6, 160 + y * 4, 236];
    else if (y < 15) c = [60, 130, 70];
    else c = ((x >> 2) & 1) ? [70, 150, 60] : [62, 138, 54];
    if (y >= 20 && y <= 21) c = [236, 240, 236];                         // pitch line
    if (Math.hypot(x - 20, y - 23) < 1.4) c = [250, 250, 250];            // the ball
    if (y >= 2 && y <= 5 && x >= 2 && x <= 12) c = x <= 6 ? [200, 30, 40] : [30, 40, 60];
    put(d, x, y, c, 0.96 + rng() * 0.04);
    ctx.emit[k] = 0.85;
  }), { smooth: 0.95, bump: 0 });
  gen('lamp_shade', (d, rng, ctx) => fillTile(d, (x, y, k) => {
    put(d, x, y, [250, 226, 176], (y % 5 === 0 ? 0.94 : 1) * (0.96 + rng() * 0.04));
    ctx.emit[k] = 0.75;
  }), { smooth: 0.1, bump: 0.3 });
}

// respawning on a double bed (game.js asks)
function isBedBlock(id) { return DBED(id); }
